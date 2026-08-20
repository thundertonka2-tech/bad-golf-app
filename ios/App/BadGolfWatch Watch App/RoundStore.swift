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
    private var lastActivityAt: Date?         // v926: stamped on every handoff/score — powers the stale-round guard
    private var dismissedRoundId: String?     // v926: round explicitly closed ON the watch; heartbeat must not resurrect it

    init() { loadCache(); expireStaleRound(); ensureCourseMatchesRound() }

    // MARK: v926 — "End on watch" + stale-round guard (Kevin, Aug 2026)
    // The watch cached its round FOREVER and the only thing that ever cleared it
    // was a one-time roundEnded signal from the phone (v890). Miss that signal
    // (watch out of range at that moment, phone app never reopened, reinstall…)
    // and the watch believed a round was live for days — which kept an
    // HKWorkoutSession running, which made watchOS pin/relaunch the app on every
    // wrist-raise with NO user-visible way out. Kevin's only escape was deleting
    // the app. Three layers now:
    //  1) closeOnWatch() — explicit close button (ScoringView). Remembers the
    //     round id so the phone's 8s heartbeat can't resurrect it seconds later;
    //     a DIFFERENT round lifts the dismissal automatically, or "Check again"
    //     on the picker lifts it by hand. Phone scores are never touched.
    //  2) expireStaleRound() — a cached round with no activity for 12+ hours is
    //     over; drop it at launch instead of booting into a workout session.
    //  3) WorkoutSessionManager.endOrphanedSession() — ends zombie workout
    //     sessions watchOS would otherwise keep "recovering" (see that file).
    func closeOnWatch() {
        dismissedRoundId = round?.id
        round = nil
        currentHole = 1
        lastPhoneHole = -1
        pendingHoles.removeAll()
        syncState = .idle
        lastActivityAt = nil
        saveCache()
        WorkoutSessionManager.shared.stop()   // belt & braces; App.onChange(round?.id) also stops it
    }

    /// The user explicitly asked to re-attach (picker's "Check again").
    func clearDismissal() {
        if dismissedRoundId != nil { dismissedRoundId = nil; saveCache() }
    }

    /// Drop a cached round that has clearly been over for hours. A real round
    /// gets lastActivityAt re-stamped by every phone heartbeat (8s) and every
    /// wrist-entered score, so 12h of silence means it's long finished. A nil
    /// stamp (cache written by a pre-v926 build) is treated as stale — if the
    /// round IS live, the phone re-hands it within seconds anyway.
    private func expireStaleRound() {
        guard round != nil else { return }
        let cutoff: TimeInterval = 12 * 60 * 60
        if lastActivityAt == nil || Date().timeIntervalSince(lastActivityAt!) > cutoff {
            round = nil
            currentHole = 1
            lastPhoneHole = -1
            pendingHoles.removeAll()
            syncState = .idle
            lastActivityAt = nil
            saveCache()
        }
    }

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
        lastActivityAt = Date()               // v926: scoring = activity
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
        if handoff.round.id == dismissedRoundId { return }   // v926: closed on watch — stay closed
        dismissedRoundId = nil
        lastActivityAt = Date()
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
            lastActivityAt = nil                  // v926
            dismissedRoundId = nil                // v926: the round is over — dismissal no longer needed
            signedIn = SessionStore.shared.isSignedIn
            saveCache()
            return
        }
        if let roundRow = payload["round"] as? [String: Any],
           let r = RoundParser.parse(row: roundRow),
           r.id != dismissedRoundId {             // v926: closed on watch — the heartbeat must NOT resurrect it
            dismissedRoundId = nil                // a different round lifts the dismissal automatically
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
            lastActivityAt = Date()               // v926: live handoff = activity
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
    /// v1146: this used to call `fetchActiveRound(playerId:)`, which queried two
    /// columns that do not exist and returned HTTP 400 every single time. The
    /// path was dead, so the watch depended entirely on the phone's hand-off —
    /// and that heartbeat stops the moment the phone app leaves the foreground.
    /// Phone in a pocket, watch gets nothing. Two real routes now:
    ///
    ///   1. REFRESH the round we already hold, by its code. This is the common
    ///      case and the valuable one — it keeps the group's scores current with
    ///      the phone asleep in a bag.
    ///   2. DISCOVER an unfinished round this account owns, when we hold none.
    ///      Only finds rounds the wearer CREATED (`games.owner_uid` is the sole
    ///      account link on the row); for a round you were added to, the phone's
    ///      hand-off is still the only route in.
    ///
    /// Both need the session token — RLS gates round rows to signed-in users.
    func refreshFromSupabase() async {
        let svc = SupabaseService.shared
        var fetched: Round? = nil

        if let cur = round, !cur.id.isEmpty {
            fetched = await svc.fetchRound(code: cur.id, myPlayerId: cur.myPlayerId)
            // A round we hold that comes back FINISHED (parseGamesRow returns nil
            // for one) is over. Clearing it here is the safety net for a missed
            // v890 roundEnded signal — the case that used to pin a workout
            // session open for days with no way out but deleting the app.
            if fetched == nil, await svc.roundIsGone(code: cur.id) {
                closeOnWatch()
                dismissedRoundId = nil        // it ended on its own; do not suppress the next one
                return
            }
        }
        if fetched == nil, let uid = SessionStore.shared.playerId, !uid.isEmpty {
            fetched = await svc.findMyActiveRound(ownerUid: uid)
        }

        guard var r = fetched, r.id != dismissedRoundId else { return }  // v926: closed on watch — stay closed

        // The row carries no current hole, and the wearer may be browsing. Keep
        // ours; only a real hand-off from the phone moves the watch's hole.
        r.currentHole = (round?.id == r.id) ? currentHole : 1
        // v890: a wrist score that has not synced yet must survive a refresh.
        if let cur = round, cur.id == r.id {
            for h in pendingHoles { if let s = cur.scores[h] { r.scores[h] = s } }
            if r.myPlayerId == nil { r.myPlayerId = cur.myPlayerId }
        }

        self.round = r
        self.lastActivityAt = Date()
        self.currentHole = r.currentHole
        // v1146: pass nineMode, or a repeated-nine round pulled down this way
        // would range to the wrong hole exactly like the hand-off used to.
        if course?.id != r.courseId,
           let c = await svc.fetchCourse(courseId: r.courseId, nineMode: r.nineMode) {
            self.course = c
        }
        saveCache()
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
        let wantedNineMode = r.nineMode    // v1146: repeated-nine rounds re-key the greens
        Task { @MainActor in
            if let c = await SupabaseService.shared.fetchCourse(courseId: wantedId, nineMode: wantedNineMode) {
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
    // v891: scores go to the PHONE over WCSession — the phone app saves them
    // through its normal protected merge path (same code path as tapping the
    // score on the phone screen). The old SupabaseService.writeScores targeted
    // columns that don't exist on the real `games` table (`id`, `scores`), so
    // every watch score write failed with a 400 and sat "queued" forever.
    func flush() async {
        guard let r = round, !pendingHoles.isEmpty else { return }
        syncState = .syncing
        let pending = pendingHoles
        let toSend = r.scores.filter { pending.contains($0.key) }
        let ok = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
            WatchConnectivityManager.shared.sendScores(roundId: r.id, scores: toSend) { cont.resume(returning: $0) }
        }
        if ok {
            pendingHoles.subtract(pending)   // only clear what THIS send covered
            syncState = pendingHoles.isEmpty ? .synced : .queued(pendingHoles.count)
        } else {
            syncState = .queued(pendingHoles.count)
        }
    }

    // MARK: Cache persistence
    private func saveCache() {
        // v926: + lastActivityAt (stale-round guard) + dismissedRoundId ("End on
        // watch" survives an app relaunch). Both optional, so a pre-v926 cache
        // still decodes — its nil lastActivityAt makes expireStaleRound() treat
        // it as stale, which is exactly the healing we want on first run.
        struct Cache: Codable { var round: Round?; var currentHole: Int; var pending: [Int]; var lastActivityAt: Date?; var dismissedRoundId: String? }
        // Course (greens) cached separately as raw to keep this simple.
        let c = Cache(round: round, currentHole: currentHole, pending: Array(pendingHoles),
                      lastActivityAt: lastActivityAt, dismissedRoundId: dismissedRoundId)
        if let data = try? JSONEncoder().encode(c) { try? data.write(to: cacheURL) }
        if let course = course { CourseCache.save(course) }
    }
    private func loadCache() {
        struct Cache: Codable { var round: Round?; var currentHole: Int; var pending: [Int]; var lastActivityAt: Date?; var dismissedRoundId: String? }
        if let data = try? Data(contentsOf: cacheURL),
           let c = try? JSONDecoder().decode(Cache.self, from: data) {
            self.round = c.round
            self.currentHole = c.currentHole
            self.pendingHoles = Set(c.pending)
            self.lastActivityAt = c.lastActivityAt
            self.dismissedRoundId = c.dismissedRoundId
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
