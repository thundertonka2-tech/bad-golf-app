"""Retry writes that run_region.py could not land: every <course>.pending.json in out_dir.

    python3 write_pending.py out_dir        (needs SB_URL, SB_KEY, RPC_TOKEN like run_region.py)
"""
import glob, json, os, sys
from run_region import write_rows

out_dir = sys.argv[1]
for f in sorted(glob.glob(os.path.join(out_dir, '*.pending.json'))):
    cid = os.path.basename(f)[:-len('.pending.json')]
    rows = json.load(open(f))
    n = write_rows(rows)
    rep = os.path.join(out_dir, cid + '.json')
    try:
        d = json.load(open(rep)); d['written'] = n; json.dump(d, open(rep, 'w'), indent=1)
    except Exception:
        pass
    os.rename(f, f + '.done')
    print(cid, 'written', n, flush=True)
