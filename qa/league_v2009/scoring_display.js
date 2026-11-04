// SCORING track — client display harness. Feeds REAL server output (captured from league_finalize_week /
// league_standings_get / league_public_standings in a rolled-back transaction on the live project, see
// scoring_sql/E_display_dump.sql) into the app's own renderers and checks that every screen shows the server's
// order and numbers, and that a Stableford league's week board ranks HIGH-good.
// Run: node qa/league_v2009/scoring_display.js golf-app.html
'use strict';
const path = require('path');
const { loadApp } = require(path.join(__dirname, '..', 'app.js'));
const HTML = process.argv[2] || path.join(__dirname, '..', '..', 'golf-app.html');
const { qa, ctx } = loadApp(HTML);
const F = n => qa.fn(n);
let PASS = 0, FAIL = 0; const FAILS = []; const COV = {};
function check(area, axis, label, ok, detail) {
  const k = area + ' | ' + axis; COV[k] = COV[k] || { n: 0, f: 0 }; COV[k].n++;
  if (ok) PASS++; else { FAIL++; COV[k].f++; FAILS.push('[' + k + '] ' + label + (detail ? '\n    ' + detail : '')); }
}
const PARS = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4];
// --- server output, verbatim (week 1 of a 4-player field season; same gross cards in both seasons) ---
const NETS = {
  Ann: [3,4,5,3,4,4,4,2,4,4,4,3,4,5,4,5,6,8],
  Bob: [4,5,5,4,5,4,4,4,4,4,3,3,5,6,3,4,3,3],
  Cal: [4,5,6,3,5,3,4,3,4,4,4,3,5,5,4,5,3,3],
  Dee: [4,4,4,3,4,3,4,3,3,4,4,3,4,5,4,11,3,3],
};
const SERVER = {
  stableford: { race: 'points', order: ['Dee','Bob','Cal','Ann'], pts: { Dee: 21, Bob: 15.75, Cal: 10.5, Ann: 5.25 }, sf: { Dee: 55, Bob: 52, Cal: 52, Ann: 50 },
                ntp: { Ann: 5, Bob: 2, Cal: 2, Dee: 2 }, settings: { type: 'individual', format: 'stableford', competition_mode: 'field',
                points: { system: 'stableford', season_race: 'points', stableford_table: { eagle: 5, birdie: 4, par: 3, bogey: 2, double: 1, worse: 0 } } } },
  to_par_total: { race: 'to_par_total', order: ['Bob','Cal','Dee','Ann'], pts: { Bob: 21, Cal: 15.75, Dee: 10.5, Ann: 5.25 },
                ntp: { Ann: 5, Bob: 2, Cal: 2, Dee: 2 }, settings: { type: 'individual', format: 'stroke_net', competition_mode: 'field',
                points: { system: 'net_stroke', season_race: 'to_par_total' } } },
};
function makeSupa(DB, RPC) {
  function q(table) {
    const f = [];
    const run = () => { let rows = (DB[table] || []).slice(); f.forEach(([c, v, op]) => { rows = rows.filter(r => op === 'in' ? v.indexOf(r[c]) >= 0 : r[c] === v); }); return rows; };
    const b = { select() { return b; }, order() { return b; }, limit() { return b; }, range() { return b; }, neq() { return b; }, is() { return b; }, or() { return b; },
      gte() { return b; }, lte() { return b; }, not() { return b; },
      eq(c, v) { f.push([c, v, 'eq']); return b; }, in(c, v) { f.push([c, v, 'in']); return b; },
      maybeSingle() { return Promise.resolve({ data: run()[0] || null, error: null }); }, single() { return Promise.resolve({ data: run()[0] || null, error: null }); },
      then(res, rej) { return Promise.resolve({ data: run(), error: null }).then(res, rej); } };
    return b;
  }
  return { from: q, rpc: (n, a) => Promise.resolve(RPC[n] ? RPC[n](a) : { data: null, error: null }), channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} };
}
function fixture(kind) {
  const S = SERVER[kind]; const names = Object.keys(NETS);
  const mid = n => 'm-' + n, mu = n => 'mu-' + n;
  const rows = S.order.map((n, i) => ({ rank: i + 1, entrant_id: mid(n), flight: null, name: n, points: S.pts[n], points_possible: 21, pct: Math.round(S.pts[n] / 21 * 10000) / 100,
    decided_by: null, race: S.race, to_par: S.ntp[n], dq: false, dq_week: null, weeks_played: 1, weeks_absent: 0, wins: 0, losses: 0, ties: 0,
    low_net: NETS[n].reduce((a, b) => a + b, 0), computed_through_week: 1 }));
  const week = { id: 'w1', season_id: 's1', week_number: 1, status: 'final', is_playoff: false, format_config: {}, date: '2026-10-01', nine: 'full18',
    course_snapshot: { holes: 18, pars: PARS, name: 'QA Course' }, settings_snapshot: S.settings, course_id: null };
  const DB = {
    league_seasons: [{ id: 's1', settings: S.settings, public_standings: false, status: 'complete', name: 'QA', leagues: { name: 'QA league' } }],
    league_weeks: [week],
    league_matchups: names.map(n => ({ id: mu(n), week_id: 'w1', kind: 'vs_field', entrant_kind: 'member', a_entrant_id: mid(n), b_entrant_id: null, status: 'final',
      a_points: S.pts[n], b_points: null })),
    league_cards: names.map(n => ({ id: 'c-' + n, matchup_id: mu(n), member_id: mid(n), entrant_id: mid(n), gross: NETS[n], net: NETS[n], approved_at: '2026-10-01',
      net_to_par: S.ntp[n], handicap_used: 0, posted_at: '2026-10-01', course_name: null, course_pars: null, disputed_by: null, source: 'solo_post', auto_approved: true, witness_count: 0, posted_by: 'u0' })),
    league_absences: [], league_handicaps: [],
  };
  const roster = names.map(n => ({ id: mid(n), display_name: n, status: 'active', role: 'player', user_id: n === 'Ann' ? 'u0' : null }));
  const RPC = { league_standings_get: () => ({ data: rows, error: null }), league_roster: () => ({ data: roster, error: null }),
    league_teams_get: () => ({ data: [], error: null }), league_money_ledger: () => ({ data: { lines: [] }, error: null }) };
  return { DB, RPC, rows, S };
}
function install(DB, RPC) {
  qa.install({ supa: makeSupa(DB, RPC), onSave: () => {}, loadGame: () => null, roster: () => [], meName: () => 'Ann' });
  F("(_authUser = { id: 'u0', email: 'qa@x' }, 1)");
}
async function render(fn, args, bodyId) {
  const body = { innerHTML: '', style: {}, firstChild: null, parentElement: null, querySelector: () => null, querySelectorAll: () => [] };
  const og = ctx.document.getElementById;
  ctx.document.getElementById = id => id === (bodyId || 'league-body') ? body : og(id);
  try { await Promise.race([F(fn).apply(null, args), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 8000))]); } catch (e) { body.innerHTML += '\n<!--ERR ' + e.message + '-->'; }
  ctx.document.getElementById = og;
  return body.innerHTML;
}
const strip = h => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
function orderIn(text, names) { return names.slice().sort((a, b) => text.indexOf(a) - text.indexOf(b)); }

