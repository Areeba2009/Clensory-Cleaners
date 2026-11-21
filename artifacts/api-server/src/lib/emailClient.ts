import nodemailer from "nodemailer";
import { logger } from "./logger";

interface OrderEmailPayload {
  orderNumber: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  paymentMethod: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  items: Array<{
    productName: string;
    quantity: number;
    unitPrice: number;
  }>;
}

const formatPKR = (amount: number) => `Rs. ${amount.toLocaleString("en-PK")}`;

export async function sendOrderConfirmationEmail(order: OrderEmailPayload): Promise<void> {
  const gmailUser = process.env.GMAIL_USER || "clensory.pk@gmail.com";
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  if (!gmailPass) {
    logger.warn("GMAIL_APP_PASSWORD not set; skipping order confirmation email.");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailPass.replace(/\s+/g, ""),
    },
  });

  const itemsHtml = order.items
    .map(
      (item) => `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${item.productName} × ${item.quantity}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${formatPKR(item.unitPrice * item.quantity)}</td>
        </tr>`,
    )
    .join("");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1c1c1c; padding: 24px;">
      <h2 style="margin-bottom: 4px;">Thank you for your order, ${order.fullName}.</h2>
      <p style="color: #555; margin-top: 0;">Your Clensory order <strong>${order.orderNumber}</strong> has been confirmed.</p>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
        <tbody>
          ${itemsHtml}
          <tr>
            <td style="padding: 8px 0; color: #555;">Subtotal</td>
            <td style="padding: 8px 0; text-align: right;">${formatPKR(order.subtotal)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #555;">Delivery</td>
            <td style="padding: 8px 0; text-align: right;">${order.deliveryFee === 0 ? "Complimentary" : formatPKR(order.deliveryFee)}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0; font-weight: bold; font-size: 16px; border-top: 2px solid #1c1c1c;">Total</td>
            <td style="padding: 12px 0; font-weight: bold; font-size: 16px; border-top: 2px solid #1c1c1c; text-align: right;">${formatPKR(order.total)}</td>
          </tr>
        </tbody>
      </table>

      <div style="background: #f8f7f4; padding: 14px 16px; border-radius: 8px; font-size: 13px; line-height: 1.5;">
        <strong>Delivery & Payment Details</strong><br />
        Payment method: ${order.paymentMethod === "card" ? "Card (Paid via Safepay)" : "Cash on Delivery"}<br />
        Address: ${order.address}, ${order.city}, ${order.province} ${order.postalCode}<br />
        Phone: ${order.phone}
      </div>

      <p style="font-size: 12px; color: #777; margin-top: 24px;">
        Made in Pakistan · Clean, thoughtfully.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"Clensory Cleaners" <${gmailUser}>`,
      to: order.email,
      replyTo: gmailUser,
      subject: `Order Confirmed — ${order.orderNumber} | Clensory`,
      html,
    });
    logger.info({ orderNumber: order.orderNumber, to: order.email }, "Order confirmation email sent via Gmail");
  } catch (error) {
    logger.error({ err: error }, "Failed to send order confirmation email via Gmail");
  }
}
