// Bad Golf — USGA course rating lookup (Supabase Edge Function)
// ----------------------------------------------------------------------------
// Searches the USGA National Course Rating Database (ncrdb.usga.org) server-side
// (no CORS), picks the best-matching course, opens its tee-info page, and parses
// every tee's men's + women's Course Rating / Slope Rating, total par, and length.
//
// NCRDB does NOT publish per-hole pars or stroke index — only total par + the
// rating/slope/yardage per tee. (Pars/SI come from your scorecard import.)
//
// HOW NCRDB WORKS (re-verified June 2026):
//   1. GET https://ncrdb.usga.org/  -> hidden __RequestVerificationToken +
//      .AspNetCore.Antiforgery.* and Akamai (ak_bmsc) cookies.
//   2. POST https://ncrdb.usga.org/NCRListing?handler=LoadCourses
//      body (form-urlencoded): clubName, clubCity, clubState, clubCountry
//        - clubCountry = "USA";  clubState = "US-XX" (e.g. US-TX)
//      header: RequestVerificationToken (token) + Cookie
//      RESPONSE IS JSON (not an HTML table): array of
//        { courseID, courseName, facilityName, fullName, city, state:"US-XX",
//          stateDisplay:"XX", ... }
//   3. GET https://ncrdb.usga.org/courseTeeInfo?CourseID=<id> -> tee table (HTML).
//
// AKAMAI / 403:
//   NCRDB is behind Akamai and 403s ("Access Denied", 368 bytes) any request that
//   does not look browser-like. The deciding headers are Accept-Language plus
//   Accept-Encoding — NOT the client-hint / fetch-metadata headers (those names
//   are "forbidden header names" that Deno's server-side fetch silently drops, so
//   setting them did nothing and every call still 403'd). We send Accept-Language
//   + Accept-Encoding: identity (uncompressed, so Deno hands us plain text since it
//   won't auto-decompress once you set Accept-Encoding yourself).
//
// NAME MATCHING:
//   NCRDB matches its own (often abbreviated) stored names, so a full imported
//   name often misses ("The Links at Fox Meadows" -> 0, "Links at Fox Meadows" ->
//   hit). We try progressively simpler search terms, ALWAYS locked to the course's
//   state, so we never import a same-named course from the wrong state.
//
// Input  (POST JSON): { name, state?, city? }   — OR  { courseId }
// Output (JSON): { ok, source:'usga', name, city, courseId,
//                  tees:[{ label, rating, slope, ratingW, slopeW, yards, par }] }
//
// Deploy: Supabase dashboard -> Edge Functions -> usga-lookup -> paste -> Deploy.
//   "Verify JWT" must be OFF (function -> Settings). No CLI needed.
// ----------------------------------------------------------------------------

