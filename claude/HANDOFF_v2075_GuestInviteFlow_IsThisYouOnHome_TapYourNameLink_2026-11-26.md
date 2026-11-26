# HANDOFF v2026.11.2075 — guests can find and take their tournament spot (invite link back, "Is this you?" on Home)

Date: Thu 2026-11-26. App pushed to `main`; server functions applied to the live database the same day.

## Tyler
"Kevin setup a tournament yesterday with two guest players in the app. He didn't know them or their cell numbers. He started the tournament then I started my group, a few holes in Rambo wanted to send Graham and John an invite from his phone. I am not sure it worked as the other guys never said anything about the app. Can you make sure our code can handle that process as well and run some tests to ensure the flow is user friendly for everyone."

## What the database showed (Bad Golf Wednesday 11/25)
- "Graham Cracker" and "John Christian" were still plain guest spots, never invited (`invited_at` null), never taken.
- Both men HAD the app: an account "Graham" (Android) and "John Christensen" (iPhone) were made Tuesday evening, 25–35 minutes after Kevin added the guests, and both opened the app on Wednesday (Graham at 3:07 PM, mid-round). Neither account held a spot, a round or an invite — the app was empty for them.
- No record of Rambo's invite: the event invite was never logged.

## Why it failed
1. Since v1485 the event invite text carried store links only — no join link.
2. The "Is this you?" card needed an EXACT name match, and its lookup read `tournament_players` directly, which row security hides from anyone not already in the event — so for a brand-new account it could never appear.
3. With no card, the Events tab is empty (it lists only events you are in).

## Tyler's choices (11/26)
One "tap your name" link in the invite · any player in the event can send it · looser match with the card at the top of Home · link yesterday's two spots now. He confirmed the names: Graham Radman, John Christensen.

## App (v2075, `scripts/patch_v2075_guest_spot_offers_invite_link.py`)
- `shareTourneyInvite` (the Invite players button on any event cart, and the event screens): "To PLAY: 1. Get the app (iPhone / Android) 2. Tap this link, sign in and tap your name: <?tclaim=id.key>" + the follow-along page. It calls `bg_t2_mark_invited` (guest spots show Invited on the organizer's list) and logs to `outbound_invites` (channel `event`), so a send can be confirmed afterwards.
- `bgInvitePrompt('round')` on an event cart now sends that event invite — it used to build the cart's own `?join=` link (against the v912 rule).
- New "Is this you?" card, first card on Home (`bgRenderHomeSpotOffers`): event, date, organizer, "You are listed as …", cart-mates; **Not me** (remembered on the phone) / **That's me** (claims, then opens the event). Translated es / ko / ja / zh.

## Server (`supabase/SQL_v2075_guest_spot_offers_claim.sql`, migrations `v2075_guest_spot_offers_claim` + `v2075b_spot_offers_alias_rule`)
- `bg_t2_my_spot_offers()` — open guest spots in unfinished events that look like the caller: same name; a name already merged into the account (shared alias map); a name within two letters; or the same first name when the account was made from 1 day before to 14 days after the spot was added. Returns no tokens. Max 5.
- `bg_t2_claim_offer(pid)` — re-checks the offer server-side, then takes the spot.
- `_bg_t2_stamp_round_uid` — a spot taken after the cart teed off puts the account on that cart's round, so the round shows on his phone. `claim_tournament_slot` (tap-your-name and personal links) calls it too.
- `bg_t2_mark_invited(tid)` — any member of the event.
- Signed-in users only; additive, no table changes.

## Data fix (11/25)
- "Graham Cracker" -> account Graham; "John Christian" -> account John Christensen: `tournament_players` linked, both stamped on round TEE75 (backup `bg_backup_badwed_1125_guest_link`). Scores, units and the corrected settlement untouched.
- Names in the finished event are left as played (history is never rewritten); aliases added so they resolve to the accounts: `graham cracker`, `graham radman` -> Graham; `john christian` -> John Christensen.
- Their Game history entry for 11/25 is written by their own phone the next time each opens the finished round.

## QA
- Server, against the live database in a transaction that was rolled back (nothing left behind): John is offered "John Christian" (alias) and "Jon Christensen" (one letter), sees cart-mates and organizer; cannot take Graham's spot (`NOT_OFFERED`); takes his own; a second claim is refused; the round row gets his account and he is in `participants`; Graham is offered "Graham Cracker" only; the tap-your-name path stamps the round too; a stranger is offered nothing and cannot mark invited; Rambo (a player, not the organizer) can.
- Phone side, `qa/qa_v2075_guest_invite_flow.js` — 34 checks on each file: invite text (store links, join link with key alone on its line, never the cart link, follow-along page, line lengths), Invited flag + log, start-of-round prompt on an event cart v a regular round, the Home card (first card, wording, phone-friendly buttons, Not me remembered, spot already taken, That's me, no offers, signed out, server down).
- All 85 `qa_*.js` pass on both files; `npm test` 82/82; guards All clear; language sources in step.
- Not run on real phones.

## Known limits
- The first-name-only rule is deliberately narrow (account made around when the spot was added). A long-standing account whose name differs from what the organizer types is matched only by an alias or a near spelling; otherwise he uses the link.
- The invite text is English only.
