#!/usr/bin/env python3
"""v1952 item 2 — share results as text + event-page link; no more pictures; page key auto-minted."""
import sys

EDITS = []

# ── P1: one page-key minter; bgT2EnsureWebLink uses it ──
EDITS.append((
"""async function bgT2EnsureWebLink(t) {
  try {
    if (!t || !t.id) return '';
    let url = bgT2WebLinkUrl(t); if (url) return url;
    if (!(typeof t2CanManage === 'function' && t2CanManage(t))) return '';
    const a = new Uint8Array(12); (window.crypto || window.msCrypto).getRandomValues(a);
    let key = Array.from(a).map(x => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x % 32]).join('');
    const ok = await t2MergeSettings(t.id, st => { if (!st.pageKey || String(st.pageKey).length < 12) st.pageKey = key; else key = st.pageKey; });""",
"""// v1952: the one page-key minter (was inlined three times).
function bgMintPageKey() {
  const a = new Uint8Array(12); (window.crypto || window.msCrypto).getRandomValues(a);
  return Array.from(a).map(x => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x % 32]).join('');
}
async function bgT2EnsureWebLink(t) {
  try {
    if (!t || !t.id) return '';
    let url = bgT2WebLinkUrl(t); if (url) return url;
    if (!(typeof t2CanManage === 'function' && t2CanManage(t))) return '';
    let key = bgMintPageKey();
    const ok = await t2MergeSettings(t.id, st => { if (!st.pageKey || String(st.pageKey).length < 12) st.pageKey = key; else key = st.pageKey; });""",
"P1 minter"))

# ── P2: every new event gets its page key at birth ──
EDITS.append((
"""    try { bgBadgeFlag('commish'); } catch (e) {}   // v1611: Commish
    return data; // the new tournament row""",
"""    try { bgBadgeFlag('commish'); } catch (e) {}   // v1611: Commish
    /* v1952 (Tyler, 10/26): "we need to auto create [the event page link] instead of
       forcing the user to create it." Every event is born with its page key; the
       results text (shareCombinedSettleUp) links to the page instead of attaching
       pictures. The two creators that write settings wholesale carry it across. */
    try {
      if (data && data.id) {
        const _pk = bgMintPageKey();
        await t2MergeSettings(data.id, st => { if (!st.pageKey || String(st.pageKey).length < 12) st.pageKey = _pk; });
        data.settings = Object.assign({}, data.settings || {}, { pageKey: _pk });
      }
    } catch (e) {}
    return data; // the new tournament row""",
"P2 mint at create"))

# ── P3: the two wholesale settings writers keep the key ──
EDITS.append((
"""    if (_pairCount >= 2) _basics.teamCount = _pairCount;
    if (t._t2Adopted) {
      await t2MergeSettings(t.id, s => { Object.assign(s, _basics); });
    } else if (await t2Update(t.id, { settings: _basics })) {""",
"""    if (_pairCount >= 2) _basics.teamCount = _pairCount;
    try { if (t.settings && t.settings.pageKey) _basics.pageKey = t.settings.pageKey; } catch (e) {}   // v1952: born with its page key
    if (t._t2Adopted) {
      await t2MergeSettings(t.id, s => { Object.assign(s, _basics); });
    } else if (await t2Update(t.id, { settings: _basics })) {""",
"P3a wizard basics"))
EDITS.append((
"""  const pSettings = (async () => {
    try {
      if (t._t2Adopted) await t2MergeSettings(t.id, s => { Object.assign(s, basics); });
      else if (await t2Update(t.id, { settings: basics })) t.settings = basics;""",
"""  try { if (t.settings && t.settings.pageKey) basics.pageKey = t.settings.pageKey; } catch (e) {}   // v1952: born with its page key
  const pSettings = (async () => {
    try {
      if (t._t2Adopted) await t2MergeSettings(t.id, s => { Object.assign(s, basics); });
      else if (await t2Update(t.id, { settings: basics })) t.settings = basics;""",
"P3b quick-setup basics"))

