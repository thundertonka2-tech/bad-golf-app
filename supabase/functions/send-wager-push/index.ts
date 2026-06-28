// Supabase Edge Function: send-wager-push
// Sends an APNs push to the recipient of a WB:/W: game_invites row.
// Secrets required: APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_P8 (the .p8 contents),
//                   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Invoke with JSON: { to_user, from_name, course, round_code }  (or pass a game_invites row).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const KEY_ID  = Deno.env.get("APNS_KEY_ID")!;
const TEAM_ID = Deno.env.get("APNS_TEAM_ID")!;
const TOPIC   = Deno.env.get("APNS_BUNDLE_ID")!;          // bundle id = APNs topic
const P8      = Deno.env.get("APNS_P8")!;                  // -----BEGIN PRIVATE KEY----- ...
const APNS_HOST = "https://api.push.apple.com";           // sandbox: api.sandbox.push.apple.com

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
async function apnsJwt(): Promise<string> {
  const header  = b64url(new TextEncoder().encode(JSON.stringify({ alg: "ES256", kid: KEY_ID })));
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ iss: TEAM_ID, iat: Math.floor(Date.now() / 1000) })));
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToArrayBuffer(P8), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(data)));
  return `${data}.${b64url(sig)}`;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    // Accept either a flat payload or a raw game_invites row.
    const toUser   = body.to_user ?? body.record?.to_user;
    const course   = body.course ?? body.record?.course ?? "a round";
    const fromName = body.from_name ?? "A friend";
    let roundCode  = body.round_code;
    if (!roundCode && body.record?.game_code) {
      const gc = String(body.record.game_code);
      const raw = gc.startsWith("WB:") ? gc.slice(3) : gc.startsWith("W:") ? gc.slice(2) : gc;
      roundCode = raw.split("~")[0];
    }
    if (!toUser) return new Response("missing to_user", { status: 400 });

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: toks } = await supa.from("push_tokens").select("token").eq("user_id", toUser);
    if (!toks?.length) return new Response("no tokens", { status: 200 });

    const jwt = await apnsJwt();
    const aps = JSON.stringify({
      aps: { alert: { title: "Bad Golf", body: `${fromName} sent you a bet on ${course}` }, sound: "default" },
      wager_round_code: roundCode ?? "",
    });
    const results: Record<string, number> = {};
    for (const { token } of toks) {
      const r = await fetch(`${APNS_HOST}/3/device/${token}`, {
        method: "POST",
        headers: {
          "authorization": `bearer ${jwt}`,
          "apns-topic": TOPIC,
          "apns-push-type": "alert",
          "apns-priority": "10",
        },
        body: aps,
      });
      results[token] = r.status; // 200 = delivered; 410 = token expired (delete it)
      if (r.status === 410) { try { await supa.from("push_tokens").delete().eq("token", token); } catch (_) {} }
    }
    return new Response(JSON.stringify({ sent: results }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(`error: ${e}`, { status: 500 });
  }
});
