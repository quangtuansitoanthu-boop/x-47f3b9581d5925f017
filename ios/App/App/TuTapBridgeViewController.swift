import UIKit
import Capacitor
import WebKit
#if DEBUG
import CoreFoundation

private enum TuTapQANativeStartupPhase: String, Encodable, Sendable {
    case configurationBefore = "configuration.before"
    case configurationAfter = "configuration.after"
    case capacitorEntry = "capacitorDidLoad.entry"
    case dharmaAudioReturned = "plugin.DharmaAudio.returned"
    case readerSpeechReturned = "plugin.ReaderSpeech.returned"
    case practiceHapticsReturned = "plugin.PracticeHaptics.returned"
    case appSystemBarsReturned = "plugin.AppSystemBars.returned"
    case buddhistCalendarWidgetReturned = "plugin.BuddhistCalendarWidget.returned"
    case practiceWidgetReturned = "plugin.PracticeWidget.returned"
    case externalLinksReturned = "plugin.ExternalLinks.returned"
    case imageExportReturned = "plugin.ImageExport.returned"
    case qaInstallBefore = "qa.install.before"
    case qaInstallAfter = "qa.install.after"
    case capacitorExit = "capacitorDidLoad.exit"
    case viewDidLoadBeforeSuper = "viewDidLoad.beforeSuper"
    case viewDidLoadAfterSuper = "viewDidLoad.afterSuper"
}

private struct TuTapQANativeStartupEvent: Encodable, Sendable {
    let type = "native-startup"
    let phase: TuTapQANativeStartupPhase
    let pid: Int
    let uptime: TimeInterval
    let hasBridge: Bool
    let hasWebView: Bool
    let isLoading: Bool
    let hasURL: Bool
}

private struct TuTapQANotificationSDKEvent: Encodable, Sendable {
    let type = "native-notification-sdk"
    let phase: String
    let pid: Int
    let uptime: TimeInterval
    let status: Int
    let domain: String
    let errorCode: Int
}

private struct TuTapQANavigationEvent: Encodable, Sendable {
    let type = "native-navigation"
    let phase: String
    let pid: Int
    let uptime: TimeInterval
    let schemeClass: String
    let pathClass: String
    let domain: String
    let errorCode: Int
}

private final class TuTapQAEventsHandler: NSObject, WKScriptMessageHandler {
    private let eventsQueue = DispatchQueue(label: "vn.quangtu.tutam.qa-events", qos: .utility)

    private func diagnosticInteger(_ value: Any?) -> Int? {
        guard let number = value as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID(),
              ["c", "s", "i", "l", "q", "C", "S", "I", "L", "Q"].contains(String(cString: number.objCType)) else { return nil }
        return Int(number.stringValue)
    }

    private func diagnosticUptime(_ value: Any?) -> Double? {
        guard let number = value as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID(),
              ["f", "d"].contains(String(cString: number.objCType)),
              number.doubleValue.isFinite, number.doubleValue >= 0 else { return nil }
        return number.doubleValue
    }

