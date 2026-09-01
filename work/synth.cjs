// A realistic finished round. Shapes taken from the setup builder (games.* assignments
// around line 34354) and the calculators' own field reads.
function mkRound(nPlayers, opts) {
  opts = opts || {};
  const names = ['Tyler','Kevin','Steve','Larry','RC','Roland','Greg','Mike'];
  const players = [];
  for (let i = 0; i < nPlayers; i++) {
    players.push({ id: 'p' + (i+1), name: names[i % names.length], hcp: 6 + (i * 3) % 18,
                   rawHcp: 6 + (i * 3) % 18, baseHcp: 6 + (i * 3) % 18, tee: 'Blue' });
  }
  const pars = [4,4,3,5,4,4,3,4,5, 4,5,4,3,4,4,5,3,4];
  const sis  = [5,1,15,11,7,3,17,9,13, 6,2,16,12,8,4,18,10,14];
  const scores = {};
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  players.forEach(p => {
    scores[p.id] = [];
    for (let h = 0; h < 18; h++) {
      const r = rnd();
      scores[p.id][h] = pars[h] + (r < 0.08 ? -1 : r < 0.45 ? 0 : r < 0.8 ? 1 : r < 0.95 ? 2 : 3);
    }
  });
  const putts = {}, gir = {};
  players.forEach(p => { putts[p.id] = []; gir[p.id] = [];
    for (let h = 0; h < 18; h++) { putts[p.id][h] = 1 + Math.round(rnd()*2); gir[p.id][h] = rnd() < 0.4; } });

  const half = Math.floor(nPlayers/2);
  const teamA = players.slice(0, half).map(p => p.id);
  const teamB = players.slice(half, half*2).map(p => p.id);

  const games = {};
  const add = opts.games || ['skins','nassau','stroke','comboScore','teamMatch','teamLowball',
                             'quota','stableford','junk','birdiePool','wolf','sixes','vegas','banker','matchPlay'];
  const has = k => add.includes(k);
  if (has('skins'))      games.skins = { value: 2, net: true, carry: true };
  if (has('nassau'))     games.nassau = { value: 5, net: true, presses: false };
  if (has('stroke'))     games.stroke = { buyIn: 10, net: true };
  if (has('comboScore')) games.comboScore = { value: 5, net: true, teamMode: '2man', teamA, teamB };
  if (has('teamMatch'))  games.teamMatch = { value: 5, net: true, teamMode: '2man', teamA, teamB };
  if (has('teamLowball'))games.teamLowball = { value: 5, net: true, teamMode: '2man', teamA, teamB };
  if (has('quota'))      games.quota = { value: 2, net: true };
  if (has('stableford')) games.stableford = { value: 1, net: true };
  if (has('junk'))       games.junk = { value: 1, birdie: true, sandy: true, greenie: true };
  if (has('birdiePool')) games.birdiePool = { value: 1 };
  if (has('wolf'))       games.wolf = { value: 2, picks: {} };
  if (has('sixes'))      games.sixes = { value: 2, net: true };
  if (has('vegas'))      games.vegas = { value: 1, net: true, teamA, teamB };
  if (has('banker'))     games.banker = { value: 2, net: true };
  if (has('matchPlay'))  games.match = { instances: [{ pair: [players[0].name, players[1].name], value: 20, net: true }] };

  const g = {
    code: 'BENCH1', createdAt: Date.now() - 4*3600e3, updatedAt: Date.now(),
    finishedAt: Date.now(), holes: 18,
    course: 'Benchmark National', courseId: 'benchmark-national',
    players, scores, putts, gir, pars, sis,
    rating: 71.2, slope: 130,
    tees: [{ label: 'Blue', rating: 71.2, slope: 130 }, { label: 'White', rating: 69.4, slope: 124 }],
    hcpRules: { pct: 100, holes: 18 },
    matchInstances: games.match ? games.match.instances : [],
    games
  };
  if (opts.groupGames) g.groupGames = JSON.parse(JSON.stringify(games));
  return g;
}
module.exports = { mkRound };
