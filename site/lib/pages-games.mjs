import fs from 'node:fs';
import { page, esc, ctaBox, breadcrumbLd, crumbs, SITE } from './layout.mjs';
import { GAMES } from '../content/games-meta.mjs';

const RAW = JSON.parse(fs.readFileSync(new URL('../content/games.json', import.meta.url)));
const bySection = sec => RAW.filter(g => g.section === sec);

// The 42 game pages: "Main games" + "Side games" sections of the in-app reference.
export function gameList() {
  return [...bySection('Main games'), ...bySection('Side games')].map(g => {
    const m = GAMES[g.slug] || {};
    return { ...g, name: m.name || g.name, emoji: m.emoji || g.emoji, search: m.search || '', players: m.players || '', intro: m.intro || '', side: g.section === 'Side games' };
  });
}

const stripTags = h => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const firstPara = html => { const m = html.match(/<p>\s*<strong>How it works:<\/strong>\s*([\s\S]*?)<\/p>/); return m ? stripTags(m[1]) : stripTags(html).slice(0, 220); };

export function gamePage(g, all) {
  const path = `/games/${g.slug}/`;
  const kind = g.side ? 'side game' : 'golf game';
  const title = `${g.name} — Golf Game Rules & How to Score It | Bad Golf`;
  const desc = `How to play ${g.name} in golf: rules, scoring, an example and setup options. ${g.players ? 'Best with ' + g.players + '. ' : ''}Bad Golf scores ${g.name} automatically for your group.`.slice(0, 300);
  const pool = all.filter(x => x.side === g.side); const at = pool.findIndex(x => x.slug === g.slug);
  const rel = Array.from({ length: Math.min(6, pool.length - 1) }, (_, i) => pool[(at + 1 + i) % pool.length]);
  const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
    { '@type': 'Question', name: `How does ${g.name} work in golf?`, acceptedAnswer: { '@type': 'Answer', text: firstPara(g.html) } },
    { '@type': 'Question', name: `How many players do you need for ${g.name}?`, acceptedAnswer: { '@type': 'Answer', text: g.players ? `${g.name} works best with ${g.players}.` : `${g.name} works with any number of players.` } },
    { '@type': 'Question', name: `Is there an app that scores ${g.name}?`, acceptedAnswer: { '@type': 'Answer', text: `Yes. Bad Golf is a free golf app for iPhone and Android that scores ${g.name} and 40+ other games automatically on a shared live scorecard.` } }
  ] };
  const body = `<section class="page"><div class="wrap">
  ${crumbs([{ name: 'Home', path: '/' }, { name: 'Games', path: '/games/' }, { name: g.name, path }])}
  <h1>${g.emoji ? g.emoji + ' ' : ''}${esc(g.name)}</h1>
  <p>${g.players ? `<span class="badge">${esc(g.players)}</span>` : ''}<span class="badge ${g.side ? 'gold' : 'green'}">${g.side ? 'Side game' : 'Main game'}</span>${g.qualifier ? `<span class="badge">${esc(g.qualifier)}</span>` : ''}</p>
  ${g.intro ? `<p class="lede">${esc(g.intro)}</p>` : ''}
  <div class="prose">
    <h2>How ${esc(g.name)} works</h2>
    ${g.html}
  </div>
  ${ctaBox(`Score ${g.name} automatically`, `Bad Golf keeps the ${g.name} tally for your whole group on one live scorecard. Free on iPhone and Android.`)}
  <div class="related"><h2>More ${g.side ? 'side games' : 'games'}</h2><div class="chips">${rel.map(r => `<a class="chip" href="/games/${r.slug}/">${r.emoji ? r.emoji + ' ' : ''}${esc(r.name)}</a>`).join('')}<a class="chip more" href="/games/">All games</a></div></div>
</div></section>`;
  return page({ path, title, description: desc, body, jsonld: [breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Games', path: '/games/' }, { name: g.name, path }]), faq] });
}

export function gamesIndex(all) {
  const main = all.filter(g => !g.side), side = all.filter(g => g.side);
  const card = g => `<a href="/games/${g.slug}/"><span class="em">${g.emoji || '⛳'}</span><span><b>${esc(g.name)}</b><small>${esc(g.players || '')}</small></span></a>`;
  const body = `<section class="page wide"><div class="wrap">
  ${crumbs([{ name: 'Home', path: '/' }, { name: 'Games', path: '/games/' }])}
  <h1>Golf games and side games, explained</h1>
  <p class="lede" style="max-width:46rem">Rules, scoring and an example for every game Bad Golf can score: ${main.length} main games and ${side.length} side games and junk. Pick them when you set up a round and the app keeps every tally in units.</p>
  <h2 style="margin-top:32px">Main games</h2>
  <div class="gamegrid">${main.map(card).join('')}</div>
  <h2 style="margin-top:36px">Side games &amp; junk</h2>
  <div class="gamegrid">${side.map(card).join('')}</div>
  ${ctaBox('Stop keeping score on a napkin', 'Bad Golf scores every one of these on a shared live card. Free on iPhone and Android.')}
</div></section>`;
  return page({ path: '/games/', title: `${all.length} Golf Games & Side Games — Rules and Scoring | Bad Golf`, description: `Rules and scoring for ${all.length} golf games your group plays: Skins, Nassau, Wolf, Vegas, Banker, Stableford, Quota, Hammer, Bingo Bango Bongo, greenies, sandies, snake and more. All scored automatically in the free Bad Golf app.`, body, jsonld: [breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Games', path: '/games/' }])] });
}

// Long-form pages built from the other reference sections (Leagues, Tournaments, Handicaps).
function sectionPage({ path, sections, title, h1, lede, description, cta }) {
  const parts = sections.flatMap(s => bySection(s));
  const body = `<section class="page"><div class="wrap">
  ${crumbs([{ name: 'Home', path: '/' }, { name: h1, path }])}
  <h1>${esc(h1)}</h1>
  <p class="lede">${lede}</p>
  <div class="prose">${parts.map(p => `<h2>${p.emoji ? p.emoji + ' ' : ''}${esc(p.name)}</h2>${p.html}`).join('')}</div>
  ${ctaBox(cta[0], cta[1])}
</div></section>`;
  return page({ path, title, description, body, jsonld: [breadcrumbLd([{ name: 'Home', path: '/' }, { name: h1, path }])] });
}

export const leaguesPage = () => sectionPage({
  path: '/leagues/', sections: ['Leagues'],
  title: 'Golf League App — Run Your Weekly League in Bad Golf',
  h1: 'Run your golf league in Bad Golf',
  lede: 'A golf league app for the commissioner who is tired of the spreadsheet. Create a season, invite the players, and Bad Golf builds the weekly matchups, flights, handicaps, standings, side games and playoffs. Everyone scores on their own phone; the standings update as the cards come in.',
  description: 'Free golf league app: schedules, matchups, flights, league handicaps, weekly scorecards, standings, prize pools and playoffs, all run from your phone. Individual, team and scramble leagues.',
  cta: ['Create your league', 'Free in the Bad Golf app on iPhone and Android. Set up a season in five minutes.']
});

export const tournamentsPage = () => sectionPage({
  path: '/tournaments/', sections: ['Tournaments'],
  title: 'Golf Tournament App — Buddies Trips, Member-Guests & Events | Bad Golf',
  h1: 'Run a golf tournament or buddies trip in Bad Golf',
  lede: 'Multi-day events with groups and pairings, tee times, field-wide side games and a live event leaderboard the whole field can watch. Built for buddies trips, member-guests, charity scrambles and the annual grudge match.',
  description: 'Free golf tournament app: multi-day events, pairings and cart groups, tee times, closest-to-the-pin and long-drive across the field, and a live event leaderboard on every phone.',
  cta: ['Set up your event', 'Free in the Bad Golf app. Invite the field by text and let the leaderboard run itself.']
});

export const handicapsPage = () => sectionPage({
  path: '/handicaps/', sections: ['How handicaps work', 'Handicap rules'],
  title: 'How Golf Handicaps Work in Bad Golf — Index, Course Handicap & Strokes',
  h1: 'How handicaps work in Bad Golf',
  lede: 'Bad Golf keeps a handicap index from the rounds you post, turns it into a course handicap for the tees you play, and hands out strokes hole by hole by stroke index. Here is exactly how the math works and the settings your group can change.',
  description: 'How the Bad Golf app calculates your golf handicap index, course handicap per tee, strokes per hole, handicap percentages and temporary handicaps for new players.',
  cta: ['Get a real handicap', 'Post your rounds in Bad Golf and your index updates automatically. Free on iPhone and Android.']
});
