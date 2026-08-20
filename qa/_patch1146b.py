#!/usr/bin/env python3
# v1146 part 2 — the Apple Watch hand-off ignored nineMode.
#
# THE BUG (Kevin, Bayou Oaks City Park South, 8/20, round LINK90 nineMode='b9x2'):
# a "back nine twice" round plays physical holes 10-18 twice, so PLAYED hole 3 is
# PHYSICAL hole 12. gpsView has always known this -- physHole() -- so the PHONE
# ranged correctly. The watch hand-off never applied the rule: it shipped
# course_gps.holes keyed by PHYSICAL hole and current_hole as the PLAYED hole, and
# the watch does holes[currentHole]. So on played hole 3 the watch looked up
# physical hole 3, 1,434 m away, and printed 1565 yards. Kevin's diagnostic:
#   hole 3/18 - par 5 - gps good - acc 4m - C/F/B 1565/1558/1578
# Physical hole 3 is par 5; the round card says played hole 3 is par 4 -- the watch
# showed 5, which is the same lookup failing the same way, and confirms it.
#
# THE FIX: re-key the greens into PLAYED-hole space before handing them over, so
# holes[3] IS the green for played hole 3. Ships in the web/Capacitor build --
# NO watch app change, so it does not need a TestFlight round trip.
#
# Also collapses three copies of the played->physical rule into one top-level
# helper (gpsView's physHole and mapInfo's inline copy now delegate), so a future
# nineMode can never land on two of the three.
#
# ALWAYS binary mode.

import hashlib

FILES = ["golf-app.html", "www/index.html"]

# ---- anchor 1: define the shared helper right after roundHoles() -------------
ANCHOR_ROUNDHOLES = b"""  } catch(e){}
  return 18;
}
function isNineRating(r){ return typeof r==='number' && isFinite(r) && r > 25 && r < 46; }
"""

HELPERS = b"""  } catch(e){}
  return 18;
}
// v1146: the ONE implementation of the played-hole -> physical-hole rule. A
// repeated-nine round plays the same nine twice, so played hole 3 of a 'b9x2'
// round is physical hole 12 on the satellite -- and on the wrist. gpsView's
// physHole() and mapInfo()'s inline copy both delegate here now; before this
// there were three copies of the rule and the third one (the Apple Watch
// hand-off) simply did not exist, which is the whole of the Bayou Oaks bug.
function bgPhysHole(g, h) {
  if (!g || !g.nineMode) return h;
  if (g.nineMode === 'f9x2') return ((h - 1) % 9) + 1;
  if (g.nineMode === 'b9x2') return ((h - 1) % 9) + 10;
  if (g.nineMode === 'front9') return h;      // front 9 only: played hole = physical hole
  if (g.nineMode === 'back9') return h + 9;   // back 9 only: played hole 1 -> physical hole 10
  return h;
}
// v1146: course_gps.holes is keyed by PHYSICAL hole. The watch looks a green up
// by the PLAYED hole it is showing, so hand it a map keyed the way it will ask.
// Returns the original object untouched for a normal 18 (no allocation, no
// behaviour change); never mutates the cached copy, because the same course can
// be played all18 in one round and b9x2 in the next.
function bgHolesByPlayedHole(g, holes) {
  try {
    if (!g || !g.nineMode || g.nineMode === 'all18') return holes;
    if (!holes || typeof holes !== 'object') return holes;
    var out = {}, n = (typeof roundHoles === 'function') ? roundHoles(g) : 18;
    for (var h = 1; h <= n; h++) {
      var src = holes[String(bgPhysHole(g, h))];
      if (src) out[String(h)] = src;
    }
    return out;
  } catch (e) { return holes; }
}
function isNineRating(r){ return typeof r==='number' && isFinite(r) && r > 25 && r < 46; }
"""

# ---- anchor 2: the watch hand-off greens block ------------------------------
ANCHOR_WATCH = b"""        window._bgWatchGreens = { id: g.courseId, holes };
      }
    } catch (e) {}
"""

NEW_WATCH = b"""        window._bgWatchGreens = { id: g.courseId, holes };
      }
    } catch (e) {}
    // v1146: re-key the greens into PLAYED-hole space. The watch renders the
    // played hole ('3 of 18') and looks the green up by that number, so on a
    // repeated-nine round it was ranging to the wrong hole -- 1565 yards on a
    // par 4. The phone was always right because gpsView applies physHole(); this
    // is the same rule, applied at the one place it was missing. Mapped here and
    // not in the cache above on purpose: _bgWatchGreens is keyed by COURSE, and
    // the same course can be all18 in one round and b9x2 in the next.
    holes = bgHolesByPlayedHole(g, holes);
"""

