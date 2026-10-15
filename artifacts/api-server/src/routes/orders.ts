import { Router, type IRouter, type Request as ExpressRequest } from "express";
import { CancelCardOrderBody, CreateOrderBody } from "@workspace/api-zod";
import { db, isAdminEmail, orderItemsTable, ordersTable } from "@workspace/db";
import { desc, eq, inArray } from "drizzle-orm";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { clensoryProductVariants, stripePriceIds } from "../lib/stripeCatalog";

const router: IRouter = Router();

function canonicalizeOrderData(data: ReturnType<typeof CreateOrderBody.parse>) {
  const items = [];
  for (const item of data.items) {
    const variant = clensoryProductVariants[item.productId as keyof typeof clensoryProductVariants];
    if (!variant || !Number.isInteger(item.quantity) || item.quantity < 1) return null;
    items.push({
      ...item,
      productName: `${variant.productName} — ${variant.sizeLabel}`,
      unitPrice: variant.unitPrice,
    });
  }

  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const deliveryFee = subtotal > 3000 ? 0 : 250;
  return {
    ...data,
    items,
    subtotal,
    deliveryFee,
    total: subtotal + deliveryFee,
  };
}

function orderReceipt(order: typeof ordersTable.$inferSelect, items: Array<typeof orderItemsTable.$inferSelect>) {
  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt.toISOString(),
    fullName: order.fullName,
    email: order.email,
    phone: order.phone,
    address: order.address,
    city: order.city,
    province: order.province,
    postalCode: order.postalCode,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    total: order.total,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    items: items
      .filter((item) => item.orderId === order.id)
      .map(({ productId, productName, quantity, unitPrice }) => ({
        productId,
        productName,
        quantity,
        unitPrice,
      })),
  };
}

function getStorefrontOrigin(req: ExpressRequest): string {
  const configuredDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (configuredDomain) return `https://${configuredDomain}`;
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  return `${proto}://${host}`;
}

async function insertOrder(
  userId: string,
  data: ReturnType<typeof CreateOrderBody.parse>,
  values: Partial<typeof ordersTable.$inferInsert> = {},
) {
  const orderNumber = `CLS-${Date.now().toString(36).toUpperCase()}`;
  return db.transaction(async (tx) => {
    const [order] = await tx
      .insert(ordersTable)
      .values({
        orderNumber,
        userId,
        email: data.shipping.email,
        fullName: data.shipping.fullName,
        phone: data.shipping.phone,
        address: data.shipping.address,
        city: data.shipping.city,
        province: data.shipping.province,
        postalCode: data.shipping.postalCode,
        notes: data.shipping.notes ?? null,
        subtotal: data.subtotal,
        deliveryFee: data.deliveryFee,
        total: data.total,
        paymentMethod: data.paymentMethod,
        paymentStatus: data.paymentMethod === "cod" ? "unpaid" : "pending",
        orderStatus: data.paymentMethod === "cod" ? "received" : "awaiting_payment",
        ...values,
      })
      .returning();

    await tx.insert(orderItemsTable).values(
      data.items.map((item) => ({
        orderId: order.id,
        productId: item.productId,
        productName: item.productName,
        quantity: Math.round(item.quantity),
        unitPrice: item.unitPrice,
      })),
    );
    return order;
  });
}

router.get("/orders", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Please log in to view your billing history." });
  }

  try {
    const orders = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.userId, req.user.id))
      .orderBy(desc(ordersTable.createdAt));

    const items = orders.length
      ? await db
          .select()
          .from(orderItemsTable)
          .where(inArray(orderItemsTable.orderId, orders.map((order) => order.id)))
      : [];

    return res.json(orders.map((order) => orderReceipt(order, items)));
  } catch (error) {
    req.log.error({ err: error }, "Unable to load billing history");
    return res.status(500).json({ error: "We couldn't load your billing history right now." });
  }
});

router.post("/orders", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Please log in before placing an order." });
  }

  const parsed = CreateOrderBody.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Please check your order and shipping details.",
    });
  }

  const orderData = canonicalizeOrderData(parsed.data);
  if (!orderData) {
    return res.status(400).json({ error: "One of the selected product sizes is not available." });
  }

  try {
    const order = await insertOrder(req.user.id, orderData);

    return res.status(201).json({
      orderNumber: order.orderNumber,
      message: "Your Clensory order has been received.",
    });
  } catch (error) {
    req.log.error({ err: error }, "Unable to create order");
    return res.status(500).json({
      error: "We couldn't receive your order right now. Please try again.",
    });
  }
});

