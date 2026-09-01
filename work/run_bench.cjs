const { api } = require('./bench.cjs');
const { mkRound } = require('./synth.cjs');

function time(label, fn, iters) {
  fn(); // warm
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) fn();
  const t1 = process.hrtime.bigint();
  const ms = Number(t1 - t0) / 1e6 / iters;
  console.log('  ' + label.padEnd(52) + ms.toFixed(3) + ' ms');
  return ms;
}

console.log('\n=== computeAllGameMoney — real code, synthetic finished rounds ===\n');

for (const n of [2, 4, 8]) {
  const g = mkRound(n);
  let r = null;
  try { r = api.computeAllGameMoney(g); } catch (e) { console.log('  ' + n + 'p ERROR: ' + e.message); continue; }
  const games = Object.keys(g.games).length;
  const nonZero = r && r.combined ? Object.keys(r.combined).filter(k => Math.abs(r.combined[k]) > 0.005).length : 0;
  console.log(n + ' players, ' + games + ' games enabled  (players with money: ' + nonZero + ')');
  time('computeAllGameMoney', () => api.computeAllGameMoney(g), 200);
}

console.log('\n--- tournament round with GROUP side games (the recursive pass) ---');
{
  const g = mkRound(4, { groupGames: true });
  try {
    api.computeAllGameMoney(g);
    time('computeAllGameMoney (+groupGames)', () => api.computeAllGameMoney(g), 200);
  } catch (e) { console.log('  ERROR: ' + e.message); }
}

console.log('\n--- worst case: 8 players, every game on, group games too ---');
{
  const g = mkRound(8, { groupGames: true });
  try {
    api.computeAllGameMoney(g);
    time('computeAllGameMoney (worst case)', () => api.computeAllGameMoney(g), 200);
  } catch (e) { console.log('  ERROR: ' + e.message); }
}

console.log('\n--- how the Bets sheet calls it today (2 passes: sheet + archive heal) ---');
{
  const g = mkRound(4);
  time('2x computeAllGameMoney', () => { api.computeAllGameMoney(g); api.computeAllGameMoney(g); }, 200);
}

console.log('\n--- one game only (typical casual round) ---');
{
  const g = mkRound(4, { games: ['skins'] });
  time('computeAllGameMoney (skins only)', () => api.computeAllGameMoney(g), 400);
}
console.log('');
