# Completed local checks

## Stripe checkout completion update

- Full regression suite passed: **108 tests in 21 files**. New checks cover exact $5 entry checkout, free first-edition rejection of checkout, owner filtering, existing-session reuse, a safe expiry margin, raw webhook signatures, delayed success, verified intent metadata, retryable provider/database failures, private uncached status queries, review/refund/dispute states, and a new reservation after an earlier refund.
- The final production build passed, including TypeScript and every route. A OneDrive permission issue on generated `.next` files was resolved by clearing only that verified build cache before rebuilding.
- Ten-page desktop/mobile browser smoke checks passed. Added runtime checks confirm private payment status returns 401 with `private, no-store`, unsigned webhook requests cannot fulfill anything, checkout results redirect to sign-in, and existing promotion return URLs reach the new confirmation page. The checks handle Next.js streaming redirects as documented by the installed version. No browser page errors or mobile overflow were found.
- Both Stripe secrets are required before new checkout is enabled. Entry and promotion returns share an owner-only confirmation screen, poll pending database status every three seconds for up to two minutes, and support resuming an unexpired reservation. Amounts and confirmation come from trusted database records; URL parameters cannot mark a booking paid.
- No new database migration is required. The Supabase download and its checksum manifest were refreshed for the additional supported Stripe event.
- Provider tests use the actual Stripe SDK's signature verifier and controlled API responses. Local settings remain unconfigured. The verified Production return URL is configured as `https://summitwar.lol`; the user's five Stripe/Supabase connection values and signed endpoint still require configuration. No real payment, provider refund or authenticated production purchase was performed.
- `STRIPE_SETUP.md` contains the Vercel settings, signed webhook destination, supported events, test purchase steps and local forwarding instructions. `npm run payments:check -- --connect` checks configured services using read-only requests and prints no secret values.

## Supabase installation package

- `scripts/package-supabase.mjs --check` confirms the delivered SQL and manifest match all nine current migrations. The combined installer contains **33 protected application tables** and **39 required server command names**. SHA-256 checksums cover the delivered setup files and individual migrations.
- `scripts/verify-supabase-package.mjs` passed a fresh install of the actual combined SQL in isolated embedded Postgres. It verified safe refusal on repeat installation, repeat-safe media setup, supported prices/defaults, RLS/privileges, detection of exposed votes or disabled RLS, and admin assignment restricted to an existing Auth user.
- The installed database passed organizer publication, eight-founder admission and idempotent resubmission, 24-hour quarterfinal creation, single-use guest voting, a $300 six-card sponsor booking, exclusive ownership, payment fulfillment, and browser-role denial of private data/commands/media uploads.
- The scheduler template rejects missing secrets and local/non-HTTPS origins. Two repeat-safe jobs and their stored SQL were verified against simulated Cron/Vault/HTTP APIs. No live HTTP delivery or hosted scheduler run is claimed.
- Supabase's platform Auth/Storage/Vault/Cron APIs are simulated in the local harness, and its pgcrypto extension statement is omitted there (UUID generation uses Postgres's built-in function). Hosted advisors, OAuth, Storage API access, independent-connection races and Stripe charge/refund settlement require the user's configured project.
- The ZIP contains the installer, storage/admin/verification/scheduler files, nine ordered migrations, blank app environment template, checksum manifest, fresh setup guide and existing-installation guide. No production keys or real records are included.

```powershell
node scripts/package-supabase.mjs --check
node --liftoff-only --no-wasm-tier-up --wasm-num-compilation-tasks=1 --max-old-space-size=128 scripts/verify-supabase-package.mjs
```

## Sponsor dofollow update

- All six paid promotion cards share a direct outbound link with `rel="noopener noreferrer"`. The link is followable and retains secure new-tab behavior. Cards remain visibly labelled Promoted.
- Production build, including TypeScript and all route generation, passed. This change requires no additional database migration.

## Promotion pricing reset

