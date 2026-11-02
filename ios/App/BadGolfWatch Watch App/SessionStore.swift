// Bad Golf Watch — Session/identity store
// Holds the Supabase access token + player id shared from the phone.
// Persisted in the shared App Group so it survives relaunch and is reachable
// by both phone and watch. (For higher security you can move the token to a
// shared Keychain access group — see the iOS-companion notes.)

import Foundation
import Security

// v2000 (audit UX-8): the login token lives in the watch Keychain, not in plain UserDefaults
// (which ends up unencrypted in device backups). The project has no App Group entitlement, so
// the "shared" suite was only ever this device's own defaults anyway. An old token found in
// defaults is moved into the Keychain on first read and removed from defaults.
private enum WatchKeychain {
    static let service = "com.simplisticfishing.badgolf.watch.session"

    static func get(_ key: String) -> String? {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func set(_ key: String, _ value: String?) {
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(base as CFDictionary)
        guard let value = value, !value.isEmpty, let data = value.data(using: .utf8) else { return }
        var add = base
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }
}

final class SessionStore {
    static let shared = SessionStore()

    // Use the App Group so phone & watch share it. Falls back to standard.
    private let defaults = UserDefaults(suiteName: "group.com.simplisticfishing.badgolf")
        ?? .standard

    private init() {}

    var accessToken: String? {
        get {
            if let t = WatchKeychain.get("bg_access_token") { return t }
            // one-time move of a token saved by an older build
            if let old = defaults.string(forKey: "bg_access_token"), !old.isEmpty {
                WatchKeychain.set("bg_access_token", old)
                defaults.removeObject(forKey: "bg_access_token")
                return old
            }
            return nil
        }
        set {
            WatchKeychain.set("bg_access_token", newValue)
            defaults.removeObject(forKey: "bg_access_token")
        }
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
