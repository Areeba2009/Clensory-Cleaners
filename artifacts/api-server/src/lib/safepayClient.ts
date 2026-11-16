import { Safepay } from "@sfpy/node-sdk";

export function getSafepayClient() {
  const apiKey = process.env.SAFEPAY_API_KEY;
  const v1Secret = process.env.SAFEPAY_V1_SECRET;

  if (!apiKey || !v1Secret) {
    throw new Error("Missing SAFEPAY_API_KEY or SAFEPAY_V1_SECRET in Replit Secrets.");
  }

  return new Safepay({
    environment: process.env.SAFEPAY_ENVIRONMENT === "production" ? "production" : "sandbox",
    apiKey,
    v1Secret,
    webhookSecret: process.env.SAFEPAY_WEBHOOK_SECRET || v1Secret,
  });
}

export function getSafepayBaseUrl() {
  return process.env.SAFEPAY_ENVIRONMENT === "production"
    ? "https://api.getsafepay.com"
    : "https://sandbox.api.getsafepay.com";
}
