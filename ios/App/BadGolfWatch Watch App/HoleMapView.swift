// Bad Golf Watch — v1911 Phase 2: the phone's GPS screen on the wrist.
//
//   * Satellite hole map (Esri World Imagery — the phone's own map source), turned
//     tee-up like the phone, with the hole, the aim line and today's pin on top.
//   * Tap anywhere to aim there ("to target" + "target to pin", plays-as, a club);
//     tap the target again to go back to the automatic aim (the phone's rule).
//   * Crown zooms.
//   * Distance arcs (Yards / Clubs) + the miss ring — only when the player turned arcs
//     on in their phone profile, exactly like the phone.
//   * Green view: outline + slope colours (red up, blue down, green level) measured
//     from the pin, and moving today's pin for the group — tap, nudge with the crown,
//     then "Set pin" to confirm. Only on courses where every green has its slope.
//   * Mark shot (when Track Shot is on in their phone profile) and Est. Drive.
//   * The rest of the group as dots, when they share their location.
//
// All the maths lives in GolfGeometry.swift (tested on Linux). This file only draws.

import SwiftUI
import CoreLocation
#if canImport(UIKit)
import UIKit
#endif
#if os(watchOS)
import WatchKit
#endif

// MARK: - Esri tiles (memory + disk cache)

@MainActor
final class TileCache: ObservableObject {
    static let shared = TileCache()
    @Published private(set) var version = 0

    private var mem: [String: UIImage] = [:]
    private var order: [String] = []                // oldest first (a decoded tile is ~256 KB)
    private var inflight: Set<String> = []
    // no URL cache: tiles are already kept on disk below
    private let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.urlCache = nil
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        c.timeoutIntervalForRequest = 15
        return URLSession(configuration: c)
    }()
    private var failedAt: [String: Date] = [:]
    private let dir: URL? = {
        guard let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return nil }
        let d = base.appendingPathComponent("esri", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }()

    private init() { pruneDisk() }

    func image(z: Int, x: Int, y: Int) -> UIImage? {
        let key = "\(z)_\(x)_\(y)"
        if let i = mem[key] { return i }
        if let d = dir, let data = try? Data(contentsOf: d.appendingPathComponent(key + ".jpg")), let i = UIImage(data: data) {
            remember(key, i); return i
        }
        fetch(key, z: z, x: x, y: y)
        return nil
    }

    private func remember(_ key: String, _ i: UIImage) {
        if mem[key] == nil { order.append(key) }
        mem[key] = i
        while order.count > 48 { mem.removeValue(forKey: order.removeFirst()) }
    }

    private func fetch(_ key: String, z: Int, x: Int, y: Int) {
        guard !inflight.contains(key) else { return }
        if let f = failedAt[key], Date().timeIntervalSince(f) < 30 { return }   // offline: don't hammer
        guard let u = URL(string: MapMath.esriTileURL(z: z, x: x, y: y)) else { return }
        inflight.insert(key)
        Task { @MainActor in
            defer { self.inflight.remove(key) }
            guard let (data, resp) = try? await self.session.data(from: u),
                  let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode),
                  let img = UIImage(data: data) else { self.failedAt[key] = Date(); return }
            if let d = self.dir { try? data.write(to: d.appendingPathComponent(key + ".jpg")) }
            self.remember(key, img)
            self.version &+= 1
        }
    }

    /// Keep at most two weeks and ~40 MB of tiles on the watch (oldest go first).
    private func pruneDisk() {
        guard let d = dir, let files = try? FileManager.default.contentsOfDirectory(
            at: d, includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey]) else { return }
        let cutoff = Date().addingTimeInterval(-14 * 24 * 3600)
        var kept: [(url: URL, date: Date, size: Int)] = []
        for f in files {
            let v = try? f.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey])
            let m = v?.contentModificationDate ?? .distantPast
            if m < cutoff { try? FileManager.default.removeItem(at: f) }
            else { kept.append((f, m, v?.fileSize ?? 0)) }
        }
        var total = kept.reduce(0) { $0 + $1.size }
        for f in kept.sorted(by: { $0.date < $1.date }) where total > 40_000_000 {
            try? FileManager.default.removeItem(at: f.url)
            total -= f.size
        }
    }
}

