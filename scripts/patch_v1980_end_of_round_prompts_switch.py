import sys
OLD_VER, NEW_VER = 'v2026.11.1979', 'v2026.11.1980'
edits = [
# Settings row, right under Round pop-ups
("""            <input type="checkbox" id="pref-popups" class="bg-sw" style="width:auto;margin:0;transform:scale(1.3);flex:0 0 auto" checked>
          </label>""",
 """            <input type="checkbox" id="pref-popups" class="bg-sw" style="width:auto;margin:0;transform:scale(1.3);flex:0 0 auto" checked>
          </label>
          <!-- v1980 (Tyler): "add an option in settings to turn off end of round prompts such as ratings and reviews. Some people like them, some people hate them." -->
          <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;margin-top:10px">
            <span style="font-weight:500">⭐ End-of-round prompts<br><span class="small-text" style="color:var(--text-muted);font-weight:400">Rate the course, review the app, share it — asked after a round. Off = never asked.</span></span>
            <input type="checkbox" id="pref-eor-prompts" class="bg-sw" style="width:auto;margin:0;transform:scale(1.3);flex:0 0 auto" checked>
          </label>""",
 "settings row"),
# synced pref key
("""  'bg_colorblind', 'bg_score_entry'];   // v1928 · v1952 score entry style""",
 """  'bg_colorblind', 'bg_score_entry', 'bg_eor_prompts'];   // v1928 · v1952 score entry style · v1980 end-of-round prompts""",
 "sync key"),
# helpers next to popupsEnabled
("""  try { return localStorage.getItem('bg_popups_enabled') !== '0'; } catch (e) { return true; }""",
 """  try { return localStorage.getItem('bg_popups_enabled') !== '0'; } catch (e) { return true; }
}
// v1980: end-of-round prompts (Round Rating ask, App Store review ask, invite nudge). Default on.
function eorPromptsEnabled() {
  try { return localStorage.getItem('bg_eor_prompts') !== '0'; } catch (e) { return true; }
}
function setEorPromptsEnabled(on) {
  try { localStorage.setItem('bg_eor_prompts', on ? '1' : '0'); } catch (e) {} try { bgPrefsNotePush('bg_eor_prompts'); } catch (e) {}""",
 "helpers"),
# wire at boot (next to pref-popups boot wiring)
("""  { const pp = document.getElementById('pref-popups');
    if (pp) { try { pp.checked = popupsEnabled(); } catch (e) {} pp.onchange = () => setPopupsEnabled(pp.checked); } }""",
 """  { const pp = document.getElementById('pref-popups');
    if (pp) { try { pp.checked = popupsEnabled(); } catch (e) {} pp.onchange = () => setPopupsEnabled(pp.checked); } }
  { const ep = document.getElementById('pref-eor-prompts');   // v1980
    if (ep) { try { ep.checked = eorPromptsEnabled(); } catch (e) {} ep.onchange = () => setEorPromptsEnabled(ep.checked); } }""",
 "boot wiring"),
# repaint after a cloud prefs pull
("""  try { const ts = document.getElementById('pref-track-shot'); if (ts) ts.checked = trackShotEnabled(); } catch (e) {}""",
 """  try { const ts = document.getElementById('pref-track-shot'); if (ts) ts.checked = trackShotEnabled(); } catch (e) {}
  try { const ep = document.getElementById('pref-eor-prompts'); if (ep && typeof eorPromptsEnabled === 'function') ep.checked = eorPromptsEnabled(); } catch (e) {}   // v1980""",
 "repaint"),
# gate the chain
("""          let shown = false;
          const _storeDue = (typeof bgStoreAskDue === 'function') && bgStoreAskDue(g);""",
 """          let shown = false;
          if (typeof eorPromptsEnabled === 'function' && !eorPromptsEnabled()) {   // v1980: switched off in Settings - no prompt of any kind
            try { if (g && g.code) localStorage.setItem('golf:rr-asked:' + g.code, '1'); } catch (e) {}
            return;
          }
          const _storeDue = (typeof bgStoreAskDue === 'function') && bgStoreAskDue(g);""",
 "chain gate"),
# gate the Home-rows ask for other players
("""      if (_recentBusy || !signedIn()) return;
      const cut = Date.now() - 36 * 3600 * 1000;""",
 """      if (_recentBusy || !signedIn()) return;
      if (typeof eorPromptsEnabled === 'function' && !eorPromptsEnabled()) return;   // v1980
      const cut = Date.now() - 36 * 3600 * 1000;""",
 "home gate"),
("<!--BGVER=" + OLD_VER + "-->", "<!--BGVER=" + NEW_VER + "-->", "BGVER"),
("const BG_BUILD = '" + OLD_VER + "';", "const BG_BUILD = '" + NEW_VER + "';", "BG_BUILD"),
]
for path in sys.argv[1:]:
    src = open(path, encoding='utf-8', newline='').read()
    for old, new, name in edits:
        n = src.count(old); assert n == 1, f"{path}: '{name}' matched {n} times"
        src = src.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched')
