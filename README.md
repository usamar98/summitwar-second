# SummitWar

A Next.js 16 / TypeScript / Tailwind 4 application with Supabase Auth, Postgres, Storage, and one-time Stripe Checkout payments. The repository started empty. No real records, metrics, or paid entrants are fabricated.

## Run locally

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open http://localhost:3000. Without credentials the public design, rules, empty tournament, and application form render; authentication and mutations remain unavailable. `DEMO_MODE=true` only adds an explicit local preview banner and is ignored in production. Test fixtures live exclusively in the isolated test database.

## Supabase setup

1. Create a Supabase project. Set its URL, publishable key, and server-only service role key in `.env.local`.
2. Apply `supabase/migrations/20261011160707_summitwar.sql` through Supabase's SQL editor or your established migration pipeline. `supabase/schema.sql` is the same source, retained for local database tests; apply **one**, not both. Run `node scripts/sync-schema.mjs` after changing the schema before deployment.
3. Apply `supabase/storage.sql` to create the public `product-media` bucket. Only the authenticated server upload route writes to it; browser roles receive read access. Images are limited to 5 MB and video demos to 30 MB. The route checks MIME types and file signatures. Demo duration is validated locally and reviewed by the organizer before approval. SVG uploads and arbitrary embeds are excluded.
4. Enable email magic links and GitHub OAuth in Supabase Auth. Set Site URL to your application origin and allow `/auth/callback`. The default PKCE email link works with the callback code. If customizing the template to use token hashes, use `/auth/callback?token_hash={{ .TokenHash }}`. Keep email confirmation enabled and configure provider abuse/rate limits.
5. Sign in once and assign the organizer role using trusted SQL:

```sql
insert into public.admin_roles(user_id) values ('YOUR-AUTH-USER-UUID');
```

Admins are checked against this table, never user-editable metadata. In `/admin`, create a draft, then publish it. The database assigns immutable edition numbers at publication: global edition #1 is free; all later editions cost 500 cents USD. Draft deletion or cancellation cannot reset the edition counter. Do not manually reset that counter.

## Stripe setup

Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` using test credentials first. The installed SDK uses Stripe's current `allowed_payment_method_types: ['card']` filter; Adaptive Pricing is disabled to preserve the exact USD amount. Enable card payments in the Stripe dashboard.

Register a **snapshot** webhook destination at `/api/stripe/webhook` for:

- `checkout.session.completed`
- `checkout.session.expired`
- `charge.refunded`
- `charge.dispute.created`
- `payment_intent.payment_failed` (acknowledged; never fulfills an entry)

For local forwarding:

```powershell
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the listener's signing secret to your local environment. Original request bytes are signature-verified. The handler retrieves the actual Checkout Session and checks paid status, mode, internal metadata, expected amount, currency, registration status, and capacity. Redirects never confirm payment. Sessions are idempotent per reservation; duplicate delivery is recorded transactionally. Delayed and duplicate successful payments without an eligible seat enter the durable refund queue. An expired event retrieves the current session before releasing a seat, preventing stale events from undoing completion.

Approval allocates a reservation lasting up to **60 minutes**, capped at registration close. At least 31 minutes of registration time must remain at approval. Start checkout while at least 30 minutes remain on the displayed reservation, as Stripe requires. A started valid session is reused through expiry. If that creation window is missed, the dashboard explains it and the organizer can reapprove after expiry; the scheduler releases abandoned seats. This deliberately does not extend reservations silently. Expired, rejected, or waitlisted applicants are not charged. Failed card attempts do not fulfill an entry; Stripe permits a retry during the same session.

## Durable scheduler

1. Enable Supabase Cron and Vault in your project.
2. Store Vault secrets named `summitwar_app_url` (your deployed origin) and `summitwar_cron_secret` (a random secret matching app `CRON_SECRET`). Never commit the secret values.
3. Apply `supabase/scheduler.sql`. It installs a once-per-minute database transition job, plus a five-minute HTTP job for refund processing.
4. Inspect `cron.job_run_details` and pg_net response records for failures. Configure monitoring/alerts for failed runs and unresolved `refund_pending` / `disputed` payments. Re-running the cron setup updates the jobs by name.

