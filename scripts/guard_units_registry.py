#!/usr/bin/env python3
"""guard_units_registry.py — BG_UNITS_SETTLE must cover every game the money engine settles.

Added with the v1709 Units tab. Same idea as guard_merge_registry.py, and for the same
reason: the Units view classifies each game as paying PER HOLE or settling AFTER 18, and
a game that is missing from BG_UNITS_SETTLE silently falls through to the per-hole
default. For a game that really settles at the end that means its whole stake lands on
one arbitrary hole and the card prints a number nothing on that hole earned — a money
display that disagrees with the money. Silent, plausible-looking, and exactly the class
of bug the merge registry guard was written for after v1504.

Checks, against BOTH shipped files:
  1. every key in computeAllGameMoney's `results` object is in BG_UNITS_SETTLE
  2. no stale key in BG_UNITS_SETTLE that the engine no longer returns
  3. every value is one of 'hole' | 'end' | 'pool?'
  4. both files declare the identical registry

Usage:  python3 scripts/guard_units_registry.py        (exit 0 = clean)
"""
import re, sys, os

FILES = ['golf-app.html', os.path.join('www', 'index.html')]
VALID = {'hole', 'end', 'pool?'}


def main_script(s):
    blocks = []
    for m in re.finditer(r'<script(?![^>]*\bsrc=)[^>]*>', s):
        a = m.end()
        b = s.find('</script>', a)
        if b > -1:
            blocks.append(s[a:b])
    return max(blocks, key=len) if blocks else ''


def engine_keys(js):
    i = js.find('function computeAllGameMoney(g)')
    if i < 0:
        raise SystemExit('guard_units_registry: computeAllGameMoney not found')
    j = js.find('const results = {', i)
    k = js.find('\n  };', j)
    if j < 0 or k < 0:
        raise SystemExit('guard_units_registry: could not read the results object')
    return set(re.findall(r'^\s*([A-Za-z0-9_]+)\s*:', js[j:k], re.M))


def registry(js):
    j = js.find('const BG_UNITS_SETTLE = {')
    if j < 0:
        raise SystemExit('guard_units_registry: BG_UNITS_SETTLE not found — did the Units view get dropped?')
    k = js.find('\n};', j)
    body = js[j:k]
    return dict(re.findall(r"([A-Za-z0-9_]+)\s*:\s*'([^']+)'", body))


fail = 0
seen = {}
for f in FILES:
    if not os.path.exists(f):
        print('MISSING FILE ' + f)
        fail = 1
        continue
    js = main_script(open(f, encoding='utf-8').read())
    eng, reg = engine_keys(js), registry(js)
    seen[f] = reg
    missing = sorted(eng - set(reg))
    stale = sorted(set(reg) - eng)
    bad = sorted(k for k, v in reg.items() if v not in VALID)
    print('== %s  (%d engine games, %d classified)' % (f, len(eng), len(reg)))
    if missing:
        print('   FAIL not classified in BG_UNITS_SETTLE: ' + ', '.join(missing))
        print('        pick one: hole (pays on the hole it was won) | end (one stake or'
              ' pool decided after 18) | pool? (whichever, by cfg.mode)')
        fail = 1
    if stale:
        print('   FAIL classified but the engine no longer returns it: ' + ', '.join(stale))
        fail = 1
    if bad:
        print('   FAIL not a valid rule: ' + ', '.join(bad))
        fail = 1
    if not (missing or stale or bad):
        print('   clean')

vals = list(seen.values())
if len(vals) == 2 and vals[0] != vals[1]:
    print('FAIL the two files declare different registries')
    fail = 1

print('UNITS REGISTRY GUARD: ' + ('FAILED' if fail else 'All clear'))
sys.exit(fail)
