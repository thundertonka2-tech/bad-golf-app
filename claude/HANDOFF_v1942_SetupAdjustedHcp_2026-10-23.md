# v1942 — Setup player rows show the tee-adjusted handicap ("Adj") — 2026-10-23

## Ask (Tyler)
Setup showed "HCP 12.0 · Ruby" for Stan and Gary, but the FLAG56 scorecard showed (7). He asked why they didn't match. The answer: setup shows the Handicap Index, and the card shows the course handicap = Index × Slope/113 + (Rating − Par). Ruby is 65.2/112 on a par 70, so 12.0 → 7. He then asked to show the adjusted number on the same line, labelled "Adjusted" or similar, without changing the mobile layout.

## Change
- Summary line: `HCP 12.0 · Adj 7 · Ruby` (plus handicaps: `HCP +2.4 · Adj +7`).
- New `bgSetupAdjHcp(row, hcpStr, teeLbl)` computes it the same way gatherSetup does at round start: same rated-tee filter, per-tee par total (v1065/v1890), and `computeCourseHcp`. It is display only.
- No Adj shown for plays-gross players, rows with no rated tee, or event/league rounds (the box already holds the playing handicap there, v1719).
- `.pr-meta` CSS: added `flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis` so it can never wrap.
- BG_BUILD + BGVER → v2026.11.1942.

## Verified (phone-size render, Cedar Crest Silver 69.1/125 + Ruby 65.2/112)
- Adj 3 / 12 / 7 / 7 matches gatherSetup's started hcp 3 / 12 / 7 / 7; +2.4 Ruby → Adj +7 = hcp −7.
- At 390, 375 and 320 px, every row is one line, 33 px tall, with nothing off the right edge. At 320 only, a long name ("Christopher M.") ellipsizes.
- All guards clear; app scripts identical; both files end with `</html>`.