const BASE = "https://ncrdb.usga.org";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Headers that get past Akamai from Deno's fetch. Accept-Language + Accept-Encoding
// are the deciding pair; identity keeps the body uncompressed so Deno hands us
// plain text. Client-hint / fetch-metadata headers are omitted — Deno strips them.
const CH: Record<string, string> = {
  "User-Agent": UA,
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "identity",
};
const NAV_HEADERS: Record<string, string> = {
  ...CH,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Pull every Set-Cookie name=value pair into one Cookie header string.
function cookiesFrom(res: Response): string {
  // deno-lint-ignore no-explicit-any
  const anyHeaders = res.headers as any;
  let list: string[] = [];
  if (typeof anyHeaders.getSetCookie === "function") list = anyHeaders.getSetCookie();
  if (!list.length) {
    const sc = res.headers.get("set-cookie");
    if (sc) list = sc.split(/,(?=[^;]+=)/);
  }
  return list.map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

const norm = (s: string) =>
  String(s || "").toLowerCase().replace(/&amp;/g, "&").replace(/[^a-z0-9]+/g, " ").trim();

// Step 1 — landing page: anti-forgery token + cookies + the "United States" value.
async function getSession() {
  const res = await fetch(BASE + "/", { headers: { ...NAV_HEADERS, "Referer": BASE + "/" }, redirect: "follow" });
  const html = await res.text();
  const cookie = cookiesFrom(res);
  let tok = "";
  const tag = html.match(/<input[^>]*__RequestVerificationToken[^>]*>/i);
  if (tag) tok = (tag[0].match(/value="([^"]*)"/i) || tag[0].match(/value='([^']*)'/i) || [])[1] || "";
  const us = (html.match(/<option[^>]*value="([^"]*)"[^>]*>\s*\*?\s*United States of America/i) ||
    [])[1] || "USA";
  return { cookie, tok, us, status: res.status, len: html.length, hasForm: /clubName/.test(html) };
}

type Cand = { id: string; name: string; state: string; city: string };

// Parse NCRDB's LoadCourses JSON array into candidates.
function candsFromJson(text: string): Cand[] {
  let arr: any[] = [];
  try { arr = JSON.parse(text); } catch (_e) { return []; }
  if (!Array.isArray(arr)) return [];
  return arr.map((o) => {
    const st = String(o.stateDisplay || "").trim() ||
      String(o.state || "").replace(/^US-/i, "").trim();
    return {
      id: String(o.courseID ?? o.courseId ?? o.CourseID ?? "").trim(),
      name: decode(String(o.fullName || o.courseName || o.facilityName || "")),
      state: st,
      city: decode(String(o.city || "")),
    };
  }).filter((c) => c.id);
}

// Build progressively simpler search terms from an imported course name.
function searchTermsFor(name: string): string[] {
  const out: string[] = [];
  const add = (t: string) => {
    t = String(t || "").trim();
    if (t && t.length >= 3 && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  };
  const n = String(name || "").trim();
  add(n);
  const noThe = n.replace(/^the\s+/i, "").trim();
  add(noThe);
  const stripped = noThe.replace(
    /[\s,]+(golf\s+&\s+country\s+club|golf\s+and\s+country\s+club|golf\s+course|golf\s+club|golf\s+links|country\s+club|g\s*&\s*c\s*c|g\.?\s*c\.?\s*c\.?|c\.?\s*c\.?|g\.?\s*c\.?|golf|links|course|club)\.?$/i,
    "",
  ).trim();
  add(stripped);
  const w = stripped.split(/\s+/).filter(Boolean);
  if (w.length > 2) { add(w.slice(-2).join(" ")); add(w.slice(0, 2).join(" ")); }
  return out;
}

// One LoadCourses POST for a given clubName + clubState.
async function postSearch(
  clubName: string, clubState: string, sess: { cookie: string; tok: string; us: string },
): Promise<Cand[]> {
  const body = new URLSearchParams();
  body.set("clubName", clubName);
  body.set("clubCity", "");
  body.set("clubState", clubState);
  body.set("clubCountry", sess.us || "USA");
  const res = await fetch(BASE + "/NCRListing?handler=LoadCourses", {
    method: "POST",
    headers: {
      ...CH,
      "Accept": "*/*",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "RequestVerificationToken": sess.tok,
      "Cookie": sess.cookie,
      "Referer": BASE + "/",
    },
    body: body.toString(),
  });
  return candsFromJson(await res.text());
}

// Step 2 — search. Tries progressively simpler names. When a state is known we
// stay LOCKED to that state; without a state we search country-wide.
async function searchCourses(
  name: string, _city: string, state: string, sess: { cookie: string; tok: string; us: string },
): Promise<Cand[]> {
  const stUp = (state || "").toUpperCase();
  const terms = searchTermsFor(name);
  if (stUp) {
    for (const term of terms) {
      const a = await postSearch(term, "US-" + stUp, sess);
      if (a.length) return a;
    }
    return []; // no in-state USGA match — do NOT fall back to another state
  }
  for (const term of terms) {
    const b = await postSearch(term, "(Select)", sess);
    if (b.length) return b;
  }
  return [];
}

// Step 3 — tee table for one course.
async function teesFor(courseId: string, sess: { cookie: string }) {
  const res = await fetch(BASE + "/courseTeeInfo?CourseID=" + encodeURIComponent(courseId), {
    headers: { ...NAV_HEADERS, "Referer": BASE + "/", "Cookie": sess.cookie },
  });
  const html = await res.text();
  let name = "";
  const nm = html.match(/CourseID=\d+[^>]*>([^<]+)<\/a>/i) ||
    html.match(/<td[^>]*>\s*([^<]+? - [^<]+?)\s*<\/td>/i);
  if (nm) name = decode(nm[1]);

  let tableHtml = "";
  const tRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let t: RegExpExecArray | null;
  while ((t = tRe.exec(html))) {
    if (/Tee Name/i.test(t[1]) && /Slope/i.test(t[1])) { tableHtml = t[1]; break; }
  }
  if (!tableHtml) return { name, tees: [] };

  const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) =>
    [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => decode(c[1]))
  ).filter((r) => r.length);
  if (rows.length < 2) return { name, tees: [] };

  const head = rows[0].map((h) => h.toLowerCase());
  const col = (...keys: string[]) =>
    head.findIndex((h) => keys.some((k) => h.includes(k)));
  const cTee = col("tee name"), cGen = col("gender"), cPar = col("par"),
    cRat = col("course rating"), cSlope = col("slope rating"), cLen = col("length");

  const byTee: Record<string, {
    label: string; rating?: number; slope?: number; ratingW?: number;
    slopeW?: number; yards?: number; par?: number;
  }> = {};
  for (let i = 1; i < rows.length; i++) {
    const r2 = rows[i];
    const label = (cTee >= 0 ? r2[cTee] : r2[0]) || "";
    if (!label) continue;
    const gender = ((cGen >= 0 ? r2[cGen] : "") || "").toUpperCase();
    const rating = parseFloat(cRat >= 0 ? r2[cRat] : "");
    const slope = parseInt(cSlope >= 0 ? r2[cSlope] : "", 10);
    const par = parseInt(cPar >= 0 ? r2[cPar] : "", 10);
    const yards = parseInt((cLen >= 0 ? r2[cLen] : "").replace(/[^0-9]/g, ""), 10);
    const tt = (byTee[label] = byTee[label] || { label });
    if (par && tt.par == null) tt.par = par;
    if (yards && tt.yards == null) tt.yards = yards;
    if (gender.startsWith("W") || gender.startsWith("L") || gender.startsWith("F")) {
      if (!isNaN(rating) && tt.ratingW == null) { tt.ratingW = rating; tt.slopeW = slope; }
    } else {
      if (!isNaN(rating) && tt.rating == null) { tt.rating = rating; tt.slope = slope; }
    }
  }
  return { name, tees: Object.values(byTee) };
}

