import { page, storeButtons, esc, appLd, orgLd, APPSTORE, PLAY, APP_URL, SITE, ctaBox, breadcrumbLd, crumbs } from './layout.mjs';

const shot = (name, alt, cls = '') => `
<div class="phone ${cls}"><div class="screen"><picture><source srcset="/img/screens/${name}.webp" type="image/webp"><img src="/img/screens/${name}.jpg" alt="${alt}" width="520" height="1126" loading="${cls ? 'lazy' : 'eager'}"></picture></div></div>`;
const phoneGps = shot('gps', 'Bad Golf App GPS screen: front, middle and back yardages, plays-like distances with club suggestions, wind, and the live Nassau standing on hole 1');
const phoneBoard = shot('home', 'Bad Golf App home screen: handicap index 2.9 trending better, rounds, average score, best round, putts per round, GIR and fairway percentages', 'tilt');
const phoneTourney = shot('tourney', 'Bad Golf App tournament summary: skins, closest to the pin, low net, most greens in regulation and fewest putts prize pools with the winners of each');

const FAQ = [
  ['Is Bad Golf App free?', 'Yes. Bad Golf App is free to download and free to play on iPhone, iPad and Android. Create rounds, invite your group, use GPS and run leagues and tournaments at no cost.'],
  ['How does scoring the games work?', 'Every game is scored in units. Set the units when you create the round, play, and at the end the Unit Totals card shows where everyone finished. Bad Golf App just keeps score.'],
  ['Which golf games can Bad Golf App score?', 'More than 40, including Skins, Nassau, Wolf, Vegas, Banker, Stableford, Quota, Match play, Best ball, Scramble, Ryder Cup, Bingo Bango Bongo, Hammer and side games like greenies, sandies, snake and closest to the pin. Every game has a rules page under Games.'],
  ['How do my friends join a round?', 'Start a round, tap Invite and send the link by text. Friends with the app land straight in the round; friends without it are taken to the download page and then into the round. Everyone scores on their own phone and the card stays in sync.'],
  ['Which courses does Bad Golf App have?', 'Bad Golf App has more than 11,000 courses across the United States with scorecards, tee ratings and slope, and GPS-mapped greens. If your course is missing you can add it inside the app in a couple of minutes.'],
  ['Can Bad Golf App run my golf league?', 'Yes. Create a league season, invite players, and the app builds the schedule, matchups, flights, handicaps, standings and playoffs, week by week.'],
];
const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };

