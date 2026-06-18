// Bad Golf — Capacitor plugin exposing the watch bridge to the web app.
// Add this to the iOS app target. It lets golf-app.html call:
//   Capacitor.Plugins.WatchBridge.syncSession({ token, playerId, handoff })
// where `handoff` is a JSON string shaped like RoundHandoff (round + holes).

import Foundation
import Capacitor

@objc(WatchBridgePlugin)
public class WatchBridgePlugin: CAPPlugin {

    // Registers the JS-callable method.
    @objc func syncSession(_ call: CAPPluginCall) {
        let token = call.getString("token")
        let playerId = call.getString("playerId")
        var handoffData: Data? = nil
        if let handoffString = call.getString("handoff") {
            handoffData = handoffString.data(using: .utf8)
        }
        PhoneWCSession.shared.sync(token: token, playerId: playerId, handoffData: handoffData)
        call.resolve(["ok": true])
    }

    // Diagnostic: report the WCSession link state to the web app's ⌚? button.
    @objc func watchStatus(_ call: CAPPluginCall) {
        call.resolve(PhoneWCSession.shared.status())
    }
}
