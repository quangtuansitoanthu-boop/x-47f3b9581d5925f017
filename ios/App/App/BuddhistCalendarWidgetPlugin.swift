import Capacitor
import Foundation
import WidgetKit

@objc(BuddhistCalendarWidgetPlugin)
public class BuddhistCalendarWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BuddhistCalendarWidgetPlugin"
    public let jsName = "BuddhistCalendarWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "replaceTimeline", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPersonalOwner", returnType: CAPPluginReturnPromise)
    ]

    @objc public func setPersonalOwner(_ call: CAPPluginCall) {
        guard let owner = call.getString("owner"), BuddhistCalendarStore.validPersonalOwner(owner) else {
            call.reject("Invalid calendar personal owner"); return
        }
        let previousOwner = BuddhistCalendarStore.personalOwner()
        do {
            if try BuddhistCalendarStore.setPersonalOwner(owner) {
                WidgetCenter.shared.reloadTimelines(ofKind: BuddhistCalendarStore.widgetKind)
            }
            call.resolve()
        } catch {
            // Marker có thể đã đổi trước lỗi dọn projection: vẫn yêu cầu extension bỏ entry riêng cũ.
            if BuddhistCalendarStore.personalOwner() != previousOwner {
                WidgetCenter.shared.reloadTimelines(ofKind: BuddhistCalendarStore.widgetKind)
            }
            call.reject("Could not update calendar personal owner", nil, error)
        }
    }

    @objc public func replaceTimeline(_ call: CAPPluginCall) {
        guard let days = call.getArray("days", JSObject.self), days.count <= 400,
              let generatedAt = call.getString("generatedAt") else {
            call.reject("Invalid calendar timeline")
            return
        }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard formatter.date(from: generatedAt) != nil || ISO8601DateFormatter().date(from: generatedAt) != nil else {
            call.reject("Invalid calendar timestamp")
            return
        }
        do {
            var payload: [String: Any] = ["days": days, "generatedAt": generatedAt]
            payload["locale"] = call.getString("locale") == "en" ? "en" : "vi"
            if let owner = call.getString("personalOwner") { payload["personalOwner"] = owner }
            let data = try JSONSerialization.data(withJSONObject: payload)
            guard data.count <= 2_000_000 else { call.reject("Calendar timeline is too large"); return }
            let snapshot = try JSONDecoder().decode(BuddhistCalendarSnapshot.self, from: data)
            var dates = Set<String>()
            for day in snapshot.days {
                guard BuddhistCalendarStore.dayDate(day.date) != nil, dates.insert(day.date).inserted,
                      [day.solarDate, day.solarDateShort, day.lunarDay, day.lunarMonthYear].allSatisfy({ !$0.isEmpty && $0.count <= 160 }),
                      [day.fastingNote, day.buddhistHoliday, day.thoKhangNote].allSatisfy({ ($0?.count ?? 0) <= 2000 }) else {
                    call.reject("Invalid calendar day")
                    return
                }
            }
            if let owner = snapshot.personalOwner {
                guard BuddhistCalendarStore.validPersonalOwner(owner) else { call.reject("Invalid calendar personal owner"); return }
                for day in snapshot.days {
                    let events = day.personalEvents ?? []
                    guard events.count <= 2, day.personalEventCount.map({ $0 >= events.count && (0...10_000).contains($0) }) ?? events.isEmpty,
                          Set(events.map(\.id)).count == events.count,
                          events.allSatisfy({ event in
                              !event.id.isEmpty && event.id.count <= 160 && !event.type.isEmpty && event.type.count <= 80
                                  && !event.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && event.title.count <= 160
                                  && (event.note?.count ?? 0) <= 160
                          }) else { call.reject("Invalid calendar personal events"); return }
                }
            }
            try BuddhistCalendarStore.save(snapshot)
            WidgetCenter.shared.reloadTimelines(ofKind: BuddhistCalendarStore.widgetKind)
            call.resolve()
        } catch {
            call.reject("Could not save calendar timeline; previous data retained", nil, error)
        }
    }
}
