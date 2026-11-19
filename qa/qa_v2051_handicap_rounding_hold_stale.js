'use strict';
// qa/qa_v2051_handicap_rounding_hold_stale.js -- handicap audit (Tyler + Kevin 11/18):
//   rounded (not truncated) index, WHS table by hand, typed handicap held until 5 rounds,
//   stale shared index topped up from player_stats.
//   node qa/qa_v2051_handicap_rounding_hold_stale.js [golf-app.html|www/index.html]
const L = require('./v1998_lib.js');
const { F, check } = L;
const calc = F('calcHandicapIndex'), rnd = F('bgRoundIndex'), hold = F('bgHcpHold'), entered = F('bgEnteredHcp');
const hcpFor = F('bgHcpFor'), ingest = F('bgIngestSharedHcp'), shared = F('bgSharedHcp');
const plan = F('bgHcpStalePlan'), fromStats = F('bgHcpRowFromStats'), profHcp = F('bgProfileHcp'), pickerRows = F('t2PickerUsersFromProfiles');
const DAY = 86400000, T0 = Date.UTC(2026, 9, 1);
const rd = (d, i, extra) => Object.assign({ date: T0 + i * DAY, differential: d, differentialRaw: d, holesScored: 18, complete: true, gameCode: 'G' + i, course: 'QA' }, extra || {});
const hist = diffs => diffs.map((d, i) => rd(d, i));

console.log('\n== rounding: nearest tenth, .5 up ==');
[[10.05, 10.1], [10.04, 10.0], [10.049999, 10.0], [7.65, 7.7], [7.186, 7.2], [9.16, 9.2], [6.05, 6.1], [5.167, 5.2], [5.65, 5.7], [10.75, 10.8], [10.74, 10.7],
 [0.04, 0], [0.05, 0.1], [-1.25, -1.2], [-1.26, -1.3], [-0.04, 0], [-0.05, 0], [-0.06, -0.1], [12, 12], [2.4, 2.4]].forEach(([raw, want]) =>
  check('round ' + raw + ' -> ' + want, rnd(raw) === want, String(rnd(raw))));
check('never negative zero', Object.is(rnd(-0.04), 0));
check('float drift: (80.4/8) reads 10.1', rnd(80.4 / 8) === 10.1, String(rnd(80.4 / 8)));
check('float drift: 0.1+0.2+... true .x5 stays up', rnd((7.3 + 8.0) / 2) === 7.7, String(rnd((7.3 + 8.0) / 2)));

console.log('\n== WHS Rule 5.2a table, hand-computed, every round count ==');
{
  // differentials ascending by value 1.0, 2.1, 3.3, 4.6 ... so each band's average is known by hand
  const base = [1.0, 2.1, 3.3, 4.6, 6.0, 7.5, 9.1, 10.8, 12.6, 14.5, 16.5, 18.6, 20.8, 23.1, 25.5, 28.0, 30.6, 33.3, 36.1, 39.0];
  const want = n => {
    const use = n <= 5 ? 1 : n <= 8 ? 2 : n <= 11 ? 3 : n <= 14 ? 4 : n <= 16 ? 5 : n <= 18 ? 6 : n === 19 ? 7 : 8;
    const adj = n === 3 ? -2 : n === 4 ? -1 : n === 6 ? -1 : 0;
    const avg = base.slice(0, use).reduce((a, b) => a + b, 0) / use + adj;
    return Math.round(avg * 10 + 1e-7) / 10 === -0 ? 0 : Math.floor(avg * 10 + 0.5 + 1e-7) / 10;
  };
  for (let n = 3; n <= 20; n++) {
    const r = calc(hist(base.slice(0, n).slice().reverse()));   // order in the list must not matter
    check(n + ' rounds -> ' + want(n), r && r.index === want(n) && r.n === n, r && (r.index + ' ' + r.basis));
  }
  check('2 rounds: no index', calc(hist([5, 6])).index === null);
  check('3 nine-hole rounds (27 holes): no index', calc([rd(5, 0, { holesScored: 9 }), rd(6, 1, { holesScored: 9 }), rd(7, 2, { holesScored: 9 })]).index === null);
  check('only the most recent 20 count (an old 0.0 has rolled off)', calc([rd(0, -5)].concat(hist(base))).index === calc(hist(base)).index);
  check('a round switched off never counts', calc(hist(base).concat([rd(-9, 30, { hcpOff: true })])).index === calc(hist(base)).index);
  check('raw differential, not the weather-adjusted one', calc([rd(9, 0, { differentialRaw: 5 }), rd(9, 1, { differentialRaw: 5 }), rd(9, 2, { differentialRaw: 5 })]).index === 3);
  check('3-4 rounds are flagged provisional', /provisional/.test(calc(hist([5, 6, 7])).basis) && /provisional/.test(calc(hist([5, 6, 7, 8])).basis) && !/provisional/.test(calc(hist([5, 6, 7, 8, 9])).basis));
}

