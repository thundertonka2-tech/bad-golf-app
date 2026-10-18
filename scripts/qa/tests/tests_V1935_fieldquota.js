// Bad Golf v1935 -- the event results screen shows the whole-field individual Quota.
// Built from Oct 18 Sr Sunday Invitational (Kevin: "quota is not showing"): the standings
// were computed and paid but never drawn.
// Run: node tests_V1935_fieldquota.js
'use strict';
const vm = require('vm');
const { load } = require('./loader');
const D = require('./fixture_srsunday_20261018.json');
const E = load();
const results = []; let cur = '';
function section(n) { cur = n; }
function check(name, got, exp) { results.push({ section: cur, name, ok: JSON.stringify(got) === JSON.stringify(exp), got, exp }); }
(async () => {
  vm.runInContext('supaReady=true; supaOnline=true; supa={from:()=>({})};', E);
  E.initSupabase = async () => {}; E.t2GetX = async () => ({ data: D.t }); E.t2GetPlayers = async () => D.players; E._t2TeamByNameMap = async () => null;
  E._t2FetchFieldRounds = async () => ({ data: JSON.parse(JSON.stringify(D.rounds)), error: null });
  const raw = await E.loadTourneyRawRounds(D.t);
  const fq = E.t2ComputeFieldQuota(raw, D.t, D.players);
  section('Field quota (both groups)');
  check('six players', fq.standings.length, 6);
  check('Steve leads at +3', [fq.standings[0].name, fq.standings[0].result], ['Steve Miller', 3]);
  check('winner takes 100', fq.money['steve miller'], 100);
  section('Rendered on the results screen');
  const h = E._t2FieldQuotaHtml(fq);
  check('block present', h.indexOf('id="ev-field-quota"') >= 0, true);
  check('every player listed', D.players.every(p => h.indexOf(p.display_name) >= 0), true);
  check('Kevin (other group) shown with +1', /Kevin Wells[\s\S]*?\+1</.test(h), true);
  check('empty input draws nothing', E._t2FieldQuotaHtml(null), '');
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8');
  check('results screen calls it', src.indexOf("html += _t2FieldQuotaHtml(_fieldQuota)") >= 0, true);
  let pass = 0, fail = 0;
  results.forEach(x => { if (x.ok) pass++; else { fail++; console.log('FAIL [' + x.section + '] ' + x.name + '\n   got ' + JSON.stringify(x.got) + '\n   exp ' + JSON.stringify(x.exp)); } });
  console.log('v1935 field quota: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL crashed', e && e.stack); process.exit(1); });
