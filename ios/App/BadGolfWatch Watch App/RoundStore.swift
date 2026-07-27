// Bad Golf Watch — Round state + local cache + sync queue
// The single source of truth the SwiftUI views observe. Works fully offline:
// the active round + course greens are cached on the watch; score changes go
// to a local queue and flush to Supabase `games` when connectivity returns.

import Foundation
import Combine

@MainActor
final class RoundStore: ObservableObject {
    @Published var round: Round?
    @Published var course: Course?
    @Published var currentHole: Int = 1
    @Published var syncState: SyncState = .idle
    @Published var signedIn: Bool = SessionStore.shared.isSignedIn
    @Published var clubs: [Club] = []          // player's bag (for the suggested-club readout)
    @Published var watchPlaysAs: Bool = true   // show plays-as vs plain GPS yardage

    enum SyncState: Equatable { case idle, queued(Int), syncing, synced, error(String) }

    private let cacheURL: URL = {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return dir.appendingPathComponent("active_round.json")
    }()
    private var pendingHoles: Set<Int> = []   // holes with unsynced score writes
    private var lastPhoneHole: Int = -1       // v890: last hole the PHONE told us about (hole-jump guard)

    init() { loadCache(); ensureCourseMatchesRound() }

    // MARK: Hole helpers
    // The cached greens ONLY when they belong to the ACTIVE round's course.
    // The round and the course are cached separately, so without this guard a
    // course mapped earlier (e.g. the Michigan courses Kevin was mapping) would
    // keep feeding greens into a brand-new round on a different course — making
    // the watch range to a green a thousand miles away (the 1.7M-yard bug). When
    // both ids are known and DON'T match, we refuse the stale greens (show
    // "Loading…") until ensureCourseMatchesRound() pulls the right course.
    var activeCourse: Course? {
        guard let c = course else { return nil }
        guard let r = round, !r.courseId.isEmpty, !c.id.isEmpty else { return course }
        return c.id == r.courseId ? c : nil
    }
    var hole: Hole? { activeCourse?.holes[currentHole] }
    var par: Int? { hole?.par }
    var holeCount: Int { round?.holeCount ?? 18 }

    func score(for h: Int) -> Int { round?.scores[h]?.strokes ?? 0 }

    func scoreToParText() -> String {
        guard let r = round else { return "" }
        var playedPar = 0, played = 0
        for (h, s) in r.scores {
            played += s.strokes
            playedPar += activeCourse?.holes[h]?.par ?? 0
        }
        let diff = played - playedPar
        let thru = r.scores.count
        let sign = diff == 0 ? "E" : (diff > 0 ? "+\(diff)" : "\(diff)")
        return "\(sign) thru \(thru)"
    }

    // MARK: Mutations (player's own score only)
    func setStrokes(_ strokes: Int, hole h: Int) {
        guard var r = round else { return }
        let clamped = max(0, strokes)
        var s = r.scores[h] ?? HoleScore(hole: h, strokes: 0)
        s.strokes = clamped
        s.updatedAt = Date()
        r.scores[h] = s
        round = r
        pendingHoles.insert(h)
        syncState = .queued(pendingHoles.count)
        saveCache()
        Task { await flush() }   // try immediately; safe if offline
    }
    func bump(_ delta: Int) { setStrokes(score(for: currentHole) + delta, hole: currentHole) }

    func goTo(hole h: Int) {
        currentHole = ((h - 1 + holeCount) % holeCount) + 1
        round?.currentHole = currentHole
        saveCache()
    }
    func next() { goTo(hole: currentHole + 1) }
    func prev() { goTo(hole: currentHole - 1) }

    // MARK: Handoff from phone
    func apply(handoff: RoundHandoff) {
        if let token = handoff.supabaseAccessToken { SessionStore.shared.accessToken = token }
        self.round = handoff.round
        self.currentHole = handoff.round.currentHole
        if let row = try? JSONSerialization.jsonObject(with: handoff.holesJSON) as? [String: Any],
           let c = CourseParser.parse(row: row) {
            self.course = c
        }
        SessionStore.shared.playerId = handoff.round.playerId
        signedIn = SessionStore.shared.isSignedIn
        saveCache()
        ensureCourseMatchesRound()
    }

    // MARK: Tolerant hand-off from the phone (token + optional round + course)
    // Sent over WCSession as loose JSON; parsed with the same tolerant parsers
    // used for the Supabase path. The token alone is enough to flip the watch
    // out of the "sign in on your phone" state.
    func applyPayload(_ payload: [String: Any]) {
        if let token = payload["token"] as? String, !token.isEmpty {
            SessionStore.shared.accessToken = token
        }
        if let pid = payload["playerId"] as? String, !pid.isEmpty {
            SessionStore.shared.playerId = pid
        }
        // v890: the phone explicitly says the round ENDED — clear it. Nothing
        // ever told the watch a round finished, so it kept showing yesterday's
        // round until the NEXT one happened to start.
        if (payload["roundEnded"] as? Bool) == true {
            round = nil
            currentHole = 1
            lastPhoneHole = -1
            pendingHoles.removeAll()
            syncState = .idle
            signedIn = SessionStore.shared.isSignedIn
            saveCache()
            return
        }
        if let roundRow = payload["round"] as? [String: Any],
           let r = RoundParser.parse(row: roundRow) {
            // v890: MERGE, don't replace. A score tapped on the WATCH that hasn't
            // synced yet (pendingHoles) must survive the phone's next handoff —
            // the 8s heartbeat was overwriting a wrist-entered score with the
            // phone's stale copy seconds after it was tapped.
            var merged = r
            if let cur = self.round, cur.id == r.id {
                for h in pendingHoles { if let s = cur.scores[h] { merged.scores[h] = s } }
            } else {
                pendingHoles.removeAll()          // different round — old queue no longer applies
                syncState = .idle
                lastPhoneHole = -1
            }
            self.round = merged
            // v890: only JUMP the watch's hole when the PHONE's hole actually
            // changed — re-applying the same handoff every 8s was yanking the
            // watch back to the phone's hole while the wearer browsed other
            // holes with prev/next.
            if r.currentHole != lastPhoneHole {
                self.currentHole = r.currentHole
                lastPhoneHole = r.currentHole
            }
        }
        if let courseRow = payload["course"] as? [String: Any],
           let c = CourseParser.parse(row: courseRow) {
            self.course = c
        }
        if let cl = payload["clubs"] as? [[String: Any]] {
            self.clubs = cl.compactMap { d in
                guard let label = d["label"] as? String else { return nil }
                return Club(label: label, min: (d["min"] as? Int) ?? 0, max: (d["max"] as? Int) ?? 0)
            }
        }
        if let pa = payload["playsAs"] as? Bool { self.watchPlaysAs = pa }
        signedIn = SessionStore.shared.isSignedIn
        saveCache()
        ensureCourseMatchesRound()
    }

