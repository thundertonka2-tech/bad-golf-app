// Bad Golf Watch — v1911 Phase 2: the GPS math behind the wrist map.
//
// Pure Foundation (no SwiftUI / CoreLocation / WatchKit), so all of it is compiled and
// tested on Linux by qa/watch_swift/run.sh. Each piece mirrors the phone's GPS screen
// (golf-app.html gpsView) — line refs are v1910:
//   * Web-Mercator projection + a hole frame turned tee-up       (frameHole 120579)
//   * the automatic aim point: pin / fairway target / lay-up     (smartTargetPos 120492)
//   * distance-arc spacing                                       (arcStepYds 119233)
//   * a tracked shot's miss against the aim                      (finishTrack 122522)
//   * the Est. Drive start point                                 (121441-121506)
//   * green slope colours + the grid height lookup               (gvSlopeImage 118409, gvZAt 118301)
//   * which green rows belong to which played hole               (gvSourceFor / gvLoad)

import Foundation

// MARK: - Distances

enum GeoMath {
    static let metersToYards = 1.0936133
    static let earthR = 6371000.0

    static func meters(_ a: GeoPoint, _ b: GeoPoint) -> Double {
        let toR = Double.pi / 180
        let dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR
        let s = sin(dLat / 2) * sin(dLat / 2) + cos(a.lat * toR) * cos(b.lat * toR) * sin(dLng / 2) * sin(dLng / 2)
        return 2 * earthR * asin(min(1, sqrt(s)))
    }
    static func yards(_ a: GeoPoint, _ b: GeoPoint) -> Double { meters(a, b) * metersToYards }

    /// Initial bearing in degrees (0 = north, clockwise).
    static func bearing(_ a: GeoPoint, _ b: GeoPoint) -> Double {
        let toR = Double.pi / 180
        let la1 = a.lat * toR, la2 = b.lat * toR, dL = (b.lng - a.lng) * toR
        let y = sin(dL) * cos(la2)
        let x = cos(la1) * sin(la2) - sin(la1) * cos(la2) * cos(dL)
        let d = atan2(y, x) * 180 / .pi
        return (d + 360).truncatingRemainder(dividingBy: 360)
    }

    /// The point `meters` away from `p` on `bearingDeg`.
    static func offset(_ p: GeoPoint, meters m: Double, bearing bearingDeg: Double) -> GeoPoint {
        let toR = Double.pi / 180
        let br = bearingDeg * toR, d = m / earthR
        let la1 = p.lat * toR, lo1 = p.lng * toR
        let la2 = asin(sin(la1) * cos(d) + cos(la1) * sin(d) * cos(br))
        let lo2 = lo1 + atan2(sin(br) * sin(d) * cos(la1), cos(d) - sin(la1) * sin(la2))
        return GeoPoint(lng: lo2 / toR, lat: la2 / toR)
    }
}

// MARK: - Map projection (Web Mercator, 256-px tiles — the Esri tile grid)

struct XY: Equatable { var x: Double; var y: Double }

enum MapMath {
    static let tileSize = 256.0

    /// World pixel at zoom z (fractional zoom allowed).
    static func world(_ p: GeoPoint, z: Double) -> XY {
        let s = tileSize * pow(2, z)
        let siny = min(max(sin(p.lat * .pi / 180), -0.9999), 0.9999)
        return XY(x: (p.lng + 180) / 360 * s,
                  y: (0.5 - log((1 + siny) / (1 - siny)) / (4 * .pi)) * s)
    }
    static func geo(_ w: XY, z: Double) -> GeoPoint {
        let s = tileSize * pow(2, z)
        let lng = w.x / s * 360 - 180
        let n = .pi - 2 * .pi * w.y / s
        let lat = 180 / .pi * atan(0.5 * (exp(n) - exp(-n)))
        return GeoPoint(lng: lng, lat: lat)
    }
    /// Esri World Imagery (same source as the phone's map). z/y/x order.
    static func esriTileURL(z: Int, x: Int, y: Int) -> String {
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/\(z)/\(y)/\(x)"
    }
    static let esriMaxZoom = 19
}

/// A view of the map: centre, zoom, and the bearing that points UP the screen
/// (the phone turns every hole tee-up the same way).
struct MapFrame: Equatable {
    var center: GeoPoint
    var zoom: Double
    var bearing: Double          // degrees; this direction is drawn pointing up
    var width: Double
    var height: Double

    private var c: XY { MapMath.world(center, z: zoom) }
    private var rad: Double { bearing * .pi / 180 }

