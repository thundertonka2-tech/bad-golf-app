// v2009 C2: node --check the app <script> of golf-app.html and www/index.html, and confirm they match.
// Run: node qa/league_v2009/fix_tests/C2/check_scripts.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const { mainScript } = require(path.join(__dirname, '..', '..', '..', 'app.js'));
const ROOT = path.join(__dirname, '..', '..', '..', '..');
let bad = 0; const sums = [];
for (const f of ['golf-app.html', path.join('www', 'index.html')]) {
  const src = mainScript(path.join(ROOT, f));
  const tmp = path.join(os.tmpdir(), 'c2_check_' + path.basename(f) + '.js');
  fs.writeFileSync(tmp, src);
  const r = cp.spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
  const md5 = crypto.createHash('md5').update(src).digest('hex');
  sums.push(md5);
  console.log((r.status === 0 ? 'OK   ' : 'FAIL ') + f + '  node --check  md5 ' + md5);
  if (r.status !== 0) { bad++; console.log(r.stderr); }
  fs.unlinkSync(tmp);
}
if (sums[0] !== sums[1]) { bad++; console.log('FAIL app scripts differ between golf-app.html and www/index.html'); }
else console.log('OK   app scripts are byte-identical');
process.exit(bad ? 1 : 0);
