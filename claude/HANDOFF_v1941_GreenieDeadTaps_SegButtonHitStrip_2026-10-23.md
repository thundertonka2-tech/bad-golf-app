# v1941 — Greenie names dead after the first par 3 (invisible hole-arrow tap strip) — 2026-10-23

## Report (Tyler, Cedar Crest, round FLAG56, v1940)
- First par 3 (#3) the greenie worked on Tyler's phone. Every par 3 after it (#6, 9, 11, 15, 17) the names looked normal but would not take a tap. Kevin picked them on his phone.
- Kevin hit it too later; going to the next hole and back made it work for him.
- Scores were entered before the greenie each time. Same group, no setting changes.

## Evidence — the v1939 tap log (games rows `diag:greenie:FLAG56:<device>`)
- Tyler's phone (spthh3): #3 = down → up-fire → run (worked). #6 = ~40 `covered` events in one minute, every one `by: button#next-hole` or `button#prev-hole`; touches that did reach the section were `down` with no chip under them, then `cancel`. Same on #11, #15, #17. #9 = touch with no chip, never ran.
- Kevin's phone (f0vbvh): `covered by button#next-hole` on #6, #11, #15, #17, then a run once the layout shifted (after he moved hole and back).
- So the taps were landing on the ‹ › hole buttons, which sit at the top of the screen, while the finger was on the names.

## Cause
`@media (pointer: coarse) html[data-btnsys="on"] .bg-btn::after` adds an invisible 44px, `left:0; right:0`, `position:absolute` hit strip to every button. The base rule that gives `.bg-btn` `position: relative` is scoped `:not(.bg-btn--seg)`, so on segmented buttons (hole arrows, tabs, steppers) the strip anchored to a far ancestor instead: a full-width invisible bar halfway down the page. Where it lands moves with page height, so it covered some par 3s and not others. This is very likely the same thing behind Buffalo Creek #4 (v1939).

Phone-size render of FLAG56 (390×844, coarse pointer): hole arrows at y=27, but their strip at y≈884–924; the greenie names at 858–898 on #6/9/11 (strip lower at 932–972 on #3 because that page was taller). A whole-screen hit scan found 257 points where a tap went to a segmented button outside its own box (133 for #next-hole, 124 for other seg buttons).

## Fix
One CSS line inside the same coarse-pointer block, both files:
`html[data-btnsys="on"] .bg-btn.bg-btn--seg{ position: relative; }`
Every `.bg-btn--seg` in the app computes as static (28) or relative (5, bottom nav) today, so nothing moves. BG_BUILD + BGVER → v2026.11.1941.

## Verified
- Re-render: no stray strip on #3/6/9/11; whole-screen scan = 0 stray hits; ‹ › still tappable; all four greenie names hit-test to themselves.
- guard_stale_base All clear (app scripts identical), guard_button_inline / merge_registry / units_registry / i18n exit 0; both files end `</body></html>`.

## Round data
FLAG56 greenies: #3 Gary, #6 Stan (3-putt / Hero Tax), #11 Gary, #15 Gary, #17 Gary. #9 has none, and none was due: nobody made par (Tyler 4, Kevin 4, Stan 4, Gary 5).

## Next round — check
The tap log stays on. After a round:
```sql
select split_part(code,':',4) dev, e->>'ev' ev, e->>'by' by_, e->>'hole' hole
from games, jsonb_array_elements(data->'events') e
where code like 'diag:greenie:<CODE>:%' and e->>'ev' = 'covered';
```
Expect zero `covered by button#next-hole/prev-hole`.
