"""Probe: member whole totals on 'Where everyone stands' (client bgNetsWhole/bgWhole fallback) vs league_money_settle
while the league still HOLDS money (season fee mid-season). Local PG16 only."""
import json, sys
sys.path.insert(0, '.')
from t_money import S, psql, SID
cases = [(2, 33.33), (3, 33.33), (3, 12.5), (4, 7.5), (2, 2.5)]
out = []
for n, fee in cases:
    s = S({'buyin': fee, 'weekly': {}}, n); s.week(1, 18, status='open')
    r = s.run(); st = r['settle']
    bal = {}
    for row in r['rows']:
        if row['p'] == 'member': bal[row['m']] = bal.get(row['m'], 0) + float(row['a'])
    net = {m: 0 for m in s.mid}
    for t in st['transfers']: net[t['from_member']] -= int(t['amount']); net[t['to_member']] += int(t['amount'])
    out.append({'n': n, 'fee': fee, 'member_cents_balance': [bal[m] for m in s.mid], 'to_the_league': st['to_the_league'], 'transfers': st['transfers']})
print(json.dumps(out))
