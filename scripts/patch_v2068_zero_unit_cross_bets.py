#!/usr/bin/env python3
"""v2068 (Tyler, 11/25: Kevin "wanted to setup a match between the two of us for zero dollars but he said we don't
allow that" -> "Yes let's fix this too"): a cross bet may be set at 0 units -- bragging rights. The Cross bets step,
the in-round cross-bet sheet and the server RPC (migration v2068_crossbets_zero_units) all accept 0; a blank / NaN
is still refused. The label reads "bragging rights" instead of "0 flat". Group games could already be 0.

    python scripts/patch_v2068_zero_unit_cross_bets.py
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [os.path.join(ROOT, 'golf-app.html'), os.path.join(ROOT, 'www', 'index.html')]
OLD_V, NEW_V = 'v2026.11.2067', 'v2026.11.2068'

EDITS = [
  ('t2-build',
   """  if (['match', 'nassau', 'stroke', 'quota'].indexOf(kind) < 0) return 'Pick a game';
  const v = Number(o && o.value);
  if (!(v > 0)) return 'Enter the units';
  const names = (o && Array.isArray(o.names)) ? o.names.map(n => String(n || '').trim()).filter(Boolean) : [];""",
   """  if (['match', 'nassau', 'stroke', 'quota'].indexOf(kind) < 0) return 'Pick a game';
  const v = (o && o.value !== '' && o.value != null) ? Number(o.value) : NaN;
  if (!isFinite(v) || v < 0) return 'Enter the units (0 is fine for bragging rights)';   // v2068: 0 allowed (Kevin v Tyler for nothing)
  const names = (o && Array.isArray(o.names)) ? o.names.map(n => String(n || '').trim()).filter(Boolean) : [];"""),
  ('xb-many',
   """  if (kind !== 'stroke' && kind !== 'quota') return 'Pick Stroke play or Quota';
  const v = Number(o && o.value);
  if (!(v > 0)) return 'Enter the units';
  const names = (o && Array.isArray(o.names)) ? o.names : [];""",
   """  if (kind !== 'stroke' && kind !== 'quota') return 'Pick Stroke play or Quota';
  const v = (o && o.value !== '' && o.value != null) ? Number(o.value) : NaN;
  if (!isFinite(v) || v < 0) return 'Enter the units (0 is fine for bragging rights)';   // v2068
  const names = (o && Array.isArray(o.names)) ? o.names : [];"""),
  ('xb-one',
   """  if ((g.players || []).some(p => p && p.name && _t2SKey(p.name) === _t2SKey(b))) return b + ' is on this card — set it as a group game';
  const v = Number(o.value);
  if (!(v > 0)) return 'Enter the units';""",
   """  if ((g.players || []).some(p => p && p.name && _t2SKey(p.name) === _t2SKey(b))) return b + ' is on this card — set it as a group game';
  const v = (o.value !== '' && o.value != null) ? Number(o.value) : NaN;
  if (!isFinite(v) || v < 0) return 'Enter the units (0 is fine for bragging rights)';   // v2068"""),
  ('label',
   """    const v = Number(b.value) || 0;
    let terms = String(v);
    if (k === 'stroke' || k === 'quota') terms += b.per ? (k === 'quota' ? ' per point' : ' per stroke') : ' flat';""",
   """    const v = Number(b.value) || 0;
    let terms = String(v);
    if (!v) terms = 'bragging rights';   // v2068: a 0-unit cross bet
    else if (k === 'stroke' || k === 'quota') terms += b.per ? (k === 'quota' ? ' per point' : ' per stroke') : ' flat';"""),
  ('bgver', '<!--BGVER=' + OLD_V + '-->', '<!--BGVER=' + NEW_V + '-->'),
  ('build', "const BG_BUILD = '" + OLD_V + "';", "const BG_BUILD = '" + NEW_V + "';"),
]


def patch(path):
    src = open(path, encoding='utf-8', newline='').read()
    for name, old, new in EDITS:
        n = src.count(old)
        assert n == 1, '%s: %s matched %d times' % (os.path.basename(path), name, n)
        src = src.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='').write(src)
    print('patched', path, len(EDITS), 'edits')


if __name__ == '__main__':
    for f in FILES:
        patch(f)
