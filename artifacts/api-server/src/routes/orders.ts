import { Router, type IRouter } from "express";
import { CreateOrderBody } from "@workspace/api-zod";
import { db, orderItemsTable, ordersTable } from "@workspace/db";
import { desc, eq, inArray } from "drizzle-orm";

const router: IRouter = Router();

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

    return res.json(
      orders.map((order) => ({
        orderNumber: order.orderNumber,
        createdAt: order.createdAt.toISOString(),
        fullName: order.fullName,
        phone: order.phone,
        address: order.address,
        city: order.city,
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        total: order.total,
        items: items
          .filter((item) => item.orderId === order.id)
          .map(({ productId, productName, quantity, unitPrice }) => ({
            productId,
            productName,
            quantity,
            unitPrice,
          })),
      })),
    );
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

  const { items, shipping, subtotal, deliveryFee, total } = parsed.data;
  const orderNumber = `CLS-${Date.now().toString(36).toUpperCase()}`;

  try {
    const confirmation = await db.transaction(async (tx) => {
      const [order] = await tx
        .insert(ordersTable)
        .values({
          orderNumber,
          userId: req.user.id,
          fullName: shipping.fullName,
          phone: shipping.phone,
          address: shipping.address,
          city: shipping.city,
          notes: shipping.notes ?? null,
          subtotal,
          deliveryFee,
          total,
        })
        .returning({
          id: ordersTable.id,
          orderNumber: ordersTable.orderNumber,
        });

      await tx.insert(orderItemsTable).values(
        items.map((item) => ({
          orderId: order.id,
          productId: item.productId,
          productName: item.productName,
          quantity: Math.round(item.quantity),
          unitPrice: item.unitPrice,
        })),
      );

      return {
        orderNumber: order.orderNumber,
        message: "Your Clensory order has been received.",
      };
    });

    return res.status(201).json(confirmation);
  } catch (error) {
    req.log.error({ err: error }, "Unable to create order");
    return res.status(500).json({
      error: "We couldn't receive your order right now. Please try again.",
    });
  }
});

export default router;