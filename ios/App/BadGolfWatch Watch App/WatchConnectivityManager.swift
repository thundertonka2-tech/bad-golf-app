// Bad Golf Watch — WatchConnectivity (watch side)
// Receives the round handoff (active round + course greens + session token)
// from the paired iPhone at round start, so the watch is primed to work
// phone-free. Also a relay path if the watch has no direct network.
//
// Resilience (Kevin, June 2026 — flaky watch<->phone link): we publish the live
// reachability so the moment the link comes back we re-request the round and it
// refreshes. Distances themselves never depend on the phone — the watch ranges
// off its OWN GPS + cached greens (see DistanceView's last-known fallback) — but
// a stale round/score catches up as soon as the phone is reachable again.

import Foundation
import WatchConnectivity
import Combine

final class WatchConnectivityManager: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchConnectivityManager()
    weak var store: RoundStore?     // set by the App on launch

    /// Live phone-link state. Used to auto-refresh the round on reconnect.
    @Published var isReachable: Bool = false

    private override init() {
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        let reachable = (state == .activated) && session.isReachable
        Task { @MainActor in self.isReachable = reachable }
    }

    // Reachability flips as the phone link comes and goes. On RECONNECT (false->true)
    // pull a fresh round so anything that changed while we were dark updates right away.
    func sessionReachabilityDidChange(_ session: WCSession) {
        let reachable = session.isReachable
        Task { @MainActor in
            let wasReachable = self.isReachable
            self.isReachable = reachable
            if reachable && !wasReachable { self.requestRound() }
        }
    }

    // Phone sends the round via transferUserInfo / updateApplicationContext.
    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String : Any]) {
        handle(payload: applicationContext)
    }
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String : Any] = [:]) {
        handle(payload: userInfo)
    }
    func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        handle(payload: message)
    }

    private func handle(payload: [String: Any]) {
        // The phone sends `handoff` as a JSON string (UTF-8 Data) carrying
        // token + optional round + optional course. Parse it loosely and let
        // RoundStore apply it via the tolerant parsers (avoids strict Codable
        // pitfalls with Int-keyed dicts / Date / Data).
        guard let data = payload["handoff"] as? Data,
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        Task { @MainActor in self.store?.applyPayload(dict) }
    }

    /// Ask the phone to send the current round (e.g. on watch app launch).
    func requestRound() {
        guard WCSession.default.activationState == .activated,
              WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(["request": "round"], replyHandler: nil, errorHandler: nil)
    }
}
