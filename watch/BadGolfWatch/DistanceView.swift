// Bad Golf Watch — Distance screen (the one players stare at)
// Center distance is the hero number; front/back flank it. Confidence is
// honest: center-only shows one number, unmapped shows no fake numbers.

import SwiftUI

struct DistanceView: View {
    @EnvironmentObject var store: RoundStore
    @EnvironmentObject var loc: LocationManager
    var goToScoring: () -> Void

    private var distances: Geo.Distances? {
        guard let l = loc.location, let h = store.hole else { return nil }
        return Geo.distances(from: l, hole: h)
    }

    var body: some View {
        VStack(spacing: 2) {
            // Hole + par
            HStack {
                Text("Hole \(store.currentHole)")
                if let p = store.par { Text("· Par \(p)") }
                Spacer()
                gpsDot
            }
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(.secondary)

            Spacer(minLength: 0)

            content

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
            .foregroundStyle(.green)
        }
        .padding(.horizontal, 6)
        .focusable(true)
        .digitalCrownRotation(
            .init(get: { Double(store.currentHole) },
                  set: { store.goTo(hole: Int($0.rounded())) }),
            from: 1, through: Double(store.holeCount), by: 1, sensitivity: .low
        )
        .onTapGesture(perform: goToScoring)
    }

    private var content: AnyView {
        guard let h = store.hole else {
            return AnyView(Text("Loading…").foregroundStyle(.secondary))
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
                .minimumScaleFactor(0.6)
                .monospacedDigit()
            HStack(spacing: 16) {
                label("F", distances?.front)
                label("B", distances?.back)
            }
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(.secondary)
            if !(store.hole?.verified ?? true) {
                Text("community").font(.system(size: 11)).foregroundStyle(.orange)
            }
        }
    }

    private var centerOnly: some View {
        VStack(spacing: 2) {
            Text(distances?.center.map(String.init) ?? "—")
                .font(.system(size: 60, weight: .bold, design: .rounded))
                .monospacedDigit()
            Text("to center · est.").font(.system(size: 12)).foregroundStyle(.secondary)
        }
    }

    private var notMapped: some View {
        VStack(spacing: 4) {
            Image(systemName: "mappin.slash").font(.system(size: 26)).foregroundStyle(.secondary)
            Text("Green not mapped").font(.system(size: 15, weight: .semibold))
            Text("Map it on your phone").font(.system(size: 12)).foregroundStyle(.secondary)
        }
    }

    private func label(_ tag: String, _ v: Int?) -> some View {
        Text("\(tag) \(v.map(String.init) ?? "—")")
    }

    private var gpsDot: some View {
        Circle()
            .fill(loc.acquiring ? Color.gray : (loc.accuracyGood ? Color.green : Color.yellow))
            .frame(width: 8, height: 8)
    }
}
