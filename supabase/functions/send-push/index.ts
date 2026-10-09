// Supabase Edge Function: send-push  (generic APNs + FCM sender)
// Refactor of `send-wager-push` core — copy-driven by the caller so every Bad Golf
// notification (#1 friend request, #2 round start, #3 round complete, #4 wager,
// #5 monthly handicap, #6 admin re-map) flows through ONE function.
//
// 2026-08 ANDROID: push_tokens rows now carry platform ('ios' | 'android').
// iOS tokens go to APNs exactly as before; android tokens go to Firebase Cloud
// Messaging (HTTP v1). FCM needs ONE extra secret:
//   FIREBASE_SERVICE_ACCOUNT = the full service-account .json from the Firebase
//   console (Project settings -> Service accounts -> Generate new private key).
// Until that secret exists, android tokens are skipped silently and iOS is
// completely unaffected.
//
// 2026-09-24 (v1772 diagnostics): log every send -- type, recipients, recipients with
// no token, and each APNs / FCM status (+ reason body on failure) -- so "the invite
// never arrived" can be answered from the function logs instead of guessed.
//
// 2026-10-01 (v1840 LANGUAGES): every push is translated into EACH RECIPIENT's own
// language (profiles.lang, written by the app) — see i18n.ts. The caller still sends
// English. Unknown language / missing dictionary = English, exactly as before.
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
import { translatePush } from "./i18n.ts";

const KEY_ID  = Deno.env.get("APNS_KEY_ID")!;
const TEAM_ID = Deno.env.get("APNS_TEAM_ID")!;
const TOPIC   = Deno.env.get("APNS_BUNDLE_ID")!;          // bundle id = APNs topic
const P8      = Deno.env.get("APNS_P8")!;                  // -----BEGIN PRIVATE KEY----- ...
const APNS_HOST = "https://api.push.apple.com";           // sandbox: api.sandbox.push.apple.com
const FIREBASE_SA = Deno.env.get("FIREBASE_SERVICE_ACCOUNT") || "";   // optional until Android ships

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

