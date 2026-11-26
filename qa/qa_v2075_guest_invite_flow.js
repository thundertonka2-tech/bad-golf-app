'use strict';
// qa/qa_v2075_guest_invite_flow.js -- the guest invite flow end to end on the phone side (v2075, Bad Golf Wednesday 11/25):
//   1. the event invite text any player can send carries the store links AND the tap-your-name link, flags the guests
//      as Invited and logs the send;
//   2. the start-of-round guest prompt on an event cart sends that event invite, never the cart's ?join= link;
//   3. the "Is this you?" card at the top of Home: what it says, That's me, Not me, a spot somebody else took.
// The server half (bg_t2_my_spot_offers / bg_t2_claim_offer / the round stamp) is in supabase/SQL_v2075_*.sql and was
// run against the live database in a rolled-back transaction (see the v2075 handoff).
//   node qa/qa_v2075_guest_invite_flow.js [golf-app.html|www/index.html]   (needs: npm i --no-save jsdom)
const path = require('path'), fs = require('fs');
const { w, doc, bootErr, FILE } = require('./dom.js');
let fails = 0, checks = 0;
const ok = (n, c, d) => { checks++; if (!c) { fails++; console.log('  FAIL  ' + n + (d ? '   ' + String(d).slice(0, 900) : '')); } else if (process.env.V) console.log('  PASS  ' + n); };
console.log('== ' + path.basename(FILE) + '   boot: ' + (bootErr ? bootErr.message : 'clean'));
const tick = () => new Promise(r => setImmediate(r));
const signIn = id => { w.__uid = id || null; return w.__fn(id ? "(_authUser = { id: '" + id + "' })" : '(_authUser = null)'); };   // inside the app script's own scope
const TID = '731d05ac-0000-4000-8000-000000002075';
w.__rpc = []; w.__ins = []; w.__rpcRes = {}; w.__shared = []; w.__toast = []; w.__nav = [];
w.__t = { id: TID, name: 'Bad Golf Wednesday', join_code: 'K3Y75', status: 'live', num_days: 1, settings: { pageKey: 'PAGEKEY12345', setupSaved: true, quickSetup: true } };
w.eval(`
  window.__install({ supa: { rpc: async function (n, a) { window.__rpc.push([n, a]); const r = window.__rpcRes[n]; return (typeof r === 'function') ? r(a) : (r || { data: null, error: null }); },
           from: function (tb) { return { insert: async function (row) { window.__ins.push([tb, row]); return { error: null }; } }; },
           // the app re-reads the session whenever it thinks it came back online: answer with whoever the test signed in
           auth: { getSession: async function () { return { data: { session: window.__uid ? { user: { id: window.__uid } } : null }, error: null }; },
                   getUser: async function () { return { data: { user: window.__uid ? { id: window.__uid } : null }, error: null }; },
                   onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; } } },
    loadGame: function () { return null; }, roster: function () { return []; }, meName: function () { return 'Rambo'; }, t2Get: function () { return window.__t; }, players: function () { return []; } });
  showToast = function (m) { window.__toast.push(String(m)); };
  bgT2EnsureWebLink = async function (t) { return 'https://officialbadgolf.com/?ev=' + t.id + '&k=' + t.settings.pageKey; };
  bgT2InviteGamesLoad = async function () {}; bgT2InviteGamesText = function () { return 'Everyone:\\nQuota 20'; };
  switchTab = function (t) { window.__nav.push('tab:' + t); }; openT2Home = function (id) { window.__nav.push('event:' + id); };
  bgDiscoverMyLiveRounds = async function () { window.__nav.push('discover'); return 0; };
`);
Object.defineProperty(w.navigator, 'share', { configurable: true, value: async (o) => { w.__shared.push(o.text); } });

