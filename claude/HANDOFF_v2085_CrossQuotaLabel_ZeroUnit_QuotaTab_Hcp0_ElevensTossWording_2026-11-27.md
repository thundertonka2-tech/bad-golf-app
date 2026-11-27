# HANDOFF v2026.11.2085 — cross Quota bets (label, 0 units, Quota tab), handicap (0), 11's "Toss" wording + sheet once

Date: 2026-11-27 · Branch: main · Files: `golf-app.html`, `www/index.html` (app script byte-identical)
Event looked at: **Frosty Post Turkey Day** (`7374888c-…`), rounds EAGLE11 and DRIVE72.

## What Tyler reported
1. "Why does it show a Nassau game between Rolo and Kevin here? They were playing quota. Also me and Kevin had a quota game and I don't see it here although it was for zero dollars."
2. "We cannot see Larry's handicap on the phone here."
3. "On the scoring screen you listed the quota games under the matches tab. Can you make a quota's tab instead?"
4. On the 11's sheet: say "Toss" not "Throw out"; say "made par / bogey / double / triple", then "+N".
5. "We should not prompt this box until all scores are entered. Once they are entered this pops up once... the bottom button is not necessary."

## What the data showed
- `settings.crossBets` held two bets, both `kind: 'quota'`: Kevin v Rolo (20) and Kevin v Tyler (0). Nothing was stored wrong.
- The engine keeps a cross Quota / Stroke bet in the `nassaus` list (`kind: 'nassau'`, `xkind: 'quota'`), and the payout item was labelled from the list, not from `xkind` → "Nassau".
- Payout items are kept only when units moved or a W/L mark exists; a 0-unit Quota bet got its mark on the game total, not on the item → dropped.
- Both carts ran `hcpRules.basis: 'lowest'` (strokes off the low handicap). Larry (raw 4) and Tyler (raw 9) were the low men, so their playing handicap was 0, and `bgHcpTag` printed nothing for 0.

## Changes
`scripts/patch_v2085_cross_quota_label_zero_unit_quota_tab_hcp0.py` (8 edits per file)
- Payout item kind: `Quota` / `Stroke play` / `Nassau` from `n.xkind`.
- 0-unit cross Quota / Stroke bet: the item carries W / L / AS, so it is listed.
- `bgQuotaCrossModel(g)` + `bgQuotaCardModel` wrapper (`_bgQuotaCardModelBase` is the old one): a cart whose quota games are cross bets gets a **Quota tab** — points per hole, "27 pts · quota 24 · +3", then a line per bet "v Rolo · +3 v −2 · won · 20" (`_bgQXbetHtml`, rows `tr.sc-q-xbet`). `_t2ScCrossRows` tags its quota lines and the Match model drops them. The whole-field Quota card still uses the base model.
- `bgHcpTag` prints `(0)`. Gross rounds and plays-gross players still print nothing.

`scripts/patch_v2085b_elevens_toss_wording_sheet_once.py` (10 edits per file, same build)
- "Throw out" → **Toss** through the 11's sheet, card, Board, toasts, setup text and help.
- Sheet rows read "made par / bogey / double / triple / +4" (`bgElevensScoreName`; birdie / eagle under par), with "(net par)" when net differs.
- The 11's card asks nothing until every score for the hole is in ("keep or toss once every score is in"); the warning and the Keep / Toss buttons appear only then.
- The sheet pops up **once** per hole (`_bgElSheet.shown`). After "Not now" the card's Keep / Toss buttons are the way in; the gate on the next hole still opens the sheet.
- The extra "Keep or throw out — hole N" button under the card is removed.

## QA (both files)
- `qa/qa_v2085_cross_quota_event_payouts.js` (7): the 11/27 shape through the real `t2ComputeCombinedPayouts` — both bets listed as Quota, nothing called Nassau, 20 moves, the 0-unit bet shows W / L, zero-sum.
- `qa/qa_v2085_cross_quota_tab_label_zero_hcp0.js` (16): Quota tab present, no Match tab for Quota-only bets, points per hole, the three lines under the player, Match tab clean when a real match is also on, field card unaffected, `(0)`.
- `qa/qa_v2084_elevens_hole_sheet.js` (26, Chromium, real taps) updated: nothing asked until all scores are in, pops once, Toss wording, "made bogey".
- All 96 `qa/qa_*.js` scripts 192/192; `npm test` 82/82; six matrices 0 failures; guards all clear.

## Not verified
- Not opened on the real Frosty event on a phone; the fix was tested on the same data shape. The stored event needs no data change — it re-reads correctly on v2085.
- "Larry's handicap": I took "here" to be the scorecard / leaderboard rows where a number in brackets follows the name. If it was a different screen, say which.
