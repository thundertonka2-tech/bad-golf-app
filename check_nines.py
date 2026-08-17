#!/usr/bin/env python3
"""Audit every wired three-nine facility in the app.

A three-nine facility that is wired WRONG fails silently: a combo key the lookup never
matches just falls back, a duplicate registration key is quietly discarded by the JS
object literal, a bad hdcp misallocates strokes. None of it throws. This checks all of
it against the live file.

Usage: python3 check_nines.py golf-app.html
"""
import sys, re, json, collections

src = open(sys.argv[1], encoding='utf-8').read()

def block(text, start):
    """Return the {...} run beginning at `start` INSIDE `text`.
    This used to index `src` while being handed offsets into a sub-string, so every
    combos map came back empty and 99 healthy facilities were reported as broken."""
    d = 0
    for j in range(start, len(text)):
        if text[j] == '{': d += 1
        elif text[j] == '}':
            d -= 1
            if d == 0: return text[start:j+1]
    return ''

consts = {}
for m in re.finditer(r"const ([A-Z0-9_]+_NINES) = (\{)", src):
    consts[m.group(1)] = block(src, m.start(2))

i = src.index('const THREE_NINE_COURSES = {')
mapbody = block(src, src.index('{', i))
regs = re.findall(r"'([a-z0-9\-]+)'\s*:\s*([A-Z0-9_]+_NINES)", mapbody)

issues = collections.defaultdict(list)

# --- duplicate registration keys: the later one silently wins
seen = {}
for k, c in regs:
    if k in seen and seen[k] != c:
        issues['duplicate registration key (JS keeps the LAST one)'].append(f'{k}: {seen[k]} discarded, {c} live')
    seen[k] = c

# --- consts declared but never registered
used = {c for _, c in regs}
for c in consts:
    if c not in used:
        issues['constant declared but never registered (dead code)'].append(c)

NINE_RE = re.compile(r'[\'"]?([a-z][a-z0-9_]*)[\'"]?\s*:\s*\{\s*[\'"]?name[\'"]?\s*:')
def nine_keys(body):
    out = []
    for m in NINE_RE.finditer(body):
        k = m.group(1)
        if k in ('combos', 'searchCombos', '_label'): continue
        out.append(k)
    return out

for key, cname in seen.items():
    body = consts.get(cname)
    if not body:
        issues['registered to a constant that does not exist'].append(f'{key} -> {cname}')
        continue
    nines = nine_keys(body)
    if len(nines) < 2:
        issues['fewer than two nines found in the constant'].append(f'{cname} ({nines})')
        continue

    # pars / hdcp per nine
    for nk in nines:
        seg = body[body.index(nk + ':') if nk + ':' in body else 0:][:1400]
        p = re.search(r'[\'"]?pars[\'"]?\s*:\s*\[([^\]]+)\]', seg)
        h = re.search(r'[\'"]?hdcp[\'"]?\s*:\s*\[([^\]]+)\]', seg)
        if p:
            vals = [int(x) for x in re.findall(r'-?\d+', p.group(1))]
            if len(vals) != 9:
                issues['a nine does not have 9 pars'].append(f'{cname}.{nk} has {len(vals)}')
        if h:
            vals = [int(x) for x in re.findall(r'-?\d+', h.group(1))]
            if sorted(vals) != list(range(1, 10)):
                issues['hdcp is not a clean 1-9 permutation (strokes will misallocate)'].append(f'{cname}.{nk} = {vals}')

    # combo keys must be the two nine keys SORTED and joined with '+'
    cm = re.search(r'[\'"]?combos[\'"]?\s*:\s*\{', body)
    if not cm:
        issues['no combos map'].append(cname)
        continue
    cbody = block(body, body.index('{', cm.end() - 1))
    ckeys = re.findall(r'[\'"]([a-z0-9_]+\+[a-z0-9_]+)[\'"]\s*:', cbody)
    if not ckeys:
        issues['combos map is empty'].append(cname)
    for ck in ckeys:
        a, b = ck.split('+')
        if a not in nines or b not in nines:
            issues['combo names a nine that does not exist'].append(f'{cname}: {ck} (nines are {nines})')
        elif '+'.join(sorted([a, b])) != ck:
            issues['combo key is not sorted - the lookup will never match it'].append(f'{cname}: {ck} should be ' + '+'.join(sorted([a, b])))
    # every pair of nines should have a combo
    if len(nines) == 3:
        want = {'+'.join(sorted(p)) for p in [(nines[0], nines[1]), (nines[1], nines[2]), (nines[0], nines[2])]}
        missing = want - set(ckeys)
        if missing:
            issues['a playable pairing has no published combo'].append(f'{cname}: missing {sorted(missing)}')

    # searchCombos must reference real nines
    sc = re.search(r'[\'"]?searchCombos[\'"]?\s*:\s*\[(.*?)\]\s*[,}]', body, re.S)
    if sc:
        for pair in re.findall(r'\[\s*[\'"]([a-z0-9_]+)[\'"]\s*,\s*[\'"]([a-z0-9_]+)[\'"]\s*\]', sc.group(1)):
            for x in pair:
                if x not in nines:
                    issues['searchCombos names a nine that does not exist'].append(f'{cname}: {x}')

    # rating sanity
    for r in re.findall(r'[\'"]?rating[\'"]?\s*:\s*([\d.]+)', cbody):
        v = float(r)
        if not (55 <= v <= 82):
            issues['combo rating outside a believable 18-hole range'].append(f'{cname}: {v}')
    ninebody = body[:body.index('combos') if 'combos' in body else len(body)]
    for r in re.findall(r'[\'"]?rating[\'"]?\s*:\s*([\d.]+)', ninebody):
        v = float(r)
        if not (25 <= v <= 45):
            issues['per-nine rating outside a believable 9-hole range'].append(f'{cname}: {v}')

print(f'facilities registered : {len(seen)}')
print(f'constants declared    : {len(consts)}')
print()
if not issues:
    print('no problems found')
for k, v in sorted(issues.items(), key=lambda kv: -len(kv[1])):
    print(f'{len(v):4d}  {k}')
    for x in v[:8]:
        print(f'         {x}')
    if len(v) > 8: print(f'         ... and {len(v)-8} more')
json.dump({k: v for k, v in issues.items()}, open('nine_issues.json', 'w'), indent=1)
print('\nwritten to nine_issues.json')
