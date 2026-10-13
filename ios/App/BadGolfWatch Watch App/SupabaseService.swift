// Bad Golf Watch — Supabase REST access
// The watch talks to Supabase directly over HTTPS (PostgREST) when it has
// network (phone relay, Wi-Fi, or cellular watch). It reuses the same project
// and the user's session token (shared from the phone).
//
// NOTE: the anon key below is the PUBLIC anon key (safe to embed — same one
// shipped in the web app). Row-Level Security + the user's bearer token gate
// what the watch can actually read/write.

import Foundation

enum Supabase {
    static let url = "https://ojclesuwxhtzvrymqrwg.supabase.co"
    static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qY2xlc3V3eGh0enZyeW1xcndnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MzgzMzksImV4cCI6MjA5NTAxNDMzOX0.GtqDnGsaAmolHplj65_90c50bwqzLaryZnlJYl2GoDk"
}

final class SupabaseService {
    static let shared = SupabaseService()
    private init() {}

    /// The user's access token, shared from the phone (Keychain group / WCSession).
    var accessToken: String? {
        get { SessionStore.shared.accessToken }
        set { SessionStore.shared.accessToken = newValue }
    }

    private func request(_ path: String, method: String = "GET",
                         query: [String: String] = [:], body: Data? = nil, anonOnly: Bool = false) -> URLRequest? {
        var comps = URLComponents(string: Supabase.url + "/rest/v1/" + path)
        if !query.isEmpty {
            comps?.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let u = comps?.url else { return nil }
        var req = URLRequest(url: u)
        req.httpMethod = method
        req.setValue(Supabase.anonKey, forHTTPHeaderField: "apikey")
        // v1911: public tables (course_greens) read with the anon key, so an expired
        // session token can't 401 the green download.
        let token = anonOnly ? Supabase.anonKey : (accessToken ?? Supabase.anonKey)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if method == "PATCH" || method == "POST" {
            req.setValue("return=representation", forHTTPHeaderField: "Prefer")
        }
        req.httpBody = body
        return req
    }

    // MARK: Reads

    /// v1911: green outlines + slope grids for these course_greens ids (anyone may
    /// read the table). Rows come back raw; GreenMapper parses and re-keys them.
    func fetchGreens(ids: [String]) async -> [[String: Any]]? {
        guard !ids.isEmpty else { return nil }
        let list = ids.map { "\"" + $0.replacingOccurrences(of: "\"", with: "") + "\"" }.joined(separator: ",")
        guard let req = request("course_greens", query: [
            "course_id": "in.(\(list))",
            "select": "course_id,hole,status,ring,elev"
        ], anonOnly: true) else { return nil }
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    }

    /// Fetch a course's greens (course_gps.holes) and parse into a Course.
    ///
    /// v1146: `nineMode` matters. course_gps.holes is keyed by PHYSICAL hole, but
    /// everything on the watch — the hand-off, the scores, the hole the screen
    /// shows — is in PLAYED-hole space. On a repeated-nine round played hole 3 is
    /// physical hole 12, so a raw map would range to a green 1,400 m away (Kevin,
    /// Bayou Oaks, 8/20). The phone re-keys the map before handing it over; this
    /// is the same normalisation for the watch's OWN fetch, so a Course in this
    /// app is ALWAYS keyed by played hole no matter where it came from.
    func fetchCourse(courseId: String, nineMode: String? = nil) async -> Course? {
        guard let req = request("course_gps", query: [
            "course_id": "eq.\(courseId)",
            "select": "course_id,name,city,holes"
        ]) else { return nil }
        guard let (data, _) = try? await URLSession.shared.data(for: req) else { return nil }
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let row = rows.first else { return nil }
        guard let c = CourseParser.parse(row: row) else { return nil }
        return CourseParser.keyedByPlayedHole(c, nineMode: nineMode)
    }

    /// Re-read a round the watch already knows, straight from `games`.
    ///
    /// v1146: this replaces `fetchActiveRound(playerId:)`, which queried
    /// `games?user_id=eq.…&status=eq.active` — **neither column has ever existed**.
    /// It returned `42703 column games.user_id does not exist`, HTTP 400, every
    /// time, so this whole path was dead and the watch depended entirely on the
    /// phone's hand-off. The hand-off heartbeat only runs while the phone app is
    /// FOREGROUNDED, so a phone in a pocket left the watch with nothing.
    ///
    /// The real shape is: `code` (the round code, e.g. "LINK90"), `data` (the
    /// whole round as jsonb), `owner_uid`, `updated_at`. RLS lets any signed-in
    /// user read round rows (`games_select_rounds_auth`, `code !~~ '%:%'`), so
    /// this needs the session token — with the bare anon key it returns [].
    func fetchRound(code: String, myPlayerId: String?) async -> Round? {
        guard !code.isEmpty else { return nil }
        guard let req = request("games", query: [
            "code": "eq.\(code)",
            "select": "code,data,updated_at",
            "limit": "1"
        ]) else { return nil }
        guard let (data, _) = try? await URLSession.shared.data(for: req) else { return nil }
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let row = rows.first else { return nil }
        return RoundParser.parseGamesRow(row, myPlayerId: myPlayerId)
    }

    /// v1146: is this round genuinely over (finished, or the row deleted), as
    /// opposed to "we could not ask"?
    ///
    /// The distinction is the whole point. `fetchRound` returns nil for a dead
    /// network, a finished round and a missing row alike, and closing the
    /// wearer's live round because the watch briefly lost signal would be far
    /// worse than showing a stale one. So this only answers true on a REQUEST
    /// THAT SUCCEEDED — same rule as the web app's `_bgReadCloudHoles`: not
    /// being able to ask is not an answer.
    func roundIsGone(code: String) async -> Bool {
        guard !code.isEmpty else { return false }
        guard let req = request("games", query: [
            "code": "eq.\(code)", "select": "code,data", "limit": "1"
        ]) else { return false }
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              let http = resp as? HTTPURLResponse,
              (200...299).contains(http.statusCode) else { return false }   // could not ask
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return false }
        guard let row = rows.first else { return true }                     // row is gone
        var d: [String: Any] = [:]
        if let m = row["data"] as? [String: Any] { d = m }
        else if let s = row["data"] as? String, let dd = s.data(using: .utf8),
                let m = try? JSONSerialization.jsonObject(with: dd) as? [String: Any] { d = m }
        if let fin = d["finishedAt"], !(fin is NSNull) { return true }       // finished
        return false
    }

