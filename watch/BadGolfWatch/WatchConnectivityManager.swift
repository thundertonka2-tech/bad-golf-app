// Bad Golf Watch — WatchConnectivity (watch side)
// Receives the round handoff (active round + course greens + session token)
// from the paired iPhone at round start, so the watch is primed to work
// phone-free. Also a relay path if the watch has no direct network.

import Foundation
import WatchConnectivity

final class WatchConnectivityManager: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchConnectivityManager()
    weak var store: RoundStore?     // set by the App on launch

    private override init() {
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {}

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
        guard let data = payload["handoff"] as? Data,
              let handoff = try? JSONDecoder().decode(RoundHandoff.self, from: data) else { return }
        Task { @MainActor in self.store?.apply(handoff: handoff) }
    }

    /// Ask the phone to send the current round (e.g. on watch app launch).
    func requestRound() {
        guard WCSession.default.activationState == .activated,
              WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(["request": "round"], replyHandler: nil, errorHandler: nil)
    }
}
