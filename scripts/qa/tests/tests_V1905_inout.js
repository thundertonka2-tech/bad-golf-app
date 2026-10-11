// Bad Golf v1905 -- late in/out on a LIVE event's side games (openT2SideGamesInOut).
// Fixture: the real "October 11 Sr. SUNDAY" event at Buffalo Creek, taken mid-round, with
// Birdie Bump set up for all seven players -- then the commissioner unticks Chris Curry and
// MATT (SM) on the new sheet. Expected values are what Tyler asked for by hand that morning.
// Run: node tests_V1905_inout.js
'use strict';
const vm = require('vm');
const { load } = require('./loader');
const E = load();

const results = [];
let cur = '';
function section(n) { cur = n; }
function check(name, got, exp) { results.push({ section: cur, name, ok: JSON.stringify(got) === JSON.stringify(exp), got, exp }); }
const clone = x => JSON.parse(JSON.stringify(x));

const ROSTER = ['Chris Curry', 'MATT (SM)', 'Josh Varnado', 'Steve Miller', 'Gregory Jackson', 'Frank Lonigro', 'Matteo Irvine'];
const DAY_IDS = ['p0-a', 'p1-a', 'p2-a', 'p3-a', 'p4-a', 'p5-a', 'p6-a'];
const DAY_NAMES = ['Gregory Jackson', 'Frank Lonigro', 'Matteo Irvine', 'Steve Miller', 'Josh Varnado', 'Chris Curry', 'MATT (SM)'];
function baseT() {
  return {
    id: 'T1', name: 'October 11 Sr. SUNDAY', commissioner_id: 'GREG', num_days: 1, status: 'live',
    settings: {
      dayGames: { 1: {
        ctp: { holes: [4, 8, 12, 17], value: 2, participants: DAY_IDS.slice(), participantNames: DAY_NAMES.slice() },
        birdiePool: { hio: 50, eagle: 20, birdie: 10, birdieBasis: 'gross', participants: DAY_IDS.slice(), participantNames: DAY_NAMES.slice() }
      } },
      tourneySkins: { on: false, value: 5 }, tourneyLongPutt: { on: false, value: 5 },
      tourneySidePots: { girs: { on: false, value: 5 }, putts: { on: false, value: 5 }, lowNet: { on: true, value: 5 } }
    }
  };
}
function round(code, names, finished) {
  const players = names.map((n, i) => ({ id: code + '-p' + i, name: n }));
  const bp = { hio: 50, eagle: 20, birdie: 10, birdieBasis: 'gross', fieldOnly: true, fieldNames: DAY_NAMES.slice(), participants: players.map(p => p.id), participantNames: names.slice() };
  const ctp = { holes: [4, 8, 12, 17], value: 2, fieldOnly: true, fieldNames: DAY_NAMES.slice(), participants: players.map(p => p.id), participantNames: names.slice() };
  return { code, players, games: { ctp, birdiePool: bp }, t2: { day: 1, dayGameKeys: ['ctp', 'birdiePool'] }, finishedAt: finished || null };
}

