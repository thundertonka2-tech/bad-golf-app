import UIKit
import Capacitor

// 2026-11-19 (Xcode 27 test build): an app built with the iOS 27 SDK is terminated at launch
// unless it uses the scene-based life cycle ("UIScene life cycle is required for apps built
// with this SDK" - the TestFlight build crashed the moment it was opened). This file plus the
// UIApplicationSceneManifest entry in Info.plist is that adoption. Both are added at build
// time by ios-config/add_scene_delegate.rb, and only when the build runs on Xcode 27 or later,
// so the Xcode 26 release build is byte-for-byte what it was.
//
// The window still comes from Main.storyboard (the Capacitor bridge view controller), now
// through the scene manifest. Once scenes are on, iOS stops calling the AppDelegate's
// open-URL and continue-activity methods, so they are forwarded from here to the same
// Capacitor proxy the AppDelegate used - invite links and Google / Apple sign-in returns
// keep arriving in the web app exactly as before.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard scene is UIWindowScene else { return }
        // Plugins that still read UIApplication.shared.delegate?.window keep finding it.
        mirrorWindow()
        DispatchQueue.main.async { [weak self] in self?.mirrorWindow() }
        // A cold start from a link or a universal link arrives here, not in a later callback.
        if !connectionOptions.urlContexts.isEmpty {
            self.scene(scene, openURLContexts: connectionOptions.urlContexts)
        }
        for activity in connectionOptions.userActivities {
            self.scene(scene, continue: activity)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
            if let source = context.options.sourceApplication { options[.sourceApplication] = source }
            if let annotation = context.options.annotation { options[.annotation] = annotation }
            options[.openInPlace] = context.options.openInPlace
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: options)
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }

    private func mirrorWindow() {
        if let window = self.window, let appDelegate = UIApplication.shared.delegate as? AppDelegate {
            appDelegate.window = window
        }
    }
}
