// Bad Golf Watch — v1911: green outlines + slope grids for the round's course.
//
// The watch downloads course_greens itself (the table is public), so ~5 KB × 18 holes
// never rides the phone link. The phone only says WHICH rows (gps.greens: a three-nine
// combo reads two per-nine rows, an x2 round mirrors one). Cached on disk per course,
// so greens still show on a course with no signal once they've been seen.
//
// All or nothing, like the phone (v1891): `live` is true only when every hole of the
// round has an outline AND its slope grid. Otherwise the map shows no green view at all.

import Foundation
import Combine

@MainActor
final class GreenStore: ObservableObject {
    @Published private(set) var greens: [Int: Green] = [:]   // played hole -> green
    @Published private(set) var live = false

    private var key = ""
    private var fetchedKey = ""
    private var loading = false
    private var attemptKey = ""
    private var attemptAt = Date.distantPast

    private struct CachedRow: Codable { var courseId: String; var hole: Int; var green: Green }

    /// Cheap to call often (the app calls it every second): does nothing unless the
    /// course / nine changed or a failed download is due a retry.
    func ensure(round: Round?) {
        guard let r = round, let src = r.gps?.greens else {
            if round == nil { greens = [:]; live = false; key = "" }
            return
        }
        let ids: String = src.ids.joined(separator: ",")
        let mirror: String = src.mirror ? "x2" : ""
        let nineKey: String = r.nineMode ?? "all18"
        let k: String = "\(ids)|\(mirror)|\(nineKey)|\(r.holeCount)"
        if k != key {
            key = k
            if let rows = loadCache(src) { apply(rows, source: src, round: r) } else { greens = [:]; live = false }
        }
        guard k != fetchedKey, !loading else { return }
        if k == attemptKey && Date().timeIntervalSince(attemptAt) < 60 { return }   // offline: once a minute
        attemptKey = k; attemptAt = Date()
        loading = true
        let holeCount = r.holeCount, nine = r.nineMode
        Task { @MainActor in
            defer { self.loading = false }
            guard let raw = await SupabaseService.shared.fetchGreens(ids: src.ids) else { return }   // offline: keep the cache
            let rows = raw.compactMap { GreenMapper.parseRow($0) }
            self.fetchedKey = k
            self.saveCache(src, rows.map { CachedRow(courseId: $0.courseId, hole: $0.hole, green: $0.green) })
            guard self.key == k else { return }                     // the round moved on meanwhile
            let mapped = GreenMapper.byPlayedHole(rows: rows, source: src, holeCount: holeCount, nineMode: nine)
            self.greens = mapped
            self.live = GreenMapper.live(mapped, holeCount: holeCount)
        }
    }

    private func apply(_ rows: [CachedRow], source: GreenSource, round r: Round) {
        let mapped = GreenMapper.byPlayedHole(rows: rows.map { (courseId: $0.courseId, hole: $0.hole, green: $0.green) },
                                              source: source, holeCount: r.holeCount, nineMode: r.nineMode)
        greens = mapped
        live = GreenMapper.live(mapped, holeCount: r.holeCount)
    }

    // MARK: disk cache (Caches/greens/<ids>.json)
    private func url(_ src: GreenSource) -> URL? {
        guard let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return nil }
        let dir = base.appendingPathComponent("greens", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let name = src.ids.joined(separator: "+").map { $0.isLetter || $0.isNumber || $0 == "-" ? $0 : "_" }
        return dir.appendingPathComponent(String(name) + ".json")
    }
    private func loadCache(_ src: GreenSource) -> [CachedRow]? {
        guard let u = url(src), let d = try? Data(contentsOf: u) else { return nil }
        return try? JSONDecoder().decode([CachedRow].self, from: d)
    }
    private func saveCache(_ src: GreenSource, _ rows: [CachedRow]) {
        guard let u = url(src), let d = try? JSONEncoder().encode(rows) else { return }
        try? d.write(to: u)
    }
}
