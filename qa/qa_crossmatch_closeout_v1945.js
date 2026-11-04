// v1945 - cross-group 1v1 stops at the close-out, and the GPS bubble scores the bet's own basis.
// v2009 (cross audit live F1 / DECISIONS 8): Kerbo 10/24 Tyler v Britt was a NET match (live row
// games.GREEN96...match.instances[0].net = true, hcp 4 v 7) -> Britt 4&3 net. The fixture said gross (3&1);
// fixture and expectations are now net. Units are unchanged (+40 / -40). A gross control keeps the 3&1 check.
// node qa/qa_crossmatch_closeout_v1945.js golf-app.html qa/fixture_kerbo_crossmatch_2026-10-24.json
'use strict';
const path = require('path');
const { loadApp } = require(path.resolve('qa/app.js'));
const fx = require(path.resolve(process.argv[3])); const { qa } = loadApp(path.resolve(process.argv[2]));
const fn = n => { const f = qa.fn(n); if (typeof f !== 'function') throw new Error('missing ' + n); return f; };
qa.install({ supa: { from() { return { select() { return this; }, eq() { return this; }, in() { return this; }, maybeSingle: async () => ({ data: null, error: null }) }; }, auth: { getSession: async () => ({ data: { session: null } }) } }, onSave: () => {}, loadGame: async () => null, roster: async () => [], meName: async () => 'Tyler' });
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL: ' + m); } };
const inst = fx.rows[0].data.games.match.instances[0];
ok(inst.net === true && fx.rows[0].data.games.match.net === true, 'fixture matches the live row: the bet is net');
const r = fn('t2ComputeCrossGroupMatches')(fx.t, fx.rows); const m = r.matches[0];
ok(r.matches.length === 1 && m.value === 40 && m.net === true, 'cross match settles at 40, net');
ok(/4&3/.test(m.status || '') && m.winnerFirst === 'Britt', 'stops at the close-out: Britt 4&3 net (' + m.status + ')');
if (m.statusShort != null) ok(m.statusShort === '4&3', 'statusShort 4&3 (' + m.statusShort + ')');   // v2009 engine output shape
const W = qa.fn('window'); W._t2CrossGps = { tid: fx.t.id, at: Date.now(), t: fx.t, rows: fx.rows };
const st = fn('_t2MyCrossGroupStatuses')(fx.rows[0].data, 't');
ok(st.length === 1 && /4&3/.test(st[0].text) && st[0].cls === 'neg', 'GPS bubble scores the net bet (Britt 4&3): ' + JSON.stringify(st));
const cm = fn('calcMatch')(JSON.parse(JSON.stringify(fx.rows[0].data)));
ok(!cm || Object.values(cm.money || {}).every(v => v === 0), 'in-round match never settles the cross pair');
{ // gross control: the same cards played gross close out at 3&1, so the net flag is what changes the label
  const g = JSON.parse(JSON.stringify(fx)); g.rows[0].data.games.match.net = false; g.rows[0].data.games.match.instances[0].net = false;
  const mg = fn('t2ComputeCrossGroupMatches')(g.t, g.rows).matches[0];
  ok(mg && /3&1/.test(mg.status || '') && mg.winnerFirst === 'Britt' && mg.net === false && mg.value === 40, 'gross control: Britt 3&1 (' + (mg && mg.status) + ')');
}
console.log('  ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
