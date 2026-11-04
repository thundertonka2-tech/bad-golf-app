// v1945 - cross-group 1v1 stops at the close-out (Kerbo 10/24 Tyler v Britt gross = Britt 3&1) and the GPS bubble scores gross as gross. node qa/qa_crossmatch_closeout_v1945.js golf-app.html qa/fixture_kerbo_crossmatch_2026-10-24.json
'use strict';
const path = require('path');
const { loadApp } = require(path.resolve('qa/app.js'));
const fx = require(path.resolve(process.argv[3])); const { qa } = loadApp(path.resolve(process.argv[2]));
const fn = n => { const f = qa.fn(n); if (typeof f !== 'function') throw new Error('missing ' + n); return f; };
qa.install({ supa: { from() { return { select() { return this; }, eq() { return this; }, in() { return this; }, maybeSingle: async () => ({ data: null, error: null }) }; }, auth: { getSession: async () => ({ data: { session: null } }) } }, onSave: () => {}, loadGame: async () => null, roster: async () => [], meName: async () => 'Tyler' });
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL: ' + m); } };
const r = fn('t2ComputeCrossGroupMatches')(fx.t, fx.rows); const m = r.matches[0];
ok(r.matches.length === 1 && m.value === 40 && m.net === false, 'cross match settles at 40, gross');
ok(/3&1/.test(m.status || '') && m.winnerFirst === 'Britt', 'stops at the close-out: Britt 3&1 (' + m.status + ')');
const W = qa.fn('window'); W._t2CrossGps = { tid: fx.t.id, at: Date.now(), t: fx.t, rows: fx.rows };
const st = fn('_t2MyCrossGroupStatuses')(fx.rows[0].data, 't');
ok(st.length === 1 && /3&1|3 /.test(st[0].text) && st[0].cls === 'neg', 'GPS bubble uses Britt gross, not net: ' + JSON.stringify(st));
const cm = fn('calcMatch')(JSON.parse(JSON.stringify(fx.rows[0].data)));
ok(!cm || Object.values(cm.money || {}).every(v => v === 0), 'in-round match never settles the cross pair');
console.log('  ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
