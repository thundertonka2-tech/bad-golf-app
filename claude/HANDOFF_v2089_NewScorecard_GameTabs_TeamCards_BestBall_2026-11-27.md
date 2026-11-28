# HANDOFF v2026.11.2089 — New scorecard: Match / Units / Quota / 11's tabs, team cards, best-ball card (2026-11-27)

## What Tyler asked (5:39pm, answering v2087's open questions)
1. "yes build the new one for all of them" — the game tabs in the new look. Also: "we used to have a units tab and a matches tab with the old score card, we need that back as well."
2. "design a new team version" — Scramble and Ryder Cup.
3. "Yes" — the tournament cart's team best-ball line.

His picks from the four follow-up questions: **scores plus a game line** on each tab; rows ordered by **that game's standing** with its result as the big number; **one card per team**; best ball as a **team card below the players**.

## How it is built
The classic table (`#scorecard-score-tab`) is still rendered, hidden. It already carries, for every tab, the per-hole value on each cell (`data-sc-match`, `data-sc-units`, `data-sc-quota`, `data-sc-pt…`), the totals, the footer lines, the units bands and — for Quota and 11's — the 1st-to-last row order. `bgScStandDom(g)` reads all of that back as plain data and the new card draws it. So anything the classic card can show on a tab, the new card shows the same, and no game math was re-implemented.

- **Tabs:** chips built from the classic caption's `.sc-tab` buttons. A tap calls the classic `bgScTab` (so the choice is remembered per round and shared with the Classic view), then repaints.
- **Player cards on a game tab:** big number = that tab's total; line under the name = the tab's footer line; rank from the footer ("T1st") or computed for Units; order = classic order for Quota / points tabs, result order for Units / Match; players not in the game last ("Not in this game"). Open card = Hole / Par / HCP / Score (still tap-to-edit) + one game line (`_bgSsGameLine`), tossed 11's holes struck through.
- **Several matches:** one captioned line per match. The classic label is "v Kevin" for both Kevins, so the opponent is re-named from `calcMatch(g).matches` with `displayFirst` → "v Kevin W." / "v Kevin B.". Cross-bet match lines keep the classic label.
- **Team cards (Scramble / Ryder Cup):** rows without `data-pid` become team cards: partners' circles (`cfg.teamA` / `teamB`, or `row.dataset.team`), score to par, hole card with every header line the classic card has (HCP, Par, Format). Ranked low to high on Strokes. Your team's card starts open. Read-only, as on the classic card.
- **Best ball:** `tr.sc-team-row` → dashed team card after the players, with up to four circles when the cart is a `teamLowball` 4-man team. Hidden on Quota / points tabs, as on the classic card.
- `bgScStandOk` no longer excludes scramble / Ryder Cup.

## Files
- `scripts/patch_v2089_new_scorecard_tabs_teams_bestball.py` (3 edits per file: the card renderer slice, `bgScStandOk`, CSS)
- i18n overrides (+5 strings), docs source + PDFs
- QA: `qa/qa_v2089_new_scorecard_tabs_teams_bestball.js` (new, 54); `qa/qa_v2087_…` scramble check updated

## QA
54 checks, real Chromium: every game value on Units / Quota / 11's / Match compared hole by hole against the classic card's cells; totals, order and footer lines; two-match player; not-in-game player; tap-to-edit on a game tab; tab shared with Classic; Scramble team scores vs `scrambleData`, to par, rank, match line; Ryder Cup team rows vs classic; best ball vs `bgBestBallTeamLines`; phone fit at 320 / 375 / 390 / 430, light + dark, on the five busiest views. Full suite on both files, `npm test`, matrices, guards.

## Not verified / limits
- Real iPhone (next Codemagic build).
- Team Match, Nassau, Wolf, Banker and other games ride the same reader (their values come from the classic cells) but were not each given their own fixture. Team Match was dumped by hand and reads correctly.
- Event team best ball (v2064 pool, named teams) shows as a team card with initials, not partner photos — the row carries no player ids.
- Cross-bet match lines keep the classic "v Name" label (first name only).
- The new card is still Score screen only.
