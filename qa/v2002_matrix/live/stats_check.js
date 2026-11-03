// Server settle trigger (player_stats) vs the app engine, per round and test user. Server values pasted from the read-back.
const R = require('./rounds.json');
const S = {"QA2002A":{"Big Bets":[21.33,18,true,79],"John User":[-26.67,18,true,81],"IDrive Bombs":[-0.67,18,true,75],"Ovalcollier Golfapp":[6,18,true,80]},
"QA2002B":{"Big Bets":[-96,18,true,92],"John User":[16,18,true,81],"IDrive Bombs":[93,18,true,79],"Ovalcollier Golfapp":[-13,18,true,89]},
"QA2002C":{"Big Bets":[43,18,true,78],"John User":[79,18,true,80],"IDrive Bombs":[-65,18,true,82],"Ovalcollier Golfapp":[-57,18,true,82]},
"QA2002D":{"Big Bets":[-16,12,true,53],"IDrive Bombs":[-32,18,true,83],"Ovalcollier Golfapp":[48,18,true,78]},
"QA2002E":{"Big Bets":[-32,18,true,80],"John User":[-20,9,false,null],"IDrive Bombs":[-40,18,true,81],"Ovalcollier Golfapp":[92,18,true,80]},
"QA2002F":{"Big Bets":[98,9,true,36],"IDrive Bombs":[-49,9,true,43],"Ovalcollier Golfapp":[-49,9,true,42]},
"QA2002G":{"Big Bets":[-78,18,true,89],"John User":[67,18,true,79],"IDrive Bombs":[-23,18,true,84],"Renee Test account":[182,18,true,89],"Ovalcollier Golfapp":[-148,18,true,86]},
"QA2002H":{"Big Bets":[101,18,true,81],"John User":[-35,18,true,82],"IDrive Bombs":[-43,18,true,86],"Ovalcollier Golfapp":[-23,18,true,82]}};
const out = []; let fails = 0;
R.forEach(r => { const nH = r.g.pars.length === 9 ? 9 : 18; r.players.forEach(p => { const s = S[r.code][p.name]; if (!s) { out.push(['FAIL', r.code, p.name, 'no player_stats row']); fails++; return; }
  const sc = r.g.scores[p.id].filter(v => v != null); const complete = sc.length === nH; const gross = complete ? sc.reduce((a, b) => a + b, 0) : null;
  const moneyOk = Math.abs(s[0] - r.net[p.id]) < 0.005, compOk = s[2] === complete && s[3] === gross && s[1] === sc.length;
  if (!moneyOk || !compOk) fails++;
  out.push([moneyOk && compOk ? 'PASS' : 'FAIL', r.code, p.name, 'money server ' + s[0] + ' engine ' + r.net[p.id] + ' (whole ' + r.whole[p.id] + ')', 'holes ' + s[1] + '/' + sc.length, 'complete server ' + s[2] + ' app ' + complete, 'gross server ' + s[3] + ' app ' + gross]); }); });
out.forEach(o => console.log(o.join(' | '))); console.log('player_stats rows checked', out.length, 'fail', fails);
require('fs').writeFileSync(__dirname + '/stats_results.json', JSON.stringify(out, null, 1));
