// Bad Golf Watch — Location
// Live GPS from the WATCH's own receiver (not the phone), so distances work
// when the phone is in the bag. Battery-aware: high accuracy only during an
// active round, backs off when the screen isn't active.

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
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.startUpdatingLocation()
    }

    /// Call when no round is active, or to save battery while wrist-down.
    func stopUpdating() {
        active = false
        manager.stopUpdatingLocation()
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
        // Ignore wildly inaccurate fixes.
        guard loc.horizontalAccuracy >= 0 else { return }
        location = loc
        accuracyGood = loc.horizontalAccuracy <= 12   // ~within 12 m
        acquiring = false
    }

    func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {
        // Keep last known; surface "acquiring" if we have nothing.
        if location == nil { acquiring = true }
    }
}
