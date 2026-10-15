import Stripe from "stripe";
import { ReplitConnectors } from "@replit/connectors-sdk";

export function getUncachableStripeClient(): Stripe {
  const connectors = new ReplitConnectors();
  const proxyFetch = connectors.createProxyFetch("stripe");

  return new Stripe("", {
    authenticator: async () => {},
    httpClient: Stripe.createFetchHttpClient(proxyFetch),
    maxNetworkRetries: 1,
    typescript: true,
  });
}