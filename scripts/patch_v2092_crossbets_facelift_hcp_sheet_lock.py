#!/usr/bin/env python3
# v2026.11.2092 -- Tyler, 11/27 8:00pm, two phone screenshots from Kerbo Group - Saturday setup:
#  1. Players & handicaps: "it not locked on the screen so when you accidently hit it with you finnger instead of going
#     up and down it goes all over the place." The list scrolled SIDEWAYS (rows wider than the sheet), which also pushed
#     the names off the left edge.
#  2. "The cross bets screen need a face lift. It works fine but is not in line with any of our other modern screens."
# What changed:
#  * Players & handicaps list: up / down only (no sideways pan); a row that does not fit wraps the stepper under the
#    name instead of squeezing the name to "...".
#  * Cross bets screen: same controls, same ids, same save path -- new face. Player tiles with photo / initials and a
#    check, the game as four tiles, every option as two tap tiles instead of a dropdown, a units stepper, the bets set
#    so far as cards, the long explanation behind "How it works", and the "2 bets: Tyler v Britt ..." line pinned above
#    the buttons. The native selects / checkboxes stay in the page (hidden) and stay the single source of truth.
import sys, io
OLD_V, NEW_V = 'v2026.11.2091', 'v2026.11.2092'
CSS = r'''
  /* v2092: Players & handicaps -- the list moves up and down only, and a row that cannot fit wraps instead of sliding */
  #t2he-list { overflow-x: hidden; overscroll-behavior: contain; touch-action: pan-y; }
  #t2he-list .t2he-row { flex-wrap: wrap; row-gap: 6px; min-width: 0; }
  #t2he-list .t2he-nm { flex: 1 1 96px; min-width: 0; }
  #t2he-list .t2he-ctl { display: inline-flex; align-items: center; gap: 8px; flex: 0 0 auto; margin-left: auto; max-width: 100%; }
  /* v2092: the Cross bets screen */
  .modal.bg-xb { max-width: 460px; width: 94%; max-height: 88vh; display: flex; flex-direction: column; position: relative; }
  .bg-xb-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 2px; }
  .bg-xb-head h2 { margin: 0; min-width: 0; }
  .bg-xb-head .bg-xb-x { flex-shrink: 0; line-height: 1; }
  .bg-xb-sub { margin: 0 0 4px; font-size: 14px; color: var(--bg-text-muted); white-space: normal; }
  .bg-xb-how { margin: 0 0 6px; font-size: 13px; line-height: 1.45; color: var(--bg-text-muted); white-space: normal; }
  .bg-xb-how summary { cursor: pointer; font-weight: 700; font-size: 14px; color: var(--accent); min-height: 40px; display: flex; align-items: center; gap: 6px; list-style: none; }
  .bg-xb-how summary::-webkit-details-marker { display: none; }
  .bg-xb-how summary::after { content: '\25BE'; font-size: 12px; }
  .bg-xb-how[open] summary::after { content: '\25B4'; }
  .bg-xb-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; min-height: 120px; overscroll-behavior: contain; touch-action: pan-y; padding: 2px; }
  .bg-xb-sec { font-size: 12px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: var(--bg-text-muted); margin: 18px 2px 8px; }
  .bg-xb-scroll > .bg-xb-sec:first-child { margin-top: 4px; }
  .bg-xb-card { background: var(--bg-surface); border: 1px solid var(--bg-border); border-radius: 14px; padding: 2px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .bg-xb-bet { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--bg-border); min-height: 60px; }
  .bg-xb-bet:first-child { border-top: 0; }
  .bg-xb-bet .bg-el-av { width: 34px; height: 34px; font-size: 12px; }
  .bg-xb-bet .bg-el-av + .bg-el-av { margin-left: -6px; }
  .bg-xb-bet-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; line-height: 1.3; }
  .bg-xb-bet-main b { font-size: 16px; font-weight: 800; color: var(--bg-text); overflow-wrap: break-word; }
  .bg-xb-bet-main > span { font-size: 13px; color: var(--bg-text-muted); white-space: normal; }
  .bg-xb-chip { display: inline-block; font-size: 12px; font-weight: 700; color: var(--bg-brand-dark); background: var(--bg-brand-tint); border-radius: 999px; padding: 2px 9px; margin-right: 4px; white-space: nowrap; }
  .bg-xb-rm { width: 40px; height: 40px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: var(--danger); font-weight: 800; font-size: 16px; cursor: pointer; flex-shrink: 0; background: var(--bg-surface-sunk); }
  .bg-xb-empty { font-size: 14px; color: var(--bg-text-muted); padding: 14px 0; }
  .bg-xb-grp { font-size: 13px; font-weight: 700; color: var(--accent); margin: 12px 2px 6px; }
  .bg-xb-pls { display: grid; grid-template-columns: 1fr; gap: 8px; }
  @media (min-width: 520px) { .bg-xb-pls { grid-template-columns: 1fr 1fr; } }
  .bg-xb-pl { position: relative; display: flex; align-items: center; gap: 8px; min-height: 54px; padding: 7px 12px; border: 1.5px solid var(--bg-border); border-radius: 14px; background: var(--bg-surface); cursor: pointer; min-width: 0; -webkit-tap-highlight-color: transparent; }
  .bg-xb-pl input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }
  .bg-xb-pl .bg-el-av { width: 36px; height: 36px; font-size: 13px; }
  .bg-xb-pl-nm { flex: 1; min-width: 0; font-size: 16px; font-weight: 700; color: var(--bg-text); line-height: 1.2; overflow-wrap: break-word; white-space: normal; }
  .bg-xb-pl-nm small { display: block; font-size: 12px; font-weight: 600; color: var(--bg-text-muted); }
  .bg-xb-pl-ck { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--bg-border); flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; color: transparent; }
  .bg-xb-pl.on { border-color: var(--bg-brand); background: var(--bg-brand-tint); }
  .bg-xb-pl.on .bg-xb-pl-ck { background: var(--bg-brand); border-color: var(--bg-brand); color: #fff; }
  .bg-xb-pl:focus-within { box-shadow: 0 0 0 2px var(--bg-brand); }
  .bg-xb .bg-xb-native { position: absolute !important; opacity: 0; pointer-events: none; width: 1px !important; height: 1px; padding: 0; border: 0; overflow: hidden; }
  .bg-xb label.help-text { font-size: 13px; font-weight: 700; color: var(--bg-text); display: block; margin: 14px 2px 6px; }
  .bg-xb-opts { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
  @media (max-width: 340px) { .bg-xb-opts { grid-template-columns: minmax(0, 1fr); } }
  html .modal.bg-xb .bg-xb-opt { display: flex !important; align-items: center; justify-content: space-between; gap: 8px; text-align: left; min-height: 58px; height: auto; width: 100%; padding: 9px 10px 9px 12px; border: 1.5px solid var(--bg-border) !important; border-radius: 14px; background: var(--bg-surface) !important; color: var(--bg-text) !important; white-space: normal; box-shadow: none !important; }
  .bg-xb .bg-xb-ot { flex: 1; min-width: 0; display: block; text-align: left; }
  .bg-xb .bg-xb-ot b { display: block; font-size: 15px; font-weight: 800; line-height: 1.2; }
  .bg-xb .bg-xb-os { display: block; margin-top: 2px; font-size: 12px; font-weight: 500; color: var(--bg-text-muted); line-height: 1.25; }
  .bg-xb .bg-xb-dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--bg-border); box-sizing: border-box; flex-shrink: 0; }
  html .modal.bg-xb .bg-xb-opt.on { border-color: var(--bg-brand) !important; background: var(--bg-brand-tint) !important; box-shadow: 0 0 0 1px var(--bg-brand) !important; }
  .bg-xb .bg-xb-opt.on .bg-xb-dot { border-color: var(--bg-brand); background: var(--bg-brand); box-shadow: inset 0 0 0 3px var(--bg-brand-tint); }
  .bg-xb .bg-xb-step, .bg-xb .bg-xb-opt, .bg-xb-pl { touch-action: manipulation; }
  .bg-xb-units { display: flex; align-items: center; gap: 10px; }
  html .modal.bg-xb .bg-xb-step { width: 54px; min-width: 54px; height: 52px; border-radius: 14px; font-size: 26px !important; font-weight: 800; padding: 0; flex-shrink: 0; }
  .bg-xb .bg-xb-units input { flex: 1; min-width: 0; width: auto; height: 52px; text-align: center; font-size: 22px; font-weight: 800; border-radius: 14px; }
  .bg-xb-sum { margin-top: 10px; font-size: 14px; font-weight: 600; line-height: 1.35; color: var(--bg-text); background: var(--bg-brand-tint); border-radius: 12px; padding: 9px 12px; white-space: normal; }
  .bg-xb-sum:empty { display: none; }
  .bg-xb-foot { display: flex; gap: 8px; margin-top: 10px; }
  .bg-xb-foot .bg-btn { flex: 1; min-height: 50px; font-size: 16px; }
  .bg-xb-foot .bg-btn:first-child { flex: 0 0 34%; }
'''
JS = r'''// v2092: the Cross bets screen's face. The selects and checkboxes the screen was built on stay in the page (hidden) and
// stay the only source of truth; these two functions draw tap tiles over them and keep the tiles in step.
function bgXbFace(ov) {
  try {
    ov.querySelectorAll('select').forEach(sel => {
      if (sel._bgXb || !sel.id) return; sel._bgXb = 1;
      sel.classList.add('bg-xb-native'); sel.setAttribute('tabindex', '-1'); sel.setAttribute('aria-hidden', 'true');
      const box = document.createElement('div'); box.className = 'bg-xb-opts'; box.setAttribute('data-noi18n', ''); box.setAttribute('role', 'group'); box.dataset.xbFor = sel.id;
      sel.parentNode.insertBefore(box, sel.nextSibling);
      box.addEventListener('click', e => { const b = e.target.closest ? e.target.closest('.bg-xb-opt') : null; if (!b || sel.value === b.dataset.v) return; sel.value = b.dataset.v; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    });
    ov.querySelectorAll('input[type="number"]').forEach(inp => {
      if (inp._bgXb || !/-val$/.test(inp.id || '')) return; inp._bgXb = 1;
      const w = document.createElement('div'); w.className = 'bg-xb-units';
      inp.parentNode.insertBefore(w, inp);
      const mk = (d, lbl) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'bg-btn bg-btn--ghost bg-xb-step'; b.textContent = d < 0 ? '−' : '+'; b.setAttribute('aria-label', lbl); b.setAttribute('data-noi18n', ''); b.setAttribute('data-action', 'xb-step');   // data-action: exempt from the 350 ms same-button double-tap guard, so + + + counts three
        b.onclick = () => { const cur = parseFloat(inp.value); const nx = Math.max(0, (isFinite(cur) ? cur : 0) + d); inp.value = String(Math.round(nx * 100) / 100); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); }; return b; };
      w.appendChild(mk(-1, 'Lower')); w.appendChild(inp); w.appendChild(mk(1, 'Raise'));
    });
    bgXbFacePaint(ov);
  } catch (e) { try { console.warn('bgXbFace', e); } catch (e2) {} }
}
function bgXbFacePaint(ov) {
  try {
    const T = s => { try { return (typeof bgT === 'function') ? bgT(s) : s; } catch (e) { return s; } };
    const ICON = { match: '🆚', nassau: '🎯', stroke: '🏌️', quota: '🔢' };
    ov.querySelectorAll('.bg-xb-opts').forEach(box => {
      const sel = ov.querySelector('#' + box.dataset.xbFor); if (!sel) return;
      const isKind = /kind$/.test(sel.id);
      const opts = Array.from(sel.options);
      const sig = opts.map(o => o.value + '=' + o.textContent).join('|');
      if (box._sig !== sig) {
        box._sig = sig;
        box.innerHTML = opts.map(o => {
          const full = T(String(o.textContent || '').trim());
          let a = full, b = '';
          const m = full.match(/^(.*?)\s+[—–-]\s+(.*)$/) || full.match(/^(.*?)\s*\((.*)\)\s*$/);
          if (m) { a = m[1]; b = m[2]; }
          return '<button type="button" class="bg-btn bg-xb-opt" data-v="' + escapeHtml(o.value) + '"><span class="bg-xb-ot"><b>' + (isKind && ICON[o.value] ? ICON[o.value] + ' ' : '') + escapeHtml(a) + '</b>' + (b ? '<span class="bg-xb-os">' + escapeHtml(b.charAt(0).toUpperCase() + b.slice(1)) + '</span>' : '') + '</span><span class="bg-xb-dot" aria-hidden="true"></span></button>';
        }).join('');
      }
      box.querySelectorAll('.bg-xb-opt').forEach(b => { const on = b.dataset.v === sel.value; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    });
    ov.querySelectorAll('.bg-xb-pl').forEach(l => { const c = l.querySelector('input'); l.classList.toggle('on', !!(c && c.checked)); });
  } catch (e) {}
}
'''
def patch(path):
    src = io.open(path, encoding='utf-8').read()
    if NEW_V in src: print(path, 'already patched'); return
    assert src.count(OLD_V) == 4, (path, 'version', src.count(OLD_V))
    n = [0]
    def one(name, old, new):
        nonlocal src
        c = src.count(old); assert c == 1, (path, name, c)
        src = src.replace(old, new); n[0] += 1
    one('css', "  .bg-el-sh-foot { display: flex; gap: 8px; margin-top: 14px; }\n", "  .bg-el-sh-foot { display: flex; gap: 8px; margin-top: 14px; }\n" + CSS.lstrip('\n'))
    one('js', "function bgXbetOpen(g) {\n", JS + "function bgXbetOpen(g) {\n")
    one('hcp ctl', "'</span></span>' + right + rm + '</div>';", "'</span></span><span class=\"t2he-ctl\">' + right + rm + '</span></div>';   // v2092: the stepper and the remove button wrap as one piece")
    # ---------- the event's Cross bets screen ----------
    a = src.index("    const opt = (v, tx, sel) =>"); b = src.index("    document.body.appendChild(ov);\n", a)
    blk = src[a:b]; assert 3000 < len(blk) < 9000, len(blk)
    def sub(name, old, new):
        nonlocal blk
        c = blk.count(old); assert c == 1, (path, 'blk ' + name, c)
        blk = blk.replace(old, new); n[0] += 1
    i0 = blk.index("    const pick = r => "); i1 = blk.index("\n", i0)
    blk = blk[:i0] + (
        "    const _xbCol = (typeof bgScStandColors === 'function') ? bgScStandColors({ players: rows.map(r => ({ id: r.id, name: r.name })) }) : {};   // v2092: one colour per player\n"
        "    const _xbAv = nm => { try { const r = rows.find(x => x.name === nm) || { name: nm }; return bgAvCircleHtml({ name: r.name }, 'bg-el-av', 'bg-el-av-photo', _xbCol[r.id] || null, false); } catch (e) { return ''; } };\n"
        "    const pick = r => { const me = !!(myName && r.name === myName); return '<label class=\"bg-xb-pl\"><input type=\"checkbox\" class=\"t2xb-pl\" data-name=\"' + esc(r.name) + '\"' + (me ? ' checked' : '') + '>' + _xbAv(r.name) + '<span class=\"bg-xb-pl-nm\">' + esc(r.name) + (me ? '<small>you</small>' : '') + '</span><span class=\"bg-xb-pl-ck\" aria-hidden=\"true\">\\u2713</span></label>'; };"
    ) + blk[i1:]; n[0] += 1
    sub('empty', "'<div class=\"small-text\" style=\"color:var(--text-muted);padding:6px 0 2px\">No cross bets set for this day yet.</div>'", "'<div class=\"bg-xb-empty\">No cross bets set for this day yet.</div>'")
    i0 = blk.index("      return bets.map(b => { const L = bgT2CrossBetLabel(b); return "); i1 = blk.index("\n", i0)
    blk = blk[:i0] + (
        "      return bets.map(b => { const L = bgT2CrossBetLabel(b); return '<div class=\"bg-xb-bet\"><span class=\"bg-el-avs\">' + (b.names || []).slice(0, 4).map(_xbAv).join('') + '</span>'"
        " + '<span class=\"bg-xb-bet-main\"><b>' + esc(L.who) + '</b><span><span class=\"bg-xb-chip\">' + esc(L.game) + '</span>' + esc(L.terms) + (b.by ? ' · set by ' + esc(String(b.by).split(/\\s+/)[0]) : '') + '</span></span>'"
        " + (canRemove(b) ? '<span role=\"button\" tabindex=\"0\" class=\"t2xb-rm bg-xb-rm\" data-id=\"' + esc(b.id) + '\" title=\"Remove this bet\" aria-label=\"Remove this bet\">✕</span>' : '') + '</div>'; }).join('');"
    ) + blk[i1:]; n[0] += 1
    sub('groups', "      rows.forEach(r => { const gl = r.group ? ('Group ' + r.group) : 'Not in a group yet'; if (gl !== cur) { cur = gl; listHtml += '<div class=\"help-text\" style=\"' + lab + '\">' + esc(gl) + '</div>'; } listHtml += pick(r); });\n"
                  "    } else listHtml = '<div class=\"help-text\" style=\"' + lab + '\">Players</div>' + rows.map(pick).join('');",
                  "      rows.forEach(r => { const gl = r.group ? ('Group ' + r.group) : 'Not in a group yet'; if (gl !== cur) { listHtml += (cur === null ? '' : '</div>') + '<div class=\"bg-xb-grp\">' + esc(gl) + '</div><div class=\"bg-xb-pls\">'; cur = gl; } listHtml += pick(r); });\n"
                  "      if (cur !== null) listHtml += '</div>';\n"
                  "    } else listHtml = '<div class=\"bg-xb-grp\">Players</div><div class=\"bg-xb-pls\">' + rows.map(pick).join('') + '</div>';")
    sub('shell', "    ov.innerHTML = '<div class=\"modal\" style=\"max-width:460px;width:94%;max-height:88vh;display:flex;flex-direction:column;position:relative\">' +\n"
                 "      '<button type=\"button\" class=\"bg-btn bg-btn--ghost bg-btn--icon\" id=\"t2xb-x\" aria-label=\"Close\" style=\"position:absolute;top:10px;right:12px;line-height:1\">✕</button>' +\n"
                 "      '<h2 style=\"margin:0 30px 4px 0\">⚔️ Cross bets' + (Number(t.num_days) > 1 ? ' · Day ' + day : '') + '</h2>' +\n"
                 "      '<p class=\"help-text\" style=\"margin:0 0 6px;white-space:normal\">' + intro + (live && mgr ? ' The event is live: bets added now still count on every card.' : '') + '</p>' +\n"
                 "      '<div id=\"t2xb-scroll\" style=\"flex:1;overflow-y:auto;min-height:120px\">' +\n"
                 "      '<div class=\"help-text\" style=\"' + lab + '\">Set so far</div><div id=\"t2xb-list\">' + renderList() + '</div>' +\n"
                 "      '<div class=\"help-text\" style=\"font-weight:700;margin:14px 0 2px;font-size:14px\">Add cross bets</div>' + listHtml +\n",
                 "    ov.innerHTML = '<div class=\"modal bg-xb\">' +\n"
                 "      '<div class=\"bg-xb-head\"><h2>⚔️ Cross bets' + (Number(t.num_days) > 1 ? ' · Day ' + day : '') + '</h2><button type=\"button\" class=\"bg-btn bg-btn--ghost bg-btn--icon bg-xb-x\" id=\"t2xb-x\" aria-label=\"Close\">✕</button></div>' +\n"
                 "      '<p class=\"bg-xb-sub\">' + (mgr ? 'Games between players in different groups.' : 'Games between you and players in other groups.') + (live && mgr ? ' The event is live: bets added now still count on every card.' : '') + '</p>' +\n"
                 "      '<details class=\"bg-xb-how\"><summary>How it works</summary>' + intro + '</details>' +\n"
                 "      '<div id=\"t2xb-scroll\" class=\"bg-xb-scroll\">' +\n"
                 "      '<div class=\"bg-xb-sec\">Set so far</div><div id=\"t2xb-list\" class=\"bg-xb-card\">' + renderList() + '</div>' +\n"
                 "      '<div class=\"bg-xb-sec\">Add cross bets</div>' + listHtml +\n")
    sub('foot', "      '<div id=\"t2xb-count\" class=\"small-text\" style=\"margin-top:8px;color:var(--text-muted);white-space:normal\"></div></div>' +\n"
                "      '<div class=\"actions\" style=\"margin-top:12px\"><button type=\"button\" class=\"bg-btn bg-btn--ghost\" id=\"t2xb-close\">Cancel</button><button type=\"button\" class=\"bg-btn bg-btn--primary primary\" id=\"t2xb-save\">Add bets</button></div></div>';",
                "      '</div>' +\n"
                "      '<div id=\"t2xb-count\" class=\"bg-xb-sum\" aria-live=\"polite\"></div>' +\n"
                "      '<div class=\"bg-xb-foot\"><button type=\"button\" class=\"bg-btn bg-btn--ghost\" id=\"t2xb-close\">Cancel</button><button type=\"button\" class=\"bg-btn bg-btn--primary primary\" id=\"t2xb-save\">Add bets</button></div></div>';")
    src = src[:a] + blk + src[b:]
    one('face call', "    ov.addEventListener('change', sync); q('t2xb-val').addEventListener('input', sync); sync();\n",
        "    ov.addEventListener('change', sync); q('t2xb-val').addEventListener('input', sync);\n    try { bgXbFace(ov); } catch (e) {}   // v2092: tiles over the native controls\n    sync();\n")
    one('paint in sync', "      if (sb) { sb.textContent = n ? ('Add ' + n + ' bet' + (n === 1 ? '' : 's')) : 'Add bets'; sb.disabled = !n; }\n",
        "      if (sb) { sb.textContent = n ? ('Add ' + n + ' bet' + (n === 1 ? '' : 's')) : 'Add bets'; sb.disabled = !n; }\n      try { bgXbFacePaint(ov); } catch (e) {}   // v2092\n")
    # ---------- the in-round fallback sheet gets the same face ----------
    one('fb shell', "    ov.innerHTML = '<div class=\"modal\" style=\"max-width:440px;max-height:88vh;display:flex;flex-direction:column\">' +\n      '<h2 style=\"margin:0 0 4px\">Cross bet with other groups</h2>' +",
        "    ov.innerHTML = '<div class=\"modal bg-xb\">' +\n      '<h2>Cross bet with other groups</h2>' +")
    one('fb pick', "    const pick = (nm, sub, on) => '<label style=\"display:flex;align-items:center;gap:10px;padding:8px 2px;border-top:1px solid var(--border);cursor:pointer\"><input type=\"checkbox\" class=\"xb-pl\" data-name=\"' + escapeHtml(String(nm)) + '\"' + (on ? ' checked' : '') + ' style=\"width:20px;height:20px;flex:0 0 auto\"><span style=\"flex:1;min-width:0;white-space:normal\"><span style=\"font-weight:600\">' + escapeHtml(String(nm)) + '</span>' + (sub ? ' <span class=\"small-text\" style=\"color:var(--text-muted)\">· ' + escapeHtml(sub) + '</span>' : '') + '</span></label>';",
        "    const pick = (nm, sub, on) => '<label class=\"bg-xb-pl\"><input type=\"checkbox\" class=\"xb-pl\" data-name=\"' + escapeHtml(String(nm)) + '\"' + (on ? ' checked' : '') + '>' + bgAvCircleHtml({ name: String(nm) }, 'bg-el-av', 'bg-el-av-photo', null, false) + '<span class=\"bg-xb-pl-nm\">' + escapeHtml(String(nm)) + (sub ? '<small>' + escapeHtml(sub) + '</small>' : '') + '</span><span class=\"bg-xb-pl-ck\" aria-hidden=\"true\">\\u2713</span></label>';   // v2092")
    one('fb lists', "      '<div class=\"help-text\" style=\"' + lab + '\">This group</div>' + mine.map(p => pick(p.name, '', p.id === myId)).join('') +\n      '<div class=\"help-text\" style=\"' + lab + '\">Other groups</div>' + others.map(o => pick(o.name, o.started ? ('Group ' + o.group) : 'not started yet', false)).join('') +",
        "      '<div class=\"bg-xb-grp\">This group</div><div class=\"bg-xb-pls\">' + mine.map(p => pick(p.name, '', p.id === myId)).join('') + '</div>' +\n      '<div class=\"bg-xb-grp\">Other groups</div><div class=\"bg-xb-pls\">' + others.map(o => pick(o.name, o.started ? ('Group ' + o.group) : 'not started yet', false)).join('') + '</div>' +")
    one('fb scroll', "      '<p class=\"help-text\" style=\"margin:0 0 4px;white-space:normal\">Tick everyone in the bet. Three or more players means everyone against everyone, each pair its own bet at the same stake. Scored on the holes both players finish; it settles on the Event Leaderboard.</p>' +\n      '<div style=\"flex:1;overflow-y:auto;min-height:120px\">' +",
        "      '<p class=\"bg-xb-sub\">Tick everyone in the bet. Three or more players means everyone against everyone, each pair its own bet at the same stake. Scored on the holes both players finish; it settles on the Event Leaderboard.</p>' +\n      '<div class=\"bg-xb-scroll\">' +")
    one('fb foot', "      '<div id=\"xb-count\" class=\"small-text\" style=\"margin-top:8px;color:var(--text-muted);white-space:normal\"></div></div>' +\n      '<div class=\"actions\" style=\"margin-top:12px\"><button class=\"bg-btn bg-btn--ghost\" id=\"xb-cancel\">Cancel</button><button class=\"bg-btn bg-btn--primary primary\" id=\"xb-save\">Save</button></div></div>';",
        "      '</div><div id=\"xb-count\" class=\"bg-xb-sum\" aria-live=\"polite\"></div>' +\n      '<div class=\"bg-xb-foot\"><button class=\"bg-btn bg-btn--ghost\" id=\"xb-cancel\">Cancel</button><button class=\"bg-btn bg-btn--primary primary\" id=\"xb-save\">Save</button></div></div>';")
    one('fb face', "    ov.addEventListener('change', sync); q('xb-val').addEventListener('input', sync); sync();\n",
        "    ov.addEventListener('change', sync); q('xb-val').addEventListener('input', sync);\n    try { bgXbFace(ov); } catch (e) {}   // v2092\n    sync();\n")
    one('fb paint', "      if (c) c.textContent = (typeof d === 'string') ? '' : (d.bets.length + ' bet' + (d.bets.length === 1 ? '' : 's') + ': ' + d.bets.map(b => b.names.map(n => String(n).split(/\\s+/)[0]).join(' v ')).join(', ') + (d.same.length ? ('. Not included (same card): ' + d.same.map(pr => pr.map(n => String(n).split(/\\s+/)[0]).join(' v ')).join(', ')) : ''));\n",
        "      if (c) c.textContent = (typeof d === 'string') ? '' : (d.bets.length + ' bet' + (d.bets.length === 1 ? '' : 's') + ': ' + d.bets.map(b => b.names.map(n => String(n).split(/\\s+/)[0]).join(' v ')).join(', ') + (d.same.length ? ('. Not included (same card): ' + d.same.map(pr => pr.map(n => String(n).split(/\\s+/)[0]).join(' v ')).join(', ')) : ''));\n      try { bgXbFacePaint(ov); } catch (e) {}   // v2092\n")
    src = src.replace(OLD_V, NEW_V)
    io.open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched', n[0], 'edits')
for f in (sys.argv[1:] or ['golf-app.html', 'www/index.html']): patch(f)
