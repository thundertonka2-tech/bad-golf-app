import Foundation
var pass = 0, fail = 0
func ok(_ c: Bool, _ m: String) { if c { pass += 1 } else { fail += 1; print("  FAIL: " + m) } }
func load(_ f: String) -> [String: Any] {
    let d = try! Data(contentsOf: URL(fileURLWithPath: f))
    return try! JSONSerialization.jsonObject(with: d) as! [String: Any]
}
// clean cache
let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
try? FileManager.default.createDirectory(at: docs, withIntermediateDirectories: true)
try? FileManager.default.removeItem(at: docs.appendingPathComponent("active_round.json"))

ok(UnitsFormat.text(2) == "+2", "units +2 (\(UnitsFormat.text(2)))")
ok(UnitsFormat.text(-1.5) == "\u{2212}1.5", "units -1.5 (\(UnitsFormat.text(-1.5)))")
ok(UnitsFormat.text(0.25) == "+0.25", "units 0.25 (\(UnitsFormat.text(0.25)))")
ok(UnitsFormat.text(0.001) == "0", "units ~0")

let live = load("fixture_live.json")
let ended = load("fixture_ended.json")

let store = await MainActor.run { RoundStore() }
await MainActor.run {
    store.applyPayload(live)
    ok(store.round?.id == "QAHAND", "round applied")
    ok(store.players.count == 3, "3 players")
    ok(store.me?.id == "p0-t", "me resolved")
    ok(store.orderedPlayers.first?.id == "p0-t", "me first")
    ok(store.track.putts && store.track.fairways && store.track.penalties && store.track.gir, "tracking parsed")
    ok(store.round?.scorer == true && store.round?.isEvent == false, "scorer / event flags")
    ok(store.parFor(hole: 3) == 3, "par from the round's card")
    ok(store.round?.standings?.games.first?.key == "skins", "standings parsed")
    ok(store.round?.standings?.units["p0-t"] == 2, "my units 2")
    ok(store.player("p0-t")?.fairway(2) == "L", "fairway code L")
    ok(store.player("p0-t")?.girOn(1) == true, "gir parsed")
    ok(store.toPar(store.player("p0-t")!) == "-1", "to par -1 (\(store.toPar(store.player("p0-t")!)))")
    ok(store.currentHole == 3, "hole 3 from phone")
}
// score another player — acked
WatchConnectivityManager.ack = true
await MainActor.run { store.setCell(pid: "p1-k", hole: 3, field: "s", int: 4) }
await store.flush()
await MainActor.run {
    ok(store.player("p1-k")?.strokes(3) == 4, "Kevin hole 3 = 4 locally")
    ok(WatchConnectivityManager.lastCells.contains { $0.pid == "p1-k" && $0.field == "s" && $0.iv == 4 } || store.syncState == .synced, "cell sent")
}
// my own strokes ride the own-score path
await MainActor.run { store.setCell(pid: "p0-t", hole: 3, field: "s", int: 3) }
await store.flush()
await MainActor.run {
    ok(store.round?.scores[3]?.strokes == 3, "my strokes in round.scores")
    ok(store.player("p0-t")?.strokes(3) == 3, "my row updated")
    ok(store.syncState == .synced, "synced after ack")
}
// unacked edit survives the heartbeat (overlay)
WatchConnectivityManager.ack = false
await MainActor.run { store.setCell(pid: "p1-k", hole: 3, field: "p", int: 3) }
await store.flush()
await MainActor.run {
    if case .queued(let n) = store.syncState { ok(n == 1, "1 queued") } else { ok(false, "should be queued") }
    store.applyPayload(live)            // phone has not got it yet
    ok(store.player("p1-k")?.puttsOn(3) == 3, "unsent putts survive the heartbeat")
    store.setCell(pid: "p1-k", hole: 3, field: "s", int: 0)      // never clears / never 0
    ok(store.player("p1-k")?.strokes(3) == nil || store.player("p1-k")?.strokes(3) == 4, "no zero score written")
}
// cache round-trip keeps the queue + group
let store2 = await MainActor.run { RoundStore() }
await MainActor.run {
    ok(store2.players.count == 3, "cache restores the group")
    if case .queued(let n) = store2.syncState { ok(n >= 1, "cache restores the queue") } else { ok(false, "cache lost the queue") }
    ok(store2.player("p1-k")?.puttsOn(3) == 3, "cache restores the unsent edit")
}
// read-only player can't be scored
var ro = live
var rr = ro["round"] as! [String: Any]
var ps = rr["players"] as! [[String: Any]]
ps[2]["canScore"] = false
rr["players"] = ps; ro["round"] = rr
await MainActor.run {
    store.applyPayload(ro)
    store.setCell(pid: "p2-f", hole: 3, field: "s", int: 9)
    ok(store.player("p2-f")?.strokes(3) == nil, "read-only player not scored")
}
// fairway + penalties
WatchConnectivityManager.ack = true
await MainActor.run {
    store.setCell(pid: "p1-k", hole: 1, field: "fw", str: "R")
    store.setCell(pid: "p1-k", hole: 1, field: "pen", int: 0)
    ok(store.player("p1-k")?.fairway(1) == "R", "fairway R")
    ok(store.player("p1-k")?.penalties(1) == nil, "pen 0 clears")
}
// finish
// finish is refused while an edit is still unacked
WatchConnectivityManager.ack = false
await MainActor.run { store.setCell(pid: "p1-k", hole: 2, field: "pen", int: 2) }
WatchConnectivityManager.actions = []
await store.requestFinish()
await MainActor.run {
    ok(WatchConnectivityManager.actions.isEmpty, "finish NOT sent while scores are unacked")
    ok(store.finishNote?.contains("haven't reached") == true, "note says scores pending")
}
WatchConnectivityManager.ack = true
await store.requestFinish()
try? await Task.sleep(nanoseconds: 200_000_000)
await MainActor.run {
    ok(WatchConnectivityManager.actions.last == "finish:QAHAND", "finish action sent")
    ok(store.finishNote?.contains("phone") == true, "finish note shown")
}
// debounced flush: three quick edits, one send
var sends = 0
await MainActor.run { store.setCell(pid: "p1-k", hole: 5, field: "s", int: 5); store.setCell(pid: "p1-k", hole: 5, field: "s", int: 6); store.setCell(pid: "p1-k", hole: 5, field: "s", int: 7) }
try? await Task.sleep(nanoseconds: 600_000_000)
await MainActor.run {
    sends = WatchConnectivityManager.lastCells.filter { $0.pid == "p1-k" && $0.hole == 5 }.count
    ok(sends == 1 && WatchConnectivityManager.lastCells.first(where: { $0.hole == 5 })?.iv == 7, "debounced: one cell, last value 7")
    ok(store.syncState == .synced, "debounced send acked")
}
// round ends with a summary; dismissed summary does not come back
await MainActor.run {
    store.applyPayload(ended)
    ok(store.round == nil, "round cleared")
    ok(store.summary?.code == "QAHAND" && store.summary?.strokes == 7 && store.summary?.board.count == 3, "summary shown")
}
let store3 = await MainActor.run { RoundStore() }
await MainActor.run {
    ok(store3.summary?.code == "QAHAND", "final card survives an app relaunch")
    store.dismissSummary()
    ok(store.summary == nil, "summary dismissed")
    store.applyPayload(ended)
    ok(store.summary == nil, "re-sent summary stays dismissed")
}

