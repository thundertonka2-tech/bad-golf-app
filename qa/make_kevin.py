"""Build the Kevin Queue tab offline.

The code-review queue itself is admin data (v1229 RLS) and the anon key cannot
read it, so this rebuilds the same rows from what IS readable: the library, the
three-nine wiring and the per-nine GPS rows. Every three-nine directive is
GENERATED from live data, so it can never drift from reality the way a
copy-pasted note does. The handful of items that are not "map these nines" --
holds waiting on a code change, and card-vs-map disputes -- are the OVERRIDES
below, and those are the only prose in the file.

Output feeds `bg_mapping_audit.py --kevin-json`.
"""
import sys, os, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bg_mapping_audit as A

APP = sys.argv[1] if len(sys.argv) > 1 else "golf-app.html"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/home/claude/kevin.json"

OVERRIDES = {
 # Signed off by an admin AND sent back by Tyler on 26 Aug with nothing mapped.
 # A send-back is the newer decision, so it stays in the queue (v1235).
 "shangri-la-golf-club": "Map all 3 nines — nothing is mapped here yet (0 greens). Open Shangri La, tap a nine, drop its 9 greens, then do the next one. Map each nine once; the app builds every 18-hole combination itself.",
 "amara-golf-social-club": "Re-map all 18 greens when the course opens. The mapping we hold is the OLD Bear's Best routing — the course was demolished and rebuilt, so every distance on it is wrong for the new layout. Not urgent if the club is not playable yet.",
 "golf-at-indian-creek": "HOLD — do not map yet. Blackbird, Red Feather and the generic Indian Creek entry are one 27-hole facility sharing a single mapping. Needs three-nine wiring first; we do that.",
 "north-at-heather-hill-country-club": "No mapping needed — greens and fairway targets are complete. This one is waiting on three-nine wiring for the 27-hole club (Middle/North/South). Nothing to do in the app until that ships.",
 "oaks-course": "HOLD — do not map yet. \"Oaks Course\" is one course at Palm Aire, a multi-course club (Oaks, Cypress, Palms, Sabals), and it currently shares one mapping with the generic Palm Aire entry. Needs multi-course wiring first; we do that.",
 "palmetto-dunes-george-fazio-golf-course": "Map all 18 greens on the George Fazio course. It is currently sharing Arthur Hills' mapping, so players on Fazio are getting Arthur Hills distances. Leave the Arthur Hills entry alone — it keeps the existing map.",
 "shawnee-golf-country-club-clear-creek-course": "HOLD — do not map yet. Shawnee is one 27-hole club sitting in the library as four entries (Chapel Creek, Clear Creek, Heartland Hills, plus a generic \"Shawnee Country Club\"). It has to be wired as a three-nine in the app before mapping, or the work lands where the app cannot see it. We do the wiring; you will get one facility with three nines to map when it ships.",
 "teton-lakes-golf-course-middle-fork": "HOLD — do not map yet. Middle Fork, South Fork and the Rexburg Golf Club entry are one facility sharing a single mapping. Needs three-nine wiring first; we do that.",
 "the-powder-horn-golf-club-mountain-nine": "HOLD — do not map yet. Powder Horn is already wired as a three-nine (Eagle/Stag/Mountain) under the Eagle Nine entry. This separate Mountain Nine entry is a leftover carrying a duplicate of the same 18-hole mapping; it should be retired, not mapped.",
 "towa-golf-club": "HOLD — do not map yet. Boulder, Piñon and the generic Towa entry are one 27-hole resort sharing a single mapping. Needs three-nine wiring first; we do that.",
 "west-hills-country-club": "No mapping needed — greens and fairway targets are complete. This one is waiting on a scorecard correction: the stored pars disagree with both GolfPass and the mapping. If you have the club's printed card, photograph it and attach it here — that settles it.",
 "willowbend-country-club-bay-nine": "HOLD — do not map yet. Bay Nine and Bog Nine are two nines of one club and currently share a single 18-hole mapping. Needs three-nine wiring first; we do that. You will get one facility with its nines to map when it ships.",
 "ebony-hills-public-golf-course-2": "Check the greens on holes 16-18. The map holds 18 pins but only 15 distinct positions, so three greens sit on top of another hole's green. Ebony Hills is a nine played twice — if that is right, re-drop holes 10-18 on the same greens as 1-9 in the same order; if the back nine is genuinely different, drop the three missing pins.",
 "pine-orchard-yacht-country-club": "Same problem as Ebony Hills: 18 pins but only 15 distinct green positions, so three greens are duplicated. The scorecard and the mapped pars agree 18/18, so the card is right — walk holes 10-18 and drop each green on its own position.",
 "the-glen-golf-park": "Scorecard and mapping disagree on the back nine. The card reads 4,3,3,4,4,3,4,3,4 twice (a nine played twice, par 60). The map's holes 10-18 read 4,4,4,3,4,4,5,5,5 — that is a different golf course. Re-map holes 10-18 on The Glen's own greens, or tell me the card is wrong and I will replace it.",
 "weekapaug-golf-club": "Weekapaug is a nine played twice and the card says so (4,4,3,4,5,4,4,3,5 repeated). The map's holes 10-18 hold the same nine greens but in a rotated order, so 6 of 9 pars land on the wrong hole. Re-drop holes 10-18 to match holes 1-9 hole for hole.",
}