# ── P4: text builders ──
EDITS.append((
"""async function buildSettleUpText() {
  const g = state.game;
  if (!g || !Array.isArray(g.players)) return '';""",
"""/* v1952 (Tyler, 10/26): "ditch [the two pictures] in favor of an events page for each
   game instead ... just send the payouts and then a link to the event page." The
   texted results are now: the name and date, every player's net, who pays whom, and
   ONE link — the event page for a tournament, the follow-along page for a plain round.
   Both pages already carry the scorecard, every game and the prize pools, which is all
   the two pictures ever showed. */
function bgShareDateStr(ms) {
  try { return new Date(ms || Date.now()).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); } catch (e) { return ''; }
}
function bgNetTextLines(rows) {
  const money = v => (v > 0 ? '+' : (v < 0 ? '-' : '')) + bgWhole(Math.abs(Math.round(v * 100) / 100));
  return (rows || []).map(r => '  ' + r.name + '  ' + money(Number(r.net) || 0));
}
// The plain round's public follow-along page (v1894). Mints the key on first share.
async function bgRoundShareLink(g) {
  try {
    if (!g || !g.code || (typeof bgIsThrowawayRound === 'function' && bgIsThrowawayRound(g))) return '';
    if (!g.lbKey || String(g.lbKey).length < 12) { g.lbKey = bgLbMintKey(); try { await saveGame(g); } catch (e) {} }
    return bgLbLink(g.code, g.lbKey);
  } catch (e) { return ''; }
}
// Plain (non-tournament) round: name · date, nets, who pays whom, link.
async function bgPlainRoundShareText(g) {
  if (!g || !Array.isArray(g.players)) return '';
  let money = {}; try { money = computeAllGameMoney(g).combined || {}; } catch (e) { return ''; }
  const settlements = calculateSettlements(money, g.players);
  const nm = id => { const p = g.players.find(pp => pp.id === id); return p ? displayFull(p) : '?'; };
  const lines = ['\\u26F3 ' + (g.course || 'Round') + ' \\u00b7 ' + bgShareDateStr(g.finishedAt || g.updatedAt), ''];
  try { const _ml = bgMatchResultLines(g); if (_ml.length) { _ml.forEach(l => lines.push(l)); lines.push(''); } } catch (e) {}   // v1940
  try {
    const _n = bgSettleNets(money, g.players);
    const rows = g.players.map(p => ({ name: displayFull(p), net: _n[p.id] || 0 })).sort((a, b) => b.net - a.net || String(a.name).localeCompare(String(b.name)));
    if (rows.some(r => r.net)) { lines.push('RESULTS'); bgNetTextLines(rows).forEach(l => lines.push(l)); lines.push(''); }
  } catch (e) {}
  lines.push('FINAL STANDINGS', '');
  (await _settleUpLinesFor(settlements, nm, id => g.players.find(pp => pp.id === id))).forEach(l => lines.push(l));
  const link = await bgRoundShareLink(g);
  if (link) { lines.push('', '\\u{1F4CA} Scorecard & every game:', link); }
  _bgAppendStoreFooter(lines);
  return lines.join('\\n');
}
async function buildSettleUpText() {
  const g = state.game;
  if (!g || !Array.isArray(g.players)) return '';""",
"P4a helpers"))

EDITS.append((
"""  let money;
  try { money = computeAllGameMoney(g).combined; } catch (e) { return ''; }
  const settlements = calculateSettlements(money, g.players);
  const nm = id => { const p = g.players.find(pp => pp.id === id); return p ? displayFull(p) : '?'; };
  const where = g.course ? (' — ' + g.course) : '';
  const lines = ['⛳ Bad Golf Final standings' + where];
  try { bgMatchResultLines(g).forEach(l => lines.push(l)); } catch (e) {}   // v1940: the match result rides with the scorecard picture
  (await _settleUpLinesFor(settlements, nm, id => g.players.find(pp => pp.id === id))).forEach(l => lines.push(l));
  _bgAppendStoreFooter(lines);   // v1243: the settle text reaches every player incl. app-less guests
  return lines.join('\\n');
}
""",
"""  return await bgPlainRoundShareText(g);   // v1952: one text for a plain round
}
""",
"P4b buildSettleUpText plain tail"))

