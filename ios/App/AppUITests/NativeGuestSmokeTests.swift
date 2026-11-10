import XCTest
import UIKit

// Mỗi phương thức chạy trên bản cài mới của Simulator CI; không chỉnh storage hoặc quyền bằng test hook.
class NativeGuestUITestCase: XCTestCase {
    private var evidenceApplication: XCUIApplication?

    override func tearDown() async throws {
        await MainActor.run {
            if let app = evidenceApplication {
                evidence("final-" + name, app: app)
                evidence("system-final-" + name, app: XCUIApplication(bundleIdentifier: "com.apple.springboard"))
            }
            XCUIDevice.shared.orientation = .portrait
        }
        try await super.tearDown()
    }

    @MainActor
    func evidence(_ name: String, app: XCUIApplication) {
        // Lấy snapshot AX trước để WebKit kết thúc cập nhật layout trước ảnh hiển thị tương ứng.
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name + "-accessibility"
        tree.lifetime = .keepAlways
        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = name
        screenshot.lifetime = .keepAlways
        add(screenshot)
        add(tree)
    }

    @MainActor
    func launchGuest() -> XCUIApplication {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        let app = XCUIApplication()
        evidenceApplication = app
        app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN"]
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 30), "Native WKWebView must load")
        XCTAssertTrue(app.links["Cá nhân"].firstMatch.waitForExistence(timeout: 30), "Native app must finish rendering its navigation")
        return app
    }

    @MainActor
    func waitUntil(_ message: String, timeout: TimeInterval = 15, _ condition: @escaping () -> Bool) {
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in condition() }, object: NSObject())
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: timeout), .completed, message)
    }

    @MainActor
    func insideViewport(_ element: XCUIElement, viewport: CGRect) -> Bool {
        guard element.exists else { return false }
        let frame = element.frame
        return frame.width > 0 && frame.height > 0 && viewport.contains(frame) && element.isHittable
    }

    @MainActor
    func insideViewport(_ element: XCUIElement, app: XCUIApplication) -> Bool {
        insideViewport(element, viewport: app.frame)
    }

    @MainActor
    func dismissPracticeSyncNotice(_ app: XCUIApplication) {
        // Chỉ xử lý banner công phu đã lưu, không chạm các nút Để sau của hướng dẫn/thông báo tài khoản.
        let message = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Đã lưu trên thiết bị. Đăng nhập lại để đồng bộ công phu.")).firstMatch
        guard message.exists else { return }
        let viewport = app.frame
        let noticeFrame = message.frame
        guard viewport.intersects(noticeFrame) else { return }
        let candidates = app.buttons.matching(identifier: "Để sau").allElementsBoundByIndex
        if let later = candidates.first(where: {
            let frame = $0.frame
            return frame.width > 0 && frame.height > 0 && viewport.contains(frame) &&
                frame.minY >= noticeFrame.minY && frame.minY <= noticeFrame.maxY + 100 &&
                frame.midX >= noticeFrame.minX && frame.midX <= noticeFrame.maxX && $0.isHittable
        }) {
            later.tap()
            waitUntil("Dismissed practice-sync notice must disappear") { !message.exists }
        }
    }

    @MainActor
    func reveal(_ element: XCUIElement, app: XCUIApplication) {
        // WKWebView có thể chưa đưa control ngoài màn hình vào AX; phải tìm bằng cuộn trước khi kết luận thiếu.
        var viewport = app.frame
        let navigation = app.otherElements.matching(NSPredicate(format: "label BEGINSWITH %@ OR label BEGINSWITH %@", "Điều hướng nhanh", "Quick navigation")).firstMatch
        if navigation.exists {
            let frame = navigation.frame
            if frame.width > 0 && frame.minY > viewport.midY && frame.minY < viewport.maxY {
                // WebKit có thể báo hittable cho nội dung nằm dưới thanh điều hướng fixed.
                viewport.size.height = frame.minY - viewport.minY
            }
        }
        for attempt in 0..<14 {
            if element.exists {
                let frame = element.frame
                if frame.width > 0 && frame.height > 0 {
                    if viewport.contains(frame) && element.isHittable { return }
                    if frame.midY < viewport.midY { app.swipeDown() }
                    else { app.swipeUp() }
                    continue
                }
            }
            if attempt < 7 {
                app.swipeUp()
            } else {
                app.swipeDown()
            }
        }
        evidence("unreachable-control", app: app)
        XCTAssertTrue(element.exists, "Expected actual native accessibility control after bounded scroll search")
        XCTAssertTrue(insideViewport(element, viewport: viewport), "Control must be visible and reachable inside the native viewport")
    }

    @MainActor
    func tap(_ element: XCUIElement, app: XCUIApplication) {
        reveal(element, app: app)
        element.tap()
    }

    @MainActor
    func navigate(_ label: String, app: XCUIApplication) {
        dismissPracticeSyncNotice(app)
        let links = app.links.matching(identifier: label)
        XCTAssertTrue(links.firstMatch.waitForExistence(timeout: 20), "Bottom navigation must expose \(label)")
        let viewport = app.frame
        let visible = links.allElementsBoundByIndex.compactMap { element -> (XCUIElement, CGRect)? in
            let frame = element.frame
            return frame.width > 0 && frame.height > 0 && viewport.contains(frame) && element.isHittable ? (element, frame) : nil
        }
        guard let tab = visible.max(by: { $0.1.midY < $1.1.midY })?.0 else {
            evidence("missing-bottom-tab-" + label, app: app)
            XCTFail("Expected visible bottom navigation link \(label)")
            return
        }
        tab.tap()
    }

    @MainActor
    func openSettings(_ app: XCUIApplication) {
        navigate("Cá nhân", app: app)
        let settings = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Cài đặt ứng dụng")).firstMatch
        tap(settings, app: app)
        XCTAssertTrue(app.switches["Bật thông báo nhắc nhở tu tập"].firstMatch.waitForExistence(timeout: 20))
    }

    @MainActor
    func openAppearance(_ app: XCUIApplication) {
        let motion = app.switches["Hiệu ứng chuyển động"].firstMatch
        if !motion.exists || motion.frame.width == 0 || motion.frame.height == 0 {
            let summary = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@ AND label != %@", "Giao diện & ngôn ngữ ", "Giao diện & ngôn ngữ")).firstMatch
            tap(summary, app: app)
        }
        reveal(motion, app: app)
    }

    @MainActor
    func checked(_ element: XCUIElement) -> Bool? {
        if let value = element.value as? String {
            if ["1", "true"].contains(value.lowercased()) { return true }
            if ["0", "false"].contains(value.lowercased()) { return false }
        }
        return (element.value as? NSNumber)?.boolValue
    }

    @MainActor
    func setMotion(_ enabled: Bool, app: XCUIApplication) {
        let toggle = app.switches["Hiệu ứng chuyển động"].firstMatch
        reveal(toggle, app: app)
        XCTAssertNotNil(checked(toggle), "Actual motion switch must expose checked state")
        if checked(toggle) != enabled { toggle.tap() }
        waitUntil("Motion switch must reflect requested state") { self.checked(toggle) == enabled }
    }

    @MainActor
    func openRosaryFromCatalog(_ app: XCUIApplication) {
        dismissPracticeSyncNotice(app)
        let card = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Lần tràng hạt")).firstMatch
        tap(card, app: app)
        let start = app.buttons["Bắt đầu 🙏"].firstMatch
        tap(start, app: app)
        XCTAssertTrue(app.buttons["Quay lại tu tập"].firstMatch.waitForExistence(timeout: 15))
    }

    @MainActor
    func rosaryCount(_ app: XCUIApplication) -> Int {
        let numbers = app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "^[0-9]+$"))
        XCTAssertEqual(numbers.count, 1, "Actual rosary counter must be uniquely exposed")
        guard let count = Int(numbers.firstMatch.label) else { XCTFail("Rosary counter must be numeric"); return -1 }
        return count
    }

    @MainActor
    func librarySearch(_ app: XCUIApplication) -> XCUIElement {
        let field = app.searchFields["Tìm kiếm bài viết"].firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 20))
        reveal(field, app: app)
        return field
    }

    @MainActor
    func rotate(_ orientation: UIDeviceOrientation, app: XCUIApplication) {
        XCUIDevice.shared.orientation = orientation
        waitUntil("Native viewport must complete rotation") {
            orientation == .portrait ? app.frame.height > app.frame.width : app.frame.width > app.frame.height
        }
    }
}

