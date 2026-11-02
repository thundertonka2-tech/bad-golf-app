from lgdb import *
st = {'type': 'individual', 'competition_mode': 'field', 'format': 'stroke_net', 'points': {'system': 'position'},
      'money': {'buyin': 100, 'weekly': {'skins': {'on': True, 'amount': 5}, 'lowest_net': {'on': True, 'amount': 5}}}}
L = League(st, [{'name': 'Comm A'}, {'name': 'Bob B'}, {'name': 'Cal C'}])
sn = snap(18); w = L.week(1, sn, pp=10)
for i in range(3): L.hcp(1, i, [2, 10, 18][i])
mus = [L.matchup(w, i) for i in range(3)]
for i in range(3): L.card(mus[i], i, [p + i for p in PARS18])
L.finalize(w)
print(psql(L.text("select json_build_object('mu',(select json_agg(json_build_object('a',a_points,'st',status,'rj',result_json)) from league_matchups),'money',(select json_agg(json_build_object('k',kind,'p',party,'a',amount,'n',note)) from league_money),'st',(select json_agg(row_to_json(s)) from league_standings s), 'audit', (select json_agg(after) from league_audit where action='week_finalized'));"))[-1][:3000])
