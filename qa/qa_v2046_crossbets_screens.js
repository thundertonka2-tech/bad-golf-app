'use strict';
// qa/qa_v2046_crossbets_screens.js -- the cross Stroke / Quota bet SCREENS in a real DOM (jsdom):
// the "Cross bet with other groups" button on an event card, the builder (tick list, game, pays, units,
// the "N bets" line), what Save writes, the banners both carts draw, and Remove.
//   node qa/qa_v2046_crossbets_screens.js [golf-app.html|www/index.html]      (needs: npm i --no-save jsdom)
const path = require('path');
const { w, doc, bootErr, FILE } = require('./dom.js');
let fails = 0, checks = 0;
const ok = (n, c, d) => { checks++; if (!c) { fails++; console.log('  FAIL  ' + n + (d ? '   ' + String(d).slice(0, 700) : '')); } else if (process.env.V) console.log('  PASS  ' + n); };
console.log('== ' + path.basename(FILE) + '   boot: ' + (bootErr ? bootErr.message : 'clean'));
const fn = n => w.__fn(n);
const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4], SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const TID = 'qa-scr';
function cart(code, grp, specs, fin) {
  const players = specs.map((s, i) => ({ id: 't2p' + i + '-' + code, name: s[0], firstName: s[0].split(' ')[0], lastName: s[0].split(' ').slice(1).join(' '), hcp: s[1], rawHcp: s[1], baseHcp: s[1], teeLabel: 'Blue' }));
  const scores = {}; players.forEach((p, i) => { scores[p.id] = PARS.map((v, h) => (specs[i][3] != null && h >= specs[i][3]) ? null : v + specs[i][2]); });
  return { code, players, scores, pars: PARS.slice(), sis: SIS.slice(), tees: [{ label: 'Blue', rating: 72.2, slope: 127 }], hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: 18 }, course: 'QA', courseId: 'qa',
    games: {}, createdAt: 1786800000000, updatedAt: 1786800000000, finishedAt: fin ? 1786820000000 : null, t2: { tournamentId: TID, day: 1, groupId: 'g' + grp, group: grp, dayGameKeys: [] } };
}
const A = cart('CA', 1, [['Tyler OConnor', 2, 0, 12], ['Steve Miller', 6, 1, 12]], false);
const B = cart('CB', 2, [['Britt Hogland', 5, 1, 12], ['Tommy Hall', 1, 0, 12]], false);
const C = cart('CC', 3, [['Kevin Wells', 10, 2, 12], ['Rolo Castillo', 18, 2, 12]], false);
const t = { id: TID, name: 'QA screens', num_days: 1, status: 'live', settings: { dayGames: {}, groupGames: {} } };
const rows = [{ data: A }, { data: B }, { data: C }];
w._t2CrossGps = { tid: TID, at: Date.now(), t: t, rows: rows };
w._bgT2PlayersCache = {}; w._bgT2PlayersCache[TID] = ['Tyler OConnor', 'Steve Miller', 'Britt Hogland', 'Tommy Hall', 'Kevin Wells', 'Rolo Castillo', 'Chris Curry'].map((n, i) => ({ id: 'tp' + i, display_name: n }));
w.__setGame(A);
// the event copy is the test's: no network refresh replaces it
w.eval('_t2RefreshCrossGpsCache = async () => {};');
const reseed = () => { w._t2CrossGps = { tid: TID, at: Date.now(), t: t, rows: rows }; };
const banners = () => { const d = doc.createElement('div'); doc.body.appendChild(d); try { fn('_t2RenderCrossBanners')(A, d); } catch (e) {} fn('bgXbetButton')(A, d); return d; };

// 1. the entry button
let bn = banners();
const addBtn = bn.querySelector('.bg-xbet-add');
ok('event card shows the cross-bet button', !!addBtn && /Cross bet with other groups/.test(addBtn.textContent) && /Stroke play or Quota/.test(addBtn.textContent));
ok('the button is not a <button> with inline style (commit guard)', addBtn && addBtn.tagName === 'SPAN' && addBtn.getAttribute('role') === 'button');
{ const plain = Object.assign({}, A, { t2: null }); const d = doc.createElement('div'); fn('bgXbetButton')(plain, d); ok('a regular (non-event) round has no cross-bet button', !d.querySelector('.bg-xbet-add')); }
{ const finished = Object.assign({}, A, { finishedAt: 1 }); const d = doc.createElement('div'); fn('bgXbetButton')(finished, d); ok('a finished card has no cross-bet button', !d.querySelector('.bg-xbet-add')); }

