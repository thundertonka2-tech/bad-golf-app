'use strict';
// Shared harness pieces: static server, browser launch, page setup with the fake backend.
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const REPO = path.resolve(__dirname, '..', '..');
const FAKE = fs.readFileSync(path.join(__dirname, 'fake_supabase.js'), 'utf8');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webp': 'image/webp' };

function startServer(port) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let u = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
      if (/\/lib\/supabase\.min\.js$/.test(u)) { res.writeHead(200, { 'content-type': MIME['.js'] }); res.end(FAKE); return; }
      if (u === '/') u = '/golf-app.html';
      const fp = path.join(REPO, u);
      if (!fp.startsWith(REPO)) { res.writeHead(403); res.end(); return; }
      fs.stat(fp, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); res.end('nf'); return; }
        res.writeHead(200, { 'content-type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
        fs.createReadStream(fp).pipe(res);
      });
    });
    srv.listen(port || 0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

async function launch() {
  return puppeteer.launch({
    executablePath: '/usr/bin/google-chrome', headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--use-fake-ui-for-media-stream', '--no-first-run', '--disable-background-networking']
  });
}

// opts: { signedOut, width, height, lsExtra }
async function newPage(browser, base, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  await page.setViewport({ width: opts.width || 390, height: opts.height || 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
  const log = { pageerrors: [], consoleErrors: [], consoleWarns: 0, external: {}, failed: [] };
  page.__log = log;
  page.on('pageerror', e => log.pageerrors.push({ at: page.__ctx || '', msg: String(e && e.message || e), stack: String(e && e.stack || '').split('\n').slice(0, 4).join(' | ') }));
  page.on('console', m => {
    const t = m.type();
    if (t === 'error') log.consoleErrors.push({ at: page.__ctx || '', msg: m.text().slice(0, 400), loc: (m.location() && (m.location().url || '') + ':' + (m.location().lineNumber || '')) });
    else if (t === 'warning') log.consoleWarns++;
  });
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = r.url();
    if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) { r.continue(); return; }
    const ml = u.match(/maplibre-gl@[\d.]+\/dist\/(maplibre-gl\.(js|css))$/);
    if (ml) { try { r.respond({ status: 200, contentType: ml[2] === 'js' ? 'application/javascript' : 'text/css', headers: { 'access-control-allow-origin': '*' }, body: require('fs').readFileSync(require('path').join(REPO, 'www', 'lib', ml[1])) }); } catch (e) { r.abort(); } return; }
    try { const h = new URL(u).host; log.external[h] = (log.external[h] || 0) + 1; } catch (e) {}
    r.abort('blockedbyclient');
  });
  page.on('requestfailed', r => { const u = r.url(); if (u.startsWith(base)) log.failed.push(u.replace(base, '')); });
  await page.evaluateOnNewDocument((signedOut, lsExtra) => {
    try {
      window.__BG_SIGNED_OUT = !!signedOut;
      if (!sessionStorage.getItem('__qa_seeded')) {
        sessionStorage.setItem('__qa_seeded', '1');
        if (!signedOut) {
          localStorage.setItem('golf:has-signed-in', '1');
          localStorage.setItem('golf:me-name', 'IDrive Bombs');
          localStorage.setItem('golf:me-name-uid', '11111111-1111-4111-8111-111111111111');
          localStorage.setItem('golf:auth-uid-last', '11111111-1111-4111-8111-111111111111');
          localStorage.setItem('golf:welcome-seen-v1', '1');
          localStorage.setItem('golf:getstarted-seen-v1', '1');
          localStorage.setItem('golf:pro-badge-seen-v1', '1');
          localStorage.setItem('golf:photo-onboard-seen-v1', '1');
          localStorage.setItem('golf:homecourse-onboard-seen-v1', '1');
          localStorage.setItem('golf:my-home-course', JSON.stringify({ id: 'buffalo-creek', name: 'Buffalo Creek Golf Club', city: 'Heath', st: 'TX' }));
        }
        Object.keys(lsExtra || {}).forEach(k => localStorage.setItem(k, lsExtra[k]));
      }
    } catch (e) {}
    // geolocation: deny quickly (no GPS in harness)
    try {
      const geo = { getCurrentPosition: (ok, err) => setTimeout(() => err && err({ code: 1, message: 'qa: denied' }), 10), watchPosition: (ok, err) => { setTimeout(() => err && err({ code: 1, message: 'qa: denied' }), 10); return 1; }, clearWatch: () => {} };
      Object.defineProperty(navigator, 'geolocation', { get: () => geo, configurable: true });
    } catch (e) {}
    // never block on native dialogs
    window.alert = function (m) { (window.__qaDialogs = window.__qaDialogs || []).push(['alert', String(m)]); };
    window.confirm = function (m) { (window.__qaDialogs = window.__qaDialogs || []).push(['confirm', String(m)]); return false; };
    window.prompt = function (m) { (window.__qaDialogs = window.__qaDialogs || []).push(['prompt', String(m)]); return null; };
    window.open = function (u) { (window.__qaOpened = window.__qaOpened || []).push(String(u)); return null; };
    try { navigator.share = function () { return Promise.reject(new Error('qa: no share')); }; } catch (e) {}
    try { Object.defineProperty(navigator, 'clipboard', { get: () => ({ writeText: () => Promise.resolve(), readText: () => Promise.resolve('') }), configurable: true }); } catch (e) {}
  }, !!opts.signedOut, opts.lsExtra || {});
  return page;
}

async function boot(page, base, file, query) {
  page.__ctx = 'boot';
  await page.goto(base + '/' + (file || 'golf-app.html') + (query || ''), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof window.switchTab === 'function' && document.readyState === 'complete', { timeout: 60000 }).catch(() => {});
  await sleep(2600);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
module.exports = { startServer, launch, newPage, boot, sleep, REPO };
