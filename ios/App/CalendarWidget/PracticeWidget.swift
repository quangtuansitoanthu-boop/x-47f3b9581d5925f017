import SwiftUI
import WidgetKit

struct PracticeWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: PracticeWidgetSnapshot?
    var isPreview: Bool = false
}

struct PracticeWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> PracticeWidgetEntry {
        PracticeWidgetEntry(date: Date(), snapshot: nil, isPreview: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (PracticeWidgetEntry) -> Void) {
        if context.isPreview { completion(PracticeWidgetEntry(date: Date(), snapshot: nil, isPreview: true)); return }
        let now = Date()
        completion(PracticeWidgetEntry(date: now, snapshot: PracticeWidgetStore.read(at: now)))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PracticeWidgetEntry>) -> Void) {
        let now = Date()
        let calendar = BuddhistCalendarStore.calendar
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)) ?? now.addingTimeInterval(86400)
        // Sau nửa đêm, không dùng công phu hôm qua làm tiến độ của hôm nay.
        let entries = [PracticeWidgetEntry(date: now, snapshot: PracticeWidgetStore.read(at: now)), PracticeWidgetEntry(date: tomorrow, snapshot: nil)]
        completion(Timeline(entries: entries, policy: .after(tomorrow)))
    }
}

private struct PracticePalette {
    let dark: Bool
    func color(_ hex: UInt32) -> Color {
        Color(red: Double((hex >> 16) & 255) / 255, green: Double((hex >> 8) & 255) / 255, blue: Double(hex & 255) / 255)
    }
    // Ánh xạ --gold-light/--card, --text, --text2, --border, --gold và --on-gold từ tokens.css.
    var background: Color { color(dark ? 0x1C1812 : 0xFBF4E6) }
    var primary: Color { color(dark ? 0xEDE8DF : 0x1C1A15) }
    var secondary: Color { color(dark ? 0xC8BFB0 : 0x4A4033) }
    var card: Color { color(dark ? 0x1C1812 : 0xFFFFFF) }
    var border: Color { color(dark ? 0x3A3226 : 0xDDD8CC) }
    var accent: Color { color(dark ? 0xD4A84B : 0xC8963E) }
    var onAccent: Color { color(0x24180C) }
}

private enum PracticeWidgetCopy {
    static var title: String { WidgetLocaleStore.text("Tu tập mỗi ngày", "Daily practice") }
    static var missing: String { WidgetLocaleStore.text("Chưa có dữ liệu hôm nay", "No data for today") }
    static var start: String { WidgetLocaleStore.text("Bắt đầu tu tập", "Start practice") }
    static var guidance: String { WidgetLocaleStore.text("Mở công cụ để bắt đầu thực hành.", "Open a tool to begin.") }
    static var fallbackItems: [PracticeWidgetItem] { [
        PracticeWidgetItem(id: "meditation", title: WidgetLocaleStore.text("Thiền định", "Meditation"), subtitle: WidgetLocaleStore.text("Mở công cụ thiền", "Open meditation"), icon: "🧘", progress: nil, isCompleted: false, hasData: false),
        PracticeWidgetItem(id: "chanting_beads", title: WidgetLocaleStore.text("Lần tràng hạt", "Rosary"), subtitle: WidgetLocaleStore.text("Mở chuỗi hạt", "Open rosary beads"), icon: "📿", progress: nil, isCompleted: false, hasData: false),
        PracticeWidgetItem(id: "sutra", title: WidgetLocaleStore.text("Tụng kinh", "Sutra recitation"), subtitle: WidgetLocaleStore.text("Chọn bài kinh", "Choose a sutra"), icon: "📖", progress: nil, isCompleted: false, hasData: false),
        PracticeWidgetItem(id: "mantra", title: WidgetLocaleStore.text("Trì chú", "Mantra recitation"), subtitle: WidgetLocaleStore.text("Chọn bài chú", "Choose a mantra"), icon: "🙏", progress: nil, isCompleted: false, hasData: false)
    ] }
}

struct PracticeWidgetView: View {
    let entry: PracticeWidgetEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var colorScheme
    private var palette: PracticePalette { PracticePalette(dark: colorScheme == .dark) }
    private var snapshot: PracticeWidgetSnapshot? { entry.snapshot }
    private var completionText: String {
        if entry.isPreview { return WidgetLocaleStore.text("Mẫu · Chưa có dữ liệu", "Preview · No data") }
        guard snapshot?.hasData == true, let completed = snapshot?.completedCount, let total = snapshot?.totalCount else { return PracticeWidgetCopy.missing }
        return WidgetLocaleStore.text("\(completed)/\(total) hoàn thành", "\(completed)/\(total) completed")
    }
    private var items: [PracticeWidgetItem] {
        // Snapshot cũ hoặc chưa đủ dữ liệu vẫn phải có đủ bốn lối vào thực hành.
        PracticeWidgetCopy.fallbackItems.map { fallback in
            guard let item = snapshot?.items.first(where: { $0.id == fallback.id }) else { return fallback }
            return PracticeWidgetItem(id: fallback.id, title: item.title.isEmpty ? fallback.title : item.title,
                subtitle: item.hasData && !item.subtitle.isEmpty ? item.subtitle : fallback.subtitle,
                icon: item.icon, progress: item.progress, isCompleted: item.isCompleted, hasData: item.hasData)
        }
    }

    var body: some View {
        Group {
            if #available(iOS 17.0, *) { content.containerBackground(palette.background, for: .widget) }
            else { content.background(palette.background) }
        }
        .foregroundColor(palette.primary)
        .widgetURL(URL(string: "vn.quangtu.tutam://tu-tap"))
    }

