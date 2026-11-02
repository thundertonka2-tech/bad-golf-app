'use strict';
// qa/qa_v1998_skins_playorder.js — Skins carry-over follows the ORDER THE HOLES WERE PLAYED.
// Folded in from the v1997 audit (finding 05 F-1, scratch probe_holes2.js). Tyler's v1998 decision:
// "Skins carry: in each round's own play order (_bgPlaySeq(g)), for group AND field skins; leftover
// carry forfeits at the last hole played." EXPECTS THE v1998 BEHAVIOUR, so it goes RED on v1997
// (calcSkins and _t2FieldSkinsAll both walk physical holes 1..18) and green on v1998.
//   node qa/qa_v1998_skins_playorder.js golf-app.html && node qa/qa_v1998_skins_playorder.js www/index.html
//
// Hand computation (2 players, gross, $1 per skin, carry, Start on the Back 9 = startHole 10):
//   every hole halved except Bob wins hole 18 (the 9th hole PLAYED) and Ann wins hole 1 (the 10th).
//   Play order 10,11,..,18,1,2,..,9: holes 10-17 tie (8 carries) -> Bob takes 1+8 = 9 on hole 18;
//   Ann takes 1 on hole 1 (fresh); holes 2-9 tie and the 8-unit leftover dies at hole 9 (the last
//   hole played) -> Bob +9-1 = +8, Ann -8.   Physical order (v1997) gives Ann +1 / Bob +17 => -16/+16.
const L = require('./v1998_lib.js');
const { F, check, sum, flat, log } = L;
const PARS = [4,5,3,4,4,4,3,5,4,4,3,5,4,4,4,3,5,4];
const SIS  = [7,13,17,1,9,5,15,11,3,8,16,12,2,10,4,18,14,6];
function mk(opts) {
  const g = Object.assign({ code: 'X', course: 'C', pars: PARS.slice(), sis: SIS.slice(), tees: [], players: [
    { id: 'a', name: 'Ann Able', firstName: 'Ann', hcp: 0, baseHcp: 0, rawHcp: 0 }, { id: 'b', name: 'Bob Baker', firstName: 'Bob', hcp: 0, baseHcp: 0, rawHcp: 0 }],
    games: {}, hcpRules: { basis: 'full', pct: 100, noHandicaps: true, hcp18: true, holes: 18 }, scores: {}, nineMode: 'all18', startHole: 1, finishedAt: Date.now(), updatedAt: Date.now() }, opts);
  g.players.forEach(p => g.scores[p.id] = new Array(18).fill(null));
  for (let h = 0; h < 18; h++) { g.scores.a[h] = 4; g.scores.b[h] = 4; }
  return g;
}
const SK = { mode: 'perskin', value: 1, buyin: 0, tieRule: 'carry', require: 'none', hcpPct: 100, net: false, participants: ['a', 'b'], participantNames: ['Ann Able', 'Bob Baker'] };

