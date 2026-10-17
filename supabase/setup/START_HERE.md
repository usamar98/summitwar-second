# SummitWar — Supabase setup

This package installs the database for the features currently implemented in SummitWar: eight-founder tournaments, 24/24/12-hour voting rounds, a 12-hour winner spotlight, pre-entry, single-use guest voting links, visitor counts, product pages, feedback, saves, in-app reminders, payment/refund records and six paid sponsor cards at $70/$50/$30 per side.

This release matches the features already implemented in the website. Additional growth features can be added with later migrations.

## 1. Install the database

For a **new, dedicated Supabase project**, open **SQL Editor → New query**, paste the entire contents of `01_install.sql`, and click **Run**. Run it as the project database owner (the SQL Editor's default `postgres` role).

The installer includes all nine project migrations, in order, in one transaction. It refuses to run if the public schema already contains application tables. It does not reset or delete an existing database. No sample founders, votes, winners or paid ads are inserted.

Next, run `02_storage.sql` in a separate SQL Editor query. It creates the public `product-media` bucket for screenshots and demos. Uploads use the protected app server; this file adds only a browser read policy. Images are limited to 5 MB by the app and demo videos to 30 MB.

**If this project already contains SummitWar tables:** use `EXISTING_DATABASE.md` instead of the full installer. Never run both the combined installer and all the individual migration files on the same database.

## 2. Connect the website

Copy `app.env.example` to `.env.local` in the website project. Fill in these values from your Supabase project's Connect/API Keys screens:

| Website setting | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your project's URL, such as `https://YOUR-PROJECT.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The publishable key (`sb_publishable_...`) |
| `SUPABASE_SERVICE_ROLE_KEY` | The server secret key (`sb_secret_...`); the existing variable name is retained. A legacy service-role key also works. |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally; your exact HTTPS website origin when deployed |

Keep the secret key in server environment settings. Do not put it in a `NEXT_PUBLIC_` variable or paste it into a shared file. Set the same variables in your hosting project's environment and restart/redeploy the website after changing them.

## 3. Enable founder/admin sign-in

Enable **GitHub** in Supabase **Authentication → Sign In / Providers**. Create a GitHub OAuth App with the callback URL shown by Supabase, normally `https://YOUR-PROJECT.supabase.co/auth/v1/callback`. Copy its Client ID and Client Secret into the GitHub provider settings.

In Supabase Authentication URL Configuration, set the Site URL to your deployed website origin and allow these application redirect URLs:

- `http://localhost:3000/auth/callback`
- `https://YOUR-WEBSITE/auth/callback`

These app URLs are different from the GitHub OAuth callback above. Founders and organizers use GitHub sign-in. Email magic links are optional; they are not needed for guest voting. The SQL files create no email delivery jobs.

Sign in to SummitWar once with your organizer's GitHub account. Find that account's **User UID** under Supabase Authentication → Users. In `03_admin.sql`, replace `PASTE_YOUR_AUTH_USER_UUID_HERE` with that UID and run the file. It assigns the organizer role to that existing account. It does not create a password or an Auth user.

## 4. Verify the installation

Run `04_verify.sql`. It is read-only and checks the required tables, RLS, server-only commands, private records, guest voting columns, schedule defaults, current prices and media bucket. A successful run returns `PASS: SummitWar database is installed` plus the six prices. It can be run again after deployment.

In the Supabase Dashboard, review the database Security and Performance Advisors after installation. The supplied local checks do not replace your hosted project's advisors or a hosted concurrency test.

## 5. Enable voting and payments

For guest voting, configure Cloudflare Turnstile for your website domains, then set `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` and a stable random `VOTER_COOKIE_SECRET` of at least 32 characters. Set `VOTE_RISK_SALT` to another stable private random value. Voting does not create an email account. Browser identity and bot checks reduce repeat voting; they are not proof of one human per vote.

For paid entries and sponsorships, set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Start with Stripe test keys. Configure a signed **snapshot** Stripe webhook at `https://YOUR-WEBSITE/api/stripe/webhook` for:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.expired`
- `charge.refunded`
- `charge.dispute.created`
- `payment_intent.payment_failed` (acknowledged without confirming an entry)

The first competition edition is free; later competition entries cost $5. Sponsor cards always use their separate $70/$50/$30 rates. Redirecting back from checkout does not confirm payment: the signed webhook does.

## 6. Turn on automatic tournament updates

Set a private random `CRON_SECRET` of at least 32 characters in the website's server environment. You can generate each secret locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Generate a separate value for each secret; keep the values out of source control.

After the website is available at its deployed HTTPS URL, enable **Supabase Cron (`pg_cron`)** and **`pg_net`** from the Dashboard's integrations/extensions screens. In Supabase **Vault**, create two named secrets:

| Vault name | Value |
| --- | --- |
| `summitwar_app_url` | Your deployed HTTPS origin, such as `https://YOUR-WEBSITE` |
| `summitwar_cron_secret` | Exactly the same value as the website's `CRON_SECRET` |

Run `05_scheduler.sql`. It checks those settings and installs two jobs: tournament transitions every minute, and protected app work every five minutes for screenshots/refund retries. Re-running it updates the same named jobs. Supabase's cloud scheduler cannot reach `localhost:3000` on your computer; configure this step with a deployed URL.

Inspect the jobs in the Supabase Cron dashboard. A successful HTTP enqueue alone does not prove a successful app response: check pg_net responses and app logs too. Live Stripe refunds, provider callbacks and hosted scheduling must be tested with your own configured services.

## 7. Start the first tournament

Open `/admin` while signed in as your organizer. Create a tournament draft with future registration/voting times, then publish it. The database assigns the edition number and entry price. Do not manually reset the edition counter. Review real submissions from `/admin`; the bracket needs eight approved, confirmed founders.

## Package contents

`01_install.sql` and the files in `migrations/` contain the same database changes. The individual files are for existing installations or the Supabase CLI, not extra steps after the combined installer. `manifest.json` lists SHA-256 checksums of the delivered files. None of the files contains a project key, payment key or real customer data.

To rebuild this package from the repository, run `node scripts/package-supabase.mjs`. To check it matches the current migrations, run `node scripts/package-supabase.mjs --check`.

Official references: [SQL tables](https://supabase.com/docs/guides/database/tables), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [GitHub sign-in](https://supabase.com/docs/guides/auth/social-login/auth-github), [Cron](https://supabase.com/docs/guides/cron/quickstart), [Vault](https://supabase.com/docs/guides/database/vault).
