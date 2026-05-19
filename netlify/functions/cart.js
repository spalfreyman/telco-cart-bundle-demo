'use strict';

const { createAndExpandCart, deleteCart } = require('../../src/cart-service.js');

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Routed by netlify.toml — handles POST /api/cart and DELETE /api/cart/:id.
exports.handler = async (event) => {
  try {
    const method = event.httpMethod;
    const path = event.path || '';
    const idMatch = path.match(/\/api\/cart\/(.+)$/);
    const cartId = idMatch ? idMatch[1] : null;

    if (method === 'POST' && !cartId) {
      let opts = {};
      if (event.body) {
        try {
          opts = JSON.parse(event.body);
        } catch {
          return json(400, { error: 'invalid JSON body' });
        }
      }
      const cart = await createAndExpandCart(opts);
      return json(200, cart);
    }

    if (method === 'DELETE' && cartId) {
      await deleteCart(cartId);
      return json(200, { ok: true });
    }

    return json(404, { error: 'not found', method, path });
  } catch (err) {
    console.error('cart function error:', err);
    return json(err.status || 500, { error: String(err.message) });
  }
};
