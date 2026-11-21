// Bad Golf QA — v2062: a missing Wolf pick must go in before a round can finish.
//
//   node qa/qa_v2062_wolf_pick_required.js [golf-app.html]      (needs jsdom: npm i --no-save jsdom)
//
// 11/21 Kerbo: hole 18's Wolf pick was never saved and the hole was never paid — the Finish screen
// only warned ("Finish anyway"). Now Finish opens a pick sheet per missing hole; a commissioner
// closing a group gets the same sheet with a skip choice.
'use strict';
const { w, doc, bootErr, FILE, SRC } = require('./dom.js');
let pass = 0; const fails = [];
function check(name, ok, detail) { if (ok) { pass++; console.log('  ✓ ' + name); } else { fails.push(name); console.log('  ✗ ' + name + (detail ? '   → ' + detail : '')); } }
const tick = () => new Promise(r => setImmediate(r));
const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
function card() {
  const P = [['to', 'Tommy Hall', 2], ['br', 'Britt Hogland', 7], ['je', 'Jeremy Waddle', 8], ['cc', 'Chris Curry', 23], ['ky', 'Kylan Leidtke', 6]];
  const g = { code: 'QA62', players: P.map(p => ({ id: p[0], name: p[1], firstName: p[1].split(' ')[0], hcp: p[2], rawHcp: p[2], baseHcp: p[2] })), scores: {}, pars: PARS.slice(),
    sis: [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2], games: {}, groupGames: { wolf: { value: 5, net: true, pay: 'man', participants: ['to', 'br', 'je', 'ky'] } },
    wolfData: { holes: {} }, hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: 18 }, t2: { tournamentId: 'T', group: 2, day: 1 } };
  g.players.forEach(p => { g.scores[p.id] = PARS.map(x => x); });
  for (let h = 1; h <= 17; h++) g.wolfData.holes[h] = { choice: 'lone' };
  return g;
}
const sheet = () => doc.getElementById('wolf-finish-modal');
const btns = () => Array.from(sheet().querySelectorAll('.wfp-btn')).map(b => b.textContent.trim());
const tap = label => { const b = Array.from(sheet().querySelectorAll('.wfp-btn')).find(x => x.textContent.trim().indexOf(label) === 0); if (!b) throw new Error('no button ' + label + ' in ' + JSON.stringify(btns())); b.click(); };

