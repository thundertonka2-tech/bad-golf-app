// =====================================================================
// Bad Golf — "seed-test-users" Supabase Edge Function
// ---------------------------------------------------------------------
// One-shot admin tool: creates ~15 real auth accounts for QA/testing and
// tags their profiles row is_test_user = true so they can be found and
// bulk-removed later via the companion delete-test-users function.
// Uses the Auth Admin API (admin.auth.admin.createUser), NOT a raw SQL
// insert into auth.users, so passwords/identities are created exactly
// the way Supabase's own signup flow creates them (real, loginable
// accounts, not lookalike rows).
//
// Gated by a shared secret header (x-seed-secret) so this endpoint can't
// be hit by anyone who only has the public anon key. Not meant to stay
// live long-term — safe to delete from the Supabase dashboard once used.
//
// Deploy: supabase functions deploy seed-test-users
// Run:
//   curl -X POST https://ojclesuwxhtzvrymqrwg.supabase.co/functions/v1/seed-test-users \
//     -H "Authorization: Bearer <anon key>" -H "apikey: <anon key>" \
//     -H "x-seed-secret: 68b8694d80ce6cfc874eb50ae6ee6d30"
// =====================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SECRET = "68b8694d80ce6cfc874eb50ae6ee6d30";
const TEST_PASSWORD = "BadGolfTest2026!";

const NAMES = [
  "Dana Griffin", "Miles Torres", "Priya Shah", "Owen Baxter", "Renata Cole",
  "Julian Foss", "Ines Marchetti", "Corey Whitfield", "Sasha Lindqvist", "Marcus Deleon",
  "Talia Brennan", "Desmond Achebe", "Lucia Ferraro", "Noah Kessler", "Ivy Sundberg",
];

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

  const results: Record<string, unknown>[] = [];
  for (let i = 0; i < NAMES.length; i++) {
    const n = i + 1;
    const email = `thundertonka2+bgtest${String(n).padStart(2, "0")}@gmail.com`;
    const full_name = NAMES[i];
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (error) {
      results.push({ email, error: error.message });
      continue;
    }
    const uid = data.user!.id;
    const { error: tagErr } = await admin.from("profiles").update({ is_test_user: true }).eq("id", uid);
    results.push({ email, id: uid, full_name, tagged: !tagErr, tag_error: tagErr?.message });
  }

  return json({ ok: true, password: TEST_PASSWORD, count: results.length, results });
});