final class NativeGuestSmokeTests: NativeGuestUITestCase {
    @MainActor
    func testRosaryBackPreservesCountInPortraitAndLandscape() {
        let app = launchGuest()
        navigate("Tu tập", app: app)
        openRosaryFromCatalog(app)
        for pass in 1...5 {
            for orientation in [UIDeviceOrientation.portrait, .landscapeLeft] {
                rotate(orientation, app: app)
                let count = rosaryCount(app)
                tap(app.buttons["Niệm một hạt"].firstMatch, app: app)
                XCTAssertTrue(app.staticTexts[String(count + 1)].firstMatch.waitForExistence(timeout: 10))
                XCTAssertEqual(rosaryCount(app), count + 1, "One real tap must increase the rosary count exactly once")
                let back = app.buttons["Quay lại tu tập"].firstMatch
                reveal(back, app: app)
                XCTAssertGreaterThanOrEqual(back.frame.width, 44)
                XCTAssertGreaterThanOrEqual(back.frame.height, 44)
                evidence("rosary-pass-\(pass)-\(orientation == .portrait ? "portrait" : "landscape")", app: app)
                back.tap()
                waitUntil("Rosary back must close the tool") { !back.exists }
                openRosaryFromCatalog(app)
                XCTAssertEqual(rosaryCount(app), count + 1, "Real Back and catalog reopening must preserve the count")
            }
        }
    }

