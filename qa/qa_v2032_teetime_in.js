// qa/qa_v2032_teetime_in.js -- Tyler 11/9: on a tee time a player added by account is "in" -- no Verify for the
// organizer, no Accept/Decline for the player. Verify stays only for a name-only guest; declined still shows.
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + path.resolve(process.argv[2] || 'golf-app.html')); await p.waitForTimeout(3000);
  const r = await p.evaluate(async () => {
    document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
    const T = { id: 'tt1', type: 'teetime', date: '2099-01-01', time: '08:00', course: 'Buffalo Creek Golf Club', groupSize: 4, visibility: 'private', createdByUid: 'org',
      playersList: [{ name: 'Gregory Jackson', uid: 'org', status: 'accepted' }, { name: 'Tyler OConnor', uid: 'me', status: 'pending' }, { name: 'Chris Curry', uid: 'c', status: 'pending' }, { name: 'Guest Bob', status: 'pending' }, ] };
    window.timesGetItems = async () => [JSON.parse(JSON.stringify(T))];
    const html = async (uid, name, manage) => {
      _authUser = { id: uid }; window._timesMeName = name; window._timesCanManage = () => manage;
      document.querySelectorAll('.times-sheet, .times-sheet-wrap').forEach(x => x.remove());
      await timesOpenDetail('tt1'); await new Promise(r => setTimeout(r, 100));
      const rows = [...document.querySelectorAll('.times-prow-view')].map(x => x.textContent.replace(/\s+/g, ' ').trim());
      const btns = [...document.querySelectorAll('.times-act, .times-mini')].map(x => x.textContent.trim());
      return { rows, btns };
    };
    return { org: await html('org', 'Gregory Jackson', true), me: await html('me', 'Tyler OConnor', false) };
  });
  console.log(JSON.stringify(r));
  let pass = 0, fail = 0; const ok = (c, n) => { c ? pass++ : (fail++, console.log('FAIL', n)); };
  const row = (o, n) => o.rows.find(x => x.indexOf(n) === 0) || '';
  ok(/✓ in/.test(row(r.org, 'Tyler')) && /✓ in/.test(row(r.org, 'Chris')), 'organizer sees account players as in');
  ok(!/Verify/.test(row(r.org, 'Tyler')) && !/Verify/.test(row(r.org, 'Chris')), 'no Verify on account players');
  ok(/Verify/.test(row(r.org, 'Guest B')) && /invited/.test(row(r.org, 'Guest B')), 'name-only guest keeps Verify');
  ok(!r.me.btns.includes('Accept') && !r.me.btns.includes('Decline'), 'invited account player gets no Accept/Decline');
  ok(r.me.btns.includes('Leave'), 'invited account player can still Leave');
  ok(!errs.length, 'no page errors ' + errs.slice(0, 2).join(' | '));
  console.log('  ' + pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})();
