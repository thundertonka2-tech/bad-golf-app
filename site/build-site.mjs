#!/usr/bin/env node
// Builds the officialbadgolf.com marketing site.
//   node site/fetch-courses.mjs site-data/courses.json   (pulls the live course library)
//   node site/build-site.mjs --out dist [--courses site-data/courses.json]
// Writes: index.html, features/, download/, get/, games/, leagues/, tournaments/, handicaps/,
// courses/ (one page per state + per course), sitemap.xml + sitemaps/, robots.txt, 404.html,
// site.css, img/, course-search.js. No dependencies beyond Node 18+.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE } from './lib/layout.mjs';
import { home, features, download, getRedirect, notFound } from './lib/pages-static.mjs';
import { gameList, gamePage, gamesIndex, leaguesPage, tournamentsPage, handicapsPage } from './lib/pages-games.mjs';
import { coursePage, statePage, coursesIndex, coursePath, stateSlug, searchJs, STATES } from './lib/pages-courses.mjs';
import { SITE_LANGS, translatePage, alternatesFor, switcherHtml, extractStrings } from './lib/i18n-site.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(opt('--out', 'dist'));
const COURSES = path.resolve(opt('--courses', 'site-data/courses.json'));

const write = (rel, content) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); };
const copyDir = (src, dst) => { fs.mkdirSync(dst, { recursive: true }); for (const e of fs.readdirSync(src, { withFileTypes: true })) { const s = path.join(src, e.name), d = path.join(dst, e.name); e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d); } };

const t0 = Date.now();
fs.mkdirSync(OUT, { recursive: true });
copyDir(path.join(here, 'static'), OUT);