    @MainActor
    func testMotionSettingPersistsAcrossNativeDeepLinks() {
        let app = launchGuest()
        openSettings(app)
        openAppearance(app)
        XCTAssertEqual(checked(app.switches["Hiệu ứng chuyển động"].firstMatch), true, "Fresh install enables motion")
        setMotion(false, app: app)
        evidence("motion-off", app: app)
        // Một deep link ấm và một deep link lạnh kiểm chứng chính contract native, không dùng cho mọi bước điều hướng.
        app.open(URL(string: "vn.quangtu.tutam:///tu-tap?action=rosary")!)
        tap(app.buttons["Bắt đầu 🙏"].firstMatch, app: app)
        evidence("rosary-motion-off", app: app)
        tap(app.buttons["Quay lại tu tập"].firstMatch, app: app)
        openSettings(app)
        openAppearance(app)
        XCTAssertEqual(checked(app.switches["Hiệu ứng chuyển động"].firstMatch), false)
        app.terminate()
        app.open(URL(string: "vn.quangtu.tutam:///ca-nhan?tab=settings")!)
        XCTAssertTrue(app.switches["Bật thông báo nhắc nhở tu tập"].firstMatch.waitForExistence(timeout: 30))
        openAppearance(app)
        XCTAssertEqual(checked(app.switches["Hiệu ứng chuyển động"].firstMatch), false, "Motion setting must survive native cold deep link")
        setMotion(true, app: app)
        evidence("motion-restored", app: app)
    }

    @MainActor
    func testExistingNotificationButtonDeliversToSystemNotificationCenter() {
        let app = launchGuest()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        openSettings(app)
        XCTAssertEqual(checked(app.switches["Bật thông báo nhắc nhở tu tập"].firstMatch), true)
        let sound = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Âm thanh & rung thông báo Âm thanh:")).firstMatch
        // Bấm summary thật sau khi đã cuộn nó vào viewport; không dựa vào exists của children mounted ẩn.
        reveal(sound, app: app)
        evidence("notification-sound-before", app: app)
        tap(sound, app: app)
        evidence("notification-sound-after", app: app)
        let send = app.buttons["🔔 Gửi thử thông báo mẫu"].firstMatch
        tap(send, app: app)
        let systemAlert = springboard.alerts.firstMatch
        let permission = systemAlert.waitForExistence(timeout: 10) ? systemAlert : app.alerts.firstMatch
        XCTAssertTrue(permission.waitForExistence(timeout: 10), "Fresh installation must show a notification permission dialog")
        let dialog = permission.staticTexts.allElementsBoundByIndex.map { $0.label }.joined(separator: " ").lowercased()
        XCTAssertTrue(dialog.contains("notification") || dialog.contains("thông báo"), "Only notification authorization may be accepted")
        let allow = permission.buttons.matching(NSPredicate(format: "label IN %@", ["Allow", "Cho phép", "Cho Phép"] as NSArray)).firstMatch
        XCTAssertTrue(allow.exists, "Expected exact affirmative notification permission button")
        allow.tap()
        // Nút trở lại tên thường sau promise schedule. Toast chỉ tồn tại 2.8s; bằng chứng cuối vẫn phải là iOS nhận thông báo.
        XCTAssertTrue(send.waitForExistence(timeout: 20), "Native test scheduling must finish before backgrounding")
        evidence("notification-scheduled", app: app)
        XCUIDevice.shared.press(.home)
        XCTAssertTrue(springboard.wait(for: .runningForeground, timeout: 10))
        let top = springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.12, dy: 0.01))
        let bottom = springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.12, dy: 0.80))
        top.press(forDuration: 0.1, thenDragTo: bottom)
        let title = "🔔 Kiểm tra thông báo Tu Tập"
        let body = "Nhắc nhở tu tập hoạt động tốt!"
        let deliveredTitle = springboard.staticTexts[title].firstMatch
        let deliveredBody = springboard.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", body)).firstMatch
        let grouped = springboard.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", title, body)).firstMatch
        waitUntil("OS Notification Center must expose the exact test notification title and body", timeout: 25) {
            (deliveredTitle.exists && deliveredBody.exists) || grouped.exists
        }
        evidence("notification-system-received", app: springboard)
    }
}

