// Bad Golf Watch — Location
// Live GPS from the WATCH's own receiver (not the phone), so distances work
// when the phone is in the bag. The watch is the PRIMARY rangefinder, so its GPS
// must stay live: a watchdog hard-restarts updates if fixes stop arriving (the
// watchOS equivalent of the phone-side stale-GPS auto-restart). Battery-aware:
// high accuracy only during an active round.

import Foundation
import CoreLocation
import Combine

final class LocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var location: CLLocation?
    @Published var authorized: Bool = false
    @Published var accuracyGood: Bool = false      // horizontalAccuracy under threshold
    @Published var acquiring: Bool = true

    private let manager = CLLocationManager()
    private var active = false
    private var lastFixAt: Date?                    // when the most recent fix arrived
    private var watchdog: Timer?                    // restarts a stalled watch GPS

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 3   // meters; recompute on meaningful movement, not a tight timer
        manager.allowsBackgroundLocationUpdates = false  // when-in-use only for v1
    }

    func requestPermission() {
        manager.requestWhenInUseAuthorization()
    }

    /// Call when a round becomes active.
    func startUpdating() {
        active = true
        acquiring = true
        manager.requestWhenInUseAuthorization()      // idempotent — make sure we're authorized
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 3
        manager.startUpdatingLocation()
        startWatchdog()
    }

    /// Call when no round is active, or to save battery while wrist-down.
    func stopUpdating() {
        active = false
        manager.stopUpdatingLocation()
        watchdog?.invalidate(); watchdog = nil
    }

    // The watch is the primary rangefinder, so its GPS must never silently stall.
    // If no fresh fix has arrived for ~15s during a round, hard-restart updates so
    // the yardage keeps moving instead of showing a frozen last-known position
    // (what looked like "the watch is using the phone's location").
    private func startWatchdog() {
        watchdog?.invalidate()
        watchdog = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            guard let self = self, self.active else { return }
            let stale = (self.lastFixAt == nil) || (Date().timeIntervalSince(self.lastFixAt!) > 15)
            guard stale else { return }
            if self.location == nil { self.acquiring = true }
            self.manager.stopUpdatingLocation()
            self.manager.desiredAccuracy = kCLLocationAccuracyBest
            self.manager.distanceFilter = 3
            self.manager.startUpdatingLocation()
        }
    }

    /// Lower-power mode for Always-On / wrist-down.
    func lowPower() {
        guard active else { return }
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        manager.distanceFilter = 10
    }
    func fullPower() {
        guard active else { return }
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 3
    }

    // MARK: CLLocationManagerDelegate
    func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        switch m.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            authorized = true
            if active { manager.startUpdatingLocation() }
        default:
            authorized = false
        }
    }

    func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        guard let loc = locs.last else { return }
        // Reject fixes that would flash a WRONG yardage and then "self-correct" — the
        // exact flaky behaviour of a false reading that comes back right a moment later:
        //   * negative horizontalAccuracy = an invalid fix
        //   * a cached/stale fix: CoreLocation often hands back an OLD location first
        //     (e.g. the drive to the course), which reads as a huge false distance
        //   * a low-accuracy fix (signal dipped / reacquiring): the number jumps, then
        //     settles once a good fix lands
        // Keep the last GOOD location instead so the displayed number never lies. The
        // confidence dot still shows green/yellow, but we no longer feed it a bad spot.
        guard loc.horizontalAccuracy >= 0 else { return }
        if abs(loc.timestamp.timeIntervalSinceNow) > 5 { return }   // stale / cached fix
        let acceptMeters = 50.0                                       // reject worse-than-50 m fixes
        if loc.horizontalAccuracy > acceptMeters {
            if location == nil { acquiring = true }                  // nothing usable yet → "acquiring", not a wrong number
            return                                                   // already have a good fix → keep it, ignore this one
        }
        location = loc
        lastFixAt = Date()
        accuracyGood = loc.horizontalAccuracy <= 12   // ~within 12 m
        acquiring = false
    }

    func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {
        // Keep last known; surface "acquiring" if we have nothing.
        if location == nil { acquiring = true }
    }
}