// ---- a tiny DOM for the one overlay the sheet builds -------------------------------------
function fakeOverlay() {
  const ov = { style: {}, className: '', _html: '', removed: false, onclick: null, inputs: [], allBtns: [], btns: {} };
  Object.defineProperty(ov, 'innerHTML', {
    get() { return this._html; },
    set(h) {
      this._html = h;
      this.inputs = []; this.allBtns = []; this.btns = {};
      const re = /<input type="checkbox" class="t2io bg-ck" data-k="([^"]*)" data-n="([^"]*)"( checked)?/g;
      let m; while ((m = re.exec(h))) this.inputs.push({ dataset: { k: m[1], n: m[2].replace(/&amp;/g, '&') }, checked: !!m[3] });
      const reA = /t2io-all" data-k="([^"]*)"/g;
      while ((m = reA.exec(h))) this.allBtns.push({ dataset: { k: m[1] }, onclick: null });
      ['t2io-cancel', 't2io-save'].forEach(id => { if (h.indexOf('id="' + id + '"') >= 0) this.btns[id] = { onclick: null, disabled: false, textContent: '' }; });
    }
  });
  ov.querySelector = sel => ov.btns[sel.replace('#', '')] || null;
  ov.querySelectorAll = sel => sel === '.t2io' ? ov.inputs : (sel === '.t2io-all' ? ov.allBtns : []);
  ov.remove = () => { ov.removed = true; };
  return ov;
}

// ---- stubs: the server, as seen by the sheet ---------------------------------------------
let DB, saved, toasts, lastOv;
function install(opts) {
  opts = opts || {};
  DB = { t: baseT(), days: [{ id: 'D1', day_number: 1, status: opts.dayStatus || 'active' }],
         groups: [{ id: 'G1', game_code: 'GREEN29' }, { id: 'G2', game_code: 'WEDGE95' }, { id: 'G3', game_code: null }],
         games: { GREEN29: round('GREEN29', ['Matteo Irvine', 'Frank Lonigro', 'Chris Curry']),
                  WEDGE95: round('WEDGE95', ['Gregory Jackson', 'Josh Varnado', 'MATT (SM)', 'Steve Miller'], opts.g2Finished ? 123 : null) } };
  saved = []; toasts = [];
  E.t2CanManage = () => opts.canManage !== false;
  E.t2Get = async () => clone(DB.t);
  E.t2Update = async (id, patch) => { if (patch.settings) DB.t.settings = clone(patch.settings); return true; };
  E.t2GetDays = async () => clone(DB.days);
  E.t2GetPlayers = async () => ROSTER.map((n, i) => ({ id: 'tp' + i, display_name: n }));
  E.t2GetGroups = async () => clone(DB.groups);
  E.loadGame = async code => clone(DB.games[code]);
  E.saveGame = async g => { DB.games[g.code] = clone(g); saved.push(g.code); return true; };
  E.showToast = m => toasts.push(m);
  E.document.createElement = () => (lastOv = fakeOverlay());
  E.document.body.appendChild = () => {};
}
function tick(ov, k, name, on) { ov.inputs.find(c => c.dataset.k === k && c.dataset.n === name).checked = on; }

(async () => {
  // 1. Tyler's Sunday: Chris + Matt out of Birdie Bump, mid-round.
  section('Sunday: Chris + Matt out of Birdie Bump');
  install();
  await E.openT2SideGamesInOut(clone(DB.t), 0);
  const ov = lastOv;
  check('sheet opened', !!ov && ov.inputs.length > 0, true);
  check('offers Birdie Bump, CTP and the Low Net pool (no Skins, no off pools)',
        Array.from(new Set(ov.inputs.map(c => c.dataset.k))), ['birdiePool', 'ctp', 'side:lowNet']);
  check('everyone starts ticked', ov.inputs.every(c => c.checked), true);
  tick(ov, 'birdiePool', 'Chris Curry', false);
  tick(ov, 'birdiePool', 'MATT (SM)', false);
  await ov.btns['t2io-save'].onclick();
  const IN5 = ['Josh Varnado', 'Steve Miller', 'Gregory Jackson', 'Frank Lonigro', 'Matteo Irvine'];
  const bp = DB.t.settings.dayGames[1].birdiePool;
  check('day list = the five', bp.participantNames, IN5);
  check('kept players keep their original picker ids', bp.participants, ['p4-a', 'p3-a', 'p0-a', 'p1-a', 'p2-a']);
  check('payouts untouched', [bp.birdie, bp.eagle, bp.hio, bp.birdieBasis], [10, 20, 50, 'gross']);
  check('CTP day list untouched (everyone still in)', DB.t.settings.dayGames[1].ctp.participantNames, ROSTER);
  check('Low Net pool still has no list (everyone in)', DB.t.settings.tourneySidePots.lowNet.players, undefined);
  const g1 = DB.games.GREEN29.games.birdiePool, g2 = DB.games.WEDGE95.games.birdiePool;
  check('group 1 round: field list = the five', g1.fieldNames, IN5);
  check('group 1 round: in-cart players = Matteo + Frank', g1.participantNames, ['Matteo Irvine', 'Frank Lonigro']);
  check('group 1 round: ids follow', g1.participants, ['GREEN29-p0', 'GREEN29-p1']);
  check('group 2 round: in-cart players = Gregory, Josh, Steve', g2.participantNames, ['Gregory Jackson', 'Josh Varnado', 'Steve Miller']);
  check('rounds keep fieldOnly', [g1.fieldOnly, g2.fieldOnly], [true, true]);
  check('CTP on the rounds: no list = everyone', [DB.games.GREEN29.games.ctp.fieldNames, DB.games.GREEN29.games.ctp.participantNames.length], [undefined, 3]);
  check('both launched rounds saved, the unlaunched group skipped', saved.sort(), ['GREEN29', 'WEDGE95']);
  check('sheet closed', ov.removed, true);
  check('toast says every round updated', /every group’s round is updated/.test(toasts.join(' | ')), true);

  // 2. The field engine reads the new list: Chris and Matt are not entered.
  section('Field Birdie Bump honours the list');
  const sc = (p, arr) => { const a = arr.concat(Array(18 - arr.length).fill(null)); return a; };
  const rows = ['GREEN29', 'WEDGE95'].map(c => { const g = clone(DB.games[c]); g.pars = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4]; g.scores = {}; g.players.forEach(p => { g.scores[p.id] = sc(p, [4, 3, 5]); }); return { data: g }; });
  const optIn = E._t2FieldOptIn(rows[0].data.games.birdiePool);
  check('opt-in set excludes Chris and Matt', ['chris curry', 'matt (sm)', 'frank lonigro'].map(n => optIn.has(E.normalizeNameSegment(n))), [false, false, true]);

  // 3. Put Chris back in: Select all -> no list on the rounds, the whole roster on the day.
  section('All in again');
  await E.openT2SideGamesInOut(clone(DB.t), 1);
  const ov2 = lastOv;
  check('reopens with Chris unticked', ov2.inputs.find(c => c.dataset.k === 'birdiePool' && c.dataset.n === 'Chris Curry').checked, false);
  ov2.allBtns.find(b => b.dataset.k === 'birdiePool').onclick();
  await ov2.btns['t2io-save'].onclick();
  check('day list = whole roster', DB.t.settings.dayGames[1].birdiePool.participantNames, ROSTER);
  check('round field list removed (= everyone)', DB.games.WEDGE95.games.birdiePool.fieldNames, undefined);
  check('round in-cart = all four', DB.games.WEDGE95.games.birdiePool.participantNames.length, 4);

  // 4. Event prize pool: Steve sits Low Net out.
  section('Event prize pool');
  await E.openT2SideGamesInOut(clone(DB.t), 1);
  tick(lastOv, 'side:lowNet', 'Steve Miller', false);
  await lastOv.btns['t2io-save'].onclick();
  check('lowNet.players = everyone but Steve', DB.t.settings.tourneySidePots.lowNet.players, ROSTER.filter(n => n !== 'Steve Miller'));
  check('pool change does not touch round games', DB.games.GREEN29.games.ctp.fieldNames, undefined);

  // 5. A finished group still gets the list, so the field reads one answer.
  section('Finished group');
  install({ g2Finished: true });
  await E.openT2SideGamesInOut(clone(DB.t), 1);
  tick(lastOv, 'birdiePool', 'Chris Curry', false);
  await lastOv.btns['t2io-save'].onclick();
  check('finished round field list updated too', DB.games.WEDGE95.games.birdiePool.fieldNames.indexOf('Chris Curry'), -1);

  // 6. Guards.
  section('Guards');
  install({ dayStatus: 'complete' });
  lastOv = null; await E.openT2SideGamesInOut(clone(DB.t), 1);
  check('complete day refused, no sheet', [lastOv, /final/.test(toasts.join(''))], [null, true]);
  install({ canManage: false });
  lastOv = null; await E.openT2SideGamesInOut(clone(DB.t), 1);
  check('non-manager refused, no sheet', [lastOv, /commissioner/.test(toasts.join(''))], [null, true]);
  install();
  await E.openT2SideGamesInOut(clone(DB.t), 1);
  lastOv.inputs.filter(c => c.dataset.k === 'birdiePool').forEach(c => { c.checked = false; });
  await lastOv.btns['t2io-save'].onclick();
  check('nobody left in a game is refused, nothing saved', [saved.length, DB.t.settings.dayGames[1].birdiePool.participantNames.length], [0, 7]);
  // A round launched before Birdie Bump was added gets it.
  install();
  delete DB.games.GREEN29.games.birdiePool; DB.games.GREEN29.t2.dayGameKeys = ['ctp'];
  await E.openT2SideGamesInOut(clone(DB.t), 1);
  tick(lastOv, 'birdiePool', 'Chris Curry', false);
  await lastOv.btns['t2io-save'].onclick();
  check('missing Birdie Bump added to the round, fieldOnly, Chris out', [DB.games.GREEN29.games.birdiePool.fieldOnly, DB.games.GREEN29.games.birdiePool.participantNames, DB.games.GREEN29.t2.dayGameKeys],
        [true, ['Matteo Irvine', 'Frank Lonigro'], ['ctp', 'birdiePool']]);

  let pass = 0, fail = 0;
  results.forEach(r => { if (r.ok) pass++; else { fail++; console.log('FAIL [' + r.section + '] ' + r.name + '\n   got ' + JSON.stringify(r.got) + '\n   exp ' + JSON.stringify(r.exp)); } });
  console.log('v1905 in/out: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL crashed', e && e.stack); process.exit(1); });
