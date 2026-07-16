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

  // Admin client (service role) for deletes that bypass RLS.
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const report: Record<string, string> = {};

  // 1) Anonymize the player's name in shared games (don't delete others' rounds).
  //    We null the personal fields but keep the round intact for the crew.
  for (const table of ["games"]) {
    try {
      await admin.from(table).update({ owner_anonymized: true })
        .eq("user_id", uid);
      report[table] = "anonymized";
    } catch (e) { report[table] = "skip:" + (e as Error).message; }
  }

  // 1b) v603: hard-delete this user's PER-USER roster row (roster:<uid>) — their
  //     personal players + lifetime stats. The roster moved off the shared global
  //     row into a per-user row, which has no user_id set, so the anonymize step
  //     above never touches it. Without this a deleted account's roster would be
  //     orphaned in the games table (Apple/GDPR: account deletion must remove it).
  try {
    await admin.from("games").delete().eq("code", "roster:" + uid);
    report["roster"] = "deleted";
  } catch (e) { report["roster"] = "skip:" + (e as Error).message; }

  // 2) Hard-delete personal-only rows.
  for (const table of ["friendships", "game_invites", "profiles"]) {
    try {
      // friendships / invites may reference the user in either direction.
      if (table === "friendships") {
        await admin.from(table).delete().or(`user_id.eq.${uid},friend_id.eq.${uid}`);
      } else if (table === "game_invites") {
        await admin.from(table).delete().or(`inviter_id.eq.${uid},invitee_id.eq.${uid}`);
      } else {
        await admin.from(table).delete().eq("id", uid);
      }
      report[table] = "deleted";
    } catch (e) { report[table] = "skip:" + (e as Error).message; }
  }

  // 3) Revoke Apple token if the user used Sign in with Apple.
  const usedApple = (user.identities || []).some((i) => i.provider === "apple");
  if (usedApple) {
    const providerToken = (user as any)?.user_metadata?.provider_refresh_token ||
      (user as any)?.user_metadata?.provider_token;
    if (providerToken) await revokeApple(providerToken);
    report["apple_revoke"] = providerToken ? "attempted" : "no_token_on_file";
  }

  // 4) Delete the auth user itself.
  const { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) return json({ error: "Auth delete failed: " + delErr.message, report }, 500);
  report["auth_user"] = "deleted";

  return json({ ok: true, report });
});
