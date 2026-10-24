// Bad Golf Watch — Weather + elevation (Open-Meteo, no API key)
// Feeds the "plays-like" math and the wind indicator. Battery-aware: we only
// refresh on hole change (new green coord) or after a few minutes, never on a
// tight timer. All requests are plain async URLSession, guarded and best-effort.

import Foundation
import CoreLocation
import Combine

@MainActor
final class WeatherService: ObservableObject {
    // Current conditions (nil until first successful fetch).
    @Published var windMph: Double?
    @Published var windDirFrom: Double?     // degrees the wind blows FROM
    @Published var tempF: Double?

    // Elevations in meters above sea level.
    @Published var greenElevationM: Double?
    @Published var playerElevationM: Double?
    /// v1943: WHERE playerElevationM was measured. It used to be fetched only on a hole change,
    /// so mid-hole it was the height of wherever you stood then (often the last green) - Kevin
    /// stood 3 yds from the pin on Cedar Crest #14 and the watch said "plays 0".
    private(set) var playerElevationAt: CLLocationCoordinate2D?
    private var lastPlayerFetch: Date = .distantPast

    private var lastFetch: Date = .distantPast
    private var lastKey: String = ""        // rounded green coord we fetched for
    private let minInterval: TimeInterval = 180   // 3 min throttle

    /// Refresh for the current hole. `green` drives weather + green elevation;
    /// `player` (optional) adds the player-point elevation for slope. Skips work
    /// if we fetched the same green recently.
    func refresh(green: CLLocationCoordinate2D?, player: CLLocationCoordinate2D?) {
        guard let g = green else { return }
        let key = String(format: "%.4f,%.4f", g.latitude, g.longitude)
        let now = Date()
        let fresh = (now.timeIntervalSince(lastFetch) < minInterval) && (key == lastKey)
        guard !fresh else { return }
        lastFetch = now
        lastKey = key

        Task { await fetchWeather(g) }
        Task { await fetchElevation(g, player) }
    }

    // MARK: Open-Meteo current wind + temperature
    private func fetchWeather(_ g: CLLocationCoordinate2D) async {
        var c = URLComponents(string: "https://api.open-meteo.com/v1/forecast")
        c?.queryItems = [
            .init(name: "latitude", value: String(g.latitude)),
            .init(name: "longitude", value: String(g.longitude)),
            .init(name: "current", value: "wind_speed_10m,wind_direction_10m,temperature_2m"),
            .init(name: "wind_speed_unit", value: "mph"),
            .init(name: "temperature_unit", value: "fahrenheit")
        ]
        guard let url = c?.url else { return }
        guard let (data, resp) = try? await URLSession.shared.data(from: url),
              let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode) else { return }
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let cur = obj["current"] as? [String: Any] else { return }
        if let w = num(cur["wind_speed_10m"])     { self.windMph = w }
        if let d = num(cur["wind_direction_10m"]) { self.windDirFrom = d }
        if let t = num(cur["temperature_2m"])     { self.tempF = t }
    }

    // MARK: Open-Meteo elevation (green point, and player point if given)
    private func fetchElevation(_ g: CLLocationCoordinate2D, _ p: CLLocationCoordinate2D?) async {
        // Green
        if let e = await elevation(g) { self.greenElevationM = e }
        // Player (if available and meaningfully different from the green)
        if let p = p { if let e = await elevation(p) { self.playerElevationM = e; self.playerElevationAt = p; self.lastPlayerFetch = Date() } }
    }

    /// v1943: re-measure the player's height as they walk - once they are 25 m from where it was
    /// last measured, at most every 20 s (one tiny request, a dozen or so per hole).
    func refreshPlayer(_ p: CLLocationCoordinate2D?) {
        guard let p = p else { return }
        if let at = playerElevationAt, Self.meters(at, p) < 25 { return }
        guard Date().timeIntervalSince(lastPlayerFetch) >= 20 else { return }
        lastPlayerFetch = Date()
        Task {
            if let e = await elevation(p) { self.playerElevationM = e; self.playerElevationAt = p }
        }
    }

    /// v1943: the player's height only if it was measured within 30 m of where they stand now;
    /// otherwise nil, so plays-as leaves slope out rather than use a stale height.
    func playerElevation(near p: CLLocationCoordinate2D?) -> Double? {
        guard let p = p, let at = playerElevationAt, let e = playerElevationM, Self.meters(at, p) <= 30 else { return nil }
        return e
    }

    private static func meters(_ a: CLLocationCoordinate2D, _ b: CLLocationCoordinate2D) -> Double {
        CLLocation(latitude: a.latitude, longitude: a.longitude).distance(from: CLLocation(latitude: b.latitude, longitude: b.longitude))
    }

    private func elevation(_ coord: CLLocationCoordinate2D) async -> Double? {
        var c = URLComponents(string: "https://api.open-meteo.com/v1/elevation")
        c?.queryItems = [
            .init(name: "latitude", value: String(coord.latitude)),
            .init(name: "longitude", value: String(coord.longitude))
        ]
        guard let url = c?.url else { return nil }
        guard let (data, resp) = try? await URLSession.shared.data(from: url),
              let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode) else { return nil }
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        // API returns { "elevation": [123.0] }
        if let arr = obj["elevation"] as? [Any], let first = arr.first { return num(first) }
        return num(obj["elevation"])
    }

    private func num(_ any: Any?) -> Double? {
        if let d = any as? Double { return d }
        if let n = any as? NSNumber { return n.doubleValue }
        if let s = any as? String { return Double(s) }
        return nil
    }
}