// ======================= v1911 Phase 2: the wrist map =======================
func near(_ a: Double, _ b: Double, _ tol: Double) -> Bool { abs(a - b) <= tol }
let liveP = load("fixture_live.json")
let mstore = await MainActor.run { RoundStore() }
await MainActor.run {
    mstore.applyPayload(liveP)
    let g = mstore.round?.gps
    ok(g?.arcs == true && g?.trackShot == true && g?.estDrive == true, "gps settings parsed")
    ok(g?.greens?.ids == ["qa-links"] && g?.greens?.mirror == false, "green source parsed")
    ok(g?.pins[1] != nil && near(g!.pins[1]!.lat, 32.93362, 1e-9), "today's pin parsed")
    ok(g?.group.count == 1 && g?.group.first?.id == "p1-k", "group dot parsed")
    ok(mstore.activeCourse?.holes[1]?.fwc != nil && mstore.activeCourse?.holes[1]?.tee != nil, "hole tee + fairway target parsed")
    ok(mstore.pin(for: 1) != nil && mstore.pin(for: 2) == nil, "pin(for:) from the phone")
    let newPin = GeoPoint(lng: -96.46003, lat: 32.93365)
    mstore.setPin(hole: 2, at: newPin)
    ok(mstore.pin(for: 2) == newPin, "a pin set on the watch shows at once")
    ok(WatchConnectivityManager.actions.last == "pin:QAHAND" && (WatchConnectivityManager.lastExtra["h"] as? Int) == 2, "pin action sent with the hole")
    ok((WatchConnectivityManager.lastExtra["ll"] as? [Double])?.count == 2, "pin action carries [lng, lat]")
    mstore.sendShot(ShotResult(yards: 152, aimYds: 150, latY: 4, longY: 2), club: "7 Iron", hole: 3, windMph: 8, windDirFrom: 180, tempF: 70)
    ok(WatchConnectivityManager.actions.last == "shot:QAHAND" && (WatchConnectivityManager.lastExtra["yards"] as? Int) == 152 && (WatchConnectivityManager.lastExtra["latY"] as? Int) == 4, "shot action")
    WatchConnectivityManager.actions = []
    mstore.sendShot(ShotResult(yards: 3, aimYds: nil, latY: nil, longY: nil), club: "", hole: 3, windMph: nil, windDirFrom: nil, tempF: nil)
    ok(WatchConnectivityManager.actions.isEmpty, "a 3-yard shot is never sent")
    ok(mstore.round?.standings?.chips != nil, "standings carry chips (may be empty)")
}
let mstore2 = await MainActor.run { RoundStore() }
await MainActor.run {
    ok(mstore2.round?.gps?.pins[1] != nil, "gps info survives the cache")
    ok(mstore2.activeCourse?.holes[1]?.fwc != nil, "fairway target survives the course cache")
}

