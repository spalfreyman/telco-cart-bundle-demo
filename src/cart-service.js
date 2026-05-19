'use strict';

const { ctp } = require('./ctp-client.js');
const { handler: extensionHandler } = require('./handler.js');

const TELCO_BUNDLE_PRODUCT_ID =
  process.env.TELCO_BUNDLE_PRODUCT_ID || '72cfef9b-d1c4-4b2d-bc00-0e834f4441e9';
const TELCO_BUNDLE_PT_ID =
  process.env.TELCO_BUNDLE_PT_ID || '63f378c1-600a-4865-848d-466622e275e3';
const LINE_ITEM_CUSTOM_TYPE_KEY =
  process.env.LINE_ITEM_CUSTOM_TYPE_KEY || 'telco-bundle-line-item';
const MAX_EXPANSIONS = 5;

async function runExtensionLogic(cart) {
  const response = await extensionHandler({
    body: JSON.stringify({ resource: { typeId: 'cart', obj: cart } }),
  });
  const parsed = JSON.parse(response.body);
  return parsed.actions || [];
}

async function createAndExpandCart(opts = {}) {
  const { includeOptional = false } = opts;

  let cart = await ctp('POST', '/carts', {
    currency: 'EUR',
    country: 'DE',
    shippingMode: 'Multiple',
    itemShippingAddresses: [
      {
        key: 'standard',
        country: 'DE',
        firstName: 'Demo',
        lastName: 'Customer',
        streetName: 'Munsterstrasse',
        streetNumber: '1',
        postalCode: '10117',
        city: 'Berlin',
      },
    ],
    lineItems: [{ productId: TELCO_BUNDLE_PRODUCT_ID, quantity: 1 }],
  });

  const expansionLog = [];

  if (includeOptional) {
    const bundleLi = cart.lineItems.find(
      (li) => li.productType && li.productType.id === TELCO_BUNDLE_PT_ID,
    );
    const optAttr = bundleLi && bundleLi.variant && bundleLi.variant.attributes
      ? bundleLi.variant.attributes.find((a) => a.name === 'optional-products')
      : null;
    const refs = (optAttr && Array.isArray(optAttr.value)) ? optAttr.value : [];
    if (refs.length > 0) {
      const actions = refs.map((ref) => ({
        action: 'addLineItem',
        productId: ref.id,
        quantity: 1,
        custom: {
          type: { typeId: 'type', key: LINE_ITEM_CUSTOM_TYPE_KEY },
          fields: {
            parentLineItemId: bundleLi.id,
            parentBundleProductKey: bundleLi.productKey || '',
            bundleRole: 'optional',
          },
        },
      }));
      expansionLog.push({
        pass: 0,
        actionCount: actions.length,
        actionTypes: actions.map((a) => a.action),
        note: 'optional add-on(s) selected by customer',
      });
      cart = await ctp('POST', `/carts/${cart.id}`, {
        version: cart.version,
        actions,
      });
    }
  }

  for (let i = 0; i < MAX_EXPANSIONS; i++) {
    const actions = await runExtensionLogic(cart);
    if (actions.length === 0) break;
    expansionLog.push({
      pass: i + 1,
      actionCount: actions.length,
      actionTypes: actions.map((a) => a.action),
    });
    cart = await ctp('POST', `/carts/${cart.id}`, {
      version: cart.version,
      actions,
    });
  }
  cart.__expansionLog = expansionLog;
  return cart;
}

async function deleteCart(id) {
  const c = await ctp('GET', `/carts/${id}`);
  await ctp('DELETE', `/carts/${id}?version=${c.version}`);
}

module.exports = { createAndExpandCart, deleteCart, runExtensionLogic };
