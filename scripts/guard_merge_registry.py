#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bad Golf pre-commit guard - THE MERGE REGISTRY  (v1503/v1504, Tyler 2026-09-06)
================================================================================
Why this exists
---------------
_mergeGameForWrite used to decide what to do with each key of a round by
consulting several hard-coded lists. A key in NONE of them fell through to an
unwritten default of "local wins, always" - silent, invisible, and only ever
discovered when somebody's money came out wrong. It happened five times:

    v1161  longPuttData      "I had to add the long putt two or three times"
    v1223  broadcast markers a phone reverted the group hole for everyone
    v1499  settledMoney      Tyler's history read +40 for a round he won 20 on
    v1500  sixteen more      incl. paidFlags (who has PAID) and strokeHole
    v1502  the rank rule     written for upload, never for download

v1503 replaced those lists with ONE declarative table, BG_MERGE_RULES, which the
merge derives its behaviour from. This guard makes the table impossible to forget:
it scans the source for every key written onto a round and BLOCKS THE COMMIT if
one is not classified.

On its very first run it found six: scrambleData, animalData, marksData and
potatoData (four per-hole game maps in no merge list at all), longDriveData (the
v1161 long-putt bug sitting unfixed beside it), and forceFinishedBy.

What it checks
--------------
  1. golf-app.html and www/index.html declare the SAME registry (web/iOS drift).
  2. Every rule value is one of the known rules.
  3. Every key assigned onto a round object anywhere in the file is in the
     registry - or is listed, with a reason, in scripts/merge_registry_ignore.txt.

Adding a round field now forces you to say how it merges before it can ship.

Exit 0 = All clear. Exit 1 = blocked, with the exact line to add printed for you.
"""
import os, re, sys

HERE  = os.path.dirname(os.path.abspath(__file__))
ROOT  = os.path.dirname(HERE)
FILES = [os.path.join(ROOT, 'golf-app.html'), os.path.join(ROOT, 'www', 'index.html')]
IGNORE_FILE = os.path.join(HERE, 'merge_registry_ignore.txt')

RULES = ('identity', 'perCell', 'holeMap', 'holeMap:holes', 'newestAt', 'cloudWins', 'custom')

# Variables that hold a ROUND object in this codebase. `games`/`gg` are deliberately
# NOT here - those hold the games map, whose keys are game names, not round keys.
ROUND_VARS = ('g', 'game', 'local', 'cloud', '_g', 'rg')
ASSIGN = re.compile(r'\b(' + '|'.join(ROUND_VARS) + r')\.([A-Za-z_$][\w$]*)\s*=(?!=)')

def note(s=''): print(s)

def extract_registry(src, path):
    m = re.search(r'const BG_MERGE_RULES\s*=\s*\{', src)
    if not m:
        note('  %s: BG_MERGE_RULES not found — has it been renamed or lost?' % os.path.basename(path))
        return None
    i = src.index('{', m.end() - 1)
    depth = 0
    for j in range(i, len(src)):
        if src[j] == '{': depth += 1
        elif src[j] == '}':
            depth -= 1
            if depth == 0:
                body = src[i:j + 1]; break
    else:
        note('  %s: BG_MERGE_RULES is not closed — the file may be truncated.' % os.path.basename(path))
        return None
    out = {}
    for key, rule in re.findall(r"([A-Za-z_$][\w$]*)\s*:\s*'([^']+)'", body):
        out[key] = rule
    return out

def load_ignore():
    keys = {}
    if not os.path.exists(IGNORE_FILE): return keys
    with open(IGNORE_FILE, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'): continue
            k, _, why = line.partition('#')
            keys[k.strip()] = why.strip()
    return keys

def main():
    note('-- Bad Golf merge-registry guard ---------------------------------')
    regs, srcs = {}, {}
    for p in FILES:
        if not os.path.exists(p):
            note('  missing file: %s' % p); return 1
        srcs[p] = open(p, encoding='utf-8').read()
        r = extract_registry(srcs[p], p)
        if r is None: return 1
        regs[p] = r

    a, b = FILES[0], FILES[1]
    if regs[a] != regs[b]:
        only_a = sorted(set(regs[a]) - set(regs[b]))
        only_b = sorted(set(regs[b]) - set(regs[a]))
        diff   = sorted(k for k in set(regs[a]) & set(regs[b]) if regs[a][k] != regs[b][k])
        note('  WEB / iOS REGISTRY DRIFT — the same edit must land in BOTH files.')
        if only_a: note('    only in golf-app.html : ' + ', '.join(only_a))
        if only_b: note('    only in www/index.html: ' + ', '.join(only_b))
        for k in diff:
            note('    %s: golf-app=%s  www=%s' % (k, regs[a][k], regs[b][k]))
        return 1

    reg = regs[a]
    bad = sorted(k for k, v in reg.items() if v not in RULES)
    if bad:
        note('  UNKNOWN RULE on: ' + ', '.join('%s (%s)' % (k, reg[k]) for k in bad))
        note('  valid rules: ' + ', '.join(RULES))
        return 1

    ignore = load_ignore()
    found, fails = {}, 0
    for p in FILES:
        for ln, line in enumerate(srcs[p].split('\n'), 1):
            if line.lstrip().startswith('//'): continue      # a comment is not a write
            for _var, key in ASSIGN.findall(line):
                if key in reg or key in ignore: continue
                found.setdefault(key, (os.path.basename(p), ln, line.strip()[:100]))

    note('  %d keys classified   (%s)' % (
        len(reg), ', '.join('%s %d' % (r, sum(1 for v in reg.values() if v == r)) for r in RULES)))
    if ignore: note('  %d ignored keys declared in merge_registry_ignore.txt' % len(ignore))

    if found:
        note('')
        note('  BLOCKED — %d round key(s) are written but NOT classified:' % len(found))
        for k in sorted(found):
            f, ln, txt = found[k]
            note('')
            note('    %s   (%s:%d)' % (k, f, ln))
            note('      %s' % txt)
        note('')
        note('  A key with no rule silently defaults to "local wins, always" — the exact')
        note('  defect that produced v1161, v1223, v1499, v1500 and v1502.')
        note('')
        note('  Fix it ONE of two ways, in BOTH files:')
        note('    1. classify it — add to BG_MERGE_RULES, e.g.')
        for k in sorted(found):
            note("         %s: 'holeMap'," % k)
        note('       rules: ' + ', '.join(RULES))
        note('    2. or, if it is NOT a stored round field (a DOM handle, a transient')
        note('       diagnostic, a local-only flag), declare it in')
        note('       scripts/merge_registry_ignore.txt, one per line with a reason:')
        for k in sorted(found):
            note('         %-22s # why this is not a stored round field' % k)
        note('')
        note('  Do NOT use `git commit --no-verify` — that also switches off the')
        note('  truncation, shrink, symbol-drop and BGVER checks.')
        note('------------------------------------------------------------------')
        return 1

    note('')
    note('  All clear.')
    note('------------------------------------------------------------------')
    return 0

if __name__ == '__main__':
    sys.exit(main())
