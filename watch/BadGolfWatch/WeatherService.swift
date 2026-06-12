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
        if let p = p { if let e = await elevation(p) { self.playerElevationM = e } }
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
