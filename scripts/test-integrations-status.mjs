import assert from "node:assert/strict";
import handler from "../api/integrations-status.js";

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(n) { this.statusCode = n; return this; },
    json(v) { this.body = v; return this; }
  };
}

const names = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "CHECKOUT_URL",
  "VERCEL_ENV"
];
const old = Object.fromEntries(names.map(name => [name, process.env[name]]));
for (const name of names) delete process.env[name];

const methodRes = response();
await handler({ method: "POST" }, methodRes);
assert.equal(methodRes.statusCode, 405);
assert.equal(methodRes.headers.Allow, "GET");

const emptyRes = response();
await handler({ method: "GET" }, emptyRes);
assert.equal(emptyRes.statusCode, 200);
assert.equal(emptyRes.body.eventIngestion, "WAITING_FOR_SERVER_SECRET");
assert.equal(emptyRes.body.stripeWebhook, "WAITING_FOR_SECRETS");
assert.equal(JSON.stringify(emptyRes.body).includes("secret-value"), false);

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY = "server-secret-value";
process.env.STRIPE_WEBHOOK_SECRET = "stripe-secret-value";
const configuredRes = response();
await handler({ method: "GET" }, configuredRes);
assert.equal(configuredRes.body.eventIngestion, "CONFIGURED");
assert.equal(configuredRes.body.stripeWebhook, "CONFIGURED");
assert.equal(JSON.stringify(configuredRes.body).includes("server-secret-value"), false);
assert.equal(JSON.stringify(configuredRes.body).includes("stripe-secret-value"), false);

for (const name of names) {
  if (old[name] === undefined) delete process.env[name];
  else process.env[name] = old[name];
}
console.log("INTEGRATIONS_STATUS_CONTRACT=PASS");