console.log('\n== the 11/18 cases ==');
{
  check('Kevin Wells: best 8 average 10.05 -> 10.1 (was 10.0)', calc(hist([4.7, 7.5, 9.9, 10.5, 11.4, 11.4, 12.3, 12.7].concat(Array(12).fill(20)))).index === 10.1);
  check('Fred Hall: 13.2, 5.2, 4.4 -> 2.4 provisional', (() => { const r = calc(hist([13.2, 5.2, 4.4])); return r.index === 2.4 && /lowest 1 of 3/.test(r.basis); })());
  check('Frank LoNigro 7.65 -> 7.7', rnd(7.65) === 7.7);
}

console.log('\n== typed handicap stands until 5 scored rounds ==');
{
  const fred3 = { name: 'Qa Fred', firstName: 'Qa', lastName: 'Fred', hcp: 8, scoreHistory: hist([13.2, 5.2, 4.4]) };
  let r = hcpFor(fred3);
  check('3 rounds + typed 8: index held (null), heldIndex 2.4, held flag', r.index === null && r.held === true && r.heldIndex === 2.4 && r.n === 3, JSON.stringify(r));
  check('isHcpTemp -> the TEMP badge shows', F('isHcpTemp')(fred3) === true);
  check('tournament handicap = the typed 8', F('t2RosterHcp')(fred3) === 8);
  const fred4 = Object.assign({}, fred3, { scoreHistory: hist([13.2, 5.2, 4.4, 9.0]) });
  check('4 rounds: still the typed 8', F('t2RosterHcp')(fred4) === 8);
  const fred5 = Object.assign({}, fred3, { scoreHistory: hist([13.2, 5.2, 4.4, 9.0, 10.0]) });
  r = hcpFor(fred5);
  check('5 rounds: the calculated index takes over (4.4)', r.index === 4.4 && !r.held && F('t2RosterHcp')(fred5) === 4.4 && F('isHcpTemp')(fred5) === false, JSON.stringify(r));
  const none = Object.assign({}, fred3, { hcp: 0 });
  check('nobody typed one (0): calculated from round 3, as before', hcpFor(none).index === 2.4 && F('t2RosterHcp')(none) === 2.4);
  check('typed as text "8.5" counts as entered', entered({ hcp: '8.5' }) === 8.5 && entered({ hcp: '' }) === null && entered({ hcp: null }) === null && entered(null) === null);
  check('an account picker row (_fromProfile) is never "typed"', entered({ hcp: 2.4, _fromProfile: true }) === null);
  check('2 rounds: nothing to hold, typed value used as before', hcpFor({ name: 'Qa Two', hcp: 12, scoreHistory: hist([5, 6]) }).index === null && !hcpFor({ name: 'Qa Two', hcp: 12, scoreHistory: hist([5, 6]) }).held);
  check('hold is pure: the calc object is not mutated', (() => { const c = { index: 2.4, n: 3 }; hold(c, { hcp: 8 }); return c.index === 2.4 && !c.held; })());
  // a SHARED (published) index with fewer than 5 rounds is held too
  ingest([{ my_player: 'Qa Shared', hcp_index: 3.1, hcp_n: 4, hcp_holes: 72, hcp_basis: 'provisional', hcp_at: '2026-11-10T00:00:00.000Z' }]);
  check('shared index n=4 + typed 9: typed 9', F('t2RosterHcp')({ name: 'Qa Shared', hcp: 9, scoreHistory: [] }) === 9);
  check('shared index n=4, nothing typed: 3.1', F('t2RosterHcp')({ name: 'Qa Shared', hcp: 0, scoreHistory: [] }) === 3.1);
  ingest([{ my_player: 'Qa Shared', hcp_index: 3.4, hcp_n: 5, hcp_holes: 90, hcp_basis: 'lowest 1 of 5', hcp_at: '2026-11-12T00:00:00.000Z' }]);
  check('shared index n=5 + typed 9: 3.4', F('t2RosterHcp')({ name: 'Qa Shared', hcp: 9, scoreHistory: [] }) === 3.4);
}

