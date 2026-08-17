#!/usr/bin/env python3
"""
Bad Golf v1069 - wire Cleveland Heights Golf Course (Lakeland FL) as a three-nine.

Azalea / Bougainvillea / Camellia, a 27-hole municipal. Sourced from the club itself
(clevelandheightsgolf.com), which is better than the usual aggregators for two reasons:

  * it publishes the 18-hole rating and slope for all three combinations, on all three
    tees - so the per-nine figures are FACTORED from official numbers rather than guessed;
  * it publishes a 1-9 stroke index per nine, which is exactly what the app stores. Every
    other facility so far has forced a reverse-engineering job from combination cards that
    disagree with each other. Here there is nothing to reconcile.

Reconstruction check: every published combination rebuilds exactly from the factored
nines - rating and slope, on Blue, White and Red, all three pairings. PASS.

Par is 4-sourced (the club's own yardage-book images, golfify, offcourse, hole19) and
yardages are 3-sourced with every nine-total independently cross-checked. Red is the
WOMEN'S rating, confirmed on two sources, so it is wired as "Red (W)" per house pattern.

Known gap: Azalea hole 5 plays par 4 for men and par 5 for women; the men's 4 is stored,
which is the app's convention. Gold and Green tee sets appear to exist but no hole-by-hole
yardage for them is published anywhere.

Usage: python3 wire_cleveland.py golf-app.html www/index.html
"""
import sys, re, shutil

CFG = """const CLEVELANDHEIGHTS_NINES = {
  _label: 'Cleveland Heights Golf Course',
  azalea: { name: 'Azalea',
    pars:[4,3,4,4,4,5,4,5,3], hdcp:[5,8,6,7,2,3,9,1,4],
    tees:[
      { label:'Blue', rating:35.3, slope:122, yds:[360,202,352,339,440,487,314,536,188] },
      { label:'White', rating:34.5, slope:119, yds:[351,179,334,328,404,454,294,515,174] },
      { label:'Red (W)', rating:35.7, slope:121, yds:[316,131,322,318,372,373,274,470,164] },
    ] },
  bougainvillea: { name: 'Bougainvillea',
    pars:[4,4,4,3,5,3,4,5,4], hdcp:[8,7,3,9,5,4,1,2,6],
    tees:[
      { label:'Blue', rating:34.7, slope:122, yds:[329,338,386,157,495,180,418,464,360] },
      { label:'White', rating:33.8, slope:117, yds:[319,326,328,148,431,165,402,442,343] },
      { label:'Red (W)', rating:35.3, slope:121, yds:[309,268,272,141,412,140,387,416,289] },
    ] },
  camellia: { name: 'Camellia',
    pars:[4,4,4,4,5,4,4,3,4], hdcp:[7,2,5,8,3,4,1,9,6],
    tees:[
      { label:'Blue', rating:35.6, slope:124, yds:[335,403,348,390,505,389,421,168,340] },
      { label:'White', rating:34.6, slope:121, yds:[320,394,331,317,496,372,385,150,327] },
      { label:'Red (W)', rating:35.8, slope:119, yds:[297,370,315,222,418,369,374,141,305] },
    ] },
  combos: {
    'azalea+bougainvillea': [ {label:'Blue',rating:70.0,slope:122}, {label:'White',rating:68.3,slope:118}, {label:'Red (W)',rating:71.0,slope:121} ],
    'azalea+camellia': [ {label:'Blue',rating:70.9,slope:123}, {label:'White',rating:69.1,slope:120}, {label:'Red (W)',rating:71.5,slope:120} ],
    'bougainvillea+camellia': [ {label:'Blue',rating:70.3,slope:123}, {label:'White',rating:68.4,slope:119}, {label:'Red (W)',rating:71.1,slope:120} ],
  },
  searchCombos: [ ['azalea','bougainvillea'], ['bougainvillea','camellia'], ['camellia','azalea'] ]
};"""
LIBID, CONST = 'cleveland-heights-golf-course', 'CLEVELANDHEIGHTS_NINES'
ANCHOR = 'const THREE_NINE_COURSES = {'
NINES = ('azalea', 'bougainvillea', 'camellia')


def patch(path):
    s = open(path, encoding='utf-8').read()
    n0, len0 = s.count('\n'), len(s)
    assert s.count(ANCHOR) == 1, f'{path}: THREE_NINE_COURSES anchor not found once - ABORT'
    assert f'const {CONST} = {{' not in s, f'{path}: {CONST} already present - ABORT'
    assert f"'{LIBID}'" not in s, f'{path}: {LIBID} already referenced - ABORT'

    m = re.search(r"const BG_BUILD = 'v(\d{4})\.(\d+)\.(\d+)';", s)
    assert m, f'{path}: BG_BUILD not found - ABORT'
    old = m.group(0)
    new = "const BG_BUILD = 'v%s.%s.%d';" % (m.group(1), m.group(2), int(m.group(3)) + 1)

    out = s.replace(ANCHOR, CFG + '\n' + ANCHOR + f"\n  '{LIBID}': {CONST},", 1).replace(old, new, 1)

    assert out.count(f"'{LIBID}': {CONST},") == 1, f'{path}: registration did not land - ABORT'
    assert out.count(f'const {CONST} = {{') == 1, f'{path}: constant did not land - ABORT'
    # every combos key must be the two nine names SORTED, or buildNineCombo never finds it
    body = out[out.index(f'const {CONST} = {{'):]
    body = body[:body.index('const THREE_NINE_COURSES')]
    keys = re.findall(r"'([a-z]+\+[a-z]+)':", body)
    assert len(keys) == 3, f'{path}: expected 3 combos, found {len(keys)} - ABORT'
    for k in keys:
        a, b = k.split('+')
        assert a in NINES and b in NINES, f'{path}: combo {k} names an unknown nine - ABORT'
        assert '+'.join(sorted([a, b])) == k, f'{path}: combo key {k} is not sorted - ABORT'
    for n in NINES:
        assert f'{n}: {{ name:' in body, f'{path}: nine {n} missing - ABORT'
    assert out.count('<script') == s.count('<script') and out.count('</script>') == s.count('</script>'), f'{path}: script tags changed - ABORT'
    assert out.rstrip().endswith('</html>'), f'{path}: file no longer ends in </html> - ABORT'
    assert len(out) > len0 and out.count('\n') > n0, f'{path}: file shrank - ABORT'

    shutil.copy2(path, path + '.bak')
    open(path, 'w', encoding='utf-8').write(out)
    print('OK  %s  %s -> %s  (+%d bytes)' % (path, old.split("'")[1], new.split("'")[1], len(out) - len0))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit('usage: wire_cleveland.py golf-app.html www/index.html')
    for p in sys.argv[1:]:
        patch(p)
    print('\nBoth files must be patched. node --check, run check_nines.py, then commit.')
