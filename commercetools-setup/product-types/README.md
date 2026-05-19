# Product type drafts

`ProductTypeDraft` JSON for the three product types the bundle model uses.
`POST` each to `/{projectKey}/product-types`.

| File | Key | What it models |
|---|---|---|
| `telco-bundle.json` | `telco-bundle` | Top-level bundle with two set-of-product-reference attributes: `included-products` (auto-expanded by the extension) and `optional-products` (offered as add-ons). |
| `telco-sellable-bundle.json` | `telco-sellable-bundle` | Sellable plan with three optional product references — one each for `initial-fee-product`, `monthly-fee-product`, `yearly-fee-product`. |
| `telco-fee.json` | `telco-fee` | A leaf fee product carrying a single `fee-type` enum (`initial` / `monthly` / `yearly`). |

No inter-dependencies between these three — create them in any order.

## Why the fee references on `telco-sellable-bundle` are optional

In the first iteration of this demo the three fee attributes were `isRequired:
true`. Real-world plans don't always have all three cadences (e.g. a pure
prepaid plan has only an initial fee), so they were relaxed. The downside: the
storefront / cart-expansion logic has to handle each slot being missing — see
[`src/handler.js`](../../src/handler.js) for how the extension skips a slot
when the attribute value is absent.
