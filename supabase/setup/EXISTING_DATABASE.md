# Updating an existing SummitWar database

Use the files in `migrations/` only for database changes you have not already applied. Their order is:

1. `20261011160707_summitwar.sql` — base tables, payments, tournament commands and access rules.
2. `20261011172940_simplify_submissions.sql` — simpler submissions, metadata limits and exclusive bracket places.
3. `20261011184518_visitor_presence.sql` — current browsers and all-time visits.
4. `20261011190335_daily_tournaments.sql` — automatic successor tournaments.
5. `20261011195958_community_features.sql` — follows, saves, replies, in-app reminders, screenshots and reports.
6. `20261012191709_extended_tournament_schedule.sql` — 24-hour quarterfinals, 24-hour semifinals, 12-hour final and 12-hour spotlight.
7. `20261015102148_guest_voting.sql` — email-free guest votes and single-use voting links.
8. `20261017101030_paid_promotions.sql` — six exclusive paid sponsor cards, payment verification and refunds.
9. `20261017104639_reset_promotion_prices.sql` — historical $70/$50/$30 prices, preserving earlier bookings.
10. `20261028161134_free_entries_sponsor_takeovers.sql` — permanent free entry, $100 sponsor cards and safe paid takeovers.
11. `20261028182344_sponsor_bids_and_edition_expiry.sql` — immutable per-card bids, minimum $1 takeover increments, custom higher bids and expiry before the next tournament.
12. `20261029132229_harden_guest_voting.sql` — one guest vote per network/match, verified GitHub identity deduplication, network-bound links, request limits and private network claims. Grants the server only the Auth identity columns needed for voting; it does not expose emails or identity data.

If you previously ran only the first six migrations, start at number 7. If you have nine migrations, apply 10–12. If you have ten, apply 11–12. If the first eleven are installed, apply only migration 12, then run `04_verify.sql`. If all twelve are installed, run verification without replaying migrations. Migration files are one-time changes. Preserve existing data and take a backup before updating.

If you do not know which files were applied, review your SQL Editor history and run `04_verify.sql`. A verification error identifies a missing object or setting; it is not authorization to delete existing tables. Compare the migration contents with the existing database before choosing a starting point. Do not guess by running all twelve again.

For installations managed by the Supabase CLI, keep using the repository's `supabase/migrations/` folder and its tracked migration history. Use `supabase migration list` and the normal `supabase db push` workflow after linking the correct project. This download also includes those same migration files.

The combined `01_install.sql` is a SQL Editor shortcut for a new project. It does not write Supabase CLI migration-history records. If you later move a SQL Editor installation to the CLI, reconcile the already-applied migration history using Supabase's documented migration-repair workflow before using `db push`; do not replay the baseline. See [database migrations](https://supabase.com/docs/guides/deployment/database-migrations).

After the missing database changes are installed, use the storage, admin and scheduler steps in `START_HERE.md`. Keep existing admin assignments and Vault secrets. The admin script is safe to repeat for the same account; the storage script adds the named read policy only when absent; the scheduler updates its two named jobs.
