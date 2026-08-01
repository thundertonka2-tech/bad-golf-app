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

                if !store.signedIn {
                    Text("Open Bad Golf on your phone to sign in.")
                        .font(.system(size: 13)).multilineTextAlignment(.center)
                        .foregroundStyle(Color.white.opacity(0.7))
                } else {
                    Text("No active round.\nStart one on your phone.")
                        .font(.system(size: 13)).multilineTextAlignment(.center)
                        .foregroundStyle(Color.white.opacity(0.7))
                    Button {
                        loading = true
                        // v926: an explicit "Check again" is the user asking to
                        // reattach — lift any "closed on watch" dismissal, then
                        // ask the phone AND Supabase for the current round.
                        store.clearDismissal()
                        WatchConnectivityManager.shared.requestRound()
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
