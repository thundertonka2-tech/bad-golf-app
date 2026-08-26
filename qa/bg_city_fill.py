#!/usr/bin/env python3
"""
Bad Golf - fill the blank / state-code-only city labels from the US Census
Gazetteer (2023 national places file).

Why not GolfPass: its search endpoints all 404 now, and its city directory pages
only tell you which courses are in a city, not which city a coordinate is in.
The Census Gazetteer is the right shape for this - 32,329 US places with an
internal point - it is authoritative, offline, and needs no rate limiting.

Reads the live library with the read-only anon key, matches each course pin to the
nearest place centre in the same state, and emits SQL for the ones it is confident
about.  Nothing is written from here: the anon key is read-only by design.

    python3 qa/bg_city_fill.py --gazetteer 2023_Gaz_place_national.txt -o cityfix.sql
"""
import argparse, csv, json, math, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bg_mapping_audit as A

MAX_KM = 25.0          # beyond this the nearest town is not a useful label

def load_places(path):
    places = []
    with open(path, encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            row = { (k or "").strip(): (v or "").strip() for k, v in row.items() }
            try:
                lat = float(row["INTPTLAT"]); lng = float(row["INTPTLONG"])
            except (KeyError, ValueError):
                continue
            name = row["NAME"]
            # Consolidated city-counties come through as e.g.
            # "Louisville/Jefferson County metro government (balance)" -- keep the
            # half a golfer would actually say.
            name = re.sub(r"\s*\(balance\)\s*$", "", name, flags=re.I)
            name = re.sub(
                r"\s+(metro government|consolidated government|unified government)$",
                "", name, flags=re.I)
            name = re.sub(r"[-/]\s*[A-Za-z .']+ (County|Parish|Borough)$", "", name)
            name = name.split("/")[0].strip()
            name = re.sub(
                r"\s+(CDP|city|town|village|borough|municipality|urban county|"
                r"corporation|comunidad|zona urbana)$", "", name, flags=re.I).strip()
            if name:
                places.append((row["USPS"], name, lat, lng))
    return places

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gazetteer", required=True)
    ap.add_argument("-o", "--out", default="cityfix.sql")
    ap.add_argument("--max-km", type=float, default=MAX_KM)
    args = ap.parse_args()

    if not A.ANON_KEY:
        sys.exit("Set BG_SUPABASE_ANON_KEY.")

    additions = A.singleton("shared:course-library-additions") or []
    deletes = set(A.singleton("shared:course-deletes") or [])

    places = load_places(args.gazetteer)
    by_state = {}
    for st, name, lat, lng in places:
        by_state.setdefault(st, []).append((name, lat, lng))
    print(f"gazetteer: {len(places):,} places in {len(by_state)} states", file=sys.stderr)

    fixes, far, nostate = [], [], []
    for e in additions:
        if not isinstance(e, dict) or not e.get("id") or e["id"] in deletes:
            continue
        city = (e.get("city") or "").strip()
        st = (e.get("st") or "").strip()
        if city and city != st:
            continue                              # already has a real city
        if e.get("lat") is None or e.get("lng") is None:
            continue
        cand = by_state.get(st)
        if not cand:
            nostate.append(e["id"]); continue
        lat, lng = float(e["lat"]), float(e["lng"])
        # cheap prefilter, then exact haversine on the short list
        near = [c for c in cand if abs(c[1] - lat) < 0.6 and abs(c[2] - lng) < 0.8] or cand
        scored = []
        for name, plat, plng in near:
            d = A.km(lat, lng, plat, plng)
            if d is not None:
                scored.append((d, name))
        if not scored:
            continue
        scored.sort()
        # Some Census CDPs are named after the golf club itself ("Crystal Downs
        # Country Club"). Labelling a course with its own name tells nobody where it
        # is, so skip those in favour of the next real place.
        cname = re.sub(r"[^a-z0-9]", "", (e.get("name") or "")).lower()
        scored = [t for t in scored
                  if not (cname and re.sub(r"[^a-z0-9]", "", t[1]).lower() == cname)] or scored
        best, bestkm = scored[0][1], scored[0][0]
        # Name agreement beats raw proximity. "McAllen Country Club" sits 3.9 km from
        # Pharr and 4.4 km from McAllen; the club is in McAllen. Whenever a candidate
        # town's name is embedded in the course's own name, and it is within a sane
        # distance, trust the name over the extra kilometre.
        # ...but only when the named town is genuinely nearby. Plenty of clubs are
        # named for a city they are not in - Milwaukee CC is in River Hills, Portland
        # GC is in Raleigh Hills - so the override is capped: the named place must be
        # within 8 km and no more than twice as far as the closest candidate.
        slug = re.sub(r"[^a-z0-9]", "", (e.get("name") or "") + " " + e["id"]).lower()
        for d, name in scored:
            if d > min(8.0, args.max_km):
                break
            key = re.sub(r"[^a-z0-9]", "", name).lower()
            if len(key) >= 5 and key in slug and d <= max(2.0, bestkm * 2):
                best, bestkm = name, d
                break
        (fixes if bestkm <= args.max_km else far).append((e["id"], best, st, round(bestkm, 2)))

    fixes.sort(key=lambda r: r[3])
    print(f"confident (<= {args.max_km} km): {len(fixes):,}", file=sys.stderr)
    print(f"too far / left alone:            {len(far):,}", file=sys.stderr)
    print(f"no gazetteer rows for state:     {len(nostate):,}", file=sys.stderr)
    if fixes:
        print("  median km: %.2f" % fixes[len(fixes)//2][3], file=sys.stderr)

    with open(args.out, "w", encoding="utf-8") as f:
        f.write("-- generated by qa/bg_city_fill.py -- city labels from the US Census Gazetteer\n")
        f.write("-- one row per course: (id, city). Apply with the service role.\n")
        f.write("create temporary table bg_cityfix_in (id text primary key, city text);\n")
        f.write("insert into bg_cityfix_in(id,city) values\n")
        f.write(",\n".join("('%s','%s')" % (i, c.replace("'", "''")) for i, c, _s, _k in fixes))
        f.write(";\n")
    json.dump([{"id": i, "city": c, "st": s, "km": k} for i, c, s, k in fixes],
              open(args.out.replace(".sql", ".json"), "w"), indent=1)
    print("wrote", args.out, file=sys.stderr)

if __name__ == "__main__":
    main()
