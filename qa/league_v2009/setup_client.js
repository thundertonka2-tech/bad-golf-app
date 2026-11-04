// v2009 LEAGUE QA, track SETUP: client-side setup paths.
// Run: node qa/league_v2009/setup_client.js [golf-app.html]
// Loads the real app script in a VM (qa/app.js) and drives the setup functions with a
// fake Supabase + a tiny id-addressable DOM. Read-only: no network, nothing persisted.
'use strict';
const path = require('path');
const { loadApp } = require(path.join(__dirname, '..', 'app.js'));
const HTML = process.argv[2] || path.join(__dirname, '..', '..', 'golf-app.html');
const { qa, ctx } = loadApp(HTML);
const F = n => qa.fn(n);

let PASS = 0, FAIL = 0; const FAILS = []; const COV = {};
function check(area, label, cond, detail) {
  if (process.env.QV) process.stderr.write('.' + area + '|' + String(label).slice(0, 50) + '\n');
  const k = area; COV[k] = COV[k] || { run: 0, fail: 0 }; COV[k].run++;
  if (cond) PASS++; else { FAIL++; COV[k].fail++; FAILS.push('[' + area + '] ' + label + (detail ? '\n      ' + detail : '')); }
  return !!cond;
}

// ---------- id-addressable DOM ----------
const EL = {};
function mkEl(id) {
  const e = {
    id, style: {}, dataset: {}, value: '', checked: false, disabled: false, textContent: '', innerHTML: '', type: '',
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, on) { if (on === undefined ? !this._s.has(c) : on) this._s.add(c); else this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    addEventListener() {}, removeEventListener() {}, focus() {}, scrollIntoView() {}, setAttribute() {}, removeProperty() {},
    querySelector: () => null, querySelectorAll: () => [], appendChild() {}, insertBefore() {}, remove() {},
    get firstChild() { return this.innerHTML ? {} : null; },
  };
  e.style.removeProperty = () => {};
  return e;
}
const doc = ctx.document;
doc.getElementById = id => EL[id] || null;
let CHECKED = {};  // name -> value for querySelector('input[name=..]:checked')
doc.querySelector = sel => {
  const m = /input\[name="([^"]+)"\]:checked/.exec(sel);
  if (m) return CHECKED[m[1]] != null ? { value: CHECKED[m[1]] } : null;
  return null;
};
doc.querySelectorAll = () => [];
function ensure(id) { return (EL[id] = EL[id] || mkEl(id)); }

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
function install(DB, RPC) {
  CALLS = [];
  qa.install({ supa: makeSupa(DB, RPC), loadGame: () => null, roster: () => [], meName: () => 'QA' });
  F("(_authUser = { id: 'u0', email: 'qa@x' }, 1)");
  // neutralise navigation fan-out so a step does not go off and render five other screens
  F("(lgOpenSettings = async function(){ window.__nav = 'settings'; }, 1)");
  F("(lgOpenSeason = async function(){ window.__nav = 'season'; }, 1)");
  F("(lgOpenAddPlayerPicker = async function(){ window.__nav = 'picker'; }, 1)");
  F("(bgInvitePrompt = function(){}, 1)");
  F("(window._lgNextBusy = false, window._lgCreating = false, 1)");
}
const W = ctx.window;

