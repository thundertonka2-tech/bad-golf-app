# Deploy the BlueGolf lookup (one time, dashboard — no command line)

The **🟦 Auto-fill from BlueGolf** button calls a small server-side function. Deploy it once:

1. Go to **supabase.com** → open the Bad Golf project.
2. Left sidebar → **Edge Functions**.
3. Click **Deploy a new function** (or **Create a new function**) → choose to write it in the dashboard editor.
4. Name it **exactly**: `bluegolf-lookup`
5. Delete the starter code, then **paste the entire contents of `index.ts`** (in this folder).
6. Click **Deploy**.

That's it. Give it ~30 seconds to go live.

## If the button says "Lookup failed" or you get a 401

Open the function → **Settings** (or Details) → find **Verify JWT** → turn it **OFF** → redeploy.
(The app sends your login token, but turning this off avoids any token hiccups for an admin-only tool.)

## How to use it

1. Admin → open a course.
2. Tap **🔎 Research course** — it opens BlueGolf. Find the course there.
3. Copy that BlueGolf page's web address (any of its pages works).
4. Back in the app, tap **🟦 Auto-fill from BlueGolf**, paste the link.
5. It shows the tees (men's + women's rating/slope), pars and stroke index it found.
   - If the course already has ratings/pars, it **warns you it will overwrite** before saving.
6. Confirm → done.

## What it pulls

- Every tee's **men's** and **ladies'** course rating + slope (BlueGolf marks ladies as "L").
- All 18 **pars**.
- All 18 **stroke indexes** (the per-hole handicap).

Tested against Buffalo Creek Golf Club (Gold M 74.9/132 · W 81.3/145, etc.) — parsed cleanly.
