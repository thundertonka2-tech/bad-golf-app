#!/usr/bin/env python3
# v2026.11.2086 -- Tyler, 11/27, on the 11's keep / toss flow:
#  - "the Done button here and Not Now should be replaced with Next GPS or Next hole scorecard instead."
#  - (after testing) "we do need to keep this screen but lets spruce it up a bit ... instead of showing the player
#     name in this box show the profile pic or that circle we use with their initials. Make it more modern look
#     with clear text. It looks very dated."
# So: the sheet's two buttons are the score screen's own "Next hole -> GPS" / "Next hole -> Scorecard" (each saves
# the answers and moves on; X closes). The 11's card stays on the score screen, restyled: avatar, to par,
# holes kept, tosses left, Keep / Toss.
import sys, io
OLD_V, NEW_V = 'v2026.11.2085', 'v2026.11.2086'
CARD = r"""// v2086: a player's photo, or the circle with his initials, for the 11's card (the name is the label for screen readers).
function bgElevensAvHtml(p) {
  try {
    const nm = (p && (p.name || ((p.firstName || '') + ' ' + (p.lastName || '')).trim())) || '';
    let av = (p && p.avatar && typeof _bgSafeAvatarUrl === 'function') ? _bgSafeAvatarUrl(p.avatar) : '';
    if (!av && typeof bgAvatarForName === 'function') av = bgAvatarForName(nm) || '';
    const lbl = escapeHtml(typeof displayFirst === 'function' ? displayFirst(p) : nm);
    if (av) return '<span class="bg-el-av bg-el-av-photo" role="img" aria-label="' + lbl + '" title="' + lbl + '"><img src="' + escapeHtml(av) + '" alt=""></span>';
    return '<span class="bg-el-av" role="img" aria-label="' + lbl + '" title="' + lbl + '" style="background:' + (typeof _bgAvatarColor === 'function' ? _bgAvatarColor(p) : 'var(--accent)') + '">' + escapeHtml((typeof displayInitials === 'function' ? displayInitials(p) : '') || '?') + '</span>';
  } catch (e) { return '<span class="bg-el-av">?</span>'; }
}
// Score screen card (v2086 look): one row a side - photo / initials, to par, holes kept, tosses left, Keep / Toss.
function bgElevensBanners(g, h, banners) {
  bgElevensGames(g).forEach(G => {
    const div = document.createElement('div');
    div.className = 'bg-el-card';
    let pend = false, rows = '';
    const holeIn = (typeof isHoleComplete !== 'function') || isHoleComplete(g, h);   // v2085: nothing is asked until every score is in
    // the orange reminder is only for a sheet that was closed without an answer - never behind the sheet itself
    let closed = false; try { closed = !!(_bgElSheet.shown[String(g.code || '') + ':' + h]) && !document.getElementById('bg-el-sheet'); } catch (e) {}
    G.sides.forEach(s => {
      const c = bgElevensCard(g, G.cfg, s, false), r = c.byHole[h] || { st: 'none' };
      if (r.st === 'pending' && holeIn && closed) pend = true;
      const left = Math.max(0, c.maxOut - c.out);
      let ctl, btns = false;
      if (r.st === 'none') ctl = '<span class="bg-el-note">Score first</span>';
      else if (r.st === 'pending' && !holeIn) ctl = '<span class="bg-el-note">Waiting on scores</span>';
      else if (r.forced) ctl = '<span class="bg-el-note">' + (r.st === 'keep' ? 'Counts · no tosses left' : 'Not needed · ' + c.need + ' kept') + '</span>';
      else {
        const lock = bgElevensLocked(c, h); btns = true;
        ctl = '<button type="button" class="bg-btn bg-el-btn ' + (r.st === 'keep' ? 'wolf-sel' : '') + '" data-el-game="' + G.key + '" data-el-side="' + escapeHtml(String(s.key)) + '" data-el-v="k">Keep ' + bgElevensToPar(r.v) + '</button>'
            + '<button type="button" class="bg-btn bg-el-btn ' + (r.st === 'out' ? 'wolf-sel' : '') + '" data-el-game="' + G.key + '" data-el-side="' + escapeHtml(String(s.key)) + '" data-el-v="x">Toss</button>'
            + (lock ? '<span class="bg-el-lock" title="Locked">🔒</span>' : '');
      }
      rows += '<div class="bg-el-row" data-el-row="' + escapeHtml(String(s.key)) + '">'
        + '<span class="bg-el-avs">' + (s.players || []).map(bgElevensAvHtml).join('') + '</span>'
        + '<span class="bg-el-stat"><b><span class="bg-el-tot">' + (c.kept ? bgElevensToPar(c.total) : '—') + '</span>' + c.kept + '/' + c.need + ' kept</b><span>' + left + ' toss' + (left === 1 ? '' : 'es') + ' left</span></span>'
        + '<span class="bg-el-ctl' + (btns ? ' bg-el-ctl-btns' : '') + '">' + ctl + '</span></div>';
    });
    if (pend) div.classList.add('bg-el-card-pend');
    div.innerHTML = '<div class="bg-el-head"><strong>' + escapeHtml(G.label) + '</strong><span class="bg-el-chip">Best ' + bgElevensNeed(g) + ' holes' + (G.team ? ' · team low ball' : '') + ' · ' + (G.cfg.net === false ? 'gross' : 'net') + (G.field ? ' · whole field' : '') + '</span></div>'
      + (pend ? '<div class="bg-el-warn">Keep or toss before the next hole</div>' : '') + rows;
    banners.appendChild(div);
    div.querySelectorAll('[data-el-v]').forEach(b => { b.onclick = () => bgElevensSet(b.dataset.elGame, b.dataset.elSide, h, b.dataset.elV); });
  });
}
"""
CARD_CSS = """  /* v2086: the 11's card on the score screen */
  .bg-el-card { background: var(--bg-surface); border: 1px solid var(--bg-border); border-radius: 14px; padding: 12px 14px 4px; margin: 10px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.08); color: var(--bg-text); text-align: left; }
  .bg-el-card.bg-el-card-pend { border-color: var(--bg-warn); box-shadow: 0 0 0 1px var(--bg-warn); }
  .bg-el-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-bottom: 8px; }
  .bg-el-head strong { font-size: 17px; font-weight: 800; color: var(--bg-text); }
  .bg-el-chip { font-size: 12px; font-weight: 700; color: var(--bg-brand-dark); background: var(--bg-brand-tint); border-radius: 999px; padding: 3px 9px; }
  .bg-el-warn { font-size: 14px; font-weight: 700; color: var(--bg-warn); background: var(--bg-warn-tint); border-radius: 8px; padding: 6px 10px; margin-bottom: 6px; }
  .bg-el-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 10px; padding: 9px 0; border-top: 1px solid var(--bg-border); min-height: 58px; }
  .bg-el-avs { display: flex; flex-shrink: 0; }
  .bg-el-av { width: 40px; height: 40px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 15px; letter-spacing: 0.3px; overflow: hidden; flex-shrink: 0; box-shadow: 0 0 0 2px var(--bg-surface); }
  .bg-el-av + .bg-el-av { margin-left: -4px; }
  .bg-el-avs .bg-el-av:not(:only-child) { width: 32px; height: 32px; font-size: 12px; }
  .bg-el-av img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .bg-el-stat b .bg-el-tot { display: inline-block; min-width: 24px; margin-right: 6px; font-size: 17px; font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; }
  .bg-el-stat { flex: 1 0 auto; display: flex; flex-direction: column; line-height: 1.25; }
  .bg-el-stat b { font-size: 15px; font-weight: 700; color: var(--bg-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bg-el-stat > span { font-size: 13px; overflow: hidden; text-overflow: ellipsis; color: var(--bg-text-muted); white-space: nowrap; }
  .bg-el-ctl { display: flex; align-items: center; gap: 6px; flex-shrink: 0; margin-left: auto; }
  .bg-el-ctl.bg-el-ctl-btns { flex-basis: 100%; margin-left: 0; gap: 8px; }
  .bg-el-ctl-btns .bg-el-btn { flex: 1; }
  .bg-el-note { font-size: 13px; font-weight: 600; color: var(--bg-text-muted); background: var(--bg-surface-sunk); border-radius: 999px; padding: 6px 11px; white-space: nowrap; }
  .bg-el-card .bg-el-btn { min-height: 44px; min-width: 54px; padding-left: 9px; padding-right: 9px; border-radius: 10px; font-size: 14px; font-weight: 700; white-space: nowrap; }
  .bg-el-card .bg-el-btn.wolf-sel { background: var(--bg-brand) !important; border-color: var(--bg-brand) !important; color: #fff !important; font-weight: 800; }
  .bg-el-lock { font-size: 14px; }
"""
def patch(path):
    src = io.open(path, encoding='utf-8').read()
    if NEW_V in src: print(path, 'already patched'); return
    assert src.count(OLD_V) == 4, (path, 'version', src.count(OLD_V))
    n = [0]
    def one(name, old, new):
        nonlocal src
        c = src.count(old); assert c == 1, (path, name, c)
        src = src.replace(old, new); n[0] += 1
    # --- the card: stays on the score screen, modern look, avatar instead of the name (Tyler 11/27 2:35pm) ---
    a = src.index("function bgElevensBanners(g, h, banners) {\n"); b = src.index("// Board card: live standings for both games.\nfunction bgElevensBoardHtml(g) {")
    assert src.count("function bgElevensBanners(g, h, banners) {\n") == 1 and a < b < a + 6000, (path, 'card slice')
    src = src[:a] + CARD + src[b:]; n[0] += 1
    one('card css', "  /* v2084: the 11's keep / throw out sheet */\n", CARD_CSS + "  /* v2084: the 11's keep / throw out sheet */\n")
    # --- the Board: one way back into the sheet (after closing it with X, or from another hole) ---
    one('board button', "    });\n  } catch (e) {}\n  return html;\n}\n// Pool split: 'winner' takes it all,",
        "    });\n    try {   // v2086: a hole still waiting on keep / toss can be opened from here\n      const _h = (typeof state !== 'undefined' && state && state.game === g) ? Number(state.currentHole) || 0 : 0;\n      if (html && _h && !g.finishedAt && !state.viewOnlyMode && bgElevensSheetRows(g, _h).some(r => r.st === 'pending'))\n        html += '<div class=\"game-result bg-el-board-open\"><button type=\"button\" class=\"bg-btn bg-btn--full\" onclick=\"bgElevensSheetOpen(' + _h + ')\">Keep or toss \\u2014 hole ' + _h + '</button></div>';\n    } catch (e) {}\n  } catch (e) {}\n  return html;\n}\n// Pool split: 'winner' takes it all,")
    # --- the sheet: Next hole -> GPS / Next hole -> Scorecard ---
    one('title + close', "    let html = '<h2>Hole ' + h + (par ? ' <span class=\"small-text\">par ' + par + '</span>' : '') + ' — keep or toss?</h2>'",
        "    let html = '<button type=\"button\" class=\"bg-btn bg-btn--ghost bg-btn--icon bg-el-sh-x\" id=\"bg-el-sh-later\" aria-label=\"Close\">\\u2715</button>'\n      + '<h2>Hole ' + h + (par ? ' <span class=\"small-text\">par ' + par + '</span>' : '') + ' \\u2014 keep or toss?</h2>'")
    one('help line', "Par or better starts on Keep. Change any, then tap Done.</div>'", "Par or better starts on Keep. Change any, then go to the next hole.</div>'")
    one('footer', "    html += '<div class=\"bg-el-sh-foot\">' + (any ? '<button type=\"button\" class=\"bg-btn bg-btn--primary\" id=\"bg-el-sh-done\">Done</button>' : '')\n      + '<button type=\"button\" class=\"bg-btn bg-btn--ghost\" id=\"bg-el-sh-later\">' + (any ? 'Not now' : 'Close') + '</button></div>';",
        "    const canNext = any && bgElevensSheetCanNext(g, h);\n    html += '<div class=\"bg-el-sh-foot\">' + (canNext\n        ? '<button type=\"button\" class=\"bg-btn bg-btn--primary\" id=\"bg-el-sh-gps\">Next hole \\u2192 GPS</button><button type=\"button\" class=\"bg-btn bg-btn--primary\" id=\"bg-el-sh-score\">Next hole \\u2192 Scorecard</button>'\n        : (any ? '<button type=\"button\" class=\"bg-btn bg-btn--primary\" id=\"bg-el-sh-done\">Done</button>' : '')) + '</div>';")
    one('close repaints', "  try { const ov = document.getElementById('bg-el-sheet'); if (ov) ov.remove(); } catch (e) {}\n  _bgElSheet.hole = 0;\n}",
        "  let _had = false;\n  try { const ov = document.getElementById('bg-el-sheet'); if (ov) { ov.remove(); _had = true; } } catch (e) {}\n  _bgElSheet.hole = 0;\n  try { if (_had && typeof renderGameBanners === 'function' && document.getElementById('game-banners')) renderGameBanners(); } catch (e) {}   // v2086: the card shows its reminder once the sheet is gone\n}")
    one('wiring', "    const d = box.querySelector('#bg-el-sh-done'); if (d) d.onclick = function () { bgElevensSheetDone(); };",
        "    const d = box.querySelector('#bg-el-sh-done'); if (d) d.onclick = function () { bgElevensSheetDone(); };\n    const ng = box.querySelector('#bg-el-sh-gps'); if (ng) ng.onclick = function () { bgElevensSheetDone('gps'); };\n    const ns = box.querySelector('#bg-el-sh-score'); if (ns) ns.onclick = function () { bgElevensSheetDone('score'); };")
    one('can next fn', "// Done: every answer on the sheet in one save, then let the hole move on.\nasync function bgElevensSheetDone() {",
        "// The sheet offers the score screen's own two Next buttons when this is the hole being scored and there is a next one.\nfunction bgElevensSheetCanNext(g, h) {\n  try {\n    if (!g || Number(state.currentHole) !== Number(h)) return false;\n    const nb = document.getElementById('auto-advance-btn');\n    if (!nb || typeof nb.onclick !== 'function') return false;\n    if (typeof isHoleComplete === 'function' && !isHoleComplete(g, h)) return false;\n    return (typeof nextUnplayedAfter === 'function') ? nextUnplayedAfter(g, h) != null : h < ((typeof roundHoles === 'function' ? roundHoles(g) : 18) || 18);\n  } catch (e) { return false; }\n}\n// Done / Next: every answer on the sheet in one save, then the hole moves on ('gps' | 'score' presses that button for you).\nasync function bgElevensSheetDone(next) {")
    one('advance', "    try { if (typeof bgAutoAdvanceArm === 'function' && state.currentHole === h) bgAutoAdvanceArm(g, h); } catch (e) {}\n    await saveGame(g);",
        "    let _went = false;\n    if (next === 'gps' || next === 'score') {\n      try { if (typeof bgAutoAdvanceCancel === 'function') bgAutoAdvanceCancel(); } catch (e) {}\n      try { const nb = document.getElementById(next === 'gps' ? 'auto-advance-btn' : 'auto-advance-score-btn'); if (nb && typeof nb.onclick === 'function') { nb.onclick(); _went = true; } } catch (e) {}\n    }\n    try { if (!_went && typeof bgAutoAdvanceArm === 'function' && state.currentHole === h) bgAutoAdvanceArm(g, h); } catch (e) {}\n    await saveGame(g);")
    one('css', "  .bg-el-sh-foot { display: flex; gap: 8px; margin-top: 14px; }", "  .bg-el-sh { position: relative; }\n  #bg-el-sheet .bg-el-sh-x { position: absolute; top: 6px; right: 6px; min-width: 40px; min-height: 40px; }\n  .bg-el-sh h2 { padding-right: 40px; }\n  .bg-el-sh-foot { display: flex; gap: 8px; margin-top: 14px; }\n  #bg-el-sheet .bg-el-sh-foot .bg-btn { padding-left: 6px; padding-right: 6px; }\n  @media (max-width: 400px) { #bg-el-sheet .bg-el-sh-btn { width: 84px; } }\n  @media (max-width: 340px) { #bg-el-sheet .bg-el-sh-btn { width: 64px; } }")
    src = src.replace(OLD_V, NEW_V)
    io.open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched:', n[0], 'edits')
for p in (sys.argv[1:] or ['golf-app.html', 'www/index.html']): patch(p)
