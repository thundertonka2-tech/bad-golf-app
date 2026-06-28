# Notifications — what TYLER does from here (Supabase + Apple portal)

App build **v2026.11.332**. All app code is wired and is a **safe no-op until the
backend below is live** — so push "lights up" the moment you finish these steps.
Everything here is the Supabase dashboard, the SQL editor, the Supabase CLI, and the
developer.apple.com website. **No Mac/Xcode needed for any of this** — the only
Mac/Xcode work is Renee's one-time native setup (see `HANDOFF_Renee_Push_Mac_Steps.md`).

Bundle ID (APNs topic): **com.simplisticfishing.badgolf**

---

## Step 1 — Apple Developer website (no Xcode)
At https://developer.apple.com → Certificates, IDs & Profiles:
1. **Identifiers → your App ID** (`com.simplisticfishing.badgolf`) → enable the
   **Push Notifications** capability → Save.
2. **Keys → +** → name it "Bad Golf APNs" → tick **Apple Push Notifications service
   (APNs)** → Continue → Register → **Download the `.p8`** (you only get to download
   once). Note the **Key ID** on that page.
3. Note your **Team ID** (top-right of the portal / Membership page).

You now have: the `.p8` file contents, **Key ID**, **Team ID**, **Bundle ID**.

## Step 2 — SQL (run once each in the Supabase SQL editor)
- `push_tokens.sql` — device tokens (from the Phase B package, if not already run).
- `notif_prefs.sql` — per-user opt-outs (default ON).
- `handicap_snapshots.sql` — monthly index snapshots the app writes.

## Step 3 — Edge function secrets (Supabase → Project Settings → Edge Functions → Secrets)
Set these (the SUPABASE_* ones are usually auto-present):
```
APNS_KEY_ID     = <Key ID from Step 1>
APNS_TEAM_ID    = <Team ID from Step 1>
APNS_BUNDLE_ID  = com.simplisticfishing.badgolf
APNS_P8         = <paste the FULL .p8 text, including the BEGIN/END lines>
```

## Step 4 — Deploy the edge functions (Supabase CLI)
```
supabase functions deploy send-push
supabase functions deploy notify-admins-remap
supabase functions deploy monthly-handicap-push
```
- `send-push` — the generic APNs sender everything routes through. Honors
  `notif_prefs` by `data.type`, sets `apns-collapse-id`, deletes tokens on HTTP 410.
- `notify-admins-remap` — the app calls this after a re-map request; it resolves
  admins and forwards to `send-push`.
- `monthly-handicap-push` — the monthly cron job (Step 5).
- Keep `send-wager-push` deployed too (the existing wager path still uses it).

## Step 5 — Schedule the monthly handicap cron (SQL editor, pg_cron)
Runs ~9am on the 1st of each month. Replace `<PROJECT-REF>` and `<SERVICE_ROLE_KEY>`:
```sql
select cron.schedule(
  'monthly-handicap-push',
  '0 9 1 * *',
  $$ select net.http_post(
       url := 'https://<PROJECT-REF>.functions.supabase.co/monthly-handicap-push',
       headers := jsonb_build_object(
         'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
         'Content-Type', 'application/json'),
       body := '{}'::jsonb
     ); $$
);
```
(Requires the `pg_cron` + `pg_net` extensions — enable them under Database → Extensions.)

## Step 6 (optional hardening) — DB webhook for admin re-map
The app already fire-and-forgets `notify-admins-remap` after a re-map request, so this
is optional. For a fully server-trusted path, add a Database Webhook on
`course_requests` INSERT (filter `type = remap`) → call the `notify-admins-remap`
function. It accepts the webhook `{ record }` shape too.

---

## Notification → type → opt-out column
| # | Notification | data.type | notif_prefs column |
|---|---|---|---|
| 1 | Friend request | friend_request | (always sent) |
| 2 | Friend starts round | round_start | friend_starts |
| 3 | Friend completes round | round_complete | friend_completes |
| 4 | Wager request | wager | wager_requests |
| 5 | Monthly handicap | handicap | monthly_handicap |
| 6 | Admin re-map | remap | admin_remap |

## What's required before any push actually delivers
1. These Supabase + Apple steps (you, here).
2. Renee's one-time Mac/Xcode native setup — see `HANDOFF_Renee_Push_Mac_Steps.md`.
Until #2 ships, devices won't have push tokens yet, so sends just find "no tokens"
and no-op. The in-app cards, settings toggles, and the "turn on notifications" intro
all work today regardless.
