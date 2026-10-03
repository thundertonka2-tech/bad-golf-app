// Bad Golf — Live Activity Capacitor plugin (iOS Lock Screen / Dynamic Island).
// The web app (www/index.html) drives this from the GPS view:
//   Capacitor.Plugins.LiveActivity.start({ courseName, roundCode, hole, par, toPar,
//                                          playsLikeYds, suggestedClub, fromTeeYds, toGreenYds })
//   Capacitor.Plugins.LiveActivity.update({ hole, par, toPar, playsLikeYds,
//                                           suggestedClub, fromTeeYds, toGreenYds })
//   Capacitor.Plugins.LiveActivity.end({ dismissAt? })   // epoch ms; omit = remove now
// Silently no-ops on iOS < 16.1 (ActivityKit unavailable) and when the user has
// Live Activities disabled in Settings — the JS side is written to tolerate that.
// Registered explicitly in MainViewController.capacitorDidLoad (see
// WatchBridgePlugin.swift) — macro auto-discovery does not survive Release builds.

import Foundation
import UIKit
import Capacitor
#if canImport(ActivityKit)
import ActivityKit
#endif

@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin {

    // Round the incoming JS number (may arrive as Int or Double) to an Int.
    private func num(_ call: CAPPluginCall, _ key: String) -> Int {
        return Int((call.getDouble(key) ?? Double(call.getInt(key) ?? 0)).rounded())
    }

    #if canImport(ActivityKit)
    @available(iOS 16.1, *)
    private func contentState(from call: CAPPluginCall) -> BadGolfRoundAttributes.ContentState {
        return BadGolfRoundAttributes.ContentState(
            hole: num(call, "hole"),
            par: num(call, "par"),
            toPar: num(call, "toPar"),
            playsLikeYds: num(call, "playsLikeYds"),
            suggestedClub: call.getString("suggestedClub") ?? "",
            fromTeeYds: num(call, "fromTeeYds"),
            toGreenYds: num(call, "toGreenYds")
        )
    }
    #endif

    @objc func start(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) {
            let attrs = BadGolfRoundAttributes(
                courseName: call.getString("courseName") ?? "",
                roundCode: call.getString("roundCode") ?? ""
            )
            let state = contentState(from: call)
            Task {
                // End any stale card first (app relaunch / new round) so we never
                // show two round cards at once.
                for activity in Activity<BadGolfRoundAttributes>.activities {
                    await activity.end(dismissalPolicy: .immediate)
                }
                guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                    call.resolve(["started": false, "reason": "disabled"])
                    return
                }
                do {
                    _ = try Activity.request(attributes: attrs, contentState: state)
                    call.resolve(["started": true])
                } catch {
                    call.resolve(["started": false, "reason": error.localizedDescription])
                }
            }
            return
        }
        #endif
        call.resolve(["started": false, "reason": "unsupported"])
    }

    @objc func update(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) {
            let state = contentState(from: call)
            Task {
                for activity in Activity<BadGolfRoundAttributes>.activities {
                    await activity.update(using: state)
                }
                call.resolve(["ok": true])
            }
            return
        }
        #endif
        call.resolve(["ok": false])
    }

    // v1872: optional `dismissAt` (epoch ms). The web app passes it when the phone locks
    // mid-round: the card stays on the Lock Screen until then and iOS removes it on its
    // own (1 hr after the player's last score / GPS move). Without it, or when the time
    // has already passed, the card is removed immediately (round finished/deleted/left).
    // iOS caps an ended card at 4 hours on the Lock Screen regardless.
    @objc func end(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) {
            // `let`, not `var`: a captured var inside Task {} is a compile error.
            let policy: ActivityUIDismissalPolicy = {
                if let ms = call.getDouble("dismissAt") {
                    let when = Date(timeIntervalSince1970: ms / 1000.0)
                    if when.timeIntervalSinceNow > 5 { return .after(when) }
                }
                return .immediate
            }()
            Task {
                for activity in Activity<BadGolfRoundAttributes>.activities {
                    await activity.end(dismissalPolicy: policy)
                }
                call.resolve(["ok": true])
            }
            return
        }
        #endif
        call.resolve(["ok": false])
    }
}
