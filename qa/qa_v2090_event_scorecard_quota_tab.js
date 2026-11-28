'use strict';
// qa/qa_v2090_event_scorecard_quota_tab.js -- the event's whole-field scorecard (Games sheet > Tournament):
// cross-group Quota bets get their own Quota tab instead of sitting under Matches (Tyler 11/27 6:50pm).
//   node qa/qa_v2090_event_scorecard_quota_tab.js [golf-app.html|www/index.html]
const path = require('path');
const { loadApp } = require(path.join(__dirname, 'app.js'));
const HTML = process.argv[2] || path.join(__dirname, '..', 'golf-app.html');
const { qa, bootError } = loadApp(HTML);
const HG = require(path.join(__dirname, 'harness_globals.js'));
let fails = 0, checks = 0;
const ok = (n, c, d) => { checks++; if (!c) { fails++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 1200) : '')); } else if (process.env.V) console.log('  PASS  ' + n); };
console.log('== ' + path.basename(HTML) + '   boot: ' + (bootError ? bootError.message : 'clean'));
const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4], SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const TID = '11111111-2222-4333-8444-555555550090', NOW = Date.now();
const mk = (code, grp, specs) => {
  const players = specs.map((s, i) => ({ id: code + i, name: s[0], firstName: s[0].split(' ')[0], lastName: s[0].split(' ')[1], hcp: s[1], rawHcp: s[1], baseHcp: s[1], teeLabel: 'Blue' }));
  const scores = {}; players.forEach((p, i) => { scores[p.id] = PARS.map((par, h) => par + specs[i][2][h % specs[i][2].length]); });
  return { code, players, scores, pars: PARS.slice(), sis: SIS.slice(), tees: [{ label: 'Blue', rating: 72.2, slope: 127 }], hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: 18 },
    course: 'QA', courseId: 'qa', createdAt: NOW - 5 * 3600 * 1000, updatedAt: NOW, finishedAt: NOW, t2: { tournamentId: TID, group: grp, groupId: grp, day: 1, dayGameKeys: [] }, games: {} };
};
(async () => {
  qa.install({ supa: HG.supa, loadGame: HG.loadGame, roster: () => HG.S.roster, meName: () => HG.S.meName });
  const a = mk('QXA', 'grp-A', [['Kevin Wells', 12, [0, 1, -1]], ['Larry Perkins', 4, [0]]]);
  const b = mk('QXB', 'grp-B', [['Rolo Castillo', 21, [1, 2, 0]], ['Tyler OConnor', 9, [0, 0, 1]]]);
  HG.S.rounds = [a, b];
  const xb = (names, value, at) => ({ by: 'Kevin Wells', net: true, per: false, kind: 'quota', names: names, value: value, format: 'stroke', savedAt: at, segments: 'o' });
  const T = { id: TID, name: 'QA Frosty', commissioner_id: 'qa', num_days: 1, settings: { type: 'oneday', dayGames: { '1': {} }, groupGames: {},
    crossBets: { '1': { xb1: xb(['Kevin Wells', 'Rolo Castillo'], 20, NOW - 4 * 3600 * 1000), xb2: xb(['Kevin Wells', 'Tyler OConnor'], 0, NOW - 4 * 3600 * 1000 + 5) } } } };
  HG.S.tournaments[TID] = T; HG.S.players[TID] = [];
  const F = qa.fn('_t2FieldScorecardHtml');
  const tabsOf = html => { const out = []; const re = /class="[^"]*evt-sc-tab[^"]*"[^>]*data-mode="([^"]+)"[^>]*>([^<]*)</g; let m; while ((m = re.exec(html))) out.push(m[1] + '=' + m[2].trim()); return out; };
  const paneOf = (html, k) => { const i = html.indexOf('data-pane="' + k + '"'); if (i < 0) return null; const j = html.indexOf('<div class="evt-sc-pane"', i + 10); return html.slice(i, j < 0 ? html.length : j); };
  const cards = pane => (pane ? (pane.match(/class="evt-mc"/g) || []).length : 0);
  // A. the 11/27 event: two cross-group Quota bets, nothing else
  let html = ''; let err = '';
  try { html = F(T, [{ data: a }, { data: b }], []) || ''; } catch (e) { err = e.message; }
  ok('the event scorecard built', !!html, err);
  let tabs = tabsOf(html);
  ok('Tyler\'s event (two cross Quota bets): the tabs are Strokes and Quota (2) - no Matches tab', tabs.length === 2 && tabs[0] === 'strokes=Strokes' && /^quota=.*Quota \(2\)$/.test(tabs[1]), tabs);
  const qp = paneOf(html, 'quota');
  ok('the Quota tab holds both Quota cards (Kevin v Rolo, Kevin v Tyler) with their points lines', cards(qp) === 2 && /Rolo/.test(qp) && /Tyler/.test(qp) && /pts/.test(qp) && /quota \d+/.test(qp), qp && qp.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300));
  ok('nothing about Quota is filed under Matches', paneOf(html, 'matches') === null && !/Matches \(/.test(html));
  // B. add a real match in cart A: Matches (1) and Quota (2) side by side
  a.games.match = { value: 20, net: false, instances: [{ value: 20, net: false, participants: [a.players[0].id, a.players[1].id] }] };
  try { html = F(T, [{ data: a }, { data: b }], []) || ''; } catch (e) { err = e.message; html = ''; }
  tabs = tabsOf(html);
  ok('with a match play in the event too: Strokes | Matches (1) | Quota (2)', tabs.length === 3 && tabs[0] === 'strokes=Strokes' && /^matches=.*Matches \(1\)$/.test(tabs[1]) && /^quota=.*Quota \(2\)$/.test(tabs[2]), tabs);
  const mp = paneOf(html, 'matches'), qp2 = paneOf(html, 'quota');
  ok('the Matches tab has the match card and no Quota card', cards(mp) === 1 && /Match play/.test(mp) && !/Quota/.test(mp.replace(/data-pane="quota"/g, '')), mp && mp.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200));
  ok('the Quota tab still has exactly the two Quota cards and no match card', cards(qp2) === 2 && !/Match play/.test(qp2));
  ok('one pane is showing and it is Strokes by default', (html.match(/class="evt-sc-pane" data-pane="[a-z]+">/g) || []).length === 1 && /data-pane="strokes">/.test(html));
  // C. no bets at all: plain scorecard, no tab row
  delete a.games.match; const T0 = JSON.parse(JSON.stringify(T)); T0.id = TID.replace(/90$/, '91'); T0.settings.crossBets = {}; a.t2.tournamentId = b.t2.tournamentId = T0.id; HG.S.tournaments[T0.id] = T0; HG.S.players[T0.id] = [];
  try { html = F(T0, [{ data: a }, { data: b }], []) || ''; } catch (e) { html = ''; }
  ok('an event with no bets shows the scorecard with no tab row', !!html && tabsOf(html).length === 0);
  // the splitter itself
  const sp = qa.fn('bgEvSplitModels')(Object.assign([{ kind: 'match' }, { kind: 'nassau', xkind: 'quota' }, { kind: 'nassau', xkind: 'stroke' }, { kind: 'nassau' }], { notes: [{ text: 'x' }] }));
  ok('Stroke-play and Nassau bets stay under Matches; notes ride with Matches', sp.matches.length === 3 && sp.quota.length === 1 && sp.matches.notes.length === 1 && sp.hasMatches === true);
  const sp2 = qa.fn('bgEvSplitModels')(Object.assign([{ kind: 'nassau', xkind: 'quota' }], { notes: [{ text: 'a dropped bet' }] }));
  ok('a dropped-bet note still gets a Matches tab even when every live bet is Quota', sp2.hasMatches === true && sp2.matches.length === 0 && sp2.quota.length === 1);
  console.log((fails ? 'FAILED ' : 'ALL ') + (checks - fails) + '/' + checks + ' CHECKS PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
