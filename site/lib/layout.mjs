// Shared page shell for officialbadgolf.com. Every generated page goes through page().
export const SITE = 'https://officialbadgolf.com';
export const APP_URL = SITE + '/app/';
export const APPSTORE = 'https://apps.apple.com/app/id6779399027';
export const PLAY = 'https://play.google.com/store/apps/details?id=com.simplisticfishing.badgolf';
export const SUPPORT = 'support@officialbadgolf.com';
export const TAGLINE = 'Bad Golf, Better Times';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const attr = esc;
export const slugify = s => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const dlIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`;
export const storeButtons = (cls = '') => `
<div class="stores ${cls}">
  <a class="store" href="${APPSTORE}" rel="noopener" target="_blank">${dlIcon}<span><small>Download on the</small><b>App Store</b></span></a>
  <a class="store" href="${PLAY}" rel="noopener" target="_blank">${dlIcon}<span><small>Get it on</small><b>Google Play</b></span></a>
</div>`;

export function page({ path, title, description, h1, body, ogImage, jsonld = [], noindex = false, extraHead = '', headFirst = '', bodyClass = '' }) {
  const url = SITE + path;
  const img = ogImage || SITE + '/img/og-badgolf.jpg';
  const ld = jsonld.length ? `<script type="application/ld+json">${JSON.stringify(jsonld.length === 1 ? jsonld[0] : jsonld)}</script>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
${headFirst}<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${attr(description)}">
<link rel="canonical" href="${url}">
${noindex ? '<meta name="robots" content="noindex,follow">' : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Bad Golf App">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${attr(title)}">
<meta name="twitter:description" content="${attr(description)}">
<meta name="twitter:image" content="${img}">
<meta name="theme-color" content="#185fa5">
<meta name="apple-itunes-app" content="app-id=6779399027">
<link rel="icon" type="image/png" sizes="32x32" href="/img/favicon-32.png">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&display=swap">
<link rel="stylesheet" href="/site.css">
${ld}
${extraHead}
</head>
<body class="${bodyClass}">
<header class="top"><div class="wrap">
  <a class="brand" href="/"><img src="/img/bg-logo-96.png" alt="Bad Golf App logo" width="40" height="40">Bad Golf App</a>
  <nav class="main" aria-label="Main">
    <a href="/features/">Features</a>
    <a href="/games/">Games</a>
    <a href="/courses/">Courses</a>
    <a href="/leagues/">Leagues</a>
    <a class="cta" href="/download/">Get the app</a>
  </nav>
</div></header>
<main>
${body}
</main>
<footer><div class="wrap">
  <div class="cols">
    <div>
      <a class="brand" href="/"><img src="/img/bg-logo-96.png" alt="" width="40" height="40">Bad Golf App</a>
      <p style="margin-top:12px;max-width:26rem">The golf app for your regular group: one shared live scorecard, GPS yardages, real handicaps and every side game you already play, scored automatically. ${esc(TAGLINE)}.</p>
      ${storeButtons()}
    </div>
    <div><h4>App</h4><a href="/features/">Features</a><a href="/download/">Download</a><a href="/games/">Games explained</a><a href="/leagues/">Leagues</a><a href="/tournaments/">Tournaments</a><a href="/handicaps/">Handicaps</a></div>
    <div><h4>Courses</h4><a href="/courses/">Find a course</a><a href="/courses/tx/">Texas</a><a href="/courses/fl/">Florida</a><a href="/courses/ca/">California</a><a href="/courses/mi/">Michigan</a><a href="/courses/ny/">New York</a></div>
    <div><h4>Help</h4><a href="/support.html">Support</a><a href="mailto:${SUPPORT}">${SUPPORT}</a><a href="/Bad_Golf_Player_Guide.pdf">Player guide (PDF)</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="/delete-account.html">Delete account</a></div>
  </div>
  <div class="fine"><span>© ${new Date().getFullYear()} Bad Golf App. All rights reserved.</span><span>Already have the app? <a href="/app/" style="display:inline;padding:0">Open the web version</a></span></div>
</div></footer>
</body>
</html>`;
}

export const breadcrumbLd = items => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: SITE + it.path }))
});
export const crumbs = items => `<div class="crumbs">${items.map((it, i) => i < items.length - 1 ? `<a href="${it.path}">${esc(it.name)}</a><span>›</span>` : `<strong>${esc(it.name)}</strong>`).join('')}</div>`;

export const appLd = {
  '@context': 'https://schema.org', '@type': 'MobileApplication', name: 'Bad Golf App',
  operatingSystem: 'iOS, Android', applicationCategory: 'SportsApplication',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  description: 'Golf scorecard, GPS rangefinder, handicap tracker and side-game scorer for your regular golf group. Leagues, tournaments and thousands of U.S. courses.',
  url: SITE, image: SITE + '/img/icon-512.jpg', installUrl: [APPSTORE, PLAY],
  author: { '@type': 'Organization', name: 'Bad Golf App', url: SITE }
};
export const orgLd = { '@context': 'https://schema.org', '@type': 'Organization', name: 'Bad Golf App', url: SITE, logo: SITE + '/img/icon-512.jpg', email: SUPPORT, slogan: TAGLINE };

export const ctaBox = (h, p, href = '/download/', label = 'Get Bad Golf App free') => `
<div class="cta-box"><div><h3>${esc(h)}</h3><p>${esc(p)}</p></div><a class="btn btn-gold" href="${href}">${esc(label)}</a></div>`;
