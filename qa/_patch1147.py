#!/usr/bin/env python3
# v1147 — feed the watch the three fields its own fetch path needs.
# (Written as v1146 part 3; v1146 shipped before this landed, so it is its own build.)
#
# The watch can now re-read its round straight from `games` when the phone app is
# not in the foreground (the hand-off heartbeat bails on visibilityState). To do
# that it needs three things the hand-off never sent:
#
#   my_player_id  the wearer's per-round player id ("p0-...").  games.data.scores
#                 is keyed by it, so without it a direct fetch cannot tell which
#                 row of scores belongs to the wearer.
#   nine_mode     so a direct course fetch re-keys the greens the same way the
#                 hand-off now does -- otherwise the watch's own fetch would walk
#                 straight back into the Bayou Oaks bug.
#   hole_count    RoundStore.holeCount has always defaulted to 18, so a front9 /
#                 back9 round reads "1 of 18" on the wrist.
#
# All three are additive. The CURRENT shipped watch build ignores unknown keys,
# so this is safe to push on its own, ahead of any Xcode build.
#
# ALWAYS binary mode.

import hashlib

FILES = ["golf-app.html", "www/index.html"]

# v1140's rule: FOUR places per release, not two -- BG_BUILD and the <head>
# marker, in both files. When they drift the 2 KB fast version check silently
# falls back to an 800 KB range read on every web launch.
OLD_BUILD = b"const BG_BUILD = 'v2026.11.1146';"
NEW_BUILD = b"const BG_BUILD = 'v2026.11.1147';"
OLD_MARKER = b"<!--BGVER=v2026.11.1146-->"
NEW_MARKER = b"<!--BGVER=v2026.11.1147-->"

OLD = b"""        players: groupScores,       // v972: the whole group's scores, read-only
        updatedAt: g.updatedAt || Date.now()
      },"""

NEW = b"""        players: groupScores,       // v972: the whole group's scores, read-only
        // v1146: the three fields the watch needs to refresh ITSELF from `games`
        // when the phone app is not in the foreground. games.data.scores is keyed
        // by the per-round player id, so without my_player_id a direct fetch
        // cannot find the wearer's row; without nine_mode a directly-fetched
        // course would be keyed by physical hole and range to the wrong green.
        my_player_id: myPid || '',
        nine_mode: g.nineMode || 'all18',
        hole_count: (typeof roundHoles === 'function') ? roundHoles(g) : 18,
        updatedAt: g.updatedAt || Date.now()
      },"""


def patch(path):
    with open(path, "rb") as f:
        src = f.read()
    before = len(src)

    for label, needle in (("hand-off round anchor", OLD), ("BG_BUILD", OLD_BUILD),
                          ("BGVER marker", OLD_MARKER)):
        n = src.count(needle)
        if n != 1:
            raise SystemExit("ABORT %s: %s found %d times, expected 1" % (path, label, n))
    if b"my_player_id:" in src:
        raise SystemExit("ABORT %s: already patched" % path)

    src = src.replace(OLD, NEW, 1)
    src = src.replace(OLD_BUILD, NEW_BUILD, 1)
    src = src.replace(OLD_MARKER, NEW_MARKER, 1)

    # post-conditions
    assert src.count(b"my_player_id: myPid || '',") == 1, "my_player_id not written once"
    assert src.count(b"nine_mode: g.nineMode || 'all18',") == 1, "nine_mode not written once"
    assert src.count(b"hole_count:") == 1, "hole_count not written once"
    assert src.count(NEW_BUILD) == 1 and src.count(NEW_MARKER) == 1, "version not bumped"
    assert src.count(b"v2026.11.1146") == 0, "a stale v1146 string survived"
    # myPid must already be resolved above the point we use it
    i_mypid = src.index(b"myPid = (typeof gpsResolveMyId === 'function')")
    i_use = src.index(b"my_player_id: myPid")
    assert i_mypid < i_use, "my_player_id used before myPid is resolved"
    # and all of it must sit inside the hand-off object, before the send
    i_send = src.rindex(b"await Capacitor.Plugins.WatchBridge.syncSession({")
    assert i_use < i_send, "new fields are not inside the hand-off"
    assert src.rstrip().endswith(b"</html>"), "file no longer ends in </html>"

    with open(path, "wb") as f:
        f.write(src)
    print("%s: %d -> %d bytes (+%d)  sha256=%s"
          % (path, before, len(src), len(src) - before, hashlib.sha256(src).hexdigest()[:16]))


for p in FILES:
    patch(p)
print("v1146 hand-off fields applied to both files.")
