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

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        // v829 (Tyler/Kevin): "it takes forever to sync but once it does, it's
        // correct." Before this, requestRound() only ever fired once, from
        // BadGolfWatchApp's .onAppear, and only if the reachability check
        // happened to already be true at that exact instant. If the phone
        // wasn't reachable yet (Bluetooth/WiFi still reconnecting after the
        // watch woke up — the normal case), that one shot silently no-op'd
        // and NOTHING retried it. The watch was then just waiting on the
        // phone's best-effort transferUserInfo, which the OS can delay by a
        // long time. Activation completing is one more moment worth trying.
        if state == .activated { requestRound() }
    }

    // v829: THE fix for the slow-resync complaint. WCSessionDelegate calls this
    // whenever reachability flips (e.g. the watch wakes and re-pairs with the
    // phone over Bluetooth) — previously unimplemented, so that moment was
    // wasted. Now the watch immediately re-asks for the current round the
    // instant it *can* reach the phone, instead of waiting for the next
    // passive transferUserInfo delivery. This is the same idea as 18Birdies
    // "keeping the app open" — we can't force watchOS to keep our process
    // resident, but we CAN make sure the very first moment we're reachable
    // again, we actively ask, rather than sitting there hoping.
    func sessionReachabilityDidChange(_ session: WCSession) {
        if session.isReachable { requestRound() }
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
