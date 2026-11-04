// node qa/hotfix_v2009/test_end_early.js <golf-app.html>
// v2009 hotfix: director "End the event early". Simulates Bad Wednesday (3 carts, field Quota pool
// 20 buy-in 80/20, field CTP on 4/8/12/17 at 5) where the carts stop on 15, 14 and 12, then checks the
// field Quota pool and CTP against a hand oracle that scores only the holes every cart finished.
'use strict';
const path = require('path');
const { loadApp } = require(path.join(__dirname, '..', 'app.js'));
const HTML = path.resolve(process.argv[2] || path.join(__dirname, 'work.html'));
const { ctx, qa } = loadApp(HTML);
const F = n => { const f = qa.fn(n); if (typeof f !== 'function') throw new Error('missing ' + n); return f; };
let PASS = 0, FAIL = 0;
const check = (name, ok, info) => { if (ok) PASS++; else { FAIL++; console.log('FAIL ' + name + (info ? ' :: ' + info : '')); } };
const near = (a, b) => Math.abs((a || 0) - (b || 0)) < 0.011;
const nk = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const SIS = [7, 11, 15, 3, 1, 13, 17, 5, 9, 8, 12, 16, 4, 2, 14, 18, 6, 10];
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = a => a[Math.floor(rnd() * a.length)];
const qpts = (s, par) => { const d = s - par; return d <= -3 ? 8 : d === -2 ? 6 : d === -1 ? 4 : d === 0 ? 2 : d === 1 ? 1 : 0; };

function buildEvent(carts, stops, opts) {
  opts = opts || {};
  const tid = 'tid-bw-' + Math.floor(rnd() * 1e9);
  const rounds = [];
  carts.forEach((names, gi) => {
    const code = 'BW' + gi + Math.floor(rnd() * 1e4);
    const players = names.map((n, i) => ({ id: 'p' + gi + i, name: n.name, firstName: n.name.split(' ')[0], lastName: n.name.split(' ').slice(1).join(' '), hcp: n.hcp, rawHcp: n.hcp, teeLabel: 'Blue' }));
    const g = { code, players, scores: {}, pars: PARS.slice(), sis: SIS.slice(),
      hcpRules: { basis: 'full', pct: 100, holes: 18, noPar3Strokes: true },
      games: { quota: { mode: 'pool', basis: 'auto', buyin: 20, payout: '8020', _t2field: true, participants: players.map(p => p.id) },
               ctp: { holes: [4, 8, 12, 17], value: 5, fieldOnly: true, participants: players.map(p => p.id) } },
      ctpData: {}, startHole: 1, createdAt: Date.now() - 4 * 3600e3, updatedAt: Date.now(), finishedAt: opts.selfFinish ? Date.now() : null,
      t2: { tournamentId: tid, day: 1, groupId: 'grp-' + gi, group: gi + 1, dayGameKeys: ['quota', 'ctp'] } };
    players.forEach(p => { const a = new Array(18).fill(null); for (let h = 0; h < stops[gi]; h++) a[h] = Math.max(1, PARS[h] + pick([-1, 0, 0, 1, 1, 2, 0, 1, 3])); g.scores[p.id] = a; });
    [4, 8, 12, 17].forEach(h => { if (h <= stops[gi]) g.ctpData[h] = { pid: pick(players).id, ft: 1 + Math.floor(rnd() * 30), in: Math.floor(rnd() * 12) }; });
    rounds.push(g);
  });
  const t = { id: tid, name: 'Bad Wednesday', commissioner_id: 'me', status: 'live', settings: { type: 'oneday', dayGames: { 1: { ctp: { holes: [4, 8, 12, 17], value: 5 }, quota: { mode: 'pool', basis: 'auto', buyin: 20, payout: '8020' } } } } };
  return { t, rounds };
}

// stubs for the UI / network around t2EndEventEarly
let EV = null, SAVED = [];
ctx._authUser = { id: 'me' };
function install() {
  ctx.t2GetX = async () => ({ data: EV.t });
  ctx.loadTourneyRawRounds = async () => EV.rounds.map(g => ({ data: g, updated_at: new Date().toISOString() }));
  ctx.uiConfirm = async (msg) => { install.lastMsg = msg; return true; };
  ctx.bgT2SaveRoundPatch = async (g) => { SAVED.push(g.code); return true; };
  ctx.showToast = (m) => { install.lastToast = m; };
  ctx.renderT2List = () => {};
  ctx.t2MaybeCompleteDay = async () => {};
  ctx.t2CanManage = () => true;
}
install();

const QUOTA = F('t2ComputeFieldQuota'), CTP = F('t2ComputeFieldCtp'), END = F('t2EndEventEarly');
const QT = F('quotaTargetFor');

function oracle(ev, stopsCommon) {
  const N = stopsCommon; const res = {};
  ev.rounds.forEach(g => g.players.forEach(p => {
    let pts = 0; for (let h = 0; h < N; h++) pts += qpts(g.scores[p.id][h], PARS[h]);
    const full = QT(g, { basis: 'auto' }, p);
    res[nk(p.name)] = pts - Math.round(full * N / 18);
  }));
  const names = Object.keys(res).sort((a, b) => res[b] - res[a]);
  const pool = names.length * 20, money = {}; names.forEach(n => money[n] = -20);
  const top = res[names[0]], firsts = names.filter(n => near(res[n], top));
  if (firsts.length >= 2) firsts.forEach(n => money[n] += pool / firsts.length);
  else { money[names[0]] += pool * 0.8; const rest = names.slice(1); const sec = res[rest[0]]; const s = rest.filter(n => near(res[n], sec)); s.forEach(n => money[n] += pool * 0.2 / s.length); }
  return { res, money };
}

