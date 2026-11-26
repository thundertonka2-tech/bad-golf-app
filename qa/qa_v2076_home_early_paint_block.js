'use strict';
// qa/qa_v2076_home_early_paint_block.js -- the Home "paint a new live round early" block (v2076), run for real.
// The card's builder is a 1,000-line function the DOM harness cannot drive end to end, so this lifts the block itself
// out of the app source and runs it against the app's own _bgRowIsLive / _bgHomeDropStartedInvites with a recording
// painter. What must hold: it paints only when a live row is not on screen yet; live rows first, completed last; it
// never changes the list the final paint is built from; and a failure inside it can never stop the card.
//   node qa/qa_v2076_home_early_paint_block.js [golf-app.html|www/index.html]   (needs: npm i --no-save jsdom)
const path = require('path'), fs = require('fs');
const { w, bootErr, FILE } = require('./dom.js');
let fails = 0, checks = 0; const TOTAL = 12;
const ok = (n, c, d) => { checks++; if (!c) { fails++; console.log('  FAIL  ' + n + (d ? '   ' + String(d).slice(0, 600) : '')); } };
console.log('== ' + path.basename(FILE) + '   boot: ' + (bootErr ? bootErr.message : 'clean'));
process.on('exit', (c) => { if (c === 0 && checks < TOTAL) { console.log('FAILED: the test stopped after ' + checks + ' of ' + TOTAL + ' checks'); process.exitCode = 1; } });
const src = fs.readFileSync(FILE, 'utf8');
const a = src.indexOf("  try {\n    const _shown76 = String(state._homeLiveSig || '');"), b = src.indexOf("  await _bgBuildCompletedRows(rows);\n  try { ((await _p5c) || [])", a);
ok('the block is in the app', a > 0 && b > a, a + '/' + b);
const block = src.slice(a, b);
// run it inside the app's scope (so _bgRowIsLive, _bgHomeDropStartedInvites, state are the real ones)
w.__run = null;
w.__fn("(window.__run = async function (rows, shownSig, opts) { opts = opts || {}; const painted = []; state._homeLiveSig = shownSig;"
  + " const _bgBuildCompletedRows = async function (into) { if (opts.failBuild) throw new Error('boom'); (opts.completed || []).forEach(function (r) { into.push(r); }); };"
  + " const _bgPaintHomeRows = function (r) { if (opts.failPaint) throw new Error('paint'); painted.push(r.map(function (x) { return x.kind + ':' + (x.code || x.gameCode || ''); })); };\n"
  + block + "\n return painted; })");
const done = [{ kind: 'completed', gameCode: 'OLD1' }, { kind: 'completed', gameCode: 'OLD2' }];
const t2 = { kind: 't2round', code: 'TEE75' }, inv = { kind: 'invite', code: 'PUTT65', live: true }, sched = { kind: 'scheduled', code: 'SCH1' }, mine = { kind: 'myLive', code: 'MINE1' };
(async () => {
  let rows = [sched, t2], snapshot = rows.slice();
  let p = await w.__run(rows, '', { completed: done });
  ok('a tournament round just started for me, nothing on screen yet -> painted at once', p.length === 1, JSON.stringify(p));
  ok('...live first, then upcoming, then completed', p[0] && p[0].join() === 't2round:TEE75,scheduled:SCH1,completed:OLD1,completed:OLD2', p[0] && p[0].join());
  ok('...and the list the final paint is built from is untouched', rows.length === 2 && rows[0] === snapshot[0] && rows[1] === snapshot[1]);
  ok('...the tournament row carries its trophy flag', t2.isTourney === true);
  p = await w.__run([sched, t2], 'scheduled:SCH1,t2round:TEE75', { completed: done });
  ok('the live round is already on screen -> no extra paint (no flicker)', p.length === 0, JSON.stringify(p));
  p = await w.__run([sched], '', { completed: done });
  ok('no live round -> no extra paint', p.length === 0);
  p = await w.__run([inv, mine], 'myLive:MINE1', { completed: done });
  ok('a live invite arrives while my own round is showing -> painted, both live rows on top', p.length === 1 && p[0].slice(0, 2).sort().join() === 'invite:PUTT65,myLive:MINE1' && p[0].slice(2).join() === 'completed:OLD1,completed:OLD2', p[0] && p[0].join());
  p = await w.__run([{ kind: 't2round', code: 'TEE7' }], 't2round:TEE75', {});
  ok('a different round whose code is a prefix of one on screen still counts as new', p.length === 1);
  let threw = false; try { p = await w.__run([t2], '', { failBuild: true }); } catch (e) { threw = true; }
  ok('the completed-rounds read failing inside the block does not throw out of it', !threw && p.length === 0);
  threw = false; try { p = await w.__run([t2], '', { failPaint: true, completed: done }); } catch (e) { threw = true; }
  ok('the painter failing inside the block does not throw out of it', !threw);
  p = await w.__run([{ kind: 'invite', code: 'X', live: false }], '', { completed: done });
  ok('an invite to a round that has not started is not "live" -> no extra paint', p.length === 0);
  console.log((fails ? 'FAILED ' : 'OK ') + (checks - fails) + '/' + checks + ' checks');
  process.exit(fails ? 1 : 0);
})();
