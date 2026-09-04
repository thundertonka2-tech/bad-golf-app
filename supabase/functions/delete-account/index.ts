// =====================================================================
// Bad Golf — "delete-account" Supabase Edge Function
// ---------------------------------------------------------------------
// Deletes/anonymizes the calling user's data, revokes their Apple token
// (if they signed in with Apple), and deletes their auth account.
// This is what makes the in-app "Delete my account" button real, which
// Apple REQUIRES.
//
// Deploy (from the ios-app/supabase folder, with the Supabase CLI):
//   supabase functions deploy delete-account
// Set secrets (one time):
//   supabase secrets set SERVICE_ROLE_KEY=...        (Project Settings > API)
//   # Apple revocation (only needed because we offer Sign in with Apple):
//   supabase secrets set APPLE_CLIENT_ID=com.simplisticfishing.badgolf
//   supabase secrets set APPLE_TEAM_ID=XXXXXXXXXX
//   supabase secrets set APPLE_KEY_ID=YYYYYYYYYY
//   supabase secrets set APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
//
// SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically.
//
// ---------------------------------------------------------------------
// 2026-09-04 — THREE BUGS FIXED HERE. Read this before changing the order.
//
// 1. The old step 2 hard-deleted `profiles` BEFORE deleting the auth user,
//    and returned 500 if the auth delete failed. One real user
//    (an Apple private-relay account, 29 Aug) was left with an auth account
//    and no profile row for six days because of exactly that.
//
// 2. Every table op in the old step 1 and step 2 named a column that does
//    not exist:
//        games.user_id                      -> the column is owner_uid
//        friendships.user_id/friend_id      -> requester / addressee
//        game_invites.inviter_id/invitee_id -> from_user / to_user
//    supabase-js RESOLVES with { error } instead of throwing, so the
//    try/catch never fired and the report said "anonymized" / "deleted"
//    for three operations that had done nothing at all.
//
// 3. The whole of step 2 was redundant. Verified against pg_constraint:
//    profiles, friendships (both columns), game_invites (both columns),
//    player_stats, push_tokens, notif_prefs, handicap_snapshots,
//    player_claims and tournaments are ALL "on delete cascade" from
//    auth.users. Deleting the auth user removes them. feedback,
//    course_requests, outbound_invites and tournament_players are
//    "on delete set null", which is what we want.
//
//    `games` is the ONLY table with no foreign key to auth.users, which is
//    why it is the only one still handled explicitly below - and it must
//    stay BEFORE the auth delete, because nothing else will do it.
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Build the Apple client secret (a signed JWT) needed to revoke a token.
async function appleClientSecret(): Promise<string | null> {
  const clientId = Deno.env.get("APPLE_CLIENT_ID");
  const teamId = Deno.env.get("APPLE_TEAM_ID");
  const keyId = Deno.env.get("APPLE_KEY_ID");
  const pem = Deno.env.get("APPLE_PRIVATE_KEY");
  if (!clientId || !teamId || !keyId || !pem) return null;

  const der = pemToArrayBuffer(pem);
  const key = await crypto.subtle.importKey(
    "pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  return await create(
    { alg: "ES256", kid: keyId },
    {
      iss: teamId,
      iat: getNumericDate(0),
      exp: getNumericDate(60 * 5),
      aud: "https://appleid.apple.com",
      sub: clientId,
    },
    key,
  );
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function revokeApple(refreshOrAccessToken: string) {
  const secret = await appleClientSecret();
  const clientId = Deno.env.get("APPLE_CLIENT_ID");
  if (!secret || !clientId) return; // Apple revocation not configured — skip.
  try {
    await fetch("https://appleid.apple.com/auth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: secret,
        token: refreshOrAccessToken,
        token_type_hint: "refresh_token",
      }),
    });
  } catch (_e) { /* best effort */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Missing auth token" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Identify the caller from their JWT.
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Invalid session" }, 401);
  const user = userData.user;
  const uid = user.id;

  // Admin client (service role) for writes that bypass RLS.
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const report: Record<string, string> = {};

  // 1) Anonymize this user's shared rounds. `games` has NO foreign key to
  //    auth.users, so this is the one thing the cascade cannot do for us, and
  //    it has to happen while the user still exists.
  //    The column is owner_uid. It was `user_id` until 2026-09-04, which is a
  //    column this table has never had - so this step silently did nothing for
  //    every account deletion before that date.
  //    supabase-js resolves with { error }; it does not throw. Read the error.
  try {
    const { error: gErr } = await admin.from("games")
      .update({ owner_anonymized: true })
      .eq("owner_uid", uid);
    report["games"] = gErr ? "FAILED: " + gErr.message : "anonymized";
  } catch (e) {
    report["games"] = "FAILED: " + (e as Error).message;
  }

  // 2) Revoke the Apple token if the user used Sign in with Apple.
  const usedApple = (user.identities || []).some((i) => i.provider === "apple");
  if (usedApple) {
    const providerToken = (user as any)?.user_metadata?.provider_refresh_token ||
      (user as any)?.user_metadata?.provider_token;
    if (providerToken) await revokeApple(providerToken);
    report["apple_revoke"] = providerToken ? "attempted" : "no_token_on_file";
  }

  // 3) Delete the auth user. This CASCADES to profiles, friendships,
  //    game_invites, player_stats, push_tokens, notif_prefs,
  //    handicap_snapshots, player_claims and tournaments, and SET NULLs
  //    feedback, course_requests, outbound_invites and tournament_players.
  //    Nothing is deleted by hand before this point, so a failure here leaves
  //    the account exactly as it was and the user can simply try again.
  const { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) return json({ error: "Auth delete failed: " + delErr.message, report }, 500);
  report["auth_user"] = "deleted";
  report["cascaded"] =
    "profiles, friendships, game_invites, player_stats, push_tokens, notif_prefs, " +
    "handicap_snapshots, player_claims, tournaments";

  return json({ ok: true, report });
});
