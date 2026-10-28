# Connect your Stripe account to SummitWar

SummitWar uses Stripe-hosted card checkout only for optional sponsor cards: $100 each, or $600 for all six. Tournament entry is permanently free in every edition. Prices come from the database/server, and only verified payments can confirm bookings. No Stripe Product or Price IDs need to be created manually.

## Production settings in Vercel

Open the Vercel project **summitwar-second** (serving `summitwar.lol`) → Settings → Environment Variables. Save these values for **Production**, then redeploy the project. Changing an environment value does not update an already-running deployment.

| Variable | Where its value comes from |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | `https://summitwar.lol`, or the exact HTTPS origin you use for this deployment |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Your Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your private Supabase secret/server key |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → API keys → restricted key with Checkout Sessions Write, Payment Intents Read, and Charges/Refunds Write; use a separate test/sandbox key while testing |
| `STRIPE_WEBHOOK_SECRET` | The `whsec_...` signing secret for the webhook destination below |

The two Stripe values and the Supabase server key are private server settings. Mark them Secret/Sensitive in Vercel. Do not put them in `NEXT_PUBLIC_` settings or send them through chat. No Stripe publishable key is required for this hosted-checkout integration.

Apply the supplied Supabase database package first. The current schema, payment records and reservation functions must exist before a real purchase can be fulfilled. After testing, use live keys and the live endpoint's signing secret in Production to accept real payments. Test and live signing secrets are different.

## Stripe webhook

In Stripe Workbench → Webhooks, add an event destination for **Your account**, with the **Snapshot** payload format. Choose API version `2026-09-30.endive` to match the pinned SDK. For the primary site, use:

`https://summitwar.lol/api/stripe/webhook`

If you use the Vercel domain instead, use `https://summitwar-second.vercel.app/api/stripe/webhook` and set `NEXT_PUBLIC_APP_URL` to that same origin. Configure the destination in the same Stripe test/sandbox or live environment as its secret API key. Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.expired`
- `charge.refunded`
- `charge.dispute.created`
- `payment_intent.payment_failed` (acknowledged without confirming an entry)

Copy that destination's signing secret into Vercel's `STRIPE_WEBHOOK_SECRET`, save it for Production and redeploy. Checkout is disabled until both Stripe secrets are set. The webhook verifies the original request bytes, retrieves the current Checkout Session and PaymentIntent, checks amounts/currency/booking metadata, and applies an idempotent database transaction. Browser redirects and unsigned requests cannot mark a booking paid.

## Test the full purchase

Use Stripe test keys, with a signed-in founder account and a published tournament. Check the following flows:

1. Every edition confirms entry after organizer approval without Stripe checkout. Old entry checkout links must also refuse payment.
2. Sponsor selection opens checkout at $100 per selected card, or $600 for all six.
3. Book an occupied sponsor card. The old ad must stay visible until the replacement payment succeeds. Only selected cards change; another overlapping checkout must wait. A fully overtaken booking shows as overtaken, without an automatic refund.
4. In test checkout, use `4242 4242 4242 4242`, a future expiry and any three-digit CVC. Use Stripe's documented test cards only while in test mode.
5. The return page shows pending, verified, review, refund or expired status from your own database records. It checks pending confirmation every three seconds for up to two minutes, then offers a manual status check. An exited checkout can resume the same reservation without creating a second checkout.
6. In Stripe, inspect the event destination delivery and verify a successful response. Replay the same event: no duplicate booking or payment record should be created.
7. Test a decline, an expired reservation and a conflicting late payment. Check refund/dispute updates and the protected refund scheduler. A successfully enqueued scheduled request does not prove that a refund has settled.

No new receipt-email workflow is implemented by the app. Stripe's own optional receipt settings are managed in your Stripe account.

## Local development

Vercel settings do not populate the local `.env.local` file. For local payment testing, put separate test settings in that file. Set `NEXT_PUBLIC_APP_URL=http://localhost:3000`. Keep local/test secrets separate from live Production secrets.

The project includes a test-only local webhook runner:

```powershell
npm install
npm run stripe:listen
```

It loads the test API key from `.env.local`, obtains the signing secret for this local listener, saves it privately as `STRIPE_WEBHOOK_SECRET`, and forwards the required events. It rejects live keys and hides secrets in terminal output. Keep it running and start `npm run dev` in another terminal. `npm run stripe:listen -- --prepare` saves the signing secret without starting forwarding. A local signing secret is separate from your deployed webhook destination's secret.

For local guest voting, the documented Cloudflare test pair is supported only while `NODE_ENV=development` and the request hostname is `localhost`, `127.0.0.1`, or `[::1]`:

```dotenv
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

These are public test fixtures, not private credentials. Cloudflare still validates the dummy token. Test responses omit the real host/action, so this development case has its own validation; production and non-loopback requests reject this pair. Production needs real Cloudflare keys. Vote records and single-use link rules continue to use the connected database. See [Cloudflare's testing guide](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

Founder sign-in requires the GitHub provider enabled in Supabase with a GitHub OAuth app callback of `https://YOUR-PROJECT.supabase.co/auth/v1/callback`. Save the OAuth client ID and secret in Supabase's GitHub provider settings; the app needs no additional GitHub environment variables. Add `http://localhost:3000/auth/callback` and the exact deployed `/auth/callback` URL to Supabase's allowed redirect URLs. Keep the Site URL set to the deployed origin. Local `.env.local` must use `NEXT_PUBLIC_APP_URL=http://localhost:3000`; Vercel must use the deployed origin. Signing in does not grant organizer privileges; use the existing admin setup for your own account.

After installing and signing into the official Stripe CLI, forward **snapshot** events:

```powershell
stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.expired,charge.refunded,charge.dispute.created,payment_intent.payment_failed --forward-to localhost:3000/api/stripe/webhook
```

Use the signing secret printed by that local listener in the local `STRIPE_WEBHOOK_SECRET`, then restart the app. It is different from the deployed webhook destination's signing secret.

```powershell
npm run payments:check
npm run payments:check -- --connect
```

The first command reports only which required settings are present. `--connect` additionally makes read-only Stripe account and Supabase pricing requests; it creates no charge or refund and prints no key values. A signing secret is confirmed only when the app receives a real signed event. Existing Supabase scheduler instructions still apply; this update requires no new database migration.

Official references: [API keys](https://docs.stripe.com/keys), [webhooks](https://docs.stripe.com/webhooks), [Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment), [test cards](https://docs.stripe.com/testing), [Vercel environment variables](https://vercel.com/docs/environment-variables).
