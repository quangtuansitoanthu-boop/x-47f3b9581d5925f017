import SwiftUI
import WidgetKit
import UIKit

struct DharmaAudioWidgetEntry: TimelineEntry {
    let date: Date
    let audio: DharmaAudioWidgetData?
    var isPreview: Bool = false
}

private enum DharmaAudioWidgetPreview {
    static func entry() -> DharmaAudioWidgetEntry {
        let now = Date()
        // Chỉ gallery/placeholder: tên chung, asset đóng gói, không đọc lịch sử hoặc artwork riêng.
        let audio = DharmaAudioWidgetData(trackId: "preview:0", title: "Ngọc Lịch Bửu Phiêu", speakerOrCategory: "Mẫu · Đạm Si",
            currentTime: "12:35", totalDuration: "45:00", progress: 0.28, isPlaying: true,
            playlist: [DharmaAudioTrackWidgetData(id: "preview:1", title: "Phần 2", duration: "32:10"),
                DharmaAudioTrackWidgetData(id: "preview:2", title: "Phần 3", duration: "28:45"),
                DharmaAudioTrackWidgetData(id: "preview:3", title: "Phần 4", duration: "25:40")],
            repeatMode: 0, sleepRemainingMinutes: 30, updatedAt: now, error: "")
        return DharmaAudioWidgetEntry(date: now, audio: audio, isPreview: true)
    }
}

struct DharmaAudioWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> DharmaAudioWidgetEntry { DharmaAudioWidgetPreview.entry() }
    func getSnapshot(in context: Context, completion: @escaping (DharmaAudioWidgetEntry) -> Void) {
        if context.isPreview { completion(DharmaAudioWidgetPreview.entry()); return }
        completion(DharmaAudioWidgetEntry(date: Date(), audio: DharmaAudioWidgetStore.read()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<DharmaAudioWidgetEntry>) -> Void) {
        let now = Date()
        let audio = DharmaAudioWidgetStore.read()
        var entries = [DharmaAudioWidgetEntry(date: now, audio: audio)]
        // Trạng thái quá hạn chuyển sang điều khiển trung tính, không giả đang phát hoặc đã dừng.
        if let audio = audio {
            let staleAt = audio.updatedAt.addingTimeInterval(91)
            if staleAt > now { entries.append(DharmaAudioWidgetEntry(date: staleAt, audio: audio)) }
        }
        completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(900))))
    }
}

struct DharmaAudioWidgetView: View {
    let entry: DharmaAudioWidgetEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme
    private var dark: Bool { scheme == .dark }
    private var appURL: URL {
        let fallback = URL(string: "vn.quangtu.tutam:///phap-thoai")!
        guard !entry.isPreview, let id = entry.audio?.albumId,
              !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, id.utf8.count <= 256,
              !id.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
              var components = URLComponents(url: fallback, resolvingAgainstBaseURL: false) else { return fallback }
        // Chỉ chọn album đã có trong catalog, không thêm autoplay hoặc URL nội dung bên ngoài.
        components.queryItems = [URLQueryItem(name: "album", value: id)]
        return components.url ?? fallback
    }
    private func color(_ hex: UInt32) -> Color { Color(red: Double((hex >> 16) & 255) / 255, green: Double((hex >> 8) & 255) / 255, blue: Double(hex & 255) / 255) }
    // Ánh xạ palette nền/chữ/viền/vàng theo tokens.css; không tạo nhận diện thương hiệu mới.
    private var background: Color { color(dark ? 0x1C1812 : 0xFBF4E6) }
    private var primary: Color { color(dark ? 0xEDE8DF : 0x1C1A15) }
    private var secondary: Color { color(dark ? 0xC8BFB0 : 0x4A4033) }
    private var card: Color { color(dark ? 0x1C1812 : 0xFFFFFF) }
    private var border: Color { color(dark ? 0x3A3226 : 0xDDD8CC) }
    private var accent: Color { color(dark ? 0xD4A84B : 0xC8963E) }
    private var tint: Color { color(dark ? 0x2E2415 : 0xF5E9CC) }
    private func recent(_ audio: DharmaAudioWidgetData) -> Bool { entry.date.timeIntervalSince(audio.updatedAt) <= 90 }
    private func status(_ audio: DharmaAudioWidgetData) -> String {
        if entry.isPreview { return WidgetLocaleStore.text("Đang phát · Mẫu", "Playing · Preview") }
        return recent(audio) && audio.isPlaying ? WidgetLocaleStore.text("Đang phát", "Playing") : WidgetLocaleStore.text("Vị trí đã lưu", "Saved position")
    }
    private func playSymbol(_ audio: DharmaAudioWidgetData) -> String {
        recent(audio) ? (audio.isPlaying ? "pause.fill" : "play.fill") : "playpause.fill"
    }
    private func playLabel(_ audio: DharmaAudioWidgetData) -> String {
        recent(audio) ? (audio.isPlaying ? WidgetLocaleStore.text("Tạm dừng", "Pause") : WidgetLocaleStore.text("Phát tiếp", "Play")) : WidgetLocaleStore.text("Phát hoặc tạm dừng", "Play or pause")
    }
    private func fraction(_ audio: DharmaAudioWidgetData) -> Double { audio.progress.isFinite ? min(1, max(0, audio.progress)) : 0 }

