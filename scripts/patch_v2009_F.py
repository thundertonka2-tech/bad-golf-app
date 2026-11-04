#!/usr/bin/env python3
"""v2009 F patcher (Tyler, 11/3): D3 finisher, client side.

  1. Per-cart shotgun start: a "Starts on hole" picker per group on a field week's Configure Carts
     (lgOpenCarts), saved through league_set_carts {group_codes[].start} (a PHYSICAL hole the week plays).
     A pick-a-start week always shows it (the server's draw already spreads the groups from the week's start);
     any other field week shows it after "Shotgun start" is tapped, which spreads the groups across the
     holes being played, in play order, the way a tournament shotgun does. The group card shows the hole.
     C3a's launcher (lgWeekRoundShape) already reads group_codes[].start.
  2. Create screen: "Holes each week" offers every season default the server takes (HOLES_SPEC 2.2):
     Full 18, Start on the Back 9, Front 9 only, Back 9 only, Front 9 twice, Back 9 twice, and
     Rotate front / back 9. Values '18' and '9' keep their old meaning (all18 / rotate), so base_holes and
     every existing harness are unchanged. Pick-a-start stays per week (it needs a start hole).

Applies every (old, new) pair to BOTH golf-app.html and www/index.html, asserting each `old` occurs
exactly once per file. Refuses to run twice (marker check).

    python3 scripts/patch_v2009_F.py
"""
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [os.path.join(ROOT, 'golf-app.html'), os.path.join(ROOT, 'www', 'index.html')]
MARK = 'v2009 F (Tyler, 11/3)'

P = []   # (label, old, new)

# ---------------------------------------------------------------------------------------------------
# 1a. helpers, just above lgOpenCarts
# ---------------------------------------------------------------------------------------------------
P.append(('cart-start helpers', """async function lgOpenCarts(sid, weekId, opts) {""",
"""/* v2009 F (Tyler, 11/3): D3 shotgun start per cart. group_codes[].start is a PHYSICAL hole (what the chips and
   the course card say); lgWeekRoundShape turns it into the round's startHole. These list the holes a group may
   be sent off on, in play order from the week's own start, and spread the groups across them. */
function lgCartStartHoles(w) {
  try {
    const snap = (w && w.course_snapshot) || {};
    const mode = (snap.mode && BG_DAY_HOLE_MODES.some(function (x) { return x[0] === snap.mode; })) ? snap.mode : lgHolesModeOf(w);
    const n = Number(snap.holes) || ((mode === 'front9' || mode === 'back9') ? 9 : 18);
    const phys = lgPhysList(mode, n, snap);
    let st = 0;
    if (n === 18 && mode === 'b9first') st = 9;
    if (n === 18 && mode === 'pick') { const s = Number(snap.start || (w && w.start_hole)) || 1; st = (s >= 1 && s <= 18) ? s - 1 : 0; }
    const seen = {}, out = [];
    for (let i = 0; i < phys.length; i++) { const p = phys[(st + i) % phys.length]; if (!seen[p]) { seen[p] = 1; out.push(p); } }
    return out;
  } catch (e) { const o = []; for (let h = 1; h <= 18; h++) o.push(h); return o; }
}
function lgCartSpread(groups, w) {
  const order = lgCartStartHoles(w); if (!order.length) return groups;
  groups.slice().sort(function (a, b) { return (a.g || 0) - (b.g || 0); }).forEach(function (g, i) {
    if (!g.code) g.start = order[i % order.length];
  });
  return groups;
}
async function lgOpenCarts(sid, weekId, opts) {"""))

# 1b. the week row carries its holes
P.append(('carts week select', """select('id,week_number,status,format_config,settings_snapshot').eq('id', weekId)""",
"""select('id,week_number,status,format_config,settings_snapshot,nine,holes_mode,start_hole,course_snapshot').eq('id', weekId)   /* v2009 F (Tyler, 11/3): D3 shotgun holes */"""))

