// Bad Golf Watch — Workout session (v891)
// An active HKWorkoutSession is what lets a watchOS app keep running — and keep
// its GPS warm — while the wrist is down. This is how 18Birdies and every other
// watch golf GPS stays live all round (v863 finding #17). Without it, watchOS
// suspends the app the instant the screen sleeps, which froze CLLocation AND
// the GPS watchdog, so every wrist-raise was a cold GPS start ("acquiring…").
//
// Started when a round becomes active, ended when the round clears. Degrades
// GRACEFULLY: if HealthKit is unavailable, the user declines the permission
// prompt, or the session fails, everything behaves exactly as it did before —
// the watch just goes back to cold-starting GPS on wake. A pleasant side
// effect: the round shows up in Apple Fitness as a golf workout.
//
// NOTE (build requirement): needs the HealthKit entitlement on the watch
// target (added to "BadGolfWatch Watch App.entitlements") AND HealthKit
// enabled on the watch app's App ID in the Apple Developer portal — if the
// Codemagic build fails signing after this change, that portal toggle is the
// missing piece.

import Foundation
import HealthKit
import Combine   // @Published / ObservableObject live here — build 314 failed without it

final class WorkoutSessionManager: NSObject, ObservableObject {
    static let shared = WorkoutSessionManager()

    /// True while a workout session is keeping the app runnable in background.
    @Published var active = false

    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    /// Call when a round becomes active. Safe to call repeatedly.
    func start() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        guard session == nil else { return }
        let types: Set = [HKObjectType.workoutType()]
        healthStore.requestAuthorization(toShare: types, read: types) { [weak self] granted, _ in
            guard granted, let self = self else { return }
            DispatchQueue.main.async { self.begin() }
        }
    }

    private func begin() {
        guard session == nil else { return }
        let config = HKWorkoutConfiguration()
        config.activityType = .golf
        config.locationType = .outdoor
        do {
            let s = try HKWorkoutSession(healthStore: healthStore, configuration: config)
            let b = s.associatedWorkoutBuilder()
            b.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: config)
            s.delegate = self
            session = s
            builder = b
            s.startActivity(with: Date())
            b.beginCollection(withStart: Date()) { _, _ in }
            active = true
        } catch {
            session = nil
            builder = nil
            active = false
        }
    }

    /// Call when the round ends / clears. Safe to call when nothing is running.
    func stop() {
        guard let s = session else { return }
        s.end()
        builder?.endCollection(withEnd: Date()) { [weak self] _, _ in
            self?.builder?.finishWorkout { _, _ in }
        }
        session = nil
        builder = nil
        active = false
    }
}

extension WorkoutSessionManager: HKWorkoutSessionDelegate {
    func workoutSession(_ workoutSession: HKWorkoutSession,
                        didChangeTo toState: HKWorkoutSessionState,
                        from fromState: HKWorkoutSessionState, date: Date) {
        DispatchQueue.main.async { [weak self] in
            if toState == .ended || toState == .stopped { self?.active = false }
        }
    }
    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        DispatchQueue.main.async { [weak self] in
            self?.active = false
            self?.session = nil
            self?.builder = nil
        }
    }
}
