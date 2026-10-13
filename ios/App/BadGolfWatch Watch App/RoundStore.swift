// Bad Golf Watch — Round state + local cache + sync queue
// The single source of truth the SwiftUI views observe. Works fully offline:
// the active round + course greens are cached on the watch; score changes go
// to a local queue and flush to Supabase `games` when connectivity returns.

import Foundation
import Combine
#if os(watchOS)
import WatchKit
#endif

@MainActor
final class RoundStore: ObservableObject {
    @Published var round: Round?
    @Published var course: Course?
    @Published var currentHole: Int = 1
    @Published var syncState: SyncState = .idle
    @Published var signedIn: Bool = SessionStore.shared.isSignedIn
    @Published var clubs: [Club] = []          // player's bag (for the suggested-club readout)
    @Published var watchPlaysAs: Bool = true   // show plays-as vs plain GPS yardage
    @Published var summary: RoundSummary?      // v1910: final card after the round finishes
    @Published var finishNote: String?         // v1910: what happened to a Finish from the wrist
    @Published private(set) var driveYds: Int? // v1911: Est. Drive for the hole being played

    enum SyncState: Equatable { case idle, queued(Int), syncing, synced, error(String) }

    private let cacheURL: URL = {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return dir.appendingPathComponent("active_round.json")
    }()
    private var pendingHoles: Set<Int> = []   // holes with unsynced score writes
    private var lastPhoneHole: Int = -1       // v890: last hole the PHONE told us about (hole-jump guard)
    private var lastActivityAt: Date?         // v926: stamped on every handoff/score — powers the stale-round guard
    private var dismissedRoundId: String?     // v926: round explicitly closed ON the watch; heartbeat must not resurrect it
    private var pendingCells: [String: CellEdit] = [:]   // v1910: group / stat edits not yet acked by the phone
    private var dismissedSummaryCode: String?            // v1910: the phone re-sends its last message; don't re-show a dismissed summary
    private var flushTask: Task<Void, Never>?            // v1910: debounced send (a crown spin is one message, not one per detent)
    private var noteTask: Task<Void, Never>?

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
        // v1910: "Your scores stay safe on your phone" — so hand any unsent wrist edits
        // to WatchConnectivity before clearing. sendScores falls back to guaranteed
        // (queued) delivery when the phone is out of range.
        if let r = round, !(pendingHoles.isEmpty && pendingCells.isEmpty) {
            let toSend = r.scores.filter { pendingHoles.contains($0.key) }
            WatchConnectivityManager.shared.sendScores(roundId: r.id, scores: toSend,
                                                       cells: Array(pendingCells.values)) { _ in }
        }
        flushTask?.cancel()
        dismissedRoundId = round?.id
        round = nil
        currentHole = 1
        lastPhoneHole = -1
        pendingHoles.removeAll()
        pendingCells.removeAll()               // v1910
        finishNote = nil
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
            pendingCells.removeAll()          // v1910
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
        // v1910: keep my row in the group list in step with the single-player screen
        if var ps = r.players, let i = ps.firstIndex(where: { $0.me }) {
            GroupPlayer.put(&ps[i].scores, h, clamped > 0 ? clamped : nil)
            r.players = ps
        }
        round = r
        pendingHoles.insert(h)
        syncState = .queued(pendingHoles.count)
        lastActivityAt = Date()               // v926: scoring = activity
        saveCache()
        Task { await flush() }   // try immediately; safe if offline
    }
    func bump(_ delta: Int) { setStrokes(score(for: currentHole) + delta, hole: currentHole) }

    // MARK: v1910 — group scoring + hole stats
    var players: [GroupPlayer] { round?.players ?? [] }
    var me: GroupPlayer? { players.first(where: { $0.me }) }
    var isGroup: Bool { players.count > 1 }
    /// Me first, then the group in card order.
    var orderedPlayers: [GroupPlayer] { players.filter { $0.me } + players.filter { !$0.me } }
    var track: StatTracking { round?.track ?? StatTracking.off }
    func player(_ pid: String) -> GroupPlayer? { players.first(where: { $0.id == pid }) }
    /// The round's own card first (per played hole), the mapped course as a fallback.
    func parFor(hole h: Int) -> Int? { round?.pars?[h] ?? activeCourse?.holes[h]?.par }
    /// Running score to par over the holes this player has scored.
    func toPar(_ p: GroupPlayer) -> String {
        var diff = 0, n = 0
        for (i, v) in p.scores.enumerated() {
            guard let st = v, let par = parFor(hole: i + 1) else { continue }
            diff += st - par; n += 1
        }
        if n == 0 { return "" }
        return diff == 0 ? "E" : (diff > 0 ? "+\(diff)" : "\(diff)")
    }
    /// Finish is offered to anyone in a casual round, and to the scorekeeper in an event.
    var canFinish: Bool { round != nil && (round?.isEvent != true || round?.scorer == true) }

    /// Edit one cell for any player this watch may score. Applied locally at once,
    /// queued, and sent to the phone — which saves it through its own protected path
    /// (latest entry wins). My own strokes also ride the original own-score path,
    /// which the distance page and the to-par line read.
    func setCell(pid: String, hole h: Int, field: String, int iv: Int? = nil, str sv: String? = nil) {
        guard var r = round, var ps = r.players,
              let i = ps.firstIndex(where: { $0.id == pid }), ps[i].canScore else { return }
        ps[i].apply(field: field, hole: h, int: iv, str: sv)
        r.players = ps
        if field == "s", ps[i].me {
            guard let v = iv, v > 0 else { return }          // a watch never clears a score
            var s = r.scores[h] ?? HoleScore(hole: h, strokes: 0)
            s.strokes = v
            s.updatedAt = Date()
            r.scores[h] = s
            pendingHoles.insert(h)
        } else {
            if field == "s" && (iv ?? 0) <= 0 { return }      // never clear anyone's score
            let e = CellEdit(pid: pid, hole: h, field: field, iv: iv, sv: sv, at: Date())
            pendingCells[e.key] = e
        }
        round = r
        syncState = .queued(pendingHoles.count + pendingCells.count)
        lastActivityAt = Date()
        saveCache()
        scheduleFlush()
    }

    /// One send ~0.3s after the last edit, so spinning the crown 4 → 8 is one message.
    private func scheduleFlush() {
        flushTask?.cancel()
        flushTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 300_000_000)
            if Task.isCancelled { return }
            await self.flush()
        }
    }

    /// Re-apply edits the phone has not confirmed yet onto a fresh hand-off, so the
    /// 8-second heartbeat can't flash an old value over a wrist tap.
    private func overlayPending(_ r: Round) -> Round {
        guard var ps = r.players else { return r }
        for e in pendingCells.values.sorted(by: { $0.at < $1.at }) {
            if let i = ps.firstIndex(where: { $0.id == e.pid }) {
                ps[i].apply(field: e.field, hole: e.hole, int: e.iv, str: e.sv)
            }
        }
        if let i = ps.firstIndex(where: { $0.me }) {
            for h in pendingHoles { if let st = r.scores[h]?.strokes, st > 0 { GroupPlayer.put(&ps[i].scores, h, st) } }
        }
        var out = r
        out.players = ps
        return out
    }

    /// A tap when another player's score lands; a stronger tap when I win a skin,
    /// closest-to-the-pin or a greenie (my units in that game went up).
    private func playHaptics(old: Round, new: Round) {
        #if os(watchOS)
        guard let op = old.players, let np = new.players else { return }
        var landed = false
        for p in np where !p.me {
            if let o = op.first(where: { $0.id == p.id }), o.scores != p.scores { landed = true; break }
        }
        var won = false
        if let oldSt = old.standings, let ns = new.standings, let meId = np.first(where: { $0.me })?.id {
            let keys: Set<String> = ["skins", "ctp", "p3greenie", "grp:skins", "grp:ctp", "grp:p3greenie"]
            for g in ns.games where keys.contains(g.key) {
                let before = oldSt.games.first(where: { $0.key == g.key })?.units[meId] ?? 0
                if (g.units[meId] ?? 0) > before + 0.001 { won = true }
            }
        }
        if won { WKInterfaceDevice.current().play(.success) }
        else if landed { WKInterfaceDevice.current().play(.click) }
        #endif
    }

    /// Ask the phone to finish the round. The phone runs its own Finish flow, so any
    /// question it has (a missing Wolf pick, blank holes) is answered there.
    /// Every queued edit must reach the phone BEFORE the finish does — a score that
    /// arrives after the round is finished is refused, and would be lost.
    func requestFinish() async {
        guard let r = round else { return }
        flushTask?.cancel()
        setNote("Sending your scores…")
        await flush()
        guard pendingHoles.isEmpty && pendingCells.isEmpty else {
            setNote("Some scores haven't reached your phone yet. Bring it in range, then tap Finish again.")
            return
        }
        setNote("Sending to your phone…")
        WatchConnectivityManager.shared.sendAction("finish", roundId: r.id) { ok in
            Task { @MainActor in
                self.setNote(ok
                    ? "Finishing on your phone. If it asks a question, answer it there."
                    : "Queued. Your phone finishes the round when it's back in range or opened.")
            }
        }
    }

    /// A status line under the Finish button that clears itself after a while.
    private func setNote(_ s: String) {
        finishNote = s
        noteTask?.cancel()
        noteTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 90_000_000_000)
            if !Task.isCancelled { self.finishNote = nil }
        }
    }

    // MARK: v1911 — the wrist map

    /// Est. Drive. Fed once a second from the app (the last fix is re-fed, because a
    /// player standing still on the tee gets no new fixes with a 5 m distance filter),
    /// so it works whichever page is showing.
    private var drive = DriveTracker()
    private var driveHole = 0
    func feedDrive(_ p: GeoPoint?, now: Double) {
        guard let p = p, round?.gps?.estDrive ?? true, let h = hole, let tee = h.tee, let mid = h.mid else {
            if driveYds != nil { driveYds = nil }
            return
        }
        if driveHole != currentHole { drive.reset(); driveHole = currentHole }
        let v = drive.update(p, t: now, tee: tee, green: mid, par: parFor(hole: currentHole) ?? h.par)
        if v != driveYds { driveYds = v }
    }

    /// A pin set on this watch, shown at once while the phone saves it for the group.
    private var localPins: [Int: (pin: GeoPoint, at: Date)] = [:]

    /// Today's pin for a played hole: my own just-set pin for a minute, else the
    /// group's (from the phone), else nil (the map then uses the green's centre).
    func pin(for h: Int) -> GeoPoint? {
        if let lp = localPins[h], Date().timeIntervalSince(lp.at) < 60 { return lp.pin }
        return round?.gps?.pins[h]
    }

    /// Confirmed on the watch: send today's pin to the phone, which saves it for the group.
    func setPin(hole h: Int, at p: GeoPoint) {
        guard let r = round else { return }
        localPins[h] = (p, Date())
        objectWillChange.send()
        WatchConnectivityManager.shared.sendAction("pin", roundId: r.id,
                                                   extra: ["h": h, "ll": [p.lng, p.lat]]) { _ in }
    }

    /// A shot tracked on the watch → the phone saves it to My shots.
    func sendShot(_ s: ShotResult, club: String, hole h: Int, windMph: Double?, windDirFrom: Double?, tempF: Double?) {
        guard ShotMath.keep(s.yards) else { return }
        // sid: a message re-sent after a lost reply must not save the shot twice
        var extra: [String: Any] = ["yards": s.yards, "club": club, "h": h, "sid": UUID().uuidString]
        if let a = s.aimYds, let la = s.latY, let lo = s.longY { extra["aimYds"] = a; extra["latY"] = la; extra["longY"] = lo }
        if let w = windMph { extra["windMph"] = w }
        if let d = windDirFrom { extra["windDirFrom"] = d }
        if let t = tempF { extra["tempF"] = t }
        WatchConnectivityManager.shared.sendAction("shot", roundId: round?.id ?? "", extra: extra) { _ in }
    }

    func dismissSummary() {
        dismissedSummaryCode = summary?.code
        summary = nil
        saveCache()
    }

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
            // v1910: a FINISHED round brings its final card. The phone re-sends its last
            // message on every request, so a summary already dismissed stays dismissed.
            if let sd = payload["summary"] as? [String: Any], let sm = RoundParser.summary(sd),
               sm.code != dismissedSummaryCode, summary?.code != sm.code {
                summary = sm
                #if os(watchOS)
                WKInterfaceDevice.current().play(.success)
                #endif
            }
            pendingCells.removeAll()              // v1910
            finishNote = nil
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
                merged = overlayPending(merged)   // v1910: unsent group / stat edits survive the heartbeat
                playHaptics(old: cur, new: merged)
            } else {
                pendingHoles.removeAll()          // different round — old queue no longer applies
                pendingCells.removeAll()          // v1910
                finishNote = nil
                syncState = .idle
                lastPhoneHole = -1
            }
            summary = nil                         // v1910: a live round replaces any final card
            // v1911: the map's settings / pins / group dots ride beside the round
            if let gd = payload["gps"] as? [String: Any] { merged.gps = RoundParser.gps(gd) }
            else if let cur = self.round, cur.id == merged.id { merged.gps = cur.gps }
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
            // v1910: a direct row read carries no group / stats / standings — keep the
            // phone's last hand-off rather than dropping back to the solo screen.
            if r.gps == nil { r.gps = cur.gps }   // v1911
            if r.players == nil {
                r.players = cur.players; r.track = cur.track; r.standings = cur.standings
                r.isEvent = cur.isEvent; r.scorer = cur.scorer; r.pars = cur.pars
                // my own row follows the freshly read card (the others wait for the phone)
                if var ps = r.players, let i = ps.firstIndex(where: { $0.me }) {
                    for (h, s) in r.scores where s.strokes > 0 { GroupPlayer.put(&ps[i].scores, h, s.strokes) }
                    r.players = ps
                }
            }
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
        guard let r = round, !(pendingHoles.isEmpty && pendingCells.isEmpty) else { return }
        syncState = .syncing
        let pending = pendingHoles
        let cellsSent = pendingCells          // v1910
        let toSend = r.scores.filter { pending.contains($0.key) }
        let ok = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
            WatchConnectivityManager.shared.sendScores(roundId: r.id, scores: toSend,
                                                       cells: Array(cellsSent.values)) { cont.resume(returning: $0) }
        }
        if ok {
            pendingHoles.subtract(pending)   // only clear what THIS send covered
            // v1910: a cell edited again while this send was in flight stays queued
            for (k, e) in cellsSent where pendingCells[k]?.at == e.at { pendingCells.removeValue(forKey: k) }
            saveCache()
        }
        let n = pendingHoles.count + pendingCells.count
        syncState = (ok && n == 0) ? .synced : .queued(n)
    }

    // MARK: Cache persistence
    private func saveCache() {
        // v926: + lastActivityAt (stale-round guard) + dismissedRoundId ("End on
        // watch" survives an app relaunch). Both optional, so a pre-v926 cache
        // still decodes — its nil lastActivityAt makes expireStaleRound() treat
        // it as stale, which is exactly the healing we want on first run.
        // v1910: + cells (unsent group / stat edits) + dismissedSummaryCode. Optional, so
        // a pre-v1910 cache still decodes.
        struct Cache: Codable { var round: Round?; var currentHole: Int; var pending: [Int]; var lastActivityAt: Date?; var dismissedRoundId: String?; var cells: [CellEdit]?; var dismissedSummaryCode: String?; var summary: RoundSummary? }
        // Course (greens) cached separately as raw to keep this simple.
        let c = Cache(round: round, currentHole: currentHole, pending: Array(pendingHoles),
                      lastActivityAt: lastActivityAt, dismissedRoundId: dismissedRoundId,
                      cells: Array(pendingCells.values), dismissedSummaryCode: dismissedSummaryCode,
                      summary: summary)
        if let data = try? JSONEncoder().encode(c) { try? data.write(to: cacheURL) }
        if let course = course { CourseCache.save(course) }
    }
    private func loadCache() {
        struct Cache: Codable { var round: Round?; var currentHole: Int; var pending: [Int]; var lastActivityAt: Date?; var dismissedRoundId: String?; var cells: [CellEdit]?; var dismissedSummaryCode: String?; var summary: RoundSummary? }
        if let data = try? Data(contentsOf: cacheURL),
           let c = try? JSONDecoder().decode(Cache.self, from: data) {
            self.round = c.round
            self.currentHole = c.currentHole
            self.pendingHoles = Set(c.pending)
            self.lastActivityAt = c.lastActivityAt
            self.dismissedRoundId = c.dismissedRoundId
            self.dismissedSummaryCode = c.dismissedSummaryCode
            if c.round == nil { self.summary = c.summary }
            for e in c.cells ?? [] { self.pendingCells[e.key] = e }
            let n = c.pending.count + self.pendingCells.count
            if n > 0 { self.syncState = .queued(n) }
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
        struct H: Codable { var id: Int; var par: Int?; var f: [Double]?; var m: [Double]?; var b: [Double]?; var v: Bool
                            var t: [Double]? = nil; var fw: [Double]? = nil; var lu: [Double]? = nil }   // v1911: tee / fairway target / lay-up
        var holes: [H]
    }
    static func save(_ c: Course) {
        let flat = Flat(id: c.id, name: c.name, city: c.city,
            holes: c.holes.values.map { h in
                Flat.H(id: h.id, par: h.par,
                       f: h.front.map { [$0.lng, $0.lat] },
                       m: h.mid.map { [$0.lng, $0.lat] },
                       b: h.back.map { [$0.lng, $0.lat] }, v: h.verified,
                       t: h.tee.map { [$0.lng, $0.lat] },
                       fw: h.fwc.map { [$0.lng, $0.lat] },
                       lu: h.layup.map { [$0.lng, $0.lat] })
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
                back: GeoPoint(array: h.b), verified: h.v,
                tee: GeoPoint(array: h.t), fwc: GeoPoint(array: h.fw), layup: GeoPoint(array: h.lu))
        }
        return Course(id: f.id, name: f.name, city: f.city, holes: holes)
    }
}