private func cg(_ p: XY) -> CGPoint { CGPoint(x: p.x, y: p.y) }
private func gp(_ c: CLLocation?) -> GeoPoint? { c.map { GeoPoint(lng: $0.coordinate.longitude, lat: $0.coordinate.latitude) } }
private func buzz() {
    #if os(watchOS)
    WKInterfaceDevice.current().play(.click)
    #endif
}

private struct PendingShot: Identifiable {
    let id = UUID()
    var result: ShotResult
}

/// Everything one frame of the map needs, worked out once per render.
private struct MapModel {
    var frame: MapFrame
    var hole: Hole
    var holeNo: Int
    var par: Int?
    var ball: GeoPoint
    var player: GeoPoint?
    var target: GeoPoint
    var targetIsAuto: Bool
    var pin: GeoPoint
}

// MARK: - The map page

struct HoleMapView: View {
    @EnvironmentObject var store: RoundStore
    @EnvironmentObject var loc: LocationManager
    @EnvironmentObject var weather: WeatherService
    @EnvironmentObject var greens: GreenStore
    @ObservedObject private var tiles = TileCache.shared

    @State private var manualTarget: GeoPoint?
    @State private var manualHole = 0
    @State private var zoomAdj: Double = 0
    @State private var arcsMode = 0                 // 0 off · 1 yards · 2 clubs
    @State private var showGreen = false
    @State private var shotStart: GeoPoint?
    @State private var shotAim: GeoPoint?
    @State private var pendingShot: PendingShot?

