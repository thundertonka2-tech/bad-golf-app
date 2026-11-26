#!/usr/bin/env python3
"""v2075 (Tyler, 11/26): "Kevin setup a tournament yesterday with two guest players ... a few holes in Rambo wanted to send
Graham and John an invite from his phone. I am not sure it worked ... make sure our code can handle that process."
What the data showed: both guests had installed the app and signed up, but their account names were not the names
Kevin typed, a name-only spot is hidden from a non-member, and the event invite carried store links only -- so the app
showed them nothing. Tyler's choices: the invite carries the ONE tap-your-name link; any player in the event can send
it; a looser "Is this you?" card at the top of Home.
- shareTourneyInvite: the text has the tap-your-name link again (after the store links), flags the guest spots as
  Invited (bg_t2_mark_invited -- any member) and logs the send (outbound_invites, channel 'event').
- bgInvitePrompt('round') on an event cart sends the event invite, never the cart's own ?join= link (v912 rule).
- "Is this you?" on Home: bg_t2_my_spot_offers / bg_t2_claim_offer (server: exact name, a merged alias, a name within
  two letters, or the same first name for an account made around the time the spot was added). The player confirms;
  nothing is taken silently. A spot taken after the cart teed off is stamped onto that cart's round by the server.
Server: supabase/SQL_v2075_guest_spot_offers_claim.sql (applied 2026-11-26).

    python scripts/patch_v2075_guest_spot_offers_invite_link.py
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [os.path.join(ROOT, 'golf-app.html'), os.path.join(ROOT, 'www', 'index.html')]
OLD_V, NEW_V = 'v2026.11.2074', 'v2026.11.2075'

MODULE = r"""/* ============================================================================
   v2075 (Tyler, 11/26, Bad Golf Wednesday 11/25): "Is this you?" at the top of Home.
   A guest the organizer added by name signs up under whatever name he likes ("Graham" for "Graham Cracker",
   "John Christensen" for "John Christian"). The server (bg_t2_my_spot_offers) finds open spots that look like
   him in events that are not finished: the same name, a name already merged into his account, a name within two
   letters, or the same first name when the account was made around the time the spot was added. The card names
   the event, the organizer and his cart-mates; he says yes or no. Nothing is taken without that tap.
   ============================================================================ */
