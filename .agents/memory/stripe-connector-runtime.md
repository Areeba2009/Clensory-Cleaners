---
name: Stripe connector runtime
description: Runtime Stripe API calls from this workspace use the attached Replit connector proxy instead of retrieving API secrets.
---

Use `@replit/connectors-sdk` to proxy Stripe API traffic from the API server. The official Stripe Node client can route HTTP through `ReplitConnectors.createProxyFetch("stripe")`; do not depend on the legacy Replit connection API's `include_secrets=true` lookup or require an application Stripe secret key.

The legacy `stripe-replit-sync` startup and webhook setup depended on that unavailable secret lookup and prevented the API from starting. The connected Stripe proxy can serve API calls without that path. The checked catalog price was active in PKR but reported `livemode: false`, so treat runtime connectivity and live-mode readiness as separate verification items.

**Why:** The old credential flow failed at API startup even though the Stripe integration was attached; the connector SDK proxy successfully retrieved the same price without exposing a secret.

**How to apply:** For app Stripe API operations, use the connector proxy-backed Stripe client and verify a read-only Stripe request. Separately confirm the connected environment/deployment mode before claiming real live payments are enabled.
