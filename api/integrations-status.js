export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }
  const checks = {
    supabaseUrl: Boolean(process.env.SUPABASE_URL),
    supabasePublishableKey: Boolean(process.env.SUPABASE_PUBLISHABLE_KEY),
    supabaseServerSecret: Boolean(process.env.SUPABASE_SECRET_KEY),
    stripeWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    checkoutUrl: Boolean(process.env.CHECKOUT_URL)
  };
  const requiredForEventWrites = checks.supabaseUrl && checks.supabaseServerSecret;
  const requiredForWebhookWrites = requiredForEventWrites && checks.stripeWebhookSecret;
  return res.status(200).json({
    ok: true,
    environment: process.env.VERCEL_ENV || "unknown",
    checks,
    eventIngestion: requiredForEventWrites ? "CONFIGURED" : "WAITING_FOR_SERVER_SECRET",
    stripeWebhook: requiredForWebhookWrites ? "CONFIGURED" : "WAITING_FOR_SECRETS",
    note: "Only configuration presence is reported. No secret values, customer data, or revenue amounts are exposed."
  });
}
