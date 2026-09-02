# Before you hand Tyler a build — READ THIS FIRST

For Claude (or anyone) writing `golf-app.html` + `www/index.html` into this clone.
Two failures keep happening. Both are silent until Tyler tries to commit, and both
land on him instead of on us. Do these every single time.

---

## 1. Run the repo's own guard. It is the last word, not `node --check`.

```sh
sh scripts/guard_stale_base.sh    # exit 0 = clean, exit 1 = commit WILL be blocked
```

There is a **pre-commit hook** (`.git/hooks/pre-commit`) that runs this. If it exits 1,
GitHub Desktop refuses the commit and Tyler gets a "Commit failed" dialog. GitHub Desktop
cannot pass `--no-verify`, so he is genuinely stuck until someone fixes it.

It checks six things the usual validation does NOT:

| # | Check | The trap |
|---|---|---|
| 1 | Lost top-level symbols vs HEAD | Caught the v842→v843 silent deletion of the whole TEMP-handicap feature. Deliberate removals go in `scripts/allowed_symbol_drops.txt`. |
| 2 | BG_BUILD going backwards | Editing a stale `raw.githubusercontent` copy. |
| 3 | Truncation — script-tag balance, closing `</html>` | The 3 MB files truncate on paste and via the Edit tool. |
| 4 | Big line-count shrink (>200) | Same stale-base symptom. |
| 5 | web/iOS app scripts differing | Forgetting to apply a change to both files. |
| 6 | **`<!--BGVER=...-->` not matching BG_BUILD** | **The one that bit on v1391.** |

### Check 6 is the easy one to miss

There is a `<!--BGVER=vYYYY.MM.NNN-->` comment on **line 5** of BOTH files. It is a
SECOND copy of the version, deliberately spelled `BGVER` and not `BG_BUILD` so the
guard can tell them apart.

**Bumping `BG_BUILD` alone is not enough — bump line 5 too, in both files.**

```sh
sed -i '5s|BGVER=v2026\.11\.OLD|BGVER=v2026.11.NEW|' golf-app.html www/index.html
```

Not a correctness bug — `checkForNewBuild` degrades safely — but a stale marker puts an
**800 KB range fetch back on every web launch** instead of the 2 KB fast path, undoing the
whole v1140 optimisation. It drifted once from v1240 to v1250 and nothing noticed for
eleven builds.

Verify both agree before you hand anything over:

```sh
for f in golf-app.html www/index.html; do
  printf '%-16s BGVER=%s  BG_BUILD=%s\n' "$f" \
    "$(sed -n '1,20p' "$f" | grep -oE 'BGVER=v[0-9.]+' | head -1 | cut -d= -f2)" \
    "$(grep -m1 -oE "BG_BUILD = 'v[0-9.]+'" "$f" | grep -oE 'v[0-9.]+')"
done
```

---

## 2. Delete `.git/index.lock` before you walk away.

```sh
ls -la .git/index.lock 2>/dev/null && rm -f .git/index.lock
```

Any `git` command run over the Cowork mount (even a read-only `git status`) creates
`.git/index.lock` and then **cannot remove it** — the mount blocks deletes by default,
so git prints:

```
warning: unable to unlink '.../.git/index.lock': Operation not permitted
```

A leftover lock makes GitHub Desktop refuse to commit. If `rm` fails with
"Operation not permitted", the session needs delete permission on this folder
(`device_request_delete_permission`) — ask for it, then remove the file. Do not leave it
for Tyler.

**Safest habit: don't run git here at all.** Verify with `grep`/`md5sum`/`sed` and let the
guard script do the rest. If you must run git, clean up the lock afterwards.

---

## The 30-second checklist

```sh
cd ~/mnt/bad-golf-app          # or C:\Users\Simpl\GitHub\bad-golf-app
sh scripts/guard_stale_base.sh                 # must exit 0
rm -f .git/index.lock                          # must not exist afterwards
md5sum golf-app.html www/index.html            # matches what you validated
```

Only then tell Tyler to commit. If the guard is red, fix it — never tell him to use
`git commit --no-verify` (it disables checks 2–6 as well, and Desktop can't pass it).

---

*Added 2026-09-02 after the v1391 Switch Kit build was handed over with a stale BGVER
marker and a stale index.lock, and blocked his commit twice.*
