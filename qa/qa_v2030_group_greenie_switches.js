// qa/qa_v2030_group_greenie_switches.js -- Tyler 11/7: Par 3 Greenie's Hero Tax / Birdie Override switches must show
// on a regular round, a tournament CART's own games and a league night; hidden only on the director's Configure Day.
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + path.resolve(process.argv[2] || 'golf-app.html')); await p.waitForTimeout(3000);
  const r = await p.evaluate(() => {
    const show = el => getComputedStyle(el).display !== 'none';
    const bf = () => show(document.getElementById('p3greenie-bf-enabled').closest('label'));
    const bo = () => show(document.getElementById('p3greenie-birdieoverride').closest('label'));
    const B = document.body.classList, out = {};
    const G = document.getElementById('game-p3greenie'), C = document.getElementById('game-ctp');
    const tick = (el, v) => { el.checked = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
    const set = (day, grp) => { B.toggle('t2-day-config', day); B.toggle('t2-group-config', grp); };
    set(false, false); out.regular = [bf(), bo()];
    set(true, true); out.cartGames = [bf(), bo()]; tick(C, true); tick(G, true); out.cartBoth = G.checked && C.checked; tick(G, false); tick(C, false);
    set(true, false); out.director = [bf(), bo()]; tick(C, true); tick(G, true); out.directorExcl = G.checked && !C.checked; tick(G, false);
    set(false, false); return out;
  });
  console.log(JSON.stringify(r));
  let pass = 0, fail = 0; const ok = (c, n) => { c ? pass++ : (fail++, console.log('FAIL', n)); };
  ok(r.regular.every(Boolean), 'regular round: Hero Tax + Birdie Override switches show');
  ok(r.cartGames.every(Boolean), "tournament cart's own games / league night: switches show");
  ok(r.cartBoth, 'cart games: greenie and CTP can both be on');
  ok(!r.director.some(Boolean), "director's Configure Day: switches hidden (whole-field greenie)");
  ok(r.directorExcl, "director's Configure Day: greenie still unticks CTP");
  ok(!errs.length, 'no page errors');
  console.log('  ' + pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})();