// ---- data
const data = JSON.parse(fs.readFileSync(COURSES, 'utf8'));
// v2000 (audit WEB-12): one page per state + name + city. Duplicate library rows for the same course
// made near-duplicate pages; keep the row carrying the most data (card, tees, GPS, ratings, pin).
const _rich = c => (c.pars && c.pars.length ? 4 : 0) + (c.tees ? c.tees.length : 0) + (c.greens ? 2 : 0) + (c.rr ? 1 : 0) + (c.lat != null ? 1 : 0);
const _dupKey = c => [String(c.st || '').toUpperCase(), String(c.name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), String(c.city || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()].join('|');
const courses = (() => {
  const all = data.courses.filter(c => c && c.id && c.name && /^[a-z0-9-]+$/.test(c.id));
  const best = new Map();
  for (const c of all) { const k = _dupKey(c), b = best.get(k); if (!b || _rich(c) > _rich(b)) best.set(k, c); }
  const keep = new Set(best.values());
  return all.filter(c => keep.has(c));
})();
// v2000 (audit WEB-12): every "U.S. courses" figure counts only courses in a U.S. state (the library
// also holds Canadian, Irish and state-less rows; those publish under /courses/other/).
const usCount = courses.filter(c => STATES[c.st]).length;
const byState = {};
courses.forEach(c => { const k = STATES[c.st] ? c.st : '__'; (byState[k] = byState[k] || []).push(c); });
const stateCount = Object.keys(byState).filter(k => k !== '__').length;
const games = gameList();
const urls = [];
const add = (loc, priority = 0.5, changefreq = 'monthly', lastmod = null) => urls.push({ loc, priority, changefreq, lastmod });
// v2000 (audit WEB-15): <lastmod> only where the content has a real date (a course card's updatedAt);
// stamping every URL with the build date told crawlers everything changed on every deploy.
const dayOf = v => { if (v == null || v === '') return null; const d = new Date(typeof v === 'string' && /^\d+$/.test(v) ? +v : v); return isNaN(d) || d > new Date() ? null : d.toISOString().slice(0, 10); };

// ---- static pages
const topSlugs = ['skins', 'nassau', 'wolf-captain', 'vegas', 'banker', 'stableford', 'quota', 'match-play', 'scramble', 'shamble', 'hammer', 'bingo-bango-bongo', 'ryder-cup', 'par-3-greenie', 'snake', 'closest-to-the-pin', 'umbrella'];
const topGames = topSlugs.map(s => games.find(g => g.slug === s)).filter(Boolean);
write('index.html', home({ courseCount: usCount, gameCount: games.length, topGames, stateCount })); add('/', 1.0, 'weekly');
write('features/index.html', features({ courseCount: usCount, gameCount: games.length })); add('/features/', 0.8);
write('download/index.html', download()); add('/download/', 0.9);
write('get/index.html', getRedirect());
write('404.html', notFound());
write('course-search.js', searchJs);

// ---- games
write('games/index.html', gamesIndex(games)); add('/games/', 0.9, 'weekly');
games.forEach(g => { write(`games/${g.slug}/index.html`, gamePage(g, games)); add(`/games/${g.slug}/`, 0.7); });
write('leagues/index.html', leaguesPage()); add('/leagues/', 0.9);
write('tournaments/index.html', tournamentsPage()); add('/tournaments/', 0.8);
write('handicaps/index.html', handicapsPage()); add('/handicaps/', 0.7);

// ---- courses
write('courses/index.html', coursesIndex(byState, usCount)); add('/courses/', 0.9, 'weekly');
// st|id|name|city|rating  (rating = "avg~n", avg blank until 3 ratings; empty when unrated) - read by course-search.js
write('courses/index.txt', courses.map(c => [STATES[c.st] ? c.st : '', c.id, c.name.replace(/[|\n]/g, ' '), (c.city || '').replace(/[|\n]/g, ' ').replace(/,\s*[A-Za-z]{2}\.?$/, ''), c.rr ? ((c.rr.avg != null ? c.rr.avg.toFixed(1) : '') + '~' + c.rr.n) : ''].join('|')).join('\n'));
const km = (a, b) => { const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180; const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const stateUrls = {};
for (const st of Object.keys(byState)) {
  const list = byState[st];
  const key = st === '__' ? '' : st;
  write(`courses/${stateSlug(key)}/index.html`, statePage(key, list));
  add(`/courses/${stateSlug(key)}/`, 0.8, 'weekly');
  const su = stateUrls[st] = [];
  for (const c of list) {
    let nearby = [];
    if (c.lat != null && c.lng != null) {
      nearby = list.filter(o => o !== c && o.lat != null).map(o => ({ ...o, km: km(c, o) })).sort((a, b) => a.km - b.km).slice(0, 6).filter(o => o.km < 120);
    }
    write(coursePath(c) + 'index.html', coursePage(c, nearby));
    su.push({ loc: coursePath(c), priority: 0.6, changefreq: 'monthly', lastmod: dayOf(c.updatedAt) });
  }
}

// ---- v1840 languages: /es/ /ko/ /ja/ /zh/ copies of the marketing pages -------------
// English pages are built above; each one in I18N_PAGES is re-written per language from
// site/i18n/<lang>.json. Support + the legal pages are static files in the repo root
// (present when --out is the repo root, as on Pages); they're included when found.
// `--extract-i18n <file>` writes every English string on those pages (for translators).
{
  const I18N_PAGES = ['/', '/features/', '/download/', '/games/', ...games.map(g => `/games/${g.slug}/`), '/leagues/', '/tournaments/', '/handicaps/', '/courses/', '/support.html', '/terms.html', '/privacy.html', '/delete-account.html'];
  const fileOf = p => p === '/' ? 'index.html' : (p.endsWith('/') ? p.slice(1) + 'index.html' : p.slice(1));
  const srcOf = p => { const f = path.join(OUT, fileOf(p)); if (fs.existsSync(f)) return f; const r = path.join(here, '..', fileOf(p)); return fs.existsSync(r) ? r : null; };
  const pages = I18N_PAGES.filter(p => srcOf(p));
  // v2000 (audit WEB-15): the English support, legal and account-deletion pages belong in the sitemap
  // (their courtesy translations stay out of it).
  for (const p of ['/support.html', '/privacy.html', '/terms.html', '/delete-account.html']) if (pages.includes(p)) add(p, 0.3, 'yearly');
  const local = new Set(pages);
  const LEGAL = new Set(['/terms.html', '/privacy.html']);
  const ext = opt('--extract-i18n', null);
  if (ext) {
    const all = new Set();
    for (const p of pages) extractStrings(fs.readFileSync(srcOf(p), 'utf8')).forEach(s => all.add(s));
    fs.writeFileSync(ext, JSON.stringify([...all], null, 1));
    console.log(`extracted ${all.size} strings from ${pages.length} pages -> ${ext}`);
  }
  const NOTE = {
    es: 'Traducción de cortesía. Si hay alguna diferencia, la versión en inglés es la que rige.',
    ko: '편의를 위한 번역본입니다. 내용이 다를 경우 영어 원문이 우선합니다.',
    ja: '参考のための翻訳です。内容に相違がある場合は英語版が優先されます。',
    zh: '本译文仅供参考。如有出入，以英文版本为准。'
  };
  const englishLink = { es: 'Ver en inglés', ko: '영어 원문 보기', ja: '英語版を見る', zh: '查看英文原文' };
  let built = 0, missTotal = 0;
  for (const L of SITE_LANGS) {
    const dp = path.join(here, 'i18n', L.code + '.json');
    if (!fs.existsSync(dp)) continue;
    const dict = JSON.parse(fs.readFileSync(dp, 'utf8'));
    const misses = new Set();
    for (const p of pages) {
      const html = fs.readFileSync(srcOf(p), 'utf8');
      const r = translatePage(html, { dict, lang: L.code, pathMap: h => { const b = h.split('#')[0]; return local.has(b) ? '/' + L.code + h : null; }, alternates: alternatesFor(p, SITE) });
      r.misses.forEach(m => misses.add(m));
      let out = r.html.replace('<div class="fine">', switcherHtml(p, L.code) + '<div class="fine">');
      if (LEGAL.has(p)) out = out.replace(/<body([^>]*)>/, `<body$1><div class="i18n-legal-note" style="background:#fff7d6;color:#3d3200;padding:10px 16px;font:14px/1.45 system-ui,sans-serif;text-align:center">${NOTE[L.code]} <a href="${p}">${englishLink[L.code]}</a></div>`);
      write(L.code + '/' + fileOf(p), out); built++;
      if (!LEGAL.has(p) && p !== '/delete-account.html') add('/' + L.code + p, 0.6);
    }
    missTotal += misses.size;
    if (misses.size && process.env.I18N_DEBUG) fs.writeFileSync(`i18n-site-misses-${L.code}.txt`, [...misses].join('\n'));   // names that stay English are normal here
  }
  // English twins get the same hreflang links + switcher (only the generated pages).
  for (const p of pages) {
    const f = path.join(OUT, fileOf(p));
    if (!fs.existsSync(f) || !f.startsWith(OUT)) continue;
    let html = fs.readFileSync(f, 'utf8');
    if (html.includes('hreflang="x-default"')) continue;
    html = html.replace('</head>', alternatesFor(p, SITE) + '</head>').replace('<div class="fine">', switcherHtml(p, 'en') + '<div class="fine">');
    fs.writeFileSync(f, html);
  }
  if (built) console.log(`languages: ${built} localized pages (${missTotal} strings left in English - game names/brand stay English on purpose)`);
}

// ---- robots + sitemaps (index + one per state so no file gets huge)
const urlset = list => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${list.map(u => `<url><loc>${SITE}${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('\n')}\n</urlset>`;
const newest = list => list.reduce((m, u) => (u.lastmod && (!m || u.lastmod > m) ? u.lastmod : m), null);   // v2000 (audit WEB-15)
write('sitemaps/pages.xml', urlset(urls));
const maps = [{ loc: '/sitemaps/pages.xml', lastmod: newest(urls) }];
for (const st of Object.keys(stateUrls)) { const f = `sitemaps/courses-${stateSlug(st === '__' ? '' : st)}.xml`; write(f, urlset(stateUrls[st])); maps.push({ loc: '/' + f, lastmod: newest(stateUrls[st]) }); }
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${maps.map(m => `<sitemap><loc>${SITE}${m.loc}</loc>${m.lastmod ? `<lastmod>${m.lastmod}</lastmod>` : ''}</sitemap>`).join('\n')}\n</sitemapindex>`);
write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /get/\nSitemap: ${SITE}/sitemap.xml\n`);

const total = urls.length + Object.values(stateUrls).reduce((n, l) => n + l.length, 0);
console.log(`built ${total} pages (${courses.length} courses in ${stateCount} states, ${games.length} games) -> ${OUT} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
