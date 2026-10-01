#!/usr/bin/env python3
"""v1840 LANGUAGES guard — warns when new English text lands in the app without a
translation. It never blocks a commit (a hotfix must always be able to ship); it
prints the new strings and writes them to i18n/MISSING.txt so they can be handed to
the translators ("translate i18n/MISSING.txt into es/ko/ja/zh").

How it decides: every quoted string in golf-app.html that reads like a sentence or a
label (starts with a capital/emoji, has a space and lower-case letters) is checked
against the four dictionaries in i18n/. Strings already untranslated at v1840 are
listed in i18n/baseline_untranslated.txt and are not reported again.

    python scripts/guard_i18n.py            # report
    python scripts/guard_i18n.py --update   # accept the current list as the baseline
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, 'golf-app.html')
DICT_DIR = os.path.join(ROOT, 'i18n')
BASE = os.path.join(DICT_DIR, 'baseline_untranslated.txt')
OUT = os.path.join(DICT_DIR, 'MISSING.txt')
LANGS = ['es', 'ko', 'ja', 'zh']

STR = re.compile(r"'((?:[^'\\\n]|\\.){6,300})'|\"((?:[^\"\\\n]|\\.){6,300})\"|`((?:[^`\\]|\\.){6,400})`")
SENTENCE = re.compile(r"^[\s\"'(¡¿✓•·…—–\-]*[A-Z0-9☀-➿\U0001F300-\U0001FAFF][^<>{}]*[a-z]{2,}")
CODEY = re.compile(r"(=>|function\s*\(|\breturn\b|===|!==|&&|\|\||\bconst\b|px;|:\s*\d+px|^https?:|^[\w.-]+@)")


def norm(s):
    return re.sub(r'\s+', ' ', s).strip()


def load_keys():
    exact, pats = set(), []
    for L in LANGS:
        p = os.path.join(DICT_DIR, L + '.json')
        if not os.path.exists(p):
            continue
        d = json.load(open(p, encoding='utf-8'))
        exact.update(d.get('x', {}).keys())
        for k, _ in d.get('p', []):
            pats.append(re.compile('^' + re.sub(r'\\\{\d+\\\}', '.*?', re.escape(k)) + '$'))
    return exact, pats


def candidates(src):
    m = re.search(r"const BG_BUILD = '[^']+';", src)
    body = src[m.start():] if m else src
    # comments talk ABOUT text ("this banner said 'Saved & complete'") - drop them
    body = re.sub(r'/\*[\s\S]*?\*/', ' ', body)
    body = re.sub(r'(?m)^\s*//[^\n]*', ' ', body)
    body = re.sub(r'([;{}(),\]])[ \t]*//[^\n]*', r'\1', body)
    out = set()
    for mm in STR.finditer(body):
        s = next(g for g in mm.groups() if g is not None)
        s = s.replace("\\'", "'").replace('\\"', '"')
        s = re.sub(r'\\u\{([0-9a-fA-F]+)\}', lambda m: chr(int(m.group(1), 16)), s)
        s = re.sub(r'\\u([0-9a-fA-F]{4})', lambda m: chr(int(m.group(1), 16)), s)
        try: s.encode('utf-8')
        except UnicodeEncodeError: s = s.encode('utf-8', 'surrogatepass').decode('utf-16', 'surrogatepass') if False else re.sub(r'[\ud800-\udfff]', '', s)
        s = re.sub(r'\$\{[^}]*\}', '{0}', s)
        if '<' in s and '>' in s:
            parts = re.split(r'<[^>]+>', s)       # HTML: check the text between tags
        else:
            parts = [s]
        for p in parts:
            p = norm(p)
            if len(p) < 6 or not SENTENCE.search(p) or CODEY.search(p) or ' ' not in p:
                continue
            out.add(p)
    return out


def main():
    if not os.path.exists(APP):
        print('guard_i18n: golf-app.html not found - skipped'); return 0
    exact, pats = load_keys()
    if not exact:
        print('guard_i18n: no dictionaries in i18n/ - skipped'); return 0
    src = open(APP, encoding='utf-8').read()
    missing = []
    for s in sorted(candidates(src)):
        if s in exact or re.sub(r'^\W+|\W+$', '', s) in exact:
            continue
        if any(p.match(s) for p in pats):
            continue
        missing.append(s)
    base = set()
    if os.path.exists(BASE):
        base = set(l.rstrip('\n') for l in open(BASE, encoding='utf-8'))
    if '--update' in sys.argv:
        open(BASE, 'w', encoding='utf-8').write('\n'.join(missing) + '\n')
        print(f'guard_i18n: baseline set ({len(missing)} strings)'); return 0
    new = [s for s in missing if s not in base]
    if new or os.path.exists(OUT):
        open(OUT, 'w', encoding='utf-8').write('\n'.join(new) + ('\n' if new else ''))
    if new:
        print(f'guard_i18n: {len(new)} new English string(s) have no Spanish/Korean/Japanese/Chinese yet '
              f'(they show in English until translated). Listed in i18n/MISSING.txt:')
        for s in new[:15]:
            print('   ', s[:100])
        if len(new) > 15:
            print(f'    ... and {len(new) - 15} more')
    else:
        print('guard_i18n: All clear.')
    return 0   # warn only - never blocks


if __name__ == '__main__':
    sys.exit(main())
