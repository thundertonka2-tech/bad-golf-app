// qa/qa_update_gate.js -- the v1207 force-update gate, end to end in the real page (native mode stubbed).
// Scenarios: below the floor -> full-screen block; behind store but above floor -> banner only;
// floor above the store -> capped at the store (still blocks); at/ahead of store -> nothing;
// Apple unreachable -> nothing (fail open); web -> nothing.
// usage: node qa/qa_update_gate.js golf-app.html
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + path.resolve(process.argv[2] || 'golf-app.html')); await p.waitForTimeout(3000);
  const r = await p.evaluate(async () => {
    const out = { build: BG_BUILD };
    const mine = bgVerNum(BG_BUILD); const v = d => mine.slice(0, 2).concat([mine[2] + d]).join('.');   // build +/- d
    let store = null, floor = null, native = true;
    window.isNativeApp = () => native;
    window.fetch = async (u) => {
      if (String(u).indexOf('itunes.apple.com') >= 0) {
        if (store === 'down') throw new Error('offline');
        return { json: async () => ({ resultCount: 1, results: [{ version: store, trackViewUrl: 'https://apps.apple.com/us/app/x/id6779399027' }] }) };
      }
      throw new Error('unexpected fetch ' + u);
    };
    const q = () => { const api = { select() { return api; }, eq() { return api; }, maybeSingle() { return Promise.resolve({ data: floor ? { data: { requiredBuild: floor } } : null, error: null }); } }; return api; };
    supa = { from: q }; supaReady = true; supaOnline = true;
    const ui = () => ({ block: !!document.getElementById('bg-update-block'), banner: !!document.getElementById('bg-update-banner') });
    const run = async (s, f, nat) => {
      _bgHideUpdateUi(); store = s; floor = f; native = nat !== false;
      try { localStorage.removeItem('golf:store-version'); localStorage.removeItem('golf:update-nudge-dismissed'); localStorage.removeItem('golf:app-update'); } catch (e) {}
      await bgUpdateGateCheck(true); return ui();
    };
    out.belowFloor   = await run(v(5), v(5));          // store and floor ahead of me -> block
    out.behindAbove  = await run(v(5), v(-3));         // store ahead, floor below me -> banner only
    out.floorCapped  = await run(v(5), v(50));         // floor above store -> capped at store -> block
    out.noFloor      = await run(v(5), null);          // no floor -> banner
    out.atStore      = await run(v(0), v(0));          // I'm the live build -> nothing
    out.aheadOfStore = await run(v(-4), v(-4));        // me ahead of store (normal during review) -> nothing
    out.appleDown    = await run('down', v(5));        // can't reach Apple -> fail open
    out.web          = await run(v(5), v(5), false);   // web -> never gated
    // the block's Update button points at the store
    await run(v(5), v(5));
    const btn = document.getElementById('bg-update-block-btn'); out.blockHasButton = !!btn;
    // today's real numbers: store 2026.11.2030, floor 2026.11.2030 -> a 2026.11.2029 phone is blocked
    out.realCmp = { below: bgVerCmp('v2026.11.2029', '2026.11.2030'), equal: bgVerCmp('v2026.11.2030', '2026.11.2030'), newer: bgVerCmp('v2026.11.2034', '2026.11.2030'), oldStyle: bgVerCmp('v2026.10.1999', '2026.11.2030') };
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  let pass = 0, fail = 0; const ok = (c, n) => { c ? pass++ : (fail++, console.log('FAIL', n)); };
  ok(r.belowFloor.block && !r.belowFloor.banner, 'below the floor -> full-screen Update required');
  ok(!r.behindAbove.block && r.behindAbove.banner, 'behind the store but above the floor -> banner only');
  ok(r.floorCapped.block, 'floor above the store is capped at the store and still blocks');
  ok(!r.noFloor.block && r.noFloor.banner, 'no floor -> banner only');
  ok(!r.atStore.block && !r.atStore.banner, 'on the live build -> nothing');
  ok(!r.aheadOfStore.block && !r.aheadOfStore.banner, 'ahead of the store (in review) -> nothing');
  ok(!r.appleDown.block && !r.appleDown.banner, 'Apple unreachable -> fails open');
  ok(!r.web.block && !r.web.banner, 'web build is never gated');
  ok(r.blockHasButton, 'block has the Update now button');
  ok(r.realCmp.below === -1 && r.realCmp.equal === 0 && r.realCmp.newer === 1 && r.realCmp.oldStyle === -1, 'version compare on real numbers');
  ok(!errs.length, 'no page errors ' + errs.slice(0, 2).join(' | '));
  console.log('  ' + pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})();
