# Bad Golf App — Complete User Documentation
**Build Version:** v2026.11.1489
**Documentation Date:** September 2026
**Audience:** Non-technical users, Kevin, and support staff

---

## Table of Contents
1. [Account & Authentication](#account-authentication)
2. [Getting Around the App](#getting-around-the-app)
3. [Bad Golf Pro (the gold PRO badge)](#bad-golf-pro-the-gold-pro-badge)
4. [Home Tab](#home-tab)
5. [Play / Setup Tab](#play-setup-tab)
6. [Score Tab](#score-tab)
7. [Games Screen (Units & Final Standings)](#games-screen-units-final-standings)
8. [GPS Rangefinder](#gps-rangefinder)
9. [Apple Watch App](#apple-watch-app)
10. [Games (35+)](#games-35+)
11. [Info Tab (Rules & Help)](#info-tab-rules-help)
12. [Sending Feedback](#sending-feedback)
13. [Profile Tab](#profile-tab)
14. [Stats Tab](#stats-tab)
15. [Rounds Tab](#rounds-tab)
16. [Times Tab (Tee-Time Calendar)](#times-tab-tee-time-calendar)
17. [Tourney Tab (Events & Tournaments)](#tourney-tab-events-tournaments)
18. [Leagues](#leagues)
19. [Friends Tab](#friends-tab)
20. [Admin Side Features](#admin-side-features)
---

## Account & Authentication

### Sign-In Options

Users access the **Sign in to Bad Golf** modal from the Stats tab (Account section) or when joining a round.

**Sign-in methods:**
- **Continue with Google** — OAuth sign-in via Google account
- **Continue with Apple** — sign in with your Apple ID (working again as of v939; it had been showing a "not live yet" message)
- **Email & password** — standard email/password authentication

**Saved passwords work now.** The credential fields are a real form with proper autofill hints, so iOS offers **Save Password**, **Sign in** is a submit button (the keyboard's **Go** key signs you in), and your last successful email is pre-filled. *A password saved inside the iOS app won't be offered on the public website, and vice versa — they're separate to your phone's password manager.*

**You can close the sign-in screen.** If you opened sign-in yourself from inside the app, it has a **✕**, a backdrop tap and Escape. Only the two genuine launch gates (first boot, and right after signing out) hold you there.

**Account creation:**
- Tap **Create account** on the sign-in modal
- Enter email and password (minimum 6 characters)
- Confirm the name you'll play as (see below)

**Requirements:** iPhone/iPad on **iOS 15 or newer**. Bad Golf is also live on **Google Play** — the invite links include both stores, since the sender can't know which phone you carry.

**Sharing a phone.** Signing out clears the cached roster, friends and profile data, so the next person to sign in never sees — or absorbs — the previous account's players and history.

**Signed out means nothing loads from the cloud.** A device that hasn't signed in reads only what's stored on that phone. It used to be able to pick up a shared, app-wide list of recent rounds — everybody's rounds — and even prune its own history against it. Anything you save while signed out is written to your own account on the first sync after you sign in.

### "You'll Play As…" — Confirming Your Name

Signing up with Google or Apple used to silently create your player from the legal name on that account, which is often not what your crew calls you. Now the app shows that name in an **editable** prompt:

> **You'll play as…** This is the name your crew sees on scorecards and leaderboards. Change it if they know you by something else.

Fix it here and you avoid becoming a second, empty duplicate of yourself in everyone's roster.

### Claiming the Player Your Crew Already Made for You

If your buddies added you as a guest before you signed up, the app offers to hand you that history on first sign-in:

- The modal reads **"Is one of these you?"** — *"These are players the crew already added who haven't joined yet. If one is you, tap it to claim that history."*
- Buttons: **"I'm not listed — create my player"** and **"Decide later."**
- The match is decided by **email** first. If the guest entry has no email, it's only offered when you've actually shared a scorecard with it, and the prompt shows the round count so you can confirm. A stranger's entry with history you never played in is never offered, and if two entries could match, neither is.

**Host-initiated claims.** A host can hand a guest their history directly: tap the guest anywhere (leaderboard, Home, Crew) → their profile → **"📤 Invite <first name> to claim these rounds."** It texts them a one-time link if the host has their number, otherwise it opens the share sheet. When they open it and sign in they see something like *"Brian Myers — 8 rounds, −40 units lifetime. Claiming moves those rounds, that handicap and those unit totals onto your account."* **Units rides along with the rounds.** The button only appears for guests with no email on record, and the app refuses to mint a claim link for a name that already belongs to a registered user.

### Joining From an Invite Link (Zero Typing at the Tee Box)

If someone added you at the first tee and sent you the link, signing in gives you **one confirmation** — e.g. *"You are set up as Brian Myers, handicap 12"* — and you're in, using the name and handicap the host entered. No name prompt, no handicap prompt, no phone prompt.

If the link isn't tied to a specific person, you get a **"Which player are you?"** picker listing the round's players. Slots already linked to another account are greyed out and can't be picked. There's also **"I'm someone else"** and **"None of these — I'm new"** (which runs normal signup). An account that already has a linked player is never renamed by a link.

If a claim fails, the app now says why — whether the slot is already tied to one of *your* other logins (naming the email you're signed in as) or to somebody else's — and opens the event anyway. *This is the classic "the invite just dumps me on the home screen" complaint, and the usual cause is a duplicate account.*

> ### "I'm in the tournament but I can't see it" — the fix is the invite link
>
> A player added to an event **by name only** can be scored normally by whoever holds the card, but until that spot is tied to an account, **the event never appears on their phone and the round never lands in their own history or stats.** They aren't broken and nothing is lost — the spot simply has no account attached to it yet.
>
> **The cure is the invite link, not rebuilding the carts.** Open the event → **Invite** → send that player their own link. They sign in, tap their name, and the spot, the handicap and every round already played on it stay attached. A general event link lands everyone on the *"tap your name"* claim page and works just as well.
>
> Older advice to "rebuild the groups and they'll link up" is worse: it only works at cart-build time, it needs the commissioner, and it does nothing at all if the player doesn't have an account yet.

### Handicap Ask at Sign-Up (and the "TEMP" Badge)

New players are asked for their handicap the first time they sign in — **including Google and Apple sign-ins**. It's optional: tap **"Skip"** and you're never nagged again.

- Whatever you type is treated as a **placeholder**, not a real index, and everywhere it appears it's marked **TEMP**.
- Your **Handicap Index** tile shows the number with a **"TEMP"** badge instead of a bare "—".
- Round setup shows a small **"TEMP"** pill beside a player's HCP box whenever that handicap isn't a real established index.
- The **Share handicap** text and the **Times** tee-time player picker append a plain-text **"(TEMP)"** marker.
- **The Crew leaderboard deliberately never shows a TEMP number** — it shows a real computed index or **"N/A"**. That's the anti-sandbagging rule.
- The Info tab has an explainer card: **"🏷️ The 'TEMP' badge"**.

Your index replaces the placeholder automatically as soon as you have real rounds.

### Phone Number (Optional, Never a Login)

New-user setup asks for a phone number once, right after the handicap question, with the reason on screen: *this is how the guys you play with text you a round invite that opens straight into the app.*

**There is no SMS login.** Signing in is email, Google or Apple only. The number is only ever used to reach you — final standings texts, tee-time invites, claim links. You can add or change it later in Edit profile.

### Profile Editing

**Two ways in:** **Home → Account card → Edit profile**, or tap your profile photo / the handicap box on the Stats tab.

The Account card lists **Edit profile → Sign out → Delete account**.

> **If you ever saw "Could not save phone (run Profile_Phone.sql?)", that's fixed — and it was never about your phone number.** For a stretch, **every save to your own profile was failing, for every user, on every platform**: your phone number, **My clubs**, your **tracked-shot log**, your avatar, the player you map yourself to, your stats-visibility setting and your home course. It was fixed on the server, so no app update was needed. The message no longer names a SQL file either — it shows the real error — clearing the phone field genuinely clears it, and the app reads your row back after saving, so a write that silently changed nothing is reported as a failure instead of a green tick.

**What you can edit:**
- **Profile photo** — tap **"📷 Add / change photo"** to upload an image from your device; crew sees it as your avatar
- **Display name** — first and last name (32-character limit)
- **Email** — view the address on the account. If you used Apple's *Hide My Email*, this reads **"Signed in with Apple"** rather than a scrambled relay address
- **Password** — New password + Update password (email sign-in only; the fields sit below the fold — the modal scrolls)
- **Phone number** — auto-dashes as you type (e.g. 555-123-4567); used for text final standings and invites
- **Home course** — see [Your Home Course](#your-home-course) below. **Choose** / **Change** and **Clear** (Clear asks first)
- **Gender (for handicap rating/slope)** — a **Male / Female** picker. Women golfers are automatically scored against each tee's **women's** rating/slope (when the course has them) so net games and handicaps are fair. Men's numbers are used by default if gender is unset.

**Crew photo / avatar visibility:**
- Your photo displays as a small circle avatar in crew lists, live leaderboards, and the highlights feed
- If no photo is set, the system shows a "?" placeholder — and your own row carries a small **camera badge** nudging you to add one, which disappears the moment you do
- Names can't contain `<` or `>` (a security rule — no real name is affected)

**Your profile is private now.** Every signed-in account used to be able to read every other account's full profile row — phone number, clubs, tracked shots, role. That's closed. You see your own row; everyone else sees only what's needed to show your **name, avatar and handicap** on a leaderboard, in friend search, or on a round you're both in. **Your phone number and email are no longer readable by other players.** Admin user-management screens are unchanged.

> **If names ever come up blank** in friend search or on a leaderboard for a non-admin, that's the symptom of this rule biting — a denied read comes back as an empty list rather than an error. Four accounts still on builds older than v991 will lose cross-user name lookup until they update the app.

### Forms Remember What You Were Typing

Every editor in the app — round setup, the rating/slope editor, the pars/stroke-index editor, the add-past-round grid, tournament day config, edit-name — **auto-restores what you had typed** if you get interrupted.

- Leave a form half-filled, take a call, come back, and reopening that screen refills it with a toast reading **"↩️ Restored what you were typing."**
- Auto-restore only applies **within 30 minutes**, only to text boxes (not dropdowns), never overwrites a field the screen already filled in, and never refills search or filter boxes.
- Tapping into an older field still recovers drafts up to **12 hours** old.

**What is deliberately NOT remembered:** the "new tournament" setup fields (name, team names, location and settings) and **your game selections**. A brand-new round or tournament always starts clean. Per-game option values — stakes, formats, allowances — *are* remembered, so switching a game back on recalls what you last played it for.

### Duplicate Accounts — the #1 Support Cause

If a player has two logins (say Google sign-in and email/password), their tournament slots, rounds and units can be pointed at one account while they sign in on the other. Symptoms: "my rounds don't show up", "the invite dumps me on Home", "my handicap is different on my iPad".

**A spelling difference is no longer mistaken for a guest.** A player with a real account whose roster name doesn't match their profile name — "Mike" on the roster, "Michael" on the account — used to wear a **GUEST** pill inside the round. Account holders are identified by **email** now, whatever the name on the card says.

The fix for a genuine duplicate is an **admin account merge** (see Admin → User Management). Afterwards the player must sign in with the surviving login only. A merge repoints tournament slots, round players, invites, push tokens, stats and friendships, unions the score histories, and **recomputes the handicap index off the merged history** — which can move it (one merge took an index from 4.6 to 5.2). Rounds already played are not re-settled at the new index.

---

## Getting Around the App

**The bottom bar has five slots, and two of them change as you play:**

`Home · Rounds · **Play** · Friends · More`

- **Home** — your dashboard. While a round is live and you're on the scoring screen, this first slot becomes **Score** instead.
- **Rounds** — open rounds, scheduled rounds, your saved round history and round templates. *(This tab used to be called Events.)*
- **The middle button** reads **Play** normally and **Round** while a round is live. It used to be the Bad Golf logo artwork; since v1030 it's the word, because nobody knew what the logo did. Its ring is **red while a round is live** and green when nothing is active. On the round-setup screen it hides itself — it sat directly under **"▶ Start round now"** and people were tapping the wrong one.
- **Friends** — your friends, the roster, the crew message board and a **Live now** list you can spectate from. *(This slot used to be labelled Crew.)*
- **More** — opens a sheet listing, alphabetically: **Info · League · Profile · Stats · Times · Tourney**, with **Admin** on its own row underneath, for admins only. **League is open to every signed-in user** — the BETA pill and the tester-only access list are both gone. Because there are now six tiles, the sheet draws them as a **3-across, two-row grid**; signed-out users still see a five-across single row without League.

**An info dot and a sync dot sit in the bar's lower-right corner.** Tap the **i** for your build number; the dot beside it colours itself by sync status.

**There is no Games tab in the bottom bar.** The 💵 Games screen still exists and every other route to it works — the units bubble and match chips on the GPS screen, the Games buttons on the Rounds list, the end-of-round summary. It was removed because the same numbers now live on the scoring sheets, and a fifth item appearing and disappearing mid-round made the bar jump under your thumb.

**Side wagering is gone.** The old Wager tab — game slips, a proposal ledger, incoming and outgoing offers, an over/under line — has been removed from the app entirely, along with the one-tap payment buttons. Deleted, not hidden. The last traces went with it: the wager block on the admin dashboard, the wager branch in the **Inbox** invite list (every invite is a round invite now) and the wager icon. **Side games themselves — Skins, Nassau, Wolf, Vegas, Banker, Ryder Cup and the rest — are untouched.** The Get Started **"Side games"** card now carries a trophy icon in place of the old coin.

**Smack-talk voice is gone.** The spoken roasts and hype, the voice engine, the per-hole trigger, the system-voice picker, both **Round settings** rows and Roland's Spanish round-start announcement have all been removed, and the app clears the old saved settings off your phone by itself. If a guide or a screenshot still shows a "Smack-talk voice" toggle, it's out of date.

- **What stayed:** the silent **Roland birdie photo pop-up** — still gated by **Round pop-ups**, just with no audio.
- **What was never part of it:** **tournament and league chat**. Its own description mentions "smack talk + live updates", but that's typed chat between players and it works exactly as before.

**Back always goes back one step now.** The Games screen can be reached about fifteen different ways — the tab strip, the bottom bar, the floating **"View board"** bar on an active round, the GPS units bubbles, the end-of-round flow, a Crew row. **Back returns you to whichever tab you opened it from**, and from a GPS units bubble it puts you back on the **same hole of the map**. It used to be hardcoded to the Score tab, so opening Games from Home and pressing Back dumped you on a scoring screen — sometimes a disabled one.

**Escape / back:** on web, **Escape** closes any overlay. On Android, the hardware **back** button works inside the app instead of minimizing it and throwing away what you were typing.

### The Welcome Tour — Six Cards

A new account is walked through **six cards**, each with an illustration, a sentence or two, and a mini-phone that lights up the tab the card is talking about. The step counter and the dot row size themselves to the cards, so they always read "Step N of 6".

1. Getting started and your first round
2. Scoring
3. GPS
4. **Side games** *(the card used to be titled "Side games & games"; its icon is now a trophy rather than the old coin)*
5. **"Leagues — play a season"** — *"A league is a season with the same group — 6 to 12 weeks, one round a week…"* It points at the **More** tab
6. Stats, handicap & help — also pointing at **More**

The League card sits fifth on purpose: a league is what you graduate to *after* you understand a round and its games, so it follows Side games rather than interrupting the play sequence. It points at the same tab as the card after it, so the two read as one thought — here's the feature, and here's where everything else lives.

*The Info tab's old "Replay the Get Started guide" card and its embedded how-to video were both removed.*

### Every Button Looks and Behaves the Same Now

A pass across the whole app put every button on one system. You won't find a new feature here — you'll find that things stop surprising you.

- **One set of button styles** — filled, outline, danger, icon and segmented — used consistently, with a visible **focus ring** when you navigate by keyboard, and every undersized button brought up to a **44px** touch target. The team chips in round setup were a 29px sliver before; they're full-size now.
- **The ✕ close button is the same glyph everywhere**, and every one of them carries a proper label for screen readers.
- **Dismissing a dialog now always means "nothing happened."** Tapping outside a confirmation, pressing Escape, or using Android's back button could previously fire whatever action sat in the dialog's other slot — backing out of **"Delete event?"** could delete the event. That class of bug is closed.
- **An apostrophe in a name no longer breaks the button next to it.** A player called O'Brien, or a league called Men's League, could silently make a button permanently unresponsive. Roughly 146 buttons were exposed to this.
- **Confirmation wording was cleaned up** so no button lies about what it does — **"Leave round?"** now offers **"Leave"** and **"Stay"** rather than Yes/No.
- **Escape and Android back close the right thing** in more places: the More sheet, the GPS map, and each individual GPS panel now close themselves instead of taking the whole screen down with them.

**Update available banner.** When a newer build is out, a banner appears above the bottom nav reading **"Update available — you're on <your build> — <new build> is out"** with an **Update** button (App Store on iPhone, Google Play on Android, page reload on web) and a **✕** that snoozes that one version. The app asks the App Store what version is actually live, so it can't tell you to update to a build the store doesn't have yet.

**The app got materially faster to open.** The web app had been downloading its whole 5 MB bundle **twice** on every launch, because the version check read the wrong slice of the file and fell through to a full uncached re-fetch. Launch traffic dropped by about **half**. Opening the course picker and typing in it are noticeably quicker too.

---

## Bad Golf Pro (the gold PRO badge)

You'll see a small gold **PRO** pill next to a lot of games and features. Here's exactly what it means today:

**Nothing is locked.** Every game with a PRO badge is fully selectable and fully playable right now, for everyone. The badge is **informational** — it marks the features that will belong to **Bad Golf Pro** when paid plans launch later. There are no in-app purchases and nothing is billable.

**Tap any PRO pill** and a short explainer opens:

> **Pro features — free right now**
> Features with this badge will be part of **Bad Golf Pro** down the road.
> Nothing is locked today — and as an early member, you'll keep **90 days of Pro free** after plans launch.

Dismiss it with **"Got it"** (or tap the backdrop). On a junk-game row, tapping the badge opens the explainer **without** switching that game on. The badge renders as the gold pill everywhere now, including inside the Info tab's game popups (it used to print the letters "PRO" as plain text in those headings).

### What's free forever

**Four games are permanently free** (five tiles, counting the tournament version of Skins):

- **🎯 Skins**
- **⛳ Nassau** (with Huckle)
- **🤝 Match Play**
- **💰 Stroke Play Prize Pool**
- **Tournament Skins** (the event-wide Skins prize pool) — because it *is* Skins

Free features outside the game list:

- The **whole round experience** — scorecard, putts/GIR/fairway/penalty/sand tracking, live leaderboard, the Games screen, final standings
- **Basic GPS** — satellite map, Front/Mid/Back yardages, target drag
- **Final standings and Unit Totals** — the whole units surface, never badged, free forever
- Your **WHS handicap index**, rounds history, and **Add past round**
- The whole **social layer** — Crew, friends, invites, the crew message board, Live Now, spectating, and highlights
- The **Times** tee-time calendar
- **Hydration / drinking games** (they're not games)
- The **Info tab** help topics — handicap rules, "How handicaps work", "Good to know"

### What carries a PRO badge

- **Every other game** — Vegas, Dynamic Vegas, Wolf/Captain, Banker, 6's, Splix 6's, Niners, Stableford, Bingo Bango Bongo, Quota, Team Quota, Ryder Cup, Scramble, Team Match, Team Low Ball, High & Low, Hammer, Umbrella, Pot of Gold, and the three round pools (**Low Net Pool**, **GIR Pool**, **Fewest Putts Pool**)
- **Every side game** — Par 3 Greenie, Closest to the Pin, Long Putt, Long Drive, Birdie Bump, Animals, Marks, Hot Potato
- **All eight junk games** — GIR, Sandy, Rolo, Barkie, Polie, Arnie, Chip-In, Snake
- **The tournament Event Prize Pools** — Low Net, Most GIRs, Fewest Putts, Long Putt, the **Scramble Prize Pool**, and the Tourney-tab **Side Prize Pools** row
- **The GPS intelligence layer** — Plays-Like, wind & temperature, the club suggester, and **My Clubs** (badged at their settings screens; no pills are ever drawn on the live GPS heads-up display)
- **The Apple Watch app**
- **Shot tracking** — drive auto-estimate and the **My Shots** log
- **Advanced stat drill-downs** (the basic tiles stay free)
- **Events / multi-day tournaments** (the "+ New event" button)
- **Round templates**

*Admin note: Admin → Users carries a per-account Pro toggle (`⭐ Pro: ON` / `☆ Pro: off`). It records who granted it and when. It changes nothing today — it's the plumbing ahead of a future paywall.*

---

## Home Tab

The Home tab is your dashboard — your handicap, your home course, your crew's chatter, and every round you're in.

**Top to bottom:** handicap & stat tiles → **🏠 Home course** card → **Crew card** (message board + highlights) → **"Your rounds"** → **Find a Course** → **Account card**.

Home **paints your saved rounds immediately** from what's already on the phone, then fills in invites, tournament groups and trophies as the network answers arrive. It also redraws the moment fresher data lands, so your photo, handicap and stats are never stale on a cold open. A card that genuinely fails to load says so instead of sitting on "Loading…" forever.

### Handicap Box (KPI)

**Location:** top of Home tab, labeled "👋 Hey [name]"

**What it shows:**
- **Handicap index** (to one decimal place)
  - WHS-style: calculated from your best differentials in the last 20 rounds
  - **Provisional** label appears if you have fewer than 5 rounds
  - A **TEMP** badge instead, if all you have is the handicap you typed at sign-up
- **Last round score** (gross) if available
- **Tap the box** to open the Stats tab for full handicap details and round history

**Stat tiles:** the small tiles under the greeting (Rounds, Avg score, and friends) all tap through to the round-by-round stat detail popup. A player with no rounds yet sees **N/A** in every tile rather than the box vanishing or reshaping — the putts / GIR / fairway row is always drawn (tiles stay non-clickable until there's data).

### Three Icons on the Home Card — Bag · Ball · Envelope

The top line of the Home stats card is your **profile photo on the left** and three icons **right-aligned on the same line**, vertically centred on the photo. They're drawn as small filled, multi-colour illustrations in the same style as the app's achievement icons — the bag is gold with silver shafts, the ball sits on green turf, the envelope is blue.

| Icon | Opens | Getting back |
|------|-------|--------------|
| **🏌️ Bag** | **My clubs** | **Close** returns you to Home |
| **⛳ Ball** | **Profile**, with **My shots** already expanded and scrolled to | Back returns you to Home |
| **✉️ Envelope** | Messages & requests, with the unread badge | Back returns you to Home |

All three are full **44 × 44** tap targets.

**On phone-width screens the card's three header lines are shortened** so the icons and the wording fit on one card without pushing everything down — **"Handicap Index 3.8"** reads **"Index 3.8"**, **"avg of lowest 8 of 20"** reads **"lowest 8 of 20"**, and **"▲ Declining (1.1 worse)"** reads **"▲ Declining"**.

- The short wording is **only on the Home handicap card**. The **Stats tab and the Crew cards keep the full wording at every width**, and the full wording comes back on Home too at tablet width and on a wide web window.
- Phones narrower than a standard iPhone keep the earlier layout — icons on their own row above the header, full wording.

### Your Home Course

Tell the app where you normally play and two things happen: your rounds get a badge, and new rounds default to your course.

**Setting it — two routes:**
- **Home tab → the home-course card.** Unset, it reads **"Set your home course"** with a **"Choose my home course"** button. **One tap opens the course picker** — titled **"🏠 Pick your home course"** — and that's it.
- **Edit profile → Home course**, with **Choose** / **Change** and **Clear** (Clear asks first).

Once set, the card collapses to a compact **"🏠 HOME COURSE / <name>"** row with a **"Change"** button. A one-time, dismissible prompt appears the first time; it's never blocking, and once you've seen it, it shrinks to a single quiet line. The card stays blank until your account has actually been checked, so it won't pitch at you when you already set a home course on another device.

**The home / away badge.** Every round you play is stamped **home** or **away** on the saved rounds list, the Home rounds card, the Stats round card, the round summary subtitle and the round Games sheet header.

- "Home" means the **whole facility** — nine combinations, a nine played twice, and every course at a multi-course club all reduce to the same base course, so every routing at your club reads **home**
- **If you haven't set a home course, no badge is drawn anywhere.** That's by design
- The badge is deliberately kept off the scorecard grid itself and out of share text and images

**New rounds default to it.** With a home course set, round setup pre-picks it and says so: *"🏠 Defaulted to your home course — X. Search above to play somewhere else."*

- A **three-nine, reversible or multi-course** home club is deliberately **not** auto-applied — it would pop the "which nine?" picker every single round. Those get a one-tap chip above the search instead: **"🏠 Play my home course — <name>"**
- Order of precedence: a tournament or live-round prefill beats a restored setup draft, which beats your home course, which beats an empty picker

*Guests can set a home course too — it saves on that phone. Signing in is only what syncs it across devices.*

### Account Card

**Edit profile · Sign out · Delete account.** This is the reliable way into the profile editor — a brand-new user with no rounds used to have no route to change their own name.

**Delete account works properly now.** It used to leave your friendships and game invites behind, never anonymised the rounds you'd shared with other players, and could half-finish — your sign-in gone but your profile left over, or the other way round. It now completes or it doesn't: **a failure leaves the account fully intact and you can just run it again.**

### Crew Card — Message Board & Highlights

A single card near the top of Home holds your crew's social feed.

**💬 Crew message board · friends only**
- Post a message straight from the box in the card; posts and replies from your friends appear below it
- The header literally reads **"💬 Crew message board · friends only"** — it is **not** a public wall
- **Messages arrive in real time.** The old ↻ refresh button on the board is gone because it did nothing
- The board shows **3** top-level messages before collapsing, and replies collapse at 3 per thread with a **"Show N more replies"** toggle
- **Edit** and **Delete** appear on messages and replies you posted — editing happens inline with Save/Cancel (Enter saves) and leaves an **(edited)** tag. Admins can edit or delete anything
- Threads auto-delete **30 days after their last activity**, so an active conversation survives. Deleting a message that has replies removes the whole thread, after a confirmation naming the reply count
- **A comment or a fist-bump that doesn't reach the server now says so.** Both used to report success and then quietly disappear — and a failed fist-bump used to add a *second* bump instead of toggling the first one off

**Crew highlights** (below the board)
- Aces, eagles, birdies, and hero moments from the last 24 hours
- Shows **player name**, **hole**, **course**, and **photo** (if available)
- **Fist-bump** — tap the highlight for a quick 👊 reaction
- **Comment** — tap the comment icon and type up to 280 characters
- Previews **7** items, with **"Show more (N)"** / **"Show fewer"** to expand up to 40

> **Everything on Home is friends-only.** The old Friends only / Everyone scope dropdown was removed — crew highlights and the message board are permanently limited to you and your accepted friends.

### Watching Friends Play — "Live now" (Crew Tab)

**Live now moved off Home.** The card that used to list in-progress rounds on the Home tab was removed to slim the screen down. **The Crew tab still has its own "Live now" list, with Spectate buttons on each row** — that's where you go to watch a friend play.

- Rounds currently in progress by you and your accepted friends, refreshing in real time
- **Player names**, **course**, and **status** (holes scored so far)
- Tap a row to **spectate** — watch their GPS live and see scores update
- Live rows carry a **red** border and tint so an in-progress round can't be confused with a finished one
- A round you deleted disappears immediately, and a finished round can no longer masquerade as LIVE
- A past event with a group that launched but never finished no longer shows a pulsing **"live"** pill

**Crew round-start alerts:** when a friend starts a round with **"Alert friends"** on, you get an **in-app pop-up** and a **push notification** ("*Name* started a round at *Course, City*").

### "Your rounds" Card

One list for everything you're in — live invites, scheduled rounds, open rounds you joined, tournament group rounds, and your full completed-round history.

**Row layout:** title and subtitle on the left, a status chip, and one small action button on the right.

- **Status chips:** **"LIVE"** (red), **"SCHEDULED"**, **"✓ COMPLETE"**, **"PAST"**
- **Action button:** **"View"**, **"Resume"**, or **"Join now"** — and **Join now on your own live round works**, taking you straight to the scorecard and opening GPS
- **"View" on a completed round opens the 💵 Games sheet directly.** The separate 💵 icon button that used to sit beside View is gone from Home, Rounds and Crew — one button does the job. *(A manually logged round has no game record, so View on those still opens Stats.)*
- **home / away** marker before the course name
- **🏆 trophy** next to the course name if the round was part of a **tournament**
- **👥 partner scores** on completed rounds — a second line reading e.g. `👥 Mike 79 · Kevin 82 · Paul 88`, best score first, capped at 5 names with **"+N more"**
- Extra actions sit in a compact wrapped row underneath: **"Edit details"** / **"Edit settings"** on scheduled rounds, and **"Leave round"** on a round you didn't create

> **The "🗂 Scorecard" and "📍 GPS preview" shortcuts were removed from these Home rows** — from scheduled rows and live tournament rows alike. A scheduled row now carries only Edit/View details, Edit/View settings and Leave round; a live tournament row carries only its primary action and Leave round. **Both features still exist** — the scorecard preview and the GPS course preview are still reachable from the **Rounds tab**, from the **course detail** screen, and from inside a live round. Only the Home shortcuts went away.

**Loading:** only the 10 newest completed rounds draw at first. **"Show all N rounds"** builds the rest; **"Show fewer"** drops back to 10.

### 💵 The Games Sheet

Tap **View** on any completed round (on Home, **Rounds**, **Crew** or the Tourney tab) to open a full units breakdown for that round. No data loads until you open it.

**What's inside, top to bottom:**
- A header line — **course · date · group**, with the home / away badge
- **Group games** — every units game with each player's green (up) or red (down) amount. Games where everyone is at 0 units are hidden; a round with no units games says so and shows **"All square"**
- **Final standings — this group** — the exact who-trails-who lines
- **The full scorecard** — with birdie/eagle circles, strokes-given dots, skin circles, and **gross and net on every nine**. **Blue** = your group's own skins; **gold** = a tournament-wide field skin; a hole that wins both gets a combined blue+gold ring
- **🏆 <Event name>** *(tournament rounds only — the whole block is left out on a casual round)* — Team Quota standings, **Final standings — whole event**, **Tourney games — who won what**, **Other groups' games — who won what** (one row per prize pool, each tagged `— Group N`, your own group left out), the whole-field scorecard, and **📊 Tournament Results**
- **📋 Every game — who won what** and **📲 Text Final Standings**
- **🔓 Reopen round** on a finished round

> **Why the event block matters.** The sheet's final standings used to be group-only. On an event where all the units sat in event prize pools, it could cheerfully say *"All square — nobody owes anybody. 🍻"* while real units were owed across the field. Now the group block is labelled **Final standings — this group** and the event block sits right under it, so the two read as group-then-event. While other groups are still playing, the whole-event final standings carries a **"Provisional — N of M groups finished"** note.

### Find a Course

- The **Find a Course** card sits near the bottom of Home, directly above the Account card
- **Can't find your course?** Tap the request button, type the name and city, and send it — admins add it (usually within 24h). The request sheet lifts above the on-screen keyboard, scrolls, and won't throw away a half-typed request if you tap the background

*The "Live Holes Across America" live-camera section has been removed from Home.*

### ✍️ Share Feedback

A **"✍️ Share feedback"** button on Home opens a form for course problems, bugs and ideas. You can attach screenshots (**📎 Add screenshots**) and tap **Send feedback**; it lands in the admin Feedback inbox.

The form behaves itself: it shrinks and scrolls so **Send** is always reachable above the keyboard, a backdrop tap **keeps your draft** (with a toast saying so), **Cancel** asks before discarding, and only a successful send clears it.

### Beta Invite

The Home **Beta Invite**, round/game invites and tournament invites all carry both store links, because the sender can't know what phone the recipient has:

> 📱 Get the free app first (best experience): iPhone: *<App Store>* / Android: *<Google Play>*

**Group invites no longer carry a web link.** The two invites you send to a whole group changed:

- **A tournament invite** now reads *"Get the free app, sign in, then open Events and tap your name to join"*, plus the two store links. No URL to tap.
- **A casual round invite** now carries the **round code in plain text**, plus the two store links. The recipient types the code in rather than following a link.

*Still link-based, because there is no in-app path to them:* the **personal tournament slot claim** and the **guest-account claim** invites both still send their own token links.

---

## Play / Setup Tab

The Play / Setup tab is where you create and configure a new round.

### Starting a Round

**"New round" button** (top of Play tab) launches the setup flow.

**Step 1: Choose a course**
- **"Search by course name or state…"** input field
- Browse nearby courses (auto-populated by your location) or type to search — search is fast and results can't land out of order
- Results are **sorted alphabetically within each state**, so every multi-course club pairs up automatically (Winged Foot East/West, Oak Hill East/West, and so on)
- **If you've set a home course, it's already picked** — *"🏠 Defaulted to your home course — X. Search above to play somewhere else."* A three-nine or multi-course home club offers a one-tap chip instead: **"🏠 Play my home course — <name>"**
- Tap a course card to select it
- **"View details"** shows par, rating/slope, GPS coverage status

**Course status indicators:**
- 🟢 **complete** — full par + rating + GPS mapped
- 🟣 **mapped (needs targets)** — GPS tees & greens mapped, needs fairway centers
- 🟠 **partial** — some holes mapped, needs more GPS data
- ⚪ **no GPS** — in the library but no GPS yet
- 🔴 **possible duplicate** — admin flagged

**Multi-course and multi-nine facilities.** A club with several full 18s shows as **one search result with a picker** — searching "Bethpage" returns **Bethpage State Park** and tapping it offers **Black / Red / Blue / Green / Yellow**, each playing as its own full 18 with its own rating, card and stats. A 27- or 36-hole club offers its real **combinations** (e.g. Woodlands Palmer: King/General, General/Deacon, Deacon/King), each officially rated, rather than one generic 18.

**Can't find your course?** Tap **"Can't find a course?"**, enter the course name and city, and tap **"Send request"** — admins will add it (usually within 24h).

**Step 2: Select your tees**
- Each course may have multiple tee boxes (Championship, Blue, White, Red, etc.)
- **The picker shows the numbers.** The course card lists each tee with a colour dot plus rating/slope and yardage instead of just a colour name, and every dropdown option reads like `Blue · 6,808 yds`. Women-only tees show **(W)**; missing values show **—** (about 96% of tees have rating and slope, 89% have yardage)
- **Course Handicap** auto-fills based on your Handicap Index × the tee's slope/rating formula
- You can override the handicap if playing a different set
- **On a course with per-tee par data, your tee's own par and stroke index are what you're scored against** — see [Per-Tee Par](#per-tee-par-and-stroke-index)
- **"Edit tees"** button (admin only) — add/update tee ratings and slopes

**Every player picks their own tee.** The setup screen carries a tee box **per player**, not one tee for the group — so the two guys on the blues, the one on the whites and the one on the reds are each scored against their own tee's rating, slope, par and stroke index, and each see their own tee's yardage on the GPS. Set them in the player rows during setup; in a tournament they're set in the event's **Tees** step instead, not on this form.

**Step 3: Add players**
- **"👥 Select a Player"** — one full-width button opens the roster picker
- The picker pins your **5 most recently used players at the top** and sorts everyone else strictly **A–Z**. There's a **Done** button at the *top* of the picker as well as the bottom, so you don't have to scroll a long roster
- A newly picked player's row **stays expanded** so you can set their handicap right away
- A **"TEMP"** pill appears beside any handicap that isn't a real established index
- Manually enter a new player with first name, last name, and optional handicap (32-character limit on names)
- Tap **"📤 Invite — share join link"** to send an invite to that player
- Reorder players by dragging the **⋮** handle
- **Remove player** — tap the **×** button on their row (see the confirmation rule below)

**A round can have up to 8 players** (it used to cap at 5). Two things to know:
- **High & Low needs an even number**, so it blocks at 7 (6 and 8 are fine)
- **Vegas, Dynamic Vegas, 6's, Ryder Cup, 2-man Scramble and Umbrella still require exactly 4**

**Team games balance themselves as you add players.** Every team-game picker — Vegas (fixed or switch-at-the-turn), Team Match, Team Low Ball, Team Quota, Ryder Cup, Scramble, High & Low, Umbrella — puts each new player on **whichever side is currently smaller**. A normal foursome now reads **"Balanced 2v2"** straight away. It used to assign by row position, so adding players one at a time produced **"Unbalanced: 1 vs 3 — tap a player to swap teams"** and blocked the round until you fixed it by hand. Any team you set yourself is never overwritten. *The team chips are also full-size tap targets now (44px) instead of the old 29px sliver.*

**Removing a player is an explicit, confirmed action.** A player is only dropped if you tap **×** on their row and confirm a dialog that names them and spells out the cost:

> Their scorecard — 14 holes already scored — will be deleted, along with their putts, GIRs, fairways, sand saves and any game they are in. This cannot be undone.

Previously, simply saving settings on a 6+ player round could silently delete a player and their scores. Removing someone and re-adding them in the same session is a true no-op.

**Step 4: Choose format & games**

_See [Games](#games-35) for complete rules and options._

**Main games (choose one or more — exact in-app labels):**
- **🎯 Skins** *(free)* — low score wins the hole; ties carry or split; its own handicap allowance slider
- **⛳ Nassau (with Huckle)** *(free)* — front 9 / back 9 / overall; 2–5 players per Nassau; Huckle press
- **💰 Stroke play prize pool** *(free)* — lowest total takes the prize pool
- **🤝 Match play (1v1)** *(free)* — head-to-head by holes won (add multiple matches)
- **🏦 Banker** — rotating or per-hole-picked banker plays everyone 1-on-1 each hole
- **🎰 Vegas (4 players, 2v2)** — paired-digit scoring, birdie flips, capped tie escalation
- **🔀 Dynamic Vegas (4 players)** — Vegas with partnerships shifting each hole
- **6️⃣ 6's / Round Robin (4 players)** — best-ball, partnerships rotate by segment
- **🔢 Splix 6's / Split Sixes (3 players)** — 6 pts/hole (4-2-0), entry or per-point
- **🌙 Niners (5-3-1)** — 3 players, 9 points a hole, optional **Blitz**
- **📊 Stableford** — points-based (Dbl Eagle 5, Eagle 4, Birdie 3, Par 2, Bogey 1)
- **🎯 Bingo Bango Bongo** — 3 pts/hole (first on green, closest, first out)
- **🐺 Captain (Wolf)** — Wolf rotates; pick partner, Lone Wolf (2x), or Blind Lone Wolf (3x)
- **🔨 Hammer** — match play with a doubling cube; Team (2v2) or Individual
- **⚖️ High & Low (2v2)** — a point for the better low ball, a point for the better high ball
- **👥 Team match play** — any even teams, best-ball per hole
- **🎯 Team low ball** — even teams, sum of best-ball over 18
- **➕ Combo Score** — 2-man or 4-man aggregate: **both partners' net scores are added together every hole**, and nothing is dropped. Unlike best ball, a partner's bad hole counts. Requires exactly 4 players.
- **🎯 Quota (Points)** — Albatross 8/Eagle 6/Birdie 4/Par 2/Bogey 1 vs. your quota
- **🎯 Team Quota** — even teams, sum of (points − quota); entry prize pool
- **🏆 Ryder Cup (2v2, 3 segments)** — Best Ball / Scramble / Alternate Shot (your order)
- **🏌️ Scramble (2v2)** — both hit, pick best, repeat
- **☂️ Umbrella (4 players, 2v2)** — 5 points a hole, each worth the hole number
- **🪙 Pot of Gold** — a prize pool on every hole, weighted by difficulty
- **🎯 Closest to the Pin** — per-hole awards, or pool mode for one prize pool
- **🐾 Animals** — penalty animals pass around; only the last holder pays
- **⭐ Marks** — most highlight-reel plays wins, not lowest score
- **🥔 Hot Potato** — one token that doubles every time it changes hands (capped)
- **Low Net Pool** — everyone pays the entry, lowest net over 18 takes the prize pool; its own handicap allowance slider
- **GIR Pool** — everyone pays the entry, most greens in regulation takes the prize pool
- **Fewest Putts Pool** — everyone pays the entry, fewest total putts takes the prize pool

> **⚠️ Eleven of these are unavailable inside a tournament.** **Banker, Dynamic Vegas, Splix 6's, Bingo Bango Bongo, Wolf, Hammer, Umbrella, Pot of Gold, Animals, Marks and Hot Potato** can't be set as a tournament day game *or* as a foursome's own group game inside an event. (Animals, Marks and Hot Potato used to leak through into group games because their tiles sit in the Side Games section, so a group could switch on a game the director could never offer.) **Normal rounds are unaffected — all eleven still work there.** Junk, Snake, Greenie, Long Putt and Birdie Bump are untouched.

**Side games (enable/disable independently):**
- **⛳ Par 3 Greenie (with Hero Tax)** — closest to pin on par 3s; optional "3-putts still win" mode
- **📏 Long Putt** — everyone pays the entry; longest putt of the round takes the prize pool
- **💥 Long Drive** — everyone pays the entry; longest drive on the designated hole takes the prize pool
- **🐦 Birdie Bump** — awards for birdie / eagle / hole-in-one
- **Junk** — 🟢 GIR, 🏖️ Sandy, 🍫 Rolo, 🌳 Barkie, 📏 Polie, 🐍 Snake, ⛳ Arnie, 🎯 Chip-In (per-game toggle & amount)

**Player pickers.** Most games let you choose exactly who's in, with a chip per player plus **"Select all"** / **"Clear all"** (minimum 2) — Nassau has one too. The three pools, **Long Putt**, and **Long Drive** **pre-select everyone** the first time you switch them on. **Players added mid-round appear in every game's picker**, and the pools auto-include them unless you explicitly take them out.

**Game amounts** are capped at **10,000 units** per field and open a numeric keypad. Fractional steps (Dynamic Vegas at 0.05 units) and 0 units friendly games still work.

**Hydration games (💧 sip trackers — no units):** In the drink, Bunker, OB/lost ball, Whiff, Worm burner, Chunk & skull, Three-putt, Loser drinks, Par or drink, Honors pours, Snake, Wolf, Tee box toast, The Turn, 19th hole tally — plus a "Sips-of-water mode" to keep it dry.

**Step 5: Configure scoring rules**

**Handicap application:** **Gross** · **Net** · **Gross & Net**.

**Round Tracking** — a settings-style list with a switch on each row:

| Toggle | What it adds |
|--------|--------------|
| **Putts** | A counter under each score. With GIRs also on, GIR computes automatically (score − putts ≤ par − 2). |
| **GIRs** | Greens in regulation. With putts off, tap the GIR chip on each score row. Fills the GIR junk game automatically. |
| **Fairways** | A hit/miss tap on par 4s and 5s (par 3s have no fairway). |
| **Penalties** | A **+pen** tap beside the fairway chip. Auto-fills the **Rolo** side game. |
| **Sand saves** | A **🏖️ sand** tap on every hole. Par or better from the sand auto-fills **Sandy**. |

**Game visibility (who sees what):** **Everyone** · **Friends only** · **Just me**. *(When two accounts share a name, the app keeps the more restrictive of the two settings, so a "just me" player can never be exposed by a same-named stranger's choice. A change that doesn't reach the server now says so rather than confirming a privacy setting that never saved.)*

**Other settings:** **Drive distance estimate** · **Round pop-ups** · **Alert friends**.

**Step 6: Schedule or start**

- **"▶ Start round now"** — begins play immediately. Double-tapping can no longer create two rounds on the same code
- **"Save for later"** — saves the setup; all settings stay editable until you start

### Your Setup Is Saved While You Poke Around

Backing out of round setup doesn't wipe what you picked.

- Reopen a fresh setup **within 30 minutes** and the course, players, games and options come back — with the toast **"↩️ Picked up your round setup."**
- Drafts older than 30 minutes are thrown away so you always start clean.
- The draft is cleared the moment you actually **create** something — starting a round, saving a scheduled round, or saving a template.
- **Your game selections are deliberately not part of the draft.** A brand-new round always starts with nothing ticked, even if you played Skins + Nassau + Junk yesterday. The per-game *values* are remembered, so ticking Skins again recalls your stake.

**Invite players (any time during setup or scoring)**

- **"📤 Invite players — share the join link"** creates a shareable URL
- Already-added players show their status (Joined / Not yet joined)
- Invites of every type **expire after 14 days**, and finishing or deleting a round retires its invites for everyone at once — no more Join buttons that lead nowhere

**Templates**

- Save any round setup as a reusable template: in the schedule flow tick **"⭐ Save as reusable template"**
- Templates keep your format, games, and default course; **"Use"** spins up a fresh copy
- **Round templates are private to you.** They used to be a shared list where everyone saw everyone else's; they're now filtered to their creator, and deleting one can't remove someone else's. *(Very old untagged templates whose owner can't be determined stay visible to all.)*
- The templates card on the **Rounds** tab no longer sits on **"Loading…"** forever on a slow connection — it resolves immediately, and when you're signed out it reads **"Sign in to save and use round templates."** Its description line reads **"course, players, games & side games"**

> **Tournament templates have been removed.** The Tourney tab's template card, **"Save as template"** and **"Use template"** are gone. **Round templates, described above, are a different feature and are untouched.**

---

## Score Tab

The Score tab is live during a round — enter scores hole-by-hole and track side games.

### Scorecard Entry

**Layout:**
- **Hole number** (1–18) with par in parentheses, e.g. "Hole 1 (Par 4)"
- **Player rows** — one per player with score entry field
- **Handicap strokes** shown as small dots under player name (if net game)
- Tap the score field to open the **score entry stepper** (±1 buttons or type directly)

**Scoring rules:**
- Scores range 0–15
- **GIR chip** — if GIR tracking is on and putts off, tap to toggle. On an unplayed hole it reads **"GIR —"**
- **Fairway chip** — HIT/MISS for par 4s and 5s
- **+pen tap** — beside the fairway chip when penalties tracking is on
- **🏖️ tap** — sand saves, available on every hole
- **Putts counter** — under the score (tap to edit)

### Starting Somewhere Other Than Hole 1

**"Start on the Back 9 (holes 10–18 first)"** is set in round setup, and it now sticks when you save it from the live round-edit screen too — it used to silently fail to apply from there.

> **⚠️ If your group starts on the back nine, update the app.** Match Play could declare the match over and settle early on any round that didn't start at hole 1 — it miscounted the holes remaining. The same fault hit cross-group 1-v-1 matchups inside a tournament. Fixed, but a phone on an older build still has it.

**The next-hole buttons are always visible.** **"Next hole → GPS"** and **"Next hole → Scorecard"** stay on screen, greyed until every player's score for the hole is in. They used to disappear entirely on a round that started on the back nine.

### Editing a Score Without Leaving the Card

**Tap any score on the scorecard** and a small **+ / −** editor opens for that player and hole, with a **"Go to hole N"** shortcut beside it. Read-only surfaces — the recap, the final-standings scorecard — are unaffected; tapping there still does nothing.

### The Last-Hole Recap Covers Every Game

The live banner under the scorecard used to show only per-hole games, so roughly a third of the app's games were invisible for all 17 holes before the last — Combo Score, Team Low Ball, Team Match, Stroke and several pools simply didn't appear. **Every game now prints a line for each hole**, and pool-style games show a running standings line.

- **Combo Score** shows the previous hole's team result, e.g. *"Hole 1 net: Tyler & Desmond 7 · Dana & Ivy 5"*
- **The finished-round summary states the result, not just the number** — each game gets a plain-English line like *"Bo & Di win by 9"* or *"Cy & Di win 6–5"* alongside its units

### Posting to GHIN

**"Post this round to GHIN"** sits on the finished-round summary. It copies the numbers GHIN needs so you can paste them in. There's no automatic posting — the USGA offers no public interface for it.

**Score-tab controls:** **End early** · **Leave round** · **Delete round** · **Edit settings** · **Invite** · **Return home**. **"End early"** becomes **"🏁 Finish round"** once every hole is scored, and is a permanent Finish shortcut on tournament rounds. *(Finish and the round's other close-out actions also appear on the Games screen — the duplicate is deliberate.)*

> **There is no "Abandon round" any more.** It was added briefly and then removed from the whole app. A finished round opened read-only carries a **"🗑️ Delete"** button instead — that removes the round **from your list only** and recalculates **your** handicap. It never appears on a live round, and it never deletes the round for anyone else.

### 🎤 Say the Scores (Voice Entry)

A **"🎤 Say the scores"** button sits at the top of the score entry. Tap it and a sheet opens:

> **🎤 Voice scores — Hole 7**
> Say a name, the score, then putts. Like: "Kevin 5 with 2 putts". Players: Kevin, Tyler, Mike…

- The box shows **"Listening… or type here"** and a live **"Heard:"** preview, so you can see what it caught before committing
- If your device has no speech recognition, the placeholder reads **"Tap the mic on your keyboard, then talk"** — the keyboard's own dictation works fine
- Buttons: **Cancel** and **Add scores**
- Nothing is written until you tap **Add scores**
- The button is hidden in view-only mode, on a finished round, and on a scramble (team scores only)

### Two Phones Scoring the Same Round

Scoring from more than one phone is safe. Before saving, the app re-reads the shared card, queues the save rather than blindly overwriting when it can't read, and re-sends any of your own entries that got wiped on another device (within about 15 seconds). Solo rounds behave exactly as before, and tapping Finish still saves immediately.

Scores you type with no signal **survive an app restart** — the record of which cells you edited is written to the phone, not just held in memory. **Opening a round can no longer overwrite your phone's scores with a staler cloud copy**: if the local card has more scores, it wins and gets pushed up.

**⏳ The amber "waiting to sync" bar.** If a round has been waiting to reach the cloud for more than **90 seconds**, a persistent amber bar appears at the top of the Score and Games panels — it says how long it's been waiting, confirms the scores are safe on your phone, and offers **Retry now**. It clears itself the moment the sync lands. Before this, the only signal was a six-pixel dot turning amber, which nobody could see on a phone in sunlight.

**Opening a tournament round with no signal** now warns you rather than silently making you the scorekeeper — two phones could both end up thinking they held the card. You can still score; you're just told.

### Per-Tee Par and Stroke Index

**Ladies' and senior tees are now scored against their own par.** On a course where the tees genuinely publish different pars, each player is scored against the par printed on **their** tee — and against that tee's own stroke index where the club publishes a separate women's index.

- The hole header shows **`4 / 5`** when the tees on the card disagree about that hole
- There's nothing to switch on. It activates automatically on courses that carry per-tee data, and a course without it behaves exactly as before
- It flows all the way through: net scoring, course handicap, Stableford, Quota, Skins (both the par-or-better gate and the natural-birdie trump), Banker, Vegas, Birdie Bump, Animals, Marks, High & Low, Umbrella, Pot of Gold, Hammer and GIR

**Three rules worth knowing:**
- **A scramble is scored against the card par** — one ball, one team score
- **Best ball uses the par of the player whose ball counted**
- **Closest to the Pin, Greenies and the Long Drive par-3 gate are deliberately NOT per-player.** They're one shared contest, so the card's par-3 list is what counts

*Per-tee data exists on a few hundred courses so far and is added by admins through the course importer — there's no in-app per-tee editor.*

### Pars & Stroke Index

- **Par column** — fixed for each hole (set during admin course setup)
- **Stroke Index (SI) row** — 1–18 handicap strokes, shown at the bottom of the scorecard

**Handicap strokes on a nine.** A 9-hole round allocates strokes over the holes you're actually playing. A 12-handicap on a nine gets **12 strokes** (2 on SI 1–3, 1 on SI 4–9) — it used to give 9. 18-hole rounds are unchanged.

### Gross and Net on Every Nine

**Every scorecard in the app** — the round scorecard, the one on the Games screen, the GPS mini card, the score edit grid, the tournament field card, the event scorecard and the shared images — shows **Out / In / Tot with the gross score large and the net score small beneath it**, under a small **`net`** sublabel in the header.

- Net is allocated **by stroke index on each nine**, not by halving your handicap, so front net + back net always equals the round net
- The tournament/event scorecard previously had **no Out/In split at all** — it has Out, In and Tot now
- **Net is left off entirely when it equals gross** — a scratch player, a "plays gross" player, or a no-handicap round renders exactly as it always did, and the `net` sublabel only appears when somebody on that card is getting a stroke
- **Scramble and Ryder Cup team rows keep the plain header** — a team row has no single handicap
- On a genuine 9-hole round the "In" column is empty by construction

### GIR / Fairways / Putts / Penalties / Sand Saves

Set these five toggles under **Round Tracking** during setup. On the scorecard:

- **Putts** — tap the number under each score to edit
- **GIRs** — tap the chip on each hole if putts is off
- **Fairways** — tap HIT or MISS on par 4s/5s
- **Penalties** — tap **+pen** each time a player takes a penalty stroke
- **Sand saves** — tap **🏖️ sand** when a player was in a bunker

All of it syncs to your Stats tab and lifetime statistics.

### Junk Games That Fill Themselves

Four junk games mark themselves off data you're already entering. **A hand-tapped chip always sticks** — a manual add or remove is never overwritten by a later resync.

| Game | Auto-fills when | Needs |
|-----|-----------------|-------|
| **🟢 GIR** | The tracked GIR is hit | GIR tracking on |
| **🏖️ Sandy** | A hole marked "in the sand" is scored par or better | Sand-save tracking on |
| **🍫 Rolo** | A penalty stroke **and** a par-or-better score are both in | **Penalties** tracking on |
| **🎯 Chip-In** | Putts for the hole are exactly **0** and the score is par or better | **Putts** tracking on |

Notes worth knowing:
- **Chip-In excludes a score of 1** — a hole-in-one is an ace, not a chip-in.
- **⛳ Arnie** requires knowing you missed the green, which only exists when putts are tracked. **If a round tracks Fairways and GIRs but not Putts, Arnie will never award** — turn Putts on if you're playing Arnie.
- Each of these only appears if the round was set up with that game ticked.

### Side Game Entry

**Per-hole rows below player scores:**

**Par 3 Greenie** (on par 3s only, if enabled):
- Tap chips for each player to mark the closest to pin
- If **Hero Tax** is on and a winner is marked, a sub-row asks "Did the greenie winner 3-putt?" — tap to mark, and the greenie chip crosses out (forfeit) with the Hero Tax penalty applied
- If the **"3-putts still win"** option is on, none of that appears — the greenie pays regardless and the header says so

**Closest to the Pin:** tap the winner's name, punch in **feet + inches**. A CTP winner logged with no distance still wins the hole — a player from another group who *does* log a measured distance beats them.

**Long Putt / Long Drive:** tap who holds the longest putt and log the distance — update it any time someone drains a longer one. Long Drive is marked by the organizer on the designated hole (there's no auto-measure).

**Junk:** a row of toggles for GIR, Sandy, Rolo, Barkie, Polie, Snake, Arnie, Chip-In. Tap player names to toggle; multiple players can score the same junk.

**Hammer:** Team (2v2) mode shows the two side-fold buttons; Individual mode shows one **"{Name} declined"** toggle per player.

**Banker:** the banker row for the hole. Every player's game box is prefilled from your **Default game per player**; the banker enters min/max range and players pick their game. In **Pick each hole** mode the banker picker appears from hole 1 (tap a player to "Take bank", listed worst-to-best, with a **Change pick** button) and the banner header reads **"Pick the banker."**

**Match play:** shows current match status (e.g. "You are 2 up").

**Animals / Marks / Hot Potato / Bingo Bango Bongo:** each has its own per-hole tap row.

**Birdie Bump:** automatic from the scorecard — no manual entry.

> **In a tournament:** your foursome's **own group games** show their per-hole entry rows too — Par 3 Greenie, Junk, CTP, Long Putt, Long Drive and Birdie Bump.

> **⚠️ Re-saving a live round's games can wipe per-hole data.** Editing and re-saving the games on a round in progress has been seen to erase already-logged Greenie winners (and the same risk applies to junk, CTP and long putt). If you edit a live round's games, re-check your per-hole winners afterwards.

### Celebrations During a Round

Birdie and eagle pop-ups now identify you by **account**, not by matching your name — so you no longer see every player in the field's celebration on your own phone. In a tournament, an identity the app can't resolve shows **nothing** rather than showing everything; a plain single-phone round still shows all of them.

In a live tournament round, **birdies, eagles, long putt, long drive and lead changes surface as toasts** on screen. They used to be posted only into tournament chat with nothing listening, so you'd only see them if the chat panel happened to be open. Only events that arrive **after** you open the round are shown, each once, and never your own.

### Editing Scores

- Tap any score to open the stepper and adjust
- Putts, GIR, fairways, penalties, and sand saves update live
- Final standings update if units games are active
- **Pop-ups open in front of the GPS map.** 37 of the app's 41 modals used to open *behind* the live-round map, which is why tapping a button mid-round looked like nothing happened

### Finishing — and Reopening — a Round

- Tap **"Save & return home"** on the round recap to finish. *(That's the only button on the recap now — the old "Back to board" is gone.)* Saving is bounded at ~6 seconds, then the modal closes and you land Home while the bookkeeping finishes in the background — it can't hang on course wifi. If a save genuinely fails, the app tells you instead of sending you home believing it worked
- **You always land on Home.** Finishing a round that had been reopened used to strand you on a disabled Score tab, and finishing from the GPS view left the full-screen map covering the app
- The button can't be double-tapped into a duplicate archive or a doubled "completed a round" push
- **Everyone else sees the award too.** When the scorer finishes, every other phone opens the same award summary rather than just getting a toast and being dropped home
- **"📤 Share results"** on the recap sends **both** images — the scorecard **and** the every-game card. It used to send only the scorecard
- **The round summary appears once.** Finishing a tournament round used to be able to pop a second identical summary a moment after you closed the first. *(If a second screen does appear after **"Save & return home"** on a tournament round, that's the **event leaderboard**, and it's meant to.)*
- **Finishing a tournament round lands you on the event leaderboard and the tournament results** — not back in the setup wizard. Commissioners were being dumped on wizard step "players", or on **"⚙️ Configure games · Step 6 of 6"**, after every single group finished. The wizard now only reopens if you explicitly tap Edit
- **"🏁 Finish round" on a round that's already closed says so** — **"That round is already closed — open it from Rounds to reopen or review it"** — and switches you to the Rounds tab. It used to do nothing whatsoever

**Reopening.** A finished round opens read-only with **"🔒 Round complete… Read-only view — tap Reopen to make edits"** and a gold **"🔓 Reopen round"** button (also on the Games sheet).

- Tap **Reopen round**, fix the score or log the missed greenie, then tap **Finish round** again — **every award recalculates automatically, and the corrected card is what reaches your stats and handicap.** (The archive is written first, while the round is still fully loaded, so a bad connection can't leave the old scores behind.)
- Only one person should edit at a time. Everyone else should back out and back in to see the corrected numbers

**Three banner states, and they now say the right thing:**

| Banner | Means |
|--------|-------|
| **🔒 Round complete** | finished, read-only |
| **✏️ Reopened for edits** | reopened; only the scorer can change scores |
| **👀 Spectating** | somebody else's round, read-only |

Tapping a score as a viewer gives the matching toast — **"Round is finished — reopen to edit"**, **"Reopened for edits — only the scorer can change scores"**, or **"Spectating — read-only. If this is YOUR round, open it from the Rounds tab."** A round you reopened days later used to say **"👀 Spectating"** on every surface, which read as though it were someone else's. Opening a reopened round from the spectate path now takes you to the units screen rather than the live map — nobody's out there walking it.

---

## Games Screen (Units & Final Standings)

**This is the tab that used to be called Board.** Same place in the bottom bar, now labelled **💵 Games**, and the whole screen was rebuilt: it no longer draws its own hand-made units list, it renders the same layout as the round Games sheet. One units surface, one set of numbers, everywhere in the app.

It still appears only when the round actually has games on it, and every old way in still works — the tab button, **View leaderboard** on the Score tab, the GPS units bubbles, the Event Leaderboard award buttons, and the spectator landing.

### What's On It, Top to Bottom

1. A **view-only / spectating banner**, if you're not the scorer
2. A one-line round header — **course · date · group** (e.g. *"🏆 Team Quota Test · Buffalo Creek Golf Club · 8/19/2026 · Group 2"*)
3. **Scope chips** — **🏆 Tournament total** / **👥 Group total** *(tournament rounds only; a casual round shows no chips)*
4. **Unit Totals — who trails who**, with **📋 Every game — who won what** and **📲 Text Final Standings**
5. **Event prize pools** *(tournament rounds under Tournament total only)*
6. **Units standings**
7. **Per-game breakdown** (its own card)
8. **Scorecard**
9. **Game results** — the per-hole detail (`H16: Marcus Reed +15.00 units`, carries, **"Show all 18 holes"**)
10. **Actions** — Back · Home · Finish round · Invite friends · Edit round settings · Edit scorecard

**Unit Totals is deliberately first.** The invite and edit buttons used to sit above the units; they're below **Game results** now.

### Group and Tournament Tabs

On a tournament round the Games sheet opens on the scope you came from — open it from your own group's results and your group's numbers come first; open it from the tournament screen and the whole field comes first.

**The screen was reshaped so it can't read as two separate awards.** It now shows, in order: the whole-event total for every player, then each group's own games *(only when a group actually ran games of its own)*, then exactly **one** final Unit Totals covering everything above it.

- **A whole-field Net column** was added to the standings table, sorted by gross — a genuine gap
- **Every tournament game is one row** in a single **"Tournament games — who won what"** table. Long Putt and Long Drive used to get their own separate boxes and Birdie Bump was missing from the table altogether
- **Three buttons were retired** because this screen now shows everything they did: the old **"Every game — who won what"** button, the separate **"Tournament Results"** button, and the leaderboard's **"Group total"** button
- **Reopen round** is limited to the scorekeeper, an assigned admin or the tournament director. It used to be offered to any spectator
- **On the event leaderboard, tapping a group tab switches the view in place**, showing that cart's units and scorecard, and the tab you picked survives the 15-second live refresh. Every tap used to stack a whole new full-screen panel on top, leaving the previous groups' panels sitting behind it

**Finishing a round gives you a ✕ at the top right and a Close at the bottom** — both do the same thing and return you wherever you came from, whether that's Home, a tournament or a league. The old "Save & finish" wording is gone.

### The Two Scopes

- **🏆 Tournament total** *(default)* — everything combined: every group's games plus every event-wide prize pool
- **👥 Group total** — just your own group's games

Your choice is remembered per round. **The chips now govern everything below them** — final standings, the prize pool lists, the scorecard and the greenie card, not just the units rows. Under **Tournament total**, the **Putts & GIR** block and the **Scorecard** show **every player in the event**, once each.

Previously the standings table and the Unit Totals card underneath could show two different answers on one screen. They're built from the same numbers now, with a header line saying what the scope covers and a note when groups are still out.

> **On a multi-day event, "Group total" now means the round you're actually looking at.** It used to re-derive "your group" as *day one's* round, so a round you weren't in on day one reported **0 units in group totals while Group games showed 40 units**.

### "Running totals — not final"

While a round is unfinished, the **Unit Totals** heading carries a **"Running totals — not final"** stamp. It disappears the moment the round is finished. Units and final standings are visible from hole 1 as always, and nothing appears or vanishes mid-round — this just fills the gap where a fully-scored-but-unfinished round gave you no signal that the numbers could still move.

### Live Leaderboard

**Columns (left-aligned, scrollable):**
- **Player name** (with crew photo if available — rows fall back to the account profile photo when the roster entry has none)
- **Score vs. par** (±0 notation)
- **Units** — green chip = up, red = down, gray = even
- A thin sub-row under each player shows live running tracking totals, e.g. `⛳ 24 putts · 🟢 GIR 4/9`

**Sorting:** tap column headers to sort by name, score, or units. Default is units, highest win first.

### Scorecard Circles

- **Blue circle** — your group's own skin
- **Gold circle** — a tournament-wide **field skin**
- **Blue + gold ring** — a hole that won both
- On the **Tournament Results** full scorecard only, birdies circle **blue** and eagles-or-better get a blue **double** circle

### Games & Units Chips

**Per-game breakdown table:**
- **Games that actually paid units sort to the front** of the horizontally-scrolling table; configured-but-empty prize pools move to the end. Nothing is dropped — *"the table is missing games we played"* was almost always games scrolled off to the right
- Each group side game gets **its own named column** (Nassau, Birdie Bump, Stroke play…). The old catch-all **"Group games"** column only appears if there's group units that can't be attributed to a named game — so if you see it, it means something
- **"Skins won"** shows your **net** (unit totals minus entry) with the skin count in parentheses, e.g. `+13.33 units (2)`
- **A prize pool that's configured but hasn't paid anyone yet shows as 0.00 units** instead of disappearing
- **Prize Pools that can't settle until everyone finishes say so.** Skins, Closest to the Pin, Long Putt and tournament Nassau show a **still live** sub-label under the header and **not settled** in the cells, instead of a bare `—` that looked identical to "nobody won it"
- **0 units friendly games still show who won** — a green **W**, red **L**, or **AS** in each player's cell

**Junk games:** a collapsed section — tap to expand and see every greenie, sandie, Rolo, etc. with amount and winner.

**Settled vs. unsettled:** during the round, **provisional** units (marked in yellow); after the round, final settled amounts.

### 📋 Every Game — Who Won What

On the final standings card, **"📋 Every game — who won what"** opens a read-only, document-style page listing every prize pool, every winner and every payment on one screen with no horizontal scrolling. A line underneath reads *"This is exactly what goes out with the texted final standings."*

**It respects the scope chip.** Opened under **🏆 Tournament total** it shows the event prize pools plus every group's side games. Opened under **👥 Group total** it shows **this group only**, titled `👥 <course> — Group N — this group's games` with the subtitle *"This group only · switch to 🏆 Tournament total for the whole event."* It used to always show the whole event no matter which chip was lit.

*The round Games sheet opened from the Rounds list is deliberately pinned to the full view — it always shows group games and then tournament games.*

**"🖼️ Share this as an image"** hands the same page to your phone's share sheet as a PNG.

**The images are zoomable.** Tap the games card or the scorecard image and it opens full-screen with explicit **−**, **+** and **Fit** buttons, a scrollable pane, double-tap to toggle and **Esc** to close. Two-finger pinch works where the platform allows it — but the app ships with page zoom disabled, so **the buttons are the zoom**.

### Reading an Award Screen: PRIZE POOL / WINNER / WINS

Every award screen lists **one row per prize pool**:

| Column | What it means |
|--------|---------------|
| **PRIZE POOL** | the game |
| **WINNER** | who took it |
| **WINS** | **what the winner collects from that prize pool** — *not* the prize pool size |

Under each row is a grey **detail line** with the specifics — a CTP distance, the skin count, the winning net, the prize pool size. For Skins, WINS shows the per-skin value (e.g. `4.44 units`) with `9 skins · prize pool 40 units` and the winning holes underneath.

Detail lines are written for all 35 games. Examples:

- **Nassau** — `front: … · back: Tie — carries · overall: …`
- **Banker / Wolf / Vegas / Hammer / BBB / Pot of Gold** — `Tyler 2 holes · Steve 1 hole`
- **Best Ball** — `Tyler & Steve 71 – 74 Kevin & Chris`
- **Hot Potato** — `ends with Chris · 16 units · doubled ×3`
- **Junk** — `birdie ×2, sandie ×1`
- **Greenies** — `holes #4, #12`

*On the less common games the detail line is best-effort — if the app can't summarise a game confidently it prints nothing rather than risk a wrong line. The PRIZE POOL / WINNER / WINS row is always correct.*

**On mobile, each prize pool is now its own block** — prize pool name and amount on the top line, winner full-width beneath. Five prize pools fit in roughly the space one used to take. Team standings rows are two stacked lines per team for the same reason: a paired team name like *"Corey Whitfield & Ines Marchetti"* used to break mid-word and render fourteen lines tall.

### Detailed Final Standings

**After round completion**, the round summary is a full-page mobile screen that scrolls as one — buttons included. There's a single **"Final award"** board plus the per-game breakdown table.

- **All units games** count toward the group figure rolled into the total — Wolf, Vegas, Hammer, Stableford, Umbrella, Pot of Gold and the rest no longer drop out
- A **day game that settles inside each group** (Stroke is the common case) is recovered automatically, so it can't appear in the breakdown table but vanish from the prize pool tables and the shared image

### Texting the Final Standings — One Button

There is now **one** share button, with **one** label, in all three places it appears — the Games screen's final standings card, the round-complete summary, and the round Games sheet:

> **📲 Text Final Standings**

**It always attaches the images** — the scorecard image and the games card — on every game type. (The Games sheet's version used to send bare text with no images and, on a tournament, none of the event units.)

**The message body is deliberately short:** a title line, the **⚠️ PROVISIONAL** banner when it applies, the **Final standings:** who-trails-who lines, and the **payment links**. The old `Standings:` list and per-game `Breakdown:` text were dropped from the message — that detail is on the attached image, and long texts were being split in ways that broke a URL in half.

**Retired labels** — if you see these in an old screenshot or an old support note, they no longer exist: `📲 Text Final Standings — with images`, `📲 Text everyone — with images`, `📤 Text this breakdown`, `💬 Text the numbers — auto-fill my crew`, and `📣 Brag to crew`. *(System-generated brag posts to the crew feed are a separate feature and still happen.)*

**Other final standings behaviour:**
- **Payment links are tappable.** Each pay line starts at the left margin with the URL last, and carries **one** link — the payee's preferred method only
- **The Mark paid checkbox was removed.** Rounds still carrying that old flag simply don't display it any more
- **Sending before everyone has finished warns you first** — the app confirms, naming the count ("1 of 2 groups have finished… send anyway?"), and the message carries a **⚠️ PROVISIONAL** banner
- On a tournament round the text **always sends the combined event total**, no matter which scope is on screen
- Final standings scales to any group size — the old 100-transfer ceiling that silently left debts unassigned is gone, and anything still outstanding is called out on screen

### Squaring Up

**No units ever move through Bad Golf.** The app works out who trails who and prints the arithmetic — it never takes, holds, tracks or forwards a payment of any kind. Square up between yourselves however you already do.

- The **Unit Totals** card gives you the exact who-trails-who lines
- **📲 Text Final Standings** sends those lines, with the scorecard image and the every-game card attached, so everybody has the same numbers
- A line reads like **"You trail Mike by 12.50 units"** — what you do about it is between you and Mike

*The one-tap payment buttons that used to sit on each line, and the "Payment handles" setting that fed them, have both been removed from the app.*

*The three-line store footer that used to be appended to every settle-up text — "Scored & settled free with the Bad Golf app ⛳" and the two store links — is gone. A settle-up message is now just the numbers.*

---

## GPS Rangefinder

The GPS is the marquee feature — satellite view of every hole with live distances and course overlay.

### Launching GPS

**From Score tab:**
- **"Score" button** (blue pill below the scorecard) — opens the full GPS view of the hole
- **"Track Shot" pill** — manually log a drive distance

**Spectate mode:** from the Crew tab's **Live now** list, tap any live round to open GPS read-only, following that player.

**It works offline on iPhone.** The map library is bundled on the device, so a course with no signal still draws the map.

*Two cosmetic changes to the GPS screen worth recognising in a screenshot: the club name in the caddie pill is now **yellow in both light and dark mode** (it used to be dark navy on black, and unreadable at night), and the bottom row — HOLE / Score / PAR, the **Track Shot** button, the units chips and the Est. Drive / Long Putt stack — sits slightly higher, opening a gap above the gear / clubs / hazard / satellite chips. Nothing moved tabs and nothing was renamed.*

### Distances to Green

**Main readout (center-top):** **FRONT** / **MID** / **BACK** in yards, updating as you move the map pin. Hole number and par flank the Score button; the **Strokes field** sits upper-right.

The map **auto-fits the whole hole** — the green is always in frame, sized to the real yardage bar and score button, and it adapts to any device or notch.

### The Right-Hand Bubble Stack

Small heads-up bubbles ride down the right side of the GPS screen. Tap one to jump straight to logging that game. The units and tracking stacks don't overlap, and long text truncates instead of spilling.

- **🪙 Pot of Gold** — this hole's prize pool, with a sub-line reading **"SI n"** or **"+X units carried"**. Computed live: base × (19 − stroke index) + carry, so the prize pool escalates by hole *difficulty*
- **📏 Long Putt** — jumps you to logging the longest putt
- **💥 Long Drive** — the tournament's longest drive
- **LEADER / net +X** — the **Low Net Pool** leader only. It ranks pool players by running net-to-par using the pool's own handicap allowance, and its tooltip reads *"Low Net Pool — current net leader."*
- **🏹 Team Quota** — in a tournament this reads the **whole field**, not just your cart. It names the leading team and the gap to second — e.g. **`SHANK +3 · 8 teams`** — with **long-press** listing every team, and **tapping it opens the Event Leaderboard scrolled to the Team Quota block** (closing returns you where you were). Dead level reads **TIED**. Outside a tournament it falls back to your round's own teams. *If the tournament can't be read, the bubble stays put and says the standings couldn't load rather than silently rerouting you.*
- **Match play status chips** — e.g. **"vs SJ 3 UP"**, including day-level, group-level and cross-group matches inside a tournament. Status only — no units on these chips
- **NET bubble** and game chips — tap either to jump to the Games screen

The board bubble recognises you on every device — it's resolved from your account rather than a name saved on that phone. **Back from a units bubble returns you to the same hole of the map.**

### The On-Course Scoreboard

Tapping the scorecard overlay in a tournament shows **the whole field**, not just your own cart.

### Plays-Like vs. Plays-As *(PRO)*

**"Plays-Like" mode** shows **your custom club distances** (from My Clubs) and recommends a club from distance to flag plus wind and temperature. **"Plays-As" mode** (default) shows amateur yardage averages. Toggle between them with the **Mode** button on the GPS overlay.

### Target Drag & Layup

- Drag the **target marker** (yellow flag) anywhere on the map; distance updates in real time
- **The map re-frames as you drag** so your ball and the target both stay on screen (zoom is capped)
- Tap a distance pill to snap to front, middle, or back of green

### Fairway Center

The **fairway target** (light green dot, if mapped) shows the ideal landing area for par 4s and 5s — the aim point an admin set as the wizard's "target" tap. The rangefinder uses it to suggest the layup yardage. Par 3s don't display one.

### Wind & Temperature *(PRO)*

**Wind panel** (left side): direction dial (where the wind is blowing **to**), speed & colour (0–5 green, 5–15 yellow, 15+ red), and light streaks drifting across the map. **Temperature panel** shows current temp and a "feels like" carry adjustment. Toggle with the **⊙** and **🌡** icons.

### Hole Map

Full-colour aerial photo of the hole with tee marker, green outline, fairway and visible hazards. **Pinch to zoom works everywhere in the app** — it used to be disabled app-wide, which was miserable on 9–11px outdoor text.

**Find an address:** the search sheet lifts above the phone keyboard instead of hiding behind it, the keyboard closes after a successful search so you can see the dropped pin, and **touching the map dismisses the keyboard**.

**Minimize the options panel (phone):** tap **▾** to collapse the panel and see the whole map; **"⤢ Show options"** brings it back.

### Closing a GPS Panel

**Escape, or Android's back button, now closes the panel you're looking at** — Plays, Scorecard, Weather, Find, Shot or Wind — instead of closing the entire map out from under you and losing your place. The hole-mapping wizard is the one exception, because it has no natural "leave this panel" state.

### Course Preview

Previewing a course always shows each hole **from the mapped tee**, even if you're standing on the property. Live rounds, spectate and mapping are unchanged. Preview also doesn't raise an iPhone lock-screen Live Activity as if a round had started.

### Spectate / Watch Another Player

From the **Crew** tab → **"👀 Live now"**, tap any player's row. GPS opens in **spectator mode** (read-only), showing their live location if they've shared it, with scores and shots updating in real time. A dropdown at the top — **"Spectating: [Player Name]"** — switches between players in the same round.

**Spectating somebody else's group no longer costs you your own round.** The app remembers your round, your hole and your tab, and the **✕** puts you back there. Before, opening **Awards → Group award** forced your own live round into spectator mode and the ✕ discarded it outright — you could lose your round by looking at your own award.

### Drive Distance Estimate *(PRO)*

**Automatic (if the toggle is on in setup):** GPS logs your location at address and compares to the ball location after the shot.

**Two accuracy fixes worth knowing:**
- The start point can no longer be set more than 15 yards **behind** the mapped tee, and it falls back to the mapped tee if a bad fix slips through. A 168-yard approach used to read **365 y** on a 462-yard par 4
- The app doesn't lock a reading while you're still rolling up to the tee — the start point follows you inside the tee area, and only a genuinely parked position locks a drive. It used to show a ~84-yard drive before you'd hit
- The reading is scaled to **your own tee's** yardage rather than the tips, so a player on the blues sees ~260 y instead of 294 y

**Manual (Track Shot button):** tap **"Track Shot"** below the Score button, confirm the estimate or type a custom yardage, then **"📤 Share it"** to post the drive to your crew.

### Shot Tracking & My Shots Log *(PRO)*

Tracked shots are saved in **Stats tab → My Shots** — a searchable log with date, course, hole, distance, wind, temp and club. Tap **×** to delete any shot.

### Club Suggester & My Clubs / Bag *(PRO)*

**"🏌️ My clubs"** (Stats tab): one input per club with a **distance range** in yards, renameable labels, drag-to-reorder, blanks to skip clubs you don't carry, and a **"Reset to standard bag"** button. On GPS, the club recommendation appears on the Plays-Like sheet and updates as you drag the target; **"Pick from My Clubs"** overrides the auto-pick.

*Opening My clubs from Home and pressing Back (or Save) returns you to Home — it used to dump you wherever you last switched tabs, sometimes a round's units screen.*

**The yardage boxes take whole numbers only, up to three digits.** A fourth digit, a decimal point, a minus sign and letters are all refused — including on paste and autofill — and the numeric keypad still comes up on iPhone and Android. The boxes used to swallow `1234`, `12.5`, `-45` and `1e4` and then quietly poison every club recommendation built from them.

#### 📏 Measured Distances — What You Actually Hit

Under each club's entered range, My clubs shows what your **tracked shots** say you really hit that club:

```
7 Iron      150–160
📏 measured 253–265 · 11 shots
```

- **You need 5 tracked shots with a club** before numbers appear. Below that the line reads **`📏 3 shots — need 5`**. A club with no tracked shots shows nothing at all, and its row looks exactly as it always did.
- **The range is the median and the 25th–75th percentile**, not the average and not min-to-max. One shank, or one bad GPS read, can't blow the range out.
- **The line is tinted in the accent colour** when the midpoint you typed and the measured median are more than 10% apart. That's the whole signal — no badge, no toast, no nagging.
- **It is display-only.** There's no "update to this" button, nothing is written back to your entered range, and **your GPS club recommendations are unchanged by it.** It tells you; you decide.

#### 🏷️ Brand, Model and Type

One toggle above the club list — **"🏷️ Add brand / model / type"** — reveals three optional fields on every club row: **Brand**, **Model**, and **Type** (a picker: Driver · Wood · Hybrid · Iron · Wedge · Putter). It's one switch for the whole bag, not a disclosure per club, and it opens itself automatically if you already have details saved.

- With the drawer closed, a one-line recap sits under each club name — e.g. `TaylorMade · Qi10 · Driver`.
- **The club's name is still what drives everything.** Recommendations and shot history key off the label, never the brand or model, so renaming a club immediately re-targets which tracked shots it shows. Brand/model/type are yours to keep track of and nothing more.

---

## Apple Watch App

The Apple Watch companion is **live and working**. Sign in on your iPhone and the watch picks up the round automatically — it shows live rangefinder distances, the wind/slope-adjusted plays-as number, and a suggested club from your bag. No separate watch sign-in.

*Watch changes ship through the App Store / TestFlight build, not the web build, so the watch app can be a release behind the phone.*

### What It Shows

- **Hole number & par** (e.g. "7 • Par 4")
- **Distance to green** — FRONT / MID / BACK in yards, from the watch's own GPS
- **Plays-as number** — wind/slope-adjusted yardage when the **"⌚ Plays-as distance on Apple Watch"** toggle (Stats → Round settings) is ON; turn it OFF for plain GPS yardage
- **Suggested club** — pulled from your My Clubs bag
- **Your score** — swipe to navigate holes

### Scoring From Your Wrist

Score a hole on the watch and it **writes straight through to the phone's active round.**

- The phone shows a toast reading **"⌚ Score from your watch saved"** and the score lands on the scorecard
- It goes through the same protected save path as a tap on the phone, so it only fills your own cells and correctly updates GIR / sandy / junk tracking
- **Out of range?** The score queues on the watch and flushes automatically the moment it reconnects
- Scores are ignored if there's no live round, the round is finished, you're in view-only mode, or the round doesn't match
- Wrist-entered scores **stay put** — the phone's sync merges instead of overwriting
- Browsing to a different hole on the watch doesn't snap you back to the phone's hole

### GPS Stays Warm (Workout Session)

The watch starts a **golf workout session** when a round goes live and ends it when the round clears, so watchOS keeps the app alive with your wrist down.

- Drop your wrist mid-fairway, raise it, and the yardage is there in about a second instead of "acquiring…"
- Because it's a real workout, the round also shows up in **Apple Fitness**
- **First run after installing, the watch asks for Health permission when a round starts — tap Allow.** If Health access is declined, everything still works; GPS just cold-starts on each raise

### "Close on Watch" — Getting Out of the App

The watch app used to open by itself with no way to exit. The Scoring page (swipe down from Distance) has a dim **"Close on watch"** button with a confirmation dialog.

- It clears the round from the watch and ends the workout, so the app stops appearing on every wrist raise
- **It never ends or edits the round on your phone**
- The watch stays closed until a new round starts or you tap **"Check again"**

The watch also cleans up after itself: a round cached with no activity for 12 hours is dropped at launch rather than booting into a workout, and simply opening the phone app with no live round clears the watch.

### Sign-In & Sync

- Sign in on the iPhone and start (or open) a round — the watch signs in automatically
- Syncs on launch, **on every wrist-raise**, and whenever it reconnects
- **The phone answers even when it's locked in your pocket**
- Yardages re-hand every 8 seconds during a live round
- **Finishing the round on the phone clears the watch** — no more staring at yesterday's round
- **"Continue on iPhone"** hands off to the full scorecard

---

## Games (35+)

This section details every game with rules, setup, and award logic. Four games are free forever — **Skins, Nassau, Match Play, and Stroke Play Prize Pool** — everything else carries a gold **PRO** badge and is still completely unlocked.

> **A general rule that changed:** several games used to hand the current leader the whole prize pool from hole 1, or pay nothing at all if you stopped early. Both are fixed. Pool-style games show points (or a "still live" marker) during play and settle at the end, and games that used to require a full 18 settle correctly on a nine or an early finish.

> **⚠️ Eleven games are unavailable in tournament mode:** Banker, Dynamic Vegas, Splix 6's, Bingo Bango Bongo, Wolf, Hammer, Umbrella, Pot of Gold, Animals, Marks and Hot Potato. That applies to both the director's Configure Day list and a foursome's own group games. **Normal rounds are unaffected.**

### Main Games

#### **🎯 Skins** *(free)*
- **Players:** 2+
- **How it works:** The lowest score on a hole wins the "skin". If two or more players tie for low, no one wins — the skin either **carries over** or is **split**, depending on your tie rule.
- **Par-or-better requirement (optional):** the low score must also be at par or better — **net par** or **gross par**, your choice. *(On a course with per-tee pars, this is measured against each player's own tee par.)*
- **Two formats:** **Per skin** (each skin has a fixed unit value) or **Pool** (everyone pays the entry; the prize pool divides by skins won).
  - **In Pool format the tie rule is locked to "No skin"** and the control greys out with a note explaining why — a tied hole simply dies and the prize pool splits only among skins actually won. Switch back to Per skin and your tie rule returns.
  - In **Pool** mode, no unit figures show mid-round (a pool skin is worth prize pool ÷ total skins won, which isn't knowable until the last hole). The breakdown reads a muted count like **"2 skins"** and the units shows at the end. Per-skin mode shows units live as always.
- **Its own handicap allowance.** A slider (0–100%, steps of 5, default 100%) labelled **"Handicap for skins"** sets how much handicap counts in Skins. **0% = skins played gross.** It **replaces** the round's handicap percentage rather than stacking on it — a round at 90% with Skins at 80% means 80% of full course handicap, not 72%. Rounds set to "No handicaps", and players marked "plays gross", still get zero strokes.
  - *Support note: the stroke dots on the scorecard show the **round-level** pops. If Skins is running at a different allowance, the dots and the Skins result can legitimately differ on a hole. That's expected, not a bug.*
- **Skins use your COURSE handicap** (index adjusted for the tee), not the raw index. Before v1043 tournament Skins used the raw index and handed every player about two strokes too many — results settled before that build may have gone to the wrong players (the prize pool total was always right).
- **Award math:** prize pool ÷ number of skins won = per-skin value; each player nets unit totals minus their entry share, shown as `+13.33 units (2)`.
- **The saved round card prints the setup**, e.g. `Pool — split by skins won · 80% hcp · All players`.
- **In tournaments:** the tie setting is exactly **"No carry overs" / "Carry overs"**. With only one group on the course, Skins settle **live on the leaderboard** as you play — a hole pays as soon as every player in the field has posted a score for it, so a late-entered score can't take a skin back.

#### **⛳ Nassau (with Huckle)** *(free)*
- **Players:** 2–5 per Nassau. With 2 it's head-to-head; with 3+ it's group stroke. Add as many Nassaus as you want, each with its own pair/group and game value. There's a **Select all** on the Nassau card, like every other picker.
- **Three separate games in one:** front 9, back 9, and overall 18 — each worth the same unit value.
- **Two scoring formats:** **Stroke play** (lowest total wins each segment) or **Match play** (holes won, e.g. "3&2").
- **⚠️ Ties CARRY, in every format.** There is one Nassau rule: lowest net wins each segment, and if a segment ties, nothing settles and the units **rolls onto the next segment**. Any carry left over after the Overall is forfeited. *Exception: in a field of more than 10 players where the prize pool pays 2–3 places, ties still split.*
- **Special-score bonuses:** every **birdie, eagle, and hole-in-one** pays a bonus from each other player (Albatross pays at the eagle rate).
- **📣 Huckle (the press):** if you're **down 2+** in any segment — strokes in stroke play, holes in match play — you can call a **Huckle**: a fresh side game for the same amount, between you and the current leader, from that hole to the end of the segment. The original segment game plays out separately. **Huckles are available on stroke-play Nassau again** (they'd been restricted to match play since v683). Cross-group Nassau still shows the "Huckles off" note.
- **Quit-early rules:** a stroke segment only settles when **both players completed it** — a player who walks off after 12 holes can no longer win the back or the overall. A fully played front still pays normally; an unfinished segment is void. Group Nassau (3–5 players) pays out on an early finish too; it used to pay nobody.

#### **💰 Stroke Play Prize Pool** *(free)*
- **Players:** 2+
- **How it works:** everyone puts a fixed amount in the prize pool; **lowest 18-hole total takes it all** (gross or net).
- **Example:** 4 players, 20 units entry = 80 units prize pool; low score wins the whole 80 units.
- **Handicap allowance:** the stroke prize pool has its own **Handicap allowance %** field. ⚠️ **Unlike Skins and Low Net Pool, the stroke prize pool's allowance still stacks on top of the round allowance rather than replacing it.** If your group expects 80% to mean 80%, set the round to 100%.
- It respects **"Plays gross"** and **"No handicaps"** like every other net game.
- **Quit-early rule:** settles among everyone who played the round's full (shortened) length.

#### **🤝 Match Play (1v1)** *(free)*
- **Players:** pair players head-to-head; add as many matches as you want.
- **How it works:** count holes won, not strokes. The match closes when one player can't catch up ("3&2").
- **Setup options:** Units per match, net or gross.

#### **🏦 Banker**
- **Players:** 3+ (one banker vs. everyone). **Not available in tournaments.**
- **How it works:** one player is the **banker** each hole; every other player plays a **1-on-1 match against the banker**, each picking their own game. Low score wins each match.
- **"How is the banker chosen?"** — two modes:
  - **Rotation** *(default)* — rotates through the order on holes 1–15 (configurable cutoff); on the last few holes the **biggest loser picks** who's banker next
  - **Pick each hole** — from hole 1, every hole shows the banker picker (tap a player to "Take bank", listed worst-to-best, with **Change pick**). If nobody picks, the rotation order fills in silently. The in-round header reads **"Pick the banker."**
  - In pick mode, **"Loser-picks rule starts on hole"** and **"Banker rotation order"** grey out with a tooltip — the rotation order is still saved and still acts as the fallback
- **"Default game per player (fills in every hole)"** — prefills every player's game box on every hole, so after hole 1 it's one tap. You can still type over any individual box.
- **Pressing:** any player can **press** (double their own game value); the banker can **press back**, doubling everyone's game.
- **"Par 3 presses"** *(toggle, default OFF)* — on a par 3, the **first** press on a given banker-vs-player pairing **triples** the game value and every press after that doubles it. The banker's press-back counts as a press on each pairing independently: against a player who never pressed it's the first press (5 units → 15 units); against one who already pressed it doubles again (15 units → 30 units). Nobody else's math changes, and the setting is stored on the round so every phone settles the same.
- **Birdie auto-double (optional):** anyone making a birdie automatically doubles their match for that hole (or all matches that hole).
- *Note: the unit preview shown while picking a banker computes birdie doubles on net while the real settle uses gross, so the preview standings can differ slightly from the final numbers.*

#### **🎰 Vegas (4 players, 2v2)**
- **Players:** exactly 4
- **How it works:** each team's scores combine into a **two-digit number, lower digit first** — a 4 and a 5 = **45**. The **difference** between the two teams' numbers = points won by the lower team.
- **Team rotation — three options:**
  - **Rotate every 6 holes** *(default)*
  - **Fixed teams all 18**
  - **🆕 Switch teams at the turn (9 & 9)** — you pick the front-nine 2v2 (the picker relabels to **"Teams — front nine"**) and partners **auto-swap on hole 10**, so nobody plays with the same partner twice. A live preview under the picker shows both nines and refuses to guess a back nine if the front isn't a clean 2v2. It settles as **one running total across all 18** (one Vegas line in final standings), and **the tie multiplier resets at the turn** — a tie on hole 9 does not double hole 10. The on-course banner reads *"Front nine · Holes 1–9 · teams switch at the turn"* then *"Back nine · Holes 10–18 · teams switched"*, with a **"Show both nines"** table.
- **Boosts:** a **birdie flips** the opponent's number (5+4 becomes 54) — and it genuinely flips against a 10 or higher, which it silently failed to do before. **Two birdies, or any eagle, also doubles** the hole; two eagles ×4. If both teams boost they cancel, but the next hole still doubles.
- **Tie escalation:** a tied hole **doubles** the next hole's game — **and the doubling is capped.** It used to be unbounded: six ordinary tied holes made hole 7 worth ×64, turning a 1 units-a-point game into a 352 units hole. The first hole someone wins clears the streak.
- **Setup options:** Units per point, net or gross, team rotation.

#### **🔀 Dynamic Vegas (4 players)**
Same scoring and boost rules as Vegas, but **partnerships shift every hole**: hole 1 is random (deterministic by game code so every phone agrees); on holes 2–18 the **highest scorer** on the previous hole partners with the **lowest scorer**. Ties reuse the previous pairings. **Not available in tournaments.**

#### **6️⃣ 6's / Round Robin (4 players)**
- **Players:** exactly 4 (2v2 teams)
- **How it works:** partnerships **rotate by segment** so everyone partners with everyone. **Best ball per team** wins or loses each hole's game.
- **Segments follow the round length** — three 6-hole segments on an 18, three 3-hole segments on a nine.

#### **🔢 Splix 6's / Split Sixes (3 players)**
- **Players:** exactly 3. **Not available in tournaments.**
- **How it works:** **6 points per hole** — **4 best, 2 middle, 0 worst**. Ties split evenly (two tie for best = 3-3-0; two tie for second = 4-1-1; all tie = 2-2-2).
- **Game mode 1 — Per-point value:** settled per hole against the field; the average is always 2 points.
- **Game mode 2 — Entry pool:** everyone pays the entry; most points after 18 wins. **Winner takes all** (split on tie) or **80/20**. **The pool doesn't pay out mid-round** — it shows points while you play and settles when the round ends.
- **The banner shows a per-hole line**, e.g. `H15: Tyler 4 +2.00 units · Kevin 2 · Matt 0`.

#### **🌙 Niners (5-3-1) — the 9-Point Game**
- **Players:** exactly 3 (enforced)
- **How it works:** **9 points per hole** by finish order — **low 5, middle 3, high 1**. Most points over 18 wins.
- **Ties split the 9 points:** two tie for low → **4-4-1**; two tie in the middle/high → **5-2-2**; all three tie → **3-3-3**.
- **⚡ Blitz (optional, off by default):** win a hole **outright by 2 or more strokes** and you **sweep all 9 points** (9-0-0). A tie for low, or a win by one, splits normally. Tap the **"?"** beside the toggle for the full explanation.
- **Two award modes:** **Pool (entry)** — winner takes all or 80/20, settling at the **end of the round** — or **Per-point** (average is 3 a hole).

#### **📊 Stableford**
Points against par — **Double Eagle 5, Eagle 4, Birdie 3, Par 2, Bogey 1, Double or worse 0.** High score wins. **Entry pool** (winner takes all / 80/20) or **per-point**. Net recommended.

#### **🎯 Bingo Bango Bongo**
Three points per hole: **Bingo** (first on the green), **Bango** (closest once all balls are on), **Bongo** (first to hole out). Each point earns the winner **X units from every other player**. Tap the winners on the score screen each hole. **Not available in tournaments.**

#### **🐺 Captain (Wolf)**
- **Players:** exactly 4. **Not available in tournaments.**
- The **Wolf rotates each hole.** After watching the others tee off, the Wolf either **picks a partner** (1v1 against the other two) or goes **Lone Wolf** against all three (**2x**). **Blind Lone Wolf**, called before anyone tees off, is **3x**.
- **Example:** 2 units Wolf game, you go Lone Wolf (4 units). Win → each opponent owes you 4 units (12 units for the hole). Lose → you owe 4 units to each.
- *The captain rotation order has been reviewed and is deliberately as written.*

#### **🔨 Hammer**
- **Players:** 2+ (any number in Individual; exactly 4 for Team). **Not available in tournaments.**
- **How it works:** match play with a **doubling cube.** At any time a player can **throw the hammer** to double the stake; the opponent **accepts** (game doubles, they get the hammer next) or **declines** and concedes the hole at the current game. Low score wins the hole and the prize pool; halved holes can carry (optional).
- **Format:** **Team (2v2)** *(default)* — two fixed sides, best ball, winners split the prize pool, declining concedes for both partners — or **Individual**, where every player declines for themselves and pays the current stake, split among whoever is still in.
- **Team 2v2 pays the same as 1v1 at the same setting.** It used to pay half.
- **Watch how it works:** the Info tab's Hammer card leads with a **"▶ Watch how it works"** button that plays a short vertical how-to video in the app.
- **⚠️ Setup gotcha:** the **net-match checkbox defaults to checked (net scoring ON).** Tapping it turns net **off**.

#### **⚖️ High & Low (2v2)**
An **even** number of players, **4+**. **Two points per hole:** one to the team with the better **LOW** ball, one to the team with the better **HIGH** ball. A tied ball halves that point. Optional birdie-double. Settle on the point difference × Units per point. *With the 8-player cap, this game blocks at 7 players — it needs an even field.*

#### **👥 Team Match Play**
Any even-sized teams. Each hole the **better ball** on each team competes; the match closes when a team can't catch up. **If your partner picks up, your ball still counts** — a single missing partner score used to void the whole hole.

*In a tournament with 3 or more teams, Team Match settles per cart — each cart is a genuine two-team match — and the units is routed into the group pool so nothing goes missing. With two teams it still merges field-wide exactly as before.*

#### **🎯 Team Low Ball**
Same teams, but **sum each team's best ball over all 18 holes**; lowest total wins. *Same per-cart rule as Team Match in a 3+ team event.*

#### **🎯 Quota (Points)**
- Each hole earns **Albatross 8, Eagle 6, Birdie 4, Par 2, Bogey 1, Double or worse 0.** Quota target: **Auto = 36 − handicap**, or Manual. Your result = points earned − quota; furthest **over** wins.
- **On a nine, both halves scale** — it used to use the 18-hole target of 36 while still subtracting your full 18-hole handicap.
- **Game value:** entry pool (winner takes all / 80/20) or per-point.
- **In a tournament:** a group's own Quota game settles when **your** round finishes.

#### **🎯 Team Quota**
Even teams; **team total = sum of each member's (points − quota)**. Higher total wins.

**It's a prize pool game now — there is no settlement dropdown.** You type an entry and the winning team splits the prize pool. The screen does the maths for you:

> *"Prize Pool: 80 units (4 × 20 units). Winning team splits it — about 40 units each, so roughly 20 units up on your entry."*

- A **0 units entry** shows an amber box saying **no units will settle**
- **There's no Net/Gross dropdown either** — quota is always scored gross, because the handicap is already inside the 36 − handicap target. The old control had one option and the engine ignored it
- **Blank manual quotas are named out loud:** *"Team Quota: no manual quota set for Tyler, Chris, Frank +5 more — they default to 36."*
- Rounds already set up per-point keep settling on their original terms; reopening one shows an amber note plus the per-point field so it can still be edited
- **A withdrawal is expensive** — unplayed holes score 0 against that player's full quota
- **Individual Quota is untouched** and still offers both pool and per-point

**In a tournament**, Team Quota is a **field-wide prize pool** with three award shapes — **winner takes all**, **top 2 at 70/30**, or **top 3 at 50/30/20** — and the maths shows live. *16 players at 20 units = a 320 units prize pool; winner-takes-all pays the winning pair 160 units each; 50/30/20 pays 160 units / 96 units / 64 units.* See [Tourney Tab](#tourney-tab-events--tournaments).

**Three honest messages replace the old blanket "teams are uneven":**

| Message | What it means |
|---------|---------------|
| **🏹 Team Quota — settles event-wide** | Normal on a tournament round. It pays out once across the whole field; the units shows on Tournament Results, not your group's board |
| **🏹 Team Quota — not settling** | The teams genuinely are uneven, and it names the counts (e.g. 9 v 7). The "even the teams up in round settings" advice only appears on a live, editable round. **Nothing has been charged** |
| **🏹 Team Quota — didn't settle** | *"The teams look even (2 v 2), so this needs a look."* No invented reason |

#### **🏆 Ryder Cup (2v2, 3 segments)**
- **Players:** exactly 4
- The round splits into three segments, **each a different format — Best Ball, Scramble, or Alternate Shot** — in the order you choose. **Segments follow the round length** (3/3/3 on a nine).
- **Scoring:** 1 point for a hole win, 0.5 each for a halve. After the round the winning team collects **point differential × Units per point per player.**
- Scramble and Alternate Shot holes show a **team score entry panel**.
- **A 9-hole cup match becomes final** — it used to show a projection forever while the official total stayed 0–0.
- **Team handicap allowance** is settable (see Scramble below).
- **In a multi-team event:** Ryder Cup settles correctly **per cart** and feeds the per-team cup table, so it's usable — but there is **no event-wide N-team format**. There's no bracket, no round-robin and no fixture list; the matchups are whoever the commissioner seated together. Ryder Cup remains three six-hole segments *inside one foursome*, not field-wide sessions.

#### **🏌️ Scramble**
- **How it works:** both (or all) players hit, the team picks the best shot, and everyone plays from that spot. One team score per hole. *A scramble is scored against the **card** par, not per-tee par.*
- **Game value:** match play (most holes won) or stroke play (lowest total). **Match-play scrambles closed out early pay** — a match won 6&5 used to settle 0 units — and **9-hole scrambles pay too.**
- **⚠️ Picking Scramble switches off the games that can't work.** A scramble team plays one ball, so there's no individual score for Skins, Low Net, Most GIRs, Fewest Putts, Nassau, Stroke, Banker and the rest to settle on. Ticking **Scramble** disables and dims **30** game toggles, unchecks them, shows a tooltip explaining why, and toasts once saying how many were switched off.
  - **Survivors that still work with a scramble:** Scramble, Closest to the Pin, Long Putt, Long Drive and Greenies (a team birdie still counts for the birdie pool).
- **Team handicap allowance:** a checkbox (plus an optional custom percentage) on both the Scramble and Ryder Cup option panels, off by default. Defaults are the USGA standards — **2-man scramble 35% of the lower handicap + 15% of the higher; alternate shot 50/50.** "No handicaps" still overrides it.
  - *The 4-man (one-team) scramble allowance is **not implemented** — the checkbox is hidden in 4-man mode and that format plays straight gross.*
- **Field scramble (tournament):** see **Scramble Prize Pool** under Tourney → Event Prize Pools. In a multi-team event a scramble day settles per cart, same as Ryder Cup.

#### **☂️ Umbrella (4 players, 2v2)**
Five points a hole, **each worth the hole number** — 1 apiece on hole 1, 18 apiece on hole 18. The five points: **Low ball**, **Low total**, **GIR (partner 1)**, **GIR (partner 2)**, and **Birdie**. Win a point outright to take it; a tie awards it to nobody. **☂️ The umbrella:** sweep all five while the other team scores zero and that hole's points **double**. **Not available in tournaments.**

**Example:** on hole 8 you win low ball, low total, one GIR and the birdie — 4 × 8 = 32 — but they grab the other GIR, so no umbrella. On hole 12 you sweep all five: 5 × 12 = 60, doubled to **120**.

*The two GIR points need GIR tracking turned on for the round.*

#### **🪙 Pot of Gold**
- A separate **unit prize pool rides on every hole, weighted by difficulty**, and the low score wins that hole's prize pool from everyone else. Each hole's prize pool is `base × (19 − stroke index)` — the **hardest hole (SI 1) is worth 18× the base**, down to 1× on the easiest. **Not available in tournaments.**
- **⚠️ The "base" is not units-per-hole.** A **1 units base totals 171 units per opponent over 18 holes**. The setup field says so.
- **On a nine the weights scale to the nine** (9× down to 1×) — they used to run 18×–10×, so a nine played for about 2.8× the intended units.
- **Carryover (optional):** a tied hole's prize pool rolls onto the next hole until someone wins it outright. Off, a tie splits that hole's prize pool. **A carry left at the end settles on low total**, and voids if the total is still tied — it used to just disappear.
- **On GPS:** the **🪙 Pot of Gold bubble** shows this hole's prize pool with **"SI n"** or **"+X units carried"** underneath.

#### **🐾 Animals**
A running side game of penalty **animals**: **Gorilla** (OB) · **Snake** (3-putt) · **Shark** (water) · **Camel** (bunker) · **Jackal** (shank) · **Dolphin** (two waters) · **Crab** (two bunkers). Each animal **passes to the last player who did it**, so only the **final holder** pays. Birdies, eagles and albatrosses cancel penalties out. *Animals and Long Putt can't run at the same time.* **Not available in tournaments.**

#### **⭐ Marks**
A **highlight-reel game — most marks wins, not lowest score.** Earn a mark for GIRs · sandies · chip-ins · **fishies** (par after a penalty) · **darts** (closest on a par 3) · **muscles** (longest drive) — plus birdies, eagles and albatrosses off the card. **Not available in tournaments.**

#### **🥔 Hot Potato**
**One token nobody wants.** Pick a **trigger** at setup — 3-putt, double bogey, OB, or water — and tap who just did it; the potato moves to them **and doubles every time it changes hands.** Whoever holds it after the 18th **pays the current value**, split among everyone else. **Not available in tournaments.**

**⚠️ The doubling is capped** — at **64× (six doubles)**, with **one move per hole** (last tap wins). It used to be uncapped: 12 passes on a 1 units game reached 2,048 units, and a single hole could double the prize pool twice.

### Round Pools (whole-group prize pools)

Three pools where everyone pays the same entry and the single best result takes the whole prize pool; **ties split it evenly.**

**How all three behave:**
- Nothing pays out until **every player in the pool has all their holes entered** (9-hole rounds work too), so no units shows mid-round. **They do settle on a round you finish early** — they used to return nothing at all and the units just disappeared with no row and no message
- If **nobody qualifies**, the prize pool is **void** and no units moves
- **Player picker:** each pool **pre-selects everyone** the first time you switch it on — you only tap to take someone *out*, and players added mid-round are auto-included. A deliberate "Clear all" stays cleared. A player left out neither pays nor can win, and his unfinished card doesn't hold up the award
- **In a tournament:** these three are hidden from the director's Configure Day screen (the Event Prize Pools cover that), but each foursome can run them as their **own group game**

#### **Low Net Pool**
- The **lowest NET score over 18** takes the prize pool.
- **Its own handicap allowance slider** (0–100%, default 100%), labelled **"Handicap for Low Net Pool"**. **0% = the prize pool plays straight gross.** Like Skins, the allowance **replaces** the round percentage rather than compounding with it — an 80% prize pool inside a 50% round used to actually play at 40%.
- It measures off your **tee-adjusted course handicap**, and respects **"Plays gross"** and **"No handicaps"**.
- **Worked example:** 4 players at **5 units** each (20 units prize pool). Player A has the best net → **A +15 units**, the other three **−5 units each.** If A and B tie → **+5 units / +5 units / −5 units / −5 units.**

#### **GIR Pool**
The **most greens in regulation over 18** takes the prize pool. **Turning this on switches GIR tracking on automatically**, and a toast tells you it did. If nobody makes a single GIR, the prize pool is void.

#### **Fewest Putts Pool**
The **fewest total putts over 18** takes the prize pool. **Turning this on switches putt tracking on automatically.** You need a putt count on every hole you score — a player missing putt data **can't win** it but still pays his entry.

### Side Games

#### **⛳ Par 3 Greenie** (with optional Hero Tax)
- **Applies to:** par 3 holes only. *The par-3 list comes from the course card, not from each player's tee — it's one shared contest.*
- Mark the player **closest to the pin** on the green. Default 5 units per other player.
- **Must make par or better to win** — unless you turn on the option below.
- **Hero Tax (optional penalty):** if the Greenie winner **3-putts**, they **forfeit the award** and **pay each other player a fixed Hero Tax** (default 5 units). A sub-row on the scorecard asks "Did the greenie winner 3-putt?" and the chip crosses out.
- **"3-putts still win" (default OFF):** turn it on and you no longer need par or better to collect, a 3-putt doesn't forfeit, and **Hero Tax is switched off entirely** — its row disappears from the score screen and the game header reads "pays no matter what."
- **Birdie Override — somebody has to tap it.** If the option is on, a birdie can take the greenie away from the closest-to-the-pin player, **but only when a person taps the birdie chip.** Nothing changes hands on its own any more.
  - The score screen walks it in two labelled steps: **"Step 1 — was the birdie on the green?"**, shown only for the players the app can't call on its own, then **"Step 2 — tap the birdie that takes the greenie."** The chip that wins reads **"Name 🐦 — takes it"**.
  - A player the app reads as a **chip-in** is drawn struck through, and is still tappable if you disagree.
  - **Leave the hole alone and the greenie stays with closest-to-the-pin** — the same result as having Birdie Override switched off.
  - Marking somebody back **off** the green clears them as the birdie winner too.
  - *Why it changed:* the app used to reassign the greenie by itself whenever exactly one other player birdied and its derived GIR read them as on the green — with nobody tapping anything, and settling that way even if the score screen was never opened. A chip-in logged as one putt looks identical to a putt holed from the green, so chip-ins were stealing greenies. **The trade-off is one extra tap on a legitimate steal**, which is the price of never having one happen behind your back.
  - **GIR itself is untouched** — Junk GIR, Arnie, the GIR Pool, your stats and the board all behave exactly as before.
- **In a tournament:** under the tournament scope, the Greenie card merges **every group's** greenie events into one hole-sorted list.

#### **🎯 Closest to the Pin**
- **Applies to:** any holes you choose (usually the par 3s)
- **Per-hole mode (default):** every player pays the entry; the group marks who stuck it closest (ball must be on the green) and logs the distance in **feet and inches**. Closest takes that hole's prize pool. **A winner logged with no distance still wins the hole** — someone from another group with a measured distance beats them.
- **Pool mode (toggle in the CTP options panel):** CTP becomes **one single prize pool** — everyone pays the entry once, the player with the **most CTPs takes the prize pool**, ties split, settling at the end.
- **Units example:** 4 players at 5 units, A wins 2 CTPs to B's 1. **Pool mode:** A +15 units, everyone else −5 units. **Per-hole:** A +25 units, B +5 units, C −15 units.
- **CTP sits in the main games list**, not buried in Side Games, with its hole picker, pool-mode toggle and participant picker.
- **With one group on the course, CTP settles live** as you play, recomputing if someone logs a closer shot later.
- **Tournament rounds:** entries combine across groups. A CTP added *after* a day has launched reaches the groups — each group's round heals itself when opened.

#### **📏 Long Putt**
Everyone pays the entry; the **longest putt of the round** wins the prize pool. Tap who holds it and log the distance; update any time someone drains a longer one. The **📏 bubble** on GPS jumps you straight there. **With one group on the course it settles live.** In tournaments, the longest putt across the **entire field** wins one prize pool — and **every group is included**.

*Switching Long Putt on mid-round now reaches every phone.* The repair check used to run once per session and treat a failed read as "the prize pool is off", so a device that looked at the wrong moment never looked again; it re-checks every couple of minutes now.

#### **💥 Long Drive**
Everyone pays the entry; the **longest drive on the designated hole** wins the prize pool. The organizer marks the winner and an optional yardage — **there's no auto-measure.** Available in normal rounds, not just tournaments.

#### **🐦 Birdie Bump**
- Pays per great shot with **no tracking required** — it reads straight off your scorecard. Configure **three unit values: birdie, eagle, and hole-in-one.** Any participant who makes one **collects that amount from every other participant.**
- **Example:** 10 units birdie, 4 players → a birdie collects 10 units × 3 = **+30 units.**
- **An eagle can never pay less than a birdie.** If you left Eagle blank an eagle used to pay 0 units — the player who made it actually *lost* units to the birdie makers. Same for an ace with no hole-in-one amount, which falls back to the eagle rate.
- **Birdie Bump pays during play**, like every other group game — it used to sit at 0 units in running totals, the GPS units bubble and the group board all day and only appear at the end.
- **In a tournament, it now actually pays.** Birdie Bump on a tournament group round used to appear on the games list and then settle **0 units for everyone** — the prize pool never reached group totals, group games or who-trails-who. On a tournament group round, a missing participant list is read as **"this group"**, and the units lands where it should. *There is no field-wide Birdie Bump — it's a group-level game only.*
- **On a casual round, Birdie Bump still refuses to settle with no participant list.** That's deliberate: there, an empty list means the setup was never finished.
- *(This is the game formerly called "Birdie Pool" — only the display name changed; old rounds still resolve correctly.)*

#### **Junk Games (toggle each independently)**

Each junk game pays **X units from every other player** to whoever earns it. Multiple players can earn the same junk on a hole, and one player can earn several junks on one hole.

| Game | Trigger | Auto-fill |
|-----|---------|-----------|
| **🟢 GIR** | Ball on the putting surface in **par − 2** shots | ⚡ with **GIRs** tracking on |
| **🏖️ Sandy** | Par or better **after being in a bunker** | ⚡ with **Sand saves** tracking on |
| **🍫 Rolo** | Par or better **after taking a penalty stroke** | ⚡ with **Penalties** tracking on |
| **🌳 Barkie** | Par or better **after hitting a tree** | manual |
| **📏 Polie** | Make a **long putt** — typically 10+ feet (group sets the standard) | manual |
| **🐍 Snake** | Whoever **3-putts gets the snake**; holder at the end pays out (defaults to 0.50 units) | manual |
| **⛳ Arnie** | Par **without hitting the fairway or the green in regulation** | manual — **needs Putts tracking on to award at all** |
| **🎯 Chip-In** | **Hole out from off the green for par or better** | ⚡ with **Putts** tracking on (putts = 0, par or better; an ace is excluded) |

- **A hand-tapped chip always sticks.**
- **Known limitation:** when junk is configured as a tournament **group** game, the chips render and are tappable but **GIR / Arnie / Sandy auto-fill doesn't fire** — tap them by hand in that case.

### Hydration Games (💧 sip trackers — no units)

Just-for-fun sip trackers that ride along with any round — **no units change hands, nothing touches your games or lifetime stats**, and they're **never** Pro features. Turn on **"Sips-of-water mode"** in Setup to keep it dry. **Auto** games read the scorecard; **manual** ones use the 💧 chip on the score row. At round end the **Sip totals** card colour-codes everyone green (dry) to red, and the player with the most sips wins **"Do the Dance"** — a tap-to-dismiss dancing-chicken send-off.

| Game | Trigger | Sips / Logging |
|------|---------|----------------|
| **💦 In the drink** | Find a water hazard | 1 · manual 💧 chip |
| **🏖️ Bunker / Sand trap** | End up in a bunker | 1 · manual 💧 chip |
| **🚧 OB / lost ball** | Out of bounds or lost ball | 2 · manual 💧 chip |
| **🌀 Whiff** | A full air-swing | 1 · manual 💧 chip |
| **🪱 Worm burner** | Top it off the tee | 1 · manual 💧 chip |
| **⛳ Chunk & skull** | Fat or thin chip that never reaches the green | 1 · manual 💧 chip |
| **🕳️ Three-putt** | 3+ putts on a hole | 1 · **auto** (needs Putts on) |
| **🥄 Loser drinks** | Highest score on the hole (ties → all tied drink) | 1 · **auto** |
| **📈 Par or drink** | Anyone over par — bogey 1 sip, double+ 2 | 1–2 · **auto** |
| **🎖️ Honors pours** | Winner of the last hole hands out the sips | 1 · **auto** |
| **🐍 Snake (hydration)** | 3-putt holds the snake; holder at 18 finishes their drink | **auto** |
| **🐺 Wolf** | Rides along with the Wolf game | 1 · **auto** |
| **🛎️ Tee box toast** | Everyone sips on every tee box | 1 each · **auto** |
| **🔄 The Turn** | Finish your drink after hole 9 | **auto** |
| **🍻 19th hole tally** | Bank every offense and settle at the clubhouse | running total |
| **💃 Sip totals & "Do the Dance"** | End-of-round summary | — |

### Changing a Game Mid-Round

- **Unit-value changes apply retroactively to all 18 holes** — including holes already scored.
- Editing a game **after a round has started actually updates that live round.** A toast reports what happened, e.g. *"Saved — updated 2 already-started rounds with these games"* or *"Saved for future rounds — 1 group already finished, so it wasn't changed."*
- **Already-finished rounds are never retroactively changed.**
- **⚠️ Re-check your per-hole winners after editing a live round's games** — re-saving the games has been seen to clear already-logged Greenie (and potentially junk / CTP / long-putt) entries.

### Removing a Player Mid-Round

Ten team games (Team match, Team low ball, High & Low, Umbrella, Ryder Cup, Scramble, Vegas, 6's, Team Quota, Hammer) correctly refuse to settle when the teams no longer match the player list. They used to do it **silently at 0 units**; the round flags the calculation error so you know why.

---
## Info Tab (Rules & Help)

The **Info** tab (More → Info) is the app's built-in **rulebook and help center** — the authoritative source for every game's scoring, final standing, and setup.

**What's inside:**
- **🏌️ Games** — an expandable card per Main game with **How it works · Example · Setup options** (Skins, Nassau with Huckle, Stroke prize pool, Banker, Vegas, Dynamic Vegas, 6's, Splix 6's, Niners, Bingo Bango Bongo, Stableford, Captain/Wolf, Hammer, Match play, Team match, Team low ball, High & Low, Ryder Cup, Scramble, Quota, Team Quota, Umbrella, Pot of Gold, Animals, Marks, Hot Potato, Low Net Pool, GIR Pool, Fewest Putts Pool)
- **🍀 Side games** — Par 3 Greenie (with Hero Tax), Closest to the Pin, Long Putt, Long Drive, Birdie Bump, GIR, Sandy, Rolo, Barkie, Polie, Snake, Arnie, Chip-In
- *The Info tab opens straight onto the games explainer content — the old "Replay the Get Started guide" card and the embedded how-to video were both removed from the top of the tab.*
- **⚡ Auto-fill notes** — Rolo and Chip-In carry an "⚡ Auto-fill" paragraph explaining which tracking toggle powers them
- **💧 Hydration** — every sip tracker
- **Quit-early final standing rules** — how match-style games, the Stroke Prize Pool, and per-hole games each settle if you stop before 18
- **Live tweaks** — unit-value changes mid-round apply **retroactively to all 18 holes**
- **Handicap, par, stroke-index, and tee rating/slope explainers** — including **"🏷️ The 'TEMP' badge"** and "Good to know"
- **🏅 Leagues** — see below
- **Documentation & legal** — links to this Player Guide PDF, the Admin Guide (admins only), the Privacy Policy and the Terms of Service. All four are served from **officialbadgolf.com** and open outside the app.

**Support and legal details, as they now read everywhere in the app:**

- **Support address: `support@officialbadgolf.com`.** This is the address on the About card's **Support** row and behind both in-app feedback links. Any older `tyler@simplisticfishing.com` reference is out of date.
- **The About card's copyright line reads "© 2026 Bad Golf"** — no "LLC", because there isn't one.
- **The Terms of Service and the Privacy Policy name the party as "Kevin Wells, an individual doing business as Bad Golf."** Same wording on the public terms, privacy, support and delete-account pages, and in the ToS and Privacy PDFs.
- **The company line is "Bad Golf, Better Times"** (it used to be "Bad Golf, Good Times"), on the splash, the public site, the footer and the share card. The launch image reads **`SCORE · GAME · BRAG`** with **`BAD GOLF, BETTER TIMES`** underneath.

### 🏅 The Leagues Section

Seven drop-down explainers covering league play, written in the same voice as the rest of the tab. They sit **after the two handicap explainers and before "Good to know"** on purpose — a league week is scored net, so the handicap sections have to come first.

| Explainer | What it covers |
|-----------|----------------|
| **🏅 What a league is** | the shape of a season, 6–12 weeks, the three kinds of league, and that playoff weeks are *extra* |
| **🔗 Joining one** | invite only, no code to type, one link for the group, and that your seat belongs to your account rather than to the name on the roster |
| **📅 Weeks, and missing one** | posting as normal, the commissioner signing off, why there's no excused week, subs, and the six-day flex window |
| **⛳ Scoring and handicaps** | net off league handicaps, stroke-net as the default, and where the format lives |
| **🍀 Side games in a league** | the seven pools you can run — and why Wolf, Banker and Nassau aren't among them |
| **💵 How the money works** | Bad Golf never holds money; weekly pools settle weekly, dues pay out on final standings, and a dues of 0 is perfectly fine |
| **👑 Running one** | what a commissioner does, how to hand it over, and where every setting lives |

Games and side games carry the gold **PRO** pill here too. The **handicap and help topics are never badged** — they're not games. Hydration entries aren't badged either.

*Game icons in the Info tab match the icons on the round-setup tiles.*

---

## Sending Feedback

**"✍️ Share feedback"** (Home) opens a short form for course problems, bugs and ideas.

- Type your message and optionally tap **"📎 Add screenshots"**
- Tap **Send feedback** — it lands in the admin **Feedback inbox**
- The sheet shrinks and scrolls so **Send** is always reachable above the keyboard
- Tapping the backdrop **closes and keeps your draft** (with a toast saying so); **Cancel** asks before discarding; only a successful send clears the form

There's also a separate **Contact us** form for course problems and general questions.

---

## Profile Tab

**More → Profile.** Everything about *you* — as opposed to a round — moved off the Home screen into a tab of its own, with its own identity header: your photo, your name, and **Edit profile**.

**What lives here:**

- **Appearance** — see below
- **Account** — your email, sign-in method, and the **Edit profile / Sign out / Delete account** actions
- **🔔 Push notifications** — see below
- **Additional settings**
- **🏌️ My clubs** and **📋 My shots**
- **🏠 Home course**

### 🌗 Appearance — System / Light / Dark

A plain card at the **top of the Profile tab** with three buttons: **System · Light · Dark**. The one you're on is highlighted.

- **The default is System**, which follows your phone's own light/dark switch — including flipping itself over at sunset if your phone is set to do that.
- **The choice is per-device**, saved on that phone rather than on your account. Setting your iPhone to Dark doesn't darken the web app, and vice versa.
- It works from a cold open — you don't have to visit any other tab first.

*Dark mode reaches everywhere it should now: the stats KPI tiles (Rounds, Avg Score, Best, Putts/Rd, GIR %, Fairway %), the Lifetime games bar, the leaderboard's #1 row, the "Update required" screen, the splash wordmark, the GPS caddie pill's club name (now yellow in both themes), the "How it works" and "View real scorecard" buttons, and the three admin panels for GPS import, course removal and rating import. The live and final status pills are the known holdout — their text is still low-contrast in dark mode.*

**My Clubs gained two things:** **▲▼ reorder** arrows, and an **in-the-bag checkbox** per club — so a recommendation only ever draws from clubs you're actually carrying today.

**The day-one handicap card is a real card now.** A brand-new account with no rounds used to collapse it to a line of help text with no way forward; it shows the full layout with an explicit **Edit profile** button.

*The Edit profile and Settings buttons were removed from the Home handicap card — both are one tap away here instead.*

### 🔔 Push Notifications

One card covers everything Bad Golf pushes, split into what goes out and what comes in. Turn any of them on or off at any time. *(On iPhone you also need to allow notifications for Bad Golf in your phone's Settings. In-app alerts always show while the app is open.)*

**What I send**

| Toggle | What it does |
|--------|--------------|
| **📣 Alert friends when I start a round** | Posts a heads-up to your friends: you're playing a course, with the city and state |
| **🏁 Alert friends when I finish a round** | Posts your finished round to your friends, with the course and your score |

**What I get told about**

| Toggle | What it does |
|--------|--------------|
| **⛳ A friend starts a round** | You're told when a friend tees off |
| **🏁 A friend completes a round** | You're told when a friend finishes |
| **🗺️ Course re-map requests** | Admins only |

> **The finish toggle only silences the broadcast to your friends.** The **final-summary card** that goes to the players who were actually in the round with you is a different notification and is not affected — that one is the result everybody in the group needs. Turning the finish alert off changes nothing about your round, your stats or your handicap.

**Tournament notifications** live in their own card beside this one, with the same shape.

---

## Stats Tab

The Stats tab (More → Stats) is your personal dashboard — handicap, round history, club setup, tracking history, and account management.

### Handicap Index (WHS)

**Display:**
- Large **handicap number** (to one decimal)
- **Status label:** "Established" (5+ rounds), "Provisional · best round avg" (under 5), or a **TEMP** badge
- **"📤 Share handicap"** — export your index + recent rounds (a placeholder number is marked "(TEMP)")
- **"♻️ Recalculate handicap"** — re-rates your saved history with the current math

**How it's calculated — matched to GHIN/WHS:**
- **Differential** = (Score − Course Rating) × (113 ÷ Slope) — using the **women's** rating/slope for players whose profile gender is Female (when the tee has them)
- The **number of differentials that count** follows the official USGA bands. **The "counting rounds" labels on screen now match the engine** — the ✓ marks on the trend chart and the *"Lowest X of Y rounds count"* subtitle were still printing the old pre-v924 table, so at **11 rounds and again at 13–19 rounds** they contradicted the index the app was actually showing (15 rounds read "Lowest 6 of 15" while the engine used the lowest 5). All three surfaces agree now
- Hole scores are capped at **net double bogey** before the differential is calculated — par + 2 + your strokes on that hole (par + 5 if you have no course handicap yet). **Your real gross score is untouched everywhere else.**
- **9-hole rounds are not simply doubled** — they use the WHS 2024 expected-differential formula
- **Weather-adjusted scores don't feed the index** (the 🌦️ display per round stays)
- Rounds without a complete round or a rating/slope are skipped
- **Rounds from a tournament that has since been deleted no longer count** — see below
- Fewer than 5 rounds = **provisional**

> **Support script for a wrong-looking index:** update the app, then **Stats → ♻️ Recalculate handicap.** *(For old rounds the recalculation approximates using the player's current roster handicap and default stroke index, since those weren't archived at the time.)*
>
> **Not implemented:** soft/hard caps against the 365-day Low Handicap Index (Rule 5.8), exceptional score reduction (Rule 5.9), and official PCC. Bad Golf matches GHIN's everyday math, not the full rulebook.

**One handicap everywhere.** Each qualifying account **publishes** its index (plus round count, holes basis and timestamp), and every other device reads that number — so the same golfer can't show 3.1 on one login and 2.6 on another. Guests, and anyone who has never published, fall back to the locally calculated index. *To correct someone's index everywhere, correct it on the account that owns the name.*

**Automatic recalculation:** your handicap recalculates every time you finish a round or add a past round. The differential for each saved round is re-derived from that course's current tee rating/slope, so correcting a course's rating updates your index next time a round is saved.

### Missing Rounds Fix Themselves — and "🔄 Resync my stats"

**The symptom this cures:** a round shows up in your **Rounds** list but is missing from your handicap box, your **Lifetime Games** and your game history — because stats are only written by the phone that taps **Finish round**. If somebody else kept the card and closed it out, your phone could sit for hours with the round missing from every tile.

**Now it heals itself.** A finished round in your Rounds list that's missing from your stats is pulled in automatically the next time the Rounds tab or the Stats page loads, and the page redraws straight away.

- Deliberately limited to **finished** rounds (live rounds stay out of stats), **rounds you're actually a player in**, and **never a round you deleted** — local deletes and shared tombstones are both honoured
- Up to 10 recovered per pass

**Partial rounds that carried real units now count toward Lifetime Games.** A round used to need to be complete or carry a gross score, so walking in after 14 holes down 42.50 units silently vanished from game history. Genuine ghost rows (0 units, no gross, no holes) are still excluded.

**Manual escape hatch:** **Stats → tools → "🔄 Resync my stats"**, beside Recompute fairways. It rebuilds your stats from every finished round in your Rounds list and reports what it found — e.g. *"Recovered 2 missing rounds ✓ (37 refreshed)"*. It's safe to press twice.

### Differentials & Round History

**"Differentials" section** lists recent rounds with **date**, **course**, **gross score**, **differential**, and **tee played**. Tap any round to view the full scorecard. Tournament rounds carry a **🏆 trophy**.

**"⛳ Add a Round"** — log a round from before you used Bad Golf: date, course, gross score, tee, holes played. It counts toward your handicap if it has a complete round + full rating/slope data.

- The date defaults correctly (it used to pre-fill *tomorrow* when you logged a round in the evening)
- Double-tapping **Save** can't create two handicap rounds
- **Cancel doesn't silently wipe an 18-hole entry** you just typed

**"🗑️ Remove this round from my stats"** on a round card works on iPhone (it used to silently do nothing).

### ⛳ Add a Round — Entering Rounds You Already Played

The Stats tab's old single-round **"Add a past round"** button is now **"⛳ Add a Round"**, and it opens a bulk entry tool. The point is a golfer arriving from another app: post several rounds at once and get a real Handicap Index straight away instead of waiting out the 54-hole minimum.

**Two modes:**

- **One course** — pick a course once and every row inherits its tee, rating and slope
- **Many courses** — a course picker on each row, with "tap to reuse" chips for ones you've already picked

**Filling it in:**

- **Single / Daily / Weekly / Monthly** tabs across the top guess dates for a batch of rounds; one tap re-guesses them all. Dates only affect sort order
- Score entry uses **quick-tap chips centred on your average**, plus your device's number keypad
- The link at the bottom — **"Enter one round in full detail"** — opens the old hole-by-hole screen for anyone who wants full stat tracking on a past round

**What you get:**

- Rounds entered this way carry an **⤵ IMPORTED** tag on the Rounds list, so you can tell them apart later
- They are **deliberately excluded from tracked-stat averages** (Putts/Rd, GIR%, and so on) because no hole-by-hole detail was entered. **Only your Handicap Index uses them**
- The **"Recent"** course list shows courses *you* recently played. It used to show courses recently *edited* — which meant an admin fixing ratings put strange courses at the top of your list

### Two Statistics That Were Quietly Wrong

Worth knowing, because a tile you used to see may now read **N/A** — that's the fix, not a regression.

- **Putts/Round and GIR% were being extrapolated from partial data.** A round where a single hole of putts was tracked was stretched across all 18, producing impossible numbers like *18.0 Putts/Rd* or *5% GIR*. Both stats now require the full round to have been tracked, and show **N/A** otherwise
- **Some rounds recorded "0 greens hit in 18 fully tracked holes"** — often physically impossible, and it was dragging real GIR averages down. A manually tracked round where the green chip was never tapped now reads as untracked rather than as a hard zero

*A player's stat sheets (Rounds, Avg Score, Putts/Rd, GIR%, Fairway%, Best Round) used to be able to show fewer rounds than the tile above them claimed — the sheets read only the local device's copy while the tile read the merged history. They agree now.*

> **A round marked unranked stays out of your handicap index — but it still counts in your stat tiles.** Rounds, Avg Score, GIR % and Fairway % all include it. If your average score looks worse than your index suggests it should, an unranked round is the usual reason. This is a known gap, not a setting you can change.

### Scoring Trend Chart — Removed

**The Scoring Trend chart is gone.** Everything it showed — the last-20-rounds trend, the best-8 differentials, and whether you're improving or declining — is already on the same tab, in the Handicap card, the arrow on the KPI header, and the Rounds tab.

### Detailed Statistics

**Stat tiles (tap any to drill down):** GIR %, Fairways %, Putts / round, Penalties, Sand saves, Avg score, Rounds played. A player with no data yet sees **N/A** rather than a missing box.

*The Hole-by-Hole breakdown used to print nonsense like "(+-0.4 over par on average)" for a player who was under par on a hole. Fixed.*

**Filters:** player select (view another player in the roster), date range.

*Basic tiles are free; the deeper drill-downs carry a PRO badge.*

### Lifetime Games — and Why It Can Disagree With Final Standings

**A round only counts toward Lifetime Games if it was scored to completion or carried real units.** Final standings settles whatever units exist right now. Play nine holes for 20 units and never finish the card and final standings shows 20 units while Lifetime Games shows 0 units — unless units actually changed hands, which now does count.

Two more things worth knowing:
- **Tournament prize pool unit totals count.** Event prize pools (Skins, Nassau, Long Putt, CTP, GIR pool, Fewest Putts, Stroke prize pool) were never included in lifetime units — only your group's own side games were. Every event prize pool in the app's history was missing before this, so older lifetime totals were understated
- **Multi-day event units are counted once.** A two-day event used to record your unit totals on both days and show double; the full event net now lands on one round and the others read 0 units, and older entries repair themselves
- A round deleted on one phone drops out of that phone's Lifetime Games immediately, while a second phone keeps counting it until the deletion syncs

### Rounds From a Deleted Tournament

When a commissioner deletes a tournament, the rounds played in it used to keep the 🏆 trophy forever, pointing at a screen that could never load — and they kept counting in everybody's numbers.

**What happens now:**
- **No round is ever deleted.** Every score, every card and every unit stays exactly where it is
- The trophy stops being drawn, and the summary's **Tournament results** button hides
- Those rounds drop off the **Rounds** tab, **Home → your rounds**, and friends' stats round lists
- **They stop counting in the numbers** — handicap index, Lifetime Games, average score, best round, round count, hole-by-hole, the differential chart, the you-vs-friend comparison and crew board totals. *(A measured example: 20 rounds became 10 counted, index moved 10.9 → 10.3, lifetime units 200 units → 100 units — with all 20 rounds still stored.)*
- **The deletion syncs to the other players' phones** now — on launch, and at most every 10 minutes while the app is open. Before, only the phone that pressed Delete knew
- The old ambiguous **"Tournament not found"** message is now two distinct ones: **"That tournament was deleted"** vs **"Couldn't reach the tournament — try again."**

> **One known limitation.** Deleting a tournament reliably removes its rounds from **your** view and from every other player's view — every device drops its copy. But a round **owned by another player** still has its row on the server behind that. It's hidden everywhere and it counts for nothing; it just isn't erased. *(Deleting a **league** is different — it genuinely voids the rounds it launched. See the Leagues section.)*

### Round Settings Card

**"⚙️ Settings"** (collapsible):

**Round pop-ups** — 🐦 birdies & eagles · 🍺 sips · 💥 blowups, on **this phone**.

**Stats visibility** — **Everyone** · **Friends only** · **Just me**. *(When two accounts share a name the app keeps the more restrictive setting of the two. A change that doesn't reach the server now says so — this is a privacy setting and it used to confirm silently either way.)*

**Drive distance estimate** — auto-log drive distances from GPS.

**Alert friends** — notify friends when you start a round.

**⌚ Plays-as distance on Apple Watch** — wind/slope-adjusted yardage on the wrist, or plain GPS yardage when off.

**🔔 Push notifications card** — round start, round added, friend requests, and tournament group launches.

### Cloud Backup

If a restore can't reach the cloud, the app says so. It used to report **"No cloud backup found for your account."** on a *failed read*, which invited people to re-enter rounds that were sitting safely in the cloud the whole time.

### My Clubs *(PRO)*

Define your real bag's distance ranges so GPS recommends from **your** clubs instead of amateur averages: one input per club with a **distance range in yards**, custom labels (e.g. "PW 45°"), blanks to skip clubs you don't carry, drag-to-reorder by the ⋮ handle, and a **"Reset to standard bag"** button.

### My Shots *(PRO)*

**"📋 My shots"** logs drive estimates and tracked shots with date, hole, course, distance, wind, temp and club. Searchable and filterable; tap **×** to delete a shot.

---

## Rounds Tab

The Rounds tab holds open rounds, scheduled rounds, your saved round history and round templates. *(This is the tab formerly called Events. Tournaments live on **Tourney**.)*

**Your rounds are yours.** Every account used to read and write one shared list, so everyone saw everyone else's rounds. Rounds are stored **per account**.

### Past Rounds List

- Cards sorted by date (newest first) showing **date**, **course**, **players**, **final score**, **status**, and the **home / away** badge
- **🏆 trophy** marks a round played as part of a tournament *(it disappears if that tournament is later deleted)*
- **"Search course or player…"** finds rounds by course or player name
- **View** on a completed round opens the **💵 Games sheet**
- The list paints from cache immediately and quietly refreshes a moment later if anything actually needed correcting

**A collapsed "Finished" tournament row** is a single card now, not a row inside a wrapper card. The status pill sits on the meta line underneath, and the title column is wide enough that a long event name shortens to one line with an ellipsis instead of stacking down the left edge. The subtitle reads **"1 day · tap for results & details"**.

**Why a finished round sometimes sits at the very top:** the top section shows live rounds **plus** finished rounds that never made it into your stats history. A finished round up there is a deliberate signal that it wasn't recorded to your stats — not a sorting glitch. *(Most of those now heal themselves — see "Missing Rounds Fix Themselves" above.)*

### View Round

Tap any past round card to open the **💵 Games sheet** — final scores, units settled, the full scorecard with gross and net, the whole-event block on a tournament round, and **🔓 Reopen round**.

### Deleting a Round — Who It Affects

- **"🗑️ Delete round"** removes the round **from your list only.** Other players keep it. If it counted toward your handicap, it's removed and your handicap recalculates
- **If you aren't the host**, deleting only removes it from your phone and the app says so: **"Removed from your rounds — only the host can delete it for everyone."**
- **When the host uses "Delete for all", everyone else's phone closes the round in real time** with *"This round was deleted by the host."* Players used to keep scoring a round that no longer existed
- **Deleted rounds stay deleted.** Deletions are recorded permanently and merged rather than overwritten, so a friend's stale copy can't revive one — and a round you deleted drops off the Friends tab's **Live now** immediately
- **A personal removal can never become a global delete.** It used to: the confirm dialog promised "Other players keep it" while actually deleting the round for every user and stripping it from every player's score history, which dropped their handicap index. Personal removals go to a private per-user list

**A stranger's round in your list?** If someone in the library shares your name, their round can land in your list. Remove it with the **"×"** next to the row and choose **"Just my list"** — **never "Delete for all."**

### Manual / Past Round Entries

**"⛳ Add a Round"**: date picker → course search → gross score → tee → holes played (9 or 18) → **Save**.

### Scheduled Rounds

- The list is **personalized to you** — only scheduled rounds you're actually in, plus templates you created
- Tap a scheduled round to **edit its setup or start it now**; tap a template to load the whole setup into Play
- Phantom **"SCHEDULED"** rows left behind by a duplicate launch clear themselves on the next load

### Invites

- Every invite type — round, tournament, open round — **expires after 14 days**
- Finishing a round, deleting it for everyone, an admin ending it, or deleting a tournament all **retire that round's invites for everyone at once**. No more Join buttons that lead nowhere
- **"Grab a spot"** can't be double-tapped into two seats
- **An invite you accept now tells you if it didn't go through** — accepting used to report success either way

---

## Times Tab (Tee-Time Calendar)

The **Times** tab (More → Times) is a shared **tee-time calendar** for you and your crew. It opens on today, shows the next ~30 days at a glance, and pages a full **12 months** ahead. It's free, not a Pro feature.

### The Calendar

- Opens on the **current month with today highlighted**
- **‹ ›** arrows page months; the **"Today"** button jumps home
- Each day cell shows a **compact count** ("3 ⛳"); days with open public slots get a subtle accent dot
- **Tap a day** for that day's tee times in time order — time, course, spots open ("2 open / 4"), who's in, and a **Public / Private** pill
- **Tap a tee time** for the full roster and the actions you're allowed to use (Join, Invite, Add player, Edit, Cancel)
- **Finished rounds don't advertise seats** — a closed row reads **"Played"** or **"Closed"**
- **Past days are read-only** — visible but dimmed, with no **"+ Add"**
- **Duplicate rows collapse** — a round restarted under a second code shows once

### Adding a Tee Time

Tap the sticky **"＋ Add tee time"** button:

- **Course** — pick from the library; you can add **several courses** in one batch
- **Day(s)** — one date, several dates, or a range
- **Time(s)** — one time, or several on the same day (7:40, 7:50, 8:00), with an **"⏱ Auto-fill times"** helper
- **Group size** — how many spots the tee time holds (default 4). **Open slots = group size − players already in**
- **Players (optional)** — pre-seat anyone you know is coming
- **Public or Private** — Public = all your friends/crew can see and join; Private = only people you invite

Pick 3 courses across 4 Saturdays and Bad Golf creates all 12 tee times together. *A fast double-tap on Save can't create two tee times and two rounds of invite pushes.*

### Filling the Spots — Invites & Auto-Add

- **Invite:** **"Invite to this tee time"** sends an in-app invite (with a notification) or opens the **share sheet** with a join link
- **Add player (auto-add):** as the creator, add a crew-mate straight into a spot — they still get a notification ("Tyler added you to a tee time at Cedar Crest, Sat 8:20am") and can drop out
- **Move players around:** drag anyone between tee times with their dropdown
- When every spot fills, the tee time closes and rolls into your **Scheduled Rounds**

### Telling Players Apart

- **Full names** on the top line, with a second line showing up to two of **crew · home course · handicap** (a placeholder handicap is marked **(TEMP)**)
- **Colour-coded avatars** — each player gets a consistent colour when they have no photo
- The list is **ranked** crew first, then whoever you've played with most recently, then alphabetical

### Sharing the Calendar

**"Share calendar"** opens the share sheet with a link. Whoever opens it lands on the Times tab and sees your **public** tee times. Private slots never show through a shared link unless that person was individually invited.

---

## Tourney Tab (Events & Tournaments)

**More → Tourney.** Events are big-group outings — 6+ players, multiple carts, one leaderboard. *(The "+ New event" button carries a PRO badge.)*

### Creating a Tournament

**Four event types**, each explained in the dropdown as you select it:

| Type | What it is |
|------|-----------|
| **Two Large Teams** | the classic two-sided event |
| **4 Person Teams** | four-player teams |
| **🆕 Small Teams (2-man)** | a field of two-man pairs |
| **Individual** | one day, many carts, one leaderboard |

**Setup flow:** name and date range → players → teams → courses (one per day if multi-day) → games → save and share the invite link.

**Small Teams (2-man)** replaces the two team-name boxes with a **"How many 2-man teams?"** picker, pre-filled from your player count, and prints a live sanity line — e.g. *"Perfect — 16 players makes 8 pairs. Two whole teams ride in each cart."* You name the teams afterwards under **Team names & logos**, so you're not typing eight names before the event even exists. **24 players / 12 two-man teams** is the tested maximum.

Other creation behaviour:
- **The form starts empty** — it used to bring back the previous tournament's name, team names, location and settings
- **No accidental duplicates:** the create button disables itself and reads **"Creating…"**, with duplicate protection at three layers. Two commissioners tapping "Start Day 1" at the same time can't produce two sets of rounds, and two groups can no longer be handed the same round code
- **Server-side limits:** 10 tournaments per hour / 40 per day per commissioner, and 300 invites per hour / 1,500 per day per sender

### 2 to 12 Teams

A tournament can run **anywhere from 2 to 12 teams**. Twelve is a hard ceiling.

**Where you set it:** **Manage → "Team names & logos"**, with a **"How many teams?"** picker at the top. Setting it to N draws N name rows, each with its own colour dot and logo slot.

**Fun default names.** A multi-team event pre-fills: **Shank Redemption · Bogey Nights · Fairway to Heaven · Putt Pirates · Bunker Mentality · Mulligan Militia · Grip It & Rip It · Turf Surfers · Sultans of Slice · Divot Dynasty · Driving Ambition · Par Bandits**. Type over any of them and yours wins, and there's a **"Use Team A, B, C… instead"** button to go back to plain labels. *A classic two-team event keeps plain **Team A / Team B** — the funny names are for multi-team events only.*

> **⚠️ Events created before 18 August 2026 may carry damaged team names.** Every team past A both *displayed* team B's name and *saved into* team B, so naming team G renamed team B. A live event was found with team B literally called "Team H". That's fixed, each row is colour-coded with its own team dot, a failed save says so rather than vanishing, and a stored name that's obviously another team's generic label is healed automatically. **Check your team names on any older event.**

**Players auto-balance.** Adding a player lands them on **whichever team is currently smallest**, so a fresh 16-player event self-fills eight pairs of two. **Auto-assign** deals a **serpentine draft** across every team — best player to team 1, then back down the order — so handicaps stay level.

**The cart builder pairs teams two at a time** — **(A,B) (C,D) (E,F) (G,H)** — so partners ride together and every cart is a natural two-team head-to-head. It used to filter to teams A and B only, which would have left teams C onward off the tee sheet entirely.

### The Setup Wizard

- **Every step has a Close button now.** Step 0's dead **Back** became a real **Close**, and every other step gained one under the nav. Since v477 no step had a close button — the only exit was the **×** pinned above the fold of a scrolling modal, which is unreachable once eight team cards are drawn
- **"Add players" is players only** — one flat roster of **name + handicap + remove**, and it points you at **Carts & teams** for placement. It used to group everyone under per-team headings with a team dropdown on every row, asking you to place all 16 players there and then again on the next screen
- **The Add New Player modal no longer asks for a team.** That field only ever listed Team A and Team B, so six of eight teams were unreachable. Players auto-balance; teams are set in one place
- **A blocked step tells you why.** **Next** stays greyed but is live, and naming exactly what's missing: *"2 groups still need a scorekeeper: Group 2 and Group 4."* / *"3 players not in a group yet: Marcus, Corey and Julian."* / *"4 players still need a tee: Owen, MC, Marcus and 1 more."* A disabled button fires no click at all, so tapping Next used to do literally nothing
- **Adding players is much faster** — a single database call instead of seven. Sixteen players went from about 6.8 seconds to 2.9

### Assign Tees, Carts and Tee Times

- **Assign tees** appears on one-day and individual events, not just multi-day team events
- **🛺 Configure Carts** draws **one card per team (2–12)**, each with its colour stripe and dot, plus an **Unassigned** card so no player can be hidden. Past two teams the per-player **"→"** arrow becomes a **team picker**. It used to draw exactly two hard-coded cards, so in a four-team event teams C and D were invisible and their players looked unassigned
  - Group size limit is **8**, a deliberate big group of 5–8 stays put instead of being force-split back into 3+3, and adding a 5th player doesn't spawn a second group. **"👥 One group"** clears the day's groups and seats the whole field in Group 1. Empty groups auto-prune and don't block advancing the day
  - Opening Configure Carts doesn't delete and rebuild the day's groups on render — that used to orphan live rounds and erase every tee time and scorekeeper. Use the explicit rebuild buttons
  - Each group's box is a labelled **TEE** field, and headings read **Group 1 / Group 2 / …**
- **⏱️ Tee Times** — a screen of its own in the event settings hub directly under Cart Configuration, subtitled *"Each group's start time · auto-stagger"*, plus an **"⏱️ Tee times — optional"** button in the setup wizard. Set the first group's time and tap **Stagger** to space the rest out. It's day-scoped on multi-day events and **never blocks 🚀 Start Event.** Open it before the day's date is saved and you get *"Set the date first so the day is saved."*
- **Withdrawals** — the player-withdrawal control is reachable (it existed but was never rendered, so a commissioner's only option was × Remove, which deletes the roster row and all group memberships). Withdrawing on a leaderboard-only day (stroke, quota) doesn't hand the other team a cup point, and **a withdrawal forfeit awards the point to the actual team** — any non-A withdrawal used to forfeit team B's point
- **A group of one** doesn't silently strand a player with no scorecard

### Tournament Games vs. Group Games

Two clearly distinct screens with different accent colours:

- **"🏆 Tournament Games"** — whole-field games the commissioner sets
- **"👥 Group Games"** — each foursome's own action

**On Configure Day there are no per-game player pickers** — a tournament game is a field game, and participants are the whole field.

**No game disappears without saying why.** A main tournament game is **never hidden for a player-count reason**. It stays put, greyed, with the reason under it — *"Needs an even number of players — the field has 15."* / *"Needs 4+ players — there are 2."* Games that genuinely don't belong (not a tournament game, or the in-group twin of an Event Prize pool) still hide. *(A tile could also reappear on screen still flagged disabled — looking available while ignoring every tap. Fixed.)* **The Games header prints the running build number**, so a stale cached bundle is identifiable at a glance.

**Configure Day keeps your work:** your checked games, participants, and Nassau/Match instances survive backing out, **including leaving by tapping a bottom-nav tab.** Nothing is written to the event until you tap **Save Day**.

**Per-day handicap allowance** is settable by the commissioner on Configure Day. Group-level config stays locked out.

> **"Nassau isn't listed in my group's games" is by design.** Groups can't edit or shadow an event's games, so the event's game keys are hidden from the group's list. Change it at **Tourney → event → Configure Day → Games**, or **Event Prize pools → Nassau** for the field prize pool.
>
> **Day-game changes don't retro-fit an already-launched round.** Adding or changing a day game after groups have launched only affects rounds launched afterwards. CTP is the one exception — each group's round heals itself when opened.

### 🏹 Team Quota Across the Field

Set the entry on **Configure Day → Team Quota** and pick the award shape — **winner takes all**, **top 2 at 70/30**, or **top 3 at 50/30/20**. The maths shows live.

**Worked example:** 16 players at 20 units = a **320-unit prize pool**. Winner-takes-all pays the winning pair **160 units each**. 50/30/20 pays **160 units / 96 units / 64 units**.

- Uneven teams refuse to settle, and the app names the team sizes. A **0-unit entry** pays nothing
- The field must be **evenly split** (8 v 8 works; 9 v 7 stops it settling entirely)
- **Field-wide quota totals used to dump every non-A team into team B's total** — a wrong number on a real-unit prize pool. Fixed
- **A cart holding a third team used to silently drop that team's players** — 16 players reported as 14, their points never counted and their team never appeared in standings or got a share of the prize pool. Team sides are read from the **event roster** now rather than the round's two team slots, and **past events repair themselves on read** — no migration, nothing to re-enter

**Where the standings show.** Three surfaces, all fed from the same numbers that settle the units:
- The **Games screen** under 🏆 Tournament total, above the per-game breakdown
- The **round Games sheet**, first item in the event block
- The **Event Leaderboard**, above the 💰 Awards buttons, in a block headed **"🏹 Team Quota — points vs quota"**

Each shows rank, team dot and name, member names, points, and units once settled — with a "Still in progress" note or the prize pool size otherwise. **Every team in the event is listed, including ones with no scores yet.** Before this, nothing in the app told you who was *winning* a Team Quota event; you could only see units.

*Your foursome's Games screen shows your group's points plus a line saying the Event Leaderboard is where it settles. Both screens used to show unit figures for the same named game, and they disagreed.*

### Officials Who Don't Play

A director can add someone as an **"Official (not playing)"** — a co-commissioner who tracks the games but isn't in the field. They get full manage rights **without being on the roster**, so they never appear in a prize pool, in the standings or in Unit Totals. Everyone on the event sees a **"📋 Officials (not playing): [name]"** line on the event home screen.

You can add an official by name or email even if they've never played in the event.

### Sitting a Player Out of One Game

**Per-player opt-outs**, set by the director. A player who opts out of a game isn't charged into its prize pool and doesn't grow it for anyone else.

- **Birdie Bump, Closest to the Pin and Long Putt** each carry their own sit-this-one-out list
- **The event-wide pools** — Skins, Low Net, Most GIRs, Fewest Putts and the Long Putt pool — have the same picker, reached through **"🎯 Who's in each prize pool"** in tournament settings
- **Closest to the Pin and Long Putt no longer charge a no-show.** A player who never posted a score can't be pulled into a field pool, or win one

### Games That Now Settle in the Right Scope

**Birdie Bump can be tournament-wide.** Selected at tournament level it used to still pay out only inside each foursome. It now genuinely pools across the whole field.

The same fix reached every other tournament-selectable game that can't physically be played across carts — 6's, Niners, High & Low, Vegas, Team Low Ball, Combo Score, Team Match and the rest. Each settles in whichever scope actually makes sense for it, instead of some of them quietly paying nobody.

### Getting a Guest Into an Event

Someone added to a roster by name, with no account yet, sees an **"Is this you?"** card the moment they sign in — they no longer stay invisible until somebody claims them by hand.

**Starting a tournament day** also surfaces a list of any roster names with no linked account, each with a one-tap **Copy / Share** invite link.

*The "tap your name" link a director shares was broken for anyone not already a member of the event — a permissions gap. That's fixed, along with several tournament links that opened nothing when tapped from inside the app.*

### Cup Standings

Cup points are kept **per real team**. At **three or more teams** the tournament home cup card becomes a **ranked standings table**; at two teams it keeps the familiar head-to-head line. Every cart's local "A" used to be summed into one number and every local "B" into another, so a headline like `Team A 4 — 3 Team B` was meaningless in a multi-team event. The **lead-change chat post** names the leader out of however many teams are playing.

### 💵 Event Prize pools

**"💵 Set up event-wide prize pools"**, subtitled **"Whole-field pools — separate from any group's own games."** Each button shows a green **ON** or muted **off** tag.

The prize pools: **Low Net**, **Most GIRs**, **Fewest Putts**, **Long Putt**, **Tournament Skins**, **Tournament Nassau**, **CTP**, **Long Drive**, field **Stableford/Quota**, and the **Scramble Prize Pool**.

*The "set up event-wide prize pools" chips that used to sit on the Event Leaderboard have been removed — Settings → Event Prize pools is the one place for them now.*

**⚠️ The menu warns when a prize pool is ALSO switched on as a day game**, listing the duplicates and stating that **the event prize pool is what pays**. The matching day game is suppressed so the game can't settle twice (it used to move roughly 190 units where ~70 units was intended). A day game with **no** matching event prize pool still settles exactly as before.

**A field prize pool covers the whole event; a round-level pool covers only that group.** If someone expects a field-wide Low Net, it has to be the **Event Prize pools** version, switched **ON**, with the right value.

> **There is no field-wide Birdie Bump.** It's a group-level game only — each foursome runs its own.

#### ⛳ Scramble Prize Pool

**Event Prize pools → Scramble Prize Pool** is the commissioner control for a field-wide scramble.

- **On/off**, **unit entry per player**, **award** (winner takes it, ties split — or 80/20), and **scoring** (gross, or net using the standard descending scramble allowance)
- The menu row shows a live summary, e.g. *"20 units/player · winner takes it · gross"*
- **How it pays:** each cart group is a team, teams rank by team total (low wins), **every player pays the entry** (so a 4-man team puts in 4× and an 8-man group isn't advantaged over a 3-man one), and it pays winner-take-all (ties split) or 80/20. Net scoring uses **25/20/15/10% of the four lowest handicaps on the team**
- It settles once every group is in, and shows on the combined board as **"Scramble (field)"**
- The modal carries the warning inline: **a scramble team plays one ball, so Skins, Low Net, Most GIRs and Fewest Putts cannot settle on a scramble day**
- No per-group resync is needed after changing it

### 💰 Awards

The Event Leaderboard has a **"💰 Awards"** section with **two** buttons — the same wording as the Games screen's chips:

- **🏆 Tournament total** *(always shown)* — everything combined: every group's games plus every event prize pool
- **👥 Group total** *(only when you're in a group)* — just your own group

**They navigate to the 💵 Games screen with the right scope already selected.** They used to open a second award screen stacked on top of the leaderboard, with its own layout and its own share button — which is exactly why people got "different screens depending on what you hit". That stacked screen is gone, and a third option, **🏆 Tournament award**, has been retired with it. Back always means back one step. Tapping **🏆 Tournament total** while playing your own round does **not** flip it into view-only — your round stays editable.

**If you're not in a cart** — a non-playing commissioner, or a spectator — the event's ranked unit rows and who-trails-who lines **render inline on the leaderboard itself**, with the provisional note when groups are still out. No overlay, no new screen. You used to get a Tournament total button that dropped you into some other cart's board in spectator mode, with the chips reading "Group total" for a group you weren't in.

**Total shows a live provisional board mid-event**, with a small **"Provisional — X of Y groups finished"** notice above it. Every player in the event is listed, **even at 0.00 units.**

Each prize pool renders as a **PRIZE POOL / WINNER / WINS** row with a grey detail line. Prize pools that can't settle until every group finishes show **still live / not settled** rather than a bare dash.

**The final standings text always sends both totals.** A tournament round's **📲 Text Final Standings** sends the whole-event total — standings, per-game breakdown, who trails who — marked **⚠️ PROVISIONAL** with a count of groups still out if it isn't final, and then **your group's own games** labelled *"already counted in the totals above"* so nobody pays twice. It used to withhold the event-wide total until every group had finished, so a text sent while one cart was still on 17 carried the side games and none of the event units.

> **Support note on mid-final-standing totals:** while an event reads **PROVISIONAL — 1 of 2 finished**, Skins, CTP and Long Putt are deliberately withheld, so the board will not sum to 0.00 units and cannot be compared against final figures. Once the last group finishes it balances to the unit.

**Slow groups no longer freeze the prize pools forever.** **Long Putt, field Skins and CTP** pay out once the last scheduled day is past, even if one group never finished. *While it's still the scheduled day, the old rule applies — every group must finish — so a slow group finishing at dusk can still take a prize pool.*

### Tournament Results

**"📊 Tournament Results"** opens the event leaderboard. Under **"💰 Awards"** there is now a shared block headed **"Field prize pools — who won what"** covering **CTP, Most GIRs, Fewest Putts, field Skins and Tournament Nassau**. Those five had **no display code on that screen at all** — the Games screen showed them correctly, so the units were always right, but Tournament Results simply didn't draw them.

- **Long Putt is deliberately kept out of that block** and keeps its own richer section, which shows the mid-round leader (e.g. *"leading, 1 of 3 groups finished"*)
- **Long Drive** stays commissioner-set with its **Set winner** button
- An event with no field prize pools shows no empty heading

### Unit Rules Worth Knowing

- **Cross-group games are per-day.** The same pair matched on Day 1 and Day 2 used to settle only one match, sometimes using the wrong day's scores — that was the mechanical cause of "my total should equal my group games plus my tournament games but it's off"
- **Cross-group matches and Nassaus wait until they're actually decided** — a 100-unit cross-group match used to book the full 100 units after one hole
- **Players are matched on full name**, not first name. Two Mikes used to collapse into one, and one Mike's unit totals landed on the other
- **9-hole tournament days scale your handicap at launch** and pay out their field side prize pools
- **A field skins prize pool with no outright winner refunds or carries** — it used to charge everyone their entry and pay nobody
- **Whole-field Stableford/Quota pools pay out** even when a registered player never tees off, and a multi-day event charges every day's entry (it used to charge only the last day's, paying out about 11% of what it should)
- **No retroactive re-pricing.** Handicap, hole count and the day's allowance are stamped when the round launches, so changing settings later never changes a saved or finished round's units
- **"Final standings" uses the round-level unit engine**, so it agrees with the in-round bubble and the group board; **field and event-wide prize pools appear on the separate award board.** That's why the two screens show different numbers

### Viewing Tournament Details

**From the Tourney tab:**
- See all upcoming tournaments; tap for **Leaderboard**, **Schedule**, **Teams** and **Rules**
- **"📋 View my group's board"** always lands on a read-only Games view
- **"📊 Tournament Results"** opens the tournament leaderboard

**Live during a tournament:**
- **Leaderboard updates** in real time
- **Tap a player** to spectate their GPS
- **You get a push when your tournament group's round starts.** Recipients are matched by **account**, not by typed name
- **The field scorecard shows the whole field**, with real team letters, an Out/In split and net under gross. Entrants whose cart group never started appear as a dimmed dashed row labeled **"not started"** instead of vanishing
- **Large fields aren't truncated** — the leaderboard, whole-field standings, team standings, CTP and every field prize pool used to cap at 100 rounds with no ordering, so a 128-player 4-day event could lose up to 28 groups
- **Status pill accuracy:** an event where all launched groups are finished but some never teed off reads **"N groups not started"** with no live dot
- **Tournament data is visible only to its own members**
- **Finished public events drop out of "Public events you can join"**
- **Tournament notifications unsubscribe properly** — players used to get "🏆 Team Rhino takes the lead 4–3!" during unrelated rounds the next day
- **The leaderboard's 🔄 refresh button works** on a one-day event that also has cup-format group results (two elements shared an id, so one refresh button was dead)

**On a weak signal:** the results board still renders, but toasts once that **"totals may be incomplete"** rather than showing a confidently wrong number. **Tournament chat** refuses to post and says the message wasn't sent, rather than replacing the entire chat history with a single message.

### Finished Events Collapse

Finished tournaments render as a **single-line card**: thumbnail, event name, **"N days · tap for results & details"**, a **"Finished"** pill and a **"▾"**. Their group and round data isn't loaded until you tap, which is why the list opens almost instantly. **"▴ Collapse"** folds it back. Live and scheduled events stay fully expanded.

**Past rounds on the Tourney tab** open the same **💵 Games sheet** as Home.

**Commissioners and admins see every group's card**, each with its own Join / View-results button. Regular players see only their own group. A group's games line shows games configured **anywhere**, and cross-group **Match** / **Nassau** shows on **both** groups' cards.

### Deleting a Tournament

Deleting an event marks it gone at the moment you delete it, and **that propagates to every other player's device** — on launch, and at most every 10 minutes while the app is open. Before, only the phone that pressed Delete knew, so everyone else kept seeing a trophy pointing at a screen that could never load.

**Rounds and scores are never deleted.** They just stop being listed under, and counted for, an event that no longer exists — see [Rounds From a Deleted Tournament](#rounds-from-a-deleted-tournament).

Deletions accumulate rather than overwrite, so two commissioners deleting different events can't clobber each other, and a stale device can never *un*-delete an event.

> **Tournament templates have been removed.** The Tourney tab's template card, **"Save as template"** and **"Use template"** are gone. Round templates (Play tab) are a separate feature and still work.

---

## Leagues

**More → League.** A league is a season-long competition — a group of golfers who play a scheduled series of weeks against each other or against the field, with running standings, league handicaps and units tracked automatically. Leagues live in their own tab, separate from casual rounds and tournaments.

**Leagues are out of beta and open to every signed-in user.** There is no invite list, no access request and no BETA pill — sign in and the **League** tile is in the **More** sheet. It is the one thing on the More sheet that needs an account: a league seat is tied to a user, so a guest has nothing to attach to. Sign in and it appears.

**Two places explain leagues without leaving the app:**

- **More → Info** has its own **Leagues** section — seven drop-down explainers covering what a league is, joining one, weeks and missed weeks, scoring and handicaps, side games, how the money works, and running one. It sits right after the two handicap explainers on purpose, because a league week is scored net and the handicap sections come first.
- **The welcome tour** has a **"Leagues — play a season"** card, fifth of six, after Side games and before the closing help card. It points at the **More** tab, the same place the card after it points, so the two read as one thought: here's the feature, and here's where it lives.

### What a League Is

- A league runs one **season** at a time, made of weekly **fixtures**. The season is **6–12 weeks**, set with a slider at creation.
- Every league is one of three **shapes**, picked by the commissioner:
  - **Individual — against the field** *(default)* — no opponents; everyone posts a score each week and the standings rank the whole roster
  - **Individual — head to head** — you're paired against one opponent each week, round-robin
  - **Team league** — 2-man teams, paired head to head
- The commissioner also picks the **game**: Stroke play, Stableford, Match play, Stroke play head to head, Stableford head to head, Scramble, Team match play or Team Stableford. Only the games your shape allows are offered.
- Every league has a **logo** — a monogram by default, or a badge or photo the commissioner picks.

### Joining a League

Leagues are **invite only**. There is no join code to type.

- **The commissioner adds you** to the roster using the same player picker as tournaments and rounds — search Bad Golf users, filter to **⭐ Friends**, or **"➕ Add a player"** for someone who isn't on the app yet.
- **One link, texted to the group.** Whoever taps it signs in, sees **"Which one are you?"** — a list of roster names nobody has claimed — and taps their own name to claim their seat.
- **"👋 Is this you?"** — if your account name matches an unclaimed seat, the League tab offers it to you directly, no link needed. **"That's me"** claims it; **"Not me"** dismisses the card and it won't ask again on that device.
- A name that doesn't quite match the account claiming it — a nickname, a shortened name — is still allowed. The commissioner sees a flag on the roster rather than the claim being refused.
- Once every seat is claimed the shared link stops offering anything.

**Tapping the link while signed out works.** The app holds on to the invite, opens the sign-in box and tells you why — *"Sign in to accept your league invite"* — then finishes claiming your seat for you once you're in and your name is set. You don't have to find the text again.

### The Week Screen

- **Your current fixture** sits at the top, with a **Standings** button — the one solid-colour button on the screen — and administrative actions like **Update players** as outlined buttons.
- **Each fixture card** shows its own status — **not started / in progress / complete** — and a **Start** button marked **"· yours"** on the fixture you're actually in. Other people's fixtures are still open to view, and to join if their round has already begun. Looking isn't starting.
- **Rules** — a member-facing **"How this league works"** screen listing the game, the points system, the handicap method and the distribution structure, and which week's settings each came from.

### League Night

- A week **auto-opens about 48 hours before its date**, the first time any member opens the app after that point. The commissioner can open a week early.
- **No tee times are collected.** Setup and the week screen ask only for the **day** — the card reads "Tue, Sep 1", not a time. Tee times are between you and the pro shop.
- **Nine-hole leagues rotate front and back nine automatically**, and a week card shows a front/back picker. **Eighteen-hole leagues** don't show that picker at all.
- Rainouts use **"Change the day"** on the Schedule screen, which moves a week's date without touching its pairings or numbering.

### Entering Your Card

Two ways a week's score reaches your league card:

- **"Start this week's round"** — launches the round from inside the league, so your card posts itself when the round finishes. In a field league you're placed in a **foursome** for the week; in a head-to-head or team league each fixture is its own round.
- **"Pick a round I already played"** — attach a casual round from this week as your league card. Only offered if the commissioner turned on self-scheduled rounds.

**The witness rule.** A card settles the moment at least one other active league member was in the round with you — normally your opponent, but a groupmate counts. If nobody else from the league was there, your card takes the **solo path**: it sits **pending approval** until an opponent or the commissioner approves it, or auto-approves after a set number of hours if nobody objects.

- In a **head-to-head league**, if your opponent has an account, you both need to have been in the round together — or they approve your card — for it to settle. If your opponent has no account, that match has to run from **"Start this week's round"** so one phone can score both sides.
- If the league requires rounds be played in the app, the commissioner **cannot** hand-key a missing score; the week screen simply reads **"not played"**. Turning self-scheduled rounds on for that week restores the manual **Enter card** option.

### Self-Scheduled Rounds

A league setting, **off by default**, that lets a round you played on your own count as that week's card.

- **It must be the week's course** — net scoring compares everyone against that course's rating and slope.
- **You pick which round**, from your qualifying rounds (right course, right hole count, played within the week's window — 6 days by default), and can change your pick until the week finalizes.
- **Finish any round** that fits an open week and the app asks right there: **"Post this round to <League> — week 4?"**

### Handicaps in a League

A league handicap is the **exact number of strokes** the commissioner gives a player — **not** an index converted per tee, rating or slope. Type 12 and that player gets 12 strokes, every week, on any course the league plays.

- **Set once for the season, not weekly.** The handicaps screen has an **"Apply from"** week selector: save a number and it applies to that week and every later week that hasn't opened. Weeks already played keep the number they were played under.
- **"⛳ Use Bad Golf handicaps"** fills every player's number from their own index, behind a confirmation showing exactly what will change. Players with no index are named and left blank.
- **On the roster screen**, each player's row carries its own **HCP** box the commissioner can edit directly.
- Handicaps **lock the moment a week opens**.

### Match Play and Head to Head

- **Match play** — 1 point per hole won, ½ for a halve, plus a **3-point bonus** for winning the match. A 9-hole week is worth **12 points**; an 18-hole week is worth **21 points**.
- **Stroke play head to head** and **Stableford head to head** — the low net total (or higher Stableford total) takes the match outright, worth 1 point, ½ for a tie.
- The week screen and the standings show the running match state — score, holes remaining, and which side is up.

### Team Leagues and Team Scoring

Teams are 2-man. The commissioner picks **one team scoring rule for the whole league**:

| Rule | How a team's score is built |
|------|------------------------------|
| **Best ball** | Each hole, the **lower** of the two partners' net scores |
| **Aggregate** | Each hole, the **sum** of both partners' net scores |
| **Scramble** | One ball, one card — a single shared score, nothing to combine |

If only one partner posts a card, **the team plays that one card** under either rule, so nobody is penalized for a missing partner.

**Worked example — two holes:**

| | Hole 1 | Hole 2 |
|---|---|---|
| Team A, Player 1 | 3 | 5 |
| Team A, Player 2 | 7 | 5 |
| **Team A — best ball** | **3** | **5** |
| **Team A — aggregate** | **10** | **10** |
| Team B, both players | 4 / 4 | 4 / 4 |
| **Team B — best ball / aggregate** | **4 / 8** | **4 / 8** |

Under **best ball** the match is halved — each side takes a hole. Under **aggregate**, **Team B wins both**. Same two scorecards, opposite results, which is exactly why the commissioner picks the rule rather than the app guessing.

### Substitutes

If a player can't make a week, the seat is filled directly — there's no invite-and-wait queue.

- **"➕ Add a sub"** opens the standard player picker: pick an existing user or add a guest, confirm their handicap, done.
- **"Update players"** sits on the Schedule screen next to "Change the day", on any unplayed week. **Sit out** on a player opens the sub picker immediately, and the seat then reads **"Out · <sub> is in"**. **Back in** reverses it.
- The scoring rules for a sub are fixed, and worth knowing before an argument starts:
  - **League points go to the side being subbed for** — the match and the standings credit the absent player's seat, not the sub
  - **Weekly pools charge the sub** — whoever actually posted the card pays into, and can win, that week's skins, low net and the rest
  - **Stats save under the sub** — their own handicap and round history record the round, because they played it
- A designated sub never counts toward the pairing math, never appears in the standings, and **never pays the season entry** — but does pay into the weekly pools on nights they play.

### Side Games and Season Pools

**Two separate systems, and they are easy to mix up.**

**Side games** *(Settings → 🎲 Side games)* — the ordinary round side games (skins, closest to the pin, fewest putts, GIR, low net, longest putt) stamped onto the round when the night is played. These settle **inside the group**, player to player, exactly like a casual round. Set once at league level; every week inherits it unless a week is overridden.

**Dues and pools** *(💵 Dues and pools)* — the league's own units ledger. It holds the **season entry (in units)**, the **distribution structure**, and the **weekly pools**, tracked across the whole season. **There are seven of them:**

| Weekly pool | Where the winner comes from |
|-------------|------------------------------|
| **Skins** | worked out from the posted cards |
| **Low Net** | worked out from the posted cards |
| **Most GIRs** | worked out from the posted cards |
| **Fewest Putts** | worked out from the posted cards |
| **Closest to the Pin** | claimed on the round card, one row per hole |
| **Longest Putt** | claimed on the round card |
| **Longest Drive** | the commissioner picks the winner by hand |

**Most GIRs** and **Fewest Putts** are the two newest. Like the other computed pools they tie-split evenly, and **only players whose card can actually be ranked are charged into them** — if your card has no putts recorded, you're not in the putts pool and you don't pay for it.

*Wolf, Banker and Nassau are deliberately not offered as league pools — they're built around a group of four negotiating hole by hole, which doesn't survive being scored across a whole league night.*

> **This is the one to check when weekly pools don't show up in the season ledger.** Pools set up under *Side games* settle inside the group's round and never reach the league's units screen. Only pools set under *Dues and pools* appear in the season totals.

- **Claimed pools** are asserted by someone tapping "I've got it"; a later claim on the same hole displaces an earlier one, and any member can challenge before the week finalizes. **Computed pools** come straight from the cards.
- **Everyone on the roster is in every pool that's switched on** by default. The commissioner can uncheck players for a specific week; an opted-out player isn't charged and the pool shrinks by exactly their share.
- **A pool with no winner recorded charges nobody.** A closest-to-the-pin nobody claimed, a longest drive the commissioner never picked, a skins week where every hole tied, a low net where no card qualified — all of those used to collect everyone's buy-in and pay nothing out, permanently. Record the winner later and the charge and the payout appear together.
- **A manual pool splits across the winners actually recorded**, not across the number of holes it was set up for. Four CTP holes with two winners recorded pays those two half each, instead of paying a quarter twice and stranding the rest.

**How the pools read on the awards and units screens:**

- **Closest to the pin gets one row per hole**, each with its own winner — *"Closest to the pin · hole 5"*, *"· hole 12"* — rather than four holes merged into a single row carrying three names and one arbitrary hole number.
- **Skins shows each winner's own skin count and the week's true total** — *"12 skins · 2.50 a skin"* — instead of borrowing the first winner's "1 skin" as everybody's label.

> **What an ordinary member sees vs. what the commissioner sees.** On the standings and money screens a **non-commissioner's** prize-pool cards are titled **"…what you won"** and carry the line *"Only your own winnings are shown here — the commissioner sees the whole field."* The card only ever listed the viewer's own ledger lines; without that title it read like the whole field's results, so a member who won one pool looked to himself like he'd won every pool. **Commissioners see the wording unchanged.**

**Worked example — a scramble team's weekly pool.** A 5-unit skins pool, 8 players, 4 scramble teams. A scramble side plays one ball, so it enters **once**: the pool collects **4 × 5 = 20 units** that week, not 40. The units screen says so out loud — *"5 units each team, each week · 4 teams — a scramble side plays one ball, so it enters once."*

### Season Standings

- **Head-to-head and team leagues** rank on points: weeks played, wins/losses/ties, with a countback tiebreak (back 9, then 6, then 3, then 1).
- **Individual field leagues** run a **to-par season race**: every posted card's net score, converted to strokes against the par of the holes actually played, adds to a running total. **Lowest total wins.**

> **A field league is strict about attendance.** Miss a week with no card posted and you're marked **OUT** for the season. There is no "best N of M" cushion. The only way back in is the commissioner entering your card by hand — which brings its own real strokes with it, not a free pass.

**Worked example:**

| Player | Rounds | To par | Status |
|--------|--------|--------|--------|
| Alpha | 2 | +2 | — |
| Bravo | 2 | +10 | — |
| Charlie | 1 | +8 | **OUT** — no card week 2 |

After the commissioner enters Charlie's missing card — a real +9 round — Charlie sits at **+17 over 2 rounds** and re-enters the race *below* Bravo, not above him.

### Foursomes

**Field leagues** don't pair one-on-one. The week is split into balanced foursomes automatically.

- Groups of up to 4 (adjustable, default 4), drawn in balanced sizes — 9 players become 3/3/3, never 4/4/1.
- **Any active league member can start any group's round**, not just players inside that group. Most leagues have members with no Bad Golf account, and a foursome made entirely of those players would otherwise have nobody able to tap Start.
- Each card shows its player count, the names, **"· yours"** on your own group, and a status.
- **Head-to-head and team leagues don't use foursomes** — each pairing is its own round.

### League Dues, in Units

Bad Golf tracks and reports league units. It does not collect or hold anything.

- **One season entry, in units**, paid into the season pool and distributed at the end. Set on the create screen.
- **Distribution structures:** **All to first**, **80/20**, or **70/30** — all three save correctly now. A tie for a paid place **splits that place evenly** — never a coin flip.
- **Weekly pools settle every week; the season pool settles at the end of the season.**
- The units screen shows a card per week naming that week's pools, a season card, and a running season total, with **Unit Totals** as the live who-trails-who summary.

**Worked example.** 8 paying players (of 9 on the roster — one is a designated sub) × 75 units = a **600-unit season pool**. Two teams tie for first under **All to first**: the 600 units split evenly across those 4 players — **150 units each**.

### Running a League (Commissioner)

**The create screen asks for six things:** league name · start date · league fee (the season entry, in units) · **"What do you play?"** (the format) · holes each week · **"How many weeks?"** (the 6–12 slider) · and **"Playoffs at the end?"** as a single switch.

- **Playoffs size themselves** once the roster is real — **top 2** for 8 or fewer players, **top 4** for 9 or more. Off, the line reads *"Whoever tops the season table at the end of week N wins the league."*
- Creating a league takes you **straight into setup**, never back to a list.
- **Split seasons and flights were both removed** from setup deliberately, to keep the create screen simple.

**The setup wizard**, in order: **Players → Game → Teams\* → Course → Schedule → Handicaps → Side games → Dues and pools**. *(\*Teams only appears for a team league.)*

- **Game** — changing to a game with a different fixture shape **clears any pairings already generated**. You're warned first, then routed into rebuilding the schedule.
- **Course** — required before the schedule can be built; picking one stamps every week that hasn't opened.
- **Handicaps** is the last required step before a league is playable, and finishing it routes into **Side games**, then **Dues and pools** — both used to be easy to skip.
- Every step is reachable later from **Settings**, which carries full-width buttons for **Schedule**, **Course details**, **⛳ The game**, **🔀 League shape**, **🎲 Side games** and **💵 Dues and pools**, plus **Teams** on a team league, **Delete**, and **Back**.

**Schedule actions:**

- **Rebuild the schedule** regenerates the whole round-robin pairing set. There is no "reshuffle just this week."
- **Change the day** moves one week's date without touching pairings or numbering.
- The Schedule screen prints a round-robin **fit verdict** computed off the actual roster — e.g. *"8 players need 7 weeks to play everyone once. Over 6 you play 6 of the 7 rounds, so each player misses 1 opponent."*
- **Update players** and a sub flag (**🔁 name in for name** / **⚠ name is out, no sub yet**) appear on each week's card.

**Entering somebody's card by hand.** The commissioner's **"Save their card"** screen carries an optional **per-hole putts** box, shown whenever a putts or GIR pool is switched on. League cards now record per-hole **putts, GIRs and fairways**, so a hand-entered league round produces real statistics for that player instead of a bare score.

**Deleting a league voids every round it launched.** Those rounds come out of everyone's **Rounds** list, out of the shared recent-games and crew feed, and out of **Stats**. The confirmation says so: *"The rounds it launched are voided too, so nothing from this league is left in anyone's Rounds or Stats."*

> This is a **change from how it used to behave**. Deleting a league previously left every round it launched in place, and the old confirmation promised exactly that — *"The rounds people played stay in their own Rounds and Stats."* If you deleted a league expecting the rounds to survive, they no longer do.

### Known Limitations — Leagues

- **"Start next season" is not reachable from the app.** The rollover exists on the back end but nothing in the current interface calls it, so a commissioner cannot start next season today.
- **Side games vs. Dues and pools** is the most common source of confusion — see the box above.
- **Self-scheduled rounds are off by default** on every new league.
- **Longest drive can never be measured automatically** — the commissioner always picks that winner by hand.
- **No flights and no split season.** Standings run as one undivided table for the whole roster.
- **Playoff bracket size is automatic** and can't be set by hand.
- **There is no ringer card and no printable standings sheet.** The **"The season so far"** card that carried both — a **"Ringer card"** button and a **"Print a sheet"** button — was removed from the standings screen, and the ringer view itself has since been deleted.
- **There is no in-app switch for the public standings board.** The **"Share the table"** card and its **"Send the link"** button were removed, so a season can no longer be published to a link anyone can open — and a season that was already switched on before the card went away stays readable at its link. League members always see the standings inside the app either way; that was never what this switch controlled.

---

## Friends Tab

The Friends tab is your player roster, your friend network and the **Live now** list. It's free — the whole social layer is.

### Friends List

- Shows all **accepted friends**
- Tap a friend's photo for their **profile card**: handicap index & status, recent rounds & scores, **"View all rounds"**, **"Invite to next round"**, and (for guests with no email) **"📤 Invite <name> to claim these rounds"**
- **Add a friend:** the **"+ Add"** button opens **"Add a friend"** with a searchable crew list. Tap a player to send a request
  - Search is smooth — debounced, no strobing, results only repaint when they change, and the box has autocorrect/autocapitalise off with a search key on the keyboard
  - Where two accounts share an identical name, an unused duplicate (no rounds played and no sign-in for 60+ days) is **hidden**, so you only see the real person. A unique name is never hidden
  - The button disables on tap so you can't send two requests and two pushes
- **Accepting and removing a friend now tell you the truth.** Accepting used to say **"Friend added"** even when the write failed, and removing a friend could silently fail and the person would reappear on the next load

### Friend Requests

- **"Friend requests"** shows pending requests from other players
- **A red pill on the Friends header** reads **"1 request ▾"** / **"N requests ▾"** when you have pending requests. Tap the header to expand to Accept / ✕
- An in-app **friend-request pop-up** appears when someone sends one, and a badge appears on the Friends tab
- Accept and they appear in your Friends list; you can then invite each other to rounds, see each other on Live now, and read each other's posts on the crew message board

### 👀 Live Now

The Friends tab's **Live now** list is where you watch a friend play — one row per live round, with a **Spectate** button. *(The Home tab's version of this card was removed; this is the one that stayed. The old Wager button is gone with the rest of the wagering feature.)*

### Player Stats — All Eight Tiles Tap Through

Open a player's card → **Player stats** (this also works from the leaderboard player popup). **All 8 tiles are tappable**, including **Rounds** (their rounds list) and **Lifetime Games** (their game history), plus GIR %, Fairways %, Putts, Avg score and the rest. A player with no data shows **N/A**.

### Crew Management

- The **"Crew"** section lists all players ever in a round with you (your shared roster), sorted **A–Z**
- Tap a player's row for their profile card
- **The Crew leaderboard never shows a self-reported handicap** — a player with no computed index reads **"N/A"**, not their TEMP number
- Leaderboard rows fall back to the person's account profile photo when their roster entry has no avatar
- **Removing a player from the roster is an admin function** — see [Admin → User Management](#user-management)
- **View** on a completed round in a player's rounds list opens the **💵 Games sheet**

---

## Admin Side Features

Admin features are accessed via the **Admin tab** (More → Admin; it appears only to admins). This section covers course setup, GPS mapping, the code-review queue, user management, and analytics.

*The Admin and Friends pages load about 10× lighter than they used to, and Admin no longer blocks on a stack of sequential cloud reads before drawing anything — the big course-library rebuild happens after first paint and the worklist and state dropdown refresh themselves when it lands.*

### How a User Becomes Admin

- An existing admin (or system operator) grants the **admin role** via the **User Management** dashboard
- The user must sign in to see the Admin tab
- **"Rename course"** and the other admin controls appear immediately for an admin who signs in mid-session — no app reload needed

**Admin permissions:** map courses (GPS) · edit pars and tee ratings/slopes · mark a course complete · delete duplicate courses · lock and unlock a state · work the code-review queue · manage user accounts · view analytics · see every group's card inside a tournament · manage tournaments they don't own · log a past round onto another account.

### 🌎 Where We Stand — the Whole-Library Snapshot

Directly under the **📊 Admin dashboard** button there's a card headed **"🌎 Where we stand — whole library"**. It is **button-triggered, never automatic** — it shows **"📈 Load global snapshot"**, reports live progress while it runs (*"Reading every mapped hole… 6,500 rows"*), then caches for the session with an **↻ Refresh**.

Once loaded:
- A **fairway-to-pin progress graph** with ticks at 25/50/75, the percentage centred, 🏌️ at your current position and 🏳️ at the goal, and a line reading *"8,732 done · 5,042 to go out of 13,774. Finish 5,042 more and we're holing out."*
- Four tappable tiles: **🚧 Incomplete · ✅ Complete · ❌ Code Review Reject · 🔎 In code review**
- **"📊 Most work left — tap a state"** — the top 12 states as mini progress bars sorted by work remaining; tapping one opens the Incomplete queue pre-filtered to that state

**The queues** open full-screen and are:
- **Searchable** — name, city, state code, state name or course id, multi-word AND
- **Filterable by state** — the dropdown is built from what's actually in that queue
- **Sortable** — **🗺️ By state** (sticky per-state group headers with counts) / **🔤 A–Z** / **⚡ Closest to done**

Every row opens the course detail screen and closing it drops you back where you were; the detail screen's Next/Skip sweeps the queue in order. Rows carry the same badges as the worklist — what's missing, `7/18 mapped`, **❌ Sent back** with the reject note inline, **🔎 In review**, **☑️ Signed off**, **⏭ Skipped**. Paged at 60 with **"Show N more"**; an empty queue reads **"This queue is empty 🎉"**.

> If any page of the scan fails you get a **⚠️ partial read** warning rather than mapped courses being silently reported as unmapped. **The admin dashboard's own course tiles are still state-scoped** and will not match the global snapshot.

### Course Library Management

**"Courses" card (Admin tab):**

**Search:** **"Search by course name or state…"** — searches all courses in the library, A–Z sorted.

#### The Four Status Chips

| Chip | Meaning |
|------|---------|
| **🚧 Incomplete** | everything that isn't complete |
| **✅ Complete** | passes the gates **OR** an admin has signed it off — **and** has no live code-review rejection |
| **🏁 Code Review Complete** | reviewed and closed |
| **❌ Code Review Reject** | reviewed and sent back for more work |

"Verified" is no longer a visible state. The underlying admin sign-off flag still exists and still protects a hand-checked course from automated sweeps — it just isn't a chip.

**Sort row:** **⚑ Incomplete first** / **🔤 A–Z (find duplicates)**.

#### What "Complete" Actually Checks

There is **one shared completeness rule** used by the list, the tally, the sort, the chips, the dashboard, the map pins and the detail modal.

A course is complete when it has greens mapped, rating and tee data, and a fairway target on every par 4/5. Beyond that, **seven gates** now apply:

- **Duplicate pins fail.** A course whose back nine carries the front nine's greens is flagged `duppins`
- **A mapping centroid more than 5 km from the course's own coordinates** is flagged `misplaced`
- **A placeholder scorecard fails.** Pars running strictly downhill — six 5s, six 4s, six 3s — are a card generated to hit a total, not a real one. *(A genuine all-par-3 card is not caught by this.)*
- **Pars that disagree with the mapping fail.** Under two-thirds agreement across at least nine holes where both a mapped par and a card par exist
- **A nine played twice passes.** A course passes if distinct greens ≥ holes, **or** every hole *h* and *h+9* share a green, **or** it's short by at most 2. "Same green" is measured in **metres** (a 30 m haversine threshold), not rounded coordinates
- **A live Code Review Reject outranks everything** — both the automated gates and an earlier admin sign-off. A rejection is the most recent human judgement, so a rejected-but-technically-complete course stays in the working list
- Either scorecard-trust gate leaves the course **Incomplete** until an admin signs it off

> **⚠️ Reading old incomplete counts.** The duplicate-pin, misplaced-mapping and par-disagreement gates were computed and then **dropped on the floor at both call sites — they had never once fired.** They're wired through now, which is also why the admin list and the course-detail modal used to disagree. **No rule or threshold changed**; the counts jumped because the honest number was finally being shown.

> **⚠️ Known bug — a whole small state can suddenly read Incomplete.** The worklist fetches GPS data in **chunks of 40 course ids.** If a chunk errors or comes back empty it's left uncached so it retries next load — but the *current* render reads 0 greens for every id in that chunk. Alaska has 17 courses (one chunk), which is exactly how "AK shows 14 incomplete" appeared when the truth was 17 of 17 complete. **Reloading the Admin tab clears it.**

> **A course can be in code review AND on the Incomplete list at the same time.** That's intended — code-review status and completeness are independent flags, and a queued course still fails the completeness test.

**Admin-verified courses are excluded** from the placeholder and par-disagreement lists as well as the Incomplete count, so reviewers aren't shown courses they've already signed off.

**"Mark complete" also closes the open review entry.** Before, a rejected course that a reviewer fixed and marked complete stayed in the reject list and was read straight back as Incomplete — press the button, nothing happens. It now resolves the open review entry with a note recording who closed it. *(Unverify is deliberately left alone — reopening a review is a separate decision.)*

**Duplicate detection & cleanup:**
- Automated duplicate finder flags courses with identical/similar names
- **"Hide duplicates"** temporarily hides suspected dupes
- **"Show map view"** puts courses on a map
- Distance triggers are tuned at **2 / 5 / 15 km**, and par-mismatch and distance checks are **skipped entirely for wired multi-nine / multi-course ids**, where a mismatch is guaranteed and meaningless

**On every course card:** **"🕘 Review history ›"** (an orange link on any course with a code-review entry) and **📎 Attach**.

**A separate "orphan scorecards" tab** holds the ~184 scorecard rows with no matching course library entry — the app can never display them. They're **excluded from the Incomplete counts** because they aren't work in the ordinary sense; each needs either its library row restored or the card deleted.

### 🔒 State Lock — Freezing a Completed State

**Where:** Admin tab → Course worklist, directly under the state picker.

- **"🔒 Lock <State> — mark complete & freeze"** — locks it, with a note
- A locked state shows a red banner **"🔒 <State> is LOCKED"** with **who** locked it, **when**, and their **note**, plus **"🔓 Unlock"**
- Locked states carry a **🔒 prefix in the state dropdown**

**What the lock stops** — *all admin data writes for that state*: course edits, GPS mapping, deletes, renames, the tees and pars editors, complete/skip toggles, three-nine wiring, and imports/sweeps. A **nationwide import skips locked states and processes the rest**, and the import log lists what it skipped.

**What the lock does NOT stop** — **scoring, side games, and final standings are completely unaffected.** Players use a locked state's courses exactly as normal. Code-review flags and missing-course reports are still accepted.

**Unlocking** requires **typing the state name**. Both the lock and the unlock are written to the audit log.

> ⚠️ The lock is an **app-UI marker, not a database constraint** — a direct database write bypasses it. Treat it as policy, not enforcement. The lock table can also lag your toggles in the UI, so **re-check the lock screen after a bulk toggle.**

### 🔎 Code Review Queue (with Full Audit Trail)

Every review entry carries a permanent, **append-only** history.

**The four states, and exactly what each means:**

| State | Meaning |
|-------|---------|
| **Incomplete** | courses we're certain we can't fix from what's left |
| **Code Review** | Kevin fixed something and submitted it to us to review |
| **Code Review Reject** | we reviewed Kevin's submission and sent it back for more work |
| **Complete** | every complete course |

> **A course's bucket follows its LATEST entry.** It used to be decided by "does any entry ever carry this status", so once a course had ever been rejected it was pinned to the Reject chip permanently — Kevin marks it Complete, a new entry is appended, and the chip never moves. Measured live: **111** courses whose latest entry was a rejection versus **129** showing as rejected — **18 stuck**. The same fault in the pending set was worse: one stale `new` entry dropped a course out of the working list entirely. **No data was migrated — the filing history was always intact, it's just read correctly now.**

> **Re-submitting a rejected course moves it out of Reject immediately.** All three write paths — the one-tap flag, the full review form, and the **🆕 / 🔍 / ✅ / ❌** status buttons — re-derive every chip bucket at the moment of writing. The quick-file path used to add a course to Code Review **without removing it from Code Review Reject**, so Kevin watched it sit in both. Closing the queue modal repaints the worklist.

> **A Code Review count of 0 is correct, not a bug** — it means nothing is currently awaiting our review.

**On each card:**
- **"🕘 History (n)"** — a full-width button on every card
- **"📝 Log work"** — on open items
- **"📎 Attach"** — attach a scorecard photo, on the admin worklist row and on each queue row. *(You still can't attach from inside the code-review **submission** form itself.)*
- **"last update <when> by <who>"**

**The history sheet** opens with a red **"⏭️ Still needed"** panel showing the most recent outstanding ask, then the full timeline. Footer buttons: **"💬 Add a note"**, **"📝 Log work"** (three fields — *what I fixed* / *what I couldn't do and why* / *what's still needed*), and **"📋 Copy full history"**.

**Rules:**
- **A note is REQUIRED** to both **"✅ Mark complete"** and **"❌ Send back."** The status taps stay one tap
- Kevin has full visibility and **can reply in the same thread**
- Events log automatically when a review is filed, on status changes, on notes, and when a **photo is attached to a course**
- Queue items carry a **proposed correction**, not just a finding, so the reviewer's job is a decision rather than an investigation
- Categories in use include `scorecard`, `wrong-course`, `wrong-course-mapped`, `nine-hole`, `gps`, `possible-duplicate`, `duplicate` + `data-integrity` ("merge, do not delete") and `pars conflict`. Some entries carry explicit **"DO NOT DELETE"** corrections and **"WARNING: one of these two courses HAS BEEN PLAYED"** flags

### 📥 Course Request Queue

An admin queue with **Open / Resolved** tabs, an optional resolution note, and **resolve / reject / reopen**. Both dashboard tiles open it.

**Workflow:** view the request (course name, submitter) → **Add to library** (create the course record) or **Assign to existing** → the requester gets a notification once the course is added → **Dismiss** closes it.

### ✍️ Feedback Inbox

Player feedback from **"✍️ Share feedback"** — message, topic and any attached screenshots — lands in the **Feedback inbox** card on the Admin tab. *(Email/SMS alerts for new feedback are on hold.)*

### Guided Verify Hub

The **Guided Verify Hub** is the step-by-step interface for mapping and completing a course.

**Opening a course:** tap a course card in the library. **🗑 Delete course** removes a bad/duplicate course straight from the hub (with confirmation).

**Five steps:**

1. **Details** ✓ — course name (editable), city & state, optional phone & website, ✏️ **Rename course (admin)**
2. **Rating & Tees** ✓ — **Edit tees**; requires at least 1 tee with a valid name, rating (40–90), slope (55–155)
3. **Pars** ✓ — **Edit pars**; par for each hole (1–18), must be 3, 4, or 5
4. **GPS (Tees, Greens, Targets)** ✓ — **Map course**, the **4-step wizard**: **Tee box** → **Target** → **Front of green** → **Back of green** (mid-green computed). Auto-advances to the next unmapped hole; **🗑 Clear hole** wipes a hole's mapping
5. **Fairway Targets** ✓ — every par 4/5 needs a **target**; **🎯 Set / Update the fairway center (target)** adds or moves one on any hole

**Complete gate** — the course reads complete only when ALL of: greens mapped and passing the pin/placement/scorecard-trust gates · rating & tee data filled · a fairway target on **every par 4/5** · no live code-review rejection.

**Force-verify** deliberately allows signing off an incomplete course. The banner tells you which: **"🔒 Verified — locked (still incomplete)"** in amber when the course isn't actually complete, instead of claiming "Saved & complete."

### Mapping a 27- or 36-Hole Facility (Nine by Nine)

- The facility shows its **true expected total (27 or 36, not 18)**
- The mapping picker is **nine-first** — one full-width row per nine with its own live progress, e.g. **"Champions · 4/9 · 5 greens left"**, with a green dot when a nine is done
- The old 18-hole loop buttons live behind **"⚙️ Or map a full 18-hole loop ›"**
- The worklist card gains **per-nine chips** (grey / amber / green) that tap straight through to mapping that nine

> **Do not rebuild nines from scratch.** Map each nine **once** and the app assembles every 18-hole combination itself. A three-nine **round** is still 18 holes.
>
> **Same greens ≠ same holes.** A course with 9 greens but different pars per loop is a real 18 and must not be trimmed to a nine.

**⚠️ Per-nine GPS rows are mandatory.** Admin rolls a wired 27-hole facility up from **per-nine `<id>#<nine>` rows**. When wiring a facility, the config key must be the library id and the nine keys must match the existing `<id>#<nine>` rows exactly.

> **A wired multi-nine reading "Not mapped · 0/27" was a display bug.** The completeness number came from a blank per-nine rollup while the map preview drew a stale 18-hole base row — so a course read "not mapped" on the list and looked fully mapped when you opened it. The list re-fetches per-nine records now instead of trusting placeholder cache entries, and the detail modal fetches the per-nine rows it's missing. **101 wired facilities were reachable by this; only 2 were genuinely unmapped.** Those 101 still carry stale 18-hole base rows — harmless, but don't let a future audit mistake a base row for a real mapping.

> **⚠️ The multi-nine builder can persist a config that overrides a good scorecard.** A config saved with placeholder pars (every hole a 4) and zero yardages **silently outranks a correct 18-hole card**, because three-nine courses take their ratings from the config rather than the card. The bad configs found so far were deleted by hand; **a validity gate rejecting uniform pars or all-zero yardages is an open follow-up, not shipped.** Check any config you save.

**Multi-course facilities are different.** A club with several full 18s (Bethpage Black / Red / Blue / Green / Yellow) is **not** rolled up the way a three-nine is — each course needs its own GPS rows, its own mapping and its own scorecard. Consolidate the facility to **one library entry with a picker**, and retire the generic catch-all entry. Facility-course GPS rows key as `base:key` with a colon; per-nine rows as `id#nine`. Wiring a facility without moving the existing mapping to the colon key orphans it.

**Courses sharing pins may be an unwired multi-course facility, not a mapping error.** The fix is to wire the facility, not to "repair" the map.

### Rating & Tees Editor (adminEditTees)

**List of tee boxes**, each with **tee name**, **rating** (decimal), **slope** (integer 55–155), and **reorder** arrows.

**Actions:** add new tee · edit any tee · remove tee (×) · **Save tee boxes**. Error checking: names required, rating 40–90, slope 55–155.

**Women's rating/slope per tee:** tap **"+ Add women's rating/slope"** on a tee row to reveal **W Rating** and **W Slope**. Tees that already have them show a **"♀ Women's"** marker. These feed the gender-aware handicap math.

**Auto-fill from BlueGolf:** **"🟦 Auto-fill from BlueGolf (paste link)"** — tap **"🔎 Research course"** first (it opens BlueGolf), find the course, copy the web address, paste it here. The app fills every tee's label plus **men's and women's** rating/slope. Only accepts a real `bluegolf.com` link.

**Reverse nines:** **"🔄 Reverse nines (flip front ↔ back)"** swaps front and back for courses that play the nines in the opposite order.

**Your typing is saved** — reopening the editor refills what you had typed with **"↩️ Restored what you were typing."**

> **Two admins editing different courses don't overwrite each other.** Course cards are stored in shards of ~90 courses and each save used to rebuild the whole shard from memory, so two admins editing *different* courses in the same shard silently lost one edit. Saves are read-merge-write now.
>
> **Edit course data while online.** An offline edit can report "saved" and be lost on restart.

### Pars Editor (adminEditPars)

- **Holes 1–18** as two 9-hole rows with running **Out / In / Total** par
- **PAR** — **tap a hole to cycle its par** (3 → 4 → 5 → 3); no keyboard needed
- **HANDICAP / stroke index** — a typeable number box per hole (1 = hardest … 18); a **"duplicate values!"** warning shows if two holes share the same SI
- **Save pars** persists changes and keeps existing tees

> **House convention: a nine-hole course stores stroke index 1–9, not the odd 18-hole values.** Some sources publish a nine's SI as 1,3,5…17. Imported values must be rank-compressed; writing raw values breaks handicap stroke allocation. (134 courses were carrying 18-hole values on a nine, which handed a 9-handicap 5 strokes over the nine instead of 9.)

### Per-Tee Par / Stroke Index — Importing It

Per-tee par and stroke index (the ladies'/senior par feature described in the player section) arrives through the course importer at **`?courseimport=1`**. There is **no in-app per-tee editor.**

**Two rules that must not be broken:**

1. **Every course must lead with its men's/card row.** The importer takes the course card from the first row it sees and only attaches an override when a later row differs — so leading with a ladies' row silently makes the ladies' card the course card for everybody.
2. **A par spread of 4 or more strokes across tees is not a ladies'/senior par difference.** It's a separate short or executive layout being listed as a "tee", and it must never be imported. Real per-tee differences are **1–3 strokes**.

### GPS Green Mapper (4-Step Wizard)

**4-tap workflow per hole** (the banner tells you what to tap next):

1. **Tap the TEE BOX** — "Pinch to zoom in close first"
2. **Tap the TARGET** — the middle of the fairway / ideal landing point (also saved as the hole's fairway center)
3. **Tap the FRONT of the green**
4. **Tap the BACK of the green** — mid-green computed automatically

**After the 4 taps** the hole is marked mapped and the system auto-advances. The **hole picker** (◀ select hole ▶) jumps to any hole to remap it; **↩ Undo** steps back one tap; **🗑 Clear hole** wipes that hole's saved GPS.

> **⚠️ Mapping no longer risks another admin's holes.** Every hole you map does a read-merge-write against the cloud row — but a **failed read used to be indistinguishable from "there's no cloud row yet"**, so the app would write your local holes over a row that might hold 18 holes somebody else had just mapped. It ran unattended on a 15-second timer, on boot, and on every reconnect — exactly the flaky course wifi that caused the failure in the first place. **If the cloud row can't be read, nothing is written**; the course stays parked in the dirty queue and retries. Mapping the *first* hole on a course with no cloud row still writes normally.
>
> **Clearing a hole while offline now fails loudly** instead of being quietly undone by the next sync, and the **"Hole N GPS cleared — re-map it with the 3 taps."** toast doesn't fire when the server never heard about it.

**🧭 The compass** *(admin mapping sessions only):* a 46px translucent dial in the **bottom-right**. **Red needle = north**; a **gold tick on the rim = your device's own heading**. **Tap the dial to snap the map back to north-up** — that tap is also what grants heading access on iOS, so no permission prompt fires just from opening the map.

**On-hole setup panel:** per-hole nav (◀ ▶) · **🎯 Set / Update the fairway center (target)** on **every** mapped hole including par 3s · **🗑 Clear this hole** · **▾ Minimize** / **⤢ Show options** · **Done mapping**.

> **No phantom lock-screen card.** Admin mapping, fairway-target mapping and Course Preview don't raise an Apple Live Activity as if a round had started.

**Admin overlays fit a phone** — the four admin overlays that had no safe-area inset (title row and **✕ Close** clipped by the notch) are fixed, the dashboard's sticky header no longer sticks under the notch, the admin grid is pinned to two columns, and there's a 360px breakpoint for the par/SI editor.

**"🛰️ Open GPS admin map" works from the admin screens.** The map used to open *behind* the admin modals, so the button looked completely dead. It now stacks above every admin dialog but below toasts. Normal gameplay stacking is untouched.

### Fairway Center / Target Mapping (adminFwcCourse)

Two ways to set a target: **during mapping** (the wizard's 2nd tap) or **from the GPS admin map** via **🎯 Set / Update the fairway center (target)**, which appears on every mapped hole including par 3s (a par-3 target is harmless — the rangefinder always aims a par 3 at the green).

Tap the ideal landing zone and a **draggable target marker** drops; the auto-advance flow steps through only the holes still missing one. Players see it as a green dot. **Only par-4/5 targets count toward "complete."**

*Bulk target fills are additive — an existing target is never replaced.*

### GPS Map Pins (Admin View)

**Numbered hole pins** (drawn during a map session — a gap in the numbers is the missing hole): **blue square** = tee, **green circle** = green. On the library map view, complete courses pin 🟢, mapped/needs-targets 🟣, partial 🟠, no GPS ⚪, possible duplicate 🔴.

**Admin-only map controls:** **"🗺 Show/Hide map view"** · spectate any round · GPS override buttons.

**"🛰️ Open GPS admin map — fix a hole"** opens the course map with hole pins, fairway-center dots, status colours and the 🧭 compass. In the `.map-only` admin layout the live FRONT/MID/BACK bar is hidden, the current hole's **PAR** shows upper-right, the options box is bottom-centered, and a **Done mapping** button exits and saves.

### "Research Course" Button (adminPrepCourse)

**"🔎 Research course — USGA · 18Birdies · BlueGolf"** opens three reference tabs so you can find a course's real rating, slope and scorecard.

#### Source Hierarchy — Which Witness Wins

This is a deliberate asymmetry, recorded so nobody "corrects" it:

- **Ratings and slope: the USGA is the issuing body, so it wins alone**, even when a publisher disagrees. Pull nine-hole splits from the USGA NCRDB (`ncrdb.usga.org/courseTeeInfo?CourseID=<id>`) — it publishes per-nine numbers, which is exactly what a three-nine needs, no factoring required
- **Pars: GolfPass is only a publisher and needs corroboration.** On 138 courses where independent sources could judge, GolfPass was wrong about **1 time in 6**. Its scorecard page and its course-layout geometry never once disagreed with each other, proving they're a single source, not two
- **stymie.golf and freegolftracker.com are re-publishers** — they agreed with GolfPass 100% of the time in testing and **cannot count as one of the two independent witnesses** needed to overrule it
- **Provenance rule:** a third source only counts if it's genuinely independent. If our GPS data itself came from that source, the two agreeing is circular and is not evidence
- **A card is rewritten only when two GolfPass-independent sources agree on the entire par list**

**Two traps to watch:**
- GolfPass labels each page of a 27-hole facility a "9-hole course" but attaches the **18-hole combination** rating — importing that roughly doubles every rating
- Some clubs publish their **women's** ratings on their own site without labelling them; importing blindly silently corrupts men's handicaps

**Check the arithmetic before trusting a scanned scorecard.** Each tee's 9 holes must sum to the printed 9-hole total, and two nines must sum to the printed 18-hole total. One club's own published card image turned out to be spliced — **and GolfPass carries the same corrupted layout**, so importing from GolfPass inherits the error.

### Scorecard Image Links & Viewer (adminSetScorecardImg)

**Add / replace:** on the course card tap **"🖼 Scorecard image — view / add link"** and paste a **URL** to a scorecard photo/scan. There's also a **"🖼 Scorecard images ›"** Google Images link to go find one.

**View:** **"🖼 View real scorecard"** opens the saved image **full-screen** while you key in pars/ratings. Attaching a photo to a course is **logged into that course's code-review history** automatically.

*Scorecard images and event images now actually sync to the cloud — they, and the course skip list, were flagged as shared but never registered as shared, so saves reported success while writing nothing.*

### Admin Analytics Dashboard

**Every tile is clickable — 26 drill-downs.** Tapping a tile opens a searchable list of the underlying records (a filter box appears over 12 items, capped at 400 with an honest "showing the first 400 of N"). Course rows deep-link into the course detail screen, so "326 needs GPS" is a working worklist.

> **⚠️ Re-read any dashboard figures you recorded before v965.** "Rounds played," "Rounds completed," "Holes played," "Avg score," "Active players" and "Live rounds now" used to be built from **the signed-in admin's own personal roster and recent list** — two admins saw different numbers for the same app. They all scan real game rows app-wide now.

Other corrections worth knowing:
- Round completeness is **round-level** (a four-ball where one person quit at hole 6 used to log as unfinished)
- **Avg score counts only full 18-hole cards**, and the tile says "over N full 18-hole cards"
- Period-over-period deltas used to compare a partial current month against a complete previous one — fixed, and the header says **"(so far)"**
- Course tiles count only the **scoped** courses and the header names the scope (e.g. "· Michigan only")
- **"Duplicates flagged"** counts extra copies rather than originals too
- **"↻ Refresh"** actually refreshes the course section

**Three real sections replaced the old "Coming soon" block:**
- **Platform & adoption** — iOS accounts, Android accounts, builds in the wild, platform split, with an honest denominator in the header ("N of 102 accounts reporting") because only builds carrying telemetry write those fields
- **Retention** — D1 / D7 / D30 computed in-app; accounts not linked to a player are excluded from the denominator rather than counted as churned
- **Needs an outside connection** — the genuinely unavailable metrics with the precise reason each: App Store downloads need a server-held App Store Connect key; revenue/MRR doesn't exist because nothing is gated; crashes-by-version needs a crash SDK that isn't installed

### User Management

**"Users & players" section:**

**Search:** **"Search by name or email…"** — searching by **email** works. The Users list shows email, avatar, signup date and Pro status.

**User actions (per row):**
- **Reset password** — send a password reset email
- **Make Admin** / **Revoke Admin**
- **⭐ Pro: ON / ☆ Pro: off** — per-account Pro entitlement, recording who granted it and when. **Nothing in the app is gated today.** Admins are always treated as Pro, and a failed read never downgrades someone
- **🔗 Relink player** — re-point this user's `my_player` at the correct surviving roster name
- **📝 Log a past round onto this account** — **admin role only; commissioners cannot use it.** This control was live in the UI for a long time with no backing function behind it, so it had **never worked** (it did fail loudly, naming what was missing). It's installed now. Repeating the same round code is a no-op, so a double-tap can't write the round twice
- **Delete** — remove the user account entirely (confirms)

**Account linking:** users who sign in are auto-linked to a player by name match; **Unlink** and **Link to player** let you correct it by hand.

**Duplicate player detection & merge:** the **Merge duplicate players** modal combines two player records — choose which keeps the name/handicap/photo, the other's rounds and scores transfer to the survivor, any user pointing at the merged-away player is **auto-repointed**, and the merged player is removed. **The merge preview lists the accounts it's about to rename.**

> #### The identity rule: verify by EMAIL, never by name
>
> Email is the only key that reliably identifies the same person across rosters — measured, an email reaches **22 rosters on average**, a roster-entry ID reaches **1** (one person carries ~11.5 different roster IDs). So:
> - Stamp the surviving **email** onto that person's roster entries
> - Never rely on the roster ID for cross-roster matching
> - Never infer identity from an OAuth profile name — confirm with the person
>
> The merge tool used to repoint by name, which meant one admin merging two same-named strangers could reassign an unrelated person's account. It repoints by stable identifier only now.

> #### Why "I already deleted that player and he's still there"
>
> - **A name-only delete cannot remove a player who has an id.** Tombstones match on `pid:<id>` for any entry that carries one, and only fall back to the name for legacy id-less entries
> - **The player-upsert runs on every round start and un-tombstones players**, so cleaning rosters alone brings the name straight back. The old round that seeded the name has to be dealt with too
>
> There is **no self-serve merge in the app** — every nickname split has required a hand-written database merge by an admin.

**Roster Cleanup** merges duplicate-name entries — run it when players report a stranger's round showing up in their list. (Tell the player to remove the row with **"×" → "Just my list"**, never "Delete for all.")

*After a merge or a roster cleanup, a phone still showing the retired name is holding a cached roster — a force-close and reopen clears it on the next sync.*

**Crew board moderation:** admins can edit or delete any message. Deleting a message that has replies removes the whole thread.

### Profile Privacy — What Changed and What It Breaks

Every signed-in user used to be able to read **every** profile row in the database — stored phone numbers, role, clubs, tracked shots, Pro flags and last-seen data. That's closed.

- A normal signed-in user sees **only their own profile row** (their own phone, clubs and handicap still show in Settings)
- Names for friend search, leaderboards and round participants come from a **restricted directory** exposing name, avatar and handicap fields and **no phone, role, clubs, shots or email**
- Anonymous callers get nothing
- **Admin screens are unaffected** — user management and player merge still list all accounts and phone numbers

> **Failure mode to watch:** a denied read returns an **empty list, not an error**. If friend search or player names ever come back blank for a non-admin, that's the symptom. **Four accounts still on builds older than v991** will lose cross-user name lookup until they update — one on iOS and three on Android. All four can update now.

> ⚠️ **The repo file `Tournament_read_access.sql` must never be run.** Its own header claims it's safe to re-run. Running it today would make **every tournament, roster, group, pairing and standing readable by every signed-in user**, silently and with no error. Treat it as HISTORICAL — DO NOT RUN.

### Commissioner Actions That Used to Misfire on a Bad Connection

A whole class of admin and commissioner actions treated a **failed database read as an empty result**, which is the worst possible default on course wifi. All of these now refuse the action and say so:

| Action | What it used to do |
|--------|--------------------|
| **Launch a day's rounds** | If the group-members read failed, **every group was skipped** — no rounds, no group codes, no message. The commissioner tapped launch and nothing happened. It now refuses outright: **"Couldn't reach the groups — nothing was launched"** |
| **Notify all players** | A failed read **re-invited the entire field**. It now sends none |
| **Move a player into a slot** | A failed read collapsed the next slot to **1**, colliding tee order. The move is refused |
| **Persist standings** | A failed read inserted **duplicate match rows**. The persist aborts |
| **Remove a player** | The post-delete verify read could fail and the function still reported **"removed"** |

The same class of bug is why a number of player-facing toasts used to lie about saving — accepting a friend, removing a friend, posting a comment, accepting an invite, bragging to the crew feed, joining a round, and changing stats visibility. They tell the truth now.

### Deleting Courses, Rounds and Data

**Course deletes:**
- **Removals only stick via the tombstone overlay.** Removing an entry from the library additions blob does *not* stick, because clients union the cloud copy with their local cache. **Always write both the deletes list and the locked list.**
- **A tombstone alone does not stop a course surfacing** — its **contact and GPS rows must be removed too**
- Renaming a **seed** course that isn't in the additions blob requires the **name-override map**. A database-side rename deliberately doesn't touch the GPS mapping table
- Deleting more than **25 course cards in a single save** is refused as a suspected partial read
- **A course's visibility comes from the library plus the delete overlay** — not from whether a scorecard exists. A deleted course keeps its pars and tees so it can be restored, which means **any audit counting "courses with missing data" must exclude the delete overlay first**, or it counts the graveyard
- **A mapped course can be invisible to search.** The searchable library is `seed + additions − deletes`, but GPS mapping lives in a separate table the delete filter never touches. Courses with **no state on record** also vanish whenever a state filter is set; a text search brings them back

**Round deletes:**
- **A tombstone is what actually hides a round on every device** — the row delete is just cleanup
- Round deletion is **owner- or admin-only**. Rounds created before v991 have no recorded owner, so **only an admin can delete those rows**
- **Bulk writes from a non-admin account are capped at 25 rows per request.** Legitimate app behaviour never exceeds it; admin and server-side operations are exempt
- **The course delete/verified lists are admin-write only.** The code-review queue and state locks are deliberately excluded so Kevin can keep writing them without an admin role
- The admin **Delete round** dialog doesn't destroy the round when you dismiss it — Cancel, backdrop tap and Escape all used to resolve to the "Just my list" branch *after* the round had already been discarded

### Rules for Data Audits and Bulk Operations

These are the standing rules learned the hard way. They belong in any sweep, import or audit.

- **`userEdited: true` protects hand-entered course cards from a state re-import.** Kevin's 17 minutes of Bethpage par/tee edits were destroyed by an override-mode sweep with no backup covering the window — the third documented instance of that failure class
- **Take a GPS snapshot BEFORE any destructive sweep.** One sweep cleared 401 pins and the only backup was taken *after* the clear
- **A database write that times out may still have committed.** Treat a timeout as *unknown*, not *failed* — verify every effect by counting residue before retrying anything non-idempotent
- **Resolve a course card as shard-then-monolith, never whichever copy the query returned.** Reading the legacy monolith produced a phantom "65 courses lost their pars across 19 states" finding that nearly triggered a 679-course "restore". Correct precedence showed **0 pars lost**
- **A cloud read that fails must not be blind-written over.** The guard is symmetric now across the course map, name overrides, detail overrides, queue attachments, state locks, import progress **and per-course GPS mapping**
- **Never batch-clear on a heuristic alone.** Individual verification flipped 5 of 81 wrong-map calls, which would have destroyed 5 correct maps
- **Log what a sweep skipped.** A silent cap reads as "we covered everything" when it didn't

**How to prove a GPS map is on the wrong course:**
- Comparing GPS centroids for proximity produces false positives (Winged Foot and Quaker Ridge genuinely sit 1 km apart)
- The reliable test is whether two courses **share actual hole coordinates** — any hole whose green centroid matches another course's to 6 decimals means one map was copied from the other
- **Geocode the course's library pin, not just its map.** In 9 of 13 checked cases the pin was correct and the map was the copy
- Evidence bar for calling a pin wrong: **more than 500 m** from the nearest mapped green
- **A course with no coordinates can never be distance-checked**, so a wrong mapping on it is invisible forever — backfilling coordinates from the centroid of its own green pins is what makes the check work at all

**Re-mapping requires three gates, and no pin is ever forced:**
1. A **qualifier match** — an East/West/North/South/colour/designer token in the library name must appear in the source slug
2. A **2 km geo check** against the library coordinate
3. A **sibling-duplicate check** rejecting any centroid within 250 m of an already-mapped course

Anything that fails goes to the code-review queue **with its actual reason** rather than being pinned anyway.

**Duplicates: what is and isn't evidence**
- **Matching name + yardage + rating is a SCREEN, not proof.** Bobby Jones GC exists in Sarasota FL *and* Atlanta GA, 745 km apart; Tam O'Shanter CC exists in NY and MI, 848 km apart. A `-2` id suffix means nothing — 8 of 9 such pairs were different courses in different states
- The reliable test is **GPS centroid distance cross-checked against the course's own contact address.** If the map drifts from the address, it's a **mis-map to re-map, not a duplicate to delete**
- **Before merging same-named entries, check the scorecards, not the names.** Of 138 "same course twice" groups, 16 were pairs of 9-hole cards and 33 had different par arrays. Only 82 were true duplicates — name-based dedupe would have destroyed 49 groups of real courses and real nines
- Some pairs must be **merged, not deleted** — a doubled-nine re-import with exactly halved ratings, or a men's/ladies' tee split where the second card holds tee rows the survivor lacks

**Junk entries: what is and isn't evidence**
- **"Having a scorecard" is the only reliable junk signal — not the name.** Filters on "Golf Center", "Golf Club & Fitness" and similar wrongly flagged 19 real courses. Reese Golf Center was deleted on exactly that heuristic and had to be restored — it's a full 18-hole regulation par-72 course
- Delete on the **absence of a scorecard/GPS holes**, not on the name

**Nine-hole courses**
- **Courses manually set to 9 holes stay at 9 holes**, and cards flagged user-edited are left alone even when they look truncated
- **The doubled-nine test:** before "restoring" a 9-hole course to 18 because its GPS map shows 18 holes, compare the GPS front nine against the GPS back nine. If they're identical, it's a genuine 9-hole course whose map was doubled
- **The greens are the evidence, not the pars.** 270 cards had identical front and back nine pars but only 10 had 9 distinct greens
- **Any completeness check that hardcodes 18 holes will keep manufacturing false tickets**

**Do not bulk-correct GPS pars from scorecards.** 1,891 courses have at least one par disagreement between their GPS row and their scorecard, and for ~866 the two sources appear to describe **different golf courses**. Overwriting them would make those courses *pass* the completeness check while their greens and targets still point at the wrong course — converting a visible problem into an invisible one. Correct only unambiguous single-hole typos.

### Dormant By Design — Do Not Report As Broken

Four admin tools are complete in code but deliberately have **no buttons**: **Re-Map Hole**, **admin delete-a-player**, the **roster-cleanup/merge entry buttons**, and **reset-all-stats**. This is a deliberate decision, written into the source as a named block so audits stop re-filing them.

### Newer Admin Work Worth Knowing

**The multi-nine editor is reachable again.** The editor for a 27- or 36-hole facility existed for a long time with **no button anywhere in the app**. Two were added:

- **"🧩 Edit the nines — cards, tees & ratings"** on any wired multi-nine facility's course screen
- **"🧩 Wire this as a multi-nine facility"** under **More tools** on any un-wired course

> **⚠️ This one nearly cost real data.** Opening that editor on an already-wired facility used to show a completely blank form — every hole a par 4, no ratings, no yardages — instead of loading what was there. Saving from that screen would have overwritten a correctly mapped facility with placeholders. It now loads the facility's real pars, stroke index, tees and ratings before you touch anything.

**The two general editors now route correctly.** On a wired multi-nine facility, the separate **"Rating, slope & tees"** and **"Pars & stroke index"** editors were silently editing data the app doesn't read — changes there had no effect on how the course actually played. Both now open the correct per-nine editor.

**Four safeguards in the nine editor**, each from a specific report: it preserves each nine's internal key so GPS mapping can't silently detach · editing a wired facility no longer re-files it into the Code Review queue · a partial edit can be saved and resumed rather than lost · and fields the editor can't display, such as printed combo stroke-index rows, are preserved rather than wiped on save.

**The "other courses at this facility" picker was fixed.** It scoped candidates too broadly, left them unsorted and cut the list at 50, so real sibling nines never appeared for some facilities. It's now ranked by name similarity, capped at 300, and always prints **"Showing N of M — type to narrow."**

**The worklist pages 25 courses per state** instead of 5, matching the search view.

> **⚠️ A code-review queue read failure used to erase the local queue.** A signed-out or expired session reading the shared queue could be taken for "the queue is empty", and that emptiness was then cached over the real thing. Only a genuinely successful read is trusted now.

**Admin reach over tournaments was corrected.** An app-level admin could previously modify or even delete a tournament they were not allowed to *read*. Admins can now see and manage every tournament properly, and the permissions behind **Assign admins** actually match what that screen always implied.

**"Seat filled ✓" only appears when the seat is actually filled.** Filling a tournament seat used to toast success even when the write was refused, so a commissioner walked away believing a seat was taken when it was not.

**Three admin panels follow dark mode now** — **GPS import**, **course removal** and **rating import**. All three were light text on a hard-coded white panel, so they were unreadable for any admin working in dark mode.

**The Admin tile in the More sheet is the right size.** It was being sized to a fifth of the sheet width and pinned to the left edge; it is now the same 111px tile as every other one and lines up under the first tile in the grid above.

**The wager block is gone from the admin dashboard**, along with the wager branch in the Inbox invite list and the wager icon. The `wagers` table was dropped server-side. If an old admin note refers to wager rows, there are none.

### Two Controls That Were Removed

- **"Assign to account (admin)"** is gone from the detailed past-round entry screen. There is no longer any in-app way to log a round onto somebody else's account. This was dropped deliberately, not hidden.
- **Roster deletions are personal by default.** An ordinary user removing a player from their own roster used to delete that player from **every** user's roster — a confirmed data-loss bug that nearly took out an actively playing crew member with real history. Ordinary removals are now private to that user's own devices. Only an explicit administrator delete is global.

> **A rule for anyone auditing roster data:** roster entries are duplicated per device — the same player appears once per person they've played with — so rounds must be counted by **distinct round code**, never by row. A naive count looks wildly inflated, and can make a real player look deletable when they aren't.

### Known Limitations

- **There is no in-app per-tee par editor.** Per-tee par and stroke index can only arrive by CSV import
- **The 4-man (one-team) scramble handicap allowance is not implemented** — the checkbox is hidden in 4-man mode and that format plays gross
- **Junk auto-fill doesn't fire when junk is a tournament group game** — the chips render and are tappable, but GIR / Arnie / Sandy must be tapped by hand
- **Field skin circles don't paint on the Event Leaderboard's full scorecard**
- **There is no event-wide N-team Ryder Cup or Scramble format** — no bracket, no round-robin, no fixture list. They settle per cart and feed the per-team cup table
- **A round record still stores only two team keys at launch.** Cosmetic now that team sides are read from the event roster, but worth knowing
- **Deleted scheduled rounds can come back** — they have no deletion tombstones (rounds, rosters and tournaments do), so a sync from a device that still has one can resurrect it. The same applies to round templates, multi-nine wiring and course GPS
- **A partial round doesn't archive to handicap history** — a round played to 15 of 18 holes doesn't count toward the handicap
- **Archiving truncates a player's score history to 200 rounds**
- **The shared roster snapshot is not an authoritative record of a finished round** — it holds truncated mid-round snapshots. It feeds no units and carries no handicap differential, so it's harmless, but don't audit against it
- **The scheduled-rounds list is global with ownership checked by name, not account** — two users named "Mike Smith" can edit and delete each other's scheduled rounds
- **The legacy roster tombstone list is one global row**, so one user deleting a legacy roster entry can tombstone the same *name* in another user's roster

---

## Common Workflows

### Starting Your First Round

1. **Home tab** → **"⛳ Play now"** (or the middle **Play** button in the bottom bar)
2. **Search and select a course** — or accept the home course it already picked for you
3. **Pick your tees** — the dropdown shows rating/slope and yardage, and your handicap auto-sets
4. **"👥 Select a Player"** to add your crew (up to 8) — team games balance themselves as you go
5. **Toggle the games** you want
6. **Configure rules:** Gross/Net, and Round Tracking (Putts, GIRs, Fairways, Penalties, Sand saves)
7. **"▶ Start round now"**
8. **Score tab** appears — enter scores hole-by-hole, or tap **"🎤 Say the scores"**
9. **GPS** opens when you tap the "Score" button
10. **💵 Games** shows the live leaderboard, the units and the final standings
11. **"Save & return home"** when you're done — tap **"🔓 Reopen round"** later if something needs fixing

### Watching a Friend's Round

1. **Friends tab** → **"👀 Live now"**
2. Tap a friend's live round row → **Spectate**
3. **GPS opens in spectator mode** (read-only)
4. See their live location if they've shared it; scores update in real time
5. Tap the **player dropdown** to switch between players
6. The **✕** puts you back on your own round, on the hole and tab you left

### Checking What a Round Cost You

1. **Home tab**, **Rounds tab**, **Friends tab** or **Tourney tab** → find the completed round
2. Tap **View** — the **💵 Games sheet** opens
3. Read the group units, then **Final standings — this group**
4. Scroll for the full scorecard — gross with net underneath, **blue circles** are your group's skins, **gold** are tournament field skins
5. On a tournament round keep scrolling to the **🏆 event block** — the whole-event final standings, the other groups' games and **📊 Tournament Results**

### Reading an Award Screen

1. Open the **💵 Games** screen, or **💰 Awards** on an event
2. Pick a scope: **🏆 Tournament total** or **👥 Group total** — the chip governs everything below it
3. Each row is **PRIZE POOL / WINNER / WINS** — WINS is what the winner *collects*, not the prize pool size; the prize pool size is in the grey detail line
4. A column reading **still live / not settled** means that prize pool can't decide until every group finishes — it does **not** mean nobody won it
5. **"Running totals — not final"** over the final standings means the round isn't finished yet
6. Tap **"📋 Every game — who won what"** for the one-screen document version, or **"🖼️ Share this as an image"** (tap the image to zoom with the **−  +  Fit** buttons)

### Settling Up

1. On the **💵 Games** screen, the final standings card is the first thing you see
2. Tap **📲 Text Final Standings** — it always attaches the scorecard image and the games card, and the message carries the who-trails-who lines and everyone's payment links
3. Each pay line carries one tappable link — the payee's preferred method
4. If groups are still out, the app warns you and the message carries a **⚠️ PROVISIONAL** banner
5. On a tournament round the text sends the combined event total no matter which scope is on screen

### Adding Friends & Inviting to Rounds

1. **Friends tab** → **"+ Add"**
2. **Search** for a player
3. Tap their name → **friend request sent**
4. They see the request (and the red **"N requests ▾"** pill on their Friends header) and tap **Accept**
5. Once accepted, **"Invite to next round"** appears on their profile
6. When creating a round, tap their name in the player picker

**Inviting to a live round:** from the invite list, tap a friend to send a game invite. The button changes to **"✓ Invited — tap to resend."** When you **start a round**, anyone already added whose account is linked is **auto-invited**. The invited player sees an **"⛳ Game invite"** pop-up with **"Join now"** / **"Ignore."** Inviting from inside a tournament sends an **event link** — the joiner lands on the claim page and picks their own group.

### Getting a Name-Only Player Into Their Own Tournament

1. Open the event → **Invite**
2. Send that player **their own link** (not a general share)
3. They sign in and tap their name
4. The spot, the handicap and every round already played on it stay attached — and the event now shows up on their phone and in their stats
5. **Don't rebuild the carts** — that only works at cart-build time, it needs you, and it does nothing if they have no account yet

### Tracking Your Handicap

1. **Stats tab** → your handicap section
2. View your **index**, **status** (Established / Provisional / TEMP) and **recent differentials**
3. Tap **"⛳ Add a Round"** to log rounds you played before using the app
4. Tap **"📤 Share handicap"** to export your index + recent rounds
5. It updates automatically each time you finish or add a round
6. **Round missing?** Open the Rounds tab or Stats and it usually heals itself. If not, tap **"🔄 Resync my stats"**. If the number still looks wrong after an app update, tap **"♻️ Recalculate handicap"**

### Using the GPS Rangefinder

1. During a round, tap the **"Score"** button on the Score tab
2. **GPS opens** with a satellite view, auto-fit so the green is always in frame
3. **FRONT / MID / BACK** distances show center-top
4. **Drag the target marker** to your intended target — the map re-frames to keep both your ball and the target on screen
5. **Wind panel** (⊙ icon) shows direction and speed
6. **Club suggestion** (Plays-Like mode) — tap to switch from Plays-As
7. Check the right-hand bubbles for this hole's **🪙 Pot of Gold** value, **📏 Long Putt**, the **LEADER** net bubble, the **🏹 Team Quota** standing and your match status
8. Tap **"Track Shot"** to log a drive distance
9. Tap **"Score"** to close GPS and enter the score

### Marking Junk Games on Scorecard

1. On the scorecard, scroll to the **Junk row**
2. Toggles for GIR, Sandy, Rolo, Barkie, Polie, Snake, Arnie, Chip-In
3. **Tap a player's name** to toggle them for that junk on that hole
4. Multiple players can score the same junk
5. **GIR, Sandy, Rolo and Chip-In fill themselves in** when the round tracks GIRs, Sand saves, Penalties and Putts — and a manual tap always overrides
6. At round end it **auto-settles**

### Running a Multi-Team Event

1. **Tourney tab** → **"+ New event"** → pick a type. For pairs, pick **Small Teams (2-man)** and set how many teams
2. **Add players** — one flat roster; they auto-balance onto the smallest team
3. **Team names & logos** → set **"How many teams?"** (2–12), then name them or keep the defaults
4. **Carts & teams** — one card per team; **auto-assign** deals a serpentine draft, and the cart builder pairs teams (A,B) (C,D) so every cart is a real head-to-head
5. **⏱️ Tee times** — set the first group and tap **Stagger**
6. **Configure Day → Games** — set the day's games; a greyed game tells you why it can't run
7. **Configure Day → Team Quota** — set the entry and the award shape (winner takes all / 70-30 / 50-30-20)
8. **Event Prize pools** for anything field-wide
9. **🚀 Start Event**
10. Watch **Team Quota standings** on the Event Leaderboard, and **💰 Awards → 🏆 Tournament total** for the units

### Managing Your Club Distances

1. **Stats tab** → **"🏌️ My clubs"**
2. One input per club — enter a **distance range** in yards, customize the label, leave blanks for clubs you don't carry
3. **Drag ⋮ to reorder**
4. **"Reset to standard bag"** restores defaults
5. Next round, GPS club recommendations use your distances

### Mapping a New Course (Admin)

1. **Admin tab** → **Courses card**
2. Check the state isn't **🔒 locked**
3. **Search for the course** (if not in the library, create it)
4. Tap the course card → **Guided Verify Hub**
5. **Step 1: Details** — name, city, state (optional phone/website)
6. **Step 2: Rating & Tees** → **Edit tees** — add tee boxes with men's and women's rating/slope, or paste a BlueGolf link into **"🟦 Auto-fill from BlueGolf"**. For ratings, the USGA is the authority
7. **Step 3: Pars** → **Edit pars** — tap to cycle par, type the stroke index (**a nine stores SI 1–9**)
8. **Step 4: GPS** → **Map course** — **4 taps per hole**: tee → target → front green → back green. On a 27- or 36-hole facility, map **one nine at a time** from the nine-first picker. **Map online** — if the cloud row can't be read, nothing is saved and the course parks in the retry queue
9. **Step 5: Fairway targets** — confirm every par 4/5 has one; add or move any with **🎯 Set / Update the fairway center**
10. Mark the course **complete** → it reads ✅ **Complete** in the library
11. When the whole state is finished, **"🔒 Lock <State> — mark complete & freeze"** with a note

### Working the Code Review Queue (Admin)

1. **Admin tab** → the queue (or **🌎 Where we stand** → the **❌ Code Review Reject** / **🔎 In code review** tile)
2. Read the card's **"⏭️ Still needed"** panel, then **"🕘 History (n)"** for the full timeline
3. Fix what you can; **📎 Attach** a scorecard photo if it helps the next person
4. **"📝 Log work"** — what you fixed / what you couldn't do and why / what's still needed
5. **"✅ Mark complete"** or **"❌ Send back"** — **a note is required for both**. Marking complete also closes the open review entry
6. Remember what each state means: **Code Review** = Kevin submitted it to us; **Code Review Reject** = we sent it back to Kevin

---

## Glossary

*New since the last edition: the 💵 Games screen (formerly Board); per-tee par; the 🏠 home course and the home/away badge; 2–12 team tournaments and Small Teams (2-man); Vegas switch-at-the-turn; Team Quota as a prize pool; gross-and-net per nine; "Running totals — not final"; the single 📲 Text Final Standings button; 🔄 Resync my stats; the 🌎 global snapshot; and the retirement of Abandon round, Live Holes Across America, tournament templates and the Home Live now card.*

| Term | Definition |
|------|-----------|
| **Handicap Index** | Your WHS rating (one decimal); based on the official USGA count of your best differentials from the last 20 rounds, capped at net double bogey |
| **Differential** | (Score − Course Rating) × (113 ÷ Slope); measures difficulty of a specific round |
| **Course Handicap** | Index × (Slope ÷ 113) + (Rating − Par); your handicap adjusted to a specific tee. **Skins and the prize pools measure off this, not the raw index** |
| **Published handicap** | The index your account publishes so every device shows the same number for you |
| **Provisional** | Status when < 5 rounds played; the calculation is valid but temporary |
| **TEMP** | A handicap you typed at sign-up rather than one the app computed. Marked everywhere — and never shown on the Crew leaderboard |
| **PRO badge** | A gold pill marking a future Bad Golf Pro feature. **Nothing is locked today**, and early members keep 90 days of Pro free after plans launch |
| **Handicap allowance** | A per-game percentage of your course handicap. On **Skins** and **Low Net Pool** it **replaces** the round's percentage; on the **stroke prize pool** it still stacks |
| **Per-tee par** | Where a club publishes different pars for different tees, each player is scored against **their own tee's** par and stroke index. The hole header shows e.g. `4 / 5` |
| **Home course** | The course you normally play. New rounds default to it, and every round is stamped **home** or **away** |
| **GIR** | Greens in Regulation; ball on the putting surface in par − 2 shots |
| **Stroke Index (SI)** | 1–18 ranking of holes by difficulty (1–9 on a nine); used to allocate handicap strokes |
| **Net / Gross** | Score with / without handicap strokes. Every scorecard shows both on Out, In and Total |
| **Games screen (💵)** | The units surface — final standings, standings, per-game breakdown, scorecard, game results. **This is the tab that used to be called Board** |
| **Games sheet (💵)** | The same layout opened from a finished round via **View** |
| **Running totals — not final** | The stamp on final standings while a round is unfinished; the numbers can still move |
| **Best Ball** | Team format; each player plays their own ball, the team takes the lower score per hole |
| **Scramble** | Team format; everyone hits, the team picks the best, repeat (one team score per hole). Scored against the **card** par |
| **Scramble Prize Pool** | The field-wide scramble prize pool, set under Event Prize pools — every player pays the entry and cart groups are the teams |
| **Nassau** | Three separate games (front, back, overall). **Ties carry** to the next segment |
| **Huckle** | The Nassau press — available when you're down 2+ in a segment, in stroke play or match play |
| **Skins** | Lowest score on each hole wins that hole's prize pool. **Per skin** or **Pool** format |
| **Field skin** | A tournament-wide skin — circled **gold** on the scorecard (a group's own skin circles blue) |
| **Vegas** | 2v2 format; scores paired (low digit first) not added; tie-doubling is capped. Teams can rotate every 6, stay fixed, or **switch at the turn** |
| **Hammer** | Match play with a doubling cube — throw the hammer to double; accept or fold. Team (2v2) or Individual |
| **High & Low** | 2v2; a point for the better low ball and a point for the better high ball each hole. Needs an even field |
| **Animals** | Penalty animals (Gorilla, Snake, Shark, Camel, Jackal, Dolphin, Crab) pass to the last offender; only the final holder pays |
| **Marks** | Highlight-reel game — most marks wins (GIRs, sandies, chip-ins, fishies, darts, muscles, birdies) |
| **Hot Potato** | One token that doubles each time it changes hands, **capped at 64×**; whoever holds it after 18 pays |
| **Umbrella** | 2v2 points game; five points a hole, each worth the hole number; sweeping all five doubles the hole |
| **Pot of Gold** | A prize pool on every hole, `base × (19 − stroke index)`. **A 1-unit base totals 171 units per opponent over 18** |
| **Team Quota** | Teams play (points − quota); an **entry prize pool**, not a per-point game. In a tournament it settles once across the whole field |
| **Round pool** | A whole-group prize pool — **Low Net Pool**, **GIR Pool**, or **Fewest Putts Pool**. Everyone pays the entry; best result takes it; ties split |
| **Junk** | Side games triggered by specific outcomes (GIR, Sandy, Rolo, Barkie, Polie, Snake, Arnie, Chip-In) |
| **Rolo** | Par or better after taking a penalty stroke. Auto-fills when the round tracks Penalties |
| **Chip-In** | Holing out from off the green for par or better. Auto-fills when putts = 0 and the score is par or better (an ace doesn't count) |
| **Par 3 Greenie** | Closest to pin on par 3s; optional **Hero Tax**, or the **"3-putts still win"** mode that removes both |
| **Hero Tax** | Penalty: if the Greenie winner 3-putts, they forfeit the award AND pay each player |
| **Birdie Bump** | Automatic award for birdie/eagle/ace from each player. A **group-level game only** — there's no field-wide version |
| **Closest to the Pin** | Mark the winner on qualifying holes; log distance in feet & inches. Optional **pool mode** |
| **Long Putt / Long Drive** | Everyone pays the entry; the longest putt of the round / longest drive on the designated hole takes the prize pool |
| **PRIZE POOL / WINNER / WINS** | The award row format. **WINS is what the winner collects**, not the prize pool size |
| **Still live / not settled** | A prize pool that can't decide until every group in the event finishes — not "nobody won it" |
| **Provisional** *(awards)* | An event total shown before every group has finished; Skins, CTP and Long Putt are withheld, so it won't sum to zero |
| **Fairway Center** | Ideal landing zone (green dot on GPS) for par 4s/5s |
| **Complete** *(course)* | Pars set, tee ratings/slopes filled, GPS mapped, par-4/5 targets placed, passing the duplicate-pin, misplaced-mapping and scorecard-trust gates, and carrying no live code-review rejection |
| **Code Review / Code Review Reject** | Kevin submitted a fix for us to review / we sent it back for more work. A course's bucket follows its **latest** entry |
| **State Lock** | An admin freeze on a completed state — blocks all admin data writes, never affects play |
| **Guest claim** | A host-initiated link that moves a guest player's rounds, handicap and units onto that person's new account |
| **Bound invite** | A join link tied to a specific player slot — the joiner confirms once and is in, with no typing |
| **Tee time** | A calendar reservation on the Times tab: a course + date + time + a group size |
| **Niners** | The 9-point game for exactly 3 players — 9 points per hole (low 5, mid 3, high 1) |
| **Blitz** | Niners option: win a hole outright by 2+ strokes and sweep all 9 points |

---

## Tips & Tricks

### Make the Most of GPS

- **Before your round:** set up My Clubs with your real distances
- **On each hole:** drag the target marker to your intended shot to see club recommendations — the map re-frames so you never lose it off-screen
- **Wind mode:** turn on wind visualization to see how direction and speed affect the ball
- **Watch the bubbles:** the 🪙 Pot of Gold bubble tells you what this hole is worth before you tee off — the No. 1 handicap hole is the big one. In a tournament, long-press the 🏹 Team Quota bubble to see every team
- **Track drives:** tap "Track Shot" after big drives to refine your club setup over time
- **Pinch to zoom** works everywhere, which helps a lot in bright sun

### Turn On the Right Tracking

- **Putts** unlocks Chip-In auto-fill — and **Arnie won't award at all without it**
- **Penalties** unlocks Rolo auto-fill
- **Sand saves** unlocks Sandy auto-fill
- **GIRs** unlocks the GIR junk game and the two Umbrella GIR points
- Adding the **GIR Pool** or **Fewest Putts Pool** switches the matching tracker on for you — you'll see a toast saying so

### Set the Handicap You Actually Meant

- **Skins and Low Net Pool each have their own allowance slider**, and it **replaces** the round percentage. 90% round + 80% skins = 80% skins, not 72%
- **0%** on either slider means that game plays **straight gross**
- **The stroke prize pool is the exception** — its allowance still stacks on the round percentage
- The **stroke dots on the scorecard** show the round-level pops, so they can legitimately disagree with a Skins result. That's expected
- **Set your gender in Edit profile** if you play the women's tees — it's what makes the rating/slope and per-tee par work in your favour

### Run Smooth Rounds

- **Set your home course** — every new round starts on the right course and every round gets stamped home or away
- **Your setup is saved for 30 minutes** — back out to check something and your course, players and options are still there. Your *game selections* deliberately aren't, so a new round always starts clean
- **Save your setup as a template** — tick "⭐ Save as reusable template"; "Use" spins up a fresh copy. Templates are private to you
- **Create a friends list** (Friends tab) so invites are one-tap and your Home feed is just your crew
- **Removing a player is a confirmed action** — the dialog names them and tells you exactly what gets deleted. Read it
- **Watch for the amber sync bar.** If it appears, your scores are safe on the phone and the round just hasn't reached the cloud yet — tap Retry now when you have signal
- **Made a mistake?** Tap "🔓 Reopen round", fix it, and finish again — every award recalculates and the corrected card reaches your stats. Just make sure only one person edits at a time
- **Re-check per-hole winners** (greenies, junk, CTP, long putt) if you edited a live round's games

### Settle Units Fairly

- **The 💵 Games screen leads with final standings** — it's the first thing on the page now
- **The scope chips drive the whole screen** (🏆 Tournament total / 👥 Group total), not just the unit rows
- **Tap "📋 Every game — who won what"** when someone disputes a number — it's exactly what the texted final standings sends, and it respects the chip you're on
- **One share button.** **📲 Text Final Standings** always attaches the scorecard and the games card, and includes everyone's payment links
- **Tap an image to zoom it** — use the **−  +  Fit** buttons; a normal pinch won't work
- **Don't compare a PROVISIONAL total to a final one** — Skins, CTP and Long Putt are deliberately withheld until every group finishes
- **Junk auto-settles** — don't calculate greenies, sandies and Rolos by hand

### Run a Big Event

- **Pick the right event type first** — Small Teams (2-man) sets up a pairs field in one step
- **Let the app balance the teams** — auto-assign deals a serpentine draft so the sides are level, and the cart builder pairs teams so every cart is a real head-to-head
- **Name your teams** under Team names & logos — and **if your event predates 18 August 2026, check them**, because team names used to overwrite each other
- **A greyed-out game tells you why** — read the line underneath rather than assuming it's broken
- **Team Quota needs an even field** (8 v 8, not 9 v 7), and the standings are on the Event Leaderboard
- **Send name-only players their own invite link** so the event shows up on their phone
- **The event prize pool is what pays** when a prize pool is on as both a day game and an event prize pool — the day game is suppressed so it can't settle twice

### Be an Admin

- **Load the 🌎 global snapshot** at the start of a session — the four tiles and the state bars tell you where the work actually is
- **Check the state isn't locked** before you start — a 🔒 state blocks every admin write
- **Research course first** — or paste the BlueGolf link straight into "🟦 Auto-fill from BlueGolf". For ratings the USGA wins outright; for pars you need two GolfPass-independent sources to agree
- **Map courses online.** If the cloud row can't be read, nothing is written and the course retries — that guard is what stops you wiping another admin's holes on course wifi
- **On a 27- or 36-hole facility, map one nine at a time** from the nine-first picker, and make sure the per-nine `<id>#<nine>` rows exist — otherwise admin reads 0 of 27 no matter how much you map
- **Never save a multi-nine config with placeholder pars or zero yardages** — it silently overrides a perfectly good scorecard, and there's no validity gate yet
- **A multi-course club is not a three-nine** — each course needs its own rows and its own mapping
- **Lead every per-tee import file with the men's card row**, and never import a "tee" whose par differs by 4 or more strokes — that's a different course
- **Tap the 🧭 compass** to snap the map back to north-up
- **Confirm every par 4/5 has a target** before marking a course complete
- **Log your work in the code-review queue** — a note is required to mark complete or send back, and marking complete closes the open entry
- **Verify by email, never by name** when you're merging accounts or chasing a duplicate player
- **Snapshot before you sweep**, treat a timed-out write as *unknown*, and never batch-clear on a heuristic alone
- **If a whole small state suddenly reads Incomplete, reload the Admin tab** — that's the 40-id chunk bug, not your data
- **Never run `Tournament_read_access.sql`** — it would open every tournament, roster and standing to every signed-in user
- **Lock the state when it's done** and leave a note saying what "done" meant

---

**End of Documentation — v2026.11.1489**

**For support or questions, contact support@officialbadgolf.com**