    /// Best club for a yardage: the one whose range contains it, else nearest by mid.
    func suggestedClub(for yards: Int) -> String? {
        guard !clubs.isEmpty else { return nil }
        if let c = clubs.first(where: { $0.min <= yards && yards <= $0.max }) { return c.label }
        return clubs.min(by: { abs($0.mid - yards) < abs($1.mid - yards) })?.label
    }

    // MARK: Direct fetch (when no handoff, watch has network)
    func refreshFromSupabase() async {
        guard let pid = SessionStore.shared.playerId else { return }
        if let r = await SupabaseService.shared.fetchActiveRound(playerId: pid) {
            self.round = r
            self.currentHole = r.currentHole
            if let c = await SupabaseService.shared.fetchCourse(courseId: r.courseId) {
                self.course = c
            }
            saveCache()
        }
    }

    // MARK: Keep the cached greens in sync with the active round's course
    /// If the cached course doesn't belong to the active round (a new round on a
    /// different course, before its greens were handed over), drop the stale
    /// greens IMMEDIATELY so we never range to the wrong course, then pull the
    /// correct course — from Supabase (course_gps) if we have network, otherwise
    /// ask the phone to re-send the round handoff (which carries the greens).
    func ensureCourseMatchesRound() {
        guard let r = round, !r.courseId.isEmpty else { return }
        if course?.id == r.courseId { return }            // already correct
        if course != nil { course = nil; saveCache() }    // drop stale greens NOW
        let wantedId = r.courseId
        Task { @MainActor in
            if let c = await SupabaseService.shared.fetchCourse(courseId: wantedId) {
                // Guard against a race: only apply if the round still wants it.
                if self.round?.courseId == wantedId {
                    self.course = c
                    self.saveCache()
                }
            } else {
                WatchConnectivityManager.shared.requestRound()
            }
        }
    }

    // MARK: Sync queue
    func flush() async {
        guard let r = round, !pendingHoles.isEmpty else { return }
        syncState = .syncing
        let ok = await SupabaseService.shared.writeScores(roundId: r.id, scores: r.scores)
        if ok {
            pendingHoles.removeAll()
            syncState = .synced
        } else {
            syncState = .queued(pendingHoles.count)
        }
    }

    // MARK: Cache persistence
    private func saveCache() {
        struct Cache: Codable { var round: Round?; var currentHole: Int; var pending: [Int] }
        // Course (greens) cached separately as raw to keep this simple.
        let c = Cache(round: round, currentHole: currentHole, pending: Array(pendingHoles))
        if let data = try? JSONEncoder().encode(c) { try? data.write(to: cacheURL) }
        if let course = course { CourseCache.save(course) }
    }
    private func loadCache() {
        struct Cache: Codable { var round: Round?; var currentHole: Int; var pending: [Int] }
        if let data = try? Data(contentsOf: cacheURL),
           let c = try? JSONDecoder().decode(Cache.self, from: data) {
            self.round = c.round
            self.currentHole = c.currentHole
            self.pendingHoles = Set(c.pending)
            if !c.pending.isEmpty { self.syncState = .queued(c.pending.count) }
        }
        self.course = CourseCache.load()
    }
}

// Lightweight course (greens) cache so distances work cold/offline.
enum CourseCache {
    private static var url: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("course_cache.json")
    }
    struct Flat: Codable {
        var id: String; var name: String; var city: String?
        struct H: Codable { var id: Int; var par: Int?; var f: [Double]?; var m: [Double]?; var b: [Double]?; var v: Bool }
        var holes: [H]
    }
    static func save(_ c: Course) {
        let flat = Flat(id: c.id, name: c.name, city: c.city,
            holes: c.holes.values.map { h in
                Flat.H(id: h.id, par: h.par,
                       f: h.front.map { [$0.lng, $0.lat] },
                       m: h.mid.map { [$0.lng, $0.lat] },
                       b: h.back.map { [$0.lng, $0.lat] }, v: h.verified)
            })
        if let d = try? JSONEncoder().encode(flat) { try? d.write(to: url) }
    }
    static func load() -> Course? {
        guard let d = try? Data(contentsOf: url),
              let f = try? JSONDecoder().decode(Flat.self, from: d) else { return nil }
        var holes: [Int: Hole] = [:]
        for h in f.holes {
            holes[h.id] = Hole(id: h.id, par: h.par,
                front: GeoPoint(array: h.f), mid: GeoPoint(array: h.m),
                back: GeoPoint(array: h.b), verified: h.v)
        }
        return Course(id: f.id, name: f.name, city: f.city, holes: holes)
    }
}
