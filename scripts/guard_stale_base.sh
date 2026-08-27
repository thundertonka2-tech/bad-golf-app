#!/bin/sh
# ============================================================================
# Bad Golf — STALE-BASE / SILENT-LOSS GUARD
#
# Why this exists
# ---------------
# On 2026-07-25 commit 2c795eb ("V842", 14:00:38) shipped the whole TEMP-handicap
# feature. Commit 2a1cb17 ("V843", 14:04:15) — three minutes and thirty-seven
# seconds later — silently deleted every line of it. Nobody noticed for three
# weeks; it was found only because a test-script case failed.
#
# The cause: a session edited a copy of golf-app.html that predated 842 (a stale
# raw.githubusercontent.com fetch) and wrote the whole 4.7 MB file back over the
# top. Because the file is written wholesale, git sees a normal edit — there is
# nothing about the diff that looks like a mistake.
#
# What this checks (working tree vs HEAD), for golf-app.html and www/index.html:
#   1. LOST SYMBOLS  — any top-level function/const/let/var that HEAD has and the
#                      new file does not. This is the signal that actually caught
#                      the 842 loss (isHcpTemp, applyHcpTempBadgeState,
#                      refreshHcpTempBadge, hcpTempBadgeHtml all vanished).
#                      A removal you MEANT to make goes in
#                      scripts/allowed_symbol_drops.txt — see allowlist() below.
#                      Prefer that over `git commit --no-verify`, which disables
#                      checks 2-5 as well (GitHub Desktop can't pass it anyway).
#   2. VERSION GOING BACKWARDS — BG_BUILD lower than HEAD's.
#   3. TRUNCATION    — unbalanced <script> tags, or no closing </html>.
#   4. BIG SHRINK    — a large net line-count drop.
#   5. WEB/iOS DRIFT — golf-app.html and www/index.html app scripts differing.
#   6. BGVER DRIFT  — the <!--BGVER=...--> head comment not matching BG_BUILD.
#                     Not a correctness bug (checkForNewBuild only trusts the
#                     fast 2 KB path when a file's own comment agrees with its
#                     own BG_BUILD, so it degrades safely) — but it silently
#                     undoes the whole v1140 fix and puts an 800 KB range fetch
#                     back on EVERY web launch. It drifted from v1240 to v1250
#                     and nothing noticed for eleven builds, which is exactly
#                     why it is checked here now rather than remembered.
#
# Exit 0 = clean. Exit 1 = something looks wrong; the pre-commit hook blocks.
# Deliberate removals are fine — just confirm them (the hook tells you how).
#
# Usage:  sh scripts/guard_stale_base.sh
# ============================================================================

set -u
FILES="golf-app.html www/index.html"
SHRINK_LIMIT=200
ALLOWFILE="scripts/allowed_symbol_drops.txt"
TMP="${TMPDIR:-/tmp}/bgguard.$$"
mkdir -p "$TMP" || exit 0
trap 'rm -rf "$TMP"' EXIT INT TERM

FAIL=0
note()  { printf '%s\n' "$*"; }
problem() { FAIL=1; printf '\n  !! %s\n' "$*"; }

# Top-level JS symbols: function / async function / const / let / var at column 0.
symbols() {
  {
    grep -oE '^(async[[:space:]]+)?function[[:space:]]+[A-Za-z0-9_$]+' "$1" 2>/dev/null \
      | sed -E 's/.*[[:space:]]//'
    grep -oE '^(const|let|var)[[:space:]]+[A-Za-z0-9_$]+[[:space:]]*=' "$1" 2>/dev/null \
      | sed -E 's/^(const|let|var)[[:space:]]+//; s/[[:space:]]*=$//'
  } | sort -u
}

# DECLARED REMOVALS. Listing a symbol in scripts/allowed_symbol_drops.txt (one per
# line, '#' comments allowed) says "yes, deleting this is on purpose". ONLY check 1
# (LOST SYMBOLS) consults it -- truncation, web/iOS drift, big-shrink and the
# version check are never bypassed, and every allowed removal is still PRINTED so
# it can't happen quietly. Use this instead of `git commit --no-verify`: that turns
# the entire guard off, including the truncation checks this file exists for.
allowlist() {
  if [ -f "$ALLOWFILE" ]; then
    sed -E 's/#.*//; s/[[:space:]]+//g' "$ALLOWFILE" 2>/dev/null | grep -v '^$' | sort -u
  fi
}

