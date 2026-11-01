import { page, esc, attr, ctaBox, breadcrumbLd, crumbs, SITE, storeButtons } from './layout.mjs';

export const STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'Washington, D.C.' };
export const stateName = st => STATES[st] || 'Other';
export const stateSlug = st => (STATES[st] ? st.toLowerCase() : 'other');
export const coursePath = c => `/courses/${stateSlug(c.st)}/${c.id}/`;

const sum = a => a.reduce((x, y) => x + (+y || 0), 0);
// Round Rating chip (players' 1-5 stars; NOT the USGA course rating). Average only at 3+ ratings.
export const rrChip = c => (c && c.rr && c.rr.n) ? `<span class="rr" title="Round Rating from Bad Golf App players">\u2605 ${c.rr.avg != null ? c.rr.avg.toFixed(1) + ' ' : ''}<small>(${c.rr.n})</small></span>` : '';
export function courseFacts(c) {
  const holes = c.holes || (c.pars && c.pars.length) || 18;
  const par = c.pars && c.pars.length ? sum(c.pars) : null;
  const tees = (c.tees || []).slice().sort((a, b) => (b.yards || 0) - (a.yards || 0));
  const top = tees.find(t => t.rating && t.slope) || tees[0];
  const full = c.greens && c.greens >= Math.min(holes, c.pars ? c.pars.length : holes);
  return { holes, par, tees, top, full };
}

