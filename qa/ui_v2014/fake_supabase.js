/* qa/ui_v2014/fake_supabase.js -- served IN PLACE OF lib/supabase.min.js by run_ui.js.
   Defines window.supabase.createClient() returning an in-memory fake with a signed-in
   (or signed-out, when window.__BG_SIGNED_OUT) user and seeded tables.
   Records every table/rpc touched in window.__fakeLog. */
(function () {
  'use strict';
  var SIGNED_OUT = !!window.__BG_SIGNED_OUT;
  var U1 = '11111111-1111-4111-8111-111111111111';
  var UK = '22222222-2222-4222-8222-222222222222';
  var UH = '33333333-3333-4333-8333-333333333333';
  var UB = '44444444-4444-4444-8444-444444444444';
  var NOW = Date.now();
  var iso = function (ms) { return new Date(ms).toISOString(); };
  var USER = { id: U1, email: 'idrive@test.dev', aud: 'authenticated', role: 'authenticated',
    user_metadata: { full_name: 'IDrive Bombs', name: 'IDrive Bombs' }, app_metadata: { provider: 'email' }, created_at: iso(NOW - 400 * 864e5) };
  var SESSION = { access_token: 'fake-at', refresh_token: 'fake-rt', expires_in: 3600, expires_at: Math.floor(NOW / 1000) + 3600, token_type: 'bearer', user: USER };

  var PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
  var SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
  var TEES = [{ label: 'Blue', slope: 127, rating: 72.2, yards: 6600 }, { label: 'White', slope: 121, rating: 70.1, yards: 6150 }];
  var NAMES = ['IDrive Bombs', 'Kevin Wells', 'Hoon Park', 'Britt Kerbo'];
  var UIDS = [U1, UK, UH, UB];
  function mkRound(code, opts) {
    opts = opts || {};
    var players = NAMES.map(function (n, i) { return { id: 'p' + i + code, name: n, firstName: n.split(' ')[0], lastName: n.split(' ')[1], hcp: [6, 10, 14, 18][i], rawHcp: [6, 10, 14, 18][i], baseHcp: [6, 10, 14, 18][i], teeLabel: 'Blue', uid: UIDS[i], playsGross: false }; });
    var ids = players.map(function (p) { return p.id; });
    var scores = {}, putts = {};
    var thru = opts.thru == null ? 18 : opts.thru;
    players.forEach(function (p, i) {
      var a = [], pu = [];
      for (var h = 0; h < 18; h++) { a.push(h < thru ? PARS[h] + ((h + i) % 3 === 0 ? 1 : 0) + (i === 3 && h % 5 === 0 ? 1 : 0) - ((h * 7 + i) % 11 === 0 ? 1 : 0) : null); pu.push(h < thru ? 1 + ((h + i) % 3 ? 1 : 0) : null); }
      scores[p.id] = a; putts[p.id] = pu;
    });
    var P = { participants: ids, participantNames: NAMES.slice() };
    var nI = Object.assign({ value: 10, net: true, format: 'stroke', segments: 'fbo', pair: [NAMES[0], NAMES[1]] }, { participants: [ids[0], ids[1]], participantNames: [NAMES[0], NAMES[1]] });
    var mI = { value: 20, net: true, pair: [NAMES[0], NAMES[2]], participants: [ids[0], ids[2]], participantNames: [NAMES[0], NAMES[2]] };
    var g = {
      code: code, players: players, scores: scores, pars: PARS.slice(), sis: SIS.slice(), tees: TEES, holes: 18,
      hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: 18 }, course: 'Buffalo Creek Golf Club', courseId: 'buffalo-creek',
      trackPutts: true, puttsData: putts,
      games: {
        skins: Object.assign({ mode: 'perskin', value: 5, buyin: 0, tieRule: 'carry', require: 'none', hcpPct: 100 }, P),
        nassau: Object.assign({}, nI, { instances: [nI] }),
        match: Object.assign({}, mI, { instances: [mI] }),
        wolf: Object.assign({ value: 5 }, P),
        ctp: Object.assign({ value: 5, holes: [4, 17] }, P)
      },
      wolfData: { holes: {} }, ctpData: { '4': { pid: ids[1], ft: 6, in: 2 } },
      createdBy: U1, createdAt: opts.createdAt || (NOW - 3 * 3600e3), updatedAt: NOW - 60e3,
      finishedAt: opts.finished ? (NOW - 3600e3) : null, startHole: 1
    };
    for (var h = 1; h <= thru; h++) g.wolfData.holes[h] = (h % 4 === 0) ? { choice: 'lone' } : { choice: 'partner', partnerId: ids[(h % 3) + 1] };
    if (opts.t2) g.t2 = opts.t2;
    return g;
  }
  var FIN1 = mkRound('FIN1QA', { finished: true, createdAt: NOW - 3 * 864e5 });
  var FIN2 = mkRound('FIN2QA', { finished: true, createdAt: NOW - 10 * 864e5 });
  var LIVE1 = mkRound('LIVE1QA', { thru: 7, createdAt: NOW - 2 * 3600e3 });
  var TID = 'aaaaaaaa-0000-4000-8000-000000000001';
  var TID2 = 'aaaaaaaa-0000-4000-8000-000000000002';
  var DAY1 = 'dddddddd-0000-4000-8000-000000000001', DAY2 = 'dddddddd-0000-4000-8000-000000000002';
  var G1 = 'eeeeeeee-0000-4000-8000-000000000001', G2 = 'eeeeeeee-0000-4000-8000-000000000002';
  var EV1 = mkRound('EVT1QA', { thru: 9, t2: { tournamentId: TID, day: 1, groupId: G1, group: 1 } });
  function recentRow(g) { return { code: g.code, course: g.course, players: g.players.map(function (p) { return p.name; }).join(', '), scoreLine: 'IDrive 76 · Kevin 80', createdBy: U1, uids: UIDS.slice(), createdAt: g.createdAt, updatedAt: g.updatedAt, finishedAt: g.finishedAt, t2: g.t2 || null, lg: null }; }
  var roster = NAMES.map(function (n, i) { return { name: n, hcp: [6, 10, 14, 18][i], uid: UIDS[i], email: i === 0 ? 'idrive@test.dev' : null, scoreHistory: i === 0 ? [{ gameCode: 'FIN1QA', date: FIN1.createdAt, course: FIN1.course, gross: 78, net: 72, holes: 18, pars: PARS, scores: FIN1.scores[FIN1.players[0].id], units: 12 }, { gameCode: 'FIN2QA', date: FIN2.createdAt, course: FIN2.course, gross: 81, net: 75, holes: 18, pars: PARS, scores: FIN2.scores[FIN2.players[0].id], units: -8 }] : [] }; });

  var DB = {
    games: [
      { code: 'FIN1QA', data: FIN1, updated_at: iso(NOW - 3600e3), type: 'game', owner_uid: U1 },
      { code: 'FIN2QA', data: FIN2, updated_at: iso(NOW - 9 * 864e5), type: 'game', owner_uid: U1 },
      { code: 'LIVE1QA', data: LIVE1, updated_at: iso(NOW - 60e3), type: 'game', owner_uid: U1 },
      { code: 'EVT1QA', data: EV1, updated_at: iso(NOW - 120e3), type: 'game', owner_uid: U1 },
      { code: 'recent:' + U1, data: [recentRow(LIVE1), recentRow(EV1), recentRow(FIN1), recentRow(FIN2)], updated_at: iso(NOW) },
      { code: 'roster:' + U1, data: roster, updated_at: iso(NOW) },
      { code: 'scorecard:buffalo-creek', data: { pars: PARS, sis: SIS, tees: TEES, holes: 18 }, updated_at: iso(NOW) }
    ],
    profiles: [
      { id: U1, display_name: 'IDrive Bombs', role: 'admin', my_player: 'IDrive Bombs', created_at: iso(NOW - 400 * 864e5), is_pro: true, hcp_index: 6.2, lang: 'en', app_prefs: {}, clubs: [], shots: [] },
      { id: UK, display_name: 'Kevin Wells', role: 'admin', my_player: 'Kevin Wells', created_at: iso(NOW - 300 * 864e5), hcp_index: 10.1 },
      { id: UH, display_name: 'Hoon Park', role: 'user', my_player: 'Hoon Park', created_at: iso(NOW - 200 * 864e5), hcp_index: 14.0 },
      { id: UB, display_name: 'Britt Kerbo', role: 'user', my_player: 'Britt Kerbo', created_at: iso(NOW - 100 * 864e5), hcp_index: 18.3 }
    ],
    friendships: [
      { id: 'f1', requester: U1, addressee: UK, status: 'accepted', created_at: iso(NOW - 50 * 864e5) },
      { id: 'f2', requester: UH, addressee: U1, status: 'accepted', created_at: iso(NOW - 40 * 864e5) },
      { id: 'f3', requester: UB, addressee: U1, status: 'pending', created_at: iso(NOW - 1 * 864e5) }
    ],
    tournaments: [
      { id: TID, name: 'QA Cup', commissioner_id: U1, num_days: 2, team_a_name: 'Bombers', team_b_name: 'Slicers', status: 'active', join_code: 'QACUP1', created_at: iso(NOW - 5 * 864e5), updated_at: iso(NOW),
        settings: { type: 'team', dayCourses: { '1': 'buffalo-creek', '2': 'buffalo-creek' }, groupGames: {}, dayGames: { '1': { skins: { value: 5 } } } } },
      { id: TID2, name: 'QA One Day', commissioner_id: UK, num_days: 1, team_a_name: 'Team A', team_b_name: 'Team B', status: 'active', join_code: 'QAONE1', created_at: iso(NOW - 2 * 864e5), updated_at: iso(NOW), settings: { type: 'oneday', dayCourses: { '1': 'buffalo-creek' } } }
    ],
    tournament_days: [
      { id: DAY1, tournament_id: TID, day_number: 1, play_date: new Date(NOW).toISOString().slice(0, 10), format: 'stroke', settings: {}, status: 'live', created_at: iso(NOW - 5 * 864e5) },
      { id: DAY2, tournament_id: TID, day_number: 2, play_date: new Date(NOW + 864e5).toISOString().slice(0, 10), format: 'stroke', settings: {}, status: 'scheduled', created_at: iso(NOW - 5 * 864e5) },
      { id: 'dddddddd-0000-4000-8000-000000000003', tournament_id: TID2, day_number: 1, play_date: new Date(NOW + 2 * 864e5).toISOString().slice(0, 10), format: 'stroke', settings: {}, status: 'scheduled', created_at: iso(NOW) }
    ],
    tournament_groups: [
      { id: G1, day_id: DAY1, group_number: 1, game_code: 'EVT1QA', size: 4, tee_time: '08:10', captain: null, created_at: iso(NOW) },
      { id: G2, day_id: DAY2, group_number: 1, game_code: null, size: 4, tee_time: '09:00', captain: null, created_at: iso(NOW) }
    ],
    tournament_players: NAMES.map(function (n, i) { return { id: 'tp' + i, tournament_id: TID, user_id: UIDS[i], display_name: n, team: i < 2 ? 'A' : 'B', handicap: [6, 10, 14, 18][i], claimed: true, invite_token: 'tok' + i, created_at: iso(NOW - 5 * 864e5 + i) }; })
      .concat([{ id: 'tpx', tournament_id: TID2, user_id: U1, display_name: 'IDrive Bombs', team: null, handicap: 6, claimed: true, invite_token: 'tokx', created_at: iso(NOW) }]),
    tournament_group_members: [0, 1, 2, 3].map(function (i) { return { id: 'gm' + i, group_id: G1, tournament_player_id: 'tp' + i, team: i < 2 ? 'A' : 'B', slot: i + 1 }; })
      .concat([0, 1, 2, 3].map(function (i) { return { id: 'gn' + i, group_id: G2, tournament_player_id: 'tp' + i, team: i < 2 ? 'A' : 'B', slot: i + 1 }; })),
    tournament_matches: [], tournament_standings: [],
    leagues: [{ id: 'lg1', name: 'Tuesday Night QA', mode: 'individual', home_course_id: 'buffalo-creek', commissioner_id: U1, logo: null, created_at: iso(NOW - 30 * 864e5) }],
    league_seasons: [{ id: 'ls1', league_id: 'lg1', name: 'Fall 2026', status: 'active', settings: { format: 'match', points: { win: 2, tie: 1 } }, schedule_mode: 'fixed', start_date: '2026-09-01', round_target: 10, created_by: U1, created_at: iso(NOW - 30 * 864e5), public_standings: false }],
    league_weeks: [
      { id: 'lw1', season_id: 'ls1', week_number: 1, date: '2026-10-27', tee_time: '17:30', course_id: 'buffalo-creek', nine: 'front', status: 'final', is_playoff: false, format_config: {}, settings_snapshot: {}, created_at: iso(NOW) },
      { id: 'lw2', season_id: 'ls1', week_number: 2, date: new Date(NOW).toISOString().slice(0, 10), tee_time: '17:30', course_id: 'buffalo-creek', nine: 'front', status: 'open', is_playoff: false, format_config: {}, settings_snapshot: {}, created_at: iso(NOW) },
      { id: 'lw3', season_id: 'ls1', week_number: 3, date: new Date(NOW + 7 * 864e5).toISOString().slice(0, 10), tee_time: '17:30', course_id: 'buffalo-creek', nine: 'back', status: 'scheduled', is_playoff: false, format_config: {}, settings_snapshot: {}, created_at: iso(NOW) }
    ],
    league_members: NAMES.map(function (n, i) { return { id: 'lm' + i, season_id: 'ls1', user_id: UIDS[i], display_name: n, display_name_norm: n.toLowerCase(), team_id: null, role: i === 0 ? 'commissioner' : 'player', is_sub_pool: false, status: 'active', flight: null, created_at: iso(NOW) }; }),
    league_matchups: [{ id: 'mu1', week_id: 'lw2', kind: 'match', a_entrant_id: 'lm0', b_entrant_id: 'lm1' }, { id: 'mu2', week_id: 'lw2', kind: 'match', a_entrant_id: 'lm2', b_entrant_id: 'lm3' }],
    league_cards: [], league_absences: [], league_handicaps: [], league_teams: [], league_standings: [], league_pool_winners: [], league_pool_optouts: [],
    feedback: [
      { id: 'fb1', created_at: iso(NOW - 2 * 864e5), from_name: 'IDrive Bombs', contact: 'idrive@test.dev', topic: 'bug', course: 'Buffalo Creek', message: 'GPS yardage looked off on 7', status: 'open', user_id: U1, screenshots: [], replies: [{ at: iso(NOW - 864e5), from: 'Tyler', text: 'Fixed in the next build, thanks!' }], replied_at: iso(NOW - 864e5) },
      { id: 'fb2', created_at: iso(NOW - 5 * 864e5), from_name: 'Hoon Park', contact: '', topic: 'idea', course: '', message: 'Add a sixes game', status: 'open', user_id: UH, screenshots: [], replies: [], replied_at: null }
    ],
    game_invites: [{ id: 'gi1', from_user: UK, to_user: U1, game_code: 'LIVE1QA', course: 'Buffalo Creek Golf Club', status: 'pending', created_at: iso(NOW - 600e3) }],
    course_gps: [{ course_id: 'buffalo-creek', name: 'Buffalo Creek Golf Club', city: 'Heath, TX', holes: {}, source: 'qa', updated_at: iso(NOW) }],
    course_requests: [{ id: 'cr1', course_name: 'Rockwall GC', city: 'Rockwall', state: 'TX', status: 'open', created_at: iso(NOW - 864e5), user_id: UH }],
    notif_prefs: [{ user_id: U1, friend_starts: true, friend_completes: true, wager_requests: true, monthly_handicap: true, admin_remap: true, event_pushes: true, teetime_preview: true, intro_shown: true }],
    player_stats: [], reactions: [], round_ratings: [], outbound_invites: [], event_photos: [], audit_log: [], sim_sessions: [],
    green_mapping_queue: [], green_slope_queue: [], course_greens: [], course_contact: [], course_vector: [], handicap_snapshots: []
  };
  window.__fakeDB = DB;
  var LOG = window.__fakeLog = { tables: {}, rpcs: {}, writes: [], fns: {} };

  function getPath(row, col) {
    // supports 'a', 'data->lg->>sid', 'data->>finishedAt'
    var m = String(col).split(/->>?/);
    var v = row;
    for (var i = 0; i < m.length; i++) { if (v == null) return undefined; v = v[m[i].trim()]; }
    return v;
  }
  function likeRe(p, ci) { return new RegExp('^' + String(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', ci ? 'i' : ''); }
  function parseVal(v) { if (v === 'null') return null; if (v === 'true') return true; if (v === 'false') return false; return v; }
  function orTest(row, expr) {
    // "a.eq.x,b.like.y%" (top-level only)
    var parts = String(expr).split(',');
    return parts.some(function (p) {
      var m = p.match(/^([^.]+)\.(eq|neq|like|ilike|is|in|gt|gte|lt|lte)\.(.*)$/); if (!m) return true;
      var v = getPath(row, m[1]), x = parseVal(m[3]);
      switch (m[2]) {
        case 'eq': return String(v) === String(x); case 'neq': return String(v) !== String(x);
        case 'like': return likeRe(x).test(String(v)); case 'ilike': return likeRe(x, true).test(String(v));
        case 'is': return v == x; case 'in': return String(x).replace(/[()]/g, '').split(',').indexOf(String(v)) >= 0;
        default: return true;
      }
    });
  }
  function contains(v, x) {
    if (x == null) return true;
    if (Array.isArray(x)) { if (!Array.isArray(v)) return false; return x.every(function (xe) { return v.some(function (ve) { return contains(ve, xe); }); }); }
    if (typeof x === 'object') { if (!v || typeof v !== 'object') return false; return Object.keys(x).every(function (k) { return contains(v[k], x[k]); }); }
    return String(v) === String(x);
  }
  function embed(rows, sel, table) {
    // supports "leagues(name,logo)" on league_seasons
    var m = String(sel || '').match(/(\w+)\(([^)]*)\)/g);
    if (!m) return rows;
    return rows.map(function (r) {
      var o = Object.assign({}, r);
      m.forEach(function (e) {
        var mm = e.match(/(\w+)\(/); var t = mm[1];
        if (t === 'leagues' && r.league_id) o.leagues = (DB.leagues.filter(function (l) { return l.id === r.league_id; })[0]) || null;
      });
      return o;
    });
  }
  function aliasSel(rows, sel) {
    // supports "code,fin:data->>finishedAt" and "code,data->finishedAt"
    if (!sel || sel === '*' || !/:|->/.test(sel)) return rows;
    var cols = String(sel).split(',').map(function (s) { return s.trim(); });
    return rows.map(function (r) {
      var o = Object.assign({}, r);
      cols.forEach(function (c) {
        var mm = c.match(/^(\w+):(.+)$/);
        if (mm) o[mm[1]] = getPath(r, mm[2]);
        else if (/->/.test(c)) { var segs = c.split(/->>?/); o[segs[segs.length - 1]] = getPath(r, c); }
      });
      return o;
    });
  }

  function Builder(table, rowsFn) {
    this.t = table; this.rowsFn = rowsFn; this.f = []; this.op = 'select'; this.sel = '*'; this.payload = null; this.ord = []; this.lim = null; this.rng = null; this.single = 0; this.returning = false; this.opts = {};
    LOG.tables[table] = (LOG.tables[table] || 0) + 1;
  }
  var B = Builder.prototype;
  B.select = function (s, o) { if (this.op === 'select') this.sel = s || '*'; else this.returning = true; this.opts = o || {}; return this; };
  ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'containedBy', 'overlaps', 'match', 'textSearch'].forEach(function (op) {
    B[op] = function (c, v) { this.f.push([op, c, v]); return this; };
  });
  B.not = function (c, op, v) { this.f.push(['not', c, [op, v]]); return this; };
  B.or = function (e) { this.f.push(['or', e]); return this; };
  B.filter = function (c, op, v) { this.f.push([op, c, v]); return this; };
  B.order = function (c, o) { this.ord.push([c, !(o && o.ascending === false)]); return this; };
  B.limit = function (n) { this.lim = n; return this; };
  B.range = function (a, b) { this.rng = [a, b]; return this; };
  B.abortSignal = function () { return this; };
  B.returns = function () { return this; };
  B.throwOnError = function () { return this; };
  B.maybeSingle = function () { this.single = 1; return this; };
  B.single = function () { this.single = 2; return this; };
  B.csv = function () { return this; };
  B.insert = function (p) { this.op = 'insert'; this.payload = p; return this; };
  B.upsert = function (p) { this.op = 'upsert'; this.payload = p; return this; };
  B.update = function (p) { this.op = 'update'; this.payload = p; return this; };
  B.delete = function () { this.op = 'delete'; return this; };
  B._test = function (r) {
    return this.f.every(function (f) {
      var op = f[0];
      if (op === 'or') return orTest(r, f[1]);
      var v = getPath(r, f[1]), x = f[2];
      switch (op) {
        case 'eq': return v != null && String(v) === String(x);
        case 'neq': return String(v) !== String(x);
        case 'gt': return v != null && v > x; case 'gte': return v != null && v >= x;
        case 'lt': return v != null && v < x; case 'lte': return v != null && v <= x;
        case 'like': return v != null && likeRe(x).test(String(v));
        case 'ilike': return v != null && likeRe(x, true).test(String(v));
        case 'is': return x === null ? v == null : v === x;
        case 'in': return Array.isArray(x) && x.map(String).indexOf(String(v)) >= 0;
        case 'contains': return contains(v, x);
        case 'not': {
          var o = x[0], y = x[1];
          if (o === 'like') return !(v != null && likeRe(y).test(String(v)));
          if (o === 'is') return y === null || y === 'null' ? v != null : v !== y;
          if (o === 'in') return String(y).replace(/[()]/g, '').split(',').indexOf(String(v)) < 0;
          if (o === 'eq') return String(v) !== String(y);
          return true;
        }
        default: return true;
      }
    });
  };
  B._run = function () {
    var self = this, rows = this.rowsFn();
    if (!rows) return { data: null, error: { code: 'PGRST202', message: 'unknown ' + this.t } };
    if (this.op === 'insert' || this.op === 'upsert') {
      var arr = Array.isArray(this.payload) ? this.payload : [this.payload];
      var out = [];
      arr.forEach(function (p) {
        var key = self.t === 'games' ? 'code' : (self.t === 'notif_prefs' || self.t === 'player_stats' ? 'user_id' : (self.t === 'course_gps' ? 'course_id' : 'id'));
        var ex = self.op === 'upsert' && p[key] != null ? rows.filter(function (r) { return r[key] === p[key]; })[0] : null;
        if (ex) { Object.assign(ex, p); out.push(ex); }
        else { var n = Object.assign({ id: (p.id || ('gen-' + Math.random().toString(36).slice(2))), created_at: iso(Date.now()) }, p); rows.push(n); out.push(n); }
      });
      LOG.writes.push([this.op, this.t, out.length]);
      return { data: this.returning ? (this.single ? out[0] : out) : null, error: null };
    }
    var hit = rows.filter(function (r) { return self._test(r); });
    if (this.op === 'update') { hit.forEach(function (r) { Object.assign(r, self.payload); }); LOG.writes.push(['update', this.t, hit.length]); return { data: this.returning ? (this.single ? hit[0] || null : hit) : null, error: null }; }
    if (this.op === 'delete') { hit.forEach(function (r) { var i = rows.indexOf(r); if (i >= 0) rows.splice(i, 1); }); LOG.writes.push(['delete', this.t, hit.length]); return { data: this.returning ? hit : null, error: null }; }
    this.ord.slice().reverse().forEach(function (o) { hit.sort(function (a, b) { var x = getPath(a, o[0]), y = getPath(b, o[0]); var c = x < y ? -1 : (x > y ? 1 : 0); return o[1] ? c : -c; }); });
    if (this.rng) hit = hit.slice(this.rng[0], this.rng[1] + 1);
    if (this.lim != null) hit = hit.slice(0, this.lim);
    hit = embed(aliasSel(hit.map(function (r) { return JSON.parse(JSON.stringify(r)); }), this.sel), this.sel, this.t);
    if (this.opts && this.opts.head) return { data: null, count: hit.length, error: null };
    if (this.single) { if (this.single === 2 && hit.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'not single' } }; return { data: hit[0] || null, error: null }; }
    return { data: hit, count: hit.length, error: null };
  };
  B.then = function (res, rej) {
    var self = this;
    return new Promise(function (r) { setTimeout(function () { var o; try { o = self._run(); } catch (e) { o = { data: null, error: { message: String(e) } }; } r(o); }, 2); }).then(res, rej);
  };
  B.catch = function (rej) { return this.then(null, rej); };
  B.finally = function (f) { return this.then(function (v) { f(); return v; }, function (e) { f(); throw e; }); };

  function tableRows(name) { return function () { if (!DB[name]) DB[name] = []; return DB[name]; }; }
  function staticRows(arr) { return function () { return arr; }; }

  var RPC = {
    bg_home_feed: function () { return { data: null, error: { message: 'qa: no feed (fallback to direct reads)' } }; },
    bg_profiles_public: function () { return new Builder('rpc:bg_profiles_public', staticRows(DB.profiles)); },
    league_roster: function (a) { return DB.league_members.filter(function (m) { return m.season_id === (a && a.p_season_id); }).map(function (m) { return Object.assign({ member_id: m.id }, m); }); },
    league_standings_get: function (a) { return DB.league_members.filter(function (m) { return m.season_id === (a && a.p_season_id); }).map(function (m, i) { return { entrant_id: m.id, member_id: m.id, display_name: m.display_name, name: m.display_name, points: 8 - i * 2, wins: 4 - i, losses: i, ties: 0, played: 4, weeks_played: 4, weeks_absent: 0, points_possible: 8, pct: (4 - i) * 25, rank: i + 1 }; }); },
    league_teams_get: function () { return []; },
    league_my_seat_offers: function () { return []; },
    league_my_open_weeks: function () { return []; },
    league_weeks_due: function () { return []; },
    league_money_ledger: function () { return []; },
    league_sub_pool: function () { return []; }, league_sub_queue: function () { return []; },
    league_eligible_rounds: function () { return []; }, league_eligible_rounds_for: function () { return []; },
    bg_gps_counts_all: function () { return [{ course_id: 'buffalo-creek', n: 18, dig: 'x' }]; },
    bg_courses_near: function () { return []; },
    bg_row_exists: function () { return true; },
    bg_field_rounds: function () { return DB.games.filter(function (r) { return r.data && r.data.t2; }).map(function (r) { return { data: r.data, updated_at: r.updated_at }; }); },
    bg_rounds_by_tourney: function () { return DB.games.filter(function (r) { return r.data && r.data.t2; }).map(function (r) { return { data: r.data, updated_at: r.updated_at }; }); },
    bg_event_page: function (a) { var t = DB.tournaments.filter(function (x) { return x.id === (a && a.p_tid); })[0]; if (!t || a.p_key !== 'qakey') return null;
      return { name: t.name, num_days: t.num_days, status: t.status, settings: t.settings, game_settings: {}, players: DB.tournament_players.filter(function (p) { return p.tournament_id === t.id; }),
        rounds: DB.games.filter(function (r) { return r.data && r.data.t2 && r.data.t2.tournamentId === t.id; }).map(function (r) { return r.data; }), days: DB.tournament_days.filter(function (d) { return d.tournament_id === t.id; }) }; },
    t2_create_tournament: function (a) { var t = { id: 'aaaaaaaa-0000-4000-8000-' + String(Date.now()).slice(-12).padStart(12, '0'), name: a.p_name, commissioner_id: U1, num_days: a.p_days, team_a_name: a.p_team_a, team_b_name: a.p_team_b, status: 'setup', join_code: 'NEW' + (Date.now() % 1000), settings: {}, created_at: iso(Date.now()), updated_at: iso(Date.now()) }; DB.tournaments.push(t); return t; }
  };
  function rpc(name, args) {
    LOG.rpcs[name] = (LOG.rpcs[name] || 0) + 1;
    var f = RPC[name];
    var out;
    if (f) { try { out = f(args); } catch (e) { out = { data: null, error: { message: String(e) } }; } }
    else out = { data: null, error: null };
    if (out instanceof Builder) return out;
    if (!(out && typeof out === 'object' && ('error' in out) && ('data' in out))) out = { data: out, error: null };
    var b = new Builder('rpc:' + name, function () { return Array.isArray(out.data) ? out.data : []; });
    var raw = out;
    b.then = function (res, rej) {
      var self = this;
      return new Promise(function (r) { setTimeout(function () {
        if (Array.isArray(raw.data) && (self.f.length || self.single || self.rng)) { r(Builder.prototype._run.call(self)); return; }
        r(raw);
      }, 2); }).then(res, rej);
    };
    return b;
  }

  var listeners = [];
  var signedIn = !SIGNED_OUT;
  var auth = {
    getSession: function () { return Promise.resolve({ data: { session: signedIn ? SESSION : null }, error: null }); },
    getUser: function () { return Promise.resolve({ data: { user: signedIn ? USER : null }, error: null }); },
    refreshSession: function () { return Promise.resolve({ data: { session: signedIn ? SESSION : null, user: signedIn ? USER : null }, error: null }); },
    onAuthStateChange: function (cb) { listeners.push(cb); setTimeout(function () { try { cb('INITIAL_SESSION', signedIn ? SESSION : null); } catch (e) { console.error('qa onAuthStateChange cb threw', e); } }, 5); return { data: { subscription: { unsubscribe: function () {} } } }; },
    signOut: function () { signedIn = false; listeners.forEach(function (cb) { try { cb('SIGNED_OUT', null); } catch (e) {} }); return Promise.resolve({ error: null }); },
    signInWithPassword: function () { signedIn = true; setTimeout(function () { listeners.forEach(function (cb) { try { cb('SIGNED_IN', SESSION); } catch (e) {} }); }, 5); return Promise.resolve({ data: { session: SESSION, user: USER }, error: null }); },
    signUp: function () { return Promise.resolve({ data: { user: USER, session: null }, error: null }); },
    signInWithOAuth: function () { LOG.fns.oauth = (LOG.fns.oauth || 0) + 1; return Promise.resolve({ data: { url: null }, error: null }); },
    resetPasswordForEmail: function () { return Promise.resolve({ data: {}, error: null }); },
    updateUser: function (u) { return Promise.resolve({ data: { user: Object.assign({}, USER, u || {}) }, error: null }); }
  };
  function channel(name) {
    var ch = { name: name, on: function () { return ch; }, subscribe: function (cb) { try { if (cb) setTimeout(function () { cb('SUBSCRIBED'); }, 5); } catch (e) {} return ch; }, unsubscribe: function () { return Promise.resolve('ok'); }, send: function () { return Promise.resolve('ok'); }, track: function () { return Promise.resolve('ok'); }, presenceState: function () { return {}; } };
    return ch;
  }
  var client = {
    from: function (t) { return new Builder(t, tableRows(t)); },
    rpc: rpc,
    auth: auth,
    channel: channel,
    removeChannel: function () { return Promise.resolve('ok'); },
    removeAllChannels: function () { return Promise.resolve('ok'); },
    getChannels: function () { return []; },
    functions: { invoke: function (fn) { LOG.fns[fn] = (LOG.fns[fn] || 0) + 1; return Promise.resolve({ data: null, error: { message: 'qa: functions offline' } }); } },
    storage: { from: function () { return {
      upload: function (p) { return Promise.resolve({ data: { path: p }, error: null }); },
      getPublicUrl: function (p) { return { data: { publicUrl: 'http://127.0.0.1/qa-storage/' + p } }; },
      createSignedUrl: function (p) { return Promise.resolve({ data: { signedUrl: 'http://127.0.0.1/qa-storage/' + p }, error: null }); },
      remove: function () { return Promise.resolve({ data: [], error: null }); },
      list: function () { return Promise.resolve({ data: [], error: null }); }
    }; } }
  };
  window.supabase = { createClient: function () { return client; } };
  window.__fakeClient = client;
})();
