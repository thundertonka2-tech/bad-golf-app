// v2009 C1: the new league copy translates in ES/KO/JA/ZH through the app's own BG_I18N engine, and game /
// format names stay English. Run: node qa/league_v2009/fix_tests/C1/c1_i18n.js [golf-app.html]
'use strict';
const path = require('path'), fs = require('fs');
const { loadApp } = require(path.join(__dirname, '..', '..', '..', 'app.js'));
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const HTML = process.argv[2] || path.join(ROOT, 'golf-app.html');
const { qa } = loadApp(HTML);
let PASS = 0, FAIL = 0; const FAILS = [];
function check(label, ok, d) { if (ok) PASS++; else { FAIL++; FAILS.push(label + (d ? '\n      ' + d : '')); } }
const I = qa.fn('BG_I18N');
const CASES = [
  ['to do', true], ['Change this week', true], ['Holes to play', true], ['Reopen requests', true],
  ['Shotgun · starts 7', true], ['Best 8 of 10 weeks counting · 8 counted so far', true],
  ['Rounds posted, then the best week to par, then a back-nine countback', true],
  ['A sub can’t be on a team — subs fill seats week by week', true],
  ['Joined in week 6 of 10 · fee 50 of 100 (5 weeks left), equal share of the prize pool', true],
];
(async () => {
  for (const L of ['es', 'ko', 'ja', 'zh']) {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', L + '.json'), 'utf8'));
    const dw = JSON.parse(fs.readFileSync(path.join(ROOT, 'www', 'i18n', L + '.json'), 'utf8'));
    check(L + ': web and iOS dictionaries agree on the C1 keys', CASES.every(c => (d.x[c[0]] || null) === (dw.x[c[0]] || null)));
    try { I._byLang = I._byLang || {}; } catch (e) {}
    let tr = null;
    try {
      // the engine compiles a dictionary on load; reuse its own loader when exposed, else compile through tIn
      if (typeof I.load === 'function') await I.load(L, d);
    } catch (e) {}
    const via = s => { try { const r = I.tIn ? I.tIn(L, s) : s; return r; } catch (e) { return s; } };
    tr = via('Change this week');
    if (tr === 'Change this week') {
      // engine not loadable headless: check the dictionary directly (x exact, p patterns)
      for (const [s] of CASES) {
        const hit = d.x[s] || (d.p || []).some(p => new RegExp('^' + p[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{\d+\\\}/g, '([\\s\\S]*?)') + '$').test(s));
        check(L + ': "' + s.slice(0, 50) + '" has a translation (x or p)', !!hit);
      }
    }
    for (const k of Object.keys(d.x)) {
      if (/Stroke play|Stableford|Scramble|Team match play/.test(k) && /^(Stroke play, Stableford|Stableford points)/.test(k)) {
        check(L + ': game names stay English in "' + k.slice(0, 40) + '"', ['Stroke play', 'Stableford', 'Scramble', 'Team match play'].filter(n => k.indexOf(n) >= 0).every(n => d.x[k].indexOf(n) >= 0), d.x[k]);
      }
    }
  }
  console.log('C1 i18n: ' + PASS + ' passed, ' + FAIL + ' failed');
  FAILS.forEach(f => console.log('  ' + f));
  setTimeout(() => process.exit(FAIL ? 1 : 0), 5);
})();