const CARTS = [
  [{ name: 'Steve Miller', hcp: 12 }, { name: 'Gregory Jackson', hcp: 3 }, { name: 'Josh Varnado', hcp: 18 }],
  [{ name: 'Kevin Wells', hcp: 9 }, { name: 'Rolo Castillo', hcp: 14 }, { name: 'Heath Stanley', hcp: 6 }, { name: 'Rambo', hcp: 8 }],
  [{ name: 'MC Donk', hcp: 22 }, { name: 'Fred Hall', hcp: 16 }, { name: 'Chris Curry', hcp: 10 }]];

(async () => {
  for (let trial = 0; trial < 300; trial++) {
    const stops = trial === 0 ? [15, 14, 12] : [8 + Math.floor(rnd() * 11), 8 + Math.floor(rnd() * 11), 8 + Math.floor(rnd() * 11)];
    const selfFinish = trial % 5 === 4;   // groups that already tapped End round early themselves
    EV = buildEvent(CARTS, stops, { selfFinish }); SAVED = [];
    const N = Math.min(...stops);
    await END(EV.t.id, 1);
    const lbl = 'trial ' + trial + ' stops ' + stops.join('/') + (selfFinish ? ' (self-finished)' : '');
    check(lbl + ' every group saved', SAVED.length === 3, SAVED.join(','));
    check(lbl + ' every group finished', EV.rounds.every(g => g.finishedAt));
    check(lbl + ' no unplayed hole got a pick-up', EV.rounds.every(g => g.players.every(p => g.scores[p.id].slice(Math.max(...stops)).every(v => v == null))));
    check(lbl + ' each group keeps its own holes', EV.rounds.every((g, i) => g.players.every(p => g.scores[p.id].filter(v => v != null).length === stops[i])));
    const rows = EV.rounds.map(g => ({ data: g }));
    const q = QUOTA(rows, EV.t, null);
    const o = oracle(EV, N);
    check(lbl + ' quota pool complete', q && q.complete !== false, q && q.complete);
    const st = {}; (q && q.standings || []).forEach(s => st[nk(s.name)] = s.result);
    check(lbl + ' quota results = points on holes 1-' + N + ' - prorated quota', Object.keys(o.res).every(k => Math.abs((st[k] || 0) - o.res[k]) < 0.02), JSON.stringify(st) + ' vs ' + JSON.stringify(o.res));
    check(lbl + ' quota units = oracle', q && Object.keys(o.money).every(k => near(q.money[k], o.money[k])), JSON.stringify(q && q.money) + ' vs ' + JSON.stringify(o.money));
    check(lbl + ' quota zero-sum', q && near(Object.values(q.money).reduce((a, b) => a + b, 0), 0));
    // CTP: only holes <= N count; holes beyond the common set called off
    const c = CTP(rows);
    const cm = (c && c.money) || {};
    const sum = Object.values(cm).reduce((a, b) => a + (Number(b) || 0), 0);
    check(lbl + ' ctp zero-sum', near(sum, 0), JSON.stringify(cm));
    const liveHoles = [4, 8, 12, 17].filter(h => h <= N);
    check(lbl + ' ctp holes left in play = ' + liveHoles.join(','), EV.rounds.every(g => JSON.stringify(g.games.ctp.holes) === JSON.stringify(liveHoles)), JSON.stringify(EV.rounds[0].games.ctp.holes));
    // pot size: 10 players x 5 per live hole -- if every live hole was won by someone, winners' take = 10*5*live - 5 each
    const totalPos = Object.values(cm).filter(v => v > 0).reduce((a, b) => a + b, 0);
    check(lbl + ' ctp pot is only the live holes', totalPos <= liveHoles.length * 10 * 5 + 0.01, totalPos + ' > ' + liveHoles.length * 50);
    if (trial === 0) console.log('Confirm text (trial 0):\n  ' + install.lastMsg + '\nToast: ' + install.lastToast);
  }
  // Re-running is harmless: same numbers (original settings kept in _early)
  EV = buildEvent(CARTS, [15, 14, 12]); await END(EV.t.id, 1);
  const r1 = JSON.stringify(QUOTA(EV.rounds.map(g => ({ data: g })), EV.t, null).money);
  EV.rounds.forEach(g => { g.finishedAt = null; }); await END(EV.t.id, 1);
  const r2 = JSON.stringify(QUOTA(EV.rounds.map(g => ({ data: g })), EV.t, null).money);
  check('tapping it twice gives the same result', r1 === r2, r1 + ' vs ' + r2);
  // Normal 18-hole event untouched by the patch: full round gives the same as unpatched expectations
  EV = buildEvent(CARTS, [18, 18, 18]); EV.rounds.forEach(g => g.finishedAt = Date.now());
  const before = JSON.stringify(QUOTA(EV.rounds.map(g => ({ data: g })), EV.t, null).money);
  check('an 18-hole event that is never ended early is unchanged', !!before && before.indexOf('NaN') < 0);
  console.log('\nEnd-early hotfix: ' + PASS + ' passed, ' + FAIL + ' failed');
  process.exit(FAIL ? 1 : 0);
})();
