import SwiftUI
import WidgetKit

struct BuddhistCalendarEntry: TimelineEntry {
    let date: Date
    let day: BuddhistCalendarDay?
    let upcomingDay: BuddhistCalendarDay?
    let isPreview: Bool
    let locale: String?

    init(date: Date, day: BuddhistCalendarDay?, upcomingDay: BuddhistCalendarDay? = nil, isPreview: Bool = false, locale: String? = nil) {
        self.date = date
        self.day = day
        self.upcomingDay = upcomingDay
        self.isPreview = isPreview
        self.locale = locale
    }
}

private enum CalendarWidgetPreview {
    static func entry() -> BuddhistCalendarEntry {
        // Chỉ cho gallery/placeholder; không đọc tài khoản, bộ nhớ riêng hoặc ghi snapshot.
        let locale = WidgetLocaleStore.locale
        func text(_ vietnamese: String, _ english: String) -> String {
            WidgetLocaleStore.text(vietnamese, english, locale: locale)
        }
        let day = BuddhistCalendarDay(date: "2026-11-02", solarDate: text("Mẫu · Thứ Hai, 02/11/2026", "Preview · Monday, 02/11/2026"), solarDateShort: "02/11/2026",
            lunarDay: "24", lunarMonthYear: text("Tháng 09 • Bính Ngọ", "Month 09 • Bính Ngọ"), fastingNote: text("Ăn chay, làm lành", "Eat vegetarian food and do good deeds"),
            buddhistHoliday: text("Ngày vía minh họa", "Sample observance"), thoKhangNote: text("Ghi chú Thọ Khang mẫu", "Sample Tho Khang note"), personalEventCount: 2,
            personalEvents: [BuddhistCalendarPersonalEvent(id: "preview-1", title: text("Sự kiện mẫu", "Sample event"), note: text("Ghi chú minh họa", "Sample note"), type: "khac"),
                BuddhistCalendarPersonalEvent(id: "preview-2", title: text("Nhắc việc mẫu", "Sample reminder"), note: text("Nội dung minh họa", "Sample content"), type: "khac")])
        return BuddhistCalendarEntry(date: BuddhistCalendarStore.dayDate(day.date) ?? Date(), day: day, isPreview: true, locale: locale)
    }
}

struct BuddhistCalendarProvider: TimelineProvider {
    func placeholder(in context: Context) -> BuddhistCalendarEntry {
        CalendarWidgetPreview.entry()
    }

    private func entry(at date: Date, snapshot: BuddhistCalendarSnapshot?) -> BuddhistCalendarEntry {
        let key = BuddhistCalendarStore.dateFormatter("yyyy-MM-dd").string(from: date)
        let day = snapshot?.days.first { $0.date == key }
        // Snapshot cũ không có locale chứa tiếng Việt; không ghép body cũ với nhãn ngôn ngữ mới.
        let locale = snapshot.map { $0.locale ?? "vi" }
        return BuddhistCalendarEntry(date: date, day: day, upcomingDay: day == nil ? nil : snapshot?.upcomingEvent(after: key), locale: locale)
    }

    func getSnapshot(in context: Context, completion: @escaping (BuddhistCalendarEntry) -> Void) {
        if context.isPreview { completion(CalendarWidgetPreview.entry()); return }
        let now = Date()
        let snapshot = BuddhistCalendarStore.read()
        completion(entry(at: now, snapshot: snapshot))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BuddhistCalendarEntry>) -> Void) {
        let now = Date()
        let calendar = BuddhistCalendarStore.calendar
        let today = calendar.startOfDay(for: now)
        let snapshot = BuddhistCalendarStore.read()
        let entries = (0..<32).compactMap { offset -> BuddhistCalendarEntry? in
            guard let date = calendar.date(byAdding: .day, value: offset, to: today) else { return nil }
            // Mỗi entry chọn theo ngày riêng từ cùng một snapshot; không dùng ngày cũ thay ngày thiếu.
            return entry(at: offset == 0 ? now : date, snapshot: snapshot)
        }
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: today) ?? now.addingTimeInterval(86400)
        completion(Timeline(entries: entries, policy: .after(tomorrow)))
    }
}

