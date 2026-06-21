// Bad Golf — USGA course rating lookup (Supabase Edge Function)
// ----------------------------------------------------------------------------
// Replaces the broken BlueGolf name-search with the authoritative USGA National
// Course Rating Database (ncrdb.usga.org). Give it a course name (+ optional
// state) and it searches NCRDB SERVER-SIDE (no CORS), picks the best-matching
// course, opens its tee-info page, and parses every tee's men's + women's
// Course Rating / Slope Rating, total par, and length (yardage).
//
// NCRDB does NOT publish per-hole pars or stroke index — only total par + the
// rating/slope/yardage per tee. (Pars/SI come from your scorecard import; this
// fills the rating/slope that was wrong.)
//
// HOW NCRDB WORKS (reverse-engineered):
//   1. GET https://ncrdb.usga.org/  -> read the hidden __RequestVerificationToken
//      and the .AspNetCore.Antiforgery.* cookie (anti-forgery pair).
//   2. POST https://ncrdb.usga.org/NCRListing?handler=LoadCourses
//      body: clubName, clubCity, ddlStates, ddlCountries, __RequestVerificationToken
//      headers: RequestVerificationToken + Cookie  -> HTML table of matches,
//      each course linking to  courseTeeInfo?CourseID=<id>.
//   3. GET https://ncrdb.usga.org/courseTeeInfo?CourseID=<id>  -> the tee table.
//
// Input  (POST JSON): { name, state?, city? }   — OR  { courseId }
// Output (JSON): { ok, source:'usga', name, courseId,
//                  tees:[{ label, rating, slope, ratingW, slopeW, yards, par }] }
//
// Deploy: Supabase dashboard -> Edge Functions -> Create function -> name it
//   "usga-lookup" -> paste this file -> Deploy. (No CLI needed.)
// ----------------------------------------------------------------------------

const BASE = "https://ncrdb.usga.org";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

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
  // Deno exposes multiple Set-Cookie via getSetCookie(); fall back to .get().
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
    .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

const norm = (s: string) =>
  String(s || "").toLowerCase().replace(/&amp;/g, "&").replace(/[^a-z0-9]+/g, " ").trim();

// Step 1 — landing page: anti-forgery token + cookie + the "United States" value.
async function getSession() {
  const res = await fetch(BASE + "/", { headers: { "User-Agent": UA } });
  const html = await res.text();
  const cookie = cookiesFrom(res);
  const tok = (html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/i) ||
    [])[1] || "";
  // The US <option> value (kept dynamic so a site change won't break it).
  const us = (html.match(/<option[^>]*value="([^"]*)"[^>]*>\s*\*?\s*United States of America/i) ||
    [])[1] || "";
  return { cookie, tok, us };
}

// Step 2 — search. Returns candidate courses with their CourseID.
async function searchCourses(
  name: string, city: string, state: string, sess: { cookie: string; tok: string; us: string },
) {
  const body = new URLSearchParams();
  body.set("clubName", name);
  body.set("clubCity", city || "");
  body.set("ddlStates", state || "");
  body.set("ddlCountries", sess.us || "");
  body.set("__RequestVerificationToken", sess.tok);
  const res = await fetch(BASE + "/NCRListing?handler=LoadCourses", {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "RequestVerificationToken": sess.tok,
      "Cookie": sess.cookie,
    },
    body: body.toString(),
  });
  const html = await res.text();
  // Each match: a courseTeeInfo link inside a row whose remaining cells are
  // facility / city / state. Parse links + the surrounding row text.
  const cands: { id: string; name: string; state: string; row: string }[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let r: RegExpExecArray | null;
  while ((r = rowRe.exec(html))) {
    const row = r[1];
    const link = row.match(/courseTeeInfo\?CourseID=(\d+)[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => decode(m[1]));
    const st = (row.match(/>\s*([A-Z]{2})\s*</) || [])[1] ||
      (cells.length ? cells[cells.length - 1] : "");
    cands.push({ id: link[1], name: decode(link[2]), state: st, row: cells.join(" | ") });
  }
  return cands;
}

// Step 3 — tee table for one course.
async function teesFor(courseId: string, sess: { cookie: string }) {
  const res = await fetch(BASE + "/courseTeeInfo?CourseID=" + encodeURIComponent(courseId), {
    headers: { "User-Agent": UA, "Cookie": sess.cookie },
  });
  const html = await res.text();
  let name = "";
  const nm = html.match(/CourseID=\d+[^>]*>([^<]+)<\/a>/i) ||
    html.match(/<td[^>]*>\s*([^<]+? - [^<]+?)\s*<\/td>/i);
  if (nm) name = decode(nm[1]);

  // Find the tee table by its header (contains "Tee Name" + "Slope Rating").
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

  // Map columns by header so a layout tweak doesn't shift the data.
  const head = rows[0].map((h) => h.toLowerCase());
  const col = (...keys: string[]) =>
    head.findIndex((h) => keys.some((k) => h.includes(k)));
  const cTee = col("tee name"), cGen = col("gender"), cPar = col("par"),
    cRat = col("course rating"), cSlope = col("slope rating"), cLen = col("length");

  // Merge men's + women's onto one tee by label.
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
// USGA doesn't publish per-hole pars/SI; BlueGolf's detailed-scorecard pages
// still parse fine server-side (only BlueGolf's SEARCH broke). If the caller
// passes a BlueGolf course URL we merge its pars/SI into the USGA result, so
// ONE lookup returns rating/slope (USGA) + pars/SI (BlueGolf).
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
    const raw = await fetch(url, { headers: { "User-Agent": UA } }).then((r) => r.text());
    const pars = bgStrip18(bgRowVals(raw, "Par"));
    const hcp = bgRowVals(raw, "Hcp");
    return { pars: pars && pars.length === 18 ? pars : null, sis: hcp ? hcp.slice(0, 18) : null };
  } catch (_e) { return { pars: null, sis: null }; }
}

// Score a candidate against the requested name/state for the best pick.
function pick(
  cands: { id: string; name: string; state: string; row: string }[],
  name: string, state: string,
) {
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
    const blueGolfUrl = String(body.blueGolfUrl || "").trim(); // optional → pars/SI

    const sess = await getSession();
    if (!sess.tok) {
      return json({ ok: false, error: "Couldn't start a USGA session (the site may have changed)." });
    }

    let id = courseId;
    let matchedName = "";
    if (!id) {
      if (!name) return json({ ok: false, error: "Provide a course name (+ optional state) or a courseId." });
      const cands = await searchCourses(name, city, state, sess);
      const best = pick(cands, name, state);
      if (!best) {
        return json({ ok: false, error: 'No USGA match for "' + name + '"' + (state ? " in " + state : "") + "." });
      }
      id = best.id;
      matchedName = best.name;
    }

    const { name: teeName, tees } = await teesFor(id, sess);
    if (!tees.length) {
      return json({ ok: false, error: "Found the course but couldn't read its tee ratings (layout may have changed)." });
    }
    // Combine: rating/slope from USGA + (optional) pars/SI from a BlueGolf scorecard.
    let pars: number[] | null = null, sis: number[] | null = null;
    if (blueGolfUrl) { const sc = await blueGolfScorecard(blueGolfUrl); pars = sc.pars; sis = sc.sis; }
    return json({
      ok: true,
      source: "usga",
      name: teeName || matchedName || name,
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
