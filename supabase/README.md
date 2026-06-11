# Supabase — account-deletion backend

This folder holds the server-side piece of the Apple-required "Delete my account" feature.

## What's here
- `delete-account/index.ts` — the Edge Function the app calls. It anonymizes the
  user's shared rounds, deletes their personal rows, revokes their Apple token (if
  they used Sign in with Apple), and deletes their auth account.
- `01_account_deletion.sql` — one small column the function needs.

## One-time setup (you can do this from your PC — no Mac needed)

1. **Install the Supabase CLI** (Windows): https://supabase.com/docs/guides/cli
   or run `npx supabase` (needs Node). Then `supabase login`.
2. **Link your project:** `supabase link --project-ref ojclesuwxhtzvrymqrwg`
3. **Run the SQL:** open the Supabase dashboard → SQL Editor → paste
   `01_account_deletion.sql` → Run.
4. **Deploy the function:** from this folder run
   `supabase functions deploy delete-account`
5. **Set secrets:**
   ```
   supabase secrets set SERVICE_ROLE_KEY=<your service_role key from Project Settings > API>
   ```
   Apple token revocation (needed because we offer Sign in with Apple — set these
   after you create the Apple key in step 6 of the main walkthrough):
   ```
   supabase secrets set APPLE_CLIENT_ID=com.simplisticfishing.badgolf
   supabase secrets set APPLE_TEAM_ID=<your 10-char Team ID>
   supabase secrets set APPLE_KEY_ID=<the Key ID of your Apple Sign-in key>
   supabase secrets set APPLE_PRIVATE_KEY="$(cat AuthKey_XXXXXXXXXX.p8)"
   ```

## Test it
Sign in on a throwaway account in the app, tap **Delete my account**, confirm.
The function returns `{ ok: true, report: {...} }` and the account disappears from
Supabase → Authentication → Users.

> If the `games` table uses different column names than `user_id`, adjust the
> `.eq("user_id", uid)` lines in `index.ts`. The function is written defensively
> (each table is wrapped in try/catch) so a name mismatch won't break the whole
> delete — but fix the names so anonymization actually runs.
