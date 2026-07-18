# Arizona — Multi-Nine & Nine-Hole Course Map (v636)

Built from the OpenGolfAPI (OGA) AZ dataset (469 courses cached) cross-checked
against the live Bad Golf library (`shared:course-library-additions` +
`shared:courses`) and GolfPass published scorecards. Companion to the AZ ratings
correction (`data/AZ/`). Data-integrity gated per the launch standard.

---

## 1. True 27-hole (three-nine) facilities

A 27-hole facility is three nines that combine into three officially-rated 18s.
These belong in `THREE_NINE_COURSES` so the base course opens a nine-picker and
produces the correct rating/slope for whichever two nines are played.

### WIRED in v636 (verified) ✅

| Facility | Library base id | Nines | Ratings source | Per-hole source |
|---|---|---|---|---|
| **Kierland Golf Club** (Scottsdale) | `kierland-golf-club` | Acacia · Mesquite · Ironwood | OGA | OGA (clean, verified) |
| **Gainey Ranch Golf Club** (Scottsdale) | `gainey-ranch-golf-club` | Arroyo · Lakes · Dunes | OGA | GolfPass |
| **Tubac Golf Resort** (Tubac) | `tubac-golf-resort-spa` | Anza · Rancho · Otero | OGA | GolfPass |

Each was verified: every published 18-hole combination reconstructs its exact
course rating, slope and total par, and the stroke index is a valid 1–18
allocation. Ratings/slopes come from OGA (validated to match GolfPass exactly);
Gainey's and Tubac's per-hole par/SI/yardages came from GolfPass because **OGA's
per-hole data for those two was corrupt** (front nines defaulted to all-par-5,
back-nine yardages null). Kierland's OGA per-hole data was clean and used as-is.

Note on stroke index: the app model allocates front-nine holes the odd indexes
and back-nine the even indexes (the standard split, same as every other wired
three-nine). Real clubs sometimes flip parity per combination, so the per-hole
*stroke index* is a valid standard allocation rather than a byte-for-byte copy of
each printed card — but course rating, slope, par and yardage (everything that
drives scoring and handicap differentials) are exact.

### DOCUMENTED — needs a clean single-source scorecard before wiring ⏳

| Facility | Library base id | Nines | Why not wired yet |
|---|---|---|---|
| **Oakwood Country Club** (Sun Lakes) | `oakwood-golf-club-3` | Lakes · Palms · Sonoran (three par-36 regulation nines) | OGA has no course ratings for the nines; GolfPass returns official 18-combo *ratings* but its per-hole rows came back mirrored (front 9 = back 9) and the tee ladders differ across the three combos (e.g. Sonoran/Lakes uses blended combo tees), so per-nine par/SI can't be factored with integrity. Wire once a consistent scorecard (club card or a clean card source) is in hand. |
| **Sunland Springs Village** (Mesa) | `sunland-springs-golf` | Four Peaks · San Tan · Superstition (three executive nines, par 31/32/33) | Executive facility; OGA carries slope only (no course rating) and executive combos may not have official USGA combination ratings. Confirm whether official combo ratings exist before wiring. |

---

## 2. Redundant OGA combination entries (recommend cleanup)

Because the AZ import brought each three-nine facility in as its three
*combination* 18-hole entries, the library now has both the base course (now the
nine-picker) and the old combo rows. The combo rows are redundant now that the
base is wired. Suggested removal (verify in admin first):

Kierland: `acacia-mesquite-at-kierland-golf-club`,
`mesquite-ironwood-at-kierland-golf-club`,
`ironwood-acacia-at-kierland-golf-club`

Gainey Ranch: `arroyo-lakes-at-gainey-ranch-golf-club`,
`lakes-dunes-at-gainey-ranch-golf-club`,
`dunes-arroyo-at-gainey-ranch-golf-club`

Tubac: `tubac-golf-resort-anza-rancho`, `tubac-golf-resort-rancho-otero`,
`tubac-golf-resort-otero-anza`

(The base three-nine entry was wired WITHOUT `searchCombos`, so no new duplicate
search rows were added — it's a single course with a nine-picker. Removing the
old combo rows above is optional polish, not required for correctness.)

---

## 3. 36-hole / multi-course complexes (NOT three-nine — each 18 stands alone)

These are two (or more) separate rated 18s at one club. They are handled
correctly as individual courses; no three-nine wiring needed. Listed so they
aren't mistaken for missing nines:

The Boulders (North / South), Grayhawk (Talon / Raptor), Forest Highlands
(Canyon / Meadow), Randolph (North / Dell Urich), Palm Valley (North / South),
Omni Tucson National (Catalina / Sonoran), Wickenburg Ranch (Big Wick 18 +
Li'l Wick par-3 9). Starr Pass (Tucson) is a 27-hole facility
(Rattler/Coyote/Roadrunner) worth a future three-nine pass.

---

## 4. Likely OGA duplicate aliases (same course listed twice — verify, then dedupe)

The AZ OGA import produced some double entries for a single course under slightly
different names. Confirmed/likely pairs to reconcile in the library:

- Coldwater Golf Club ⟷ Coldwater Country Club (Avondale)
- Hillcrest Golf Club ⟷ Hillcrest Golf Club at Sun City West
- San Marcos Golf Resort ⟷ San Marcos Golf Course (Chandler)
- Mountain View Golf Course ⟷ Mountain View Golf Course (Military) (Sierra Vista)
- Cerbat Cliffs Golf Course ⟷ Cerbat Cliffs (Kingman Municipal)
- Davis-Monthan Blanchard ⟷ General William Blanchard Golf Course (Tucson)
- Briarwood Country Club ⟷ Briarwood CC at Sun City West
- Grayhawk Talon ⟷ Talon at Grayhawk; Dove Mountain (two name variants)

These should be verified against coordinates/scorecards before removing either
side, since a few "pairs" are genuinely two different courses.

---

## 5. Standalone nine-hole courses (54 in OGA)

Full inventory in `data/AZ/az_ninehole_inventory.csv` (OGA course, city, par,
library-status, matched library entry). Highlights:

- Only **3** of the 54 carry any OGA course rating, and those are single nines
  rated as an 18 played twice (Twin Lakes-Willcox, Coyote Trails-Cottonwood,
  Palo Verde-Phoenix) — handled by the app's normal 9-hole path, no special
  wiring.
- The remaining nines are executive / par-3 / short courses; OGA has no course
  rating for them (many carry slope only). Nothing to correct on ratings.
- The inventory flags entries that don't obviously match a current library row
  (name-normalized match is approximate — confirm in admin before adding). These
  are candidates to add so they're searchable: Stripe Show (Mesa), Havasu Springs
  Resort (Parker), Shalimar (Tempe), Pine Meadow CC Estates (Overgaard), The 500
  Club Futures (Glendale), Willow Springs (Mohave Valley), Apache Sun (Queen
  Creek), Havasu Island (Lake Havasu City), and others in the CSV.

---

## 6. What to do next (your side)

1. Push the code (v636 = `golf-app.html` + `www/index.html`) via GitHub Desktop —
   Kierland, Gainey Ranch and Tubac go live as three-nine nine-picker courses.
2. Optional: remove the redundant combo rows (section 2) and dedupe the aliases
   (section 4) in admin.
3. When you have a clean scorecard for Oakwood CC and Sunland Springs, ping me and
   I'll wire those two the same way.
