#!/usr/bin/env python3
"""Wire Gainey Ranch Golf Club (Scottsdale AZ) as a three-nine facility.

Arroyo / Lakes / Dunes, factored from the three published GolfPass combination pages by
the USGA two-nine method. Reconstruction of par, rating, slope and yardage across all
three combinations and every tee, men's and women's: PASS.

STROKE INDEX CAVEAT - read before trusting handicap allocation here. GolfPass publishes a
DIFFERENT stroke index for the same nine depending on which combination page you read,
and 18Birdies publishes a third. There is no single published per-nine index to reconcile
them. The hdcp stored per nine is rank-compressed from that nine's appearance as the
FRONT nine on GolfPass, so it reproduces one published combination exactly and differs
from the other two. Pars and ratings are solid; the allocation of strokes across holes
needs confirming against the club's printed card.

Usage: python3 wire_gainey.py golf-app.html www/index.html
"""
import sys, re, shutil
CFG = """const GAINEYRANCH_NINES = {
  _label: 'Gainey Ranch Golf Club',
  arroyo: { name: 'Arroyo',
    pars:[4,3,4,4,5,3,4,4,5], hdcp:[4,9,5,1,6,8,7,2,3],
    tees:[
      { label:'Gold', rating:36.1, slope:133, yds:[386,207,374,404,533,173,384,408,555] },
      { label:'Gainey', rating:35.5, slope:131, yds:[386,182,345,404,533,165,384,390,527] },
      { label:'Green', rating:35.2, slope:126, ratingW:38.4, slopeW:147, yds:[356,182,345,374,495,165,349,390,527] },
      { label:'Ranch', rating:34.7, slope:125, yds:[356,170,338,374,466,145,349,367,527] },
      { label:'White', rating:34.1, slope:119, ratingW:37.3, slopeW:142, yds:[341,170,338,324,466,145,313,367,507] },
      { label:'Club', ratingW:36.3, slopeW:134, yds:[310,142,311,306,466,145,313,345,507] },
      { label:'Magenta', rating:33.1, slope:115, ratingW:35.8, slopeW:130, yds:[310,142,311,306,449,125,294,345,453] },
    ] },
  lakes: { name: 'Lakes',
    pars:[4,4,4,3,5,4,4,3,5], hdcp:[4,9,5,8,2,6,1,7,3],
    tees:[
      { label:'Gold', rating:36.2, slope:127, yds:[394,365,395,190,521,411,410,198,492] },
      { label:'Gainey', rating:35.5, slope:125, yds:[363,365,395,170,521,386,410,156,492] },
      { label:'Green', rating:34.4, slope:124, ratingW:38.0, slopeW:139, yds:[363,333,352,170,493,386,379,156,437] },
      { label:'Ranch', rating:33.7, slope:119, yds:[330,333,326,141,493,364,379,156,420] },
      { label:'White', rating:33.3, slope:117, ratingW:36.3, slopeW:136, yds:[330,285,326,141,468,364,353,132,420] },
      { label:'Club', ratingW:35.3, slopeW:134, yds:[330,285,304,141,447,346,326,109,420] },
      { label:'Magenta', rating:32.2, slope:113, ratingW:34.7, slopeW:130, yds:[280,264,304,114,447,346,326,109,387] },
    ] },
  dunes: { name: 'Dunes',
    pars:[4,4,4,3,4,5,4,3,5], hdcp:[3,7,6,8,4,2,5,9,1],
    tees:[
      { label:'Gold', rating:35.2, slope:129, yds:[388,305,345,187,396,506,390,186,550] },
      { label:'Gainey', rating:34.6, slope:125, yds:[388,284,345,150,396,506,365,186,506] },
      { label:'Green', rating:33.7, slope:122, ratingW:36.7, slopeW:121, yds:[357,284,315,150,336,481,365,156,506] },
      { label:'Ranch', rating:33.1, slope:115, yds:[331,284,315,114,336,481,297,156,487] },
      { label:'White', rating:32.6, slope:113, ratingW:35.6, slopeW:116, yds:[331,255,300,114,320,458,297,148,487] },
      { label:'Club', ratingW:34.5, slopeW:114, yds:[331,255,300,114,279,406,260,148,454] },
      { label:'Magenta', rating:31.2, slope:103, ratingW:33.8, slopeW:112, yds:[312,229,265,92,279,406,260,119,454] },
    ] },
  combos: {
    'arroyo+lakes': [ {label:'Gold',rating:72.3,slope:130}, {label:'Gainey',rating:71,slope:128}, {label:'Green',rating:69.6,slope:125,ratingW:76.4,slopeW:143}, {label:'Ranch',rating:68.4,slope:122}, {label:'White',rating:67.4,slope:118,ratingW:73.6,slopeW:139}, {label:'Club',ratingW:71.6,slopeW:134}, {label:'Magenta',rating:65.3,slope:114,ratingW:70.5,slopeW:130} ],
    'dunes+lakes': [ {label:'Gold',rating:71.4,slope:128}, {label:'Gainey',rating:70.1,slope:125}, {label:'Green',rating:68.1,slope:123,ratingW:74.7,slopeW:130}, {label:'Ranch',rating:66.8,slope:117}, {label:'White',rating:65.9,slope:115,ratingW:71.9,slopeW:126}, {label:'Club',ratingW:69.8,slopeW:124}, {label:'Magenta',rating:63.4,slope:108,ratingW:68.5,slopeW:121} ],
    'arroyo+dunes': [ {label:'Gold',rating:71.3,slope:131}, {label:'Gainey',rating:70.1,slope:128}, {label:'Green',rating:68.9,slope:124,ratingW:75.1,slopeW:134}, {label:'Ranch',rating:67.8,slope:120}, {label:'White',rating:66.7,slope:116,ratingW:72.9,slopeW:129}, {label:'Club',ratingW:70.8,slopeW:124}, {label:'Magenta',rating:64.3,slope:109,ratingW:69.6,slopeW:121} ],
  },
  searchCombos: [ ['arroyo','lakes'], ['lakes','dunes'], ['dunes','arroyo'] ]
};"""
LIBID, CONST = 'gainey-ranch-golf-club', 'GAINEYRANCH_NINES'
ANCHOR = 'const THREE_NINE_COURSES = {'

