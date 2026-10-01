// v1840 LANGUAGES — officialbadgolf.com in Español / 한국어 / 日本語 / 中文.
// The site is still written in English. After the English pages are built, the
// marketing pages (home, features, download, games, leagues, tournaments, handicaps,
// support) are re-written into /es/ /ko/ /ja/ /zh/ by swapping every visible text
// run and the SEO attributes through site/i18n/<lang>.json ({English: translation}).
// Course pages (11,000+, mostly names and numbers) stay English only.
// No dependencies: a small tag/text tokenizer, script/style bodies untouched.
export const SITE_LANGS = [
  { code: 'es', label: 'Español', hreflang: 'es', html: 'es' },
  { code: 'ko', label: '한국어', hreflang: 'ko', html: 'ko' },
  { code: 'ja', label: '日本語', hreflang: 'ja', html: 'ja' },
  { code: 'zh', label: '中文', hreflang: 'zh-Hans', html: 'zh-Hans' }
];

const decode = s => s.replace(/&(amp|lt|gt|quot|#39|#x27|nbsp|rsquo|lsquo|ldquo|rdquo|mdash|ndash|hellip|middot|rsaquo|copy);|&#(\d+);|&#x([0-9a-f]+);/gi, (m, n, d, h) => {
  if (d) return String.fromCodePoint(+d);
  if (h) return String.fromCodePoint(parseInt(h, 16));
  return ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', hellip: '…', middot: '·', rsaquo: '›', copy: '©' })[n.toLowerCase()] || m;
});
// '&' already starting an entity (&rarr; &#8217;) stays as is - translators keep those.
const encText = s => s.replace(/&(?![a-zA-Z][a-zA-Z0-9]{1,31};|#\d{1,7};|#x[0-9a-fA-F]{1,6};)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const encAttr = s => encText(s).replace(/"/g, '&quot;');
const norm = s => s.replace(/\s+/g, ' ').trim();
const HAS_WORD = /[A-Za-z]{2,}/;
const TR_ATTRS = ['alt', 'title', 'aria-label', 'placeholder'];
const META_NAMES = /^(description|og:title|og:description|twitter:title|twitter:description)$/;

// Split into [{t:'tag', s}|{t:'text', s}], keeping script/style/json bodies raw.
function tokens(html) {
  const out = []; let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { out.push({ t: 'text', s: html.slice(i) }); break; }
    if (lt > i) out.push({ t: 'text', s: html.slice(i, lt) });
    if (html.startsWith('<!--', lt)) { const e = html.indexOf('-->', lt); const end = e < 0 ? html.length : e + 3; out.push({ t: 'raw', s: html.slice(lt, end) }); i = end; continue; }
    const gt = html.indexOf('>', lt);
    const tag = html.slice(lt, gt + 1);
    out.push({ t: 'tag', s: tag });
    i = gt + 1;
    const m = /^<(script|style)\b/i.exec(tag);
    if (m) { const close = html.toLowerCase().indexOf('</' + m[1].toLowerCase(), i); out.push({ t: 'raw', s: html.slice(i, close) }); i = close; }
  }
  return out;
}

// Every translatable English string on a page (for building the dictionaries).
export function extractStrings(html) {
  const found = new Set();
  for (const tk of tokens(html)) {
    if (tk.t === 'text') { const k = norm(decode(tk.s)); if (HAS_WORD.test(k)) found.add(k); }
    else if (tk.t === 'tag') {
      for (const a of TR_ATTRS) { const m = new RegExp('\\s' + a + '="([^"]*)"').exec(tk.s); if (m) { const k = norm(decode(m[1])); if (HAS_WORD.test(k)) found.add(k); } }
      if (/^<meta\b/i.test(tk.s)) {
        const nm = /\s(?:name|property)="([^"]+)"/.exec(tk.s), ct = /\scontent="([^"]*)"/.exec(tk.s);
        if (nm && ct && META_NAMES.test(nm[1])) { const k = norm(decode(ct[1])); if (HAS_WORD.test(k)) found.add(k); }
      }
    }
  }
  return found;
}

function trText(dict, raw) {
  const k = norm(decode(raw));
  if (!HAS_WORD.test(k)) return null;
  const t = dict[k];
  if (t == null) return null;
  const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
  return lead + t + trail;
}

// pathMap(href) -> localized href or null (leave as is)
export function translatePage(html, { dict, lang, pathMap, alternates, currentPath }) {
  const L = SITE_LANGS.find(l => l.code === lang);
  const misses = new Set();
  const out = tokens(html).map(tk => {
    if (tk.t === 'text') {
      const t = trText(dict, tk.s);
      if (t == null) { const k = norm(decode(tk.s)); if (HAS_WORD.test(k)) misses.add(k); return tk.s; }
      return encText(t);
    }
    if (tk.t !== 'tag') return tk.s;
    let s = tk.s;
    if (/^<html\b/i.test(s)) s = s.replace(/\slang="[^"]*"/, ` lang="${L.html}"`);
    for (const a of TR_ATTRS) {
      s = s.replace(new RegExp('(\\s' + a + '=")([^"]*)(")'), (m, p, v, q) => { const t = trText(dict, decode(v)); return t == null ? m : p + encAttr(t.trim()) + q; });
    }
    if (/^<meta\b/i.test(s)) {
      const nm = /\s(?:name|property)="([^"]+)"/.exec(s);
      if (nm && META_NAMES.test(nm[1])) s = s.replace(/(\scontent=")([^"]*)(")/, (m, p, v, q) => { const t = trText(dict, decode(v)); return t == null ? m : p + encAttr(t.trim()) + q; });
      if (nm && nm[1] === 'og:url') s = s.replace(/(\scontent=")([^"]*)(")/, (m, p, v, q) => p + v.replace(/^(https:\/\/[^/]+)/, '$1/' + lang) + q);
    }
    if (/^<link\b[^>]*rel="canonical"/i.test(s)) s = s.replace(/href="(https:\/\/[^/]+)([^"]*)"/, `href="$1/${lang}$2"`);
    if (/^<a\b/i.test(s)) s = s.replace(/\shref="(\/[^"]*)"/, (m, href) => { const n = pathMap(href); return n ? ` href="${n}"` : m; });
    if (/^<\/head>/i.test(s)) s = alternates + s;
    return s;
  }).join('');
  return { html: out, misses };
}

export function alternatesFor(path, siteUrl) {
  return `<link rel="alternate" hreflang="en" href="${siteUrl}${path}">\n` +
    SITE_LANGS.map(l => `<link rel="alternate" hreflang="${l.hreflang}" href="${siteUrl}/${l.code}${path}">`).join('\n') +
    `\n<link rel="alternate" hreflang="x-default" href="${siteUrl}${path}">\n`;
}

// Footer language switcher (same markup on every localized page + its English twin).
export function switcherHtml(path, current) {
  const items = [{ code: 'en', label: 'English' }].concat(SITE_LANGS);
  return `<div class="langs" data-noi18n>` + items.map(l => {
    const href = l.code === 'en' ? path : '/' + l.code + path;
    return l.code === current ? `<strong>${l.label}</strong>` : `<a href="${href}" hreflang="${l.code}">${l.label}</a>`;
  }).join(' · ') + `</div>`;
}
