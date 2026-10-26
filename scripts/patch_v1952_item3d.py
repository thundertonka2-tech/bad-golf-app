#!/usr/bin/env python3
"""v1952 item 3d — CTP / Long Putt: manual entry findable, meters, via flag + manual tag, camera-fail handling."""
import sys

EDITS = []

# ── formatter: metric-aware + manual tag ──
EDITS.append((
"""function ctpFmtDist(e) {
  if (!e || e.ft == null) return '';
  return e.ft + "' " + (e.in || 0) + '"';
}""",
"""/* v1952 (Hoon, 10/26): one formatter for a putt / CTP distance. Stored as ft + in always
   (the v1903 "store base, convert at paint" rule); shown as ft' in" or, with the meters
   setting on, as x.xx m. A distance typed by hand (via:'manual') carries a small ✍︎ so the
   group can see which balls were measured with the camera and which were called. */
function ctpFmtDist(e) {
  if (!e || e.ft == null) return '';
  const inches = (Number(e.ft) || 0) * 12 + (Number(e.in) || 0);
  const s = bgUnitsMetric() ? ((inches * 0.0254).toFixed(2) + ' m') : (e.ft + "' " + (e.in || 0) + '"');
  return s + (e.via === 'manual' ? ' \\u270D\\uFE0E' : '');
}
// Typed meters -> {ft, in}. Inches are rounded; 12+ never happens.
function bgPuttFromMeters(m) {
  const inches = Math.max(0, Math.round((Number(m) || 0) / 0.0254));
  return { ft: Math.floor(inches / 12), in: inches % 12 };
}""",
"formatter"))

# ── camera: cancelled / failed -> point at the boxes; report how it was entered ──
EDITS.append((
"""    const r = await P.measure({ title: bgT(title), strings: BG_I18N.subset(BG_AR_STRINGS) });   // v1840
    if (!r || r.cancelled || r.inches == null) return;
    if (ftInp) ftInp.value = r.ft;
    if (inInp) inInp.value = r.in;
    if (typeof save === 'function') await save();
    try { showToast('\\ud83d\\udccf ' + r.ft + '\\u2032 ' + r.in + '\\u2033 recorded'); } catch (e) {}
  } catch (e) {
    const m = String((e && (e.message || e.code)) || e || '');
    try { showToast(/AR_UNSUPPORTED/.test(m) ? 'This phone can\\u2019t measure with the camera \\u2014 type the distance' : /CAMERA_DENIED/.test(m) ? 'Camera is off for Bad Golf \\u2014 turn it on in Settings, or type the distance' : 'Couldn\\u2019t measure \\u2014 type the distance', 'warn'); } catch (e2) {}   // v1831: Android camera-denied message
  }
}""",
"""    const r = await P.measure({ title: bgT(title), strings: BG_I18N.subset(BG_AR_STRINGS) });   // v1840
    if (!r || r.cancelled || r.inches == null) {
      // v1952 (Hoon, Buffalo Creek): a cancelled measure used to do nothing at all, so the
      // group never found the typed boxes. Point at them.
      try { showToast('No camera measurement \\u2014 type the distance instead', 'warn'); } catch (e) {}
      try { if (ftInp) { ftInp.focus(); ftInp.select && ftInp.select(); } } catch (e) {}
      return;
    }
    if (ftInp && ftInp.dataset && ftInp.dataset.unit === 'm') ftInp.value = (((Number(r.ft) || 0) * 12 + (Number(r.in) || 0)) * 0.0254).toFixed(2);   // v1952: meters box
    else { if (ftInp) ftInp.value = r.ft; if (inInp) inInp.value = r.in; }
    if (typeof save === 'function') await save('ar');   // v1952: measured with the camera
    try { showToast('\\ud83d\\udccf ' + ctpFmtDist({ ft: r.ft, in: r.in }) + ' recorded'); } catch (e) {}
  } catch (e) {
    const m = String((e && (e.message || e.code)) || e || '');
    try { showToast(/AR_UNSUPPORTED/.test(m) ? 'This phone can\\u2019t measure with the camera \\u2014 type the distance' : /CAMERA_DENIED/.test(m) ? 'Camera is off for Bad Golf \\u2014 turn it on in Settings, or type the distance' : 'Couldn\\u2019t measure \\u2014 type the distance', 'warn'); } catch (e2) {}   // v1831: Android camera-denied message
    try { if (ftInp) { ftInp.focus(); ftInp.select && ftInp.select(); } } catch (e2) {}   // v1952
  }
}
// v1952: the distance row shared by CTP and Long Putt — ft + in boxes, or one meters box.
function bgDistInputsHtml(idBase, hd) {
  const box = 'style="width:52px;min-width:0;padding:8px;border:1px solid var(--border);border-radius:8px"';
  if (bgUnitsMetric()) {
    const m = (hd && hd.ft != null) ? ((((Number(hd.ft) || 0) * 12 + (Number(hd.in) || 0)) * 0.0254).toFixed(2)) : '';
    return `<input type="number" id="${idBase}-ft" data-unit="m" min="0" max="60" step="0.01" inputmode="decimal" placeholder="m" value="${m}" style="width:72px;min-width:0;padding:8px;border:1px solid var(--border);border-radius:8px"><span style="font-size:13px;font-weight:700">m</span>`;
  }
  return `<input type="number" id="${idBase}-ft" min="0" max="200" inputmode="numeric" placeholder="ft" value="${hd && hd.ft != null ? hd.ft : ''}" ${box}>
      <span style="font-size:13px;font-weight:700">ft</span>
      <input type="number" id="${idBase}-in" min="0" max="11" inputmode="numeric" placeholder="in" value="${hd && hd.in != null ? hd.in : ''}" ${box}>
      <span style="font-size:13px;font-weight:700">in</span>`;
}""",
"measure"))

