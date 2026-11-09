import XCTest
import UIKit

final class NativeGuestSmokeTests: XCTestCase {
    @MainActor
    private func evidence(_ name: String, app: XCUIApplication) {
        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = name
        screenshot.lifetime = .keepAlways
        add(screenshot)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name + "-accessibility"
        tree.lifetime = .keepAlways
        add(tree)
    }

    @MainActor
    private func launchGuest() -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN"]
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 30), "Native WKWebView must load")
        return app
    }

    @MainActor
    private func open(_ path: String, app: XCUIApplication) {
        // XCUIApplication.open is available from iOS 16.4; this test target requires 17.
        let later = app.webViews.buttons["Để sau"].firstMatch
        if later.waitForExistence(timeout: 3) { later.tap() }
        app.open(URL(string: "vn.quangtu.tutam:///" + path)!)
        if later.waitForExistence(timeout: 3) { later.tap() }
    }

    @MainActor
    private func confirmRosaryStart(_ app: XCUIApplication) {
        let start = app.webViews.buttons["Bắt đầu 🙏"].firstMatch
        XCTAssertTrue(start.waitForExistence(timeout: 20), "Existing rosary confirmation must open")
        start.tap()
        XCTAssertTrue(app.webViews.buttons["Quay lại tu tập"].firstMatch.waitForExistence(timeout: 10))
    }

    @MainActor
    private func openRosary(_ app: XCUIApplication) {
        open("tu-tap?action=rosary", app: app)
        confirmRosaryStart(app)
    }

    @MainActor
    private func reopenRosary(_ app: XCUIApplication) {
        let later = app.webViews.buttons["Để sau"].firstMatch
        if later.waitForExistence(timeout: 3) { later.tap() }
        // PracticeCatalog's real tool card preserves a warm app; URL opening starts another automation session.
        let card = app.webViews.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Lần tràng hạt")).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 20))
        for _ in 0..<8 {
            if card.isHittable { break }
            // Back and rotation preserve catalog scroll; the card may now be above the viewport.
            let viewport = app.webViews.firstMatch
            if card.frame.midY < viewport.frame.midY {
                viewport.swipeDown()
            } else {
                viewport.swipeUp()
            }
        }
        if !card.isHittable { evidence("rosary-catalog-reopen-failure", app: app) }
        XCTAssertTrue(card.isHittable)
        card.tap()
        confirmRosaryStart(app)
    }

    @MainActor
    private func rosaryCount(_ app: XCUIApplication) -> Int {
        // The modal exposes one plain numeric live counter; goals and cycle labels include other text.
        let counters = app.webViews.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "^[0-9]+$"))
        XCTAssertEqual(counters.count, 1, "Rosary counter must be uniquely exposed to accessibility")
        let value = Int(counters.firstMatch.label)
        XCTAssertNotNil(value)
        return value ?? -1
    }

    @MainActor
    func testRosaryBackPreservesCountInPortraitAndLandscape() {
        let app = launchGuest()
        defer {
            evidence("rosary-final", app: app)
            XCUIDevice.shared.orientation = .portrait
        }
        for pass in 1...5 {
            for orientation in [UIDeviceOrientation.portrait, .landscapeLeft] {
                XCUIDevice.shared.orientation = orientation
                let name = "rosary-pass-\(pass)-\(orientation == .portrait ? "portrait" : "landscape")"
                if pass == 1 && orientation == .portrait { openRosary(app) }
                else { reopenRosary(app) }
                let count = rosaryCount(app)
                let bead = app.webViews.buttons["Niệm một hạt"].firstMatch
                XCTAssertTrue(bead.isHittable)
                bead.tap()
                let updated = app.webViews.staticTexts[String(count + 1)].firstMatch
                XCTAssertTrue(updated.waitForExistence(timeout: 5))
                XCTAssertEqual(rosaryCount(app), count + 1)
                let back = app.webViews.buttons["Quay lại tu tập"].firstMatch
                XCTAssertTrue(back.isHittable, "Back must receive a real native accessibility tap")
                XCTAssertGreaterThanOrEqual(back.frame.width, 44)
                XCTAssertGreaterThanOrEqual(back.frame.height, 44)
                XCTAssertTrue(app.frame.contains(back.frame), "Back must remain inside the native viewport")
                evidence(name, app: app)
                back.tap()
                let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: back)
                XCTAssertEqual(XCTWaiter.wait(for: [closed], timeout: 10), .completed)
                reopenRosary(app)
                XCTAssertEqual(rosaryCount(app), count + 1, "Back must preserve the existing rosary count")
                app.webViews.buttons["Quay lại tu tập"].firstMatch.tap()
            }
        }
    }

    @MainActor
    private func motionSwitch(_ app: XCUIApplication) -> XCUIElement {
        let label = "Hiệu ứng chuyển động"
        let toggle = app.webViews.switches[label].firstMatch
        if toggle.exists { return toggle }
        return app.webViews.buttons[label].firstMatch
    }

    @MainActor
    private func checked(_ element: XCUIElement) -> Bool? {
        if let value = element.value as? String {
            switch value.lowercased() {
            case "1", "true": return true
            case "0", "false": return false
            default: return nil
            }
        }
        return (element.value as? NSNumber)?.boolValue
    }

    @MainActor
    private func setMotion(_ enabled: Bool, app: XCUIApplication) {
        let toggle = motionSwitch(app)
        XCTAssertTrue(toggle.exists)
        XCTAssertNotNil(checked(toggle), "The actual switch must expose its checked state")
        if checked(toggle) != enabled { toggle.tap() }
        let expected = enabled ? ["1", "true", "TRUE"] : ["0", "false", "FALSE"]
        let changed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value IN %@ OR value == %@", expected as NSArray, NSNumber(value: enabled)), object: toggle)
        XCTAssertEqual(XCTWaiter.wait(for: [changed], timeout: 5), .completed)
        XCTAssertEqual(checked(toggle), enabled)
    }

    @MainActor
    func testMotionSettingPersistsAcrossNativeDeepLinks() {
        let app = launchGuest()
        defer { evidence("motion-final", app: app) }
        open("ca-nhan?tab=settings", app: app)
        let appearance = app.webViews.buttons["Giao diện & ngôn ngữ"].firstMatch
        XCTAssertTrue(appearance.waitForExistence(timeout: 20))
        for _ in 0..<8 {
            if appearance.isHittable { break }
            app.webViews.firstMatch.swipeUp()
        }
        XCTAssertTrue(appearance.isHittable)
        appearance.tap()
        for _ in 0..<8 {
            if motionSwitch(app).isHittable { break }
            app.webViews.firstMatch.swipeUp()
        }
        XCTAssertTrue(motionSwitch(app).isHittable)
        XCTAssertEqual(checked(motionSwitch(app)), true, "Fresh guest installation defaults to motion enabled")
        setMotion(false, app: app)
        evidence("motion-off", app: app)
        openRosary(app)
        evidence("rosary-motion-off", app: app)
        app.webViews.buttons["Quay lại tu tập"].firstMatch.tap()
        open("ca-nhan?tab=settings", app: app)
        let reloadedAppearance = app.webViews.buttons["Giao diện & ngôn ngữ"].firstMatch
        XCTAssertTrue(reloadedAppearance.waitForExistence(timeout: 20))
        for _ in 0..<8 {
            if reloadedAppearance.isHittable { break }
            app.webViews.firstMatch.swipeUp()
        }
        if !motionSwitch(app).exists { reloadedAppearance.tap() }
        for _ in 0..<8 {
            if motionSwitch(app).isHittable { break }
            app.webViews.firstMatch.swipeUp()
        }
        XCTAssertEqual(checked(motionSwitch(app)), false)
        setMotion(true, app: app)
        evidence("motion-on", app: app)
    }
    @MainActor
    func testExistingNotificationButtonDeliversToSystemNotificationCenter() {
        XCUIDevice.shared.orientation = .portrait
        let app = launchGuest()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        defer {
            evidence("notification-app-final", app: app)
            evidence("notification-system-final", app: springboard)
        }
        let title = "🔔 Kiểm tra thông báo Tu Tập"
        let bodyPrefix = "Nhắc nhở tu tập hoạt động tốt!"

        // Fresh-install precondition is enforced by the CI Simulator lifecycle;
        // no notification settings are changed through test-only app code.
        open("ca-nhan?tab=settings", app: app)
        // Types grounded in ios-native-smoke-10 motion-failure-accessibility.txt:
        // master is Switch, summary title is nested Button (not StaticText).
        let master = app.webViews.switches["Bật thông báo nhắc nhở tu tập"].firstMatch
        XCTAssertTrue(master.waitForExistence(timeout: 20))
        XCTAssertEqual(master.value as? String, "1", "Fresh installation must enable reminder controls")
        let section = app.webViews.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Âm thanh & rung thông báo Âm thanh:")).firstMatch
        for _ in 0..<10 {
            if section.isHittable { break }
            app.webViews.firstMatch.swipeUp()
        }
        XCTAssertTrue(section.isHittable, "Fresh install must have reminders enabled")
        let send = app.webViews.buttons["🔔 Gửi thử thông báo mẫu"].firstMatch
        // SettingsSection renders <details>; its children remain mounted while closed.
        // The fresh-install activeSection is empty, so open its summary exactly once.
        if !send.exists { section.tap() }
        evidence("notification-section-open", app: app)
        for _ in 0..<6 {
            if send.isHittable { break }
            app.webViews.firstMatch.swipeUp()
        }
        if !send.isHittable { evidence("notification-send-unreachable", app: app) }
        XCTAssertTrue(send.isHittable)
        send.tap()

        // Handle only a notification-permission dialog. Never use CONTAINS 'Allow',
        // which can match the refusal button. Unexpected dialogs fail with evidence.
        let systemPermission = springboard.alerts.firstMatch
        let permission = systemPermission.waitForExistence(timeout: 10)
            ? systemPermission : app.alerts.firstMatch
        XCTAssertTrue(permission.waitForExistence(timeout: 10), "Expected fresh-install notification permission dialog")
        let dialog = permission.staticTexts.allElementsBoundByIndex.map { $0.label }.joined(separator: " ").lowercased()
        XCTAssertTrue(dialog.contains("notification") || dialog.contains("thông báo"), "Only notification authorization may be accepted")
        let allow = permission.buttons.matching(NSPredicate(format: "label IN %@", ["Allow", "Cho phép", "Cho Phép"] as NSArray)).firstMatch
        XCTAssertTrue(allow.exists, "Expected exact affirmative notification permission button")
        allow.tap()

        // Permission-granting invocation itself schedules the immediate request.
        // Do not send again: repeated ID/title would weaken the fresh-delivery proof.
        // Existing status appears only after the native schedule promise resolves.
        // Keep WebView foreground until acceptance; this is not OS receipt proof.
        let accepted = app.webViews.staticTexts["Đã gửi thông báo kiểm tra!"].firstMatch
        XCTAssertTrue(accepted.waitForExistence(timeout: 20), "Existing UI must confirm native scheduling acceptance before Home")
        XCUIDevice.shared.press(.home)
        XCTAssertTrue(springboard.wait(for: .runningForeground, timeout: 10))
        // Near-left top avoids the centered camera cutout and right-side Control Center.
        let top = springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.12, dy: 0.01))
        let bottom = springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.12, dy: 0.80))
        top.press(forDuration: 0.1, thenDragTo: bottom)

        // Query SpringBoard only; the application's success toast cannot satisfy this.
        let deliveredTitle = springboard.staticTexts[title].firstMatch
        let deliveredBody = springboard.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", bodyPrefix)).firstMatch
        let groupedNotification = springboard.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", title, bodyPrefix)
        ).firstMatch
        let delivered = XCTNSPredicateExpectation(
            predicate: NSPredicate { _, _ in
                (deliveredTitle.exists && deliveredBody.exists) || groupedNotification.exists
            },
            object: springboard
        )
        XCTAssertEqual(XCTWaiter.wait(for: [delivered], timeout: 20), .completed,
                       "OS Notification Center must expose both the exact title and body, separately or grouped")
        evidence("notification-system-received", app: springboard)
    }

}

