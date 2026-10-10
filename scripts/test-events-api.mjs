import assert from "node:assert/strict";
import handler from "../api/events.js";

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

const oldUrl = process.env.SUPABASE_URL;
const oldKey = process.env.SUPABASE_SECRET_KEY;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SECRET_KEY;

const methodRes = response();
await handler({ method: "GET", headers: {} }, methodRes);
assert.equal(methodRes.statusCode, 405);
assert.equal(methodRes.body.code, "METHOD_NOT_ALLOWED");

const missingConfigRes = response();
await handler({ method: "POST", headers: {}, body: { event: "VISIT", idempotencyKey: "test-key-0001" } }, missingConfigRes);
assert.equal(missingConfigRes.statusCode, 503);
assert.equal(missingConfigRes.body.code, "EVENT_STORAGE_NOT_CONFIGURED");

const invalidEventRes = response();
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY = "test-secret";
await handler({ method: "POST", headers: {}, body: { event: "FAKE_REVENUE", idempotencyKey: "test-key-0002" } }, invalidEventRes);
assert.equal(invalidEventRes.statusCode, 400);
assert.equal(invalidEventRes.body.code, "INVALID_EVENT");

if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = oldKey;
console.log("EVENT_API_CONTRACT=PASS");