# ---- anchor 3: gpsView's physHole -> delegate --------------------------------
ANCHOR_PHYSHOLE = b"""  function physHole(h) {
    const g = state.game;
    if (!g || !g.nineMode) return h;
    if (g.nineMode === 'f9x2') return ((h - 1) % 9) + 1;
    if (g.nineMode === 'b9x2') return ((h - 1) % 9) + 10;
    if (g.nineMode === 'front9') return h;         // front 9 only: round hole = physical hole
    if (g.nineMode === 'back9') return h + 9;       // back 9 only: round hole 1 \xe2\x86\x92 physical hole 10
    return h;
  }"""

NEW_PHYSHOLE = b"""  function physHole(h) {
    // v1146: delegates to the top-level bgPhysHole so the map, the scorecard and
    // the Apple Watch hand-off cannot drift apart. Behaviour is unchanged.
    return bgPhysHole(state.game, h);
  }"""

# ---- anchor 4: mapInfo's inline copy -> delegate ------------------------------
ANCHOR_MAPINFO = (
    b"    const ph = (function () { const g = state.game; if (!g || !g.nineMode) return playedHole;"
    b" if (g.nineMode === 'f9x2') return ((playedHole - 1) % 9) + 1;"
    b" if (g.nineMode === 'b9x2') return ((playedHole - 1) % 9) + 10;"
    b" if (g.nineMode === 'front9') return playedHole;"
    b" if (g.nineMode === 'back9') return playedHole + 9; return playedHole; })();"
)

NEW_MAPINFO = b"    const ph = bgPhysHole(state.game, playedHole);   // v1146: was a third copy of the rule"


def patch(path):
    with open(path, "rb") as f:
        src = f.read()
    before = len(src)

    for label, needle in (
        ("roundHoles anchor", ANCHOR_ROUNDHOLES),
        ("watch greens block", ANCHOR_WATCH),
        ("gpsView physHole", ANCHOR_PHYSHOLE),
        ("mapInfo inline copy", ANCHOR_MAPINFO),
    ):
        n = src.count(needle)
        if n != 1:
            raise SystemExit("ABORT %s: %s found %d times, expected 1" % (path, label, n))

    if b"bgHolesByPlayedHole" in src:
        raise SystemExit("ABORT %s: already patched" % path)

    src = src.replace(ANCHOR_ROUNDHOLES, HELPERS, 1)
    src = src.replace(ANCHOR_WATCH, NEW_WATCH, 1)
    src = src.replace(ANCHOR_PHYSHOLE, NEW_PHYSHOLE, 1)
    src = src.replace(ANCHOR_MAPINFO, NEW_MAPINFO, 1)

    # ---- post-conditions ----
    assert src.count(b"function bgPhysHole(g, h)") == 1, "helper not defined once"
    assert src.count(b"function bgHolesByPlayedHole(g, holes)") == 1, "re-key helper not defined once"
    assert src.count(b"holes = bgHolesByPlayedHole(g, holes);") == 1, "hand-off not wired"
    # the re-key must land BEFORE the pars loop that reads holes[...] and before the send
    i_rekey = src.index(b"holes = bgHolesByPlayedHole(g, holes);")
    i_pars = src.index(b"if (_p == null && holes && holes[String(i + 1)]")
    # rindex, not index: the roundEnded signal earlier in the same function is
    # also a syncSession call and sits BEFORE the greens block.
    i_send = src.rindex(b"await Capacitor.Plugins.WatchBridge.syncSession({")
    assert i_rekey < i_pars < i_send, "re-key is in the wrong place in the hand-off"
    # no copy of the played->physical arithmetic left anywhere but the helper.
    # (Counting "=== 'b9x2'" would be wrong: newGame()'s par/SI remap legitimately
    # tests setup.nineMode against the same string and must not be touched.)
    assert src.count(b"% 9) + 10") == 1, "a duplicate played->physical rule survived"
    assert src.count(b"% 9) + 1;") == 1, "a duplicate f9x2 rule survived"
    assert src.rstrip().endswith(b"</html>"), "file no longer ends in </html>"

    with open(path, "wb") as f:
        f.write(src)
    print("%s: %d -> %d bytes (+%d)  sha256=%s"
          % (path, before, len(src), len(src) - before, hashlib.sha256(src).hexdigest()[:16]))


for p in FILES:
    patch(p)
print("v1146 watch nineMode fix applied to both files.")