# 1c. state: does this week show the picker
P.append(('carts shotgun state', """      const anyLive = groups.some(function (g) { return !!g.code; });""",
"""      const anyLive = groups.some(function (g) { return !!g.code; });
      /* v2009 F (Tyler, 11/3): D3 — a pick-a-start week, or any week with a group already given a hole, shows
         "Starts on hole" on every cart; elsewhere "Shotgun start" turns it on. */
      let _sgHoles = [], _sgOn = false;
      try {
        _sgHoles = lgCartStartHoles(w);
        _sgOn = lgHolesModeOf(w) === 'pick' || String(((w.course_snapshot || {}).mode) || '') === 'pick'
             || groups.some(function (g) { return Number(g.start) >= 1; }) || !!window['_lgCartSg_' + weekId];
      } catch (e) {}"""))

# 1d. shotgun buttons under the cart toolbar (commissioner)
P.append(('carts shotgun buttons', """        (amCommish ? '<button class="bg-btn bg-btn--sm small" id="lg-cart-stagger" style="margin:0 0 8px">⏱ Auto-fill times</button>' : '');
      ordered.forEach(function (g) {
        const st = g.code ? 'in progress' : '';""",
"""        (amCommish ? '<button class="bg-btn bg-btn--sm small" id="lg-cart-stagger" style="margin:0 0 8px">⏱ Auto-fill times</button>' : '') +
        /* v2009 F (Tyler, 11/3): D3 shotgun start per cart */
        (amCommish && groups.length ? ('<button class="bg-btn bg-btn--sm small" id="lg-cart-sg" style="margin:0 0 8px 6px" aria-pressed="' + (_sgOn ? 'true' : 'false') + '">' +
          (_sgOn ? '🔢 Spread across the holes' : '📣 Shotgun start') + '</button>') : '') +
        (_sgOn ? '<div class="small-text" style="color:var(--text-muted);margin-bottom:6px">Each cart tees off from its own hole and plays round to the hole before it. The week’s pots settle once every hole is in.</div>' : '');
      ordered.forEach(function (g) {
        const st = g.code ? 'in progress' : '';
        /* v2009 F (Tyler, 11/3): D3 — this cart's starting hole */
        let _sgRow = '';
        try {
          if (_sgOn) {
            const cur = Number(g.start) || 0;
            if (amCommish && !g.code) {
              let o = '<option value=""' + (cur ? '' : ' selected') + '>—</option>';
              _sgHoles.forEach(function (x) { o += '<option value="' + x + '"' + (x === cur ? ' selected' : '') + '>' + x + '</option>'; });
              _sgRow = '<label class="small-text" style="display:flex;align-items:center;gap:8px;margin:2px 0 4px;color:var(--text-muted)"><span>Starts on hole</span>' +
                '<select class="lg-cart-start" data-g="' + lgEsc(g.g) + '" aria-label="Starts on hole" style="min-width:72px;min-height:44px">' + o + '</select></label>';
            } else if (cur) {
              _sgRow = '<div class="small-text" style="margin:2px 0 4px;color:var(--text-muted)"><span>Starts on hole</span> <strong data-noi18n>' + cur + '</strong></div>';
            }
          }
        } catch (e) { _sgRow = ''; }"""))

P.append(('carts row insert', """            (amCommish ? teeInput('data-g="' + lgEsc(g.g) + '"', g.tee) : '<div class="bg-tt-ro">' + (g.tee ? 'Time ' + lgEsc(g.tee) : '') + '</div>') +
          '</div>' +
          (g.mids.length ? g.mids.map(function (mid) {""",
"""            (amCommish ? teeInput('data-g="' + lgEsc(g.g) + '"', g.tee) : '<div class="bg-tt-ro">' + (g.tee ? 'Time ' + lgEsc(g.tee) : '') + '</div>') +
          '</div>' + _sgRow +   /* v2009 F (Tyler, 11/3): D3 */
          (g.mids.length ? g.mids.map(function (mid) {"""))

