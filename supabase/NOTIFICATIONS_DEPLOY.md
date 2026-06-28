# Bad Golf — Notifications backend deploy (for Renee)

Built in app build **v2026.11.332**. The app code is already wired and is **inert
(safe no-op)** until these backend pieces are deployed — so the web/iOS build can
ship now and push "lights up" the moment this is live. All six notifications run
through ONE generic sender, `send-push`.

## Prereqs (Tyler — Apple side, gates ALL push)
Same as the Phase B wager-push handoff (`HANDOFF_SendWager_PhaseB_ApplePush.md`):
1. Enable **Push Notifications** on the App ID at developer.apple.com.
2. Create an **APNs Auth Key (.p8)**; record **Key ID, Team ID, Bundle ID**.
3. Add the Push entitlement + `@capacitor/push-notifications` (already covered by the
   Phase B package `BadGolf-SendWagerPush-PhaseB`). `www/push-bridge.js` here is the
   updated version (now deep-links by notification type).

## 1. Tables (SQL editor, run once each)
- `push_tokens.sql` — already in the Phase B package (device tokens). Run if not done.
- `notif_prefs.sql` — per-user opt-outs (default ON).
- `handicap_snapshots.sql` — monthly index snapshots the app writes.

## 2. Edge function secrets (same for all functions)
`APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_P8` (full .p8 text),
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## 3. Deploy the edge functions
```
supabase functions deploy send-push
supabase functions deploy notify-admins-remap
supabase functions deploy monthly-handicap-push
```
- `send-push` — generic APNs sender. Honors `notif_prefs` by `data.type`, sets
  `apns-collapse-id`, deletes tokens on HTTP 410. Everything calls this.
- `notify-admins-remap` — invoked fire-and-forget by the app after a re-map request
  (`{ request_id }`). Re-reads the row, resolves admins, forwards to `send-push`.
  (Optional hardening: add a DB webhook on `course_requests` INSERT where
  `type='remap'` → this function; it also accepts `{ record }`.)
- `monthly-handicap-push` — cron. Diffs each user's two latest `handicap_snapshots`
  and pushes one line. Keep `send-wager-push` deployed too (the live wager path).

## 4. Schedule the monthly cron (pg_cron)
~9am on the 1st of each month:
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

## Notification → type → opt-out column
| # | Notification | data.type | notif_prefs column |
|---|---|---|---|
| 1 | Friend request | friend_request | (always sent) |
| 2 | Friend starts round | round_start | friend_starts |
| 3 | Friend completes round | round_complete | friend_completes |
| 4 | Wager request | wager | wager_requests |
| 5 | Monthly handicap | handicap | monthly_handicap |
| 6 | Admin re-map | remap | admin_remap |

## Tap routing (www/push-bridge.js, already updated)
wager/round_start → Wager tab · round_complete → crew round/Stats · handicap → Stats ·
remap → Admin dashboard · friend_request → Crew tab.
