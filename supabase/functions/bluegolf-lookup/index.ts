// Bad Golf — BlueGolf course lookup (Supabase Edge Function)
// ----------------------------------------------------------------------------
// Fetches a BlueGolf "detailed scorecard" page SERVER-SIDE (no CORS limits) and
// parses out every tee's men's + ladies' rating/slope, the pars, and the stroke
// index (per-hole handicap). The app's admin "Auto-fill from BlueGolf" button
// calls this and then fills the course's Rating/Slope/Tees + Pars/Stroke index.
//
// Input  (POST JSON): { url } OR { slug }
//   url  = any BlueGolf course URL (e.g. .../course/course/buffalocreekgc/actual.htm)
//   slug = the BlueGolf course slug (e.g. "buffalocreekgc")
// Output (JSON): { ok, url, name, tees:[{label,rating,slope,ratingW,slopeW}], pars[18], sis[18] }
//
// Deploy: Supabase dashboard → Edge Functions → Create function → name it
//   "bluegolf-lookup" → paste this file → Deploy. (No CLI needed.)
// ----------------------------------------------------------------------------

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

// Pull a numeric row from a BlueGolf scorecard table by its rowStart label
// (e.g. "Par", "Hcp"). Returns all numeric <td> cells, or null.
function rowVals(raw: string, label: string): number[] | null {
  const rx = new RegExp("rowStart[^>]*>" + label + "<\\/td>((?:\\s*<td[^>]*>[^<]*<\\/td>){10,30})", "i");
  const mm = raw.match(rx);
  if (!mm) return null;
  return [...mm[1].matchAll(/<td[^>]*>\s*([0-9]+)\s*<\/td>/g)].map((x) => parseInt(x[1], 10));
}

// Par/yards rows carry Out (idx 9), In (idx 19) and Tot (idx 20) sub-totals when
// there are 21 cells — strip those so we get exactly the 18 holes.
function strip18(a: number[] | null): number[] | null {
  if (!a) return null;
  if (a.length >= 21) return a.filter((_, i) => i !== 9 && i !== 19 && i !== 20);
  return a.slice(0, 18);
}

function parseBlueGolf(raw: string) {
  // Course name from the <title>.
  let name = "";
  const t = raw.match(/<title>\s*([^<|]+?)\s*[-|]/i);
  if (t) name = t[1].trim();

  // Tees: each tee in the selector shows "(M - 74.9/132)" for men and
  // "(L - 81.3/145)" for ladies (W is handled too just in case). Merge by label.
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
    let url: string = String(body.url || "").trim();
    const slug: string = String(body.slug || "").trim();
    if (!url && slug) url = `https://course.bluegolf.com/bluegolf/course/course/${slug}/detailedscorecard.htm`;
    if (!url) return json({ ok: false, error: "Provide a BlueGolf course url or slug." }, 400);
    // Normalise ANY bluegolf course URL to its detailed scorecard page.
    const ms = url.match(/course\/course\/([^\/]+)/);
    if (ms) url = `https://course.bluegolf.com/bluegolf/course/course/${ms[1]}/detailedscorecard.htm`;
    if (!/(^|\.)bluegolf\.com\//.test(url)) return json({ ok: false, error: "Only bluegolf.com course URLs are allowed." }, 400);

    const raw = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; BadGolf/1.0)" } }).then((r) => r.text());
    const parsed = parseBlueGolf(raw);
    if (!parsed.pars || parsed.pars.length !== 18) {
      return json({ ok: false, error: "Couldn't read the scorecard from that page — make sure it's a BlueGolf course page." }, 422);
    }
    return json({ ok: true, url, ...parsed });
  } catch (e) {
    return json({ ok: false, error: String((e && (e as Error).message) || e) }, 500);
  }
});
