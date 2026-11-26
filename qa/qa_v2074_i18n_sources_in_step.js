'use strict';
// qa/qa_v2074_i18n_sources_in_step.js -- the translation SOURCES (scripts/i18n/*.json) and the language files the app
// loads (i18n/, www/i18n/, site/i18n/) must stay in step, so build_i18n.py can always be run without losing anything.
//   node qa/qa_v2074_i18n_sources_in_step.js [golf-app.html|www/index.html]
const path = require('path'), fs = require('fs'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let fails = 0, checks = 0;
const ok = (n, c, d) => { checks++; if (!c) { fails++; console.log('  FAIL  ' + n + (d ? '   ' + String(d).slice(0, 600) : '')); } };
let py = null; for (const c of ['python3', 'python']) { try { cp.execFileSync(c, ['--version'], { stdio: 'ignore' }); py = c; break; } catch (e) {} }
if (!py) { console.log('SKIPPED (no python)'); process.exit(0); }
const run = args => { try { return { rc: 0, out: String(cp.execFileSync(py, [path.join(ROOT, 'scripts', 'i18n', 'build_i18n.py')].concat(args), { cwd: ROOT })) }; } catch (e) { return { rc: e.status, out: String(e.stdout || '') }; } };
const r = run(['--check']);
ok('a rebuild from the sources changes nothing (sources and language files in step)', r.rc === 0 && /in step/.test(r.out), r.out);
['es', 'ko', 'ja', 'zh'].forEach(L => {
  const a = fs.readFileSync(path.join(ROOT, 'i18n', L + '.json'), 'utf8'), b = fs.readFileSync(path.join(ROOT, 'www', 'i18n', L + '.json'), 'utf8');
  ok(L + ': web and iPhone language files identical', a === b);
  const D = JSON.parse(a);
  ok(L + ': count matches', D.n === Object.keys(D.x).length + D.p.length);
});
const es = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'es.json'), 'utf8'));
const all = Object.assign({}, es.x); es.p.forEach(p => { all[p[0]] = p[1]; });
const wrong = Object.keys(all).filter(k => /\bfee\b/.test(k) && !/quota/i.test(k) && /Quota/.test(all[k]));
ok('Spanish: "fee" is never rendered as the game name Quota', wrong.length === 0, wrong.join(' | '));
// the guard: a source missing a live string must stop the build before anything is written
const srcP = path.join(ROOT, 'scripts', 'i18n', 'source_app.json'), keep = fs.readFileSync(srcP, 'utf8');
try {
  const S = JSON.parse(keep); const victim = Object.keys(es.x).find(k => S[k] && !/\{\d+\}/.test(k) && es.x[k] !== k && !JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'i18n', 'overrides.json'), 'utf8'))[k]);
  delete S[victim]; fs.writeFileSync(srcP, JSON.stringify(S));
  const before = fs.readFileSync(path.join(ROOT, 'i18n', 'es.json'), 'utf8');
  const g = run([]);
  ok('guard: a rebuild that would drop a live translation stops with exit 1', g.rc === 1 && /STOPPED/.test(g.out), 'rc=' + g.rc + ' ' + g.out.slice(0, 200));
  ok('guard: nothing was written', fs.readFileSync(path.join(ROOT, 'i18n', 'es.json'), 'utf8') === before);
} finally { fs.writeFileSync(srcP, keep); }
console.log((fails ? 'FAILED ' : 'OK ') + (checks - fails) + '/' + checks + ' checks');
process.exit(fails ? 1 : 0);
