// Bad Golf Watch — Distance screen (the one players stare at)
// Center distance is the hero number; front/back flank it. Confidence is
// honest: center-only shows one number, unmapped shows no fake numbers.
// Brand: navy background, blue accents. A small wind indicator + plays-like
// line mirror the phone when weather/elevation data is available.

import SwiftUI
import CoreLocation

struct DistanceView: View {
    @EnvironmentObject var store: RoundStore
    @EnvironmentObject var loc: LocationManager
    @EnvironmentObject var weather: WeatherService
    var goToScoring: () -> Void

    private var distances: Geo.Distances? {
        guard let l = loc.location, let h = store.hole else { return nil }
        return Geo.distances(from: l, hole: h)
    }

    // Player coordinate (watch GPS) and the green (mid) coordinate.
    private var playerCoord: CLLocationCoordinate2D? { loc.location?.coordinate }
    private var greenCoord: CLLocationCoordinate2D? { store.hole?.mid?.clLocation.coordinate }

    // Plays-like yardage (nil if no center, or hidden when it equals raw).
    private var playsLike: Int? {
        Geo.playsLike(
            center: distances?.center,
            player: playerCoord,
            green: greenCoord,
            playerElevationM: weather.playerElevationM,
            greenElevationM: weather.greenElevationM,
            windMph: weather.windMph,
            windDirFromDeg: weather.windDirFrom,
            tempF: weather.tempF
        )
    }
    private var showPlaysLike: Bool {
        guard let pl = playsLike, let c = distances?.center else { return false }
        return pl != c
    }

    // Yardage the club suggestion is based on: plays-as when enabled & different, else center.
    private var clubYards: Int? {
        if store.watchPlaysAs, showPlaysLike, let pl = playsLike { return pl }
        return distances?.center
    }
    private var suggestedClub: String? {
        guard let y = clubYards else { return nil }
        return store.suggestedClub(for: y)
    }

    var body: some View {
        ZStack {
            Color.badGolfNavy.ignoresSafeArea()
            screen
        }
        .focusable(true)
        .digitalCrownRotation(
            .init(get: { Double(store.currentHole) },
                  set: { store.goTo(hole: Int($0.rounded())) }),
            from: 1, through: Double(store.holeCount), by: 1, sensitivity: .low
        )
        .onTapGesture(perform: goToScoring)
        .onAppear { refreshWeather() }
        .onChange(of: store.currentHole) { _, _ in refreshWeather() }
        .onChange(of: greenCoord?.latitude) { _, _ in refreshWeather() }
    }

    private func refreshWeather() {
        weather.refresh(green: greenCoord, player: playerCoord)
    }

    private var screen: some View {
        VStack(spacing: 2) {
            // Hole + par + wind + GPS dot
            HStack(spacing: 6) {
                Text("Hole \(store.currentHole)")
                if let p = store.par { Text("· Par \(p)") }
                Spacer()
                windIndicator
                gpsDot
            }
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(Color.white.opacity(0.7))

            Spacer(minLength: 0)

            content

            // Plays-as line (only when the phone toggle is on) + suggested club.
            if store.watchPlaysAs, showPlaysLike, let pl = playsLike {
                Text("plays \(pl)" + (suggestedClub.map { " · " + $0 } ?? ""))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color.badGolfAmber)
                    .padding(.top, 1)
            } else if let c = suggestedClub {
                Text(c)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color.badGolfBlue)
                    .padding(.top, 1)
            }

            Spacer(minLength: 0)

            // Hole nav + jump to scoring
            HStack {
                Button { store.prev() } label: { Image(systemName: "chevron.left") }
                Spacer()
                Button(action: goToScoring) {
                    Label("Score", systemImage: "pencil")
                        .font(.system(size: 14, weight: .semibold))
                }
                Spacer()
                Button { store.next() } label: { Image(systemName: "chevron.right") }
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.badGolfBlue)
        }
        .padding(.horizontal, 6)
    }

    private var content: AnyView {
        guard let h = store.hole else {
            return AnyView(Text("Loading…").foregroundStyle(Color.white.opacity(0.7)))
        }
        switch h.confidence {
        case .full:       return AnyView(fullGreens)
        case .centerOnly: return AnyView(centerOnly)
        case .none:       return AnyView(notMapped)
        }
    }

    private var fullGreens: some View {
        VStack(spacing: 0) {
            Text(distances?.center.map(String.init) ?? "—")
                .font(.system(size: 64, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .minimumScaleFactor(0.6)
                .monospacedDigit()
            HStack(spacing: 16) {
                label("F", distances?.front)
                label("B", distances?.back)
            }
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(Color.white.opacity(0.7))
        }
    }

    private var centerOnly: some View {
        VStack(spacing: 2) {
            Text(distances?.center.map(String.init) ?? "—")
                .font(.system(size: 60, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .monospacedDigit()
            Text("to center · est.")
                .font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.7))
        }
    }

    private var notMapped: some View {
        VStack(spacing: 4) {
            Image(systemName: "mappin.slash")
                .font(.system(size: 26)).foregroundStyle(Color.white.opacity(0.7))
            Text("Green not mapped")
                .font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
            Text("Map it on your phone")
                .font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.7))
        }
    }

    private func label(_ tag: String, _ v: Int?) -> some View {
        Text("\(tag) \(v.map(String.init) ?? "—")")
    }

    // Small wind chip: arrow rotated to where the wind blows TO + mph. Hidden
    // until we have wind data. windDirFrom is the direction the wind comes from,
    // so the arrow (pointing where it's going) is rotated by from+180.
    @ViewBuilder private var windIndicator: some View {
        if let mph = weather.windMph, let from = weather.windDirFrom, mph >= 0.5 {
            HStack(spacing: 2) {
                Image(systemName: "location.north.fill")
                    .font(.system(size: 9, weight: .bold))
                    .rotationEffect(.degrees(from + 180))
                Text("\(Int(mph.rounded()))")
                    .font(.system(size: 11, weight: .semibold))
                    .monospacedDigit()
            }
            .foregroundStyle(Color.badGolfBlue)
        }
    }

    private var gpsDot: some View {
        Circle()
            .fill(loc.acquiring ? Color.gray : (loc.accuracyGood ? Color.green : Color.yellow))
            .frame(width: 8, height: 8)
    }
}
