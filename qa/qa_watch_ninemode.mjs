// qa/qa_watch_ninemode.mjs — v1146
//
// Regression test for the Bayou Oaks bug: the Apple Watch hand-off shipped
// course_gps.holes keyed by PHYSICAL hole while the watch looked greens up by the
// PLAYED hole, so a repeated-nine round ranged to the wrong hole entirely.
//
// Slices the REAL function bodies out of the shipped .html (never re-typed) and
// drives them against the REAL Bayou Oaks City Park South map and Kevin's REAL
// round (LINK90, nineMode 'b9x2') and his REAL GPS fix from the watch diagnostic.
//
//   node qa/qa_watch_ninemode.mjs golf-app.html
//   node qa/qa_watch_ninemode.mjs www/index.html

import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('usage: node qa/qa_watch_ninemode.mjs <file.html>'); process.exit(2); }
const src = readFileSync(file, 'utf8');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('  FAIL: ' + msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg}  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

// ---- slice the real bodies out of the shipped file --------------------------
function sliceFn(name, header) {
  const i = src.indexOf(header);
  if (i < 0) throw new Error('anchor not found in ' + file + ': ' + name);
  // walk braces from the first { after the header
  let j = src.indexOf('{', i), depth = 0, k = j;
  for (; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return src.slice(i, k);
}

const bodyPhys = sliceFn('bgPhysHole', 'function bgPhysHole(g, h)');
const bodyReKey = sliceFn('bgHolesByPlayedHole', 'function bgHolesByPlayedHole(g, holes)');
const bodyRoundHoles = sliceFn('roundHoles', 'function roundHoles(g)');

const { bgPhysHole, bgHolesByPlayedHole } =
  new Function(`${bodyRoundHoles}\n${bodyPhys}\n${bodyReKey}\nreturn { bgPhysHole, bgHolesByPlayedHole };`)();

// ---- real data --------------------------------------------------------------
// course_gps holes for bayou-oaks-city-park-south-course (mid green + par),
// exactly as stored. Keys are PHYSICAL hole numbers.
const MID = {
  1: [30.0073272335202, -90.0871479615270, 4], 2: [30.0050730638688, -90.0879395904725, 3],
  3: [29.9999859790256, -90.0877228077945, 5], 4: [30.0022250451332, -90.0916714957166, 4],
  5: [30.0057601530692, -90.0914332553665, 4], 6: [30.0026869918908, -90.0908423045309, 4],
  7: [30.0019632904459, -90.0895566615694, 3], 8: [30.0046099578247, -90.0888222125515, 4],
  9: [30.0097615496431, -90.0890372655249, 5], 10: [30.0081982634780, -90.0913263366190, 4],
  11: [30.0067754751323, -90.0970419297297, 5], 12: [30.0098157053864, -90.0971946213435, 4],
  13: [30.0085683025640, -90.0935251651110, 4], 14: [30.0102485927923, -90.0956807963156, 3],
  15: [30.0111507871062, -90.0925725923196, 4], 16: [30.0087885325326, -90.0923759262092, 4],
  17: [30.0069139885833, -90.0905712758033, 3], 18: [30.0113117822755, -90.0900607912381, 5],
};
const HOLES = {};
for (const k of Object.keys(MID)) HOLES[k] = { mid: [MID[k][1], MID[k][0]], par: MID[k][2] };

// LINK90 as stored in `games` on 2026-08-20.
const LINK90 = {
  nineMode: 'b9x2',
  pars: [4, 5, 4, 4, 3, 4, 4, 3, 5, 4, 5, 4, 4, 3, 4, 4, 3, 5],
};
// Kevin's fix from the watch GPS diagnostic, hole 3, acc 4 m.
const KEVIN = [30.00989, -90.09723];
const metres = (lat, lng) =>
  111320 * Math.hypot(lat - KEVIN[0], (lng - KEVIN[1]) * Math.cos(KEVIN[0] * Math.PI / 180));

console.log(`\n== qa_watch_ninemode  (${file}) ==`);

// ---- 1. the played -> physical rule ----------------------------------------
eq(bgPhysHole(null, 7), 7, 'no game: identity');
eq(bgPhysHole({}, 7), 7, 'no nineMode: identity');
eq(bgPhysHole({ nineMode: 'all18' }, 7), 7, 'all18: identity');
for (let h = 1; h <= 18; h++) eq(bgPhysHole({ nineMode: 'all18' }, h), h, `all18 hole ${h} identity`);
eq(bgPhysHole({ nineMode: 'b9x2' }, 1), 10, 'b9x2: played 1 -> physical 10');
eq(bgPhysHole({ nineMode: 'b9x2' }, 3), 12, 'b9x2: played 3 -> physical 12  <-- THE BUG');
eq(bgPhysHole({ nineMode: 'b9x2' }, 9), 18, 'b9x2: played 9 -> physical 18');
eq(bgPhysHole({ nineMode: 'b9x2' }, 10), 10, 'b9x2: played 10 wraps to physical 10');
eq(bgPhysHole({ nineMode: 'b9x2' }, 18), 18, 'b9x2: played 18 -> physical 18');
eq(bgPhysHole({ nineMode: 'f9x2' }, 1), 1, 'f9x2: played 1 -> physical 1');
eq(bgPhysHole({ nineMode: 'f9x2' }, 12), 3, 'f9x2: played 12 -> physical 3');
eq(bgPhysHole({ nineMode: 'front9' }, 5), 5, 'front9: identity');
eq(bgPhysHole({ nineMode: 'back9' }, 1), 10, 'back9: played 1 -> physical 10');
eq(bgPhysHole({ nineMode: 'back9' }, 9), 18, 'back9: played 9 -> physical 18');

// ---- 2. re-keying is a no-op for a normal round -----------------------------
ok(bgHolesByPlayedHole(null, HOLES) === HOLES, 'no game: same object back, no copy');
ok(bgHolesByPlayedHole({}, HOLES) === HOLES, 'no nineMode: same object back, no copy');
ok(bgHolesByPlayedHole({ nineMode: 'all18' }, HOLES) === HOLES, 'all18: same object back, no copy');
ok(bgHolesByPlayedHole({ nineMode: 'b9x2' }, null) === null, 'null greens survive untouched');
ok(bgHolesByPlayedHole({ nineMode: 'b9x2' }, {}) !== undefined, 'empty greens do not throw');

// ---- 3. re-keying never mutates the cache ----------------------------------
const before = JSON.stringify(HOLES);
const out = bgHolesByPlayedHole(LINK90, HOLES);
eq(JSON.stringify(HOLES), before, 'input greens object is NOT mutated (it is the per-course cache)');
ok(out !== HOLES, 'b9x2 returns a new object');
eq(Object.keys(out).length, 18, 'b9x2 yields 18 played holes');

// ---- 4. THE LOAD-BEARING ONE: Kevin, hole 3 --------------------------------
const h3 = out['3'];
ok(!!h3, 'played hole 3 has a green');
eq(h3.mid[1], MID[12][0], 'played hole 3 green latitude == physical hole 12');
eq(h3.mid[0], MID[12][1], 'played hole 3 green longitude == physical hole 12');
const d3 = Math.round(metres(h3.mid[1], h3.mid[0]));
ok(d3 < 30, `played hole 3 is ${d3} m from Kevin (was 1434 m / 1565 yards before the fix)`);
const oldD3 = Math.round(metres(MID[3][0], MID[3][1]));
ok(oldD3 > 1400, `sanity: the OLD lookup really was ${oldD3} m away`);
eq(h3.par, 4, 'played hole 3 is par 4 (the watch showed physical hole 3, par 5)');

// ---- 5. cross-check every hole against the round card ----------------------
// LINK90's own pars were built by newGame() slicing the back nine twice. If the
// re-key is right, the green it hands the watch for played hole h must have the
// same par the card gives hole h -- 18 independent confirmations from live data.
for (let h = 1; h <= 18; h++) {
  eq(out[String(h)].par, LINK90.pars[h - 1], `played hole ${h}: map par matches the round card`);
}

// ---- 6. f9x2 is the mirror image -------------------------------------------
const f9 = bgHolesByPlayedHole({ nineMode: 'f9x2', pars: LINK90.pars }, HOLES);
eq(f9['12'].mid[0], MID[3][1], 'f9x2: played 12 gets physical hole 3');
eq(f9['1'].mid[0], MID[1][1], 'f9x2: played 1 gets physical hole 1');

// ---- 7. the hand-off actually calls it, in the right place -----------------
ok(/holes = bgHolesByPlayedHole\(g, holes\);/.test(src), 'hand-off wires the re-key');
const iSync = src.indexOf('window.BadGolfWatchSync = async function');
const iCall = src.indexOf('holes = bgHolesByPlayedHole(g, holes);');
const iEnd = src.indexOf('window._bgWatchSyncedCode = g.code;');
ok(iSync > 0 && iCall > iSync && iCall < iEnd, 're-key sits INSIDE BadGolfWatchSync, before the send');
ok(src.indexOf('const handoff = {') > iCall, 're-key runs before the handoff object is built');
eq((src.match(/% 9\) \+ 10/g) || []).length, 1, 'only ONE copy of the played->physical rule remains');

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
