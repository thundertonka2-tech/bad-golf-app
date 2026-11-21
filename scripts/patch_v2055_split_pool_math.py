#!/usr/bin/env python3
"""v2055 (Tyler 11/20): "on the big quota game we played on Wed it only showed Steve winning quota but did not show
the two way tie for second or how that was broken down. Can we add that to the summary page when we have split pools
like that so everyone understands the math?" -- every surface that lists a Quota / Stableford pool now spells out
the places, the splits and the entry. Applies to the v2054 files; every edit must match exactly once."""
import sys
OLD_V, NEW_V = 'v2026.11.2054', 'v2026.11.2055'

EDITS = [
  # ---- engine: record the places next to the money ------------------------------------------
  ('pool-places',
   "      const dayMoney = {};\n      dayRows.forEach(x => dayMoney[nmk(x.name)] = 0);\n      if (dayComplete && buyin > 0 && N >= 2) {\n        dayRows.forEach(x => dayMoney[nmk(x.name)] = -buyin);            // entry\n",
   "      const dayMoney = {};\n      dayRows.forEach(x => dayMoney[nmk(x.name)] = 0);\n"
   "      let places = null;   // v2055: [{ place, pct, share, each, tied, stat, names }] -- how the pool paid, for the summaries\n"
   "      if (dayComplete && buyin > 0 && N >= 2) {\n        dayRows.forEach(x => dayMoney[nmk(x.name)] = -buyin);            // entry\n"),
  ('pool-places-8020',
   "        if (payout === '8020') {\n          const firsts = _el.filter(x => statOf(x) === top);\n          if (firsts.length >= 2 || _el.length < 2) { const sh = dayPool / firsts.length; firsts.forEach(x => dayMoney[nmk(x.name)] += sh); }\n          else {\n            dayMoney[nmk(_el[0].name)] += dayPool * 0.8;\n            const secondTop = statOf(_el[1]);\n            const seconds = _el.filter(x => statOf(x) === secondTop);\n            const sh = (dayPool * 0.2) / seconds.length; seconds.forEach(x => dayMoney[nmk(x.name)] += sh);\n          }\n        } else {\n          const winners = _el.filter(x => statOf(x) === top);\n          const sh = dayPool / winners.length; winners.forEach(x => dayMoney[nmk(x.name)] += sh);\n        }\n      }\n",
   "        if (payout === '8020') {\n          const firsts = _el.filter(x => statOf(x) === top);\n          if (firsts.length >= 2 || _el.length < 2) { const sh = dayPool / firsts.length; firsts.forEach(x => dayMoney[nmk(x.name)] += sh);\n"
   "            places = [{ place: 1, pct: 100, share: dayPool, each: sh, tied: firsts.length >= 2, stat: top, names: firsts.map(x => x.name) }]; }\n"
   "          else {\n            dayMoney[nmk(_el[0].name)] += dayPool * 0.8;\n            const secondTop = statOf(_el[1]);\n            const seconds = _el.filter(x => statOf(x) === secondTop);\n            const sh = (dayPool * 0.2) / seconds.length; seconds.forEach(x => dayMoney[nmk(x.name)] += sh);\n"
   "            places = [{ place: 1, pct: 80, share: dayPool * 0.8, each: dayPool * 0.8, tied: false, stat: top, names: [_el[0].name] },\n"
   "                      { place: 2, pct: 20, share: dayPool * 0.2, each: sh, tied: seconds.length >= 2, stat: secondTop, names: seconds.map(x => x.name) }];\n"
   "          }\n        } else {\n          const winners = _el.filter(x => statOf(x) === top);\n          const sh = dayPool / winners.length; winners.forEach(x => dayMoney[nmk(x.name)] += sh);\n"
   "          places = [{ place: 1, pct: 100, share: dayPool, each: sh, tied: winners.length >= 2, stat: top, names: winners.map(x => x.name) }];\n"
   "        }\n      }\n"),
  ('pool-places-out',
   "      perDay.push({ day: day, N: N, buyin: buyin, payout: payout, pool: dayPool, complete: dayComplete, rounds: D.rounds, finished: D.finished, rows: dayRows, money: dayMoney });\n",
   "      perDay.push({ day: day, N: N, buyin: buyin, payout: payout, pool: dayPool, complete: dayComplete, rounds: D.rounds, finished: D.finished, rows: dayRows, money: dayMoney, places: places, kind: kind });   // v2055: places\n"),
  # ---- the helper: the math in plain English ---------------------------------------------------
  ('howpaid-helper',
   "function t2ComputeFieldStableford(rows, t, fieldPlayers) {\n",
   "/* v2055 (Tyler 11/20): \"it only showed Steve winning quota but did not show the two way tie for second or how that\n"
   "   was broken down\". Pure: the lines that explain how a finished Quota / Stableford pool paid, from perDay.places.\n"
   "   e.g. [\"Pool 220 = 11 × 20 entry\", \"1st 80% = 176 → Steve Miller (0 vs quota)\",\n"
   "         \"2nd 20% = 44, split 3 ways (tied at −1) = 14.67 each → Kevin Wells, Fred Hall, Tommy Hall\", \"Everyone else −20 (entry)\"] */\n"
   "function bgPoolHowPaid(d) {\n"
   "  const out = [];\n"
   "  try {\n"
   "    if (!d || d.complete === false || !Array.isArray(d.places) || !d.places.length || !(d.pool > 0)) return out;\n"
   "    const m = v => { const r = Math.round((Number(v) || 0) * 100) / 100; return Number.isInteger(r) ? String(r) : r.toFixed(2); };   // 14.67 stays 14.67 here\n"
   "    const isQ = d.kind === 'quota';\n"
   "    const sg = v => (v < 0 ? '\\u2212' + Math.abs(v) : (v > 0 ? '+' + v : String(v)));\n    const stat = v => isQ ? (sg(v) + ' vs quota') : (v + ' pts');\n"
   "    const ord = n => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : (n + 'th');\n"
   "    out.push('Pool ' + m(d.pool) + ' = ' + d.N + ' × ' + m(d.buyin) + ' entry' + (d.payout === '8020' ? ' · pays 80 / 20' : ' · winner takes all'));\n"
   "    d.places.forEach(p => {\n"
   "      const n = (p.names || []).length;\n"
   "      let line = ord(p.place) + (p.pct && p.pct !== 100 ? ' ' + p.pct + '%' : '') + ' = ' + m(p.share);\n"
   "      if (p.tied && n > 1) line += ', split ' + n + ' ways (tied at ' + (isQ ? sg(p.stat) : p.stat) + ') = ' + m(p.each) + ' each';\n"
   "      line += ' → ' + (p.names || []).join(', ') + (n === 1 ? ' (' + stat(p.stat) + ')' : '');\n"
   "      out.push(line);\n"
   "    });\n"
   "    const paid = new Set(); d.places.forEach(p => (p.names || []).forEach(x => paid.add(normalizeNameSegment(String(x)))));\n"
   "    const rest = (d.rows || []).filter(x => !paid.has(normalizeNameSegment(String(x.name || '')))).length;\n"
   "    if (rest) out.push((rest === 1 ? 'One other' : 'Everyone else') + ' −' + m(d.buyin) + ' (entry)');\n"
   "    out.push('Figures on the cards are net of the ' + m(d.buyin) + ' entry' + (d.places[0] && d.places[0].names.length === 1 ? ' (' + d.places[0].names[0].split(/\\s+/)[0] + ' +' + m(d.places[0].each - d.buyin) + ')' : '') + '.');\n"
   "  } catch (e) {}\n"
   "  return out;\n"
   "}\n"
   "function t2ComputeFieldStableford(rows, t, fieldPlayers) {\n"),
  # ---- the Event Leaderboard Quota block ----------------------------------------------------------
  ('quota-block',
   "      + (fq.complete === false ? ' <strong>Awarded once every group is in.</strong>' : '') + '</div>';\n    try {   // v2010 (cross audit F): an early-finished day says which holes counted\n",
   "      + (fq.complete === false ? ' <strong>Awarded once every group is in.</strong>' : '') + '</div>';\n"
   "    try {   // v2055: how a finished pool paid -- places, splits, entry\n"
   "      (fq.perDay || []).forEach(d => { const L = bgPoolHowPaid(d); if (L.length) h += '<div class=\"small-text\" style=\"color:var(--text-muted);margin-bottom:6px;line-height:1.4\">' + ((fq.perDay || []).length > 1 ? '<strong>Day ' + d.day + ':</strong> ' : '') + L.map(escapeHtml).join('<br>') + '</div>'; });\n"
   "    } catch (e) {}\n"
   "    try {   // v2010 (cross audit F): an early-finished day says which holes counted\n"),
  # ---- the Game Totals row (Results sheet, event page, settle-up image) ---------------------------
  ('pot-row',
   "          out.push(_bgPotRow(lbl,\n            (winners.length ? winners : lead).map(x => x.name || nm(x.first)).join(' & '),\n            (winners.length ? winners : lead).map(fmt).join(' · ') + (d.pool ? ' · prize pool ' + _bgPotMoneyFmt(d.pool) : ''),\n            d.complete === false ? 0 : best,\n            d.complete === false ? ('leading — ' + (d.finished || 0) + ' of ' + (d.rounds || 0) + ' groups finished') : ''));\n",
   "          // v2055: a finished pool names its places (\"1st Steve · T2 Kevin, Fred, Tommy\") and spells out the split\n"
   "          const _how = bgPoolHowPaid(d);\n"
   "          const _who = (_how.length && Array.isArray(d.places)) ? d.places.map(p => (p.tied && p.names.length > 1 ? 'T' : '') + p.place + (p.place === 1 ? 'st' : p.place === 2 ? 'nd' : 'th') + ' ' + p.names.join(', ')).join(' · ') : '';\n"
   "          out.push(_bgPotRow(lbl,\n            _who || (winners.length ? winners : lead).map(x => x.name || nm(x.first)).join(' & '),\n            (winners.length ? winners : lead).map(fmt).join(' · ') + (d.pool ? ' · prize pool ' + _bgPotMoneyFmt(d.pool) : '') + (_how.length ? ('\\n' + _how.join('\\n')) : ''),\n            d.complete === false ? 0 : best,\n            d.complete === false ? ('leading — ' + (d.finished || 0) + ' of ' + (d.rounds || 0) + ' groups finished') : ''));\n"),
  # ---- version ------------------------------------------------------------------------------
  ('bgver', '<!--BGVER=' + OLD_V + '-->', '<!--BGVER=' + NEW_V + '-->'),
  ('bgbuild', "const BG_BUILD = '" + OLD_V + "';", "const BG_BUILD = '" + NEW_V + "';"),
]

def patch(path):
    src = open(path, encoding='utf-8', newline='').read()
    for name, old, new in EDITS:
        n = src.count(old)
        assert n == 1, '%s: %s matched %d times' % (path, name, n)
        src = src.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='').write(src)
    print('patched', path, len(EDITS), 'edits')

for p in sys.argv[1:]:
    patch(p)
