// Linux-only stubs so the watch's model / parser / store logic can be type-checked.
import Foundation
struct CLLocation { init(latitude: Double, longitude: Double) {} }
protocol ObservableObject: AnyObject {}
final class StubWillChange { func send() {} }
extension ObservableObject { var objectWillChange: StubWillChange { StubWillChange() } }
@propertyWrapper struct Published<V> { var wrappedValue: V; init(wrappedValue: V) { self.wrappedValue = wrappedValue } }
final class WatchConnectivityManager {
    static let shared = WatchConnectivityManager()
    func requestRound() {}
    static var ack = true
    static var lastCells: [CellEdit] = []
    static var lastScores: [Int: HoleScore] = [:]
    static var actions: [String] = []
    func sendScores(roundId: String, scores: [Int: HoleScore], cells: [CellEdit] = [], completion: @escaping (Bool) -> Void) {
        WatchConnectivityManager.lastCells = cells; WatchConnectivityManager.lastScores = scores; completion(WatchConnectivityManager.ack)
    }
    static var lastExtra: [String: Any] = [:]
    func sendAction(_ action: String, roundId: String, extra: [String: Any] = [:], completion: @escaping (Bool) -> Void) { WatchConnectivityManager.actions.append(action + ":" + roundId); WatchConnectivityManager.lastExtra = extra; completion(WatchConnectivityManager.ack) }
}
final class WorkoutSessionManager { static let shared = WorkoutSessionManager(); func stop() {} }
