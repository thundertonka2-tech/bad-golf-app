'use strict';
const S = { rounds: [], tournaments: {}, players: {}, roster: [], meName: 'Tyler OConnor' };
function tbl(name){
  const api = {
    _f: [],
    select(){ return api; },
    or(expr){ api._f.push(['or', expr]); return api; },
    eq(col,val){ api._f.push(['eq', col, val]); return api; },
    order(){ return api; },
    range(){ return Promise.resolve({ data: rowsFor(name, api._f), error: null }); },
    maybeSingle(){ const r = rowsFor(name, api._f); return Promise.resolve({ data: r[0]||null, error: null }); },
    then(res){ return Promise.resolve({ data: rowsFor(name, api._f), error: null }).then(res); },
  };
  return api;
}
function rowsFor(name, f){
  if (name === 'games'){
    // every filter used by _t2FetchFieldRounds is an .or() on the tournament id
    const or = (f.find(x=>x[0]==='or')||[])[1] || '';
    const m = /eq\.([0-9a-f-]+)/i.exec(or);
    const tid = m ? m[1] : null;
    return S.rounds.filter(g => !tid || (g.t2 && g.t2.tournamentId === tid) || g.tourneyId === tid)
                   .map(g => ({ code: g.code, data: g }));
  }
  if (name === 'tournaments'){
    const eq = f.find(x=>x[0]==='eq' && x[1]==='id');
    const t = eq ? S.tournaments[eq[2]] : null;
    return t ? [t] : [];
  }
  if (name === 'tournament_players'){
    const eq = f.find(x=>x[0]==='eq');
    return S.players[eq?eq[2]:''] || [];
  }
  return [];
}
module.exports = {
  supa: { from: tbl },
  loadGame: code => S.rounds.find(g => g.code === code) || null,
  get roster(){ return S.roster; },
  get meName(){ return S.meName; },
  S,
};
