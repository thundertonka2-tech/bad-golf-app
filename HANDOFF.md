# Golf Betting App — Project Handoff

## What this is

A single-file HTML app for live golf betting. Multiple players join the same round from different phones using a 6-character code. Tracks scores, calculates payouts for ~13 different golf bets, handles handicap math, and stores everyone's score history for GHIN-style handicap auto-calc.

**The original deployment is being shut down.** You will need to:
1. Put the file in a public GitHub repo (so Claude can read it without choking on file size)
2. Set up your own Supabase backend (free tier, ~5 min)
3. Update the source file with your own Supabase credentials
4. Rename the app
5. Host it somewhere (Netlify is free and easy; any static host works)

This doc walks you through all of that, in order.

---

## STEP 1: Put the file in a GitHub repo (do this FIRST)

The app is ~584KB / 8,200 lines. That's too big to attach directly to a Claude chat — it eats most of the context window before any work can begin, and on some plans Claude will refuse outright.

**Solution:** put it in a public GitHub repo. Share the raw file URL with Claude in your prompts. Claude pulls only the parts it needs via `web_fetch`, the file lives outside your context window, and as a bonus you get version control.

### 1a. Create a GitHub account if you don't have one
https://github.com/signup — free.

### 1b. Create a new public repo
1. Click "+" → "New repository"
2. Name it something like `golf-app` (anything works)
3. **Public** (required so Claude can fetch it without auth)
4. Check "Add a README file"
5. Click "Create repository"

### 1c. Upload the file
1. On your new repo page, click "Add file" → "Upload files"
2. Drag `golf-app.html` onto the page
3. Scroll down, commit message "Initial upload", click "Commit changes"

### 1d. Get the raw file URL
1. Click on `golf-app.html` in the file list
2. Click the **"Raw"** button on the top right
3. Copy the URL from your browser. It'll look like:
   ```
   https://raw.githubusercontent.com/YOUR-USERNAME/golf-app/main/golf-app.html
   ```
4. **Save this URL.** This is what you'll paste into Claude every session.

### 1e. (Optional) Set up local git for easier updates
If you want to update from your computer instead of dragging files into the GitHub UI every time:
```bash
git clone https://github.com/YOUR-USERNAME/golf-app.git
cd golf-app
# edit golf-app.html
git add golf-app.html
git commit -m "Describe what you changed"
git push
```

The raw URL always points to the latest committed version — no extra step needed when you push.

---

## STEP 2: Set up your own Supabase backend

The app uses Supabase as a shared key-value store so multiple phones can read/write the same round. The free tier is more than enough.

### 2a. Create the project
1. Go to https://supabase.com and sign up (free)
2. Create a new project (any name, any region close to you)
3. Wait ~2 minutes for it to provision

### 2b. Create the table
In the Supabase dashboard, go to **SQL Editor** and run this:

```sql
CREATE TABLE kv_store (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allow anonymous read/write (this app has no auth — that's intentional;
-- the 6-char game code IS the access control)
ALTER TABLE kv_store ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous all" ON kv_store
  FOR ALL TO anon
  USING (true) WITH CHECK (true);
```

