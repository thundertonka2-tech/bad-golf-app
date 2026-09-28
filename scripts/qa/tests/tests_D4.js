// v1811 audit D4 -- headless checks: a cart's own pre-launch games (g.groupGames) get Board
// cards + the Nassau/Huckle banner. Runs the REAL main.js in the vm sandbox (loader.js).
// Run from a games/ folder whose ../main.js is the PATCHED script: node tests_D4.js
'use strict';
const vm = require('vm');
const { load } = require('./loader');
const E = load();

const out = [];
function check(name, ok, note) { out.push({ name, ok, note }); }

const PARS = [4,4,3,4,5,4,3,4,4, 4,4,3,4,5,4,3,4,4];
const SIS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18];
const ids = ['p1', 'p2', 'p3', 'p4'];
function fill(v) { return new Array(18).fill(v); }
function mk(o) {
  const g = {
    code: 'D4TEST', course: 'Test Course', pars: PARS, sis: SIS,
    tees: [{ label: 'White', rating: 70.0, slope: 113 }],
    players: ids.map(id => ({ id, name: id.toUpperCase(), hcp: 0, rawHcp: 0, baseHcp: 0, teeLabel: 'White', playsGross: false, uid: null })),
    scores: o.scores,
    games: o.games || {},
    groupGames: o.groupGames,
    hcpRules: { pct: 100, basis: 'full', holes: 18, noHandicaps: true, noPar3Strokes: false },
    nineMode: 'all18', startHole: 1,
    finishedAt: o.finished === false ? undefined : Date.now(),
    t2: { tournamentId: 't-1', dayNumber: 1, groupId: 'g-1', format: 'stroke' }   // tournament-shaped cart
  };
  return g;
}
const skinsCfg = () => ({ mode: 'perskin', value: 2, tieRule: 'carry', require: 'none', hcpPct: 100, participants: ids.slice() });
const nassauCfg = () => ({ value: 5, format: 'stroke', net: false, allowHuckle: true, participants: ids.slice() });

// p1 wins holes 1 and 4 outright, everything else tied -> 2 skins, carry on 2-3.
const sc = { p1: fill(4), p2: fill(4), p3: fill(4), p4: fill(4) };
sc.p1[0] = 3; sc.p1[3] = 3;

// ---------------------------------------------------------------- 1. resolver
{
  const g = mk({ scores: sc, groupGames: { skins: skinsCfg(), nassau: nassauCfg() } });
  const r = E.bgMainCfg(g, 'skins');
  check('bgMainCfg: group-only skins resolves to groupGames bucket', !!(r && r.group === true && r.cfg === g.groupGames.skins && r.resKey === 'grp:skins'));
  check('bgMainCfg: unknown key -> null', E.bgMainCfg(g, 'vegas') === null);
  check('bgMainCfg: null round -> null', E.bgMainCfg(null, 'skins') === null);
  const both = mk({ scores: sc, games: { skins: skinsCfg() }, groupGames: { skins: skinsCfg() } });
  const rb = E.bgMainCfg(both, 'skins');
  check('bgMainCfg: g.games wins when both buckets have the key (matches bgSideCfg order)', !!(rb && rb.group === false && rb.cfg === both.games.skins && rb.resKey === 'skins'));
  const v = E.bgGroupGamesView(g);
  check('bgGroupGamesView: games = groupGames, _noGroupGames set, no groupGames key', !!(v && v.games === g.groupGames && v._noGroupGames === true && !('groupGames' in v) && v.players === g.players));
  check('bgGroupGamesView: no group games -> null', E.bgGroupGamesView(mk({ scores: sc })) === null);
  check('bgGroupGamesView: recursion guard honoured', E.bgGroupGamesView(Object.assign({}, g, { _noGroupGames: true })) === null);
}

