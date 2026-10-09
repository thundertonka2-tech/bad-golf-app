// Supabase Edge Function: notify-admins-remap  (#6, v1775 routing; v1788 same flow for both; v1903 caller-gated)
// Pushes the right admins when a course request is filed.
//   v1788 (Tyler, 9/25): re-maps follow the SAME process as new courses -- Tyler maps it,
//   Kevin reviews + approves + emails. So BOTH kinds now go to Tyler + Kevin when filed.
// (The name is kept so older app builds that invoke it for re-maps keep working.)
// Invoke: supa.functions.invoke('notify-admins-remap', { body: { request_id } })
// It re-reads the request row with the service role (the submitter is not an admin)
// and forwards to `send-push` (APNs/FCM + 410 cleanup; gates re-maps on notif_prefs.admin_remap).
// v1903 (audit #2 #1): anon callers refused; a signed-in caller must name a REAL request row
// (body.record is no longer trusted) and is limited to 10 notifications per hour.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TYLER = "96c81a63-a969-483f-acd4-887758ee1053";
const KEVIN = "577b3347-c4ca-4a07-bba1-ff5a7174c3e4";
const ROUTE: Record<string, string[]> = { remap: [TYLER, KEVIN], new: [TYLER, KEVIN] };
const MAX_PER_HOUR = 10;

function callerClaims(req: Request): { role: string; sub: string } {
  try {
    const h = req.headers.get("authorization") || "";
    const tok = h.replace(/^bearer\s+/i, "").trim();
    const part = tok.split(".")[1] || "";
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(part.length + (4 - part.length % 4) % 4, "="));
    const c = JSON.parse(json);
    return { role: String(c.role || ""), sub: String(c.sub || "") };
  } catch (_) { return { role: "", sub: "" }; }
}

Deno.serve(async (req) => {
  try {
    const who = callerClaims(req);
    if (who.role !== "service_role" && !(who.role === "authenticated" && who.sub)) return new Response("forbidden", { status: 403 });
    const body = await req.json().catch(() => ({}));
    const requestId = body.request_id ?? body.record?.id;
    const supa = createClient(SUPABASE_URL, SERVICE_KEY);

    if (who.role === "authenticated") {
      try {
        const since = new Date(Date.now() - 3600 * 1000).toISOString();
        const { data: rows } = await supa.from("push_audit").select("id").eq("caller", who.sub).eq("ntype", "remap_notify").gte("at", since);
        if ((rows || []).length >= MAX_PER_HOUR) return new Response("rate limited", { status: 429 });
        await supa.from("push_audit").insert({ caller: who.sub, n: 2, ntype: "remap_notify" });
      } catch (_) {}
    }

    let row: any = (who.role === "service_role") ? (body.record || null) : null;
    if (requestId) {
      const { data } = await supa.from("course_requests").select("*").eq("id", requestId).maybeSingle();
      if (data) row = data;
    }
    if (!row) return new Response("no request", { status: 200 });
    const type = row.type === "remap" ? "remap" : "new";
    const recipients = (ROUTE[type] || []).filter((id) => id && id !== row.requester_id);
    if (!recipients.length) return new Response("no recipients", { status: 200 });

    const courseName = row.course_name || "A course";
    const where = (row.location && String(row.location).trim()) ? ` (${row.location})` : "";
    const who2 = row.requester_name ? ` · from ${row.requester_name}` : "";
    const title = type === "remap" ? "Course map needed" : "New course requested";
    const text = type === "remap" ? `${courseName}${where} — re-map requested${who2}` : `${courseName}${where}${who2}`;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: "POST",
      headers: { "authorization": `Bearer ${SERVICE_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        user_ids: recipients,
        title,
        body: text,
        data: { type: type === "remap" ? "remap" : "course_request", request_id: row.id, course_name: courseName },
        collapse_id: `creq:${row.id}`,
      }),
    });
    const out = await res.text();
    return new Response(out, { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(`error: ${e}`, { status: 500 });
  }
});