    var body: some View {
        Group {
            if #available(iOS 17.0, *) { privateContent.containerBackground(background, for: .widget) }
            else { privateContent.background(background) }
        }.foregroundColor(primary).widgetURL(appURL)
    }

    @ViewBuilder private var privateContent: some View {
        if #available(iOS 15.0, *) { content.privacySensitive() }
        else { content }
    }

    @ViewBuilder private var content: some View {
        if let audio = entry.audio {
            switch family {
            case .systemSmall: small(audio)
            case .systemMedium: medium(audio)
            default: large(audio)
            }
        } else {
            VStack(spacing: 8) {
                Image(systemName: "headphones").font(.system(size: 28)).foregroundColor(accent).accessibilityHidden(true)
                Text(WidgetLocaleStore.text("Pháp thoại", "Dharma talks")).font(.system(size: 16, weight: .bold))
                Text(WidgetLocaleStore.text("Chưa chọn bài nghe", "No talk selected")).font(.system(size: 12)).foregroundColor(secondary)
                Link("Chọn bài nghe trong app", destination: appURL).font(.system(size: 12, weight: .semibold))
                    .frame(minHeight: 44).foregroundColor(primary)
            }.padding(12).frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func artwork(_ size: CGFloat) -> some View {
        Group {
            if entry.isPreview {
                Image("DharmaPreviewAlbum").resizable().scaledToFill()
            } else if entry.audio?.hasAlbumArtwork == true, let data = DharmaAudioWidgetStore.artwork(key: entry.audio?.artworkKey), let image = UIImage(data: data) {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                ZStack {
                    tint
                    Image(systemName: "headphones").font(.system(size: size * 0.4)).foregroundColor(secondary)
                }
            }
        }.frame(width: size, height: size).clipShape(RoundedRectangle(cornerRadius: 12)).accessibilityHidden(true)
    }
    private func playFace(_ audio: DharmaAudioWidgetData, size: CGFloat) -> some View {
        Image(systemName: playSymbol(audio)).font(.system(size: size * 0.4, weight: .semibold))
            .frame(width: size, height: size).foregroundColor(color(0x24180C)).background(accent).clipShape(Circle())
            .frame(minWidth: 44, minHeight: 44)
    }

    @ViewBuilder private func play(_ audio: DharmaAudioWidgetData, size: CGFloat = 44) -> some View {
        if #available(iOS 17.0, *), !entry.isPreview {
            Button(intent: PlayPauseAudioIntent()) { playFace(audio, size: size) }.buttonStyle(.plain).accessibilityLabel(playLabel(audio))
        } else {
            Link(destination: appURL) { playFace(audio, size: size) }.buttonStyle(.plain).accessibilityLabel(WidgetLocaleStore.text("Mở trình phát trong app", "Open the player in the app"))
        }
    }

    @ViewBuilder private func skip(_ forward: Bool) -> some View {
        let symbol = forward ? "goforward.15" : "gobackward.15"
        let label = forward ? WidgetLocaleStore.text("Tiến 15 giây", "Forward 15 seconds") : WidgetLocaleStore.text("Lùi 15 giây", "Back 15 seconds")
        if #available(iOS 17.0, *), !entry.isPreview {
            if forward {
                Button(intent: SkipForwardIntent()) { transportIcon(symbol) }.buttonStyle(.plain).accessibilityLabel(label)
            } else {
                Button(intent: SkipBackwardIntent()) { transportIcon(symbol) }.buttonStyle(.plain).accessibilityLabel(label)
            }
        } else {
            Link(destination: appURL) { transportIcon(symbol) }.buttonStyle(.plain).accessibilityLabel(WidgetLocaleStore.text("\(label): mở trình phát trong app", "\(label): open the player in the app"))
        }
    }

