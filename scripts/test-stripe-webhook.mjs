import assert from "node:assert/strict";
import handler from "../api/stripe-webhook.js";

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

const names = ["STRIPE_WEBHOOK_SECRET", "SUPABASE_URL", "SUPABASE_SECRET_KEY"];
const old = Object.fromEntries(names.map(name => [name, process.env[name]]));
for (const name of names) delete process.env[name];

const getRes = response();
await handler({ method: "GET", headers: {} }, getRes);
assert.equal(getRes.statusCode, 405);

const noConfigRes = response();
await handler({ method: "POST", headers: {}, body: Buffer.from("{}") }, noConfigRes);
assert.equal(noConfigRes.statusCode, 503);
assert.equal(noConfigRes.body.code, "WEBHOOK_STORAGE_NOT_CONFIGURED");

for (const name of names) {
  if (old[name] === undefined) delete process.env[name];
  else process.env[name] = old[name];
}
console.log("STRIPE_WEBHOOK_CONTRACT=PASS");
