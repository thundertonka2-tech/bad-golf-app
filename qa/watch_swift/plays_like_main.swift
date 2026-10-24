var pass = 0, fail = 0
func ok(_ c: Bool, _ m: String) { if c { pass += 1 } else { fail += 1; print("  FAIL: " + m) } }
let p = CLLocationCoordinate2D(latitude: 32.7225, longitude: -96.7916), g = CLLocationCoordinate2D(latitude: 32.7226, longitude: -96.7916)
// Kevin, Cedar Crest #14: 3 yds out, stale player height 3 m above the green
let k = Geo.playsLike(center: 3, player: p, green: g, playerElevationM: 150, greenElevationM: 147, windMph: 6, windDirFromDeg: 180, tempF: 64)
ok(k == 3, "3 yds plays 3, not 0 (got \(String(describing: k)))")
ok(Geo.playsLike(center: 29, player: p, green: g, playerElevationM: 150, greenElevationM: 140, windMph: nil, windDirFromDeg: nil, tempF: nil)! >= 28, "no slope inside 30 yds")
let far = Geo.playsLike(center: 150, player: p, green: g, playerElevationM: 140, greenElevationM: 150, windMph: nil, windDirFromDeg: nil, tempF: nil)!
ok(far >= 158 && far <= 161, "slope still counts at 150 yds: 10 m up ≈ +11 (got \(far))")
ok(Geo.playsLike(center: 40, player: p, green: g, playerElevationM: 200, greenElevationM: 120, windMph: nil, windDirFromDeg: nil, tempF: nil)! == 1, "never below 1")
print("  \(pass) passed, \(fail) failed")