    /// Find an unfinished round this account OWNS, newest first. Used only when
    /// the watch has no cached round at all — it cannot find a round somebody
    /// else created, because `games.owner_uid` is the only account link on the
    /// row (the per-round player ids are synthetic, `p0-…`). That is a real
    /// limit, not an oversight: for a round you were added to, the phone's
    /// hand-off is still the only route.
    func findMyActiveRound(ownerUid: String) async -> Round? {
        guard !ownerUid.isEmpty else { return nil }
        guard let req = request("games", query: [
            "owner_uid": "eq.\(ownerUid)",
            "data->>finishedAt": "is.null",
            "code": "not.like.*:*",          // exclude the shared:/roster:/recent: singletons
            "order": "updated_at.desc",
            "limit": "1",
            "select": "code,data,updated_at"
        ]) else { return nil }
        guard let (data, _) = try? await URLSession.shared.data(for: req) else { return nil }
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let row = rows.first else { return nil }
        return RoundParser.parseGamesRow(row, myPlayerId: nil)
    }

    // MARK: Writes (player's own scores only)

    /// ⚠️ DEAD AND BROKEN — DO NOT CALL. Left only so the history is legible.
    ///
    /// v1146: this PATCHes `games?id=eq.…` with a top-level `scores` column.
    /// `games` has **neither** an `id` column nor a `scores` column (it is
    /// `code` / `data` / `owner_uid` / `type` / `updated_at`), so this could
    /// never have written anything. Nothing calls it — since v891 wrist scores
    /// go to the PHONE over WCSession, which applies them through the same
    /// protected save path as a tap on the phone (own cells only, GIR/sandy
    /// tracking correct). That is the design, not a workaround: a blind
    /// whole-column overwrite from the watch would clobber the other players.
    /// If a direct write is ever wanted it must be a read-modify-write on
    /// `data`, or better an RPC. Delete this function once that is decided.
    @available(*, deprecated, message: "Broken against the real games schema; scores go to the phone over WCSession.")
    func writeScores(roundId: String, scores: [Int: HoleScore]) async -> Bool {
        var obj: [String: Any] = [:]
        for (hole, s) in scores {
            obj[String(hole)] = ["strokes": s.strokes, "putts": s.putts as Any]
        }
        let payload: [String: Any] = [
            "scores": obj,
            "updated_at": ISO8601DateFormatter().string(from: Date())
        ]
        guard let body = try? JSONSerialization.data(withJSONObject: payload),
              let req = request("games", method: "PATCH",
                                query: ["id": "eq.\(roundId)"], body: body) else { return false }
        guard let (_, resp) = try? await URLSession.shared.data(for: req),
              let http = resp as? HTTPURLResponse else { return false }
        return (200...299).contains(http.statusCode)
    }
}