(async () => {
  console.log('Bad Golf — v2062 Wolf pick required QA\nfile: ' + FILE + '   boot: ' + (bootErr || 'clean'));
  console.log('\n=== 1. THE PICK SHEET ===');
  let g = card();
  check('hole 18 (scored, no pick) is the one missing hole', JSON.stringify(w.wolfHolesMissingPicks(g)) === '[18]');
  check('the wolf on 18 is Britt', w.wolfCaptainForHole(g, 18).id === 'br');
  let res; let p = w.bgResolveWolfPicks(g, {}).then(v => { res = v; });
  await tick();
  check('the sheet opens', !!sheet());
  check('it names the hole and the wolf', /hole 18/.test(sheet().textContent) && /Britt was the wolf on 18/.test(sheet().textContent), sheet().textContent.slice(0, 160));
  check('partners offered are the other three in the Wolf — not Britt, not Chris', JSON.stringify(btns().slice(0, 3)) === '["Tommy","Jeremy","Kylan"]', JSON.stringify(btns()));
  check('alone and blind are offered; no skip for a player finishing', btns().some(b => /^Went alone/.test(b)) && btns().some(b => /^Blind/.test(b)) && !btns().some(b => /^Skip/.test(b)));
  check('no button carries an inline style', !/<button[^>]*style=/.test(sheet().innerHTML));
  tap('Tommy'); await p;
  check('picking Tommy saves the pick and resolves true', res === true && g.wolfData.holes[18].choice === 'partner' && g.wolfData.holes[18].partnerId === 'to');
  check('the sheet closes', !sheet());
  check('nothing is missing any more', w.wolfHolesMissingPicks(g).length === 0);

  console.log('\n=== 2. GO BACK / SEVERAL HOLES / ALONE ===');
  g = card(); res = undefined; p = w.bgResolveWolfPicks(g, {}).then(v => { res = v; }); await tick();
  tap('Go back'); await p;
  check('Go back resolves false and saves no pick', res === false && !g.wolfData.holes[18] && !sheet());
  g = card(); delete g.wolfData.holes[7]; delete g.wolfData.holes[12];
  res = undefined; p = w.bgResolveWolfPicks(g, {}).then(v => { res = v; }); await tick();
  check('three missing holes: starts on 7, says 1 of 3', /hole 7/.test(sheet().textContent) && /1 of 3/.test(sheet().textContent));
  tap('Went alone'); await tick();
  check('then hole 12 (2 of 3)', /hole 12/.test(sheet().textContent) && /2 of 3/.test(sheet().textContent));
  tap('Blind'); await tick();
  check('then hole 18 (3 of 3)', /hole 18/.test(sheet().textContent) && /3 of 3/.test(sheet().textContent));
  tap('Kylan'); await p;
  check('all three are saved: 7 alone, 12 blind, 18 with Kylan', res === true && g.wolfData.holes[7].choice === 'lone' && g.wolfData.holes[12].choice === 'blind' && g.wolfData.holes[18].partnerId === 'ky');
  g = card(); res = undefined; await w.bgResolveWolfPicks(Object.assign(g, { wolfData: { holes: Object.assign(g.wolfData.holes, { 18: { choice: 'lone' } }) } }), {}).then(v => { res = v; });
  check('nothing missing = resolves true without a sheet', res === true && !sheet());

  console.log('\n=== 3. COMMISSIONER: SKIP ===');
  g = card(); res = undefined; p = w.bgResolveWolfPicks(g, { allowSkip: true, group: 2 }).then(v => { res = v; }); await tick();
  check('the commissioner sheet names the group and offers Skip', /Group 2/.test(sheet().textContent) && btns().some(b => /^Skip/.test(b)));
  tap('Skip'); await p;
  check('a skipped hole is stored as skip and no longer counts as missing', res === true && g.wolfData.holes[18].choice === 'skip' && w.wolfHolesMissingPicks(g).length === 0);
  const withWolf = Object.assign({}, g, { games: { wolf: g.groupGames.wolf } });
  const r = w.calcWolf(withWolf);
  check('the engine pays nothing for a skipped hole', !r.holeResults.some(x => x.hole === 18) && r.holeResults.length === 17);

  console.log('\n=== 4. WIRING ===');
  const fin = SRC.slice(SRC.indexOf('async function bgFinishRoundFlow()'), SRC.indexOf('async function bgFinishRoundFlow()') + 12000);
  check('Finish no longer offers "Finish anyway" for a missing Wolf pick', fin.indexOf('Wolf pick missing on hole') < 0 && /await bgResolveWolfPicks\(g, \{\}\)/.test(fin) && /if \(!_wOk \|\| wolfHolesMissingPicks\(g\)\.length\) return;/.test(fin));
  const ff = SRC.slice(SRC.indexOf('async function t2ForceFinishRound(code)'), SRC.indexOf('async function t2EndEventEarly('));
  check('force-finish asks for the picks (with skip) before it stamps the finish', ff.indexOf('bgResolveWolfPicks(g, { allowSkip: true') > 0 && ff.indexOf('bgResolveWolfPicks(g, { allowSkip: true') < ff.indexOf('g.finishedAt = now;'));
  check('... and sends wolfData with the save', /wolfData: g\.wolfData \} : \{ finishedAt: g\.finishedAt, t2: g\.t2 \}/.test(ff));
  const ee = SRC.slice(SRC.indexOf('async function t2EndEventEarly('), SRC.indexOf('async function t2EndEventEarly(') + 9000);
  check('End event early asks for every group’s picks first and sends wolfData', /for \(const g of rounds\) \{ try \{ if \(!g\.finishedAt && wolfHolesMissingPicks\(g\)\.length\)/.test(ee) && /_wolfFixed\[g\.code\] \? \{ games: g\.games, finishedAt: g\.finishedAt, t2: g\.t2, wolfData: g\.wolfData \}/.test(ee));
  check('the manager save path lets wolfData through', /'settledMoney', 't2', 'wolfData'\]\.indexOf\(k\)/.test(SRC));
  check('the last hole gets the reminder as soon as it is scored', /allHolesScored\(g\) && wolfPickMissingOnHole\(g, h\)/.test(SRC) && /Pick before you finish\./.test(SRC));

  console.log('\n=== 5. THE REAL FINISH FLOW (bgFinishRoundFlow, end to end) ===');
  {
    const saves = []; let confirms = 0;
    w.eval('saveGame = async function (g) { window.__saves.push(JSON.stringify((g.wolfData || {}).holes || {})); return true; }; uiConfirm = async function () { window.__confirms++; return false; };');
    w.__saves = saves; w.__confirms = 0;
    const live = card(); delete live.t2; live.games = { wolf: live.groupGames.wolf }; delete live.groupGames; live.createdAt = Date.now() - 3600e3;
    w.__setGame(live);
    let finished = 'pending'; const run = w.bgFinishRoundFlow().then(() => { finished = 'returned'; }, e => { finished = 'threw ' + e.message; });
    for (let i = 0; i < 8 && !sheet(); i++) await tick();
    check('tapping Finish with hole 18’s Wolf pick missing opens the pick sheet (no "Finish anyway")', !!sheet() && /hole 18/.test(sheet().textContent) && w.__confirms === 0, 'confirms=' + w.__confirms + ' sheet=' + !!sheet());
    check('the round is not finished while the sheet is up', !live.finishedAt);
    tap('Go back'); await run;
    check('Go back: the flow stops, the round stays unfinished, nothing was saved', finished === 'returned' && !live.finishedAt && !live.wolfData.holes[18] && w.__saves.length === 0, finished + ' saves=' + w.__saves.length);
    finished = 'pending'; const run2 = w.bgFinishRoundFlow().then(() => { finished = 'returned'; }, e => { finished = 'threw ' + e.message; });
    for (let i = 0; i < 8 && !sheet(); i++) await tick();
    tap('Tommy');
    for (let i = 0; i < 30 && !w.__saves.length; i++) await tick();
    check('picking Tommy saves the pick as part of finishing', w.__saves.length >= 1 && /"18":\{"choice":"partner","partnerId":"to"\}/.test(w.__saves[0]), JSON.stringify(w.__saves).slice(0, 200));
    check('the flow moved on past the Wolf gate (no pick is missing any more)', w.wolfHolesMissingPicks(live).length === 0 && !sheet());
  }

  console.log('\n──────────────────────────────────────────────');
  if (fails.length) { console.log(fails.length + ' FAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
  console.log('ALL ' + pass + ' CHECKS PASSED'); process.exit(0);
})();