def label(key, cfg):
    """Nine keys the importer never named come through as nine/nine2/nine3.
    Saying 'map the Nine2 nine' to a human is nonsense, so number them instead."""
    n = (cfg or {}).get("name")
    if n and not re.fullmatch(r"nine\d*", str(n).strip().lower()):
        return str(n)
    if re.fullmatch(r"nine\d*", key):
        i = key[4:] or "1"
        return "nine #%s (unnamed in the config)" % i
    return key.replace("-", " ").title()

def main():
    additions = A.singleton("shared:course-library-additions") or []
    deletes = set(A.singleton("shared:course-deletes") or [])
    lib = {e["id"]: e for e in additions
           if isinstance(e, dict) and e.get("id") and e["id"] not in deletes}
    # Tyler, 26 Aug: "sign-off always wins". 48 wired three-nine facilities are
    # admin-verified while still short of a full set of nines (765 greens between
    # them). The app reads those as Complete, so they are NOT Kevin's queue -- if
    # they were, the queue could never equal the Incomplete chip. They are counted
    # on the Summary tab instead, so the cost of that rule stays visible.
    verified = set(A.singleton("shared:course-verified") or [])
    tn = A.load_three_nine_from_app(APP); tn.update(A.load_three_nine_from_db())
    per_nine = {}
    for r in A.fetch_course_gps():
        cid = r["course_id"]
        if "#" in cid:
            b, n = cid.split("#", 1); per_nine.setdefault(b, {})[n] = r

    rows = []
    for cid, e in sorted(lib.items()):
        d = OVERRIDES.get(cid)
        if d is None:
            if cid not in tn or cid in verified:
                continue
            nines = tn[cid]["nines"]
            miss = sorted(n for n in nines
                          if len(A.greens_of((per_nine.get(cid, {}).get(n) or {}).get("holes"))) < 9)
            if not miss:
                continue
            done = sorted(n for n in nines if n not in miss)
            M = ", ".join(label(n, nines[n]) for n in miss)
            D = ", ".join(label(n, nines[n]) for n in done)
            if not done:
                d = ("Map all %d nines (%s) — nothing is mapped here yet. Open the course, "
                     "tap each nine in turn and drop a pin on every green, then set the fairway "
                     "targets. %d greens total." % (len(miss), M, len(miss) * 9))
            elif len(miss) == 1:
                # "Map the nine #2 nine only" reads like a typo, so the word is dropped
                # when the label already carries it.
                d = ("Map the %s%s only (9 greens + fairway targets). %s %s DONE — do not "
                     "remap." % (M, "" if "nine" in M.lower() else " nine",
                                 D, "is" if len(done) == 1 else "are"))
            else:
                d = ("Map these %d nines: %s (%d greens + fairway targets). %s %s DONE — do "
                     "not remap." % (len(miss), M, len(miss) * 9, D,
                                     "is" if len(done) == 1 else "are"))
        rows.append({"id": cid, "name": e.get("name"), "city": e.get("city"),
                     "st": e.get("st"), "status": "sent back", "directive": d})

    json.dump(rows, open(OUT, "w"), indent=1, ensure_ascii=False)
    print("wrote %s - %d rows (%d generated, %d hand-written)"
          % (OUT, len(rows), len(rows) - sum(1 for r in rows if r["id"] in OVERRIDES),
             sum(1 for r in rows if r["id"] in OVERRIDES)))

main()