// projection
let tee = GeoPoint(lng: -96.4600, lat: 32.9300), mid = GeoPoint(lng: -96.4600, lat: 32.9336)
let fwc = GeoPoint(lng: -96.4600, lat: 32.9320)
let w = MapMath.world(mid, z: 17.3), back = MapMath.geo(w, z: 17.3)
ok(near(back.lat, mid.lat, 1e-9) && near(back.lng, mid.lng, 1e-9), "mercator round trip")
ok(near(GeoMath.yards(tee, mid), 438.3, 1.5), "tee to green ~438 y (\(GeoMath.yards(tee, mid)))")
ok(near(GeoMath.bearing(tee, mid), 0, 0.01), "due north")
let sideways = GeoPoint(lng: -96.4560, lat: 32.9300)
let bE = GeoMath.bearing(tee, sideways)
ok(near(bE, 90, 0.1), "due east (\(bE))")
if let f = MapFrame.fit([tee, mid, fwc], bearing: GeoMath.bearing(sideways, tee), width: 184, height: 224, pad: 20) {
    let ts = f.screen(tee), ms = f.screen(mid)
    for p in [tee, mid, fwc] { let s = f.screen(p); ok(s.x >= 19 && s.x <= 165 && s.y >= 19 && s.y <= 205, "fit keeps every point on screen (\(s))") }
    let rt = f.geo(f.screen(fwc))
    ok(near(rt.lat, fwc.lat, 1e-8) && near(rt.lng, fwc.lng, 1e-8), "screen <-> geo round trip with rotation")
    ok(f.zoom > 15 && f.zoom <= 19.4, "fit zoom sane (\(f.zoom))")
    _ = ts; _ = ms
}
if let f = MapFrame.fit([tee, mid], bearing: GeoMath.bearing(tee, mid), width: 184, height: 224) {
    ok(f.screen(tee).y > f.screen(mid).y + 100, "tee-up: the tee is at the bottom, the green at the top")
    ok(near(f.screen(tee).x, f.screen(mid).x, 1), "tee-up: the hole runs straight up")
    let t = f.tiles()
    ok(!t.tiles.isEmpty && t.z <= 19 && t.tiles.count <= 36, "tiles to fetch: \(t.tiles.count) at z\(t.z)")
    let ppy = f.pointsPerYard
    let sTee = f.screen(tee), sMid = f.screen(mid)
    let measured = hypot(sTee.x - sMid.x, sTee.y - sMid.y) / GeoMath.yards(tee, mid)
    ok(near(ppy, measured, measured * 0.01), "points per yard matches the drawn distance")
}
// aim
ok(Aim.auto(ball: tee, pin: mid, par: 4, fwc: fwc, layup: nil) == fwc, "par 4 from the tee: fairway target")
ok(Aim.auto(ball: tee, pin: mid, par: 3, fwc: fwc, layup: nil) == mid, "par 3: the pin")
ok(Aim.auto(ball: GeoPoint(lng: -96.46, lat: 32.9325), pin: mid, par: 4, fwc: fwc, layup: nil) == mid, "inside 200 y: the pin")
ok(Aim.auto(ball: GeoPoint(lng: -96.46, lat: 32.9319), pin: mid, par: 4, fwc: fwc, layup: nil) == mid, "fairway target not 27 m ahead: the pin")
// arcs
ok(Arcs.step(pointsPerYard: 0.5) == 50 && Arcs.step(pointsPerYard: 3) == 10, "arc step ladder")
ok(Arcs.yards(target: 152, step: 10) == [130, 140, 150, 160, 170], "five yardage arcs")
let bag = [Club(label: "PW", min: 115, max: 125), Club(label: "9i", min: 130, max: 140), Club(label: "7i", min: 150, max: 160), Club(label: "Dr", min: 240, max: 260)]
let ca = Arcs.clubs(bag, measured: ["7i": 148], target: 150)
ok(ca.map(\.label) == ["PW", "9i", "7i"] && ca.last?.yards == 148, "club arcs use measured distance (\(ca))")
// tracked shot vs aim
let aimPt = GeoMath.offset(tee, meters: 150 / GeoMath.metersToYards, bearing: 0)
let straight = ShotMath.result(start: tee, end: aimPt, aim: aimPt)
ok(straight.yards == 150 && straight.latY == 0 && straight.longY == 0, "straight shot on the aim (\(straight))")
let right = ShotMath.result(start: tee, end: GeoMath.offset(aimPt, meters: 9, bearing: 90), aim: aimPt)
ok((right.latY ?? 0) >= 9 && (right.latY ?? 0) <= 10, "miss right is +lat (\(right))")
ok(ShotMath.result(start: tee, end: aimPt, aim: GeoMath.offset(tee, meters: 10, bearing: 0)).latY == nil, "aim under 30 y: no aim data")
// Est. Drive
var dt = DriveTracker()
for i in 0..<5 { dt.update(GeoMath.offset(tee, meters: 2, bearing: 0), t: Double(i), tee: tee, green: mid, par: 4) }
ok(dt.zero != nil, "parked 3 s at the tee sets the start point")
var shown: Int? = nil
for s in stride(from: 20.0, through: 230.0, by: 15) { shown = dt.update(GeoMath.offset(tee, meters: s, bearing: 0), t: 10 + s, tee: tee, green: mid, par: 4) }
ok(dt.locked && shown != nil && near(Double(shown!), 250, 3), "walk to the ball: drive ~250 (\(String(describing: shown)))")
var dt3 = DriveTracker()
for i in 0..<5 { dt3.update(tee, t: Double(i), tee: tee, green: mid, par: 3) }
ok(dt3.zero == nil, "no drive on a par 3")
var dtBehind = DriveTracker()
for i in 0..<5 { dtBehind.update(GeoMath.offset(tee, meters: 40, bearing: 180), t: Double(i), tee: tee, green: mid, par: 4) }
ok(dtBehind.zero == nil, "40 m behind the tee is not a start point")
// greens
let ring = [GeoPoint(lng: -96.46010, lat: 32.93350), GeoPoint(lng: -96.45990, lat: 32.93350),
            GeoPoint(lng: -96.45990, lat: 32.93370), GeoPoint(lng: -96.46010, lat: 32.93370)]
