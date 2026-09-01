import fs from 'fs';
const s = fs.readFileSync(process.argv[2] || 'golf-app.html','utf8');

function grab(name){
  const i = s.indexOf('function '+name+'(');
  if (i<0) throw new Error('not found: '+name);
  // brace match from first {
  let j = s.indexOf('{', i), d=0, k=j;
  for(; k<s.length; k++){ const c=s[k]; if(c==='{')d++; else if(c==='}'){d--; if(d===0){k++; break;}} }
  return s.slice(i,k);
}
const src = ['_mnKeyFor','_mnPairings','_mnTeesFor','_mnHydrateFromConfig','_mnNineKeys','_mnAssembleNines']
  .map(grab).join('\n\n');

let _mnDraft = null;
const showToast = () => {};
const escapeHtml = x => x;
const fn = new Function('showToast','escapeHtml', src + `
  return {
    setDraft: d => { _mnDraft = d; },
    getDraft: () => _mnDraft,
    hydrate: cfg => _mnHydrateFromConfig(cfg),
    assemble: () => _mnAssembleNines(),
    keys: () => _mnNineKeys()
  };
`.replace(/_mnDraft/g,'__D') ) ;

// simpler: eval with a module-scope let
const mod = eval('(function(){ let _mnDraft=null; const showToast=()=>{}; const escapeHtml=x=>x;\n'
  + src + '\n return { set:d=>{_mnDraft=d;}, get:()=>_mnDraft, hydrate:c=>_mnHydrateFromConfig(c), assemble:()=>_mnAssembleNines(), keys:()=>_mnNineKeys() }; })()');

// ---- a realistic wired 3-nine config, White Hawk shaped -------------------
const nine = (name, pars, hdcp, r, sl, yds) => ({
  name, pars, hdcp,
  tees: [
    { label: 'Blue',     rating: r,       slope: sl,     yds, yardage: yds.reduce((a,b)=>a+b,0) },
    { label: 'Blue (W)', rating: r + 1.6, slope: sl + 6, yds, yardage: yds.reduce((a,b)=>a+b,0) },
    { label: 'White',    rating: r - 1.2, slope: sl - 4, yds: yds.map(y=>y-15), yardage: yds.reduce((a,b)=>a+b,0)-135 }
  ]
});
const cfg = {
  _label: 'White Hawk Country Club',
  _dataNote: 'rebuilt from six official combos 2026-09-01',
  black:  nine('Black', [4,4,3,5,4,4,3,4,5],[3,1,7,5,9,2,8,4,6], 35.9, 141, [410,435,180,520,395,440,165,400,505]),
  sliver: nine('Silver',[4,5,4,3,4,4,5,4,3],[4,2,6,8,1,5,3,9,7], 35.2, 137, [395,505,415,170,400,430,510,385,175]),
  red:    nine('Red',   [5,4,4,3,4,5,4,3,4],[2,6,4,8,3,1,5,9,7], 35.6, 139, [500,420,405,185,410,515,395,160,425]),
  searchCombos: [['black','sliver'],['black','red'],['red','sliver']],
  combos: { 'black+sliver': [{label:'Blue', rating:71.4, slope:140},{label:'White', rating:69.1, slope:133}] },
  comboSis: { 'black>sliver': [3,1,7,5,9,2,8,4,6,10,12,14,16,18,11,13,15,17] }
};

mod.set({ layout:'nines', facility:'', city:'', baseId:'wh', existing:true,
          nineCount:3, teeLabels:['Blue','White','Red'], teeHasW:{}, nines:[], courses:[], combos:{} });

console.log('hydrate ->', mod.hydrate(JSON.parse(JSON.stringify(cfg))));
const d = mod.get();
console.log('nines:', d.nines.map(n=>n.key+':'+n.name).join(', '));
console.log('teeLabels:', d.teeLabels.join(', '), '| hasW:', JSON.stringify(d.teeHasW));
console.log('keys():', mod.keys().join(','));

const out = mod.assemble();

// ---- assertions ----------------------------------------------------------
let fail = 0;
const chk = (label, cond, extra) => { if(!cond){ fail++; console.log('  ✗ '+label, extra===undefined?'':extra);} else console.log('  ✓ '+label); };

chk('nine keys preserved', JSON.stringify(Object.keys(out).filter(k=>out[k]&&out[k].pars).sort()) === '["black","red","sliver"]', Object.keys(out));
chk('_dataNote carried through', out._dataNote === cfg._dataNote, out._dataNote);
chk('comboSis carried through', JSON.stringify(out.comboSis) === JSON.stringify(cfg.comboSis));
chk('_label kept', out._label === 'White Hawk Country Club', out._label);
for (const k of ['black','sliver','red']) {
  chk(k+' pars identical', JSON.stringify(out[k].pars) === JSON.stringify(cfg[k].pars), out[k].pars);
  chk(k+' stroke index identical', JSON.stringify(out[k].hdcp) === JSON.stringify(cfg[k].hdcp), out[k].hdcp);
  chk(k+' name kept', out[k].name === cfg[k].name);
  const inLabels = cfg[k].tees.map(t=>t.label).sort().join('|');
  const outLabels = out[k].tees.map(t=>t.label).sort().join('|');
  chk(k+' tee rows round-trip', inLabels === outLabels, outLabels);
  for (const t of cfg[k].tees) {
    const o = out[k].tees.find(x=>x.label===t.label);
    chk(k+' '+t.label+' rating/slope', o && o.rating===t.rating && o.slope===t.slope, o && (o.rating+'/'+o.slope));
    chk(k+' '+t.label+' yardages', o && JSON.stringify(o.yds)===JSON.stringify(t.yds), o && o.yds);
  }
}
chk('official combo rating preserved',
  JSON.stringify(out.combos['black+sliver']) === JSON.stringify(cfg.combos['black+sliver']),
  JSON.stringify(out.combos['black+sliver']));
chk('all 3 pairings present', out.searchCombos.length === 3, out.searchCombos);

// ---- rename a nine: key must NOT change ----------------------------------
d.nines.find(n=>n.key==='sliver').name = 'Silver Nine';
const out2 = mod.assemble();
chk('rename keeps the key (GPS stays attached)', !!out2.sliver && out2.sliver.name === 'Silver Nine', Object.keys(out2).filter(k=>out2[k]&&out2[k].pars));

console.log(fail ? '\nFAILURES: '+fail : '\nALL ASSERTIONS PASSED');
process.exit(fail?1:0);
