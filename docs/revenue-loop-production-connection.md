# Revenue loop production connection checklist

## Components already created

- Supabase project: `loop-revenue-engine`
- Database tables: `experiments`, `loop_events`, `revenue_evidence`, `loop_decisions`
- Vercel server-side event endpoint: `POST /api/events`
- Stripe webhook endpoint: `POST /api/stripe-webhook`
- Secret-safe configuration status endpoint: `GET /api/integrations-status`

## Vercel environment variables

The following variables must be configured in Vercel Project Settings > Environment Variables. Never commit secret values to GitHub.

| Variable | Required for | Value source |
|---|---|---|
| `SUPABASE_URL` | All Supabase writes | Supabase project API settings |
| `SUPABASE_PUBLISHABLE_KEY` | Client-side access only if later needed | Supabase API settings |
| `SUPABASE_SECRET_KEY` | Server-side database writes | Supabase secret key; server only |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification | Stripe Workbench/Webhooks endpoint secret |
| `CHECKOUT_URL` | Checkout redirect | Payment Link URL; current configured link is test-mode |

Set the server secret and webhook secret for Production, Preview, and Development only as appropriate for each environment. Do not reuse test webhook secrets for live mode.

## Stripe webhook configuration

Endpoint:
`https://test-project-yokohamamhbc-9529.vercel.app/api/stripe-webhook`

Subscribe to at least:
- `payment_intent.succeeded`
- `checkout.session.completed`
- `charge.refunded`
- `charge.refund.updated`
- `charge.dispute.created`

The endpoint verifies the Stripe signature and timestamp before processing events. Test-mode events are stored with `mode=test` and must never be reported as production revenue.

## Verification sequence

1. Configure secrets in Vercel.
2. Redeploy Production after environment variable changes.
3. Request `GET /api/integrations-status`; it should report the required booleans as true without disclosing values.
4. Send Stripe's official test webhook event or complete a hosted test checkout.
5. Verify the corresponding row in `public.revenue_evidence`.
6. Repeat delivery of the same Stripe event and confirm the unique provider/object constraint prevents duplicate evidence rows.
7. Verify no test-mode row is counted as production revenue.

## Current honest status

The schema and endpoint code exist. Live event writes and Stripe webhook writes are not confirmed until the server-side secret variables are configured and an actual test event is received.
