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
                         query: [String: String] = [:], body: Data? = nil) -> URLRequest? {
        var comps = URLComponents(string: Supabase.url + "/rest/v1/" + path)
        if !query.isEmpty {
            comps?.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let u = comps?.url else { return nil }
        var req = URLRequest(url: u)
        req.httpMethod = method
        req.setValue(Supabase.anonKey, forHTTPHeaderField: "apikey")
        let token = accessToken ?? Supabase.anonKey
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if method == "PATCH" || method == "POST" {
            req.setValue("return=representation", forHTTPHeaderField: "Prefer")
        }
        req.httpBody = body
        return req
    }

    // MARK: Reads

    /// Fetch a course's greens (course_gps.holes) and parse into a Course.
    func fetchCourse(courseId: String) async -> Course? {
        guard let req = request("course_gps", query: [
            "course_id": "eq.\(courseId)",
            "select": "course_id,name,city,holes"
        ]) else { return nil }
        guard let (data, _) = try? await URLSession.shared.data(for: req) else { return nil }
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let row = rows.first else { return nil }
        return CourseParser.parse(row: row)
    }

    /// Fetch the player's active (unfinished) round from `games`.
    func fetchActiveRound(playerId: String) async -> Round? {
        guard let req = request("games", query: [
            "user_id": "eq.\(playerId)",
            "status": "eq.active",
            "order": "updated_at.desc",
            "limit": "1",
            "select": "*"
        ]) else { return nil }
        guard let (data, _) = try? await URLSession.shared.data(for: req) else { return nil }
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let row = rows.first else { return nil }
        return RoundParser.parse(row: row)
    }

    // MARK: Writes (player's own scores only)

    /// Persist the player's per-hole scores back to `games`.
    /// Stored as a JSON object keyed by hole number.
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
                    verified: (h["verified"] as? Bool) ?? false
                )
            }
        }
        return Course(id: id, name: name, city: city, holes: holes)
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
        return Round(id: id, courseId: courseId, courseName: courseName,
                     playerId: playerId, currentHole: current, scores: scores)
    }
}
