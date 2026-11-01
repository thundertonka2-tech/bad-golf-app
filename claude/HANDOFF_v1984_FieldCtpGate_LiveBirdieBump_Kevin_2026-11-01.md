# HANDOFF v1984 — field CTP gate + live Birdie Bump (Kevin, Sr Sunday 11/1)

Build **v2026.11.1984** on main. Web-only (golf-app.html + www/index.html, scripts identical, guard clean). Verified headlessly against the real cloud rows of SR SUNDAY INVITATIONAL 11/1 (ACE24 Gregory/Larry/Steve, LINK84 Kevin/Josh/Chris/Frank; field CTP 4/8/12/17 @2, Birdie Bump 10/20/50, Low Net 5).

## What Kevin saw

1. "During play it was not showing the birdies on the gps screen but money was good at end."
   The event Birdie Bump deliberately showed **0 / not settled for everyone** until the day completed (rows carried `money: complete ? x : 0`). Kevin himself made no birdies, so his GPS chip read "0 birdies" — correct but useless once Steve (11) and Frank (13) had birdied.
2. "It calculated everything at the end except CTP. But later it was right… someone's app was not closed."
   Exactly right. Birdie Bump and Low Net settle once **every posted card has all its holes**; CTP, field Skins and Long Putt only settled once **every group's `finishedAt` reached the cloud** (`_t2DayFieldComplete`: `finished === rounds`). Group 1 tapped Finish 9:52, Kevin 9:57, Kevin's settle finally carried CTP at 10:06 — the window where group 1's Finish write hadn't landed yet. Replay with ACE24's `finishedAt` removed: Birdie complete, Low Net paying, CTP "still live".

## Fixes (Tyler's choices)

- **CTP, Skins and Long Putt adopt the "every posted card is full = day done" shortcut.** New `_t2NoteDayCards(d, g)` counts posted cards / short cards per day (9-hole days use the card's par count); each of the three engines calls it next to `rounds++`; `_t2DayFieldComplete` returns true when `cards > 0 && cardsShort === 0`. Finish stamps, the one-group rule and the past-day rule all still work. A card with zero scores is not a posted card (v1292), so the v1117 abandoned-group case also settles.
- **Birdie Bump runs live, Totals still wait.** `_t2FieldBirdieAll` rows now carry `live` (what the birdies already made would pay) alongside the gated `money`. GPS chip (field branch of `gpsMyStatuses`) shows `N × ±units` like the group chip ("−10", "2 × +100"). The per-game breakdown shows the muted running figure + count under the "still live" header instead of "not settled"; `gameLive` is display-only — `totalsByKey` (and so the Total column / settledMoney) is unchanged until the day completes.

## Checks

- Probe (scratch): as stored → CTP complete, totals Kevin +22 / Larry +8 / others −6 (matches the settled units). Group 1 Finish missing → CTP now complete. One card one hole short → still live. Abandoned group with no card + other group full → complete.
- `scripts/qa/run.py`: same four pre-existing failures as HEAD v1983 (V1935 field quota, V1936 skins carry, V1937/V1938 splix) — nothing new.

## Noted, not changed

- LINK84 `ctpData[4]` is an empty entry (`pid: null`, opened and cancelled) — harmless, skipped by every reader.
- Kevin's phone settled on **v1976**; current build is v1984. He should update.
