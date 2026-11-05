// Check inline handler fn names are reachable as window globals at runtime.
const H = require('../lib_harness'); const fs=require('fs');
const scan = require('../static_scan.js');
(async () => {
  const src = fs.readFileSync(require('path').join(H.REPO,'golf-app.html'),'utf8');
  const reAttr = /\bon(?:click|change|input|submit|keyup|keydown|blur|focus)\s*=\s*(\\?["'])([\s\S]*?)\1/g; const names = {}; let m;
  while ((m = reAttr.exec(src))) { const re=/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g; let c; while((c=re.exec(m[2]))) { (names[c[2]]=names[c[2]]||[]).push(src.slice(0,m.index).split('\n').length);} }
  const { srv, port } = await H.startServer(); const base = 'http://127.0.0.1:' + port;
  const b = await H.launch(); const p = await H.newPage(b, base, {}); await H.boot(p, base);
  const missing = await p.evaluate((ns) => ns.filter(n => { try { return typeof (0, eval)(n) === 'undefined'; } catch (e) { return true; } }), Object.keys(names));
  const KW=new Set(['if','return','function','typeof','catch','for','while','switch','new','void','delete','await','try','Event','event','this']);
  console.log(JSON.stringify(missing.filter(n=>!KW.has(n)).map(n=>({n,lines:names[n].slice(0,5)}))));
  await b.close(); srv.close();
})();