// MARK: - Parsers (tolerant of the JSON shapes the web app writes)

enum CourseParser {
    /// course_gps.holes is a map: ref -> { tee, front, mid, back, par, line }.
    static func parse(row: [String: Any]) -> Course? {
        guard let id = row["course_id"] as? String else { return nil }
        let name = row["name"] as? String ?? "Course"
        let city = row["city"] as? String
        var holes: [Int: Hole] = [:]

        if let raw = row["holes"] {
            let holesMap = jsonMap(raw)
            for (ref, value) in holesMap {
                guard let num = Int(ref.filter("0123456789".contains)) else { continue }
                guard let h = value as? [String: Any] else { continue }
                holes[num] = Hole(
                    id: num,
                    par: (h["par"] as? Int) ?? Int("\(h["par"] ?? "")"),
                    front: GeoPoint(array: doubles(h["front"])),
                    mid: GeoPoint(array: doubles(h["mid"])),
                    back: GeoPoint(array: doubles(h["back"])),
                    verified: (h["verified"] as? Bool) ?? false,
                    tee: GeoPoint(array: doubles(h["tee"])),        // v1911
                    fwc: GeoPoint(array: doubles(h["fwc"])),
                    layup: GeoPoint(array: doubles(h["layup"]))
                )
            }
        }
        return Course(id: id, name: name, city: city, holes: holes)
    }

    /// v1146: played hole -> physical hole. The Swift twin of the web app's
    /// `bgPhysHole()`. Keep the two in step: golf-app.html / www/index.html.
    static func physicalHole(_ h: Int, nineMode: String?) -> Int {
        guard let m = nineMode, !m.isEmpty, m != "all18" else { return h }
        switch m {
        case "f9x2":   return ((h - 1) % 9) + 1
        case "b9x2":   return ((h - 1) % 9) + 10
        case "front9": return h
        case "back9":  return h + 9
        default:       return h
        }
    }

    /// v1146: re-key a physically-keyed course into PLAYED-hole space, so
    /// `course.holes[currentHole]` is always the green for the hole on screen.
    /// Returns the course unchanged for a normal 18 — no work, no behaviour change.
    static func keyedByPlayedHole(_ c: Course, nineMode: String?) -> Course {
        guard let m = nineMode, !m.isEmpty, m != "all18" else { return c }
        var out: [Int: Hole] = [:]
        for played in 1...18 {
            if let src = c.holes[physicalHole(played, nineMode: m)] {
                var h = src          // v1911: keep tee / fairway target / lay-up too
                h.id = played
                out[played] = h
            }
        }
        return Course(id: c.id, name: c.name, city: c.city, holes: out)
    }

