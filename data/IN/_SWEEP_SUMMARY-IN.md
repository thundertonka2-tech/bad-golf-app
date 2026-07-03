# Indiana (IN) sweep — staged 2026-07-03 (overnight run)

Base app: LIVE **v2026.11.483** (Phase-0 hooks all present: toCreate / gpsDataImport / sweepimport / courseRemoveImport / verify).
Source: OSM golf_course polygons (302) → GolfPass-first data pull (ratings + slope + pars + SI + GPS greens w/ fwc + par-5 layup). No ratings fabricated.

## Staged files (data/IN/)
- **course-ratings-IN-sweep.csv** — 222 courses, 1,053 tee rows, **0 validation issues** (men rating ≤82 to keep the Pete Dye Course @80.5 + Pfau @80.2; women ≤85; par 68–73; SI valid-or-blanked).
- **gpsimport-IN.json** — 213 courses with full 18-hole GPS; **100% fwc** on par-4/5 (targetsComplete passes), **99% par-5 layup**.
- **course-contacts-IN.csv** — 222 rows (128 have phone/website from OSM tags; rest blank — run bad-golf-course-contact later to fill).
- **course-remove-IN.csv** — 21 excluded (9-hole / par-3 / driving range / no-card / closed).

## Counts
- 302 OSM candidates → **222 clean 18-hole keepers** imported.
- 21 removed, 4 out-of-state namesakes skipped, 55 to needs-alt-source.

## Multi-nine follow-ups (NOT wired — needs a focused bad-golf-multinine + deploy session)
OSM flagged these; the true 27-hole three-nines to wire are likely:
- **The Legends Golf Club (Franklin)** — 27h (Middle/Tradition/Champions); came back "no-card" as a single 18 → wire as THREE_NINE.
- **Otter Creek Golf Course (Columbus)** — 27h.
- **Sand Creek Country Club (Chesterton)** — 27h (private).
- **Old Oakland Golf Club (Elkhart)** — 27h.
- 36-hole two-18 facilities (import each 18 separately, do NOT wire): Swan Lake Resort (Black/Silver — only Black 18 captured), Pebble Brook (North/South), Eagle Creek.
Wiring edits BOTH golf-app.html + www/index.html and bumps BG_BUILD, so it was intentionally deferred from this staging run.

## Out-of-state namesakes (NOT imported to IN — likely IN private clubs with no GolfPass card)
Greenfield CC→IA, Lansing CC→IL, Plymouth CC→NC, Stonecrest→PA. Left out to avoid polluting other states with a wrong match.

## Needs-alt-source (55) — GolfPass gave only a 9-hole card OR no card
Two buckets:
1. **Real 18s with only a 9-hole GolfPass listing** — worth a USGA/alt pull: Buffer Park, Cascades (IU), New Albany, Hidden Creek, McDonald, White Hawk, Donald Ross (French Lick), Zionsville.
2. **Likely genuine 9-holers to REMOVE after confirming** — Burke (par31), Studebaker (par29), Elks CC, Huntingburg CC, Lafayette CC, Washington CC, Woodstock Club, Wawasee, Western Hills, Parke County, etc.
Plus private clubs not on GolfPass (Cressmoor, Carroll County CC, Windy Hill CC, Meridian Hills — actually captured), and Stonehenge (Warsaw), The Golf Preserve (Frankfort), Norwood, Summertree, Mink Lake, Birch Tree. See full list in the run report.

## ✅ Last step — do this now
1. Push **data/IN/** to GitHub from GitHub Desktop.
2. Open **https://thundertonka2-tech.github.io/bad-golf-app/golf-app.html?sweepimport=IN** ONCE while signed in as admin.
3. Wait for the "✅ IN sweep import complete" banner.
4. Reopen any open round so the device picks up the new GPS / fairway targets.
