// Supabase Edge Function: notify-admins-feedback  (v1229; v1839 team-only; v1903 caller-gated)
// Pushes the Bad Golf team when a user sends feedback (Contact form, "Help us improve",
// or a write-back on their thread).
// v1839 (Tyler, 10/1): "Only Kevin and I should see admin messages." Recipients are now
// exactly Tyler + Kevin (and only if they still hold an admin role), not every admin.
// v1903 (audit #2 #1): the anon key used to satisfy verify_jwt, so anyone could push
// made-up "feedback" to Tyler + Kevin. Now: anon refused; a signed-in caller is stamped as
// the sender (body.user_id is ignored) and limited to 5 admin pushes per hour (push_audit).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TEAM_INBOX = [
  "96c81a63-a969-483f-acd4-887758ee1053", // Tyler
  "577b3347-c4ca-4a07-bba1-ff5a7174c3e4", // Kevin
];
const MAX_PER_HOUR = 5;

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
    const feedbackId = body.feedback_id ?? body.record?.id ?? null;
    const supa = createClient(SUPABASE_URL, SERVICE_KEY);

    if (who.role === "authenticated") {
      try {
        const since = new Date(Date.now() - 3600 * 1000).toISOString();
        const { data: rows } = await supa.from("push_audit").select("id").eq("caller", who.sub).eq("ntype", "feedback_notify").gte("at", since);
        if ((rows || []).length >= MAX_PER_HOUR) return new Response("rate limited", { status: 429 });
        await supa.from("push_audit").insert({ caller: who.sub, n: 2, ntype: "feedback_notify" });
      } catch (_) { /* audit table missing -> still send */ }
    }

    let row: any = body.record || null;
    if (feedbackId) {
      const { data } = await supa.from("feedback").select("*").eq("id", feedbackId).maybeSingle();
      if (data) row = data;
    }
    if (!row || !String(row.message || "").trim()) return new Response("no feedback", { status: 200 });
    if (who.role === "authenticated") row.user_id = who.sub;   // the sender is whoever is signed in, not whatever the body says

    const { data: admins } = await supa.from("profiles").select("id").in("id", TEAM_INBOX).in("role", ["admin", "commissioner"]);
    let adminIds = (admins || []).map((a: any) => a.id).filter(Boolean);
    if (row.user_id) adminIds = adminIds.filter((id: string) => id !== row.user_id);
    if (!adminIds.length) return new Response("no admins", { status: 200 });

    const topicLabel: Record<string, string> = {
      course: "Course feedback", bug: "Bug report", idea: "Idea", improve: "Feedback", other: "Message",
    };
    const who2 = String(row.from_name || "A user").slice(0, 60);
    const course = row.course ? ` (${String(row.course).slice(0, 50)})` : "";
    const excerpt = String(row.message || "").replace(/\s+/g, " ").trim().slice(0, 120);

    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: "POST",
      headers: { "authorization": `Bearer ${SERVICE_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        user_ids: adminIds,
        title: `${topicLabel[String(row.topic || "other")] || "Message"} from ${who2}`,
        body: `${excerpt}${course}`,
        data: { type: "feedback", feedback_id: feedbackId, topic: String(row.topic || "other") },
        collapse_id: `fb:${feedbackId || Date.now()}`,
      }),
    });
    const out = await res.text();
    return new Response(out, { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(`error: ${e}`, { status: 500 });
  }
});
