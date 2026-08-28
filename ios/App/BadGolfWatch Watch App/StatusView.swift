// Bad Golf Watch — Status / minimal settings
// GPS lock, sync state, course/round name. "End round" stays a phone action
// in v1 (per the spec) — here it's just a confirm-guarded sync flush.

import SwiftUI

struct StatusView: View {
    @EnvironmentObject var store: RoundStore
    @EnvironmentObject var loc: LocationManager
    @ObservedObject private var workout = WorkoutSessionManager.shared

    var body: some View {
        List {
            Section("Round") {
                row("Course", store.round?.courseName ?? "—")
                row("Hole", "\(store.currentHole) of \(store.holeCount)")
                row("Score", store.scoreToParText())
            }
            Section("GPS") {
                row("Status", loc.acquiring ? "Acquiring…" : (loc.accuracyGood ? "Good" : "Weak"))
                // v1277: whether the workout session is holding the app alive is
                // the single most useful thing to see when someone reports "it
                // keeps dropping out mid-round" — and it was completely invisible
                // before, which is why a dead session went unnoticed for weeks.
                row("Keep-alive", workout.active ? "On (workout)" : "Off")
            }
            Section("Sync") {
                row("State", syncText)
                Button("Sync now") { Task { await store.flush() } }
                    .foregroundStyle(.green)
            }
        }
    }

    private func row(_ k: String, _ v: String) -> some View {
        HStack { Text(k).foregroundStyle(.secondary); Spacer(); Text(v) }
            .font(.system(size: 14))
    }
    private var syncText: String {
        switch store.syncState {
        case .idle: return "Idle"
        case .synced: return "Synced"
        case .syncing: return "Syncing…"
        case .queued(let n): return "\(n) queued"
        case .error(let m): return m
        }
    }
}
