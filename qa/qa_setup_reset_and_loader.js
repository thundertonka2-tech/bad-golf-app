'use strict';
const fs=require('fs');
const FILE = process.argv[2] || (process.env.HOME+'/mnt/bad-golf-app/golf-app.html');
const src = fs.readFileSync(FILE,'utf8');
let fails=0; const ok=(n,c,d='')=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d?'   '+d:''));if(!c)fails++;};
const slice=(a,b)=>{const i=src.indexOf(a);const j=src.indexOf(b,i);return (i<0)?'':src.slice(i,j<0?src.length:j);};

console.log('== '+FILE.split('/').pop());
// --- loader image
ok('round-loading no longer uses bigshooter', !/id="round-loading"[\s\S]{0,400}bigshooter/.test(src));
ok('round-loading uses the Bad Golf mark', /id="round-loading"[\s\S]{0,400}src="BadGolfIcon\.jpg"/.test(src));
ok('  tagged rl-logo so it is sized as a logo', /id="round-loading"[\s\S]{0,400}class="rl-logo"/.test(src));
ok('  and the CSS for rl-logo exists', /#round-loading img\.rl-logo\s*\{/.test(src));
ok('  keeps the onerror fallback', /id="round-loading"[\s\S]{0,400}onerror="this\.style\.display=/.test(src));
ok('stroke_popup.JPG is still the actual stroke pop-up', /showFunPopup\(\{ img: 'stroke_popup\.JPG', title: 'You get a stroke!'/.test(src));

// --- handicap block reset, inside setupNewGameForm and before the prefill apply
const fn = slice('async function setupNewGameForm(prefill)', '\nasync function ');
ok('setupNewGameForm found', fn.length>500, String(fn.length));
for (const [label, re] of [
  ['No handicaps unticked', /_nh\.checked = false/],
  ['basis back to full',    /_hb\.value = 'full'/],
  ['allowance back to 100', /_hp\.value = 100/],
  ['allowance label reset', /_hl\.textContent = '100%'/],
  ['no-par-3-strokes off',  /_h3\.checked = false/],
  ['max score off',         /_ms\.value = 'off'/],
  ['detail rows un-dimmed', /_det\.style\.opacity = '1'/],
]) ok('  reset: '+label, re.test(fn));

// ordering: reset must come BEFORE anything that could re-apply a saved config
const iReset = src.indexOf("_nh.checked = false");
const iFn    = src.indexOf('async function setupNewGameForm(prefill)');
const iApply = src.indexOf('function applySavedConfig(config)');
ok('the reset lives inside setupNewGameForm', iReset > iFn && iReset < src.indexOf('\nasync function ', iFn));
ok('applySavedConfig still sets all four fields (so templates override the reset)', (() => {
  const a = slice('function applySavedConfig(config)', '\nfunction ');
  return /hcp-no-handicaps'\)\.checked = noHcp/.test(a) && /hcp-no-par3-strokes'\)\.checked/.test(a)
      && /hcp-basis'\)\.value = config\.hcpRules\.basis/.test(a) && /hcp-pct'\)\.value = config\.hcpRules\.pct/.test(a);
})());
ok('openFreshSetupForm still calls setupNewGameForm', /openFreshSetupForm\(\)[\s\S]{0,2500}setupNewGameForm\(\)/.test(src));
console.log('\n'+FILE.split('/').pop()+': '+(fails? fails+' FAILURE(S)':'ALL SETUP-RESET CHECKS PASSED'));
process.exit(fails?1:0);
