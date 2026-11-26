import UIKit
import Capacitor

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        if let shortcut = connectionOptions.shortcutItem {
            _ = openHomeShortcut(shortcut)
        }
        for context in connectionOptions.urlContexts {
            openURL(context)
        }
        for activity in connectionOptions.userActivities {
            self.scene(scene, continue: activity)
        }
    }

    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem,
                     completionHandler: @escaping (Bool) -> Void) {
        completionHandler(openHomeShortcut(shortcutItem))
    }

    private func openHomeShortcut(_ shortcut: UIApplicationShortcutItem) -> Bool {
        let path: String
        switch shortcut.type {
        case "widgets": path = "/huong-dan?phan=ung-dung#widget-man-hinh-chinh"
        case "scriptures": path = "/kinh-sach"
        case "practice": path = "/tu-tap"
        case "talks": path = "/phap-thoai"
        default: return false
        }
        guard let url = URL(string: "vn.quangtu.tutam://\(path)") else { return false }
        return ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            openURL(context)
        }
    }

    private func openURL(_ context: UIOpenURLContext) {
        var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
        options[.sourceApplication] = context.options.sourceApplication
        options[.annotation] = context.options.annotation
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: options)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity,
                                                       restorationHandler: { _ in })
    }
}
