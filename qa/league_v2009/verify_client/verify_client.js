// VERIFY_CLIENT: independent repro of the client-side league defects (build e5a912f).
// Run: node qa/league_v2009/verify_client/verify_client.js [golf-app.html]
// Loads the REAL app script through qa/app.js (vm, hoisted functions) with an own fake Supabase.
// Every expectation below is hand-computed in the comment beside it; no app helper is used as an oracle.
'use strict';
const path = require('path');
const { loadApp } = require(path.join(__dirname, '..', '..', 'app.js'));
const HTML = process.argv[2] || path.join(__dirname, '..', '..', '..', 'golf-app.html');
const { qa } = loadApp(HTML);
const F = n => qa.fn(n);
const J = o => JSON.stringify(o);
const out = [];
function res(id, ok, msg) { out.push((ok ? 'BUG-REPRODUCED ' : 'NOT-REPRODUCED ') + id + ': ' + msg); }

// ---------- fake supabase ----------
function makeSupa(DB, RPC, LOG) {
  function q(table) {
    const f = [];
    const run = () => { let rows = (DB[table] || []).slice(); f.forEach(([op, c, v]) => { if (op === 'eq') rows = rows.filter(r => r[c] === v); else if (op === 'in') rows = rows.filter(r => (v || []).indexOf(r[c]) >= 0); else if (op === 'nn') rows = rows.filter(r => r[c] != null); }); return rows; };
    const b = { select() { return b; }, order() { return b; }, limit() { return b; }, range() { return b; },
      eq(c, v) { f.push(['eq', c, v]); return b; }, neq() { return b; }, in(c, v) { f.push(['in', c, v]); return b; },
      not(c, op, v) { if (op === 'is' && v === null) f.push(['nn', c]); return b; }, is() { return b; }, or() { return b; }, gte() { return b; }, lte() { return b; },
      maybeSingle() { return Promise.resolve({ data: run()[0] || null, error: null }); }, single() { return Promise.resolve({ data: run()[0] || null, error: null }); },
      then(r, j) { return Promise.resolve({ data: run(), error: null }).then(r, j); },
      update() { return b; }, insert() { return b; }, upsert() { return b; }, delete() { return b; } };
    return b;
  }
  return { from: q, rpc: (n, a) => { LOG && LOG.push([n, a]); return Promise.resolve(RPC[n] ? RPC[n](a) : { data: null, error: null }); },
           channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} };
}
let SAVED = null, OPENED = null;
function install(DB, RPC, LOG) {
  SAVED = null; OPENED = null;
  qa.install({ supa: makeSupa(DB, RPC, LOG), onSave: g => { SAVED = JSON.parse(JSON.stringify(g)); }, loadGame: () => null, roster: () => [], meName: () => 'Vee Rifier' });
  F("(ensureUniqueGameCode = async function (c) { return 'NEWCODE1'; }, 1)");
  F("(lgOpenLaunchedRound = async function (c) { window.__opened = c; return true; }, 1)");
  F("(_authUser = { id: 'u0', email: 'v@x' }, 1)");
  F("(window._lgLaunching = false, window.__opened = null, 1)");
}
const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];  // par 3s at 4, 8, 12, 17
const SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
function snap(nine) {
  if (nine === 'back') return { holes: 9, pars: PARS.slice(9), si: [4, 5, 9, 7, 6, 3, 2, 8, 1], par: 36, name: 'V Links', tees: [{ label: 'W', rating: 36, slope: 120 }] };
  if (nine === 'front') return { holes: 9, pars: PARS.slice(0, 9), si: [5, 6, 2, 8, 7, 1, 4, 9, 3], par: 36, name: 'V Links', tees: [{ label: 'W', rating: 36, slope: 120 }] };
  return { holes: 18, pars: PARS.slice(), si: SIS.slice(), par: 72, name: 'V Links', tees: [{ label: 'W', rating: 72, slope: 120 }] };
}
async function launch(o) {
  const roster = (o.names || ['Al', 'Bo', 'Cy', 'Di']).map((n, i) => ({ id: 'm' + i, user_id: 'u' + i, display_name: n + ' Vee', status: 'active', role: 'player', team_id: o.team ? ('T' + (i >> 1)) : null }));
  const W = { id: 'w1', season_id: 's1', week_number: 2, nine: o.nine || null, course_id: 'c1', status: 'open', course_snapshot: snap(o.nine),
    settings_snapshot: { money: { weekly: o.weekly || {} } }, format_config: Object.assign({}, o.fc || {}) };
  const mus = o.team ? [{ id: 'mu1', week_id: 'w1', kind: 'match', entrant_kind: 'team', a_entrant_id: 'T0', b_entrant_id: 'T1', game_code: null }]
                     : roster.map((m, i) => ({ id: 'f' + i, week_id: 'w1', kind: 'vs_field', entrant_kind: 'member', a_entrant_id: m.id, b_entrant_id: null, game_code: null }));
  const DB = { league_weeks: [W], league_matchups: mus, league_absences: [], league_handicaps: roster.map(m => ({ season_id: 's1', week_number: 2, member_id: m.id, effective: 10 })),
    league_seasons: [{ id: 's1', settings: Object.assign({ side_games: o.side || null }, o.settings || {}) }] };
  const LOG = [];
  install(DB, { league_roster: () => ({ data: roster, error: null }),
    league_draw_groups: () => ({ data: { groups: [{ g: 1, mids: roster.map(m => m.id), code: null }] }, error: null }),   // server answers "no group code" (it never reads launched_code)
    league_claim_group_round: a => ({ data: { claimed: true, code: a.p_code, mids: roster.map(m => m.id), g: 1, groups: 1 }, error: null }),
    league_claim_matchup_round: a => ({ data: { claimed: true, code: a.p_code }, error: null }) }, LOG);
  await F('lgLaunchWeekRound')('s1', 'w1', o.team ? 'mu1' : null, o.team ? null : 1);
  return { g: SAVED, LOG, opened: F('window.__opened') };
}

