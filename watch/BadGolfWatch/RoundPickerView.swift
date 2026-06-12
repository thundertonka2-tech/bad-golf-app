// Bad Golf Watch — Launch / empty states
// Shown only when there's no active round to display. The common case
// (active round) skips straight to Distance.

import SwiftUI

struct RoundPickerView: View {
    @EnvironmentObject var store: RoundStore
    @State private var loading = false

    var body: some View {
        ZStack {
            Color.badGolfNavy.ignoresSafeArea()
            VStack(spacing: 10) {
                Image(systemName: "figure.golf").font(.system(size: 30)).foregroundStyle(Color.badGolfBlue)
                Text("Bad Golf").font(.headline).foregroundStyle(.white)

                if !SessionStore.shared.isSignedIn {
                    Text("Open Bad Golf on your phone to sign in.")
                        .font(.system(size: 13)).multilineTextAlignment(.center)
                        .foregroundStyle(Color.white.opacity(0.7))
                } else {
                    Text("No active round.\nStart one on your phone.")
                        .font(.system(size: 13)).multilineTextAlignment(.center)
                        .foregroundStyle(Color.white.opacity(0.7))
                    Button {
                        loading = true
                        Task { await store.refreshFromSupabase(); loading = false }
                    } label: {
                        if loading { ProgressView() } else { Label("Check again", systemImage: "arrow.clockwise") }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color.badGolfBlue)
                }
            }
            .padding()
        }
        .onAppear { WatchConnectivityManager.shared.requestRound() }
    }
}
