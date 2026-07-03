#!/bin/bash
# Extract each <script>...</script> (non-src) block and node --check it
f="$1"
python3 - "$f" <<'PY'
import sys,re
f=sys.argv[1]
s=open(f,encoding='utf-8').read()
blocks=re.findall(r'<script>(.*?)</script>', s, re.S)
import subprocess,tempfile,os
ok=True
for i,b in enumerate(blocks):
    t=tempfile.NamedTemporaryFile('w',suffix='.js',delete=False,encoding='utf-8')
    t.write(b); t.close()
    r=subprocess.run(['node','--check',t.name],capture_output=True,text=True)
    if r.returncode!=0:
        ok=False; print(f'BLOCK {i} FAIL:'); print(r.stderr[:2000])
    else:
        print(f'BLOCK {i} OK ({len(b)} chars)')
    os.unlink(t.name)
print('ALL OK' if ok else 'FAILED')
PY
