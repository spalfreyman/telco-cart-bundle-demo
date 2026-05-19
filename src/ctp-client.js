'use strict';

const REQUIRED_ENV = [
  'CTP_CLIENT_ID',
  'CTP_CLIENT_SECRET',
  'CTP_AUTH_URL',
  'CTP_API_URL',
  'CTP_PROJECT_KEY',
  'CTP_SCOPES',
];

function assertEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required env vars: ${missing.join(', ')}. ` +
        `Set them via Netlify env (or your local shell) before invoking.`,
    );
  }
}

let cachedToken = null;

async function ctpAuth() {
  assertEnv();
  if (cachedToken && cachedToken.exp > Date.now()) return cachedToken.token;
  const basic = Buffer.from(
    `${process.env.CTP_CLIENT_ID}:${process.env.CTP_CLIENT_SECRET}`,
  ).toString('base64');
  const res = await fetch(`${process.env.CTP_AUTH_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=client_credentials&scope=${process.env.CTP_SCOPES}`,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`auth failed: ${JSON.stringify(json)}`);
  cachedToken = {
    token: json.access_token,
    exp: Date.now() + (json.expires_in - 60) * 1000,
  };
  return cachedToken.token;
}

async function ctp(method, p, body) {
  const tok = await ctpAuth();
  const url = `${process.env.CTP_API_URL}/${process.env.CTP_PROJECT_KEY}${p}`;
  const opts = { method, headers: { Authorization: `Bearer ${tok}` } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(url, opts);
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!r.ok) {
    const detail =
      data && data.errors && data.errors.length
        ? data.errors.map((e) => e.detailedErrorMessage || e.message || e.code).join(' | ')
        : (data && (data.message || data.error)) || text.slice(0, 200);
    const err = new Error(`ctp ${method} ${p} → ${r.status}: ${detail}`);
    err.status = r.status;
    err.body = data;
    throw err;
  }
  return data;
}

module.exports = { ctp, ctpAuth, assertEnv };
