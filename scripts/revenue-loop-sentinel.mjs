import fs from "node:fs";

const business = JSON.parse(fs.readFileSync("loop/business.json","utf8"));
const events = JSON.parse(fs.readFileSync("loop/events.json","utf8"));

const hasAnalyticsCredential = Boolean(process.env.VERCEL_TOKEN);
const hasCheckoutCredential = Boolean(process.env.CHECKOUT_URL);

const result = {
  generatedAt: new Date().toISOString(),
  status: "WAITING_EXTERNAL_CONNECTION",
  analytics: {
    credentialConfigured: hasAnalyticsCredential,
    state: hasAnalyticsCredential ? "READY_FOR_PROBE" : "NOT_CONNECTED"
  },
  payment: {
    checkoutCredentialConfigured: hasCheckoutCredential,
    state: hasCheckoutCredential ? "READY_FOR_CHECKOUT_CONFIG" : "NOT_CONNECTED"
  },
  business: {
    declaredRevenueState: business?.northStar?.status ?? "UNKNOWN",
    declaredProviderState: events?.provider ?? "UNKNOWN"
  },
  guardrails: {
    revenueClaimed: false,
    purchaseClaimed: false,
    analyticsObserved: false
  },
  nextAction: hasAnalyticsCredential && hasCheckoutCredential
    ? "Run authenticated analytics probe and verify production checkout configuration."
    : "Keep the loop in disconnected-safe mode; reconnect automatically when required secrets become available."
};

if (hasAnalyticsCredential) result.analytics.note = "VERCEL_TOKEN is present; the scheduled workflow will run the authenticated analytics probe.";
if (hasCheckoutCredential) result.payment.note = "CHECKOUT_URL is present to the workflow; production payment configuration still requires independent verification.";

console.log(JSON.stringify(result, null, 2));