EDITS.append((
"""  const where = t && t.name ? (' — ' + t.name) : '';
  const _scopeLbl = (opts && opts.scopeLabel) ? opts.scopeLabel : 'combined tournament award';
  const lines = ['🏆 Bad Golf — ' + _scopeLbl + where, ''];
  if (!combinedPay.allFinished) {
    lines.push('⚠️ PROVISIONAL — ' + (combinedPay.roundsFinished || 0) + ' of ' + (combinedPay.roundsTotal || 0)
      + ' groups have finished. These numbers can still change.');
    lines.push('');
  }
""",
"""  // v1952: name · date on top; the scope label is gone (the link says what this is).
  let _dateMs = 0;
  try {
    const sd = t && t.settings && t.settings.startDate;
    if (sd) { const d = new Date(String(sd).length <= 10 ? sd + 'T12:00:00' : sd); if (!isNaN(d)) _dateMs = d.getTime(); }
  } catch (e) {}
  const lines = ['\\u{1F3C6} ' + ((t && t.name) || 'Tournament') + ' \\u00b7 ' + bgShareDateStr(_dateMs || Date.now()), ''];
  if (!combinedPay.allFinished) {
    lines.push('⚠️ PROVISIONAL — ' + (combinedPay.roundsFinished || 0) + ' of ' + (combinedPay.roundsTotal || 0)
      + ' groups have finished. These numbers can still change.');
    lines.push('');
  }
""",
"P4c combined header"))

EDITS.append((
"""  try {
    let _raw = [];
    try { _raw = await loadTourneyRawRounds(t).catch(() => []); } catch (e) { _raw = []; }
    bgEventBreakdownLines(combinedPay, _raw).forEach(l => lines.push(l));
  } catch (e) {}
  lines.push('FINAL STANDINGS — final, covers everything above', '');   // v1320 (was 'Settle up:')
  (await _settleUpLinesFor(settlements, nm, findPlayer)).forEach(l => lines.push(l));
  _bgAppendStoreFooter(lines);   // v1243: same footer as the round-only text
  return lines.join('\\n');
}
""",
"""  // v1952: every player's net (every game, every group), then one award list, then the
  // event page link. The per-cart breakdown lives on the page now, not in the text.
  try {
    const tot = bgEventTotalRows(combinedPay);
    if (tot.length) { lines.push('RESULTS \\u2014 every game, every group'); bgNetTextLines(tot).forEach(l => lines.push(l)); lines.push(''); }
  } catch (e) {}
  lines.push('FINAL STANDINGS', '');
  (await _settleUpLinesFor(settlements, nm, findPlayer)).forEach(l => lines.push(l));
  try {
    const link = await bgT2EnsureWebLink(t);
    if (link) { lines.push('', '\\u{1F4CA} Scorecards, every game & prize pools:', link); }
  } catch (e) {}
  _bgAppendStoreFooter(lines);   // v1243: same footer as the round-only text
  return lines.join('\\n');
}
""",
"P4d combined body"))

EDITS.append((
"""async function buildRoundShareText() {
  const g = state.game;
  if (!g || !Array.isArray(g.players)) return '';
  let money = {}; try { money = computeAllGameMoney(g).combined || {}; } catch (e) {}""",
"""async function buildRoundShareText() {
  const g = state.game;
  if (!g || !Array.isArray(g.players)) return '';
  return await bgPlainRoundShareText(g);   // v1952: same text as the Board's settle-up
}
async function _bgLegacyRoundShareText() {
  const g = state.game;
  if (!g || !Array.isArray(g.players)) return '';
  let money = {}; try { money = computeAllGameMoney(g).combined || {}; } catch (e) {}""",
"P4e buildRoundShareText"))

