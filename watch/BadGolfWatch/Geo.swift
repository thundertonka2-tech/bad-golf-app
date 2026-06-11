// Bad Golf Watch — Distance math
// The watch reimplements only this small bit natively: distance from the
// watch's GPS to the front/mid/back points, in yards (haversine), mirroring
// the phone's distance logic.

import Foundation
import CoreLocation

enum Geo {
    static let metersToYards = 1.09361

    /// Great-circle distance in YARDS between a CL location and a mapped point.
    static func yards(from loc: CLLocation, to point: GeoPoint) -> Int {
        let meters = loc.distance(from: point.clLocation)   // CoreLocation haversine
        return Int((meters * metersToYards).rounded())
    }

    /// Front / center / back distances for a hole (nil where not mapped).
    struct Distances { var front: Int?; var center: Int?; var back: Int? }

    static func distances(from loc: CLLocation, hole: Hole) -> Distances {
        Distances(
            front: hole.front.map { yards(from: loc, to: $0) },
            center: hole.mid.map { yards(from: loc, to: $0) },
            back: hole.back.map { yards(from: loc, to: $0) }
        )
    }

    /// "Plays-like" placeholder (v2). For now returns center unchanged.
    /// When elevation/wind data arrives, adjust here to mirror phone playsLike().
    static func playsLike(center: Int?) -> Int? { center }
}