    private func transportIcon(_ name: String) -> some View {
        Image(systemName: name).font(.system(size: 22)).frame(minWidth: 44, minHeight: 44)
    }

    @ViewBuilder private func repeatControl(_ audio: DharmaAudioWidgetData) -> some View {
        let symbol = audio.repeatMode == 1 ? "repeat.1" : "repeat"
        let label = [WidgetLocaleStore.text("Lặp tắt", "Repeat off"), WidgetLocaleStore.text("Lặp một bài", "Repeat one"), WidgetLocaleStore.text("Lặp tất cả", "Repeat all")][min(2, max(0, audio.repeatMode))]
        if #available(iOS 17.0, *), !entry.isPreview {
            Button(intent: RepeatDharmaAudioIntent()) { transportIcon(symbol).foregroundColor(audio.repeatMode == 0 ? secondary : accent) }
                .buttonStyle(.plain).accessibilityLabel(label)
        } else {
            Link(destination: appURL) { transportIcon(symbol) }.buttonStyle(.plain).accessibilityLabel(WidgetLocaleStore.text("\(label): mở trình phát trong app", "\(label): open the player in the app"))
        }
    }

    private func sleepFace(_ audio: DharmaAudioWidgetData) -> some View {
        VStack(spacing: 0) {
            Image(systemName: "timer").font(.system(size: 20))
            if audio.sleepRemainingMinutes > 0 { Text(WidgetLocaleStore.text("\(audio.sleepRemainingMinutes) phút", "\(audio.sleepRemainingMinutes) min")).font(.system(size: 9)).foregroundColor(secondary) }
        }.frame(minWidth: 44, minHeight: 44).foregroundColor(audio.sleepRemainingMinutes > 0 ? accent : secondary)
    }

    @ViewBuilder private func sleepControl(_ audio: DharmaAudioWidgetData) -> some View {
        if #available(iOS 17.0, *), !entry.isPreview {
            Button(intent: SleepDharmaAudioIntent()) { sleepFace(audio) }.buttonStyle(.plain)
                .accessibilityLabel(audio.sleepRemainingMinutes > 0 ? WidgetLocaleStore.text("Hẹn tắt sau \(audio.sleepRemainingMinutes) phút", "Sleep in \(audio.sleepRemainingMinutes) minutes") : WidgetLocaleStore.text("Hẹn giờ tắt", "Sleep timer"))
        } else {
            Link(destination: appURL) { sleepFace(audio) }.buttonStyle(.plain).accessibilityLabel(WidgetLocaleStore.text("Hẹn giờ tắt: mở trình phát trong app", "Sleep timer: open the player in the app"))
        }
    }

    private func transport(_ audio: DharmaAudioWidgetData, extended: Bool = false) -> some View {
        HStack(spacing: extended ? 0 : 10) {
            if extended { repeatControl(audio); Spacer(minLength: 0) }
            skip(false)
            if extended { Spacer(minLength: 0) }
            play(audio)
            if extended { Spacer(minLength: 0) }
            skip(true)
            if extended { Spacer(minLength: 0); sleepControl(audio) }
        }.frame(maxWidth: .infinity)
    }

    private func progress(_ audio: DharmaAudioWidgetData) -> some View {
        VStack(spacing: 3) {
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    border
                    accent.frame(width: proxy.size.width * fraction(audio))
                }.clipShape(Capsule())
            }.frame(height: 4).accessibilityLabel(WidgetLocaleStore.text("Đã nghe \(Int(fraction(audio) * 100)) phần trăm", "Played \(Int(fraction(audio) * 100)) percent"))
            HStack { Text(audio.currentTime); Spacer(); Text(audio.totalDuration) }.font(.system(size: 10)).foregroundColor(secondary)
        }
    }

    private func statusBadge(_ audio: DharmaAudioWidgetData) -> some View {
        Text(status(audio)).font(.system(size: 10, weight: .medium)).lineLimit(1).minimumScaleFactor(0.85)
            .padding(.horizontal, 5).padding(.vertical, 2).background(tint).clipShape(RoundedRectangle(cornerRadius: 6))
    }

    private func small(_ audio: DharmaAudioWidgetData) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(entry.isPreview ? WidgetLocaleStore.text("Pháp thoại · Mẫu", "Dharma talks · Preview") : WidgetLocaleStore.text("Pháp thoại", "Dharma talks"), systemImage: "headphones").font(.system(size: 12, weight: .bold)).lineLimit(1)
            HStack { artwork(48); Spacer(minLength: 2); play(audio) }
            Text(audio.title).font(.system(size: 13, weight: .bold)).lineLimit(2).minimumScaleFactor(0.85)
            HStack(spacing: 3) {
                statusBadge(audio)
                Text("\(audio.currentTime) / \(audio.totalDuration)").font(.system(size: 9)).foregroundColor(secondary).lineLimit(1).minimumScaleFactor(0.8)
            }
        }.padding(9).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func medium(_ audio: DharmaAudioWidgetData) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(entry.isPreview ? "PHÁP THOẠI · MẪU" : "PHÁP THOẠI · \(status(audio).uppercased())")
                .font(.system(size: 11, weight: .bold)).lineLimit(1)
            HStack(spacing: 10) {
                artwork(60)
                VStack(alignment: .leading, spacing: 4) {
                    Text(audio.title).font(.system(size: 15, weight: .bold)).lineLimit(1).minimumScaleFactor(0.85)
                    Text(audio.speakerOrCategory).font(.system(size: 11)).foregroundColor(secondary).lineLimit(1)
                    progress(audio)
                }.frame(maxWidth: .infinity, alignment: .leading)
            }
            transport(audio)
        }.padding(10).frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func large(_ audio: DharmaAudioWidgetData) -> some View {
        GeometryReader { geometry in
            let compact = geometry.size.height < 360
            VStack(alignment: .leading, spacing: compact ? 5 : 8) {
                HStack {
                    Label(WidgetLocaleStore.text("Pháp thoại", "Dharma talks"), systemImage: "headphones").font(.system(size: 16, weight: .bold))
                    Spacer(minLength: 0)
                    statusBadge(audio)
                }
                HStack(spacing: 10) {
                    artwork(compact ? 54 : 64)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(audio.title).font(.system(size: compact ? 15 : 17, weight: .bold)).lineLimit(2).minimumScaleFactor(0.85)
                        Text(audio.speakerOrCategory).font(.system(size: 11)).foregroundColor(secondary).lineLimit(1)
                        progress(audio)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
                transport(audio, extended: true)
                Text(WidgetLocaleStore.text("NGHE TIẾP", "UP NEXT")).font(.system(size: 11, weight: .bold)).foregroundColor(secondary)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 6)
                    .overlay(Rectangle().fill(border).frame(height: 1), alignment: .top)
                ForEach(audio.playlist.prefix(3)) { track in queueRow(track) }
                if audio.playlist.isEmpty { Text(WidgetLocaleStore.text("Chưa có bài tiếp theo trong hàng đợi.", "No more tracks in the queue.")).font(.system(size: 12)).foregroundColor(secondary) }
                Spacer(minLength: 0)
            }.padding(compact ? 10 : 14).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    private func queueFace(_ track: DharmaAudioTrackWidgetData) -> some View {
        HStack(spacing: 8) {
            artwork(28)
            VStack(alignment: .leading, spacing: 2) {
                Text(track.title).font(.system(size: 12, weight: .semibold)).lineLimit(1)
                if !track.duration.isEmpty { Text(track.duration).font(.system(size: 10)).foregroundColor(secondary) }
            }.frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "play.fill").font(.system(size: 13)).foregroundColor(accent).accessibilityHidden(true)
        }.padding(.horizontal, 8).frame(minHeight: 44).background(card).clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(border, lineWidth: 1))
    }

    @ViewBuilder private func queueRow(_ track: DharmaAudioTrackWidgetData) -> some View {
        if #available(iOS 17.0, *), !entry.isPreview {
            Button(intent: PlayTrackIntent(trackId: track.id)) { queueFace(track) }.buttonStyle(.plain).accessibilityLabel(WidgetLocaleStore.text("Phát \(track.title)", "Play \(track.title)"))
        } else {
            Link(destination: appURL) { queueFace(track) }.buttonStyle(.plain).accessibilityLabel(WidgetLocaleStore.text("\(track.title): mở trình phát trong app", "\(track.title): open the player in the app"))
        }
    }
}

struct DharmaAudioWidget: Widget {
    var body: some WidgetConfiguration { configuration }
    var configuration: some WidgetConfiguration {
        StaticConfiguration(kind: DharmaAudioWidgetStore.kind, provider: DharmaAudioWidgetProvider()) { entry in DharmaAudioWidgetView(entry: entry) }
            .configurationDisplayName("Pháp Thoại & Kinh Sách")
            .description("Phát tiếp, tua và hẹn giờ trên iOS 17; iOS cũ mở trình phát trong app.")
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

@available(iOS 15.0, *)
struct DharmaAudioModernWidget: Widget {
    var body: some WidgetConfiguration { DharmaAudioWidget().configuration.contentMarginsDisabled() }
}