# ── P5: the senders — text only ──
EDITS.append((
"""async function shareSettleUpSms(mode) {
  // v1605: a prepared payload goes out inside the tap, before anything awaits.
  try { const _c = _bgSettleShareFromCache(_bgSettleShareKey(state.game, 'settle')); if (_c) { await _c; return; } } catch (e) {}
""",
"""async function shareSettleUpSms(mode) {
  // v1952: text + link only — nothing to prewarm or park (the v1605 picture machinery is gone).
""",
"P5a sms cache"))
EDITS.append((
"""  const text = await buildSettleUpText();
  if (!text) { showToast('No round loaded'); return; }
  // v1045 (Tyler, 8/16): "send an image like the scorecard on the text settle that
  // has all this information, easy to read, for all games." This share was text-only
  // -- a per-game units breakdown never survives a messaging app's proportional
  // font. Attach the SAME pair the tournament share sends: the hole-by-hole
  // scorecard and a games card (every prize pool + who won it, the final per-player
  // number, and who finishes where). Both are best-effort; text still goes either way.
  // v1109: extracted to _bgSettleShareFilesFor so the round Games sheet attaches
  // the IDENTICAL pair instead of sending a bare text.
  const files = await _bgSettleShareFilesFor(state.game);
  // v1109 (Tyler, 8/19): "use the text settle with image as the default and just
  // call it text settle up. Include the image every time on all games." The old
  // `mode !== 'sms'` gate existed only for the "Text the numbers" button, which
  // v1106 removed -- every surviving caller has been passing 'images'. Gate gone:
  // the share sheet, with the scorecard + games card attached, is the only path.
  // v1605: one sender; a rejected picture share is parked for a retry instead of
  // sliding down to the text-only sms: link.
  if ((await _bgShareSettlePayload(text, files, { key: _bgSettleShareKey(state.game, 'settle') })) !== null) return;
  try { _bgOfferImageDownloads(files); } catch (e) {}
  await _bgSendSettleSms(text, (state.game && state.game.players) || [], 'Final standings copied — paste it into a text');
}
// Shared fallback for a browser that can't attach files to a share: drop the
// images in the user's downloads so they can attach them by hand.
// v1109 (Tyler): the scorecard + bets-card pair EVERY settle-up share attaches.
// Lifted out of shareSettleUpSms so the round Games sheet sends exactly the same
// two images rather than its own text-only message -- "include the image every
// time on all games". Takes the round explicitly because that sheet can be open
// on a round that is not state.game. Best-effort: any piece that fails is left
// out and the text still goes.
async function _bgSettleShareFilesFor(g) {
  const files = [];
  try {
    if (!g || !Array.isArray(g.players)) return files;
    /* v1498: THE FIX FOR "the scorecard was only for my group". On a tournament
       round the pictures must cover the same thing the numbers do - the whole
       field. Every caller of this helper is already async, and the field fetch is
       cached, so on the Bets sheet (which has already fetched the event to build
       its text) this costs no extra round-trip.
       Deliberately falls through to the group pair if any of it fails: offline,
       one group still live, an event that will not load. Two pictures of your own
       cart beat no pictures at all - it just must never happen SILENTLY under
       tournament-wide numbers, which is what the toast is for. */
    try {
      const _tid = g.t2 && g.t2.tournamentId;
      if (_tid) {
        const _t = await t2Get(_tid);
        const _pay = _t ? await t2ComputeCombinedPayouts(_t) : null;
        if (_t && _pay && Array.isArray(_pay.rows) && _pay.rows.length) {
          const _ff = await _bgFieldShareFiles(_t, _pay);
          if (_ff && _ff.length) return _ff;
        }
        try { showToast("Couldn't build the field scorecard — attaching this group's instead", 6000); } catch (e) {}
      }
    } catch (e) {}
    const sc = await buildScorecardBlob(g);
    if (sc) files.push(new File([sc], 'bad-golf-scorecard.png', { type: 'image/png' }));
    let money = {}; try { money = computeAllGameMoney(g).combined || {}; } catch (e) {}
    let settlements = []; try { settlements = calculateSettlements(money, g.players) || []; } catch (e) {}
    const nm = id => { const p = g.players.find(pp => pp.id === id); return p ? displayFull(p) : '?'; };
    const bf = await bgBetsImageFile({
      title: '⛳ ' + (g.course || 'Round') + ' — Final standings',
      subtitle: new Date(g.finishedAt || g.updatedAt || Date.now()).toLocaleDateString(),
      potRows: bgPotRowsForRound(g),
      statRows: bgStatRowsForRound(g),
      /* v1304: the same rounded balances the payments below were built from --
         a +$52.44 line above a $52.00 payment is the argument this card exists
         to prevent. */
      moneyRows: (function () { const _n = bgSettleNets(money, g.players);
        return g.players.map(p => ({ name: displayFull(p), net: _n[p.id] || 0 })); })(),
      settlements: settlements.map(s => ({ from: nm(s.fromId), to: nm(s.toId), amount: s.amount })),
      footer: g.course || ''
    });
    if (bf) files.push(bf);
  } catch (e) {}
  return files;
}
""",
"""  const text = await buildSettleUpText();
  if (!text) { showToast('No round loaded'); return; }
  // v1952: the pictures are gone; the text carries the nets, the award and the page link.
  if ((await _bgShareSettlePayload(text, [], { key: _bgSettleShareKey(state.game, 'settle') })) !== null) return;
  await _bgSendSettleSms(text, (state.game && state.game.players) || [], 'Final standings copied — paste it into a text');
}
""",
"P5b sms body + drop _bgSettleShareFilesFor"))

