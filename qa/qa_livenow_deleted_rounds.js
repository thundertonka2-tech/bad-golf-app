'use strict';
const fs=require('fs');
let fails=0,checks=0; const ok=(n,c,d='')=>{checks++;console.log((c?'  PASS  ':'  FAIL  ')+n+(d?'   '+d:''));if(!c)fails++;};
const FILE=process.argv[2]||(process.env.HOME+'/mnt/bad-golf-app/golf-app.html');
const src=fs.readFileSync(FILE,'utf8');
console.log('== '+FILE.split('/').pop());
const fn=(name)=>{const i=src.indexOf('async function '+name);const j=src.indexOf('\nasync function ',i+10);return src.slice(i, j<0?src.length:j);};
const crew=fn('renderCrewLive'), home=fn('renderHomeLive');
ok('renderCrewLive found', crew.length>800, String(crew.length));
ok('renderHomeLive found', home.length>800, String(home.length));
// the three tombstone sources, in the CREW renderer (the one people see)
for (const [lbl,re] of [
  ['local deleted-rounds tombstone', /_dead = getDeletedRoundKeys\(\)/],
  ['locally hidden rounds',          /getHiddenRounds\(\) \|\| \[\]\)\.forEach\(c => _dead\.add\(c\)\)/],
  ['shared tombstones (other device)',/await getSharedTombstones\(\)[\s\S]{0,120}_dead\.add\(c\)/],
  ['and the rows are filtered by it', /\.filter\(x => !_dead\.has\(x\.code\)\)/],
]) ok('renderCrewLive: '+lbl, re.test(crew));
ok('renderHomeLive still has its own (v1011) filter', /\.filter\(x => !_dead\.has\(x\.code\)\)/.test(home));
// the dead filter must run BEFORE the friends/thru work, so a deleted round never reaches the paint
const iDead=crew.indexOf('.filter(x => !_dead.has(x.code))');
const iThru=crew.indexOf('.filter(x => x.thru > 0)');
const iPaint=crew.indexOf('el.innerHTML = live.map');
ok('dead filter precedes the thru filter', iDead>0 && iDead<iThru, iDead+' < '+iThru);
ok('dead filter precedes the paint', iDead>0 && iDead<iPaint);
// the v1709 completed-card filter must still be there too
ok('v1709 completed-card filter survives', /bgRoundCardComplete\(x\.g\)/.test(crew));
// helpers exist and have the shapes the filter assumes
ok('getDeletedRoundKeys returns a Set', /function getDeletedRoundKeys\(\)[\s\S]{0,220}new Set\(/.test(src));
ok('getHiddenRounds returns an array', /function getHiddenRounds\(\)[\s\S]{0,200}JSON\.parse\(localStorage\.getItem\('golf:hidden-rounds'\)/.test(src));
ok('getSharedTombstones exposes .rounds as a Set', /rounds: new Set\(Array\.isArray\(o\.rounds\)/.test(src));
ok('renderCrewLive is async, so the await is legal', /async function renderCrewLive/.test(src));
console.log('\n'+FILE.split('/').pop()+': '+(checks-fails)+'/'+checks+(fails?'  -- '+fails+' FAILURE(S)':' checks passed'));
process.exit(fails?1:0);