    private static func jsonMap(_ raw: Any) -> [String: Any] {
        if let m = raw as? [String: Any] { return m }
        if let s = raw as? String, let d = s.data(using: .utf8),
           let m = try? JSONSerialization.jsonObject(with: d) as? [String: Any] { return m }
        return [:]
    }
    private static func doubles(_ raw: Any?) -> [Double]? {
        if let a = raw as? [Double] { return a }
        if let a = raw as? [Any] { return a.compactMap { ($0 as? NSNumber)?.doubleValue } }
        return nil
    }
}

enum RoundParser {
    static func parse(row: [String: Any]) -> Round? {
        guard let id = (row["id"] as? String) ?? (row["id"].map { "\($0)" }) else { return nil }
        let courseId = (row["course_id"] as? String) ?? ""
        let courseName = (row["course_name"] as? String) ?? "Round"
        let playerId = (row["user_id"] as? String) ?? ""
        let current = (row["current_hole"] as? Int) ?? 1
        var scores: [Int: HoleScore] = [:]
        if let s = row["scores"] as? [String: Any] {
            for (k, v) in s {
                guard let hole = Int(k) else { continue }
                if let d = v as? [String: Any], let strokes = d["strokes"] as? Int {
                    scores[hole] = HoleScore(hole: hole, strokes: strokes, putts: d["putts"] as? Int)
                } else if let strokes = v as? Int {
                    scores[hole] = HoleScore(hole: hole, strokes: strokes, putts: nil)
                }
            }
        }
        var r = Round(id: id, courseId: courseId, courseName: courseName,
                      playerId: playerId, currentHole: current, scores: scores,
                      holeCount: (row["hole_count"] as? Int) ?? 18,
                      nineMode: row["nine_mode"] as? String,
                      myPlayerId: row["my_player_id"] as? String)
        // v1910: the group, stat tracking, standings and scorer flag. Each is only
        // present from a v1910+ phone; an older phone leaves them nil and the watch
        // falls back to the single-player scoring screen.
        if let ps = row["players"] as? [[String: Any]] {
            r.players = ps.compactMap { (d: [String: Any]) -> GroupPlayer? in
                guard let pid = d["id"] as? String, !pid.isEmpty else { return nil }
                let me = (d["me"] as? Bool) ?? false
                return GroupPlayer(id: pid,
                                   name: (d["name"] as? String) ?? "",
                                   me: me,
                                   canScore: (d["canScore"] as? Bool) ?? me,
                                   scores: intArr(d["scores"]),
                                   putts: intArr(d["putts"]),
                                   fw: strArr(d["fw"]),
                                   pen: intArr(d["pen"]),
                                   gir: boolArr(d["gir"]))
            }
        }
        if let t = row["track"] as? [String: Any] {
            r.track = StatTracking(putts: (t["putts"] as? Bool) ?? false,
                                   fairways: (t["fairways"] as? Bool) ?? false,
                                   penalties: (t["penalties"] as? Bool) ?? false,
                                   gir: (t["gir"] as? Bool) ?? false)
        }
        if let pm = row["pars"] as? [String: Any] {
            var pars: [Int: Int] = [:]
            for (k, v) in pm { if let h = Int(k), let n = (v as? NSNumber)?.intValue { pars[h] = n } }
            if !pars.isEmpty { r.pars = pars }
        }
        r.standings = standings(row["standings"])
        r.isEvent = row["event"] as? Bool
        r.scorer = row["scorer"] as? Bool
        return r
    }

