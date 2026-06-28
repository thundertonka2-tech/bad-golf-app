// Supabase Edge Function: notify-admins-remap  (#6)
// Pushes all admins/commissioners when a course RE-MAP request is filed.
// Invoke two ways:
//   1) Fire-and-forget from the app right after crCreate inserts:
//        supa.functions.invoke('notify-admins-remap', { body: { request_id } })
//   2) Database webhook on course_requests INSERT where type='remap' (passes { record }).
// It re-reads the request row with the service role (the submitter is not an admin),
// resolves admin recipients, and forwards to `send-push` (which gates on
// notif_prefs.admin_remap and handles APNs + 410 cleanup).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const requestId = body.request_id ?? body.record?.id;
    const supa = createClient(SUPABASE_URL, SERVICE_KEY);

    // Load the request row (prefer a fresh read; fall back to the webhook record).
    let row: any = body.record || null;
    if (requestId) {
      const { data } = await supa.from("course_requests").select("*").eq("id", requestId).maybeSingle();
      if (data) row = data;
    }
    if (!row || row.type !== "remap") return new Response("not a remap", { status: 200 });

    // Admin recipients.
    const { data: admins } = await supa.from("profiles").select("id").in("role", ["admin", "commissioner"]);
    const adminIds = (admins || []).map((a: any) => a.id).filter(Boolean);
    if (!adminIds.length) return new Response("no admins", { status: 200 });

    const courseName = row.course_name || "A course";
    const city = (row.location && String(row.location).trim()) ? ` (${row.location})` : "";

    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: "POST",
      headers: { "authorization": `Bearer ${SERVICE_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        user_ids: adminIds,
        title: "Course map needed",
        body: `${courseName}${city} — re-map requested`,
        data: { type: "remap", request_id: row.id, course_name: courseName },
        collapse_id: `remap:${row.id}`,
      }),
    });
    const out = await res.text();
    return new Response(out, { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(`error: ${e}`, { status: 500 });
  }
});
