import { createHmac, timingSafeEqual } from "node:crypto";

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function verifyStripeSignature(rawBody, header, secret) {
  if (typeof header !== "string" || !secret) return false;
  const parts = header.split(",").map(part => part.split("=", 2));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || signatures.length === 0 || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(timestamp + ".").update(rawBody).digest();
  return signatures.some(signature => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const candidate = Buffer.from(signature, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(body);
}

async function supabaseRequest(path, secretKey, options = {}) {
  const url = new URL(path, process.env.SUPABASE_URL);
  return fetch(url, {
    ...options,
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY;
  if (!webhookSecret || !supabaseUrl || !supabaseSecret) {
    return send(res, 503, { ok: false, code: "WEBHOOK_STORAGE_NOT_CONFIGURED" });
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch {
    return send(res, 400, { ok: false, code: "INVALID_REQUEST_BODY" });
  }
  if (rawBody.length > 1024 * 1024) {
    return send(res, 413, { ok: false, code: "PAYLOAD_TOO_LARGE" });
  }
  if (!verifyStripeSignature(rawBody, req.headers?.["stripe-signature"], webhookSecret)) {
    return send(res, 400, { ok: false, code: "INVALID_STRIPE_SIGNATURE" });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return send(res, 400, { ok: false, code: "INVALID_EVENT_JSON" });
  }

  const object = event?.data?.object;
  if (!event?.id || !event?.type || !object) {
    return send(res, 400, { ok: false, code: "INVALID_STRIPE_EVENT" });
  }

  const liveMode = event.livemode === true;
  let providerObjectId = object.id;
  let offerId = object.metadata?.offer || "audit";
  let amountMinor = Number(object.amount_received ?? object.amount_total ?? object.amount ?? 0);
  let currency = String(object.currency || "jpy").toUpperCase();
  let paymentStatus = "pending";
  let occurredAt = Number.isFinite(event.created) ? new Date(event.created * 1000).toISOString() : new Date().toISOString();

  if (event.type === "payment_intent.succeeded") {
    paymentStatus = "succeeded";
  } else if (event.type === "charge.succeeded") {
    paymentStatus = object.paid === true ? "succeeded" : "pending";
    providerObjectId = object.payment_intent || object.id;
  } else if (event.type === "checkout.session.completed") {
    if (object.payment_status !== "paid") {
      return send(res, 200, { ok: true, ignored: true, reason: "CHECKOUT_NOT_PAID" });
    }
    paymentStatus = "succeeded";
    providerObjectId = object.payment_intent || object.id;
    amountMinor = Number(object.amount_total || 0);
    currency = String(object.currency || "jpy").toUpperCase();
  } else if (event.type === "charge.refunded" || event.type === "charge.refund.updated") {
    if (!object.payment_intent) {
      return send(res, 200, { ok: true, ignored: true, reason: "REFUND_WITHOUT_PAYMENT_INTENT" });
    }
    providerObjectId = object.payment_intent;
    paymentStatus = object.refunded ? "refunded" : "succeeded";
    amountMinor = Number(object.amount_refunded || 0);
  } else if (event.type === "charge.dispute.created") {
    providerObjectId = object.payment_intent || object.charge || object.id;
    paymentStatus = "disputed";
  } else {
    return send(res, 200, { ok: true, ignored: true, reason: "UNHANDLED_EVENT_TYPE" });
  }

  if (typeof providerObjectId !== "string" || !providerObjectId || !Number.isSafeInteger(amountMinor) || amountMinor < 0 || !/^[A-Z]{3}$/.test(currency)) {
    return send(res, 400, { ok: false, code: "INVALID_PAYMENT_FIELDS" });
  }

  const row = {
    provider: "stripe",
    provider_object_id: providerObjectId,
    mode: liveMode ? "live" : "test",
    offer_id: offerId,
    currency,
    amount_minor: amountMinor,
    payment_status: paymentStatus,
    occurred_at: occurredAt,
    evidence: {
      stripeEventId: event.id,
      stripeEventType: event.type,
      livemode: liveMode,
      verifiedBy: "stripe-webhook-signature"
    }
  };

  try {
    const existing = await supabaseRequest(
      `/rest/v1/revenue_evidence?provider=eq.stripe&provider_object_id=eq.${encodeURIComponent(providerObjectId)}&select=id`,
      supabaseSecret
    );
    if (!existing.ok) {
      console.error("SUPABASE_EVIDENCE_LOOKUP_FAILED", existing.status, (await existing.text()).slice(0, 300));
      return send(res, 502, { ok: false, code: "EVIDENCE_LOOKUP_FAILED" });
    }
    const matches = await existing.json();
    const result = matches.length
      ? await supabaseRequest(
          `/rest/v1/revenue_evidence?provider=eq.stripe&provider_object_id=eq.${encodeURIComponent(providerObjectId)}`,
          supabaseSecret,
          { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(row) }
        )
      : await supabaseRequest(
          "/rest/v1/revenue_evidence",
          supabaseSecret,
          { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(row) }
        );

    if (!result.ok) {
      console.error("SUPABASE_EVIDENCE_WRITE_FAILED", result.status, (await result.text()).slice(0, 300));
      return send(res, 502, { ok: false, code: "EVIDENCE_WRITE_FAILED" });
    }
    return send(res, 200, {
      ok: true,
      recorded: true,
      mode: row.mode,
      paymentStatus,
      productionRevenueObserved: liveMode && paymentStatus === "succeeded"
    });
  } catch (error) {
    console.error("SUPABASE_EVIDENCE_REQUEST_FAILED", error instanceof Error ? error.message : "unknown");
    return send(res, 502, { ok: false, code: "EVIDENCE_STORAGE_UNAVAILABLE" });
  }
}
