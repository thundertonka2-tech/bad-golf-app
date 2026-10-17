// Supabase Edge Function: vector-fill  (cron, nightly 1-5 AM Central)
// v1933 (Tyler, 10/17): "run this unattended from 1:00-5:00 a.m. every day until all our U.S.
// courses are ran and either completed or researched and deemed not suitable for vector."
//
// Each call takes the next pending courses from public.course_vector_queue (highest priority
// first), pulls their shapes from OpenStreetMap (Overpass), and:
//   - 5+ fairways or 9+ greens  -> writes public.course_vector (the Map view draws it) and
//                                  marks the queue row 'done'
//   - less than that            -> marks it 'unsuitable' with the counts it found
//   - a request failure         -> leaves it 'pending' (attempts+1); after 3 tries -> 'error'
// It stops itself after ~110 s so pg_cron can call it every 3 minutes without overlap.
// Overpass is a shared public service: one request at a time, a real User-Agent, a pause
// between courses, and the mirror as a fallback.
//
// Auth: the pg_cron job sends header x-bg-cron-key = Vault secret bg_cron_key; the function reads
// the same secret through bg_cron_key() (service_role only) and compares. No dashboard step needed.
// (A service-role bearer token is accepted too; an optional BG_CRON_KEY function secret overrides.)
// Deployed with verify_jwt=false because the key is the auth.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_KEY     = Deno.env.get("BG_CRON_KEY") || "";
const BUDGET_MS    = 110_000;
const RADIUS_M     = 1800;
const TREE_CAP     = 400;
const UA           = "BadGolfApp/1.0 (support@officialbadgolf.com)";
// overpass-api.de answers 406 to every request from the edge runtime (its IP range is blocked - probed 10/17
// with five header shapes), so the job uses the two mirrors that do answer. kumi's data runs a few
// weeks behind main but that is fine for course shapes.
const MIRRORS      = ["https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const KEEP = new Set(["fairway", "rough", "bunker", "green", "water_hazard", "lateral_water_hazard", "tee", "penalty_area"]);

function callerRole(req: Request): string {
  try {
    const tok = (req.headers.get("authorization") || "").replace(/^bearer\s+/i, "").trim();
    const part = tok.split(".")[1] || "";
    const c = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(part.length + (4 - part.length % 4) % 4, "=")));
    return String(c.role || "");
  } catch (_) { return ""; }
}

type Feat = { type: "Feature"; properties: { k: string; ref: string }; geometry: any };

function ringOf(geom: any[]): number[][] {
  const r = geom.map((p: any) => [Math.round(p.lon * 1e6) / 1e6, Math.round(p.lat * 1e6) / 1e6]);
  if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push(r[0]);
  return r;
}

function toFeatures(d: any): Feat[] {
  const feats: Feat[] = [];
  for (const e of (d?.elements || [])) {
    const t = e.tags || {};
    let k: string | null = t.golf && KEEP.has(t.golf) ? t.golf : null;
    if (k === "lateral_water_hazard" || k === "penalty_area") k = "water_hazard";
    if (!k) {
      if (t.natural === "wood" || t.natural === "scrub" || t.landuse === "forest") k = "wood";
      else if (t.natural === "tree" && e.type === "node") {
        feats.push({ type: "Feature", properties: { k: "tree", ref: "" }, geometry: { type: "Point", coordinates: [Math.round(e.lon * 1e6) / 1e6, Math.round(e.lat * 1e6) / 1e6] } });
        continue;
      } else if (t.natural === "tree_row" && e.geometry) {
        for (const p of e.geometry) feats.push({ type: "Feature", properties: { k: "tree", ref: "" }, geometry: { type: "Point", coordinates: [Math.round(p.lon * 1e6) / 1e6, Math.round(p.lat * 1e6) / 1e6] } });
        continue;
      } else continue;
    }
    const geoms: number[][][][] = [];
    if (e.type === "way" && e.geometry) {
      const r = ringOf(e.geometry);
      if (r.length >= 4) geoms.push([r]);
    } else if (e.type === "relation") {
      const outers = (e.members || []).filter((m: any) => m.role === "outer" && m.geometry).map((m: any) => ringOf(m.geometry)).filter((r: number[][]) => r.length >= 4);
      const inners = (e.members || []).filter((m: any) => m.role === "inner" && m.geometry).map((m: any) => ringOf(m.geometry)).filter((r: number[][]) => r.length >= 4);
      if (outers.length) geoms.push([...outers, ...inners]);
    }
    for (const g of geoms) feats.push({ type: "Feature", properties: { k, ref: t.ref || t.name || "" }, geometry: { type: "Polygon", coordinates: g } });
  }
  // cap single trees per course (wood areas carry the canopy anyway)
  const trees = feats.filter(f => f.properties.k === "tree");
  if (trees.length > TREE_CAP) {
    const step = Math.max(1, Math.floor(trees.length / TREE_CAP));
    const keep = new Set(trees.filter((_, i) => i % step === 0).slice(0, TREE_CAP));
    return feats.filter(f => f.properties.k !== "tree" || keep.has(f));
  }
  return feats;
}

