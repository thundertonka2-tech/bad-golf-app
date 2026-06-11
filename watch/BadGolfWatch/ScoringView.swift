// Bad Golf Watch — Scoring screen
// Big, glanceable strokes with +/- (tap or Digital Crown). Autosaves to the
// local queue; running total vs par at the bottom.

import SwiftUI
#if os(watchOS)
import WatchKit
#endif

struct ScoringView: View {
    @EnvironmentObject var store: RoundStore

    var body: some View {
        VStack(spacing: 4) {
            HStack {
                Text("Hole \(store.currentHole)")
                if let p = store.par { Text("· Par \(p)") }
            }
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(.secondary)

            HStack(spacing: 14) {
                stepButton("minus.circle.fill") { store.bump(-1); haptic() }
                Text("\(store.score(for: store.currentHole))")
                    .font(.system(size: 56, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .frame(minWidth: 60)
                stepButton("plus.circle.fill") { store.bump(1); haptic() }
            }

            Text(store.scoreToParText())
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.green)

            HStack {
                Button { store.prev() } label: { Image(systemName: "chevron.left") }
                Spacer()
                Text(syncLabel).font(.system(size: 11)).foregroundStyle(.secondary)
                Spacer()
                Button { store.next() } label: { Image(systemName: "chevron.right") }
            }
            .buttonStyle(.plain)
            .foregroundStyle(.green)
        }
        .padding(.horizontal, 6)
        .focusable(true)
        .digitalCrownRotation(
            .init(get: { Double(store.score(for: store.currentHole)) },
                  set: { store.setStrokes(Int($0.rounded()), hole: store.currentHole) }),
            from: 0, through: 20, by: 1, sensitivity: .medium
        )
    }

    private func stepButton(_ name: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: name).font(.system(size: 34))
        }
        .buttonStyle(.plain)
        .foregroundStyle(.green)
    }

    private var syncLabel: String {
        switch store.syncState {
        case .idle, .synced: return "saved"
        case .syncing:       return "saving…"
        case .queued(let n): return "queued \(n)"
        case .error:         return "offline"
        }
    }

    private func haptic() {
        #if os(watchOS)
        WKInterfaceDevice.current().play(.click)
        #endif
    }
}
