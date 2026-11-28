# HANDOFF v2026.11.2090 — Event scorecard: cross-group Quota bets get their own Quota tab (2026-11-27)

## Report
Tyler, 6:50pm, TestFlight screenshot of Games > Tournament > "Scorecard — whole field" (Frosty Post Turkey Day): tabs were **Strokes | ⚔️ Matches (2)** and both cards under Matches were cross-group **Quota** bets. "We are still putting quota under matches ... We need a quota tab just like we have for matches here."

v2085 gave the **group** card its own Quota tab; the **event** card and the event page were not touched then.

## Fix (`scripts/patch_v2090_event_scorecard_quota_tab.py`, 7 edits per file)
- `bgEvSplitModels(models)` → `{ matches, quota, hasMatches }`. Quota = models with `xkind === 'quota'`. Stroke-play and Nassau bets, and the dropped / conflict notes, stay under Matches.
- `_t2FieldScorecardHtml`: tabs are **Strokes | ⚔️ Matches (n) | 🎯 Quota (n)**; each tab only appears when it has something. Remembered tab (`golf:evscview:<tid>`) accepts `quota`; a remembered `matches` on an event that now has only Quota opens Quota.
- Event page (`_bgEvpRender`): the Matches tab no longer lists Quota bets; a **Quota** tab is added once the page's calc has found Quota bets.

## QA
`qa/qa_v2090_event_scorecard_quota_tab.js` (11 checks, real cross-bet engine via the harness): Tyler's case → Strokes | Quota (2), no Matches tab; with a match play added → Strokes | Matches (1) | Quota (2), cards in the right panes; no bets → no tab row; splitter rules. Full suite, `npm test`, matrices, guards.

## Worth knowing
- On the event page the Quota tab shows only after the page has computed its cards (opening Scorecard, Units, Prize pools or Matches triggers that). It is not listed on first paint of the Leaderboard tab.
- In Tyler's screenshot the Quota cards show only holes 17 and 18 beside the name. Not changed here; I believe the card is scrolled to the last hole, not missing columns — not confirmed on the phone.
- Not run on a real iPhone.
