# MS multi-nine facilities — flagged for wiring (NOT auto-wired this run)

## Country Club of Jackson (Jackson) — 27-hole three-nine
- Nines: Azalea, Cypress, Dogwood
- GolfPass ids: Azalea 14431 (page has NO rating card), Cypress 14427 (reads 9-hole),
  Dogwood/Azalea combo 14428 (18, par not parsed)
- Status: GolfPass combo/nine pages are INCOMPLETE (Azalea nocard). Per skill rule
  "incomplete pages -> flag for manual, never guess ratings." Needs manual nine_extract +
  build_facility (must PASS) before wiring THREE_NINE_COURSES. Base id: reuse existing
  library 'country-club-of-jackson' if present.
- NOT added as singles (the messy combo rows were excluded from the ratings CSV).

## Timberton Golf Club (Hattiesburg) — 27 holes
- Main championship 18 (gpId 15105) IS staged as a normal 18 (par 72, full GPS).
- Third nine "Valley/Lakeview" (combo gpId 15103) exists. If Tyler wants the full 27 wired
  as a three-nine, run bad-golf-multinine on 15105 + 15103. Left as the main 18 for now.

## Dancing Rabbit (Philadelphia) — TWO separate 18s, NOT a three-nine
- The Azaleas (15625) and The Oaks (15626) are both staged as independent 18s. Correct.
