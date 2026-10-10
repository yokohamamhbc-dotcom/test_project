const ALLOWED_EVENTS = new Set([
  "VISIT",
  "ACTIVATION",
  "TRIAL_STARTED",
  "PURCHASE",
  "RETENTION",
  "DIAGNOSTIC_STARTED",
  "OFFER_INTENT"
]);

const ALLOWED_ORIGINS = new Set([
  "https://test-project-yokohamamhbc-9529.vercel.app",
  "https://test-project-phi-ashy.vercel.app",
  "https://test-project-git-main-yokohamamhbc-9529.vercel.app"
]);

function reply(res, status, body) {
  res.status(status).json(body);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return reply(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const origin = req.headers?.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return reply(res, 403, { ok: false, code: "ORIGIN_NOT_ALLOWED" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    return reply(res, 503, {
      ok: false,
      code: "EVENT_STORAGE_NOT_CONFIGURED",
      message: "Configure SUPABASE_URL and SUPABASE_SECRET_KEY as server-side environment variables."
    });
  }

  const payload = req.body;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return reply(res, 400, { ok: false, code: "INVALID_JSON_BODY" });
  }

  const eventName = payload.event;
  const occurredAt = payload.occurredAt || new Date().toISOString();
  const anonymousId = typeof payload.anonymousId === "string" ? payload.anonymousId : null;
  const idempotencyKey = payload.idempotencyKey;
  const source = typeof payload.source === "string" ? payload.source : "website";
  const properties = payload.properties && typeof payload.properties === "object" && !Array.isArray(payload.properties)
    ? payload.properties
    : {};
  const experimentId = payload.experimentId || null;

  if (!ALLOWED_EVENTS.has(eventName)) {
    return reply(res, 400, { ok: false, code: "INVALID_EVENT" });
  }
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return reply(res, 400, { ok: false, code: "INVALID_IDEMPOTENCY_KEY" });
  }
  if (anonymousId && (anonymousId.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(anonymousId))) {
    return reply(res, 400, { ok: false, code: "INVALID_ANONYMOUS_ID" });
  }
  if (typeof source !== "string" || source.length > 80) {
    return reply(res, 400, { ok: false, code: "INVALID_SOURCE" });
  }
  if (JSON.stringify(properties).length > 4000) {
    return reply(res, 413, { ok: false, code: "PROPERTIES_TOO_LARGE" });
  }
  const parsedTime = Date.parse(occurredAt);
  if (!Number.isFinite(parsedTime) || Math.abs(Date.now() - parsedTime) > 7 * 24 * 60 * 60 * 1000) {
    return reply(res, 400, { ok: false, code: "INVALID_EVENT_TIME" });
  }

  const endpoint = new URL("/rest/v1/loop_events", supabaseUrl);
  endpoint.searchParams.set("on_conflict", "idempotency_key");

  const row = {
    event_name: eventName,
    occurred_at: new Date(parsedTime).toISOString(),
    anonymous_id: anonymousId,
    experiment_id: experimentId,
    idempotency_key: idempotencyKey,
    source,
    properties
  };

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "apikey": secretKey,
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates,return=minimal"
      },
      body: JSON.stringify(row)
    });
    if (!upstream.ok) {
      const diagnostic = await upstream.text();
      console.error("SUPABASE_EVENT_WRITE_FAILED", upstream.status, diagnostic.slice(0, 500));
      return reply(res, 502, { ok: false, code: "EVENT_STORAGE_FAILED" });
    }
    return reply(res, 202, { ok: true, accepted: true, event: eventName });
  } catch (error) {
    console.error("EVENT_STORAGE_REQUEST_FAILED", error instanceof Error ? error.message : "unknown");
    return reply(res, 502, { ok: false, code: "EVENT_STORAGE_UNAVAILABLE" });
  }
}