final class NativeExtendedGuestTests: XCTestCase {
    @MainActor
    private func capture(_ name: String, app: XCUIApplication) {
        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = name
        screenshot.lifetime = .keepAlways
        add(screenshot)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name + "-accessibility"
        tree.lifetime = .keepAlways
        add(tree)
    }

    @MainActor
    private func launch() -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN"]
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 30))
        return app
    }

    @MainActor
    private func open(_ path: String, app: XCUIApplication) {
        let later = app.webViews.buttons["Để sau"].firstMatch
        if later.waitForExistence(timeout: 3) { later.tap() }
        app.open(URL(string: "vn.quangtu.tutam:///" + path)!)
        if later.waitForExistence(timeout: 3) { later.tap() }
    }

    @MainActor
    private func reveal(_ element: XCUIElement, app: XCUIApplication) {
        let exists = element.waitForExistence(timeout: 25)
        if !exists { capture("missing-control", app: app) }
        XCTAssertTrue(exists)
        for _ in 0..<10 {
            if element.isHittable { break }
            let viewport = app.webViews.firstMatch
            if element.frame.midY < viewport.frame.midY { viewport.swipeDown() }
            else { viewport.swipeUp() }
        }
        XCTAssertTrue(element.isHittable, "Control must be reachable by touch")
    }

    @MainActor
    private func librarySearch(_ app: XCUIApplication) -> XCUIElement {
        let field = app.webViews.searchFields.firstMatch
        if field.waitForExistence(timeout: 20) { return field }
        let fallback = app.webViews.textFields["Tìm kiếm bài viết"].firstMatch
        XCTAssertTrue(fallback.waitForExistence(timeout: 10))
        return fallback
    }

    @MainActor
    func testOfflineLibrarySearchChapterReadingAndLargeTextRotation() {
        let app = launch()
        defer { capture("offline-reader-final", app: app); XCUIDevice.shared.orientation = .portrait }
        open("kinh-sach", app: app)
        let search = librarySearch(app)
        search.tap()
        search.typeText("Kinh Địa Tạng Bồ Tát Bổn Nguyện Giảng Giải")
        let book = app.webViews.buttons["Đọc ngay Kinh Địa Tạng Bồ Tát Bổn Nguyện Giảng Giải"].firstMatch
        reveal(book, app: app)
        capture("offline-library-search", app: app)
        book.tap()
        let chapter = app.webViews.buttons.matching(NSPredicate(format: "label CONTAINS[cd] %@", "Duyên Khởi Của Pháp Hội Giảng Kinh")).firstMatch
        reveal(chapter, app: app)
        chapter.tap()
        let body = app.webViews.staticTexts.matching(NSPredicate(format: "label CONTAINS[cd] %@", "Tất cả mọi nơi đều là đạo tràng")).firstMatch
        XCTAssertTrue(body.waitForExistence(timeout: 30), "Bundled chapter body must render while production hosts are blocked")
        let larger = app.webViews.buttons["Chữ lớn hơn"].firstMatch
        reveal(larger, app: app)
        for _ in 0..<3 { larger.tap() }
        capture("offline-reader-large-text-portrait", app: app)
        XCUIDevice.shared.orientation = .landscapeLeft
        let close = app.webViews.buttons["Đóng"].firstMatch
        reveal(close, app: app)
        XCTAssertLessThanOrEqual(close.frame.maxX, app.frame.maxX + 2)
        XCTAssertGreaterThanOrEqual(close.frame.minX, app.frame.minX - 2)
        capture("offline-reader-large-text-landscape", app: app)
        close.tap()
        XCTAssertTrue(librarySearch(app).exists)
    }

    @MainActor
    func testNativeCatalogExcludesWebOnlyBookAndSearchCanBeCleared() {
        let app = launch()
        defer { capture("native-web-only-policy-final", app: app) }
        open("kinh-sach", app: app)
        let search = librarySearch(app)
        search.tap()
        search.typeText("Kinh Địa Tạng Bồ Tát Bổn Nguyện Giảng Giải")
        XCTAssertTrue(app.webViews.buttons["Đọc ngay Kinh Địa Tạng Bồ Tát Bổn Nguyện Giảng Giải"].firstMatch.waitForExistence(timeout: 25))
        let clear = app.webViews.buttons["Xóa tìm kiếm"].firstMatch
        reveal(clear, app: app)
        clear.tap()
        search.tap()
        search.typeText("Muôn Kiếp Nhân Sinh")
        XCTAssertTrue(app.webViews.staticTexts["Không tìm thấy bài viết phù hợp."].firstMatch.waitForExistence(timeout: 20))
        XCTAssertEqual(app.webViews.buttons.matching(NSPredicate(format: "label BEGINSWITH %@ AND label CONTAINS[cd] %@", "Đọc ngay", "Muôn Kiếp Nhân Sinh")).count, 0)
        capture("native-web-only-search-empty", app: app)
        reveal(clear, app: app)
        clear.tap()
        search.tap()
        search.typeText("Kinh Địa Tạng Bồ Tát Bổn Nguyện Giảng Giải")
        XCTAssertTrue(app.webViews.buttons["Đọc ngay Kinh Địa Tạng Bồ Tát Bổn Nguyện Giảng Giải"].firstMatch.waitForExistence(timeout: 20))
    }

    @MainActor
    func testLightDarkSettingsAndGuestDeepLinkNavigation() {
        let app = launch()
        defer { capture("guest-navigation-final", app: app); XCUIDevice.shared.orientation = .portrait }
        for (theme, name) in [("🌙 Giao diện Tối", "dark"), ("☀️ Giao diện Sáng", "light")] {
            open("ca-nhan?tab=settings", app: app)
            let appearance = app.webViews.buttons["Giao diện & ngôn ngữ"].firstMatch
            reveal(appearance, app: app)
            let choice = app.webViews.switches[theme].firstMatch
            if !choice.isHittable { appearance.tap() }
            reveal(choice, app: app)
            choice.tap()
            XCTAssertEqual(choice.value as? String, "1", "Selected theme must become active")
            capture("settings-" + name, app: app)
            open("kinh-sach", app: app)
            XCTAssertTrue(librarySearch(app).isHittable)
            capture("library-" + name, app: app)
            open("tu-tap", app: app)
            XCTAssertTrue(app.webViews.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Lần tràng hạt")).firstMatch.waitForExistence(timeout: 20))
            capture("practice-" + name, app: app)
        }
    }

    @MainActor
    func testMeditationPauseResumeSurvivesNativeBackgrounding() {
        let app = launch()
        defer { capture("meditation-lifecycle-final", app: app); app.terminate() }
        open("tu-tap?action=meditation", app: app)
        let start = app.webViews.buttons["Bắt đầu thiền"].firstMatch
        reveal(start, app: app)
        start.tap()
        let pause = app.webViews.buttons["Tạm dừng"].firstMatch
        reveal(pause, app: app)
        pause.tap()
        let resume = app.webViews.buttons["Tiếp tục"].firstMatch
        XCTAssertTrue(resume.waitForExistence(timeout: 10))
        capture("meditation-paused", app: app)
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(resume.waitForExistence(timeout: 15), "Explicit pause must remain after returning from background")
        resume.tap()
        XCTAssertTrue(pause.waitForExistence(timeout: 10))
        capture("meditation-resumed", app: app)
    }
}
