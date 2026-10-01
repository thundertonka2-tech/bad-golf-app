// v1840 LANGUAGES — translate a push into the RECIPIENT's language.
// The app composes every push in English. Each player's language lives in
// public.profiles.lang (the app writes it). The dictionaries are the same files the
// app uses, served by the website: https://officialbadgolf.com/i18n/<lang>.json
// Same matching as the app (exact -> pattern with {0} holes -> loose). Any failure
// = the English text goes out, exactly as before.
const DICT_BASE = Deno.env.get("BG_I18N_BASE") || "https://officialbadgolf.com/i18n/";
export const PUSH_LANGS = ["es", "ko", "ja", "zh"];

type Compiled = { x: Map<string, string>; idx: Map<string, { re: RegExp; tr: string; order: string[]; lit: number }[]>; loose: Map<string, string> };
const cache: Record<string, { at: number; c: Compiled | null }> = {};
const norm = (s: string) => String(s).replace(/\s+/g, " ").trim();
const EDGE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const core = (s: string) => String(s).replace(EDGE, "");
const HAS_WORD = /[A-Za-z]{2,}/;
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compile(d: any): Compiled {
  const out: Compiled = { x: new Map(), idx: new Map(), loose: new Map() };
  for (const k in (d.x || {})) {
    out.x.set(k, d.x[k]);
    const ck = core(k), ct = core(d.x[k]);
    if (ck && ct && HAS_WORD.test(ck) && !out.loose.has(ck.toLowerCase())) out.loose.set(ck.toLowerCase(), ct);
  }
  for (const [src, tr] of (d.p || [])) {
    const parts = String(src).split(/\{(\d+)\}/);
    let re = "^"; const words: string[] = []; const order: string[] = [];
    parts.forEach((p, i) => {
      if (i % 2 === 0) { re += escRe(p); (p.toLowerCase().match(/[a-z]{2,}/g) || []).forEach((w) => words.push(w)); }
      else { re += "([\\s\\S]*?)"; order.push(p); }
    });
    const lit = parts.filter((_, i) => i % 2 === 0).join("").length;
    const anchor = words.sort((a, b) => b.length - a.length)[0];
    if (!anchor) continue;
    if (!out.idx.has(anchor)) out.idx.set(anchor, []);
    out.idx.get(anchor)!.push({ re: new RegExp(re + "$"), tr, order, lit });
  }
  out.idx.forEach((a) => a.sort((x, y) => y.lit - x.lit));
  return out;
}
async function dict(lang: string): Promise<Compiled | null> {
  const c = cache[lang];
  if (c && Date.now() - c.at < 30 * 60 * 1000) return c.c;
  try {
    const r = await fetch(DICT_BASE + lang + ".json");
    if (!r.ok) throw new Error(String(r.status));
    cache[lang] = { at: Date.now(), c: compile(await r.json()) };
  } catch (e) {
    console.log(`send-push i18n: no ${lang} dictionary (${e}) - sending English`);
    cache[lang] = { at: Date.now(), c: null };
  }
  return cache[lang].c;
}
function value(c: Compiled, v: string, depth = 0): string {
  if (!v || !HAS_WORD.test(v)) return v;
  const k = norm(v);
  const t = c.x.get(k);
  if (t != null) return t;
  const ck = core(k); const lt = ck ? c.loose.get(ck.toLowerCase()) : undefined;
  if (lt != null) { const at = k.indexOf(ck); return k.slice(0, at) + lt + k.slice(at + ck.length); }
  if (!depth) { const r = trLine(c, v, 1); if (r !== v) return (v.match(/^\s*/) || [""])[0] + r.trim() + (v.match(/\s*$/) || [""])[0]; }
  return v;
}
function trLine(c: Compiled, s: string, depth = 0): string {
  if (!s || !HAS_WORD.test(s)) return s;
  const k = norm(s);
  const hit = c.x.get(k);
  if (hit != null) return hit;
  const seen = new Set<string>();
  let best: any = null, bestM: RegExpExecArray | null = null;
  for (const w of (k.toLowerCase().match(/[a-z]{2,}/g) || [])) {
    if (seen.has(w)) continue; seen.add(w);
    for (const p of (c.idx.get(w) || [])) {
      if (best && p.lit <= best.lit) break;
      const m = p.re.exec(k);
      if (!m) continue;
      if (p.lit / k.length < 0.3 && m.slice(1).some((v) => (String(v).match(/[A-Za-z]{2,}/g) || []).length > 4)) continue;
      best = p; bestM = m; break;
    }
  }
  if (best && bestM) {
    const vals: Record<string, string> = {};
    best.order.forEach((n: string, i: number) => { vals[n] = value(c, bestM![i + 1], depth); });
    return best.tr.replace(/\{(\d+)\}/g, (_: string, n: string) => vals[n] ?? "");
  }
  return depth ? s : value(c, s, 1);
}
export async function translatePush(lang: string, title: string, body: string): Promise<{ title: string; body: string }> {
  if (!lang || lang === "en" || !PUSH_LANGS.includes(lang)) return { title, body };
  const c = await dict(lang);
  if (!c) return { title, body };
  const tx = (t: string) => String(t || "").split("\n").map((l) => trLine(c, l)).join("\n");
  return { title: tx(title), body: tx(body) };
}
