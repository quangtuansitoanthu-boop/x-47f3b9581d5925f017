import Foundation

struct PracticeWidgetItem: Codable, Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let icon: String
    let progress: Double?
    let isCompleted: Bool?
    let hasData: Bool

    var artworkName: String {
        switch id {
        case "meditation": return "PracticeMeditation"
        case "chanting_beads": return "PracticeRosary"
        case "sutra": return "PracticeSutra"
        default: return "PracticeMantra"
        }
    }

    var openingURL: URL {
        let route: String
        switch id {
        case "meditation": route = "tu-tap?action=meditation"
        case "chanting_beads": route = "tu-tap?action=rosary"
        case "sutra": route = "tu-tap?muc=kinh"
        case "mantra": route = "tu-tap?muc=tri-chu"
        default: route = "tu-tap"
        }
        return URL(string: "vn.quangtu.tutam://\(route)")!
    }
}

struct PracticeWidgetSnapshot: Codable {
    let date: String
    let generatedAt: String
    let hasData: Bool
    let completionPercent: Int?
    let completedCount: Int?
    let totalCount: Int?
    let streakDays: Int?
    let items: [PracticeWidgetItem]
    var locale: String? = nil
}

// Tùy chọn ngôn ngữ dùng chung cho ba widget; không chứa principal hay dữ liệu tu tập.
enum WidgetLocaleStore {
    private static let key = "widget-locale-v1"
    static var locale: String { UserDefaults(suiteName: BuddhistCalendarStore.group)?.string(forKey: key) == "en" ? "en" : "vi" }
    @discardableResult static func save(_ value: String?) -> Bool {
        let next = value == "en" ? "en" : "vi"
        let changed = locale != next
        UserDefaults(suiteName: BuddhistCalendarStore.group)?.set(next, forKey: key)
        return changed
    }
    static func text(_ vietnamese: String, _ english: String, locale override: String? = nil) -> String {
        (override ?? locale) == "en" ? english : vietnamese
    }
}

enum PracticeWidgetStore {
    static let widgetKind = "PracticeHomeWidget"
    static let allowedIDs: Set<String> = ["meditation", "chanting_beads", "sutra", "mantra"]

    static func fileURL() -> URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: BuddhistCalendarStore.group)?
            .appendingPathComponent("practice-widget-v1.json")
    }

    static func today(at date: Date) -> String {
        BuddhistCalendarStore.dateFormatter("yyyy-MM-dd").string(from: date)
    }

    static func read(at now: Date = Date()) -> PracticeWidgetSnapshot? {
        guard let url = fileURL(), let data = try? Data(contentsOf: url), data.count <= 64_000,
              let value = try? JSONDecoder().decode(PracticeWidgetSnapshot.self, from: data),
              value.date == today(at: now) else { return nil }
        return value
    }

    static func save(_ snapshot: PracticeWidgetSnapshot) throws {
        guard var url = fileURL() else {
            throw NSError(domain: widgetKind, code: 1, userInfo: [NSLocalizedDescriptionKey: "App Group is not available"])
        }
        let data = try JSONEncoder().encode(snapshot)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try url.setResourceValues(values)
    }
}
