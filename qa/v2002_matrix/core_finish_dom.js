'use strict';
// v2002 BLOCK FINISH - DOM check of the Finish sheet (core family, fix agent F5).
// jsdom check of the Block Finish sheet: blocks with a blank, OK disabled until resolved, Picked up writes NDB.
// Run: node qa/v2002_matrix/core_finish_dom.js golf-app.html   (needs jsdom: npm i --no-save jsdom; exit 2 = missing)
const path = require('path');
let JSDOM; try { ({ JSDOM } = require('jsdom')); } catch (e) { console.log('jsdom missing - npm i --no-save jsdom'); process.exit(2); }
const { mainScript } = require(path.join(__dirname, '..', 'app.js'));
const html = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'golf-app.html'));
const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://qa.local/' });
const w = dom.window;
w.console.error = () => {}; w.console.warn = () => {};
try { w.eval(mainScript(html) + '\nwindow.__f = n => eval(n);'); } catch (e) { /* init touches missing DOM; functions are hoisted */ }
const F = n => w.__f(n);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } };
(async () => {
  const pars = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4], sis = [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2];
  const g = { code: 'DOMBF', pars, sis, tees: [], hcpRules: { pct: 100, basis: 'full' }, games: {}, players: [
    { id: 'a', name: 'Tyler O', hcp: 0 }, { id: 'b', name: 'Kevin W', hcp: 18 }, { id: 'c', name: 'Hoon K', hcp: 0 } ], scores: {
    a: Array(18).fill(4), b: Array(18).fill(5), c: Array(18).fill(5) } };
  g.scores.b[6] = null; g.scores.c[2] = null;
  const p = F('bgResolveFinishBlanks')(g);
  await new Promise(r => setTimeout(r, 10));
  const ov = w.document.querySelector('.bg-finish-blanks');
  ok(!!ov, 'sheet opens when a non-leaver has a blank');
  const rows = ov.querySelectorAll('.bfb-row');
  ok(rows.length === 2, 'two rows (Hoon #3, Kevin #7) grouped by player: ' + Array.from(rows).map(r => r.textContent.replace(/\s+/g, ' ').trim()).join(' / '));
  const okBtn = ov.querySelector('.bfb-ok');
  ok(okBtn.disabled === true, 'Save & finish is disabled while blanks remain');
    const rowOf = n => Array.from(rows).find(r => r.textContent.indexOf(n) >= 0);
  const in0 = rowOf('Hoon').querySelector('.bfb-in'); in0.value = '6'; in0.dispatchEvent(new w.Event('input'));
  ok(okBtn.disabled === true, 'still disabled with one blank left');
  const pu1 = rowOf('Kevin').querySelector('.bfb-pu'); pu1.click();
  ok(pu1.getAttribute('aria-pressed') === 'true' && /Picked up/.test(pu1.textContent) && pu1.textContent.indexOf('✓') === 0, 'Picked up toggle shows a text checkmark + aria-pressed (not colour only)');
  ok(okBtn.disabled === false, 'enabled once every row is answered');
  okBtn.click();
  const res = await p;
  ok(res === true, 'resolves true');
  ok(g.scores.c[2] === 6, 'typed score saved (Hoon #3 = 6)');
  ok(g.scores.b[6] === 7 && g.pickedUp.b[6].v === 7, 'pick-up saved as net double bogey (Kevin #7 = 4 + 2 + 1 = 7)');
  ok(!w.document.querySelector('.bg-finish-blanks'), 'sheet closed');
  ok(F('bgFinishCanComplete')(g), 'round can now finish');
  // Go back resolves false and leaves the blank
  const g2 = JSON.parse(JSON.stringify(g)); g2.scores.a[0] = null; delete g2.pickedUp;
  const p2 = F('bgResolveFinishBlanks')(g2); await new Promise(r => setTimeout(r, 10));
  w.document.querySelector('.bg-finish-blanks .bfb-cancel').click();
  ok((await p2) === false && g2.scores.a[0] == null, 'Go back resolves false and writes nothing');
  // backdrop tap is not an answer
  const g3 = JSON.parse(JSON.stringify(g2)); const p3 = F('bgResolveFinishBlanks')(g3); await new Promise(r => setTimeout(r, 10));
  const ov3 = w.document.querySelector('.bg-finish-blanks'); ov3.click();
  ok(!!w.document.querySelector('.bg-finish-blanks'), 'backdrop tap does not dismiss');
  ov3.querySelector('.bfb-cancel').click(); await p3;
  // scorecard PU tag
  const card = F('buildRoundScorecardHtml')(g);
  ok(/class="sc-pu"/.test(card) && />PU</.test(card), 'scorecard shows PU on the picked-up cell');
  ok(/picked up \(net double bogey\)/.test(F('bgScLegendHtml')(card)), 'scorecard key explains PU');
  console.log('finish_dom: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERR', e); process.exit(1); });