# ── Long Putt entry row ──
EDITS.append((
"""      <span style="font-size:12px;font-weight:500">Distance:</span>
      <input type="number" id="lp-ft" min="0" max="200" inputmode="numeric" placeholder="ft" value="${hd.ft != null ? hd.ft : ''}" style="width:52px;min-width:0;padding:8px;border:1px solid var(--border);border-radius:8px">
      <span style="font-size:13px;font-weight:700">ft</span>
      <input type="number" id="lp-in" min="0" max="11" inputmode="numeric" placeholder="in" value="${hd.in != null ? hd.in : ''}" style="width:52px;min-width:0;padding:8px;border:1px solid var(--border);border-radius:8px">
      <span style="font-size:13px;font-weight:700">in</span>
      ${bgMeasureBtnHtml('lp')}""",
"""      <span style="font-size:12px;font-weight:500">Distance:</span>
      ${bgDistInputsHtml('lp', hd)}
      ${bgMeasureBtnHtml('lp')}""",
"lp inputs"))
EDITS.append((
"""  const saveDist = async () => {
    // v1161: "15.5" used to parseInt to 15. A decimal foot now rolls into inches.
    let ft = ftInp && ftInp.value !== '' ? Math.max(0, parseFloat(ftInp.value) || 0) : null;
    let inch = inInp && inInp.value !== '' ? Math.min(11, Math.max(0, parseInt(inInp.value, 10) || 0)) : (ft != null ? 0 : null);
    if (ft != null && ft !== Math.floor(ft)) { inch = Math.min(11, (inch || 0) + Math.round((ft - Math.floor(ft)) * 12)); ft = Math.floor(ft); if (inch > 11) inch = 11; }
    g.longPuttData.ft = ft; g.longPuttData.in = inch;""",
"""  const saveDist = async (via) => {
    // v1161: "15.5" used to parseInt to 15. A decimal foot now rolls into inches.
    let ft = ftInp && ftInp.value !== '' ? Math.max(0, parseFloat(ftInp.value) || 0) : null;
    let inch = inInp && inInp.value !== '' ? Math.min(11, Math.max(0, parseInt(inInp.value, 10) || 0)) : (ft != null ? 0 : null);
    if (ftInp && ftInp.dataset && ftInp.dataset.unit === 'm') { const _m = (ft != null) ? bgPuttFromMeters(ft) : null; ft = _m ? _m.ft : null; inch = _m ? _m.in : null; }   // v1952: typed meters
    else if (ft != null && ft !== Math.floor(ft)) { inch = Math.min(11, (inch || 0) + Math.round((ft - Math.floor(ft)) * 12)); ft = Math.floor(ft); if (inch > 11) inch = 11; }
    g.longPuttData.ft = ft; g.longPuttData.in = inch;
    g.longPuttData.via = (via === 'ar') ? 'ar' : 'manual';   // v1952: how it was entered""",
"lp save"))
EDITS.append((
"""    if (ftInp && ft != null) ftInp.value = ft; if (inInp && inch != null) inInp.value = inch;
    let _lgp = g;""",
"""    if (!(ftInp && ftInp.dataset && ftInp.dataset.unit === 'm')) { if (ftInp && ft != null) ftInp.value = ft; if (inInp && inch != null) inInp.value = inch; }
    let _lgp = g;""",
"lp reflect"))