// ---- Optional pars + stroke index from a BlueGolf scorecard page ----------
function bgRowVals(raw: string, label: string): number[] | null {
  const rx = new RegExp("rowStart[^>]*>" + label + "<\\/td>((?:\\s*<td[^>]*>[^<]*<\\/td>){10,30})", "i");
  const mm = raw.match(rx);
  if (!mm) return null;
  return [...mm[1].matchAll(/<td[^>]*>\s*([0-9]+)\s*<\/td>/g)].map((x) => parseInt(x[1], 10));
}
function bgStrip18(a: number[] | null): number[] | null {
  if (!a) return null;
  if (a.length >= 21) return a.filter((_, i) => i !== 9 && i !== 19 && i !== 20);
  return a.slice(0, 18);
}
async function blueGolfScorecard(url: string): Promise<{ pars: number[] | null; sis: number[] | null }> {
  try {
    const ms = url.match(/course\/course\/([^\/]+)/);
    if (ms) url = "https://course.bluegolf.com/bluegolf/course/course/" + ms[1] + "/detailedscorecard.htm";
    if (!/(^|\.)bluegolf\.com\//.test(url)) return { pars: null, sis: null };
    const raw = await fetch(url, { headers: { ...CH } }).then((r) => r.text());
    const pars = bgStrip18(bgRowVals(raw, "Par"));
    const hcp = bgRowVals(raw, "Hcp");
    return { pars: pars && pars.length === 18 ? pars : null, sis: hcp ? hcp.slice(0, 18) : null };
  } catch (_e) { return { pars: null, sis: null }; }
}

// Score a candidate against the requested name/state for the best pick.
function pick(cands: Cand[], name: string, state: string) {
  if (!cands.length) return null;
  const wantN = norm(name), wantS = (state || "").toUpperCase();
  let best = cands[0], bestScore = -1;
  for (const c of cands) {
    let s = 0;
    const cn = norm(c.name);
    if (cn === wantN) s += 5;
    else if (cn.includes(wantN) || wantN.includes(cn)) s += 3;
    else {
      const wt = wantN.split(" ").filter(Boolean);
      const hit = wt.filter((w) => cn.includes(w)).length;
      s += hit / Math.max(1, wt.length);
    }
    if (wantS && c.state && c.state.toUpperCase() === wantS) s += 2;
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return best;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    const city = String(body.city || "").trim();
    const state = String(body.state || "").trim();
    const courseId = String(body.courseId || "").trim();
    const blueGolfUrl = String(body.blueGolfUrl || "").trim(); // optional pars/SI

    const sess = await getSession();
    if (!sess.tok) {
      return json({
        ok: false,
        error: "Couldn't start a USGA session — NCRDB landing GET = HTTP " + sess.status + ", " +
          sess.len + " bytes, search form present: " + sess.hasForm + ". If 403, Akamai blocked the " +
          "request — it needs the Accept-Language + Accept-Encoding headers (already set here, so this " +
          "would mean USGA changed its protection or is down).",
        diag: { status: sess.status, len: sess.len, hasForm: sess.hasForm },
      });
    }

    let id = courseId;
    let matchedName = "";
    let matchedCity = "";
    if (!id) {
      if (!name) return json({ ok: false, error: "Provide a course name (+ optional state) or a courseId." });
      const cands = await searchCourses(name, city, state, sess);
      const best = pick(cands, name, state);
      if (!best) {
        return json({ ok: false, error: 'No USGA match for "' + name + '"' + (state ? " in " + state : "") + "." });
      }
      id = best.id;
      matchedName = best.name;
      matchedCity = best.city;
    }

    const { name: teeName, tees } = await teesFor(id, sess);
    if (!tees.length) {
      return json({ ok: false, error: "Found the course but couldn't read its tee ratings (layout may have changed)." });
    }
    let pars: number[] | null = null, sis: number[] | null = null;
    if (blueGolfUrl) { const sc = await blueGolfScorecard(blueGolfUrl); pars = sc.pars; sis = sc.sis; }
    return json({
      ok: true,
      source: "usga",
      name: teeName || matchedName || name,
      city: matchedCity || "",
      courseId: id,
      url: BASE + "/courseTeeInfo?CourseID=" + id,
      tees,
      pars,
      sis,
    });
  } catch (e) {
    return json({ ok: false, error: String((e && (e as Error).message) || e) });
  }
});
