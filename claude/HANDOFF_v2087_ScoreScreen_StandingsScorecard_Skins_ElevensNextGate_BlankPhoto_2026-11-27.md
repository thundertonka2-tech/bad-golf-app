# HANDOFF v2026.11.2087 — Score screen scorecard (standings first), skins rings, 11's fixes (2026-11-27)

## What Tyler asked (11/27 afternoon)
- Scorecard "hard to read the names and scores ... make everything bigger." Four mockups were drawn on a design canvas
  ("Bad Golf scorecard — redesign options"); **he picked D** (standings first, tap a player to open his card) and confirmed it twice.
- Same first name → last initial; if those match too, the circles must be different colours.
- **Score screen only.** An option to show the old scorecard. HCP is very important. Net at the end. The white stroke dot upper right.
- Tap any hole to change a score, like the old one.
- Each player's own card open, everyone else collapsed.
- Skins won highlighted like the old card — tourney, league and individual.
- 11's: black circle with no initials; tapping Next quickly skipped the keep / toss prompt; restyle 11's under Game results.

## What shipped
**New scorecard on the Score screen** (`#bg-sc-stand`, functions `bgScStand*`)
- One big row per player: place (T for ties), photo / initials circle, name, **HCP tag**, thru, skins count, gross · net, large to-par.
  Ranked on net to par when anyone gets strokes, gross otherwise. No-score players keep card order.
- **Your own card starts open, everyone else collapsed** (`gpsResolveMyId`; if the app does not know who you are, all collapsed — it never guesses). Your own open/close taps are then left alone.
- Open card: per nine — Hole, Par, **HCP** (hole handicap), Score. White stroke dot upper right. End of nine = gross with **net** under it. **Total** line: gross, net, net to par.
- Birdie circled, bogey boxed, double+ filled. **Skin = bold blue circle; tournament whole-field skin = gold; both = both rings.** Key under the cards names what is on screen.
- **Tap any score (any player, played or not) → the existing + / − editor** (`bgOpenHoleScoreEdit`). Viewers cannot edit.
- Names: `displayFirst(p, g.players)` (Kevin W. / Kevin B.; more letters if the initial also matches). Colours: `bgScStandColors(g)` — never shared inside a group, so two identical names still differ.
- **"Classic scorecard" / "New scorecard"** button; choice kept in `localStorage.bg_sc_view`. The classic table is still rendered (hidden), so its tabs and handlers are untouched.
- Scramble and Ryder Cup rounds stay on the classic card (one ball per team), no switch.
- Sizes: name 20px, to par 28px, scores 19px, hole / par 15px, tap targets 48px. Narrower type below 375px wide.

**Shared avatar circle** (`bgAvCircleHtml`, `bgAvBlankCheck`, `bgAvToInitials`)
- The "black circle" was the **Apple Test Review** account's real profile picture, which is a solid black square. A picture that is one flat colour, fully transparent, or fails to load now falls back to the initials circle. Used by the new scorecard and the 11's card. Cross-origin pictures cannot be inspected and are left alone.
- 11's circles now use the same per-group colours as the scorecard.

**11's**
- **Next hole with an answer owed opens the sheet first** (`bgElevensNextGate`, called at the top of `advanceNextHole`). Root cause of Tyler's report: he tapped Next inside the 1.4 s wait, and arming the next hole cancelled the pending timer. Also, a wait running for another hole is no longer thrown away (`_bgElSheet.armHole`).
- **Game results** lists 11's / Team 11's with the card's rows: place, circle(s), to par, kept, then name · tosses left.

## Not done / worth knowing
- The new card shows strokes only. **Match · Units · Quota · 11's tabs live on the Classic scorecard.** Tyler said "D for everything" and also "Just the scoring screen only" — this build reads that as: D replaces the scorecard on the Score screen. Board, finished rounds, tournament cards and the share image are unchanged.
- Yardage is on the classic card only.
- Cart team best-ball rows are not on the new card.

## Files
- `scripts/patch_v2087_score_screen_standings_scorecard.py` (9 edits per file)
- `golf-app.html`, `www/index.html`, i18n (`scripts/i18n/overrides.json` + rebuilt tables), docs source + both PDFs
- QA: `qa/qa_v2087_score_screen_standings_scorecard.js` (new, 55), `qa/qa_v2084_elevens_hole_sheet.js` (40), `qa/qa_v2086_elevens_card_sheet_phone_fit.js` (test photo is now a real picture)

## QA
- 55 checks in real Chromium: totals equal the app's own (`bgNineTotals`), stroke dots equal `strokesOnHole`, skins equal `skinWinnersByHole` **and** the old card's circles (individual + league), tournament gold rings equal the app's real `t2ComputeFieldSkins` → `fieldSkinWinnersByHole` output (with `t2Get` / `loadTourneyRawRounds` stubbed to two carts), tap-to-edit changes the round, classic switch + persistence, nine-hole, no handicaps, view-only, scramble, blank / broken / real photos, phone fit at 320 / 360 / 375 / 390 / 430 light + dark with a long name, two-digit scores and a 36 handicap.
- Not verified: a real iPhone (needs the next Codemagic build); a live tournament with real whole-field skins data; league rounds beyond the round's own skins game (leagues have no separate field-skins pool in the code).
