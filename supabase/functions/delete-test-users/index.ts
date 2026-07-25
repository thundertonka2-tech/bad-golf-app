// =====================================================================
// Bad Golf — "delete-test-users" Supabase Edge Function
// ---------------------------------------------------------------------
// Companion to seed-test-users. Finds every profiles row tagged
// is_test_user = true and hard-deletes the underlying auth account via
// the Admin API (admin.auth.admin.deleteUser) — same mechanism the
// existing delete-account function uses for a self-service delete.
// profiles.id has ON DELETE CASCADE from auth.users, so the profile row
// disappears automatically; this also cleans up their per-user roster
// row and any friendships/invites first, mirroring delete-account's
// cleanup so no orphaned rows are left in shared tables.
//
// Gated by the same shared-secret header as seed-test-users.
//
// Deploy: supabase functions deploy delete-test-users
// Run:
//   curl -X POST https://ojclesuwxhtzvrymqrwg.supabase.co/functions/v1/delete-test-users \
//     -H "Authorization: Bearer <anon key>" -H "apikey: <anon key>" \
//     -H "x-seed-secret: 68b8694d80ce6cfc874eb50ae6ee6d30"
//
// WARNING: this deletes EVERY account currently tagged is_test_user = true,
// including any flagged manually (e.g. via `update profiles set
// is_test_user = true where id = ...`) — not just ones seed-test-users made.
// Check `select display_name, my_player from profiles where is_test_user`
// in the SQL Editor before running if you want to confirm the list first.
// =====================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SECRET = "68b8694d80ce6cfc874eb50ae6ee6d30";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-seed-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.headers.get("x-seed-secret") !== SECRET) return json({ error: "forbidden" }, 403);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: rows, error } = await admin.from("profiles").select("id").eq("is_test_user", true);
  if (error) return json({ error: error.message }, 500);

  const report: Record<string, unknown>[] = [];
  for (const row of rows ?? []) {
    const uid = (row as { id: string }).id;
    try { await admin.from("games").delete().eq("code", "roster:" + uid); } catch (_e) { /* best effort */ }
    try { await admin.from("friendships").delete().or(`user_id.eq.${uid},friend_id.eq.${uid}`); } catch (_e) { /* best effort */ }
    try { await admin.from("game_invites").delete().or(`inviter_id.eq.${uid},invitee_id.eq.${uid}`); } catch (_e) { /* best effort */ }
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    report.push({ id: uid, deleted: !delErr, error: delErr?.message });
  }

  return json({ ok: true, count: report.length, report });
});
