// v1239: the course-detail panel must NAME the nine that has no greens.
// Kevin: "it says incomplete but when he opens it the mapping and everything is
// complete." He was right about what he saw -- the two mapped nines ARE finished.
// Nothing on the screen said a third nine existed and was empty.
const fs = require('fs');
const src = fs.readFileSync('/home/claude/bg/golf-app.html', 'utf8');

// Lift the two helpers out of openCourseDetail by name.
function lift(name) {
  const i = src.indexOf('  const ' + name + ' = function');
  if (i < 0) throw new Error('not found: ' + name);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 2); }
  }
}
global.escapeHtml = x => String(x);
let _nineBreak = [];
const code = lift('_nineShort') + '\n' + lift('_nineBreakdownHtml');
eval(code.replace(/^  const /gm, 'global.'));

let p = 0, f = 0;
const ok = (n, c) => { if (c) { p++; console.log('  ok  ' + n); } else { f++; console.log('  FAIL ' + n); } };

console.log('1. Gleannloch: two nines done, Loch empty');
_nineBreak = [{ key: 'pines', name: 'Pines', greens: 9, missing: false },
              { key: 'gleann', name: 'Gleann', greens: 9, missing: false },
              { key: 'loch', name: 'Loch', greens: 0, missing: true }];
let banner = 'greens (18/27)' + _nineShort(true);
let html = _nineBreakdownHtml();
ok('the banner names Loch', /Loch has no greens on it yet/.test(banner));
ok('step 4 names it too', / — Loch not mapped/.test(_nineShort(false)));
ok('a chip per nine', (html.match(/\/9<\/span>/g) || []).length === 3);
ok('Loch chip reads 0/9', /Loch 0\/9/.test(html));
ok('says how big the facility is', /27-hole facility/.test(html));
ok('tells him where to go', /Tap Review and pick it/.test(html));
ok('credits the finished work', /mapped nines are finished/.test(html));

console.log('\n2. two nines short reads as plain English, not a list of ids');
_nineBreak = [{ key: 'a', name: 'Alpha', greens: 9, missing: false },
              { key: 'b', name: 'Bravo', greens: 0, missing: true },
              { key: 'c', name: 'Charlie', greens: 4, missing: true }];
ok('joined with "and"', /Bravo and Charlie have no greens on them yet/.test(_nineShort(true)));
ok('partial nine shows its count', /Charlie 4\/9/.test(_nineBreakdownHtml()));
ok('"pick them"', /pick them from the nine list/.test(_nineBreakdownHtml()));

console.log('\n3. a fully mapped facility says nothing extra');
_nineBreak = [{ key: 'a', name: 'Alpha', greens: 9, missing: false },
              { key: 'b', name: 'Bravo', greens: 9, missing: false },
              { key: 'c', name: 'Charlie', greens: 9, missing: false }];
ok('no banner clause', _nineShort(true) === '');
ok('no step-4 clause', _nineShort(false) === '');
ok('chips still shown', /Charlie 9\/9/.test(_nineBreakdownHtml()));
ok('no leftover hint', !/what is left is/.test(_nineBreakdownHtml()));

console.log('\n4. an ordinary 18 is untouched');
_nineBreak = [];
ok('no clause', _nineShort(true) === '' && _nineShort(false) === '');
ok('no breakdown block at all', _nineBreakdownHtml() === '');

console.log('\n' + p + ' passed, ' + f + ' failed (v1239 nine labels)');
process.exit(f ? 1 : 0);
