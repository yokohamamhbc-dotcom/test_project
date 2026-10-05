import fs from "node:fs";

const evidence = JSON.parse(fs.readFileSync("loop/revenue-evidence.json", "utf8"));
const secret = process.env.STRIPE_SECRET_KEY;
const account = process.env.STRIPE_ACCOUNT_ID || evidence.payment?.account;
const linkId = process.env.STRIPE_PAYMENT_LINK_ID || evidence.payment?.paymentLink?.id;
const baselineIntentCount = Number(evidence.testPayment?.paymentIntentCount || 0);
const baselineChargeCount = Number(evidence.testPayment?.chargeCount || 0);

const result = {
  generatedAt: new Date().toISOString(),
  status: "NOT_CONNECTED",
  provider: "stripe",
  mode: "test",
  account,
  paymentLinkId: linkId,
  baseline: { paymentIntentCount: baselineIntentCount, chargeCount: baselineChargeCount },
  observed: { paymentIntentCount: null, chargeCount: null },
  testPayment: "NOT_OBSERVED",
  revenue: { status: "NOT_OBSERVED", amountJpy: 0 },
  guardrail: "Test-mode payment evidence must never be promoted to production revenue."
};

if (!secret) {
  result.reason = "STRIPE_SECRET_KEY is not configured; no payment observation was claimed.";
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

async function stripe(path) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: { Authorization: `Bearer ${secret}` }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Stripe API ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

try {
  const [intents, charges] = await Promise.all([
    stripe("/v1/payment_intents?limit=100"),
    stripe("/v1/charges?limit=100")
  ]);

  const paymentIntents = Array.isArray(intents.data) ? intents.data : [];
  const chargeData = Array.isArray(charges.data) ? charges.data : [];
  const relevantIntents = paymentIntents.filter((p) =>
    p.currency === "jpy" &&
    Number(p.amount) === 49800 &&
    (!linkId || p.metadata?.payment_link_id === linkId || p.metadata?.offer === "audit")
  );
  const successfulCharges = chargeData.filter((c) =>
    c.paid === true &&
    c.currency === "jpy" &&
    Number(c.amount) === 49800
  );

  result.status = "CONNECTED";
  result.observed = {
    paymentIntentCount: paymentIntents.length,
    chargeCount: chargeData.length,
    matchingAuditPaymentIntents: relevantIntents.length,
    successful49800JpyCharges: successfulCharges.length
  };

  if (
    paymentIntents.length > baselineIntentCount ||
    chargeData.length > baselineChargeCount ||
    relevantIntents.length > 0 ||
    successfulCharges.length > 0
  ) {
    result.testPayment = "OBSERVED";
    result.observation = "Stripe test-mode payment objects were observed. This is technical test evidence, not production revenue.";
  } else {
    result.reason = "No Stripe test payment objects were observed.";
  }

  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  result.status = "ERROR";
  result.error = error instanceof Error ? error.message : String(error);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = 1;
}
