// v2009 C3b fix tests: league standings table, week boards, bracket card, finalize prompt, public page,
// "Where everyone stands". Feeds REAL server output (server_dump.jsonl, produced by run_server_dump.sh on the
// local DB with S1 applied) into the app's own renderers through the qa/app.js loader.
//   node qa/league_v2009/fix_tests/C3b/c3b_display.js [golf-app.html]
// Run it against the pre-fix build to see the defects fail.
'use strict';
const path = require('path'), fs = require('fs');
const { loadApp } = require(path.join(__dirname, '..', '..', '..', 'app.js'));
const HTML = process.argv[2] || path.join(__dirname, '..', '..', '..', '..', 'golf-app.html');
const { qa, ctx } = loadApp(HTML);
const F = n => qa.fn(n);
const DUMP = {}; fs.readFileSync(path.join(__dirname, 'server_dump.jsonl'), 'utf8').split('\n').filter(Boolean).forEach(l => { const d = JSON.parse(l); DUMP[d.case] = d; });
let PASS = 0, FAIL = 0; const FAILS = []; const COV = {};
function check(id, label, ok, detail) {
  COV[id] = COV[id] || { n: 0, f: 0 }; COV[id].n++;
  if (ok) PASS++; else { FAIL++; COV[id].f++; FAILS.push('[' + id + '] ' + label + (detail ? '\n    ' + detail : '')); }
}
const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#39;|&rsquo;|’/g, "'").replace(/\s+/g, ' ');
const orderIn = (t, names) => names.filter(n => t.indexOf(n) >= 0).sort((a, b) => t.indexOf(a) - t.indexOf(b));
const PARS = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4];
const NETS = { Ann: [3,4,5,3,4,4,4,2,4,4,4,3,4,5,4,5,6,8], Bob: [4,5,5,4,5,4,4,4,4,4,3,3,5,6,3,4,3,3],
               Cal: [4,5,6,3,5,3,4,3,4,4,4,3,5,5,4,5,3,3], Dee: [4,4,4,3,4,3,4,3,3,4,4,3,4,5,4,11,3,3] };
const tot = a => a.reduce((x, y) => x + y, 0);

function makeSupa(DB, RPC, LOG) {
  function q(table) {
    const f = [];
    const run = () => { let rows = (DB[table] || []).slice(); f.forEach(([c, v, op]) => { rows = rows.filter(r => op === 'in' ? v.indexOf(r[c]) >= 0 : r[c] === v); }); return rows; };
    const b = { select() { return b; }, order() { return b; }, limit() { return b; }, range() { return b; }, neq() { return b; }, is() { return b; }, or() { return b; },
      gte() { return b; }, lte() { return b; }, not() { return b; }, update() { return b; }, insert() { return b; }, upsert() { return b; }, delete() { return b; },
      eq(c, v) { f.push([c, v, 'eq']); return b; }, in(c, v) { f.push([c, v, 'in']); return b; },
      maybeSingle() { return Promise.resolve({ data: run()[0] || null, error: null }); }, single() { return Promise.resolve({ data: run()[0] || null, error: null }); },
      then(res, rej) { return Promise.resolve({ data: run(), error: null }).then(res, rej); } };
    return b;
  }
  return { from: q, rpc: (n, a) => { if (LOG) LOG.push(n); return Promise.resolve(RPC[n] ? RPC[n](a) : { data: null, error: null }); },
           channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} };
}
function install(DB, RPC, me) {
  qa.install({ supa: makeSupa(DB, RPC), onSave: () => {}, loadGame: () => null, roster: () => [], meName: () => 'Me' });
  F("(_authUser = { id: '" + (me || 'u0') + "', email: 'qa@x' }, 1)");
}
async function render(fn, args) {
  const body = { innerHTML: '', style: {}, firstChild: null, parentElement: null, querySelector: () => null, querySelectorAll: () => [] };
  const og = ctx.document.getElementById;
  ctx.document.getElementById = id => id === 'league-body' ? body : og(id);
  try { await Promise.race([F(fn).apply(null, args), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 8000))]); } catch (e) { body.innerHTML += '\n<!--ERR ' + e.message + '-->'; }
  ctx.document.getElementById = og;
  return body.innerHTML;
}
// a field season fixture built from a server-dump case (A or B)
function fieldFixture(kind, opts) {
  opts = opts || {};
  const D = DUMP[kind === 'stableford' ? 'A_stableford' : 'B_to_par'];
  const settings = kind === 'stableford'
    ? { type: 'individual', format: 'stableford', competition_mode: 'field', points: { system: 'stableford', season_race: 'points', stableford_table: { eagle: 5, birdie: 4, par: 3, bogey: 2, double: 1, worse: 0 } } }
    : { type: 'individual', format: 'stroke_net', competition_mode: 'field', points: { system: 'net_stroke', season_race: 'to_par_total' } };
  const names = Object.keys(NETS); const mid = n => 'm-' + n, mu = n => 'mu-' + n;
  const rows = D.standings.filter(r => r.name !== 'P00').map(r => Object.assign({}, r, { entrant_id: mid(r.name) }));
  const byNm = {}; D.matchups.forEach(m => { byNm[m.name] = m; });
  const final = opts.open ? false : true;
  const week = { id: 'w1', season_id: 's1', week_number: 1, status: final ? 'final' : 'open', is_playoff: false, format_config: {}, date: '2026-10-01', nine: 'full18',
    course_snapshot: { holes: 18, pars: PARS, name: 'QA Course' }, settings_snapshot: settings, course_id: null };
  const DB = {
    league_seasons: [{ id: 's1', settings, public_standings: false, status: final ? 'active' : 'active', name: 'QA', leagues: { name: 'QA league' } }],
    league_weeks: [week],
    league_matchups: names.map(n => ({ id: mu(n), week_id: 'w1', kind: 'vs_field', entrant_kind: 'member', a_entrant_id: mid(n), b_entrant_id: null,
      status: final ? byNm[n].status : 'scheduled', a_points: final ? byNm[n].a_points : null, b_points: null, result_json: final ? byNm[n].result_json : {} })),
    league_cards: names.map(n => ({ id: 'c-' + n, matchup_id: mu(n), member_id: mid(n), entrant_id: mid(n), gross: NETS[n], net: NETS[n], approved_at: '2026-10-01',
      net_to_par: tot(NETS[n]) - tot(PARS), handicap_used: 0, posted_at: '2026-10-01', course_name: null, course_pars: null, disputed_by: null, dispute_note: null,
      source: 'solo_post', auto_approved: true, witness_count: 0, posted_by: 'u0' })),
    league_absences: [], league_handicaps: [],
  };
  const roster = names.map(n => ({ id: mid(n), display_name: n, status: 'active', role: 'player', user_id: n === 'Ann' ? 'u0' : null })).concat([{ id: 'm-com', display_name: 'Com', status: 'active', role: 'commissioner', user_id: 'uc' }]);
  const RPC = { league_standings_get: a => ({ data: (a && a.p_segment === 'playoff') ? [] : (final ? rows : []), error: null }), league_roster: () => ({ data: roster, error: null }),
    league_teams_get: () => ({ data: [], error: null }), league_money_ledger: () => ({ data: { lines: [] }, error: null }) };
  return { DB, RPC, rows, D, week };
}
function boardSection(html) {
  const si = html.indexOf('id="lg-scf"'); if (si < 0) return '';
  const s = html.slice(si); const e = s.indexOf('</details>');
  return s.slice(0, e > 0 ? e : s.length);
}

