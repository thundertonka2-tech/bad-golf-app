import { page, esc, attr, ctaBox, breadcrumbLd, crumbs, SITE, storeButtons } from './layout.mjs';

export const STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'Washington, D.C.' };
export const stateName = st => STATES[st] || 'Other';
export const stateSlug = st => (STATES[st] ? st.toLowerCase() : 'other');
export const coursePath = c => `/courses/${stateSlug(c.st)}/${c.id}/`;

const sum = a => a.reduce((x, y) => x + (+y || 0), 0);
export function courseFacts(c) {
  const holes = c.holes || (c.pars && c.pars.length) || 18;
  const par = c.pars && c.pars.length ? sum(c.pars) : null;
  const tees = (c.tees || []).slice().sort((a, b) => (b.yards || 0) - (a.yards || 0));
  const top = tees.find(t => t.rating && t.slope) || tees[0];
  const full = c.greens && c.greens >= Math.min(holes, c.pars ? c.pars.length : holes);
  return { holes, par, tees, top, full };
}

function scorecard(c) {
  if (!c.pars || !c.pars.length) return '';
  const n = c.pars.length, sis = c.sis || [];
  const block = (from, to, label) => {
    const idx = Array.from({ length: to - from }, (_, i) => from + i);
    return `<div class="tablewrap"><table><thead><tr><th>Hole</th>${idx.map(i => `<th>${i + 1}</th>`).join('')}<th>${label}</th></tr></thead><tbody>
<tr><td>Par</td>${idx.map(i => `<td>${c.pars[i] ?? ''}</td>`).join('')}<td><strong>${sum(idx.map(i => c.pars[i]))}</strong></td></tr>
${sis.length ? `<tr><td>Handicap</td>${idx.map(i => `<td>${sis[i] ?? ''}</td>`).join('')}<td></td></tr>` : ''}</tbody></table></div>`;
  };
  if (n >= 18) return block(0, 9, 'Out') + block(9, 18, 'In') + `<p style="margin-top:8px"><strong>Total par ${sum(c.pars)}</strong>${sis.length ? ' · Handicap row = stroke index (1 is the hardest hole)' : ''}</p>`;
  return block(0, n, 'Total');
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
  const description = `${c.name}${loc ? ' in ' + loc.replace(/, ([A-Z]{2})$/, (m, s) => ', ' + STATES[s]) : ''}: ${bits.join(', ')}. Full scorecard, tee ratings and ${full ? 'GPS yardages to every green' : 'GPS'} in the free Bad Golf app.`;
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.name + (loc ? ', ' + loc : ''))}`;
  const ld = { '@context': 'https://schema.org', '@type': 'GolfCourse', name: c.name, url: SITE + path,
    address: { '@type': 'PostalAddress', ...(c.address ? { streetAddress: c.address } : {}), addressLocality: c.city || undefined, addressRegion: STATES[c.st] ? c.st : undefined, addressCountry: STATES[c.st] ? 'US' : undefined },
    geo: { '@type': 'GeoCoordinates', latitude: c.lat, longitude: c.lng }, ...(c.phone ? { telephone: c.phone } : {}), ...(c.website ? { sameAs: c.website } : {}) };
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
  </div>
  <div class="prose">
    ${tees.length ? `<h2>Tees, course rating &amp; slope</h2>${teesTable(tees)}` : ''}
    ${c.pars && c.pars.length ? `<h2 style="margin-top:1.4em">Scorecard</h2>${scorecard(c)}` : ''}
    <h2>Play ${esc(c.name)} with Bad Golf</h2>
    <p>Open the free Bad Golf app, pick ${esc(c.name)} and your tees, and the scorecard above is ready to go: ${full ? `GPS yardages to the front, middle and back of every green, ` : ''}handicap strokes applied by hole, a live card shared with your group and all your side games scored in units.</p>
    <ul>
      <li>${full ? `All ${holes} greens GPS-mapped` : c.greens ? `${c.greens} of ${holes} greens GPS-mapped (map the rest in the app)` : 'Map the greens yourself in the app in a few minutes'}</li>
      ${top && top.rating ? `<li>Course handicap calculated from the ${esc(top.label || '')} tees (${top.rating}/${top.slope}) or any other tee set above</li>` : ''}
      <li>Invite your group by text; everyone scores on their own phone</li>
    </ul>
    <div style="margin:18px 0 6px">${storeButtons()}</div>
    ${(c.address || c.phone || c.website) ? `<h2>Contact</h2><p>${c.address ? esc(c.address) + (c.city ? ', ' + esc(c.city) : '') + (STATES[c.st] ? ' ' + c.st : '') + '<br>' : ''}${c.phone ? `<a href="tel:${attr(c.phone.replace(/[^+\d]/g, ''))}">${esc(c.phone)}</a><br>` : ''}${c.website ? `<a href="${attr(c.website)}" rel="nofollow noopener" target="_blank">Course website</a><br>` : ''}<a href="${maps}" rel="nofollow noopener" target="_blank">Directions</a></p>` : `<p><a href="${maps}" rel="nofollow noopener" target="_blank">Directions to ${esc(c.name)}</a></p>`}
    <p style="font-size:.9rem;color:var(--ink-subtle)">Scorecard, ratings and GPS data are maintained by the Bad Golf community and may differ from the printed card. Spot an error? <a href="mailto:support@officialbadgolf.com?subject=${encodeURIComponent('Course fix: ' + c.name)}">Tell us</a>.</p>
  </div>
  ${nearby.length ? `<div class="related"><h2>Nearby courses${STATES[c.st] ? ' in ' + esc(st) : ''}</h2><ul class="list">${nearby.map(n => `<li><a href="${coursePath(n)}">${esc(n.name)}</a> <small>${esc(n.city || '')}${n.km != null ? ' · ' + Math.round(n.km * 0.621) + ' mi' : ''}</small></li>`).join('')}</ul></div>` : ''}
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
  <p class="lede" style="max-width:46rem">${courses.length.toLocaleString()} ${esc(name)} golf courses in the Bad Golf app, ${mapped.toLocaleString()} with GPS-mapped greens. Every course has its scorecard, tee ratings and slope, and a live shared scorecard for your group.</p>
  <div class="stats" style="max-width:520px"><div class="stat"><b>${courses.length.toLocaleString()}</b><small>Courses</small></div><div class="stat"><b>${mapped.toLocaleString()}</b><small>GPS mapped</small></div><div class="stat"><b>${cities.length.toLocaleString()}</b><small>Cities</small></div></div>
  ${cities.map(city => `<h2 id="${attr(city.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}" style="font-size:1.2rem;margin-top:28px">${esc(city)}</h2><ul class="list">${byCity[city].sort((a, b) => a.name.localeCompare(b.name)).map(c => { const f = courseFacts(c); return `<li><a href="${coursePath(c)}">${esc(c.name)}</a> <small>${f.holes} holes${f.par ? ' · par ' + f.par : ''}${f.top && f.top.slope ? ' · slope ' + f.top.slope : ''}</small></li>`; }).join('')}</ul>`).join('')}
  ${ctaBox(`Play ${name} golf with Bad Golf`, 'Free on iPhone and Android. GPS yardages, live scorecard, handicaps and side games on every course above.')}
</div></section>`;
  return page({ path, title: `${name} Golf Courses — Scorecards, Slope, Rating & GPS | Bad Golf`, description: `${courses.length.toLocaleString()} golf courses in ${name} with scorecards, course rating and slope by tee, and GPS-mapped greens in the free Bad Golf app. Browse by city.`, body, jsonld: [breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Courses', path: '/courses/' }, { name: name, path }])] });
}

export function coursesIndex(byState, total) {
  const sts = Object.keys(byState).sort((a, b) => stateName(a).localeCompare(stateName(b)));
  const body = `<section class="page wide"><div class="wrap">
  ${crumbs([{ name: 'Home', path: '/' }, { name: 'Courses', path: '/courses/' }])}
  <h1>Golf course scorecards, slope &amp; GPS</h1>
  <p class="lede" style="max-width:46rem">${total.toLocaleString()} courses in the Bad Golf library, each with its scorecard, tee ratings and slope, and GPS-mapped greens for the app. Search your course or browse by state.</p>
  <div class="search" id="course-search" style="margin:20px 0 32px"><label class="sr" for="cs">Search courses</label><input id="cs" type="search" placeholder="Search a course or city…" autocomplete="off"><div class="results"></div></div>
  <div class="states">${sts.map(st => `<a href="/courses/${stateSlug(st)}/">${esc(stateName(st))}<small>${byState[st].length.toLocaleString()}</small></a>`).join('')}</div>
  ${ctaBox('Your course, your group, one scorecard', 'Free on iPhone and Android. If your course is missing, add it in the app in a couple of minutes.')}
</div></section>`;
  return page({ path: '/courses/', title: `Golf Course Scorecards, Slope & GPS — ${total.toLocaleString()} U.S. Courses | Bad Golf`, description: `Scorecards, course rating and slope by tee, and GPS-mapped greens for ${total.toLocaleString()} U.S. golf courses. Find your course, then score your round in the free Bad Golf app.`, body, jsonld: [breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Courses', path: '/courses/' }])], extraHead: `<script defer src="/course-search.js"></script>` });
}

// Tiny client-side search over /courses/index.txt (one course per line: st|id|name|city).
export const searchJs = `(function(){var box=document.getElementById('course-search');if(!box)return;var inp=box.querySelector('input'),res=box.querySelector('.results'),rows=null,loading=false;
function slug(s){return s.toLowerCase()}
function load(cb){if(rows){cb();return}if(loading)return;loading=true;fetch('/courses/index.txt').then(function(r){return r.text()}).then(function(t){rows=t.split('\\n').filter(Boolean).map(function(l){var p=l.split('|');return{st:p[0],id:p[1],name:p[2],city:p[3],k:slug(p[2]+' '+p[3]+' '+p[0])}});cb()}).catch(function(){loading=false})}
function esc(s){return s.replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function show(){var q=slug(inp.value.trim());if(q.length<2){res.style.display='none';return}var terms=q.split(/\\s+/),out=[];for(var i=0;i<rows.length&&out.length<12;i++){var r=rows[i],ok=true;for(var j=0;j<terms.length;j++){if(r.k.indexOf(terms[j])<0){ok=false;break}}if(ok)out.push(r)}
res.innerHTML=out.length?out.map(function(r){var st=r.st?r.st.toLowerCase():'other';return'<a href="/courses/'+st+'/'+r.id+'/">'+esc(r.name)+'<small>'+esc(r.city)+(r.st?', '+r.st:'')+'</small></a>'}).join(''):'<a>No match — you can add a course inside the app.</a>';res.style.display='block'}
inp.addEventListener('focus',function(){load(function(){})});inp.addEventListener('input',function(){load(show);if(rows)show()});document.addEventListener('click',function(e){if(!box.contains(e.target))res.style.display='none'})})();`;
