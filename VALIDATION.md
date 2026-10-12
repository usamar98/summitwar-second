# Completed local checks

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
