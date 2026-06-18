// Bad Golf Watch — App entry
// A 2-page swipe stack: Distance (primary) and Scoring.
// When a round is active it opens on Distance; otherwise the picker/empty state.

import SwiftUI

@main
struct BadGolfWatchApp: App {
    @StateObject private var store = RoundStore()
    @StateObject private var loc = LocationManager()
    @StateObject private var weather = WeatherService()
    @State private var page = 0

    var body: some Scene {
        WindowGroup {
            RootView(page: $page)
                .environmentObject(store)
                .environmentObject(loc)
                .environmentObject(weather)
                .onAppear {
                    WatchConnectivityManager.shared.store = store
                    loc.requestPermission()
                    if store.round != nil { loc.startUpdating() }
                    // If we have a session but no round cached, try a fetch.
                    if store.round == nil && SessionStore.shared.isSignedIn {
                        Task { await store.refreshFromSupabase() }
                    }
                }
                .onChange(of: store.round?.id) { _, newValue in
                    if newValue != nil { loc.startUpdating() } else { loc.stopUpdating() }
                }
        }
    }
}

struct RootView: View {
    @EnvironmentObject var store: RoundStore
    @Binding var page: Int

    var body: some View {
        if store.round == nil {
            RoundPickerView()
        } else {
            TabView(selection: $page) {
                DistanceView(goToScoring: { withAnimation { page = 1 } })
                    .tag(0)
                ScoringView()
                    .tag(1)
            }
            .tabViewStyle(.verticalPage)
        }
    }
}
