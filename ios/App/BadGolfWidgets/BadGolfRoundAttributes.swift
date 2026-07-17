// Bad Golf — shared Live Activity attributes.
// COMPILED INTO BOTH TARGETS (App + BadGolfWidgets): the app's LiveActivityPlugin
// starts/updates the activity with this type, and the widget extension renders it.
// The two copies must be the same type, so this single file is added to both
// targets by ios-config/add_widget_target.rb at CI time.

import Foundation
#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.1, *)
struct BadGolfRoundAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var hole: Int
        var par: Int
        var toPar: Int            // running score vs par (0 = even)
        var playsLikeYds: Int     // elevation/wind adjusted
        var suggestedClub: String // e.g. "8i" — may be empty
        var fromTeeYds: Int       // drive estimate
        var toGreenYds: Int       // GPS middle-of-green
    }

    // Fixed for the life of the activity
    var courseName: String
    var roundCode: String
}
#endif