// Tee colour bands for the scorecard rows -- the printed card's look. Unknown labels stay neutral.
const TEE_COLORS = [
  [/\b(black|championship|tips)\b/i, '#1f2933', '#fff'], [/\bgold\b/i, '#d4a72c', '#1f2933'], [/\bblue\b/i, '#2c5aa0', '#fff'],
  [/\bwhite\b/i, '#ffffff', '#1f2933'], [/\bgreen\b/i, '#6b8f3a', '#fff'], [/\bred\b/i, '#b23a3a', '#fff'], [/\bsilver|grey|gray\b/i, '#9aa4ae', '#1f2933'],
  [/\borange|copper\b/i, '#d97a2b', '#fff'], [/\byellow\b/i, '#e3c030', '#1f2933'], [/\bpurple\b/i, '#6a4c93', '#fff'], [/\bbrown|tan\b/i, '#8a6a3f', '#fff'], [/\bteal\b/i, '#2a8f8f', '#fff']
];
function teeStyle(label) {
  const hit = TEE_COLORS.find(([re]) => re.test(label || ''));
  return hit ? `style="background:${hit[1]};color:${hit[2]}"` : '';
}
// 2026-11-01 (Tyler, with the printed Buffalo Creek card): "This is a standard layout. Make our
// format match it." One card, all 18 holes across with Out / In / Tot; the longer tees banded in
// their colours on top, then Handicap and Par; the forward (shortest) tee under Par with its own
// handicap line, the way the printed card carries it. Per-tee yards come from the card's tees[].yds
// (GolfPass); a course with none yet shows the single GPS row instead.
function scorecard(c) {
  if (!c.pars || !c.pars.length) return '';
  const n = c.pars.length, sis = c.sis || [], nine = n < 18;
  const teeRows = (c.tees || []).filter(t => Array.isArray(t.yds) && t.yds.length >= n && t.yds.slice(0, n).every(v => v > 0)).slice().sort((a, b) => sum(b.yds) - sum(a.yds));
  const gps = (!teeRows.length && Array.isArray(c.gpsYds) && c.gpsYds.some(v => v > 0)) ? c.gpsYds : null;
  let gpsTee = null;
  if (gps && gps.every(v => v > 0)) { const tot = sum(gps); const hit = (c.tees || []).filter(t => t.yards > 0).map(t => ({ t, d: Math.abs(t.yards - tot) / t.yards })).sort((a, b) => a.d - b.d)[0]; if (hit && hit.d <= 0.02) gpsTee = hit.t.label; }
  const front = Array.from({ length: Math.min(9, n) }, (_, i) => i), back = nine ? [] : Array.from({ length: 9 }, (_, i) => 9 + i);
  const seg = (vals, idx) => idx.map(i => `<td>${vals[i] ?? ''}</td>`).join('');
  const tot = (vals, idx, bold) => `<td class="sc-sub">${bold ? '<strong>' : ''}${sum(idx.map(i => vals[i]))}${bold ? '</strong>' : ''}</td>`;   // plain 7078 like the printed card
  const row = (label, vals, opts) => {
    const o = opts || {}; const totals = !!o.totals;
    return `<tr class="${o.cls || ''}" ${o.style || ''}><th scope="row"${o.style ? ' style="background:inherit;color:inherit"' : ''}>${esc(label)}</th>${seg(vals, front)}${totals ? tot(vals, front, o.bold) : '<td class="sc-sub"></td>'}` +
      (nine ? '' : `${seg(vals, back)}${totals ? tot(vals, back, o.bold) : '<td class="sc-sub"></td>'}`) +
      `${totals ? tot(vals, front.concat(back), true) : '<td class="sc-sub"></td>'}</tr>`;
  };
  const head = `<tr><th>Hole</th>${front.map(i => `<th>${i + 1}</th>`).join('')}<th class="sc-sub">Out</th>` + (nine ? '' : `${back.map(i => `<th>${i + 1}</th>`).join('')}<th class="sc-sub">In</th>`) + `<th class="sc-sub">Tot</th></tr>`;
  const forward = teeRows.length >= 3 ? teeRows[teeRows.length - 1] : null;
  const upper = forward ? teeRows.slice(0, -1) : teeRows;
  let body = '';
  upper.forEach(t => { body += row(t.label || 'Tee', t.yds, { totals: true, style: teeStyle(t.label), cls: 'sc-tee' }); });
  if (gps) body += row('Yards (GPS)' + (gpsTee ? ' · ' + gpsTee : ''), gps, { totals: true, cls: 'sc-tee sc-gps' });
  if (sis.length) body += row('Handicap', sis, { cls: 'sc-hcp' });
  body += row('Par', c.pars, { totals: true, bold: true, cls: 'sc-par' });
  // Tyler (11/1): the forward tee's own Handicap line only when its stroke index differs -- the library carries one index per course, so none here.
  if (forward) body += row(forward.label || 'Tee', forward.yds, { totals: true, style: teeStyle(forward.label), cls: 'sc-tee sc-forward' });
  const notes = [sis.length ? 'Handicap = stroke index (1 is the hardest hole)' : '', gps ? 'Yards (GPS) = mapped tee box to the center of the green, as the app measures it' : ''].filter(Boolean);
  return `<div class="tablewrap sc-card"><table class="scorecard">${'<thead>' + head + '</thead>'}<tbody>${body}</tbody></table></div>` +
    `<p style="margin-top:8px"><strong>Total par ${sum(c.pars)}</strong>${notes.length ? ' · ' + notes.join(' · ') : ''}</p>`;
}

