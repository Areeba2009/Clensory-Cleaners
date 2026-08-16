import { Router, type IRouter } from "express";
import { CreateOrderBody } from "@workspace/api-zod";
import { db, orderItemsTable, ordersTable } from "@workspace/db";

const router: IRouter = Router();

router.post("/orders", async (req, res) => {
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