(async function main() {
  // ===================== 1. Format/shape tables =====================
  const LG_GAMES = F('LG_GAMES'), LG_SHAPES = F('LG_SHAPES');
  const lgShapeOfFormat = F('lgShapeOfFormat'), lgGamesForShape = F('lgGamesForShape'), lgCompForFormat = F('lgCompForFormat');
  const lgTeamFormat = F('lgTeamFormat'), lgTwoCardTeam = F('lgTwoCardTeam'), lgStablefordFormat = F('lgStablefordFormat');
  // Oracle of league_set_format (server source, read-only dump)
  const SRV = fmt => {
    const comp = ['match', 'scramble', 'team_match', 'team_stableford', 'stroke_h2h', 'stableford_h2h'].includes(fmt) ? 'head_to_head' : 'field';
    const type = ['scramble', 'team_match', 'team_stableford'].includes(fmt) ? 'team_2man' : 'individual';
    const race = (comp === 'field' && fmt !== 'stableford') ? 'to_par_total' : 'points';
    const sys = ['stableford', 'team_stableford', 'stableford_h2h'].includes(fmt) ? 'stableford' : comp === 'field' ? 'net_stroke' : ['match', 'team_match'].includes(fmt) ? 'match_per_hole' : 'match_only';
    return { comp, type, race, sys };
  };
  const ALL = ['stroke_net', 'stableford', 'scramble', 'team_match', 'match', 'stroke_h2h', 'stableford_h2h', 'team_stableford'];
  const RETIRED = new Set(['match', 'stroke_h2h', 'stableford_h2h', 'team_stableford']);
  check('formats', 'LG_GAMES has exactly the 8 server formats', JSON.stringify(LG_GAMES.map(g => g.key).sort()) === JSON.stringify(ALL.slice().sort()));
  ALL.forEach(f => {
    const g = LG_GAMES.find(x => x.key === f);
    check('formats', f + ' retired flag', !!g.retired === RETIRED.has(f), 'retired=' + g.retired);
    const s = SRV(f);
    check('formats', f + ' comp mode client==server', lgCompForFormat(f) === s.comp, lgCompForFormat(f) + ' vs ' + s.comp);
    check('formats', f + ' type client==server', (lgTeamFormat(f) ? 'team_2man' : 'individual') === s.type);
    // create-screen derivation (lgSubmitCreate payload)
    const comp = lgCompForFormat(f);
    const race = (comp === 'field' && !lgStablefordFormat(f)) ? 'to_par_total' : 'points';
    const sys = lgStablefordFormat(f) ? 'stableford' : (comp === 'field') ? 'net_stroke' : (f === 'match' || f === 'team_match') ? 'match_per_hole' : 'match_only';
    check('formats', f + ' points.system create==set_format', sys === s.sys, sys + ' vs ' + s.sys);
    check('formats', f + ' season_race create==set_format', race === s.race, race + ' vs ' + s.race);
    check('formats', f + ' shape is one of field/h2h/team', ['field', 'h2h', 'team'].includes(lgShapeOfFormat(f)));
    check('formats', f + ' team rule offered only for two-card team', lgTwoCardTeam(f) === (f === 'team_match' || f === 'team_stableford'));
  });
  // lgGamesForShape: retired only when kept
  ['field', 'h2h', 'team'].forEach(sh => {
    const live = lgGamesForShape(sh).map(g => g.key);
    check('game screen', sh + ' offers no retired game when not kept', live.every(k => !RETIRED.has(k)) || sh === 'h2h', JSON.stringify(live));
    live.forEach(k => check('game screen', sh + ' lists only its own shape: ' + k, lgShapeOfFormat(k) === sh || sh === 'h2h'));
    ALL.forEach(keep => {
      const g = lgGamesForShape(sh, keep).map(x => x.key);
      if (RETIRED.has(keep) && lgShapeOfFormat(keep) === sh) check('game screen', sh + ' keeps retired ' + keep + ' visible', g.includes(keep), JSON.stringify(g));
      if (RETIRED.has(keep) && lgShapeOfFormat(keep) !== sh) check('game screen', sh + ' does not leak retired ' + keep, !g.includes(keep), JSON.stringify(g));
    });
  });
  // h2h shape with NO keep: every h2h game is retired -> fallback lists every live game (cross-shape!)
  const h2hNoKeep = lgGamesForShape('h2h').map(g => g.key);
  check('game screen', 'h2h shape with nothing kept does not offer other shapes\' games', h2hNoKeep.every(k => lgShapeOfFormat(k) === 'h2h'),
        'lgGamesForShape("h2h") = ' + JSON.stringify(h2hNoKeep) + ' (fallback to all live games; picking team_match would flip an old h2h season to teams)');
  // shapes
  check('create', 'create screen offers field + team only', JSON.stringify(LG_SHAPES.filter(s => !s.retired).map(s => s.key)) === '["field","team"]');
  check('create', 'team shape default game = scramble', F("lgShape('team')").format === 'scramble');
  check('create', 'retired h2h shape still resolvable', F("lgShape('h2h')").key === 'h2h' && F("lgShapeOfSettings({type:'individual',format:'match'})") === 'h2h');
  check('create', 'old season stroke_h2h resolves to h2h shape', F("lgShapeOfSettings({type:'individual',format:'stroke_h2h'})") === 'h2h');
  check('create', 'old team_stableford resolves to team shape', F("lgShapeOfSettings({type:'team_2man',format:'team_stableford'})") === 'team');
  check('create', 'unknown format falls back to field shape', F("lgShapeOfSettings({})") === 'field');

  // ===================== 2. Weeks slider + playoff note =====================
  ['lg-weeks', 'lg-weeks-val', 'lg-po', 'lg-po-note', 'lg-fit-note'].forEach(ensure);
  for (const raw of [-5, 0, 1, 5, 6, 7, 8, 9, 11, 12, 13, 40, 'abc', '', null, 7.6]) {
    F('lgSetWeeks')(raw);
    const w = F('lgWeeksValue')();
    const exp = (parseInt(raw, 10) || 12);
    const expC = Math.max(6, Math.min(12, exp));
    check('weeks slider', 'lgSetWeeks(' + JSON.stringify(raw) + ') clamps to ' + expC, w === expC, 'got ' + w);
  }
  for (let w = 6; w <= 12; w++) {
    F('lgSetWeeks')(w);
    EL['lg-po'].checked = true; F('lgPlayoffNote')();
    const note = EL['lg-po-note'].innerHTML;
    if (w >= 8) check('playoffs', w + 'wk note: up to 2 weeks / top 4 / top 2 for <=8', /up to 2 weeks/.test(note) && new RegExp('runs <strong>' + (w + 2) + ' weeks').test(note) && /8 players or fewer it is a top 2/.test(note), note);
    else check('playoffs', w + 'wk note: 1 week top 2', /Adds <strong>1 week/.test(note) && new RegExp((w + 1) + ' weeks').test(note), note);
    // team league: note says "8 players or fewer" though the server counts ENTRANTS (teams)
    EL['lg-po'].checked = false; F('lgPlayoffNote')();
    check('playoffs', w + 'wk note hidden when off', EL['lg-po-note'].style.display === 'none' && EL['lg-po-note'].innerHTML === '');
  }

  // ===================== 3. lgSubmitCreate payload =====================
  for (const shape of ['field', 'team']) for (const holes of [9, 18]) for (const w of [6, 7, 8, 12]) for (const po of [false, true]) {
    let payload = null;
    install({}, { league_create_season: a => { payload = a.p_payload; return { data: { season_id: 'S1' }, error: null }; },
                  league_set_any_course: () => ({ data: {}, error: null }) });
    F("(lgOpenGame = async function(){ window.__nav = 'game'; }, 1)");
    Object.keys(EL).forEach(k => delete EL[k]);
    ['lg-create-btn', 'lg-create-err', 'league-body', 'lg-commish-plays-create', 'lg-selfsched-create', 'lg-anycourse-create'].forEach(ensure);
    ensure('lg-name').value = 'QA League'; ensure('lg-start').value = '2027-04-06'; ensure('lg-tz').value = 'America/Chicago';
    ensure('lg-holes').value = String(holes); ensure('lg-dues').value = '25'; ensure('lg-po').checked = po;
    EL['lg-commish-plays-create'].checked = true;
    W._lgShape = shape; W._lgWeeks = w; W._lgCreating = false;
    await F('lgSubmitCreate')();
    const tag = shape + '/' + holes + 'h/' + w + 'w/po=' + po;
    if (!check('create payload', tag + ' RPC called', !!payload)) continue;
    const s = payload.settings;
    const fmt = shape === 'team' ? 'scramble' : 'stroke_net';
    const sv = SRV(fmt);
    check('create payload', tag + ' format/comp/type', s.format === fmt && s.competition_mode === sv.comp && s.type === sv.type, JSON.stringify([s.format, s.competition_mode, s.type]));
    check('create payload', tag + ' points.system/race == set_format', s.points.system === sv.sys && s.points.season_race === sv.race);
    check('create payload', tag + ' team_rule', s.team_rule === (shape === 'team' ? 'scramble' : undefined));
    const q = po ? (w >= 8 ? 4 : 2) : 0;
    check('create payload', tag + ' playoffs', (po ? (s.playoffs.enabled && s.playoffs.qualifiers === q && s.playoffs.auto) : !s.playoffs.enabled) && s.playoff_weeks === (q === 4 ? 2 : q === 2 ? 1 : 0), JSON.stringify(s.playoffs) + ' pw=' + s.playoff_weeks);
    check('create payload', tag + ' holes/default nine', s.base_holes === holes && s.default_nine === (holes === 9 ? 'rotate' : 'full18'));
    check('create payload', tag + ' buy-in + payout default', s.money.buyin === 25 && s.money.payout === 'winner_take_all');
    check('create payload', tag + ' best-N only for field', shape === 'field' ? s.points.count_best_n_weeks === Math.max(1, Math.round(w * 0.75)) : s.points.count_best_n_weeks === null);
    check('create payload', tag + ' weeks', payload.weeks === w && s.weeks === w);
  }
  // guards
  {
    install({}, { league_create_season: () => ({ data: { season_id: 'S1' }, error: null }) });
    Object.keys(EL).forEach(k => delete EL[k]);
    ['lg-create-btn', 'lg-create-err', 'league-body', 'lg-start', 'lg-tz', 'lg-holes', 'lg-dues', 'lg-po'].forEach(ensure);
    ensure('lg-name').value = '  ';
    await F('lgSubmitCreate')();
    check('create', 'blank name refused with message under the button', !CALLS.length && /Give the league a name/.test(EL['lg-create-err'].textContent) && EL['lg-create-err'].style.display === 'block');
    EL['lg-name'].value = 'X'; EL['lg-start'].value = '';
    await F('lgSubmitCreate')();
    check('create', 'missing start date refused', !CALLS.length && /date of the first week/.test(EL['lg-create-err'].textContent));
    EL['lg-start'].value = '2027-01-01'; EL['lg-dues'].value = '99999';
    let p = null; install({}, { league_create_season: a => { p = a.p_payload; return { data: { season_id: 'S1' }, error: null }; } });
    F("(lgOpenGame = async function(){}, 1)");
    W._lgCreating = false; await F('lgSubmitCreate')();
    check('create', 'fee clamped at 10,000', p && p.settings.money.buyin === 10000, p && p.settings.money.buyin);
    EL['lg-dues'].value = '-5'; W._lgCreating = false; await F('lgSubmitCreate')();
    check('create', 'negative fee -> 0', p && p.settings.money.buyin === 0);
    // team shape with self-schedule ticked is forced off
    W._lgShape = 'team'; ensure('lg-selfsched-create').checked = true; W._lgCreating = false; await F('lgSubmitCreate')();
    check('create', 'self-posting forced off for team shape', p && p.settings.play.self_scheduled === false);
  }

  // ===================== 4. Wizard step lists / gating =====================
  const lgWizSteps = F('lgWizSteps');
  const base = { members: 0, matchups: 0, handicaps: 0, course: null, game: false, type: 'individual', teams: 0, money: false, sideGames: false, hcpRules: false };
  const keys = st => lgWizSteps(st).map(s => s.key).join(',');
  check('wizard', 'individual h2h list', keys(Object.assign({}, base)) === 'game,players,course,schedule,handicaps,hcprules,money,sidegames', keys(base));
  check('wizard', 'team list includes teams', keys(Object.assign({}, base, { type: 'team_2man' })) === 'game,players,teams,course,schedule,handicaps,hcprules,money,sidegames');
  check('wizard', 'field drops schedule', keys(Object.assign({}, base, { field: true })) === 'game,players,course,handicaps,hcprules,money,sidegames');
  check('wizard', 'self-posting drops side games', !/sidegames/.test(keys(Object.assign({}, base, { field: true, selfOn: true }))));
  check('wizard', 'any-course drops course', !/course/.test(keys(Object.assign({}, base, { field: true, selfOn: true, anyCourse: true }))));
  // routing order oracle: every combination of done flags routes to the first undone wizard step
  const ROUTE_MAP = { lgOpenGame: 'game', lgOpenSettings: 'players', lgOpenTeams: 'teams', lgOpenCourse: 'course', lgBuildSchedule: 'schedule', lgOpenHandicaps: 'handicaps', lgOpenHcpRules: 'hcprules', lgOpenMoneySetup: 'money', lgOpenSideGames: 'sidegames' };
  let routeRuns = 0;
  for (let mask = 0; mask < 512; mask++) {
    for (const shape of ['ind', 'team', 'field']) {
      const b = i => !!(mask & (1 << i));
      const st = { game: b(0), members: b(1) ? 4 : 1, teams: shape === 'team' ? (b(2) ? 2 : 0) : 0, teamsShort: 0,
                   course: b(3) ? 'c1' : null, matchups: shape === 'field' ? true : (b(4) ? 1 : 0), handicaps: b(5) ? 1 : 0,
                   hcpRules: b(6), money: b(7), sideGames: b(8), type: shape === 'team' ? 'team_2man' : 'individual', field: shape === 'field' };
      let routed = null;
      install({}, {});
      F('(lgSetupState = async function(){ return ' + JSON.stringify(st) + '; }, 1)');
      Object.keys(ROUTE_MAP).forEach(fn => F('(' + fn + ' = async function(){ window.__routed = "' + ROUTE_MAP[fn] + '"; }, 1)'));
      F('(lgOpenSeason = async function(){ window.__routed = "done"; }, 1)');
      W.__routed = null; W._lgPickerOfferedFor = 'x';
      await F('_lgNextSetupStepInner')('S1');
      routed = W.__routed || (W.__nav === 'settings' ? 'players' : null); W.__nav = null;
      const steps = lgWizSteps(st);
      const first = steps.find(s => !s.done);
      const exp = first ? first.key : 'done';
      routeRuns++;
      check('wizard routing', shape + ' mask=' + mask.toString(2).padStart(9, '0'), routed === exp, 'routed=' + routed + ' wizard first undone=' + exp);
    }
  }
  // wizard dots: steps past the first unfinished are locked (no onclick)
  {
    W._lgSetupSt = Object.assign({}, base, { game: true, members: 3 }); W._lgSetupStSid = 'S1';
    const h = F('lgWizHtml')('S1', 'course');
    const dots = (h.match(/<button type="button" class="bg-btn t2-wiz-dot[^>]*>/g) || []);
    const locked = dots.filter(d => / lk/.test(d));
    check('wizard', 'dots after first undone are locked and unclickable', locked.length === 5 && locked.every(d => !/onclick/.test(d)), dots.length + ' dots / ' + locked.length + ' locked');
    check('wizard', 'blocked step button says Finish this step', /Finish this step/.test(h) && / blocked/.test(h));
    check('wizard', 'Step x of y count', /Step 3 of 8/.test(h), (h.match(/Step \d+ of \d+/) || [''])[0]);
    W._lgSetupSt = Object.assign({}, base, { game: true, members: 3, started: true });
    check('wizard', 'no wizard once a week has started', F('lgWizHtml')('S1', 'course') === '');
  }
  // checklist vs wizard agree (league screen "Getting set up")
  {
    const cl = F('lgSetupChecklistHtml');
    const st = { game: true, members: 3, course: 'c', matchups: 1, handicaps: 1, ready: true, type: 'individual', hcpRules: false, money: false, sideGames: false };
    const h = cl('S1', st);
    check('wizard', 'season checklist disappears while hcp rules / money / side games still undone', h !== '', 'checklist hidden although the wizard still has 3 steps');
    const st2 = { game: true, members: 3, course: 'c', matchups: 1, handicaps: 0, ready: true, type: 'team_2man', teams: 0 };
    const h2 = cl('S1', st2);
    check('wizard', 'season checklist lists the Teams step for a team league', /team/i.test(h2.replace(/Two-man|Stroke, match, stableford or scramble/g, '')), 'no Teams row in ' + (h2.match(/font-size:14px[^>]*>([^<]+)/g) || []).join(' | '));
    check('wizard', 'checklist hint names only live games', !/match, stableford or scramble/.test(cl('S1', { game: false, members: 0, course: null, matchups: 0 })), 'hint still offers "Stroke, match, stableford or scramble" — match play is retired');
  }

  // ===================== 5. Game screen save payload =====================
  for (const f of ALL) for (const rule of ['bestball', 'aggregate']) {
    let sent = null;
    install({}, { league_set_format: a => { sent = a; return { data: { format: a.p_format, changed: true }, error: null }; } });
    F("(lgNextSetupStep = function(){}, 1)");
    CHECKED = { 'lg-game': f }; W._lgTeamRule = rule;
    ensure('lg-game-save');
    await F('lgSaveGame')('S1');
    check('game save', f + '/' + rule + ' sends team rule only for two-card team', lgTwoCardTeam(f) ? sent.p_team_rule === rule : !('p_team_rule' in sent), JSON.stringify(sent));
  }
  // switching between field games keeps pairings warning quiet; field->team warns
  {
    ensure('lg-game-warn'); ensure('lg-team-rule-card');
    W._lgGameWas = 'stroke_net'; F('lgGamePick')('stableford');
    check('game screen', 'stroke->stableford no pairing warning', EL['lg-game-warn'].textContent === '');
    F('lgGamePick')('scramble');
    check('game screen', 'stroke->scramble warns pairings cleared', /pairings already generated are cleared/.test(EL['lg-game-warn'].textContent));
    check('game screen', 'scramble hides team rule card', EL['lg-team-rule-card'].style.display === 'none');
    F('lgGamePick')('team_match');
    check('game screen', 'team match shows team rule card', EL['lg-team-rule-card'].style.display === '');
    W._lgGameWas = 'scramble'; F('lgGamePick')('team_match');
    check('game screen', 'scramble->team_match no pairing warning (same comp/type)', EL['lg-game-warn'].textContent === '');
  }


  // ===================== 5b. Shape screen Save with no change =====================
  for (const [fmt, type] of [['stableford','individual'],['stroke_net','individual'],['team_match','team_2man'],['scramble','team_2man'],['stroke_h2h','individual'],['stableford_h2h','individual'],['match','individual'],['team_stableford','team_2man']]) {
    let sent = null;
    install({}, { league_set_format: a => { sent = a; return { data: { format: a.p_format, changed: a.p_format !== fmt }, error: null }; } });
    F("(lgOpenGame = async function(){}, 1)");
    const shape = F('lgShapeOfSettings')({ format: fmt, type });
    CHECKED = { 'lg-shp': shape }; ensure('lg-shape-save');
    await F('lgSaveShape')('S1');
    check('shape screen', fmt + ': Save on the unchanged format keeps the game', sent && sent.p_format === fmt, 'sends p_format=' + (sent && sent.p_format) + ' -> the season\'s game silently becomes ' + (sent && sent.p_format));
  }

  // ===================== 6. Handicaps screen save logic =====================
  // note required at |v - suggested| >= 2 ; floating drift at exactly 2.0
  {
    let drift = 0, total = 0;
    for (let a = 0; a <= 540; a++) for (const d of [2.0, -2.0]) {
      const v = a / 10, s = Math.round((v - d) * 10) / 10;
      if (s < -10 || s > 54) continue;
      total++;
      const vv = Math.min(54, Math.max(-10, Math.round(v * 10) / 10));
      if (!(Math.abs(vv - s) >= 2)) drift++;
    }
    check('handicaps', 'client asks for a note on every exact 2.0 move (server requires one)', drift === 0, drift + ' of ' + total + ' exact-2.0 overrides skip the client prompt (float: 2.3-0.3=1.9999999999999998) and then fail at the server with a raw error');
  }
  // manual source on a non-cold row bypasses the server note rule
  {
    let sent = null;
    install({}, { league_set_handicaps: a => { sent = a; return { data: { conflicts: [], weeks: 8 }, error: null }; } });
    F("(lgNextSetupStep = function(){}, 1)");
    W._lgSeason = 'S1'; W._lgHcpWeek = 1; W._lgHcpScramble = false;
    W._lgHcpRows = [{ member_id: 'm1', name: 'A', suggested: 10, capped: 10, previous: 10, stored: 10, cold_start: false, rounds_used: 3 },
                    { member_id: 'm2', name: 'B', suggested: null, capped: null, previous: null, stored: null, cold_start: true, rounds_used: 0 }];
    ensure('lg-hcp-0').value = '10.0'; EL['lg-hcp-0'].dataset.orig = '10.0';
    ensure('lg-hcp-1').value = ''; ensure('lg-hcp-save');
    const r = await F('lgSaveHandicaps')();
    check('handicaps', 'blank box on non-scramble blocks save with a count', r === false && !sent);
    EL['lg-hcp-1'].value = '7';
    await F('lgSaveHandicaps')();
    check('handicaps', 'cold-start row saved as manual, accepted row as accepted', sent && sent.p_rows[0].source === 'accepted' && sent.p_rows[1].source === 'manual', sent && JSON.stringify(sent.p_rows.map(x => x.source)));
    check('handicaps', 'CAS: expect_previous carried from render', sent && sent.p_rows[0].expect_previous === 10 && sent.p_rows[1].expect_previous === null);
    // scramble blank -> 0
    sent = null; W._lgHcpScramble = true; EL['lg-hcp-1'].value = '';
    await F('lgSaveHandicaps')();
    check('handicaps', 'scramble blank saves 0.0', sent && sent.p_rows[1].effective === 0);
    // range clamp
    W._lgHcpScramble = false; EL['lg-hcp-1'].value = '900';
    await F('lgSaveHandicaps')();
    check('handicaps', 'client clamps 900 -> 54', sent && sent.p_rows[1].effective === 54);
    EL['lg-hcp-1'].value = '-40'; await F('lgSaveHandicaps')();
    check('handicaps', 'client clamps -40 -> -10', sent && sent.p_rows[1].effective === -10);
  }
  // lgHcpFix
  {
    const fx = F('lgHcpFix');
    [['12.34', '12.3'], ['55', '54'], ['-11', '-10'], ['abc', '9.0']].forEach(([inp, out]) => {
      const e = mkEl('x'); e.value = inp; e.dataset.orig = '9.0'; fx(e);
      check('handicaps', 'lgHcpFix ' + inp + ' -> ' + out, e.value === out, e.value);
    });
  }

  // ===================== 7. Launch strokes honour par-3 rule like the card does =====================
  // client strokesOnHole with noPar3Strokes (round engine) vs posted card (server): see SETUP-1
  {
    const soh = F('strokesOnHole');
    if (typeof soh === 'function') {
      const r = soh(18, 15, 3, { noPar3Strokes: true, holes: 18 }, 18);
      check('hcp rules', 'live round gives 0 strokes on a par 3 with the rule on', r === 0, 'strokesOnHole = ' + r + ' (the live round honours the rule; the POSTED card does not, see SETUP-1)');
    }
  }

  // ===================== 8. Money setup: payouts & pot defaults =====================
  {
    const P = F('LG_PAYOUTS'), L = F('LG_PAYOUT_LEGACY');
    check('money', 'live payouts = 100 / 80-20 / 70-30', JSON.stringify(P.map(p => p.key)) === '["winner_take_all","80_20","70_30"]');
    check('money', 'legacy names = 60/40, 50/30/20, 40/30/20/10', JSON.stringify(Object.keys(L)) === '["60_40","50_30_20","40_30_20_10"]');
    ['winner_take_all', '80_20', '70_30', '60_40', '50_30_20', '40_30_20_10', undefined, 'bogus'].forEach(k => {
      const h = F('lgPayoutPickerHtml')(k);
      const sel = (h.match(/value="([^"]+)" checked/) || [])[1];
      const exp = (k && (P.some(p => p.key === k) || L[k])) ? k : (k === undefined ? 'winner_take_all' : null);
      check('money', 'payout picker shows ' + k + ' ticked', exp === null ? !sel : sel === exp, 'ticked=' + sel);
    });
    // Rules page label for each payout
    for (const k of ['winner_take_all', '80_20', '70_30', '60_40', '50_30_20', '40_30_20_10']) {
      install({ league_seasons: [{ id: 'S1', name: 'S', schedule_mode: 'calendar', start_date: '2027-04-06', settings: { format: 'stroke_net', competition_mode: 'field', weeks: 8, base_holes: 18, points: { system: 'net_stroke' }, money: { buyin: 50, payout: k } } }] }, {});
      const body = ensure('league-body');
      F("(lgPaint = function(b,h){ b.innerHTML = h; }, 1)");
      await F('lgOpenRules')('S1');
      const want = { winner_take_all: 'to the winner', '80_20': '80 / 20', '70_30': '70 / 30', '60_40': '60 / 40', '50_30_20': '50 / 30 / 20', '40_30_20_10': '40 / 30 / 20 / 10' }[k];
      check('rules page', 'payout ' + k + ' shown as "' + want + '"', body.innerHTML.indexOf('awarded ' + want) >= 0, (body.innerHTML.match(/awarded [^<]*/) || ['(none)'])[0]);
    }
  }
  // Rules page accuracy vs settings (one representative per format)
  {
    const cases = [
      { f: 'stroke_net', cm: 'field', sys: 'net_stroke', wantFmt: 'Everyone against the field', wantSys: 'Position points' },
      { f: 'stableford', cm: 'field', sys: 'stableford', wantFmt: 'Everyone against the field', wantSys: 'Stableford' },
      { f: 'scramble', cm: 'head_to_head', sys: 'match_only', wantFmt: 'Team', wantSys: 'One point for the match' },
      { f: 'team_match', cm: 'head_to_head', sys: 'match_per_hole', wantFmt: 'Team', wantSys: 'A point a hole' },
      { f: 'match', cm: 'head_to_head', sys: 'match_per_hole', wantFmt: 'Head-to-head match play', wantSys: 'A point a hole' },
      { f: 'stroke_h2h', cm: 'head_to_head', sys: 'match_only', wantFmt: 'Head-to-head', wantSys: 'One point for the match' },
      { f: 'stableford_h2h', cm: 'head_to_head', sys: 'stableford', wantFmt: 'Head-to-head', wantSys: 'Stableford' },
      { f: 'team_stableford', cm: 'head_to_head', sys: 'stableford', wantFmt: 'Team', wantSys: 'Stableford' },
    ];
    for (const c of cases) {
      install({ league_seasons: [{ id: 'S1', name: 'S', schedule_mode: 'calendar', start_date: '2027-04-06', settings: { format: c.f, competition_mode: c.cm, type: lgTeamFormat(c.f) ? 'team_2man' : 'individual', weeks: 8, base_holes: 18, points: { system: c.sys }, hcp_rules_set: true, hcp_rules: { pct: 80, basis: 'lowest', noPar3Strokes: true, maxScore: { mode: 'dbl' } } } }] }, {});
      const body = ensure('league-body');
      F("(lgPaint = function(b,h){ b.innerHTML = h; }, 1)");
      await F('lgOpenRules')('S1');
      const H = body.innerHTML;
      const fmtRow = (H.match(/>Format<\/div><div[^>]*>([^<]*)/) || [])[1] || '';
      const sysRow = (H.match(/>System<\/div><div[^>]*>([^<]*)/) || [])[1] || '';
      check('rules page', c.f + ' Format row "' + fmtRow + '" matches', fmtRow.indexOf(c.wantFmt) >= 0, 'want ~' + c.wantFmt);
      check('rules page', c.f + ' System row "' + sysRow + '" matches', sysRow.indexOf(c.wantSys) >= 0, 'want ~' + c.wantSys);
      if (c.f === 'stroke_net') {
        check('rules page', 'Rules page shows handicap rules (80%, lowest, par-3, max)', /80%|lowest|par 3|double bogey/i.test(H), 'no handicap-rules section at all');
        // (removed: '21 points' is what league_open_week really uses for net_stroke: holes + match_bonus)
        check('rules page', 'field to-par league says it is ranked on to-par, not percentage', !/Percentage of the points/.test(H), 'stroke_net field season_race=to_par_total, Rules page says ranked on % of points');
        check('rules page', 'field league does not claim head-to-head tiebreak', !/Head-to-head, then/.test(H), (H.match(/Ties broken by<\/div><div[^>]*>([^<]*)/) || [])[1]);
      }
    }
    // weekly pots: GIRs / putts not listed; skins "carries to next week" vs server (dead hole, no carry)
    install({ league_seasons: [{ id: 'S1', name: 'S', schedule_mode: 'calendar', start_date: '2027-04-06', settings: { format: 'stroke_net', competition_mode: 'field', weeks: 8, base_holes: 18, points: { system: 'net_stroke' }, money: { buyin: 0, payout: 'winner_take_all', weekly: { skins: { on: true, amount: 5 }, most_girs: { on: true, amount: 5 }, fewest_putts: { on: true, amount: 5 } } } } }] }, {});
    const body = ensure('league-body'); F("(lgPaint = function(b,h){ b.innerHTML = h; }, 1)");
    await F('lgOpenRules')('S1');
    check('rules page', 'GIR / putts pots listed', /Most GIRs/.test(body.innerHTML) && /Fewest putts/i.test(body.innerHTML), 'Rules page omits most_girs / fewest_putts');
    check('rules page', 'skins tie text matches server (tied hole is dead, no carry)', !/It carries to next week/.test(body.innerHTML), 'says "Nobody wins the skins: It carries to next week"; league_money_recompute treats tied holes as dead and nothing carries');
  }
  // Money screen: dirty check + save cover GIR/putts pots
  {
    let sent = null;
    install({}, { league_set_money_settings: a => { sent = a; return { data: { ok: true }, error: null }; } });
    F("(lgOpenMoney = async function(){}, 1)");
    Object.keys(EL).forEach(k => delete EL[k]);
    ['skins', 'lowest_net', 'ctp', 'longest_drive', 'longest_putt', 'most_girs', 'fewest_putts'].forEach(k => { ensure('lgm-' + k + '-on').checked = true; ensure('lgm-' + k + '-amt').value = '5'; });
    ensure('lgm-buyin').value = '50'; ensure('lgm-payout').value = '70_30'; ensure('lgm-longest_drive-hole').value = '';
    await F('lgSaveMoneySettings')('S1', { norender: true });
    check('money', 'save sends most_girs / fewest_putts', sent && sent.p_money.weekly.most_girs && sent.p_money.weekly.fewest_putts, sent && JSON.stringify(Object.keys(sent.p_money.weekly)));
    EL['lgm-most_girs-on'].dataset.orig = ''; EL['lgm-most_girs-on'].checked = true;
    ['skins', 'lowest_net', 'ctp', 'longest_drive', 'longest_putt'].forEach(k => { EL['lgm-' + k + '-on'].dataset.orig = '1'; EL['lgm-' + k + '-amt'].dataset.orig = '5'; });
    EL['lgm-buyin'].dataset.orig = '50'; EL['lgm-payout'].dataset.orig = '70_30'; EL['lgm-longest_drive-hole'].dataset.orig = '';
    check('money', 'unsaved-change check sees a GIR/putts toggle', F('lgMoneyDirty')() === true, 'lgMoneyDirty ignores most_girs / fewest_putts');
  }

  // ===================== 9. Team fit advice (players count) =====================
  for (let w = 6; w <= 12; w++) {
    const h = F('lgFitAdvice')('team', w);
    const big = (h.match(/font-size:19px[^>]*>([^<]*)/) || [])[1] || '';
    const nums = (big.match(/\d+/g) || []).map(Number);
    const ok = nums.every(n => (n % 2 === 0 ? n - 1 : n) === w || (n % 2 === 0 ? n - 1 : n) === w - 1);
    check('create', 'team ' + w + 'wk headline counts fit', nums.length && ok, big);
  }

  // ===================== report =====================
  console.log('\nSETUP client: ' + PASS + ' passed, ' + FAIL + ' failed (' + (PASS + FAIL) + ' checks)');
  Object.keys(COV).sort().forEach(k => console.log('  ' + k + ' : ' + COV[k].run + ' / ' + COV[k].fail));
  if (FAILS.length) { console.log('\nFAILURES'); FAILS.forEach(f => console.log('  ' + f)); }
  setTimeout(() => process.exit(FAIL ? 1 : 0), 5);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
