import Capacitor
import AuthenticationServices

@objc(TuTapBridgeViewController)
class TuTapBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(DharmaAudioPlugin.shared)
        bridge?.registerPluginInstance(ReaderSpeechPlugin())
        bridge?.registerPluginInstance(BuddhistCalendarWidgetPlugin())
        bridge?.registerPluginInstance(PracticeWidgetPlugin())
        bridge?.registerPluginInstance(FacebookBrowserAuthPlugin())
    }
}

// Phiên xác thực hệ thống giữ cookie OAuth trong trình duyệt, không chuyển token về WebView.
@objc(FacebookBrowserAuthPlugin)
public class FacebookBrowserAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "FacebookBrowserAuthPlugin"
    public let jsName = "FacebookBrowserAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise)
    ]
    private var session: ASWebAuthenticationSession?
    private var pendingCall: CAPPluginCall?
    private var anchor: ASPresentationAnchor?

    @objc public func authenticate(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pendingCall == nil else { call.reject("Login already running", "BUSY"); return }
            guard let raw = call.getString("url"), let url = URL(string: raw),
                  let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
                  url.scheme == "https", url.user == nil, url.password == nil, url.port == nil,
                  ["quangtu.vn", "quangtu-web.quangtu-ansitoanthu.workers.dev"].contains(url.host ?? ""),
                  url.path == "/api/auth/facebook/native", url.fragment == nil,
                  parts.queryItems?.count == 1, parts.queryItems?.first?.name == "challenge",
                  let challenge = parts.queryItems?.first?.value,
                  challenge.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil,
                  let anchor = self.bridge?.viewController.view.window else {
                call.reject("Invalid login request", "INVALID_REQUEST"); return
            }
            self.pendingCall = call
            self.anchor = anchor
            let authentication = ASWebAuthenticationSession(url: url, callbackURLScheme: "vn.quangtu.tutam") { [weak self] callback, error in
                DispatchQueue.main.async {
                    guard let self = self, self.pendingCall === call else { return }
                    self.pendingCall = nil
                    self.session = nil
                    self.anchor = nil
                    if let error = error as NSError? {
                        if error.domain == ASWebAuthenticationSessionErrorDomain &&
                            error.code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                            call.reject("Login cancelled", "CANCELLED")
                        } else {
                            call.reject("Unable to complete browser login", "UNAVAILABLE")
                        }
                        return
                    }
                    guard let callback = callback,
                          let value = URLComponents(url: callback, resolvingAgainstBaseURL: false),
                          value.scheme == "vn.quangtu.tutam", value.host == "auth", value.path == "/facebook",
                          value.user == nil, value.password == nil, value.port == nil, value.fragment == nil,
                          value.queryItems?.count == 1 else {
                        call.reject("Invalid login callback", "INVALID_CALLBACK"); return
                    }
                    if value.queryItems?.first?.name == "error", value.queryItems?.first?.value == "cancelled" {
                        call.reject("Login cancelled", "CANCELLED"); return
                    }
                    guard value.queryItems?.first?.name == "code",
                          let code = value.queryItems?.first?.value,
                          code.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else {
                        call.reject("Invalid login callback", "INVALID_CALLBACK"); return
                    }
                    call.resolve(["url": callback.absoluteString])
                }
            }
            authentication.presentationContextProvider = self
            // Do not reuse the previous Facebook account from Safari after app logout.
            authentication.prefersEphemeralWebBrowserSession = true
            self.session = authentication
            if !authentication.start() {
                self.session = nil; self.pendingCall = nil; self.anchor = nil
                call.reject("Unable to start browser login", "UNAVAILABLE")
            }
        }
    }

    @objc public func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let pending = self.pendingCall
            self.pendingCall = nil
            self.session?.cancel(); self.session = nil
            self.anchor = nil
            pending?.reject("Login cancelled", "CANCELLED")
            call.resolve()
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return anchor ?? ASPresentationAnchor()
    }
}
