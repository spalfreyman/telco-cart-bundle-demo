# Telco Cart Bundle Demo

A commercetools project that demonstrates how to model and sell a multi-level
telco bundle (a phone plan with optional add-ons) using a custom **API
Extension** to auto-expand the bundle into its constituent line items at cart
time. Ships with a small single-page demo UI.

[Live demo](https://telco-cart-bundle-demo.netlify.app) ·
[GitHub](https://github.com/spalfreyman/telco-cart-bundle-demo)

## What it does

When a customer adds a "Telco 5G Bundle" to their cart, the extension:

1. **Expands the parent bundle** into its `included-products` sub-bundles (the
   Unlimited 5G Plan).
2. **Expands each sellable sub-bundle** into its three fee products
   (initial / monthly / yearly).
3. **Cross-references** every spawned line item with its parent via a
   line-item-level **custom type** (`telco-bundle-line-item`), recording
   `parentLineItemId`, `parentBundleProductKey`, and `bundleRole`.
4. **Routes the monthly and yearly recurring fees** to a dedicated
   `subscription` multi-shipping consignment with a real ShippingMethod
   attached; everything else (parent wrapper, included sub-bundle, initial
   fees) lands in the `standard` consignment for the customer's delivery
   address.

The demo UI surfaces all of this: the bundle hierarchy with role tags, fee
breakdown by cadence, per-consignment item lists with shipping method, and the
raw cart JSON in a collapsible tree view. Cart discounts are also visualised
inline as `~~original~~ → discounted` with a per-consignment savings total.

## Architecture

```
┌────────────────────┐    POST /api/cart     ┌──────────────────────────────┐
│ web/public/index.  │ ────────────────────▶ │ netlify/functions/cart.js    │
│ html (static page) │                       │  (or web/server.js locally)  │
└────────────────────┘                       └──────────────┬───────────────┘
                                                            │ creates+updates
                                                            ▼
                              ┌─────────────────────────────────────────────┐
                              │ commercetools project                       │
                              │  · cart with shippingMode: Multiple         │
                              │  · API Extension webhook fires on each      │
                              │    Cart Create/Update                       │
                              └──────────────┬──────────────────────────────┘
                                             │ (POST payload)
                                             ▼
                              ┌─────────────────────────────────────────────┐
                              │ netlify/functions/extension.js              │
                              │  → src/handler.js                           │
                              │    returns update-action list (addLineItem, │
                              │    addShippingMethod, setLineItemShipping-  │
                              │    Details, set custom fields, …)           │
                              └─────────────────────────────────────────────┘
```

**Local dev short-circuits the webhook:** `web/server.js` deletes the
registered extension on startup, runs `src/handler.js` itself between cart
calls, and recreates the extension on SIGINT. That way you can iterate on the
handler without redeploying or tunnelling to localhost.

## Repository layout

```
src/
  handler.js          — the API Extension logic (commercetools webhook handler)
  ctp-client.js       — OAuth + REST helper for the commercetools API
  cart-service.js     — create + multi-pass-expand a cart (uses handler.js)
web/
  public/index.html   — single-page demo UI (no build)
  server.js           — local dev HTTP server (delete/recreate extension lifecycle)
netlify/functions/
  cart.js             — POST /api/cart endpoint (deployed)
  extension.js        — commercetools webhook endpoint (deployed)
commercetools-setup/
  product-types/      — ProductTypeDraft JSON for the 3 product types
  products/           — ProductDraft JSON for the 9 sample products
  telco-bundle-line-item-type.json  — line-item custom Type draft
netlify.toml          — routing + functions config
```

## Local development

Requires Node 18+ for built-in `fetch`. No npm dependencies.

```bash
# 1. Set commercetools client credentials
export CTP_PROJECT_KEY="<your-project-key>"
export CTP_CLIENT_ID="<your-client-id>"
export CTP_CLIENT_SECRET="<your-client-secret>"
export CTP_AUTH_URL="https://auth.<region>.commercetools.com"
export CTP_API_URL="https://api.<region>.commercetools.com"
export CTP_SCOPES="manage_project:<your-project-key>"

# 2. Run
npm start             # → http://localhost:3000
```

The first time you run it, the project also needs the resources in
[`commercetools-setup/`](./commercetools-setup) created. Use either the
Merchant Center or `POST` each draft to its corresponding API endpoint:

| Resource | Endpoint | Order |
|---|---|---|
| ProductTypes | `POST /{projectKey}/product-types` | 1 |
| Line-item Type | `POST /{projectKey}/types` | 2 |
| Products | `POST /{projectKey}/products` | 3 (in dependency order — see [commercetools-setup/products](./commercetools-setup/products)) |

Bundle products reference their sub-products by **key**, so create the leaf
fees first, then sellable bundles, then the top-level bundle.

## Deploy

The repository is wired to deploy directly to Netlify. Set the same `CTP_*`
env vars in the Netlify project (Site settings → Environment variables) and
redeploy.

To use the Extension function in commercetools, register it as a Cart
Create+Update extension pointing at
`https://<your-site>.netlify.app/extension`.