final class NativeExtendedGuestTests: NativeGuestUITestCase {
    @MainActor
    func testOfflineLibrarySearchChapterReadingAndLargeTextRotation() {
        let app = launchGuest()
        navigate("Kinh sách", app: app)
        let search = librarySearch(app)
        search.tap()
        search.typeText("Kinh Địa Tạng Bồ Tát Bổn Nguyện Giảng Giải")
        let book = app.buttons["Đọc ngay Kinh Địa Tạng Bồ Tát Bổn Nguyện Giảng Giải"].firstMatch
        tap(book, app: app)
        let chapter = app.buttons.matching(NSPredicate(format: "label CONTAINS[cd] %@", "Duyên Khởi Của Pháp Hội Giảng Kinh")).firstMatch
        tap(chapter, app: app)
        let body = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[cd] %@", "Tất cả mọi nơi đều là đạo tràng")).firstMatch
        XCTAssertTrue(body.waitForExistence(timeout: 30), "Bundled chapter body must render while production hosts are blocked")
        let larger = app.buttons["Chữ lớn hơn"].firstMatch
        reveal(larger, app: app)
        XCTAssertGreaterThanOrEqual(larger.frame.width, 44)
        XCTAssertGreaterThanOrEqual(larger.frame.height, 44)
        for _ in 0..<3 { larger.tap() }
        XCTAssertTrue(app.staticTexts["18px"].firstMatch.waitForExistence(timeout: 10), "Reader font control must reflect three real increments")
        evidence("offline-reader-large-text-portrait", app: app)
        rotate(.landscapeLeft, app: app)
        let backToContents = app.buttons["Mục lục"].firstMatch
        reveal(backToContents, app: app)
        XCTAssertGreaterThanOrEqual(backToContents.frame.width, 44)
        XCTAssertGreaterThanOrEqual(backToContents.frame.height, 44)
        evidence("offline-reader-large-text-landscape", app: app)
        backToContents.tap()
        XCTAssertTrue(chapter.waitForExistence(timeout: 15), "Back from chapter must return to real table of contents")
        tap(app.buttons["Quay lại"].firstMatch, app: app)
        XCTAssertTrue(librarySearch(app).isHittable, "Closing table of contents must return to the searchable library")
    }

