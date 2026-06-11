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

    enum SyncState: Equatable { case idle, queued(Int), syncing, synced, error(String) }

    private let cacheURL: URL = {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return dir.appendingPathComponent("active_round.json")
    }()
    private var pendingHoles: Set<Int> = []   // holes with unsynced score writes

    init() { loadCache() }

    // MARK: Hole helpers
    var hole: Hole? { course?.holes[currentHole] }
    var par: Int? { hole?.par }
    var holeCount: Int { round?.holeCount ?? 18 }

    func score(for h: Int) -> Int { round?.scores[h]?.strokes ?? 0 }

    func scoreToParText() -> String {
        guard let r = round else { return "" }
        var playedPar = 0, played = 0
        for (h, s) in r.scores {
            played += s.strokes
            playedPar += course?.holes[h]?.par ?? 0
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
        saveCache()
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
