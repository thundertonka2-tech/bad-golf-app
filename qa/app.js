// Load the ENTIRE Bad Golf app script into a sandboxed VM context and hand back its
// functions. No extraction, no transcription — this is literally the code the phones run.
//
// Why this works even though the script expects a browser: JS hoists every `function`
// declaration in a script before ANY statement runs. So even when top-level init throws on
// a missing DOM API, every game engine is already defined. We append a small epilogue INSIDE
// the same script so it shares the script's lexical scope and can therefore reassign the
// `let supa` / `saveGame` bindings that outside code could never reach.
'use strict';
const fs = require('fs');
const vm = require('vm');

function mainScript(htmlPath) {
  const s = fs.readFileSync(htmlPath, 'utf8');
  const blocks = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>/g;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const end = s.indexOf('</script>', start);
    if (end > -1) blocks.push([end - start, s.slice(start, end)]);
  }
  blocks.sort((a, b) => b[0] - a[0]);
  return blocks[0][1];
}

function makeStubDom() {
  const noop = () => {};
  const el = () => ({
    style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    children: [], childNodes: [], value: '', textContent: '', innerHTML: '',
    appendChild: noop, removeChild: noop, insertBefore: noop, remove: noop,
    addEventListener: noop, removeEventListener: noop, setAttribute: noop,
    getAttribute: () => null, removeAttribute: noop, querySelector: () => null,
    querySelectorAll: () => [], closest: () => null, matches: () => false,
    focus: noop, blur: noop, click: noop, scrollIntoView: noop,
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }),
    offsetParent: null, parentNode: null,
  });
  const doc = {
    documentElement: el(), body: Object.assign(el(), { classList: { add: noop, remove: noop, contains: () => false } }),
    head: el(), createElement: el, createElementNS: el, createTextNode: () => ({}),
    getElementById: () => el(), querySelector: () => el(), querySelectorAll: () => [],
    getElementsByClassName: () => [], getElementsByTagName: () => [],
    addEventListener: noop, removeEventListener: noop, cookie: '',
    readyState: 'complete', activeElement: null, hidden: false,
  };
  const store = {};
  const ls = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }, clear: () => { for (const k in store) delete store[k]; },
    key: i => Object.keys(store)[i] || null, get length() { return Object.keys(store).length; },
  };
  return { doc, ls };
}

function loadApp(htmlPath) {
  const { doc, ls } = makeStubDom();
  const noop = () => {};
  const sandbox = {
    console, JSON, Math, Date, Set, Map, WeakMap, WeakSet, Promise, Array, Object, String,
    Number, Boolean, RegExp, Error, TypeError, Symbol, BigInt, Intl, URL, URLSearchParams,
    isFinite, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: cb => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout,
    document: doc, localStorage: ls, sessionStorage: ls,
    navigator: { userAgent: 'node-qa', onLine: true, language: 'en-US', clipboard: {}, share: undefined },
    location: { href: 'https://qa.local/golf-app.html', search: '', hash: '', protocol: 'https:', reload: noop },
    history: { pushState: noop, replaceState: noop, back: noop },
    fetch: () => Promise.reject(new Error('network disabled in QA')),
    alert: noop, confirm: () => true, prompt: () => null,
    matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
    visualViewport: undefined, screen: { width: 390, height: 844 },
    devicePixelRatio: 2, innerWidth: 390, innerHeight: 844,
    addEventListener: noop, removeEventListener: noop,
    performance: { now: () => Date.now() },
    crypto: { getRandomValues: a => { for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 256) | 0; return a; }, randomUUID: () => 'x' },
    supabase: { createClient: () => null },
    maplibregl: { Map: function () { return { on: noop, remove: noop, flyTo: noop, getZoom: () => 16 }; }, Marker: function () { return { setLngLat() { return this; }, addTo() { return this; }, remove: noop }; } },
    Capacitor: undefined, structuredClone: o => JSON.parse(JSON.stringify(o)),
    TextEncoder, TextDecoder, btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  // The epilogue lives INSIDE the app script, so it shares the script's lexical scope and can
  // rebind `let supa` / the persistence functions that outside code cannot reach.
  const EPILOGUE = `
function __qaInstall(fake) {
  supa = fake.supa; supaOnline = true; supaReady = true;
  initSupabase = async function () { return supa; };
  saveGame = async function (g) { if (fake.onSave) fake.onSave(g); return true; };
  loadGame = async function (code) { return fake.loadGame(code); };
  getPlayerRoster = async function () { return fake.roster(); };
  getSharedTombstones = async function () { return { players: new Set(), rounds: new Map() }; };
  getMeName = async function () { return fake.meName(); };
  showToast = function () {};
  try { isSignedIn = function () { return true; }; } catch (e) {}
  return true;
}
function __qaFn(name) { try { return eval(name); } catch (e) { return undefined; } }
function __qaState() { return state; }
`;
  const code = mainScript(htmlPath) + '\n' + EPILOGUE;
  const ctx = vm.createContext(sandbox);
  let bootError = null;
  try {
    vm.runInContext(code, ctx, { filename: 'golf-app.js', timeout: 120000 });
  } catch (e) {
    bootError = e;   // expected: top-level init touches the DOM. Functions are already hoisted.
  }
  const qa = {
    install: sandbox.__qaInstall,
    fn: sandbox.__qaFn,
    state: sandbox.__qaState,
  };
  return { ctx, qa, bootError };
}

module.exports = { loadApp, mainScript };