    @MainActor
    func testNativeCatalogExcludesWebOnlyBookAndSearchCanBeCleared() {
        let app = launchGuest()
        navigate("Kinh sách", app: app)
        let search = librarySearch(app)
        search.tap()
        search.typeText("Kinh Địa Tạng Bồ Tát Bổn Nguyện Giảng Giải")
        let book = app.buttons["Đọc ngay Kinh Địa Tạng Bồ Tát Bổn Nguyện Giảng Giải"].firstMatch
        XCTAssertTrue(book.waitForExistence(timeout: 25))
        let clear = app.buttons["Xóa tìm kiếm"].firstMatch
        tap(clear, app: app)
        search.tap()
        search.typeText("Muôn Kiếp Nhân Sinh")
        XCTAssertTrue(app.staticTexts["Không tìm thấy bài viết phù hợp."].firstMatch.waitForExistence(timeout: 20))
        XCTAssertEqual(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@ AND label CONTAINS[cd] %@", "Đọc ngay", "Muôn Kiếp Nhân Sinh")).count, 0)
        evidence("native-web-only-search-empty", app: app)
        tap(clear, app: app)
        search.tap()
        search.typeText("Kinh Địa Tạng Bồ Tát Bổn Nguyện Giảng Giải")
        XCTAssertTrue(book.waitForExistence(timeout: 20), "Normal offline catalog must recover after clearing the excluded title")
    }

    @MainActor
    func testLightDarkSettingsAndGuestDeepLinkNavigation() {
        let app = launchGuest()
        for (label, theme) in [("🌙 Giao diện Tối", "dark"), ("☀️ Giao diện Sáng", "light")] {
            openSettings(app)
            openAppearance(app)
            let choice = app.switches[label].firstMatch
            tap(choice, app: app)
            waitUntil("Selected theme must become active") { self.checked(choice) == true }
            let summary = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Giao diện & ngôn ngữ " + label)).firstMatch
            XCTAssertTrue(summary.waitForExistence(timeout: 15), "Settings summary must render the selected theme before screenshot")
            evidence("settings-" + theme, app: app)
            navigate("Kinh sách", app: app)
            XCTAssertTrue(librarySearch(app).isHittable)
            evidence("library-" + theme, app: app)
            navigate("Tu tập", app: app)
            XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Lần tràng hạt")).firstMatch.waitForExistence(timeout: 20))
            evidence("practice-" + theme, app: app)
        }
    }

    @MainActor
    func testMeditationPauseResumeSurvivesNativeBackgrounding() {
        let app = launchGuest()
        navigate("Tu tập", app: app)
        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Thiền định")).firstMatch, app: app)
        tap(app.buttons["Bắt đầu thiền"].firstMatch, app: app)
        tap(app.buttons["Tạm dừng"].firstMatch, app: app)
        let resume = app.buttons["Tiếp tục"].firstMatch
        XCTAssertTrue(resume.waitForExistence(timeout: 10))
        evidence("meditation-paused", app: app)
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(resume.waitForExistence(timeout: 15), "Explicit pause must remain after native background/foreground")
        tap(resume, app: app)
        XCTAssertTrue(app.buttons["Tạm dừng"].firstMatch.waitForExistence(timeout: 10))
        evidence("meditation-resumed", app: app)
    }
}

final class NativePersonalReminderTests: NativeGuestUITestCase {
    @MainActor
    private func allowPersonalNotificationPermission(_ app: XCUIApplication) {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let system = springboard.alerts.firstMatch
        let alert = system.waitForExistence(timeout: 15) ? system : app.alerts.firstMatch
        XCTAssertTrue(alert.waitForExistence(timeout: 10), "Opening personal reminders on a fresh install must request notification permission")
        let words = alert.staticTexts.allElementsBoundByIndex.map { $0.label }.joined(separator: " ").lowercased()
        XCTAssertTrue(words.contains("notification") || words.contains("thông báo"), "Only notification permission may be granted")
        let allow = alert.buttons.matching(NSPredicate(format: "label IN %@", ["Allow", "Cho phép", "Cho Phép"] as NSArray)).firstMatch
        XCTAssertTrue(allow.exists)
        allow.tap()
    }

    @MainActor
    private func openPersonal(_ app: XCUIApplication, requestPermission: Bool = false) {
        let summary = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Ngày lễ cá nhân ")).firstMatch
        tap(summary, app: app)
        if requestPermission { allowPersonalNotificationPermission(app) }
        let enabled = app.switches["Ngày Lễ Cá Nhân"].firstMatch
        reveal(enabled, app: app)
        XCTAssertEqual(checked(enabled), true, "Personal reminders must be enabled for these scenarios")
    }

    @MainActor
    private func relaunchPersonal(_ app: XCUIApplication) {
        app.terminate()
        app.launch()
        XCTAssertTrue(app.links["Cá nhân"].firstMatch.waitForExistence(timeout: 30))
        openSettings(app)
        openPersonal(app)
    }

    @MainActor
    private func namedControl(_ caption: String, app: XCUIApplication) -> XCUIElement {
        let matches = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", caption))
        reveal(matches.firstMatch, app: app)
        let viewport = app.frame
        // WebKit iOS có thể xuất HTML select thành Other có value, không nhất thiết PopUpButton.
        let candidates = matches.allElementsBoundByIndex.filter {
            $0.elementType != .staticText && $0.value != nil && insideViewport($0, viewport: viewport)
        }
        guard let control = candidates.first(where: { $0.label == caption }) ?? candidates.first else {
            evidence("missing-labelled-control-" + caption, app: app)
            XCTFail("Expected a labelled interactive control for \(caption)")
            return matches.firstMatch
        }
        return control
    }

