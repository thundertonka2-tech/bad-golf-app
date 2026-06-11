// Bad Golf Watch — Session/identity store
// Holds the Supabase access token + player id shared from the phone.
// Persisted in the shared App Group so it survives relaunch and is reachable
// by both phone and watch. (For higher security you can move the token to a
// shared Keychain access group — see the iOS-companion notes.)

import Foundation

final class SessionStore {
    static let shared = SessionStore()

    // Use the App Group so phone & watch share it. Falls back to standard.
    private let defaults = UserDefaults(suiteName: "group.com.simplisticfishing.badgolf")
        ?? .standard

    private init() {}

    var accessToken: String? {
        get { defaults.string(forKey: "bg_access_token") }
        set { defaults.set(newValue, forKey: "bg_access_token") }
    }
    var playerId: String? {
        get { defaults.string(forKey: "bg_player_id") }
        set { defaults.set(newValue, forKey: "bg_player_id") }
    }
    var displayName: String? {
        get { defaults.string(forKey: "bg_display_name") }
        set { defaults.set(newValue, forKey: "bg_display_name") }
    }

    var isSignedIn: Bool { (accessToken?.isEmpty == false) }

    func clear() {
        accessToken = nil; playerId = nil; displayName = nil
    }
}