EDITS.append((
"""async function _bgFieldShareFiles(t, combinedPay, rawIn) {
  const files = [];
  try {
    const raw = (rawIn && rawIn.length) ? rawIn : await loadTourneyRawRounds(t).catch(() => []);
    const headerG = (raw || []).map(r => (r && r.data) ? r.data : r).find(rg => rg && Array.isArray(rg.pars) && rg.pars.length);
    if (headerG) {
      const blob = await buildFieldScorecardBlob(raw, headerG, t && t.name);
      if (blob) files.push(new File([blob], 'bad-golf-tournament-scorecard.png', { type: 'image/png' }));
    }
    // v1045: second image -- every prize pool and who won it, the final number per
    // player, and who finishes where. Same pair the single-round settle-up now sends.
    try {
      const _mDict = {}; ((combinedPay && combinedPay.rows) || []).forEach(r => { _mDict[r.id] = r.net; });
      let _st = []; try { _st = calculateSettlements(_mDict, (combinedPay && combinedPay.players) || []) || []; } catch (e) {}
      const _nmOf = id => { const p = ((combinedPay && combinedPay.players) || []).find(pp => pp.id === id); return p ? (p.name || p.firstName || '?') : '?'; };
      const _pots = bgPotRowsForEvent(t, raw);
      (raw || []).forEach(row => { const rg = (row && row.data) ? row.data : row; try { bgPotRowsForRound(rg).forEach(pr => { pr.pot = String(pr.pot).replace(/ \\(your group\\)$/, '') + ' — Group ' + ((rg.t2 && rg.t2.group) || '?'); _pots.push(pr); }); } catch (e) {} })   // v1938: "(your group)" reads wrong on a card sent to the whole field;
      const bf = await bgBetsImageFile({
        title: '🏆 ' + ((t && t.name) || 'Tournament') + ' — Final standings',
        subtitle: new Date(((headerG && (headerG.finishedAt || headerG.updatedAt)) || Date.now())).toLocaleDateString() + '  ·  every game, every group',
        potRows: _pots,
        statRows: bgStatRowsForRounds(raw),
        moneyRows: (function () { const _n = bgSettleNets(_mDict, (combinedPay && combinedPay.rows) || []);
          return ((combinedPay && combinedPay.rows) || []).map(r => ({ name: r.name || r.first, net: _n[r.id] || 0 })); })(),
        settlements: _st.map(s => ({ from: _nmOf(s.fromId), to: _nmOf(s.toId), amount: s.amount })),
        footer: (t && t.name) || ''
      });
      if (bf) files.push(bf);
    } catch (e) {}
  } catch (e) {}
  return files;
}
async function shareCombinedSettleUp(t, combinedPay, opts) {
  const text = await buildCombinedSettleUpText(t, combinedPay, opts);
  if (!text) { showToast('Not ready yet'); return; }
  let files = [];
  try { files = await _bgFieldShareFiles(t, combinedPay); } catch (e) {}
  const file = files[0] || null;
  // v1109: the v1058 two-mode split is gone with the "Text the numbers" button
  // (removed v1106). Images every time, on every share.
  // v1605: one sender + retry (see _bgShareSettlePayload).
  if ((await _bgShareSettlePayload(text, files, { key: _bgSettleShareKey(state.game, 'settle') })) !== null) return;
  if (file) {
    try {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a'); a.href = url; a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      showToast('Scorecard image saved — attach it, then paste the text below');
    } catch (e) {}
  }
  await _bgSendSettleSms(text, (combinedPay && combinedPay.players) || [], 'Combined Final standings copied — paste it into a text');
}
""",
"""/* v1952: _bgFieldShareFiles (the field scorecard + games-card pictures) is retired —
   the event page carries both, and the text links to it. The canvas builders stay for
   the in-app Game Totals viewer (bgOpenBetsBreakdown). */
async function shareCombinedSettleUp(t, combinedPay, opts) {
  const text = await buildCombinedSettleUpText(t, combinedPay, opts);
  if (!text) { showToast('Not ready yet'); return; }
  if ((await _bgShareSettlePayload(text, [], { key: _bgSettleShareKey(state.game, 'settle') })) !== null) return;
  await _bgSendSettleSms(text, (combinedPay && combinedPay.players) || [], 'Final standings copied — paste it into a text');
}
""",
"P5c drop _bgFieldShareFiles + combined share"))