var _bgT2SpotOffers = null, _bgT2SpotOffersAt = 0, _bgT2SpotOffersBusy = null;
function _bgT2SpotDismissed() { try { return JSON.parse(localStorage.getItem('golf:t2-spot-dismissed') || '{}') || {}; } catch (e) { return {}; } }
async function bgT2SpotOffersLoad(force) {
  try {
    if (typeof supa === 'undefined' || !supa || typeof _authUser === 'undefined' || !_authUser) return [];
    if (!force && _bgT2SpotOffers && (Date.now() - _bgT2SpotOffersAt) < 60000) return _bgT2SpotOffers;
    if (_bgT2SpotOffersBusy) return await _bgT2SpotOffersBusy;
    _bgT2SpotOffersBusy = (async function () {
      let rows = [];
      try { const r = await supa.rpc('bg_t2_my_spot_offers'); if (r && !r.error && Array.isArray(r.data)) rows = r.data; } catch (e) { rows = []; }
      const dis = _bgT2SpotDismissed();
      _bgT2SpotOffers = rows.filter(function (o) { return o && o.pid && !dis[o.pid]; });
      _bgT2SpotOffersAt = Date.now();
      return _bgT2SpotOffers;
    })();
    try { return await _bgT2SpotOffersBusy; } finally { _bgT2SpotOffersBusy = null; }
  } catch (e) { return []; }
}
function bgT2SpotOffersHtml(offers) {
  try {
    const esc = (typeof escapeHtml === 'function') ? escapeHtml : function (s) { return String(s == null ? '' : s); };
    const T = function (s) { try { return (typeof bgT === 'function') ? bgT(s) : s; } catch (e) { return s; } };
    const list = (offers || []).slice(0, 3);
    if (!list.length) return '';
    let h = '<div style="font-weight:800;font-size:16px;margin-bottom:6px">👋 ' + esc(T('Is this you?')) + '</div>';
    list.forEach(function (o) {
      const mates = Array.isArray(o.mates) ? o.mates.filter(Boolean) : [];
      let when = '';
      try { if (o.date) { const d = new Date(String(o.date) + 'T12:00:00'); if (!isNaN(d)) when = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); } } catch (e) { when = ''; }
      const sub = [when, o.by ? (T('set up by') + ' ' + o.by) : '', mates.length ? (T('with') + ' ' + ((typeof bgJoinAnd === 'function') ? bgJoinAnd(mates) : mates.join(', '))) : ''].filter(Boolean).join(' · ');
      h += '<div class="bg-spot-offer" data-pid="' + esc(o.pid) + '" style="padding:8px 0;border-top:1px solid var(--border)">'
        + '<div style="font-weight:700;overflow-wrap:anywhere">' + esc(o.event || T('A tournament')) + '</div>'
        + '<div class="small-text" style="color:var(--text-muted);overflow-wrap:anywhere">' + esc(T('You are listed as')) + ' <b>' + esc(o.listed || '') + '</b>' + (sub ? ' · ' + esc(sub) : '') + '</div>'
        + '<div style="display:flex;gap:8px;margin-top:8px">'
        + '<button type="button" class="bg-btn bg-btn--sm small bg-spot-no" data-pid="' + esc(o.pid) + '" style="flex:1">' + esc(T('Not me')) + '</button>'
        + '<button type="button" class="bg-btn bg-btn--primary bg-btn--sm primary small bg-spot-yes" data-pid="' + esc(o.pid) + '" style="flex:1">' + esc(T('That’s me')) + '</button>'
        + '</div></div>';
    });
    return h;
  } catch (e) { return ''; }
}
async function bgT2SpotOfferClaim(pid) {
  try {
    const r = await supa.rpc('bg_t2_claim_offer', { p_player: pid });
    if (r && r.error) {
      const m = String(r.error.message || '');
      try { showToast(/ALREADY_CLAIMED/i.test(m) ? 'That spot was already taken by someone else' : (/NOT_OFFERED/i.test(m) ? 'That spot is no longer open — ask your organizer for the link' : 'Couldn’t join — try again')); } catch (e) {}
      return null;
    }
    try { window._timesEvCache = null; } catch (e) {}
    try { if (typeof _bgHomeFeedDrop === 'function') _bgHomeFeedDrop(); } catch (e) {}
    try { if (typeof _bgDiscoverAt !== 'undefined') _bgDiscoverAt = 0; } catch (e) {}
    return (r && r.data) || null;
  } catch (e) { try { showToast('Couldn’t join — try again'); } catch (e2) {} return null; }
}
async function bgRenderHomeSpotOffers(force) {
  try {
    const panel = document.getElementById('panel-home'); if (!panel) return;
    let card = document.getElementById('home-spot-offers');
    const offers = await bgT2SpotOffersLoad(force);
    if (!offers || !offers.length) { if (card) card.style.display = 'none'; return; }
    if (!card) {
      card = document.createElement('div'); card.className = 'card'; card.id = 'home-spot-offers';
      const first = document.getElementById('home-hcp-card');
      if (first && first.parentNode === panel) panel.insertBefore(card, first); else panel.insertBefore(card, panel.firstChild);
    }
    card.style.display = '';
    card.innerHTML = bgT2SpotOffersHtml(offers);
    card.querySelectorAll('.bg-spot-no').forEach(function (b) {
      b.onclick = function () {
        try { const d = _bgT2SpotDismissed(); d[b.dataset.pid] = 1; localStorage.setItem('golf:t2-spot-dismissed', JSON.stringify(d)); } catch (e) {}
        _bgT2SpotOffers = (_bgT2SpotOffers || []).filter(function (o) { return o.pid !== b.dataset.pid; });
        bgRenderHomeSpotOffers();
      };
    });
    card.querySelectorAll('.bg-spot-yes').forEach(function (b) {
      b.onclick = async function () {
        if (b.disabled) return; b.disabled = true;
        const tid = await bgT2SpotOfferClaim(b.dataset.pid);
        if (!tid) { b.disabled = false; return; }
        _bgT2SpotOffers = null; _bgT2SpotOffersAt = 0;
        try { card.style.display = 'none'; } catch (e) {}
        try { showToast('Welcome to the tournament! 🎉'); } catch (e) {}
        try { if (typeof bgDiscoverMyLiveRounds === 'function') await bgDiscoverMyLiveRounds(); } catch (e) {}
        try { switchTab('tourneys'); openT2Home(tid); } catch (e) {}
      };
    });
  } catch (e) {}
}
"""

EDITS = [
  ('module',
   """async function renderHome() {
  try { bgRenderBadgesCard('home'); } catch (e) {}   // v1611: sibling card, own renderer""",
   MODULE + """async function renderHome() {
  try { bgRenderHomeSpotOffers(); } catch (e) {}   // v2075: "Is this you?" for a guest the organizer added by name
  try { bgRenderBadgesCard('home'); } catch (e) {}   // v1611: sibling card, own renderer"""),
  ('invite-text',
   """    '\\n\\nTo PLAY, tap to join the game in the app:' +
    '\\nJoin on iPhone: ' + BG_APPSTORE_URL + '\\nJoin on Android: ' + BG_PLAYSTORE_URL +
    (_webUrl ? ('\\n\\nTo FOLLOW ALONG, tap the web link (no app needed):\\n' + _webUrl) : '');""",
   """    /* v2075 (Tyler, 11/26): the tap-your-name link is back in the text. With store links only (v1485) a guest
       installed the app and had no way to his spot. Wherever the link opens -- the app or the browser -- signing
       in and tapping his name ties his account to the spot, and the app then shows the event. */
    '\\n\\nTo PLAY:' +
    '\\n1. Get the app' +
    '\\niPhone: ' + BG_APPSTORE_URL + '\\nAndroid: ' + BG_PLAYSTORE_URL +
    '\\n2. Tap this link, sign in and tap your name:\\n' + link + ((typeof bgTclaimKey === 'function') ? bgTclaimKey(t) : '') +
    (_webUrl ? ('\\n\\nTo FOLLOW ALONG, tap the web link (no app needed):\\n' + _webUrl) : '');
  try {   // v2075: any player in the event can send it -- flag the guest spots as Invited and keep a record of the send
    if (supa && _authUser) {
      try { Promise.resolve(supa.rpc('bg_t2_mark_invited', { p_tid: tid })).then(function () {}, function () {}); } catch (e) {}
      try { Promise.resolve(supa.from('outbound_invites').insert({ from_user: _authUser.id, from_name: me, to_name: null, game_code: (state.game && state.game.t2 && state.game.t2.tournamentId === tid && state.game.code) || null, course: name, join_link: link + ((typeof bgTclaimKey === 'function') ? bgTclaimKey(t) : ''), channel: 'event', status: 'logged' })).then(function () {}, function () {}); } catch (e) {}
    }
  } catch (e) {}"""),
  ('prompt-event-cart',
   """    } else {
      const g = (state.game && state.game.code === id) ? state.game : null;
      const course = (g && g.course) || '';
      text = who + ' added you to a golf round' + (course ? ' at ' + course : '') + ' on Bad Golf!\\n\\n' + buildJoinLink(id)""",
   """    } else {
      const g = (state.game && state.game.code === id) ? state.game : null;
      /* v2075: an event cart never hands out its own ?join= link (v912 -- that is how a player lands on the wrong
         card). The guests on this card get the event invite with the tap-your-name link. */
      if (g && g.t2 && g.t2.tournamentId) { await shareTourneyInvite(g.t2.tournamentId); return; }
      const course = (g && g.course) || '';
      text = who + ' added you to a golf round' + (course ? ' at ' + course : '') + ' on Bad Golf!\\n\\n' + buildJoinLink(id)"""),
]

def main():
    for f in FILES:
        src = open(f, encoding='utf-8', newline='').read()
        crlf = '\r\n' in src
        if crlf: src = src.replace('\r\n', '\n')
        for name, old, new in EDITS:
            c = src.count(old)
            assert c == 1, '%s: %s matched %d times' % (os.path.basename(f), name, c)
            src = src.replace(old, new)
        assert src.count(OLD_V) == 2, '%s: version markers %d' % (f, src.count(OLD_V))
        src = src.replace(OLD_V, NEW_V)
        if crlf: src = src.replace('\n', '\r\n')
        open(f, 'w', encoding='utf-8', newline='').write(src)
        print('patched', os.path.relpath(f, ROOT))

if __name__ == '__main__':
    main()