# ── CTP entry row ──
EDITS.append((
"""    <div style="font-size:12px;font-weight:500;margin-bottom:4px">Closest in this group</div>
    <div class="junk-row">`;
  g.players.forEach(p => {
    html += `<span class="junk-chip ${hd.pid === p.id ? 'active' : ''}" data-ctp-pid="${p.id}">${displayFirst(p)}</span>`;
  });
  html += `</div>`;
  if (hd.pid) {
    html += `<div class="bg-dist-row" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin-top:10px;min-width:0;max-width:100%">
      <span style="font-size:12px;font-weight:500">Distance:</span>
      <input type="number" id="ctp-ft" min="0" max="200" inputmode="numeric" placeholder="ft" value="${hd.ft != null ? hd.ft : ''}" style="width:52px;min-width:0;padding:8px;border:1px solid var(--border);border-radius:8px">
      <span style="font-size:13px;font-weight:700">ft</span>
      <input type="number" id="ctp-in" min="0" max="11" inputmode="numeric" placeholder="in" value="${hd.in != null ? hd.in : ''}" style="width:52px;min-width:0;padding:8px;border:1px solid var(--border);border-radius:8px">
      <span style="font-size:13px;font-weight:700">in</span>
      ${bgMeasureBtnHtml('ctp')}""",
"""    <div style="font-size:12px;font-weight:500;margin-bottom:4px">Closest in this group</div>
    <div class="junk-row">`;
  g.players.forEach(p => {
    html += `<span class="junk-chip ${hd.pid === p.id ? 'active' : ''}" data-ctp-pid="${p.id}">${displayFirst(p)}</span>`;
  });
  html += `</div>`;
  // v1952 (Hoon, Buffalo Creek): "didn't realize [typing it] was an option." Say so.
  if (!hd.pid) html += `<div class="small-text" style="color:var(--text-muted);margin-top:6px">Tap the winner, then type the distance${bgMeasureAvailable() ? ' or measure it with the camera' : ''}.</div>`;
  if (hd.pid) {
    html += `<div class="bg-dist-row" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin-top:10px;min-width:0;max-width:100%">
      <span style="font-size:12px;font-weight:500">Distance:</span>
      ${bgDistInputsHtml('ctp', hd)}
      ${bgMeasureBtnHtml('ctp')}""",
"ctp inputs"))
EDITS.append((
"""  const readDist = (carry) => {
    let ft = ftInp && ftInp.value !== '' ? Math.max(0, parseInt(ftInp.value, 10) || 0) : null;
    let inch = inInp && inInp.value !== '' ? Math.max(0, parseInt(inInp.value, 10) || 0) : (ft != null ? 0 : null);
    // Anything 12"+ carries into feet (86" -> +7 ft, 2 in); reflected back in the inputs once typing stops.
    if (inch != null && inch >= 12) { ft = (ft || 0) + Math.floor(inch / 12); inch = inch % 12; if (carry) { if (ftInp) ftInp.value = ft; if (inInp) inInp.value = inch; } }
    _touch();
    hd.ft = ft; hd.in = inch;""",
"""  const readDist = (carry, via) => {
    let ft, inch;
    if (ftInp && ftInp.dataset && ftInp.dataset.unit === 'm') {   // v1952: one meters box
      const _m = ftInp.value !== '' ? bgPuttFromMeters(parseFloat(ftInp.value) || 0) : null;
      ft = _m ? _m.ft : null; inch = _m ? _m.in : null;
    } else {
      ft = ftInp && ftInp.value !== '' ? Math.max(0, parseInt(ftInp.value, 10) || 0) : null;
      inch = inInp && inInp.value !== '' ? Math.max(0, parseInt(inInp.value, 10) || 0) : (ft != null ? 0 : null);
      // Anything 12"+ carries into feet (86" -> +7 ft, 2 in); reflected back in the inputs once typing stops.
      if (inch != null && inch >= 12) { ft = (ft || 0) + Math.floor(inch / 12); inch = inch % 12; if (carry) { if (ftInp) ftInp.value = ft; if (inInp) inInp.value = inch; } }
    }
    _touch();
    hd.ft = ft; hd.in = inch;
    hd.via = (via === 'ar') ? 'ar' : 'manual';   // v1952: how it was entered""",
"ctp read"))
EDITS.append((
"""  const saveNow = async () => { try { clearTimeout(_saveT); } catch (e) {} readDist(true); await saveGame(_lg()); };""",
"""  const saveNow = async (via) => { try { clearTimeout(_saveT); } catch (e) {} readDist(true, via); await saveGame(_lg()); };""",
"ctp saveNow"))

