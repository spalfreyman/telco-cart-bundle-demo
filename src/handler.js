'use strict';

const TELCO_BUNDLE_PT_ID =
  process.env.TELCO_BUNDLE_PT_ID || '63f378c1-600a-4865-848d-466622e275e3';
const TELCO_SELLABLE_BUNDLE_PT_ID =
  process.env.TELCO_SELLABLE_BUNDLE_PT_ID || 'c907f3af-6641-48a8-a7d3-f91e03f7fb06';
const CUSTOM_TYPE_KEY =
  process.env.LINE_ITEM_CUSTOM_TYPE_KEY || 'telco-bundle-line-item';

// Shipping wiring: the cart is expected to be in shippingMode: Multiple. We
// maintain two consignments — "standard" (default delivery) and
// "subscription" (recurring fees). Both reference the project's "standard"
// ShippingMethod by default; override via env if needed.
const STANDARD_KEY = 'standard';
const SUBSCRIPTION_KEY = 'subscription';
const SHIPPING_METHOD_KEY =
  process.env.SHIPPING_METHOD_KEY || 'standard';

exports.handler = async (event) => {
  try {
    const payload = parsePayload(event);
    if (!payload || !payload.resource || payload.resource.typeId !== 'cart') {
      return respond({ actions: [] });
    }
    const cart = payload.resource.obj;
    return respond({ actions: buildActions(cart) });
  } catch (err) {
    return respond({
      actions: [],
      errors: [{ code: 'InvalidInput', message: String(err && err.message) }],
    });
  }
};

function parsePayload(event) {
  if (!event) return null;
  if (event.body) return typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  return event;
}

function respond(body) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function buildActions(cart) {
  const setup = [];
  const expansion = [];
  const lineItemShipping = [];

  let needSubscriptionBucket = hasSubscriptionLineItem(cart);

  for (const li of cart.lineItems || []) {
    if (alreadyExpanded(li)) continue;
    const ptId = li.productType && li.productType.id;
    if (ptId === TELCO_BUNDLE_PT_ID) {
      expandTelcoBundle(li, expansion);
    } else if (ptId === TELCO_SELLABLE_BUNDLE_PT_ID) {
      if (expandTelcoSellableBundle(li, expansion)) needSubscriptionBucket = true;
    }
  }

  // Existing line items that don't yet have shippingDetails get assigned to
  // the appropriate consignment based on their bundleRole.
  for (const li of cart.lineItems || []) {
    if (hasShippingTarget(li)) continue;
    const role = (li.custom && li.custom.fields && li.custom.fields.bundleRole) || null;
    const isSub = role === 'monthly-fee' || role === 'yearly-fee';
    if (isSub) needSubscriptionBucket = true;
    lineItemShipping.push({
      action: 'setLineItemShippingDetails',
      lineItemId: li.id,
      shippingDetails: {
        targets: [
          {
            addressKey: isSub ? SUBSCRIPTION_KEY : STANDARD_KEY,
            quantity: li.quantity || 1,
            shippingMethodKey: SHIPPING_METHOD_KEY,
          },
        ],
      },
    });
  }

  // Build any missing shipping setup (addresses + consignments).
  if (expansion.length || lineItemShipping.length) {
    addShippingSetupActions(cart, setup, { needSubscriptionBucket });
  }

  return [...setup, ...expansion, ...lineItemShipping];
}

function alreadyExpanded(li) {
  return !!(li.custom && li.custom.fields && li.custom.fields.expanded === true);
}

function hasShippingTarget(li) {
  const t = li.shippingDetails && li.shippingDetails.targets;
  return Array.isArray(t) && t.length > 0;
}

function hasSubscriptionLineItem(cart) {
  for (const li of cart.lineItems || []) {
    const t = (li.shippingDetails && li.shippingDetails.targets) || [];
    if (t.some((x) => x.addressKey === SUBSCRIPTION_KEY)) return true;
  }
  return false;
}

function attr(li, name) {
  const list = (li.variant && li.variant.attributes) || [];
  return list.find((a) => a.name === name);
}

function expandTelcoBundle(li, actions) {
  const included = attr(li, 'included-products');
  const refs = included && Array.isArray(included.value) ? included.value : [];
  for (const ref of refs) {
    if (ref && ref.id) actions.push(makeAddLineItem(ref.id, li, 'included', false));
  }
  // optional-products are not auto-added; the storefront/customer opts in.
  actions.push(markExpanded(li));
}