export function home({ courseCount, gameCount, topGames, stateCount }) {
  const body = `
<section class="hero"><div class="wrap">
  <div>
    <span class="kicker">Free on iPhone, iPad &amp; Android</span>
    <h1>The golf app for your regular group.</h1>
    <p class="lead">One shared live scorecard, GPS yardages on every hole, real handicaps and all ${gameCount}+ side games you already play, scored automatically. No napkin math at the 19th hole.</p>
    <div class="actions">${storeButtons()}</div>
    <p class="fine">Bad Golf, Better Times. ${courseCount.toLocaleString()} U.S. courses mapped. No subscription.</p>
  </div>
  <div class="hero-art"><div class="phones">${phoneGps}${phoneBoard}</div></div>
</div></section>

<div class="strip"><div class="wrap">
  <span><b>${(Math.floor(courseCount / 1000) * 1000).toLocaleString()}+</b> courses with scorecards &amp; GPS</span>
  <span><b>${gameCount}+</b> games scored for you</span>
  <span><b>${stateCount}</b> states covered</span>
  <span><b>Free</b> no subscription, no ads</span>
</div></div>

<section class="sec" id="features"><div class="wrap">
  <div class="sec-head"><div class="eyebrow">What it does</div><h2>Everything your Saturday group argues about, handled.</h2><p>Bad Golf App was built for the guys and gals who play together every week and want the games, the handicaps and the bragging rights kept straight without a spreadsheet.</p></div>
  <div class="grid">
    <div class="feat"><div class="ico">📋</div><h3>One live scorecard</h3><p>Everyone scores on their own phone and the card stays in sync across the group in real time. Watch the other cart's birdie land before they brag about it.</p></div>
    <div class="feat"><div class="ico">📍</div><h3>GPS on every hole</h3><p>Front, middle and back yardages on a satellite view, with mapped greens on ${courseCount.toLocaleString()} courses. Lay-up and carry numbers on holes that have them mapped.</p></div>
    <div class="feat"><div class="ico">🐺</div><h3>${gameCount}+ games, scored automatically</h3><p>Skins, Nassau, Wolf, Vegas, Banker, Stableford, Quota, greenies, sandies, snake and more. Set them up once, the app keeps every tally and shows unit totals at the end.</p></div>
    <div class="feat"><div class="ico">📈</div><h3>Real handicaps</h3><p>A handicap index calculated from your posted rounds, applied per tee and per hole by stroke index, with a percentage option for your group's own rules.</p></div>
    <div class="feat"><div class="ico">🏅</div><h3>Leagues that run themselves</h3><p>Create a season, invite the field, and the app builds matchups, flights, weekly cards, standings and playoffs. Commissioners get their Thursdays back.</p></div>
    <div class="feat"><div class="ico">🏆</div><h3>Tournaments &amp; events</h3><p>Member-guest, buddies trip, charity scramble: multi-day events with groups, pairings, field-wide side games and a live event leaderboard.</p></div>
    <div class="feat"><div class="ico">📊</div><h3>Stats and badges</h3><p>Fairways, greens, putts, scoring trends and 75 badges for the bad shots and the great ones. Yes, there is one for the snowman.</p></div>
    <div class="feat dark"><div class="ico">⌚</div><h3>Apple Watch yardages</h3><p>Glance at your wrist for the number to the green and enter scores without taking out your phone.</p></div>
  </div>
</div></section>

<section class="sec alt" id="games"><div class="wrap">
  <div class="sec-head"><div class="eyebrow">Games</div><h2>Every game your group already plays.</h2><p>Pick the games when you set up the round. Bad Golf App tracks presses, carry-overs, multipliers and points hole by hole, then shows everyone's unit totals at the end.</p></div>
  <div class="chips">${topGames.map(g => `<a class="chip" href="/games/${g.slug}/">${g.emoji ? g.emoji + ' ' : ''}${esc(g.name)}</a>`).join('')}<a class="chip more" href="/games/">All ${gameCount} games →</a></div>
</div></section>

<section class="sec" id="leagues"><div class="wrap split">
  <div>
    <div class="eyebrow" style="color:var(--brand);font-weight:800;text-transform:uppercase;letter-spacing:.08em;font-size:.8rem;margin-bottom:8px">Leagues</div>
    <h2>Run your league night in Bad Golf App.</h2>
    <p class="lede">Weekly leagues are where scorekeeping goes to die. Bad Golf App takes the whole job: the schedule, the sub, the guy who missed week four, the playoff bracket.</p>
    <ul class="check">
      <li>Individual, team and scramble seasons with flights</li>
      <li>Automatic matchups, weekly cards and standings</li>
      <li>League handicaps that update every week</li>
      <li>Side games for the whole field, every week</li>
      <li>Playoffs, absences and subs handled</li>
    </ul>
    <a class="btn btn-primary" href="/leagues/">How leagues work</a>
  </div>
  <div class="phone" aria-hidden="true" style="margin:0 auto"><div class="screen"><div class="card-ui" style="padding-top:18px">
    <div class="hdr">Thursday Night League · Week 7</div>
    <table><tr><th>Flight A</th><th>W</th><th>L</th><th>Pts</th></tr><tr><td>Sandbaggers</td><td>5</td><td>1</td><td>41.5</td></tr><tr><td>Mulligan Men</td><td>4</td><td>2</td><td>38</td></tr><tr><td>Fore Play</td><td>3</td><td>3</td><td>33</td></tr><tr><td>The Shanks</td><td>1</td><td>5</td><td>21.5</td></tr></table>
    <div class="hdr" style="margin-top:12px">This week's matchups</div>
    <table><tr><th>Tee</th><th>Match</th><th>Status</th></tr><tr><td>5:40</td><td>Sandbaggers v Shanks</td><td style="color:#177a31">2 up · 14</td></tr><tr><td>5:48</td><td>Mulligan v Fore Play</td><td style="color:#0c447c">AS · 12</td></tr><tr><td>5:56</td><td>Hackers v Duffers</td><td style="color:#c0392b">1 dn · 11</td></tr><tr><td>6:04</td><td>Bogeymen v Yips</td><td>Not started</td></tr></table>
    <div class="pill">Week 6 skins <span>Josh +3 units</span></div>
    <div class="pill">League handicaps <span style="color:#0c447c">Updated Thu</span></div>
    <div class="pill">Playoffs in 3 weeks <span style="color:#0c447c">Top 4 qualify</span></div>
    <div class="pill" style="background:#fdf3d5;color:#8a5710">Sub needed · Week 8 <span>2 open</span></div></div></div></div>
</div></section>

<section class="sec alt" id="tournaments"><div class="wrap split">
  <div style="order:1;display:flex;justify-content:center">${phoneTourney}</div>
  <div style="order:2">
    <div class="eyebrow" style="color:var(--brand);font-weight:800;text-transform:uppercase;letter-spacing:.08em;font-size:.8rem;margin-bottom:8px">Tournaments &amp; events</div>
    <h2>The buddies trip, the member-guest, the charity scramble.</h2>
    <p class="lede">Build a multi-day event in minutes and let the field score itself. Every cart group plays on its own live card while the event leaderboard and the field-wide side games update on everyone's phone.</p>
    <ul class="check">
      <li>Team cup or individual formats, one day or a whole weekend</li>
      <li>Automatic groups, pairings, tee times and scorekeepers</li>
      <li>Field-wide skins, closest to the pin, long drive, low net, most GIRs and fewest putts</li>
      <li>A live event leaderboard the whole field can watch</li>
      <li>One Tournament Summary at the end, with a tap to text the final standings</li>
    </ul>
    <a class="btn btn-primary" href="/tournaments/">How tournaments work</a>
  </div>
</div></section>

<section class="sec alt" id="courses"><div class="wrap">
  <div class="sec-head"><div class="eyebrow">Courses</div><h2>${courseCount.toLocaleString()} courses, scorecards included.</h2><p>Every course in Bad Golf App comes with its scorecard, tee ratings and slope, and GPS-mapped greens. Look up your home course before you download.</p></div>
  <div class="search" id="course-search"><label class="sr" for="cs">Search courses</label><input id="cs" type="search" placeholder="Search a course or city…" autocomplete="off"><div class="results"></div></div>
  <p style="margin-top:16px"><a href="/courses/">Browse courses by state →</a></p>
</div></section>

<section class="sec" id="download"><div class="wrap">
  <div class="dl">
    <div>
      <h2>Get Bad Golf. It's free.</h2>
      <p>Download it, add your group, and your next round scores itself. Scan the code with your phone camera or tap a store button.</p>
      ${storeButtons()}
      <p style="margin-top:18px;font-size:.9rem">Already have it? <a href="${APP_URL}" style="color:#fff;text-decoration:underline">Open the web version</a>.</p>
    </div>
    <div class="qr"><img src="/img/qr-get.svg" alt="QR code linking to the Bad Golf App download page" width="170" height="170"><b>Scan to download</b><small>officialbadgolf.com/get</small></div>
  </div>
</div></section>

<section class="sec alt" id="faq"><div class="wrap">
  <div class="sec-head"><div class="eyebrow">FAQ</div><h2>Questions from the first tee.</h2></div>
  <div class="grid">${FAQ.map(([q, a]) => `<div class="feat"><h3>${esc(q)}</h3><p>${esc(a)}</p></div>`).join('')}</div>
</div></section>`;
  // Legacy-link forwarder. Until v1686 the app lived at the bare root, so invite
  // links already in people's texts look like officialbadgolf.com/?join=CODE, and
  // Tyler's admin/import links use ?contactimport=ST etc. Anything carrying one of
  // the app's query keys (or a maintenance key in the hash) is sent straight to
  // /app/ with the query intact, before the marketing page paints. Plain visits
  // (and utm-tagged ones) stay here.
  const forwarder = `<script>(function(){try{var q=location.search||'',h=location.hash||'';var re=/[?&#](join|lg|lgs|tclaim|tjoin|claim|tt|cal|p|courseimport|courseoverride|courseremove|stateimport|osmimport|sweepimport|gpsimport|nextstate|coursecheck|coursegaps|courselist|contactimport|coursecleanup|multinine|dupcleanup|mergeplayer|cleanup|statsreset|statecheck|statefill)=/;if(re.test(q)||re.test(h)){location.replace('/app/'+q+h);}}catch(e){}})();</script>\n`;
  return page({
    headFirst: forwarder,
    path: '/', title: 'Bad Golf App — Golf Scorecard, GPS & Side Games for Your Group', h1: '',
    description: `Free golf app for your regular group: one shared live scorecard, GPS yardages, real handicaps, leagues, tournaments and ${gameCount}+ side games scored automatically. ${courseCount.toLocaleString()} U.S. courses. iPhone & Android.`,
    body, jsonld: [appLd, orgLd, faqLd], extraHead: `<script defer src="/course-search.js"></script>`
  });
}

