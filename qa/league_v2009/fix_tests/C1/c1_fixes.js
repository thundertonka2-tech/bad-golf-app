// v2009 C1 fix tests: league setup / settings / rules / dues / week editor.
// Run: node qa/league_v2009/fix_tests/C1/c1_fixes.js [golf-app.html]
// Loads the real app script (qa/app.js) with a fake Supabase and an id-addressable DOM. Every expectation is
// written from DECISIONS.md / HOLES_SPEC.md / REQUESTS_S1-S3.md, never from the code under test.
'use strict';
const path = require('path');
const { loadApp } = require(path.join(__dirname, '..', '..', '..', 'app.js'));
const HTML = process.argv[2] || path.join(__dirname, '..', '..', '..', '..', 'golf-app.html');
const { qa, ctx } = loadApp(HTML);
const F = n => qa.fn(n);
const W = ctx.window;
// the real screens, kept before any test stubs a navigation target
const REAL = {};
['lgOpenSettings', 'lgOpenSeason', 'lgOpenMoney', 'lgOpenHandicaps', 'lgOpenSchedule', 'lgWizHtml', 'lgSetupState', 'lgSetupChecklistHtml', 'lgOpenGame', 'lgOpenWeek'].forEach(n => { REAL[n] = F(n); });
function restore(n) { W.__real = REAL[n]; F('(' + n + ' = window.__real, 1)'); }

let PASS = 0, FAIL = 0; const FAILS = []; const COV = {};
function check(id, label, cond, detail) {
  COV[id] = COV[id] || { run: 0, fail: 0 }; COV[id].run++;
  if (cond) PASS++; else { FAIL++; COV[id].fail++; FAILS.push('[' + id + '] ' + label + (detail ? '\n      ' + detail : '')); }
}

// ---------- DOM ----------
const EL = {};
function mkEl(id) {
  const e = {
    id, style: {}, dataset: {}, value: '', checked: false, disabled: false, hidden: false, textContent: '', innerHTML: '',
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, on) { if (on === undefined ? !this._s.has(c) : on) this._s.add(c); else this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    addEventListener() {}, focus() {}, setAttribute() {}, querySelector: () => null, querySelectorAll: () => [], appendChild() {}, remove() {},
  };
  e.style.removeProperty = () => {};
  return e;
}
const doc = ctx.document;
doc.getElementById = id => EL[id] || null;
let CHECKED = {};
doc.querySelector = sel => { const m = /input\[name="([^"]+)"\]:checked/.exec(sel); return (m && CHECKED[m[1]] != null) ? { value: CHECKED[m[1]] } : null; };
doc.querySelectorAll = () => [];
function ensure(id) { return (EL[id] = EL[id] || mkEl(id)); }
function reset() { Object.keys(EL).forEach(k => delete EL[k]); ensure('league-body'); }

// ---------- fake supabase ----------
let CALLS = [];
function makeSupa(DB, RPC) {
  function q(table) {
    const f = [];
    const run = () => { let rows = (DB[table] || []).slice(); f.forEach(([c, v]) => { rows = rows.filter(r => r[c] === v); }); return rows; };
    const b = {
      select() { return b; }, order() { return b; }, limit() { return b; }, in() { return b; }, neq() { return b; }, not() { return b; },
      eq(c, v) { f.push([c, v]); return b; },
      maybeSingle() { return Promise.resolve({ data: run()[0] || null, error: null }); },
      single() { return Promise.resolve({ data: run()[0] || null, error: null }); },
      then(res, rej) { return Promise.resolve({ data: run(), error: null }).then(res, rej); },
    };
    return b;
  }
  return { from: q, rpc: (name, args) => { CALLS.push([name, args]); return Promise.resolve(RPC[name] ? RPC[name](args) : { data: {}, error: null }); },
           channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} };
}
let TOASTS = [], CHAT = [];
function install(DB, RPC) {
  CALLS = []; TOASTS = []; CHAT = [];
  qa.install({ supa: makeSupa(DB || {}, RPC || {}), loadGame: () => null, roster: () => [], meName: () => 'QA' });
  F("(_authUser = { id: 'u0', email: 'qa@x' }, 1)");
  F("(lgPaint = function(b,h){ b.innerHTML = h; }, lgEnterTab = function(){}, 1)");
  W.__toasts = TOASTS; W.__chat = CHAT;
  F("(showToast = function(t){ window.__toasts.push(String(t)); }, 1)");
  F("(t2ChatPost = async function(id, m){ window.__chat.push([id, m]); return true; }, getMeName = async function(){ return 'QA'; }, 1)");
  F("(lgOpenSettings = async function(){}, lgOpenSeason = async function(){}, lgOpenGame = async function(){}, lgOpenMoney = async function(){}, lgOpenSchedule = async function(){}, lgNextSetupStep = async function(){}, lgOpenWeek = async function(){}, 1)");
}