// ── 1. group skins, Start on the Back 9 ──
{
  const g = mk({ startHole: 10, games: { skins: Object.assign({}, SK) } });
  g.scores.a[0] = 3;    // hole 1  (10th played): Ann
  g.scores.b[17] = 3;   // hole 18 (9th played): Bob
  check('_bgPlaySeq starts on 10 and wraps', F('_bgPlaySeq')(g).join(',') === '10,11,12,13,14,15,16,17,18,1,2,3,4,5,6,7,8,9');
  const r = F('calcSkins')(g);
  const won = (r.results || []).filter(x => x.winnerId).map(x => x.hole + ':' + x.winnerId + ':' + x.amount);
  log('group skins start-10', { won, money: r.money, carry: r.carry });
  check('group skins start on 10: Bob takes 9 on hole 18 (8 carried in play order)', won.indexOf('18:b:9') >= 0, won.join(' '));
  check('group skins start on 10: Ann takes a fresh 1 on hole 1 (nothing carried over the wrap)', won.indexOf('1:a:1') >= 0, won.join(' '));
  check('group skins start on 10: money Ann -8 / Bob +8 (leftover carry forfeits at hole 9)', r.money.a === -8 && r.money.b === 8, JSON.stringify(r.money));
  check('group skins start on 10: zero-sum', sum(r.money) === 0);
}
// ── 2. the same card, played 1..18 — the physical order answer is still right when it IS the play order ──
{
  const g = mk({ startHole: 1, games: { skins: Object.assign({}, SK) } });
  g.scores.a[0] = 3; g.scores.b[17] = 3;
  const r = F('calcSkins')(g);
  check('group skins start on 1: Ann 1 on hole 1, Bob 17 on hole 18 (16 carried) -> Ann -16 / Bob +16', r.money.a === -16 && r.money.b === 16, JSON.stringify(r.money));
}
// ── 3. pick-start (start on 7): carry crosses the 18->1 wrap, forfeits at hole 6 ──
{
  const g = mk({ startHole: 7, games: { skins: Object.assign({}, SK) } });
  g.scores.a[2] = 3;    // hole 3 (15th played): Ann wins; holes 7..18,1,2 = 14 ties before it
  const r = F('calcSkins')(g);
  log('group skins start-7', { money: r.money, carry: r.carry });
  // v1802 rule: a carry still standing after the last hole PLAYED goes to the low net total (Ann, 3 on hole 3) -> 15 + 3 = 18
  check('group skins start on 7: Ann takes 1+14 = 15 on hole 3 (carry crossed the wrap), leftover 3 (holes 4-6) goes to the low total (v1802) -> 18', r.money.a === 18 && r.money.b === -18, JSON.stringify(r.money));
}
// ── 4. field skins (the event pot), same back-nine start ──
{
  const g = mk({ startHole: 10, t2: { tournamentId: 'qa-t', day: 1, groupId: 'g1', dayGameKeys: [] } });
  g.scores.a[0] = 3; g.scores.b[17] = 3;
  const r = F('_t2FieldSkinsAll')([{ data: g }], { on: true, value: 10, mode: 'perplayer', ties: 'carry', hcpPct: 100 });
  const hr = (r && r.perDay && r.perDay[0] && r.perDay[0].holeResults) || [];
  const won = hr.filter(x => x.winnerKey).map(x => x.hole + ':' + x.winnerFirst + ':carried' + x.carried);
  log('field skins start-10', { won, totals: r && r.totals });
  check('field skins start on 10: hole 18 carries 8 (play order), hole 1 carries 0', won.indexOf('18:Bob:carried8') >= 0 && won.indexOf('1:Ann:carried0') >= 0, won.join(' '));
  // buy-in pot: $10 x 2 = $20 split by skins won. Play order: Bob 9 skins, Ann 1 -> Bob 18-10 = +8, Ann 2-10 = -8.
  // (v1997 physical order: Bob 17 / Ann 1 -> +8.89 / -8.89.)
  const tot = {}; ((r && r.totals) || []).forEach(t => { tot[t.first] = Math.round(t.net * 100) / 100; });
  check('field skins start on 10: $20 pot split 9 v 1 skins -> Bob +8, Ann -8 (leftover forfeits at hole 9)', tot.Bob === 8 && tot.Ann === -8, JSON.stringify(tot));
  check('field skins start on 10: zero-sum', Math.abs(Object.values(tot).reduce((a, b) => a + b, 0)) < 0.005);
}
// ── 5. the scorecard gold rings follow the same walk ──
{
  const g = mk({ startHole: 10, t2: { tournamentId: 'qa-t', day: 1, groupId: 'g1', dayGameKeys: [] } });
  g.scores.a[0] = 3; g.scores.b[17] = 3;
  const t = { id: 'qa-t', settings: { tourneySkins: { on: true, value: 10, mode: 'perplayer', ties: 'carry', hcpPct: 100 } } };
  let m = null; try { m = F('_t2FieldSkinMapSync')(t, [{ data: g }], 1); } catch (e) { m = null; }
  log('skin map', m);
  // map is keyed by 0-based hole index -> { playerId: true }
  check('_t2FieldSkinMapSync rings hole 18 for Bob and hole 1 for Ann (same walk as the pot)', !!m && m['17'] && m['17'].b === true && m['0'] && m['0'].a === true && Object.keys(m).length === 2, m && JSON.stringify(m));
}
L.done('qa_v1998_skins_playorder');
