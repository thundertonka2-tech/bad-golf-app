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
print("  \(pass) passed, \(fail) failed")
exit(fail == 0 ? 0 : 1)
