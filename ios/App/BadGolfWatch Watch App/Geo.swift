// Bad Golf Watch — Distance math
// The watch reimplements only this small bit natively: distance from the
// watch's GPS to the front/mid/back points, in yards (haversine), mirroring
// the phone's distance logic.

import Foundation
import CoreLocation
import SwiftUI

// MARK: - Brand theme (shared colors)
// Defined once; used by every watch screen. Navy is the background; blue is the
// accent on buttons/labels/score; amber is the "plays-like" highlight.
extension Color {
    /// Deep brand navy — screen background.
    static let badGolfNavy  = Color(red: 14/255, green: 58/255, blue: 100/255)
    /// Lighter brand blue — buttons, labels, accents.
    static let badGolfBlue  = Color(red: 0.42, green: 0.72, blue: 1.0)
    /// Plays-like amber (#ffd34d).
    static let badGolfAmber = Color(red: 1.0, green: 0xd3/255, blue: 0x4d/255)
}

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

    /// Initial bearing (degrees, 0 = North, clockwise) from one coord to another.
    static func bearing(from: CLLocationCoordinate2D, to: CLLocationCoordinate2D) -> Double {
        let lat1 = from.latitude * .pi / 180
        let lat2 = to.latitude * .pi / 180
        let dLon = (to.longitude - from.longitude) * .pi / 180
        let y = sin(dLon) * cos(lat2)
        let x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon)
        let deg = atan2(y, x) * 180 / .pi
        return (deg + 360).truncatingRemainder(dividingBy: 360)
    }

    /// "Plays-like" yardage — mirrors the phone. Pure function.
    ///
    /// Total adjustment = slope (elevation rise player→green, ~+1 yd per yd up,
    /// − for down) + altitude (ball flies ~1.1% farther per 1000 ft above sea
    /// level) + wind (head/tail component along the player→green bearing) +
    /// temperature (colder plays a touch longer).
    ///
    /// Any missing input (no center, no weather/elevation) → returns the raw
    /// center distance so callers can simply hide "plays N" when it equals it.
    static func playsLike(
        center: Int?,
        player: CLLocationCoordinate2D?,
        green: CLLocationCoordinate2D?,
        playerElevationM: Double?,
        greenElevationM: Double?,
        windMph: Double?,
        windDirFromDeg: Double?,
        tempF: Double?
    ) -> Int? {
        guard let raw = center else { return nil }
        let rawD = Double(raw)
        var adjusted = rawD

        // 1) Slope: elevation change from player to green, in yards (rise = longer).
        if let pe = playerElevationM, let ge = greenElevationM {
            let riseYards = (ge - pe) * metersToYards   // + uphill, − downhill
            adjusted += riseYards
        }

        // 2) Altitude: ~1.1% farther per 1000 ft of green elevation above sea level.
        if let ge = greenElevationM {
            let feet = ge * 3.28084
            let altFactor = 1.0 - 0.011 * (feet / 1000.0)  // higher altitude → plays SHORTER
            adjusted *= altFactor
        }

        // 3) Wind: component along the shot line. windDirFrom is the direction the
        //    wind blows FROM. Headwind (blowing toward the player) lengthens the
        //    shot; tailwind shortens it. ~1% of carry per mph of pure head/tail.
        if let mph = windMph, let fromDeg = windDirFromDeg,
           let p = player, let g = green {
            let shotBearing = bearing(from: p, to: g)
            // Direction wind is blowing TOWARD:
            let windToDeg = (fromDeg + 180).truncatingRemainder(dividingBy: 360)
            // Component of wind along the shot line: +tail, −head.
            let theta = (windToDeg - shotBearing) * .pi / 180
            let along = mph * cos(theta)        // + tailwind, − headwind
            adjusted -= along * (rawD / 100.0) * 1.0   // ~1 yd per 100yd per mph
        }

        // 4) Temperature: small. Baseline ~70°F; colder plays longer (~0.2 yd per
        //    100yd per 10°F below baseline), warmer plays shorter.
        if let t = tempF {
            let deltaTen = (70.0 - t) / 10.0
            adjusted += deltaTen * (rawD / 100.0) * 0.2
        }

        return Int(adjusted.rounded())
    }
}