ok(GreenMapper.inside(mid, ring: ring) && !GreenMapper.inside(tee, ring: ring), "inside the outline")
let row: [String: Any] = ["course_id": "base#red", "hole": "2", "status": "mapped",
    "ring": ring.map { [$0.lng, $0.lat] },
    "elev": ["bbox": [-96.4601, 32.9335, -96.4599, 32.9337], "w": 3, "h": 3, "step_m": 1.0, "relief_cm": 40,
             "z_cm": [40, 40, 40, 20, 20, 20, 0, 0, 0]]]
let pr = GreenMapper.parseRow(row)
ok(pr?.courseId == "base#red" && pr?.hole == 2 && pr?.green.complete == true, "parse a course_greens row")
if let gr = pr?.green.grid {
    ok(gr.zAt(1, 0) == 40 && gr.zAt(1, 2) == 0, "grid rows: north first")
    ok(near(gr.z(at: gr.cellCenter(1, 1)) ?? -1, 20, 0.01), "bilinear height at a cell centre")
    let dh = gr.downhill(1, 1)
    ok(dh != nil && near(dh!.bearing, 180, 1) && near(dh!.pct, 20, 0.1), "downhill is south, 20% (\(String(describing: dh)))")
}
let up = SlopeColor.rgb(cellZ: 0, pinZ: 30), down = SlopeColor.rgb(cellZ: 30, pinZ: 0), lvl = SlopeColor.rgb(cellZ: 10, pinZ: 12)
ok(up.r > up.b && down.b > down.r && lvl.g > lvl.r && lvl.g > lvl.b, "red up / blue down / green level")
let gOK = Green(ring: ring, grid: pr?.green.grid, mapped: true)
let gNoSlope = Green(ring: ring, grid: nil, mapped: true)
let src2 = GreenSource(parts: [.init(id: "base#white", off: 0), .init(id: "base#red", off: 9)], mirror: false)
let rows2 = (1...9).map { (courseId: "base#white", hole: $0, green: gOK) } + (1...9).map { (courseId: "base#red", hole: $0, green: $0 == 4 ? gNoSlope : gOK) }
let by18 = GreenMapper.byPlayedHole(rows: rows2, source: src2, holeCount: 18, nineMode: "all18")
ok(by18.count == 18 && by18[13]?.complete == false, "combo: back-nine rows land on 10-18")
ok(GreenMapper.live(by18, holeCount: 18) == false, "one hole without slope: greens off for the course")
let byBack = GreenMapper.byPlayedHole(rows: rows2, source: src2, holeCount: 9, nineMode: "back9")
ok(byBack[4]?.complete == false && byBack.count == 9, "back-nine-only round: played 4 is physical 13")
let srcX2 = GreenSource(parts: [.init(id: "nine", off: 0)], mirror: true)
let byX2 = GreenMapper.byPlayedHole(rows: (1...9).map { (courseId: "nine", hole: $0, green: gOK) }, source: srcX2, holeCount: 18, nineMode: "all18")
ok(byX2.count == 18 && GreenMapper.live(byX2, holeCount: 18), "x2: nine greens mirrored onto 18 holes, live")

