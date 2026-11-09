import Capacitor
import Foundation
import WidgetKit

@objc(PracticeWidgetPlugin)
public class PracticeWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PracticeWidgetPlugin"
    public let jsName = "PracticeWidget"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "replaceSnapshot", returnType: CAPPluginReturnPromise)]

    @objc public func replaceSnapshot(_ call: CAPPluginCall) {
        do {
            let data = try JSONSerialization.data(withJSONObject: call.options)
            guard data.count <= 64_000 else { call.reject("Practice snapshot is too large"); return }
            let value = try JSONDecoder().decode(PracticeWidgetSnapshot.self, from: data)
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            guard BuddhistCalendarStore.dayDate(value.date) != nil,
                  iso.date(from: value.generatedAt) != nil || ISO8601DateFormatter().date(from: value.generatedAt) != nil,
                  value.items.count == 4,
                  Set(value.items.map(\.id)) == PracticeWidgetStore.allowedIDs,
                  value.completionPercent.map({ (0...100).contains($0) }) ?? true,
                  value.completedCount.map({ (0...4).contains($0) }) ?? true,
                  value.totalCount.map({ (0...4).contains($0) }) ?? true,
                  value.streakDays.map({ (0...100_000).contains($0) }) ?? true,
                  value.items.allSatisfy({ item in
                      !item.title.isEmpty && item.title.count <= 120 && item.subtitle.count <= 200 && item.icon.count <= 32
                          && (item.progress.map({ $0.isFinite && (0...1).contains($0) }) ?? true)
                          && (item.isCompleted != true || item.hasData)
                  }) else {
                call.reject("Invalid practice snapshot")
                return
            }
            // Chỉ lưu bản đọc; nút widget mở công cụ, không ghi công phu hoặc thành tích.
            try PracticeWidgetStore.save(value)
            let localeChanged = WidgetLocaleStore.save(value.locale)
            WidgetCenter.shared.reloadTimelines(ofKind: PracticeWidgetStore.widgetKind)
            if localeChanged {
                WidgetCenter.shared.reloadTimelines(ofKind: BuddhistCalendarStore.widgetKind)
                WidgetCenter.shared.reloadTimelines(ofKind: "DharmaAudioWidget")
            }
            call.resolve()
        } catch {
            call.reject("Could not save practice widget snapshot; previous data retained", nil, error)
        }
    }
}