- Full regression suite passed: **86 tests in 16 files**, including the new $70/$50/$30 prices, $300 combined total, historical checkout pricing and rejection of missing/unsupported price versions.
- Production build (including TypeScript) and desktop/mobile browser checks passed. Both hero columns show the updated prices, purchase terms show $300 for all six, and mobile layouts have no horizontal overflow or page errors. Updated screenshots are in `artifacts/promotions-*`.
- `scripts/verify-promotions.mjs` applied the pricing migration over an existing pending booking in embedded Postgres. Its original amount/version and payment contract were preserved; new reservations use version 2 and the updated amounts. Exclusivity, payment replay/refunds, expiry and private access checks also passed.
- Apply `20261017104639_reset_promotion_prices.sql` after the paid-promotions migration and before deploying this update. Hosted database changes and live payment settlement require deployment credentials.

## Winner hero and paid promotion update

- Full regression suite passed: **83 tests in 16 files**. Added checks cover exact placement prices, multi-card totals, Stripe checkout ownership/idempotency, verified payment amounts/metadata, refund retries, and preserving the current spotlight when the next bracket locks.
- Standalone TypeScript and the production build passed.
- `scripts/verify-promotions.mjs` applied all eight SQL sources in embedded Postgres and passed checks for all six cards owned by one buyer, atomic slot claims, canonical prices, hidden unpaid placements, duplicate payment events, extra captures, late-payment conflicts/refunds, refund-before-completion signals, expiry without a visitor/cron dependency, moderation/cancellation refunds, revision changes, and private-table/RPC access.
- Desktop/mobile promotion layout checks verify the center winner, three cards on each side, $100/$700/$50 pricing per side, competition as the second section, six-card purchase selection, $1,700 combined price, mobile order/overflow and no page errors. Current screenshots and results are in `artifacts/promotions-*`.
- Public checks use honest empty/unconfigured states. No fabricated real winner, advertiser, charge or payment confirmation was introduced. Hosted independent-connection races, Stripe test/live charges and refund settlement still require deployment credentials.
- Apply `20261017101030_paid_promotions.sql` after the earlier migrations. Existing Stripe webhook credentials and scheduler are reused. Promotion expiry includes the winner spotlight. The server filters expired ads immediately; browser expiry also removes them, and the scheduler releases reservations and queues cancellation refunds.

```powershell
node --liftoff-only --no-wasm-tier-up --wasm-num-compilation-tasks=1 --max-old-space-size=128 scripts/verify-promotions.mjs
node scripts/promotions-browser.mjs
```

## Email-free guest voting update

- Full Vitest regression suite passed: **74 tests in 13 files**. This includes signed browser identity, token/handle validation, guest API checks, bot verification, and existing payment/database/community behavior.
- Production build passed with TypeScript and all routes, including `/vote`, `/api/vote` and `/api/vote-link`.
- `scripts/verify-guest-voting.mjs` applied all seven schema sources in actual embedded Postgres. It checked no new auth accounts, browser binding, token rotation/expiry/reuse, transactional final votes, malformed handles/contenders, founder/account restrictions, score integration, network flags, mint limits, deadlines, anonymous/authenticated table/RPC denial, and privacy cleanup without deleting ballots.
- Existing community checks passed with all seven schema sources. Embedded Postgres queues concurrent requests; hosted independent-connection contention remains a deployment check.
- Nine-page desktop/mobile smoke checks passed. The separate guest browser test uses controlled API fixtures for missing links, hash navigation, optional X input, no email field, final confirmation, both choices locking, reload without resubmission, mobile layout and Escape. It does not claim a live CAPTCHA or hosted database flow.
- Updated vote-dialog screenshots and the fixture scope are saved in `artifacts/guest-voting-browser.json`.
- Real Turnstile keys, deployed RLS and hosted vote-link issuance remain unverified because this workspace has no `.env.local` credentials. Apply `20261015102148_guest_voting.sql` and configure both Turnstile keys plus a stable `VOTER_COOKIE_SECRET` before enabling live guest voting. Founder/admin authentication remains protected.