# ── carry `via` through the field aggregators and format through ctpFmtDist ──
EDITS.append((
"""          best[hk] = { name, inches, dist: e.ft + "' " + (e.in || 0) + '"', code: gg.code || '' };""",
"""          best[hk] = { name, inches, dist: ctpFmtDist(e), code: gg.code || '' };   // v1952: meters + manual tag""",
"admin list"))
EDITS.append((
"""          byDay[day].best = { name: w.name, first: (typeof displayFirst === 'function' ? displayFirst(w) : w.name), inches: inches, ft: Number(hd.ft) || 0, in: Number(hd.in) || 0 };""",
"""          byDay[day].best = { name: w.name, first: (typeof displayFirst === 'function' ? displayFirst(w) : w.name), inches: inches, ft: Number(hd.ft) || 0, in: Number(hd.in) || 0, via: hd.via };   // v1952""",
"lp best"))
EDITS.append((
"""    perDay.push({ day: Number(day), pot: pot, winnerFirst: best.first, winnerName: best.name, dist: best.ft + "' " + best.in + '"', rows: out, complete: _dComplete, finished: byDay[day].finished, total: byDay[day].rounds });""",
"""    perDay.push({ day: Number(day), pot: pot, winnerFirst: best.first, winnerName: best.name, dist: ctpFmtDist(best), rows: out, complete: _dComplete, finished: byDay[day].finished, total: byDay[day].rounds });   // v1952""",
"lp perDay"))
EDITS.append((
"""      if (!cur || inch < cur.inch) byDay[day].holes[h] = { name: w.name, first: (typeof displayFirst === 'function' ? displayFirst(w) : w.name), inch: inch, ft: _measured ? (Number(e.ft) || 0) : null, in: _measured ? (Number(e.in) || 0) : null, unmeasured: !_measured,""",
"""      if (!cur || inch < cur.inch) byDay[day].holes[h] = { name: w.name, first: (typeof displayFirst === 'function' ? displayFirst(w) : w.name), inch: inch, ft: _measured ? (Number(e.ft) || 0) : null, in: _measured ? (Number(e.in) || 0) : null, unmeasured: !_measured, via: e.via,   // v1952""",
"ctp hole best"))
EDITS.append((
"""      holeRows.push({ hole: Number(h), pot: pot, winnerFirst: best.first, winnerName: best.name, dist: best.unmeasured ? '' : (best.ft + "' " + best.in + '"'),""",
"""      holeRows.push({ hole: Number(h), pot: pot, winnerFirst: best.first, winnerName: best.name, dist: best.unmeasured ? '' : ctpFmtDist(best),   // v1952""",
"ctp holeRows"))
EDITS.append((
"""function _bgPotDist(d) {
  if (!d) return '';
  const ft = Number(d.ft) || 0, inch = Number(d.in) || 0;
  if (!ft && !inch) return '';
  return ft + "' " + inch + '"';
}""",
"""function _bgPotDist(d) {
  if (!d) return '';
  const ft = Number(d.ft) || 0, inch = Number(d.in) || 0;
  if (!ft && !inch) return '';
  return ctpFmtDist({ ft: ft, in: inch, via: d.via });   // v1952: meters + manual tag
}""",
"pot dist"))


def patch(path):
    src = open(path, encoding='utf-8').read()
    for old, new, name in EDITS:
        n = src.count(old)
        assert n == 1, f'{path}: {name}: expected 1 match, got {n}'
        src = src.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='\n').write(src)
    print(f'{path}: {len(EDITS)} edits applied')

for p in sys.argv[1:]:
    patch(p)