    @ViewBuilder private var content: some View {
        switch family {
        case .systemSmall: small
        case .systemMedium: medium
        default: large
        }
    }

    private var small: some View {
        GeometryReader { geometry in
            let compact = geometry.size.height < 170
            VStack(alignment: .leading, spacing: compact ? 2 : 5) {
                HStack(spacing: 7) {
                    Image("PracticeMeditation").resizable().scaledToFit()
                        .frame(width: compact ? 20 : 26, height: compact ? 18 : 24).accessibilityHidden(true)
                    Text(WidgetLocaleStore.text("TU TẬP", "PRACTICE")).font(.system(size: compact ? 10 : 11, weight: .semibold)).foregroundColor(palette.secondary)
                }
                Text(WidgetLocaleStore.text("Một chút\nbình an", "A moment of\npeace")).font(.system(size: compact ? 18 : 22, weight: .bold))
                    .lineSpacing(-2).fixedSize(horizontal: false, vertical: true)
                Text(completionText).font(.system(size: compact ? 11 : 13))
                    .foregroundColor(palette.secondary).lineLimit(2).minimumScaleFactor(0.9)
                Spacer(minLength: 0)
                HStack(spacing: 4) {
                    Text(PracticeWidgetCopy.start).font(.system(size: compact ? 12 : 13, weight: .bold))
                        .lineLimit(1).minimumScaleFactor(0.9)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold))
                }.padding(.horizontal, 10).frame(maxWidth: .infinity, minHeight: 44)
                    .background(palette.accent).foregroundColor(palette.onAccent)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .accessibilityElement(children: .ignore).accessibilityLabel(PracticeWidgetCopy.start)
            }.padding(compact ? 7 : 14).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    private var medium: some View {
        VStack(spacing: 6) {
            HStack(alignment: .top, spacing: 8) {
                Text(PracticeWidgetCopy.title).font(.system(size: 16, weight: .bold))
                    .lineLimit(2).minimumScaleFactor(0.85)
                Spacer(minLength: 0)
                Text(completionText).font(.system(size: 11)).foregroundColor(palette.secondary)
                    .multilineTextAlignment(.trailing).lineLimit(2).minimumScaleFactor(0.9)
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)], spacing: 6) {
                ForEach(items) { item in itemCard(item, large: false) }
            }.frame(maxHeight: .infinity)
        }.padding(12).frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var large: some View {
        GeometryReader { geometry in
            let compact = geometry.size.height < 360
            VStack(alignment: .leading, spacing: compact ? 6 : 8) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(PracticeWidgetCopy.title).font(.system(size: compact ? 19 : 21, weight: .bold)).lineLimit(1).minimumScaleFactor(0.85)
                    Text(completionText).font(.system(size: 13)).foregroundColor(palette.secondary).lineLimit(2)
                }
                VStack(spacing: 6) {
                    ForEach(items) { item in itemCard(item, large: true, compact: compact) }
                }.frame(maxHeight: .infinity)
                Text(PracticeWidgetCopy.guidance).font(.system(size: compact ? 11 : 12)).foregroundColor(palette.secondary)
                    .lineLimit(2).minimumScaleFactor(0.9).frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 6).overlay(Rectangle().fill(palette.border).frame(height: 1), alignment: .top)
            }.padding(compact ? 12 : 14).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
    private func itemCard(_ item: PracticeWidgetItem, large: Bool, compact: Bool = false) -> some View {
        Link(destination: item.openingURL) {
            HStack(spacing: large ? 10 : 6) {
                Image(item.artworkName).resizable().scaledToFit()
                    .frame(width: large ? 30 : 26, height: large ? 30 : 26).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.title).font(.system(size: large ? (compact ? 14 : 16) : 13, weight: .bold))
                        .lineLimit(1).minimumScaleFactor(0.85)
                    if large {
                        Text(item.subtitle).font(.system(size: compact ? 12 : 13)).foregroundColor(palette.secondary)
                            .lineLimit(1).minimumScaleFactor(0.85)
                    }
                }.frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold))
                    .foregroundColor(palette.accent).accessibilityHidden(true)
            }.padding(.horizontal, large ? 10 : 8).padding(.vertical, large && !compact ? 7 : 6)
                .frame(maxWidth: .infinity, minHeight: large ? (compact ? 48 : 54) : 44)
                .background(palette.card).clipShape(RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(palette.border, lineWidth: 1))
                .contentShape(RoundedRectangle(cornerRadius: 14))
        }.buttonStyle(.plain).accessibilityLabel(WidgetLocaleStore.text("\(item.title), \(item.subtitle). Mở công cụ để thực hành", "\(item.title), \(item.subtitle). Open a practice tool"))
    }
}
struct PracticeHomeWidget: Widget {
    var body: some WidgetConfiguration {
        configuration
    }

    var configuration: some WidgetConfiguration {
        StaticConfiguration(kind: PracticeWidgetStore.widgetKind, provider: PracticeWidgetProvider()) { entry in
            PracticeWidgetView(entry: entry)
        }
        .configurationDisplayName("Tu Tập Hằng Ngày")
        .description("Mở nhanh thiền định, lần tràng hạt, tụng kinh và trì chú; không tự ghi nhận hoàn thành.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

@available(iOS 15.0, *)
struct PracticeModernHomeWidget: Widget {
    var body: some WidgetConfiguration {
        PracticeHomeWidget().configuration.contentMarginsDisabled()
    }
}
