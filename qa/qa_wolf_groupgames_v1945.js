// v1945 - Wolf (Captains) in a tournament cart's own games: offered, settles, captain/picks, GPS, Final standings. node qa/qa_wolf_groupgames_v1945.js golf-app.html
'use strict';
const path = require('path');
const { loadApp } = require(path.resolve('qa/app.js'));
const { qa } = loadApp(path.resolve(process.argv[2]));
const fn = n => { const f = qa.fn(n); if (typeof f !== 'function') throw new Error('missing ' + n); return f; };
qa.install({ supa: { from() { return { select() { return this; }, eq() { return this; }, in() { return this; }, maybeSingle: async () => ({ data: null, error: null }) }; }, auth: { getSession: async () => ({ data: { session: null } }) } }, onSave: () => {}, loadGame: async () => null, roster: async () => [], meName: async () => 'Tommy' });
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL: ' + m); } };
const pars = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4], sis = [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2];
const P = [['tm','Tommy Hall',3],['lp','Larry Perkins',10],['bh','Britt Hogland',7],['jw','Jeremy Waddle',8]].map(([id, name, hcp]) => ({ id, name, hcp, firstName: name.split(' ')[0], lastName: name.split(' ')[1] }));
const scores = { tm:[4,5,4,5,4,5,4,2,4,4,3,3,4,6,5,6,4,4], lp:[4,5,6,4,5,6,4,4,4,5,4,4,5,5,4,6,4,5], bh:[4,4,6,4,6,6,4,3,6,5,5,3,5,4,4,4,3,5], jw:[4,5,6,4,4,7,5,4,6,4,6,2,4,5,5,8,3,5] };
const wolfData = { holes: { 1: { choice: 'partner', partnerId: 'bh' }, 2: { choice: 'lone' }, 3: { choice: 'blind' }, 4: { choice: 'partner', partnerId: 'tm' } } };
const want = { tm: 5, lp: -3, bh: -7, jw: 5 };
function mk(bucket) {
  const g = { code: 'QAWOLF', course: 'Buffalo Creek', courseId: 'buffalo-creek', pars, sis, hcpRules: { pct: 100, basis: 'full', holes: 18 }, players: JSON.parse(JSON.stringify(P)), scores: JSON.parse(JSON.stringify(scores)),
    games: {}, wolfData: JSON.parse(JSON.stringify(wolfData)), t2: { tournamentId: 'T', day: 1, group: 2 } };
  const cfg = { value: 1, participants: P.map(p => p.id), participantNames: P.map(p => p.name) };
  if (bucket === 'group') g.groupGames = { wolf: cfg }; else g.games.wolf = cfg;
  return g;
}
// 1) offered on a cart's own games
const fits = fn('t2GameFits');
ok(fits('wolf', 4, 'group') === true && fits('wolf', 3, 'group') === true, 'Wolf offered to a 3- or 4-player cart');
ok(fits('wolf', 2, 'group') === false, 'not offered to a 2-player cart');
// 2) money, both buckets
['games', 'group'].forEach(b => {
  const g = mk(b);
  const res = fn('computeAllGameMoney')(g);
  const tot = res && res.combined;
  const wolfRes = res && res.results && (res.results.wolf || res.results['grp:wolf']);
  ok((res.byGame || []).some(x => /wolf/i.test(x.key) && /wolf/i.test(x.label)), b + ': Wolf row on the units breakdown (' + (res.byGame || []).map(x => x.label).join(', ') + ')');
  ok(!!wolfRes, b + ': wolf result present (keys ' + Object.keys((res && res.results) || {}).filter(k => /wolf|grp/.test(k)).join(',') + ')');
  const wm = wolfRes && wolfRes.money;
  ok(wm && Object.keys(want).every(k => wm[k] === want[k]), b + ': per-player Wolf = Tommy +5, Larry -3, Britt -7, Jeremy +5 (got ' + JSON.stringify(wm) + ')');
  ok(tot && Object.keys(want).every(k => tot[k] === want[k]), b + ': round totals include Wolf (got ' + JSON.stringify(tot) + ')');
  ok(wolfRes && wolfRes.holeResults && wolfRes.holeResults.length === 4, b + ': 4 Wolf holes settled');
  // 3) score screen helpers see the cart's own Wolf
  const cap = fn('wolfCaptainForHole')(g, 1), cap2 = fn('wolfCaptainForHole')(g, 2);
  ok(cap && cap.id === 'tm' && cap2 && cap2.id === 'lp', b + ': captain rotates Tommy -> Larry');
  ok(fn('wolfPickMissingOnHole')(g, 5) === true && fn('wolfPickMissingOnHole')(g, 1) === false, b + ': hole 5 flagged as missing a pick, hole 1 not');
  ok(fn('wolfHolesMissingPicks')(g).length === 14, b + ': finish flow asks for the 14 un-picked holes');
  // 4) GPS / units chips include Wolf
  try { const st = fn('gpsMyStatuses')(g, res.results, 'tm'); ok(Array.isArray(st), b + ': GPS statuses build'); } catch (e) { ok(false, b + ': gpsMyStatuses threw ' + e.message); }
  // 5) final standings document names Wolf
  let sum = ''; try { sum = String(fn('buildRoundSummary')(g)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); } catch (e) { sum = 'ERR ' + e.message; }
  ok(/Tommy Hall Gross \d+ · Net \d+ 5 /.test(sum) && /Jeremy Waddle Gross \d+ · Net \d+ 5 /.test(sum) && /Larry Perkins Gross \d+ · Net \d+ [-\u2212]3 /.test(sum) && /Britt Hogland Gross \d+ · Net \d+ [-\u2212]7 /.test(sum), b + ': Final standings card: Tommy 5, Jeremy 5, Larry -3, Britt -7 [' + sum.slice(0, 200) + ']');
});
(async () => { try { const st = qa.state(); st.game = mk('group'); const txt = await fn('buildSettleUpText')(); ok(/Britt Hogland \u2192 Tommy Hall\s+5/.test(txt) && /Larry Perkins \u2192 Jeremy Waddle\s+3/.test(txt) && /Britt Hogland \u2192 Jeremy Waddle\s+2/.test(txt), 'Final standings text settles the Wolf exactly (' + String(txt).slice(0, 300).replace(/\n/g, ' | ') + ')'); } catch (e) { ok(false, 'settle text threw ' + e.message); }
console.log('  ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); })();
