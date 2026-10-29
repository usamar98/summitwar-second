# SummitWar

A Next.js 16 / TypeScript / Tailwind 4 application with Supabase Auth, Postgres, Storage, and one-time Stripe Checkout payments. The repository started empty. No real records, metrics, or paid entrants are fabricated.

## Completed tournament preview

Open [`/demo`](https://summitwar.lol/demo) for eight fictional entrants, a sample champion and six protected sponsor cards at $100, $200 and $300. Quarterfinal results release the $100 cards; semifinal results release $200 cards; the next tournament clears every card. Click a released card to preview a new fixed-price protection plan. Reset restores the original six sponsors. Winner pages, links, badges, reports and social posts are visual examples. The demo creates no database records, checkout sessions, payments or social posts.

## Run locally

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open http://localhost:3000. Without credentials the public design, rules, empty tournament, and application form render; authentication and mutations remain unavailable. `DEMO_MODE=true` only adds an explicit local preview banner and is ignored in production. Database test fixtures are confined to the isolated test database; the separate `/demo` page uses labeled in-memory visual examples.

## Supabase setup

For a ready-to-paste SQL Editor installation, use [`supabase/setup/START_HERE.md`](supabase/setup/START_HERE.md). The complete installer, storage setup, admin template, read-only verification and scheduler configuration are also packaged in [`deliverables/SummitWar-Supabase-Setup.zip`](deliverables/SummitWar-Supabase-Setup.zip). Fresh projects use the combined installer; existing projects apply only missing migrations as described in the included upgrade guide. Rebuild the SQL package with `npm run db:package` and verify it with `node scripts/package-supabase.mjs --check`.

1. Create a Supabase project. Set its URL, publishable key, and server-only service role key in `.env.local`.
2. Apply the tracked `supabase/migrations/` files in filename order (currently thirteen), or use `supabase/setup/01_install.sql` for a fresh empty Supabase project. Existing databases apply only missing migrations, following `supabase/setup/EXISTING_DATABASE.md`; never replay the baseline or the legacy source SQL files. The latest migration is `20261029144206_protected_sponsor_plans.sql`.
3. Apply `supabase/storage.sql` to create the public `product-media` bucket. Only the authenticated server upload route writes to it; browser roles receive read access. Images are limited to 5 MB and video demos to 30 MB. The route checks MIME types and file signatures. Demo duration is validated locally and reviewed by the organizer before approval. SVG uploads and arbitrary embeds are excluded.
4. For founder/admin accounts, enable GitHub OAuth and optionally email magic links in Supabase Auth. Voting never calls email authentication. Set Site URL to your application origin and allow `/auth/callback`. The default PKCE email link works with the callback code. If customizing the template to use token hashes, use `/auth/callback?token_hash={{ .TokenHash }}`. Keep email confirmation enabled and configure provider abuse/rate limits.
5. Sign in once and assign the organizer role using trusted SQL:

```sql
insert into public.admin_roles(user_id) values ('YOUR-AUTH-USER-UUID');
```

Admins are checked against this table, never user-editable metadata. In `/admin`, create a draft, then publish it. The database assigns immutable edition numbers at publication: global edition #1 is free; all later editions cost 500 cents USD. Draft deletion or cancellation cannot reset the edition counter. Do not manually reset that counter.

## Submission and tournament experience

The header contains only the SummitWar brand with its shield and crossed swords logo, also used as the favicon. Submission links open a right-hand modal sidebar, preserve the chosen place, trap keyboard focus, and close with Escape or the close button. Direct `/submit` URLs remain available. The sidebar loads the signed-in user's application context through a private, uncached endpoint.

Below the header, green shows browsers seen within 90 seconds; red shows recorded visits since tracking began. Visible pages send a heartbeat every 30 seconds. Visits deduplicate tabs through an HttpOnly browser cookie, with a new visit after 30 minutes of inactivity. Bot user agents are excluded. Browser identifiers are hashed, protected from public access, and removed after 90 days without erasing aggregate totals. Counts describe browsers and visits, not verified voters or unique people. Unconfigured or unavailable tracking shows a dash rather than a fabricated total. Apply the visitor migration before enabling this on a configured backend.

The homepage opens with a centered community-winner hero surrounded by six paid promotion cards. The balanced tournament bracket is the second section. Empty places link to submission; occupied places cannot be claimed twice. Eight founders can enter one app each. Submission asks for website, name, category, founder and optional X handle. The server fetches the website tagline and favicon, validates public DNS and every redirect, pins socket DNS, and bounds request time and response size. Metadata preview lookups are account rate limited. Missing metadata is shown honestly.

Tournament entry is permanently free in every edition, including pre-entry. Submitting reserves a specific place until registration closes, and organizer review is required before publishing or voting. Slot claims and payments use tournament row locks; a delayed payment cannot take another founder’s occupied place. Participant rows show the active round and valid votes, progressing from eight apps to four, two, then the champion. The rewards comparison below the tournament explains the benefits. Only recorded champions receive permanent standalone startup pages with website links; other participant links open their battle or tournament results. Winner eligibility is enforced on startup pages, metadata and product share images from the champion relationship, not approval or ownership alone. Winner startup/champion pages render a direct, followable website anchor with `rel="noopener noreferrer"`; click tracking uses a separate same-origin request and does not replace the destination with a tracking redirect. Voters can cast a final vote without signing in or entering email. Signed-in founders cannot vote in their own match.

## Community features

The enlarged bracket gives each place a distinct color that follows its entrant through subsequent rounds. The tournament and match pages check score revisions every three seconds while visible and refresh their server-rendered content only when the revision changes. Next-tournament pre-entry shows approved apps, reserved places, available places, and its local start time.

Follow an app for **in-app** opening and 30-minute closing reminders. The scheduler deduplicates reminders per user, match, and event; it skips entrants in their own match and users who have voted. Unfollowing stops future reminders. `/notifications` has read/unread state and battle links. No email delivery or email jobs were added. `/collection` stores each signed-in user’s saved apps. Founders can reply to visible feedback on their own published projects; replies show a founder badge and create an in-app notification for the original commenter.

Founder dashboards link to private `/reports/<entry-id>` pages with round votes, results, period views/clicks and feedback, plus a downloadable JSON report. These figures are recorded browser/day events during the reporting period, not conversions or guaranteed attribution. Access requires the entry owner.

For bot challenges, set **both** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`, configuring the widget for the deployed hostname. Votes validate tokens on the server, including hostname and `vote` action. An incomplete configuration fails closed. Guest link issuance requires both configured keys and a valid server-verified challenge; it fails closed without verification. `VOTE_RISK_SALT` is a private stable salt; otherwise the service-role key provides it. Network identifiers are HMAC hashes, retained seven days. Four distinct voters sharing a match/network within ten minutes flag the votes for review without automatically invalidating them.

New projects automatically queue website screenshots. The existing protected `/api/cron` worker captures one queued project per run and uploads a PNG to the `product-media` bucket. Apply `supabase/storage.sql` and enable the scheduler. Linux deployments use bundled Chromium; set `SCREENSHOT_BROWSER_PATH` to an installed Chrome executable for local Windows capture. Rendering disables JavaScript, service workers, downloads, and non-GET requests. Every document and resource passes the DNS-pinned public-address fetcher, with request, byte and time limits. Captures show static website content; sites requiring JavaScript or blocking automated retrieval may have incomplete or unavailable previews. Capture failures retry up to three times and never block submission or payment.

## Stripe configuration

For the Vercel account setup and complete checkout test steps, follow [`STRIPE_SETUP.md`](STRIPE_SETUP.md). `npm run payments:check` reports missing settings without showing values; `npm run payments:check -- --connect` additionally makes read-only Stripe/Supabase connection checks. Hosted checkout needs both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. `/checkout` displays private, verified entry or promotion status and polls pending results for up to two minutes; cancellation can resume the same reservation. This update uses the existing database migration package.

Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` using test credentials first. The installed SDK uses Stripe's current `allowed_payment_method_types: ['card']` filter; Adaptive Pricing is disabled to preserve the exact USD amount. Enable card payments in the Stripe dashboard.

Register a **snapshot** webhook destination at `/api/stripe/webhook` for:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.expired`
- `charge.refunded`
- `charge.dispute.created`
- `payment_intent.payment_failed` (acknowledged; never fulfills an entry)

For local forwarding:

```powershell
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the listener's signing secret to your local environment. Original request bytes are signature-verified. The handler retrieves the actual Checkout Session and checks paid status, mode, internal metadata, expected amount, currency, registration status, and capacity. Redirects never confirm payment. Sessions are idempotent per reservation; duplicate delivery is recorded transactionally. Delayed and duplicate successful payments without an eligible seat enter the durable refund queue. An expired event retrieves the current session before releasing a seat, preventing stale events from undoing completion.

Approval allocates a reservation lasting up to **60 minutes**, capped at registration close. At least 31 minutes of registration time must remain at approval. Start a new checkout while at least 31 minutes remain on the displayed reservation, allowing a margin above Stripe’s 30-minute minimum. A started valid session is reused through expiry. If that creation window is missed, the dashboard explains it and the organizer can reapprove after expiry; the scheduler releases abandoned seats. This deliberately does not extend reservations silently. Expired, rejected, or waitlisted applicants are not charged. Failed card attempts do not fulfill an entry; Stripe permits a retry during the same session.

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

Views and outbound clicks are deduplicated per browser cookie, product, action, and UTC day. Basic bot user agents are excluded. Metrics mean recorded events, **not** unique people, signups, or sales. Guest voting uses network-bound single-use grants, a guest network allowance, stable GitHub identities for shared Wi-Fi, request limits and the admin review queue. This reduces abuse without establishing one vote per person.

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

## Email-free guest voting

Visitors complete Turnstile, create a personal single-use link and confirm a final choice. Each match allows one guest ballot per public network. Incognito, cleared cookies and other browsers on that network cannot create another guest ballot. Additional voters sharing Wi-Fi can verify with GitHub, with one ballot per stable GitHub identity/match and per browser/match. A GitHub vote also consumes that network's guest allowance, so logging out does not open another guest slot. Optional X handles remain unverified labels.

Production trusts only Vercel's platform-supplied x-vercel-forwarded-for header and rejects missing or ambiguous addresses. IPv4 and IPv4-mapped IPv6 are normalized; IPv6 privacy addresses share a /64 bucket. A stable private **VOTE_RISK_SALT** of at least 32 characters (service-role fallback) HMAC-hashes the network before storage. Raw addresses are not stored in voting tables. Do not rotate the salt during an active tournament. Non-Vercel production hosting needs a deliberately implemented trusted-proxy adapter; it cannot silently fall back to browser identity. Development loopback uses a local network bucket.

The **VOTER_COOKIE_SECRET** signs a random HttpOnly browser identity. Link tokens have 256 bits of entropy and only their SHA-256 hashes are stored. Tokens stay in the URL fragment, expire after ten minutes or match close, and bind to the issuing browser, network and account context. Opening a link never submits a vote. Creating a fresh link revokes the old one. Network/account changes require a new link. Private database locks and unique constraints make token consumption and ballot insertion atomic, including competing guest browsers.

Request quota runs in a separate database transaction before Turnstile or ballot processing: 20 link attempts per network/ten-minute window and 30 cast attempts per network/minute. Failed challenges and rejected ballots consume this quota too. Successful link issuance keeps the existing 20-per-ten-minute limit. Four browsers voting on a match/network in ten minutes flag their votes for organizer review; flags do not automatically invalidate ballots. Review must happen before the result freezes.

GitHub verification uses the actual Supabase Auth identity, not an editable profile or typed X handle. The server receives column-only read access to auth.users.id and auth.identities.user_id/provider/provider_id; no email or identity_data access is added. A private HttpOnly ten-minute return cookie brings the voter back to a validated internal match after the existing OAuth callback, without changing the callback allowlist or sending emails. The voter login mode shows GitHub only.

Apply migration 20261029132229_harden_guest_voting after the earlier eleven. Network claims survive until seven days after match close, so cleanup cannot reopen an active guest allowance. Old vote network hashes clear after seven days; expired links and request counters clear after a day. Stable GitHub identity keys and voter hashes remain in private ballot records. Existing links without network context need to be recreated.

These controls reduce repeat voting; they do not prove one person per vote. VPNs, changed networks and multiple GitHub accounts can evade identity limits, and anonymous and authenticated identities cannot always be linked to the same person. No device fingerprint is collected. The new SQL and route tests use isolated PostgreSQL and mocked provider responses, without hosted QA ballots.

## Paid promotion cards

The homepage opens with a centered community winner and three promotion cards on each side. The competition is the second section. Empty winner states never invent a champion. Promotions carry a Promoted disclosure and cannot buy votes or the central winner position.

Sponsor prices are fixed per card: **$100 through all quarterfinal results**, **$200 through all semifinal results**, or **$300 until the next tournament starts**, including the final and winner spotlight. A buyer can choose any available cards, including all six ($600, $1,200 or $1,800). A paid card cannot be replaced during its purchased period. Shorter plans release only when every result in the corresponding round is finalized, even if processing is late. Released cards can be booked for a remaining period. Client amounts and old bidding requests are rejected; SQL derives exact cents from the selected plan under a tournament lock. Plan, selected cards and recorded amounts are immutable.

After earlier migrations, apply `20261029144206_protected_sponsor_plans.sql`. New purchases use pricing version 5 and a recorded protection plan. Versions 1–4 keep their historical amounts for payment and refund handling. Verified payments cannot displace protected purchases; failed placement, stale overlapping payments and payments arriving after a purchased period are queued for refund. Sponsor links remain direct followable links with `rel="noopener noreferrer"`, visibly labelled Promoted.

Apply the paid-promotions migration after guest voting. Existing Stripe keys, snapshot webhook and protected scheduler are reused. No additional email jobs or subscriptions are added. Booking at /promote reserves the entire selection atomically for up to 60 minutes. New checkout needs at least 31 minutes remaining because Stripe requires a minimum 30-minute session. Confirmation redirects do not publish anything. Signed webhooks retrieve the actual session and payment intent and verify amount, currency, metadata and slot ownership before publication. Late captures that lose any selected slot refund the entire purchase. Duplicate successful captures have separate refund records.

A placement begins after verified payment and lasts through its purchased milestone. Whole-tournament sponsors stay until the next published tournament starts, even if registration is postponed or no successor has been published yet. PostgreSQL uses an unbounded internal deadline in that last case; UI copy shows the scope instead of a fabricated date, and Checkout still expires within its finite reservation. Server inventory enforces protection and release independently of cron; the browser also hides all old placements at a known successor start. Disputes, full refunds, cancellation and organizer removal retain existing refund handling. Ordinary expiry does not trigger a refund.

Buyers see their orders and resume pending checkout in /promote and the founder dashboard. Admins can remove promotions with an audit reason, queuing paid purchases for refund. All order and payment tables use RLS and deny direct public/browser access. Run hosted Supabase advisors and actual Stripe test payments/refunds before launch; local checks use embedded Postgres and controlled provider responses.

Official payment reference: [Stripe Checkout session creation](https://docs.stripe.com/api/checkout/sessions/create).
