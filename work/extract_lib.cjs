const fs = require('fs');
const acorn = require('acorn');

function mainScript(file) {
  const s = fs.readFileSync(file, 'utf8');
  let best = '', bestStart = 0;
  const re = /<script(?![^>]*\bsrc=)[^>]*>/g; let m;
  while ((m = re.exec(s))) {
    const e = s.indexOf('</script>', m.index + m[0].length);
    if (e > 0 && e - (m.index + m[0].length) > best.length) { best = s.slice(m.index + m[0].length, e); bestStart = m.index + m[0].length; }
  }
  return best;
}

// A top-level declaration is "inert" if evaluating it cannot touch the DOM,
// network or storage. Function/class declarations always are (bodies don't run).
// Variable declarations are only kept when every initialiser is a plain value.
function inertInit(n) {
  if (!n) return true;
  switch (n.type) {
    case 'Literal': case 'TemplateLiteral': case 'Identifier':
    case 'FunctionExpression': case 'ArrowFunctionExpression': case 'ClassExpression':
      return true;
    case 'UnaryExpression': return inertInit(n.argument);
    case 'BinaryExpression': return inertInit(n.left) && inertInit(n.right);
    case 'ArrayExpression': return n.elements.every(e => !e || inertInit(e.type === 'SpreadElement' ? e.argument : e));
    case 'ObjectExpression': return n.properties.every(p => p.type === 'SpreadElement' ? inertInit(p.argument)
      : (inertInit(p.value) && (!p.computed || inertInit(p.key))));
    case 'NewExpression':
      // new Map() / new Set() / new WeakMap() with inert args are fine
      return n.callee.type === 'Identifier' && ['Map','Set','WeakMap','WeakSet','Date','Array','Object'].includes(n.callee.name)
             && n.arguments.every(inertInit);
    default: return false;
  }
}

function build(file) {
  const code = mainScript(file);
  const ast = acorn.parse(code, { ecmaVersion: 'latest', allowReturnOutsideFunction: true });
  const keep = [];
  const stats = { fn: 0, cls: 0, varKept: 0, varSkipped: 0, otherSkipped: 0 };
  for (const n of ast.body) {
    if (n.type === 'FunctionDeclaration') { keep.push(code.slice(n.start, n.end)); stats.fn++; }
    else if (n.type === 'ClassDeclaration') { keep.push(code.slice(n.start, n.end)); stats.cls++; }
    else if (n.type === 'VariableDeclaration') {
      if (n.declarations.every(d => inertInit(d.init))) { keep.push(code.slice(n.start, n.end)); stats.varKept++; }
      else {
        // keep the NAMES (as undefined) so references don't throw
        const names = n.declarations.map(d => d.id.type === 'Identifier' ? d.id.name : null).filter(Boolean);
        if (names.length) keep.push('var ' + names.join(', ') + ';');
        stats.varSkipped++;
      }
    } else stats.otherSkipped++;
  }
  return { src: keep.join('\n'), stats, rawLen: code.length };
}
module.exports = { build, mainScript };
