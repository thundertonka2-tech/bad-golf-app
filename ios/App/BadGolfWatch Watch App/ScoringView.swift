// Bad Golf Watch — Scoring screen
// Big, glanceable strokes with +/- (tap or Digital Crown). Autosaves to the
// local queue; running total vs par at the bottom.

import SwiftUI
#if os(watchOS)
import WatchKit
#endif

struct ScoringView: View {
    @EnvironmentObject var store: RoundStore
    // v926 (Kevin): the watch had NO way to close a round — if it went stale the
    // workout session kept the app pinned to every wrist-raise and the only
    // escape was deleting the app. This confirm guards against a mid-round
    // accidental tap; closing never touches the scores on the phone.
    @State private var confirmClose = false

    var body: some View {
        ZStack {
            Color.badGolfNavy.ignoresSafeArea()
            content
        }
        .focusable(true)
        .digitalCrownRotation(
            .init(get: { Double(store.score(for: store.currentHole)) },
                  set: { store.setStrokes(Int($0.rounded()), hole: store.currentHole) }),
            from: 0, through: 20, by: 1, sensitivity: .medium
        )
        .confirmationDialog("Close this round on the watch?", isPresented: $confirmClose, titleVisibility: .visible) {
            Button("Close on watch", role: .destructive) { store.closeOnWatch() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Your scores stay safe on your phone. The watch clears until a new round starts — or tap Check again to reattach.")
        }
    }

    private var content: some View {
        VStack(spacing: 4) {
            HStack {
                Text("Hole \(store.currentHole)")
                if let p = store.par { Text("· Par \(p)") }
            }
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(Color.white.opacity(0.7))

            HStack(spacing: 14) {
                stepButton("minus.circle.fill") { store.bump(-1); haptic() }
                Text("\(store.score(for: store.currentHole))")
                    .font(.system(size: 56, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .monospacedDigit()
                    .frame(minWidth: 60)
                stepButton("plus.circle.fill") { store.bump(1); haptic() }
            }

            Text(store.scoreToParText())
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Color.badGolfBlue)

            HStack {
                Button { store.prev() } label: { Image(systemName: "chevron.left") }
                Spacer()
                Text(syncLabel).font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.7))
                Spacer()
                Button { store.next() } label: { Image(systemName: "chevron.right") }
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.badGolfBlue)

            // v926: the escape hatch that never existed — close the round on the
            // watch (workout session ends, app un-pins). Phone is untouched.
            Button { confirmClose = true } label: {
                Label("Close on watch", systemImage: "xmark.circle")
                    .font(.system(size: 12, weight: .semibold))
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.white.opacity(0.55))
            .padding(.top, 3)
        }
        .padding(.horizontal, 6)
    }

    private func stepButton(_ name: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: name).font(.system(size: 34))
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.badGolfBlue)
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