    func recordNativeDiagnostic(_ payload: [AnyHashable: Any]?) {
        guard ProcessInfo.processInfo.arguments.contains("-tutam-qa-events"), let payload,
              let type = payload["type"] as? String, let phase = payload["phase"] as? String,
              let domain = payload["domain"] as? String,
              let pid = diagnosticInteger(payload["pid"]), pid > 0,
              let uptime = diagnosticUptime(payload["uptime"]),
              let code = diagnosticInteger(payload["errorCode"]), (-999999...999999).contains(code) else { return }
        let keys = Set(payload.keys.compactMap { $0 as? String })
        guard keys.count == payload.count else { return }
        if type == "native-notification-sdk" {
            guard keys == Set(["type", "phase", "pid", "uptime", "status", "domain", "errorCode"]),
                  ["check_entry", "check_settings_callback", "check_resolve", "schedule_entry",
                   "schedule_invalid_batch", "schedule_invalid_id", "schedule_content_reject",
                   "schedule_past_reject", "schedule_trigger_reject", "schedule_pending_start",
                   "schedule_pending_callback", "schedule_add_error", "schedule_callbacks_complete",
                   "schedule_restore_error", "schedule_rollback_expired", "schedule_rollback_reject",
                   "schedule_rollback_incomplete", "schedule_reject", "schedule_resolve"].contains(phase),
                  ["UNErrorDomain", "NSCocoaErrorDomain", "NSPOSIXErrorDomain", "NSURLErrorDomain",
                   "TuTapLocalNotifications", "other", "none"].contains(domain),
                  let status = diagnosticInteger(payload["status"]), (-1...4).contains(status) else { return }
            queueNativeDiagnostic(TuTapQANotificationSDKEvent(phase: phase, pid: pid, uptime: uptime,
                                                            status: status, domain: domain, errorCode: code))
        } else if type == "native-navigation" {
            guard keys == Set(["type", "phase", "pid", "uptime", "schemeClass", "pathClass", "domain", "errorCode"]),
                  ["didStart", "didCommit", "didFinish", "didFail", "didFailProvisional", "processTerminate"].contains(phase),
                  ["none", "WKErrorDomain", "NSURLErrorDomain", "NSCocoaErrorDomain", "NSPOSIXErrorDomain", "other"].contains(domain),
                  let scheme = payload["schemeClass"] as? String,
                  ["capacitor", "file", "http", "https", "other", "none"].contains(scheme),
                  let path = payload["pathClass"] as? String,
                  ["root", "copy", "other", "none"].contains(path) else { return }
            queueNativeDiagnostic(TuTapQANavigationEvent(phase: phase, pid: pid, uptime: uptime,
                                                       schemeClass: scheme, pathClass: path, domain: domain, errorCode: code))
        }
    }

    private func queueNativeDiagnostic<Event: Encodable & Sendable>(_ event: Event) {
        eventsQueue.async {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            guard let data = try? encoder.encode(event),
                  let serialized = String(data: data, encoding: .utf8) else { return }
            self.appendEvent(serialized)
        }
    }

    func recordNativeStartup(_ event: TuTapQANativeStartupEvent) {
        eventsQueue.async {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            guard let data = try? encoder.encode(event),
                  let serialized = String(data: data, encoding: .utf8) else { return }
            NSLog("[TutamQA] %@", serialized)
            self.appendEvent(serialized)
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "tutamQAEvents", message.frameInfo.isMainFrame,
              let body = message.body as? String, body.utf8.count <= 4096 else { return }
        // UIKit reads stay on the main callback; only primitive values cross to the I/O queue.
        var footerState: [String: Double]? = nil
        var footerEvent: String? = nil
        if Thread.isMainThread, let data = body.data(using: .utf8),
           let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           event["phase"] as? String == "capture", event["footer"] as? Bool == true,
           let eventType = event["type"] as? String,
           ["pointerdown", "pointerup", "pointercancel"].contains(eventType),
           let anchorPath = event["anchorPath"] as? String,
           ["/", "/kinh-sach", "/tu-tap", "/phap-thoai", "/ca-nhan"].contains(anchorPath),
           let webView = message.webView {
            let scroll = webView.scrollView
            let pan = scroll.panGestureRecognizer
            let translation = pan.translation(in: webView)
            let velocity = pan.velocity(in: webView)
            footerEvent = eventType
            footerState = [
                "sourceTime": (event["time"] as? NSNumber)?.doubleValue ?? -1,
                "panState": Double(pan.state.rawValue),
                "translationX": Double(translation.x), "translationY": Double(translation.y),
                "velocityX": Double(velocity.x), "velocityY": Double(velocity.y),
                "offsetX": Double(scroll.contentOffset.x), "offsetY": Double(scroll.contentOffset.y),
                "isDragging": scroll.isDragging ? 1 : 0,
                "isDecelerating": scroll.isDecelerating ? 1 : 0
            ]
        }
        let capturedFooterState = footerState
        let capturedFooterEvent = footerEvent
        // Diagnostic disk/console I/O must not stall UIKit touch delivery.
        eventsQueue.async {
            NSLog("[TutamQA] %@", body)
            self.appendEvent(body)
            if let state = capturedFooterState, let sourceType = capturedFooterEvent {
                let record: [String: Any] = ["type": "native-footer-state", "sourceType": sourceType, "state": state]
                if let data = try? JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]),
                   let serialized = String(data: data, encoding: .utf8) {
                    self.appendEvent(serialized)
                }
            }
        }
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
    private var qaEventsHandler: TuTapQAEventsHandler?
    private var qaNativeDiagnosticObserver: NSObjectProtocol?
#endif