async function overpass(lat: number, lng: number): Promise<any | null> {
  const q = `[out:json][timeout:60];(way["golf"](around:${RADIUS_M},${lat},${lng});relation["golf"](around:${RADIUS_M},${lat},${lng});`
    + `way["natural"="wood"](around:${RADIUS_M},${lat},${lng});relation["natural"="wood"](around:${RADIUS_M},${lat},${lng});`
    + `way["landuse"="forest"](around:${RADIUS_M},${lat},${lng});relation["landuse"="forest"](around:${RADIUS_M},${lat},${lng});`
    + `way["natural"="scrub"](around:${RADIUS_M},${lat},${lng});way["natural"="tree_row"](around:${RADIUS_M},${lat},${lng});`
    + `node["natural"="tree"](around:${RADIUS_M},${lat},${lng}););out geom;`;
  for (let round = 0; round < 2; round++) {
    if (round) await new Promise(r => setTimeout(r, 12_000));   // both mirrors said no: one more go after a pause
    for (const url of MIRRORS) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45_000);
      const res = await fetch(url, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q), signal: ctl.signal });
      clearTimeout(t);
      if (!res.ok) { const tx = await res.text().catch(() => ""); console.error("overpass", url, res.status, tx.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300)); continue; }
      return await res.json();
    } catch (e) { console.error("overpass", url, String(e)); /* try the next mirror */ }
    }
  }
  return null;
}

Deno.serve(async (req) => {
  const supa = createClient(SUPABASE_URL, SERVICE_KEY);
  // the shared key lives in Vault (bg_cron_key); bg_cron_key() hands it only to service_role
  const key = req.headers.get("x-bg-cron-key") || "";
  let want = CRON_KEY;
  if (!want) { try { const { data } = await supa.rpc("bg_cron_key"); want = String(data || ""); } catch (_) {} }
  if (!(want && key === want) && callerRole(req) !== "service_role") return new Response("forbidden", { status: 403 });
  const started = Date.now();
  const out: any[] = [];
  let limit = 50;
  try { const b = await req.json().catch(() => ({})); if (b && Number(b.limit) > 0) limit = Math.min(200, Number(b.limit)); } catch (_) {}

  while (Date.now() - started < BUDGET_MS && out.length < limit) {
    // next course: pending, under 3 attempts, highest priority first
    const { data: rows } = await supa.from("course_vector_queue").select("course_id,name,lat,lng,attempts")
      .eq("status", "pending").lt("attempts", 3).order("priority", { ascending: false }).order("attempts").order("updated_at").limit(1);   // a failed course goes behind its peers, not straight back to the front
    const c = rows && rows[0]; if (!c) break;
    console.log("vector-fill", c.course_id, c.name);
    await supa.from("course_vector_queue").update({ attempts: c.attempts + 1, updated_at: new Date().toISOString() }).eq("course_id", c.course_id);

    const d = await overpass(c.lat, c.lng);
    if (!d) {
      const st = c.attempts + 1 >= 3 ? "error" : "pending";
      await supa.from("course_vector_queue").update({ status: st, note: "OSM request failed (" + new Date().toISOString().slice(0, 16) + ")", updated_at: new Date().toISOString() }).eq("course_id", c.course_id);
      out.push({ id: c.course_id, result: st });
      await new Promise(r => setTimeout(r, 15000));   // Overpass said no - give it a moment
      continue;
    }
    const feats = toFeatures(d);
    const counts: Record<string, number> = {};
    for (const f of feats) counts[f.properties.k] = (counts[f.properties.k] || 0) + 1;
    const usable = (counts.fairway || 0) >= 5 || (counts.green || 0) >= 9;
    if (usable) {
      const { error } = await supa.from("course_vector").upsert({ course_id: c.course_id, features: { type: "FeatureCollection", features: feats }, source: "osm", counts, fetched_at: new Date().toISOString() });
      if (error) {
        await supa.from("course_vector_queue").update({ status: "error", counts, note: "write failed: " + error.message, updated_at: new Date().toISOString() }).eq("course_id", c.course_id);
        out.push({ id: c.course_id, result: "error", counts });
      } else {
        await supa.from("course_vector_queue").update({ status: "done", counts, note: "loaded " + new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() }).eq("course_id", c.course_id);
        out.push({ id: c.course_id, result: "done", counts });
      }
    } else {
      await supa.from("course_vector_queue").update({ status: "unsuitable", counts, note: "too little in OSM (< 5 fairways and < 9 greens)", updated_at: new Date().toISOString() }).eq("course_id", c.course_id);
      out.push({ id: c.course_id, result: "unsuitable", counts });
    }
    await new Promise(r => setTimeout(r, 4000));   // be polite to Overpass
  }
  return new Response(JSON.stringify({ processed: out.length, ms: Date.now() - started, out }), { headers: { "content-type": "application/json" } });
});
