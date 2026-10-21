import sys, re

EDITS = []

# 1) Replay path: call the raw action, not the de-duped wrapper (the wrapper would see the
#    tap we are replaying as a duplicate and drop it).
EDITS.append(("replay",
"if (_nc && typeof _nc.onclick === 'function' && _nc !== chip) return _nc.onclick();",
"if (_nc && _nc !== chip && typeof (_nc._bgP3Act || _nc.onclick) === 'function') { try { _bgP3Log({ ev: 'replay', a: action, pid: pid }); } catch (e) {} return (_nc._bgP3Act || _nc.onclick)(); }"))

# 2) Log the handler actually running.
EDITS.append(("handler-log",
"""      _p3Touch();   // v1604: the tap creates + stamps the hole entry
      if (action === 'birdieongreen') {""",
"""      try { _bgP3Log({ ev: 'run', a: action, pid: pid, h: h }); } catch (e) {}   // v1939
      _p3Touch();   // v1604: the tap creates + stamps the hole entry
      if (action === 'birdieongreen') {"""))

# 3) End of renderP3GreenieEntry: wrap every chip so a click and a finger-lift can't both
#    fire, and wire the container once for finger-lift taps + tap logging.
EDITS.append(("wrap+wire",
"""      renderP3GreenieEntry(); await saveGame(g);
      renderP3GreenieEntry();
    };
  });
}

// Putts stepper handler.""",
"""      renderP3GreenieEntry(); await saveGame(g);
      renderP3GreenieEntry();
    };
  });
  /* v1939 (Tyler + Kevin, 10/21, Buffalo Creek #4): "it will not allow us to select the player
     that won the Green. You can click it several times and nothing will happen and then all of
     a sudden it will work." iPhone app, multiple phones, only the greenie names are dead (putts
     and scores still work), no visual reaction at all. The DB shows it: the #4 greenie is
     missing (DIVOT92, PUTT59) or set 80 minutes late from hole 10 (PINE47), while #8/#12/#17
     land seconds after the scores. #4 is the round's FIRST par 3.
     These chips are <span>s that only acted on a full iOS "click", which WebKit drops when the
     chip under the finger is rebuilt between touch-down and lift. Two changes:
       1. the chip now also acts on finger-LIFT (pointerup on the section, located with
          elementFromPoint so a just-rebuilt chip still counts), de-duped against the click
          that may follow, and ignored when the finger moved (a scroll is not a tap);
       2. a tap log (_bgP3Log) records every touch on the greenie area - which chip, whether
          the handler ran, whether something else was on top of the names - and parks it on
          a diag:greenie:<round> row so the next Buffalo Creek round shows exactly why. */
  try {
    ctr.querySelectorAll('.junk-chip').forEach(chip => {
      if (chip._bgP3Act) return;
      const act = chip.onclick; if (typeof act !== 'function') return;
      chip._bgP3Act = act;
      chip.onclick = function () {
        if (Date.now() - (window._bgP3LastFire || 0) < 700) { try { _bgP3Log({ ev: 'click-dup', a: chip.dataset.p3gAction, pid: chip.dataset.pid }); } catch (e) {} return; }
        window._bgP3LastFire = Date.now();
        try { _bgP3Log({ ev: 'click', a: chip.dataset.p3gAction, pid: chip.dataset.pid }); } catch (e) {}
        return act();
      };
    });
    window._bgP3RenderedAt = Date.now();
    window._bgP3Renders = (window._bgP3Renders || 0) + 1;
    if (!ctr._bgP3Wired) {
      ctr._bgP3Wired = true;
      let _d = null;
      ctr.addEventListener('pointerdown', function (e) {
        try {
          const c = e.target && e.target.closest ? e.target.closest('.junk-chip') : null;
          _d = { x: e.clientX, y: e.clientY, t: Date.now(), pid: c ? c.dataset.pid : null };
          _bgP3Log({ ev: 'down', a: c ? c.dataset.p3gAction : null, pid: c ? c.dataset.pid : null, renderAge: Date.now() - (window._bgP3RenderedAt || 0), renders: window._bgP3Renders || 0, live: c && c.isConnected ? 1 : 0 });
        } catch (er) {}
      }, true);
      ctr.addEventListener('pointerup', function (e) {
        try {
          const d = _d; _d = null;
          if (!d) return;
          const moved = Math.abs(e.clientX - d.x) > 10 || Math.abs(e.clientY - d.y) > 10;
          if (moved || (Date.now() - d.t) > 900) { _bgP3Log({ ev: 'up-skip', moved: moved, dur: Date.now() - d.t }); return; }
          const under = document.elementFromPoint(e.clientX, e.clientY);
          const c = under && under.closest ? under.closest('#' + ctr.id + ' .junk-chip') : null;
          if (!c || typeof c._bgP3Act !== 'function') { _bgP3Log({ ev: 'up-nochip', under: _bgP3Desc(under) }); return; }
          if (Date.now() - (window._bgP3LastFire || 0) < 700) { _bgP3Log({ ev: 'up-dup', pid: c.dataset.pid }); return; }
          window._bgP3LastFire = Date.now();
          _bgP3Log({ ev: 'up-fire', a: c.dataset.p3gAction, pid: c.dataset.pid, rebuilt: !c.isConnected ? 1 : 0 });
          c._bgP3Act();
        } catch (er) {}
      }, true);
      ctr.addEventListener('pointercancel', function () { try { _d = null; _bgP3Log({ ev: 'cancel' }); } catch (er) {} }, true);
    }
    if (!window._bgP3CoverWired) {
      window._bgP3CoverWired = true;
      // Something ELSE on top of the names? A touch inside the section's box whose target is
      // not inside the section is logged with what took it.
      document.addEventListener('pointerdown', function (e) {
        try {
          const sec = document.getElementById('p3greenie-entry-section');
          if (!sec || !sec.firstChild || !sec.offsetParent) return;
          const r = sec.getBoundingClientRect();
          if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
          if (e.target && sec.contains(e.target)) return;
          _bgP3Log({ ev: 'covered', by: _bgP3Desc(e.target) });
        } catch (er) {}
      }, true);
    }
  } catch (e) {}
}
// v1939: greenie tap log (see renderP3GreenieEntry). Ring of the last 150 events per round,
// pushed to a diag:greenie:<round>:<device> row at most every 20 s. Best effort only - a
// failure here can never touch the round itself.
function _bgP3Desc(el) {
  try {
    if (!el) return null;
    let s = (el.tagName || '').toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.');
    return s.slice(0, 80);
  } catch (e) { return null; }
}
function _bgP3Log(o) {
  try {
    const g = state.game; if (!g || !g.code) return;
    const k = 'bg_p3diag_' + g.code;
    let ring = window._bgP3Ring && window._bgP3Ring.code === g.code ? window._bgP3Ring : null;
    if (!ring) { let a = []; try { a = JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) {} ring = window._bgP3Ring = { code: g.code, list: a }; }
    o.t = Date.now(); o.hole = state.currentHole;
    ring.list.push(o); if (ring.list.length > 150) ring.list.splice(0, ring.list.length - 150);
    try { localStorage.setItem(k, JSON.stringify(ring.list)); } catch (e) {}
    if (window._bgP3PushT) return;
    window._bgP3PushT = setTimeout(function () {
      window._bgP3PushT = null;
      try {
        if (!supa || !state.game || state.game.code !== ring.code) return;
        let dev = null; try { dev = localStorage.getItem('bg_diag_dev'); if (!dev) { dev = Math.random().toString(36).slice(2, 8); localStorage.setItem('bg_diag_dev', dev); } } catch (e) { dev = 'x'; }
        const ua = (navigator.userAgent || '').slice(0, 160);
        supa.from('games').upsert({ code: 'diag:greenie:' + ring.code + ':' + dev, data: { build: BG_BUILD, ua: ua, events: ring.list }, updated_at: new Date().toISOString() }).then(function () {}, function () {});
      } catch (e) {}
    }, 20000);
  } catch (e) {}
}

// Putts stepper handler."""))


def bump(src):
    m = re.search(r"<!--BGVER=v2026\.11\.(\d+)-->", src); assert m
    n = int(m.group(1)); assert n == 1938, n
    src = src.replace("<!--BGVER=v2026.11.1938-->", "<!--BGVER=v2026.11.1939-->", 1)
    assert src.count("const BG_BUILD = 'v2026.11.1938';") == 1
    src = src.replace("const BG_BUILD = 'v2026.11.1938';", "const BG_BUILD = 'v2026.11.1939';", 1)
    return src


for path in sys.argv[1:]:
    src = open(path, encoding='utf-8').read()
    for name, old, new in EDITS:
        c = src.count(old)
        assert c == 1, (path, name, c)
        src = src.replace(old, new, 1)
    src = bump(src)
    open(path, 'w', encoding='utf-8', newline='').write(src)
    print('patched', path)