// ---------------------------------------------------------------- 2. engine output shape (unchanged) + view == grp: results
{
  const g = mk({ scores: sc, groupGames: { skins: skinsCfg(), nassau: nassauCfg() } });
  const m = E.computeAllGameMoney(g);
  check('computeAllGameMoney: group-only skins settles under results["grp:skins"]', !!m.results['grp:skins'] && !m.results.skins);
  check('computeAllGameMoney: group-only nassau settles under results["grp:nassau"]', !!m.results['grp:nassau'] && !m.results.nassau);
  const bg = (m.byGame || []).find(b => b.key === 'grp:skins');
  check('computeAllGameMoney: byGame row is namespaced + labelled "(your group)"', !!bg && /\(your group\)$/.test(bg.label) && bg.group === true);
  const sums = {}; (m.byGame || []).forEach(b => ids.forEach(id => { sums[id] = (sums[id] || 0) + ((b.money && b.money[id]) || 0); }));
  check('computeAllGameMoney: combined == sum of the grp: byGame rows (breakdown adds up to Total)', ids.every(id => Math.abs((m.combined[id] || 0) - (sums[id] || 0)) < 1e-9), JSON.stringify(m.combined));
  check('computeAllGameMoney: grp:skins money is the group skins settlement (p1 up, three losers even)', m.results['grp:skins'].money.p1 > 0 && m.results['grp:skins'].money.p2 === m.results['grp:skins'].money.p3 && m.results['grp:skins'].money.p3 === m.results['grp:skins'].money.p4);
  // The card is painted from bgGroupGamesView + results['grp:*'] -- prove they are the same numbers.
  const mv = E.computeAllGameMoney(E.bgGroupGamesView(g));
  check('view results.skins deep-equals results["grp:skins"] (card numbers == breakdown numbers)', JSON.stringify(mv.results.skins) === JSON.stringify(m.results['grp:skins']));
  check('view results.nassau deep-equals results["grp:nassau"]', JSON.stringify(mv.results.nassau) === JSON.stringify(m.results['grp:nassau']));
  // Both buckets: field skins AND group skins -> two distinct results, no double count in either.
  const both = mk({ scores: sc, games: { skins: skinsCfg() }, groupGames: { skins: skinsCfg() } });
  const mb = E.computeAllGameMoney(both);
  // field skins on a t2 round is event-owned only when the event says so; here nothing marks it owned, so both settle.
  check('both buckets: results.skins and results["grp:skins"] are separate objects', !!mb.results.skins && !!mb.results['grp:skins'] && mb.results.skins !== mb.results['grp:skins']);
}

// ---------------------------------------------------------------- 3. banner predicate + Huckle reachability
{
  // Live round, p2 down 2 to p1 on the front after hole 5 -> p2 may huckle p1 from hole 6.
  const live = { p1: fill(null), p2: fill(null), p3: fill(null), p4: fill(null) };
  for (let i = 0; i < 5; i++) { live.p1[i] = 4; live.p2[i] = 4; live.p3[i] = 4; live.p4[i] = 4; }
  live.p1[0] = 3; live.p1[1] = 3;   // p1 -2 vs everyone
  const g = mk({ scores: live, finished: false, groupGames: { nassau: nassauCfg() } });
  const cross = E._nassauAnyCross(g);
  check('_nassauAnyCross: reads the group-bucket Nassau without throwing (no cross-group names -> false)', cross === false);
  const el = E.computeEligibleHuckles(g, 6);
  check('computeEligibleHuckles: group-only Nassau yields huckle opportunities (was [] before D4)', Array.isArray(el) && el.length > 0, JSON.stringify(el.slice(0, 2)));
  // The Score-tab banner predicate, exactly as renderGameBanners now evaluates it.
  const _m = E.bgMainCfg(g, 'nassau'); const _c = _m && _m.cfg;
  const pred = !!(_c && _c.allowHuckle !== false && E.getParticipants(g, _c).length >= 2);
  check('Huckle banner predicate is true for a group-only Nassau', pred);
  const none = mk({ scores: live, finished: false });
  check('computeEligibleHuckles: no Nassau anywhere -> []', E.computeEligibleHuckles(none, 6).length === 0);
}

