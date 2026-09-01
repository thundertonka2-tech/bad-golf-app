const fs = require('fs');
const src = fs.readFileSync('extracted.js', 'utf8');

const store = {};
const base = {
  console: { log(){}, warn(){}, error(){}, info(){} }, Math, Date, JSON, Object, Array, String, Number, Boolean, Symbol,
  isNaN, isFinite, parseInt, parseFloat, Map, Set, WeakMap, WeakSet, Promise,
  RegExp, Error, TypeError, encodeURIComponent, decodeURIComponent, performance,
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: () => 0,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
              createElement: () => ({ style: {}, classList: { add(){}, remove(){}, contains(){return false} }, appendChild(){}, querySelector: () => null, querySelectorAll: () => [] }),
              body: { classList: { add(){}, remove(){}, contains(){return false} }, appendChild(){} },
              addEventListener(){}, visibilityState: 'visible' },
  navigator: { onLine: true, userAgent: 'node' },
  location: { search: '', href: '', hostname: 'localhost' },
};
base.window = base;
base.globalThis = base;
base.self = base;

const sandbox = new Proxy(base, {
  has: () => true,
  get: (t, k) => (k in t ? t[k] : (k in store ? store[k] : undefined)),
  set: (t, k, v) => { store[k] = v; return true; }
});

const EXPORTS = ['computeAllGameMoney','calcSkins','calcNassau','calcStroke','calcWolf','calcHammer',
  'calcMatch','calcTeamMatch','calcTeamLowball','calcComboScore','calcQuota','calcStableford',
  'calcSixes','calcVegas','calcBanker','calcJunk','calcBirdiePool','calcScramble','calcRyderCup',
  'roundHoles','netHoleScore','effectiveHcp','siFor','parFor','calcTotals','buildRoundSummary',
  'bgCourseStatus','cardHoles'];

const factory = new Function('__sb', `
  with (__sb) {
    ${src}
    ;return { ${EXPORTS.map(n => `${n}: (typeof ${n} !== 'undefined' ? ${n} : null)`).join(', ')} };
  }
`);

let api;
try { api = factory(sandbox); }
catch (e) { console.error('SANDBOX BUILD FAILED:', e.message); process.exit(1); }

console.log('resolved:', EXPORTS.filter(n => api[n]).length + '/' + EXPORTS.length);
console.log('missing :', EXPORTS.filter(n => !api[n]).join(', ') || '(none)');
module.exports = { api, sandbox, store };
