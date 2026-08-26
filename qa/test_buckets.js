// Regression test for v1233: a course RESOLVED in code review must leave the
// Incomplete bucket and count as Complete — the same treatment v1078 gave rejected.
const fs=require('fs');
const src=fs.readFileSync('golf-app.html','utf8');

// --- pull the real crBucketByCourse out of the shipped file ---
function grabFn(name){
  const m=new RegExp('function\\s+'+name+'\\s*\\(').exec(src);
  if(!m) throw new Error('missing '+name);
  let j=src.indexOf('{',m.index),d=0,k;
  for(k=j;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(d===0)break;} }
  return src.slice(m.index,k+1);
}
eval(grabFn('crEntryStamp'));
eval(grabFn('crBucketByCourse'));

// --- the chip predicates, transcribed from renderAdminWorklist as patched ---
function chips(items, buckets, adminVerified){
  const _crRejectedIds=buckets.rejected, _crResolvedIds=buckets.resolved, _crPendingIds=buckets.pending;
  const _adminVerified=adminVerified||new Set();
  const base=items.filter(it=>!(_crPendingIds&&_crPendingIds.has(it.id)));
  const _known=it=>!it.countsUnknown;
  const _rejected=it=>!!(_crRejectedIds&&_crRejectedIds.has(it.id));
  const _reviewed=it=>!!(_crResolvedIds&&_crResolvedIds.has(it.id));
  return {
    incomplete: base.filter(it=>!_rejected(it)&&!_reviewed(it)&&_known(it)&&!it.complete&&!_adminVerified.has(it.id)).map(i=>i.id),
    complete:   base.filter(it=>((_known(it)&&it.complete)||_adminVerified.has(it.id)||_reviewed(it))&&!_rejected(it)).map(i=>i.id),
    reviewed:   items.filter(it=>_crResolvedIds.has(it.id)).map(i=>i.id),
    rejected:   items.filter(it=>_crRejectedIds.has(it.id)).map(i=>i.id),
  };
}

let pass=0, fail=0;
const eq=(name,a,b)=>{ const A=JSON.stringify(a),B=JSON.stringify(b);
  if(A===B){pass++;console.log('  ok  '+name);} else {fail++;console.log('  FAIL '+name+'\n       got '+A+'\n       want '+B);} };

const E=(cid,status,at)=>({id:'e-'+cid+'-'+at,course:{id:cid,name:cid},status,createdAt:at,lastEventAt:at});

console.log('\n1. THE BUG: Kevin resolves a course whose automated gates still fail');
{
  const items=[{id:'c1',complete:false}];                 // gates say NOT complete
  const b=crBucketByCourse([E('c1','resolved','2026-08-20')]);
  const c=chips(items,b);
  eq('leaves Incomplete',           c.incomplete, []);
  eq('counts as Complete',          c.complete,   ['c1']);
  eq('still shows Code Rev Complete',c.reviewed,  ['c1']);
  eq('not in Reject',               c.rejected,   []);
}

console.log('\n2. Rejected still behaves exactly as v1078 set it (no regression)');
{
  const items=[{id:'c2',complete:true}];                  // gates say complete...
  const b=crBucketByCourse([E('c2','rejected','2026-08-20')]);
  const c=chips(items,b);
  eq('rejected NOT complete',       c.complete,   []);
  eq('rejected NOT incomplete',     c.incomplete, []);
  eq('rejected in Reject chip',     c.rejected,   ['c2']);
}

console.log('\n3. Most-recent entry wins (v1095): resolved THEN re-opened');
{
  const items=[{id:'c3',complete:false}];
  const b=crBucketByCourse([E('c3','resolved','2026-08-10'), E('c3','new','2026-08-22')]);
  const c=chips(items,b);
  eq('back in review, not resolved',c.reviewed,   []);
  eq('in-review leaves the list',   c.incomplete, []);
  eq('and is not called complete',  c.complete,   []);
}

