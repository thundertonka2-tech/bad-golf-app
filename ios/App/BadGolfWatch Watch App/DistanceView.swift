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

    // ---- Last-known yardage fallback (Kevin, June 2026) ----------------------
    // When the live GPS fix briefly drops (or the watch/phone link is flaky) the
    // hero number would snap to "—". Instead we hold the last good distance for
    // the CURRENT hole and keep showing it, then update the instant a fresh fix
    // arrives. Cached in-memory and keyed to the hole so we never show a stale
    // number from a different hole.
    struct LastKnownDistance { var hole: Int; var dist: Geo.Distances; var at: Date }
    @State private var lastKnown: LastKnownDistance?
    // Tap the "?" in the header to reveal a raw GPS diagnostic you can screenshot
    // (helps track down the "0 yards" bug — shows the live fix, the green coord,
    // and the computed distances the watch is actually using).
    @State private var showDiag = false

    // What the screen actually renders: live distance if we have one, else the
    // last-known reading for this hole.
    private var shownDistances: Geo.Distances? {
        if let d = distances, d.center != nil { return d }
        if let lk = lastKnown, lk.hole == store.currentHole, lk.dist.center != nil { return lk.dist }
        return distances
    }
    // True when we're falling back to a cached number (live fix unavailable).
    private var showingLastKnown: Bool {
        (distances?.center == nil) && (lastKnown?.hole == store.currentHole) && (lastKnown?.dist.center != nil)
    }
    // Remember the latest good fix for this hole. Computed from the RECEIVED
    // location so it isn't a render behind the @Published update.
    private func cacheDistances(from newLoc: CLLocation?) {
        guard let l = newLoc, let h = store.hole else { return }
        let d = Geo.distances(from: l, hole: h)
        if d.center != nil {
            lastKnown = LastKnownDistance(hole: store.currentHole, dist: d, at: Date())
        }
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

    // Yardage the club suggestion is based on: plays-as when enabled & different,
    // else the shown center (live, or last-known during a GPS gap).
    private var clubYards: Int? {
        if store.watchPlaysAs, showPlaysLike, let pl = playsLike { return pl }
        return shownDistances?.center
    }
    private var suggestedClub: String? {
        guard let y = clubYards else { return nil }
        return store.suggestedClub(for: y)
    }

    var body: some View {
        ZStack {
            Color.badGolfNavy.ignoresSafeArea()
            screen
            if showDiag { diagPanel }
        }
        .focusable(true)
        .digitalCrownRotation(
            .init(get: { Double(store.currentHole) },
                  set: { store.goTo(hole: Int($0.rounded())) }),
            from: 1, through: Double(store.holeCount), by: 1, sensitivity: .low
        )
        .onTapGesture(perform: goToScoring)
        .onAppear { refreshWeather(); cacheDistances(from: loc.location) }
        .onChange(of: store.currentHole) { _, _ in refreshWeather(); cacheDistances(from: loc.location) }
        .onChange(of: greenCoord?.latitude) { _, _ in refreshWeather() }
        // Every fresh watch GPS fix updates the last-known cache for this hole.
        .onReceive(loc.$location) { newLoc in cacheDistances(from: newLoc) }
        // If the active course changes (e.g. a stale course was just swapped for
        // the round's real one), throw away any last-known yardage so we never
        // flash a cached number computed against the wrong course's green.
        .onChange(of: store.activeCourse?.id) { _, _ in lastKnown = nil }
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
                Button { showDiag.toggle() } label: {
                    Image(systemName: "questionmark.circle")
                        .font(.system(size: 13, weight: .bold))
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.badGolfBlue)
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
            Text(shownDistances?.center.map(String.init) ?? "—")
                .font(.system(size: 64, weight: .bold, design: .rounded))
                .foregroundStyle(showingLastKnown ? Color.white.opacity(0.55) : .white)
                .minimumScaleFactor(0.6)
                .monospacedDigit()
            HStack(spacing: 16) {
                label("F", shownDistances?.front)
                label("B", shownDistances?.back)
            }
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(Color.white.opacity(0.7))
            lastKnownCaption
        }
    }

    private var centerOnly: some View {
        VStack(spacing: 2) {
            Text(shownDistances?.center.map(String.init) ?? "—")
                .font(.system(size: 60, weight: .bold, design: .rounded))
                .foregroundStyle(showingLastKnown ? Color.white.opacity(0.55) : .white)
                .monospacedDigit()
            Text("to center · est.")
                .font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.7))
            lastKnownCaption
        }
    }

    // Honest "this is the last reading, not a live fix" marker. Only shows while
    // we're falling back to the cache; it clears itself the moment GPS returns.
    @ViewBuilder private var lastKnownCaption: some View {
        if showingLastKnown {
            HStack(spacing: 3) {
                Image(systemName: "dot.radiowaves.left.and.right")
                    .font(.system(size: 9, weight: .bold))
                Text("last known")
                    .font(.system(size: 11, weight: .semibold))
            }
            .foregroundStyle(Color.badGolfAmber)
            .padding(.top, 1)
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

    // Raw GPS diagnostic overlay — toggled by the "?" in the header. Everything
    // here is the live data the watch is using to compute the yardage, so a photo
    // of this screen tells us exactly why a distance reads 0 / "—".
    @ViewBuilder private var diagPanel: some View {
        let l = loc.location
        let g = greenCoord
        let d = distances
        ScrollView {
            VStack(alignment: .leading, spacing: 3) {
                Text("⛳ Watch GPS diagnostic")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Color.badGolfAmber)
                Text("hole \(store.currentHole)/\(store.holeCount) · par \(store.par.map(String.init) ?? "—")")
                Text("conf: \(confidenceText)")
                Text("gps: \(loc.acquiring ? "acquiring" : (loc.accuracyGood ? "good" : "weak"))")
                Text("acc: \(l.map { String(format: "%.0fm", $0.horizontalAccuracy) } ?? "nil")")
                Text("me: \(l.map { String(format: "%.5f,%.5f", $0.coordinate.latitude, $0.coordinate.longitude) } ?? "nil")")
                Text("green: \(g.map { String(format: "%.5f,%.5f", $0.latitude, $0.longitude) } ?? "nil")")
                Text("C/F/B: \(d?.center.map(String.init) ?? "—")/\(d?.front.map(String.init) ?? "—")/\(d?.back.map(String.init) ?? "—")")
                Text("lastKnown: \(showingLastKnown ? "yes" : "no")")
                Button("Close") { showDiag = false }
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Color.badGolfBlue)
                    .padding(.top, 4)
            }
            .font(.system(size: 12))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
        }
        .background(Color.black.opacity(0.92))
    }

    private var confidenceText: String {
        guard let c = store.hole?.confidence else { return "no-hole" }
        switch c {
        case .full:       return "full"
        case .centerOnly: return "centerOnly"
        case .none:       return "none (unmapped)"
        }
    }
}