    private var gps: GpsInfo? { store.round?.gps }
    private var greensOn: Bool { greens.live && (gps?.greenView ?? true) }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.black.ignoresSafeArea()
                if let m = model(geo.size) {
                    Canvas { ctx, _ in render(ctx, m) }
                        .gesture(SpatialTapGesture().onEnded { v in tap(v.location, m) })
                    hud(m)
                } else {
                    VStack(spacing: 6) {
                        Image(systemName: "map").font(.system(size: 26)).foregroundStyle(Color.badGolfBlue)
                        Text("No map for this hole yet").font(.system(size: 13)).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .ignoresSafeArea(edges: .bottom)
        .focusable(true)
        .digitalCrownRotation($zoomAdj, from: -1.5, through: 2.5, by: 0.1,
                              sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
        .onChange(of: store.currentHole) { _, _ in
            manualTarget = nil; zoomAdj = 0; shotStart = nil; shotAim = nil
        }
        .sheet(isPresented: $showGreen) { GreenDetailView() }
        .sheet(item: $pendingShot) { ps in ClubPickerView(shot: ps.result) { club in
            store.sendShot(ps.result, club: club, hole: store.currentHole,
                           windMph: weather.windMph, windDirFrom: weather.windDirFrom, tempF: weather.tempF)
            pendingShot = nil
        } }
    }

    // MARK: model

    private func model(_ size: CGSize) -> MapModel? {
        guard let hole = store.hole, let mid = hole.mid, size.width > 40, size.height > 40 else { return nil }
        let h = store.currentHole
        let pin = (greens.live && (gps?.greenPin ?? true)) ? (store.pin(for: h) ?? mid) : mid
        let player = gp(loc.location)
        // On this hole (within 650 y of the green) we range from the player; otherwise
        // from the tee, like the phone before you arrive.
        let onHole = player.map { GeoMath.yards($0, mid) < 650 } ?? false
        let ball = (onHole ? player : nil) ?? hole.tee ?? player ?? mid
        let par = store.parFor(hole: h) ?? hole.par
        let manual = (manualHole == h) ? manualTarget : nil
        let target = manual ?? Aim.auto(ball: ball, pin: pin, par: par, fwc: hole.fwc, layup: hole.layup)
        var pts = [ball, target, pin]
        if let t = hole.tee, !onHole { pts.append(t) }
        let bearing = GeoMath.meters(ball, mid) > 5 ? GeoMath.bearing(ball, mid)
                    : (hole.tee.map { GeoMath.bearing($0, mid) } ?? 0)
        // room at the bottom for the yardage box + buttons
        guard var f = MapFrame.fit(pts, bearing: bearing, width: size.width, height: size.height,
                                   pad: 20, padBottom: 84) else { return nil }
        f.zoom = min(20.2, max(13, f.zoom + zoomAdj))
        return MapModel(frame: f, hole: hole, holeNo: h, par: par, ball: ball, player: player,
                        target: target, targetIsAuto: manual == nil, pin: pin)
    }

    // MARK: drawing

    private func render(_ ctx: GraphicsContext, _ m: MapModel) {
        let f = m.frame
        _ = tiles.version   // redraw when tiles arrive
        // 1) satellite tiles, rotated tee-up
        let t = f.tiles()
        let scale = pow(2, f.zoom - Double(t.z))
        let cw = MapMath.world(f.center, z: Double(t.z))
        var tc = ctx
        tc.translateBy(x: f.width / 2, y: f.height / 2)
        tc.rotate(by: .radians(-f.bearing * .pi / 180))
        tc.scaleBy(x: scale, y: scale)
        for tile in t.tiles {
            if let img = tiles.image(z: t.z, x: tile.x, y: tile.y) {
                let r = CGRect(x: Double(tile.x) * 256 - cw.x, y: Double(tile.y) * 256 - cw.y, width: 256.6, height: 256.6)
                tc.draw(Image(uiImage: img), in: r)
            }
        }
        // 2) green outline
        if greensOn, let g = greens.greens[m.holeNo], g.ring.count >= 3 {
            var p = Path()
            p.addLines(g.ring.map { cg(f.screen($0)) }); p.closeSubpath()
            ctx.stroke(p, with: .color(.white.opacity(0.9)), lineWidth: 1.2)
        }
        // 3) arcs + miss ring
        if arcsMode > 0 { drawArcs(ctx, m) }
        // 4) aim line ball → target → pin
        var line = Path()
        line.move(to: cg(f.screen(m.ball)))
        line.addLine(to: cg(f.screen(m.target)))
        line.addLine(to: cg(f.screen(m.pin)))
        ctx.stroke(line, with: .color(.white.opacity(0.85)), style: StrokeStyle(lineWidth: 1.6, dash: [4, 3]))
        // 5) fairway target (the phone's light-green dot) when it is not the aim
        if let fw = m.hole.fwc, GeoMath.meters(fw, m.target) > 3 {
            let s = cg(f.screen(fw))
            ctx.fill(Path(ellipseIn: CGRect(x: s.x - 3, y: s.y - 3, width: 6, height: 6)), with: .color(Color(red: 0.29, green: 0.87, blue: 0.5)))
        }
        // 6) pin
        let ps = cg(f.screen(m.pin))
        ctx.fill(Path(ellipseIn: CGRect(x: ps.x - 4, y: ps.y - 4, width: 8, height: 8)), with: .color(.red))
        ctx.stroke(Path(ellipseIn: CGRect(x: ps.x - 4, y: ps.y - 4, width: 8, height: 8)), with: .color(.white), lineWidth: 1)
        // 7) target crosshair
        let ts = cg(f.screen(m.target))
        ctx.stroke(Path(ellipseIn: CGRect(x: ts.x - 8, y: ts.y - 8, width: 16, height: 16)), with: .color(Color.badGolfAmber), lineWidth: 2)
        var cross = Path()
        cross.move(to: CGPoint(x: ts.x - 4, y: ts.y)); cross.addLine(to: CGPoint(x: ts.x + 4, y: ts.y))
        cross.move(to: CGPoint(x: ts.x, y: ts.y - 4)); cross.addLine(to: CGPoint(x: ts.x, y: ts.y + 4))
        ctx.stroke(cross, with: .color(Color.badGolfAmber), lineWidth: 1.5)
        // 8) the group (only players sharing their location; under 2 minutes old)
        let fresh = Date().timeIntervalSince1970 * 1000 - 150_000
        for d in (gps?.group ?? []) where d.stamp >= fresh {
            let s = cg(f.screen(d.at))
            guard s.x > -10, s.y > -10, s.x < f.width + 10, s.y < f.height + 10 else { continue }
            ctx.fill(Path(ellipseIn: CGRect(x: s.x - 5, y: s.y - 5, width: 10, height: 10)), with: .color(.orange))
            ctx.draw(Text(String(d.name.prefix(1))).font(.system(size: 8, weight: .bold)).foregroundColor(.black), at: s)
        }
        // 9) me
        if let me = m.player {
            let s = cg(f.screen(me))
            ctx.fill(Path(ellipseIn: CGRect(x: s.x - 5, y: s.y - 5, width: 10, height: 10)), with: .color(Color.badGolfBlue))
            ctx.stroke(Path(ellipseIn: CGRect(x: s.x - 5, y: s.y - 5, width: 10, height: 10)), with: .color(.white), lineWidth: 1.5)
        }
        // Esri asks for attribution
        ctx.draw(Text("Powered by Esri").font(.system(size: 6)).foregroundColor(.white.opacity(0.6)),
                 at: CGPoint(x: f.width - 26, y: f.height - 5))
    }

    private func drawArcs(_ ctx: GraphicsContext, _ m: MapModel) {
        let f = m.frame
        let bS = f.screen(m.ball), tS = f.screen(m.target)
        let b = cg(bS), tgt = cg(tS)
        let aim: Double = atan2(tS.y - bS.y, tS.x - bS.x)
        let span: Double = 40.0 * .pi / 180
        let ppy = f.pointsPerYard
        let d = GeoMath.yards(m.ball, m.target)
        var rings: [(yards: Int, label: String, bold: Bool)] = []
        if arcsMode == 1 {
            let step = Arcs.step(pointsPerYard: ppy)
            rings = Arcs.yards(target: d, step: step).map { (yards: $0, label: "\($0)", bold: abs(Double($0) - d) < Double(step) / 2) }
        } else {
            rings = Arcs.clubs(store.clubs, measured: gps?.measured ?? [:], target: d)
                .map { (yards: $0.yards, label: $0.label, bold: false) }
        }
        for r in rings {
            let rad = Double(r.yards) * ppy
            var p = Path()
            p.addArc(center: b, radius: rad, startAngle: .radians(aim - span), endAngle: .radians(aim + span), clockwise: false)
            ctx.stroke(p, with: .color(.white.opacity(r.bold ? 0.95 : 0.6)), lineWidth: r.bold ? 1.8 : 1)
            let lx: Double = bS.x + cos(aim + span) * rad
            let ly: Double = bS.y + sin(aim + span) * rad
            let lp = CGPoint(x: lx, y: ly)
            ctx.draw(Text(r.label).font(.system(size: 8, weight: .semibold)).foregroundColor(.white), at: lp)
        }
        // miss ring at the target (the player's ±yards from their profile)
        let mr: Double = Double(gps?.dispYds ?? 15) * ppy
        ctx.stroke(Path(ellipseIn: CGRect(x: tS.x - mr, y: tS.y - mr, width: 2 * mr, height: 2 * mr)),
                   with: .color(Color.badGolfAmber.opacity(0.7)), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
    }

    // MARK: overlay (numbers + buttons)

    @ViewBuilder private func hud(_ m: MapModel) -> some View {
        let toT = Int(GeoMath.yards(m.ball, m.target).rounded())
        let tToPin = Int(GeoMath.yards(m.target, m.pin).rounded())
        let plays = playsLike(m, yards: toT)
        VStack(spacing: 0) {
            HStack(alignment: .top) {
                Text(m.par.map { "H\(m.holeNo) · P\($0)" } ?? "H\(m.holeNo)")
                    .font(.system(size: 11, weight: .semibold))
                    .padding(.horizontal, 5).padding(.vertical, 2)
                    .background(Color.black.opacity(0.55), in: Capsule())
                Spacer()
                if let dy = store.driveYds {
                    Text("Drive \(dy)").font(.system(size: 11, weight: .semibold))
                        .padding(.horizontal, 5).padding(.vertical, 2)
                        .background(Color.black.opacity(0.55), in: Capsule())
                }
            }
            Spacer()
            if let s = shotStart {
                shotBar(start: s, m: m)
            } else {
                VStack(spacing: 1) {
                    HStack(spacing: 6) {
                        Text("\(toT)").font(.system(size: 20, weight: .bold, design: .rounded)).monospacedDigit()
                        if let p = plays, p != toT {
                            Text("plays \(p)").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.badGolfAmber)
                        }
                        if let c = store.suggestedClub(for: (store.watchPlaysAs ? plays : nil) ?? toT) {
                            Text(c).font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.85))
                        }
                    }
                    if GeoMath.meters(m.target, m.pin) > 3 {
                        Text("then \(tToPin) to pin").font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.85))
                    }
                }
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Color.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 8))
                buttons(m)
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 2)
    }

    private func buttons(_ m: MapModel) -> some View {
        HStack(spacing: 6) {
            if greensOn, greens.greens[m.holeNo] != nil {
                mapButton("circle.dashed", on: false) { showGreen = true }
            }
            if gps?.arcs == true {
                mapButton(arcsMode == 2 ? "figure.golf" : "dot.radiowaves.right", on: arcsMode > 0) {
                    arcsMode = (arcsMode + 1) % 3; buzz()
                }
            }
            if gps?.trackShot ?? true, m.player != nil {
                mapButton("flag.and.flag.filled.crossed", on: false) {
                    shotStart = m.player; shotAim = m.target; buzz()
                }
            }
            if !m.targetIsAuto {
                mapButton("scope", on: false) { manualTarget = nil; buzz() }
            }
        }
        .padding(.top, 3)
        .padding(.bottom, 4)
    }

    private func mapButton(_ icon: String, on: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .semibold))
                .frame(width: 32, height: 32)
                .background(on ? Color.badGolfBlue : Color.black.opacity(0.6), in: Circle())
                .foregroundStyle(on ? Color.black : Color.white)
        }
        .buttonStyle(.plain)
    }

    private func shotBar(start s: GeoPoint, m: MapModel) -> some View {
        let now = m.player
        let yds = now.map { Int(GeoMath.yards(s, $0).rounded()) } ?? 0
        return VStack(spacing: 3) {
            Text("Shot \(yds) y").font(.system(size: 18, weight: .bold, design: .rounded)).monospacedDigit()
            Text("Walk to your ball, then Done").font(.system(size: 10)).foregroundStyle(Color.white.opacity(0.8))
            HStack(spacing: 6) {
                Button("Cancel") { shotStart = nil; shotAim = nil }
                    .buttonStyle(.bordered)
                Button("Done") {
                    if let end = m.player {
                        let r = ShotMath.result(start: s, end: end, aim: shotAim)
                        if ShotMath.keep(r.yards) { pendingShot = PendingShot(result: r) }
                    }
                    shotStart = nil; shotAim = nil
                }
                .buttonStyle(.borderedProminent).tint(Color.badGolfBlue)
            }
        }
        .padding(6)
        .background(Color.black.opacity(0.65), in: RoundedRectangle(cornerRadius: 10))
        .padding(.bottom, 4)
    }

    // MARK: input

    private func tap(_ pt: CGPoint, _ m: MapModel) {
        let ts = m.frame.screen(m.target)
        if !m.targetIsAuto, hypot(pt.x - ts.x, pt.y - ts.y) < 18 {
            manualTarget = nil                                   // tap the target again: back to automatic
        } else {
            manualTarget = m.frame.geo(XY(x: pt.x, y: pt.y))
            manualHole = m.holeNo
        }
        buzz()
    }

    /// Wind + temperature always; the slope / altitude part only when aiming at the
    /// green — the elevation the watch has is the green's, not a lay-up spot's.
    private func playsLike(_ m: MapModel, yards: Int) -> Int? {
        let atGreen = GeoMath.meters(m.target, m.pin) < 25
        return Geo.playsLike(center: yards,
                      player: CLLocationCoordinate2D(latitude: m.ball.lat, longitude: m.ball.lng),
                      green: CLLocationCoordinate2D(latitude: m.target.lat, longitude: m.target.lng),
                      playerElevationM: atGreen ? weather.playerElevationM : nil,
                      greenElevationM: atGreen ? weather.greenElevationM : nil,
                      windMph: weather.windMph, windDirFromDeg: weather.windDirFrom, tempF: weather.tempF)
    }
}

