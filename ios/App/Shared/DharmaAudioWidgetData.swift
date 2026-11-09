import Foundation
import WidgetKit

struct DharmaAudioTrackWidgetData: Codable, Identifiable {
    let id: String
    let title: String
    let duration: String
}

struct DharmaAudioWidgetData: Codable {
    let trackId: String
    let title: String
    let speakerOrCategory: String
    let currentTime: String
    let totalDuration: String
    let progress: Double
    let isPlaying: Bool
    let playlist: [DharmaAudioTrackWidgetData]
    let repeatMode: Int
    let sleepRemainingMinutes: Int
    let updatedAt: Date
    let error: String
    var albumId: String? = nil
    var hasAlbumArtwork: Bool? = nil
    var artworkKey: String? = nil
}

enum DharmaAudioWidgetStore {
    static let group = "group.vn.quangtu.tutam.calendar"
    static let kind = "DharmaAudioWidget"
    private static let snapshotName = "dharma-audio-widget.json"
    private static let artworkName = "dharma-audio-widget-cover-v2.bin"
    private static let legacyArtworkName = "dharma-audio-widget-cover.png"

    private static func file(_ name: String) -> URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?.appendingPathComponent(name)
    }

    static func read() -> DharmaAudioWidgetData? {
        guard let url = file(snapshotName), let data = try? Data(contentsOf: url), data.count <= 65536 else { return nil }
        return try? JSONDecoder().decode(DharmaAudioWidgetData.self, from: data)
    }

    // Chỉ metadata hiển thị được chia sẻ; URL âm thanh và credential luôn ở app chính.
    static func write(_ value: DharmaAudioWidgetData) {
        guard let url = file(snapshotName), let data = try? JSONEncoder().encode(value), data.count <= 65536 else { return }
        try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        excludeFromBackup(url)
    }

    private static func validArtworkKey(_ key: String) -> Bool {
        key.utf8.count == 36 && UUID(uuidString: key) != nil
    }

    static func artwork(key: String?) -> Data? {
        guard let key = key, validArtworkKey(key), let url = file(artworkName),
              let data = try? Data(contentsOf: url), data.count > 37, data.count <= 524288 + 37,
              data[36] == 10, String(data: data.prefix(36), encoding: .utf8) == key else { return nil }
        // Một lần đọc nguyên tử ràng UUID với đúng PNG; entry A không thể lấy cover mới của album B.
        return Data(data.dropFirst(37))
    }

    @discardableResult static func writeArtwork(_ data: Data?, key: String? = nil) -> Bool {
        guard let url = file(artworkName) else { return false }
        do {
            if let data = data {
                guard !data.isEmpty, data.count <= 524288, let key = key, validArtworkKey(key) else { return false }
                var boundCover = Data((key + "\n").utf8)
                boundCover.append(data)
                try boundCover.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                excludeFromBackup(url)
            } else {
                if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
                if let legacy = file(legacyArtworkName), FileManager.default.fileExists(atPath: legacy.path) {
                    try FileManager.default.removeItem(at: legacy)
                }
            }
            return true
        } catch { return false }
    }
    static func clear() {
        if let url = file(snapshotName) { try? FileManager.default.removeItem(at: url) }
        writeArtwork(nil)
        WidgetCenter.shared.reloadTimelines(ofKind: kind)
    }

    private static func excludeFromBackup(_ url: URL) {
        var file = url
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try? file.setResourceValues(values)
    }

    static func time(_ value: Double) -> String {
        // Chặn trước khi đổi kiểu: Double hữu hạn vẫn có thể vượt miền Int.
        let seconds = value.isFinite ? Int(min(315360000, max(0, value)).rounded(.down)) : 0
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }

    static func sleepMinutes(_ milliseconds: Double) -> Int {
        guard milliseconds.isFinite else { return 0 }
        return Int(ceil(min(525600, max(0, milliseconds / 60000))))
    }
}
