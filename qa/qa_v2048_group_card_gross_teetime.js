'use strict';
// qa/qa_v2048_group_card_gross_teetime.js -- tournament card group folds: gross beside each player, tee time (Tyler 11/18).
//   node qa/qa_v2048_group_card_gross_teetime.js [golf-app.html|www/index.html]
const L = require('./v1998_lib.js');
const { F, check } = L;
const card = F('t2GrpCard'), tee = F('t2GrpTeeLabel'), html = F('t2GrpPlayersHtml');
const flat = (n, k) => Array(n).fill(k);
const g = L.mkRound('GC1', [{ name: 'Steve Miller', hcp: 5, scores: flat(18, 4).map((v, i) => i < 5 ? 5 : 4) }, { name: 'Tyler OConnor', hcp: 2, scores: flat(18, 4) }, { name: 'Rolo Castillo-Hernandez Jr', hcp: 18, scores: flat(18, 5) }], { t2: true });
const c = card(g);
check('gross per player from the card, in card order', c && c.rows.map(r => r.name.split(' ')[0] + ':' + r.gross + ':' + r.thru).join(',') === 'Steve:77:18,Tyler:72:18,Rolo:90:18', JSON.stringify(c));
check('no card yet -> null', card(null) === null && card({ players: [] }) === null);
const fin = { finished: true, memberNames: g.players.map(p => p.name), card: c, teeTime: '' };
let h = html(fin);
check('one row per player with the gross on the right', (h.match(/border-top:1px solid/g) || []).length === 3 && />77</.test(h) && />72</.test(h) && />90</.test(h) && /Gross/.test(h), h.slice(0, 300));
// v2050: net beside gross. par-72 card of 4s, SI 1..18: Steve hcp 5 -> 77-5 = 72 ; Tyler hcp 2 -> 70 ; Rolo hcp 18 -> 72
check('v2050 net per player from the card', c.rows.map(r => r.net).join(',') === '72,70,72', JSON.stringify(c.rows));
check('v2050 header Net | Gross and both numbers on each row', />Net</.test(h) && />Gross</.test(h) && />70</.test(h) && (h.match(/flex:0 0 44px/g) || []).length === 8, h.slice(0, 400));
check('long names are trimmed with an ellipsis, the score never wraps', /text-overflow:ellipsis/.test(h) && /min-width:0/.test(h) && /white-space:nowrap/.test(h) && !/<button/.test(h));
check('finished group: no "thru"', !/thru/.test(h));
// live: 9 holes in
const live = L.mkRound('GC2', [{ name: 'Chris Curry', hcp: 18, scores: flat(9, 5).concat(flat(9, null)) }, { name: 'Fred Hall', hcp: 8, scores: flat(18, null) }], { t2: true, unfinished: true });
const lc = card(live); h = html({ finished: false, memberNames: ['Chris Curry', 'Fred Hall'], card: lc });
check('live group: "thru 9" beside the name, 45 gross, a player with no score shows dashes', /thru 9/.test(h) && />45</.test(h) && (h.match(/—/g) || []).length === 2, h.slice(0, 600));
// nobody has scored (or a scramble with no individual scores): the plain names line, as before
const none = L.mkRound('GC3', [{ name: 'A B', hcp: 1, scores: flat(18, null) }, { name: 'C D', hcp: 1, scores: flat(18, null) }], { t2: true, unfinished: true });
h = html({ finished: false, memberNames: ['A B', 'C D'], card: card(none) });
check('no scores yet: the names line, unchanged', /A B · C D/.test(h) && !/Gross/.test(h), h);
check('no card at all: the names line', /A B · C D/.test(html({ memberNames: ['A B', 'C D'], card: null })));
check('nothing to show: empty', html({ memberNames: [], card: null }) === '');
// tee time
check('a set tee time wins', tee({ teeTime: '8:10 AM', card: c }) === '⏱ 8:10 AM');
const t2 = tee({ teeTime: '', card: { startedAt: new Date(2026, 10, 18, 12, 50).getTime() } });
check('no tee time set: the time the card was opened', /^⏱ teed off 12:50/.test(t2), t2);
check('not started and no tee time: nothing', tee({ teeTime: '', card: null }) === '');
// nine-hole card counts nine
const nine = L.mkRound('GC4', [{ name: 'N One', hcp: 4, scores: flat(9, 4) }], { t2: true, holes: 9 });
check('nine-hole card: 36, thru 9, nH 9', (() => { const x = card(nine); return x && x.nH === 9 && x.rows[0].gross === 36 && x.rows[0].thru === 9; })());
L.done('qa_v2048_group_card_gross_teetime');