(async () => {
  // ---- 1. the invite a player sends from his cart ----
  const g = { code: 'TEE75', course: 'Buffalo Creek Golf Club', players: [{ id: 'a', name: 'Tyler OConnor', uid: 'tyler-uid' }, { id: 'b', name: 'Rambo', uid: 'rambo-uid' }, { id: 'c', name: 'Graham Cracker' }, { id: 'd', name: 'John Christian' }],
    scores: {}, pars: Array(18).fill(4), games: {}, t2: { tournamentId: TID, day: 1, group: 2, name: 'Bad Golf Wednesday' } };
  w.__setGame(g); signIn('rambo-uid');
  await w.shareGameInvite(); await tick();
  const text = w.__shared[0] || '';
  const lines = text.split('\n');
  ok('Invite players on an event cart shares one text', w.__shared.length === 1, String(w.__shared.length));
  ok('it says who invited and to what', /^Rambo invited you to "Bad Golf Wednesday" on Bad Golf!/.test(text), lines[0]);
  ok('it carries both store links', /apps\.apple\.com/.test(text) && /play\.google\.com/.test(text));
  const joinLine = lines.find(l => /[?&]tclaim=/.test(l)) || '';
  ok('it carries the tap-your-name link with the event key, alone at the start of a line', new RegExp('^https?://[^ ]+\\?tclaim=' + TID + '\\.K3Y75$').test(joinLine), joinLine);
  ok('the line above the link tells him what to do', /Tap this link, sign in and tap your name:$/.test(lines[lines.indexOf(joinLine) - 1] || ''), lines[lines.indexOf(joinLine) - 1]);
  ok('store links come before the join link (get the app first)', text.indexOf('apps.apple.com') < text.indexOf('tclaim='));
  ok('it never hands out this cart\'s own ?join= link', !/[?&]join=/.test(text));
  ok('it still has the follow-along page for people who are not playing', /FOLLOW ALONG/.test(text) && /\?ev=/.test(text));
  ok('every line fits a phone text (no line over 120 characters that is not a link)', lines.every(l => l.length <= 120 || /^https?:\/\//.test(l) || /https?:\/\//.test(l)), lines.filter(l => l.length > 120).join(' | '));
  ok('the guest spots are flagged Invited from a player\'s phone (server call any member may make)', w.__rpc.some(r => r[0] === 'bg_t2_mark_invited' && r[1].p_tid === TID), JSON.stringify(w.__rpc));
  const log = w.__ins.find(r => r[0] === 'outbound_invites');
  ok('the send is on record (who, which cart, which link)', !!log && log[1].from_user === 'rambo-uid' && log[1].from_name === 'Rambo' && log[1].game_code === 'TEE75' && log[1].channel === 'event' && /tclaim=/.test(log[1].join_link), JSON.stringify(log));

  // ---- 2. the start-of-round guest prompt on an event cart ----
  w.__shared.length = 0; w.__rpc.length = 0;
  w.eval(`uiConfirm = async function (msg, o) { window.__confirm = { msg: msg, o: o }; return true; };
          bgInviteGuestsFor = async function () { return [{ name: 'Graham Cracker', phone: '' }, { name: 'John Christian', phone: '' }]; };
          try { localStorage.removeItem('golf:invite-prompted'); } catch (e) {}`);
  signIn('rambo-uid');
  await w.bgInvitePrompt('round', 'TEE75'); await tick();
  ok('the prompt names the guests on the card', w.__confirm && /Graham Cracker/.test(w.__confirm.msg) && /John Christian/.test(w.__confirm.msg), w.__confirm && w.__confirm.msg);
  ok('...and sends the event invite with the tap-your-name link, not the cart\'s ?join= link', w.__shared.length === 1 && /tclaim=/.test(w.__shared[0]) && !/[?&]join=/.test(w.__shared[0]), (w.__shared[0] || '').slice(0, 200));
  // a regular round is unchanged: its own join link
  const reg = { code: 'PUTT65', course: 'Buffalo Creek Golf Club', players: g.players, scores: {}, pars: Array(18).fill(4), games: {} };
  w.__setGame(reg); w.__shared.length = 0;
  w.eval(`try { localStorage.removeItem('golf:invite-prompted'); } catch (e) {} window.__sms = null; bgInviteOpenMessages = async function (t) { window.__sms = t; return true; };`);
  signIn('rambo-uid');
  await w.bgInvitePrompt('round', 'PUTT65'); await tick();
  ok('a regular round\'s prompt still sends that round\'s own link', !!w.__sms && /[?&]join=PUTT65/.test(w.__sms) && !/tclaim=/.test(w.__sms), String(w.__sms).slice(0, 200));

  // ---- 3. "Is this you?" on Home ----
  w.eval(`try { localStorage.removeItem('golf:t2-spot-dismissed'); } catch (e) {}`);
  const OFFERS = [{ pid: 'pid-graham', tid: TID, event: 'Bad Golf Wednesday 12/2', listed: 'Graham Cracker', date: '2026-12-02', by: 'Kevin', mates: ['Tyler', 'Rambo', 'John'] },
                  { pid: 'pid-other', tid: 'tid-2', event: 'Sr Sunday', listed: 'Graham Smith', date: null, by: '', mates: [] }];
  w.__rpcRes.bg_t2_my_spot_offers = () => ({ data: OFFERS.slice(), error: null });
  w.__rpc.length = 0;
  signIn('graham-uid');
  await w.bgRenderHomeSpotOffers(true);
  let card = doc.getElementById('home-spot-offers');
  const panel = doc.getElementById('panel-home');
  ok('Home shows the card', !!card && card.style.display !== 'none');
  ok('it is the first card on Home', !!card && panel.querySelector('.card') === card);
  const txt = card ? card.textContent.replace(/\s+/g, ' ') : '';
  ok('it asks "Is this you?" and names the event, the name he is listed under, the organizer and his cart-mates', /Is this you\?/.test(txt) && /Bad Golf Wednesday 12\/2/.test(txt) && /You are listed as Graham Cracker/.test(txt) && /set up by Kevin/.test(txt) && /with Tyler, Rambo and John/.test(txt), txt.slice(0, 300));
  ok('a date is shown when the event has one', /Dec/.test(txt));
  const btns = card ? [...card.querySelectorAll('button')] : [];
  ok('two buttons per offer: Not me / That\'s me', btns.length === 4 && btns[0].textContent === 'Not me' && /That.s me/.test(btns[1].textContent));
  ok('phone friendly: buttons share the row, no fixed pixel widths, long names wrap', btns.every(b => /flex:\s*1/.test(b.getAttribute('style') || '') && !/width:\s*\d+px/.test(b.getAttribute('style') || '')) && /overflow-wrap:\s*anywhere/.test(card.innerHTML));
  ok('nothing is claimed just by showing the card', !w.__rpc.some(r => r[0] === 'bg_t2_claim_offer'));
  // Not me: gone, and stays gone
  card.querySelector('.bg-spot-no[data-pid="pid-other"]').onclick(); await tick(); await tick();
  ok('"Not me" removes that offer', !/Sr Sunday/.test(doc.getElementById('home-spot-offers').textContent) && /Bad Golf Wednesday/.test(doc.getElementById('home-spot-offers').textContent));
  signIn('graham-uid');
  await w.bgRenderHomeSpotOffers(true);
  ok('...and it does not come back on the next load', !/Sr Sunday/.test(doc.getElementById('home-spot-offers').textContent));
  // a spot somebody else took a second ago
  w.__rpcRes.bg_t2_claim_offer = () => ({ data: null, error: { message: 'ALREADY_CLAIMED' } });
  w.__toast.length = 0; w.__nav.length = 0;
  card = doc.getElementById('home-spot-offers');
  let yes = card.querySelector('.bg-spot-yes[data-pid="pid-graham"]');
  signIn('graham-uid');
  await yes.onclick(); await tick();
  ok('spot already taken: says so in plain words, stays on Home, button usable again', w.__toast.some(m => /already taken by someone else/.test(m)) && w.__nav.length === 0 && yes.disabled === false, JSON.stringify(w.__toast));
  // That's me
  w.__rpcRes.bg_t2_claim_offer = (a) => ({ data: TID, error: null });
  w.__rpc.length = 0; w.__toast.length = 0; signIn('graham-uid');
  await yes.onclick(); await tick();
  const call = w.__rpc.find(r => r[0] === 'bg_t2_claim_offer');
  ok('"That\'s me" claims that exact spot on the server', !!call && call[1].p_player === 'pid-graham', JSON.stringify(w.__rpc));
  ok('...welcomes him, looks for his live round and opens the event', w.__toast.some(m => /Welcome to the tournament/.test(m)) && w.__nav.join('|') === 'discover|tab:tourneys|event:' + TID, w.__nav.join('|'));
  ok('...and the card is gone', doc.getElementById('home-spot-offers').style.display === 'none');
  // no offers -> no card; signed out -> no call
  w.__rpcRes.bg_t2_my_spot_offers = () => ({ data: [], error: null });
  signIn('graham-uid');
  await w.bgRenderHomeSpotOffers(true);
  ok('no offers: no card', doc.getElementById('home-spot-offers').style.display === 'none');
  signIn(null); w.__rpc.length = 0;
  await w.bgRenderHomeSpotOffers(true);
  ok('signed out: the server is not asked', w.__rpc.length === 0);
  // a server error must never break Home
  signIn('x'); w.__rpcRes.bg_t2_my_spot_offers = () => { throw new Error('offline'); };
  let threw = false; try { await w.bgRenderHomeSpotOffers(true); } catch (e) { threw = true; }
  ok('server unreachable: Home still renders, no card', !threw && doc.getElementById('home-spot-offers').style.display === 'none');

  // ---- 4. wiring + the server file ----
  const src = fs.readFileSync(FILE, 'utf8');
  ok('renderHome draws the card', /async function renderHome\(\) \{\s*try \{ bgRenderHomeSpotOffers\(\); \} catch/.test(src));
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'SQL_v2075_guest_spot_offers_claim.sql'), 'utf8');
  ok('server file: offers / claim / mark-invited are for signed-in users only', /revoke all on function public\.bg_t2_my_spot_offers\(\) from public, anon/.test(sql) && /grant execute on function public\.bg_t2_claim_offer\(uuid\) to authenticated/.test(sql) && /grant execute on function public\.bg_t2_mark_invited\(uuid\) to authenticated/.test(sql));
  ok('server file: the claim re-checks the offer and never returns a token', /NOT_OFFERED/.test(sql) && !/'invite_token'/.test(sql));
  ok('server file: a spot taken after tee-off is stamped on the cart\'s round (both claim paths)', (sql.match(/_bg_t2_stamp_round_uid\(/g) || []).length >= 3);
  console.log((fails ? 'FAILED ' : 'OK ') + (checks - fails) + '/' + checks + ' checks');
  process.exit(fails ? 1 : 0);
})();
