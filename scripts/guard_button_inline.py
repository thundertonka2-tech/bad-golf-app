#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bad Golf — button inline-style guard  (v1455, button system phase 2)

Enforces the rule the file states at its own line 3674:

    a <button> never carries background, color, border, border-radius,
    min-height, padding, font-size, font-weight or cursor in an inline
    `style=`. Layout properties (flex, margin, width) are fine.

Phase 2 stripped 1,617 such declarations off 401 buttons. Without a guard the
next hand-written `style="background:#fff;padding:12px"` silently defeats the
component again on that button, and nobody notices until a theme lands on top
of it -- which is exactly how the previous dark-theme attempt died.

The carve-outs phase 2 deliberately kept are listed in
scripts/allowed_button_inline.txt, same pattern as allowed_shrink.txt. The
guard fails on anything NOT in that list, so existing debt is frozen and new
debt is blocked.

Usage:  python3 scripts/guard_button_inline.py [--update]
        --update  rewrites the allowlist from the current files (use only
                  when you have deliberately added a carve-out)
"""
import re, sys, os

NINE = {'background', 'color', 'border', 'border-radius', 'min-height',
        'padding', 'font-size', 'font-weight', 'cursor'}

FILES = ['golf-app.html', 'www/index.html']
ALLOW = 'scripts/allowed_button_inline.txt'

TAG = re.compile(r'<button\b')
NAME = re.compile(r'[^\s=/>]+')
UNQ = re.compile(r'[^\s>]*')


def scan_tag(s, i):
    j = i + len('<button'); n = len(s); attrs = []; guard = 0
    while j < n:
        guard += 1
        if guard > 6000:
            return None, attrs
        c = s[j]
        if c in ' \t\r\n':
            j += 1; continue
        if c == '>':
            return j, attrs
        if c == '/' and j + 1 < n and s[j+1] == '>':
            return j + 1, attrs
        if c == '<':
            return None, attrs
        m = NAME.match(s, j)
        if not m:
            return None, attrs
        name = m.group(0); j = m.end()
        k = j
        while k < n and s[k] in ' \t\r\n':
            k += 1
        if k < n and s[k] == '=':
            k += 1
            while k < n and s[k] in ' \t\r\n':
                k += 1
            q = s[k] if k < n else ''
            if q in ('"', "'"):
                e = s.find(q, k + 1)
                if e < 0:
                    return None, attrs
                attrs.append((name.lower(), s[k+1:e])); j = e + 1
            else:
                m2 = UNQ.match(s, k)
                attrs.append((name.lower(), m2.group(0))); j = m2.end()
        else:
            attrs.append((name.lower(), None))
    return None, attrs


def split_decls(v):
    out = []; depth = 0; start = 0
    for idx, ch in enumerate(v):
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth = max(0, depth - 1)
        elif ch == ';' and depth == 0:
            out.append(v[start:idx]); start = idx + 1
    out.append(v[start:])
    return out


def violations(path):
    """Returns [(signature, label, props)] -- signature is content-based, not
    line-based, because line numbers move with every build."""
    data = open(path, encoding='utf-8', newline='').read()
    out = []
    for m in TAG.finditer(data):
        i = m.start()
        end, attrs = scan_tag(data, i)
        if end is None:
            continue                      # unreadable tag: reported separately
        d = {}
        for (k, v) in attrs:
            if k not in d:
                d[k] = v
        style = d.get('style')
        if not style:
            continue
        bad = sorted({p.split(':', 1)[0].strip().lower()
                      for p in split_decls(style) if ':' in p}
                     & NINE)
        if not bad:
            continue
        cls = ' '.join(sorted(re.sub(r'\s+', ' ', d.get('class') or '').split()))
        j = data.find('</button>', end)
        lab = re.sub(r'\s+', ' ', re.sub(r'<[^>]*>', '', data[end+1:j])) if 0 < j - end < 400 else ''
        # Normalise: a dynamic style value can span newlines, and the
        # allowlist is one signature per line.
        flat = re.sub(r'\s+', ' ', style).strip()
        sig = '%s|%s|%s' % (cls, flat, ','.join(bad))
        out.append((sig, lab.strip()[:40], bad))
    return out


def main():
    root = os.getcwd()
    update = '--update' in sys.argv
    print('-- Bad Golf button inline-style guard ' + '-' * 24)
    allow = set()
    if os.path.exists(ALLOW):
        for ln in open(ALLOW, encoding='utf-8'):
            ln = ln.rstrip('\n')
            if ln and not ln.startswith('#'):
                allow.add(ln)

    found = {}
    for f in FILES:
        if not os.path.exists(f):
            print('  MISSING %s' % f); return 2
        v = violations(f)
        found[f] = v
        print('  %-16s %d buttons carry a forbidden inline property' % (f, len(v)))

    sigs = set(s for v in found.values() for (s, _l, _b) in v)

    if update:
        with open(ALLOW, 'w', encoding='utf-8') as fh:
            fh.write('# Buttons allowed to keep a forbidden inline property.\n')
            fh.write('# Written by scripts/guard_button_inline.py --update.\n')
            fh.write('# Each line: <sorted class list>|<style value>|<offending props>\n')
            fh.write('# The carve-outs are documented in\n')
            fh.write('# claude/PHASE2_CARVEOUTS_v1455.md -- dynamic style values,\n')
            fh.write('# --seg buttons the component does not paint, and base-only\n')
            fh.write('# buttons whose role was never decided.\n')
            for s in sorted(sigs):
                fh.write(s + '\n')
        print('  allowlist written: %d entries' % len(sigs))
        print('  All clear.'); return 0

    new = sorted(sigs - allow)
    if not new:
        print('  %d known carve-outs, 0 new.' % len(sigs & allow))
        print('  All clear.')
        print('-' * 60)
        return 0

    print('\n  *** %d NEW forbidden inline style(s) on buttons ***\n' % len(new))
    lab = {}
    for v in found.values():
        for (s, l, b) in v:
            lab.setdefault(s, l)
    for s in new[:25]:
        cls, style, props = s.split('|', 2)
        print('    props : %s' % props)
        print('    label : %r' % lab.get(s, ''))
        print('    class : %s' % cls[:90])
        print('    style : %s\n' % style[:110])
    print('  The rule (this file states it at its own line ~3674):')
    print('    a <button> never carries background, color, border, border-radius,')
    print('    min-height, padding, font-size, font-weight or cursor inline.')
    print('    Layout properties (flex, margin, width) are fine.')
    print('  Use a .bg-btn variant instead. If the carve-out is deliberate, run')
    print('  scripts/guard_button_inline.py --update and say why in the commit.')
    print('-' * 60)
    return 1


if __name__ == '__main__':
    sys.exit(main())
