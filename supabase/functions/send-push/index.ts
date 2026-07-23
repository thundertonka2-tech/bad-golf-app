// Supabase Edge Function: send-push  (generic APNs sender)
// Refactor of `send-wager-push` core — copy-driven by the caller so every Bad Golf
// notification (#1 friend request, #2 round start, #3 round complete, #4 wager,
// #5 monthly handicap, #6 admin re-map) flows through ONE function.
//
// Secrets required (same as send-wager-push): APNS_KEY_ID, APNS_TEAM_ID,
//   APNS_BUNDLE_ID, APNS_P8 (the .p8 contents), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//
// Body contract:
//   { user_ids: ["uuid", ...], title: "Bad Golf", body: "...",
//     data: { type: "wager|round_start|round_complete|handicap|remap|friend_request", ... },
//     collapse_id: "optional" }
//
// Recipient-side opt-outs: reads public.notif_prefs and drops anyone whose flag for
// this notification type is explicitly false. A missing row = default ON.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const KEY_ID  = Deno.env.get("APNS_KEY_ID")!;
const TEAM_ID = Deno.env.get("APNS_TEAM_ID")!;
const TOPIC   = Deno.env.get("APNS_BUNDLE_ID")!;          // bundle id = APNs topic
const P8      = Deno.env.get("APNS_P8")!;                  // -----BEGIN PRIVATE KEY----- ...
const APNS_HOST = "https://api.push.apple.com";           // sandbox: api.sandbox.push.apple.com

// data.type -> notif_prefs column. Types not listed here are never gated.
const TYPE_TO_PREF: Record<string, string> = {
  round_start:    "friend_starts",
  round_complete: "friend_completes",
  wager:          "wager_requests",
  handicap:       "monthly_handicap",
  remap:          "admin_remap",
};

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

export async function sendPushCore(opts: {
  user_ids: string[]; title?: string; body?: string;
  data?: Record<string, unknown>; collapse_id?: string | null;
}) {
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let recipients = Array.from(new Set((opts.user_ids || []).filter(Boolean)));
  if (!recipients.length) return { sent: {}, skipped: "no recipients" };

  // Honor opt-outs for the gated types.
  const data = opts.data || {};
  const prefCol = TYPE_TO_PREF[String((data as any).type || "")];
  if (prefCol) {
    try {
      const { data: prefs } = await supa.from("notif_prefs").select(`user_id, ${prefCol}`).in("user_id", recipients);
      const optedOut = new Set((prefs || []).filter((r: any) => r[prefCol] === false).map((r: any) => r.user_id));
      recipients = recipients.filter((id) => !optedOut.has(id));
    } catch (_) { /* table may not exist yet — default ON */ }
  }
  if (!recipients.length) return { sent: {}, skipped: "all opted out" };

  const { data: toks } = await supa.from("push_tokens").select("token").in("user_id", recipients);
  if (!toks?.length) return { sent: {}, skipped: "no tokens" };

  const jwt = await apnsJwt();
  // Custom keys live alongside `aps` at the payload root so the native client reads
  // them as notification.data.* (matches push-bridge.js).
  // Custom club-swing sound on round START / FINISH notifications (bundled in the
  // iOS app as swing.caf). Everything else keeps the default system sound.
  const _ntype = String((data as any).type || "");
  const _sound = (_ntype === "round_start" || _ntype === "round_complete") ? "swing.caf" : "default";
  const payloadObj: Record<string, unknown> = {
    aps: { alert: { title: opts.title || "Bad Golf", body: opts.body || "" }, sound: _sound },
    data: data,
  };
  // Also flatten the data keys to the root for clients that read them there.
  for (const k of Object.keys(data)) payloadObj[k] = (data as any)[k];
  const payload = JSON.stringify(payloadObj);

  const headers: Record<string, string> = {
    "authorization": `bearer ${jwt}`,
    "apns-topic": TOPIC,
    "apns-push-type": "alert",
    "apns-priority": "10",
  };
  if (opts.collapse_id) headers["apns-collapse-id"] = String(opts.collapse_id).slice(0, 64);

  const results: Record<string, number> = {};
  for (const { token } of toks) {
    const r = await fetch(`${APNS_HOST}/3/device/${token}`, { method: "POST", headers, body: payload });
    results[token] = r.status;                       // 200 = delivered; 410 = expired (delete)
    if (r.status === 410) { try { await supa.from("push_tokens").delete().eq("token", token); } catch (_) {} }
  }
  return { sent: results };
}

// CORS so the in-app WebView (Capacitor) / browser preflight succeeds. supabase-js
// functions.invoke sends application/json + auth headers, which triggers a CORS
// preflight OPTIONS request. Without answering it (and without CORS headers on the
// real responses), the WebView blocks the actual POST and NO push ever sends.
// 2026-07-23: this preflight 500 was the true blocker behind "notifications never
// arrive" — the earlier contract fix only helped direct (curl) POSTs.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Answer the CORS preflight before touching the body (OPTIONS has no JSON body).
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  try {
    const body = await req.json();
    const user_ids: string[] = Array.isArray(body.user_ids)
      ? body.user_ids
      : (body.user_id ? [body.user_id] : (body.to_user ? [body.to_user] : []));
    if (!user_ids.length) return new Response("missing user_ids", { status: 400, headers: CORS_HEADERS });
    const out = await sendPushCore({
      user_ids,
      title: body.title,
      body: body.body,
      data: body.data || {},
      collapse_id: body.collapse_id ?? null,
    });
    return new Response(JSON.stringify(out), { headers: { ...CORS_HEADERS, "content-type": "application/json" } });
  } catch (e) {
    return new Response(`error: ${e}`, { status: 500, headers: CORS_HEADERS });
  }
});