console.log('\n== stale shared index: plan ==');
{
  const profiles = [
    { id: 'larry', display_name: 'Qa Larry', hcp_index: 7.6, hcp_at: '2026-11-14T17:20:00+00:00' },
    { id: 'fresh', display_name: 'Qa Fresh', hcp_index: 9.0, hcp_at: '2026-11-19T01:31:00+00:00' },
    { id: 'never', display_name: 'Qa Never', hcp_index: null, hcp_at: null },
    { id: 'me', display_name: 'Qa Me', hcp_index: 2.6, hcp_at: '2026-11-01T00:00:00+00:00' }
  ];
  const stats = [
    { user_id: 'larry', updated_at: '2026-11-19T01:30:00.123456+00:00' },
    { user_id: 'fresh', updated_at: '2026-11-19T01:30:30+00:00' },      // owner published 30 s later
    { user_id: 'never', updated_at: '2026-11-18T01:00:00+00:00' },
    { user_id: 'me', updated_at: '2026-11-19T02:00:00+00:00' },
    { user_id: 'ghost', updated_at: '2026-11-19T02:00:00+00:00' },      // no profile
    { user_id: 'bad', updated_at: null }
  ];
  let p = plan(stats, profiles, {}, 'me');
  check('stale = stats newer than the publish; newest first; never me, never a row with no profile', JSON.stringify(p.fetch) === JSON.stringify(['larry', 'never']), JSON.stringify(p.fetch));
  check('within 2 minutes of the owner\'s publish is not stale', !p.fetch.includes('fresh'));
  const seen = { larry: { at: '2026-11-19T01:30:00.123456+00:00', rec: { hcp_index: 6, hcp_n: 13, hcp_holes: 234, hcp_basis: 'avg of lowest 4 of 13', hcp_at: '2026-11-19T01:30:00.123Z' } }, never: { at: '2026-11-18T01:00:00+00:00', rec: null }, gone: { at: 'x', rec: null } };
  p = plan(stats, profiles, seen, 'me');
  check('already read for this timestamp: not fetched again, served from the device cache', p.fetch.length === 0 && p.cached.length === 1 && p.cached[0].hcp_index === 6 && p.cached[0].my_player === 'Qa Larry');
  check('cache keeps only rows still stale (old entries pruned)', Object.keys(p.keep).sort().join() === 'larry,never');
  seen.larry.at = '2026-11-18T00:00:00+00:00';
  check('stats changed again since: fetched again', plan(stats, profiles, seen, 'me').fetch[0] === 'larry');
  check('bad input is harmless', plan(null, null, null, null).fetch.length === 0);
}

console.log('\n== stale shared index: recalculated from stats, newest wins ==');
{
  const pr = { id: 'larry', display_name: 'Qa Larry', hcp_index: 7.6, hcp_at: '2026-11-14T17:20:00+00:00' };
  ingest([Object.assign({}, pr, { hcp_n: 12, hcp_holes: 216, hcp_basis: 'avg of lowest 4 of 12' })]);
  check('before: the old shared 7.6', shared('Qa Larry').index === 7.6);
  const twelve = [5.0, 7.0, 8.0, 10.4, 12, 13, 14, 15, 16, 17, 18, 19];            // lowest 4 = 30.4 -> 7.6
  const row = { user_id: 'larry', updated_at: '2026-11-19T01:30:00.123456+00:00', stats: hist(twelve.concat([4.0])) };   // 13th round 4.0: lowest 4 = 24.0 -> 6.0
  const rec = fromStats(row, pr, new Set());
  check('13 rounds in stats -> 6.0, n 13, ISO timestamp', rec && rec.hcp_index === 6 && rec.hcp_n === 13 && /Z$/.test(rec.hcp_at), JSON.stringify(rec));
  ingest([Object.assign({ my_player: 'Qa Larry' }, rec)]);
  check('newer stats beat the older publish: shared reads 6.0', shared('Qa Larry').index === 6);
  check('tournament handicap follows', F('t2RosterHcp')({ name: 'Qa Larry', hcp: 0, scoreHistory: [] }) === 6);
  check('picker account row follows', profHcp(pr, 'Qa Larry') === 6);
  check('picker rows built from profiles use it', (() => { let rows = []; try { rows = pickerRows([pr]); } catch (e) {} return !rows.length || rows[0].hcp === 6; })());
  ingest([{ my_player: 'Qa Larry', hcp_index: 6.3, hcp_n: 14, hcp_holes: 252, hcp_basis: 'x', hcp_at: '2026-11-19T02:00:00+00:00' }]);
  check('the owner opening the app later (newer publish) wins again', shared('Qa Larry').index === 6.3);
  ingest([Object.assign({ my_player: 'Qa Larry' }, rec)]);
  check('an older stats-derived value never replaces a newer publish', shared('Qa Larry').index === 6.3);
  check('mixed timestamp spellings compare as times (+00:00 vs Z)', F('_bgHcpNewer')('2026-11-19T01:30:00.5+00:00', '2026-11-19T01:30:00.123Z') === true && F('_bgHcpNewer')('2026-11-19T01:30:00+00:00', '2026-11-19T01:30:00.000Z') === false);
  const dead = new Set(['G12']);                                                      // the 4.0 round was deleted for everyone
  check('a round deleted for everyone is left out', fromStats(row, pr, dead).hcp_index === 7.6);
  check('fewer than 54 holes in stats: nothing to give (the publish stands)', fromStats({ user_id: 'x', updated_at: '2026-11-19T00:00:00Z', stats: hist([5, 6]) }, pr, null) === null);
  check('profile with no index and nothing in stats: picker row reads 0', profHcp({ hcp_index: null }, 'Qa Nobody') === 0);
}
L.done('qa_v2051_handicap_rounding_hold_stale');
