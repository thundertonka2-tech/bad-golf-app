// Supabase Edge Function: monthly-handicap-push  (#5, cron)
// Once a month, push each qualifying user a one-line note on how their handicap
// moved. Schedule with pg_cron / Scheduled Functions for ~9am on the 1st.
//
// The app writes public.handicap_snapshots (user_id, month, hcp_index, rounds_ct)
// using its OWN index math, so this function just diffs a user's two latest months
// — no handicap formula re-implemented in Deno. Provisional months are stored with
// hcp_index = null (rounds_ct < 5) and skipped here. Recipient opt-outs
// (notif_prefs.monthly_handicap) are honored downstream by `send-push`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MIN_ROUNDS = 5;   // app's non-provisional minimum

function fmt(n: number): string {
  const v = Math.round(n * 10) / 10;
  return v < 0 ? `+${Math.abs(v).toFixed(1)}` : v.toFixed(1);
}

// v1903 (audit #2 #1): service-role callers only (cron) - the anon key could fire it at will.
function callerRole(req: Request): string {
  try {
    const tok = (req.headers.get("authorization") || "").replace(/^bearer\s+/i, "").trim();
    const part = tok.split(".")[1] || "";
    const c = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(part.length + (4 - part.length % 4) % 4, "=")));
    return String(c.role || "");
  } catch (_) { return ""; }
}

Deno.serve(async (req) => {
  try {
    if (callerRole(req) !== "service_role") return new Response("forbidden", { status: 403 });
    const supa = createClient(SUPABASE_URL, SERVICE_KEY);
    // Pull recent snapshots; group by user, newest month first.
    const { data: snaps } = await supa
      .from("handicap_snapshots")
      .select("user_id, month, hcp_index, rounds_ct")
      .order("month", { ascending: false })
      .limit(20000);
    const byUser: Record<string, any[]> = {};
    for (const s of (snaps || [])) {
      (byUser[s.user_id] ||= []).push(s);
    }

    let sent = 0, skipped = 0;
    for (const uid of Object.keys(byUser)) {
      const list = byUser[uid];                       // already month-desc
      const latest = list[0];
      if (!latest || latest.hcp_index == null || (latest.rounds_ct ?? 0) < MIN_ROUNDS) { skipped++; continue; }
      const prev = list.find((s, i) => i > 0 && s.hcp_index != null);
      const cur = Number(latest.hcp_index);
      let body: string;
      if (!prev) {
        body = `You've got your first Bad Golf handicap: ${fmt(cur)}. Nice.`;
      } else {
        const was = Number(prev.hcp_index);
        if (cur < was)      body = `Nice work — your handicap dropped from ${fmt(was)} to ${fmt(cur)} this month.`;
        else if (cur > was) body = `Rough month — your handicap went from ${fmt(was)} to ${fmt(cur)}.`;
        else                body = `Your handicap held steady at ${fmt(cur)} this month.`;
      }
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
          method: "POST",
          headers: { "authorization": `Bearer ${SERVICE_KEY}`, "content-type": "application/json" },
          body: JSON.stringify({
            user_ids: [uid],
            title: "Bad Golf",
            body,
            data: { type: "handicap" },
            collapse_id: `hcp:${latest.month}`,
          }),
        });
        sent++;
      } catch (_) { skipped++; }
    }
    return new Response(JSON.stringify({ sent, skipped }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(`error: ${e}`, { status: 500 });
  }
});
