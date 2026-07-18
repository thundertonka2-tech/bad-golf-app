# TX — Final Audit for Kevin (v640)

Two blockers resolved + a ratings audit against OpenGolfAPI (OGA). Goal: clear
the path to marking **Texas 100% complete**.

---

## 1. Green Tree Country Club (Midland) — FIXED in code ✅

**Symptom:** wouldn't verify — "missing targets" — even though every fairway
target was set.

**Root cause (real bug):** Green Tree is a 27-hole three-nine. The verify screen
counted how many fairway targets a course *needs* from a scorecard, but a
three-nine has no single base scorecard, so the code defaulted to "18 par-4s" =
**18 targets required**. Green Tree's mapped 18 actually has 5 par-3s, so only 13
targets exist (and all 13 are set). It demanded 18, could only ever have 13 →
permanent "missing targets."

**Fix (v640):** the completeness check now reads each hole's *real* par from the
GPS data (which is already stored) instead of assuming par-4. Verified against
Green Tree's live data: **13/18 (impossible) → 13/13 complete.** After the v640
push, Kevin can verify it normally. This also future-proofs every other
three-nine.

---

## 2. Shary Municipal (Mission) — structural, needs a decision + field GPS ⏳

**What it actually is:** a **27-hole facility** — an 18-hole course *plus* a
separate 9-hole course (confirmed on the course's own site and GolfPass, which
lists "Eighteen Hole at Shary" and a separate 9-hole).

**Why it "keeps getting missed":** two separate things, neither a code bug:

1. The **18-hole** (`shary-municipal-golf-course`) is in the library with correct
   ratings/pars (OGA: par 71, Blue 69.9/118, White 68.2/115), but its **GPS is
   genuinely unmapped — 0/18**. The saved `data/TX/gps-shary.json` is empty (2
   bytes), so the greens/targets were never captured. GPS greens + fairway
   targets are field/map work only Kevin can do — no data source (OGA, GolfPass)
   provides them. **This is the one thing standing between Shary and complete:
   Kevin needs to map the 18's greens + targets.**
2. The separate **9-hole** isn't in the library at all. Decision needed: if it's
   a regulation 9, add it; if it's executive/par-3, leave it out (matches our
   exclude rule). Quickest path: Kevin confirms the 9's par when he's mapping the
   18, and we add it if it's regulation.

**Bottom line for TX 100%:** Shary's 18 needs Kevin to map GPS. Once mapped (and
with the v640 fix), it verifies.

---

## 3. Ratings audit vs OGA — 20 courses worth a look (not 77)

I diffed every TX library course's men's ratings/slopes against OGA
(gender-matched, sanity-gated, 18-hole cards only). The raw diff threw 165
tee-level flags across 77 courses — but most are **noise**, not errors. The
review file `TX_Kevin_Review.csv` sorts every row into an **action** column:

**`0-RESOLVED-NOACTION` — 5 courses (checked, no change needed).** These first
looked like "correction didn't import," but on inspection each was already fine —
and re-importing would have *introduced* errors. Do NOT re-import for these:
- **Comanche Trail** — library Blue 71.6/124 already equals OGA exactly.
- **Sonterra South** — ratings correct; only tee labels differ (our "Blue+" =
  OGA's "Blue"). Cosmetic.
- **Barton Creek Fazio Foothills** — our 7-tee set is fuller; shared tees differ
  ~0.5 (a re-rating) and the "Red" tees are different positions. Re-import would
  misalign them.
- **Riverside** — differences are 0.3–0.6, mixed direction (rounding/re-rating).
- **Sherrill Park** — our entry is **Course #2** (par 70, 6375 yds, Pro 69.4/125);
  OGA matched **Course #1** (par 72, ~6900 yds, Pro 74.4/132). Different courses —
  ours is correct. Heads-up: **Sherrill Park Course #1 looks missing** from the
  library — consider adding it (it'll need GPS).

**`2-VERIFY-IDENTITY` — 4 courses.** Huge gaps (6–11 strokes) that almost
certainly mean a **wrong match** (common course name) or a bad legacy value, not
a real re-rating. Confirm it's the same course + tee before trusting either side:
Pecan Valley, Shady Oaks, Hillcrest CC, Northridge CC.

**`3-VERIFY-RATING` — 16 courses.** The real signal: 3+ tees all off in the same
direction by ~0.5–1.5 — our whole rating set looks like an **older USGA rating**
and OGA is likely current. Worth checking the printed card. (Dallas National,
Great Hills, Northwood Club, Balcones CC, Quicksand, Horseshoe Bay Apple Rock,
the two Indian Creek courses, Tascosa La Paloma, etc. — note Tascosa La Paloma
appears as **two duplicate library entries**; dedupe while you're there.)

**`4-IGNORE` — 52 courses (the bulk of the "109 low").** Reviewed and safe to
skip:
- **Tee-name misalignment** — our combo tees ("Blue+", "White+") don't line up
  1:1 with OGA's, so one tee looks off while the rest match exactly (e.g.
  Sonterra: our "Blue+" 70.8/126 = OGA's "Blue" 70.8/126 exactly).
- **Mixed-direction** deltas on one course = matching artifact, not a real shift.
- **Minor re-ratings** — every tee off by 0.3–0.8 / a few slope points. Within
  normal USGA re-rating variance; changes a handicap differential by a fraction
  of a stroke. Immaterial to play.

**Recommended order:** the 5 "resolved" need nothing. Kevin eyeballs the 4
identity + 16 rating courses against printed cards (~20 checks), optionally adds
Sherrill Park Course #1. Then TX is clean.
