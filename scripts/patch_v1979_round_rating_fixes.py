import sys
OLD_VER, NEW_VER = 'v2026.11.1978', 'v2026.11.1979'
edits = [
# 1. close the sheet the moment the save lands; chips refresh in the background; save is bounded
("""          if (!ok) { save.disabled = false; save.textContent = 'Save rating'; try { showToast('Couldn\\u2019t save \\u2014 check your connection'); } catch (e) {} return; }
          invalidate(id);
          try { showToast('Thanks \\u2014 rating saved \\u2605'); } catch (e) {}
          try { const map = await fetchSummary([id]); paintChips(map); } catch (e) {}
          finish(true);""",
 """          if (!ok) { save.disabled = false; save.textContent = 'Save rating'; try { showToast('Couldn\\u2019t save your rating \\u2014 try again in a moment'); } catch (e) {} return; }
          // v1979 (Tyler): "once I clicked saved rating the screen should have went away" - close
          // FIRST; the chip refresh is background work the player never waits on.
          invalidate(id);
          finish(true);
          try { showToast('Thanks \\u2014 rating saved \\u2605'); } catch (e) {}
          try { fetchSummary([id]).then(paintChips).catch(function () {}); } catch (e) {}""",
 "close first"),
("""            const r = await supa.from('round_ratings').upsert({ course_id: id, user_id: (_authUser && _authUser.id) || (window._authUser && window._authUser.id), stars: stars, note: note || null, game_code: opts.gameCode || null, updated_at: new Date().toISOString() }, { onConflict: 'course_id,user_id' });
            ok = !(r && r.error);""",
 """            const _up = supa.from('round_ratings').upsert({ course_id: id, user_id: (_authUser && _authUser.id) || (window._authUser && window._authUser.id), stars: stars, note: note || null, game_code: opts.gameCode || null, updated_at: new Date().toISOString() }, { onConflict: 'course_id,user_id' });
            const r = (typeof _promiseTimeout === 'function') ? await _promiseTimeout(_up, 10000, 'round-rating-save') : await _up;   // v1979: never leave the sheet stuck on "Saving…"
            ok = !(r && r.error);
            if (r && r.error) { try { console.warn('round rating save', r.error); } catch (e) {} }""",
 "bounded save"),
# 2. a reopened round never asks
("""      if (g._mapOnly || g._preview) return false;""",
 """      if (g._mapOnly || g._preview) return false;
      // v1979 (Tyler): "when someone reopens a round we should not prompt this" - only the FIRST
      // finish asks. A reopen-and-refinish is marked asked so the Home path stays quiet too.
      if (g.reopenedAt) { try { localStorage.setItem(askedKey(g.code), '1'); } catch (e) {} return false; }""",
 "reopen guard"),
# 3. gold that pops
("""  .bg-rr-chip { display:inline-flex; align-items:center; gap:3px; flex:0 0 auto; font-size:12px; font-weight:700; color:var(--gold,#d4af37); white-space:nowrap; cursor:pointer; padding:2px 6px; border-radius:99px; background:rgba(212,175,55,0.12); line-height:1.2; }""",
 """  :root { --rr-gold: #FFB800; }   /* v1979 (Tyler): "my stars look brown on the phone, make them a gold color that pops" */
  .bg-rr-chip { display:inline-flex; align-items:center; gap:3px; flex:0 0 auto; font-size:12px; font-weight:700; color:#B8860B; white-space:nowrap; cursor:pointer; padding:2px 6px; border-radius:99px; background:rgba(255,184,0,0.16); line-height:1.2; }
  :root[data-theme="dark"] .bg-rr-chip { color:var(--rr-gold); }""",
 "chip gold"),
("""  .bg-rr-stars button.on { color:var(--gold,#d4af37); }""",
 """  .bg-rr-stars button.on { color:var(--rr-gold); text-shadow:0 1px 2px rgba(0,0,0,0.18); }""",
 "stars gold"),
("""  .bg-rr-hist .bar i { display:block; height:100%; background:var(--gold,#d4af37); }""",
 """  .bg-rr-hist .bar i { display:block; height:100%; background:var(--rr-gold); }""",
 "hist gold"),
("""      let h = '<div style="text-align:center;font-size:26px;font-weight:800;color:var(--gold,#d4af37)">\\u2605 ' + (s.avg != null ? Number(s.avg).toFixed(1) : '\\u2014') + '</div>'""",
 """      let h = '<div style="text-align:center;font-size:26px;font-weight:800;color:var(--rr-gold)">\\u2605 ' + (s.avg != null ? Number(s.avg).toFixed(1) : '\\u2014') + '</div>'""",
 "avg gold"),
("""<span style="color:var(--gold,#d4af37)">' + '\\u2605'.repeat(""",
 """<span style="color:var(--rr-gold)">' + '\\u2605'.repeat(""",
 "row stars gold"),
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