// MARK: - Club picker for a tracked shot

private struct ClubPickerView: View {
    @EnvironmentObject var store: RoundStore
    let shot: ShotResult
    let onPick: (String) -> Void
    var body: some View {
        List {
            Section {
                ForEach(store.clubs, id: \.label) { c in
                    Button(c.label) { onPick(c.label) }
                }
                Button("No club") { onPick("") }
            } header: {
                Text("\(shot.yards) y — which club?")
            }
        }
    }
}

// MARK: - Green view (outline, slope, today's pin)

struct GreenDetailView: View {
    @EnvironmentObject var store: RoundStore
    @EnvironmentObject var loc: LocationManager
    @EnvironmentObject var greens: GreenStore

    @State private var base: GeoPoint?          // where the new pin was tapped
    @State private var nudge: Double = 0        // metres along the approach line (crown)
    @FocusState private var crownFocused: Bool  // the crown nudges the pin once one is placed

    private var h: Int { store.currentHole }
    private var green: Green? { greens.greens[h] }
    private var gps: GpsInfo? { store.round?.gps }
    private var canMovePin: Bool { greens.live && (gps?.greenPin ?? true) && store.round != nil }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.black.ignoresSafeArea()
                if let g = green, let gf = greenFrame(g, geo.size) {
                    Canvas { ctx, _ in render(ctx, g, gf) }
                        .gesture(SpatialTapGesture().onEnded { v in tap(v.location, g, gf) })
                    hud(g)
                } else {
                    Text("No green for this hole").font(.system(size: 13)).foregroundStyle(.secondary)
                }
            }
        }
        .focusable(true)
        .focused($crownFocused)
        .digitalCrownRotation($nudge, from: -25, through: 25, by: 0.5,
                              sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
    }

    private var mid: GeoPoint? { store.hole?.mid }
    private var approachBearing: Double {
        guard let m = mid else { return 0 }
        if let p = gp(loc.location), GeoMath.meters(p, m) > 8 { return GeoMath.bearing(p, m) }
        if let t = store.hole?.tee { return GeoMath.bearing(t, m) }
        return 0
    }
    /// The pin being placed: where it was tapped, nudged with the crown along the
    /// approach line (front ↔ back).
    private var candidate: GeoPoint? {
        guard let b = base else { return nil }
        return abs(nudge) < 0.01 ? b : GeoMath.offset(b, meters: nudge, bearing: approachBearing)
    }
    private var pin: GeoPoint? { candidate ?? store.pin(for: h) ?? mid }

    private func greenFrame(_ g: Green, _ size: CGSize) -> MapFrame? {
        guard g.ring.count >= 3 else { return nil }
        return MapFrame.fit(g.ring, bearing: approachBearing, width: size.width, height: size.height,
                            pad: 14, minZoom: 15, maxZoom: 24)
    }

    private func render(_ ctx: GraphicsContext, _ g: Green, _ f: MapFrame) {
        var ring = Path()
        ring.addLines(g.ring.map { cg(f.screen($0)) }); ring.closeSubpath()
        var inner = ctx
        inner.clip(to: ring)
        if (gps?.greenSlope ?? true), let grid = g.grid, let p = pin {
            let pinZ = grid.z(at: p) ?? Double(grid.relief) / 2
            let step = (grid.w * grid.h > 900) ? 2 : 1          // keep it light on the wrist
            // A green is tiny, so the projection is affine across it: project the NW
            // corner and one cell east / south once, then every corner is o + i·u + j·v.
            let dLng = (grid.bbox[2] - grid.bbox[0]) / Double(grid.w)
            let dLat = (grid.bbox[3] - grid.bbox[1]) / Double(grid.h)
            let o = f.screen(GeoPoint(lng: grid.bbox[0], lat: grid.bbox[3]))
            let e = f.screen(GeoPoint(lng: grid.bbox[0] + dLng, lat: grid.bbox[3]))
            let s1 = f.screen(GeoPoint(lng: grid.bbox[0], lat: grid.bbox[3] - dLat))
            let ux = e.x - o.x, uy = e.y - o.y, vx = s1.x - o.x, vy = s1.y - o.y
            func corner(_ i: Int, _ j: Int) -> CGPoint {
                CGPoint(x: o.x + Double(i) * ux + Double(j) * vx, y: o.y + Double(i) * uy + Double(j) * vy)
            }
            var j = 0
            while j < grid.h {
                var i = 0
                while i < grid.w {
                    // a 2x2 block takes its centre-most cell's height
                    let ci = min(grid.w - 1, i + step / 2), cj = min(grid.h - 1, j + step / 2)
                    if let z = grid.zAt(ci, cj) {
                        let c = SlopeColor.rgb(cellZ: z, pinZ: pinZ)
                        var cell = Path()
                        cell.addLines([corner(i, j), corner(i + step, j), corner(i + step, j + step), corner(i, j + step)])
                        cell.closeSubpath()
                        inner.fill(cell, with: .color(Color(red: c.r, green: c.g, blue: c.b)))
                    }
                    i += step
                }
                j += step
            }
            // downhill arrows every 3 m
            var j2 = 1
            while j2 < grid.h - 1 {
                var i2 = 1
                while i2 < grid.w - 1 {
                    if let dh = grid.downhill(i2, j2) {
                        let c0 = grid.cellCenter(i2, j2)
                        let len = grid.stepM * (0.9 + min(dh.pct, 5) / 5 * 1.1)
                        let c1 = GeoMath.offset(c0, meters: len, bearing: dh.bearing)
                        var a = Path()
                        a.move(to: cg(f.screen(c0))); a.addLine(to: cg(f.screen(c1)))
                        inner.stroke(a, with: .color(.white.opacity(0.55)), lineWidth: 1)
                    }
                    i2 += 3
                }
                j2 += 3
            }
        } else {
            inner.fill(ring, with: .color(Color(red: 0.18, green: 0.6, blue: 0.3)))
        }
        ctx.stroke(ring, with: .color(.white), lineWidth: 1.5)
        // the current pin (red) and the one being placed (amber)
        if let cp = store.pin(for: h) ?? mid {
            let s = cg(f.screen(cp))
            ctx.fill(Path(ellipseIn: CGRect(x: s.x - 5, y: s.y - 5, width: 10, height: 10)), with: .color(.red))
            ctx.stroke(Path(ellipseIn: CGRect(x: s.x - 5, y: s.y - 5, width: 10, height: 10)), with: .color(.white), lineWidth: 1.2)
        }
        if let c = candidate {
            let s = cg(f.screen(c))
            ctx.stroke(Path(ellipseIn: CGRect(x: s.x - 8, y: s.y - 8, width: 16, height: 16)), with: .color(Color.badGolfAmber), lineWidth: 2.5)
        }
    }

    @ViewBuilder private func hud(_ g: Green) -> some View {
        let me = gp(loc.location)
        let hole = store.hole
        VStack(spacing: 2) {
            if let me = me, let p = pin {
                Text("\(Int(GeoMath.yards(me, p).rounded())) to pin")
                    .font(.system(size: 15, weight: .bold, design: .rounded)).monospacedDigit()
                    .padding(.horizontal, 6).padding(.vertical, 1)
                    .background(Color.black.opacity(0.55), in: Capsule())
            }
            if let me = me, let fr = hole?.front, let bk = hole?.back {
                Text("F \(Int(GeoMath.yards(me, fr).rounded())) · B \(Int(GeoMath.yards(me, bk).rounded()))")
                    .font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.9))
            }
            Spacer()
            if canMovePin {
                if let c = candidate {
                    let ok = GreenMapper.inside(c, ring: g.ring) && (mid.map { GeoMath.meters(c, $0) <= 45 } ?? false)
                    HStack(spacing: 6) {
                        Button("Cancel") { base = nil; nudge = 0 }.buttonStyle(.bordered)
                        Button("Set pin") {
                            store.setPin(hole: h, at: c)
                            base = nil; nudge = 0; buzz()
                        }
                        .buttonStyle(.borderedProminent).tint(.green)
                        .disabled(!ok)
                    }
                    Text(ok ? "Crown moves it front ↔ back" : "Keep the pin on the green")
                        .font(.system(size: 10)).foregroundStyle(Color.white.opacity(0.8))
                } else {
                    Text("Tap the green to move today's pin").font(.system(size: 10))
                        .foregroundStyle(Color.white.opacity(0.75))
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Color.black.opacity(0.5), in: Capsule())
                }
            }
        }
        .padding(.top, 2).padding(.bottom, 4)
    }

    private func tap(_ pt: CGPoint, _ g: Green, _ f: MapFrame) {
        guard canMovePin else { return }
        let p = f.geo(XY(x: pt.x, y: pt.y))
        guard GreenMapper.inside(p, ring: g.ring) else { return }
        base = p; nudge = 0; crownFocused = true; buzz()
    }
}