    override func capacitorDidLoad() {
#if DEBUG
        recordNativeStartup(.capacitorEntry)
#endif
        webView?.scrollView.pinchGestureRecognizer?.isEnabled = false
        webView?.scrollView.showsHorizontalScrollIndicator = false
        bridge?.registerPluginInstance(DharmaAudioPlugin.shared)
#if DEBUG
        recordNativeStartup(.dharmaAudioReturned)
#endif
        bridge?.registerPluginInstance(ReaderSpeechPlugin())
#if DEBUG
        recordNativeStartup(.readerSpeechReturned)
#endif
        bridge?.registerPluginInstance(PracticeHapticsPlugin())
#if DEBUG
        recordNativeStartup(.practiceHapticsReturned)
#endif
        bridge?.registerPluginInstance(AppSystemBarsPlugin())
#if DEBUG
        recordNativeStartup(.appSystemBarsReturned)
#endif
        bridge?.registerPluginInstance(BuddhistCalendarWidgetPlugin())
#if DEBUG
        recordNativeStartup(.buddhistCalendarWidgetReturned)
#endif
        bridge?.registerPluginInstance(PracticeWidgetPlugin())
#if DEBUG
        recordNativeStartup(.practiceWidgetReturned)
#endif
        bridge?.registerPluginInstance(ExternalLinksPlugin())
#if DEBUG
        recordNativeStartup(.externalLinksReturned)
#endif
        bridge?.registerPluginInstance(ImageExportPlugin())
        bridge?.registerPluginInstance(ScreenWakeLockPlugin())
#if DEBUG
        recordNativeStartup(.imageExportReturned)
        recordNativeStartup(.qaInstallBefore)
        installQAEventsIfRequested()
        recordNativeStartup(.qaInstallAfter)
        recordNativeStartup(.capacitorExit)
#endif
    }

#if DEBUG
    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        recordNativeStartup(.configurationBefore)
        let configuration = super.webViewConfiguration(for: instanceConfiguration)
        recordNativeStartup(.configurationAfter)
        return configuration
    }

    override func viewDidLoad() {
        recordNativeStartup(.viewDidLoadBeforeSuper)
        super.viewDidLoad()
        recordNativeStartup(.viewDidLoadAfterSuper)
    }

    private func qaEventsHandlerIfRequested() -> TuTapQAEventsHandler? {
        guard ProcessInfo.processInfo.arguments.contains("-tutam-qa-events") else { return nil }
        if let handler = qaEventsHandler { return handler }
        let handler = TuTapQAEventsHandler()
        qaEventsHandler = handler
        qaNativeDiagnosticObserver = NotificationCenter.default.addObserver(
            forName: Notification.Name("TuTapQANativeDiagnostic"), object: nil, queue: nil
        ) { [weak self] notification in
            self?.qaEventsHandler?.recordNativeDiagnostic(notification.userInfo)
        }
        return handler
    }

    deinit {
        if let observer = qaNativeDiagnosticObserver { NotificationCenter.default.removeObserver(observer) }
    }

    private func recordNativeStartup(_ phase: TuTapQANativeStartupPhase) {
        guard let handler = qaEventsHandlerIfRequested() else { return }
        let process = ProcessInfo.processInfo
        let event = TuTapQANativeStartupEvent(phase: phase, pid: Int(process.processIdentifier),
                                            uptime: process.systemUptime, hasBridge: bridge != nil,
                                            hasWebView: webView != nil, isLoading: webView?.isLoading ?? false,
                                            hasURL: webView?.url != nil)
        handler.recordNativeStartup(event)
    }

    private func installQAEventsIfRequested() {
        guard !qaEventsInstalled, let handler = qaEventsHandlerIfRequested(),
              let webView = webView else { return }
        qaEventsInstalled = true
        webView.configuration.userContentController.add(handler, name: "tutamQAEvents")
        let source = """
        (() => {
          const log = (detail) => {
            const body = JSON.stringify(detail);
            const handler = window.webkit?.messageHandlers?.tutamQAEvents;
            if (handler) handler.postMessage(body);
            else console.info('[TutamQA]', body);
          };
          const context = () => ({ path: location.pathname, readyState: document.readyState, time: performance.now(), activeTag: document.activeElement?.tagName || null, activeSelect: document.activeElement instanceof HTMLSelectElement });
          const describe = (event) => {
            const origin = event.target instanceof Element ? event.target : event.target?.parentElement;
            const target = origin?.closest('a,button,select,input');
            const detail = { ...context(), type: event.type, tag: target?.tagName || origin?.tagName || 'NON_ELEMENT', defaultPrevented: event.defaultPrevented };
            if (target?.closest('.qts-bottom-nav')) detail.footer = true;
            detail.cancelable = event.cancelable;
            if (typeof event.pointerId === 'number') detail.pointerId = event.pointerId;
            if (target?.id) detail.id = target.id.slice(0, 80);
            const label = target?.getAttribute('aria-label');
            if (label) detail.label = label.slice(0, 80);
            else if (target?.tagName === 'BUTTON') detail.buttonText = (target.textContent || '').trim().slice(0, 80);
            if (target?.tagName === 'A') {
              try { detail.anchorPath = new URL(target.getAttribute('href') || '', location.href).pathname; } catch {}
            }
            const point = event.changedTouches?.[0] || event;
            if (typeof point.identifier === 'number') detail.touchIdentifier = point.identifier;
            if (typeof point.clientX === 'number' && typeof point.clientY === 'number') {
              detail.x = point.clientX; detail.y = point.clientY;
            }
            return detail;
          };
          let footerContact = false;
          let footerMoveCount = 0;
          const numericRect = (rect) => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
          for (const type of ['pointermove', 'touchmove']) {
            window.addEventListener(type, (event) => {
              const origin = event.target instanceof Element ? event.target : event.target?.parentElement;
              const anchor = origin?.closest('.qts-bottom-nav a');
              if (!footerContact || !anchor || footerMoveCount >= 4) return;
              footerMoveCount += 1;
              const point = event.changedTouches?.[0] || event;
              const detail = { type, phase: 'capture', footer: true, time: performance.now(), x: point.clientX, y: point.clientY, cancelable: event.cancelable, defaultPrevented: event.defaultPrevented, sample: footerMoveCount };
              if (typeof event.pointerId === 'number') detail.pointerId = event.pointerId;
              if (typeof point.identifier === 'number') detail.touchIdentifier = point.identifier;
              log(detail);
            }, { capture: true, passive: true });
          }
          for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel', 'mousedown', 'mouseup', 'click', 'mouseover']) {
            for (const capture of [true, false]) {
              window.addEventListener(type, (event) => {
                const detail = describe(event);
                if (!detail) return;
                if (capture && detail.footer) {
                  if (type === 'pointerdown' || (type === 'touchstart' && !footerContact)) {
                    footerContact = true; footerMoveCount = 0;
                  }
                  if (type === 'pointercancel') {
                    const origin = event.target instanceof Element ? event.target : event.target?.parentElement;
                    const anchor = origin?.closest('.qts-bottom-nav a');
                    const footer = anchor?.closest('.qts-bottom-nav');
                    if (anchor && footer) {
                      detail.anchorRect = numericRect(anchor.getBoundingClientRect());
                      detail.footerRect = numericRect(footer.getBoundingClientRect());
                      detail.scrollX = window.scrollX; detail.scrollY = window.scrollY;
                      detail.scrollTop = document.scrollingElement?.scrollTop ?? 0;
                      const viewport = window.visualViewport;
                      if (viewport) detail.visualViewport = { offsetLeft: viewport.offsetLeft, offsetTop: viewport.offsetTop, pageLeft: viewport.pageLeft, pageTop: viewport.pageTop, width: viewport.width, height: viewport.height, scale: viewport.scale };
                    }
                  }
                  if (['pointerup', 'pointercancel', 'touchend', 'touchcancel'].includes(type)) footerContact = false;
                }
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

@objc(ImageExportPlugin)
public class ImageExportPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
    public let identifier = "ImageExportPlugin"
    public let jsName = "ImageExport"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareImage", returnType: CAPPluginReturnPromise)
    ]
    private let exportQueue = DispatchQueue(label: "vn.quangtu.tutam.image-export", qos: .userInitiated)
    private var pendingCall: CAPPluginCall?
    private var picker: UIDocumentPickerViewController?
    private var exportDirectory: URL?

    private func findTopViewController(from root: UIViewController?) -> UIViewController? {
        guard let root = root else { return nil }
        if let presented = root.presentedViewController, !presented.isBeingDismissed {
            return findTopViewController(from: presented)
        }
        return root
    }

    @objc public func saveImage(_ call: CAPPluginCall) {
        let maximumBytes = 8 * 1024 * 1024
        let signature: [UInt8] = [137, 80, 78, 71, 13, 10, 26, 10]
        guard let name = call.getString("fileName"), name.utf8.count <= 100,
              name.range(of: "\\A[A-Za-z0-9_-][A-Za-z0-9_.-]*\\.png\\z", options: .regularExpression) != nil,
              let encoded = call.getString("base64"), encoded.utf8.count <= ((maximumBytes + 2) / 3) * 4,
              let data = Data(base64Encoded: encoded), (signature.count...maximumBytes).contains(data.count),
              data.prefix(signature.count).elementsEqual(signature) else {
            call.reject("Invalid PNG image", "INVALID_IMAGE")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.reject("Image export closed", "SAVE_FAILED"); return }
            guard self.pendingCall == nil else { call.reject("Image export is already open", "EXPORT_BUSY"); return }
            guard let presenter = self.findTopViewController(from: self.bridge?.viewController),
                  presenter.viewIfLoaded?.window != nil,
                  !presenter.isBeingDismissed,
                  UIApplication.shared.applicationState != .background else {
                call.reject("Cannot open image destination", "SAVE_FAILED")
                return
            }
            self.pendingCall = call
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("tu-tap-export-" + UUID().uuidString, isDirectory: true)
            self.exportDirectory = directory
            let file = directory.appendingPathComponent(name)
            // Chuẩn bị ảnh ngoài main thread; chỉ trình bộ chọn sau khi file đã ghi xong.
            self.exportQueue.async { [weak self] in
                do {
                    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
                    try data.write(to: file, options: .atomic)
                } catch {
                    try? FileManager.default.removeItem(at: directory)
                    DispatchQueue.main.async { [weak self] in
                        guard let self = self, self.pendingCall === call else { return }
                        self.finishExport(saved: nil, error: error)
                    }
                    return
                }
                DispatchQueue.main.async { [weak self] in
                    guard let self = self, self.pendingCall === call else {
                        try? FileManager.default.removeItem(at: directory)
                        return
                    }
                    guard let presenter = self.findTopViewController(from: self.bridge?.viewController),
                          presenter.viewIfLoaded?.window != nil,
                          !presenter.isBeingDismissed,
                          UIApplication.shared.applicationState != .background else {
                        self.finishExport(saved: nil)
                        return
                    }
                    let picker = UIDocumentPickerViewController(forExporting: [file], asCopy: true)
                    picker.delegate = self
                    picker.presentationController?.delegate = self
                    self.picker = picker
                    presenter.present(picker, animated: true) { [weak self, weak picker] in
                        guard let self = self, let picker = picker, self.picker === picker else { return }
                        // UIKit chỉ hoàn tất quan hệ trình bày tại completion; không dọn file trong lúc mở picker.
                        guard picker.presentingViewController != nil else {
                            self.finishExport(saved: nil)
                            return
                        }
                        picker.presentationController?.delegate = self
                    }
                }
            }
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard controller === picker else { return }
        finishExport(saved: urls.isEmpty ? nil : true)
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        guard controller === picker else { return }
        finishExport(saved: false)
    }

    public func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        guard presentationController.presentedViewController === picker else { return }
        finishExport(saved: false)
    }

    private func finishExport(saved: Bool?, error: Error? = nil) {
        let call = pendingCall
        pendingCall = nil
        picker?.delegate = nil
        picker?.presentationController?.delegate = nil
        picker = nil
        if let directory = exportDirectory { try? FileManager.default.removeItem(at: directory) }
        exportDirectory = nil
        // Xóa owner trước callback để kết quả muộn không hoàn tất lượt xuất tiếp theo.
        if let saved = saved { call?.resolve(["saved": saved]) }
        else { call?.reject("Cannot save PNG image", "SAVE_FAILED", error) }
    }

    @objc public func shareImage(_ call: CAPPluginCall) {
        let maximumBytes = 8 * 1024 * 1024
        let signature: [UInt8] = [137, 80, 78, 71, 13, 10, 26, 10]
        guard let name = call.getString("fileName"), name.utf8.count <= 100,
              name.range(of: "\\A[A-Za-z0-9_-][A-Za-z0-9_.-]*\\.png\\z", options: .regularExpression) != nil,
              let encoded = call.getString("base64"), encoded.utf8.count <= ((maximumBytes + 2) / 3) * 4,
              let data = Data(base64Encoded: encoded), (signature.count...maximumBytes).contains(data.count),
              data.prefix(signature.count).elementsEqual(signature) else {
            call.reject("Invalid PNG image", "INVALID_IMAGE")
            return
        }
        let text = call.getString("text")
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.reject("Image export closed", "SHARE_FAILED"); return }
            guard let presenter = self.findTopViewController(from: self.bridge?.viewController),
                  presenter.viewIfLoaded?.window != nil,
                  !presenter.isBeingDismissed,
                  UIApplication.shared.applicationState != .background else {
                call.reject("Cannot open share sheet", "SHARE_FAILED")
                return
            }
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("tu-tap-share-" + UUID().uuidString, isDirectory: true)
            let file = directory.appendingPathComponent(name)
            self.exportQueue.async { [weak self] in
                do {
                    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
                    try data.write(to: file, options: .atomic)
                } catch {
                    try? FileManager.default.removeItem(at: directory)
                    DispatchQueue.main.async { call.reject("Cannot prepare PNG image", "SHARE_FAILED", error) }
                    return
                }
                DispatchQueue.main.async { [weak self] in
                    guard let self = self else {
                        try? FileManager.default.removeItem(at: directory)
                        call.reject("Image export closed", "SHARE_FAILED")
                        return
                    }
                    guard let presenter = self.findTopViewController(from: self.bridge?.viewController),
                          presenter.viewIfLoaded?.window != nil,
                          !presenter.isBeingDismissed,
                          UIApplication.shared.applicationState != .background else {
                        try? FileManager.default.removeItem(at: directory)
                        call.reject("Cannot open share sheet", "SHARE_FAILED")
                        return
                    }
                    var items: [Any] = [file]
                    if let text = text, !text.isEmpty { items.append(text) }
                    let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
                    if let popover = controller.popoverPresentationController {
                        popover.sourceView = presenter.view
                        popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 0, height: 0)
                        popover.permittedArrowDirections = []
                    }
                    controller.completionWithItemsHandler = { _, completed, _, _ in
                        try? FileManager.default.removeItem(at: directory)
                        call.resolve(["shared": completed])
                    }
                    presenter.present(controller, animated: true)
                }
            }
        }
    }

    deinit {
        if let directory = exportDirectory { try? FileManager.default.removeItem(at: directory) }
        pendingCall?.reject("Image export closed", "SAVE_FAILED")
    }
}

@objc(ScreenWakeLockPlugin)
public class ScreenWakeLockPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ScreenWakeLockPlugin"
    public let jsName = "ScreenWakeLock"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setKeepScreenOn", returnType: CAPPluginReturnPromise)
    ]

    @objc public func setKeepScreenOn(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled", false)
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = enabled
            call.resolve()
        }
    }
}

@objc(ExternalLinksPlugin)
public class ExternalLinksPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ExternalLinksPlugin"
    public let jsName = "ExternalLinks"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openBrowser", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openStore", returnType: CAPPluginReturnPromise)
    ]

    @objc public func openBrowser(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"),
              let url = URL(string: urlString),
              url.scheme == "https" else {
            call.reject("Invalid URL")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { call.resolve() }
                else { call.reject("Unable to open browser") }
            }
        }
    }

    @objc public func openStore(_ call: CAPPluginCall) {
        guard call.getString("url") == "https://apps.apple.com/app/id6829182305",
              let url = URL(string: "itms-apps://apps.apple.com/app/id6829182305") else {
            call.reject("Invalid App Store URL")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { call.resolve() }
                else { call.reject("Unable to open App Store") }
            }
        }
    }
}

@objc(PracticeHapticsPlugin)
public class PracticeHapticsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PracticeHapticsPlugin"
    public let jsName = "PracticeHaptics"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "rosaryBead", returnType: CAPPluginReturnPromise)]

    @MainActor private lazy var selection = UISelectionFeedbackGenerator()
    @MainActor private lazy var completion = UINotificationFeedbackGenerator()

    @objc public func rosaryBead(_ call: CAPPluginCall) {
        let completedCycle = call.getBool("completedCycle", false)
        DispatchQueue.main.async {
            if self.bridge?.webView?.window?.isKeyWindow == true,
               UIApplication.shared.applicationState == .active {
                if completedCycle {
                    self.completion.notificationOccurred(.success)
                } else {
                    self.selection.selectionChanged()
                }
                self.selection.prepare()
            }
            call.resolve()
        }
    }
}

// Keep the native bottom safe area in the same color as the active web surface.
@objc(AppSystemBarsPlugin)
public class AppSystemBarsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppSystemBarsPlugin"
    public let jsName = "AppSystemBars"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "setStyle", returnType: CAPPluginReturnPromise)]

    @objc public func setStyle(_ call: CAPPluginCall) {
        guard let hex = call.getString("backgroundColor"), hex.count == 7, hex.first == "#",
              let value = UInt32(hex.dropFirst(), radix: 16) else {
            call.reject("Invalid system bar background")
            return
        }
        let color = UIColor(red: CGFloat((value >> 16) & 255) / 255,
                            green: CGFloat((value >> 8) & 255) / 255,
                            blue: CGFloat(value & 255) / 255, alpha: 1)
        DispatchQueue.main.async {
            self.bridge?.viewController?.view.backgroundColor = color
            self.bridge?.webView?.backgroundColor = color
            self.bridge?.webView?.scrollView.backgroundColor = color
            if #available(iOS 15.0, *) {
                self.bridge?.webView?.underPageBackgroundColor = color
            }
            call.resolve()
        }
    }
}