# BG_BUILD as a comparable integer (matches the app's own bnum(): M*1e6+m*1e4+p).
buildnum() {
  v=$(grep -oE "BG_BUILD[[:space:]]*=[[:space:]]*'v[0-9.]+'" "$1" 2>/dev/null | head -1 \
      | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
  [ -z "$v" ] && { echo 0; return; }
  echo "$v" | awk -F. '{print $1*1000000 + $2*10000 + $3}'
}

note "── Bad Golf stale-base guard ──────────────────────────────"

if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  note "  no HEAD yet — nothing to compare against. OK."
  exit 0
fi

for f in $FILES; do
  [ -f "$f" ] || { note "  $f: not in the working tree — skipped."; continue; }
  if ! git cat-file -e "HEAD:$f" 2>/dev/null; then
    note "  $f: not in HEAD (new file) — skipped."
    continue
  fi

  base="$TMP/$(echo "$f" | tr '/' '_').head"
  git show "HEAD:$f" > "$base" 2>/dev/null || continue

  # If the file is byte-identical to HEAD there is nothing to check.
  if cmp -s "$base" "$f"; then
    note "  $f: unchanged."
    continue
  fi

  hb=$(buildnum "$base"); wb=$(buildnum "$f")
  hl=$(wc -l < "$base" | tr -d ' '); wl=$(wc -l < "$f" | tr -d ' ')
  note "  $f: HEAD $hl lines / build $hb  →  new $wl lines / build $wb"

  # 1. LOST SYMBOLS
  symbols "$base" > "$TMP/a.sym"
  symbols "$f"    > "$TMP/b.sym"
  comm -23 "$TMP/a.sym" "$TMP/b.sym" > "$TMP/lost.all"
  allowlist > "$TMP/allow.sym"
  comm -12 "$TMP/lost.all" "$TMP/allow.sym" > "$TMP/lost.ok"
  comm -23 "$TMP/lost.all" "$TMP/allow.sym" > "$TMP/lost.sym"
  nok=$(wc -l < "$TMP/lost.ok" | tr -d ' ')
  if [ "$nok" -gt 0 ]; then
    note "  $f: $nok declared removal(s), allowed by $ALLOWFILE:"
    sed 's/^/       · /' "$TMP/lost.ok"
  fi
  n=$(wc -l < "$TMP/lost.sym" | tr -d ' ')
  if [ "$n" -gt 0 ]; then
    problem "$f drops $n top-level symbol(s) that HEAD has:"
    sed 's/^/       - /' "$TMP/lost.sym" | head -40
    [ "$n" -gt 40 ] && note "       ... and $((n - 40)) more"
    note "       If you MEANT to delete these, add them to $ALLOWFILE"
    note "       (one per line) and commit again — that keeps every other check on."
    note "       If you did NOT mean to delete them, you are almost certainly"
    note "       writing from a STALE COPY of the file."
  fi

  # 2. VERSION GOING BACKWARDS
  if [ "$wb" -lt "$hb" ]; then
    problem "$f BG_BUILD went BACKWARDS ($hb → $wb). Stale base, or the bump was missed."
  fi

  # 6. BGVER DRIFT — the head comment must match this file's own BG_BUILD.
  bgver=$(sed -n '1,20p' "$f" | grep -oE 'BGVER=v[0-9.]+' | head -1 | cut -d= -f2)
  bgbld=$(grep -oE "BG_BUILD[[:space:]]*=[[:space:]]*'v[0-9.]+'" "$f" | head -1 | grep -oE 'v[0-9.]+')
  if [ -n "$bgver" ] && [ -n "$bgbld" ] && [ "$bgver" != "$bgbld" ]; then
    problem "$f BGVER comment ($bgver) does not match BG_BUILD ($bgbld). Bump BOTH — otherwise every web launch re-fetches 800 KB instead of 2 KB."
  fi

  # 3. TRUNCATION
  so=$(grep -c '<script' "$f"); sc=$(grep -c '</script>' "$f")
  if [ "$so" -ne "$sc" ]; then
    problem "$f has unbalanced script tags (${so} open / ${sc} close) — TRUNCATED. Do not commit."
  fi
  if ! tail -c 400 "$f" | grep -q '</html>'; then
    problem "$f does not end with </html> — TRUNCATED. Do not commit."
  fi

  # 4. BIG SHRINK
  drop=$((hl - wl))
  if [ "$drop" -gt "$SHRINK_LIMIT" ]; then
    problem "$f shrank by $drop lines (limit $SHRINK_LIMIT). Confirm that is deliberate."
  fi
done

# 5. WEB / iOS DRIFT — the two files share one identical app <script>; they differ
# only in the head. Compare from BG_BUILD to EOF.
if [ -f golf-app.html ] && [ -f www/index.html ]; then
  sed -n '/BG_BUILD/,$p' golf-app.html  > "$TMP/tail.web" 2>/dev/null
  sed -n '/BG_BUILD/,$p' www/index.html > "$TMP/tail.ios" 2>/dev/null
  if ! cmp -s "$TMP/tail.web" "$TMP/tail.ios"; then
    problem "golf-app.html and www/index.html app scripts DIFFER — web and iOS will drift."
    note "       Every code change must go into BOTH files identically."
  else
    note "  web / iOS app scripts identical."
  fi
fi

if [ "$FAIL" -eq 0 ]; then
  note ""
  note "  All clear."
  note "───────────────────────────────────────────────────────────"
  exit 0
fi

note ""
note "───────────────────────────────────────────────────────────"
exit 1
