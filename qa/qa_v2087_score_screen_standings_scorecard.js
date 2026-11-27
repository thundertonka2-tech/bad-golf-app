// qa/qa_v2087_score_screen_standings_scorecard.js -- real Chromium, phone sizes, real taps.
// The Score screen's scorecard, standings first (Tyler picked mockup D, 11/27):
//  big rows (photo / initials, name, HCP, to par, gross / net), YOUR card open and everyone else collapsed,
//  hole / par / HCP / score lines per nine with the white stroke dot and net at the end, tap any score to fix it,
//  same first name -> last initial, never two circles the same colour, "Classic scorecard" brings the old table back.
//   node qa/qa_v2087_score_screen_standings_scorecard.js golf-app.html
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const FILE = path.resolve(process.argv[2] || 'golf-app.html');
  const b = await chromium.launch(); const fails = []; let n = 0; const ok = (c, name, d) => { n++; if (!c) fails.push(name + (d !== undefined ? '   ' + JSON.stringify(d).slice(0, 500) : '')); };
  const mk = async (W, theme) => { const p = await b.newPage({ viewport: { width: W, height: 844 }, isMobile: true, hasTouch: true }); p._errs = []; p.on('pageerror', e => p._errs.push(String(e).slice(0, 160))); await p.goto('file://' + FILE); await p.waitForTimeout(2200); await p.evaluate((t) => { document.documentElement.setAttribute('data-theme', t); try { localStorage.removeItem('bg_sc_view'); } catch (e) {} }, theme || 'dark'); return p; };
  const start = (p, opt) => p.evaluate(async (opt) => {
    opt = opt || {};
    const PARS = [4,3,5,3,4,4,5,4,4,4,3,4,5,4,5,3,4,4], SIS = [5,7,9,11,3,1,15,17,13,6,8,10,12,4,2,16,18,14];
    const names = opt.names || [['Tyler',"O'Connor",8],['Kevin','Wells',12],['Christopher','Montgomery',18],['Kevin','Brewer',15]];
    const players = names.map((nm,i)=>({id:'p'+i,name:nm[0]+' '+nm[1],firstName:nm[0],lastName:nm[1],hcp:nm[2],rawHcp:nm[2],baseHcp:nm[2],teeLabel:'Blue'}));
    const D=[[0,0,1,0,-1,1,0,0,1,0,1,0,0,1],[1,0,1,1,0,2,0,1,0,1,0,1,-1,1],[1,1,2,0,1,1,1,0,2,1,1,0,2,1],[0,1,1,1,0,1,2,0,1,0,1,1,1,0]];
    const nH = opt.holes || 18, thru = opt.thru == null ? 14 : opt.thru;
    const scores = {}; players.forEach((pl,i) => { scores[pl.id] = new Array(18).fill(null).map((_, h) => (h < Math.min(thru, nH) ? PARS[h] + D[i % 4][h % 14] : null)); });
    const g = { code: 'SS' + Math.floor(Math.random() * 1e6), players, scores, pars: nH === 9 ? PARS.slice(0, 9) : PARS, sis: nH === 9 ? [5,7,9,3,1,2,6,8,4] : SIS, tees:[{label:'Blue',rating:72.2,slope:127,yards:6499}], hcpRules: Object.assign({pct:100,basis:'full',holes:nH}, opt.rules || {}), course:'QA', courseId:'qa', createdAt: Date.now(), updatedAt: Date.now(), games: opt.games || { skins: { value: 1, net: true } } };
    if (nH === 9) g.holes = 9;
    window.__saves = 0; saveGame = async () => { window.__saves++; return true; };
    window.__me = opt.me === undefined ? 'p0' : opt.me; gpsResolveMyId = () => window.__me;
    try { localStorage.setItem(KEY_AUTO_ADVANCE, 'off'); } catch (e) {}
    state.game = g; state.currentHole = Math.min(15, nH); state.viewOnlyMode = !!opt.viewOnly; switchTab('score'); renderScoreEntry();
    await new Promise(r => setTimeout(r, 250));
    document.querySelectorAll('body *').forEach(e => { const cs = getComputedStyle(e); if (cs.position === 'fixed' && !e.querySelector('#bg-sc-stand') && e.id !== 'bg-hole-edit') e.style.visibility = 'hidden'; });
    return true;
  }, opt);
  const snap = (p) => p.evaluate(() => { const box = document.getElementById('bg-sc-stand'), sec = document.getElementById('score-tab-scorecard-section');
    const cards = [...box.querySelectorAll('.bg-ss-card')];
    return { stand: sec.classList.contains('bg-sc-mode-stand'), tableShown: getComputedStyle(sec.querySelector('.scorecard-wrap')).display !== 'none', sw: (document.getElementById('bg-sc-stand-switch') || {}).innerText, swShown: getComputedStyle(document.getElementById('bg-sc-stand-switch')).display !== 'none',
      cards: cards.map(c => ({ id: c.dataset.ssPid, open: c.classList.contains('bg-ss-open'), rank: c.querySelector('.bg-ss-rank').innerText, name: c.querySelector('.bg-ss-name').innerText, big: c.querySelector('.bg-ss-big').innerText, hcp: (c.querySelector('.bg-ss-hcp') || {}).innerText || '', meta: c.querySelector('.bg-ss-meta').innerText.replace(/\s+/g, ' '), color: (c.querySelector('.bg-ss-av').style.background || c.querySelector('.bg-ss-av').style.boxShadow), cells: c.querySelectorAll('.bg-ss-cell').length, dots: [...c.querySelectorAll('.bg-ss-cell')].filter(x => x.querySelector('.bg-ss-dot')).map(x => +x.dataset.ssHole), sums: [...c.querySelectorAll('.bg-ss-sum')].map(x => x.innerText.replace(/\s+/g, ' ')), total: (c.querySelector('.bg-ss-total') || {}).innerText ? c.querySelector('.bg-ss-total').innerText.replace(/\s+/g, ' ') : '', lines: [...c.querySelectorAll('.bg-ss-lab')].map(x => x.innerText) })) }; });

  // ---- 1. the card, at 390 ----
  let p = await mk(390);
  await start(p);
  let S = await snap(p);
  ok(S.stand && !S.tableShown && S.swShown && /Classic scorecard/.test(S.sw), 'the new card is the default on the Score screen; the old table is hidden; a "Classic scorecard" button is offered', { stand: S.stand, table: S.tableShown, sw: S.sw });
  ok(S.cards.length === 4 && S.cards.map(c => c.name).sort().join('|') === 'Christopher|Kevin B.|Kevin W.|Tyler', 'one row per player; the two Kevins read "Kevin W." and "Kevin B."; a long first name is shown whole', S.cards.map(c => c.name));
  ok(new Set(S.cards.map(c => c.color)).size === 4, 'every circle has its own colour', S.cards.map(c => c.color));
  ok(S.cards.filter(c => c.open).map(c => c.id).join() === 'p0', 'MY card is open and everyone else is collapsed', S.cards.map(c => c.id + ':' + c.open));
  const exp = await p.evaluate(() => { const g = state.game; return g.players.map(pl => { const nt = bgNineTotals(g, pl); let par = 0; for (let i = 0; i < 14; i++) par += g.pars[i]; return { id: pl.id, gross: nt.gross, net: nt.net, outG: nt.outGross, outN: nt.outNet, inG: nt.inGross, inN: nt.inNet, netPar: nt.net - par, hcp: Math.round(effectiveHcp(pl, g.hcpRules)), strokes: g.pars.map((_, i) => strokesOnHole(effectiveHcp(pl, g.hcpRules), siFor(g, pl.id, i), parFor(g, pl.id, i), g.hcpRules) > 0 ? i + 1 : 0).filter(Boolean) }; }); });
  const tp = v => v === 0 ? 'E' : v > 0 ? '+' + v : '−' + Math.abs(v);
  ok(S.cards.every(c => { const e = exp.find(x => x.id === c.id); return c.big === tp(e.netPar) && c.meta.includes(e.gross + ' gross') && c.meta.includes(e.net + ' net') && c.hcp === 'HCP ' + e.hcp && /thru 14/.test(c.meta); }), 'each row: HCP, thru, gross and net, and net to par - all equal to the app\'s own totals', { got: S.cards.map(c => [c.id, c.big, c.hcp, c.meta]), exp });
  const order = S.cards.map(c => exp.find(x => x.id === c.id).netPar);
  ok(order.every((v, i) => i === 0 || order[i - 1] <= v) && S.cards.every((c, i) => { const same = order.filter(v => v === order[i]).length > 1; return c.rank === (same ? 'T' : '') + (order.indexOf(order[i]) + 1); }), 'players are ranked low to high on net to par; ties show a T and share the place', S.cards.map(c => c.rank + ' ' + c.big));
  const me = S.cards.find(c => c.id === 'p0'), eMe = exp.find(x => x.id === 'p0');
  ok(me.cells === 18 && me.lines.join() === 'Hole,Par,HCP,Score,Hole,Par,HCP,Score', 'the open card has both nines: Hole, Par, HCP and Score lines, 18 scores', me.lines);
  ok(me.dots.join() === eMe.strokes.join() && me.dots.length === 8, 'a stroke dot sits on exactly the holes he gets a stroke on', { got: me.dots, exp: eMe.strokes });
  const dotCol = await p.evaluate(() => { const d = document.querySelector('.bg-ss-cell .bg-ss-dot'); const r = d.getBoundingClientRect(), c = d.parentElement.getBoundingClientRect(); return { color: getComputedStyle(d).color, topRight: r.top - c.top < 14 && c.right - r.right < 10 }; });
  ok(/24[0-9], 24[0-9], 24[0-9]|255, 255, 255|2[23][0-9], 2[23][0-9], 2[34][0-9]/.test(dotCol.color) && dotCol.topRight, 'the stroke dot is white, upper right of the score (like the old card)', dotCol);
  ok(me.sums[0] === eMe.outG + ' ' + eMe.outN + ' net' && me.sums[1] === eMe.inG + ' ' + eMe.inN + ' net', 'net is shown at the end of each nine under the gross', { got: me.sums, exp: [eMe.outG, eMe.outN, eMe.inG, eMe.inN] });
  ok(me.total.includes(eMe.gross + ' gross') && me.total.includes(eMe.net + ' net') && me.total.includes(tp(eMe.netPar) + ' net to par'), 'a Total line: gross, net, net to par', me.total);
  const hcpLine = await p.evaluate(() => [...document.querySelectorAll('.bg-ss-open .bg-ss-nine')].map(nn => [...nn.querySelectorAll('.bg-ss-hc')].map(x => x.innerText).filter(Boolean).join()));
  ok(hcpLine[0] === '5,7,9,11,3,1,15,17,13' && hcpLine[1] === '6,8,10,12,4,2,16,18,14', 'the HCP line is the hole handicaps', hcpLine);
  // sizes
  const sz = await p.evaluate(() => { const f = s => parseFloat(getComputedStyle(document.querySelector(s)).fontSize); const cells = [...document.querySelectorAll('.bg-ss-cell')].map(x => x.getBoundingClientRect()); return { name: f('.bg-ss-name'), big: f('.bg-ss-big'), score: f('.bg-ss-cell .bg-ss-mark'), hole: f('.bg-ss-hn'), par: f('.bg-ss-pr'), hc: f('.bg-ss-hc'), meta: f('.bg-ss-meta'), cellH: Math.min(...cells.map(r => r.height)), rowH: document.querySelector('.bg-ss-row').getBoundingClientRect().height, old: parseFloat(getComputedStyle(document.querySelector('#scorecard-score-tab td') || document.body).fontSize) }; });
  ok(sz.name >= 20 && sz.big >= 28 && sz.score >= 19 && sz.hole >= 15 && sz.par >= 15 && sz.hc >= 14 && sz.meta >= 15 && sz.cellH >= 44 && sz.rowH >= 60, 'everything is bigger: name 20px, to par 28px, scores 19px, hole / par 15px, tap targets 44px+', sz);
  // tap to toggle
  await p.locator('.bg-ss-card[data-ss-pid="p2"] .bg-ss-row').tap(); await p.waitForTimeout(150);
  S = await snap(p);
  ok(S.cards.filter(c => c.open).map(c => c.id).sort().join() === 'p0,p2', 'tapping another player opens his card (mine stays open)', S.cards.map(c => c.id + ':' + c.open));
  await p.locator('.bg-ss-card[data-ss-pid="p0"] .bg-ss-row').tap(); await p.waitForTimeout(150);
  S = await snap(p);
  ok(S.cards.filter(c => c.open).map(c => c.id).join() === 'p2', 'tapping an open card closes it');
  await p.evaluate(() => renderScoreEntry()); await p.waitForTimeout(150);
  S = await snap(p);
  ok(S.cards.filter(c => c.open).map(c => c.id).join() === 'p2', 'what I opened / closed survives a repaint (it is not forced back open)');
  // tap a score -> the editor, for any player and any hole, played or not
  await p.locator('.bg-ss-card[data-ss-pid="p2"] .bg-ss-cell[data-ss-hole="3"]').tap(); await p.waitForTimeout(250);
  let ed = await p.evaluate(() => { const o = document.getElementById('bg-hole-edit'); return o ? o.innerText.replace(/\s+/g, ' ').slice(0, 160) : null; });
  ok(ed && /Christopher/.test(ed) && /3/.test(ed), 'tapping a score opens the same score editor as the old card (Christopher, hole 3)', ed);
  const chg = await p.evaluate(async () => { const g = state.game, before = g.scores.p2[2]; const o = document.getElementById('bg-hole-edit'); const btns = [...o.querySelectorAll('button')]; const minus = () => [...document.getElementById('bg-hole-edit').querySelectorAll('button')].find(x => x.innerText.trim() === '\u2212' || x.innerText.trim() === '-'); minus().click(); await new Promise(r => setTimeout(r, 250)); const sv = [...(document.getElementById('bg-hole-edit') || document.createElement('div')).querySelectorAll('button')].find(x => /^done$/i.test(x.innerText.trim())); if (sv) sv.click(); await new Promise(r => setTimeout(r, 300)); return { before, after: g.scores.p2[2], labels: btns.map(x => x.innerText.trim()).slice(0, 14), open: !!document.getElementById('bg-hole-edit') }; });
  ok(chg.before === 7 && chg.after === 6 && !chg.open, 'changing it there (minus, Done) changes the round (7 -> 6)', chg);
  await p.evaluate(() => { try { bgCloseHoleScoreEdit(); } catch (e) {} }); await p.waitForTimeout(150);
  const shown = await p.evaluate(() => { const c = document.querySelector('.bg-ss-card[data-ss-pid="p2"] .bg-ss-cell[data-ss-hole="3"] .bg-ss-mark'); return c ? c.innerText : null; });
  ok(shown === '6', '...and the new card shows the new score straight away', shown);
  await p.locator('.bg-ss-card[data-ss-pid="p2"] .bg-ss-cell[data-ss-hole="17"]').tap(); await p.waitForTimeout(250);
  ed = await p.evaluate(() => { const o = document.getElementById('bg-hole-edit'); const t = o ? o.innerText.replace(/\s+/g, ' ').slice(0, 120) : null; try { bgCloseHoleScoreEdit(); } catch (e) {} return t; });
  ok(ed && /17/.test(ed), 'a hole with no score yet can be tapped too (hole 17)', ed);
  // classic switch
  await p.locator('#bg-sc-stand-switch').tap(); await p.waitForTimeout(200);
  S = await snap(p);
  const cl = await p.evaluate(() => ({ ls: localStorage.getItem('bg_sc_view'), rows: document.querySelectorAll('#scorecard-score-tab tbody tr').length, tabs: !!document.querySelector('#scorecard-score-tab caption, #score-tab-scorecard-section .bg-sc-twin, #scorecard-score-tab thead'), help: document.getElementById('bg-sc-stand-help').innerText }));
  ok(!S.stand && S.tableShown && S.cards.length === 0 && /New scorecard/.test(S.sw) && cl.rows >= 4 && cl.ls === 'classic', '"Classic scorecard" brings the old table back (and the button now says "New scorecard")', { S: [S.stand, S.tableShown, S.sw], cl });
  await start(p);
  S = await snap(p);
  ok(!S.stand && S.tableShown, 'the choice is remembered for the next round on this phone');
  await p.locator('#bg-sc-stand-switch').tap(); await p.waitForTimeout(200);
  S = await snap(p);
  ok(S.stand && S.cards.length === 4, '"New scorecard" switches back');
  ok(p._errs.length === 0, 'no page errors (main flow)', p._errs.slice(0, 2));

  // ---- 2. who am I unknown -> everyone collapsed; later known -> mine opens ----
  await start(p, { me: null });
  S = await snap(p);
  ok(S.cards.every(c => !c.open), 'if the app does not know which player I am, everyone starts collapsed (it never guesses)');
  await p.evaluate(() => { window.__me = 'p3'; renderScoreEntry(); }); await p.waitForTimeout(150);
  S = await snap(p);
  ok(S.cards.filter(c => c.open).map(c => c.id).join() === 'p3', '...and my card opens as soon as it does');

  // ---- 3. same first AND last name: still told apart by colour; same first + same last initial -> more letters ----
  await start(p, { names: [['Kevin','Wells',10],['Kevin','Wells',14],['Kevin','Walker',6],['Mike','Smith',0]] });
  S = await snap(p);
  ok(new Set(S.cards.map(c => c.color)).size === 4, 'two players with the very same name still get different circles', S.cards.map(c => c.name + ' ' + c.color));
  ok(S.cards.some(c => /Kevin Wa/.test(c.name)) && S.cards.some(c => c.name === 'Mike'), 'Wells vs Walker: enough of the last name to tell them apart; a unique first name stays plain', S.cards.map(c => c.name));
  const mike = S.cards.find(c => c.name === 'Mike');
  ok(mike.hcp === 'HCP 0', 'a 0 handicap is printed as HCP 0', mike.hcp);

  // ---- 3b. photos: a real picture shows; a solid black one (the Apple review account) falls back to initials ----
  const ph = await p.evaluate(async () => {
    const mkImg = (fn) => { const c = document.createElement('canvas'); c.width = 48; c.height = 48; const x = c.getContext('2d'); fn(x); return c.toDataURL('image/jpeg', 0.8); };
    const black = mkImg(x => { x.fillStyle = '#000'; x.fillRect(0, 0, 48, 48); }), real = mkImg(x => { x.fillStyle = '#2a7'; x.fillRect(0, 0, 48, 48); x.fillStyle = '#fd3'; x.fillRect(8, 8, 24, 30); x.fillStyle = '#134'; x.fillRect(20, 0, 10, 48); });
    const g = state.game; g.players[0].avatar = black; g.players[1].avatar = real; g.players[2].avatar = 'https://example.invalid/nope.jpg';
    g.games.elevens = { value: 5, mode: 'pool', net: true, hcpPct: 100, payout: 'winner', participants: g.players.map(x => x.id) };
    renderScoreEntry(); renderGameBanners(); await new Promise(r => setTimeout(r, 1200));
    const rd = sel => [...document.querySelectorAll(sel)].map(a => ({ img: !!a.querySelector('img'), txt: a.innerText.trim(), bg: a.style.background }));
    return { ss: ['p0', 'p1', 'p2'].map(id => rd('.bg-ss-card[data-ss-pid="' + id + '"] .bg-ss-av')[0]), el: ['p0', 'p1', 'p2'].map(id => rd('.bg-el-row[data-el-row="' + id + '"] .bg-el-av')[0]) };
  });
  ok(ph.ss[0] && !ph.ss[0].img && ph.ss[0].txt === 'KW' && ph.ss[0].bg && ph.el[0] && !ph.el[0].img && ph.el[0].txt === 'KW', 'a solid black profile picture falls back to the initials circle - on the new scorecard and on the 11\'s card', ph);
  ok(ph.ss[1].img && ph.el[1].img, 'a real picture is shown as the picture', [ph.ss[1], ph.el[1]]);
  ok(!ph.ss[2].img && ph.ss[2].txt && !ph.el[2].img && ph.el[2].txt, 'a picture that fails to load falls back to initials too', [ph.ss[2], ph.el[2]]);

  // ---- 3c. 11's under Game results: the same rows (place, circle, to par, kept) ----
  const br = await p.evaluate(() => { const g = state.game; const d = document.createElement('div'); d.className = 'card'; d.style.cssText = 'width:358px'; d.innerHTML = bgElevensBoardHtml(g); document.body.appendChild(d);
    const rows = [...d.querySelectorAll('.bg-el-brow')].map(r => ({ place: r.querySelector('.bg-el-place').innerText, av: r.querySelectorAll('.bg-el-av').length, txt: r.querySelector('.bg-el-stat').innerText.replace(/\s+/g, ' '), cut: [...r.querySelectorAll('b, .bg-el-stat > span')].some(e => e.scrollWidth > e.clientWidth + 1), over: r.scrollWidth > r.clientWidth + 1 }));
    const head = d.querySelector('.game-result .head').innerText.replace(/\s+/g, ' '); const old = d.querySelectorAll('.game-result .sub').length; d.remove(); return { rows, head, old }; });
  ok(br.rows.length === 4 && br.rows.every(r => r.av === 1 && /\/11 kept/.test(r.txt) && /toss(es)? left/.test(r.txt) && !r.cut && !r.over) && br.old === 0 && /11's/.test(br.head) && /best 11/.test(br.head), 'Game results lists 11\'s with the same rows as the 11\'s card: place, circle, to par, kept, name and tosses left - nothing cut off', br);

  // ---- 3d. skins won are circled like the old card: individual round, league round, tournament (group + whole-field) ----
  const skinRead = () => p.evaluate(() => { const g = state.game; const want = skinWinnersByHole(g); const exp = {}; Object.keys(want).forEach(i => Object.keys(want[i]).forEach(pid => { (exp[pid] = exp[pid] || []).push(+i + 1); }));
    _bgScStand.open = {}; g.players.forEach(pl => { _bgScStand.open[pl.id] = 1; }); _bgScStand.seeded[g.code] = 1; bgScStandPaint(g);
    const got = {}, fld = {}; document.querySelectorAll('#bg-sc-stand .bg-ss-cell').forEach(c => { const m = c.querySelector('.bg-ss-mark'); if (m.classList.contains('bg-ss-skin')) (got[c.dataset.ssPid] = got[c.dataset.ssPid] || []).push(+c.dataset.ssHole); if (m.classList.contains('bg-ss-fskin')) (fld[c.dataset.ssPid] = fld[c.dataset.ssPid] || []).push(+c.dataset.ssHole); });
    const old = {}; document.querySelectorAll('#scorecard-score-tab tbody tr[data-pid]').forEach(tr => { [...tr.cells].forEach((td, ci) => { if (td.querySelector('.skin-win')) { const h = ci >= 1 && ci <= 9 ? ci : ci >= 11 && ci <= 19 ? ci - 1 : 0; if (h) (old[tr.dataset.pid] = old[tr.dataset.pid] || []).push(h); } }); });
    const srt = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k].slice().sort((a, b) => a - b)]));
    const ring = document.querySelector('#bg-sc-stand .bg-ss-mark.bg-ss-skin'); const cs = ring ? getComputedStyle(ring) : null;
    return { n: Object.values(exp).reduce((a, b) => a + b.length, 0), exp: srt(exp), got: srt(got), old: srt(old), fld: srt(fld), ring: cs ? [cs.borderTopWidth, cs.borderRadius, cs.borderTopColor] : null, key: document.querySelector('#bg-sc-stand .bg-ss-key').innerText.replace(/\s+/g, ' '), chips: [...document.querySelectorAll('#bg-sc-stand .bg-ss-skins')].map(x => x.innerText) }; });
  await start(p, { games: { skins: { value: 1, net: true } } });
  let SK = await skinRead();
  ok(SK.n >= 3 && SK.got === SK.exp && SK.got === SK.old, 'individual round: every skin won is circled on the new card - the same holes the app awards and the old card circles', SK);
  ok(SK.ring && SK.ring[0] === '3px' && /50%/.test(SK.ring[1]) && /Skin/.test(SK.key) && SK.chips.length >= 1, 'a skin is a bold blue circle, the key names it, and the row shows how many skins he has', { ring: SK.ring, key: SK.key, chips: SK.chips });
  await start(p, { games: { skins: { value: 2, net: false } } });
  await p.evaluate(() => { state.game.lg = { seasonId: 'qa-season', weekId: 'w1' }; state.game.leagueId = 'qa-league'; renderScoreEntry(); });
  SK = await skinRead();
  ok(SK.n >= 1 && SK.got === SK.exp && SK.got === SK.old, 'league round: skins circled, same as the old card', SK);
  // tournament: this cart's own skins game (blue) + the event's whole-field skins (gold), through the app's real field-skins code
  await start(p, { games: { skins: { value: 1, net: true } } });
  const TS = await p.evaluate(async () => {
    const g = state.game; g.t2 = { tournamentId: 'qa-t-' + g.code, day: 1, groupNo: 1 };
    const g2 = JSON.parse(JSON.stringify(g)); g2.code = g.code + 'B'; g2.t2.groupNo = 2; g2.players.forEach((pl, i) => { pl.id = 'q' + i; pl.name = ['Rolo Mar', 'Larry Bee', 'Steve Kay', 'Greg Jay'][i]; pl.firstName = pl.name.split(' ')[0]; pl.lastName = pl.name.split(' ')[1]; });
    g2.scores = {}; g2.players.forEach(pl => { g2.scores[pl.id] = g.pars.map((par, h) => (h < 14 ? par + 2 : null)); });   // the other cart: all doubles, so this cart's low scores take field skins
    const cfg = { on: true, value: 5, net: false };
    t2Get = async () => ({ id: g.t2.tournamentId, settings: { tourneySkins: cfg } }); loadTourneyRawRounds = async () => [{ data: g }, { data: g2 }];
    let real = null; try { real = t2ComputeFieldSkins([{ data: g }, { data: g2 }], cfg); } catch (e) { real = { err: String(e) }; }
    const hr = []; ((real && real.perDay) || []).filter(d => d.day === 1).forEach(d => hr.push.apply(hr, d.holeResults || []));
    const map = fieldSkinWinnersByHole([{ data: g }, { data: g2 }], hr); const exp = {}; Object.keys(map).forEach(i => Object.keys(map[i]).forEach(pid => { if (g.players.some(x => x.id === pid)) (exp[pid] = exp[pid] || []).push(+i + 1); }));
    renderScoreEntry(); await new Promise(r => setTimeout(r, 500));
    return { exp: JSON.stringify(Object.keys(exp).sort().map(k => [k, exp[k].sort((a, b) => a - b)])), n: Object.values(exp).reduce((a, b) => a + b.length, 0), err: real && real.err };
  });
  SK = await skinRead();
  ok(TS.n >= 2 && SK.fld === TS.exp, 'tournament: the event\'s whole-field skins are circled in gold on exactly the holes the app\'s own field-skins code awards', { TS, fld: SK.fld });
  ok(SK.got === SK.exp && SK.n >= 1 && /Group skin/.test(SK.key) && /Event skin/.test(SK.key), '...the cart\'s own skins stay blue alongside, and the key names both', { got: SK.got, exp: SK.exp, key: SK.key });
  const both = await p.evaluate(() => { const m = document.querySelector('#bg-sc-stand .bg-ss-mark.bg-ss-skin.bg-ss-fskin') || document.querySelector('#bg-sc-stand .bg-ss-mark.bg-ss-fskin'); const cs = getComputedStyle(m); return { w: cs.borderTopWidth, r: cs.borderRadius, txt: m.innerText, fits: m.scrollWidth <= m.clientWidth + 1 }; });
  ok(both.w === '3px' && /50%/.test(both.r) && both.fits, 'the gold circle is the same bold ring and the number still fits', both);

  // ---- 4. no handicaps: no HCP pill, no net, ranked on gross ----
  await start(p, { rules: { noHandicaps: true } });
  S = await snap(p);
  ok(S.cards.every(c => c.hcp === '' && !/net/.test(c.meta) && c.dots.length === 0), 'a no-handicap round shows no HCP pill, no net and no stroke dots', S.cards.map(c => c.meta));

  // ---- 5. nine-hole round; nobody has scored ----
  await start(p, { holes: 9, thru: 5 });
  S = await snap(p);
  const m9 = S.cards.find(c => c.open);
  ok(m9 && m9.cells === 9 && m9.lines.join() === 'Hole,Par,HCP,Score' && /thru 5/.test(m9.meta), 'a nine-hole round shows one nine (9 scores)', m9 && [m9.cells, m9.lines, m9.meta]);
  await start(p, { thru: 0 });
  S = await snap(p);
  ok(S.cards.every(c => c.big === '—' && c.rank === '' && /No scores yet/.test(c.meta)) && S.cards.map(c => c.id).join() === 'p0,p1,p2,p3', 'before any score: card order, no rank, "No scores yet"', S.cards.map(c => c.meta));

  // ---- 6. view only cannot edit; scramble stays on the classic card ----
  await start(p);
  await p.evaluate(() => { state.viewOnlyMode = true; document.querySelector('.bg-ss-card[data-ss-pid="p0"] .bg-ss-cell[data-ss-hole="2"]').click(); }); await p.waitForTimeout(200);
  ok(!(await p.evaluate(() => !!document.getElementById('bg-hole-edit'))), 'a viewer can open cards but tapping a score does nothing');
  await start(p, { games: { scramble: { value: 1, teamA: ['p0', 'p1'], teamB: ['p2', 'p3'] } } });
  S = await snap(p);
  ok(!S.stand && S.tableShown && !S.swShown && S.cards.length === 0, 'a scramble keeps the classic card (one ball per team) and offers no switch', [S.stand, S.tableShown, S.swShown]);
  ok(p._errs.length === 0, 'no page errors (edge cases)', p._errs.slice(0, 2));
  await p.close();

  // ---- 7. phone fit: five widths, light + dark, all four cards open, long name ----
  for (const [theme, W] of [['dark', 320], ['light', 360], ['dark', 375], ['light', 390], ['dark', 430]]) {
    p = await mk(W, theme);
    await start(p, { names: [['Tyler',"O'Connor",8],['Kevin','Wells',12],['Christopher','Montgomery',36],['Kevin','Brewer',15]], thru: 18 });
    await p.evaluate(() => { state.game.players.forEach(pl => { _bgScStand.open[pl.id] = 1; }); _bgScStand.seeded[state.game.code] = 1; state.game.scores.p2 = state.game.scores.p2.map(() => 10); renderScoreEntry(); }); await p.waitForTimeout(200);
    const F = await p.evaluate(() => { const box = document.getElementById('bg-sc-stand'); let bad = ''; const bx = box.getBoundingClientRect(); if (bx.left < 0 || bx.right > innerWidth + 0.5) bad += 'off-screen ';
      box.querySelectorAll('.bg-ss-card').forEach(c => { const cb = c.getBoundingClientRect();
        const row = c.querySelector('.bg-ss-row'); const kids = [...row.children].map(k => k.getBoundingClientRect());
        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i], q = kids[j]; if (a.left < q.right - 1 && q.left < a.right - 1 && a.top < q.bottom - 1 && q.top < a.bottom - 1) bad += 'row-overlap '; }
        if (kids.some(k => k.right > cb.right + 0.5 || k.left < cb.left - 0.5)) bad += 'row-outside ';
        const nm = c.querySelector('.bg-ss-name'); if (nm.getClientRects().length > 1 && nm.getBoundingClientRect().height > 30) bad += 'name-wrapped ';
        c.querySelectorAll('.bg-ss-line').forEach(l => { const ks = [...l.children].map(k => k.getBoundingClientRect()); for (let i = 1; i < ks.length; i++) if (ks[i].left < ks[i - 1].right - 1.5) bad += 'col-overlap '; if (ks[ks.length - 1].right > cb.right + 0.5) bad += 'line-outside ';
          [...l.children].forEach(k => { if (k.scrollWidth > k.clientWidth + 1 && !k.classList.contains('bg-ss-cell')) bad += 'cut:' + k.className + ' '; }); });
        c.querySelectorAll('.bg-ss-cell').forEach(k => { const r = k.getBoundingClientRect(), m = k.querySelector('.bg-ss-mark').getBoundingClientRect(); if (r.height < 44) bad += 'short-target '; if (m.left < r.left - 0.5 || m.right > r.right + 0.5) bad += 'mark-wider-than-cell '; if (k.querySelector('.bg-ss-mark').scrollWidth > k.querySelector('.bg-ss-mark').clientWidth + 1) bad += 'score-cut '; });
        c.querySelectorAll('.bg-ss-net').forEach(k => { const r = k.getBoundingClientRect(); if (r.right > cb.right + 0.5) bad += 'net-outside '; const prev = k.closest('.bg-ss-line').children[9].getBoundingClientRect(); if (r.left < prev.right - 2) bad += 'net-overlap '; });
        const t = c.querySelector('.bg-ss-total'); if (t && t.scrollWidth > t.clientWidth + 1) bad += 'total-cut '; });
      const sw = document.getElementById('bg-sc-stand-switch').getBoundingClientRect(); if (sw.height < 40 || sw.right > innerWidth) bad += 'switch ';
      return { bad, w: Math.round(bx.width), score: parseFloat(getComputedStyle(box.querySelector('.bg-ss-mark')).fontSize), tens: box.querySelector('.bg-ss-card[data-ss-pid="p2"] .bg-ss-mark').innerText }; });
    ok(F.bad === '' && F.tens === '10' && F.score >= 17, theme + ' ' + W + ': all four cards open, long name, two-digit scores and a 36 handicap - nothing overlaps, is cut off or leaves the card', F);
    ok(p._errs.length === 0, theme + ' ' + W + ': no page errors', p._errs.slice(0, 2));
    await p.close();
  }
  console.log(fails.length ? fails.map(f => '  FAIL  ' + f).join('\n') + '\nFAILED ' + (n - fails.length) + '/' + n : 'ALL ' + n + '/' + n + ' CHECKS PASSED');
  await b.close(); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