// ---------------------------------------------------------------- 4. renderBoard headless: cards for group games
function fakeEl() {
  const el = {
    children: [], _inner: '', className: '', id: '', textContent: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    appendChild(c) { el.children.push(c); return c; },
    insertBefore(c) { el.children.unshift(c); return c; },
    removeChild(c) { el.children = el.children.filter(x => x !== c); return c; },
    querySelectorAll() { return []; },
    querySelector(sel) {
      if (sel === '.lbl') { return el._lbl || (el._lbl = { appendChild(c) { el._tag = (el._tag || '') + String(c.textContent || ''); }, querySelector() { return null; } }); }
      return null;
    },
    insertAdjacentHTML() {}, addEventListener() {}, removeAttribute() {}, setAttribute() {}, remove() {}, closest() { return null; }, scrollIntoView() {}, getAttribute() { return null; }
  };
  Object.defineProperty(el, 'innerHTML', { get() { return el._inner; }, set(v) { el._inner = String(v); } });
  return el;
}
function renderCards(g) {
  const gr = fakeEl();
  const origGet = E.document.getElementById, origCreate = E.document.createElement;
  E.document.getElementById = id => (id === 'game-results-list' ? gr : origGet(id));
  E.document.createElement = () => fakeEl();
  const S = vm.runInContext('({ get state(){ return state; } })', E).state;
  const prev = S.game; S.game = g; S.viewOnlyMode = false;
  let err = null;
  try { E.renderBoard(); } catch (e) { err = e; }
  S.game = prev;
  E.document.getElementById = origGet; E.document.createElement = origCreate;
  return { gr, err };
}
{
  const g = mk({ scores: sc, groupGames: { skins: skinsCfg(), nassau: nassauCfg() } });
  const { gr, err } = renderCards(g);
  check('renderBoard runs headless on a tournament cart with group-only games', !err, err && (err.stack || String(err)).split('\n').slice(0, 3).join(' | '));
  const cards = gr.children;
  const skinsCards = cards.filter(c => /class="lbl">[^<]*Skins \(/.test(c.innerHTML));
  const nassauCards = cards.filter(c => /class="lbl">[^<]*Nassau \(/.test(c.innerHTML));
  check('Board paints ONE Skins card for the group-only skins', skinsCards.length === 1, 'cards: ' + cards.map(c => c.innerHTML.slice(0, 60)).join(' || '));
  check('Board paints ONE Nassau card for the group-only nassau', nassauCards.length === 1);
  check('the Skins card is tagged "(your group)" (matches the breakdown label)', skinsCards.length === 1 && /\(your group\)/.test(skinsCards[0]._tag || ''));
  check('the Nassau card is tagged "(your group)"', nassauCards.length === 1 && /\(your group\)/.test(nassauCards[0]._tag || ''));
  // Card numbers == breakdown numbers: "2 won" from results['grp:skins'].
  const m = E.computeAllGameMoney(g);
  const won = m.results['grp:skins'].results.filter(r => r.winnerId).length;
  check('Skins card "N won" equals the grp:skins result the breakdown used', skinsCards.length === 1 && skinsCards[0].innerHTML.indexOf(won + ' won') >= 0, skinsCards[0] && skinsCards[0].innerHTML.slice(0, 160));
  check('Skins card shows the GROUP config value (2 per skin)', skinsCards.length === 1 && skinsCards[0].innerHTML.indexOf('Skins (2 per skin)') >= 0);
  const puttsCards = cards.filter(c => c.id === 'game-results-puttsgir');
  check('Putts/GIR tracking card is not duplicated by the group pass', puttsCards.length <= 1);
}
{
  // Field skins (value 1) AND group skins (value 2): both cards, distinctly labelled, no double count.
  const g = mk({ scores: sc, games: { skins: Object.assign(skinsCfg(), { value: 1 }) }, groupGames: { skins: skinsCfg() } });
  const { gr, err } = renderCards(g);
  check('renderBoard runs headless with skins in BOTH buckets', !err, err && String(err));
  const skinsCards = gr.children.filter(c => /class="lbl">[^<]*Skins \(/.test(c.innerHTML));
  check('both buckets -> TWO Skins cards', skinsCards.length === 2, 'n=' + skinsCards.length);
  const tagged = skinsCards.filter(c => /\(your group\)/.test(c._tag || ''));
  check('exactly one of the two is tagged "(your group)"', tagged.length === 1);
  check('the untagged card is the field one (1 per skin), the tagged card the group one (2 per skin)',
    skinsCards.some(c => !c._tag && c.innerHTML.indexOf('Skins (1 per skin)') >= 0) && tagged.length === 1 && tagged[0].innerHTML.indexOf('Skins (2 per skin)') >= 0);
}
{
  // No group games: exactly the old behaviour -- one card, nothing tagged.
  const g = mk({ scores: sc, games: { skins: skinsCfg() } });
  const { gr, err } = renderCards(g);
  const skinsCards = gr.children.filter(c => /class="lbl">[^<]*Skins \(/.test(c.innerHTML));
  check('no group games -> one untagged Skins card (unchanged path)', !err && skinsCards.length === 1 && !skinsCards[0]._tag);
}

// ---------------------------------------------------------------- report
const failed = out.filter(r => !r.ok);
out.forEach(r => console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok || !r.note ? '' : '  -- ' + r.note)));
console.log('\n' + (out.length - failed.length) + ' passed, ' + failed.length + ' failed, ' + out.length + ' total');
process.exit(failed.length ? 1 : 0);