EDITS.append((
"""async function shareRoundSummary() {
  // v1605: a payload parked by a rejected share goes out inside this tap.
  try { const _c = _bgSettleShareFromCache(_bgSettleShareKey(state.game, 'summary')); if (_c) { await _c; return; } } catch (e) {}
""",
"""async function shareRoundSummary() {
  // v1952: text + link only.
""",
"P5d summary cache"))
EDITS.append((
"""  const text = await buildRoundShareText();
  if (!text) { showToast('No round loaded'); return; }
  // v1127 (Tyler, 8/19): "I clicked the share results button it looks good but it
  // is missing the total games document." It was: this built ONLY the scorecard
  // blob, while every other settle-up share in the app goes through
  // _bgSettleShareFilesFor, which attaches the scorecard AND the every-bet card
  // (prize pools, each player's final number, who finishes where) — the pair v1109 made
  // standard. The summary modal was the last surface still sending one image.
  // Same helper now, so all three shares send the identical pair.
  let files = [];
  try { files = await _bgSettleShareFilesFor(state.game); } catch (e) {}
  // v1605: one sender + retry (see _bgShareSettlePayload).
  if ((await _bgShareSettlePayload(text, files, { key: _bgSettleShareKey(state.game, 'summary') })) !== null) return;
  // No file-share support → offer the images as downloads so they can be attached manually.
  if (files.length) {
    try { _bgOfferImageDownloads(files); } catch (e) {}
  } else if (!navigator.share) {
    try { window.location.href = 'sms:?&body=' + encodeURIComponent(text); } catch (e) {}
  }
}
""",
"""  const text = await buildRoundShareText();
  if (!text) { showToast('No round loaded'); return; }
  if ((await _bgShareSettlePayload(text, [], { key: _bgSettleShareKey(state.game, 'summary') })) !== null) return;
  if (!navigator.share) { try { window.location.href = 'sms:?&body=' + encodeURIComponent(text); } catch (e) {} }
}
""",
"P5e summary body"))