    @MainActor
    private func finishNativePicker(_ app: XCUIApplication) {
        let done = app.buttons.matching(NSPredicate(format: "label IN %@", ["Done", "Xong", "Hoàn tất"] as NSArray)).firstMatch
        XCTAssertTrue(done.waitForExistence(timeout: 10), "Native picker must expose its real Done action")
        done.tap()
    }

    @MainActor
    private func select(_ caption: String, option: String, app: XCUIApplication) {
        let control = namedControl(caption, app: app)
        if (control.value as? String) == option { return }
        control.tap()
        let wheel = app.pickerWheels.firstMatch
        if wheel.waitForExistence(timeout: 2) {
            wheel.adjust(toPickerWheelValue: option)
            finishNativePicker(app)
        } else {
            let options = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", option))
            XCTAssertTrue(options.firstMatch.waitForExistence(timeout: 10), "Native select must expose the requested option")
            let viewport = app.frame
            guard let visible = options.allElementsBoundByIndex.first(where: { insideViewport($0, viewport: viewport) }) else {
                XCTFail("Expected visible native option \(option)")
                return
            }
            visible.tap()
        }
        waitUntil("Native select must retain the chosen option \(option)") { (control.value as? String) == option }
    }

    @MainActor
    private func replaceName(_ text: String, app: XCUIApplication) {
        let field = app.textFields["Tên ngày lễ *"].firstMatch
        tap(field, app: app)
        if let existing = field.value as? String, !existing.isEmpty, existing != (field.placeholderValue ?? "") {
            field.press(forDuration: 1.2)
            let label = NSPredicate(format: "label IN %@", ["Select All", "Chọn tất cả"] as NSArray)
            let button = app.buttons.matching(label).firstMatch
            let menu = app.menuItems.matching(label).firstMatch
            if button.waitForExistence(timeout: 2) { button.tap() }
            else {
                XCTAssertTrue(menu.waitForExistence(timeout: 5), "Editing an existing title requires the real Select All action")
                menu.tap()
            }
        }
        field.typeText(text)
        XCTAssertEqual(field.value as? String, text)
    }

    @MainActor
    private func saveEvent(_ title: String, app: XCUIApplication) {
        tap(app.buttons["Lưu ngày lễ"].firstMatch, app: app)
        waitUntil("A valid save must close the event draft editor") { !app.textFields["Tên ngày lễ *"].firstMatch.exists }
        XCTAssertTrue(app.staticTexts[title].firstMatch.waitForExistence(timeout: 15))
    }

    @MainActor
    private func addEvent(_ title: String, solar: Bool, day: Int, month: Int, app: XCUIApplication) {
        tap(app.buttons["+ Thêm ngày lễ kỷ niệm"].firstMatch, app: app)
        replaceName(title, app: app)
        if solar { tap(app.buttons["☀️ Dương lịch"].firstMatch, app: app) }
        select("Chu kỳ:", option: "Hàng năm", app: app)
        select(solar ? "Ngày Dương:" : "Ngày Âm lịch:", option: String(day), app: app)
        select(solar ? "Tháng Dương:" : "Tháng Âm lịch:", option: "Tháng \(month)", app: app)
        saveEvent(title, app: app)
    }

    @MainActor
    private func editEvent(_ title: String, app: XCUIApplication) {
        let name = app.textFields["Tên ngày lễ *"].firstMatch
        if name.exists && (name.value as? String) == title { return }
        let summary = app.staticTexts[title].firstMatch
        reveal(summary, app: app)
        let titleFrame = summary.frame
        let viewport = app.frame
        let edits = app.buttons["Sửa"].allElementsBoundByIndex
        guard let edit = edits.first(where: {
            let frame = $0.frame
            return frame.width > 0 && frame.height > 0 && viewport.contains(frame) &&
                abs(frame.midY - titleFrame.midY) < 80 && $0.isHittable
        }) else {
            XCTFail("Expected Edit action beside the named QA event \(title)")
            return
        }
        edit.tap()
        XCTAssertTrue(name.waitForExistence(timeout: 15))
        XCTAssertEqual(name.value as? String, title)
    }

    @MainActor
    private func collapseEditor(_ app: XCUIApplication) {
        tap(app.buttons["Thu gọn"].firstMatch, app: app)
        waitUntil("Unchanged editor must collapse") { !app.textFields["Tên ngày lễ *"].firstMatch.exists }
    }

