// Behaviour test for the v1236 nine picker: labels, default steering, warning text.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || require('path').join(__dirname, '..', 'golf-app.html'), 'utf8')   /* v1998: argv[2], not a hard-coded path */;
const blk = src.slice(src.indexOf('async function tnNineGreenCounts'),
                      src.indexOf('function applyNineCombo'));

// --- minimal DOM ------------------------------------------------------------
const els = {};
// v1998: v1982 relabels <option> elements IN PLACE (el.options[i].textContent) instead of rewriting
// innerHTML, and v1811 binds the change handler via el.onchange. The stub select therefore parses
// its innerHTML into `options` and re-serialises them, so the regex assertions below still read
// the current labels; fire('change') also calls onchange.
const OPT = /<option value="([^"]*)">([^<]*)<\/option>/g;
function mk(id){ const el = { id, value:'', _html:'', textContent:'', checked:false, onchange:null, options:[],
  style:{display:''}, classList:{add(){},remove(){}}, _h:{},
  addEventListener(e,f){ (this._h[e]=this._h[e]||[]).push(f); },
  fire(e){ (this._h[e]||[]).forEach(f=>f()); if (e === 'change' && typeof this.onchange === 'function') this.onchange(); } };
  Object.defineProperty(el, 'innerHTML', {
    get(){ return el.options.length ? el.options.map(o => '<option value="' + o.value + '">' + o.textContent + '</option>').join('') : el._html; },
    set(v){ el._html = v; el.options = []; let m; OPT.lastIndex = 0; while ((m = OPT.exec(v))) el.options.push({ value: m[1], textContent: m[2] }); } });
  return els[id] = el; }
['nine-picker-modal','nine-front','nine-back','nine-picker-warn','nine-gps-note',
 'nine-single-toggle','nine-single-row','nine-back-row','nine-front-label',
 'nine-picker-sub','nine-confirm','nine-cancel'].forEach(mk);
global.$ = id => els[id] || null;

let GPS = {};
global.ensureSupa = async () => true;
global.supaReady = true; global.initSupabase = async () => true;   // v1998: v1811 inlined ensureSupa as `if (!supaReady) await initSupabase()`
global.supa = { from: () => ({ select: () => ({ in: async (col, ids) => ({
  data: ids.filter(i => GPS[i]).map(i => ({ course_id: i, holes: GPS[i] })) }) }) }) };

const NINES = { _label:'Test Club',
  a:{name:'Alpha',pars:[4,4,4,4,4,4,4,4,4]},
  b:{name:'Bravo',pars:[4,4,4,4,4,4,4,4,4]},
  c:{name:'Charlie',pars:[4,4,4,4,4,4,4,4,4]} };
global.THREE_NINE_COURSES = { tc: NINES };
global._pendingNineCourseId = null;
global.window = global; global.document = { getElementById: id => els[id] || null, querySelector: () => null, querySelectorAll: () => [] };   // v1998: the block now stamps window._bgNineGpsRefresh (v1982)
global.applyNineCombo = () => {}; global.applySingleNine = () => {};
eval(blk);

const mapped = n => { const h={}; for(let i=1;i<=n;i++) h[String(i)]={mid:[1,2]}; return h; };
const tick = () => new Promise(r => setImmediate(() => setImmediate(r)));

let p=0,f=0;
const eq=(n,a,b)=>{const A=JSON.stringify(a),B=JSON.stringify(b);
  if(A===B){p++;console.log('  ok  '+n);}else{f++;console.log('  FAIL '+n+'\n       got '+A+'\n       want '+B);}};

(async () => {
  console.log('1. an unmapped nine is labelled, and the default moves to the mapped pair');
  GPS = { 'tc#a': mapped(9), 'tc#b': mapped(9), 'tc#c': {} };
  openNinePicker('tc'); await tick();
  eq('Charlie flagged', /Charlie · no GPS yet/.test(els['nine-front'].innerHTML), true);
  eq('Alpha left clean', /<option value="a">Alpha<\/option>/.test(els['nine-front'].innerHTML), true);
  eq('default front', els['nine-front'].value, 'a');
  eq('default back',  els['nine-back'].value,  'b');
  eq('no warning on a clean pair', els['nine-gps-note'].style.display, 'none');

  console.log('\n2. choosing the blind nine warns but never blocks');
  els['nine-back'].value = 'c'; els['nine-back'].fire('change');
  eq('warning shown', els['nine-gps-note'].style.display, 'block');
  eq('names the nine and the hole count',
     /Charlie is not mapped yet .* no GPS distances on 9 holes/.test(els['nine-gps-note'].textContent), true);
  eq('picker still usable', els['nine-back'].value, 'c');

  console.log('\n3. a partially mapped nine reports how far along it is');
  GPS = { 'tc#a': mapped(9), 'tc#b': mapped(4), 'tc#c': mapped(9) };
  openNinePicker('tc'); await tick();
  eq('partial count shown', /Bravo · 4\/9 mapped/.test(els['nine-front'].innerHTML), true);
  eq('default skips the partial pair', [els['nine-front'].value, els['nine-back'].value], ['a','c']);

  console.log('\n4. nothing mapped anywhere: labels warn, default is left alone');
  GPS = {};
  els['nine-front'].value='a'; els['nine-back'].value='b';
  openNinePicker('tc'); await tick();
  eq('front default untouched', els['nine-front'].value, 'a');
  eq('back default untouched',  els['nine-back'].value,  'b');

  console.log('\n5. a lookup failure costs the player nothing');
  const good = global.supa;
  global.supa = { from(){ throw new Error('offline'); } };
  els['nine-gps-note'].style.display = 'none';
  openNinePicker('tc'); await tick();
  eq('plain labels kept', /<option value="c">Charlie<\/option>/.test(els['nine-front'].innerHTML), true);
  eq('no warning invented', els['nine-gps-note'].style.display, 'none');
  global.supa = good;

  console.log('\n6. single-nine mode warns only about the nine actually chosen');
  GPS = { 'tc#a': mapped(9), 'tc#b': mapped(9), 'tc#c': {} };
  openNinePicker('tc'); await tick();
  els['nine-single-toggle'].checked = true;
  els['nine-front'].value = 'a'; els['nine-single-toggle'].fire('change');
  eq('mapped nine alone -> quiet', els['nine-gps-note'].style.display, 'none');
  els['nine-front'].value = 'c'; els['nine-front'].fire('change');
  eq('blind nine alone -> warns', els['nine-gps-note'].style.display, 'block');
  eq('counts 9 holes not 18', /on 9 holes/.test(els['nine-gps-note'].textContent), true);

  console.log('\n' + p + ' passed, ' + f + ' failed (v1236 nine picker)');
  process.exit(f ? 1 : 0);
})();
