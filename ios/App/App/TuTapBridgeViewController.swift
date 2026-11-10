import Capacitor
import AuthenticationServices
#if DEBUG
import WebKit

private final class TuTapQAEventsHandler: NSObject, WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "tutamQAEvents", message.frameInfo.isMainFrame,
              let body = message.body as? String, body.utf8.count <= 4096 else { return }
        NSLog("[TutamQA] %@", body)
        appendEvent(body)
    }

    private func appendEvent(_ body: String) {
        // JSON serialization keeps one physical line per sanitized script event.
        guard let input = body.data(using: .utf8),
              let event = try? JSONSerialization.jsonObject(with: input) as? [String: Any],
              let serialized = try? JSONSerialization.data(withJSONObject: event, options: [.sortedKeys]),
              let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return }
        let url = caches.appendingPathComponent("tutam-qa-events.jsonl")
        var line = serialized
        line.append(0x0A)
        let limit: UInt64 = 256 * 1024
        do {
            try FileManager.default.createDirectory(at: caches, withIntermediateDirectories: true)
            if !FileManager.default.fileExists(atPath: url.path) {
                guard FileManager.default.createFile(atPath: url.path, contents: nil) else { return }
            }
            let handle = try FileHandle(forWritingTo: url)
            defer { try? handle.close() }
            let size = try handle.seekToEnd()
            // Preserve earlier evidence across relaunches; never truncate or rotate at the cap.
            guard size <= limit, UInt64(line.count) <= limit - size else { return }
            try handle.write(contentsOf: line)
        } catch {
            // Diagnostic storage failures must not affect app interaction or auth.
        }
    }
}
#endif

@objc(TuTapBridgeViewController)
class TuTapBridgeViewController: CAPBridgeViewController {
#if DEBUG
    private var qaEventsInstalled = false
#endif

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(DharmaAudioPlugin.shared)
        bridge?.registerPluginInstance(ReaderSpeechPlugin())
        bridge?.registerPluginInstance(BuddhistCalendarWidgetPlugin())
        bridge?.registerPluginInstance(PracticeWidgetPlugin())
        bridge?.registerPluginInstance(FacebookBrowserAuthPlugin())
#if DEBUG
        installQAEventsIfRequested()
#endif
    }

#if DEBUG
    private func installQAEventsIfRequested() {
        guard !qaEventsInstalled, ProcessInfo.processInfo.arguments.contains("-tutam-qa-events"),
              let webView = webView else { return }
        qaEventsInstalled = true
        webView.configuration.userContentController.add(TuTapQAEventsHandler(), name: "tutamQAEvents")
        let source = """
        (() => {
          const log = (detail) => {
            const body = JSON.stringify(detail);
            const handler = window.webkit?.messageHandlers?.tutamQAEvents;
            if (handler) handler.postMessage(body);
            else console.info('[TutamQA]', body);
          };
          const context = () => ({ path: location.pathname, readyState: document.readyState, time: performance.now() });
          const describe = (event) => {
            const origin = event.target instanceof Element ? event.target : null;
            const target = origin?.closest('a,button,select,input');
            if (!target) return null;
            const detail = { ...context(), type: event.type, tag: target.tagName, defaultPrevented: event.defaultPrevented };
            if (target.id) detail.id = target.id.slice(0, 80);
            const label = target.getAttribute('aria-label');
            if (label) detail.label = label.slice(0, 80);
            else if (target.tagName === 'BUTTON') detail.buttonText = (target.textContent || '').trim().slice(0, 80);
            if (target.tagName === 'A') {
              try { detail.anchorPath = new URL(target.getAttribute('href') || '', location.href).pathname; } catch {}
            }
            const point = event.changedTouches?.[0] || event;
            if (typeof point.clientX === 'number' && typeof point.clientY === 'number') {
              detail.x = point.clientX; detail.y = point.clientY;
            }
            return detail;
          };
          for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click', 'mouseover']) {
            for (const capture of [true, false]) {
              window.addEventListener(type, (event) => {
                const detail = describe(event);
                if (!detail) return;
                log({ ...detail, phase: capture ? 'capture' : 'bubble' });
                if (type === 'click' && capture) queueMicrotask(() => {
                  log({ ...detail, ...context(), phase: 'final', defaultPrevented: event.defaultPrevented });
                });
              }, { capture, passive: true });
            }
          }
          let previousPath = location.pathname;
          new MutationObserver(() => {
            if (location.pathname !== previousPath) {
              previousPath = location.pathname;
              log({ ...context(), type: 'pathname-change' });
            }
          }).observe(document, { childList: true, subtree: true });
          window.addEventListener('error', (event) => {
            const names = ['Error', 'TypeError', 'SyntaxError', 'ReferenceError', 'RangeError', 'URIError', 'EvalError'];
            const name = event.error?.name;
            // Never include error messages, stacks, source URLs, or rejected values.
            log({ ...context(), type: 'error', kind: names.includes(name) ? name : 'resource-or-module-error' });
          }, { capture: true, passive: true });
          log({ ...context(), type: 'installed' });
        })();
        """
        webView.configuration.userContentController.addUserScript(WKUserScript(
            source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true
        ))
    }
#endif
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
                  let anchor = self.bridge?.viewController?.view.window else {
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