// ---- FCM (Android) ---------------------------------------------------------
// OAuth2 access token from the Firebase service account, cached ~50 minutes.
let _fcmTok: { token: string; exp: number } | null = null;
async function fcmAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_fcmTok && _fcmTok.exp > now + 60) return _fcmTok.token;
  const header  = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = b64url(new TextEncoder().encode(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  })));
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToArrayBuffer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data)));
  const jwt = `${data}.${b64url(sig)}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("FCM token exchange failed: " + JSON.stringify(j));
  _fcmTok = { token: j.access_token, exp: now + Math.min(3500, Number(j.expires_in || 3600)) };
  return _fcmTok.token;
}

export async function sendPushCore(opts: {
  user_ids: string[]; title?: string; body?: string;
  data?: Record<string, unknown>; collapse_id?: string | null;
}) {
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let recipients = Array.from(new Set((opts.user_ids || []).filter(Boolean)));
  const data = opts.data || {};
  const _ntype = String((data as any).type || "");
  console.log(`send-push type=${_ntype} recipients=${recipients.join(",")} collapse=${opts.collapse_id || ""}`);
  if (!recipients.length) return { sent: {}, skipped: "no recipients" };

  // Honor opt-outs for the gated types.
  const prefCol = TYPE_TO_PREF[_ntype];
  if (prefCol) {
    try {
      const { data: prefs } = await supa.from("notif_prefs").select(`user_id, ${prefCol}`).in("user_id", recipients);
      const optedOut = new Set((prefs || []).filter((r: any) => r[prefCol] === false).map((r: any) => r.user_id));
      if (optedOut.size) console.log(`send-push type=${_ntype} opted-out=${Array.from(optedOut).join(",")}`);
      recipients = recipients.filter((id) => !optedOut.has(id));
    } catch (_) { /* table may not exist yet — default ON */ }
  }
  if (!recipients.length) return { sent: {}, skipped: "all opted out" };

  const { data: toks } = await supa.from("push_tokens").select("token, platform, user_id").in("user_id", recipients);
  const withTok = new Set((toks || []).map((t: any) => t.user_id));
  const noTok = recipients.filter((id) => !withTok.has(id));
  if (noTok.length) console.log(`send-push type=${_ntype} NO TOKEN for ${noTok.join(",")}`);
  if (!toks?.length) return { sent: {}, skipped: "no tokens" };
  const iosToks = toks.filter((t: any) => (t.platform || "ios") !== "android");
  const andToks = toks.filter((t: any) => (t.platform || "ios") === "android");

  // v1840: each recipient's language -> the title/body they read.
  const langOf: Record<string, string> = {};
  try {
    const { data: profs } = await supa.from("profiles").select("id, lang").in("id", recipients);
    for (const p of (profs || []) as any[]) if (p.lang) langOf[p.id] = String(p.lang);
  } catch (_) { /* column missing -> everyone English */ }
  const copyCache: Record<string, { title: string; body: string }> = {};
  const copyFor = async (uid: string) => {
    const L = langOf[uid] || "en";
    if (!copyCache[L]) {
      try { copyCache[L] = await translatePush(L, opts.title || "Bad Golf", opts.body || ""); }
      catch (_) { copyCache[L] = { title: opts.title || "Bad Golf", body: opts.body || "" }; }
    }
    return copyCache[L];
  };

  const results: Record<string, number> = {};

  // ---- APNs (iOS) ----
  if (iosToks.length) {
    const jwt = await apnsJwt();
    // Custom club-swing sound on round START / FINISH notifications (bundled in the
    // iOS app as swing.caf). Everything else keeps the default system sound.
    const _sound = (_ntype === "round_start" || _ntype === "round_complete") ? "swing.caf" : "default";
    const payloadFor = (copy: { title: string; body: string }) => {
      // Custom keys live alongside `aps` at the payload root so the native client reads
      // them as notification.data.* (matches push-bridge.js).
      const payloadObj: Record<string, unknown> = {
        aps: { alert: { title: copy.title, body: copy.body }, sound: _sound },
        data: data,
      };
      // Also flatten the data keys to the root for clients that read them there.
      for (const k of Object.keys(data)) payloadObj[k] = (data as any)[k];
      return JSON.stringify(payloadObj);
    };

    const headers: Record<string, string> = {
      "authorization": `bearer ${jwt}`,
      "apns-topic": TOPIC,
      "apns-push-type": "alert",
      "apns-priority": "10",
    };
    if (opts.collapse_id) headers["apns-collapse-id"] = String(opts.collapse_id).slice(0, 64);

    for (const { token, user_id } of iosToks as any[]) {
      const copy = await copyFor(user_id);
      const r = await fetch(`${APNS_HOST}/3/device/${token}`, { method: "POST", headers, body: payloadFor(copy) });
      results[token] = r.status;                       // 200 = delivered; 410 = expired (delete)
      let reason = "";
      if (r.status !== 200) { try { reason = await r.text(); } catch (_) {} }
      console.log(`send-push apns type=${_ntype} user=${user_id} lang=${langOf[user_id] || "en"} tok=${String(token).slice(0, 8)} status=${r.status}${reason ? " reason=" + reason : ""}`);
      if (r.status === 410) { try { await supa.from("push_tokens").delete().eq("token", token); } catch (_) {} }
    }
  }

  // ---- FCM (Android) ----
  if (andToks.length && FIREBASE_SA) {
    try {
      const sa = JSON.parse(FIREBASE_SA);
      const at = await fcmAccessToken(sa);
      // FCM v1: every `data` value MUST be a string.
      const strData: Record<string, string> = {};
      for (const k of Object.keys(data)) strData[k] = String((data as any)[k]);
      for (const { token, user_id } of andToks as any[]) {
        const copy = await copyFor(user_id);
        const msg: Record<string, unknown> = {
          message: {
            token,
            notification: { title: copy.title, body: copy.body },
            data: strData,
            android: {
              priority: "HIGH",
              ...(opts.collapse_id ? { collapse_key: String(opts.collapse_id).slice(0, 64).replace(/[^A-Za-z0-9_-]/g, "_") } : {}),
            },
          },
        };
        const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
          method: "POST",
          headers: { "authorization": `Bearer ${at}`, "content-type": "application/json" },
          body: JSON.stringify(msg),
        });
        results[token] = r.status;
        console.log(`send-push fcm type=${_ntype} user=${user_id} lang=${langOf[user_id] || "en"} tok=${String(token).slice(0, 8)} status=${r.status}`);
        // 404 UNREGISTERED = the app was uninstalled / token rotated — clean it up.
        if (r.status === 404) { try { await supa.from("push_tokens").delete().eq("token", token); } catch (_) {} }
      }
    } catch (e) {
      console.error("FCM send failed", e);
    }
  } else if (andToks.length) {
    console.log(`send-push: ${andToks.length} android token(s) skipped — FIREBASE_SERVICE_ACCOUNT not set.`);
  }

  return { sent: results };
}

// CORS so the in-app WebView (Capacitor) / browser preflight succeeds. supabase-js
// functions.invoke sends application/json + auth headers, which triggers a CORS
// preflight OPTIONS request. Without answering it (and without CORS headers on the
// real responses), the WebView blocks the actual POST and NO push ever sends.
// 2026-07-23: this preflight 500 was the true blocker behind push never arriving.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// v1903 (audit #2 #1): WHO is calling. The gateway's verify_jwt only proves the token is one
// Supabase minted - and the public anon key is one of those, so anyone with the app's anon key
// could push any text to every user. The signature is already verified upstream; here we
// read the claims: anon is refused, a signed-in user is allowed (that is how the app sends
// its own invites/round pushes) but rate-limited and kept off the admin-only types, and the
// service role (pg_net callers such as _league_push) passes untouched.
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
const ADMIN_ONLY_TYPES = new Set(["handicap", "remap", "admin", "broadcast"]);
const USER_MAX_RECIPIENTS = 100;       // a friends list / a tournament field
const USER_MAX_PER_HOUR   = 120;       // pushes one account may trigger per hour
const USER_MAX_RCPT_HOUR  = 600;       // recipients one account may reach per hour

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  try {
    const who = callerClaims(req);
    if (who.role !== "service_role" && who.role !== "authenticated") {
      console.log(`send-push REFUSED role=${who.role || "none"}`);
      return new Response("forbidden", { status: 403, headers: CORS_HEADERS });
    }
    const body = await req.json();
    let user_ids: string[] = Array.isArray(body.user_ids)
      ? body.user_ids
      : (body.user_id ? [body.user_id] : (body.to_user ? [body.to_user] : []));
    user_ids = user_ids.filter((x) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x));
    if (!user_ids.length) return new Response("missing user_ids", { status: 400, headers: CORS_HEADERS });
    if (who.role === "authenticated") {
      if (!who.sub) return new Response("forbidden", { status: 403, headers: CORS_HEADERS });
      const ntype = String((body.data && body.data.type) || "");
      const supaSvc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      if (ADMIN_ONLY_TYPES.has(ntype)) {
        let isAdmin = false;
        try { const { data: pr } = await supaSvc.from("profiles").select("role").eq("id", who.sub).maybeSingle(); isAdmin = !!pr && (pr as any).role === "admin"; } catch (_) {}
        if (!isAdmin) { console.log(`send-push REFUSED admin-type=${ntype} caller=${who.sub}`); return new Response("forbidden", { status: 403, headers: CORS_HEADERS }); }
      }
      if (user_ids.length > USER_MAX_RECIPIENTS) user_ids = user_ids.slice(0, USER_MAX_RECIPIENTS);
      body.title = String(body.title || "Bad Golf").slice(0, 80);
      body.body  = String(body.body || "").slice(0, 300);
      // Per-caller budget (public.push_audit, service-role only).
      try {
        const since = new Date(Date.now() - 3600 * 1000).toISOString();
        const { data: rows } = await supaSvc.from("push_audit").select("n").eq("caller", who.sub).gte("at", since);
        const calls = (rows || []).length, rcpts = (rows || []).reduce((s: number, r: any) => s + (Number(r.n) || 0), 0);
        if (calls >= USER_MAX_PER_HOUR || rcpts >= USER_MAX_RCPT_HOUR) {
          console.log(`send-push RATE-LIMITED caller=${who.sub} calls=${calls} rcpts=${rcpts}`);
          return new Response("rate limited", { status: 429, headers: CORS_HEADERS });
        }
        await supaSvc.from("push_audit").insert({ caller: who.sub, n: user_ids.length, ntype });
      } catch (e) { console.log("send-push audit skipped: " + e); }
    }
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
