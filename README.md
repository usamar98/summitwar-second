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
2. Apply migrations in filename order: `20261011160707_summitwar.sql`, `20261011172940_simplify_submissions.sql`, `20261011184518_visitor_presence.sql`, `20261011190335_daily_tournaments.sql`, `20261011195958_community_features.sql`, then `20261012191709_extended_tournament_schedule.sql`. Existing installations apply only migrations not already applied. Sources include `supabase/schema.sql`, `supabase/submission-upgrade.sql`, `supabase/visitor-presence.sql`, `supabase/daily-tournaments.sql`, `supabase/community-features.sql`, and `supabase/extended-tournaments.sql`; do not also apply the sources. Run `node scripts/sync-schema.mjs` after schema changes.
3. Apply `supabase/storage.sql` to create the public `product-media` bucket. Only the authenticated server upload route writes to it; browser roles receive read access. Images are limited to 5 MB and video demos to 30 MB. The route checks MIME types and file signatures. Demo duration is validated locally and reviewed by the organizer before approval. SVG uploads and arbitrary embeds are excluded.
4. Enable email magic links and GitHub OAuth in Supabase Auth. Set Site URL to your application origin and allow `/auth/callback`. The default PKCE email link works with the callback code. If customizing the template to use token hashes, use `/auth/callback?token_hash={{ .TokenHash }}`. Keep email confirmation enabled and configure provider abuse/rate limits.
5. Sign in once and assign the organizer role using trusted SQL:

```sql
insert into public.admin_roles(user_id) values ('YOUR-AUTH-USER-UUID');
```

Admins are checked against this table, never user-editable metadata. In `/admin`, create a draft, then publish it. The database assigns immutable edition numbers at publication: global edition #1 is free; all later editions cost 500 cents USD. Draft deletion or cancellation cannot reset the edition counter. Do not manually reset that counter.

## Submission and tournament experience

The header contains only the SummitWar brand with its shield and crossed swords logo, also used as the favicon. Submission links open a right-hand modal sidebar, preserve the chosen place, trap keyboard focus, and close with Escape or the close button. Direct `/submit` URLs remain available. The sidebar loads the signed-in user's application context through a private, uncached endpoint.

Below the header, green shows browsers seen within 90 seconds; red shows recorded visits since tracking began. Visible pages send a heartbeat every 30 seconds. Visits deduplicate tabs through an HttpOnly browser cookie, with a new visit after 30 minutes of inactivity. Bot user agents are excluded. Browser identifiers are hashed, protected from public access, and removed after 90 days without erasing aggregate totals. Counts describe browsers and visits, not verified voters or unique people. Unconfigured or unavailable tracking shows a dash rather than a fabricated total. Apply the visitor migration before enabling this on a configured backend.

The homepage opens directly with the balanced tournament bracket. Empty places link to submission; occupied places cannot be claimed twice. Eight founders can enter one app each. Submission asks for website, name, category, founder and optional X handle. The server fetches the website tagline and favicon, validates public DNS and every redirect, pins socket DNS, and bounds request time and response size. Metadata preview lookups are account rate limited. Missing metadata is shown honestly.

The first edition skips payment. Later editions open $5 Checkout on Submit, reserve a specific place for up to 60 minutes, and require organizer review before publishing or voting. Rejection/waitlisting queues a refund. Slot claims and payments use tournament row locks; a delayed payment cannot take another founder’s occupied place. Participant rows show the active round and valid votes, progressing from eight apps to four, two, then the champion. A verified account can cast one final vote per match; founders cannot vote in their own match.

## Community features

The enlarged bracket gives each place a distinct color that follows its entrant through subsequent rounds. The tournament and match pages check score revisions every three seconds while visible and refresh their server-rendered content only when the revision changes. Next-tournament pre-entry shows approved apps, reserved places, available places, and its local start time.

Follow an app for **in-app** opening and 30-minute closing reminders. The scheduler deduplicates reminders per user, match, and event; it skips entrants in their own match and users who have voted. Unfollowing stops future reminders. `/notifications` has read/unread state and battle links. No email delivery or email jobs were added. `/collection` stores each signed-in user’s saved apps. Founders can reply to visible feedback on their own published projects; replies show a founder badge and create an in-app notification for the original commenter.

