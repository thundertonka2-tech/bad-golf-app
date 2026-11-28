#!/usr/bin/env python3
# v2026.11.2094 -- Tyler, 11/28 5:09am (test copy of the Saturday event, his group through 17):
# "When I joined the tournament ... it took me to hole one instead of the last hole that needs to be scored."
# Joining / opening a round always landed on the round's starting hole (v673), and a tournament round was
# explicitly left out of the "next hole still to play" step. The group-hole follow only reacts to a NEW hole
# change, so a phone that joined late sat on hole 1 until someone scored.
# (This patch also carries the iPhone name-chip fix -- see the block further down.)
# Rule now, in every join / open path: the hole this phone was last on (within 12 h), else -- when the starting
# hole is already scored -- the first hole still to be scored in play order, else the starting hole. A fresh
# round and a shotgun start land exactly where they did.
import sys, io
OLD_V, NEW_V = 'v2026.11.2093', 'v2026.11.2094'
HELPER = '''// v2094 (Tyler, 11/28: joining a round 17 holes in "took me to hole one instead of the last hole that needs to be
// scored"): where a phone lands when it joins or opens a live round.
function bgJoinHole(g) {
  const st = (g && g.startHole >= 1 && g.startHole <= 18) ? g.startHole : 1;
  try {
    if (!g || g.finishedAt) return st;
    try { const r = (typeof bgRecallHole === 'function') ? bgRecallHole(g) : null; if (r) return r; } catch (e) {}
    const ps = (typeof bgPlayStart === 'function') ? (bgPlayStart(g) || st) : st;
    if (typeof isHoleComplete === 'function' && typeof findNextUnscoredHole === 'function' && isHoleComplete(g, ps)) {
      const nh = findNextUnscoredHole(g); if (nh >= 1 && nh <= 18) return nh;
    }
  } catch (e) {}
  return st;
}
'''
def patch(path):
    src = io.open(path, encoding='utf-8').read()
    if NEW_V in src: print(path, 'already patched'); return
    assert src.count(OLD_V) == 4, (path, 'version', src.count(OLD_V))
    n = [0]
    def rep(name, old, new, cnt=1):
        nonlocal src
        c = src.count(old); assert c == cnt, (path, name, c)
        src = src.replace(old, new); n[0] += c
    rep('helper', "function findNextUnscoredHole(g) {\n", HELPER + "function findNextUnscoredHole(g) {\n")
    rep('join now + invite', "  state.currentHole = (!g.finishedAt && g.startHole >= 1 && g.startHole <= 18) ? g.startHole : 1;\n",
        "  state.currentHole = g.finishedAt ? 1 : bgJoinHole(g);   // v2094: the hole in play, not always the first\n", 2)
    rep('home join', "        state._scoreResumeAsked = true;   // v673: Join now — skip the \"Active round\" chooser\n        state.currentHole = (g.startHole >= 1 && g.startHole <= 18) ? g.startHole : 1;\n",
        "        state._scoreResumeAsked = true;   // v673: Join now — skip the \"Active round\" chooser\n        state.currentHole = bgJoinHole(g);   // v2094\n")
    rep('play open', "      state.currentHole = (g.startHole >= 1 && g.startHole <= 18) ? g.startHole : 1;\n      try { await safeSet(KEY_LAST, g.code, false); } catch (e) {}\n      try { await addToRecent(g); } catch (e) {}\n      try { enableGameTabs(true); } catch (e) {}\n      try { if (state.currentHole === 1 && !(g.t2 && g.t2.tournamentId) && typeof findNextUnscoredHole === 'function') { const nh = findNextUnscoredHole(g); if (nh > 1) state.currentHole = nh; } } catch (e) {}\n",
        "      state.currentHole = bgJoinHole(g);   // v2094: tournament rounds too (they were left on the first hole)\n      try { await safeSet(KEY_LAST, g.code, false); } catch (e) {}\n      try { await addToRecent(g); } catch (e) {}\n      try { enableGameTabs(true); } catch (e) {}\n")
    # ---------------- long putt (and every name chip) on iPhone ----------------
    # Tyler, 5:11am, TestFlight, his 11's test round: "I still cannot click on long putt. I tap it and nothing happens."
    # Both rounds where this happened had 11's. Since v2084 every touch on the Score screen started a 350 ms timer (set
    # inside pointerdown) that re-drew the game cards when the round has 11's. iOS watches timers started during a
    # touch; when one changes what is on screen it treats the tap as a hover and never sends `click` to a plain
    # element -- the name chips are <span>s, the score buttons are real buttons (which is why those kept working).
    rep('aa touch', "    // Not armed: the tap may be the putt / greenie / CTP that completes the hole. Re-check\n    // once the handler has written it (next tick), so the pill still appears without a\n    // score tap being the last thing entered.\n    setTimeout(() => { try { if (!_bgAA.tick && state.game && !state.viewOnlyMode) bgAutoAdvanceArm(state.game, state.currentHole); } catch (e) {} }, 350);\n  } catch (e) {}\n}\n",
        "  } catch (e) {}\n}\n"
        "// v2094: the re-check used to be a timer started inside pointerdown. On iPhone a timer started during a touch that\n"
        "// then changes the screen makes iOS treat the tap as a hover and drop the click on a plain element (the long putt /\n"
        "// closest-to-the-pin name chips). It now starts from the click itself, after the tap has been delivered.\n"
        "function bgAutoAdvanceAfterTap() {\n"
        "  try {\n"
        "    if (_bgAA.tick && _bgAA.hole === state.currentHole) return;\n"
        "    // Not armed: the tap may be the putt / greenie / CTP that completes the hole. Re-check\n"
        "    // once the handler has written it, so the pill still appears without a score tap being the last thing entered.\n"
        "    setTimeout(() => { try { if (!_bgAA.tick && state.game && !state.viewOnlyMode) bgAutoAdvanceArm(state.game, state.currentHole); } catch (e) {} }, 350);\n"
        "  } catch (e) {}\n}\n")
    rep('aa wire', "if (_sp) _sp.addEventListener('pointerdown', bgAutoAdvanceTouch, true); } catch (e) {}\n",
        "if (_sp) { _sp.addEventListener('pointerdown', bgAutoAdvanceTouch, true); _sp.addEventListener('click', bgAutoAdvanceAfterTap, true); } } catch (e) {}\n"
        "  /* v2094: a name chip (long putt, closest to the pin, greenie, junk) never depends on iOS sending `click`. If a press\n"
        "     started and ended on the same chip and no click followed, the chip is run once; a late click is then ignored. */\n"
        "  try {\n"
        "    let _cd = null;\n"
        "    const _chipOf = (e) => { try { return (e.target && e.target.closest) ? e.target.closest('.junk-chip') : null; } catch (x) { return null; } };\n"
        "    document.addEventListener('pointerdown', (e) => { const c = _chipOf(e); _cd = c ? { c: c, x: e.clientX, y: e.clientY, t: Date.now(), clicked: false, ranAt: 0 } : null; }, true);\n"
        "    document.addEventListener('click', (e) => {\n"
        "      const d = _cd; if (!d || !_chipOf(e)) return;\n"
        "      if (d.ranAt && e.isTrusted && (Date.now() - d.ranAt) < 900) { try { e.stopPropagation(); e.preventDefault(); } catch (x) {} return; }   // the late real click after we already ran it\n"
        "      d.clicked = true;\n"
        "    }, true);\n"
        "    document.addEventListener('pointerup', (e) => {\n"
        "      const d = _cd; if (!d || d.clicked) return;\n"
        "      if (_chipOf(e) !== d.c || Math.abs(e.clientX - d.x) > 12 || Math.abs(e.clientY - d.y) > 12 || (Date.now() - d.t) > 1500) return;\n"
        "      setTimeout(() => {\n"
        "        try {\n"
        "          if (d.clicked) return;\n"
        "          let el = d.c;\n"
        "          if (!el.isConnected) {   // the row was redrawn under the finger: find the same chip again\n"
        "            el = null;\n"
        "            try { const k = Object.keys(d.c.dataset || {})[0]; if (k) { const attr = 'data-' + k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()); el = document.querySelector('.junk-chip[' + attr + '=\"' + String(d.c.dataset[k]).replace(/\"/g, '\\\\\"') + '\"]'); } } catch (x) {}\n"
        "          }\n"
        "          if (!el) return;\n"
        "          d.clicked = true; d.ranAt = Date.now();\n"
        "          el.click();\n"
        "        } catch (x) {}\n"
        "      }, 320);\n"
        "    }, true);\n"
        "  } catch (e) {}\n")
    rep('el banner sig decl', "var _bgElSheet = { timer: null, hole: 0, picks: {}, shown: {} };\n",
        "var _bgElSheet = { timer: null, hole: 0, picks: {}, shown: {} };\n"
        "// v2094: what the 11's card on this hole is drawn from. The card is only re-drawn off a tap when this changed.\n"
        "function _bgElBannerSig(g, h) {\n"
        "  try { if (!g) return ''; return String(g.code || '') + ':' + h + ':' + (g.players || []).map(p => { const a = (g.scores && g.scores[p.id]) || []; return a.filter(v => v != null).length + '/' + (a[h - 1] == null ? '-' : a[h - 1]); }).join(',') + ':' + JSON.stringify(g.elevensData || {}).length + ':' + (state.viewOnlyMode ? 1 : 0); } catch (e) { return String(Math.random()); }\n"
        "}\n")
    rep('el banner sig set', "function renderGameBanners() {\n  const g = state.game;\n  const h = state.currentHole;\n",
        "function renderGameBanners() {\n  const g = state.game;\n  const h = state.currentHole;\n  try { if (typeof _bgElSheet !== 'undefined') _bgElSheet.bannerSig = _bgElBannerSig(g, h); } catch (e) {}   // v2094\n")
    rep('el arm render', "    try { if (typeof renderGameBanners === 'function' && document.getElementById('game-banners')) renderGameBanners(); } catch (e) {}   // the card used to stay on \"Score first\"\n",
        "    try { if (typeof renderGameBanners === 'function' && document.getElementById('game-banners') && _bgElSheet.bannerSig !== _bgElBannerSig(g, h)) renderGameBanners(); } catch (e) {}   // the card used to stay on \"Score first\"; v2094: only when something it shows changed\n")
    src = src.replace(OLD_V, NEW_V)
    io.open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched', n[0], 'edits')
for f in (sys.argv[1:] or ['golf-app.html', 'www/index.html']): patch(f)