    /// Screen point (origin top-left) for a coordinate.
    func screen(_ p: GeoPoint) -> XY {
        let w = MapMath.world(p, z: zoom)
        let dx = w.x - c.x, dy = w.y - c.y
        let t = -rad
        return XY(x: dx * cos(t) - dy * sin(t) + width / 2,
                  y: dx * sin(t) + dy * cos(t) + height / 2)
    }
    /// Coordinate under a screen point (for tap-to-target).
    func geo(_ s: XY) -> GeoPoint {
        let dx = s.x - width / 2, dy = s.y - height / 2
        let t = rad
        let wx = dx * cos(t) - dy * sin(t) + c.x
        let wy = dx * sin(t) + dy * cos(t) + c.y
        return MapMath.geo(XY(x: wx, y: wy), z: zoom)
    }
    /// Screen points per yard at the frame's centre.
    var pointsPerYard: Double {
        let mpp = 156543.03392 * cos(center.lat * .pi / 180) / pow(2, zoom)
        return (1 / mpp) / GeoMath.metersToYards
    }

    /// Fit `points` on screen with the hole running bottom → top along `bearing`.
    /// `pad` is in points on every side; the zoom is clamped to what the tiles can show.
    static func fit(_ points: [GeoPoint], bearing: Double, width: Double, height: Double,
                    pad: Double = 18, padBottom: Double? = nil, minZoom: Double = 13, maxZoom: Double = 19.4) -> MapFrame? {
        // A taller bottom margin (the yardage box + buttons): fit into the area above
        // it, then keep the whole screen with the same picture.
        if let pb = padBottom, pb > pad {
            let extra = pb - pad
            guard height - extra > 2 * pad,
                  let small = fit(points, bearing: bearing, width: width, height: height - extra,
                                  pad: pad, minZoom: minZoom, maxZoom: maxZoom) else { return nil }
            let c = small.geo(XY(x: width / 2, y: height / 2))
            return MapFrame(center: c, zoom: small.zoom, bearing: bearing, width: width, height: height)
        }
        guard let first = points.first, width > 2 * pad, height > 2 * pad else { return nil }
        let z0 = 17.0
        let probe = MapFrame(center: first, zoom: z0, bearing: bearing, width: 0, height: 0)
        let s = points.map { probe.screen($0) }
        let minX = s.map(\.x).min()!, maxX = s.map(\.x).max()!
        let minY = s.map(\.y).min()!, maxY = s.map(\.y).max()!
        let ew = max(maxX - minX, 1), eh = max(maxY - minY, 1)
        let k = min((width - 2 * pad) / ew, (height - 2 * pad) / eh)
        let zoom = min(maxZoom, max(minZoom, z0 + log2(k)))
        // centre: the midpoint of the rotated extents, mapped back to a coordinate
        let mid = probe.geo(XY(x: (minX + maxX) / 2, y: (minY + maxY) / 2))
        return MapFrame(center: mid, zoom: zoom, bearing: bearing, width: width, height: height)
    }

    /// Which Esri tiles cover the screen, at a tile zoom one finer than the view (sharp
    /// on a retina watch), capped at Esri's 19 and at `maxTiles`.
    func tiles(maxTiles: Int = 36) -> (z: Int, tiles: [(x: Int, y: Int)]) {
        let tz = min(MapMath.esriMaxZoom, max(0, Int(floor(zoom)) + 1))
        let corners = [XY(x: 0, y: 0), XY(x: width, y: 0), XY(x: 0, y: height), XY(x: width, y: height)]
            .map { MapMath.world(geo($0), z: Double(tz)) }
        let x0 = Int(floor(corners.map(\.x).min()! / MapMath.tileSize))
        let x1 = Int(floor(corners.map(\.x).max()! / MapMath.tileSize))
        let y0 = Int(floor(corners.map(\.y).min()! / MapMath.tileSize))
        let y1 = Int(floor(corners.map(\.y).max()! / MapMath.tileSize))
        var out: [(x: Int, y: Int)] = []
        for x in x0...max(x0, x1) { for y in y0...max(y0, y1) { out.append((x, y)) } }
        if out.count > maxTiles { out = Array(out.prefix(maxTiles)) }
        return (tz, out)
    }
}

// MARK: - The automatic aim point (smartTargetPos)

