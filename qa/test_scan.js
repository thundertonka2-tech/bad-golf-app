// v1237: the whole-library GPS scan. The bug this covers: the scan pulled every
// course's full hole geometry 500 rows at a time (~137 MB), any error abandoned
// the walk, and the dashboard then reported thousands of mapped courses as
// incomplete behind a small "partial read" warning.
const fs = require('fs');
const src = fs.readFileSync('/home/claude/bg/golf-app.html', 'utf8');
function grab(name) {
  const i = src.indexOf('function ' + name + '(');
  const s = src.indexOf('async function ' + name + '(') >= 0
    ? src.indexOf('async function ' + name + '(') : i;
  let d = 0, j = src.indexOf('{', s);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(s, k + 1); }
  }
  throw new Error('not found: ' + name);
}
const code = [grab('bgGpsDigest'), grab('bgCountGps'), grab('_storeMappedRow'),
              grab('bgScanAllGps'), grab('_finishScan')].join('\n');

global._adminMappedCache = new Map();
global.supaReady = true; global.supaOnline = true;
global.initSupabase = async () => {};
eval(code);

// --- a fake library -------------------------------------------------------
const N = 2300;
const mk = i => { const h = {};
  for (let n = 1; n <= 18; n++) h[String(n)] = { mid: [-80 + i * 1e-4, 40 + n * 1e-4], par: 4, fwc: [-80, 40] };
  return { course_id: 'c' + i, holes: h }; };
const ALL = Array.from({ length: N }, (_, i) => mk(i));

let rpcCalls = 0, tableCalls = 0;
function makeSupa(opts) {
  return {
    rpc: async (fn, a) => { rpcCalls++;
      if (opts.rpcMissing) return { error: { message: 'function does not exist' } };
      if (opts.rpcDiesAt != null && a.p_from >= opts.rpcDiesAt) return { error: { message: 'boom' } };
      return { data: ALL.slice(a.p_from, a.p_from + a.p_limit) }; },
    from: () => ({ select: () => ({ range: async (f, t) => { tableCalls++;
      const size = t - f + 1;
      if (opts.tableMaxPage && size > opts.tableMaxPage) return { error: { message: 'payload too large' } };
      return { data: ALL.slice(f, t + 1) }; } }) })
  };
}
const reset = () => { _adminMappedCache.clear(); rpcCalls = tableCalls = 0; };

let p = 0, f = 0;
const eq = (n, a, b) => { const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) { p++; console.log('  ok  ' + n); } else { f++; console.log('  FAIL ' + n + '\n       got ' + A + '\n       want ' + B); } };

(async () => {
  console.log('1. the RPC path reads the whole library');
  reset(); global.supa = makeSupa({});
  let c = await bgScanAllGps();
  eq('every course counted', c.size, N);
  eq('scan reported honest', c.scanOk, true);
  eq('greens counted per course', c.get('c7'), 18);
  eq('never touched the fat table read', tableCalls, 0);

  console.log('\n2. no RPC on this database -> falls back, still reads everything');
  reset(); global.supa = makeSupa({ rpcMissing: true });
  c = await bgScanAllGps();
  eq('all courses still counted', c.size, N);
  eq('still honest', c.scanOk, true);
  eq('used the table path', tableCalls > 0, true);

  console.log('\n3. the ORIGINAL bug: a page too fat to fetch');
  reset(); global.supa = makeSupa({ rpcMissing: true, tableMaxPage: 60 });
  c = await bgScanAllGps();
  eq('shrinks the page instead of giving up', c.size, N);
  eq('does not claim a partial read', c.scanOk, true);
  eq('mapped course is not reported unmapped', c.has('c1999'), true);

  console.log('\n4. RPC dies halfway -> the half-scan is discarded, not trusted');
  reset(); global.supa = makeSupa({ rpcDiesAt: 1000 });
  c = await bgScanAllGps();
  eq('recovered every course via the table', c.size, N);
  eq('honest', c.scanOk, true);

  console.log('\n5. when nothing can be read, it says so rather than reporting zeros');
  reset(); global.supa = makeSupa({ rpcMissing: true, tableMaxPage: 1 });
  c = await bgScanAllGps();
  eq('scanOk false', c.scanOk, false);
  eq('no invented completions', c.size, 0);

  console.log('\n' + p + ' passed, ' + f + ' failed (v1237 library scan)');
  process.exit(f ? 1 : 0);
})();
