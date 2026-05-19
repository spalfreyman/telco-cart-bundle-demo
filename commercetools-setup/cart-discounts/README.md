# Cart discount drafts

Two `CartDiscountDraft` JSON samples demonstrating cross-bundle promotions
that fire whenever a 5G plan is in the cart and a matching Device Insurance
fee is also present. Apply each via `POST /{projectKey}/cart-discounts`.

| File | Key | Effect |
|---|---|---|
| `insurance-initial-10pct.json` | `5g-bundle-insurance-initial-10pct` | 10% off the Device Insurance setup fee |
| `insurance-monthly-20pct.json` | `5g-bundle-insurance-monthly-20pct` | 20% off the Device Insurance monthly fee |

Both discounts share the same `cartPredicate` — they detect a 5G plan in the
cart by matching any of the five "5G" product keys (the top-level bundle, the
sellable plan, or any of its three fees). This makes the trigger work whether
the storefront adds the bundle whole or only its expanded fee products.

```
lineItemCount(
  product.key = "telco-5g-bundle"
  or product.key = "5g-unlimited-plan"
  or product.key = "5g-unlimited-initial-fee"
  or product.key = "5g-unlimited-monthly-fee"
  or product.key = "5g-unlimited-yearly-fee"
) > 0
```

The targets are scoped to the Device Insurance line items by `product.key`
predicate.

## Notes

- Discounts use `product.key` rather than `product.id` so the JSON is portable
  between projects. The matching `product.id` predicates created by the live
  demo are equivalent; you can use either form.
- `sortOrder` values (`0.55`, `0.56`) must be unique across all CartDiscounts
  in the project. Adjust if they collide with existing entries.
- `requiresDiscountCode: false` means the discounts apply automatically when
  the cart predicate matches — no code entry needed.
- `stackingMode: "Stacking"` lets these compose with other cart discounts
  (e.g. a pre-existing yearly-fee discount). Switch to `"StopAfterThisDiscount"`
  if you want this one to short-circuit the chain.
