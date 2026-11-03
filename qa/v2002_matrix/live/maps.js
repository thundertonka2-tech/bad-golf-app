// Per-round settle maps exactly as _bgEventMoney -> _bgEventMapsFromNet builds them (uses the app function).
const fs = require('fs'), path = require('path'); const { F } = require('./lib');
const stage = process.argv[2]; const rs = JSON.parse(fs.readFileSync(path.join(__dirname, 'event_rounds_' + stage + '.json')));
const ev = JSON.parse(fs.readFileSync(path.join(__dirname, 'event_' + stage + '.json')));
const nm = s => F('normalizeNameSegment')(String(s || ''));
const best = {}, last = {}; rs.forEach(r => { if (!r.finishedAt) return; r.players.forEach(p => { const k = nm(p.name); const s = r.finishedAt; if (!best[k] || s > best[k].s || (s === best[k].s && r.code.localeCompare(best[k].c) > 0)) { best[k] = { s, c: r.code }; last[k] = r.code; } }); });
const maps = F('_bgEventMapsFromNet')(rs, ev.app, last, nm);
Object.values(maps).forEach(m => m.build = 'v2026.11.2002');
fs.writeFileSync(path.join(__dirname, 'maps_' + stage + '.json'), JSON.stringify(maps)); console.log(JSON.stringify(maps)); process.exit(0);
