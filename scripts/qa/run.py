#!/usr/bin/env python3
"""Bad Golf QA harness. Extracts the main <script> of golf-app.html to scripts/qa/main.js and
runs every test file in scripts/qa/tests/ against it (node, no packages needed).
Usage: python3 scripts/qa/run.py   (from the repo root or anywhere)"""
import os, re, subprocess, sys
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(os.path.dirname(here))
src = open(os.path.join(root, 'golf-app.html'), encoding='utf-8').read()
main = max(re.findall(r'<script>(.*?)</script>', src, re.S), key=len)
open(os.path.join(here, 'main.js'), 'w', encoding='utf-8').write(main)
print('main.js extracted:', len(main), 'chars,', re.search(r"BG_BUILD = '([^']+)'", main).group(1))
ok = True
for t in sorted(os.listdir(os.path.join(here, 'tests'))):
    if not t.endswith('.js') or t == 'loader.js': continue
    r = subprocess.run(['node', t], cwd=os.path.join(here, 'tests'), capture_output=True, text=True)
    lines = (r.stdout + r.stderr).splitlines()
    summary = [l for l in lines if re.search(r'\b\d+ passed, \d+ failed', l)]
    fails = [l for l in lines if l.startswith('FAIL ')]
    good = r.returncode == 0 and summary and all(', 0 failed' in l for l in summary) and not fails
    print(('OK   ' if good else 'FAIL ') + t + '  ' + ' | '.join((summary[-1:] if summary else ['(no summary)']) + fails[:3]))
    if not good: ok = False
print('ALL OK' if ok else 'FAILED'); sys.exit(0 if ok else 1)
