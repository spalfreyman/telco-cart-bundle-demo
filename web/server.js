'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { ctp } = require('../src/ctp-client.js');
const { createAndExpandCart, deleteCart } = require('../src/cart-service.js');

const REQUIRED_ENV = [
  'CTP_CLIENT_ID',
  'CTP_CLIENT_SECRET',
  'CTP_AUTH_URL',
  'CTP_API_URL',
  'CTP_PROJECT_KEY',
  'CTP_SCOPES',
];
for (const k of REQUIRED_ENV) {
  if (!process.env[k]) {
    console.error(`Missing required env var: ${k}`);
    console.error('Source your /tmp/ctp.env or set CTP_* env vars before running.');
    process.exit(1);
  }
}

const EXT_KEY = 'telco-cart-bundle-expander';
const EXT_PLACEHOLDER_URL = 'https://example.com/placeholder/cart-bundle-expander';

let extensionWasPresent = false;

async function deleteExtensionIfExists() {
  try {
    const e = await ctp('GET', `/extensions/key=${EXT_KEY}`);
    await ctp('DELETE', `/extensions/key=${EXT_KEY}?version=${e.version}`);
    extensionWasPresent = true;
    console.log(`✓ deleted extension '${EXT_KEY}' (was v${e.version})`);
  } catch (err) {
    if (err.status === 404) {
      extensionWasPresent = false;
      console.log(`· extension '${EXT_KEY}' not present`);
    } else {
      throw err;
    }
  }
}

async function recreateExtensionIfNeeded() {
  if (!extensionWasPresent) return;
  await ctp('POST', '/extensions', {
    key: EXT_KEY,
    destination: { type: 'HTTP', url: EXT_PLACEHOLDER_URL },
    triggers: [{ resourceTypeId: 'cart', actions: ['Create', 'Update'] }],
    timeoutInMs: 2000,
  });
  console.log(`✓ recreated extension '${EXT_KEY}'`);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body, contentType = 'application/json') {
  res.writeHead(status, { 'Content-Type': contentType });
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    res.end(body);
  } else {
    res.end(JSON.stringify(body));
  }
}

const STATIC_DIR = path.join(__dirname, 'public');

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      const html = fs.readFileSync(path.join(STATIC_DIR, 'index.html'));
      return send(res, 200, html, 'text/html; charset=utf-8');
    }

    if (req.method === 'POST' && req.url === '/api/cart') {
      const bodyStr = await readBody(req);
      let opts = {};
      if (bodyStr.trim()) {
        try {
          opts = JSON.parse(bodyStr);
        } catch {
          return send(res, 400, { error: 'invalid JSON body' });
        }
      }
      const cart = await createAndExpandCart(opts);
      return send(res, 200, cart);
    }

    if (req.method === 'DELETE' && req.url.startsWith('/api/cart/')) {
      const id = req.url.slice('/api/cart/'.length);
      await deleteCart(id);
      return send(res, 200, { ok: true });
    }

    send(res, 404, { error: 'not found' });
  } catch (err) {
    console.error('handler error:', err);
    send(res, err.status || 500, { error: String(err.message) });
  }
});

const PORT = Number(process.env.PORT) || 3000;

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} → shutting down`);
  try {
    await recreateExtensionIfNeeded();
  } catch (e) {
    console.error('failed to recreate extension:', e.message);
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

(async () => {
  try {
    await deleteExtensionIfExists();
    server.listen(PORT, () => {
      console.log(`\nDemo running → http://localhost:${PORT}`);
      console.log('Ctrl+C to stop (will recreate the extension on the way out)\n');
    });
  } catch (e) {
    console.error('startup failed:', e.message);
    process.exit(1);
  }
})();
