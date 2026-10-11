# Completed local checks

- Production Next.js build passed, including TypeScript checking and all application/image/API routes.
- 46 tests passed: 24 database/rules tests, 7 Stripe signature/provider/refund tests, 8 website metadata/security tests, 3 participant progression tests, and 4 visitor-presence tests.
- Browser smoke checks passed on 8 pages at desktop 1440×1000 and mobile 390×844.
- Verified the balanced bracket, brand-only header, war favicon, visitor indicators, five-field submission sidebar at the right desktop edge, selected place, Escape and focus restoration, background scroll lock, reopening with a different place, honest empty states, anonymous dashboard redirect, protected scheduler, origin checks, unsigned webhook rejection, disabled unconfigured submissions, and no page JavaScript errors.
- Homepage and rules had no horizontal overflow on mobile. Reduced-motion mode was exercised on the application page.

Screenshots and machine-readable results are in `artifacts/`. The local server runs at http://localhost:3000.

## Still requires configured services

Hosted Supabase auth (email/GitHub), deployed RLS/advisors, Storage upload, Stripe test/live checkout and webhook delivery, hosted independent-connection capacity contention, Cron execution, and actual refund settlement have not been verified. Setup is in `README.md` and `.env.example`. No deployment or real payment was performed.

Browser tests used installed headless Chrome with a temporary profile on D: because the app browser tool could not initialize on a full C: drive. Build temporary files also used D:. No existing user files were removed.
