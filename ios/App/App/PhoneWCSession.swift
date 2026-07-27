// Bad Golf — Phone side WatchConnectivity + App Group writer
// Lives in the iOS app target (the Capacitor app). Sends the active round +
// course greens + the Supabase session token to the watch, and mirrors the
// token/playerId into the shared App Group so the watch can read it cold.
//
// v890 (Tyler, watch audit): the watch's requestRound() used to arrive here and
// die — didReceiveMessage only posted a NotificationCenter notification that
// NOTHING anywhere observed, so every watch-side "re-ask the phone" fix since
// v829 (launch, wrist-raise scenePhase, reachability reconnect) was calling
// into a void. The phone now CACHES the last handoff (memory + App Group) and
// ANSWERS the request directly — including via the reply-handler variant, so
// the watch gets the round back in the same round-trip even when the request
// woke this app from the background.

import Foundation
import WatchConnectivity

final class PhoneWCSession: NSObject, WCSessionDelegate {
    static let shared = PhoneWCSession()

    private let group = UserDefaults(suiteName: "group.com.simplisticfishing.badgolf")

    // Diagnostics: last applicationContext result, surfaced via status().
    private(set) var lastCtxOk = false
    private(set) var lastErr = ""

    // v890: last handoff sent — the answer to the watch's "send me the round".
    // Mirrored to the App Group so a relaunched phone app can still answer
    // before the web layer has rebuilt and re-synced.
    private var lastHandoff: Data? = nil
    private var lastQueuedHandoff: Data? = nil

    private override init() {
        super.init()
        lastHandoff = group?.data(forKey: "bg_last_handoff")
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    /// Called from JS (via the WatchBridge plugin) on login and round changes.
    /// `roundJSON` is a RoundHandoff-shaped dictionary already built in JS.
    func sync(token: String?, playerId: String?, handoffData: Data?) {
        if let t = token { group?.set(t, forKey: "bg_access_token") }
        if let p = playerId { group?.set(p, forKey: "bg_player_id") }

        guard let data = handoffData else { return }
        lastHandoff = data
        group?.set(data, forKey: "bg_last_handoff")
        guard WCSession.default.activationState == .activated else {
            lastErr = "wc not activated"; lastCtxOk = false; return
        }
        let payload: [String: Any] = ["handoff": data]
        // applicationContext = latest-wins snapshot, delivered when watch wakes.
        do { try WCSession.default.updateApplicationContext(payload); lastCtxOk = true; lastErr = "" }
        catch { lastCtxOk = false; lastErr = String(describing: error) }
        // v890: transferUserInfo is guaranteed-but-QUEUED delivery. The 8s web
        // heartbeat was queueing a fresh transfer on EVERY tick without cancelling
        // the old ones, so a backlog of stale payloads could sit ahead of fresh
        // yardage data. Only queue when the content actually changed (or the
        // context write failed), and cancel the stale queue first so the newest
        // payload is always next in line.
        if data != lastQueuedHandoff || !lastCtxOk {
            WCSession.default.outstandingUserInfoTransfers.forEach { $0.cancel() }
            WCSession.default.transferUserInfo(payload)
            lastQueuedHandoff = data
        }
    }

    /// Diagnostic snapshot of the watch link (read by the in-app ⌚? button).
    func status() -> [String: Any] {
        let s = WCSession.default
        var d: [String: Any] = [
            "activationState": s.activationState.rawValue,
            "reachable": s.isReachable,
            "lastContextSetOk": lastCtxOk,
            "lastError": lastErr,
            "hasCachedHandoff": lastHandoff != nil   // v890: visible in the ⌚? diagnostic
        ]
        #if os(iOS)
        d["paired"] = s.isPaired
        d["watchAppInstalled"] = s.isWatchAppInstalled
        #endif
        return d
    }

    // Watch asks the phone to (re)send the round — no replyHandler variant.
    // v890: actually ANSWER it (re-push the cached handoff) instead of only
    // posting a notification nothing observes. The notification stays for any
    // future observer, but delivery no longer depends on one existing.
    func session(_ s: WCSession, didReceiveMessage message: [String : Any]) {
        if message["request"] as? String == "round" {
            if let data = lastHandoff {
                try? WCSession.default.updateApplicationContext(["handoff": data])
            }
            NotificationCenter.default.post(name: .badGolfWatchRequestedRound, object: nil)
        }
    }

    // v890: reply-handler variant — the watch now asks WITH a replyHandler, so
    // the cached handoff rides back in the SAME round-trip. Works even when the
    // request woke this app in the background (no web layer needed).
    func session(_ s: WCSession, didReceiveMessage message: [String : Any], replyHandler: @escaping ([String : Any]) -> Void) {
        if message["request"] as? String == "round", let data = lastHandoff {
            replyHandler(["handoff": data])
        } else {
            replyHandler([:])
        }
        NotificationCenter.default.post(name: .badGolfWatchRequestedRound, object: nil)
    }

    func session(_ s: WCSession, activationDidCompleteWith st: WCSessionActivationState, error: Error?) {}
    func sessionDidBecomeInactive(_ s: WCSession) {}
    func sessionDidDeactivate(_ s: WCSession) { WCSession.default.activate() }
}

extension Notification.Name {
    static let badGolfWatchRequestedRound = Notification.Name("badGolfWatchRequestedRound")
}
