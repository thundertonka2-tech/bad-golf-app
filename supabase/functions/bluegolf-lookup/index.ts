// Bad Golf — BlueGolf course lookup (Supabase Edge Function)
// ----------------------------------------------------------------------------
// FULLY AUTOMATED: give it a course name (+ city/state) and it searches BlueGolf,
// picks the right course, fetches its "detailed scorecard" page SERVER-SIDE (no
// CORS limits), and parses every tee's men's + ladies' rating/slope, the pars, and
// the stroke index (per-hole handicap). The app's "Auto-fill from BlueGolf" button
// calls this and fills Rating/Slope/Tees + Pars/Stroke index. (A url/slug can still
// be passed directly as a fallback.)
//
// Input  (POST JSON): { name, city?, state? }  — OR  { url }  — OR  { slug }
// Output (JSON): { ok, url, slug, name, tees:[{label,rating,slope,ratingW,slopeW}], pars[18], sis[18] }
//
// Deploy: Supabase dashboard → Edge Functions → Create function → name it
//   "bluegolf-lookup" → paste this file → Deploy. (No CLI needed.)
// ----------------------------------------------------------------------------

const UA = "Mozilla/5.0 (compatible; BadGolf/1.0)";
const BASE = "https://course.bluegolf.com/bluegolf/course/course/";

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

function detailedUrl(slug: string): string {
  return BASE + slug + "/detailedscorecard.htm";
}

// Search BlueGolf's course directory and return the best-matching course slug.
// Disambiguates by STATE (then a loose city/name contains) — there are e.g. a
// "Buffalo Creek" in TX and one in FL.
async function searchSlug(name: string, city: string, state: string): Promise<string | null> {
  const sUrl = BASE + "directory.htm?q=" + encodeURIComponent(name);
  const raw = await fetch(sUrl, { headers: { "User-Agent": UA } }).then((r) => r.text()).catch(() => "");
  if (!raw) return null;
  const cands: { slug: string; blurb: string; state: string }[] = [];
  const seen: Record<string, boolean> = {};
  const re = /href="([a-z0-9-]+)\/(?:index|actual)\.htm"[^>]*>([\s\S]{0,500}?)(?=href="[a-z0-9-]+\/(?:index|actual)\.htm"|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const slug = m[1];
    if (seen[slug]) continue;
    seen[slug] = true;
    const chunk = m[2].replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
    const st = (chunk.match(/,\s*([A-Z]{2})\b/) || [])[1] || "";
    cands.push({ slug, blurb: chunk.toLowerCase(), state: st });
    if (cands.length >= 15) break;
  }
  if (!cands.length) return null;
  const wantSt = (state || "").toUpperCase();
  const wantCity = (city || "").toLowerCase();
  let pick = null as null | { slug: string };
  if (wantSt) {
    const sm = cands.filter((c) => c.state === wantSt);
    if (wantCity) pick = sm.find((c) => c.blurb.includes(wantCity)) || null;
    pick = pick || sm[0] || null;
  }
  pick = pick || cands[0] || null;
  return pick ? pick.slug : null;
}

function rowVals(raw: string, label: string): number[] | null {
  const rx = new RegExp("rowStart[^>]*>" + label + "<\\/td>((?:\\s*<td[^>]*>[^<]*<\\/td>){10,30})", "i");
  const mm = raw.match(rx);
  if (!mm) return null;
  return [...mm[1].matchAll(/<td[^>]*>\s*([0-9]+)\s*<\/td>/g)].map((x) => parseInt(x[1], 10));
}

function strip18(a: number[] | null): number[] | null {
  if (!a) return null;
  if (a.length >= 21) return a.filter((_, i) => i !== 9 && i !== 19 && i !== 20);
  return a.slice(0, 18);
}

function parseBlueGolf(raw: string) {
  let name = "";
  const t = raw.match(/<title>\s*([^<|]+?)\s*[-|]/i);
  if (t) name = t[1].trim();

  // Tees: men "(M - 74.9/132)", ladies "(L - 81.3/145)" (W tolerated). Merge by label.
  const tees: Record<string, { label: string; rating?: number; slope?: number; ratingW?: number; slopeW?: number }> = {};
  const re = /\(([MLW]) - (\d{2}\.\d)\/(\d{2,3})\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const g = m[1];
    const rating = parseFloat(m[2]);
    const slope = parseInt(m[3], 10);
    const pre = raw.slice(Math.max(0, m.index - 300), m.index);
    let lbl: string | null = null;
    const c1 = [...pre.matchAll(/ddm-(?:center|word)[^>]*>\s*([A-Za-z][A-Za-z\/ ]{0,16}?)\s*</g)];
    if (c1.length) lbl = c1[c1.length - 1][1].trim();
    if (!lbl) {
      const c2 = [...pre.matchAll(/title="([A-Za-z][A-Za-z\/ ]{0,16}?)"/g)];
      if (c2.length) lbl = c2[c2.length - 1][1].trim();
    }
    if (!lbl) continue;
    const tt = (tees[lbl] = tees[lbl] || { label: lbl });
    if (g === "M") { if (tt.rating == null) { tt.rating = rating; tt.slope = slope; } }
    else { if (tt.ratingW == null) { tt.ratingW = rating; tt.slopeW = slope; } }
  }

  const pars = strip18(rowVals(raw, "Par"));
  const hcp = rowVals(raw, "Hcp");
  const sis = hcp ? hcp.slice(0, 18) : null;
  return { name, tees: Object.values(tees), pars, sis };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    let url = String(body.url || "").trim();
    const slug = String(body.slug || "").trim();
    const name = String(body.name || "").trim();
    const city = String(body.city || "").trim();
    const state = String(body.state || "").trim();

    if (!url && slug) url = detailedUrl(slug);
    if (!url && name) {
      const found = await searchSlug(name, city, state);
      if (!found) return json({ ok: false, error: 'No matching course found on BlueGolf for "' + name + '"' + (state ? " in " + state : "") + "." }, 404);
      url = detailedUrl(found);
    }
    if (!url) return json({ ok: false, error: "Provide a BlueGolf course name (+state), url, or slug." }, 400);

    // Normalise ANY bluegolf course URL to its detailed scorecard page.
    const ms = url.match(/course\/course\/([^\/]+)/);
    if (ms) url = detailedUrl(ms[1]);
    if (!/(^|\.)bluegolf\.com\//.test(url)) return json({ ok: false, error: "Only bluegolf.com course URLs are allowed." }, 400);
    const usedSlug = (url.match(/course\/course\/([^\/]+)/) || [])[1] || "";

    const raw = await fetch(url, { headers: { "User-Agent": UA } }).then((r) => r.text());
    const parsed = parseBlueGolf(raw);
    if (!parsed.pars || parsed.pars.length !== 18) {
      return json({ ok: false, error: "Found the course but couldn't read its scorecard (the page layout may have changed)." }, 422);
    }
    return json({ ok: true, url, slug: usedSlug, ...parsed });
  } catch (e) {
    return json({ ok: false, error: String((e && (e as Error).message) || e) }, 500);
  }
});
