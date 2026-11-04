# v2009 cross-bet fix build — contract for the four fix streams

Read first: ../AUDIT_v2009_CrossBets_QA_2026-11-04.md, ../DECISIONS.md (Tyler's rules — they win),
and the stream findings files (../engine_FINDINGS.md, ../screens_FINDINGS.md,
../rounds_leagues_FINDINGS.md, ../live_FINDINGS.md). Repo: /root/bad-golf-app (build v2008).

## Ground rules
- Do NOT edit /root/bad-golf-app/golf-app.html or www/index.html. Work on your own copy
  (cp golf-app.html qa/cross_v2009/fix/work_<stream>.html) and deliver a PATCH SCRIPT:
  qa/cross_v2009/fix/<stream>_patch.py — usage `python3 <stream>_patch.py <file.html>`; holds a list of
  (name, old, new) edits; asserts `src.count(old) == 1` for each BEFORE replacing; writes the file in
  place; prints each name. It must apply cleanly to the PRISTINE v2008 golf-app.html (it will be
  applied together with the other streams' patches, in the order E, U, S, then on www/index.html too).
- Touch ONLY the functions you own (below). If you need something in another stream's code, use a
  guarded call (`typeof fn === 'function'`) and write the request in your NOTES file.
- House style: additive, try/catch wrapped, comment each change `// v2009 (cross audit <ID>): ...`.
- Don't bump BGVER / BG_BUILD (Claude does). No git push. No live DB writes.
- Each stream writes regression tests at qa/cross_v2009/fix/test_<stream>.js
  (`node test_<stream>.js <file.html>`), run against your patched copy, all green; and re-runs the
  relevant original QA suite (engine.js / screens.js / rounds_leagues.js) on the patched copy and
  explains every remaining failure (an oracle assumption that a decision changed is fine — say so and
  update that oracle in a COPY under fix/, not the original).
- Deliver qa/cross_v2009/fix/<stream>_NOTES.md: edits list, finding IDs closed, tests, leftovers.
- Also run `node qa/check_build.js` style checks on your copy: script opens == closes, node --check on
  the app script.
- i18n: any NEW user-facing string goes through the app's existing translation helper the way nearby
  strings do (look for the pattern, e.g. `t('...')` / `bgT(...)`) and gets es/ko/ja/zh entries where the
  surrounding strings have them. Game/format names stay English. No ✕ or › characters in strings.
- Mobile first: anything visible must fit 320 px with no sideways scroll; honour the Color-blind setting.

## Shared helper (owned by E)
`bgCrossKey(name)` — normalizeNameSegment + accent fold + alias resolution (`bgAliasCanon`) → the one
key every cross path uses. E defines it near `_t2EventPdataByDay`. Others call it guarded with a
fallback to `normalizeNameSegment`.

## Engine output shape (owned by E, consumed by S) — `t2ComputeCrossGroupMatches(t, rows)` returns
{ matches:[M], nassaus:[N], nassauGroups:[G], dropped:[D], conflicts:[C] } where every entry has
`day` (number), `kind` ('match'|'nassau'|'nassauGroup'), `keys` (bgCrossKey of every player),
`settled` (bool), `pending` (bool: anything still to play/unsettled), plus:
- M: aKey,bKey,aFirst,bFirst, winnerKey|null, loserKey|null, push, status (no "(thru)" noise needed by
  chips — also `statusShort` e.g. "3&2", "2 up", "AS", "dormie"), played, remaining, stopHole (hole
  number where counting stopped), holes:[{hole:n, a:net/gross, b:..., res:'A'|'B'|'H'}] in hole-number
  order (only shared holes), value, net, left:{key, afterHole}|null.
- N: aKey,bKey,aFirst,bFirst, segments:[{name:'Front'|'Back'|'Total', settled, noBet, pushed,
  winnerKey, status, holesFrom, holesTo}], aNet,bNet, value, format, segments setting.
- G: keys[], segments:[{name, settled, complete, winners:[key], carry, status}], netByKey{}, value.
- D: { day, kind, names[], reason:'name-not-found'|'nine-twice'|'no-shared-holes'|..., text }.
- C: { day, kind, keys[], used:{value,net,format}, other:{value,net,format}, fromGroup }.
Units in combined payouts come ONLY from this output.

## Ownership
### E — engine core
`_t2EventPdataByDay`, `_t2SettleCrossPair`, `_t2SettleCrossSeg`, `_t2SettleCrossNassau`,
`t2ComputeCrossGroupMatches` (incl. group mode), the cross parts of `t2ComputeCombinedPayouts`
(pending flag, W/L marks, column force-show), `t2PersistStandings` / the publish path for the
permanent cross record (client side; the RPC/table is Q's), new `bgCrossKey`.
Closes: ENG-1..11, S-2, S-5 (engine flag), S-10 engine part (first-saved wins + conflict), S-15, S-16,
S-17, S-18 client, live F5/F7/F9, RL F6 (event part).
Rules: hole-number arrays via bgPhysHole; close-out in hole-number order over shared holes (remaining =
shared holes not yet played by both, incl. skipped earlier holes); x2 cart → dropped 'nine-twice';
no shared holes → no bet (dropped 'no-shared-holes'); leaver loses unfinished match/sides (2-player) /
pays as loser and best finisher wins (group mode); forgotten blank on a finished card → pending, never
settles; candidates from settings.groupGames, settings.dayGames[N], each row's g.games AND
g.groupGames — each tagged with its day; dedupe per day per pair per kind, FIRST SAVED wins
(use savedAt / order), differing duplicate → conflicts[]; read participantNames before pair.

### S — surfaces
`renderGameBanners` cross lines, `_t2MyCrossGroupStatuses`, `_t2RefreshCrossGpsCache`,
`t2EventMatchModels` + Matches card render + public event page Matches/Units/Pending bits,
`t2InjectTourneySummaryLink` results line, group scorecard Match view (add "Tyler · v Kevin" cross
lines per the v1990 rule), colour-blind classes for cross surfaces, `displayFirst` with the field roster
for cross labels, Matches card fallback to stored records (read side).
Closes: S-1, S-3, S-4, S-6, S-7, S-11, S-12, S-13, S-14, S-19, S-20, ENG-10 display, ENG-11 labels.
Everything shown must be READ from E's output shape (write a local stub of that shape in your tests;
don't re-settle anything).

### U — setup, regular rounds, leagues, Home
Setup pickers / `gatherSetup` cross checks / `applySavedConfig` / `resolveSavedNameToCurrent` /
`_t2MatchPickerPool` / `_t2FieldRoster` lifecycle / `_t2FieldHasName`; first-cart lock (read-only
"Already set by Group N: 20, net" on the other cart); block a cross bet when either cart plays a nine
twice; warn when the carts' holes share no hole numbers; must include one of this cart's players.
`_nassauInstCross` (event rounds only; local by player id; bgCrossKey compare), `calcNassau` /
`calcMatch` / `getParticipants` / `calcVegas` / Splix dropped rows (`_bgDropBet` — "bet dropped" line,
never vanish), `applyLiveEditMerge` rename into instances[]/pair (use `_bgRenameDeep`), league
live-edit allow list + `computeAllGameMoney` league guard, Home at-course card vs invites
(see DECISIONS "Home Start round vs invite": hide whenever Home shows ANY joinable round for me —
invite pending or live, myLive, t2round, lgRound, or a tee time today that is live / has an active code /
is waiting on my answer).
Closes: S-8, S-9, S-10 setup part, S-21, RL F1-F5, F7, F9, F10 (accent fold for compares only — do NOT
change normalizeNameSegment's output, existing keys depend on it), RL F6 regular part, Home invite.

### Q — server SQL + test infrastructure
One SQL file qa/cross_v2009/fix/SQL_v2009_cross_run_in_editor.sql (Tyler runs it in the Supabase
editor): fix `league_post_round_cards` hole-count check order (RL F8, against
supabase/SQL_v2009_run_in_editor.sql); a durable cross-result record — either rows in
`tournament_matches` (format 'cross-match' / 'cross-nassau' / 'cross-nassau-group', detail jsonb) via a
SECURITY DEFINER RPC `bg_t2_save_cross_results(p_tournament uuid, p_rows jsonb)` that only the event's
commissioner/admins or a member of the event can call, idempotent per (tournament, day, kind, keys),
callable when every launched group is finished; grants per the 2026-10-30 rule (explicit grants on any
new table/function). Verify on a local throwaway Postgres 16 like qa/league_v2009 did (never the live DB).
Also: fix qa/fixture_kerbo_crossmatch_2026-10-24.json to net:true and update
qa/qa_crossmatch_closeout_v1945.js expectations (Britt 4&3 net); write the RPC call contract for E in
Q_NOTES.md (E calls it guarded; if E finishes first it codes to this name/signature).

## UPDATE 2026-11-04 08:40 — base is now v2009, build target v2010
Tyler shipped v2009 (= v2008 + the director "End the event early" hotfix, qa/hotfix_v2009/, function
t2EndEventEarly + one button in renderT2List's group fold). The assembled build is v2010 = v2009 + every
stream's patch. Patches written against v2008 still apply (the hotfix touched no stream's functions); the
pristine base for assembly is qa/cross_v2009/fix/BASE_v2009.html. A fifth stream F owns the field-game
engines for the early-finish rule (see below) — E/S/U/Q do not touch them.

### F — field games on an early-finished event day
_t2FieldPointsPoolAll (+ the quota/stableford field paths of calcQuota/calcStableford only where they feed
it), _t2FieldCtpAll, _t2FieldSkinsAll, field Long Putt, _t2FieldBirdieAll, field side pots (Low Net / GIR /
putts / long drive), _t2FieldNassauAll, field Best Ball / Scramble / Shamble / Team Quota, and
t2EndEventEarly (to make it engine-aware).
