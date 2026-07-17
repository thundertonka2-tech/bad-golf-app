// Bad Golf — widget extension: the Lock Screen / Dynamic Island round card.
// Renders the Live Activity the app starts via LiveActivityPlugin. Tapping any
// surface deep-links badgolf://round/<code>, which the web app routes straight
// back into the round (wireDeepLinks in www/index.html).

import WidgetKit
import SwiftUI
import ActivityKit

let bgBrandBlue = Color(red: 12.0 / 255.0, green: 68.0 / 255.0, blue: 124.0 / 255.0)

func bgScoreText(_ toPar: Int) -> String {
    if toPar == 0 { return "E" }
    return toPar > 0 ? "+\(toPar)" : "\(toPar)"
}

@main
struct BadGolfWidgetsBundle: WidgetBundle {
    var body: some Widget {
        BadGolfRoundLiveActivity()
    }
}

struct BadGolfRoundLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BadGolfRoundAttributes.self) { context in
            // ---- Lock Screen / banner card ----
            LockScreenRoundView(context: context)
                .activityBackgroundTint(bgBrandBlue)
                .activitySystemActionForegroundColor(.white)
                .widgetURL(URL(string: "badgolf://round/\(context.attributes.roundCode)"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("HOLE \(context.state.hole)")
                            .font(.caption2).foregroundStyle(.secondary)
                        Text("Par \(context.state.par) · \(bgScoreText(context.state.toPar))")
                            .font(.headline)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("\(context.state.toGreenYds)")
                            .font(.title2).fontWeight(.heavy)
                        Text("yds to green")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        if !context.state.suggestedClub.isEmpty {
                            Label(context.state.suggestedClub, systemImage: "figure.golf")
                        }
                        Spacer()
                        Text("plays like \(context.state.playsLikeYds)y")
                    }
                    .font(.caption)
                }
            } compactLeading: {
                Text("⛳\(context.state.hole)")
            } compactTrailing: {
                Text("\(context.state.toGreenYds)y").fontWeight(.bold)
            } minimal: {
                Text("\(context.state.toGreenYds)")
            }
            .widgetURL(URL(string: "badgolf://round/\(context.attributes.roundCode)"))
            .keylineTint(.white)
        }
    }
}

struct LockScreenRoundView: View {
    let context: ActivityViewContext<BadGolfRoundAttributes>

    var body: some View {
        VStack(spacing: 10) {
            // Top row: course + hole/par
            HStack {
                Text(context.attributes.courseName.isEmpty ? "Bad Golf" : context.attributes.courseName)
                    .font(.caption).fontWeight(.semibold)
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(1)
                Spacer()
                Text("HOLE \(context.state.hole) · PAR \(context.state.par)")
                    .font(.caption).fontWeight(.bold)
                    .foregroundStyle(.white)
            }
            // Middle: big yardage + plays-like/club
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("\(context.state.toGreenYds)")
                        .font(.system(size: 42, weight: .heavy, design: .rounded))
                        .foregroundStyle(.white)
                    Text("YDS TO GREEN")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.7))
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 6) {
                    if context.state.playsLikeYds > 0 && context.state.playsLikeYds != context.state.toGreenYds {
                        Text("plays like \(context.state.playsLikeYds)")
                            .font(.caption).fontWeight(.semibold)
                            .foregroundStyle(.white.opacity(0.9))
                    }
                    if !context.state.suggestedClub.isEmpty {
                        Text(context.state.suggestedClub)
                            .font(.caption).fontWeight(.heavy)
                            .padding(.horizontal, 10).padding(.vertical, 3)
                            .background(Capsule().fill(.white.opacity(0.2)))
                            .foregroundStyle(.white)
                    }
                    Text(bgScoreText(context.state.toPar))
                        .font(.caption).fontWeight(.heavy)
                        .padding(.horizontal, 10).padding(.vertical, 3)
                        .background(Capsule().fill(context.state.toPar <= 0 ? Color.green.opacity(0.55) : Color.white.opacity(0.2)))
                        .foregroundStyle(.white)
                }
            }
            // Bottom row: drive estimate (only once they're off the tee)
            if context.state.fromTeeYds > 20 {
                HStack {
                    Text("Drive \(context.state.fromTeeYds)y")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.7))
                    Spacer()
                }
            }
        }
        .padding(14)
    }
}