console.log('\n4. Rejected THEN resolved — the sequence Tyler described');
{
  const items=[{id:'c4',complete:false}];
  const b=crBucketByCourse([E('c4','rejected','2026-08-10'), E('c4','resolved','2026-08-24')]);
  const c=chips(items,b);
  eq('out of Reject',               c.rejected,   []);
  eq('out of Incomplete',           c.incomplete, []);
  eq('now Complete',                c.complete,   ['c4']);
}

console.log('\n5. An untouched course is unaffected (the regression that matters most)');
{
  const items=[{id:'c5',complete:false},{id:'c6',complete:true}];
  const c=chips(items,crBucketByCourse([]));
  eq('incomplete unchanged',        c.incomplete, ['c5']);
  eq('complete unchanged',          c.complete,   ['c6']);
}

console.log('\n6. directive beats the legacy essay, and an essay degrades to line 1');
{
  const essay='SENT BACK TO KEVIN - 16 Aug 2026.\n\nWHAT WE ALREADY DID ON THIS COURSE:\n- Re-onboarded it from GolfPass...';
  const e1=E('c7','rejected','2026-08-20'); e1.resolutionNote=essay; e1.directive='Map all 3 nines — nothing is mapped yet.';
  eq('directive wins', crBucketByCourse([e1]).notes.c7, 'Map all 3 nines — nothing is mapped yet.');
  const e2=E('c8','rejected','2026-08-20'); e2.resolutionNote=essay;
  eq('essay -> first para only', crBucketByCourse([e2]).notes.c8, 'SENT BACK TO KEVIN - 16 Aug 2026.');
  const e3=E('c9','rejected','2026-08-20'); e3.resolutionNote=essay; e3.directive='   ';
  eq('blank directive falls back', crBucketByCourse([e3]).notes.c9, 'SENT BACK TO KEVIN - 16 Aug 2026.');
}

console.log('\n'+pass+' passed, '+fail+' failed');

// v1233b: crDirective — the single source both render paths use.
(function(){
  const m=/function\s+crDirective\s*\(/.exec(src);
  let j=src.indexOf('{',m.index),d=0,k;
  for(k=j;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(d===0)break;} }
  eval(src.slice(m.index,k+1));
  const essay='SENT BACK TO KEVIN - 16 Aug 2026.\n\nWHAT WE ALREADY DID:\n- lots of things';
  let p=0,f=0; const t=(n,a,b)=>{ if(a===b){p++;console.log('  ok  '+n);} else {f++;console.log('  FAIL '+n+' got '+JSON.stringify(a));} };
  console.log('\n7. crDirective');
  t('directive wins',      crDirective({directive:'Map the North nine only.',resolutionNote:essay}), 'Map the North nine only.');
  t('essay -> first para',  crDirective({resolutionNote:essay}), 'SENT BACK TO KEVIN - 16 Aug 2026.');
  t('empty entry -> ""',    crDirective({}), '');
  t('null-safe',            crDirective(null), '');
  t('caps at 240',          crDirective({resolutionNote:'x'.repeat(400)}).length, 240);
  console.log('\n'+p+' passed, '+f+' failed (crDirective)');
  if(f) process.exit(1);
})();

