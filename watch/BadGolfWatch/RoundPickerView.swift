// Bad Golf Watch — Launch / empty states
// Shown only when there's no active round to display. The common case
// (active round) skips straight to Distance.

import SwiftUI

struct RoundPickerView: View {
    @EnvironmentObject var store: RoundStore
    @State private var loading = false

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "figure.golf").font(.system(size: 30)).foregroundStyle(.green)
            Text("Bad Golf").font(.headline)

            if !SessionStore.shared.isSignedIn {
                Text("Open Bad Golf on your phone to sign in.")
                    .font(.system(size: 13)).multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            } else {
                Text("No active round.\nStart one on your phone.")
                    .font(.system(size: 13)).multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                Button {
                    loading = true
                    Task { await store.refreshFromSupabase(); loading = false }
                } label: {
                    if loading { ProgressView() } else { Label("Check again", systemImage: "arrow.clockwise") }
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
            }
        }
        .padding()
        .onAppear { WatchConnectivityManager.shared.requestRound() }
    }
}
