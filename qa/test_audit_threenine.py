"""Regression test: the audit must NOT flag wired three-nine facilities.

Locks in the 2026-08-26 finding.  All 15 courses that the previous audit reported
under items 11 ("no scorecard at all") and 12 ("card but no rated tee") are wired
three-nines whose cards and ratings live in THREE_NINE_COURSES.  If this test ever
goes red, the audit has gone blind again and its output cannot be trusted.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bg_mapping_audit as A

APP = sys.argv[1] if len(sys.argv) > 1 else "golf-app.html"

ITEM_11 = ["peninsula-gulf-shores", "arrowhead-country-club-4", "keith-hills-golf-club"]
ITEM_12 = ["old-channel-trail", "briarwood-golf-club", "copper-hills-golf-and-country-club",
           "twin-lakes-golf-swim-club", "silver-wings-golf-course", "tubac-golf-resort-spa",
           "the-hollows-golf-club", "shenvalee-golf-resort", "stoney-creek-golf-course",
           "grapevine-golf-course", "belle-glade-country-club-the-villages",
           "west-woods-ranch-golf-club"]

tn = A.load_three_nine_from_app(APP)
p = f = 0
def ok(name, cond):
    global p, f
    if cond: p += 1; print("  ok  " + name)
    else:    f += 1; print("  FAIL " + name)

print("\n1. every flagged course is recognised as a wired three-nine")
for cid in ITEM_11 + ITEM_12:
    ok(cid, cid in tn)

print("\n2. every one carries pars for all its nines")
for cid in ITEM_11 + ITEM_12:
    cfg = tn.get(cid) or {"nines": {}}
    ok(cid + " nines>=3", len(cfg["nines"]) >= 3)
    ok(cid + " 9 pars each", all(len(n["pars"]) == 9 for n in cfg["nines"].values()))

print("\n3. every one is rated (combos or per-nine)")
for cid in ITEM_11 + ITEM_12:
    ok(cid + " rated", bool((tn.get(cid) or {}).get("rated")))

print("\n4. the whole wired library parses, and none of it is unrated")
ok("parsed >= 100 facilities", len(tn) >= 100)
unrated = [c for c, v in tn.items() if not v["rated"]]
ok("zero unrated facilities (%d)" % len(unrated), not unrated)
if unrated: print("      unrated:", ", ".join(sorted(unrated)[:10]))
noparse = [c for c, v in tn.items() if not v["nines"]]
ok("every facility yielded nines (%d bad)" % len(noparse), not noparse)
if noparse: print("      no nines:", ", ".join(sorted(noparse)[:10]))

print("\n5. a plain 18-hole course is NOT treated as a three-nine")
for cid in ["bethpage-black", "the-500-club", "salt-lake-country-club"]:
    ok(cid + " not TN", cid not in tn)

print(f"\n{p} passed, {f} failed")
sys.exit(1 if f else 0)