(async () => {
  for (const kind of (process.env.ORDER === 'rev' ? ['to_par_total', 'stableford'] : ['stableford', 'to_par_total'])) {
    const { DB, RPC, rows, S } = fixture(kind);
    install(DB, RPC);
    const html = await render('lgOpenStandings', ['s1']);
    if (process.env.DUMP) require('fs').writeFileSync('/tmp/claude-0/-home-claude/6d9f79b9-32be-5440-91fe-058204ee9ae2/scratchpad/st_' + kind + '.html', html);
    // 1. the main table: first "Table" card
    const ti = html.indexOf('class="bg-sec">Table'); const te = html.indexOf('</div></div></div>', ti);
    const tbl = strip(html.slice(ti, html.indexOf('Playoffs') > ti ? html.indexOf('Scorecards by week') : html.length));
    const tblOrder = orderIn(strip(html.slice(ti, html.indexOf('Scorecards by week') > ti ? html.indexOf('Scorecards by week') : html.length)), S.order);
    check('display', 'standings table · ' + kind, 'order = server rank', JSON.stringify(tblOrder) === JSON.stringify(S.order), 'shown ' + tblOrder + ' server ' + S.order);
    for (const r of rows) {
      const expect = kind === 'to_par_total' ? ((r.to_par > 0 ? '+' : '') + r.to_par) : (Math.round(r.pct * 10) / 10) + '%';
      check('display', 'standings table · ' + kind, r.name + ' big number = server', tbl.indexOf(r.name) >= 0 && tbl.indexOf(expect, tbl.indexOf(r.name)) >= 0, 'expected ' + expect);
    }
    // 2. "Scorecards by week" (field leaderboard) — rank 1 must be the server's week winner
    const si = html.indexOf('Scorecards by week');
    check('display', 'week board (Scorecards by week) · ' + kind, 'card is drawn', si >= 0);
    if (si >= 0) {
      const sec = html.slice(html.indexOf('lg-scf-sum', si) > 0 ? html.indexOf('lg-scf-sum', si) : si);
      const shown = orderIn(strip(sec.slice(0, sec.indexOf('</details>'))), S.order);
      check('display', 'week board (Scorecards by week) · ' + kind, 'row order = server week result', JSON.stringify(shown) === JSON.stringify(S.order),
        'shown ' + shown.join(', ') + ' | server (league_finalize_week) ' + S.order.join(', '));
      const low = (strip(sec).match(/Low: ([^·]+?) [+E-]/) || [])[1] || '';
      check('display', 'week board (Scorecards by week) · ' + kind, 'header "Low:" names the server week winner only', low.trim() === S.order[0],
        'header says "Low: ' + low.trim() + '" | server winner ' + S.order[0] + (S.sf ? ' (Stableford ' + JSON.stringify(S.sf) + ')' : ''));
      const unit = kind === 'stableford' ? /\bpts\b|points/.test(strip(sec.slice(0, sec.indexOf('</details>')))) : true;
      check('display', 'week board (Scorecards by week) · ' + kind, 'shows the Stableford points the week was decided on', unit, 'the rows show only net to par / net / gross');
    }
    // 3. board modal (Board button) — server order
    {
      const store = {}; let bodyEl = { innerHTML: '' };
      const og = ctx.document.getElementById; const oc = ctx.document.createElement; const ob = ctx.document.body;
      const ov = { className: '', style: {}, innerHTML: '', remove() {}, querySelector: s => (s === '#lg-board-body' ? bodyEl : { onclick: null }), set onclick(v) {} };
      ctx.document.createElement = () => ov;
      ctx.document.body = Object.assign({}, ob, { appendChild() {}, contains: () => true });
      try { await Promise.race([F('lgOpenBoardModal')('s1'), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 8000))]); } catch (e) { bodyEl.innerHTML += 'ERR ' + e.message; }
      ctx.document.createElement = oc; ctx.document.body = ob; ctx.document.getElementById = og;
      const o = orderIn(strip(bodyEl.innerHTML), S.order);
      check('display', 'board modal · ' + kind, 'order = server rank', JSON.stringify(o) === JSON.stringify(S.order), 'shown ' + o + ' ' + bodyEl.innerHTML.slice(0, 120));
    }
    // 4. public page (league_public_standings rows) and 5. print sheet
    {
      const pub = F('lgPublicBoardHtml')({ league: 'QA', season: 'S', through_week: 1, standings: rows.map(r => ({ rank: r.rank, flight: null, name: r.name, points: r.points, points_possible: 21, pct: r.pct, weeks_played: 1, wins: 0, losses: 0, ties: 0 })) });
      const o = orderIn(strip(pub), S.order);
      check('display', 'public page · ' + kind, 'order = server rank', JSON.stringify(o) === JSON.stringify(S.order), 'shown ' + o);
      if (kind === 'to_par_total') check('display', 'public page · ' + kind, 'to-par race shows the to-par total (the number it is ranked on)', /[+-]\d|\bE\b/.test(strip(pub).replace(/through week \d+/, '')),
        'public page prints ' + strip(pub).match(/Bob[^A-Z]*/)[0].trim() + ' — a percentage, while the in-app table shows +2');
    }
  }
  // 6. client-side tiebreak re-sorting: no display may re-sort the server rows
  const src = require('fs').readFileSync(HTML, 'utf8').split('\n');
  const bad = [];
  for (let i = 106300; i < 120000; i++) if (/rows\.(slice\(\)\.)?sort\(|standings\.(slice\(\)\.)?sort\(/.test(src[i] || '')) bad.push(i + 1);
  check('display', 'client re-sorts', 'no standings display re-sorts the server rows', bad.length === 0, 'lines ' + bad.join(','));

  console.log('\nCOVERAGE'); Object.keys(COV).sort().forEach(k => console.log('  ' + k + ' : ' + COV[k].n + ' / ' + COV[k].f));
  console.log('\n' + (PASS + FAIL) + ' checks, ' + PASS + ' passed, ' + FAIL + ' failed');
  FAILS.forEach(f => console.log('FAIL ' + f));
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.log('CRASH', e && e.stack); process.exit(2); });
