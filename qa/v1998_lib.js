'use strict';
// qa/v1998_lib.js — shared helper for the qa_v1998_* suites (folded in from the v1997 audit's
// scratch batteries, 2026-11-02). Loads the real app via qa/app.js, silences its boot noise and
// exposes F(name) plus a hand-built round factory with FIXED pars/SIs so the expectations in the
// suites can be hand-computed. Every suite takes the html path as argv[2] (default ../golf-app.html)
// and exits 1 on any failure.
const path = require('path');
const APP = path.resolve(process.argv[2] || process.env.BG_HTML || path.join(__dirname, '..', 'golf-app.html'));
const { loadApp } = require(path.join(__dirname, 'app.js'));
const _err = console.error, _warn = console.warn;
console.error = () => {}; console.warn = () => {};
const app = loadApp(APP);
console.error = _err; console.warn = _warn;
const { qa, ctx } = app;
const F = n => { const f = qa.fn(n); if (typeof f !== 'function') throw new Error('missing fn ' + n); return f; };
let PASS = 0, FAIL = 0; const FAILS = [];
function check(label, cond, detail) { if (cond) PASS++; else { FAIL++; FAILS.push(label + (detail ? '  [' + detail + ']' : '')); } return cond; }
const money = v => Math.round((Number(v) || 0) * 100) / 100;
const sum = m => money(Object.values(m || {}).reduce((a, b) => a + (b || 0), 0));
const PARS = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4];
const SIS  = [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2];
const TEES = [{label:'Blue',slope:127,rating:72.2}];
const flat = (n, k) => Array(n).fill(k);
function mkRound(code, specs, opts) {
  // specs: [{name,hcp,scores:[18]}...]
  opts = opts || {};
  const players = specs.map((s, i) => ({ id: 'p' + i + '-' + code, puid: 'pu' + i + code, name: s.name, firstName: s.name.split(' ')[0], lastName: s.name.split(' ').slice(1).join(' '), hcp: s.hcp, rawHcp: s.hcp, baseHcp: s.hcp, teeLabel: 'Blue', playsGross: false }));
  const scores = {}; players.forEach((p, i) => { scores[p.id] = (specs[i].scores || Array(18).fill(null)).slice(); });
  const nH = opts.holes || 18;
  const g = { code, players, scores, pars: (opts.pars || PARS).slice(0, nH), sis: (opts.sis || SIS).slice(0, nH), tees: TEES,
    hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: nH, noHandicaps: !!opts.noHandicaps }, course: 'QA Course', courseId: 'qa',
    games: opts.games || {}, createdAt: 1786800000000, updatedAt: 1786800000000, finishedAt: opts.unfinished ? null : 1786820000000 };
  if (opts.startHole) g.startHole = opts.startHole;
  if (opts.nineMode) g.nineMode = opts.nineMode;
  if (opts.t2) g.t2 = { tournamentId: opts.tid || 'qa-t', day: opts.day || 1, groupId: opts.groupId || ('grp-' + code), dayGameKeys: opts.dayGameKeys || [] };
  if (opts.leftRound) g.leftRound = opts.leftRound;
  return g;
}
const ids = g => g.players.map(p => p.id);
const P = g => ({ participants: ids(g), participantNames: g.players.map(p => p.name) });
function done(name) {
  console.log('\n' + (FAIL ? (FAIL + ' FAILED, ' + PASS + ' passed') : ('ALL ' + PASS + ' CHECKS PASSED')) + '  (' + name + ' on ' + path.basename(APP) + ')');
  FAILS.forEach(f => console.log('  - ' + f));
  process.exit(FAIL ? 1 : 0);
}
const log = (t, o) => console.log('  ' + t + ' ' + (o == null ? 'null' : JSON.stringify(o)));
module.exports = { app, qa, ctx, F, check, money, sum, PARS, SIS, TEES, flat, mkRound, ids, P, done, log, APP };
