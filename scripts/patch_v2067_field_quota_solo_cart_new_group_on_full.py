#!/usr/bin/env python3
"""v2067 (Bad Golf Wednesday 11/25, Kevin's event -- found by qa/qa_badwed_1125_dryrun.js and Kevin's text):

1. A whole-field Quota (or Stableford) pool player who is the ONLY pool player on his cart scored 0.
   calcQuota / calcStableford bail out with fewer than two participants on the card -- right for a
   cart's own game, wrong for the day's field pool, where the cart only has to report points. Kevin is
   the lone Quota player in Group 1 today (Michael and Hunter are out of the pool): he would have been
   charged his 20 and shown "0 vs quota" whatever he shot. A field-tagged pool now scores one player.

2. Kevin: "I'd only put 12 players in and it made three groups and then when I went to go add 13 and
   14 players, it would never expand past the three groups." Newcomers were seated into the existing
   foursomes up to the five-a-cart ceiling (v1030 / v1802). Now a newcomer goes to a cart with room
   under four first; when every unstarted cart already holds four, a NEW cart is opened -- unless the
   day has a single cart, which still fills to five (the v1030 case: one group, don't re-spawn the
   cart the commissioner just merged away).

    python scripts/patch_v2067_field_quota_solo_cart_new_group_on_full.py
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [os.path.join(ROOT, 'golf-app.html'), os.path.join(ROOT, 'www', 'index.html')]
OLD_V, NEW_V = 'v2026.11.2066', 'v2026.11.2067'

EDITS = [
  ('quota-solo',
   """function calcQuota(g) {
  if (!g.games.quota) return null;
  const cfg = g.games.quota;
  const participants = getParticipants(g, cfg);
  if (participants.length < 2) return null;
""",
   """function calcQuota(g) {
  if (!g.games.quota) return null;
  const cfg = g.games.quota;
  const participants = getParticipants(g, cfg);
  // v2067 (Bad Golf Wednesday 11/25): the day's whole-field pool only needs this cart to REPORT points, so one
  // pool player on a cart (Kevin alone in his three-ball) still scores. A cart's own Quota keeps needing two.
  if (participants.length < (cfg._t2field ? 1 : 2)) return null;
"""),
  ('stableford-solo',
   """function calcStableford(g) {
  if (!g.games.stableford) return null;
  const cfg = g.games.stableford;
  const participants = getParticipants(g, cfg);
  if (participants.length < 2) return null;
""",
   """function calcStableford(g) {
  if (!g.games.stableford) return null;
  const cfg = g.games.stableford;
  const participants = getParticipants(g, cfg);
  if (participants.length < (cfg._t2field ? 1 : 2)) return null;   // v2067: a field pool scores a lone pool player on a cart (see calcQuota)
"""),
  ('seat-new-group',
   """    let target = (groups || []).filter(g => !g.game_code && counts[g.id] < T2_MAX_GROUP_SIZE).sort((a, b) => counts[a.id] - counts[b.id])[0] || null;
    if (!target) {""",
   """    /* v2067 (Kevin, 11/25: "I'd only put 12 players in and it made three groups and then when I went to go add 13
       and 14 players, it would never expand past the three groups"): a newcomer takes a seat in a cart that is under
       FOUR first. When every unstarted cart already holds four, open a new cart rather than making fives -- except
       on a one-cart day, which still fills to five (the v1030 case above). */
    const _open = (groups || []).filter(g => !g.game_code);
    let target = _open.filter(g => counts[g.id] < 4).sort((a, b) => counts[a.id] - counts[b.id])[0] || null;
    if (!target && (groups || []).length === 1 && _open.length === 1 && counts[_open[0].id] < T2_MAX_GROUP_SIZE) target = _open[0];   // the one-cart day only
    if (!target) {"""),
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
