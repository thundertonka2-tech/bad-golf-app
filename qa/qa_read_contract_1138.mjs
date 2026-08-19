// qa/qa_read_contract_1138.mjs — regression test for v1138.
//
//   node qa/qa_read_contract_1138.mjs golf-app.html
//   node qa/qa_read_contract_1138.mjs www/index.html      # run BOTH
//
// v1133–v1135 converted the six error-discarding reads the FINDING doc ranked.
// A full audit of the remaining 46 found 20 where a failed read produced WRONG
// BEHAVIOUR rather than missing data. v1138 converts 19 of them (statsReset was
// audited and left alone — its cloudCount is null, not 0, on a failed read, so it
// already reports "?" honestly rather than falsely confirming an empty backup).
//
// The two that mattered most, and what they used to do:
//
//   t2LaunchDayRounds — a dropped members read left _allLaunchMembers empty, so
//     every group built gp = [] and hit `if (!gp.length) continue`. The launch
//     created NO rounds, set NO group codes, and said nothing. Exactly the v986
//     (T37) symptom, caused by first-tee wifi instead of a group of one.
//
//   t2ChatPost — its last-resort branch has no compare-and-swap. A failed re-read
//     made `cur` [] and the upsert REPLACED the whole chat with one message.
//
// Most assertions here are structural, because the defect is structural: the
// question is whether the failure path exists at all, not what it computes. The
// suite is mutation-tested — revert any single edit and it must go red.

