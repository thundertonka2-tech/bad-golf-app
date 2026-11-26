# HANDOFF v2026.11.2074 — translation sources back-filled; build_i18n.py is safe to run again

Date: Thu 2026-11-26. Pushed to `main` from the cloud session. Tyler: "Yes, go ahead and do this" (back-fill the source lists so the script is safe again).

## What was wrong
Since v1840 many builds wrote new translations straight into `i18n/<lang>.json`, and two wording sweeps ("pot" -> "prize pool", game names kept in English) were applied there too. `scripts/i18n/source_app.json`, `overrides.json` and `source_site.json` never got them, so `python scripts/i18n/build_i18n.py` would have dropped 263 Spanish and 228 Korean / Japanese / Chinese app strings, 139 website strings per language, and put older wording back on about 50-260 lines.

## What was done
- `scripts/i18n/backfill_sources_from_live.py` (new, re-runnable): the live language files are the truth.
  - `source_app.json`: every live key with its live translation (+388 new keys, 385 updated). 1,315 source strings no language file uses any more were moved to `retired_app.json` — kept, not deleted.
  - `overrides.json`: every entry set to its live value; 176 strings the dictionaries pin to English (game names) added, because the build only keeps an English-equals-English entry when it is an override.
  - `source_site.json`: +556 website translations.
  - Patterns keep the order the live files list them in.
- `build_i18n.py`:
  - **Guard:** if a rebuild would drop a translation that is live today, it stops and writes nothing (`--allow-drop` for a deliberate removal).
  - **`--check`:** changes nothing, reports whether sources and language files are in step.
- Rebuilt from the back-filled sources: every app string and pattern, in all four languages, has exactly the value it had before. The only content change to the app files is pattern order (the app re-sorts patterns by length itself); a simulation of the app's matcher over every pattern (22,920 sample lines) picked the same pattern before and after. Website files: identical apart from one no-op entry ("Anthropic" = "Anthropic").

## One real wording fix found on the way (Spanish)
A past sweep had turned "fee" into the game name on five Spanish lines (e.g. "Set the fee to" read "Pon la Quota en"). They read "cuota" again. Build number bumped to v2074 so phones pick the language files up.

## QA
New `qa/qa_v2074_i18n_sources_in_step.js` (12 checks: `--check` clean, web and iPhone files identical, counts, the Spanish lines, and the guard stopping a lossy rebuild with nothing written). All 84 `qa_*.js` pass on both files; `npm test` 82/82; guards All clear; `guard_i18n` All clear.

## How to add translations from now on
Put the English key with all four languages in `scripts/i18n/overrides.json`, run `python scripts/i18n/build_i18n.py`, commit. If someone edits `i18n/*.json` directly again, `--check` (and the QA script) will say so; run the back-fill script to bring the sources level.
