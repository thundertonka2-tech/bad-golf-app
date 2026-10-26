# v1949: scorecard key matches the marks; GPS card gets event skins, dots and a key (2026-10-26)

**Report (Tyler, Kerbo leaderboard screenshots):** the key says "birdie" is green and "skin" is blue, but that isn't what the cards show.
- The event and Tournament cards circle skins in **gold** (event-wide skins).
- The Group card's key showed "skin" even when no skin was circled.

**Ask:** make sure the GPS-screen scorecard has the same fixes.

Build: BG_BUILD = BGVER = v2026.11.1949, in both files.

## Changes
- **New `bgScLegendHtml(cardHtml)`.** It builds the key from the classes actually drawn on the card. Each chip appears only if that mark is on the card, in the same colour as the cells:
  - stroke given
  - eagle
  - birdie (green)
  - skin (blue, group skins game; reads "group skin" when event skins are also on the card)
  - event skin (gold)
- **Cards that use it:**
  - the Score tab card (`#scorecard-score-tab-legend`)
  - the group/round card (`buildRoundScorecardHtml`, the Group 1/2 tabs)
  - the field/Tournament card (`buildEventScorecardHtml`)
  - the GPS stacked card (`buildStackedScorecardHtml`)
- **GPS scorecard sheet:**
  - It had **no key at all**. Added.
  - **Full field view** now rings skins the same way the event card does. The skin logic moved out of `_t2FieldScorecardHtml` into `_bgEventSkinByHole(t, rawRounds)`, which covers event field skins plus every group's own skins, keyed by normalized name. Before, Full field showed no skins.
  - **Full field view** now shows stroke dots, read from `field.strokes`; the field object has no `sis`, so it had none. The handicap comes from `p.hcpTag`.
- **Mobile:** the key wraps at line-height 1.9. Rendered at 390px with no horizontal page overflow.

## Verified
- 390×844 renders:
  - field card key = "stroke given · event skin"
  - GPS Full field: 16 stroke dots, gold skins, key "stroke given · birdie · event skin"
- `qa_all` 85/85, watch 62/42/69, Wolf 23/23, cross-match 4/4, on both files.
- All guards clear.
