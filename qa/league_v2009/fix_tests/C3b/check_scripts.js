// v2009 C3b: extract the app <script> of golf-app.html and www/index.html, check they are byte-identical (md5)
// and that each parses (node --check equivalent via vm.Script). Run: node qa/league_v2009/fix_tests/C3b/check_scripts.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..', '..', '..');
function main(f) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8'); const re = /<script(?![^>]*\bsrc=)[^>]*>/g; let m, best = '';
  while ((m = re.exec(s))) { const st = m.index + m[0].length; const e = s.indexOf('</script>', st); if (e > -1 && e - st > best.length) best = s.slice(st, e); }
  return best;
}
let bad = 0; const md5 = {};
for (const f of ['golf-app.html', 'www/index.html']) {
  const js = main(f); md5[f] = crypto.createHash('md5').update(js).digest('hex');
  try { new vm.Script(js, { filename: f }); console.log(f + ': parses, md5 ' + md5[f]); }
  catch (e) { bad++; console.log(f + ': SYNTAX ERROR ' + e.message); }
}
if (md5['golf-app.html'] !== md5['www/index.html']) { bad++; console.log('app scripts DIFFER'); } else console.log('app scripts identical');
process.exit(bad ? 1 : 0);