// 2. the builder
addBtn.onclick();
let ov = doc.getElementById('bg-xbet-ov');
ok('builder opens', !!ov);
const boxes = () => [...ov.querySelectorAll('.xb-pl')];
const names = boxes().map(b => b.getAttribute('data-name'));
ok('lists my card, the other cards, and a player whose group has not started', names.join('|') === 'Tyler OConnor|Steve Miller|Britt Hogland|Tommy Hall|Kevin Wells|Rolo Castillo|Chris Curry', names.join('|'));
ok('"not started yet" marks the player with no card', /Chris Curry[\s\S]*not started yet/.test(ov.textContent) && /Britt Hogland[\s\S]*Group 2/.test(ov.textContent));
const tick = (n, on) => { const b = boxes().find(x => x.getAttribute('data-name') === n); b.checked = on !== false; };
const fire = () => ov.dispatchEvent(new w.Event('change', { bubbles: true }));
const count = () => ov.querySelector('#xb-count').textContent;
tick('Tyler OConnor'); tick('Britt Hogland'); fire();
ok('2 players: 1 bet', /^1 bet: Tyler v Britt/.test(count()), count());
tick('Kevin Wells'); fire();
ok('3 players on 3 cards: 3 bets', /^3 bets: /.test(count()) && /Tyler v Britt/.test(count()) && /Tyler v Kevin/.test(count()) && /Britt v Kevin/.test(count()), count());
tick('Steve Miller'); fire();
ok('add my cart-mate: 5 bets, Tyler v Steve left out and said so', /^5 bets: /.test(count()) && /Not included \(same card\): Tyler v Steve/.test(count()), count());
tick('Steve Miller', false); tick('Kevin Wells', false);
ov.querySelector('#xb-kind').value = 'quota'; fire();
ok('Quota hides net/gross and says "per point"', ov.querySelector('#xb-net-wrap').style.display === 'none' && /Per point/.test(ov.querySelector('#xb-pay option[value="per"]').textContent));
ov.querySelector('#xb-kind').value = 'stroke'; fire();
ok('Stroke play shows net/gross and says "per stroke"', ov.querySelector('#xb-net-wrap').style.display !== 'none' && /Per stroke/.test(ov.querySelector('#xb-pay option[value="per"]').textContent));
ok('builder buttons carry no inline style (commit guard)', [...ov.querySelectorAll('button')].every(b => !b.getAttribute('style')));

