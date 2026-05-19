'use strict';

// commercetools API Extension webhook. Register this function's deployed URL
// (https://<site>.netlify.app/extension) as the destination of your Cart
// Create+Update extension in commercetools, then this function will receive
// the cart payload and return the update actions to apply.
const { handler } = require('../../src/handler.js');

exports.handler = async (event) => {
  const out = await handler({ body: event.body });
  return {
    statusCode: out.statusCode || 200,
    headers: out.headers || { 'Content-Type': 'application/json' },
    body: out.body,
  };
};