private enum CalendarNoticeKind: String {
    case fasting, holiday, abstinence, personal
}

private struct CalendarNotice: Identifiable {
    let kind: CalendarNoticeKind
    let title: String
    let text: String
    var id: String { kind.rawValue }
}

private struct CalendarPalette {
    let dark: Bool
    // Ánh xạ --gold-light/--card, --text, --text2, --border, --gold và các token ngữ nghĩa hiện có.
    var background: Color { color(dark ? 0x1C1812 : 0xFBF4E6) }
    var primary: Color { color(dark ? 0xEDE8DF : 0x1C1A15) }
    var secondary: Color { color(dark ? 0xC8BFB0 : 0x4A4033) }
    var card: Color { color(dark ? 0x1C1812 : 0xFFFFFF) }
    var border: Color { color(dark ? 0x3A3226 : 0xDDD8CC) }
    var accent: Color { color(dark ? 0xD4A84B : 0xC8963E) }
    var actionBackground: Color { color(dark ? 0x2E2415 : 0xF5E9CC) }
    // Bốn màu chấm theo bản duyệt lịch cá nhân; không thay token nền/typography của app.
    func noticeColor(_ kind: CalendarNoticeKind) -> Color {
        switch kind {
        case .fasting: return color(0xFF9800)
        case .abstinence: return color(dark ? 0xE06060 : 0xC05050)
        case .holiday: return color(0xFFD700)
        case .personal: return color(0xAB47BC)
        }
    }
    func noticeBackground(_ kind: CalendarNoticeKind) -> Color { actionBackground }
    func noticeInk(_ kind: CalendarNoticeKind) -> Color { noticeColor(kind) }
    func color(_ hex: UInt32) -> Color {
        Color(red: Double((hex >> 16) & 255) / 255, green: Double((hex >> 8) & 255) / 255, blue: Double(hex & 255) / 255)
    }
}

struct BuddhistCalendarView: View {
    let entry: BuddhistCalendarEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var colorScheme
    private var palette: CalendarPalette { CalendarPalette(dark: colorScheme == .dark) }
    private func text(_ vietnamese: String, _ english: String) -> String {
        WidgetLocaleStore.text(vietnamese, english, locale: entry.locale)
    }

    private func monthYear(_ day: BuddhistCalendarDay) -> [String] {
        day.lunarMonthYear.components(separatedBy: "•").map { $0.trimmingCharacters(in: .whitespaces) }
    }
    private func month(_ day: BuddhistCalendarDay) -> String { monthYear(day).first ?? "" }
    private func year(_ day: BuddhistCalendarDay) -> String { monthYear(day).dropFirst().joined(separator: " • ") }
    private func notices(_ day: BuddhistCalendarDay) -> [CalendarNotice] {
        let values: [(CalendarNoticeKind, String, String?)] = [
            (.fasting, text("Ngày Thập Trai", "Ten fasting days"), day.fastingNote),
            (.abstinence, text("Thọ Khang Bảo Giám", "Tho Khang Bao Giam"), day.thoKhangNote),
            (.holiday, text("Ngày Vía & Đại Lễ", "Buddhist observances"), day.buddhistHoliday)
        ]
        return values.compactMap { kind, title, value in
            guard let text = value?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
            return CalendarNotice(kind: kind, title: title, text: text)
        }
    }
    private func noticeSummary(_ day: BuddhistCalendarDay) -> String {
        notices(day).map { "\($0.title): \($0.text)" }.joined(separator: ". ")
    }

    var body: some View {
        Group {
            if #available(iOS 17.0, *) { content.containerBackground(palette.background, for: .widget) }
            else { content.background(palette.background) }
        }
        .widgetURL(entry.day?.openingURL ?? URL(string: "vn.quangtu.tutam:///#home-calendar"))
        .foregroundColor(palette.primary)
    }