async function main() {
  await new Promise(r => setTimeout(r, 4000));

  // ---- POOLS-1 / JUNK-1: scramble season with individual pools saved ----
  {
    const side = { skins: { value: 3, mode: 'perskin', tieRule: 'carry' }, lowNetPool: { value: 5 }, girPool: { value: 2 }, puttsPool: { value: 2 }, ctp: { value: 1, holes: [4, 8, 12, 17] } };
    const r = await launch({ team: true, side, settings: { format: 'scramble', type: 'team_2man' } });
    const keys = r.g ? Object.keys(r.g.games).sort() : null;
    // expected (v1593 rule): only ["ctp"]
    res('POOLS-1/JUNK-1', keys && keys.some(k => ['skins', 'lowNetPool', 'girPool', 'puttsPool'].includes(k)), 'scramble round games = ' + J(keys) + ' (expected ["ctp"])');
    // same via week override
    const r2 = await launch({ team: true, side: null, fc: { side_games: { skins: { value: 3 }, ctp: { value: 1, holes: [4] } } }, settings: { format: 'scramble', type: 'team_2man' } });
    res('POOLS-1/JUNK-1 (week override)', r2.g && !!r2.g.games.skins, 'scramble week override games = ' + J(r2.g && Object.keys(r2.g.games)));
  }

  // ---- POOLS-7: group side game + league weekly pot for the same game ----
  {
    const side = { skins: { value: 2, mode: 'perskin', tieRule: 'carry' }, lowNetPool: { value: 5 }, girPool: { value: 4 }, puttsPool: { value: 3 }, ctp: { value: 2, holes: [4, 8, 12, 17] }, longPutt: { value: 3 } };
    const weekly = {}; ['skins', 'lowest_net', 'ctp', 'longest_putt', 'most_girs', 'fewest_putts'].forEach(k => weekly[k] = { on: true, amount: 5 });
    const r = await launch({ side, weekly });
    const g = r.g.games;
    const live = ['skins', 'lowNetPool', 'girPool', 'puttsPool'].filter(k => g[k] && !g[k].fieldOnly && Number(g[k].value) > 0);
    // CTP/LP: expected and actual both fieldOnly value 0
    res('POOLS-7', live.length === 4 && g.ctp.fieldOnly && g.longPutt.fieldOnly, 'with league pots on, round still plays at real value: ' + J(live.map(k => k + '=' + g[k].value)) + '; ctp ' + J(g.ctp) );
  }

  // ---- LIFE-2: week with legacy format_config.launched_code ----
  {
    const r = await launch({ fc: { launched_code: 'OLDWEEK1' } });
    const claimed = r.LOG.filter(x => /claim/.test(x[0])).map(x => x[0] + ':' + x[1].p_code);
    // expected: open OLDWEEK1, no claim, no save
    res('LIFE-2 (field)', !!r.g && r.opened !== 'OLDWEEK1', 'week launched_code=OLDWEEK1; launcher claimed ' + J(claimed) + ', saved round ' + (r.g && r.g.code) + ', opened ' + r.opened);
    const r2 = await launch({ team: true, fc: { launched_code: 'OLDWEEK1' }, settings: { format: 'team_match', type: 'team_2man' } });
    res('LIFE-2 (team)', !!r2.g && r2.opened !== 'OLDWEEK1', 'team fixture: saved round ' + (r2.g && r2.g.code) + ', opened ' + r2.opened);
  }

  // ---- HOLES-2: LD pot holes [3,14] on a back-nine week ----
  {
    const weekly = { longest_drive: { on: true, amount: 5, holes: [3, 14], hole: 3 } };
    const r = await launch({ nine: 'back', weekly });
    const g = r.g; const ld = F('bgLongDriveHolesFor')(g);
    // hand: back nine, nineMode back9 -> played p = physical p+9. Physical 3 not on the nine; physical 14 = played 5.
    // expected button holes [5]. Played 3 = physical 12 (par 3).
    const phys = ld.map(h => F('bgPhysHole')(g, h));
    res('HOLES-2', J(ld) !== J([5]), 'nineMode ' + g.nineMode + ', LD button on played ' + J(ld) + ' = physical ' + J(phys) + ' (expected played [5] = physical 14); par of played 3 = ' + g.pars[2]);
  }

  // ---- HOLES-3: side-game CTP holes saved from week 1 (front) applied to a back week ----
  {
    const side = { ctp: { value: 2, holes: [4, 8] } };   // what the picker offers off week 1 (front par 3s, played 4,8)
    const r = await launch({ nine: 'back', side });
    const g = r.g; const hs = g.games.ctp && g.games.ctp.holes;
    const parsOn = (hs || []).map(h => g.pars[h - 1]);
    // back nine pars 4,4,3,4,5,4,5,3,4 -> par 3s on played 3 and 8. Expected CTP on [3,8].
    res('HOLES-3', J(hs) !== J([3, 8]), 'back week CTP holes ' + J(hs) + ' pars ' + J(parsOn) + ' (expected [3,8], both par 3); value ' + (g.games.ctp && g.games.ctp.value));
  }

  // ---- HOLES-1: league round started on 14 ----
  {
    const r = await launch({ side: { skins: { value: 1, mode: 'perskin', tieRule: 'carry' } } });
    const g = r.g; g.startHole = 1;  // lock hides holes field -> stays 1
    // stamp cells in play order 14..18,1..13
    const order = [14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    g.cellAt = { scores: {} }; g.scores = {};
    g.players.forEach(p => { g.cellAt.scores[p.id] = new Array(18).fill(0); g.scores[p.id] = new Array(18).fill(4); });
    order.forEach((h, k) => g.players.forEach(p => { g.cellAt.scores[p.id][h - 1] = 1790000000000 + k * 600000; }));
    const start = F('bgEffectiveStartHole')(g); const seq = F('_bgPlaySeqOr')(g, 18);
    res('HOLES-1', start !== 14, 'bgEffectiveStartHole = ' + start + ', play seq starts ' + J(seq.slice(0, 6)) + ' (expected 14..18,1); bgPlayStart(lg) = ' + F('bgPlayStart')(Object.assign({}, g, { finishedAt: null })));
    // money: everyone 4 except Al 3 on hole 13 only (the LAST hole played) and all tie elsewhere; hcp equal -> carry from 14..12 (17 skins) lands on 13 by play order.
    // Expected by play order: Al wins 18 skins on hole 13 = 18*3 = +54, others -18 each.
    // App (hole order 1..18): carries 1..12 (12) -> Al wins 13 (13 skins), then 14..18 carry 5 -> leftover to low total (Al, 1 lower) => Al also +5*3.
    g.players.forEach(p => { g.players.forEach(() => {}); });
    // give everyone the same hcp so strokes cancel
    g.players.forEach(p => { p.hcp = 0; p.baseHcp = 0; });
    g.scores[g.players[0].id][12] = 3; g.finishedAt = 1790000099999;
    const m = F('computeAllGameMoney')(g);
    out.push('   HOLES-1 money (Al wins only hole 13): ' + J(g.players.map(p => p.name.split(' ')[0] + ' ' + Math.round(m.combined[p.id] * 100) / 100)) + ' — totals same either order here; carry difference is in the per-hole log');
    // Second probe where order matters: Al 3 on 13 and Bo 3 on 18. Play order: 14..17 carry(4) -> Bo wins 18 with 5 skins; 1..12 carry 12 -> Al wins 13 with 13 skins.
    // Hole order: 1..12 carry -> Al wins 13 with 13; 14..17 carry 4 -> Bo wins 18 with 5. Same. Use instead a tie on 18 with Al 3 on hole 1:
    const g2 = JSON.parse(JSON.stringify(g)); g2.players.forEach(p => { g2.scores[p.id] = new Array(18).fill(4); });
    g2.scores[g2.players[0].id][0] = 3;   // Al wins hole 1 (6th played)
    // play order: 14..18 tie (5 carries) -> hole 1 Al wins 6 skins; 2..13 tie 12 carries -> leftover at end, low total Al -> 12 more. Al = 18 skins.
    // hole order: hole 1 Al 1 skin; 2..18 carry 17 -> leftover low total Al -> 17. Al = 18 skins. Totals identical (all leftovers go to low total). So carry routing is visible only in per-hole log, not totals unless leftover rule differs.
    const m2 = F('computeAllGameMoney')(g2);
    out.push('   HOLES-1 money probe2 ' + J(g2.players.map(p => Math.round(m2.combined[p.id] * 100) / 100)));
    // order matters for skins when the leftover goes to a DIFFERENT winner: Al 3 on hole 1, Bo 3 on 13, rest tie.
    const g3 = JSON.parse(JSON.stringify(g2)); g3.scores[g3.players[1].id][12] = 3;
    // play order (14..18,1..13): 14-18 carry5 -> hole1 Al takes 6 skins; 2..12 carry 11 -> hole13 Bo takes 12 skins. Al +6*3=18 -6..., per skin value 1 x 3 losers.
    //   Al: +6*3 -12 = +6 ; Bo: +12*3 - 6 = +30 ; Cy, Di: -18 each.
    // hole order: hole1 Al 1 skin; 2..12 carry 11 -> hole13 Bo 12 skins; 14..18 carry 5 -> leftover low total: Al and Bo tie (both one under) -> no winner.
    //   Al: +3 -12 = -9 ; Bo: +36 -1 = +35 ; Cy, Di: -13 each.
    const m3 = F('computeAllGameMoney')(g3);
    const v3 = g3.players.map(p => Math.round(m3.combined[p.id] * 100) / 100);
    res('HOLES-1 (units)', J(v3) !== J([6, 30, -18, -18]), 'Al 3 on hole1, Bo 3 on hole13, tee off 14: app units ' + J(v3) + ' expected by play order [6,30,-18,-18]');
  }

  // ---- G-2: Snake opt-in not remapped ----
  {
    const src = { junk: { snake: 1, birdie: 1, snakeParticipants: ['setupA', 'setupB'], snakeParticipantNames: ['Al Vee', 'Bo Vee'] } };
    const gp = ['Al', 'Bo', 'Cy', 'Di'].map((n, i) => ({ id: 'p' + i, name: n + ' Vee' }));
    const outG = F('t2RemapGamesToGroup')(src, gp, [], [], ['A', 'B'], { inGroup: true });
    const sp = outG.junk && outG.junk.snakeParticipants;
    // expected: ['p0','p1'] (Al, Bo)
    res('G-2', J(sp) !== J(['p0', 'p1']), 'remapped junk.snakeParticipants = ' + J(sp) + ' (expected ["p0","p1"]); also survives _lgFitGameNames? ' + J(Object.keys(F('_lgFitGameNames')(src, gp, {}))));
  }

  // ---- SETUP-4: shape save sends shape default format ----
  {
    const cases = [['stableford', 'field'], ['team_match', 'team'], ['stroke_h2h', 'h2h'], ['stableford_h2h', 'h2h'], ['team_stableford', 'team'], ['stroke_net', 'field'], ['scramble', 'team'], ['match', 'h2h']];
    const changed = [];
    cases.forEach(([fmt]) => {
      const shape = F('lgShapeOfSettings')({ type: /team|scramble/.test(fmt) ? 'team_2man' : 'individual', format: fmt });
      const sent = F('lgShape')(shape).format;
      if (sent !== fmt) changed.push(fmt + '->' + sent);
    });
    res('SETUP-4', changed.length > 0, 'unchanged shape save sends p_format: ' + J(changed) + ' (' + changed.length + '/8 change)');
  }

  // ---- SETUP-5 / POOLS-6: lgSaveMoneySettings drops most_girs / fewest_putts ----
  {
    const els = {};
    const mk = (id, v, chk) => { els[id] = { id, value: String(v), checked: !!chk, type: chk === undefined ? 'text' : 'checkbox', dataset: { orig: chk === undefined ? String(v) : (chk ? '1' : '') } }; };
    ['skins', 'lowest_net', 'ctp', 'longest_drive', 'longest_putt', 'most_girs', 'fewest_putts'].forEach(k => { mk('lgm-' + k + '-on', '', false); mk('lgm-' + k + '-amt', 0); });
    mk('lgm-buyin', 50); mk('lgm-payout', 'winner_take_all'); mk('lgm-longest_drive-hole', '');
    // user ticks Most GIRs 5 and Fewest putts 3
    els['lgm-most_girs-on'].checked = true; els['lgm-most_girs-amt'].value = '5';
    els['lgm-fewest_putts-on'].checked = true; els['lgm-fewest_putts-amt'].value = '3';
    let sent = null;
    qa.install({ supa: { from: () => ({}), rpc: (n, a) => { sent = a; return Promise.resolve({ data: { ok: true }, error: null }); } }, onSave() {}, loadGame: () => null, roster: () => [], meName: () => '' });
    F('document').getElementById = id => els[id] || null;
    F("(lgOpenMoney = function(){}, bgReserveRead = function(){ return null; }, 1)");
    await F('lgSaveMoneySettings')('s1', { norender: true });
    const keys = Object.keys((sent && sent.p_money && sent.p_money.weekly) || {});
    res('SETUP-5/POOLS-6', keys.indexOf('most_girs') < 0 && keys.indexOf('fewest_putts') < 0, 'ticked Most GIRs + Fewest putts; p_money.weekly keys sent = ' + J(keys));
    const dirty = F('lgMoneyDirty')();
    res('SETUP-5 (dirty)', dirty === false, 'lgMoneyDirty() after ticking only those two = ' + dirty + ' (expected true)');
  }

  // ---- SETUP-6: rules page payout label for 70_30 (static from source map) ----
  {
    const src = require('fs').readFileSync(HTML, 'utf8');
    const i = src.indexOf("row('Season entry', money(mon.buyin) + ', awarded '");
    const chunk = src.slice(i, i + 300);
    const map = { winner_take_all: 'to the winner', '80_20': '80 / 20', '60_40': '60 / 40', '50_30_20': '50 / 30 / 20', '40_30_20_10': '40 / 30 / 20 / 10' };
    const has7030 = /'70_30'/.test(chunk);
    res('SETUP-6', !has7030 && /\|\| '60 \/ 40'/.test(chunk), "lgOpenRules label map lacks 70_30 and falls back to '60 / 40' -> a 70/30 league reads 'awarded " + (map['70_30'] || '60 / 40') + "'");
  }

  // ---- LIFE-9 (P2 spot check): 10-player field group, ROUND_MAX_PLAYERS = 8 ----
  {
    const names = ['Al', 'Bo', 'Cy', 'Di', 'Ed', 'Fy', 'Gu', 'Hi', 'Io', 'Jo'];
    const r = await launch({ names });
    const cap = F('ROUND_MAX_PLAYERS');
    res('LIFE-9', r.g && r.g.players.length > cap, 'group of 10 launched a ' + (r.g && r.g.players.length) + '-player card; ROUND_MAX_PLAYERS = ' + cap);
  }

  // ---- SCORING-5: field board order/headers (same sort as lgOpenStandings 113258-113273, replicated from source, then compared to hand) ----
  // Done by static reading; see VERIFY_CLIENT.md.

  console.log(out.join('\n'));
  process.exit(0);
}
main().catch(e => { console.log(out.join('\n')); console.error(e); process.exit(1); });