    // MARK: v1910 tolerant helpers (JSONSerialization gives NSNumber / NSNull)
    static func intArr(_ v: Any?) -> [Int?] {
        guard let a = v as? [Any] else { return [] }
        return a.map { (x: Any) -> Int? in (x is NSNull) ? nil : (x as? NSNumber)?.intValue }
    }
    static func strArr(_ v: Any?) -> [String?] {
        guard let a = v as? [Any] else { return [] }
        return a.map { (x: Any) -> String? in x as? String }
    }
    static func boolArr(_ v: Any?) -> [Bool?] {
        guard let a = v as? [Any] else { return [] }
        return a.map { (x: Any) -> Bool? in (x is NSNull) ? nil : (x as? Bool) }
    }
    static func unitsMap(_ v: Any?) -> [String: Double] {
        var out: [String: Double] = [:]
        if let m = v as? [String: Any] {
            for (k, x) in m { if let n = x as? NSNumber { out[k] = n.doubleValue } }
        }
        return out
    }
    static func standings(_ v: Any?) -> Standings? {
        guard let d = v as? [String: Any] else { return nil }
        let games: [GameUnits] = ((d["games"] as? [[String: Any]]) ?? []).map { (gd: [String: Any]) -> GameUnits in
            GameUnits(key: (gd["key"] as? String) ?? "",
                      label: (gd["label"] as? String) ?? "",
                      units: unitsMap(gd["units"]))
        }
        let chips: [MatchChip]? = (d["chips"] as? [[String: Any]]).map { arr in
            arr.map { (c: [String: Any]) -> MatchChip in
                MatchChip(label: (c["label"] as? String) ?? "", text: (c["text"] as? String) ?? "", cls: (c["cls"] as? String) ?? "")
            }
        }
        return Standings(at: (d["at"] as? NSNumber)?.doubleValue ?? 0,
                         thru: (d["thru"] as? NSNumber)?.intValue ?? 0,
                         units: unitsMap(d["units"]),
                         games: games,
                         chips: chips)
    }

    /// v1911: the hand-off's `gps` block.
    static func gps(_ d: [String: Any]) -> GpsInfo {
        var pins: [Int: GeoPoint] = [:]
        if let pm = d["pins"] as? [String: Any] {
            for (k, v) in pm {
                if let h = Int(k), let o = v as? [String: Any], let p = GeoPoint(array: (o["ll"] as? [Any])?.compactMap { ($0 as? NSNumber)?.doubleValue }) { pins[h] = p }
            }
        }
        var measured: [String: Int] = [:]
        if let mm = d["measured"] as? [String: Any] { for (k, v) in mm { if let n = (v as? NSNumber)?.intValue { measured[k] = n } } }
        let group: [GroupDot] = ((d["group"] as? [[String: Any]]) ?? []).compactMap { (g: [String: Any]) -> GroupDot? in
            guard let pid = g["pid"] as? String,
                  let p = GeoPoint(array: (g["ll"] as? [Any])?.compactMap { ($0 as? NSNumber)?.doubleValue }) else { return nil }
            return GroupDot(id: pid, name: (g["name"] as? String) ?? "", at: p, stamp: (g["at"] as? NSNumber)?.doubleValue ?? 0)
        }
        var source: GreenSource? = nil
        if let gs = d["greens"] as? [String: Any], let parts = gs["parts"] as? [[String: Any]] {
            let ps = parts.compactMap { (p: [String: Any]) -> GreenSource.Part? in
                guard let id = p["id"] as? String, !id.isEmpty else { return nil }
                return GreenSource.Part(id: id, off: (p["off"] as? NSNumber)?.intValue ?? 0)
            }
            if !ps.isEmpty { source = GreenSource(parts: ps, mirror: (gs["mirror"] as? Bool) ?? false) }
        }
        return GpsInfo(trackShot: (d["trackShot"] as? Bool) ?? true,
                       estDrive: (d["estDrive"] as? Bool) ?? true,
                       arcs: (d["arcs"] as? Bool) ?? false,
                       dispYds: (d["dispYds"] as? NSNumber)?.intValue ?? 15,
                       greenView: (d["greenView"] as? Bool) ?? true,
                       greenSlope: (d["greenSlope"] as? Bool) ?? true,
                       greenPin: (d["greenPin"] as? Bool) ?? true,
                       greens: source, pins: pins, measured: measured, group: group)
    }
    /// v1910: the final card that rides on the phone's roundEnded message.
    static func summary(_ d: [String: Any]) -> RoundSummary? {
        guard let code = d["code"] as? String, !code.isEmpty else { return nil }
        let board: [BoardRow] = ((d["board"] as? [[String: Any]]) ?? []).compactMap { (b: [String: Any]) -> BoardRow? in
            guard let bid = b["id"] as? String else { return nil }
            return BoardRow(id: bid, name: (b["name"] as? String) ?? "",
                            units: (b["units"] as? NSNumber)?.doubleValue ?? 0,
                            me: (b["me"] as? Bool) ?? false)
        }
        return RoundSummary(code: code,
                            course: (d["course"] as? String) ?? "",
                            strokes: (d["strokes"] as? NSNumber)?.intValue ?? 0,
                            toPar: (d["toPar"] as? NSNumber)?.intValue ?? 0,
                            holes: (d["holes"] as? NSNumber)?.intValue ?? 0,
                            putts: (d["putts"] as? NSNumber)?.intValue,
                            fairways: d["fairways"] as? String,
                            girs: d["girs"] as? String,
                            units: (d["units"] as? NSNumber)?.doubleValue,
                            board: board)
    }

