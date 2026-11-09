import AppIntents
import Foundation

@available(iOS 17.0, *)
private enum DharmaWidgetCommand {
    static func perform(_ action: String, trackId: String? = nil) async throws {
        #if WIDGET_EXTENSION
        // AudioPlaybackIntent được hệ điều hành chạy trong app, không tạo player ở extension.
        throw NSError(domain: "TuTapAudioWidget", code: 1, userInfo: [NSLocalizedDescriptionKey: "Mở app để khởi tạo bài nghe trước."])
        #else
        try await MainActor.run { try DharmaAudioPlugin.shared.widgetPerform(action, trackId: trackId) }
        #endif
    }
}

@available(iOS 17.0, *)
struct PlayPauseAudioIntent: AudioPlaybackIntent {
    static var title: LocalizedStringResource = "Phát hoặc tạm dừng pháp thoại"
    static var openAppWhenRun: Bool = false
    func perform() async throws -> some IntentResult {
        try await DharmaWidgetCommand.perform("toggle")
        return .result()
    }
}

@available(iOS 17.0, *)
struct SkipBackwardIntent: AudioPlaybackIntent {
    static var title: LocalizedStringResource = "Lùi pháp thoại 15 giây"
    static var openAppWhenRun: Bool = false
    func perform() async throws -> some IntentResult {
        try await DharmaWidgetCommand.perform("backward")
        return .result()
    }
}

@available(iOS 17.0, *)
struct SkipForwardIntent: AudioPlaybackIntent {
    static var title: LocalizedStringResource = "Tiến pháp thoại 15 giây"
    static var openAppWhenRun: Bool = false
    func perform() async throws -> some IntentResult {
        try await DharmaWidgetCommand.perform("forward")
        return .result()
    }
}

@available(iOS 17.0, *)
struct PlayTrackIntent: AudioPlaybackIntent {
    static var title: LocalizedStringResource = "Phát bài pháp thoại"
    static var openAppWhenRun: Bool = false
    @Parameter(title: "Bài nghe") var trackId: String
    init() {}
    init(trackId: String) { self.trackId = trackId }
    func perform() async throws -> some IntentResult {
        try await DharmaWidgetCommand.perform("track", trackId: trackId)
        return .result()
    }
}

@available(iOS 17.0, *)
struct RepeatDharmaAudioIntent: AudioPlaybackIntent {
    static var title: LocalizedStringResource = "Đổi chế độ lặp pháp thoại"
    static var openAppWhenRun: Bool = false
    func perform() async throws -> some IntentResult {
        try await DharmaWidgetCommand.perform("repeat")
        return .result()
    }
}

@available(iOS 17.0, *)
struct SleepDharmaAudioIntent: AudioPlaybackIntent {
    static var title: LocalizedStringResource = "Hẹn giờ tắt pháp thoại"
    static var openAppWhenRun: Bool = false
    func perform() async throws -> some IntentResult {
        try await DharmaWidgetCommand.perform("sleep")
        return .result()
    }
}
