// Build integrity gate. Catches the recurring failure mode: a TRUNCATED golf-app.html,
// which parses as a broken <script> and bricks the app on the loading screen.
// Usage: node qa/check_build.js golf-app.html www/index.html
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fail = 0;
const files = process.argv.slice(2);
if (!files.length) files.push(path.join(__dirname, '..', 'golf-app.html'), path.join(__dirname, '..', 'www', 'index.html'));

function mainScript(s) {
  const blocks = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>/g;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const end = s.indexOf('</script>', start);
    if (end > -1) blocks.push([end - start, s.slice(start, end)]);
  }
  blocks.sort((a, b) => b[0] - a[0]);
  return blocks.length ? blocks[0][1] : null;
}

const bodies = {};
for (const f of files) {
  console.log('== ' + f);
  let s;
  try { s = fs.readFileSync(f, 'utf8'); }
  catch (e) { console.log('   FAIL cannot read: ' + e.message); fail++; continue; }

  const opens = (s.match(/<script\b/g) || []).length;
  const closes = (s.match(/<\/script>/g) || []).length;
  const balanced = opens === closes;
  console.log('   script tags: ' + opens + ' open / ' + closes + ' close  ' + (balanced ? 'OK' : 'MISMATCH'));
  if (!balanced) fail++;

  const endsOk = s.trimEnd().endsWith('</html>');
  console.log('   ends with </html>: ' + (endsOk ? 'OK' : 'BAD — file looks truncated'));
  if (!endsOk) fail++;

  const body = mainScript(s);
  if (!body) { console.log('   FAIL no inline app script found'); fail++; continue; }
  bodies[f] = body;
  console.log('   main app script: ' + body.length + ' bytes, ' + (body.split('\n').length) + ' lines');

  try { new vm.Script(body, { filename: f }); console.log('   parses: OK'); }
  catch (e) { console.log('   parses: FAIL — ' + e.message); fail++; }

  const build = (s.match(/const BG_BUILD = '([^']+)'/) || [])[1];
  console.log('   BG_BUILD: ' + (build || '(not found)'));
  if (!build) fail++;
}

// Web and iOS must carry the IDENTICAL app script or the platforms drift.
const keys = Object.keys(bodies);
if (keys.length === 2) {
  const same = bodies[keys[0]] === bodies[keys[1]];
  console.log('\n   web vs iOS app script: ' + (same ? 'IDENTICAL' : 'DIFFER — the platforms have drifted'));
  if (!same) fail++;
}

console.log('\n' + (fail ? fail + ' PROBLEM(S) FOUND' : 'build integrity OK'));
process.exit(fail ? 1 : 0);
