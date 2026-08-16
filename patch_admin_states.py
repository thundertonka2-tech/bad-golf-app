#!/usr/bin/env python3
"""
Bad Golf - collapse the admin course states to the four Tyler actually uses:
Incomplete, Complete, Code Review Complete, Code Review Reject.

The problem: "Verified" was a fifth, parallel state. A course could be Verified but not
Complete (the v634 admin force-verify), so the chips did not add up to the library and
the same course could sit in two buckets. That is what made the counts look wrong.

The fix keeps the underlying `_adminVerified` set exactly as it is - it is a synced
overlay and, more importantly, it is what protects a hand-checked course from being
overwritten by the automated sweeps (see the guards near the OpenGolfAPI sweep). Nothing
about that changes. What changes is that it stops being its own visible state and instead
counts as Complete:

    Complete   = auto-complete  OR  an admin has signed it off
    Incomplete = everything else

so Incomplete + Complete = every course in scope, with no overlap.

Wording follows: anything the admin screen called "Verify"/"Verified" now says
"complete", because that is now what it means.

Usage:  python3 patch_admin_states.py golf-app.html www/index.html
Bumps BG_BUILD by one, writes a .bak, and asserts every anchor before touching a byte.
"""
import sys, re, shutil

# (description, exact old text, new text, expected occurrences)
EDITS = [
    ("Complete counts an admin sign-off",
     "  const cComplete = base.filter(it => it.complete).length;                        // fully done (GPS + rating) — re-mappable",
     "  // v1060: an admin sign-off now counts as Complete rather than being its own state,\n"
     "  // so the chips add up to the library instead of double-counting.\n"
     "  const cComplete = base.filter(it => it.complete || _adminVerified.has(it.id)).length;",
     1),

    ("Incomplete excludes admin sign-off",
     "  const cIncomplete = base.filter(it => !it.complete).length;   // v755: single \"needs work\" bucket (was nomap/partial/rate/targets)",
     "  const cIncomplete = base.filter(it => !it.complete && !_adminVerified.has(it.id)).length;   // v755: single \"needs work\" bucket",
     1),

    ("drop the Verified chip",
     "    + chip('verified', '☑️ Verified', cVerified)\n",
     "",
     1),

    ("Incomplete filter excludes admin sign-off",
     "    if (f === 'incomplete') return !it.complete;                      // v755: any course not fully done",
     "    if (f === 'incomplete') return !it.complete && !_adminVerified.has(it.id);   // not done and not signed off",
     1),

    ("Complete filter includes admin sign-off",
     "    if (f === 'done') return it.complete;                             // fully done — for re-mapping a finished course",
     "    if (f === 'done') return it.complete || _adminVerified.has(it.id);   // done, or signed off by an admin",
     1),

    ("list badge wording",
     "        + (_adminVerified.has(it.id) ? ' <span class=\"adm-flag\" style=\"background:var(--accent)\">☑️ Verified</span>' : '')",
     "        + (_adminVerified.has(it.id) ? ' <span class=\"adm-flag\" style=\"background:var(--money-pos)\">✅ Complete</span>' : '')",
     1),

    ("detail pill wording",
     "  const verPill = verified ? '<span class=\"adm-flag\" style=\"background:var(--accent)\">☑️ Verified</span>' : '';",
     "  const verPill = verified ? '<span class=\"adm-flag\" style=\"background:var(--money-pos)\">✅ Complete</span>' : '';",
     1),

    ("locked banner wording",
     "(completeNow ? '🔒 Saved &amp; complete — locked' : '🔒 Verified — locked (still incomplete)')",
     "(completeNow ? '🔒 Saved &amp; complete — locked' : '🔒 Marked complete — locked (admin override)')",
     1),

    ("map marker colour matches Complete",
     "    const color = dupe ? 'var(--money-neg)' : (verifiedC ? 'var(--accent)' : (it.complete ? 'var(--money-pos)' : (it.hasGPS ? '#7a5cc0' : (it.holes > 0 ? '#d98a2b' : 'var(--neutral)'))));",
     "    const color = dupe ? 'var(--money-neg)' : ((verifiedC || it.complete) ? 'var(--money-pos)' : (it.hasGPS ? '#7a5cc0' : (it.holes > 0 ? '#d98a2b' : 'var(--neutral)')));",
     1),

    ("scorecard-required toast",
     "showToast('⛔ Scorecard required — add pars & stroke index before this course can be verified.');",
     "showToast('⛔ Scorecard required — add pars & stroke index before this course can be marked complete.');",
     1),

    ("force-complete confirm",
     "        const _ok = await uiConfirm('This course isn\\u2019t 100% complete yet.\\n\\nStill missing: ' + (_miss.join(', ') || 'nothing detected') + '.\\n\\nVerify it anyway? Admin override — it will count as verified even though a step is incomplete.', { title: 'Verify anyway?', okLabel: 'Verify anyway', cancelLabel: 'Cancel', danger: false });",
     "        const _ok = await uiConfirm('This course isn\\u2019t 100% complete yet.\\n\\nStill missing: ' + (_miss.join(', ') || 'nothing detected') + '.\\n\\nMark it complete anyway? Admin override — it will count as Complete even though a step is unfinished.', { title: 'Mark complete anyway?', okLabel: 'Mark complete', cancelLabel: 'Cancel', danger: false });",
     1),

    ("sign-off toast",
     "      showToast('Verified ☑️'); advance(); return;",
     "      showToast('Marked complete ✅'); advance(); return;",
     1),

    ("undo toast",
     "      showToast('Verification removed'); closeOv(); openCourseDetail(id);",
     "      showToast('Moved back to Incomplete'); closeOv(); openCourseDetail(id);",
     1),
]


