#!/usr/bin/env python3
"""v1131 — Tournament Results was missing CTP / Most GIRs / Fewest Putts.

Same script against BOTH files, assert count == 1 on every anchor.
"""
import sys, io

FILES = sys.argv[1:]
assert FILES, "pass the file paths"

OLD = """        html += '<div class="small-text" style="color:var(--text-muted)">Longest made putt across every group — scorekeepers log it on the score screen. The pot settles once every group that day has finished.</div></div>';
      }
    } catch (e) {}
"""

NEW = """        html += '<div class="small-text" style="color:var(--text-muted)">Longest made putt across every group — scorekeepers log it on the score screen. The pot settles once every group that day has finished.</div></div>';
      }
    } catch (e) {}
    // v1131 (Tyler, 8/19): "This tournament has long putt, GIR's and putts and CTP.
    // This 1st screen shows it, the second is missing several of them." Correct, and
    // it was never a money bug — the calculators agreed and the Bets screen's numbers
    // were right. bgPotRowsForEvent() builds EVERY field pot (Skins, Long Putt, CTP,
    // Side Pots — Low Net / Most GIRs / Fewest Putts — and Tournament Nassau) and is
    // what the Bets screen renders. THIS screen never called it: it hand-rolled Long
    // Drive and Long Putt and nothing else, so CTP, Most GIRs and Fewest Putts had no
    // display code here at all. Field Skins and field Nassau were missing too — they
    // simply weren't configured on the event that surfaced this.
    //
    // Rendering the shared rows is the part that stops the two surfaces drifting
    // again: a pot type added to bgPotRowsForEvent now appears on both the day it
    // lands, instead of on whichever screen someone remembered.
    //
    // Long Putt is filtered OUT on purpose. The block directly above is deliberately
    // richer — v1022 added it so the leader is visible MID-round ("leading, 1 of 3
    // groups finished"), which the shared row flattens to "not settled yet". Long
    // Drive is not in the shared rows at all (commissioner-set, with its own Set
    // winner button), so nothing above is duplicated by this block.
    try {
      const _fieldRows = (bgPotRowsForEvent(t, _rawRounds) || [])
        .filter(r => r && r.pot && String(r.pot).indexOf('Long Putt') !== 0);
      if (_fieldRows.length) html += _bgPotTableHtml(_fieldRows, 'Field pots — who won what') || '';
    } catch (e) {}
"""

EDITS = [
    ("results field-pot block", OLD, NEW),
    ("version bump", "BG_BUILD = 'v2026.11.1130'", "BG_BUILD = 'v2026.11.1131'"),
]

for path in FILES:
    with io.open(path, encoding='utf-8', newline='') as f:
        s = f.read()
    for name, old, new in EDITS:
        c = s.count(old)
        assert c == 1, "%s: anchor %r matched %d times (expected 1)" % (path, name, c)
        s = s.replace(old, new)
    with io.open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(s)
    print("patched %s  (%d edits)" % (path, len(EDITS)))
