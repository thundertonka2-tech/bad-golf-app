#!/usr/bin/env python3
"""Extract the largest inline <script> (no src=) from an HTML file and run `node --check` on it.
Usage: check_syntax.py file.html [file2.html ...]"""
import re, subprocess, sys, tempfile, hashlib, os

def main():
    for path in sys.argv[1:]:
        src = open(path, encoding='utf-8').read()
        scripts = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', src, flags=re.S)
        if not scripts:
            print(f'{path}: no inline script found'); sys.exit(1)
        body = max(scripts, key=len)
        opens = len(re.findall(r'<script\b', src)); closes = src.count('</script>')
        ends = src.rstrip().endswith('</body></html>') or src.rstrip().endswith('</html>')
        with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as f:
            f.write(body); tmp = f.name
        r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
        os.unlink(tmp)
        md5 = hashlib.md5(body.encode('utf-8')).hexdigest()
        lines = src.count('\n')
        print(f'{path}: lines={lines} script_open={opens} script_close={closes} ends_html={ends} node_check={"OK" if r.returncode == 0 else "FAIL"} app_md5={md5}')
        if r.returncode != 0:
            print(r.stderr[:3000]); sys.exit(1)

main()
