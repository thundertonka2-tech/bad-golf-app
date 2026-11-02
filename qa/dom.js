// qa/dom.js — jsdom loader for the whole Bad Golf app (read-only on the source).
//
// Used by the DOM-level suites (qa_adjusted_gross_cap, qa_hcp_zero_label,
// qa_scorecard_tab_order, qa_units_par_row, qa_units_stacked_card, qa_v1998_totals_rounding).
// Exposes `w` (the window, with every app function on it), `doc`, `bootErr`, `FILE` and `SRC`,
// plus the stubs the units tests use (supa, _authUser, saveGame, __setGame, __install ...).
//
// It needs jsdom, which is NOT a repo dependency (the app itself has no build step):
//     npm i --no-save jsdom          # once, from the repo root
// Without it every DOM suite exits 2 with a one-line message — that is "skipped", not "passed",
// so the gauntlet loop in qa/README.md treats exit 2 as a failure you have to look at.
//
// The html path comes from (in order) process.argv[2], $BG_HTML, ../golf-app.html.
// qa/app.js (the VM + stub-DOM loader used by the money suites) is the right tool when a test
// only calls engines; use this one when the test has to read what reached the DOM.
'use strict';
const fs = require('fs'), path = require('path');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('qa/dom.js: needs jsdom -> npm i --no-save jsdom   (exit 2 = skipped, not passed)'); process.exit(2); }

const argFile = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : null;
const FILE = path.resolve(argFile || process.env.BG_HTML || path.join(__dirname, '..', 'golf-app.html'));
const SRC = fs.readFileSync(FILE, 'utf8');
function mainScript(str){const b=[];const re=/<script(?![^>]*\bsrc=)[^>]*>/g;let m;
  while((m=re.exec(str))){const a=m.index+m[0].length;const e=str.indexOf('</script>',a);if(e>-1)b.push([e-a,str.slice(a,e)]);}
  b.sort((x,y)=>y[0]-x[0]);return b[0][1];}
// Body markup: keep the real markup so $('running-totals'), #money-board etc exist.
const bodyStart = SRC.indexOf('<body'); const bodyEnd = SRC.lastIndexOf('</body>');
let body = SRC.slice(SRC.indexOf('>', bodyStart) + 1, bodyEnd);
body = body.replace(/<script[\s\S]*?<\/script>/g, '');
const dom = new JSDOM('<!doctype html><html><body>' + body + '</body></html>', { runScripts: 'outside-only', pretendToBeVisual: false, url: 'https://qa.local/golf-app.html' });
const w = dom.window, doc = w.document;
w.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
w.setTimeout = () => 0; w.setInterval = () => 0; w.requestAnimationFrame = () => 0;
w.matchMedia = () => ({ matches: false, addEventListener(){}, addListener(){} });
w.HTMLCanvasElement.prototype.getContext = () => ({ measureText: () => ({ width: 10 }), fillText(){}, fillRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}, scale(){}, arc(){}, fill(){}, save(){}, restore(){}, clip(){}, closePath(){}, drawImage(){}, strokeRect(){}, setLineDash(){}, translate(){}, rotate(){} });
w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
w.scrollTo = () => {};
w.supabase = { createClient: () => null };
// The app's top-level `let supa` / `let _authUser` live inside the eval'd script's own scope,
// not on window, so these stubs are appended to the SAME script (see qa_units_tab.js for why).
const STUBS = `
window.__rec = { saves: [] };
try { _authUser = { id: 'tyler-uid' }; } catch (e) {}
try { getMeName = async () => 'Tyler OConnor'; } catch (e) {}
try { saveGame = async (g) => { window.__rec.saves.push(g); return true; }; } catch (e) {}
try { showToast = function () {}; } catch (e) {}
try { supa = null; supaOnline = false; supaReady = true; initSupabase = async () => null; } catch (e) {}
try { isSignedIn = () => true; } catch (e) {}
window.__state = () => state;
window.__setGame = (g) => { state.game = g; state.viewOnlyMode = false; };
window.__fn = (n) => { try { return eval(n); } catch (e) { return undefined; } };
window.__setEvp = (S) => { _bgEvp = S; };
window.__install = (fake) => {
  supa = fake.supa; supaOnline = true; supaReady = true;
  initSupabase = async function () { return supa; };
  loadGame = async function (code) { return fake.loadGame(code); };
  getPlayerRoster = async function () { return fake.roster(); };
  getSharedTombstones = async function () { return { players: new Set(), rounds: new Map() }; };
  getMeName = async function () { return fake.meName(); };
  try { t2Get = async function (id) { return fake.t2Get(id); }; } catch (e) {}
  try { t2GetPlayers = async function (id) { return fake.players(id); }; } catch (e) {}
  return true;
};
`;
let bootErr = null;
try { w.eval(mainScript(SRC) + '\n;' + STUBS); } catch (e) { bootErr = e; }
module.exports = { w, doc, bootErr, FILE, SRC };
