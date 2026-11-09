import AVFoundation
import Capacitor

@objc(ReaderSpeechPlugin)
public class ReaderSpeechPlugin: CAPPlugin, CAPBridgedPlugin, AVSpeechSynthesizerDelegate {
    public let identifier = "ReaderSpeechPlugin"
    public let jsName = "ReaderSpeech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "prepare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]
    private let synthesizer = AVSpeechSynthesizer()
    private var pending: CAPPluginCall?
    private var active: AVSpeechUtterance?
    private var activeID = ""
    private var observers: [NSObjectProtocol] = []

    public override func load() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.synthesizer.delegate = self
            self.synthesizer.usesApplicationAudioSession = true
            self.observers.append(NotificationCenter.default.addObserver(forName: NativeAudioSession.willStart, object: nil, queue: .main) { [weak self] note in
                guard let self = self, note.object as AnyObject? !== self else { return }
                self.cancelCurrent()
            })
            self.observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
                if let type = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                   type == AVAudioSession.InterruptionType.began.rawValue { self?.cancelCurrent() }
            })
        }
    }

    @objc public func prepare(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if AVSpeechSynthesisVoice.speechVoices().isEmpty { call.reject("No speech voices available", "MISSING_ENGINE") }
            else { call.resolve() }
        }
    }

    @objc public func speak(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.reject("Reader closed", "CLOSED"); return }
            let text = call.getString("text") ?? ""
            let id = call.getString("id") ?? ""
            guard !id.isEmpty, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.count <= 4000 else {
                call.reject("Invalid speech text", "INVALID_TEXT"); return
            }
            let language = call.getString("language") ?? "vi-VN"
            guard let voice = AVSpeechSynthesisVoice(language: language) else {
                call.reject("Voice is not installed for this language", "MISSING_VOICE"); return
            }
            self.cancelCurrent()
            do { try NativeAudioSession.activate(self) }
            catch { call.reject("Cannot activate speech audio", "AUDIO_SESSION", error); return }
            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = voice
            let rate = call.getDouble("rate") ?? 1
            utterance.rate = min(AVSpeechUtteranceMaximumSpeechRate, max(AVSpeechUtteranceMinimumSpeechRate,
                AVSpeechUtteranceDefaultSpeechRate * Float(rate.isFinite ? min(2, max(0.3, rate)) : 1)))
            self.active = utterance
            self.activeID = id
            self.pending = call
            self.synthesizer.speak(utterance)
        }
    }

    private func cancelCurrent() {
        let call = pending
        pending = nil; active = nil; activeID = ""
        synthesizer.stopSpeaking(at: .immediate)
        call?.resolve(["canceled": true])
        NativeAudioSession.deactivate(self)
    }

    @objc public func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            if call.getString("id") == nil || call.getString("id") == self?.activeID { self?.cancelCurrent() }
            call.resolve()
        }
    }

    @objc public func openSettings(_ call: CAPPluginCall) {
        // iOS không cung cấp URL công khai để mở thẳng trang tải giọng đọc.
        call.reject("Open Settings > Accessibility > Spoken Content to install voices", "SETTINGS_UNAVAILABLE")
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        if utterance === active { notifyListeners("speechStart", data: ["id": activeID]) }
    }
    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        guard utterance === active else { return }
        let call = pending
        pending = nil; active = nil; activeID = ""
        call?.resolve()
        NativeAudioSession.deactivate(self)
    }
    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        if utterance === active { cancelCurrent() }
    }
    deinit { observers.forEach(NotificationCenter.default.removeObserver) }
}