# Bets sheet share: use the shared builders
EDITS.append((
"""        const where = g.course ? (' — ' + g.course) : '';
        const lines = ['⛳ Bad Golf — Final standings' + where];
        // v1111 (Tyler, 8/19): the per-game list that used to lead this text is on
        // the attached games card. Text carries who owes who + the payment links.
        // payLines/_evLines on screen are built with { noPay: true }; the TEXT wants
        // the payment-app handles, so rebuild them here with links on.
        let _txtPay = [];
        try {
          _txtPay = await _settleUpLinesFor(calculateSettlements(money.combined, g.players),
                                            nameOf, id => g.players.find(pp => pp.id === id));
        } catch (e) { _txtPay = payLines; }
        // v1320 (Tyler, 8/30): this used to text "This group:" + that cart's payments
        // and THEN "Whole event:" + a second set of payments. Two award lists in one
        // message, and on an event whose units is all field-wide the first one is
        // empty or "all square" directly above real debt -- which is exactly what he
        // read as "it only shows my group". A tournament round now sends ONE award,
        // for everything, under the two totals-only breakdowns that explain it. A
        // plain round is untouched: no event, no breakdowns, its own settle-up.
        if (!t) {
          if (_txtPay.length) { lines.push(''); lines.push('Final standings:'); lines.push(''); _txtPay.forEach(l => lines.push(l)); }   // v1161 spacing
        } else {
          if (_evProv) { lines.push(''); lines.push('\\u26A0\\uFE0F ' + _evProv); }
          lines.push('');
          // Reuse what the sheet already fetched — no second round-trip, and the
          // text is built from the identical objects the screen rendered.
          try { bgEventBreakdownLines(_evPay, _evRaw).forEach(l => lines.push(l)); } catch (e) {}
          if (_evSettle && _evSettle.length) {
            lines.push('FINAL STANDINGS — final, covers everything above', '');
            let _txtEv = _evLines;
            try { _txtEv = await _settleUpLinesFor(_evSettle, _evNameOf, _evPlayerOf); } catch (e) {}
            _txtEv.forEach(l => lines.push(l));
          } else if (_txtPay.length) {
            // The event totals could not be built (offline, or a read that did not come
            // back). Say so rather than passing this cart's games off as the event's.
            lines.push("Couldn't reach the event totals \\u2014 this is THIS GROUP'S units only:", '');
            _txtPay.forEach(l => lines.push(l));
          }
        }
        const text = lines.join('\\n');
        // v1109 (Tyler): images every time. Same scorecard + games card the Board's
        // Text settle-up attaches -- this button used to send bare text.
        const files = await _bgSettleShareFilesFor(g);
        // v1605: one sender + retry (see _bgShareSettlePayload).
        if ((await _bgShareSettlePayload(text, files, { key: _bgSettleShareKey(g, 'sheet') })) !== null) return;
        try { _bgOfferImageDownloads(files); } catch (e) {}
        try { await navigator.clipboard.writeText(text); showToast('Copied — text it to your friends \\u{1F4CB}'); }""",
"""        /* v1952: the same two texts every other share sends — the event's (nets, award,
           event page link) when the event totals are in hand, else this round's own
           (nets, award, follow-along link). The v1320/v1111 inline assembly is retired. */
        let text = '';
        try {
          if (t && _evPay && Array.isArray(_evPay.rows) && _evPay.rows.length) text = await buildCombinedSettleUpText(t, _evPay, { allowProvisional: true });
        } catch (e) { text = ''; }
        if (!text) {
          try { text = await bgPlainRoundShareText(g); } catch (e) { text = ''; }
          if (text && t) text = "Couldn't reach the event totals \\u2014 this is THIS GROUP'S results only.\\n\\n" + text;
        }
        if (!text) { showToast('Nothing to share yet'); return; }
        if ((await _bgShareSettlePayload(text, [], { key: _bgSettleShareKey(g, 'sheet') })) !== null) return;
        try { await navigator.clipboard.writeText(text); showToast('Copied — text it to your friends \\u{1F4CB}'); }""",
"P5f bets sheet share"))

# prewarm + cache machinery
EDITS.append((
"""  // v1605: build the text + both pictures now, so the tap shares inside the gesture.
  try { if (state.game && state.game.finishedAt) _bgPrewarmSettleShare(state.game); } catch (e) {}
""",
"""""",
"P5g prewarm call"))

