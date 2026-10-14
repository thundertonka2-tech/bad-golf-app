// qa/qa_perf_v1913.js — v1913: tee-time field rounds + course-shard stamps go through the
// indexed RPCs, and fall back to the original queries when the RPC is missing.
'use strict';
const path = require('path');
const { loadApp } = require('./app.js');
const file = process.argv[2] || 'golf-app.html';
const { qa } = loadApp(path.resolve(file));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL: ' + m); } };
const calls = [];
let rpcMissing = false;
function chain(table) {
  const q = { table, ops: [] };
  const c = {
    select(x) { q.ops.push('select'); return c; }, or(x) { q.ops.push('or'); return c; }, like(a, b) { q.ops.push('like'); return c; },
    order() { return c; }, eq() { return c; }, in() { return c; },
    range() { calls.push(q); return Promise.resolve({ data: [{ data: { code: 'FALLBACK' }, updated_at: 'x', code: 'shared:courses:00' }], error: null }); },
  };
  return c;
}
const supa = {
  from: (t) => chain(t),
  rpc: (name, args) => {
    calls.push({ rpc: name, args });
    if (rpcMissing) return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    if (name === 'bg_rounds_by_tourney') return Promise.resolve({ data: [{ data: { code: 'DIVOT92' }, updated_at: 'u' }], error: null });
    if (name === 'bg_field_rounds') return Promise.resolve({ data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid' } });
    if (name === 'bg_course_shard_stamps') return Promise.resolve({ data: [{ code: 'shared:courses:00', updated_at: 'a' }], error: null });
    return Promise.resolve({ data: null, error: { message: 'x' } });
  },
  auth: { getSession: async () => ({ data: { session: null } }) },
};
qa.install({ supa, onSave: () => {}, loadGame: async () => null, roster: async () => [], meName: async () => 'Tyler' });
(async () => {
  const raw0 = qa.fn('_t2FetchFieldRoundsRaw0');
  calls.length = 0;
  let r = await raw0({ id: 'tn-1791916669588-08ys' });
  ok(r && r.data && r.data[0].data.code === 'DIVOT92', 'tee time rounds come from bg_rounds_by_tourney');
  ok(!calls.some(c => c.rpc === 'bg_field_rounds'), 'no uuid RPC for a tn- id');
  ok(!calls.some(c => c.table === 'games'), 'no full-table OR scan');
  calls.length = 0;
  r = await raw0({ id: '386bee26-c89c-4c1e-9b1a-1234567890ab' });
  ok(calls[0] && calls[0].rpc === 'bg_field_rounds', 'uuid event still tries bg_field_rounds first');
  ok(r && r.data && r.data[0].data.code === 'DIVOT92', '... then the indexed reader when it is not usable');
  rpcMissing = true; calls.length = 0;
  r = await raw0({ id: 'tn-x' });
  ok(calls.some(c => c.table === 'games' && c.ops.includes('or')), 'RPC missing -> original query still runs');
  ok(r && r.data && r.data[0].data.code === 'FALLBACK', '... and its rows are returned');
  // shards
  rpcMissing = false; calls.length = 0;
  try { qa.fn('_bgOverlayCourseShards') && await qa.fn('_bgOverlayCourseShards')({}); } catch (e) {}
  ok(calls.some(c => c.rpc === 'bg_course_shard_stamps'), 'shard stamps via RPC');
  ok(!calls.some(c => c.table === 'games' && c.ops.includes('like')), 'no LIKE scan when the RPC works');
  console.log(`qa_perf_v1913 (${path.basename(file)}): ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
