// Equivalence test for the v1366 home tournament-section restructure.
// Models the OLD serial nest and the NEW wave-based selection over the same random
// fixtures and asserts they choose exactly the same rounds, in the same order.

function fixtures(seed) {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pick = n => Math.floor(rnd() * n);
  const evs = [];
  const nEv = 1 + pick(3);
  for (let e = 0; e < nEv; e++) {
    const ev = { id: 'ev' + e, status: rnd() < 0.15 ? 'complete' : 'live', name: 'Event ' + e,
                 commissioner_id: 'me', settings: {} };
    const players = [];
    const nP = 2 + pick(6);
    for (let p = 0; p < nP; p++) players.push({ id: 'ev' + e + 'p' + p, user_id: (p === 0 && rnd() < 0.7) ? 'me' : ('u' + p), display_name: 'P' + p });
    const days = [];
    const nD = 1 + pick(3);
    for (let d = 0; d < nD; d++) {
      const day = { id: 'ev' + e + 'd' + d, day_number: d + 1 };
      const groups = [];
      const nG = 1 + pick(4);
      for (let gi = 0; gi < nG; gi++) {
        groups.push({ id: day.id + 'g' + gi, group_number: gi + 1,
                      game_code: rnd() < 0.1 ? '' : ('C' + e + d + gi) });
      }
      days.push({ day, groups });
    }
    // membership: a random subset of groups contains me
    const mem = {};
    days.forEach(x => x.groups.forEach(g => {
      mem[g.id] = [];
      const nM = 1 + pick(4);
      for (let m = 0; m < nM; m++) mem[g.id].push({ tournament_player_id: players[pick(players.length)].id });
      if (rnd() < 0.35) mem[g.id].push({ tournament_player_id: players[0].id });
    }));
    const games = {};
    days.forEach(x => x.groups.forEach(g => {
      if (!g.game_code) return;
      games[g.game_code] = rnd() < 0.12 ? null
        : { code: g.game_code, course: 'Course', scores: {}, finishedAt: rnd() < 0.3 ? Date.now() : null };
    }));
    evs.push({ ev, players, days, mem, games });
  }
  return evs;
}

const meUid = 'me';
const meIdsFor = E => new Set(E.players.filter(p => p.user_id === meUid).map(p => p.id));

// ---------- OLD: the serial nest, transcribed ----------
function oldWay(all, seen0) {
  const rows = [], seen = new Set(seen0);
  for (const E of all) {
    const ev = E.ev;
    if (!ev || ev.status === 'complete') continue;
    const meIds = meIdsFor(E);
    if (!meIds.size) continue;
    for (const x of E.days) {
      const d = x.day;
      for (const g2 of x.groups) {
        if (!g2.game_code || seen.has(g2.game_code)) continue;
        const mem = E.mem[g2.id] || [];
        if (!mem.some(m => meIds.has(m.tournament_player_id))) continue;
        const g0 = E.games[g2.game_code];
        if (!g0 || g0.finishedAt) continue;
        seen.add(g2.game_code);
        rows.push(ev.id + '|' + d.id + '|' + g2.game_code);
        break;
      }
    }
  }
  return rows;
}

// ---------- NEW: the wave version, transcribed ----------
function newWay(all, seen0) {
  const rows = [], seen = new Set(seen0);
  const evs = all.filter(E => E.ev && E.ev.status !== 'complete');
  const perEvent = evs.map(E => {
    const meIds = meIdsFor(E);
    if (!meIds.size) return null;
    const flat = [];
    E.days.forEach(x => x.groups.forEach(g2 => { if (g2 && g2.game_code) flat.push({ d: x.day, g2 }); }));
    const memBy = new Map();
    flat.forEach(x => memBy.set(x.g2.id, E.mem[x.g2.id] || []));
    return { E, ev: E.ev, meIds, days: E.days, flat, memBy };
  });
  const cands = [];
  perEvent.forEach(pe => {
    if (!pe) return;
    pe.flat.forEach(x => {
      const mem = pe.memBy.get(x.g2.id) || [];
      if (!mem.some(m => m && pe.meIds.has(m.tournament_player_id))) return;
      cands.push({ E: pe.E, ev: pe.ev, meIds: pe.meIds, d: x.d, g2: x.g2 });
    });
  });
  const loaded = cands.map(c => c.E.games[c.g2.game_code] || null);
  const dayDone = new Set();
  cands.forEach((c, i) => {
    const key = String(c.ev.id) + ':' + String(c.d.id);
    if (dayDone.has(key)) return;
    if (seen.has(c.g2.game_code)) return;
    const g0 = loaded[i];
    if (!g0 || g0.finishedAt) return;
    dayDone.add(key);
    seen.add(c.g2.game_code);
    rows.push(c.ev.id + '|' + c.d.id + '|' + c.g2.game_code);
  });
  return rows;
}

let checked = 0, diffs = 0;
for (let seed = 1; seed <= 4000; seed++) {
  const all = fixtures(seed);
  const seed0 = (seed % 5 === 0) ? ['C000'] : [];
  const a = oldWay(all, seed0).join(' , ');
  const b = newWay(all, seed0).join(' , ');
  checked++;
  if (a !== b) {
    diffs++;
    if (diffs <= 3) console.log('seed ' + seed + '\n  old: ' + a + '\n  new: ' + b);
  }
}
console.log('\nscenarios checked: ' + checked);
console.log(diffs ? ('MISMATCHES: ' + diffs) : 'IDENTICAL SELECTION IN EVERY SCENARIO');
process.exit(diffs ? 1 : 0);
