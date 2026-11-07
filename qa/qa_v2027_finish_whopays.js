// qa/qa_v2027_finish_whopays.js -- Tyler 11/7: the round-complete (Finish) screen shows WHO PAYS WHO again,
// the same cards and amounts as the texted standings / the round sheet from Home, and they reconcile to
// each player's Final award figure.  usage: node qa/qa_v2027_finish_whopays.js golf-app.html
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + path.resolve(process.argv[2] || 'golf-app.html')); await p.waitForTimeout(3000);
  const r = await p.evaluate(() => {
    const PARS = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4];
    const names = ['Larry Perkins','Mike Davison','Tyler OConnor','Gregory Jackson','Chris Curry'];
    const players = names.map((n, i) => ({ id: 'w' + i, name: n, firstName: n.split(' ')[0], lastName: n.split(' ')[1], hcp: 0, rawHcp: 0, baseHcp: 0, teeLabel: 'Blue' }));
    const scores = {}; players.forEach(pl => { scores[pl.id] = PARS.slice(); });
    [0, 1, 4, 6].forEach(h => { scores.w0[h] = PARS[h] - 1; }); scores.w3[8] = 3;   // Larry 4 skins, Gregory 1
    const ids = players.map(x => x.id);
    const g = { code: 'QAFIN1', players, scores, pars: PARS, sis: PARS.map((_, i) => i + 1), tees: [{ label: 'Blue', rating: 72, slope: 120 }],
      hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: 18 }, course: 'Buffalo Creek Golf Club', courseId: 'buffalo-creek',
      games: { skins: { value: 10, participants: ids, participantNames: names, mode: 'buyin' } }, createdAt: Date.now() - 4e6, updatedAt: Date.now() };
    const html = buildRoundSummary(g);
    const d = document.createElement('div'); d.innerHTML = html;
    const sec = d.querySelector('#summary-settle');
    const agm = computeAllGameMoney(g); const money = {}; players.forEach(pl => { money[pl.id] = agm.combined[pl.id] || 0; });
    const st = calculateSettlements(money, players);
    const net = {}; st.forEach(s => { net[s.fromId] = (net[s.fromId] || 0) - s.amount; net[s.toId] = (net[s.toId] || 0) + s.amount; });
    const whole = bgNetsWhole(money, players);
    return { heading: /Who pays who/.test(html), rows: sec ? sec.querySelectorAll('.settle-row').length : -1, text: sec ? sec.textContent.replace(/\s+/g, ' ').trim().slice(0, 400) : '',
      st: st.map(s => [s.fromId, s.toId, s.amount]), reconcile: players.every(pl => Math.abs((net[pl.id] || 0) - (whole[pl.id] || 0)) < 0.01),
      orderOk: html.indexOf('Who pays who') > html.indexOf('Final award') && html.indexOf('Who pays who') < html.indexOf('Scorecard'),
      allSquare: (function () { const g2 = JSON.parse(JSON.stringify(g)); Object.keys(g2.scores).forEach(k => { g2.scores[k] = PARS.slice(); }); return /Who pays who/.test(buildRoundSummary(g2)); })() };
  });
  console.log(JSON.stringify(r, null, 1));
  let pass = 0, fail = 0; const ok = (c, n) => { c ? pass++ : (fail++, console.log('FAIL', n)); };
  ok(r.heading, 'finish screen has the Who pays who section');
  ok(r.rows === r.st.length && r.rows > 0, 'one card per payment');
  ok(/Larry/.test(r.text), 'payments name the players');
  ok(r.reconcile, 'payments reconcile to every player\'s Final award figure');
  ok(r.orderOk, 'sits under Final award, above the scorecard');
  ok(!r.allSquare, 'an all-square round shows no empty payments block');
  ok(!errs.length, 'no page errors ' + errs.slice(0, 2).join(' | '));
  console.log('  ' + pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})();
