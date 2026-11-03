'use strict';
// Runs the REAL public-page calculation path (_bgEvpCalc's preload + t2ComputeCombinedPayouts) over the payload the live
// bg_event_page RPC returned, and compares it with the offline oracle for the same stage. Usage: node check_evp.js <evp.json> <stage>
const fs = require('fs'), path = require('path');
const { qa, F, oWhole } = require('./lib');
const HG = require(path.join(__dirname, '..', '..', 'harness_globals.js'));
qa.install({ supa: HG.supa, loadGame: HG.loadGame, roster: () => HG.S.roster, meName: () => HG.S.meName });
const D = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), stage = process.argv[3];
const exp = JSON.parse(fs.readFileSync(path.join(__dirname, 'event_' + stage + '.json'), 'utf8'));
(async () => {
  const t = { id: D.id, name: D.name, num_days: D.num_days, status: D.status, settings: Object.assign({}, D.game_settings || {}, D.settings || {}) };
  qa.fn('window')._bgEvpPre = { tid: String(D.id), rows: (D.rounds || []).map(x => ({ data: x, updated_at: null })), players: D.players };
  let pay; try { pay = await F('t2ComputeCombinedPayouts')(t); } finally { qa.fn('window')._bgEvpPre = null; }
  const app = {}; (pay.rows || []).forEach(r => app[r.id] = r.net);
  const keys = Array.from(new Set(Object.keys(app).concat(Object.keys(exp.oracle))));
  const bad = keys.filter(k => Math.abs((app[k] || 0) - (exp.oracle[k] || 0)) > 0.011).map(k => k + ' live=' + (app[k] || 0).toFixed(2) + ' oracle=' + (exp.oracle[k] || 0).toFixed(2));
  const sum = Object.values(app).reduce((a, b) => a + b, 0);
  const W = F('bgNetsWhole')(app, Object.keys(app).map(id => ({ id }))), OW = oWhole(app);
  const res = { stage, rounds: D.rounds.length, status: D.status, allFinished: pay.allFinished, pending: pay.pendingPots, live: app, oracle: exp.oracle, mismatches: bad,
    zeroSum: Math.abs(sum) < 0.005, whole: W, wholeOracle: OW, wholeOk: Object.keys(W).every(k => W[k] === OW[k] && Number.isInteger(W[k])) && Object.values(W).reduce((a, b) => a + b, 0) === 0,
    sameAsOffline: Object.keys(app).every(k => Math.abs(app[k] - (exp.app[k] || 0)) < 0.005) };
  fs.writeFileSync(path.join(__dirname, 'evp_check_' + stage + '.json'), JSON.stringify(res, null, 1));
  console.log(JSON.stringify({ stage, rounds: res.rounds, status: res.status, allFinished: res.allFinished, pending: res.pending, mismatches: bad, zeroSum: res.zeroSum, wholeOk: res.wholeOk, sameAsOffline: res.sameAsOffline, whole: W }));
  process.exit(0);
})();