import fs from 'fs';
const target = process.argv[2];
if (!target) { console.error('usage: node qa/qa_read_contract_1138.mjs <golf-app.html|www/index.html>'); process.exit(2); }
const raw = fs.readFileSync(target, 'utf8');
const js = target.endsWith('.html')
  ? [...raw.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(b => b.length > 1000).join('\n')
  : raw;

const grab = (a, b) => {
  const i = js.indexOf(a);
  if (i < 0) throw new Error('not found: ' + a);
  const j = js.indexOf(b, i);
  if (j < 0) throw new Error('end not found for: ' + a);
  return js.slice(i, j + b.length);
};

const R = []; const ok = (n, c, d = '') => R.push({ n, pass: !!c, d });
const sec = (t) => R.push({ sec: t });

// ── 1. t2LaunchDayRounds — refuse the launch, never half-launch ──────────────
sec('1. t2LaunchDayRounds — a failed roster read must abort the launch');
{
  const f = grab('async function t2LaunchDayRounds(courseId) {', '\n}\n');
  ok('members read goes through _bgRead', /_bgRead\(\(\) => supa\.from\('tournament_group_members'\)[\s\S]{0,200}?'t2LaunchDayRounds:members'\)/.test(f));
  ok('a failed read returns instead of launching', /if \(!_lmRead\.ok\)[\s\S]{0,300}?return;/.test(f));
  ok('  ...and clears the in-flight latch first', /if \(!_lmRead\.ok\)[\s\S]{0,120}?_t2LaunchInFlight = false;/.test(f));
  ok('  ...and tells the user nothing was launched', /nothing was launched/.test(f));
  ok('no bare members read survives', !/const \{ data \} = await supa\.from\('tournament_group_members'\)/.test(f));
  ok('the v986 continue-on-empty guard is untouched', /if \(!gp\.length\) continue;/.test(f));
}

// ── 2 & 3. the chat — exists:false must not mean "we could not ask" ──────────
sec('2. t2ChatLoad / t2ChatPost — a failed read must not wipe the history');
{
  const load = grab('async function t2ChatLoad(tid, withMeta) {', '\n}\n');
  const post = grab('async function t2ChatPost(', '\n}\n');
  ok('t2ChatLoad reads through _bgRead', /_bgRead\(\(\) => supa\.from\('games'\)[\s\S]{0,160}?'t2ChatLoad'\)/.test(load));
  ok('t2ChatLoad reports ok', /ok: _r\.ok/.test(load));
  ok('  ...and nulls data when the read failed', /_r\.ok \? _r\.data : null/.test(load));
  ok('t2ChatPost asks for meta on the last-writer path', /t2ChatLoad\(tid, true\)/.test(post));
  ok('  ...and refuses to upsert on a failed read', /if \(!_curMeta\.ok\)[\s\S]{0,200}?return false;/.test(post));
  ok('  ...and says the message was not sent', /wasn't sent/.test(post));
  ok('the CAS-free upsert is now only reachable after a trusted read',
    post.indexOf('if (!_curMeta.ok)') > 0 && post.indexOf('if (!_curMeta.ok)') < post.lastIndexOf(".upsert({ code: t2ChatCode(tid)"));
  ok('the compare-and-swap retry loop is untouched', /q\.eq\('updated_at', meta\.updated_at\)/.test(post));
}

// ── 4. openT2Round — a failed captain read must not silently elect a scorer ──
sec('4. openT2Round — the scorer must not be decided by a failed read');
{
  const f = grab('async function openT2Round(', '\n}\n');
  ok('captain read goes through _bgRead', /_bgRead\(\(\) => supa\.from\('tournament_groups'\)\.select\('captain'\)[\s\S]{0,140}?'openT2Round:captain'\)/.test(f));
  ok('_cap is only trusted when the read succeeded', /_grRead\.ok && _grRead\.data && _grRead\.data\.captain/.test(f));
  ok('the ambiguity is surfaced to the user', /Couldn't confirm the scorekeeper/.test(f));
  // Deliberate: scoring is NOT blocked. Locking everyone out would strand a group
  // with nobody able to enter a score — worse than two scorers.
  ok('scoring is deliberately NOT blocked', /else \{ _iAmScorer = true; \}/.test(f));
  ok('managerIds read goes through _bgRead', /'openT2Round:managerIds'/.test(f));
}

// ── 5. t2MoveHere — refuse the move rather than collapse the slot to 1 ───────
sec('5. t2MoveHere — a failed slot read must not corrupt tee order');
{
  const f = grab('async function t2MoveHere(', '\n}\n');
  ok('slot read goes through _bgRead', /_bgRead\(\(\) => supa\.from\('tournament_group_members'\)\.select\('slot'\)[\s\S]{0,160}?'t2MoveHere:slots'\)/.test(f));
  ok('a failed read returns without moving anyone', /if \(!_memRead\.ok\)[\s\S]{0,260}?return;/.test(f));
  ok('  ...and says nobody was moved', /nobody was moved/.test(f));
  ok('  ...and clears the swap selection', /if \(!_memRead\.ok\)[\s\S]{0,240}?_t2SwapSel = null;/.test(f));
  ok('the v986 update-result check is untouched', /_mvErr/.test(f));
}

// ── 6. t2SetGroupCode — the verify read, same hole v1134 closed elsewhere ────
sec('6. t2SetGroupCode — an unknown must not read as a clean loss');
{
  const f = grab('async function t2SetGroupCode(', '\n}\n');
  ok('verify read goes through _bgRead', /'t2SetGroupCode:verify'/.test(f));
  ok('a failed verify is distinguishable in the log', /this is unknown, not a loss/.test(f));
  ok('  ...and still returns false (caller must not assume ownership)', /if \(!_curRead\.ok\)[\s\S]{0,220}?return false;/.test(f));
  ok('the compare-and-swap .is(game_code, null) is untouched', /q\.is\('game_code', null\)/.test(f));
}

// ── 7. t2PersistStandings — never double-insert on a failed read ─────────────
sec('7. t2PersistStandings — a failed read must not duplicate match rows');
{
  const f = grab('async function t2PersistStandings(', '\n}\n');
  ok('existing-row read goes through _bgRead', /'t2PersistStandings:existing'/.test(f));
  ok('a failed read aborts the persist', /if \(!_exRead\.ok\)[\s\S]{0,240}?return false;/.test(f));
  ok('  ...explicitly so nothing is duplicated', /nothing is duplicated/.test(f));
}

// ── 8. t2NotifyAllPlayers — never re-invite everyone ────────────────────────
sec('8. t2NotifyAllPlayers — a failed read must not re-invite the field');
{
  const f = grab('async function t2NotifyAllPlayers(', '\n}\n');
  ok('existing-invite read goes through _bgRead', /'t2NotifyAllPlayers:already'/.test(f));
  ok('a failed read sends nothing', /if \(!_invRead\.ok\)[\s\S]{0,240}?return;/.test(f));
  ok('  ...rather than duplicating', /rather than duplicating/.test(f));
}

// ── 9. the two standings/money builders ─────────────────────────────────────
sec('9. _t2MyGroupInfo / _t2AllGroupsInfo — partial data must never be silent');
{
  const mine = grab('async function _t2MyGroupInfo(', '\n}\n');
  ok('_t2MyGroupInfo groups read is _bgRead', /'_t2MyGroupInfo:groups'/.test(mine));
  ok('_t2MyGroupInfo members read is _bgRead', /'_t2MyGroupInfo:members'/.test(mine));
  ok('  ...and either failure returns null, not a partial board',
    (mine.match(/if \(!_gRead\.ok\) return null;/g) || []).length === 1 &&
    (mine.match(/if \(!_mRead\.ok\) return null;/g) || []).length === 1);
  ok('_t2MyGroupInfo round read is _bgRead', /'_t2MyGroupInfo:round'/.test(mine));
  ok('  ...and a failed round read says so rather than implying "unfinished"', /which may be wrong/.test(mine));

  const all = grab('async function _t2AllGroupsInfo(', '\n}\n');
  ok('_t2AllGroupsInfo groups read is _bgRead', /'_t2AllGroupsInfo:groups'/.test(all));
  ok('_t2AllGroupsInfo members read is _bgRead', /'_t2AllGroupsInfo:members'/.test(all));
  ok('_t2AllGroupsInfo round-page read is _bgRead', /'_t2AllGroupsInfo:roundPage'/.test(all));
  ok('a partial load warns the user once', /_agWarn = \(\) => \{ if \(_agPartial\) return; _agPartial = true;/.test(all));
  ok('  ...saying totals may be incomplete', /totals may be incomplete/.test(all));
  ok('  ...and every one of the three reads is wired to it',
    (all.match(/_agWarn\(\);/g) || []).length === 3);
  // Deliberate asymmetry, and the reason is worth keeping: MyGroupInfo already
  // answers null for "cannot tell you", so aborting is free. AllGroupsInfo feeds a
  // board that should still render — blanking the event would be worse than
  // showing it with a warning.
  ok('AllGroupsInfo does NOT abort (the board still renders)', !/_gRead\.ok\) return null/.test(all));
}

// ── 10. toggleFistBump — a failed read must not insert a duplicate ──────────
sec('10. toggleFistBump — a failed read must not double-insert');
{
  const f = grab('async function toggleFistBump(', '\n}\n');
  ok('existing-bump read goes through _bgRead', /'toggleFistBump:existing'/.test(f));
  ok('a failed read returns before inserting', /if \(!_fbRead\.ok\)[\s\S]{0,200}?return;/.test(f));
}

// ── 11. visibility conversions — fail-soft, but no longer silent ────────────
sec('11. visibility conversions (fail-soft on purpose, now traceable)');
for (const label of ['t2Create:dupGuard', 'renderTourneyList:codes', 'openEditProfile:phone',
                     'renderT2List:dates', 't2ListPublicJoinable:mine']) {
  ok(label + ' routed through _bgRead', js.includes("'" + label + "'"));
}
ok('t2Create wraps the WHOLE 3-line chain (wrapping one line leaves _bgRead unclosed)',
  /_bgRead\(\(\) => supa\.from\('tournaments'\)\.select\('\*'\)[\s\S]{0,320}?\.limit\(1\), 't2Create:dupGuard'\)/.test(js));

// ── 12. the build, and what was deliberately left alone ────────────────────
sec('12. build stamp and deliberate non-changes');
ok('BG_BUILD is v2026.11.1138', /BG_BUILD = 'v2026\.11\.1138'/.test(js));
// statsReset was audited and left alone ON PURPOSE. Its cloudCount stays null on a
// failed read, so "CONFIRMED on the server" (which requires === 0) cannot fire.
// If someone "fixes" it to default 0, that message starts lying.
ok('statsReset still seeds cloudCount to null, not 0', /let cloudOk = false, cloudErr = '', cloudCount = null;/.test(js));
ok('_bgRead itself is unchanged and still reports ok:true for an RLS refusal',
  /async function _bgRead\(/.test(js));

let bad = 0;
for (const r of R) {
  if (r.sec) { console.log('\n  ── ' + r.sec); continue; }
  if (!r.pass) bad++;
  console.log((r.pass ? '  ok   ' : '  FAIL ') + r.n + (r.pass ? '' : '   <- ' + r.d));
}
const total = R.filter(r => !r.sec).length;
console.log(bad ? `\n${bad} FAILED, ${total - bad} passed` : `\nall ${total} assertions passed`);
process.exit(bad ? 1 : 0);
