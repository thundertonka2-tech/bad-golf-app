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
    // v829 (Tyler/Kevin): "it takes forever to sync but once it does, it's
    // correct." scenePhase tells us every time the watch is raised/woken —
    // not just the very first cold launch, which is all .onAppear alone ever
    // caught. Before this, a watch that stayed resident across a wrist-drop
    // never re-asked the phone for anything until the app was fully
    // relaunched, so a hole change or score made on the phone while the
    // watch was asleep wouldn't show up until whatever passive delivery
    // (transferUserInfo) the OS got around to. Now every time the watch
    // becomes active we proactively ask — cheap (one WC message + a
    // reachability-gated Supabase fetch), and it's the direct fix for
    // "keep it feeling always-synced like 18Birdies," short of forcing
    // watchOS to keep our process resident (which apps can't do directly).
    //
    // v863 (Tyler, Jul 26): this exact fix existed since v829 but ONLY in the
    // stale top-level watch/BadGolfWatch/ copy of this file — a duplicate
    // directory that is NOT part of the Xcode project (confirmed: it is not
    // referenced anywhere in App.xcodeproj/project.pbxproj; the real watch
    // target syncs its files from ios/App/BadGolfWatch Watch App/ via a
    // PBXFileSystemSynchronizedRootGroup). So this fix was written and handed
    // off as shipped, but never actually reached a real build — that's why
    // Kevin/Tyler still saw the old "doesn't feel synced" behavior after v829.
    // Grafting the real fix into this, the actual live file.
    @Environment(\.scenePhase) private var scenePhase

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
                    // Always ask the phone for the latest as soon as we launch —
                    // requestRound() itself no-ops until reachable, so this is
                    // safe to call even when the phone isn't in range yet.
                    WatchConnectivityManager.shared.requestRound()
                    // If we have a session but no round cached, try a fetch.
                    if store.round == nil && SessionStore.shared.isSignedIn {
                        Task { await store.refreshFromSupabase() }
                    }
                }
                .onChange(of: store.round?.id) { _, newValue in
                    if newValue != nil { loc.startUpdating() } else { loc.stopUpdating() }
                }
                .onChange(of: scenePhase) { _, newPhase in
                    guard newPhase == .active else { return }
                    // Raised wrist / re-opened from the dock — re-ask the phone
                    // right away instead of waiting on a passive delivery.
                    WatchConnectivityManager.shared.requestRound()
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