# 1e. wiring
P.append(('carts shotgun wiring', """      const bo = body.querySelector('#lg-cart-one'); if (bo) bo.onclick = () => rebuild('one');""",
"""      const bo = body.querySelector('#lg-cart-one'); if (bo) bo.onclick = () => rebuild('one');
      /* v2009 F (Tyler, 11/3): D3 shotgun start per cart — spread, or pick one cart's hole */
      try {
        const bsg = body.querySelector('#lg-cart-sg');
        if (bsg) bsg.onclick = async () => {
          try { window['_lgCartSg_' + weekId] = true; } catch (e) {}
          lgCartSpread(groups, w);
          if (await save(groups)) { showToast('Carts spread across the holes ✓'); await render(); }
        };
        body.querySelectorAll('.lg-cart-start').forEach(function (sel) {
          sel.onchange = async () => {
            const g = groups.filter(function (x) { return String(x.g) === String(sel.dataset.g); })[0]; if (!g || g.code) return;
            const v = Number(sel.value) || 0;
            g.start = v || null;
            if (await save(groups)) { showToast(v ? ('Group ' + g.g + ' starts on hole ' + v) : 'Starting hole cleared'); await render(); }
          };
        });
      } catch (e) {}"""))

# 1f. the group card says where the cart goes off
P.append(('group card start', """    const _teeTxt = grp.tee ? ' <span class="help-text" style="font-size:12px">\\u00b7 \\u23F1 ' + lgEsc(grp.tee) + '</span>' : '';""",
"""    const _teeTxt = (grp.tee ? ' <span class="help-text" style="font-size:12px">\\u00b7 \\u23F1 ' + lgEsc(grp.tee) + '</span>' : '') +
      /* v2009 F (Tyler, 11/3): D3 — the cart's own starting hole (shotgun) */
      ((Number(grp.start) >= 1) ? ' <span class="help-text" style="font-size:12px">\\u00b7 <span>Hole</span> <span data-noi18n>' + lgEsc(String(grp.start)) + '</span></span>' : '');"""))

# ---------------------------------------------------------------------------------------------------
# 2. create screen: every season default
# ---------------------------------------------------------------------------------------------------
P.append(('create holes list', """    '<select id="lg-holes" style="width:100%"><option value="9">9 holes</option><option value="18" selected>18 holes</option></select>' +""",
"""    /* v2009 F (Tyler, 11/3): HOLES_SPEC 2.2 — every season default the server takes. '18' = Full 18 and
       '9' = rotate front / back keep their old values; the others are the tournament holes_mode words.
       Pick-a-start is set per week (it needs its start hole). */
    '<select id="lg-holes" style="width:100%;min-height:44px">' + (function () {
      try {
        return BG_DAY_HOLE_MODES.filter(function (o) { return o[0] !== 'pick'; }).map(function (o) {
          return '<option value="' + (o[0] === 'all18' ? '18' : o[0]) + '"' + (o[0] === 'all18' ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('') + '<option value="9">Rotate front 9 / back 9 each week</option>';
      } catch (e) { return '<option value="9">9 holes</option><option value="18" selected>18 holes</option>'; }
    })() + '</select>' +"""))

P.append(('create holes read', """  const holes = (parseInt(val('lg-holes'), 10) === 9) ? 9 : 18;""",
"""  /* v2009 F (Tyler, 11/3): HOLES_SPEC 2.2 — '9' rotate / '18' full as before, or a holes_mode */
  const _hm = String(val('lg-holes') || '18');
  const holes = (_hm === '9' || _hm === 'front9' || _hm === 'back9') ? 9 : 18;
  const _defNine = (_hm === '9') ? 'rotate' : ((['b9first', 'front9', 'back9', 'f9x2', 'b9x2'].indexOf(_hm) >= 0) ? _hm : 'full18');"""))

P.append(('create default_nine', """      default_nine: (holes === 9) ? 'rotate' : 'full18',""",
"""      default_nine: _defNine,   /* v2009 F (Tyler, 11/3): HOLES_SPEC 2.2 */"""))


def main():
    for f in FILES:
        s = open(f, encoding='utf-8').read()
        if MARK in s:
            print('already patched:', f); sys.exit(1)
        for label, old, new in P:
            n = s.count(old)
            assert n == 1, (f, label, n)
            s = s.replace(old, new, 1)
        open(f, 'w', encoding='utf-8', newline='').write(s)
        print('patched', os.path.relpath(f, ROOT), len(P), 'edits')


if __name__ == '__main__':
    main()