enum Aim {
    /// Par 3, or the green within 200 y → the pin. Otherwise the fairway target if it is
    /// at least 27 m nearer the green than the ball, then (par 5) the lay-up on the same
    /// rule, else the pin.
    static func auto(ball: GeoPoint, pin: GeoPoint, par: Int?, fwc: GeoPoint?, layup: GeoPoint?) -> GeoPoint {
        let toPin = GeoMath.meters(ball, pin)
        if par == 3 || toPin * GeoMath.metersToYards <= 200 { return pin }
        if let f = fwc, GeoMath.meters(f, pin) < toPin - 27 { return f }
        if par == 5, let l = layup, GeoMath.meters(l, pin) < toPin - 27 { return l }
        return pin
    }
}

// MARK: - Distance arcs

enum Arcs {
    /// The phone's ladder: the smallest of 10/20/25/50 y that keeps arcs `minGap`
    /// points apart at this zoom.
    static func step(pointsPerYard ppy: Double, minGap: Double = 22) -> Int {
        for s in [10, 20, 25, 50] where Double(s) * ppy >= minGap { return s }
        return 50
    }
    /// Five yardage arcs centred on the target distance.
    static func yards(target d: Double, step: Int) -> [Int] {
        guard d >= 15 else { return [] }
        let base = Int((d / Double(step)).rounded()) * step
        return (-2...2).map { base + $0 * step }.filter { $0 > 0 }
    }
    /// Club arcs near the target: measured median (5+ shots) else the bag's range
    /// midpoint; 3-5 clubs between d-70 and d+40.
    static func clubs(_ bag: [Club], measured: [String: Int], target d: Double) -> [(label: String, yards: Int)] {
        let all = bag.map { c -> (String, Int) in (c.label, measured[c.label] ?? c.mid) }
            .filter { $0.1 > 0 }
        let near = all.filter { Double($0.1) >= d - 70 && Double($0.1) <= d + 40 }
            .sorted { abs(Double($0.1) - d) < abs(Double($1.1) - d) }
        return Array(near.prefix(5)).map { (label: $0.0, yards: $0.1) }.sorted { $0.yards < $1.yards }
    }
}

// MARK: - A tracked shot measured against its aim (finishTrack)

struct ShotResult: Equatable {
    var yards: Int
    var aimYds: Int?
    var latY: Int?      // + right of the aim line
    var longY: Int?     // + past the aim point
}

enum ShotMath {
    static func result(start: GeoPoint, end: GeoPoint, aim: GeoPoint?) -> ShotResult {
        let dE = GeoMath.yards(start, end)
        var r = ShotResult(yards: Int(dE.rounded()), aimYds: nil, latY: nil, longY: nil)
        guard let a = aim else { return r }
        let aimY = GeoMath.yards(start, a)
        let bE = GeoMath.bearing(start, end) * .pi / 180, bA = GeoMath.bearing(start, a) * .pi / 180
        let lat = dE * sin(bE - bA), lng = dE * cos(bE - bA) - aimY
        // the phone keeps aim data only within these bounds
        if aimY >= 30 && dE >= 20 && abs(lat) <= 80 && abs(lng) <= 120 {
            r.aimYds = Int(aimY.rounded()); r.latY = Int(lat.rounded()); r.longY = Int(lng.rounded())
        }
        return r
    }
    static func keep(_ yards: Int) -> Bool { yards >= 5 && yards <= 500 }
}

// MARK: - Est. Drive (the phone's zero-point rules, simplified for the wrist)

struct DriveTracker {
    private(set) var zero: GeoPoint?
    private(set) var locked = false
    private var candidate: GeoPoint?
    private var candidateSince: Double?
    private var last: GeoPoint?

    mutating func reset() { self = DriveTracker() }

    /// Feed every accepted fix. `t` is seconds. Returns the drive in yards to show, or nil.
    @discardableResult
    mutating func update(_ p: GeoPoint, t: Double, tee: GeoPoint, green: GeoPoint, par: Int?) -> Int? {
        guard par == 4 || par == 5 else { return nil }
        defer { last = p }
        // a single jump of 80 y+ is a GPS spike
        if let l = last, GeoMath.yards(l, p) >= 80 { return shown(p, green: green) }
        if !locked {
            let nearTee = GeoMath.yards(p, tee) <= 90
            let behind = GeoMath.yards(p, green) - GeoMath.yards(tee, green)   // + = behind the tee
            if nearTee && behind <= 15 {
                if let c = candidate, GeoMath.yards(c, p) <= 6 {
                    if let s = candidateSince, t - s >= 3 { zero = c }      // parked 3 s → start point
                } else { candidate = p; candidateSince = t }
            }
            if let z = zero, GeoMath.yards(z, p) > 60 { locked = true }
        }
        return shown(p, green: green)
    }

