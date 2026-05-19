# Product drafts

`ProductDraft` JSON for the 9 sample products used by the demo. Each file is
ready to `POST` to `/{projectKey}/products`. Reference fields use the product
**key** so the drafts are portable between projects — just create the leaves
first.

## Order

Products that reference others must be created (and published) after their
references exist:

1. **Fees** (no references) — leaves of the tree
   - `5g-unlimited-initial-fee.json`
   - `5g-unlimited-monthly-fee.json`
   - `5g-unlimited-yearly-fee.json`
   - `device-insurance-initial-fee.json`
   - `device-insurance-monthly-fee.json`
   - `device-insurance-yearly-fee.json`
2. **Sellable bundles** — reference one initial / monthly / yearly fee each
   - `5g-unlimited-plan.json`
   - `device-insurance-plan.json`
3. **Top-level bundle** — references the sellable bundles via
   `included-products` / `optional-products`
   - `telco-5g-bundle.json`

## Prerequisites

- ProductTypes from [`../product-types/`](../product-types) created first.
- A `Standard` TaxCategory exists with at least one rate for the country you
  intend to use (the drafts reference `tax-category` by key `"Standard"`). If
  not, either rename the key in the drafts or omit the `taxCategory` field
  and set the cart's `taxMode` to `Disabled` for testing.

## Quick import (shell)

```bash
# auth once, then loop in dependency order
TOK=$(curl -sS -X POST "$CTP_AUTH_URL/oauth/token" \
  -u "$CTP_CLIENT_ID:$CTP_CLIENT_SECRET" \
  -d "grant_type=client_credentials&scope=$CTP_SCOPES" \
  | jq -r .access_token)

for f in \
  5g-unlimited-initial-fee.json \
  5g-unlimited-monthly-fee.json \
  5g-unlimited-yearly-fee.json \
  device-insurance-initial-fee.json \
  device-insurance-monthly-fee.json \
  device-insurance-yearly-fee.json \
  5g-unlimited-plan.json \
  device-insurance-plan.json \
  telco-5g-bundle.json; do
  curl -sS -X POST "$CTP_API_URL/$CTP_PROJECT_KEY/products" \
    -H "Authorization: Bearer $TOK" \
    -H "Content-Type: application/json" \
    --data-binary @"$f" | jq -r '.key + " v" + (.version|tostring)'
done
```

The `"publish": true` flag in each draft publishes the master variant on
creation, so the products are immediately available to add to a cart.
