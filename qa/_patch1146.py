#!/usr/bin/env python3
# v1146 patch — Bad Golf
#
# 1) Wind drift on the GPS map is ON by default, for real. The code default was
#    already `true`, but any phone that ever unchecked "Show wind drifting on the
#    map" stored 'golf:wind-motion' = '0' and kept it off forever. One-time
#    migration clears that stored '0' exactly once; after this build the stored
#    value is honoured normally, so anyone who turns it off from here on keeps it off.
# 2) Bump BG_BUILD 1145 -> 1146 in both files.
# 3) Bump the stale <!--BGVER=--> head marker (it read v2026.11.1141 against a
#    v1145 build, so v1140's 2 KB fast version-check was silently falling back to
#    the 800 KB path on every launch).
#
# ALWAYS binary mode — text mode with errors='replace' silently dropped 18.5 KB
# from golf-app.html in a previous session.

import hashlib
import sys

FILES = ["golf-app.html", "www/index.html"]

OLD_VER = b"v2026.11.1145"
NEW_VER = b"v2026.11.1146"

OLD_MARKER = b"<!--BGVER=v2026.11.1141-->"
NEW_MARKER = b"<!--BGVER=v2026.11.1146-->"

OLD_BUILD = b"const BG_BUILD = 'v2026.11.1145';"
NEW_BUILD = b"const BG_BUILD = 'v2026.11.1146';"

OLD_WIND = (
    b"  try { const _wm = localStorage.getItem('golf:wind-motion');"
    b" if (_wm != null) _windMotionOn = (_wm === '1'); } catch (e) {}"
)

NEW_WIND = (
    b"  // v1146 (Tyler, 8/20): \"make sure the wind is turned on by default.\" The code\n"
    b"  // default above already was `true` -- the problem is that the checkbox writes a\n"
    b"  // STICKY '0' to golf:wind-motion, so any phone that ever unchecked \"Show wind\n"
    b"  // drifting on the map\" (or tapped it off once to see what it did) kept the\n"
    b"  // streaks off forever, on every round, with no way back except finding the box\n"
    b"  // again inside the Wind sheet. This clears that stored '0' exactly ONCE per\n"
    b"  // device, then falls through to the normal read below -- so the preference is\n"
    b"  // restored to ON now, and anyone who turns it off AFTER this build keeps it off.\n"
    b"  // Do not re-use this marker key for a future reset; bump the version in it.\n"
    b"  try {\n"
    b"    if (localStorage.getItem('golf:wind-motion-default-v1146') !== '1') {\n"
    b"      localStorage.removeItem('golf:wind-motion');\n"
    b"      localStorage.setItem('golf:wind-motion-default-v1146', '1');\n"
    b"    }\n"
    b"  } catch (e) {}\n"
    b"  try { const _wm = localStorage.getItem('golf:wind-motion');"
    b" if (_wm != null) _windMotionOn = (_wm === '1'); } catch (e) {}"
)


def patch(path):
    with open(path, "rb") as f:
        src = f.read()

    before = len(src)

    # --- pre-conditions: every anchor must appear EXACTLY once ---
    for label, needle, count in (
        ("BGVER head marker", OLD_MARKER, 1),
        ("BG_BUILD const", OLD_BUILD, 1),
        ("wind-motion read", OLD_WIND, 1),
    ):
        n = src.count(needle)
        if n != count:
            raise SystemExit("ABORT %s: %s appears %d times, expected %d" % (path, label, n, count))

    if src.count(b"golf:wind-motion-default-v1146"):
        raise SystemExit("ABORT %s: already patched" % path)

    src = src.replace(OLD_MARKER, NEW_MARKER, 1)
    src = src.replace(OLD_BUILD, NEW_BUILD, 1)
    src = src.replace(OLD_WIND, NEW_WIND, 1)

    # --- post-conditions ---
    assert src.count(NEW_MARKER) == 1, "marker not written"
    assert src.count(NEW_BUILD) == 1, "build not written"
    assert src.count(b"golf:wind-motion-default-v1146") == 2, "migration block malformed"
    assert src.count(OLD_VER) == 0, "a stale v1145 string survived"
    # the removeItem must sit ABOVE the read it is meant to precede
    assert src.index(b"golf:wind-motion-default-v1146") < src.index(OLD_WIND.strip()[:60]), "order wrong"
    assert src.rstrip().endswith(b"</html>"), "file no longer ends in </html>"

    with open(path, "wb") as f:
        f.write(src)

    print("%s: %d -> %d bytes (+%d)  sha256=%s"
          % (path, before, len(src), len(src) - before, hashlib.sha256(src).hexdigest()[:16]))


for p in FILES:
    patch(p)
print("v1146 patch applied to both files.")