(async function main() {
  // ===================== SETUP-3: name keys =====================
  {
    const k = F('lgNameKey');
    check('SETUP-3', 'José Muñoz = Jose Munoz (accents fold)', k('José Muñoz') === k('Jose Munoz'), k('José Muñoz') + ' / ' + k('Jose Munoz'));
    check('SETUP-3', 'José Muñoz != Jos Muoz (accent not dropped)', k('José Muñoz') !== k('Jos Muoz'));
    check('SETUP-3', 'two Korean names differ', k('김철수') !== k('이영희') && k('박지성') !== k('손흥민'), k('김철수') + ' / ' + k('이영희'));
    check('SETUP-3', 'a Korean name keys on its own characters, never empty', k('김연아') === '김연아');
    check('SETUP-3', 'Japanese / Chinese keep their characters', k('山田 太郎') === '山田太郎' && k('王 伟') === '王伟');
    check('SETUP-3', 'no-letter name is never the empty key', k('!!') !== '' && k('  ') !== '' && k('!!') !== k('??'));
    check('SETUP-3', 'case, spaces, apostrophes ignored', k("Tyler O'Connor") === k('tyler oconnor'));
    // the roster picker: a second Korean player can be ticked/added after the first
    install({}, { league_roster: () => ({ data: [{ id: 'm1', display_name: '박지성', status: 'active', role: 'player' }], error: null }) });
    F("(_rosterLgSid = 'S1', 1)");
    await F('_rosterLgRefresh')();
    const inSet = F('_rosterLgInSet');
    check('SETUP-3', 'roster set holds 박지성 under its own key', inSet.has(k('박지성')));
    check('SETUP-3', 'a second Korean name (손흥민) is not "already on the roster"', !inSet.has(k('손흥민')) && !inSet.has(''), JSON.stringify(Array.from(inSet)));
    // import toast names ambiguous / out-of-range rows
    install({}, { league_seed_handicaps: () => ({ data: { written: 1, unmatched: ['Nobody'], ambiguous: ['Kim'], out_of_range: [{ name: 'Big', index: 90 }] }, error: null }) });
    F("(lgOpenHandicaps = async function(){}, 1)");
    reset(); ensure('lg-imp').value = '김연아, 7.5\nKim, 3\nBig, 90';
    W._lgSeason = 'S1'; W._lgHcpWeek = 1;
    await F('lgDoImportHandicaps')();
    const t = TOASTS.join(' | ');
    check('SETUP-3', 'import sends the Korean name as typed', CALLS[0] && CALLS[0][1].p_rows[0].name === '김연아');
    check('SETUP-3', 'import result names unmatched, ambiguous and out-of-range rows', /no match for Nobody/.test(t) && /more than one player called Kim/.test(t) && /Big/.test(t), t);
  }

  // ===================== SETUP-6: payout labels everywhere =====================
  {
    const L = F('lgPayoutLabel');
    const want = { winner_take_all: 'to the winner', '80_20': '80 / 20', '70_30': '70 / 30', '60_40': '60 / 40', '50_30_20': '50 / 30 / 20', '40_30_20_10': '40 / 30 / 20 / 10' };
    Object.keys(want).forEach(k2 => check('SETUP-6', 'label ' + k2, L(k2) === want[k2], L(k2)));
    check('SETUP-6', 'unset payout reads as the default (winner), never 60 / 40', L(undefined) === 'to the winner' && L(null) === 'to the winner');
    check('SETUP-6', 'unknown split spelled out, not 60 / 40', L('55_45') === '55 / 45');
  }

  // ===================== SETUP-8 / SETUP-16: rules page =====================
  {
    const rules = async (st) => {
      install({ league_seasons: [{ id: 'S1', name: 'S', schedule_mode: 'calendar', start_date: '2027-04-06', settings: st }] }, {});
      reset(); await F('lgOpenRules')('S1'); return EL['league-body'].innerHTML;
    };
    const H1 = await rules({ format: 'stroke_net', competition_mode: 'field', weeks: 10, base_holes: 18, points: { system: 'net_stroke', season_race: 'to_par_total', count_best_n_weeks: 8 }, hcp_rules_set: true, hcp_rules: { pct: 90, basis: 'lowest', noPar3Strokes: true, maxScore: { mode: 'dbl' } }, money: { buyin: 75, payout: '70_30', weekly: { skins: { on: true, amount: 5 }, most_girs: { on: true, amount: 2 }, fewest_putts: { on: true, amount: 2 } } } });
    check('SETUP-6', 'rules page: 70 / 30', /awarded 70 \/ 30/.test(H1));
    check('SETUP-8', 'to-par race ranked on to par', /Total net to par/.test(H1) && !/Percentage of the points/.test(H1));
    check('SETUP-8', 'field league has no head-to-head tiebreak', !/Head-to-head, then/.test(H1));
    check('SETUP-8', 'handicap rules listed', /Off the lowest · 90% · no par-3 strokes · double bogey max/.test(H1), (H1.match(/Handicap rules<\/div><div[^>]*>([^<]*)/) || [])[1]);
    check('SETUP-8', 'Most GIRs and Fewest putts listed', /Most GIRs/.test(H1) && /Fewest putts/.test(H1));
    check('POOLS-5', 'rules page: skins tie carries to next hole, leftover shared, nothing to next week', /Carries to the next hole/.test(H1) && /shared by everyone in the skins/.test(H1) && !/carries to next week/i.test(H1.replace(/nothing carries to next week/i, '')), '');
    check('D15', 'rules page: best 8 of 10', /Best 8 of 10/.test(H1));
    check('D11', 'rules page: joining part-way prorated, equal share', /prorated/.test(H1) && /same/.test(H1));
    check('SETUP-16', 'game name is marked data-noi18n', /data-noi18n[^>]*>Stroke play</.test(H1));
    const H2 = await rules({ format: 'team_stableford', competition_mode: 'head_to_head', type: 'team_2man', team_rule: 'aggregate', weeks: 8, base_holes: 18, points: { system: 'stableford' } });
    check('SETUP-8', 'team Stableford: Format says team, System says Stableford', /Team league/.test(H2) && /both nets added/.test(H2) && /Stableford points/.test(H2), (H2.match(/>Format<\/div><div[^>]*>([^<]*)/) || [])[1]);
    check('SETUP-8', 'Stableford tiebreak is a points countback', /countback on Stableford points/.test(H2));
    const H3 = await rules({ format: 'scramble', competition_mode: 'head_to_head', type: 'team_2man', weeks: 8, base_holes: 18, points: { system: 'match_only' } });
    check('SETUP-8', 'scramble: one ball a team', /one ball a team/.test(H3) && !/Head-to-head match play/.test(H3));
    const H4 = await rules({ format: 'stableford', competition_mode: 'field', weeks: 8, base_holes: 18, points: { system: 'stableford', season_race: 'points' } });
    check('SETUP-8', 'field Stableford: Stableford system, percentage race, no head-to-head', /Stableford points/.test(H4) && /Percentage/.test(H4) && !/Head-to-head/.test(H4));
  }

  // ===================== SETUP-5 / POOLS-6 / POOLS-5 / D10: Dues screen =====================
  {
    install({ league_seasons: [{ id: 'S1', settings: { side_games: { skins: { value: 2 }, girPool: { value: 3 } }, money: { weekly: {} } } }] }, {});
    reset(); F("(lgWizHtml = function(){ return ''; }, 1)");
    await F('lgOpenMoneySetup')('S1');
    const H = EL['league-body'].innerHTML;
    ['skins', 'lowest_net', 'ctp', 'longest_putt', 'longest_drive', 'most_girs', 'fewest_putts'].forEach(k => {
      const m = new RegExp('id="lgm-' + k + '-amt" data-orig="([^"]*)"').exec(H);
      check('D10', k + ': a never-saved pot offers 5 even when the same side game is set up', m && m[1] === '5', m && m[1]);
    });
    check('D10', 'no "charge for it a second time" note', !/second time/.test(H) && !/charges for it <strong>twice/.test(H));
    check('D10', 'says the league pot takes over and the side game is locked off', /league pot takes over/.test(H) && /locked off on league night/.test(H));
    check('POOLS-5', 'Skins row: tie carries to next hole, leftover shared evenly, nothing to next week', /A tie carries to the next hole/.test(H) && /shared evenly by everyone in the skins/.test(H) && /Nothing carries to next week/.test(H) && !/Nobody wins it, it carries/.test(H));
    check('D11', 'Dues screen: late joiner pays for weeks left, equal share', /joining in week 6 of 10 pays half/.test(H) && /equal share/.test(H));
    // holding card
    const fsrc = String(REAL.lgOpenMoney);
    check('POOLS-5', 'holding card: an unwon pot isn\'t charged; nothing carries into next week', /nobody won isn\\u2019t charged/.test(fsrc) && /nothing carries into next week/.test(fsrc) && !/A prize pool nobody won carries into next week/.test(fsrc));
    // save: all 7 pots + dirty
    let sent = null;
    install({}, { league_set_money_settings: a => { sent = a; return { data: { ok: true }, error: null }; } });
    reset();
    ['skins', 'lowest_net', 'ctp', 'longest_drive', 'longest_putt', 'most_girs', 'fewest_putts'].forEach(k => { ensure('lgm-' + k + '-on').checked = (k === 'most_girs' || k === 'fewest_putts'); EL['lgm-' + k + '-on'].type = 'checkbox'; ensure('lgm-' + k + '-amt').value = '3'; EL['lgm-' + k + '-on'].dataset.orig = ''; EL['lgm-' + k + '-amt'].dataset.orig = '3'; });
    ensure('lgm-buyin').value = '50'; ensure('lgm-payout').value = '70_30'; ensure('lgm-longest_drive-hole').value = '';
    EL['lgm-buyin'].dataset.orig = '50'; EL['lgm-payout'].dataset.orig = '70_30';
    check('SETUP-5', 'dirty check sees a Most GIRs / Fewest putts toggle', F('lgMoneyDirty')() === true);
    await F('lgSaveMoneySettings')('S1', { norender: true });
    const wk = sent && sent.p_money.weekly;
    check('SETUP-5', 'save sends most_girs on, 3', wk && wk.most_girs && wk.most_girs.on === true && wk.most_girs.amount === 3, JSON.stringify(wk));
    check('SETUP-5', 'save sends fewest_putts on, 3', wk && wk.fewest_putts && wk.fewest_putts.on === true && wk.fewest_putts.amount === 3);
    check('SETUP-5', 'save sends all seven pots', wk && Object.keys(wk).length === 7);
    // after week 1, a reserve change is announced (Q-5)
    install({ league_weeks: [{ season_id: 'S1', week_number: 1, status: 'final' }, { season_id: 'S1', week_number: 2, status: 'scheduled' }] }, { league_set_money_settings: () => ({ data: { ok: true }, error: null }) });
    reset();
    ensure('lgm-reserve-value').value = '10'; EL['lgm-reserve-value'].dataset.orig = '0';
    await F('lgSaveMoneySettings')('S1', { norender: true });
    check('SETUP Q-5', 'mid-season reserve change posts to the league chat', CHAT.length === 1 && CHAT[0][0] === 'S1' && /reserve/.test(CHAT[0][1].body) && /week 2/.test(CHAT[0][1].body), JSON.stringify(CHAT));
  }

  // ===================== SETUP Q-5: handicap rules announced =====================
  {
    install({ league_weeks: [{ season_id: 'S1', week_number: 1, status: 'final' }, { season_id: 'S1', week_number: 2, status: 'scheduled' }] },
            { league_set_hcp_rules: () => ({ data: { ok: true, announced: true }, error: null }) });
    F("(bgHcpRulesRead = function(){ return { pct: 80, basis: 'full', noPar3Strokes: false, maxScore: { mode: 'dbl' } }; }, lgInSetup = function(){ return false; }, 1)");
    await F('lgSaveHcpRules')('S1');
    check('SETUP Q-5', 'mid-season handicap-rules change is announced with what the rules are', CHAT.length === 1 && /handicap rules/.test(CHAT[0][1].body) && /80%/.test(CHAT[0][1].body) && /week 2/.test(CHAT[0][1].body), JSON.stringify(CHAT));
    install({}, { league_set_hcp_rules: () => ({ data: { ok: true, announced: false }, error: null }) });
    F("(bgHcpRulesRead = function(){ return {}; }, lgInSetup = function(){ return false; }, 1)");
    await F('lgSaveHcpRules')('S1');
    check('SETUP Q-5', 'pre-season save is not announced', CHAT.length === 0);
  }

  // ===================== SETUP-9 / SETUP-10: note prompt =====================
  {
    let asked = 0, sent = null;
    install({}, { league_set_handicaps: a => { sent = a; return { data: { conflicts: [], weeks: 1 }, error: null }; } });
    F("(lgOpenHandicaps = async function(){}, 1)");
    ctx.window.prompt = () => { asked++; return 'why'; };
    W._lgSeason = 'S1'; W._lgHcpWeek = 1; W._lgHcpScramble = false; W._lgHcpSeedOnly = null;
    reset();
    W._lgHcpRows = [{ member_id: 'm1', name: 'A', suggested: 0.3, capped: 0.3, previous: 0.3, stored: 0.3, cold_start: false, rounds_used: 3 },
                    { member_id: 'm2', name: 'B', suggested: 5, capped: 5, previous: 5, stored: 5, cold_start: false, rounds_used: 3 }];
    ensure('lg-hcp-0').value = '2.3'; EL['lg-hcp-0'].dataset.orig = '0.3';
    ensure('lg-hcp-1').value = '6.9'; EL['lg-hcp-1'].dataset.orig = '5.0'; ensure('lg-hcp-save');
    await F('lgSaveHandicaps')({ norender: true });
    check('SETUP-9', '0.3 -> 2.3 (exact 2.0) asks why', asked === 1 && sent && sent.p_rows[0].note === 'why', 'asked=' + asked);
    check('SETUP-9', '5.0 -> 6.9 (1.9) does not ask', sent && sent.p_rows[1].note === null);
  }

  // ===================== SETUP-2: handicaps step not "done" while a member has none =====================
  {
    const DB = { league_seasons: [{ id: 'S1', settings: { type: 'individual', competition_mode: 'field', game_set: true, money: {}, side_games_set: true, hcp_rules_set: true }, status: 'planning' }],
                 league_weeks: [{ id: 'w1', season_id: 'S1', status: 'scheduled', week_number: 1 }],
                 league_handicaps: [{ season_id: 'S1', member_id: 'm1', week_number: 1 }] };
    install(DB, {});
    F("(lgSeasonCourse = async function(){ return { course_id: 'c1' }; }, 1)");
    const members = [{ id: 'm1', status: 'active', role: 'player' }, { id: 'm2', status: 'active', role: 'player' }, { id: 's1', status: 'active', role: 'sub' }];
    const st = await F('lgSetupState')('S1', { members, course: { course_id: 'c1' } });
    check('SETUP-2', 'one member of two has no handicap -> step not done', !st.handicaps && st.handicapsMissing === 1, JSON.stringify({ h: st.handicaps, m: st.handicapsMissing }));
    const steps = F('lgWizSteps')(st);
    check('SETUP-2', 'wizard handicaps dot is not done', steps.find(s => s.key === 'handicaps').done === false);
    DB.league_handicaps.push({ season_id: 'S1', member_id: 'm2', week_number: 1 });
    const st2 = await F('lgSetupState')('S1', { members, course: { course_id: 'c1' } });
    check('SETUP-2', 'every player has one (sub ignored) -> done', !!st2.handicaps && !st2.handicapsMissing);
  }

  // ===================== SETUP-14: checklist = wizard =====================
  {
    const cl = F('lgSetupChecklistHtml');
    const h = cl('S1', { game: true, members: 3, course: 'c', matchups: 1, handicaps: 1, ready: true, type: 'individual', hcpRules: false, money: false, sideGames: false });
    check('SETUP-14', 'checklist stays while hcp rules / dues / side games are undone', /Handicap rules/.test(h) && /Dues and prize pools/.test(h) && /Side games/.test(h));
    const h2 = cl('S1', { game: true, members: 4, course: 'c', matchups: 0, handicaps: 0, type: 'team_2man', teams: 0 });
    check('SETUP-14', 'team league lists the Teams step', /Build the teams/.test(h2));
    const h3 = cl('S1', { game: false, members: 0, course: null, matchups: 0 });
    check('SETUP-14', 'hint names only live games', !/match, stableford or scramble/.test(h3) && /Stroke play, Stableford, Scramble or Team match play/.test(h3));
    check('SETUP-14', 'hidden once every step is done', cl('S1', { game: true, members: 3, course: 'c', matchups: 1, handicaps: 1, type: 'individual', hcpRules: true, money: true, sideGames: true }) === '');
  }

  // ===================== SETUP-15: wizard dots =====================
  {
    restore('lgWizHtml');
    W._lgSetupSt = { game: true, members: 3, course: null, matchups: 0, handicaps: 0, type: 'individual', hcpRules: false, money: false, sideGames: false }; W._lgSetupStSid = 'S1';
    const h = F('lgWizHtml')('S1', 'course');
    const dots = h.match(/<button type="button" class="bg-btn t2-wiz-dot[^>]*>[^<]*<\/button>/g) || [];
    const cls = d => (d.match(/class="([^"]*)"/) || [, ''])[1];
    const done = dots.filter(d => / done\b/.test(cls(d))), todo = dots.filter(d => / todo\b/.test(cls(d)));
    check('SETUP-15', 'done dots show a tick (not colour alone)', done.length === 2 && done.every(d => />✓</.test(d)), done.join(' '));
    check('SETUP-15', 'unfinished dots carry the todo class (dashed border)', todo.length === dots.length - 2 && todo.every(d => !/>✓</.test(d)));
    check('SETUP-15', 'state is in the accessible name', done.every(d => /— done"/.test(d)) && todo.every(d => /not done yet"/.test(d)));
    check('SETUP-15', 'a key says what tick and ring mean', /lg-wiz-key/.test(h));
    const css = require('fs').readFileSync(HTML, 'utf8');
    check('SETUP-15', 'CSS: done solid, todo dashed (beats the button system)', /\.lg-wiz-dot\.done \{[^}]*solid[^}]*!important/.test(css) && /\.lg-wiz-dot\.todo \{[^}]*dashed[^}]*!important/.test(css));
    check('SETUP-16', 'wizard hint is split so i18n can match "Step {0} of {1}"', /<span>Step 3 of 8<\/span> — <span>The course the league plays\.<\/span>/.test(h), (h.match(/t2-wiz-hint">[^]*?<\/div>/) || [''])[0]);
  }

  // ===================== SETUP-16: game/format names stay English =====================
  {
    const src = require('fs').readFileSync(HTML, 'utf8');
    check('SETUP-16', 'Game screen game names are data-noi18n', /<strong data-noi18n style="font-size:14px">' \+ lgEsc\(g\.name\)/.test(src));
    check('SETUP-16', 'team rule names are data-noi18n', /<strong data-noi18n style="font-size:14px">' \+ lgEsc\(r\.name\)/.test(src));
    check('SETUP-16', 'create screen "Individual — against the field" is data-noi18n', /s\.key === 'field' \? ' data-noi18n'/.test(src));
  }

  // ===================== SETUP-4 =====================
  for (const [fmt, type] of [['stableford', 'individual'], ['team_match', 'team_2man'], ['stroke_h2h', 'individual'], ['stableford_h2h', 'individual'], ['team_stableford', 'team_2man'], ['scramble', 'team_2man'], ['stroke_net', 'individual'], ['match', 'individual']]) {
    install({ league_seasons: [{ id: 'S1', settings: { format: fmt, type } }] }, {});
    W._lgShapeWas = undefined; W._lgSeason = 'S1';
    CHECKED = { 'lg-shp': F('lgShapeOfSettings')({ format: fmt, type }) }; reset(); ensure('lg-shape-save');
    await F('lgSaveShape')('S1');
    check('SETUP-4', fmt + ': Save with no change sends nothing, says No change', !CALLS.some(c => c[0] === 'league_set_format') && TOASTS.indexOf('No change') >= 0, JSON.stringify(CALLS));
  }
  {
    install({ league_seasons: [{ id: 'S1', settings: { format: 'stableford', type: 'individual' } }] }, { league_set_format: a => ({ data: { changed: true }, error: null }) });
    W._lgShapeWas = 'field'; CHECKED = { 'lg-shp': 'team' }; reset(); ensure('lg-shape-save');
    await F('lgSaveShape')('S1');
    check('SETUP-4', 'a real change still saves (field -> team = scramble)', CALLS.some(c => c[0] === 'league_set_format' && c[1].p_format === 'scramble'));
  }

  // ===================== SETUP-11 / D7: teams =====================
  {
    const roster = [{ id: 'm1', user_id: 'u0', display_name: 'A', status: 'active', role: 'commissioner' }, { id: 'm2', display_name: 'B', status: 'active', role: 'player' },
                    { id: 's1', display_name: 'Sub Sam', status: 'active', role: 'sub' }];
    install({ league_seasons: [{ id: 'S1', settings: { type: 'team_4man', competition_mode: 'head_to_head', weeks: 8 } }] },
            { league_roster: () => ({ data: roster, error: null }), league_teams_get: () => ({ data: [{ team_id: 'T1', name: 'Shank', players: [] }], error: null }) });
    F("(lgWizHtml = function(){ return ''; }, refreshBgUserNames = async function(){}, _crewstatAvHtml = function(){ return ''; }, bgSharedHcp = function(){ return null; }, 1)");
    reset();
    await F('lgOpenTeams')('S1');
    const H = EL['league-body'].innerHTML;
    check('D7', 'a team_4man season is still sized at 2 (no 4-man sizing)', /2 players a team/.test(H) && / of 2</.test(H), (H.match(/\d players a team/) || [])[0]);
    check('SETUP-11', 'a sub is never offered on a team', !/Sub Sam/.test(H) && /data-name="B"/.test(H));
    const src = String(F('lgSetupState'));
    check('D7', 'setup state never sizes a team at 4', !/team_4man/.test(src.replace(/\/\*[^]*?\*\//g, '')));
  }

  // ===================== SETUP-12: rebuild warns =====================
  for (const cleared of [0, 6]) {
    let msg = null;
    install({}, { league_generate_schedule: a => ({ data: a.p_dry_run ? { entrants: 4, entrant_kind: 'player', plan: [{ week_number: 1, pairs: [{ a: 'A', b: 'B' }] }], skipped: [], cleared } : { plan: [] }, error: null }) });
    F("(lgSeasonCourse = async function(){ return { course_id: 'c1' }; }, 1)");
    W.__msg = null; F("(uiConfirm = async function(m){ window.__msg = m; return false; }, 1)");
    await F('lgBuildSchedule')('S1', true);
    msg = W.__msg || '';
    check('SETUP-12', 'rebuild confirm says pairings are replaced (cleared=' + cleared + ')', /replaces the/.test(msg) && (cleared ? /6 pairings/.test(msg) : true), msg);
  }
  {
    const DB = {
      league_weeks: [{ id: 'w1', season_id: 'S1', week_number: 1, status: 'scheduled', nine: 'full18', holes_mode: 'all18', course_id: 'c1' }],
      league_members: [{ id: 'm1', season_id: 'S1', display_name: 'A', status: 'active', role: 'commissioner', user_id: 'u0' }, { id: 'm2', season_id: 'S1', display_name: 'B', status: 'active', role: 'player' }, { id: 'm3', season_id: 'S1', display_name: 'Late Larry', status: 'active', role: 'player' }],
      league_seasons: [{ id: 'S1', settings: { competition_mode: 'head_to_head' }, status: 'active' }],
      league_teams: [], league_matchups: [{ id: 'x1', week_id: 'w1', kind: 'h2h', a_entrant_id: 'm1', b_entrant_id: 'm2', status: 'scheduled' }], league_absences: []
    };
    install(DB, {});
    F("(lgOpenSchedule = " + String(F('lgOpenSchedule')).replace(/^async function lgOpenSchedule/, 'async function') + ", 1)");
  }

  // ===================== D3 / HOLES_SPEC: week editor =====================
  {
    W._lgSchedWeeks = { w1: { id: 'w1', week_number: 3, date: '2027-04-20', nine: 'full18', holes_mode: 'all18', status: 'scheduled', course_id: 'c1' } };
    F("(lgCourseName = function(id){ return id === 'c2' ? 'Other GC' : 'Buffalo Creek'; }, 1)");
    reset(); F('lgEditWeek')('w1', 'full18', '2027-04-20', 0);
    const H = EL['league-body'].innerHTML;
    const modes = (H.match(/name="lg-wk-holes" value="([a-z0-9]+)"/g) || []).map(s => s.replace(/.*value="/, '').replace('"', ''));
    check('D3', 'all seven holes options, exact HOLES_SPEC names', JSON.stringify(modes.slice().sort()) === JSON.stringify(['all18', 'b9first', 'b9x2', 'back9', 'f9x2', 'front9', 'pick']), JSON.stringify(modes));
    check('D3', 'shown on an 18-hole league too (no "no nine to choose")', !/no nine to choose/.test(H));
    check('D3', 'labels match the tournament list', /Front 9 twice/.test(H) && /Pick a starting hole/.test(H) && /Start on the Back 9/.test(H));
    check('D3', 'start-hole picker 2..18, hidden until pick', /id="lg-wk-start-wrap" hidden/.test(H) && (H.match(/<option value="\d+"/g) || []).length === 17);
    check('D3', 'course picker present (league course by default)', /Change course/.test(H) && /Buffalo Creek/.test(H));
    check('D3', '44px rows, radio + border (Color-blind safe)', /class="lg-holes-opt on"/.test(H) && /\.lg-holes-opt \{[^}]*min-height: 44px/.test(require('fs').readFileSync(HTML, 'utf8')));
    // pick 7 + another course -> one league_set_week with exactly the server's fields
    install({}, { league_set_week: () => ({ data: { holes_mode: 'pick', start_hole: 7 }, error: null }) });
    reset(); F('lgEditWeek')('w1', 'full18', '2027-04-20', 0);
    ensure('lg-wk-date').value = '2027-04-21';
    F('lgWkHolesPick')('pick'); W._lgWkEdit.start = 7; W._lgWkEdit.course_id = 'c2';
    await F('lgSaveWeek')('w1');
    const p = CALLS.find(c => c[0] === 'league_set_week');
    check('D3', 'save sends holes_mode=pick, start_hole=7, course_id, date', p && p[1].p_week_id === 'w1' && p[1].p_patch.holes_mode === 'pick' && p[1].p_patch.start_hole === 7 && p[1].p_patch.course_id === 'c2' && p[1].p_patch.date === '2027-04-21' && !('nine' in p[1].p_patch), JSON.stringify(p && p[1]));
    // unchanged holes -> only the date
    install({}, { league_set_week: () => ({ data: {}, error: null }) });
    reset(); F('lgEditWeek')('w1', 'full18', '2027-04-20', 0); ensure('lg-wk-date').value = '2027-04-22';
    await F('lgSaveWeek')('w1');
    const p2 = CALLS.find(c => c[0] === 'league_set_week');
    check('D3', 'nothing changed but the day -> only date is sent (an open week only allows that)', p2 && JSON.stringify(Object.keys(p2[1].p_patch)) === '["date"]', JSON.stringify(p2 && p2[1].p_patch));
    for (const m of ['b9first', 'front9', 'back9', 'f9x2', 'b9x2', 'all18']) {
      install({}, { league_set_week: () => ({ data: {}, error: null }) });
      W._lgSchedWeeks.w2 = { id: 'w2', week_number: 4, status: 'scheduled', holes_mode: m === 'all18' ? 'front9' : 'all18', nine: m === 'all18' ? 'front' : 'full18' };
      reset(); F('lgEditWeek')('w2', '', '', 0); ensure('lg-wk-date').value = '';
      F('lgWkHolesPick')(m); await F('lgSaveWeek')('w2');
      const q = CALLS.find(c => c[0] === 'league_set_week');
      check('D3', 'mode ' + m + ' saved with no start_hole', q && q[1].p_patch.holes_mode === m && !('start_hole' in q[1].p_patch));
    }
    // an opened week: the holes list is disabled and said so
    W._lgSchedWeeks.w3 = { id: 'w3', week_number: 5, status: 'open', holes_mode: 'back9', nine: 'back' };
    reset(); F('lgEditWeek')('w3', 'back', '', 1);
    const H3 = EL['league-body'].innerHTML;
    check('D3', 'opened week: options disabled, course button hidden, says why', /value="back9" checked disabled/.test(H3) && !/Change course/.test(H3) && /can\\u2019t change now|can’t change now/.test(H3));
    check('D3', 'week labels', F('lgHolesLabel')('pick', 7) === 'Shotgun · starts 7' && F('lgHolesLabel')('f9x2') === 'Front 9 twice' && F('lgHolesLabel')('back9') === 'Back 9');
    check('D3', 'legacy nine maps to holes_mode', F('lgHolesModeOf')({ nine: 'back' }) === 'back9' && F('lgHolesModeOf')({ nine: 'front' }) === 'front9' && F('lgHolesModeOf')({ nine: 'full18' }) === 'all18' && F('lgHolesModeOf')({ holes_mode: 'b9x2', nine: 'full18' }) === 'b9x2');
  }

  // ===================== HOLES_SPEC 2.3 + SETUP-17: snapshot =====================
  {
    const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 5, 4];
    const SIS = [7, 1, 15, 3, 11, 5, 17, 13, 9, 8, 16, 2, 10, 6, 14, 18, 4, 12];
    const TEES = [{ label: 'Championship Black', rating: 74.8, slope: 139, yards: 7012 }, { label: 'Gold', rating: 72.2, slope: 127, yards: 6512 }, { label: 'White', rating: 70.1, slope: 121, yards: 6001 }, { label: 'Red', rating: 67.9, slope: 113, yards: 5102 }];
    install({}, {});
    W.__card = { pars: PARS, sis: SIS, tees: TEES };
    F("(getCourseScorecard = async function(){ return JSON.parse(JSON.stringify(window.__card)); }, lgCourseName = function(){ return 'QA GC'; }, 1)");
    const snap = await F('lgCourseSnapshot')('c1', 'all18', null);
    check('SETUP-17', 'no tee picked, no Blue: the second tee from the back (Gold), not Championship Black', snap && snap.tee === 'Gold', snap && snap.tee);
    W.__card.tees = TEES.concat([{ label: 'Blue', rating: 71.0, slope: 125 }]);
    const sb = await F('lgCourseSnapshot')('c1', 'all18', null);
    check('SETUP-17', 'a tee called Blue wins', sb && sb.tee === 'Blue');
    const st = await F('lgCourseSnapshot')('c1', 'all18', 'White');
    check('SETUP-17', 'a picked tee still wins', st && st.tee === 'White');
    W.__card.tees = TEES;
    const f2 = await F('lgCourseSnapshot')('c1', 'f9x2', 'Gold');
    const r9 = SIS.slice(0, 9).map(v => SIS.slice(0, 9).slice().sort((a, b) => a - b).indexOf(v) + 1);
    check('HOLES 2.3', 'f9x2: 18 holes, front pars twice', f2 && f2.holes === 18 && JSON.stringify(f2.pars) === JSON.stringify(PARS.slice(0, 9).concat(PARS.slice(0, 9))));
    check('HOLES 2.3', 'f9x2: USGA split SI (2r-1, then 2r)', f2 && JSON.stringify(f2.si) === JSON.stringify(r9.map(r => 2 * r - 1).concat(r9.map(r => 2 * r))), JSON.stringify(f2 && f2.si));
    check('HOLES 2.3', 'f9x2: rating = nine x 2 (72.2), slope kept; mode stamped', f2 && f2.rating === 72.2 && f2.slope === 127 && f2.mode === 'f9x2');
    const b2 = await F('lgCourseSnapshot')('c1', 'b9x2', 'Gold');
    check('HOLES 2.3', 'b9x2: back pars twice', b2 && JSON.stringify(b2.pars) === JSON.stringify(PARS.slice(9).concat(PARS.slice(9))));
    const bk = await F('lgCourseSnapshot')('c1', 'back9', 'Gold');
    check('HOLES 2.3', 'back9 = old "back": 9 holes, SI re-ranked, rating halved', bk && bk.holes === 9 && JSON.stringify(bk.pars) === JSON.stringify(PARS.slice(9)) && bk.rating === 36.1 && bk.mode === 'back9');
    const pk = await F('lgCourseSnapshot')('c1', 'pick', 'Gold');
    check('HOLES 2.3', 'pick / b9first: the 18 card unchanged', pk && pk.holes === 18 && JSON.stringify(pk.si) === JSON.stringify(SIS) && pk.mode === 'pick');
    const old = await F('lgCourseSnapshot')('c1', 'front', 'Gold');
    check('HOLES 2.3', 'legacy "front" still works', old && old.holes === 9 && old.mode === 'front9');
    const wk = await F('lgCourseSnapshot')('c1', { holes_mode: 'b9x2', nine: 'full18' }, 'Gold');
    check('HOLES 2.3', 'a week row is read for its holes_mode', wk && wk.mode === 'b9x2' && wk.holes === 18);
  }

  // ===================== D11: joiner fee on the roster + seeded handicap =====================
  {
    const DB = {
      league_seasons: [{ id: 'S1', name: 'Season 1', status: 'active', settings: { weeks: 10, money: { buyin: 100 } }, leagues: { name: 'L' } }],
      league_weeks: [1, 2, 3, 4, 5].map(n => ({ season_id: 'S1', week_number: n, status: 'final' })).concat([6, 7, 8, 9, 10].map(n => ({ season_id: 'S1', week_number: n, status: 'scheduled' }))),
      league_members: [{ id: 'm1', season_id: 'S1', activated_week: 1 }, { id: 'm9', season_id: 'S1', activated_week: 6 }],
      league_handicaps: [{ season_id: 'S1', member_id: 'm9', week_number: 6, source: 'provisional', suggested_basis: { seeded_from: 'bad_golf_index' }, effective: 12.4 }]
    };
    const roster = [{ id: 'm1', user_id: 'u0', display_name: 'Tyler', status: 'active', role: 'commissioner' }, { id: 'm9', display_name: 'Late Larry', status: 'active', role: 'player' }];
    install(DB, { league_roster: () => ({ data: roster, error: null }) });
    F("(lgWizHtml = function(){ return ''; }, leagueLogoHtml = function(){ return ''; }, lgSeasonCourse = async function(){ return { course_id: null }; }, lgSetupState = async function(){ return {}; }, lgSetupChecklistHtml = function(){ return ''; }, 1)");
    reset();
    try { await REAL.lgOpenSettings('S1'); } catch (e) { check('D11', 'settings renders', false, String(e && e.stack)); }
    const H = EL['league-body'].innerHTML;
    check('D11', 'roster row: joined in week 6 of 10, fee 50 of 100, equal share', /Joined in week 6 of 10 · fee 50 of 100 \(5 weeks left\), equal share of the prize pool/.test(H), (H.match(/Joined in week[^<]*/) || ['(none)'])[0]);
    check('D11', 'roster row: seeded handicap flagged, editable until he posts', /Bad Golf index — check it; you can change it until he posts/.test(H));
    check('D11', 'week-1 member has no proration line', (H.match(/Joined in week/g) || []).length === 1);
    // add-member toast
    install(DB, { league_add_member: () => ({ data: { member_id: 'm10' }, error: null }) });
    await F('lgAddMember')('S1', 'New Ned', null, null, null);
    check('D11', 'add-member mid-season: says the prorated fee and the seeded handicap', TOASTS.some(t => /New Ned is in from week 6 · fee 50 of 100 for the 5 weeks left/.test(t) && /Bad Golf index/.test(t)), TOASTS.join(' | '));
    // handicaps screen: an open week lets the seeded row (only) be edited
    const DB2 = { league_weeks: [{ season_id: 'S1', week_number: 6, status: 'open' }], league_seasons: [{ id: 'S1', settings: {} }],
                  league_handicaps: [{ season_id: 'S1', member_id: 'm9', week_number: 6, source: 'provisional', suggested_basis: { seeded_from: 'bad_golf_index' } }] };
    install(DB2, { league_suggest_handicaps: () => ({ data: [{ member_id: 'm1', name: 'Tyler', stored: 9, suggested: 9, capped: 9, previous: 9, rounds_used: 4 }, { member_id: 'm9', name: 'Late Larry', stored: 12.4, suggested: null, capped: null, previous: null, rounds_used: 0, cold_start: true }], error: null }) });
    F("(lgWizHtml = function(){ return ''; }, lgSeasonCourse = async function(){ return { course_id: null }; }, lgTeeSpreadHtml = function(){ return ''; }, 1)");
    reset();
    await REAL.lgOpenHandicaps('S1', 6);
    const HH = EL['league-body'].innerHTML;
    check('D11', 'handicaps: seeded row labelled', /from Bad Golf index — check it/.test(HH));
    check('D11', 'handicaps: in an open week the seeded box is editable, the others locked', /id="lg-hcp-1"[^>]*onblur/.test(HH) && /id="lg-hcp-0"[^>]*disabled/.test(HH), (HH.match(/<input id="lg-hcp-\d"[^>]*>/g) || []).join(' '));
    let sent = null;
    install({}, { league_set_handicaps: a => { sent = a; return { data: { conflicts: [] }, error: null }; } });
    F("(lgOpenHandicaps = async function(){}, 1)");
    ensure('lg-hcp-0').value = '9.0'; ensure('lg-hcp-1').value = '11.0'; ensure('lg-hcp-save');
    await F('lgSaveHandicaps')({ norender: true });
    check('D11', 'save in an open week sends only the seeded row', sent && sent.p_rows.length === 1 && sent.p_rows[0].member_id === 'm9' && sent.p_rows[0].effective === 11, JSON.stringify(sent && sent.p_rows));
    W._lgHcpSeedOnly = null;
  }

  // ===================== D12: dispute on a final week =====================
  {
    install({}, { league_dispute_card: () => ({ data: { disputed: false, reopen_requested: true, message: 'Week 3 is final, so this went to the commissioner as a request to reopen it. The results stand until he does.' }, error: null }) });
    F("(uiPrompt = async function(){ return 'wrong 7th'; }, 1)");
    await F('lgDisputeCard')('c1');
    check('D12', 'player told it is a reopen request and the results stand', TOASTS.some(t => /request to reopen/.test(t) && /results stand/.test(t)), TOASTS.join(' | '));
    // the commissioner cockpit (league screen) lists open reopen requests
    const DB = {
      league_seasons: [{ id: 'S1', name: 'Season 1', status: 'active', settings: {}, leagues: { name: 'L' } }],
      league_weeks: [{ id: 'w3', season_id: 'S1', week_number: 3, status: 'final', date: '2027-04-20' }],
      league_audit: [{ season_id: 'S1', action: 'reopen_requested', target_id: 'c1', at: '2027-04-21', after: { note: 'wrong 7th', week_id: 'w3', week_number: 3, status: 'open' } },
                     { season_id: 'S1', action: 'reopen_requested', target_id: 'c2', at: '2027-04-20', after: { note: 'old one', week_id: 'w3', week_number: 3, status: 'answered' } }]
    };
    install(DB, { league_roster: () => ({ data: [{ id: 'm1', user_id: 'u0', display_name: 'T', status: 'active', role: 'commissioner' }], error: null }), league_standings_get: () => ({ data: [], error: null }) });
    F("(leagueLogoHtml = function(){ return ''; }, lgSeasonCourse = async function(){ return { course_id: null }; }, _lgMyGroupCode = function(){ return null; }, 1)");
    reset();
    try { await REAL.lgOpenSeason('S1'); } catch (e) { check('D12', 'league screen renders', false, String(e && e.stack)); }
    const H = EL['league-body'].innerHTML;
    check('D12', 'commissioner sees an open reopen request with its note and a way to the week', /Reopen requests/.test(H) && /wrong 7th/.test(H) && /Open week/.test(H) && /results stand until you reopen/.test(H));
    check('D12', 'answered requests are not listed', !/old one/.test(H));
    install(DB, { league_roster: () => ({ data: [{ id: 'm2', user_id: 'u0', display_name: 'P', status: 'active', role: 'player' }], error: null }), league_standings_get: () => ({ data: [], error: null }) });
    F("(leagueLogoHtml = function(){ return ''; }, lgSeasonCourse = async function(){ return { course_id: null }; }, _lgMyGroupCode = function(){ return null; }, 1)");
    reset(); try { await REAL.lgOpenSeason('S1'); } catch (e) { check('D1x', 'league screen renders', false, String(e && e.stack)); }
    check('D12', 'a player does not see the commissioner list', !/Reopen requests/.test(EL['league-body'].innerHTML));
  }

  // ===================== D15: best N of M on the league screen =====================
  {
    const DB = { league_seasons: [{ id: 'S1', name: 'Season 1', status: 'active', settings: {}, leagues: { name: 'L' } }], league_weeks: [{ id: 'w1', season_id: 'S1', week_number: 1, status: 'final' }] };
    install(DB, { league_roster: () => ({ data: [], error: null }),
                  league_standings_get: () => ({ data: [{ rank: 1, name: 'Al', race: 'to_par_total', to_par: -3, weeks_played: 9, best_n: 8, of_weeks: 10, weeks_counted: 8, dropped_weeks: [4] }], error: null }) });
    F("(leagueLogoHtml = function(){ return ''; }, lgSeasonCourse = async function(){ return { course_id: null }; }, _lgMyGroupCode = function(){ return null; }, 1)");
    reset(); try { await REAL.lgOpenSeason('S1'); } catch (e) { check('D1x', 'league screen renders', false, String(e && e.stack)); }
    const H = EL['league-body'].innerHTML;
    check('D15', '"Best 8 of 10 weeks counting" on the league screen', /Best 8 of 10 weeks counting · 8 counted so far/.test(H));
    check('D15', 'the dropped week is named on the row', /not counting week 4/.test(H));
  }

  // ===================== D13 / SETUP-13 / error codes =====================
  {
    check('D13', 'play-the-course confirm says net bogey', /Score net bogey on every hole/.test(String(F('lgResolveAbsence'))) && !/net par on every hole/.test(String(F('lgResolveAbsence'))));
    const E2 = F('lgErrText');
    check('S2 codes', 'bare LEAGUE_SUB_ON_TEAM -> plain words', E2({ message: 'LEAGUE_SUB_ON_TEAM' }) === 'A sub can’t be on a team — subs fill seats week by week');
    check('S2 codes', 'bare LEAGUE_TEAM4_RETIRED -> plain words', /retired/.test(E2({ message: 'LEAGUE_TEAM4_RETIRED' })));
    check('S2 codes', 'coded message keeps the server sentence', E2({ message: 'LEAGUE_START_HOLE_INVALID: pick a starting hole from 2 to 18 (hole 1 is a normal 18)' }) === 'pick a starting hole from 2 to 18 (hole 1 is a normal 18)');
    ensure('lg-po').checked = true; ensure('lg-po-note'); ensure('lg-weeks').value = '10'; ensure('lg-weeks-val');
    W._lgShape = 'team'; F('lgSetWeeks')(10); F('lgPlayoffNote')();
    check('SETUP-13', 'team league playoff note says teams', /8 teams or fewer/.test(EL['lg-po-note'].innerHTML), EL['lg-po-note'].innerHTML);
    W._lgShape = 'field'; F('lgPlayoffNote')();
    check('SETUP-13', 'field league says players', /8 players or fewer/.test(EL['lg-po-note'].innerHTML));
  }

  console.log('\nC1 fixes: ' + PASS + ' passed, ' + FAIL + ' failed (' + (PASS + FAIL) + ' checks)');
  Object.keys(COV).sort().forEach(k => console.log('  ' + k + ' : ' + COV[k].run + ' / ' + COV[k].fail));
  if (FAILS.length) { console.log('\nFAILURES'); FAILS.forEach(f => console.log('  ' + f)); }
  setTimeout(() => process.exit(FAIL ? 1 : 0), 5);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