export function features({ courseCount, gameCount }) {
  const rows = [
    ['📋', 'Shared live scorecard', 'Start a round, invite the group by text, and everyone enters scores on their own phone. The card syncs across the group in real time, including guests without an account. Track putts, fairways, greens and penalties if you want the stats, or just the score if you don\'t.'],
    ['📍', 'GPS rangefinder', `Satellite view of the hole with front, middle and back yardages to the green, plus lay-up and carry numbers on holes that have them mapped. Greens are mapped on ${courseCount.toLocaleString()} courses, and you can map a missing course yourself from the app.`],
    ['🐺', `${gameCount}+ games and side games`, 'Main games like Skins, Nassau (with Huckle presses), Wolf, Vegas, Banker, Hammer, Stableford, Quota, Match play, Team match play, Best ball, Combo Score, Ryder Cup, Scramble, Split Sixes, Niners, Bingo Bango Bongo, Umbrella and Pot of Gold, plus junk and side pools: greenies, sandies, barkies, rolos, snake, chip-ins, closest to the pin, long putt, long drive, birdie bump and more. Each one is configurable and scored in units.'],
    ['🧾', 'Unit totals, not spreadsheets', 'At the end of the round the Board shows every game, every hole and a per-player unit total. Bad Golf App just keeps score.'],
    ['📈', 'Handicaps', 'A handicap index from your posted rounds, tee-aware course handicaps, strokes applied per hole by stroke index, and a handicap percentage setting for groups that play 80% or 90%. Temporary handicaps for new players until they have enough rounds.'],
    ['🏅', 'Leagues', 'Seasons with weekly matchups, flights, team or individual formats, scramble leagues, absences and subs, league handicaps, standings, prize pools and playoffs. The commissioner runs the week from their phone.'],
    ['🏆', 'Tournaments and events', 'Multi-day events with pairings, cart groups, tee times, field-wide side games (closest to the pin, long drive, low net pool) and an event leaderboard that everyone can watch live.'],
    ['📊', 'Stats and trends', 'Scoring average, best round, greens, fairways, putts per round, scoring mix and a trend line, all from the rounds you actually play.'],
    ['🎖️', '75 badges', 'Earned for the great stuff and the bad stuff: first birdie, sandy save, hero tax, double par, snowman. A badge pops up mid-round when you earn it, if you want it to.'],
    ['⌚', 'Apple Watch', 'Yardages and score entry on your wrist.'],
    ['👥', 'Friends and crew', 'Keep your regular group in one place, see who is playing today, and compare stats head to head.'],
    ['🗺️', 'Course library', `${courseCount.toLocaleString()} U.S. courses with scorecards, tee ratings and slope. Missing one? Add it in the app and map the greens yourself in a few minutes.`],
  ];
  const body = `<section class="page wide"><div class="wrap">
  ${crumbs([{ name: 'Home', path: '/' }, { name: 'Features', path: '/features/' }])}
  <h1>Everything in Bad Golf App</h1>
  <p class="lede" style="max-width:46rem">Built for the group that plays together every week. Free, on iPhone, iPad and Android.</p>
  <div class="grid" style="margin-top:28px">${rows.map(([i, h, p]) => `<div class="feat"><div class="ico">${i}</div><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join('')}</div>
  ${ctaBox('Ready to play?', 'Free download. Invite your group by text and your next round scores itself.')}
