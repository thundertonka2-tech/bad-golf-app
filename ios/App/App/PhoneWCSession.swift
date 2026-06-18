// Bad Golf — Phone side WatchConnectivity + App Group writer
// Lives in the iOS app target (the Capacitor app). Sends the active round +
// course greens + the Supabase session token to the watch, and mirrors the
// token/playerId into the shared App Group so the watch can read it cold.

import Foundation
import WatchConnectivity

final class PhoneWCSession: NSObject, WCSessionDelegate {
    static let shared = PhoneWCSession()

    private let group = UserDefaults(suiteName: "group.com.simplisticfishing.badgolf")

    // Diagnostics: last applicationContext result, surfaced via status().
    private(set) var lastCtxOk = false
    private(set) var lastErr = ""

    private override init() {
        super.init()
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
        guard WCSession.default.activationState == .activated else {
            lastErr = "wc not activated"; lastCtxOk = false; return
        }
        let payload: [String: Any] = ["handoff": data]
        // applicationContext = latest-wins snapshot, delivered when watch wakes.
        do { try WCSession.default.updateApplicationContext(payload); lastCtxOk = true; lastErr = "" }
        catch { lastCtxOk = false; lastErr = String(describing: error) }
        // Also queue a guaranteed transfer.
        WCSession.default.transferUserInfo(payload)
    }

    /// Diagnostic snapshot of the watch link (read by the in-app ⌚? button).
    func status() -> [String: Any] {
        let s = WCSession.default
        var d: [String: Any] = [
            "activationState": s.activationState.rawValue,
            "reachable": s.isReachable,
            "lastContextSetOk": lastCtxOk,
            "lastError": lastErr
        ]
        #if os(iOS)
        d["paired"] = s.isPaired
        d["watchAppInstalled"] = s.isWatchAppInstalled
        #endif
        return d
    }

    // Watch can ask the phone to (re)send the round.
    func session(_ s: WCSession, didReceiveMessage message: [String : Any]) {
        if message["request"] as? String == "round" {
            NotificationCenter.default.post(name: .badGolfWatchRequestedRound, object: nil)
        }
    }
    func session(_ s: WCSession, activationDidCompleteWith st: WCSessionActivationState, error: Error?) {}
    func sessionDidBecomeInactive(_ s: WCSession) {}
    func sessionDidDeactivate(_ s: WCSession) { WCSession.default.activate() }
}

extension Notification.Name {
    static let badGolfWatchRequestedRound = Notification.Name("badGolfWatchRequestedRound")
}