(async () => {
  // 3. Save: Tyler v Britt, stroke, gross, per stroke, 5
  ov.querySelector('#xb-net').value = 'gross'; ov.querySelector('#xb-pay').value = 'per'; ov.querySelector('#xb-val').value = '5'; fire();
  w.__rec.saves.length = 0;
  await ov.querySelector('#xb-save').onclick();
  const ids = Object.keys(A.xbets || {});
  const b1 = ids.length === 1 ? A.xbets[ids[0]] : null;
  ok('Save writes one bet on MY card', !!b1 && b1.kind === 'stroke' && b1.names.join('|') === 'Tyler OConnor|Britt Hogland' && b1.value === 5 && b1.net === false && b1.per === true && b1.savedAt > 0, JSON.stringify(A.xbets));
  ok('...and saves the round once', w.__rec.saves.length === 1 && w.__rec.saves[0].code === 'CA', String(w.__rec.saves.length));
  ok('builder closes', !doc.getElementById('bg-xbet-ov'));
  // units 0 refused, nothing written
  bn = banners(); bn.querySelector('.bg-xbet-add').onclick(); ov = doc.getElementById('bg-xbet-ov');
  tick('Tyler OConnor'); tick('Tommy Hall'); ov.querySelector('#xb-val').value = '0';
  await ov.querySelector('#xb-save').onclick();
  ok('0 units: refused, builder stays, nothing saved', !!doc.getElementById('bg-xbet-ov') && Object.keys(A.xbets).length === 1);
  // the same pair + game again: refused as already set; a different game for the same pair is fine
  tick('Tommy Hall', false); tick('Britt Hogland'); ov.querySelector('#xb-val').value = '9';
  await ov.querySelector('#xb-save').onclick();
  ok('same pair, same game again: not saved twice', Object.keys(A.xbets).length === 1);
  ov.querySelector('#xb-kind').value = 'quota'; ov.querySelector('#xb-pay').value = 'flat'; ov.querySelector('#xb-val').value = '20'; fire();
  await ov.querySelector('#xb-save').onclick();
  ok('same pair, Quota: saved as a second bet', Object.keys(A.xbets).length === 2 && Object.values(A.xbets).some(b => b.kind === 'quota' && b.value === 20 && b.per === false && b.net === true), JSON.stringify(A.xbets));
  // everyone against everyone with a player who has not started: Tyler, Kevin, Chris
  bn = banners(); bn.querySelector('.bg-xbet-add').onclick(); ov = doc.getElementById('bg-xbet-ov');
  boxes().forEach(b => { b.checked = false; }); tick('Tyler OConnor'); tick('Kevin Wells'); tick('Chris Curry'); ov.querySelector('#xb-val').value = '10'; fire();
  await ov.querySelector('#xb-save').onclick();
  ok('3 players incl. one not started: 3 more bets saved', Object.keys(A.xbets).length === 5, JSON.stringify(Object.values(A.xbets).map(b => b.names)));

  // 4. the banners on both carts (engine result of what was just saved)
  reseed();
  bn = banners();
  const txt = bn.textContent;
  ok('my card: Stroke play banner, per stroke, gross, with the live status', /Stroke play \(cross-group\): Tyler vs Britt/.test(txt) && /5 per stroke/.test(txt) && /gross/.test(txt) && /Tyler leads \(by 12\) thru 12/.test(txt), txt.slice(0, 500));
  ok('my card: Quota banner, flat', /Quota \(cross-group\): Tyler vs Britt/.test(txt) && /20 flat/.test(txt), txt.slice(0, 700));
  ok('my card: the bet against the not-started player says it is waiting', /waiting for Chris/.test(txt), txt.slice(-500));
  ok('my card: each of my bets has a remove link', bn.querySelectorAll('.bg-xbet-rm').length >= 3, String(bn.querySelectorAll('.bg-xbet-rm').length));
  { const d = doc.createElement('div'); doc.body.appendChild(d); w.__setGame(B); fn('_t2RenderCrossBanners')(B, d); fn('bgXbetButton')(B, d);
    ok('the OTHER card draws the same two bets with the same status', /Stroke play \(cross-group\): Tyler vs Britt/.test(d.textContent) && /Quota \(cross-group\)/.test(d.textContent) && /Tyler leads \(by 12\) thru 12/.test(d.textContent), d.textContent.slice(0, 500));
    ok('the OTHER card cannot remove a bet it did not set', d.querySelectorAll('.bg-xbet-rm').length === 0);
    ok('the OTHER card does not see bets it is not in', !/Kevin/.test(d.textContent.replace(/Cross bet with other groups.*/, '')), d.textContent.slice(0, 400));
    w.__setGame(A); }

  // 5. remove
  const rmId = Object.keys(A.xbets).find(id => A.xbets[id].kind === 'quota' && A.xbets[id].names.join('|') === 'Tyler OConnor|Britt Hogland');
  w.eval('uiConfirm = async () => true;');
  await fn('bgXbetRemove')(A, rmId);
  ok('remove marks the bet off (kept as a tombstone so the other phone drops it too)', A.xbets[rmId].off === true && A.xbets[rmId].offAt > 0);
  reseed(); bn = banners();
  ok('removed bet is gone from the banners, the stroke bet stays', !/Quota \(cross-group\): Tyler vs Britt/.test(bn.textContent) && /Stroke play \(cross-group\): Tyler vs Britt/.test(bn.textContent));
  w.eval('uiConfirm = async () => false;');
  const keep = Object.keys(A.xbets).find(id => !A.xbets[id].off);
  await fn('bgXbetRemove')(A, keep);
  ok('answering Keep leaves the bet alone', !A.xbets[keep].off);

  console.log('\n' + checks + ' checks, ' + (fails ? fails + ' FAILED' : 'ALL v2046 CROSS-BET SCREEN CHECKS PASSED') + '  (' + path.basename(FILE) + ')');
  process.exit(fails ? 1 : 0);
})();