`tick()` locks tournament rows, assigns the bracket, advances overdue rounds, freezes valid scores, and publishes champions transactionally. A delayed job catches up all overdue rounds and retains the scheduled final closing time as spotlight start. It runs with zero visitors. The protected `/api/cron` endpoint also runs transitions and safely retries refunds. Pending provider refunds retain their Stripe refund ID; network retries reuse the same idempotency key. Confirmed provider failures increment the retry generation. One failing refund does not stop the others.

Rounds are start-inclusive and end-exclusive, using the database clock after locking. Quarterfinals are exactly 24 hours, semifinals 16 hours, and final eight hours. Spotlight is exactly 120 hours. Jobs may execute slightly after a deadline, but votes close at the stored timestamp regardless. Admin invalidation requires a reason and must occur before the match closes. An incomplete edition is rescheduled and an in-app notice is written to every applicant's dashboard. Notices are in-app; email delivery is not configured.

Cancelled published editions retain their identity and pricing. Finish paid refunds before rescheduling. If a bracket was already locked, rescheduling preserves its original eight entrants, frozen pitches, pairings, and tie priorities; those founders must be reviewed/reconfirmed. Registration never silently moves entrants to another edition.

## Promotion, sharing, and analytics

Confirmed apps receive permanent pages. Match pages generate downloadable PNG battle cards, native share links, and editable X drafts. Product, tournament, match, and champion URLs expose dynamic Open Graph images. Server-side graphics fetch logos only from the configured Supabase `product-media` bucket; external logos display in the browser and use initials in downloaded graphics to avoid unsafe server fetches. Upload logos to the managed bucket for full logo cards.

Champions receive permanent result pages and downloadable embeddable SVG badges. Admins prepare and save interviews, edit social drafts through X's composer, and mark promotion checklist tasks completed only after real fulfillment. Social posting and five-day pinning are manual; no messages or posts are sent automatically.

Views and outbound clicks are deduplicated per browser cookie, product, action, and UTC day. Basic bot user agents are excluded. Metrics mean recorded events, **not** unique people, signups, or sales. Suspicious voting currently flags accounts less than one hour old. Verified authentication, final-vote constraints, a server rate limit, and the admin review queue reduce abuse without claiming one account equals one person.

## Validation

```powershell
npm test
npm run typecheck
npm run build
```

Browser smoke checks (requires installed Chrome, override with `BROWSER_EXECUTABLE` if needed):

```powershell
node scripts/browser-smoke.mjs
```

The recorded local result is 26 passing tests, a successful production build, and passing desktop/mobile smoke checks on 8 pages. See `VALIDATION.md` and `artifacts/browser-checks.json`.

The database suite runs the actual schema/functions inside PGlite (embedded Postgres) with mocked Supabase auth tables. Provider tests use the Stripe SDK's actual signature verifier and controlled payment/refund mocks. PGlite validates SQL, invariants, admission races as queued concurrent requests, and idempotent commands. It does **not** reproduce multi-connection Postgres contention or hosted Supabase Auth/RLS deployment configuration. Before launch, repeat final-seat contention on your hosted Postgres with independent connections and test Stripe CLI delivery, refunds, GitHub/email login, uploads, and scheduled jobs with real test credentials.

Run Supabase database security/performance advisors after applying the migrations. RLS is enabled on every exposed application table; anonymous/authenticated roles cannot invoke privileged commands or mutate entries, prices, results, votes, or payment state. Server keys are imported through server-only modules. No live payments, hosted auth, storage, or production scheduler have been verified without credentials. The app is not deployed to summitwar.lol by this implementation.

Official integration references: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Stripe webhooks](https://docs.stripe.com/webhooks), [Checkout session creation](https://docs.stripe.com/api/checkout/sessions/create).