router.post("/orders/checkout", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Please log in before paying by card." });
  }

  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success || parsed.data.paymentMethod !== "card") {
    return res.status(400).json({ error: "Please choose card payment and complete your order details." });
  }

  const orderData = canonicalizeOrderData(parsed.data);
  if (!orderData) {
    return res.status(400).json({ error: "One of the selected product sizes is not available." });
  }

  try {
    const order = await insertOrder(req.user.id, orderData);
    const stripe = await getUncachableStripeClient();
    const lineItems: Array<{ price: string; quantity: number }> = [];
    for (const item of orderData.items) {
      const variant = clensoryProductVariants[item.productId as keyof typeof clensoryProductVariants];
      if (!variant) {
        return res.status(400).json({ error: "One of the selected products is not available for card checkout." });
      }
      lineItems.push({ price: variant.stripePriceId, quantity: item.quantity });
    }
    if (orderData.deliveryFee > 0) {
      lineItems.push({ price: stripePriceIds.delivery, quantity: 1 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: lineItems,
      customer_email: orderData.shipping.email,
      success_url: `${getStorefrontOrigin(req)}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getStorefrontOrigin(req)}/?payment=cancelled&order=${order.orderNumber}`,
      metadata: {
        orderId: String(order.id),
        orderNumber: order.orderNumber,
        userId: req.user.id,
      },
    });

    await db.update(ordersTable).set({
      stripeCheckoutSessionId: session.id,
    }).where(eq(ordersTable.id, order.id));

    if (!session.url) {
      return res.status(500).json({ error: "Stripe did not return a checkout URL." });
    }

    return res.status(201).json({
      orderNumber: order.orderNumber,
      checkoutUrl: session.url,
      message: "Redirecting to secure card checkout.",
    });
  } catch (error) {
    req.log.error({ err: error }, "Unable to create Stripe checkout session");
    return res.status(500).json({ error: "We couldn't start card checkout right now. Please try again." });
  }
});

router.get("/orders/payment-status", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Please log in to check payment status." });
  }
  const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : "";
  if (!sessionId) return res.status(400).json({ error: "A checkout session is required." });

  try {
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.stripeCheckoutSessionId, sessionId));
    if (!order || order.userId !== req.user.id) return res.status(404).json({ error: "Payment session not found." });
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paid = session.payment_status === "paid";
    const paymentStatus = paid ? "paid" : session.status === "expired" ? "failed" : "pending";
    const orderStatus = paid ? "paid" : paymentStatus === "failed" ? "payment_failed" : "awaiting_payment";
    await db.update(ordersTable).set({ paymentStatus, orderStatus }).where(eq(ordersTable.id, order.id));
    return res.json({ orderNumber: order.orderNumber, paymentStatus, orderStatus, paid });
  } catch (error) {
    req.log.error({ err: error }, "Unable to confirm Stripe payment");
    return res.status(500).json({ error: "We couldn't confirm the payment right now." });
  }
});

router.post("/orders/cancel-card", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Please log in to update this payment." });
    return;
  }

  const parsed = CancelCardOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "An order number is required." });
    return;
  }

  try {
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.orderNumber, parsed.data.orderNumber));
    if (!order || order.userId !== req.user.id) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    if (order.paymentMethod !== "card" || !order.stripeCheckoutSessionId) {
      res.status(409).json({ error: "This order has no active card checkout to cancel." });
      return;
    }

    if (order.paymentStatus === "paid") {
      res.json({
        orderNumber: order.orderNumber,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        paid: true,
      });
      return;
    }

    if (order.paymentStatus === "cancelled") {
      res.json({
        orderNumber: order.orderNumber,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        paid: false,
      });
      return;
    }

    const stripe = getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(order.stripeCheckoutSessionId);
    if (session.payment_status === "paid") {
      await db.update(ordersTable).set({
        paymentStatus: "paid",
        orderStatus: "paid",
      }).where(eq(ordersTable.id, order.id));
      res.json({
        orderNumber: order.orderNumber,
        paymentStatus: "paid",
        orderStatus: "paid",
        paid: true,
      });
      return;
    }
    if (session.status === "complete") {
      res.status(409).json({ error: "This payment is still processing. Check billing history before trying again." });
      return;
    }
    if (session.status === "open") {
      await stripe.checkout.sessions.expire(session.id);
    } else if (session.status !== "expired") {
      res.status(409).json({ error: "We couldn't confirm that this checkout is safe to retry yet." });
      return;
    }

    await db.update(ordersTable).set({
      paymentStatus: "cancelled",
      orderStatus: "payment_cancelled",
    }).where(eq(ordersTable.id, order.id));

    res.json({
      orderNumber: order.orderNumber,
      paymentStatus: "cancelled",
      orderStatus: "payment_cancelled",
      paid: false,
    });
  } catch (error) {
    req.log.error({ err: error }, "Unable to cancel Stripe checkout session");
    res.status(500).json({ error: "We couldn't update that payment yet. Please try again." });
  }
});

router.get("/admin/orders", async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Please log in to access order tracking." });
  if (!isAdminEmail(req.user.email)) return res.status(403).json({ error: "Admin access required." });

  try {
    const orders = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt));
    const items = orders.length
      ? await db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, orders.map((order) => order.id)))
      : [];
    return res.json(orders.map((order) => ({
      ...orderReceipt(order, items),
      customerEmail: order.email,
    })));
  } catch (error) {
    req.log.error({ err: error }, "Unable to load admin order tracking");
    return res.status(500).json({ error: "We couldn't load tracked orders right now." });
  }
});

export default router;