Founder dashboards link to private `/reports/<entry-id>` pages with round votes, results, period views/clicks and feedback, plus a downloadable JSON report. These figures are recorded browser/day events during the reporting period, not conversions or guaranteed attribution. Access requires the entry owner.

For bot challenges, set **both** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`, configuring the widget for the deployed hostname. Votes validate tokens on the server, including hostname and `vote` action. An incomplete configuration fails closed. Without configured keys, verified identity, final-vote uniqueness, rate limits, and network-pattern flags still apply. `VOTE_RISK_SALT` is a private stable salt; otherwise the service-role key provides it. Network identifiers are HMAC hashes, retained seven days. Four distinct voters sharing a match/network within ten minutes flag the votes for review without automatically invalidating them.

New projects automatically queue website screenshots. The existing protected `/api/cron` worker captures one queued project per run and uploads a PNG to the `product-media` bucket. Apply `supabase/storage.sql` and enable the scheduler. Linux deployments use bundled Chromium; set `SCREENSHOT_BROWSER_PATH` to an installed Chrome executable for local Windows capture. Rendering disables JavaScript, service workers, downloads, and non-GET requests. Every document and resource passes the DNS-pinned public-address fetcher, with request, byte and time limits. Captures show static website content; sites requiring JavaScript or blocking automated retrieval may have incomplete or unavailable previews. Capture failures retry up to three times and never block submission or payment.

## Stripe configuration

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

Rounds are start-inclusive and end-exclusive, using the database clock after locking. New editions run 24-hour quarterfinals, 24-hour semifinals and a 12-hour final: 60 hours of voting. The winner stays on the homepage for another 12 hours. When a bracket locks, the scheduler opens pre-entry for its successor, scheduled after the full 72-hour cycle; registration closes one hour before voting. Pre-entry uses the normal exclusive slots, one entry per founder, payment, review and refund rules. Incomplete editions move to the next daily start; no entrants or results are fabricated. Already locked/running editions preserve their published timing. Retries cannot create duplicate successors. The live tournament watch shows the active round, remaining days/hours/minutes/seconds and progress using server-provided timestamps. Server vote deadlines remain authoritative.

Cancelled published editions retain their identity and pricing. Finish paid refunds before rescheduling. If a bracket was already locked, rescheduling preserves its original eight entrants, frozen pitches, pairings, and tie priorities; those founders must be reviewed/reconfirmed. Registration never silently moves entrants to another edition.

## Promotion, sharing, and analytics

Confirmed apps receive permanent pages. Match pages generate downloadable PNG battle cards, native share links, and editable X drafts. Product, tournament, match, and champion URLs expose dynamic Open Graph images. Server-side graphics fetch logos only from the configured Supabase `product-media` bucket; external logos display in the browser and use initials in downloaded graphics to avoid unsafe server fetches. Upload logos to the managed bucket for full logo cards.

Champions receive permanent result pages and downloadable embeddable SVG badges. Admins prepare and save interviews, edit social drafts through X's composer, and mark promotion checklist tasks completed only after real fulfillment. Social posting and 12-hour spotlight pinning are manual; no messages or posts are sent automatically.

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

The recorded checks and any environment limitations are listed in `VALIDATION.md`. See `VALIDATION.md` and `artifacts/browser-checks.json`.

The database suite runs the actual schema/functions inside PGlite (embedded Postgres) with mocked Supabase auth tables. Provider tests use the Stripe SDK's actual signature verifier and controlled payment/refund mocks. PGlite validates SQL, invariants, admission races as queued concurrent requests, and idempotent commands. It does **not** reproduce multi-connection Postgres contention or hosted Supabase Auth/RLS deployment configuration. Before launch, repeat final-seat contention on your hosted Postgres with independent connections and test Stripe CLI delivery, refunds, GitHub/email login, uploads, and scheduled jobs with real test credentials.

Run Supabase database security/performance advisors after applying the migrations. RLS is enabled on every exposed application table; anonymous/authenticated roles cannot invoke privileged commands or mutate entries, prices, results, votes, or payment state. Server keys are imported through server-only modules. No live payments, hosted auth, storage, or production scheduler have been verified without credentials. The app is not deployed to summitwar.lol by this implementation.

Official integration references: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Stripe webhooks](https://docs.stripe.com/webhooks), [Checkout session creation](https://docs.stripe.com/api/checkout/sessions/create).