function expandTelcoSellableBundle(li, actions) {
  const initial = attr(li, 'initial-fee-product');
  const monthly = attr(li, 'monthly-fee-product');
  const yearly = attr(li, 'yearly-fee-product');
  let subscriptionUsed = false;

  if (initial && initial.value && initial.value.id) {
    actions.push(makeAddLineItem(initial.value.id, li, 'initial-fee', false));
  }
  if (monthly && monthly.value && monthly.value.id) {
    actions.push(makeAddLineItem(monthly.value.id, li, 'monthly-fee', true));
    subscriptionUsed = true;
  }
  if (yearly && yearly.value && yearly.value.id) {
    actions.push(makeAddLineItem(yearly.value.id, li, 'yearly-fee', true));
    subscriptionUsed = true;
  }

  actions.push(markExpanded(li));
  return subscriptionUsed;
}

function makeAddLineItem(productId, parent, role, subscription) {
  const quantity = parent.quantity || 1;
  const action = {
    action: 'addLineItem',
    productId,
    quantity,
    custom: {
      type: { typeId: 'type', key: CUSTOM_TYPE_KEY },
      fields: {
        parentLineItemId: parent.id,
        parentBundleProductKey: parent.productKey || '',
        bundleRole: role,
      },
    },
    shippingDetails: {
      targets: [
        {
          addressKey: subscription ? SUBSCRIPTION_KEY : STANDARD_KEY,
          quantity,
          shippingMethodKey: SHIPPING_METHOD_KEY,
        },
      ],
    },
  };
  return action;
}

function markExpanded(li) {
  if (li.custom && li.custom.type) {
    return {
      action: 'setLineItemCustomField',
      lineItemId: li.id,
      name: 'expanded',
      value: true,
    };
  }
  return {
    action: 'setLineItemCustomType',
    lineItemId: li.id,
    type: { typeId: 'type', key: CUSTOM_TYPE_KEY },
    fields: { expanded: true },
  };
}

function addShippingSetupActions(cart, setup, opts) {
  const addresses = cart.itemShippingAddresses || [];
  const shipping = cart.shipping || [];
  const country = cart.country || 'DE';

  const hasStandardAddr = addresses.some((a) => a.key === STANDARD_KEY);
  const hasSubAddr = addresses.some((a) => a.key === SUBSCRIPTION_KEY);
  const hasStandardBucket = shipping.some((s) => s.shippingKey === STANDARD_KEY);
  const hasSubBucket = shipping.some((s) => s.shippingKey === SUBSCRIPTION_KEY);

  if (!hasStandardAddr) {
    // Should normally be pre-populated by the storefront during cart creation
    // (with the customer's real delivery address). Fall back to a placeholder
    // so the extension can still wire up the consignment.
    setup.push({
      action: 'addItemShippingAddress',
      address: { key: STANDARD_KEY, country },
    });
  }
  if (opts.needSubscriptionBucket && !hasSubAddr) {
    setup.push({
      action: 'addItemShippingAddress',
      address: { key: SUBSCRIPTION_KEY, country },
    });
  }

  // Build the consignments (cart.shipping[]) — each references the
  // ShippingMethod by key and carries its own address (matching the
  // itemShippingAddress key for traceability).
  if (!hasStandardBucket) {
    const stdAddr = addresses.find((a) => a.key === STANDARD_KEY) || { key: STANDARD_KEY, country };
    setup.push({
      action: 'addShippingMethod',
      shippingKey: STANDARD_KEY,
      shippingMethod: { typeId: 'shipping-method', key: SHIPPING_METHOD_KEY },
      shippingAddress: stripReadOnlyAddrFields(stdAddr),
    });
  }
  if (opts.needSubscriptionBucket && !hasSubBucket) {
    const subAddr = addresses.find((a) => a.key === SUBSCRIPTION_KEY) || { key: SUBSCRIPTION_KEY, country };
    setup.push({
      action: 'addShippingMethod',
      shippingKey: SUBSCRIPTION_KEY,
      shippingMethod: { typeId: 'shipping-method', key: SHIPPING_METHOD_KEY },
      shippingAddress: stripReadOnlyAddrFields(subAddr),
    });
  }
}

function stripReadOnlyAddrFields(addr) {
  // The Address response from commercetools includes server-managed fields
  // (e.g. id) that the API rejects on write. Pass through only allowed
  // Address draft fields.
  const allowed = [
    'key', 'title', 'salutation', 'firstName', 'lastName', 'middleName',
    'streetName', 'streetNumber', 'additionalStreetInfo', 'postalCode',
    'city', 'region', 'state', 'country', 'company', 'department',
    'building', 'apartment', 'pOBox', 'phone', 'mobile', 'email', 'fax',
    'additionalAddressInfo', 'externalId',
  ];
  const out = {};
  for (const k of allowed) if (addr[k] !== undefined) out[k] = addr[k];
  return out;
}