// ---- v1234 -----------------------------------------------------------------
// Tyler: "Kevin's queue and the total incomplete should equal when you are done",
// and "if Kevin marks it complete or deletes it, that removes it from the
// incomplete list and either deletes it completely or moves it to complete."
(function () {
  // chip predicates as patched in v1234
  function chips(items, buckets, adminVerified) {
    const R = buckets.rejected, V = buckets.resolved, P = buckets.pending;
    const A = adminVerified || new Set();
    const base = items.filter(it => !(P && P.has(it.id)));
    const known = it => !it.countsUnknown;
    const rej = it => !!(R && R.has(it.id));
    const rev = it => !!(V && V.has(it.id));
    return {
      incomplete: base.filter(it => known(it) && !rev(it)
                    && (rej(it) || (!it.complete && !A.has(it.id)))).map(i => i.id),   // v1235
      complete:   base.filter(it => ((known(it) && it.complete) || A.has(it.id) || rev(it)) && !rej(it)).map(i => i.id),
      rejected:   items.filter(it => R.has(it.id)).map(i => i.id),
    };
  }
  const E = (cid, status, at) => ({ id: 'e-' + cid + '-' + at, course: { id: cid, name: cid }, status, createdAt: at, lastEventAt: at });
  let p = 0, f = 0;
  const eq = (n, a, b) => { const A = JSON.stringify(a), B = JSON.stringify(b);
    if (A === B) { p++; console.log('  ok  ' + n); } else { f++; console.log('  FAIL ' + n + '\n       got ' + A + '\n       want ' + B); } };

  console.log('\n8. sent-back now COUNTS as incomplete (the two lists reconcile)');
  {
    const items = [{ id: 'c1', complete: false }];
    const c = chips(items, crBucketByCourse([E('c1', 'rejected', '2026-08-26')]));
    eq('in Incomplete', c.incomplete, ['c1']);
    eq('in Reject too', c.rejected, ['c1']);
    eq('not Complete',  c.complete, []);
  }

  console.log('\n9. Kevin marks it complete -> leaves Incomplete, becomes Complete');
  {
    const items = [{ id: 'c2', complete: false }];   // gates still disagree
    const c = chips(items, crBucketByCourse([E('c2', 'rejected', '2026-08-01'), E('c2', 'resolved', '2026-08-26')]));
    eq('out of Incomplete', c.incomplete, []);
    eq('out of Reject',     c.rejected,   []);
    eq('now Complete',      c.complete,   ['c2']);
  }

  console.log('\n10. a DELETED course leaves every bucket');
  {
    const q = [E('gone', 'rejected', '2026-08-26'), E('alive', 'rejected', '2026-08-26')];
    global.COURSE_LIBRARY = [{ id: 'alive' }];          // 'gone' is off the library
    const b = crBucketByCourse(q);
    eq('deleted not rejected', [...b.rejected], ['alive']);
    eq('deleted has no entry',  b.entryByCourse['gone'] === undefined, true);
    global.COURSE_LIBRARY = [];                          // library not loaded yet
    const b2 = crBucketByCourse(q);
    eq('fails OPEN when library empty', [...b2.rejected].sort(), ['alive', 'gone']);
    delete global.COURSE_LIBRARY;
  }

  console.log('\n11. admin sign-off still wins outright (Tyler: sign-off always wins)');
  {
    const items = [{ id: 'c3', complete: false }];
    const c = chips(items, crBucketByCourse([]), new Set(['c3']));
    eq('signed off -> not Incomplete', c.incomplete, []);
    eq('signed off -> Complete',       c.complete,   ['c3']);
  }

  console.log('\n12. v1235: a send-back OVERRIDES an older admin sign-off');
  {
    // Shangri La: admin-verified, but Tyler personally sent it back with 0 greens
    // mapped. Sign-off wins over the automatic gates; it must NOT hide a send-back,
    // or the Incomplete chip can never equal the Reject chip.
    const items = [{ id: 'shangri-la', complete: false }];
    const c = chips(items, crBucketByCourse([E('shangri-la', 'rejected', '2026-08-26')]), new Set(['shangri-la']));
    eq('verified + sent back -> Incomplete', c.incomplete, ['shangri-la']);
    eq('verified + sent back -> not Complete', c.complete, []);
    eq('and it is in Reject',               c.rejected, ['shangri-la']);
  }

  console.log('\n13. v1235: Incomplete is a SUPERSET of Reject, always');
  {
    const items = [
      { id: 'held',   complete: true  },   // mapped, but held pending a code change
      { id: 'broken', complete: false },   // genuinely short
      { id: 'fine',   complete: true  },   // nothing wrong, never sent back
    ];
    const c = chips(items, crBucketByCourse([E('held', 'rejected', '2026-08-26')]));
    eq('held course counts as Incomplete', c.incomplete.sort(), ['broken', 'held']);
    eq('Reject is a subset',
       c.rejected.every(id => c.incomplete.indexOf(id) >= 0), true);
    eq('untouched complete course stays out', c.incomplete.indexOf('fine'), -1);
  }

  console.log('\n' + p + ' passed, ' + f + ' failed (v1235)');
  if (f) process.exit(1);
})();
