#!/usr/bin/env python3
"""v2074 (Tyler, 11/26: "Yes, go ahead and do this"): bring the translation SOURCES back in line with the LIVE
dictionaries, so build_i18n.py can be run again without losing anything.

Since v1840 many builds wrote new translations (and two wording sweeps: "pot" -> "prize pool", game names kept in
English) straight into i18n/<lang>.json. The sources never got them, so a rebuild dropped ~334 Spanish and ~196
Korean / Japanese / Chinese strings and put ~50-260 older wordings back.

What this does (the live dictionaries are the truth -- they are what players see):
  source_app.json   every live key with its live translation per language; keys no dictionary has any more are
                    moved to retired_app.json (nothing is thrown away)
  overrides.json    every entry set to its live value; a string the dictionaries pin to English (a game name)
                    is added here, because build_i18n.py only keeps an English-equals-English entry when it is an override
  source_site.json  every live website key with its live translation per language

    python scripts/i18n/backfill_sources_from_live.py     # then: python scripts/i18n/build_i18n.py
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
LANGS = ['es', 'ko', 'ja', 'zh']


def load(p):
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}


def dump(p, obj):
    with open(p, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write('\n')


def main():
    src = load(os.path.join(HERE, 'source_app.json'))
    ov = load(os.path.join(HERE, 'overrides.json'))
    retired = load(os.path.join(HERE, 'retired_app.json'))
    live, live_p = {}, {}
    for L in LANGS:
        d = load(os.path.join(ROOT, 'i18n', L + '.json'))
        live[L] = dict(d.get('x', {}))
        live_p[L] = [k for k, _ in d.get('p', [])]
        for k, v in d.get('p', []):
            live[L][k] = v
    all_live = set().union(*[set(live[L]) for L in LANGS])
    # 1. source_app.json: existing keys keep their place (pattern tie order depends on it), new ones go on the end
    out, moved, added, changed = {}, 0, 0, 0
    for k in list(src.keys()) + sorted(all_live - set(src)):
        if k not in all_live:
            retired[k] = src.get(k, {}); moved += 1
            continue
        was = src.get(k)
        out[k] = {L: live[L][k] for L in LANGS if k in live[L]}
        if was is None: added += 1
        elif was != out[k]: changed += 1
    # 1b. patterns keep the order the live dictionaries list them in. build_i18n.py sorts patterns longest-first
    #     with a stable sort, so equal-length patterns come out in source order -- and the first pattern that
    #     matches a line wins. Keeping the live order means a rebuild cannot quietly change which one that is.
    rank = {}
    for L in LANGS:
        for i, k in enumerate(live_p[L]):
            rank.setdefault(k, (LANGS.index(L), i))
    pat = sorted([k for k in out if k in rank], key=lambda k: rank[k])
    it = iter(pat)
    out = {(next(it) if k in rank else k): None for k in out}   # same slots, pattern keys re-dealt in live order
    out = {k: {L: live[L][k] for L in LANGS if k in live[L]} for k in out}
    # 2. overrides.json: follow the live value; pin English-equals-English strings
    ov2, pinned, dropped = {}, 0, 0
    for k, v in ov.items():
        if k not in all_live:
            retired.setdefault(k, {}).update(v); dropped += 1
            continue
        ov2[k] = {L: live[L][k] for L in LANGS if k in live[L]}
    for k in sorted(all_live):
        if k in ov2: continue
        if any(live[L].get(k) == k for L in LANGS):
            ov2[k] = {L: live[L][k] for L in LANGS if k in live[L]}; pinned += 1
    dump(os.path.join(HERE, 'source_app.json'), out)
    dump(os.path.join(HERE, 'overrides.json'), ov2)
    dump(os.path.join(HERE, 'retired_app.json'), retired)
    print('app: %d live keys | source +%d new, %d updated, %d retired | overrides %d (+%d pinned to English, %d retired)' % (len(all_live), added, changed, moved, len(ov2), pinned, dropped))
    # 3. the website
    ss = load(os.path.join(HERE, 'source_site.json'))
    s_add = s_chg = 0
    for L in LANGS:
        d = load(os.path.join(ROOT, 'site', 'i18n', L + '.json'))
        for k, v in d.items():
            e = ss.setdefault(k, {})
            if L not in e: s_add += 1
            elif e[L] != v: s_chg += 1
            e[L] = v
    dump(os.path.join(HERE, 'source_site.json'), ss)
    print('site: +%d translations added, %d updated' % (s_add, s_chg))


if __name__ == '__main__':
    main()