// Est. Drive through the store (fed once a second; the same fix re-fed while parked)
let dstore = await MainActor.run { RoundStore() }
await MainActor.run {
    dstore.applyPayload(liveP)
    dstore.goTo(hole: 1)
    let t1 = dstore.activeCourse!.holes[1]!.tee!
    for i in 0..<5 { dstore.feedDrive(t1, now: 1000 + Double(i)) }
    var last: Int? = nil
    for s in stride(from: 20.0, through: 200.0, by: 20) { dstore.feedDrive(GeoMath.offset(t1, meters: s, bearing: 0), now: 1100 + s); last = dstore.driveYds }
    ok(last != nil && near(Double(last!), 219, 3), "store Est. Drive ~219 y (\(String(describing: last)))")
    dstore.goTo(hole: 2)
    dstore.feedDrive(t1, now: 2000)
    ok(dstore.driveYds == nil, "a new hole starts the drive over")
}
// the map frame leaves room for the HUD at the bottom
if let f = MapFrame.fit([tee, mid], bearing: 0, width: 184, height: 224, pad: 20, padBottom: 84) {
    ok(f.screen(tee).y <= 224 - 83 && f.screen(mid).y >= 19, "fit with a bottom margin keeps the tee above the HUD (\(f.screen(tee).y))")
}
// v1943: colour-blind slope palette = the phone's exact numbers (gvSlopeImage _cbPal)
let cLvl = SlopeColor.rgb(cellZ: 10, pinZ: 12, cb: true), cUp = SlopeColor.rgb(cellZ: 0, pinZ: 45, cb: true), cDn = SlopeColor.rgb(cellZ: 45, pinZ: 0, cb: true)
func rgb255(_ c: (r: Double, g: Double, b: Double)) -> [Int] { [Int((c.r * 255).rounded()), Int((c.g * 255).rounded()), Int((c.b * 255).rounded())] }
ok(rgb255(cLvl) == [232, 232, 232], "cb level = light gray")
ok(rgb255(cUp) == [240, 90, 0], "cb up = orange (\(rgb255(cUp)))")
ok(rgb255(cDn) == [0, 80, 240], "cb down = blue (\(rgb255(cDn)))")
ok(rgb255(SlopeColor.rgb(cellZ: 10, pinZ: 12)) == [46, 184, 92], "default palette unchanged (green level)")
// v1943: the hand-off's cb flag, and a round cached before v1943 (no cb key) still decodes
ok(RoundParser.gps(["cb": true]).cb == true && RoundParser.gps([:]).cb == false, "gps.cb parsed (default off)")
do {
    let gi = RoundParser.gps(["cb": true])
    var obj = try JSONSerialization.jsonObject(with: JSONEncoder().encode(gi)) as! [String: Any]
    obj.removeValue(forKey: "cb")
    let old = try JSONDecoder().decode(GpsInfo.self, from: JSONSerialization.data(withJSONObject: obj))
    ok(old.cb == nil, "pre-v1943 cached GpsInfo decodes (cb absent)")
} catch { ok(false, "pre-v1943 cached GpsInfo decodes: \(error)") }
print("  \(pass) passed, \(fail) failed")
exit(fail == 0 ? 0 : 1)