    private func shown(_ p: GeoPoint, green: GeoPoint) -> Int? {
        guard let z = zero, locked else { return nil }
        let d = GeoMath.yards(z, p)
        // only while moving toward the green, and the phone hides past 450 y
        guard d <= 450, GeoMath.yards(p, green) < GeoMath.yards(z, green) else { return nil }
        return Int(d.rounded())
    }
}

// MARK: - Greens (course_greens: ring + 1 m elevation grid)

struct ElevGrid: Codable, Equatable {
    var bbox: [Double]     // [west, south, east, north]
    var w: Int
    var h: Int
    var stepM: Double
    var z: [Int]           // centimetres above the green's lowest point; row 0 = north
    var relief: Int

    func zAt(_ i: Int, _ j: Int) -> Double? {          // col i, row j
        guard i >= 0, j >= 0, i < w, j < h, j * w + i < z.count else { return nil }
        return Double(z[j * w + i])
    }
    /// Bilinear height (cm) under a coordinate — the phone's gvZAt.
    func z(at p: GeoPoint) -> Double? {
        guard bbox.count == 4, bbox[2] > bbox[0], bbox[3] > bbox[1] else { return nil }
        let fx = (p.lng - bbox[0]) / (bbox[2] - bbox[0]) * Double(w) - 0.5
        let fy = (bbox[3] - p.lat) / (bbox[3] - bbox[1]) * Double(h) - 0.5
        let x0 = Int(floor(fx)), y0 = Int(floor(fy))
        let tx = fx - Double(x0), ty = fy - Double(y0)
        let c00 = zAt(max(0, min(w - 1, x0)), max(0, min(h - 1, y0)))
        let c10 = zAt(max(0, min(w - 1, x0 + 1)), max(0, min(h - 1, y0)))
        let c01 = zAt(max(0, min(w - 1, x0)), max(0, min(h - 1, y0 + 1)))
        let c11 = zAt(max(0, min(w - 1, x0 + 1)), max(0, min(h - 1, y0 + 1)))
        guard fx >= -1, fy >= -1, fx <= Double(w), fy <= Double(h),
              let a = c00, let b = c10, let c = c01, let d = c11 else { return nil }
        let top = a + (b - a) * tx, bot = c + (d - c) * tx
        return top + (bot - top) * ty
    }
    /// Centre of cell (i, j).
    func cellCenter(_ i: Int, _ j: Int) -> GeoPoint {
        GeoPoint(lng: bbox[0] + (Double(i) + 0.5) * (bbox[2] - bbox[0]) / Double(w),
                 lat: bbox[3] - (Double(j) + 0.5) * (bbox[3] - bbox[1]) / Double(h))
    }
    /// Downhill direction (bearing, degrees) and slope % at cell (i, j), or nil when flat.
    func downhill(_ i: Int, _ j: Int) -> (bearing: Double, pct: Double)? {
        guard let l = zAt(i - 1, j), let r = zAt(i + 1, j), let n = zAt(i, j - 1), let s = zAt(i, j + 1) else { return nil }
        let dzdx = (r - l) / (2 * stepM)          // cm per metre east  (= %)
        let dzdy = (n - s) / (2 * stepM)          // cm per metre north (= %)
        let pct = sqrt(dzdx * dzdx + dzdy * dzdy)
        guard pct >= 0.6 else { return nil }
        let east = -dzdx, north = -dzdy
        let b = atan2(east, north) * 180 / .pi
        return ((b + 360).truncatingRemainder(dividingBy: 360), pct)
    }
}

struct Green: Codable, Equatable {
    var ring: [GeoPoint]
    var grid: ElevGrid?
    var mapped: Bool
    /// Usable for the all-or-nothing rule: mapped, a real outline, and a slope grid.
    var complete: Bool { mapped && ring.count >= 4 && !(grid?.z.isEmpty ?? true) }
}

