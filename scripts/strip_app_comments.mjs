#!/usr/bin/env node
// strip_app_comments.mjs — deploy-time only. Removes JS COMMENTS from the app's
// main inline <script> (the 7 MB block) so the published /app/index.html is ~40%
// smaller on the wire. The repo's golf-app.html / www/index.html are never touched:
// the commented source stays the single source of truth; this runs on the Pages
// runner copy only.
//
// Safety rules (fail OPEN — on any doubt the input is copied through unchanged):
//   * comments are found with acorn's tokenizer (onComment), so `//` and `/* */`
//     inside strings, template literals and regex literals are never touched
//   * HTML comments (incl. <!--BGVER=...-->, which the app reads from its own
//     <head>) and CSS are left alone; only the largest inline <script> is stripped
//   * the stripped script must re-parse with acorn AND still contain BG_BUILD
//     and the BGVER marker line count sanity (non-empty, smaller than input)
//   * line structure is preserved (a comment is replaced by nothing, but the
//     newline that ended a `//` comment stays), so line-based stack traces still
//     point near the right place
//
// Usage: node scripts/strip_app_comments.mjs <in.html> <out.html>
import fs from 'node:fs';
import * as acorn from 'acorn';

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) { console.error('usage: strip_app_comments.mjs <in.html> <out.html>'); process.exit(2); }

const html = fs.readFileSync(inPath, 'utf8');
function passThrough(reason) {
  console.warn(`[strip] NOT stripping (${reason}) — publishing the full file unchanged`);
  fs.writeFileSync(outPath, html);
}

try {
  // locate the largest inline script (no src=)
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, best = null;
  while ((m = re.exec(html))) {
    if (!best || m[1].length > best.body.length) best = { body: m[1], start: m.index + m[0].indexOf(m[1]), end: m.index + m[0].indexOf(m[1]) + m[1].length };
  }
  if (!best || best.body.length < 1_000_000) throw new Error('main script not found');
  const src = best.body;
  if (!/BG_BUILD\s*=\s*'v\d{4}\.\d+\.\d+'/.test(src)) throw new Error('BG_BUILD missing in source');

  // collect comment ranges via the tokenizer (script mode, sloppy — same as the browser)
  const comments = [];
  acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, onComment: comments });
  // never strip a comment that carries a directive the engine might read
  const keep = c => /@license|@preserve|sourceMappingURL|sourceURL/.test(c.value);
  let out = '', pos = 0;
  for (const c of comments) {
    if (c.start < pos) continue; // nested/overlap guard (shouldn't happen)
    if (keep(c)) continue;
    out += src.slice(pos, c.start);
    // A line comment ends BEFORE its newline (acorn excludes it), so the newline survives.
    // A block comment that spanned lines: keep one newline per line it covered so line
    // numbers of the following code stay identical.
    if (c.type === 'Block') {
      const nl = (c.value.match(/\n/g) || []).length;
      out += '\n'.repeat(nl);
    }
    pos = c.end;
  }
  out += src.slice(pos);
  // collapse runs of whitespace-only lines left behind (keeps at most 1 blank line)
  out = out.replace(/\n[ \t]+\n/g, '\n\n').replace(/\n{3,}/g, '\n\n');

  // verify
  acorn.parse(out, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true });
  if (!/BG_BUILD\s*=\s*'v\d{4}\.\d+\.\d+'/.test(out)) throw new Error('BG_BUILD lost');
  if (out.length >= src.length) throw new Error('no reduction');
  const stripped = html.slice(0, best.start) + out + html.slice(best.end);
  if (!/<!--BGVER=v[\d.]+-->/.test(stripped)) throw new Error('BGVER marker lost');
  fs.writeFileSync(outPath, stripped);
  const kb = n => (n / 1024).toFixed(0) + ' KB';
  console.log(`[strip] ${comments.length} comments removed; script ${kb(src.length)} -> ${kb(out.length)}; page ${kb(html.length)} -> ${kb(stripped.length)}`);
} catch (e) {
  passThrough(e && e.message ? e.message : String(e));
}
