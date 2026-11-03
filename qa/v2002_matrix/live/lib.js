'use strict';
// Shared loader for the v2002 LIVE layer: the real app engine (qa/app.js) + the matrix suites'
// independent oracles, each sliced out of its suite file and evaluated in its own VM (no app helpers).
const path = require('path'), fs = require('fs'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..', '..');
const { loadApp } = require(path.join(ROOT, 'qa', 'app.js'));
const _e = console.error, _w = console.warn; console.error = () => {}; console.warn = () => {};
const { qa } = loadApp(path.join(ROOT, 'golf-app.html'));
const F = n => { const f = qa.fn(n); if (typeof f !== 'function') throw new Error('missing ' + n); return f; };
function slice(file, from, to, extra) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').split('\n').slice(from - 1, to).join('\n');
  const ctx = vm.createContext({ console, Math, JSON, Object, Array, Set, Map, Number, String, isFinite, parseInt, Infinity });
  vm.runInContext((extra || '') + '\n' + src + '\n;this.__x = {' + EXPORTS[file] + '};', ctx);
  return ctx.__x;
}
const EXPORTS = {
  'pools.js': 'oSkins,oPotOfGold,oBirdie,oSnake,oJunk,oP3,oCtp,oLongPutt,oLongDrive,oGirPool,oPuttsPool,oBBB,oUmbrella,oMarks',
  'points.js': 'oBanker,oVegas,oDVegas,oWolf,oHotPotato,oHighLow',
  'match.js': 'oNassau,oMatch,oHammer',
  'core.js': 'oStroke,oLowNet',
  'tourney.js': 'oSkins,oCtp,oBirdie,oSide,oLongPutt,oFieldNassau,oGate,nk',
};
const O = {};
O.pools = slice('pools.js', 74, 389);
O.points = slice('points.js', 44, 352, 'const rnd=()=>0.5;');
O.match = slice('match.js', 48, 412, 'const rnd=()=>0.5;');
// core: strokes oracle + siOf/parOf + the stroke/low-net oracles; roundHoles is only the hole COUNT input
O.core = (() => { const s = fs.readFileSync(path.join(__dirname, '..', 'core.js'), 'utf8').split('\n');
  const pick = (a, b) => s.slice(a - 1, b).join('\n');
  const ctx = vm.createContext({ console, Math, JSON, Object, Array, Set, Number, isFinite, roundHoles: g => (g.holes === 9 || g.pars.length === 9) ? 9 : 18 });
  vm.runInContext(pick(55, 63) + '\n' + pick(107, 108) + '\n' + pick(347, 400) + '\n;this.__x={oStroke,oLowNet};', ctx); return ctx.__x; })();
O.tourney = slice('tourney.js', 24, 335);
console.error = _e; console.warn = _w;
// whole-unit settle oracle (BRIEF: zero-sum whole units; cent remainder to largest balance; rounding residue to the
// player the rounding favoured most / cost most; ties larger |balance| then lower id) -- written from the rule, not the app.
function oWhole(net) {
  const ids = Object.keys(net); const r = ids.map(id => ({ id, c: Math.round((net[id] || 0) * 100) }));
  const sum = r.reduce((a, x) => a + x.c, 0); if (sum) { let b = r[0]; r.forEach(x => { if (Math.abs(x.c) > Math.abs(b.c)) b = x; }); b.c -= sum; }
  r.forEach(x => { x.u = Math.round(x.c / 100); x.g = x.u * 100 - x.c; });
  let res = r.reduce((a, x) => a + x.u, 0);
  const tb = (a, b) => Math.abs(b.c) - Math.abs(a.c) || (a.id < b.id ? -1 : 1);
  while (res > 0) { const p = r.slice().sort((a, b) => (b.g - a.g) || tb(a, b))[0]; p.u--; p.g -= 100; res--; }
  while (res < 0) { const p = r.slice().sort((a, b) => (a.g - b.g) || tb(a, b))[0]; p.u++; p.g += 100; res++; }
  const o = {}; r.forEach(x => o[x.id] = x.u); return o;
}
module.exports = { qa, F, O, oWhole };