    /// v1146: parse a raw `games` row — `code` + `data` (the whole round as
    /// jsonb) — as opposed to the flat hand-off payload `parse(row:)` reads.
    /// This is what makes a phone-free refresh possible at all.
    ///
    /// Returns nil for a FINISHED round on purpose: the caller must not adopt
    /// one. That also closes the v926 zombie case from the other direction — a
    /// watch that missed the roundEnded signal now learns the round is over the
    /// next time it can reach the network, instead of holding a workout session
    /// open for days.
    static func parseGamesRow(_ row: [String: Any], myPlayerId: String?) -> Round? {
        guard let code = row["code"] as? String, !code.isEmpty else { return nil }
        var data: [String: Any] = [:]
        if let d = row["data"] as? [String: Any] { data = d }
        else if let s = row["data"] as? String, let dd = s.data(using: .utf8),
                let d = try? JSONSerialization.jsonObject(with: dd) as? [String: Any] { data = d }
        if data.isEmpty { return nil }

        // finishedAt is a millisecond stamp; anything non-null means it is over.
        if let fin = data["finishedAt"], !(fin is NSNull) { return nil }

        let courseId = (data["courseId"] as? String) ?? ""
        let courseName = (data["course"] as? String) ?? "Round"
        let nineMode = data["nineMode"] as? String
        let pars = data["pars"] as? [Any]

        // Mirrors the web app's roundHoles(): an explicit 9, or a card with
        // exactly nine non-null pars, is a nine-hole round.
        var holeCount = 18
        if let h = data["holes"] as? Int, h == 9 { holeCount = 9 }
        else if let p = pars, p.filter({ !($0 is NSNull) }).count == 9 { holeCount = 9 }

        // The wearer's own scores. `data.scores` is { playerId: [18 nullable ints] },
        // indexed by PLAYED hole - 1. Without a player id there is nothing to pick
        // out — the round still comes back, just with no scores until the phone's
        // hand-off supplies `my_player_id`.
        var scores: [Int: HoleScore] = [:]
        if let pid = myPlayerId, !pid.isEmpty,
           let all = data["scores"] as? [String: Any],
           let mine = all[pid] as? [Any] {
            for (i, v) in mine.enumerated() {
                guard let n = (v as? NSNumber)?.intValue else { continue }
                scores[i + 1] = HoleScore(hole: i + 1, strokes: n, putts: nil)
            }
        }

        return Round(id: code,
                     courseId: courseId,
                     courseName: courseName,
                     // the account id, not a per-round player id — same meaning
                     // the hand-off gives this field.
                     playerId: SessionStore.shared.playerId ?? "",
                     currentHole: 1,          // not stored on the row; the caller keeps its own
                     scores: scores,
                     holeCount: holeCount,
                     nineMode: nineMode,
                     myPlayerId: myPlayerId)
    }
}