def patch(path):
    s = open(path, encoding='utf-8').read()
    n0, len0 = s.count('\n'), len(s)
    assert s.count(ANCHOR) == 1, f'{path}: THREE_NINE_COURSES anchor not found once - ABORT'
    assert f'const {CONST} = {{' not in s, f'{path}: {CONST} already present - ABORT'
    assert f"'{LIBID}': {CONST}" not in s, f'{path}: {LIBID} already registered - ABORT'
    m = re.search(r"const BG_BUILD = 'v(\d{4})\.(\d+)\.(\d+)';", s)
    assert m, f'{path}: BG_BUILD not found - ABORT'
    old, new = m.group(0), "const BG_BUILD = 'v%s.%s.%d';" % (m.group(1), m.group(2), int(m.group(3)) + 1)

    out = s.replace(ANCHOR, CFG + '\n' + ANCHOR + '\n  ' + f"'{LIBID}': {CONST}," , 1).replace(old, new, 1)

    assert out.count(f"'{LIBID}': {CONST},") == 1, f'{path}: registration did not land - ABORT'
    assert out.count(f'const {CONST} = {{') == 1, f'{path}: const did not land - ABORT'
    for nine in ("arroyo:", "lakes:", "dunes:"):
        assert out.count(nine) >= 1, f'{path}: nine {nine} missing - ABORT'
    assert out.count('<script') == s.count('<script') and out.count('</script>') == s.count('</script>'), f'{path}: script tags changed - ABORT'
    assert out.rstrip().endswith('</html>'), f'{path}: file no longer ends in </html> - ABORT'
    assert len(out) > len0 and out.count('\n') > n0, f'{path}: file shrank - ABORT'

    shutil.copy2(path, path + '.bak')
    open(path, 'w', encoding='utf-8').write(out)
    print('OK  %s  %s -> %s  (+%d bytes)' % (path, old.split("'")[1], new.split("'")[1], len(out) - len0))

if __name__ == '__main__':
    for p in sys.argv[1:]: patch(p)
    print('\nBoth files must be patched. node --check, then commit.')
