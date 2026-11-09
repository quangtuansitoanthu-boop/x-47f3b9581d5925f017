import Foundation

struct BuddhistCalendarPersonalEvent: Codable, Identifiable {
    let id: String
    let title: String
    let note: String?
    let type: String
}

struct BuddhistCalendarDay: Codable {
    let date: String
    let solarDate: String
    let solarDateShort: String
    let lunarDay: String
    let lunarMonthYear: String
    let fastingNote: String?
    let buddhistHoliday: String?
    let thoKhangNote: String?
    var personalEventCount: Int? = nil
    var personalEvents: [BuddhistCalendarPersonalEvent]? = nil

    var personalCount: Int? {
        guard let count = personalEventCount, count >= 0 else { return nil }
        return count
    }

    func withoutPersonalData() -> BuddhistCalendarDay {
        var result = self
        result.personalEventCount = nil
        result.personalEvents = nil
        return result
    }

    var hasNotices: Bool {
        (personalCount ?? 0) > 0 || [fastingNote, buddhistHoliday, thoKhangNote].contains { note in
            guard let note = note else { return false }
            return !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    var openingURL: URL? {
        URL(string: "vn.quangtu.tutam:///?calendarDate=\(date)#home-calendar")
    }
}

struct BuddhistCalendarSnapshot: Codable {
    var days: [BuddhistCalendarDay]
    let generatedAt: String
    var personalOwner: String? = nil
    var locale: String? = nil

    func masked(forOwner owner: String?) -> BuddhistCalendarSnapshot {
        guard let owner = owner, !owner.isEmpty, personalOwner == owner else {
            var result = self
            result.days = days.map { $0.withoutPersonalData() }
            result.personalOwner = nil
            return result
        }
        return self
    }

    func upcomingEvent(after date: String) -> BuddhistCalendarDay? {
        guard BuddhistCalendarStore.dayDate(date) != nil, days.contains(where: { $0.date == date }) else { return nil }
        // Không tin thứ tự cache; bỏ ngày sai và chỉ chọn sự kiện thực sự sau ngày đang hiển thị.
        return days.filter { $0.date > date && $0.hasNotices }.sorted { $0.date < $1.date }
            .first { BuddhistCalendarStore.dayDate($0.date) != nil }
    }
}
enum BuddhistCalendarStore {
    static let group = "group.vn.quangtu.tutam.calendar"
    static let widgetKind = "BuddhistCalendarWidget"
    static let timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!

    static var calendar: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.timeZone = timeZone
        return value
    }

    static func dateFormatter(_ format: String) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "vi_VN")
        formatter.calendar = calendar
        formatter.timeZone = timeZone
        formatter.dateFormat = format
        formatter.isLenient = false
        return formatter
    }

    static func dayDate(_ value: String) -> Date? {
        let formatter = dateFormatter("yyyy-MM-dd")
        guard let result = formatter.date(from: value), formatter.string(from: result) == value else { return nil }
        return result
    }

    static func fileURL() -> URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?
            .appendingPathComponent("buddhist-calendar-v1.json")
    }

    private static let accessLock = NSRecursiveLock()

    private static func ownerURL() -> URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?
            .appendingPathComponent("buddhist-calendar-personal-owner-v1.txt")
    }

    static func validPersonalOwner(_ owner: String) -> Bool {
        let scoped = owner.isEmpty || owner == "guest" || (owner.hasPrefix("user:") && owner.count > 5)
        return scoped && owner.utf8.count <= 256 && !owner.unicodeScalars.contains { CharacterSet.controlCharacters.contains($0) }
    }

    private static func personalOwnerUnlocked() -> String? {
        guard let url = ownerURL(), let data = try? Data(contentsOf: url), data.count <= 256,
              let owner = String(data: data, encoding: .utf8), validPersonalOwner(owner) else { return nil }
        return owner
    }

    static func personalOwner() -> String? {
        accessLock.lock(); defer { accessLock.unlock() }
        return personalOwnerUnlocked()
    }
    private static func snapshotUnlocked() -> BuddhistCalendarSnapshot? {
        guard let url = fileURL(), let data = try? Data(contentsOf: url), data.count <= 2_000_000 else { return nil }
        return try? JSONDecoder().decode(BuddhistCalendarSnapshot.self, from: data)
    }

    static func read() -> BuddhistCalendarSnapshot? {
        accessLock.lock(); defer { accessLock.unlock() }
        return snapshotUnlocked()?.masked(forOwner: personalOwnerUnlocked())
    }

    private static func writeUnlocked(_ snapshot: BuddhistCalendarSnapshot) throws {
        guard var url = fileURL() else {
            throw NSError(domain: widgetKind, code: 1, userInfo: [NSLocalizedDescriptionKey: "App Group is not available"])
        }
        let data = try JSONEncoder().encode(snapshot)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try url.setResourceValues(values)
    }

    static func setPersonalOwner(_ owner: String) throws -> Bool {
        accessLock.lock(); defer { accessLock.unlock() }
        guard validPersonalOwner(owner), var url = ownerURL() else {
            throw NSError(domain: widgetKind, code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid calendar personal owner"])
        }
        guard personalOwnerUnlocked() != owner else { return false }
        // Đổi marker trước: mọi lần đọc sau đó che projection cũ, kể cả khi bước dọn file thất bại.
        try Data(owner.utf8).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try url.setResourceValues(values)
        if let existing = snapshotUnlocked() { try writeUnlocked(existing.masked(forOwner: nil)) }
        return true
    }

    static func save(_ snapshot: BuddhistCalendarSnapshot) throws {
        accessLock.lock(); defer { accessLock.unlock() }
        if let owner = snapshot.personalOwner {
            guard validPersonalOwner(owner), personalOwnerUnlocked() == owner else {
                throw NSError(domain: widgetKind, code: 3, userInfo: [NSLocalizedDescriptionKey: "Calendar personal owner changed"])
            }
            try writeUnlocked(owner.isEmpty ? snapshot.masked(forOwner: nil) : snapshot)
        } else {
            // Binary/client cũ vẫn cập nhật lịch công khai; không nhận field riêng thiếu owner.
            try writeUnlocked(snapshot.masked(forOwner: nil))
        }
    }
}
