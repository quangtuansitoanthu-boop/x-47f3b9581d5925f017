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
    func insideViewport(_ element: XCUIElement, app: XCUIApplication) -> Bool {
        guard element.exists else { return false }
        let frame = element.frame
        return frame.width > 0 && frame.height > 0 && app.frame.contains(frame) && element.isHittable
    }

    @MainActor
    func dismissPracticeSyncNotice(_ app: XCUIApplication) {
        // Chỉ xử lý banner công phu đã lưu, không chạm các nút Để sau của hướng dẫn/thông báo tài khoản.
        let message = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Đã lưu trên thiết bị. Đăng nhập lại để đồng bộ công phu.")).firstMatch
        guard message.exists, app.frame.intersects(message.frame) else { return }
        let noticeFrame = message.frame
        let candidates = app.buttons.matching(identifier: "Để sau").allElementsBoundByIndex
        if let later = candidates.first(where: {
            insideViewport($0, app: app) && $0.frame.minY >= noticeFrame.minY &&
            $0.frame.minY <= noticeFrame.maxY + 100 && $0.frame.midX >= noticeFrame.minX && $0.frame.midX <= noticeFrame.maxX
        }) {
            later.tap()
            waitUntil("Dismissed practice-sync notice must disappear") { !message.exists }
        }
    }

    @MainActor
    func reveal(_ element: XCUIElement, app: XCUIApplication) {
        XCTAssertTrue(element.waitForExistence(timeout: 25), "Expected actual native accessibility control")
        for _ in 0..<12 {
            dismissPracticeSyncNotice(app)
            if insideViewport(element, app: app) { return }
            if element.frame.midY < app.frame.midY { app.swipeDown() }
            else { app.swipeUp() }
        }
        evidence("unreachable-control-" + element.label, app: app)
        XCTAssertTrue(insideViewport(element, app: app), "Control must be visible and reachable inside the native viewport")
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
        let visible = links.allElementsBoundByIndex.filter { insideViewport($0, app: app) }
        guard let tab = visible.max(by: { $0.frame.midY < $1.frame.midY }) else {
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
        tap(sound, app: app)
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
