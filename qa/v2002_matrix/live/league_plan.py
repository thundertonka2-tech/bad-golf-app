"""Live league season plan: gross cards built from target NET cards with the oracle's own stroke allocation
(WHS lowest order at 90%), so the tie for 1st / tied low net are exact by construction."""
import json, sys
sys.path.insert(0, '../league_server')
import oracle as O
SID = '04df2808-747f-47ad-a131-962f2d1682e6'
M = {'BB': 'b05ea29f-b0f4-4d59-a627-48bf8dbdbb98', 'RT': 'fcfe640d-bbe5-49b5-84d0-c8fe24820d5a', 'IB': 'e3c5e46e-58d5-4e50-a0b5-a94587cca9a7',
     'OG': 'dac3c761-7c1e-4f59-b57a-df38abb21d3f', 'JU': '747c8228-5a01-4deb-8093-b39352cfce91', 'G5': '8a765967-304a-4387-8bae-8065dd24a2b0'}
EFF = {'BB': 14, 'RT': 12, 'IB': 6.5, 'OG': 10, 'JU': 12, 'G5': 18.4}
ST = {'hcp_rules_set': True, 'hcp_rules': {'pct': 90, 'basis': 'lowest'}}
SN = {'holes': 18, 'pars': [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4], 'si': [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2]}
MN = min(O.whs_round(h) for h in EFF.values())
CH = {k: O.rules_ch(v, ST, MN) for k, v in EFF.items()}
P = SN['pars']
def net(delta):  # par + delta per hole (delta: dict hole_index->d)
    return [p + delta.get(i, 0) for i, p in enumerate(P)]
NETS = {
 1: {'OG': net({2: -1, 10: -1}), 'RT': net({2: -1, 10: -1}), 'G5': net({0: 1, 4: 1, 7: 1, 12: 1}), 'IB': net({5: 1, 8: 1}), 'BB': net({1: 1, 3: 1, 13: 1, 0: -1, 16: 1})},
 2: {'OG': net({6: -1}), 'RT': net({6: -1}), 'BB': net({0: 1, 2: 1, 9: 1, 14: 1, 15: 1}), 'IB': net({11: 1}), 'JU': net({1: 1, 3: 1, 5: 1, 8: 1, 11: 1, 16: 1}), 'G5': net({4: 1, 17: 1, 3: -1, 9: 1})},
}
def gross(k, n):
    g = [n[i] + O.strokes(CH[k], SN['si'][i], 18) for i in range(18)]
    assert all(x >= 1 for x in g); return g
if __name__ == '__main__':
    wk = int(sys.argv[1])
    print(json.dumps({'CH': CH, 'MN': MN, 'gross': {k: gross(k, n) for k, n in NETS[wk].items()}, 'nets': NETS[wk]}))
