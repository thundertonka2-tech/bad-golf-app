# HANDOFF v2026.11.2076 — speed: joining a round or tournament from Home at the course

Date: Thu 2026-11-26. App pushed to `main`; server change applied to the live database the same day.

## Tyler
"Finally run speed test on the app again, it seems slow when I get to the course and want to join a game or tourney from the home screen. Can we speed that up?"

## What was measured
1. **Server — the Home feed.** `bg_home_feed` (the one call Home's "Your rounds" card waits for): 1,777 calls on record, **mean 1,103 ms, max 7.8 s** (pg_stat_statements). Run as an ordinary player (Rambo): 757–1,276 ms; as Tyler (admin): 406–560 ms with a 403 KB answer (all 49 events). Cause: the five tournament tables were read through row security, which re-ran `tourney_is_member` (three lookups, one over the rounds table) for every row, and each table was counted and then read.
2. **Home card.** After a quick local paint, the card painted its real list **once, at the very end** — after invites, events and rounds, and then after the scheduled days and the league chain (seasons, weeks, roster, matchups: 4–6 more round trips). A round somebody just started for you is not in the phone's local copy, so it appeared last.
3. **Join now on a tournament round** (`openT2Round`): five round trips one after another before the scoring screen (round, event, recents write, scorekeeper, name), with nothing on screen while they ran.

## Changes
**Server** (`supabase/SQL_v2076_home_feed_fast.sql`; migrations `v2076_home_feed_t2_helper`, `v2076_home_feed_uses_helper`)
- `_bg_home_feed_t2()` works out the caller's events once and reads the five tables by id. Same rows row security gives: compared for 63 accounts, 0 differences; that part went ~270 ms -> ~7 ms.
- `bg_home_feed` uses it; invites and round blobs still go through row security.
- After: **Rambo 100 ms** (was 757–1,276), **Tyler 64 ms** (was 406–560), Graham 35 ms. Works for every build already on phones — no app update needed for this part.

**App** (`scripts/patch_v2076_home_join_speed.py`)
- Home: as soon as the live rows are known and one is not on screen yet, the card paints them (with the completed rounds); scheduled days and league weeks fold in at the final paint as before. Same rows, same painter — nothing is shown from a guess.
- Join now on a tournament round: an "Opening your round…" pill at once; the scorekeeper lookup starts alongside the event read; the recents write no longer holds the screen (bounded 3 s at the end). Before the screen: 5 round trips in a row -> 2.
- Join a regular round: the recents write runs alongside the name lookup and is only waited for when a save follows.

## Not changed
- Tyler's and Kevin's feed is still 403 KB because an app admin is sent every event in the system (49 today). The server now answers in 64 ms, but that download is the largest remaining cost on a weak signal for the two admins only. Trimming it means changing what the admin screens read; left for a decision.
- A first-time join still waits for the save that records the player on the round.

## QA
- `qa/qa_v2076_home_join_speed.js` — 17 checks on each file, order-of-events with hand-resolved network answers: pill up at once; scorekeeper lookup and event read out together; the scoring screen opens while the recents write and the scorekeeper lookup are still out; pill gone on screen; GPS for a non-scorekeeper; manager ids applied; round-not-found leaves no pill; plus wiring checks for the Home early paint and the regular join.
- The Home early paint could not be driven end to end in the test harness (the card's build needs timers the harness does not run); it is covered by wiring checks and the unchanged full suite.
- All 86 `qa_*.js` pass on both files; `npm test` 82/82; guards All clear; language sources in step.
- Not timed on a real phone at the course.