(async () => {
  await new Promise(r => setTimeout(r, 4000));   // let the app finish booting

  // ================= SCORING-5: field "Scorecards by week" board =================
  {
    const fx = fieldFixture('stableford'); install(fx.DB, fx.RPC);
    const html = await render('lgOpenStandings', ['s1']); const sec = strip(boardSection(html));
    const order = orderIn(sec.slice(sec.indexOf('Week 1')), ['Dee', 'Bob', 'Cal', 'Ann']);
    check('SCORING-5', 'Stableford final week: board rows in the server order Dee, Bob, Cal, Ann (Stableford high-good, card-off split)', JSON.stringify(order) === '["Dee","Bob","Cal","Ann"]', 'shown ' + order);
    check('SCORING-5', 'Stableford: header names ONLY the server winner (Dee), with points', /High: Dee 55 pts/.test(sec) && !/Low: /.test(sec), 'header: ' + (sec.match(/(High|Low|Leading)[^·]*/) || [''])[0]);
    check('SCORING-5', 'Stableford: no "T" rank when the server separated the players', !/\bT\d\b/.test(sec), sec.match(/\bT\d\b/g));
    check('SCORING-5', 'Stableford: the board shows the Stableford points (55 pts / 52 pts / 52 pts / 50 pts)', /Dee[^]*?55 pts/.test(sec) && /Bob[^]*?52 pts/.test(sec) && /Ann[^]*?50 pts/.test(sec), sec.slice(0, 300));
    check('SCORING-5', 'Stableford: help text says ranked on Stableford points, highest first', /Stableford points, highest first/.test(strip(html)));
    // same cards, the week still OPEN (no server result): provisional, Stableford high-good, Bob/Cal genuinely tied
    const fo = fieldFixture('stableford', { open: true }); install(fo.DB, fo.RPC);
    const ho = await render('lgOpenStandings', ['s1']); const so = strip(boardSection(ho));
    const oo = orderIn(so.slice(so.indexOf('Week 1')), ['Dee', 'Bob', 'Cal', 'Ann']);
    check('SCORING-5', 'Stableford OPEN week: provisional order is points high first (Dee first, Ann last)', oo[0] === 'Dee' && oo[3] === 'Ann', 'shown ' + oo);
    check('SCORING-5', 'Stableford OPEN week: header reads "Leading", never "Low:"', /Leading · High: Dee 55 pts/.test(so) && !/Low: /.test(so), (so.match(/(Leading|Low|High)[^·]*·?[^·]*/) || [''])[0]);
    check('SCORING-5', 'Stableford OPEN week: the real points tie (Bob 52 / Cal 52) shows T2 twice', (so.match(/\bT2\b/g) || []).length === 2, so.match(/\bT\d\b/g));

    const ft = fieldFixture('to_par'); install(ft.DB, ft.RPC);
    const ht = await render('lgOpenStandings', ['s1']); const st = strip(boardSection(ht));
    const ot = orderIn(st.slice(st.indexOf('Week 1')), ['Dee', 'Bob', 'Cal', 'Ann']);
    check('SCORING-5', 'to-par final week: board rows in the server order Bob, Cal, Dee (card-off), Ann', JSON.stringify(ot) === '["Bob","Cal","Dee","Ann"]', 'shown ' + ot);
    check('SCORING-5', 'to-par: header "Low: Bob +2" only (server split the +2 tie on card-off)', /Low: Bob \+2/.test(st) && !/Low: Bob, /.test(st), (st.match(/Low:[^·]*/) || [''])[0]);
    check('SCORING-5', 'to-par: no T1 x3 when the server separated them', !/\bT1\b/.test(st), st.match(/\bT\d\b/g));
    // table still in server order with the right big number (regression guard)
    const tbl = strip(ht.slice(ht.indexOf('Table'), ht.indexOf('Scorecards by week')));
    check('SCORING-5', 'standings table (to-par) unchanged: server order and +2/+5', JSON.stringify(orderIn(tbl, ['Bob', 'Cal', 'Dee', 'Ann'])) === '["Bob","Cal","Dee","Ann"]' && /Ann[^]*\+5/.test(tbl));
    const ts = strip(html.slice(html.indexOf('Table'), html.indexOf('Scorecards by week')));
    check('SCORING-5', 'standings table (Stableford points race) unchanged: server order Dee, Bob, Cal, Ann', JSON.stringify(orderIn(ts, ['Dee', 'Bob', 'Cal', 'Ann'])) === '["Dee","Bob","Cal","Ann"]');
  }

  // ================= SCORING-6: public page =================
  {
    const pub = DUMP.B2_public_to_par.public;
    const h = strip(F('lgPublicBoardHtml')(pub));
    check('SCORING-6', 'public page, to-par race: leader shows E (the to-par total), not a percentage', /P01[^]*?\bE\b/.test(h) && !/P01[^%]*?\d+%/.test(h.slice(h.indexOf('P01'), h.indexOf('P02'))), h.slice(h.indexOf('P01'), h.indexOf('P01') + 80));
    check('SCORING-6', 'public page, to-par race: P02 shows +36', /P02[^]*?\+36/.test(h), h.slice(h.indexOf('P02'), h.indexOf('P02') + 80));
    check('SCORING-6', 'public page, to-par race: the DQ player shows OUT and the week that took him out', /P03[^]*?OUT/.test(h) && /no card for week 2/.test(h), h.slice(h.indexOf('P03'), h.indexOf('P03') + 120));
    check('SCORING-6', 'public page keeps the server order', JSON.stringify(orderIn(h, ['P01', 'P02', 'P03'])) === '["P01","P02","P03"]');
    const pa = F('lgPublicBoardHtml')({ league: 'Q', season: 'S', through_week: 1, race: 'points', standings: DUMP.A_stableford.standings.filter(r => r.name !== 'P00') });
    check('SCORING-6', 'public page, points race (Stableford) still shows % and points/possible', /Dee[^]*?100%/.test(strip(pa)) && /21\.0 \/ 21\.0|21 \/ 21/.test(strip(pa)), strip(pa).slice(0, 200));
  }

  // ================= OPEN-S5 / OPEN-S4 / D4: bracket card =================
  const C = DUMP.C_bracket;
  function bracketFixture(o) {
    o = o || {};
    const names = C.names; const settings = { type: 'individual', competition_mode: 'head_to_head', playoffs: { enabled: true, qualifiers: 4 }, money: o.money || {} };
    const weeks = C.weeks.map(w => Object.assign({ season_id: 's1', date: null, nine: 'full18', course_snapshot: { holes: 18, pars: PARS }, settings_snapshot: settings }, w));
    let mus = C.matchups.map(m => Object.assign({}, m, { result_json: Object.assign({}, m.result_json) }));
    if (o.mutate) mus = o.mutate(mus);
    const roster = Object.keys(names).map(id => ({ id, display_name: names[id], status: 'active', role: names[id] === 'P00' ? 'commissioner' : 'player', user_id: names[id] === 'P00' ? 'u0' : 'x' + id }));
    const full = C.full.filter(r => r.name !== 'P00').map((r, i) => Object.assign({}, r, { rank: i + 1 }));
    const DB = { league_seasons: [{ id: 's1', settings, public_standings: false, status: o.status || C.season_status }], league_weeks: weeks, league_matchups: mus.map(m => Object.assign({ week_id: m.week_id }, m)),
      league_cards: [], league_absences: [], league_handicaps: [] };
    const RPC = { league_standings_get: a => ({ data: (a && a.p_segment === 'playoff') ? (o.noPlacings ? [] : C.playoff) : full, error: null }),
      league_roster: () => ({ data: roster, error: null }), league_teams_get: () => ({ data: [], error: null }), league_money_ledger: () => ({ data: { lines: [] }, error: null }) };
    return { DB, RPC, names, mus };
  }
  {
    const fx = bracketFixture(); install(fx.DB, fx.RPC);
    const html = strip(await render('lgOpenStandings', ['s1']));
    const po = html.slice(html.indexOf('Playoffs'), html.indexOf('Scorecards by week') > 0 ? html.indexOf('Scorecards by week') : html.length);
    check('OPEN-S5', 'tied final (10.5-10.5) reads "P02 won as the higher seed", never "tied"', /P02 won as the higher seed/.test(po) && !/\btied\b/.test(po), po.slice(0, 400));
    check('OPEN-S5', 'semi decided on points reads "P04 won"', /P04 won · 8\.5–12\.5/.test(po), po.slice(0, 400));
    check('OPEN-S4', 'the champion is the server\'s (P02) even though the final is level on points', /🏆 P02/.test(po) && /P02 are the champions/.test(po), po.slice(0, 200));
    // net: the server says decided on net
    const fn = bracketFixture({ mutate: ms => ms.map(m => (m.a_points === m.b_points) ? Object.assign(m, { result_json: Object.assign(m.result_json, { bracket_decided_by: 'net', bracket_winner: m.a_entrant_id }) }) : m), noPlacings: true });
    install(fn.DB, fn.RPC);
    const hn = strip(await render('lgOpenStandings', ['s1']));
    check('OPEN-S5', 'a final level on points decided on net reads "P04 won on net"', /P04 won on net/.test(hn), hn.slice(hn.indexOf('Playoffs'), hn.indexOf('Playoffs') + 400));
    check('OPEN-S4', 'no placings yet: champion falls back to the final\'s bracket record (P04), not blank', /🏆 P04/.test(hn));
    // bye
    const fb = bracketFixture({ mutate: ms => ms.concat([{ id: 'bye1', week_id: ms[0].week_id, kind: 'bye', status: 'final', a_entrant_id: Object.keys(C.names).filter(k => C.names[k] === 'P01')[0], b_entrant_id: null, a_points: null, b_points: null, result_json: { bracket_decided_by: 'bye' } }]) });
    install(fb.DB, fb.RPC);
    const hb = strip(await render('lgOpenStandings', ['s1']));
    check('OPEN-S5', 'a bye in the bracket reads "P01 has a bye — straight through"', /P01 has a bye — straight through/.test(hb), hb.slice(hb.indexOf('Playoffs'), hb.indexOf('Playoffs') + 600));
    // h2h "Scorecards by week" on the standings screen, playoff week, tied final
    check('OPEN-S5', 'standings "Scorecards by week": the playoff final says won as the higher seed, not Halved', /P02 won as the higher seed/.test(html.slice(html.indexOf('Scorecards by week'))) && !/Halved/.test(html.slice(html.indexOf('Scorecards by week'))), html.slice(html.indexOf('Scorecards by week'), html.indexOf('Scorecards by week') + 500));
    // week screen Matches card for the final
    const finW = C.weeks[C.weeks.length - 1];
    install(fx.DB, fx.RPC);
    const hw = strip(await render('lgOpenWeek', ['s1', finW.id]));
    check('OPEN-S5', 'week screen Matches card: the tied final reads "P02 won as the higher seed"', /P02 won as the higher seed/.test(hw) && !/Halved/.test(hw), hw.slice(hw.indexOf('Matches'), hw.indexOf('Matches') + 300));
    // public page champion
    const hp = strip(F('lgPublicBoardHtml')(C.public));
    check('OPEN-S4', 'public page names the playoff champion (P02) and runner-up (P04)', /🏆 P02/.test(hp) && /runner-up P04/.test(hp), hp.slice(0, 300));
  }
  // D4: season prize pool pending until the final; then the bracket placings
  {
    const money = { buyin: 10, payout: 'winner_take_all' };
    const fp = bracketFixture({ money, noPlacings: true, status: 'playoffs' }); install(fp.DB, fp.RPC);
    const h = strip(await render('lgOpenStandings', ['s1']));
    check('D4', 'playoffs on, final not played: "Season prize pool — pending", nothing paid off the table', /Season prize pool — pending/.test(h) && !/If the season ended today/.test(h), h.slice(h.indexOf('prize pool') - 40, h.indexOf('prize pool') + 300));
    const fd = bracketFixture({ money }); install(fd.DB, fd.RPC);
    const h2 = strip(await render('lgOpenStandings', ['s1']));
    const pc = h2.slice(h2.indexOf('Season prize pool'));
    check('D4', 'after the final: the pool goes to the bracket champion P02 (winner takes all), not the regular-season rank 1', /Season prize pool — final[^]*?1 P02/.test(pc) && !/1 P01 /.test(pc.slice(0, 400)), pc.slice(0, 300));
  }

  // ================= D15: best N of M =================
  {
    const D = DUMP.D_best_n;
    const rows = D.standings.filter(r => r.name !== 'P00').map(r => Object.assign({}, r, { entrant_id: 'm-' + r.name }));
    const settings = { type: 'individual', competition_mode: 'field', points: { system: 'net_stroke', season_race: 'points', count_best_n_weeks: 2 } };
    const weeks = [1, 2, 3].map(n => ({ id: 'w' + n, season_id: 's1', week_number: n, status: 'final', is_playoff: false, format_config: {}, nine: 'full18', date: null, course_snapshot: { holes: 18, pars: PARS }, settings_snapshot: settings }));
    const mus = [], cards = [];
    weeks.forEach(w => ['P01', 'P02', 'P03'].forEach((p, j) => {
      const pos = w.week_number < 3 ? j + 1 : 3 - j;
      mus.push({ id: w.id + p, week_id: w.id, kind: 'vs_field', entrant_kind: 'member', a_entrant_id: 'm-' + p, b_entrant_id: null, status: 'final', a_points: 21 * (4 - pos) / 3, result_json: { position: pos } });
      cards.push({ id: 'c' + w.id + p, matchup_id: w.id + p, member_id: 'm-' + p, entrant_id: 'm-' + p, gross: PARS.map(x => x + (pos - 1)), net: PARS.map(x => x + (pos - 1)), approved_at: 'x', net_to_par: 18 * (pos - 1) });
    }));
    const roster = ['P01', 'P02', 'P03'].map(p => ({ id: 'm-' + p, display_name: p, status: 'active', role: 'player', user_id: 'x' + p })).concat([{ id: 'm-c', display_name: 'Com', role: 'commissioner', status: 'active', user_id: 'u0' }]);
    install({ league_seasons: [{ id: 's1', settings, status: 'active' }], league_weeks: weeks, league_matchups: mus, league_cards: cards },
      { league_standings_get: a => ({ data: a.p_segment === 'playoff' ? [] : rows, error: null }), league_roster: () => ({ data: roster, error: null }), league_teams_get: () => ({ data: [], error: null }), league_money_ledger: () => ({ data: { lines: [] }, error: null }) });
    const html = await render('lgOpenStandings', ['s1']); const t = strip(html);
    check('D15', 'table says "Best 2 of 3 weeks counting"', /Best 2 of 3 weeks counting/.test(t), t.slice(0, 400));
    const p01 = rows.filter(r => r.name === 'P01')[0];
    check('D15', 'table row names the week P01 is not counting (server dropped_weeks ' + JSON.stringify(p01.dropped_weeks) + ')', new RegExp('P01[^]*?Not counted: week ' + p01.dropped_weeks[0]).test(t), t.slice(t.indexOf('P01'), t.indexOf('P01') + 160));
    const wk3 = html.slice(html.indexOf('data-newest="1"'));
    const p01row = (wk3.match(/<div class="lg-sc-row lg-scf-row[^"]*" data-ents="m-P01">[^]*?<\/div><\/div>/) || [''])[0];
    check('D15', 'week-by-week: P01\'s dropped week 3 row is greyed (class) AND tagged "not counted"', /lg-scf-row--dropped/.test(p01row) && /not counted/.test(p01row), p01row.slice(0, 200));
    const w1 = html.slice(html.indexOf('lg-scf-week'), html.indexOf('</details>'));
    check('D15', 'a counted week carries no "not counted" tag', !/not counted/.test(w1.split('data-ents="m-P01"')[1] ? w1.split('data-ents="m-P01"')[1].slice(0, 600) : 'x'));
  }

  // ================= D12: disputed final week = reopen requested =================
  {
    const fx = fieldFixture('to_par');
    fx.DB.league_cards[1].disputed_by = 'ux'; fx.DB.league_cards[1].dispute_note = 'hole 7 should be a 5';
    fx.DB.league_seasons[0].settings = fx.week.settings_snapshot;
    const ros = fx.RPC.league_roster().data.map(m => Object.assign({}, m, { user_id: m.role === 'commissioner' ? 'u0' : (m.display_name === 'Bob' ? 'ub' : null) }));
    fx.RPC.league_roster = () => ({ data: ros, error: null });
    install(fx.DB, fx.RPC, 'u0');
    const hw = strip(await render('lgOpenWeek', ['s1', 'w1']));
    check('D12', 'week screen header: "reopen requested" pill on a final week with a disputed card', /final reopen requested/.test(hw), hw.slice(0, 200));
    if (process.env.C3B_DEBUG) console.log('DBGD12', JSON.stringify(hw.slice(0, 1800)));
    check('D12', 'commissioner card: names the query and says results stand until he reopens', /reopen requested A query on Bob's card: “hole 7 should be a 5”\. The results stand until you reopen the week\./.test(hw), hw.slice(hw.indexOf('Commissioner'), hw.indexOf('Commissioner') + 300));
    install(fx.DB, fx.RPC, 'ub');
    const hb = strip(await render('lgOpenWeek', ['s1', 'w1']));
    check('D12', 'the disputing player\'s own card reads "Reopen requested — the results stand…"', /Reopen requested — the results stand until the commissioner reopens the week/.test(hb) || !/Your card/.test(hb), hb.slice(hb.indexOf('Your card'), hb.indexOf('Your card') + 160));
    install(fx.DB, fx.RPC, 'u0');
    const hs = strip(await render('lgOpenStandings', ['s1']));
    const bd = hs.slice(hs.indexOf('Scorecards by week'));
    check('D12', 'standings week board: the week reads "reopen requested", and the card is tagged so', (bd.match(/reopen requested/g) || []).length >= 2 && !/disputed/.test(bd), bd.slice(0, 300));
    // an OPEN week dispute stays a dispute
    const fo = fieldFixture('to_par', { open: true }); fo.DB.league_cards[1].disputed_by = 'ux'; install(fo.DB, fo.RPC, 'u0');
    const ho = strip(await render('lgOpenStandings', ['s1']));
    check('D12', 'an OPEN week\'s dispute still reads "disputed" (not a reopen request)', /disputed/.test(ho) && !/reopen requested/.test(ho));
  }

  // ================= LIFE-13: finalize "who is missing" per entrant / seat =================
  async function weekMissing(o) {
    const w = { id: 'w1', season_id: 's1', week_number: 2, status: 'open', is_playoff: false, format_config: {}, nine: 'full18', course_id: null, date: null,
      settings_snapshot: Object.assign({ play: { self_scheduled: true } }, o.set || {}), course_snapshot: { holes: 18, pars: PARS } };
    const DB = { league_seasons: [{ id: 's1', settings: w.settings_snapshot }], league_weeks: [w], league_matchups: o.mus, league_cards: o.cards, league_absences: o.abs || [], league_handicaps: [] };
    const RPC = { league_roster: () => ({ data: o.roster, error: null }), league_teams_get: () => ({ data: o.teams || [], error: null }), league_standings_get: () => ({ data: [], error: null }) };
    install(DB, RPC, 'u0');
    F('(window._lgWeekMissing = null, 1)');
    const html = await render('lgOpenWeek', ['s1', 'w1']);
    let conf = null;
    F("(uiConfirm = async function (m, o) { window.__c3bConf = { m: m, o: o }; return false; }, 1)");
    F('(window.__c3bConf = null, 1)');
    try { await F('lgFinalizeWeek')('w1', 2); } catch (e) {}
    conf = F('window.__c3bConf');
    return { miss: (F('window._lgWeekMissing') || {}).names || [], conf, html: strip(html) };
  }
  const com = { id: 'mc', display_name: 'Com', status: 'active', role: 'commissioner', user_id: 'u0', team_id: null };
  {
    // team best ball: T1 = Al + Bo (Al posted, Bo did not), T2 = Cy + Di (both posted)
    const roster = [com, { id: 'ma', display_name: 'Al', status: 'active', role: 'player', team_id: 'T1' }, { id: 'mb', display_name: 'Bo', status: 'active', role: 'player', team_id: 'T1' },
                    { id: 'mcy', display_name: 'Cy', status: 'active', role: 'player', team_id: 'T2' }, { id: 'md', display_name: 'Di', status: 'active', role: 'player', team_id: 'T2' }];
    const mus = [{ id: 'mu1', week_id: 'w1', kind: 'match', entrant_kind: 'team', a_entrant_id: 'T1', b_entrant_id: 'T2', status: 'live' }];
    const card = (mid, ent, s) => ({ id: 'c' + mid, matchup_id: 'mu1', member_id: mid, entrant_id: ent, slot: s, gross: PARS, net: PARS, approved_at: 'x', posted_by: 'u0' });
    const r = await weekMissing({ roster, mus, cards: [card('ma', 'T1', 1), card('mcy', 'T2', 3), card('md', 'T2', 4)], teams: [{ team_id: 'T1', name: 'Putt Pirates' }, { team_id: 'T2', name: 'Fairway to Heaven' }], set: { type: 'team_2man', team_rule: 'bestball' } });
    check('LIFE-13', 'team best ball: the partner with no card (Bo, Putt Pirates) is listed', r.miss.length === 1 && /Bo/.test(r.miss[0]) && /Putt Pirates/.test(r.miss[0]), JSON.stringify(r.miss));
    check('LIFE-13', 'team best ball: the finalize prompt names him (not the plain "Finalize week 2?")', !!(r.conf && /Bo/.test(r.conf.m) && /missing a score/.test(r.conf.m)), r.conf && r.conf.m);
    check('LIFE-13', 'team best ball: the prompt says the team plays on the partner card (D5), not "0 points"', !!(r.conf && /plays on the partner/.test(r.conf.m) && !/0 points/.test(r.conf.m)), r.conf && r.conf.m);
    // scramble: one card per team; T2 posted nothing
    const r2 = await weekMissing({ roster, mus, cards: [card('ma', 'T1', 1)], teams: [{ team_id: 'T1', name: 'Putt Pirates' }, { team_id: 'T2', name: 'Fairway to Heaven' }], set: { type: 'team_2man', format: 'scramble' } });
    check('LIFE-13', 'scramble team with no card: the TEAM is listed once (Fairway to Heaven)', r2.miss.length === 1 && /Fairway to Heaven/.test(r2.miss[0]), JSON.stringify(r2.miss));
    check('LIFE-13', 'scramble: the prompt names the team', !!(r2.conf && /Fairway to Heaven/.test(r2.conf.m)), r2.conf && r2.conf.m);
  }
  {
    // individual h2h: Al's seat is held by sub Sam who posted; Bo's seat assigned to sub Sid who has not posted; Cy posted; Di nothing
    const roster = [com, { id: 'ma', display_name: 'Al', status: 'active', role: 'player' }, { id: 'mb', display_name: 'Bo', status: 'active', role: 'player' },
                    { id: 'mcy', display_name: 'Cy', status: 'active', role: 'player' }, { id: 'md', display_name: 'Di', status: 'active', role: 'player' },
                    { id: 'ms', display_name: 'Sam', status: 'active', role: 'sub' }, { id: 'msd', display_name: 'Sid', status: 'active', role: 'sub' }];
    const mus = [{ id: 'mu1', week_id: 'w1', kind: 'match', entrant_kind: 'member', a_entrant_id: 'ma', b_entrant_id: 'mb', status: 'live' },
                 { id: 'mu2', week_id: 'w1', kind: 'match', entrant_kind: 'member', a_entrant_id: 'mcy', b_entrant_id: 'md', status: 'live' }];
    const abs = [{ id: 'a1', matchup_id: 'mu1', member_id: 'ma', resolution: 'sub', claim_status: 'claimed', sub_member_id: 'ms', current_member_id: 'ms' },
                 { id: 'a2', matchup_id: 'mu1', member_id: 'mb', resolution: 'sub', claim_status: 'claimed', sub_member_id: 'msd', current_member_id: 'msd' }];
    const cards = [{ id: 'c1', matchup_id: 'mu1', member_id: 'ms', entrant_id: 'ma', gross: PARS, net: PARS, approved_at: 'x', posted_by: 'u0' },
                   { id: 'c2', matchup_id: 'mu2', member_id: 'mcy', entrant_id: 'mcy', gross: PARS, net: PARS, approved_at: 'x', posted_by: 'u0' }];
    const r = await weekMissing({ roster, mus, cards, abs, set: { type: 'individual' } });
    check('LIFE-13', 'sub-held seat whose sub posted (Al / Sam) is NOT listed as missing', !r.miss.some(n => /\bAl\b/.test(n) && !/Bo/.test(n)), JSON.stringify(r.miss));
    check('LIFE-13', 'sub-held seat with no card is listed as the sub (Sid, sub for Bo)', r.miss.some(n => /Sid \(sub for Bo\)/.test(n)), JSON.stringify(r.miss));
    check('LIFE-13', 'a plain missing player (Di) is listed', r.miss.some(n => n === 'Di'), JSON.stringify(r.miss));
    check('LIFE-13', 'nobody else is listed (exactly 2)', r.miss.length === 2, JSON.stringify(r.miss));
    check('LIFE-13', 'the "No card yet" card offers the card actions for the SUB holding the seat', /Sid \(sub for Bo\)[^]*?Pick a round/.test(r.html), r.html.slice(r.html.indexOf('No card yet'), r.html.indexOf('No card yet') + 300));
    // forfeit-resolved seat is not "missing"
    const r3 = await weekMissing({ roster, mus, cards, abs: [abs[0], Object.assign({}, abs[1], { resolution: 'forfeit', current_member_id: null, sub_member_id: null })], set: { type: 'individual' } });
    check('LIFE-13', 'a seat the commissioner already settled (forfeit) is not listed', !r3.miss.some(n => /Bo/.test(n)) && r3.miss.length === 1, JSON.stringify(r3.miss));
  }

  // ================= POOLS-9: Where everyone stands = Unit Totals =================
  for (const k of Object.keys(DUMP).filter(k => k.startsWith('E_hold_'))) {
    const d = DUMP[k]; const led = d.ledger, set = d.settle;
    const DB = { league_seasons: [{ id: 's1', settings: { money: {} }, leagues: { name: 'QA' } }] };
    install(DB, { league_money_ledger: () => ({ data: Object.assign({}, led, { is_commissioner: true }), error: null }), league_money_settle: () => ({ data: set, error: null }) }, 'u0');
    const html = await render('lgOpenMoney', ['s1']);
    const ws = html.slice(html.indexOf('Where everyone stands')); const we = ws.indexOf('class="card"', 10);
    const sec = we > 0 ? ws.slice(0, we) : ws; if (process.env.C3B_DEBUG) console.log('DBG', k, sec.slice(0, 1500));
    let sum = 0; const shown = {};
    led.members.forEach(m => {
      const i = sec.indexOf('>' + m.name + '<'); const amt = i >= 0 ? sec.slice(i).match(/(?:units|money)[^"]*"[^>]*>([^<]+)</) : null;
      const v = amt ? Number(String(amt[1]).replace(/[^0-9.\-−]/g, '').replace('−', '-')) : NaN; shown[m.name] = v; sum += v;
    });
    // independent oracle: the settle-up's whole figures, member-to-member transfers + what is owed to the league
    const toLeague = Number(set.to_the_league) || 0;
    const tx = {}; led.members.forEach(m => { tx[m.member_id] = 0; });
    (set.transfers || []).forEach(t => { tx[t.from_member] -= Number(t.amount); tx[t.to_member] += Number(t.amount); });
    check('POOLS-9', k + ': the printed members add up to what the league holds (Unit Totals: ' + toLeague + ')', Math.round(sum) === -toLeague, 'members ' + JSON.stringify(shown) + ' sum ' + sum);
    check('POOLS-9', k + ': every printed figure is a whole unit within 1 of the member\'s exact balance', led.members.every(m => Number.isInteger(shown[m.name]) && Math.abs(shown[m.name] - Number(m.net)) < 1), JSON.stringify(shown));
    const hasTx = (set.transfers || []).length > 0;
    if (hasTx) check('POOLS-9', k + ': members who collect from others in Unit Totals are not printed as owing', led.members.every(m => tx[m.member_id] <= 0 || shown[m.name] >= 0), JSON.stringify({ shown, tx }));
    check('POOLS-9', k + ': the league\'s holding is its own row', /The league/.test(sec) === (toLeague !== 0), strip(sec).slice(0, 200));
  }

  // ================= POOLS-9 (S3 R3): settle members[].whole is what is printed =================
  {
    const d = DUMP['E_hold_35100_3x12.5']; const led = d.ledger;
    // S3's league_money_settle shape: members [{member_id, name, balance, whole}], zero-sum with to_the_league.
    // Deliberately different from the client's own rounding so the test proves the server figure is the one printed.
    const W = [-13, -13, -12, -12];
    const set = Object.assign({}, d.settle, { to_the_league: 50, members: led.members.map((m, i) => ({ member_id: m.member_id, name: m.name, balance: Number(m.net), whole: W[i] })) });
    install({ league_seasons: [{ id: 's1', settings: { money: {} }, leagues: { name: 'QA' } }] },
      { league_money_ledger: () => ({ data: Object.assign({}, led, { is_commissioner: true }), error: null }), league_money_settle: () => ({ data: set, error: null }) }, 'u0');
    const html = await render('lgOpenMoney', ['s1']);
    const sec = strip(html.slice(html.indexOf('Where everyone stands')));
    check('POOLS-9', 'S3 shape: each member prints settle members[].whole', led.members.every((m, i) => new RegExp(m.name + ' [a-z ]*?[−-]?\\$?' + Math.abs(W[i]) + '\\b').test(sec)), sec.slice(0, 300));
    check('POOLS-9', 'S3 shape: the league row prints to_the_league (50)', /The league [^0-9]*50\b/.test(sec), sec.slice(0, 300));
  }

  // ================= POOLS-3 (S3 R5): tied CTP / LP / LD on the week screen =================
  {
    const LOG = [];
    const roster = [{ id: 'mc', display_name: 'Com', status: 'active', role: 'commissioner', user_id: 'u0' }, { id: 'ma', display_name: 'Al', status: 'active', role: 'player' },
                    { id: 'mb', display_name: 'Bo', status: 'active', role: 'player' }, { id: 'mcy', display_name: 'Cy', status: 'active', role: 'player' }];
    const set = { competition_mode: 'field', money: { weekly: { ctp: { on: true, amount: 5 }, longest_putt: { on: true, amount: 5 } } } };
    const w = { id: 'w1', season_id: 's1', week_number: 1, status: 'final', is_playoff: false, format_config: {}, nine: 'full18', course_id: null, date: null, settings_snapshot: set, course_snapshot: { holes: 18, pars: PARS } };
    const DB = { league_seasons: [{ id: 's1', settings: set }], league_weeks: [w], league_matchups: [{ id: 'f1', week_id: 'w1', kind: 'vs_field', entrant_kind: 'member', a_entrant_id: 'ma', status: 'final', result_json: {} }],
      league_cards: [], league_absences: [], league_handicaps: [],
      league_pool_winners: [{ week_id: 'w1', kind: 'ctp', hole: 4, member_id: 'ma', set_by: null, co_member_ids: ['mb'] }, { week_id: 'w1', kind: 'longest_putt', hole: null, member_id: 'mcy', set_by: null, co_member_ids: null }] };
    qa.install({ supa: makeSupa(DB, { league_roster: () => ({ data: roster, error: null }), league_teams_get: () => ({ data: [], error: null }), league_set_pool_winner_tie: a => ({ data: { ok: true, args: a }, error: null }) }, LOG), onSave: () => {}, loadGame: () => null, roster: () => [], meName: () => 'Com' });
    F("(_authUser = { id: 'u0', email: 'qa@x' }, 1)");
    const html = await render('lgOpenWeek', ['s1', 'w1']); const t = strip(html);
    check('POOLS-3', 'a tied CTP reads "tie: Al, Bo"', /Closest to the pin · hole 4 tie: Al, Bo/.test(t), t.slice(t.indexOf('Closest to the pin'), t.indexOf('Closest to the pin') + 120));
    check('POOLS-3', 'a single winner still reads just the name (Cy)', /Longest putt Cy/.test(t));
    check('POOLS-3', 'the commissioner gets the tie picker with both tied players ticked', /It was an exact tie — split it/.test(t) && /value="ma" checked/.test(html) && /value="mb" checked/.test(html));
    // the picker sends league_set_pool_winner_tie with every ticked player
    const og = ctx.document.getElementById;
    const boxes = [{ checked: true, value: 'ma' }, { checked: true, value: 'mcy' }, { checked: false, value: 'mb' }];
    ctx.document.getElementById = id => id === 'lg-tie-ctp-4' ? { querySelectorAll: () => boxes } : og(id);
    let sent = null;
    const sup = makeSupa(DB, { league_set_pool_winner_tie: a => { sent = a; return { data: { ok: true }, error: null }; }, league_roster: () => ({ data: roster, error: null }) }, LOG);
    qa.install({ supa: sup, onSave: () => {}, loadGame: () => null, roster: () => [], meName: () => 'Com' });
    F("(window.__c3bOW = lgOpenWeek, lgOpenWeek = async function () {}, 1)");
    if (typeof F('lgSetPotTie') === 'function') await F('lgSetPotTie')('w1', 'ctp', 4, 'lg-tie-ctp-4');
    F("(lgOpenWeek = window.__c3bOW, 1)");
    ctx.document.getElementById = og;
    check('POOLS-3', 'Save the tie calls league_set_pool_winner_tie(week, ctp, [Al, Cy], hole 4)', !!(sent && sent.p_week_id === 'w1' && sent.p_kind === 'ctp' && sent.p_hole === 4 && JSON.stringify(sent.p_member_ids) === '["ma","mcy"]'), JSON.stringify(sent));
  }

  // ================= P2: week screen "In so far" sorted on the season's measure =================
  {
    const fo = fieldFixture('stableford', { open: true });
    fo.DB.league_cards.forEach(c => { c.net_to_par = tot(c.net) - tot(PARS); });
    install(fo.DB, fo.RPC, 'u0');
    // Stableford open week, no server result: In so far falls back to net to par; with the final result it follows position
    const ff = fieldFixture('stableford'); install(ff.DB, ff.RPC, 'u0');
    const hRaw = await render('lgOpenWeek', ['s1', 'w1']); const h = strip(hRaw); if (process.env.C3B_DEBUG) console.log('DBGRAW', JSON.stringify(hRaw.slice(0, 800)));
    const s = h.slice(h.indexOf('In so far')); if (process.env.C3B_DEBUG) console.log('DBGIN', JSON.stringify(h.slice(0, 1500)));
    check('P2 in-so-far', 'final Stableford week: "In so far" in the server order Dee, Bob, Cal, Ann', JSON.stringify(orderIn(s, ['Dee', 'Bob', 'Cal', 'Ann'])) === '["Dee","Bob","Cal","Ann"]', 'shown ' + orderIn(s, ['Dee', 'Bob', 'Cal', 'Ann']));
  }

  console.log('\nCOVERAGE'); Object.keys(COV).forEach(k => console.log('  ' + k + ' : ' + COV[k].n + ' run / ' + COV[k].f + ' fail'));
  console.log('\nC3b: ' + (PASS + FAIL) + ' checks, ' + PASS + ' passed, ' + FAIL + ' failed (' + path.basename(path.dirname(HTML)) + '/' + path.basename(HTML) + ')');
  FAILS.forEach(f => console.log('FAIL ' + f));
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.log('CRASH', e && e.stack); process.exit(2); });
