// Offline re-implementation of golf-app.html buildNineCombo (v1367) + config validator.
// Asserts: par totals, 1-9 and 1-18 stroke-index permutations, 9-hole rating band,
// yardage completeness, combo-key sorting, and official-combo precedence.
export function buildNineCombo(set, frontKey, backKey) {
  const F = set[frontKey], B = set[backKey];
  if (!F || !B) return null;
  const pars = F.pars.concat(B.pars);
  const sis = new Array(18);
  for (let i = 0; i < 9; i++) sis[i] = 2 * F.hdcp[i] - 1;
  for (let i = 0; i < 9; i++) sis[9 + i] = 2 * B.hdcp[i];
  const cs = set.comboSis && set.comboSis[frontKey + '>' + backKey];
  if (Array.isArray(cs) && cs.length === 18) for (let i = 0; i < 18; i++) sis[i] = cs[i];
  const comboKey = [frontKey, backKey].slice().sort().join('+');
  const comboTees = (set.combos && set.combos[comboKey]) ? set.combos[comboKey] : null;
  const tees = [];
  F.tees.forEach(ft => {
    const bt = B.tees.find(t => t.label === ft.label);
    if (!bt) return;
    const fy = Array.isArray(ft.yds) ? ft.yds : [], by = Array.isArray(bt.yds) ? bt.yds : [];
    let rating = null, slope = null, src = 'none';
    if (comboTees) { const cr = comboTees.find(c => c.label === ft.label);
      if (cr) { rating = cr.rating ?? null; slope = cr.slope ?? null; src = 'official'; } }
    if (rating == null && ft.rating != null && bt.rating != null) {
      rating = Math.round((ft.rating + bt.rating) * 10) / 10;
      slope = (ft.slope != null && bt.slope != null) ? Math.round((ft.slope + bt.slope) / 2) : null;
      src = 'factored';
    }
    tees.push({ label: ft.label, rating, slope, src, yardage: fy.concat(by).reduce((a,b)=>a+b,0) });
  });
  return { pars, sis, tees, frontKey, backKey };
}
const perm = (a, n) => a.length === n && new Set(a).size === n && a.every(x => Number.isInteger(x) && x >= 1 && x <= n);
export function verify(id, cfg, opts = {}) {
  const problems = [], notes = [];
  const nineKeys = Object.keys(cfg).filter(k => cfg[k] && typeof cfg[k] === 'object' && Array.isArray(cfg[k].pars));
  if (!Array.isArray(cfg.searchCombos) || !cfg.searchCombos.length) problems.push('no searchCombos');
  nineKeys.forEach(k => {
    const n = cfg[k];
    if (n.pars.length !== 9) problems.push(`${k}: ${n.pars.length} pars`);
    const par = n.pars.reduce((a,b)=>a+b,0);
    if (par < 30 || par > 40) problems.push(`${k}: implausible par ${par}`);
    notes.push(`${k}: par ${par}`);
    if (!perm(n.hdcp, 9)) problems.push(`${k}: hdcp not a 1-9 permutation -> ${JSON.stringify(n.hdcp)}`);
    if (!n.tees || !n.tees.length) problems.push(`${k}: no tees`);
    (n.tees||[]).forEach(t => {
      if (!Array.isArray(t.yds) || t.yds.length !== 9) problems.push(`${k}/${t.label}: yardage not 9 holes`);
      else { const y = t.yds.reduce((a,b)=>a+b,0);
        if (opts.expect && opts.expect[k] && opts.expect[k][t.label] != null && opts.expect[k][t.label] !== y)
          problems.push(`${k}/${t.label}: yards ${y} != printed ${opts.expect[k][t.label]}`);
        if (y < 1500 || y > 4200) problems.push(`${k}/${t.label}: implausible ${y} yds`); }
      if (t.rating == null || t.slope == null) problems.push(`${k}/${t.label}: UNRATED tee (Indian Creek bug)`);
      else { if (t.rating < 28 || t.rating > 42) problems.push(`${k}/${t.label}: rating ${t.rating} outside 9-hole band 28-42`);
             if (t.slope < 55 || t.slope > 155) problems.push(`${k}/${t.label}: slope ${t.slope} out of range`); }
    });
  });
  Object.keys(cfg.combos || {}).forEach(ck => {
    const parts = ck.split('+');
    if (parts.slice().sort().join('+') !== ck) problems.push(`combos key not sorted: ${ck}`);
    parts.forEach(p => { if (!nineKeys.includes(p)) problems.push(`combos key ${ck} names unknown nine ${p}`); });
  });
  (cfg.searchCombos || []).forEach(([f, b]) => {
    const c = buildNineCombo(cfg, f, b);
    if (!c) { problems.push(`combo ${f}>${b}: build failed`); return; }
    const par = c.pars.reduce((a,x)=>a+x,0);
    if (!perm(c.sis, 18)) problems.push(`combo ${f}>${b}: SI not a 1-18 permutation`);
    const unrated = c.tees.filter(t => t.rating == null);
    if (unrated.length) problems.push(`combo ${f}>${b}: unrated tees ${unrated.map(t=>t.label).join(',')}`);
    c.tees.forEach(t => { if (t.rating != null && (t.rating < 55 || t.rating > 82)) problems.push(`combo ${f}>${b}/${t.label}: 18-hole rating ${t.rating} out of band`); });
    notes.push(`combo ${f}>${b}: par ${par}, ${c.tees.length} tees, ` +
      c.tees.map(t=>`${t.label} ${t.rating}/${t.slope}@${t.yardage}${t.src==='official'?'*':''}`).join(' · '));
  });
  return { id, problems, notes };
}
export function report(r) {
  console.log(`\n=== ${r.id} ===`);
  r.notes.forEach(n => console.log('  ' + n));
  if (r.problems.length) { console.log('  PROBLEMS:'); r.problems.forEach(p => console.log('   ! ' + p)); }
  else console.log('  OK — no problems');
  return r.problems.length === 0;
}
