"""Extra server probes (local PG16): CTP stays whole-field when flights are on; weekly pots with flights."""
import sys; sys.path.insert(0, '.')
from t_money import S, ledger, check, main as _m
import t_money as T
s = S({'buyin': 0, 'weekly': {'ctp': {'on': True, 'amount': 5}, 'lowest_net': {'on': True, 'amount': 5}}}, 6, flights=[1, 1, 1, 2, 2, 2]); wid = s.week(1, 9)
for i in range(6): s.card(wid, i, [4] * 9 if i != 4 else [3] * 9)
s.winner(wid, 'ctp', 5, 4)
r = s.run(); L = ledger(r)
check('flights', 'ctp whole-field', 'flights on: flight-2 player wins the WHOLE field CTP pot (6 x 5 = 30, net +25)', L.get(s.mid[5], {}).get('ctp') == 2500, str(L.get(s.mid[5])))
check('flights', 'low net whole-field', 'flights on: weekly low net is whole-field (P04 +25)', L.get(s.mid[4], {}).get('lowest_net') == 2500, str(L.get(s.mid[4])))
print('extra: %d passed, %d failed' % (T.PASS, T.FAIL)); [print(f) for f in T.FAILS]