</div></section>`;
  return page({ path: '/features/', title: 'Bad Golf App Features — Live Scorecard, GPS, Handicaps, Leagues & Side Games', description: `Every feature in the free Bad Golf App: shared live scorecard, GPS rangefinder, ${gameCount}+ side games scored automatically, handicaps, leagues, tournaments, stats and badges.`, body, jsonld: [breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Features', path: '/features/' }])] });
}

export function download() {
  const body = `<section class="page wide"><div class="wrap">
  ${crumbs([{ name: 'Home', path: '/' }, { name: 'Download', path: '/download/' }])}
  <h1>Download Bad Golf App</h1>
  <p class="lede" style="max-width:44rem">Free on the App Store and Google Play. No subscription, no ads in your round. Scan a code with your phone camera or tap a button.</p>
  <div style="margin:22px 0 10px">${storeButtons()}</div>
  <div class="qr-row">
    <div class="qr"><img src="/img/qr-get.svg" alt="QR code for the Bad Golf App smart download link" width="170" height="170"><b>Any phone</b><small>officialbadgolf.com/get sends iPhones to the App Store and Androids to Google Play</small></div>
    <div class="qr"><img src="/img/qr-appstore.svg" alt="QR code for Bad Golf App on the App Store" width="170" height="170"><b>App Store</b><small>iPhone, iPad and Apple Watch</small></div>
    <div class="qr"><img src="/img/qr-play.svg" alt="QR code for Bad Golf App on Google Play" width="170" height="170"><b>Google Play</b><small>Android phones and tablets</small></div>
  </div>
  <div class="prose" style="margin-top:32px">
    <h2>Printing the code for your clubhouse or league</h2>
    <p>Right-click any QR code above and save it as an image; they are vector files that print sharp at any size. The "Any phone" code points at <strong>officialbadgolf.com/get</strong>, which sends each phone to its own store, so one code works for the whole league sheet.</p>
    <h2>Using Bad Golf App in a browser</h2>
    <p>The full app also runs in a browser at <a href="${APP_URL}">officialbadgolf.com/app</a>. Invite links open the native app when it is installed and fall back to the web version when it is not, so nobody in your group is left out.</p>
    <h2>Need help?</h2>
    <p>Email <a href="mailto:support@officialbadgolf.com">support@officialbadgolf.com</a> or see the <a href="/support.html">support page</a>. The <a href="/Bad_Golf_Player_Guide.pdf">Player Guide</a> walks through every screen.</p>
  </div>