```powershell
node --liftoff-only --no-wasm-tier-up --wasm-num-compilation-tasks=1 --max-old-space-size=128 scripts/verify-guest-voting.mjs
node scripts/guest-voting-browser.mjs
```

## Extended tournament schedule update

- Production build and standalone TypeScript checking passed.
- Three clock tests passed for exact round transitions, registration/completed states, and published legacy deadlines.
- `scripts/verify-extended.mjs` passed actual embedded Postgres checks for 24/24/12-hour rounds, the 12-hour champion spotlight, successor start at 72 hours, idempotent scheduler retries, paid pre-entry, exclusive slot reservations and anonymous access denial.
- Existing community database checks passed with all six SQL sources, including the new migration.
- Eight-page desktop/mobile smoke checks passed with the new 24/24/12-hour labels. The watch and pre-entry section were visually inspected; mobile overflow, drawer behavior and page error checks passed.
- Hosted deployment must apply `20261012191709_extended_tournament_schedule.sql`. Existing locked/running editions preserve their original schedule; new/unlocked editions use the new schedule. No hosted services or live payments were exercised.

```powershell
node --liftoff-only --no-wasm-tier-up --wasm-num-compilation-tasks=1 --max-old-space-size=128 scripts/verify-extended.mjs
```

## Community feature update

- Standalone TypeScript checking passed after the update.
- Seven focused tests passed for participant colors, screenshot resource restrictions/cleanup, and vote challenge/network hashing.
- `scripts/verify-community.mjs` applied all five SQL sources in embedded Postgres and passed checks for ownership, saves/follows, founder replies, opening/closing reminder deduplication, unfollowing, final votes, network risk flags, live revisions, screenshot leases, and access restrictions.
- Full production build passed, including TypeScript and all route generation. Earlier attempts failed due host memory; the successful run used a 128 MB Node heap and one Go compiler processor after stopping the development server.
- Full Vitest database execution remains limited by host memory. The separate embedded Postgres runner and seven focused tests passed; a passing full regression run is not claimed for this update.
- Production desktop/mobile smoke checks passed on eight pages. Added checks verify the enlarged bracket, eight distinct place colors, and tomorrow’s lineup. Updated screenshots in `artifacts/` show the current design. Drawer behavior, mobile overflow and page error checks also passed.
- Hosted screenshot upload, Turnstile, and scheduled in-app notifications still require configured services and deployment validation. No new email delivery was implemented.

Low-memory database runner:

```powershell
node --liftoff-only --no-wasm-tier-up --wasm-num-compilation-tasks=1 --max-old-space-size=128 scripts/verify-community.mjs
```

## Earlier daily-tournament checks

- Production Next.js build passed, including TypeScript checking and all application/image/API routes.
- 50 tests passed: 24 database/rules checks, 7 Stripe signature/provider/refund checks, 8 website metadata/security checks, 3 participant progression checks, 4 visitor-presence checks, and 4 daily scheduling checks.
- Browser smoke checks passed on 8 pages at desktop 1440×1000 and mobile 390×844.
- Verified the balanced bracket, brand-only header, war favicon, visitor indicators, five-field submission sidebar at the right desktop edge, selected place, Escape and focus restoration, background scroll lock, reopening with a different place, honest empty states, anonymous dashboard redirect, protected scheduler, origin checks, unsigned webhook rejection, disabled unconfigured submissions, and no page JavaScript errors.
- Homepage and rules had no horizontal overflow on mobile. Reduced-motion mode was exercised on the application page.

Earlier screenshots and machine-readable results are in `artifacts/`.

## Still requires configured services

Hosted Supabase auth (email/GitHub), deployed RLS/advisors, Storage upload, Stripe test/live checkout and webhook delivery, hosted independent-connection capacity contention, Cron execution, and actual refund settlement have not been verified. Setup is in `README.md` and `.env.example`. No deployment or real payment was performed.

Browser tests used installed headless Chrome with a temporary profile on D: because the app browser tool could not initialize on a full C: drive. Build temporary files also used D:. No existing user files were removed.