def patch(path):
    s = open(path, encoding='utf-8').read()
    n0, len0 = s.count('\n'), len(s)

    for name, old, new, want in EDITS:
        got = s.count(old)
        assert got == want, f'{path}: anchor "{name}" found {got} times, expected {want} - ABORT, file not modified'

    m = re.search(r"const BG_BUILD = 'v(\d{4})\.(\d+)\.(\d+)';", s)
    assert m, f'{path}: BG_BUILD not found - ABORT'
    old_build = m.group(0)
    new_build = "const BG_BUILD = 'v%s.%s.%d';" % (m.group(1), m.group(2), int(m.group(3)) + 1)

    out = s
    for name, old, new, want in EDITS:
        out = out.replace(old, new, want)
    out = out.replace(old_build, new_build, 1)

    # cVerified is now unused by the chip row; leave the declaration alone (it is cheap and
    # other code may read it) but make sure we did not orphan the chip itself.
    assert "chip('verified'" not in out, f'{path}: Verified chip still present - ABORT'
    assert out.count("chip('incomplete'") == 1 and out.count("chip('done'") == 1, f'{path}: core chips missing - ABORT'
    assert out.count("chip('reviewed'") == 1 and out.count("chip('rejected'") == 1, f'{path}: code-review chips missing - ABORT'
    assert '☑️ Verified' not in out, f'{path}: a Verified label survived - ABORT'
    assert out.count('<script') == s.count('<script'), f'{path}: script tag count changed - ABORT'
    assert out.count('</script>') == s.count('</script>'), f'{path}: script tag count changed - ABORT'
    assert out.rstrip().endswith('</html>'), f'{path}: file no longer ends in </html> - ABORT'
    assert abs(out.count('\n') - n0) <= 3, f'{path}: line count moved unexpectedly - ABORT'

    shutil.copy2(path, path + '.bak')
    open(path, 'w', encoding='utf-8').write(out)
    print('OK  %s  %s -> %s  (%d -> %d bytes)'
          % (path, old_build.split("'")[1], new_build.split("'")[1], len0, len(out)))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit('usage: patch_admin_states.py golf-app.html www/index.html')
    for p in sys.argv[1:]:
        patch(p)
    print('\nBoth files must be patched. node --check the inline scripts, then commit.')