    @ViewBuilder private var content: some View {
        if let day = entry.day {
            switch family {
            case .systemSmall: small(day)
            case .systemMedium: medium(day)
            default: large(day)
            }
        } else {
            VStack(spacing: 8) {
                title(size: 14)
                Text(BuddhistCalendarStore.dateFormatter("dd/MM/yyyy").string(from: entry.date))
                    .font(.system(size: 12)).foregroundColor(palette.secondary)
                Text(text("Mở app để cập nhật lịch", "Open the app to update the calendar")).font(.system(size: 13)).multilineTextAlignment(.center)
            }.padding(14).frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func title(size: CGFloat) -> some View {
        HStack(spacing: 5) {
            Image("PracticeMeditation").resizable().scaledToFit().frame(width: size + 5, height: size + 5).accessibilityHidden(true)
            Text(text("Lịch Phật giáo", "Buddhist calendar")).font(.system(size: size, weight: .bold)).lineLimit(1).minimumScaleFactor(0.85)
        }
    }

    private func header(_ day: BuddhistCalendarDay, compact: Bool) -> some View {
        HStack(spacing: 7) {
            Image("PracticeMeditation").resizable().scaledToFit().frame(width: compact ? 26 : 30, height: compact ? 26 : 30).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(text("Lịch Phật giáo", "Buddhist calendar")).font(.system(size: compact ? 16 : 18, weight: .bold)).lineLimit(1)
                Text(day.solarDate).font(.system(size: compact ? 11 : 12)).foregroundColor(palette.secondary).lineLimit(1).minimumScaleFactor(0.85)
            }
            Spacer(minLength: 0)
        }
    }

    private func number(_ day: BuddhistCalendarDay, size: CGFloat) -> some View {
        Text(day.lunarDay).font(.system(size: size, weight: .bold, design: .serif))
            .foregroundColor(colorScheme == .dark ? palette.accent : palette.primary)
            .minimumScaleFactor(0.8).lineLimit(1).accessibilityLabel(text("Ngày \(day.lunarDay) âm lịch", "Lunar day \(day.lunarDay)"))
    }

    @ViewBuilder private func noticeIcon(_ kind: CalendarNoticeKind, size: CGFloat) -> some View {
        if kind == .holiday {
            Image("PracticeMeditation").renderingMode(.template).resizable().scaledToFit()
                .frame(width: size, height: size).foregroundColor(palette.noticeColor(kind)).accessibilityHidden(true)
        } else {
            Image(systemName: kind == .fasting ? "leaf.fill" : kind == .personal ? "calendar" : "bell.fill")
                .font(.system(size: size, weight: .medium)).frame(width: size)
                .foregroundColor(palette.noticeColor(kind)).accessibilityHidden(true)
        }
    }

    @ViewBuilder private func personalPrivacy<Content: View>(_ content: Content) -> some View {
        if #available(iOS 15.0, *) { content.privacySensitive() }
        else { content }
    }

    private func personalLabel(_ day: BuddhistCalendarDay) -> String {
        day.personalCount.map { text("Cá nhân · \($0)", "Personal · \($0)") } ?? text("Cá nhân", "Personal")
    }

    private func personalSummary(_ day: BuddhistCalendarDay) -> String {
        guard let count = day.personalCount, count > 0 else { return "" }
        guard let first = day.personalEvents?.first else { return text("Mở lịch xem ngày cá nhân", "Open the calendar for personal events") }
        let remaining = count - 1
        return first.title + (remaining > 0 ? " · +\(remaining)" : "")
    }

    private func categoryDot(_ kind: CalendarNoticeKind, _ label: String, fontSize: CGFloat) -> some View {
        HStack(spacing: 4) {
            Circle().fill(palette.noticeColor(kind)).frame(width: 8, height: 8).accessibilityHidden(true)
            Text(label).font(.system(size: fontSize)).lineLimit(1).minimumScaleFactor(0.85)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }

    private func small(_ day: BuddhistCalendarDay) -> some View {
        GeometryReader { geometry in
            let compact = geometry.size.height < 170
            VStack(spacing: compact ? 0 : 2) {
                title(size: compact ? 11 : 13)
                Text(day.solarDate).font(.system(size: compact ? 10 : 11)).foregroundColor(palette.secondary)
                    .lineLimit(1).minimumScaleFactor(0.85)
                number(day, size: compact ? 72 : 88).frame(height: compact ? 66 : 82)
                Text(text("\(month(day)) âm lịch", "\(month(day)) lunar")).font(.system(size: compact ? 11 : 13, weight: .bold)).lineLimit(1).minimumScaleFactor(0.85)
                Text(year(day)).font(.system(size: compact ? 10 : 12)).foregroundColor(palette.secondary).lineLimit(1)
                HStack(spacing: 9) {
                    ForEach(notices(day)) { notice in
                        Circle().fill(palette.noticeColor(notice.kind)).frame(width: compact ? 9 : 11, height: compact ? 9 : 11)
                            .accessibilityLabel("\(notice.title): \(notice.text)")
                    }
                    if (day.personalCount ?? 0) > 0 {
                        personalPrivacy(Circle().fill(palette.noticeColor(.personal)).frame(width: compact ? 9 : 11, height: compact ? 9 : 11)
                            .accessibilityLabel(personalLabel(day)))
                    }
                }.padding(.top, 3)
            }.padding(compact ? 6 : 10).frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
    private func shortTitle(_ kind: CalendarNoticeKind) -> String {
        switch kind {
        case .fasting: return text("Thập Trai", "Fasting")
        case .holiday: return text("Ngày Vía", "Observance")
        case .abstinence: return text("Thọ Khang", "Abstinence")
        case .personal: return text("Cá nhân", "Personal")
        }
    }

    private func medium(_ day: BuddhistCalendarDay) -> some View {
        let todayNotices = notices(day)
        return VStack(spacing: 2) {
            header(day, compact: true)
            HStack(spacing: 8) {
                VStack(spacing: 0) {
                    number(day, size: 50).frame(height: 44)
                    Text(text("\(month(day)) âm lịch", "\(month(day)) lunar")).font(.system(size: 11, weight: .bold)).lineLimit(1).minimumScaleFactor(0.85)
                    Text(year(day)).font(.system(size: 10)).foregroundColor(palette.secondary).lineLimit(1)
                }.frame(width: 106)
                Rectangle().fill(palette.border).frame(width: 1)
                VStack(alignment: .leading, spacing: 2) {
                    if !day.hasNotices {
                        Text(text("Hôm nay an lành, tinh tấn tu tập.", "A peaceful day for steady practice.")).font(.system(size: 12)).foregroundColor(palette.secondary)
                    } else {
                        ForEach(todayNotices) { notice in
                            categoryDot(notice.kind, shortTitle(notice.kind), fontSize: 11).accessibilityLabel("\(notice.title): \(notice.text)")
                        }
                        if (day.personalCount ?? 0) > 0 {
                            personalPrivacy(HStack(spacing: 5) {
                                Circle().fill(palette.noticeColor(.personal)).frame(width: 8, height: 8).accessibilityHidden(true)
                                VStack(alignment: .leading, spacing: 0) {
                                    Text(personalLabel(day)).font(.system(size: 11, weight: .semibold)).lineLimit(1)
                                    Text(personalSummary(day)).font(.system(size: 10)).foregroundColor(palette.secondary).lineLimit(1).minimumScaleFactor(0.85)
                                }
                            }.frame(maxWidth: .infinity, alignment: .leading))
                        }
                    }
                }.frame(maxWidth: .infinity, alignment: .leading)
            }.frame(maxHeight: .infinity)
            todayLink(day)
        }.padding(4).frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    private func noticeRow(_ notice: CalendarNotice, compact: Bool, details: Bool) -> some View {
        HStack(alignment: .center, spacing: compact ? 5 : 8) {
            Circle().fill(palette.noticeColor(notice.kind)).frame(width: compact ? 9 : 13, height: compact ? 9 : 13).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(notice.title).font(.system(size: compact ? 11 : 13, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.85)
                if details { Text(notice.text).font(.system(size: compact ? 11 : 12)).foregroundColor(palette.secondary).lineLimit(compact ? 1 : 2).minimumScaleFactor(0.9) }
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .ignore).accessibilityLabel("\(notice.title): \(notice.text)")
    }

    @ViewBuilder private func footerText(_ day: BuddhistCalendarDay) -> some View {
        if let personal = day.personalCount, notices(day).count + personal > 0 {
            personalPrivacy(Text(text("Xem đủ \(notices(day).count + personal) mục hôm nay", "View all \(notices(day).count + personal) items today")))
        } else { Text(text("Xem lịch hôm nay", "View the calendar for today")) }
    }
    private func todayLink(_ day: BuddhistCalendarDay) -> some View {
        Link(destination: day.openingURL ?? URL(string: "vn.quangtu.tutam:///#home-calendar")!) {
            HStack {
                footerText(day).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).accessibilityHidden(true)
            }.padding(.horizontal, 12).frame(minHeight: 44)
                .foregroundColor(palette.color(0x24180C))
                .background(palette.accent).clipShape(RoundedRectangle(cornerRadius: 14))
        }.buttonStyle(.plain).accessibilityLabel(text("Mở đầy đủ lịch ngày \(day.solarDate)", "Open the calendar for \(day.solarDate)"))
    }

    private func large(_ day: BuddhistCalendarDay) -> some View {
        let todayNotices = notices(day)
        let personalEvents = Array((day.personalEvents ?? []).prefix(2))
        let personalCount = day.personalCount ?? 0
        let busy = personalCount > 0 || todayNotices.count >= 3
        return GeometryReader { geometry in
            let compact = geometry.size.height < 360
            let dense = compact && todayNotices.count + personalEvents.count >= 5
            VStack(alignment: .leading, spacing: dense ? 2 : compact ? 3 : 6) {
                header(day, compact: compact)
                HStack(spacing: 10) {
                    number(day, size: dense ? 52 : compact ? 58 : 72).frame(height: dense ? 46 : compact ? 52 : 66)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(text("\(month(day)) âm lịch", "\(month(day)) lunar")).font(.system(size: compact ? 13 : 16, weight: .bold)).lineLimit(1).minimumScaleFactor(0.85)
                        Text(year(day)).font(.system(size: compact ? 11 : 14)).foregroundColor(palette.secondary).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                VStack(spacing: 3) {
                    if !day.hasNotices {
                        Text(text("Hôm nay an lành, tinh tấn tu tập.", "A peaceful day for steady practice.")).font(.system(size: 13)).foregroundColor(palette.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        ForEach(todayNotices) { notice in
                            noticeRow(notice, compact: compact, details: true)
                                .padding(.horizontal, 8).padding(.vertical, compact ? 2 : 5)
                                .background(palette.noticeBackground(notice.kind)).clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                    }
                }.fixedSize(horizontal: false, vertical: true)
                if personalCount > 0 {
                    personalPrivacy(VStack(alignment: .leading, spacing: 3) {
                        Text(personalLabel(day).uppercased()).font(.system(size: compact ? 10 : 11, weight: .semibold)).foregroundColor(palette.secondary)
                        if personalEvents.isEmpty {
                            Text(text("Mở lịch để xem ngày cá nhân", "Open the calendar for personal events")).font(.system(size: 11)).foregroundColor(palette.secondary)
                        } else {
                            ForEach(personalEvents) { event in
                                HStack(spacing: 8) {
                                    Circle().fill(palette.noticeColor(.personal)).frame(width: compact ? 9 : 13, height: compact ? 9 : 13).accessibilityHidden(true)
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(event.title).font(.system(size: compact ? 12 : 14, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.85)
                                        if let note = event.note, !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                            Text(note).font(.system(size: compact ? 10 : 12)).foregroundColor(palette.secondary).lineLimit(1).minimumScaleFactor(0.85)
                                        }
                                    }.frame(maxWidth: .infinity, alignment: .leading)
                                }.padding(.horizontal, 8).padding(.vertical, compact ? 2 : 5)
                                    .background(palette.actionBackground).clipShape(RoundedRectangle(cornerRadius: 10))
                                    .accessibilityElement(children: .ignore).accessibilityLabel("\(event.title). \(event.note ?? "")")
                            }
                        }
                        if personalCount > personalEvents.count {
                            Text(text("+\(personalCount - personalEvents.count) ngày cá nhân khác · Xem đầy đủ trong lịch", "+\(personalCount - personalEvents.count) more personal events · View the calendar"))
                                .font(.system(size: 10)).foregroundColor(palette.secondary).lineLimit(1).minimumScaleFactor(0.85)
                        }
                    }.fixedSize(horizontal: false, vertical: true))
                }
                if !busy {
                    if let next = entry.upcomingDay { upcoming(next, compact: compact) }
                    else { Text(text("Chưa có mốc sắp tới trong lịch đã lưu.", "No upcoming events in the saved calendar.")).font(.system(size: 11)).foregroundColor(palette.secondary) }
                }
                Spacer(minLength: 0)
                todayLink(day)
            }.padding(dense ? 5 : compact ? 6 : 12).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
    private func upcoming(_ day: BuddhistCalendarDay, compact: Bool) -> some View {
        let nextNotices = notices(day)
        return VStack(alignment: .leading, spacing: 4) {
            Text(text("SẮP TỚI", "UPCOMING")).font(.system(size: 11, weight: .semibold)).foregroundColor(palette.secondary)
            Link(destination: day.openingURL ?? URL(string: "vn.quangtu.tutam:///#home-calendar")!) {
                HStack(spacing: 8) {
                    Text(BuddhistCalendarStore.dayDate(day.date).map { BuddhistCalendarStore.dateFormatter("dd/MM").string(from: $0) } ?? day.solarDateShort)
                        .font(.system(size: 14, weight: .bold))
                    Rectangle().fill(palette.border).frame(width: 1, height: 28)
                    if let notice = nextNotices.first { noticeIcon(notice.kind, size: 20) }
                    else if (day.personalCount ?? 0) > 0 { personalPrivacy(noticeIcon(.personal, size: 20)) }
                    VStack(alignment: .leading, spacing: 2) {
                        personalPrivacy(Text((nextNotices.map { $0.kind == .holiday ? $0.text : $0.title }
                            + ((day.personalCount ?? 0) > 0 ? [personalSummary(day)] : [])).joined(separator: " · ")))
                            .font(.system(size: 12, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.85)
                        Text(text("\(day.lunarDay)/\(month(day).replacingOccurrences(of: "Tháng ", with: "")) âm lịch", "\(day.lunarDay)/\(month(day).replacingOccurrences(of: "Month ", with: "")) lunar"))
                            .font(.system(size: 11)).foregroundColor(palette.secondary).lineLimit(1)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundColor(palette.accent).accessibilityHidden(true)
                }.padding(.horizontal, 8).padding(.vertical, 5).frame(minHeight: 44)
                    .background(palette.card).clipShape(RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(palette.border, lineWidth: 1))
            }.buttonStyle(.plain).accessibilityLabel(text("\(day.solarDate). \(noticeSummary(day)). Mở lịch ngày này", "\(day.solarDate). \(noticeSummary(day)). Open this date"))
        }.padding(.top, 5).overlay(Rectangle().fill(palette.border).frame(height: 1), alignment: .top)
    }
}
struct BuddhistCalendarWidget: Widget {
    var body: some WidgetConfiguration {
        configuration
    }

    var configuration: some WidgetConfiguration {
        StaticConfiguration(kind: BuddhistCalendarStore.widgetKind, provider: BuddhistCalendarProvider()) { entry in
            BuddhistCalendarView(entry: entry)
        }
        .configurationDisplayName("Lịch Phật Giáo")
        .description("Lịch âm, ngày Thập Trai, ngày vía và Thọ Khang Bảo Giám.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

@available(iOS 15.0, *)
struct BuddhistCalendarModernWidget: Widget {
    var body: some WidgetConfiguration {
        BuddhistCalendarWidget().configuration.contentMarginsDisabled()
    }
}

@main
struct TuTapWidgets: WidgetBundle {
    var body: some Widget {
        return widgetsForCurrentSystem()
    }

    private func widgetsForCurrentSystem() -> some Widget {
        // Tránh nhánh điều kiện trong result builder; mỗi phiên bản trả về một bộ widget xác định.
        if #available(iOS 15.0, *) {
            return WidgetBundleBuilder.buildBlock(
                BuddhistCalendarModernWidget(),
                DharmaAudioModernWidget(),
                PracticeModernHomeWidget()
            )
        }
        return WidgetBundleBuilder.buildBlock(
            BuddhistCalendarWidget(),
            DharmaAudioWidget(),
            PracticeHomeWidget()
        )
    }
}
