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
    // v1910 (Phase 1 — group scoring, hole stats, units). All Optional for the same
    // reason as the two above: a round cached by an older build must still decode.
    var players: [GroupPlayer]? = nil   // the whole group, with stats + who this watch may score
    var track: StatTracking? = nil      // which per-hole stats the round tracks
    var standings: Standings? = nil     // live units, computed on the phone
    var isEvent: Bool? = nil            // tournament / event round
    var scorer: Bool? = nil             // this watch may score the other players
    var pars: [Int: Int]? = nil         // played hole -> par (the round's card)

    func total() -> Int { scores.values.reduce(0) { $0 + $1.strokes } }
}

// v1910: one player in the group, as the phone hands them over. Every array is
// indexed by PLAYED hole - 1, exactly like games.data.scores on the phone.
// The watch never decides who may be scored — canScore comes from the phone, which
// applies its own rule (an event round: the group's scorekeeper only).
struct GroupPlayer: Codable, Equatable, Identifiable {
    var id: String
    var name: String
    var me: Bool
    var canScore: Bool
    var scores: [Int?]
    var putts: [Int?]
    var fw: [String?]     // "H" hit, "L" / "R" missed left / right, "M" missed (side unknown), nil unmarked
    var pen: [Int?]
    var gir: [Bool?]      // derived on the phone; read-only here

    static func value<T>(_ a: [T?], _ hole: Int) -> T? {
        (hole >= 1 && hole <= a.count) ? a[hole - 1] : nil
    }
    static func put<T>(_ a: inout [T?], _ hole: Int, _ v: T?) {
        guard hole >= 1 && hole <= 18 else { return }
        while a.count < hole { a.append(nil) }
        a[hole - 1] = v
    }
    func strokes(_ h: Int) -> Int? { GroupPlayer.value(scores, h) }
    func puttsOn(_ h: Int) -> Int? { GroupPlayer.value(putts, h) }
    func fairway(_ h: Int) -> String? { GroupPlayer.value(fw, h) }
    func penalties(_ h: Int) -> Int? { GroupPlayer.value(pen, h) }
    func girOn(_ h: Int) -> Bool? { GroupPlayer.value(gir, h) }

    /// Apply one edit locally (the same edit goes to the phone as a cell).
    mutating func apply(field: String, hole: Int, int iv: Int?, str sv: String?) {
        switch field {
        case "s":   GroupPlayer.put(&scores, hole, iv)
        case "p":   GroupPlayer.put(&putts, hole, iv)
        case "pen": GroupPlayer.put(&pen, hole, ((iv ?? 0) > 0) ? iv : nil)
        case "fw":  GroupPlayer.put(&fw, hole, sv)
        default:    break
        }
    }
}

// v1910: which per-hole stats the round tracks (set up on the phone).
struct StatTracking: Codable, Equatable {
    var putts: Bool
    var fairways: Bool
    var penalties: Bool
    var gir: Bool
    static let off = StatTracking(putts: false, fairways: false, penalties: false, gir: false)
}

// v1910: live units, computed by the phone's own game engine. Never computed here.
struct GameUnits: Codable, Equatable, Identifiable {
    var key: String
    var label: String
    var units: [String: Double]   // player id -> units
    var id: String { key }
}
struct Standings: Codable, Equatable {
    var at: Double                // ms, when the phone computed it
    var thru: Int
    var units: [String: Double]   // player id -> total units
    var games: [GameUnits]
}

// v1910: the final card shown on the wrist when the round finishes.
struct BoardRow: Codable, Equatable, Identifiable {
    var id: String
    var name: String
    var units: Double
    var me: Bool
}
struct RoundSummary: Codable, Equatable {
    var code: String
    var course: String
    var strokes: Int
    var toPar: Int
    var holes: Int
    var putts: Int?
    var fairways: String?
    var girs: String?
    var units: Double?
    var board: [BoardRow]
}

// v1910: one edit waiting to reach the phone. `field` is "s" strokes, "p" putts,
// "fw" fairway, "pen" penalties. Keyed by player + hole + field, so a later edit of
// the same cell replaces an unsent earlier one.
struct CellEdit: Codable, Equatable {
    var pid: String
    var hole: Int
    var field: String
    var iv: Int?
    var sv: String?
    var at: Date
    var key: String { "\(pid)|\(hole)|\(field)" }
}

// v1910: "+3", "−1.5", "0" — units, never currency.
enum UnitsFormat {
    static func text(_ v: Double) -> String {
        let r = (v * 100).rounded() / 100
        if abs(r) < 0.005 { return "0" }
        var s: String
        if r == r.rounded() { s = String(Int(abs(r))) }
        else {
            s = String(format: "%.2f", abs(r))
            while s.hasSuffix("0") { s.removeLast() }
        }
        return (r > 0 ? "+" : "\u{2212}") + s
    }
}

// What the phone sends over WatchConnectivity at round start:
// the round + the course's holes map, so the watch works phone-free.
struct RoundHandoff: Codable {
    var round: Round
    var holesJSON: Data   // raw course_gps.holes JSON, parsed by CourseParser
    var supabaseAccessToken: String?   // scoped session token for direct writes
}