If you want realtime sync (multiple phones seeing each other's scores update live), also run:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE kv_store;
```

### 2c. Grab your credentials

In the Supabase dashboard:
- **Project URL** → Settings → API → "Project URL" (looks like `https://abcdefgh.supabase.co`)
- **Anon key** → Settings → API → "anon public" key (long JWT string starting with `eyJ...`)

### 2d. Update the source file

Open `golf-app.html` in a text editor. Around line 2329 you'll find:

```javascript
const SUPABASE_URL = 'https://cshffkajwobmcwkejary.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiI...';
```

Replace BOTH values with your own. Save the file.

The anon key is safe to expose in client-side code — it only grants what RLS policies allow, and the policy above is intentionally open because the app has no real "users." Anyone with a 6-character game code can read/write that round; that's by design.

After editing, commit and push the change to GitHub so the raw URL stays fresh.

---

## STEP 3: Rename the app

Open `golf-app.html` and search for:

```html
<title>Degenerate Golfers — Live Scoring & Betting</title>
```

That's around line 6. Change to whatever you want. The footer just says "Live Scoring & Betting" generically (around line 2104) — leave it or update it.

The file itself can be renamed too — `golf-app.html` is just a convention.

---

## STEP 4: Host it

The app is a single static file. Any static host works.

### Option A: Netlify drag-drop (free, ~30 seconds)
1. Go to https://app.netlify.com/drop
2. Drag `golf-app.html` onto the page (rename to `index.html` first so the URL doesn't include the filename)
3. Done — you get a free `*.netlify.app` URL immediately

### Option B: Vercel
Same idea — `vercel deploy` from a folder containing the file.

### Option C: GitHub Pages (lazy mode — same repo as your source)
1. In your GitHub repo settings → Pages
2. Source: "Deploy from a branch", branch `main`, folder `/` (root)
3. Rename your `golf-app.html` to `index.html` so it's served at the root
4. Wait a minute, your site is live at `https://YOUR-USERNAME.github.io/golf-app/`

### Option D: Any web server
The file is fully self-contained (Supabase loads from CDN at runtime). Just put it on any HTTPS host. **HTTPS is required** because the Supabase client refuses to run from `http://` in browsers.

### Custom domain
Add through your host's dashboard. Update DNS at your registrar to point at the host. Most hosts auto-issue SSL certificates.

---

## Working with Claude going forward

### The first prompt for any new Claude session

Open a fresh Claude chat and paste this — replacing `YOUR-RAW-URL` with the raw GitHub URL from Step 1d, and attaching this `HANDOFF.md` file to the chat:

> Hi Claude. I'm developing a single-file HTML golf-betting app. The full source is too big to attach directly, so I host it on GitHub. The current source is at:
>
> `https://raw.githubusercontent.com/YOUR-USERNAME/golf-app/main/golf-app.html`
>
> I'm also attaching `HANDOFF.md` which has the architecture, data model, and history. Please:
>
> 1. Read the handoff doc fully
> 2. Use `web_fetch` to grab the source file from the URL above
> 3. Skim the file using the section header comments (`// CONSTANTS`, `// CALC FUNCTIONS`, etc.) to navigate
> 4. Give me a 1-paragraph summary of what you understand the app does, then ask me what I want to work on
>
> Don't make any changes yet.

### When Claude asks for "the latest version" later in a session
Just paste the raw URL again. Claude will re-fetch. You don't need to re-attach the handoff doc unless the conversation has gone on long enough that early context dropped.

### Updating the source after Claude makes changes
Claude will produce an updated `golf-app.html` for you (in a downloadable file). Replace the file in your local clone, commit, push:

```bash
git add golf-app.html
git commit -m "What Claude changed today"
git push
```

The raw URL automatically points to the new version — no extra step.

### When the chat gets long
Each Claude conversation has a context window. As you keep working, eventually it'll start dropping early context. Best practice: start a new chat, paste the same first prompt, attach the handoff doc again. Tell Claude where you left off and what's next.

---

## Architecture in one paragraph

The whole app is one HTML file with vanilla JS, vanilla CSS, and a single Supabase client for shared data. State lives in a global `state` object. Routing is tab-based (Home / Setup / Score / Board / Rounds / Events / Bets / Stats). Game state is stored under keys like `game:ABC123` (shared via Supabase + localStorage cache) so multiple devices can read/write the same round. Personal data (player roster with score history, "me" name, last game code) is localStorage-only, never synced.

## File structure (search for these section headers)

- `// CONSTANTS` — course library, junk types, default pars/SI
- `// SUPABASE + STORAGE LAYER` — `safeGet`, `safeSet`, `loadGame`, `saveGame`
- `// GHIN-STYLE HANDICAP MATH` — `calcDifferential`, `calcHandicapIndex`
- `// SETUP UI` — `setupNewGameForm`, `addPlayerRow`, course picker, tee management
- `// PARTICIPANT PICKERS` — chip-based player selection per game
- `// MULTI-INSTANCE` — `renderMatchInstances`, `renderNassauInstances`
- `// CALC FUNCTIONS` — one per game (`calcSkins`, `calcNassau`, etc., 13 total)
- `// LEADERBOARD UI` — `renderBoard`
- `// SCORE PANEL` — `renderScoreEntry`, `renderGameBanners`, `handleScoreChange`
- `// STATS PANEL` — `renderStats`, `renderSparkline`
- `// SUMMARY MODAL` — `buildRoundSummary`

## Data model

### Game state (shared via Supabase under `game:CODE`)

```javascript
{
  code: 'ABC123',              // 6-char shareable code
  course: 'Buffalo Creek',
  courseId: 'buffalo-creek',
  pars: [4,4,3,...],           // 18 holes
  sis: [1,11,5,...],           // 18 stroke indexes
  tees: [                       // multi-tee support
    { label: 'Back', rating: 71.2, slope: 132 },
    { label: 'Middle', rating: 69.8, slope: 128 }
  ],
  players: [
    { id: 'p0-...', name: 'Kevin', hcp: 12, rawHcp: 14, teeLabel: 'Back' }
  ],
  scores: { 'p0-...': [4,5,3,...] },
  games: {                      // which bets are active
    skins: { value: 2, tieRule: 'carry', require: 'none', participants: [...ids] },
    nassau: { instances: [{value, format, allowHuckle, ..., participants}] },
    match: { instances: [{value, net, participants}] },
    vegas: { value: 0.25, net: true, rotate: 'rotate', participants: [...] }
    // ...etc per game
  },
  hcpRules: { basis: 'full', pct: 100, noPar3Strokes: false },
  bankerData: { holes: {}, picks: {}, bankerOrder: [...] },
  wolfData: { holes: {} },
  junkData: { 5: { gir: ['p0-...'], sandy: ['p1-...'] } },
  p3greenieData: { 3: { winners: [...], threePutts: [...] } },
  huckleData: { huckles: [{ id, nassauIdx, callerId, opponentId, segment, callHole }] },
  finishedAt: 1234567890,       // null while live, timestamp when saved
  createdAt: ...,
  updatedAt: ...
}
```

### Personal data (localStorage only, key prefix `golf:`)

- `golf:player-roster` — array of `{name, hcp, lastUsed, scoreHistory: [...]}`
- `golf:last-game` — last opened game code (for resume)
- `golf:me-name` — which roster name represents the current device user

## Games supported

1. **Skins** — par-or-better requirement option, tied: carry/split/none
2. **Nassau** — multi-instance. Each instance has own pair, value, format (stroke/match), Huckle option, birdie/eagle/HIO bonuses
3. **Stroke pot** — buy-in, lowest total wins
4. **Banker** — rotating banker, presses, banker re-presses, birdie auto-double, loser-picks holes 16+
5. **Vegas** (4 players) — paired-digit. Birdie flips opponent + eagle doubles + tie escalation. Team rotation option (rotate every 6 / fixed all 18)
6. **Dynamic Vegas** (4 players) — Vegas math with shifting partnerships based on previous hole's high+low scorers. Hole 1 = seeded random by game code
7. **6's** (4 players) — rotating partners every 6 holes
8. **Wolf** (3+) — rotating captain, can go solo (2x) or blind (3x) or pick partner
9. **Match play** — multi-instance (multiple 1v1 matches per round)
10. **Team match play** — fixed teams via team picker
11. **Team low ball** — same teams, total over 18
12. **Par 3 Greenie** — separate game, $5/other for greenie, must make par. Buddy Fucker built-in: 3-putt forfeits + pays $5 each
13. **Junk side bets** (7 types): GIR, Sandy, Barkie, Polie, Snake, Arnie, Chip-In ($1 default each)

## Known issues / things to keep an eye on

- **Stale player IDs after edits** — `getParticipants` has a forgiving fallback that returns all players if saved IDs don't match current ones. There's a `console.warn` when this fires; if it happens often, there may be a deeper bug in the participant-save flow.
- **Multi-instance Match Play / Nassau is new** — the data model supports it cleanly but the UI for managing 3+ instances on a small screen is still rough. Expect minor polish work needed.
- **Score history is local-only** — if a user swaps phones, their roster history doesn't follow. A "share roster" or "sync to account" feature would be a real upgrade but requires real auth.
- **No undo for finished rounds** — there IS a "Reopen round" button in view-only mode, but accidental finishes can't be undone if the user dismisses without noticing.
- **The 21 hardcoded courses in COURSE_LIBRARY** are Rockwall, TX area — you may want to add your own area's courses, or build a search-by-zip feature.

## Style notes for working with Claude

How the original developer worked with Claude on this codebase:

- **Preferred batched changes** — instead of "do this one thing then ship," asked Claude to queue 5-6 changes and ship them all at once after working through them
- **Confirms each spec before building** — Claude asked 1-3 multiple-choice clarifying questions before any non-trivial change. This caught misunderstandings early
- **Validates with `node --check`** — every code change was followed by extracting the script section and running `node --check` to catch syntax errors before deploy
- **Avoided over-formatting in chat** — kept responses prose-style rather than bullet-heavy unless content needed structure
- **Asked Claude to explicitly flag risks** — when a change had edge cases or trade-offs, Claude would call them out before coding rather than after

## Quick checklist before going live

- [ ] GitHub repo created, file uploaded, raw URL saved
- [ ] Supabase project created
- [ ] `kv_store` table + RLS policy created
- [ ] Realtime publication enabled (optional, for live multi-device sync)
- [ ] `SUPABASE_URL` updated in source (line ~2329)
- [ ] `SUPABASE_ANON_KEY` updated in source (line ~2330)
- [ ] App `<title>` renamed (line 6)
- [ ] Updated file pushed back to GitHub
- [ ] File deployed to a static host with HTTPS
- [ ] Tested: open the URL on two devices, start a round on one, join with the code on the other, see scores sync

Good luck.