</div></section>`;
  return page({ path: '/download/', title: 'Download Bad Golf App — Free for iPhone & Android', description: 'Get the free Bad Golf App on the App Store or Google Play. QR codes for your clubhouse, league sheet or group chat. Live scorecard, GPS, handicaps and side games.', body, jsonld: [appLd, breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Download', path: '/download/' }])] });
}

// /get/ — one QR code for every phone. Sends iOS to the App Store, Android to Play,
// everything else to the download page. Kept noindex; it is a router, not a page.
export const getRedirect = () => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Get Bad Golf App</title><meta name="robots" content="noindex"><link rel="canonical" href="${SITE}/download/">
<script>(function(){var u=navigator.userAgent||'';var t=/iPhone|iPad|iPod|Macintosh/.test(u)&&!/Android/.test(u)?'${APPSTORE}':(/Android/.test(u)?'${PLAY}':'/download/');location.replace(t);})();</script>
<style>body{font-family:system-ui,sans-serif;text-align:center;padding:60px 20px;color:#14213d}a{color:#185fa5}</style></head>
<body><p>Sending you to the store…</p><p><a href="${APPSTORE}">App Store</a> · <a href="${PLAY}">Google Play</a> · <a href="/download/">All options</a></p></body></html>`;

export function notFound() {
  const body = `<section class="page"><div class="wrap" style="text-align:center;padding-top:40px">
  <img src="/img/bg-logo.png" alt="" width="120" height="120" style="margin:0 auto 20px">
  <h1>Out of bounds.</h1><p class="lede">That page isn't here. Take your drop and try one of these.</p>
  <p><a class="btn btn-primary" href="/">Home</a> &nbsp; <a class="btn btn-outline" href="/courses/">Find a course</a> &nbsp; <a class="btn btn-outline" href="/games/">Games</a></p>
</div></section>`;
  return page({ path: '/404.html', title: 'Page not found — Bad Golf App', description: 'That page is out of bounds.', body, noindex: true });
}
