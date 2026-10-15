import { integer, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  orderNumber: varchar("order_number", { length: 32 }).notNull().unique(),
  email: varchar("email", { length: 254 }).notNull().default(""),
  fullName: text("full_name").notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  address: text("address").notNull(),
  city: varchar("city", { length: 96 }).notNull(),
  province: varchar("province", { length: 96 }).notNull().default(""),
  postalCode: varchar("postal_code", { length: 32 }).notNull().default(""),
  notes: text("notes"),
  subtotal: numeric("subtotal", { precision: 10, scale: 2, mode: "number" }).notNull(),
  deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2, mode: "number" }).notNull(),
  total: numeric("total", { precision: 10, scale: 2, mode: "number" }).notNull(),
  paymentMethod: varchar("payment_method", { length: 24 }).notNull().default("cod"),
  paymentStatus: varchar("payment_status", { length: 24 }).notNull().default("pending"),
  orderStatus: varchar("order_status", { length: 32 }).notNull().default("received"),
  stripeCheckoutSessionId: varchar("stripe_checkout_session_id", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  productId: varchar("product_id", { length: 96 }).notNull(),
  productName: varchar("product_name", { length: 160 }).notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2, mode: "number" }).notNull(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
export type OrderItem = typeof orderItemsTable.$inferSelect;