/// The phone's slope colours (gvSlopeImage): compare each spot with the PIN's height.
/// Within 4 cm → green; the putt goes up → red; down → blue; deeper with |dz| / 45 cm.
/// v1943: `cb` = the phone's "Color-blind friendly" setting (v1928) - orange up, light gray
/// level, blue down, the phone's exact numbers.
enum SlopeColor {
    static func rgb(cellZ: Double, pinZ: Double, cb: Bool = false) -> (r: Double, g: Double, b: Double) {
        let dz = pinZ - cellZ
        let a = min(1, abs(dz) / 45)
        if cb {
            if abs(dz) < 4 { return (232 / 255, 232 / 255, 232 / 255) }
            if dz > 0 { return (240 / 255, (170 - 80 * a) / 255, (40 - 40 * a) / 255) }
            return ((40 - 40 * a) / 255, (130 - 50 * a) / 255, (200 + 40 * a) / 255)
        }
        if abs(dz) < 4 { return (46 / 255, 184 / 255, 92 / 255) }
        if dz > 0 { return ((205 + 50 * a) / 255, (92 - 62 * a) / 255, (70 - 40 * a) / 255) }
        return ((70 - 40 * a) / 255, (120 - 60 * a) / 255, (205 + 50 * a) / 255)
    }
}

/// Where a course's green rows live (from the phone: gps.greens).
struct GreenSource: Codable, Equatable {
    struct Part: Codable, Equatable { var id: String; var off: Int }
    var parts: [Part]
    var mirror: Bool
    var ids: [String] { parts.map(\.id) }
}

enum GreenMapper {
    /// course_greens rows → greens keyed by PLAYED hole (the watch's hole numbers),
    /// following the phone: combo back nine +9, x2 mirrored, then the round's nine mode.
    static func byPlayedHole(rows: [(courseId: String, hole: Int, green: Green)], source: GreenSource,
                             holeCount: Int, nineMode: String?) -> [Int: Green] {
        var phys: [Int: Green] = [:]
        for p in source.parts {
            for r in rows where r.courseId == p.id && r.hole >= 1 {
                phys[r.hole + p.off] = r.green
                if source.mirror && r.hole <= 9 { phys[r.hole + 9] = r.green }
            }
        }
        var out: [Int: Green] = [:]
        for h in 1...max(1, holeCount) {
            if let g = phys[CourseParser.physicalHole(h, nineMode: nineMode)] { out[h] = g }
        }
        return out
    }
    /// All or nothing (v1891): greens show only when EVERY hole of the round has an
    /// outline and its slope.
    static func live(_ greens: [Int: Green], holeCount: Int) -> Bool {
        guard holeCount >= 1 else { return false }
        return (1...holeCount).allSatisfy { greens[$0]?.complete == true }
    }
    static func parseRow(_ d: [String: Any]) -> (courseId: String, hole: Int, green: Green)? {
        guard let cid = d["course_id"] as? String,
              let hole = Int("\(d["hole"] ?? "")") else { return nil }
        var ring: [GeoPoint] = []
        if let rr = d["ring"] as? [Any] {
            for v in rr { if let a = v as? [Any], a.count >= 2, let x = (a[0] as? NSNumber)?.doubleValue, let y = (a[1] as? NSNumber)?.doubleValue { ring.append(GeoPoint(lng: x, lat: y)) } }
        }
        var grid: ElevGrid? = nil
        if let e = d["elev"] as? [String: Any],
           let bb = e["bbox"] as? [Any], bb.count == 4,
           let w = (e["w"] as? NSNumber)?.intValue, let h = (e["h"] as? NSNumber)?.intValue,
           let zz = e["z_cm"] as? [Any] {
            let bbox = bb.compactMap { ($0 as? NSNumber)?.doubleValue }
            let z = zz.map { ($0 as? NSNumber)?.intValue ?? 0 }
            if bbox.count == 4 && w > 0 && h > 0 && z.count >= w * h {
                grid = ElevGrid(bbox: bbox, w: w, h: h,
                                stepM: (e["step_m"] as? NSNumber)?.doubleValue ?? 1,
                                z: z, relief: (e["relief_cm"] as? NSNumber)?.intValue ?? (z.max() ?? 0))
            }
        }
        let mapped = (d["status"] as? String) == "mapped"
        return (cid, hole, Green(ring: ring, grid: grid, mapped: mapped))
    }
    /// Is `p` inside the outline? (ray casting)
    static func inside(_ p: GeoPoint, ring: [GeoPoint]) -> Bool {
        guard ring.count >= 3 else { return false }
        var inside = false
        var j = ring.count - 1
        for i in 0..<ring.count {
            let a = ring[i], b = ring[j]
            if (a.lat > p.lat) != (b.lat > p.lat),
               p.lng < (b.lng - a.lng) * (p.lat - a.lat) / (b.lat - a.lat) + a.lng { inside.toggle() }
            j = i
        }
        return inside
    }
}