EDITS.append((
"""window._bgSettleShareReady = null;        // { key, text, files, at }
let _bgSettlePrewarmKey = '';
function _bgSettleShareKey(g, kind) {
  try { return (kind || 'settle') + '|' + String(g && g.code || '') + '|' + String(g && g.updatedAt || '') + '|' + String(g && g.finishedAt || ''); }
  catch (e) { return ''; }
}
// Call at the TOP of a click handler, before any await: sends a prepared payload
// inside the gesture. Returns a promise when it sent (or the user cancelled), null
// when there was nothing ready and the caller should build as usual.
function _bgSettleShareFromCache(key) {
  try {
    const r = window._bgSettleShareReady;
    if (!r || !key || r.key !== key || !Array.isArray(r.files) || !r.files.length) return null;
    if ((Date.now() - (r.at || 0)) > 15 * 60 * 1000) { window._bgSettleShareReady = null; return null; }
    if (!(navigator.share && navigator.canShare && navigator.canShare({ files: r.files }))) return null;
    window._bgSettleShareReady = null;
    return navigator.share({ text: r.text, files: r.files })
      .then(() => true)
      .catch(e => {
        if (e && e.name === 'AbortError') return true;
        window._bgSettleShareReady = r;   // keep it for one more try
        try { showToast("Couldn't open the share sheet — try once more", 5000); } catch (e2) {}
        return true;
      });
  } catch (e) { return null; }
}
// The one sender. true = handled (sent, cancelled, or parked for a retry);
// null = this device can't attach files at all, caller runs its own fallbacks.
async function _bgShareSettlePayload(text, files, opts) {
  opts = opts || {};
  const key = opts.key || '';
  if (files && files.length && navigator.share && navigator.canShare) {
    let ok = false;
    try { ok = !!navigator.canShare({ files: files }); } catch (e) { ok = false; }
    if (ok) {
      try { await navigator.share({ text: text, files: files }); window._bgSettleShareReady = null; return true; }
      catch (e) {
        if (e && e.name === 'AbortError') return true;
        // Rejected with pictures in hand (gesture expired / a share already open):
        // park the payload so the NEXT tap sends it synchronously, and say so.
        window._bgSettleShareReady = { key: key, text: text, files: files, at: Date.now() };
        try { showToast('Pictures are ready — tap the button once more to send them with the text', 6000); } catch (e2) {}
        return true;
      }
    }
  }
  try { if (navigator.share) { await navigator.share({ text: text }); return true; } }
  catch (e) { if (e && e.name === 'AbortError') return true; }
  return null;
}
// Build the Board's settle-up payload ahead of the tap. Finished, non-tournament
// rounds only (the tournament path confirms "still in progress" first and builds
// field-wide pictures; it keeps the retry, not the prewarm). Cheap to call often.
async function _bgPrewarmSettleShare(g) {
  try {
    if (!g || !g.finishedAt || !Array.isArray(g.players)) return;
    if (g.t2 && g.t2.tournamentId) return;
    const key = _bgSettleShareKey(g, 'settle');
    const r = window._bgSettleShareReady;
    if ((r && r.key === key) || _bgSettlePrewarmKey === key) return;
    _bgSettlePrewarmKey = key;
    if (!(navigator.share && navigator.canShare)) return;   // nothing to prewarm for
    const text = await buildSettleUpText();
    if (!text) return;
    const files = await _bgSettleShareFilesFor(g);
    if (!files || !files.length) return;
    if (!state.game || _bgSettleShareKey(state.game, 'settle') !== key) return;   // round changed under us
    window._bgSettleShareReady = { key: key, text: text, files: files, at: Date.now() };
  } catch (e) {} finally { try { if (_bgSettlePrewarmKey) _bgSettlePrewarmKey = ''; } catch (e) {} }
}
""",
"""/* v1952: the v1605 prewarm / park-and-retry machinery existed only because iOS rejects a
   share WITH FILES once the tap goes stale. The shares are text-only now, so it is gone;
   _bgShareSettlePayload keeps its signature (files are ignored). */
function _bgSettleShareKey(g, kind) {
  try { return (kind || 'settle') + '|' + String(g && g.code || '') + '|' + String(g && g.updatedAt || '') + '|' + String(g && g.finishedAt || ''); }
  catch (e) { return ''; }
}
// The one sender. true = handled (sent or cancelled); null = no share sheet here,
// caller runs its own fallbacks (sms: / clipboard).
async function _bgShareSettlePayload(text, files, opts) {
  try { if (navigator.share) { await navigator.share({ text: text }); return true; } }
  catch (e) { if (e && e.name === 'AbortError') return true; }
  return null;
}
""",
"P5h sender + cache removal"))


def patch(path):
    src = open(path, encoding='utf-8').read()
    for old, new, name in EDITS:
        n = src.count(old)
        assert n == 1, f'{path}: {name}: expected 1 match, got {n}'
        src = src.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='\n').write(src)
    print(f'{path}: {len(EDITS)} edits applied')

for p in sys.argv[1:]:
    patch(p)