    @MainActor
    private func deleteEvent(_ title: String, cancelFirst: Bool = false, app: XCUIApplication) {
        editEvent(title, app: app)
        tap(app.buttons["Xóa"].firstMatch, app: app)
        XCTAssertTrue(app.staticTexts["Xóa lịch cá nhân?"].firstMatch.waitForExistence(timeout: 10))
        if cancelFirst {
            tap(app.buttons["Giữ lại"].firstMatch, app: app)
            XCTAssertTrue(app.staticTexts[title].firstMatch.exists, "Cancel deletion must retain the named saved event")
            tap(app.buttons["Xóa"].firstMatch, app: app)
            XCTAssertTrue(app.staticTexts["Xóa lịch cá nhân?"].firstMatch.waitForExistence(timeout: 10))
        }
        tap(app.buttons["Xóa lịch"].firstMatch, app: app)
        waitUntil("Confirmed deletion must remove only the named QA event") { !app.staticTexts[title].firstMatch.exists }
    }

    @MainActor
    func testPersonalLunarSolarCrudInvalidDateCancelAndPersistence() {
        let app = launchGuest()
        openSettings(app)
        openPersonal(app, requestPermission: true)
        let lunar = "QA ngày âm cá nhân"
        let solar = "QA ngày dương cá nhân"
        let edited = "QA ngày dương đã sửa"
        addEvent(lunar, solar: false, day: 15, month: 7, app: app)
        addEvent(solar, solar: true, day: 7, month: 11, app: app)
        editEvent(solar, app: app)
        replaceName(edited, app: app)
        saveEvent(edited, app: app)
        relaunchPersonal(app)
        editEvent(lunar, app: app)
        XCTAssertEqual(namedControl("Ngày Âm lịch:", app: app).value as? String, "15")
        XCTAssertEqual(namedControl("Tháng Âm lịch:", app: app).value as? String, "Tháng 7")
        collapseEditor(app)
        editEvent(edited, app: app)
        XCTAssertEqual(namedControl("Ngày Dương:", app: app).value as? String, "7")
        XCTAssertEqual(namedControl("Tháng Dương:", app: app).value as? String, "Tháng 11")
        select("Ngày Dương:", option: "31", app: app)
        select("Tháng Dương:", option: "Tháng 2", app: app)
        tap(app.buttons["Lưu ngày lễ"].firstMatch, app: app)
        let invalid = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Ngày dương lịch không hợp lệ.")).firstMatch
        XCTAssertTrue(invalid.waitForExistence(timeout: 15), "31 February must be rejected through the actual UI")
        tap(app.buttons["Đóng"].firstMatch, app: app)
        XCTAssertEqual(app.textFields["Tên ngày lễ *"].firstMatch.value as? String, edited, "Invalid draft must retain its text")
        evidence("personal-invalid-date-retained", app: app)
        // Rời bản nháp chưa hợp lệ không được ghi đè ngày đã lưu trước đó.
        relaunchPersonal(app)
        editEvent(edited, app: app)
        XCTAssertEqual(namedControl("Ngày Dương:", app: app).value as? String, "7")
        XCTAssertEqual(namedControl("Tháng Dương:", app: app).value as? String, "Tháng 11")
        collapseEditor(app)
        let before = namedControl("Nhắc trước ngày lễ", app: app)
        XCTAssertEqual(checked(before), true)
        before.tap()
        waitUntil("The timing draft must reflect the disabled before-reminder checkbox") { self.checked(before) == false }
        tap(app.buttons["Hủy"].firstMatch, app: app)
        waitUntil("Cancel timing changes must restore the saved setting") { self.checked(before) == true }
        deleteEvent(edited, cancelFirst: true, app: app)
        XCTAssertTrue(app.staticTexts[lunar].firstMatch.exists, "Deleting solar event must preserve the other lunar event")
        deleteEvent(lunar, app: app)
        relaunchPersonal(app)
        XCTAssertFalse(app.staticTexts[edited].firstMatch.exists)
        XCTAssertFalse(app.staticTexts[lunar].firstMatch.exists)
        evidence("personal-crud-persisted-deletion", app: app)
    }

