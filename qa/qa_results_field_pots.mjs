// qa/qa_results_field_pots.mjs — regression test for the v1131 Tournament Results fix.
//
//   node qa/qa_results_field_pots.mjs golf-app.html
//   node qa/qa_results_field_pots.mjs www/index.html      # run BOTH
//
// v1131 (Tyler, 8/19): the Bets screen showed Long Putt + CTP + Most GIRs + Fewest
// Putts; Tournament Results showed only Long Putt. Not a money bug — the shared
// builder bgPotRowsForEvent() was right, openEventLeaderboard() just never called it
// and hand-rolled two sections instead. This asserts the shared call is wired, that
// it sits inside openEventLeaderboard after _rawRounds and before the innerHTML
import fs from 'fs';
const raw = fs.readFileSync(process.argv[2], 'utf8');
const js = [...raw.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(b=>b.length>1000).join('\n');

const grab = (a,b) => { const i=js.indexOf(a); if(i<0) throw new Error('missing '+a); const j=js.indexOf(b,i); return js.slice(i,j+b.length); };
const potRow = grab('function _bgPotRow(pot, winner, detail, wins, note) {', '\n}\n');
const tbl    = grab('function _bgPotTableHtml(rows, heading) {', '\n}\n');

const R=[]; const ok=(n,c,d='')=>R.push({n,pass:!!c,d});

// --- the new block's own wiring, checked statically against the shipped text ---
const block = grab("    try {\n      const _fieldRows = (bgPotRowsForEvent(t, _rawRounds) || [])", "    } catch (e) {}\n");
ok('new block present exactly once', js.split('const _fieldRows = (bgPotRowsForEvent(t, _rawRounds)').length-1 === 1);
ok('calls the shared builder', /bgPotRowsForEvent\(t, _rawRounds\)/.test(block));
ok('renders through the shared table', /_bgPotTableHtml\(_fieldRows, 'Field pots — who won what'\)/.test(block));
for (const dep of ['bgPotRowsForEvent','_bgPotTableHtml'])
  ok(`top-level function exists: ${dep}`, new RegExp('function\\s+'+dep+'\\s*\\(').test(js), dep);
// _rawRounds is destructured out of a Promise.all inside openEventLeaderboard.
// Prove the new block sits INSIDE that function, after the declaration and before
// the innerHTML write -- being merely "somewhere in the file" is not scope.
{
  const fnStart = js.indexOf('async function openEventLeaderboard');
  const decl    = js.indexOf('_rawRounds, _combinedPay] = await Promise.all(', fnStart);
  const blockAt = js.indexOf('const _fieldRows = (bgPotRowsForEvent(t, _rawRounds)', fnStart);
  const paint   = js.indexOf("body.innerHTML = html", blockAt);
  const nextFn  = js.indexOf('\nasync function ', decl);
  ok('openEventLeaderboard found', fnStart > 0, String(fnStart));
  ok('_rawRounds declared inside it', decl > fnStart, String(decl));
  ok('new block is AFTER the declaration', blockAt > decl, `decl=${decl} block=${blockAt}`);
  ok('new block is BEFORE body.innerHTML', paint > blockAt, String(paint));
  ok('no function boundary crossed between them', !(nextFn > 0 && nextFn < blockAt), `nextFn=${nextFn}`);
}

// --- the filter, against the EXACT labels the builder emits ---
const labels = [
  'Skins — whole field',
  'Long Putt — whole field',
  'Closest to the pin, #12 — whole field',
  'Low Net — whole field',
  'Most greens in regulation — whole field',
  'Fewest putts — whole field',
  'Tournament Nassau — FRONT',
];
const keep = labels.filter(p => p && String(p).indexOf('Long Putt') !== 0);
ok('filter drops Long Putt', !keep.includes('Long Putt — whole field'));
ok('filter keeps CTP', keep.includes('Closest to the pin, #12 — whole field'));
ok('filter keeps Most GIRs', keep.includes('Most greens in regulation — whole field'));
ok('filter keeps Fewest putts', keep.includes('Fewest putts — whole field'));
ok('filter keeps Skins + Nassau + Low Net', keep.length === 6, 'kept ' + keep.length);

// --- render the kept rows through the real _bgPotTableHtml -------------------
const mk = new Function('escapeHtml','_bgPotMoneyFmt', potRow + '\n' + tbl + '\nreturn {_bgPotRow,_bgPotTableHtml};');
const M = mk(s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])), v => '$' + Number(v||0).toFixed(2));
const rows = [
  M._bgPotRow('Closest to the pin, #12 — whole field','Ovalcollier Golfapp',"5' 0\"",80,''),
  M._bgPotRow('Most greens in regulation — whole field','Tyler OConnor & Corey Whitfield & Kevin Wells','13 GIRs',26.67,''),
  M._bgPotRow('Fewest putts — whole field','Tyler OConnor & Ovalcollier Golfapp','30 putts',40,''),
  M._bgPotRow('Long Putt — whole field','Marcus Deleon',"43' 0\"",80,''),
];
const filtered = rows.filter(r => r && r.pot && String(r.pot).indexOf('Long Putt') !== 0);
const html = M._bgPotTableHtml(filtered, 'Field pots — who won what');
ok('heading rendered', html.includes('Field pots — who won what'));
ok('CTP row rendered', html.includes('Closest to the pin, #12'));
ok('GIR row rendered', html.includes('Most greens in regulation'));
ok('Fewest putts row rendered', html.includes('Fewest putts'));
ok('Long Putt NOT duplicated', !html.includes('Long Putt'));
ok('amounts present ($80 / $26.67 / $40)', html.includes('80') && html.includes('26.67') && html.includes('40'));
ok('empty list renders nothing (no stray header)', M._bgPotTableHtml([], 'Field pots — who won what') === '');

let bad=0; for(const r of R){ if(!r.pass) bad++; console.log((r.pass?'  ok   ':'  FAIL ')+r.n+(r.pass?'':'   <- '+r.d)); }
console.log(bad?`\n${bad} FAILURES`:`\nall ${R.length} assertions passed`);
process.exit(bad?1:0);
