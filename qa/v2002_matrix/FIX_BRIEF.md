# v2002 fix build — brief for each fix agent

Tyler approved fixing every finding in the matrix (qa/v2002_matrix/*_FINDINGS.md). The rules come
from qa/v2002_matrix/DECISIONS.md: Tyler's four calls plus the defaults. DECISIONS.md is the answer key.

## Rules of the road
- Edit ONLY `golf-app.html`, and only the functions your assignment lists. Never edit
  `www/index.html`. Never bump BG_BUILD or BGVER. The coordinator syncs www, bumps the version
  and runs the guard at the end.
- Stage 1 is already in. `_bgPlaySeq` now starts from `bgEffectiveStartHole`, so do not re-fix POOLS-2,
  CORE-1, MATCH-3 or TOURNEY-8's group side. Do make sure any engine you touch walks
  `_bgPlaySeqOr(g, n)` and not 1..18.
- Tag every change with a comment: `// v2002 (matrix <FINDING-ID>): <why>`. Match the existing
  code style. UI text stays plain and mobile-friendly. Any new UI must respect the Color-blind
  setting and use the existing CSS classes. Any new user-facing string must follow the app's i18n
  pattern; run `python3 scripts/guard_i18n.py`.
- Update YOUR family's suite (qa/v2002_matrix/<family>.js) so its oracle encodes DECISIONS.md where
  that differs from the agent's original assumption. Then make it pass with 0 failures. A remaining
  failure must be explicitly justified in your report.
- Before you finish, run these on golf-app.html and keep them green:
  - `node qa/qa_all.js golf-app.html`, `node qa/qa_v1998_engines_gaps.js golf-app.html`,
    `node qa/qa_v1998_cross.js golf-app.html`, `node qa/qa_v1998_skins_playorder.js golf-app.html`,
    `node qa/qa_tourney_setup.js golf-app.html`, `node qa/qa_banker_sync_v1912.js golf-app.html`,
    `node qa/qa_wolf_groupgames_v1945.js golf-app.html`, `node qa/qa_scramble24.js golf-app.html`.
  - Your family suite, plus any other v2002_matrix suite your change could affect.
  - `node --check` on the extracted script: `node qa/check_build.js` will flag web/iOS differing.
    That is EXPECTED until the coordinator syncs, so ignore only that check.
  - If an older suite asserts the OLD (now decided-wrong) behaviour, update that assertion and say
    so in your report.
- Commit in your worktree with a clear message. Don't push. Report: findings fixed (ID → one line),
  any finding you could not fix and why, suites run with counts, and the commit hash.