    @MainActor
    private func setReminderTime(_ fire: Date, app: XCUIApplication) {
        let field = namedControl("Nhắc trong ngày lễ — Giờ nhắc:", app: app)
        field.tap()
        let wheels = app.pickerWheels
        XCTAssertTrue(wheels.firstMatch.waitForExistence(timeout: 10), "Actual native time picker must open")
        XCTAssertTrue(wheels.count == 2 || wheels.count == 3, "Time picker must expose hour/minute and optional AM/PM wheels")
        let calendar = Calendar.current
        let hour = calendar.component(.hour, from: fire)
        let minute = calendar.component(.minute, from: fire)
        let hourWheel = wheels.element(boundBy: 0)
        let minuteWheel = wheels.element(boundBy: 1)
        let selectedHour = wheels.count == 3 ? (hour % 12 == 0 ? 12 : hour % 12) : hour
        let currentHour = (hourWheel.value as? String) ?? ""
        hourWheel.adjust(toPickerWheelValue: currentHour.hasPrefix("0") ? String(format: "%02d", selectedHour) : String(selectedHour))
        minuteWheel.adjust(toPickerWheelValue: String(format: "%02d", minute))
        if wheels.count == 3 {
            let period = wheels.element(boundBy: 2)
            let current = ((period.value as? String) ?? "").uppercased()
            let vietnamese = current.contains("SA") || current.contains("CH")
            period.adjust(toPickerWheelValue: hour < 12 ? (vietnamese ? "SA" : "AM") : (vietnamese ? "CH" : "PM"))
        }
        finishNativePicker(app)
        let expected = String(format: "%02d:%02d", hour, minute)
        let value = (field.value as? String) ?? ""
        let normalized = value.replacingOccurrences(of: "\u{202f}", with: " ").replacingOccurrences(of: "\u{00a0}", with: " ")
        let format = DateFormatter()
        format.locale = Locale(identifier: "en_US_POSIX")
        format.dateFormat = "h:mm a"
        let parsed = format.date(from: normalized)
        XCTAssertTrue(normalized == expected || (parsed.map { calendar.component(.hour, from: $0) == hour && calendar.component(.minute, from: $0) == minute } ?? false), "Native time field must show the requested local hour and minute")
        tap(app.buttons["Lưu cài đặt"].firstMatch, app: app)
        XCTAssertTrue(app.buttons["Lưu cài đặt"].firstMatch.waitForExistence(timeout: 30), "Personal reminder scheduling must finish")
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Nhắc trong ngày lúc " + expected)).firstMatch.waitForExistence(timeout: 10))
    }

    @MainActor
    func testPersonalNearFutureReminderDeliversToSystemAndCanBeDeleted() {
        let app = launchGuest()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        openSettings(app)
        openPersonal(app, requestPermission: true)
        let name = "QA thông báo ngày lễ riêng"
        // Dư bốn phút để thao tác picker thật trên CI; scheduler dùng cùng giờ địa phương của thiết bị.
        let calendar = Calendar.current
        let candidate = Date().addingTimeInterval(240)
        guard let fire = calendar.date(bySetting: .second, value: 0, of: candidate) else {
            XCTFail("Unable to construct the device-local reminder time")
            return
        }
        addEvent(name, solar: true, day: calendar.component(.day, from: fire), month: calendar.component(.month, from: fire), app: app)
        setReminderTime(fire, app: app)
        XCTAssertGreaterThan(fire.timeIntervalSinceNow, 15, "Real UI setup must finish before the scheduled local time")
        evidence("personal-reminder-scheduled", app: app)
        XCUIDevice.shared.press(.home)
        XCTAssertTrue(springboard.wait(for: .runningForeground, timeout: 10))
        let top = springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.12, dy: 0.01))
        let bottom = springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.12, dy: 0.80))
        top.press(forDuration: 0.1, thenDragTo: bottom)
        let title = "🗓️ Hôm nay: Ngày lễ cá nhân"
        let deliveredTitle = springboard.staticTexts[title].firstMatch
        let deliveredBody = springboard.staticTexts[name].firstMatch
        let grouped = springboard.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", title, name)).firstMatch
        waitUntil("iOS must actually deliver the personal anniversary notification with its exact QA event name", timeout: max(30, fire.timeIntervalSinceNow + 45)) {
            (deliveredTitle.exists && deliveredBody.exists) || grouped.exists
        }
        evidence("personal-reminder-system-received", app: springboard)
        app.activate()
        openSettings(app)
        openPersonal(app)
        deleteEvent(name, app: app)
        relaunchPersonal(app)
        XCTAssertFalse(app.staticTexts[name].firstMatch.exists, "Cleanup must remove only the synthetic QA anniversary")
        evidence("personal-reminder-cleanup", app: app)
    }
}
