import AVFoundation

// Hai plugin dùng chung một audio session; không để tiếng đọc và pháp thoại chồng nhau.
enum NativeAudioSession {
    static let willStart = Notification.Name("TuTapNativeAudioWillStart")
    private static weak var owner: AnyObject?

    static func activate(_ next: AnyObject) throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default, options: [])
        try session.setActive(true)
        owner = next
        NotificationCenter.default.post(name: willStart, object: next)
    }

    static func deactivate(_ current: AnyObject) {
        guard owner === current else { return }
        owner = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