function teesTable(tees) {
  if (!tees.length) return '';
  const women = tees.some(t => t.ratingW || t.slopeW);
  return `<div class="tablewrap"><table><thead><tr><th>Tee</th><th>Yards</th><th>Rating</th><th>Slope</th>${women ? '<th>Rating (W)</th><th>Slope (W)</th>' : ''}</tr></thead><tbody>
${tees.map(t => `<tr><td>${esc(t.label || 'Tee')}</td><td>${t.yards ? t.yards.toLocaleString() : '—'}</td><td>${t.rating ?? '—'}</td><td>${t.slope ?? '—'}</td>${women ? `<td>${t.ratingW ?? '—'}</td><td>${t.slopeW ?? '—'}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}

export function coursePage(c, nearby) {
  const { holes, par, tees, top, full } = courseFacts(c);
  const st = stateName(c.st), path = coursePath(c);
  const loc = [c.city, STATES[c.st] ? c.st : ''].filter(Boolean).join(', ');
  const title = `${c.name} — Scorecard, Slope & Rating, GPS Yardages${loc ? ' | ' + loc : ''}`;
  const bits = [];
  if (par) bits.push(`par ${par}`); bits.push(`${holes} holes`);
  if (tees.length) bits.push(`${tees.length} tee${tees.length > 1 ? 's' : ''}`);
  if (top && top.rating) bits.push(`rating ${top.rating} / slope ${top.slope}${top.yards ? ' from ' + top.yards.toLocaleString() + ' yards' : ''}`);
  const description = `${c.name}${loc ? ' in ' + loc.replace(/, ([A-Z]{2})$/, (m, s) => ', ' + STATES[s]) : ''}: ${bits.join(', ')}. Full scorecard, tee ratings and ${full ? 'GPS yardages to every green' : 'GPS'} in the free Bad Golf App.`;
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.name + (loc ? ', ' + loc : ''))}`;
  const ld = { '@context': 'https://schema.org', '@type': 'GolfCourse', name: c.name, url: SITE + path,
    address: { '@type': 'PostalAddress', ...(c.address ? { streetAddress: c.address } : {}), addressLocality: c.city || undefined, addressRegion: STATES[c.st] ? c.st : undefined, addressCountry: STATES[c.st] ? 'US' : undefined },
    geo: { '@type': 'GeoCoordinates', latitude: c.lat, longitude: c.lng }, ...(c.phone ? { telephone: c.phone } : {}), ...(c.website ? { sameAs: c.website } : {}),
    ...((c.rr && c.rr.avg != null) ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: c.rr.avg, bestRating: 5, worstRating: 1, ratingCount: c.rr.n } } : {}) };
  const body = `<section class="page"><div class="wrap">
  ${crumbs([{ name: 'Home', path: '/' }, { name: 'Courses', path: '/courses/' }, { name: st, path: `/courses/${stateSlug(c.st)}/` }, { name: c.name, path }])}
  <h1>${esc(c.name)}</h1>
  <p class="lede">${loc ? esc(loc) + ' · ' : ''}${holes} holes${par ? ' · Par ' + par : ''}</p>
  <p>${full ? '<span class="badge green">GPS mapped</span>' : c.greens ? `<span class="badge">GPS ${c.greens}/${holes} greens</span>` : ''}${top && top.rating ? '<span class="badge">Rated tees</span>' : ''}${c.verified ? '<span class="badge gold">Verified</span>' : ''}</p>
  <div class="stats">
    <div class="stat"><b>${holes}</b><small>Holes</small></div>
    ${par ? `<div class="stat"><b>${par}</b><small>Par</small></div>` : ''}
    ${top && top.yards ? `<div class="stat"><b>${top.yards.toLocaleString()}</b><small>Yards (${esc(top.label || 'longest')})</small></div>` : ''}
    ${top && top.rating ? `<div class="stat"><b>${top.rating}</b><small>Course rating</small></div><div class="stat"><b>${top.slope}</b><small>Slope</small></div>` : ''}
    ${c.rr && c.rr.n ? `<div class="stat stat-rr"><b>\u2605 ${c.rr.avg != null ? c.rr.avg.toFixed(1) : '\u2014'}</b><small>Round Rating (${c.rr.n} rating${c.rr.n === 1 ? '' : 's'})</small></div>` : ''}
  </div>
  ${c.rr && c.rr.n ? `<p class="rr-line">Players who scored a round here in the Bad Golf App rate it ${c.rr.avg != null ? `<strong>\u2605 ${c.rr.avg.toFixed(1)} out of 5</strong> across ${c.rr.n} ratings` : `\u2014 ${c.rr.n} rating${c.rr.n === 1 ? '' : 's'} so far (the average shows after 3)`}. Rate it yourself after your next round.</p>` : ''}
  <div class="prose has-sc">
    ${tees.length ? `<h2>Tees, course rating &amp; slope</h2>${teesTable(tees)}` : ''}
    ${c.pars && c.pars.length ? `<h2 style="margin-top:1.4em">Scorecard</h2>${scorecard(c)}` : ''}
    <h2>Play ${esc(c.name)} with Bad Golf App</h2>
    <p>Open the free Bad Golf App, pick ${esc(c.name)} and your tees, and the scorecard above is ready to go: ${full ? `GPS yardages to the front, middle and back of every green, ` : ''}handicap strokes applied by hole, a live card shared with your group and all your side games scored in units.</p>
    <ul>
      <li>${full ? `All ${holes} greens GPS-mapped` : c.greens ? `${c.greens} of ${holes} greens GPS-mapped (map the rest in the app)` : 'Map the greens yourself in the app in a few minutes'}</li>
      ${top && top.rating ? `<li>Course handicap calculated from the ${esc(top.label || '')} tees (${top.rating}/${top.slope}) or any other tee set above</li>` : ''}
      <li>Invite your group by text; everyone scores on their own phone</li>
    </ul>
    <div style="margin:18px 0 6px">${storeButtons()}</div>
    ${(c.address || c.phone || c.website) ? `<h2>Contact</h2><p>${c.address ? esc(c.address) + (c.city ? ', ' + esc(c.city) : '') + (STATES[c.st] ? ' ' + c.st : '') + '<br>' : ''}${c.phone ? `<a href="tel:${attr(c.phone.replace(/[^+\d]/g, ''))}">${esc(c.phone)}</a><br>` : ''}${c.website ? `<a href="${attr(c.website)}" rel="nofollow noopener" target="_blank">Course website</a><br>` : ''}<a href="${maps}" rel="nofollow noopener" target="_blank">Directions</a></p>` : `<p><a href="${maps}" rel="nofollow noopener" target="_blank">Directions to ${esc(c.name)}</a></p>`}
    <p style="font-size:.9rem;color:var(--ink-subtle)">Scorecard, ratings and GPS data are maintained by the Bad Golf App community and may differ from the printed card. Spot an error? <a href="mailto:support@officialbadgolf.com?subject=${encodeURIComponent('Course fix: ' + c.name)}">Tell us</a>.</p>
  </div>
  ${nearby.length ? `<div class="related"><h2>Nearby courses${STATES[c.st] ? ' in ' + esc(st) : ''}</h2><ul class="list">${nearby.map(n => `<li><a href="${coursePath(n)}">${esc(n.name)}</a> ${rrChip(n)}<small>${esc(n.city || '')}${n.km != null ? ' · ' + Math.round(n.km * 0.621) + ' mi' : ''}</small></li>`).join('')}</ul></div>` : ''}
  ${ctaBox(`Score your round at ${c.name}`, 'Free on iPhone and Android. Live scorecard, GPS, handicaps and every side game your group plays.')}
</div></section>`;
  return page({ path, title, description, body, jsonld: [ld, breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Courses', path: '/courses/' }, { name: st, path: `/courses/${stateSlug(c.st)}/` }, { name: c.name, path }])] });
}

export function statePage(st, courses) {
  const name = stateName(st), path = `/courses/${stateSlug(st)}/`;
  const byCity = {};
  courses.forEach(c => { const k = c.city || 'Other'; (byCity[k] = byCity[k] || []).push(c); });
  const cities = Object.keys(byCity).sort((a, b) => a.localeCompare(b));
  const mapped = courses.filter(c => courseFacts(c).full).length;
  const body = `<section class="page wide"><div class="wrap">
  ${crumbs([{ name: 'Home', path: '/' }, { name: 'Courses', path: '/courses/' }, { name: name, path }])}
  <h1>Golf courses in ${esc(name)}</h1>
  <p class="lede" style="max-width:46rem">${courses.length.toLocaleString()} ${esc(name)} golf courses in the Bad Golf App, ${mapped.toLocaleString()} with GPS-mapped greens. Every course has its scorecard, tee ratings and slope, and a live shared scorecard for your group.</p>
  <div class="stats" style="max-width:520px"><div class="stat"><b>${courses.length.toLocaleString()}</b><small>Courses</small></div><div class="stat"><b>${mapped.toLocaleString()}</b><small>GPS mapped</small></div><div class="stat"><b>${cities.length.toLocaleString()}</b><small>Cities</small></div></div>
  ${cities.map(city => `<h2 id="${attr(city.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}" style="font-size:1.2rem;margin-top:28px">${esc(city)}</h2><ul class="list">${byCity[city].sort((a, b) => a.name.localeCompare(b.name)).map(c => { const f = courseFacts(c); return `<li><a href="${coursePath(c)}">${esc(c.name)}</a> ${rrChip(c)}<small>${f.holes} holes${f.par ? ' · par ' + f.par : ''}${f.top && f.top.slope ? ' · slope ' + f.top.slope : ''}</small></li>`; }).join('')}</ul>`).join('')}
  ${ctaBox(`Play ${name} golf with Bad Golf App`, 'Free on iPhone and Android. GPS yardages, live scorecard, handicaps and side games on every course above.')}
</div></section>`;
  return page({ path, title: `${name} Golf Courses — Scorecards, Slope, Rating & GPS | Bad Golf App`, description: `${courses.length.toLocaleString()} golf courses in ${name} with scorecards, course rating and slope by tee, and GPS-mapped greens in the free Bad Golf App. Browse by city.`, body, jsonld: [breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Courses', path: '/courses/' }, { name: name, path }])] });
}

export function coursesIndex(byState, total) {
  const sts = Object.keys(byState).sort((a, b) => stateName(a).localeCompare(stateName(b)));
  const body = `<section class="page wide"><div class="wrap">
  ${crumbs([{ name: 'Home', path: '/' }, { name: 'Courses', path: '/courses/' }])}
  <h1>Golf course scorecards, slope &amp; GPS</h1>
  <p class="lede" style="max-width:46rem">${total.toLocaleString()} courses in the Bad Golf App library, each with its scorecard, tee ratings and slope, and GPS-mapped greens for the app. Search your course or browse by state.</p>
  <div class="search" id="course-search" style="margin:20px 0 32px"><label class="sr" for="cs">Search courses</label><input id="cs" type="search" placeholder="Search a course or city…" autocomplete="off"><div class="results"></div></div>
  <div class="states">${sts.map(st => `<a href="/courses/${stateSlug(st)}/">${esc(stateName(st))}<small>${byState[st].length.toLocaleString()}</small></a>`).join('')}</div>
  ${ctaBox('Your course, your group, one scorecard', 'Free on iPhone and Android. If your course is missing, add it in the app in a couple of minutes.')}
</div></section>`;
  return page({ path: '/courses/', title: `Golf Course Scorecards, Slope & GPS — ${total.toLocaleString()} U.S. Courses | Bad Golf App`, description: `Scorecards, course rating and slope by tee, and GPS-mapped greens for ${total.toLocaleString()} U.S. golf courses. Find your course, then score your round in the free Bad Golf App.`, body, jsonld: [breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Courses', path: '/courses/' }])], extraHead: `<script defer src="/course-search.js"></script>` });
}

// Client-side search over /courses/index.txt (st|id|name|city|rating). 2026-10-30 (Tyler:
// "enhance our search so it's easier to find courses on the web"): words match by PREFIX
// ("buff" finds Buffalo Creek), punctuation and "&"/"and" don't matter, full state names
// work ("rockwall texas"), results are RANKED (name match first, then city, then state;
// courses with GPS/ratings data are not favoured - this is a finder), a typo in one word
// still finds the course (fallback to 4-letter prefixes), 15 results, Enter opens the first,
// and every row shows the Round Rating chip.
const STATE_WORDS = Object.entries(STATES).map(([k, v]) => k + ':' + v.toLowerCase().replace(/[^a-z ]/g, '')).join(',');
export const searchJs = `(function(){var box=document.getElementById('course-search');if(!box)return;var inp=box.querySelector('input'),res=box.querySelector('.results'),rows=null,loading=false;
var SN={};'${STATE_WORDS}'.split(',').forEach(function(p){var i=p.indexOf(':');SN[p.slice(0,i)]=p.slice(i+1)});
function norm(s){return (s||'').toLowerCase().replace(/&/g,' and ').replace(/[\\u2018\\u2019']/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\\s+/g,' ').trim()}
function load(cb){if(rows){cb();return}if(loading)return;loading=true;fetch('/courses/index.txt').then(function(r){return r.text()}).then(function(t){rows=t.split('\\n').filter(Boolean).map(function(l){var p=l.split('|');var st=p[0]||'';return{st:st,id:p[1],name:p[2],city:p[3]||'',rr:p[4]||'',n:norm(p[2]),c:norm(p[3]),s:(st.toLowerCase()+' '+(SN[st]||''))}});cb()}).catch(function(){loading=false})}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function hit(hay,t){if(!hay)return 0;if(hay===t)return 4;if(hay.indexOf(t+' ')===0)return 3;if(hay.indexOf(' '+t)>=0||hay.indexOf(t)===0)return 2;if(hay.indexOf(t)>=0)return 1;return 0}
function score(r,terms){var sc=0;for(var j=0;j<terms.length;j++){var t=terms[j],a=hit(r.n,t),b=hit(r.c,t),c=hit(r.s,t);if(!a&&!b&&!c)return 0;sc+=a*10+b*4+c*2}return sc}
function rank(q){var terms=q.split(' '),out=[];for(var i=0;i<rows.length;i++){var r=rows[i],sc=score(r,terms);if(sc){if(r.n===q)sc+=100;else if(r.n.indexOf(q)===0)sc+=40;out.push([sc,r])}}out.sort(function(x,y){return y[0]-x[0]||x[1].n.length-y[1].n.length});return out.slice(0,15).map(function(x){return x[1]})}
function chip(rr){if(!rr)return'';var p=rr.split('~');return'<span class="rr">\\u2605 '+(p[0]?esc(p[0])+' ':'')+'<small>('+esc(p[1]||'')+')</small></span>'}
function show(){var q=norm(inp.value);if(q.length<2){res.style.display='none';return}var out=rank(q);
if(!out.length&&q.length>=5){var q2=q.split(' ').map(function(t){return t.length>4?t.slice(0,4):t}).join(' ');out=rank(q2)}
res.innerHTML=(out.length?out.map(function(r){var st=r.st?r.st.toLowerCase():'other';return'<a href="/courses/'+st+'/'+r.id+'/">'+esc(r.name)+chip(r.rr)+'<small>'+esc(r.city)+(r.st?(r.city?', ':'')+r.st:'')+'</small></a>'}).join(''):'<a class="none">No match for \\u201c'+esc(inp.value.trim())+'\\u201d \\u2014 try fewer words, or add the course inside the app in a couple of minutes.</a>');res.style.display='block'}
inp.addEventListener('focus',function(){load(function(){})});inp.addEventListener('input',function(){load(show);if(rows)show()});
inp.addEventListener('keydown',function(e){if(e.key==='Enter'){var a=res.querySelector('a[href]');if(a&&res.style.display!=='none'){e.preventDefault();location.href=a.getAttribute('href')}}else if(e.key==='Escape'){res.style.display='none'}});
document.addEventListener('click',function(e){if(!box.contains(e.target))res.style.display='none'})})();`;
