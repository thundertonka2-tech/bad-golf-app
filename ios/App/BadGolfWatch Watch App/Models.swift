// Bad Golf Watch — Data models
// Mirror the Supabase tables the watch reads/writes:
//   course_gps.holes : ref -> { tee, front, mid, back, par, line }  (points are [lng, lat])
//   games            : a round with per-hole scores for the player
//
// The watch is READ-ONLY for green data and WRITE-ONLY for the player's own
// scores (per the permission spec).

import Foundation
import CoreLocation

// A single mapped point. Stored in Supabase as [lng, lat].
struct GeoPoint: Codable, Equatable {
    var lng: Double
    var lat: Double

    var clLocation: CLLocation { CLLocation(latitude: lat, longitude: lng) }

    // Supabase stores [lng, lat]; decode either an array or an object.
    init(lng: Double, lat: Double) { self.lng = lng; self.lat = lat }
    init?(array: [Double]?) {
        guard let a = array, a.count >= 2 else { return nil }
        self.lng = a[0]; self.lat = a[1]
    }
}

// One hole's mapped greens + par. Any of front/mid/back may be nil.
struct Hole: Identifiable, Equatable {
    var id: Int            // hole number, 1...18
    var par: Int?
    var front: GeoPoint?
    var mid: GeoPoint?
    var back: GeoPoint?

    // Confidence per the mapping spec.
    enum Confidence { case full, centerOnly, none }
    var confidence: Confidence {
        if front != nil && mid != nil && back != nil { return .full }
        if mid != nil { return .centerOnly }
        return .none
    }
    var verified: Bool = false   // verified vs. community
}

// A course with its mapped holes.
struct Course: Identifiable, Equatable {
    var id: String
    var name: String
    var city: String?
    var holes: [Int: Hole]   // keyed by hole number
}

// The player's score on one hole.
struct HoleScore: Codable, Equatable {
    var hole: Int
    var strokes: Int
    var putts: Int?
    var updatedAt: Date = Date()
}

// One club from the player's bag, with its yardage range. Handed over from the
// phone so the watch can suggest a club for the (plays-as) yardage.
struct Club: Codable, Equatable {
    var label: String
    var min: Int
    var max: Int
    var mid: Int { (min + max) / 2 }
}

// The active round handed over from the phone (or fetched from `games`).
struct Round: Codable, Equatable {
    var id: String                 // games.id
    var courseId: String
    var courseName: String
    var playerId: String
    var currentHole: Int
    var scores: [Int: HoleScore]   // hole -> score, keyed by PLAYED hole
    var holeCount: Int = 18
    // v1146: both are Optional on purpose. Swift's synthesised Decodable does
    // NOT fall back to a default for a missing key — it throws — so adding a
    // non-optional field here would make every already-cached round on every
    // watch fail to decode on upgrade. Optionals decode as nil when absent.
    var nineMode: String? = nil    // "all18" | "f9x2" | "b9x2" | "front9" | "back9"
    var myPlayerId: String? = nil  // this wearer's per-round player id ("p0-…"),
                                   // the key into games.data.scores

    func total() -> Int { scores.values.reduce(0) { $0 + $1.strokes } }
}

// What the phone sends over WatchConnectivity at round start:
// the round + the course's holes map, so the watch works phone-free.
struct RoundHandoff: Codable {
    var round: Round
    var holesJSON: Data   // raw course_gps.holes JSON, parsed by CourseParser
    var supabaseAccessToken: String?   // scoped session token for direct writes
}
