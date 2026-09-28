// Loads main.js into a vm sandbox with an inert DOM and exposes the engine functions.
const fs = require('fs'), vm = require('vm'), path = require('path');
const SRC = path.join(__dirname, '..', 'main.js');

function inertElement() {
  const el = {};
  const handler = {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (k === 'then') return undefined;
      if (k === 'style' || k === 'dataset' || k === 'classList') return k === 'classList' ? { add(){}, remove(){}, toggle(){}, contains(){ return false; } } : new Proxy({}, { get: () => '', set: () => true });
      if (k === 'children' || k === 'childNodes' || k === 'options') return [];
      if (k === 'value' || k === 'textContent' || k === 'innerHTML' || k === 'innerText' || k === 'id' || k === 'className') return t[k] !== undefined ? t[k] : '';
      if (k === 'checked' || k === 'disabled' || k === 'hidden') return t[k] !== undefined ? t[k] : false;
      if (k in t) return t[k];
      if (typeof k === 'string' && /^(get|query|create|append|insert|remove|set|add|focus|blur|click|scroll|close|show|has|toggle|contains|matches|closest|dispatch|attach|replace|before|after|prepend|select|request|play|pause|load|reset|submit)/.test(k)) {
        return (...a) => (k === 'querySelectorAll' || k === 'getElementsByClassName' || k === 'getElementsByTagName') ? [] : (k === 'querySelector' || k === 'closest' ? null : inertElement());
      }
      if (typeof k === 'string' && /^(on|is)/.test(k)) return t[k] !== undefined ? t[k] : (k.startsWith('is') ? false : null);
      return t[k] !== undefined ? t[k] : (k === 'parentNode' || k === 'parentElement' || k === 'firstChild' || k === 'nextSibling' ? null : 0);
    },
    set(t, k, v) { t[k] = v; return true; },
    has() { return true; }
  };
  return new Proxy(el, handler);
}

function makeStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: k => { m.delete(String(k)); },
    key: i => Array.from(m.keys())[i] || null,
    clear: () => m.clear(),
    get length() { return m.size; }
  };
}

function load() {
  const src = fs.readFileSync(SRC, 'utf8');
  const noop = () => {};
  const timers = { setTimeout: () => 0, setInterval: () => 0, clearTimeout: noop, clearInterval: noop, requestAnimationFrame: () => 0, cancelAnimationFrame: noop, queueMicrotask: noop };
  const doc = inertElement();
  doc.body = inertElement(); doc.head = inertElement(); doc.documentElement = inertElement();
  doc.readyState = 'complete'; doc.cookie = ''; doc.title = ''; doc.hidden = false; doc.visibilityState = 'visible';
  doc.getElementById = () => inertElement();
  doc.querySelector = () => null; doc.querySelectorAll = () => [];
  doc.createElement = () => inertElement(); doc.createTextNode = () => inertElement(); doc.createDocumentFragment = () => inertElement();
  doc.addEventListener = noop; doc.removeEventListener = noop; doc.dispatchEvent = noop;
  const ls = makeStorage(), ss = makeStorage();
  const win = {};
  const ctx = {
    console, Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, TypeError, RangeError, Map, Set, WeakMap, WeakSet, Promise, Symbol, Proxy, Reflect, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, encodeURI, decodeURI, escape, unescape, Intl, Uint8Array, ArrayBuffer, DataView, Float64Array, Int32Array, TextEncoder, TextDecoder, structuredClone: (x) => JSON.parse(JSON.stringify(x)),
    ...timers,
    document: doc,
    localStorage: ls, sessionStorage: ss,
    navigator: { userAgent: 'node-test', onLine: true, language: 'en-US', platform: 'test', geolocation: { getCurrentPosition: noop, watchPosition: () => 0, clearWatch: noop }, serviceWorker: undefined, clipboard: { writeText: () => Promise.resolve() }, share: undefined, vibrate: noop, maxTouchPoints: 0, standalone: false },
    location: { search: '', hash: '', href: 'https://officialbadgolf.com/app/', pathname: '/app/', origin: 'https://officialbadgolf.com', host: 'officialbadgolf.com', hostname: 'officialbadgolf.com', protocol: 'https:', reload: noop, replace: noop, assign: noop },
    history: { replaceState: noop, pushState: noop, back: noop, state: null },
    fetch: () => Promise.reject(new Error('no network in test')),
    WebSocket: function () { return inertElement(); },
    XMLHttpRequest: function () { return inertElement(); },
    Image: function () { return inertElement(); },
    Audio: function () { return inertElement(); },
    FileReader: function () { return inertElement(); },
    Blob: function () {}, File: function () {}, URL: { createObjectURL: () => '', revokeObjectURL: noop },
    URLSearchParams: URLSearchParams,
    MutationObserver: function () { return { observe: noop, disconnect: noop }; },
    IntersectionObserver: function () { return { observe: noop, disconnect: noop, unobserve: noop }; },
    ResizeObserver: function () { return { observe: noop, disconnect: noop, unobserve: noop }; },
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
    getComputedStyle: () => new Proxy({}, { get: () => '' }),
    alert: noop, confirm: () => true, prompt: () => null,
    crypto: require('crypto').webcrypto,
    performance: { now: () => Date.now() },
    screen: { width: 390, height: 844 },
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 2, scrollY: 0, scrollX: 0, scrollTo: noop, scroll: noop,
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop, open: noop, close: noop, print: noop, focus: noop, blur: noop,
    supabase: { createClient: () => null },
    Capacitor: undefined,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'), btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    CustomEvent: function (t, o) { this.type = t; this.detail = o && o.detail; }, Event: function (t) { this.type = t; },
    indexedDB: undefined, caches: undefined, Notification: undefined,
    self: null, globalThis: null, top: null, parent: null, frames: [],
    __errors: []
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; ctx.top = ctx; ctx.parent = ctx;
  vm.createContext(ctx);
  try {
    vm.runInContext(src, ctx, { filename: 'main.js', displayErrors: true });
  } catch (e) {
    console.error('BOOT ERROR (script threw at top level): ' + (e && e.stack || e).toString().split('\n').slice(0, 6).join('\n'));
    throw e;
  }
  return ctx;
}
module.exports = { load };
if (require.main === module) {
  const ctx = load();
  const names = ['calcSkins','calcNassau','calcVegas','strokesOnHole','computeAllGameMoney','bgSettleNets','getParticipants','vegasSegmentPlan','settleMatch','bgTeamCardRows','bgFillBlankPutts','calcHammer','calcHotPotato'];
  console.log(names.map(n => n + ':' + typeof ctx[n]).join(' '));
}
