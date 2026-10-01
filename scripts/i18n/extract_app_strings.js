// Extract candidate user-facing English strings from golf-app.html
// Output: strings.json  [{key, kind:'exact'|'pattern', src, line, ctx}]
const fs = require('fs');
const acorn = require('acorn');
const walk = require('acorn-walk');
const parse5 = require('parse5');

const file = process.argv[2] || '../golf-app.html';
const html = fs.readFileSync(file, 'utf8');
const lines = html.split('\n');

const out = new Map(); // key -> entry
function add(key, kind, src, line, ctx) {
  key = normWS(key);
  if (!key) return;
  if (!isUiText(key, kind, src)) return;
  const e = out.get(key);
  if (e) { e.n++; return; }
  out.set(key, { key, kind, src, line, ctx: (ctx || '').slice(0, 140), n: 1 });
}
function normWS(s) { return String(s).replace(/\s+/g, ' ').trim(); }

const SENT = /\u0001(\d+)\u0001/g;
function isUiText(s, kind, src) {
  const plain = s.replace(SENT, '').replace(/\{\d+\}/g, '');
  const visible = /^markup$|-html$/.test(src || '');   // text nodes between tags are always on screen
  if (!/[A-Za-z]{2,}/.test(plain)) return false;
  if (/^(https?:|mailto:|tel:|data:|\/\/|www\.)/i.test(s)) return false;
  if (/^[\w.-]+@[\w.-]+$/.test(s)) return false;
  if (!visible && /^[#.]?[a-z][\w-]*([.#:\[][\w-]*)*$/.test(s) && !/\s/.test(s) && s === s.toLowerCase()) return false; // ident/selector
  if (/[{};]\s*$/.test(plain) && /:/.test(plain)) return false; // css
  if (/^\s*[\w-]+\s*:\s*[^;]+;/.test(plain)) return false; // css decl
  if (/=>|function\s*\(|\breturn\b|\bconst\b|\bvar\b|===|!==|&&|\|\|/.test(plain)) return false;
  if (/^(select|insert|update|delete|create|alter|grant)\b/i.test(plain) && /\b(from|into|table|set|where|on)\b/i.test(plain)) return false;
  if (!visible && /^[A-Z0-9_]{3,}$/.test(plain)) return false; // CONSTANT
  if (/^v?\d{4}\.\d+/.test(plain)) return false;
  if (!visible && /^[a-z]+([A-Z][a-z0-9]*)+$/.test(plain)) return false; // camelCase
  if (!visible && /^[a-z0-9]+(_[a-z0-9]+)+$/i.test(plain)) return false; // snake
  if (!visible && /^[a-z0-9]+(-[a-z0-9]+)+$/.test(plain)) return false; // kebab
  if (/\.(png|jpe?g|svg|mp4|caf|js|css|html|json|pdf|webp)\b/i.test(plain) && !/\s/.test(plain)) return false;
  if (/^(rgba?|hsla?|var|calc|url|translate|scale|rotate|linear-gradient)\(/i.test(plain)) return false;
  if (/\d+px/.test(plain) && /(sans-serif|serif|monospace|-apple-system|system-ui)/.test(plain)) return false;
  if (/^[\d\s.,:%+\-–—×x\/()]*$/.test(plain)) return false;
  if (/^(px|em|rem|vh|vw|auto|none|block|flex|grid|inline|hidden|visible|absolute|relative|fixed|bold|normal|center|left|right|top|bottom)$/i.test(plain)) return false;
  return true;
}

// ---------- 1) static markup (outside <script>) ----------
function walkHtml(node, srcTag, lineBase, cb) {
  // cb(textOrNull, attrName, value, loc)
  if (node.nodeName === 'script' || node.nodeName === 'style') return;
  if (node.nodeName === '#text') cb(node.value, null, node.sourceCodeLocation);
  if (node.attrs) for (const a of node.attrs) {
    if (['placeholder', 'title', 'aria-label', 'alt', 'data-tip', 'value'].includes(a.name)) {
      if (a.name === 'value' && !(node.nodeName === 'input' && /button|submit/i.test((node.attrs.find(x => x.name === 'type') || {}).value || ''))) continue;
      cb(a.value, a.name, node.sourceCodeLocation);
    }
  }
  const kids = node.childNodes || (node.content && node.content.childNodes) || [];
  for (const k of kids) walkHtml(k, srcTag, lineBase, cb);
  if (node.content && node.content.childNodes && node.childNodes !== node.content.childNodes) for (const k of node.content.childNodes) walkHtml(k, srcTag, lineBase, cb);
}
const doc = parse5.parse(html, { sourceCodeLocationInfo: true });
walkHtml(doc, 'doc', 0, (t, attr, loc) => {
  if (t == null) return;
  add(t, 'exact', attr ? 'markup@' + attr : 'markup', loc ? loc.startLine : 0, '');
});

// ---------- 2) inline scripts ----------
const scriptRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m, scriptCount = 0;
const SKIP_CALLEES = /^(console\.\w+|localStorage\.\w+|sessionStorage\.\w+|document\.(querySelector|querySelectorAll|getElementById|getElementsByClassName|createElement)|\w*\.(querySelector|querySelectorAll|closest|matches|getElementById|addEventListener|removeEventListener|setAttribute|getAttribute|removeAttribute|hasAttribute|toggleAttribute|classList\.\w+|from|select|eq|neq|in|order|rpc|channel|on|ilike|like|is|match|contains|upsert|insert|update|delete|split|join|replace|replaceAll|indexOf|includes|startsWith|endsWith|getItem|setItem|removeItem|postMessage|dispatchEvent|setProperty|getPropertyValue|fetch|invoke|log|warn|error|debug|info)|fetch|require|importScripts|RegExp|Error|TypeError|_dbg|dbg|bgLog|bgDbg|bgTrace)$/;

function calleeName(c) {
  if (!c) return '';
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression') {
    const o = calleeName(c.object); const p = c.computed ? '[]' : (c.property.name || '');
    return (o ? o + '.' : '') + p;
  }
  if (c.type === 'ThisExpression') return 'this';
  return '';
}

function handleTemplateLike(raw, exprCount, line, ctx, srcKind) {
  // raw contains \u0001N\u0001 for expressions
  if (/<[a-zA-Z!\/]/.test(raw)) {
    // HTML fragment
    let frag;
    try { frag = parse5.parseFragment(raw, { sourceCodeLocationInfo: false }); } catch (e) { return; }
    walkHtml(frag, 'frag', 0, (t, attr) => {
      if (t == null) return;
      emitPiece(t, line, ctx, srcKind + (attr ? '-html@' + attr : '-html'));
    });
  } else {
    emitPiece(raw, line, ctx, srcKind);
  }
}
function emitPiece(t, line, ctx, src) {
  t = normWS(t);
  if (!t) return;
  if (SENT.test(t)) {
    SENT.lastIndex = 0;
    // renumber placeholders in order of appearance
    let i = 0; const k = t.replace(SENT, () => '{' + (i++) + '}');
    if (/^(\{\d+\}\s*)+$/.test(k)) return;
    add(k, 'pattern', src, line, ctx);
  } else add(t, 'exact', src, line, ctx);
}

const UI_PROP = /^(label|title|name|desc|description|text|msg|message|hint|sub|subtitle|how|cta|btn|button|placeholder|help|tip|body|note|caption|header|heading|short|long|earn|rule|rules|summary|blurb|lead|intro|info|detail|details|tag|tagline|empty|ok|cancel|confirm|yes|no|question|prompt|explain|why|what|when|ex|example|line|line1|line2|status|toast|alert|warn|warning|error|err|unit|plural|singular|chip|pill|badge|head|foot|footer|subhead|sublabel|lbl|t|h|d|s|q|a)$/i;
const UI_CALLEE = /(toast|Toast|alert|Alert|confirm|Confirm|prompt|Prompt|notify|Notify|setStatus|showMsg|showMessage|showError|banner|Banner|say|speak|modal|Modal|sheet|Sheet|announce|fillText|strokeText|share|Share|label|Label|title|Title)/;

while ((m = scriptRe.exec(html))) {
  scriptCount++;
  const code = m[1];
  const startLine = html.slice(0, m.index).split('\n').length;
  let ast;
  try {
    ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowHashBang: true, allowReturnOutsideFunction: true });
  } catch (e) { console.error('parse fail script', scriptCount, e.message); continue; }

  walk.fullAncestor(ast, (node, state, anc) => {
    // String concatenation chains: 'Day ' + n + ' of ' + total  ->  pattern
    if (node.type === 'BinaryExpression' && node.operator === '+') {
      const par = anc[anc.length - 2];
      if (par && par.type === 'BinaryExpression' && par.operator === '+') return; // only top of chain
      const parts = [];
      (function flat(n) {
        if (n.type === 'BinaryExpression' && n.operator === '+') { flat(n.left); flat(n.right); }
        else parts.push(n);
      })(node);
      const hasLit = parts.some(p => (p.type === 'Literal' && typeof p.value === 'string' && /[A-Za-z]{2,}/.test(p.value)) || (p.type === 'TemplateLiteral' && p.quasis.some(q => /[A-Za-z]{2,}/.test(q.value.cooked || ''))));
      if (!hasLit || parts.length < 2) return;
      let callee = '';
      for (let i = anc.length - 2; i >= 0; i--) { const a = anc[i]; if (a.type === 'CallExpression' || a.type === 'NewExpression') { callee = calleeName(a.callee); break; } if (/Function|Statement|Declaration/.test(a.type) && a.type !== 'VariableDeclaration') break; }
      if (callee && SKIP_CALLEES.test(callee)) return;
      let raw = '', k = 0;
      for (const p of parts) {
        if (p.type === 'Literal' && typeof p.value === 'string') raw += p.value;
        else if (p.type === 'TemplateLiteral') p.quasis.forEach((q, i) => { raw += q.value.cooked == null ? q.value.raw : q.value.cooked; if (i < p.expressions.length) raw += '\u0001' + (k++) + '\u0001'; });
        else raw += '\u0001' + (k++) + '\u0001';
      }
      const line = startLine + node.loc.start.line - 1;
      handleTemplateLike(raw, k, line, (lines[line - 1] || '').trim(), 'js-cat');
      return;
    }
    let isTpl = node.type === 'TemplateLiteral';
    let isStr = node.type === 'Literal' && typeof node.value === 'string';
    if (!isTpl && !isStr) return;
    const parent = anc[anc.length - 2];
    if (isTpl && parent && parent.type === 'TaggedTemplateExpression') return;
    // skip import/obj keys
    if (isStr && parent && parent.type === 'Property' && parent.key === node && !parent.computed) return;
    if (isStr && parent && parent.type === 'MemberExpression' && parent.property === node) return;
    // find nearest call
    let callee = '';
    for (let i = anc.length - 2; i >= 0; i--) {
      const a = anc[i];
      if (a.type === 'CallExpression' || a.type === 'NewExpression') { callee = calleeName(a.callee); break; }
      if (/Function|Statement|Declaration/.test(a.type) && a.type !== 'VariableDeclaration') break;
    }
    if (callee && SKIP_CALLEES.test(callee)) return;
    // binary comparisons (x === 'foo') are code, not UI
    if (parent && parent.type === 'BinaryExpression' && /^(===|!==|==|!=|in|instanceof)$/.test(parent.operator)) return;
    if (parent && parent.type === 'SwitchCase') return;

    const line = startLine + node.loc.start.line - 1;
    const ctx = (lines[line - 1] || '').trim();
    let raw;
    if (isTpl) {
      raw = '';
      node.quasis.forEach((q, i) => { raw += q.value.cooked == null ? q.value.raw : q.value.cooked; if (i < node.expressions.length) raw += '\u0001' + i + '\u0001'; });
    } else raw = node.value;

    const hasHtml = /<[a-zA-Z!\/]/.test(raw);
    // UI-context hint
    let uiCtx = hasHtml;
    if (!uiCtx && callee && UI_CALLEE.test(callee)) uiCtx = true;
    if (!uiCtx && parent && parent.type === 'Property' && parent.value === node) {
      const k = parent.key.name || parent.key.value || '';
      if (UI_PROP.test(k)) uiCtx = true;
    }
    if (!uiCtx && parent && parent.type === 'AssignmentExpression') {
      const l = calleeName(parent.left);
      if (/(textContent|innerText|innerHTML|outerHTML|placeholder|title|value|label|ariaLabel|alt)$/.test(l)) uiCtx = true;
    }
    // plain string w/ space + Capital/sentence shape is likely UI anywhere
    const plain = raw.replace(SENT, '');
    const sentenceish = /^[\s"'“(¡¿✓✔•·…—–\-]*[A-Z0-9\u{1F300}-\u{1FAFF}☀-➿]/u.test(plain) && /[a-z]{2,}/.test(plain) && /\s/.test(plain.trim());
    if (!uiCtx && !sentenceish) return;
    handleTemplateLike(raw, isTpl ? node.expressions.length : 0, line, ctx, isTpl ? 'js-tpl' : 'js-str');
  });
}

const arr = [...out.values()];
fs.writeFileSync('strings.json', JSON.stringify(arr, null, 1));
const by = {};
for (const e of arr) { const k = e.src.split('@')[0] + ':' + e.kind; by[k] = (by[k] || 0) + 1; }
console.log('scripts', scriptCount, 'unique', arr.length, by);
console.log('words', arr.reduce((s, e) => s + e.key.split(/\s+/).length, 0));
