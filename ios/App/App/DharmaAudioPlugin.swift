import AVFoundation
import Capacitor
import CryptoKit
import MediaPlayer
import UIKit
import WidgetKit

@objc(DharmaAudioPlugin)
public class DharmaAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public static let shared = DharmaAudioPlugin()
    public let identifier = "DharmaAudioPlugin"
    public let jsName = "DharmaAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        "setQueue", "play", "pause", "stop", "seek", "options", "sleep", "getState", "peek",
        "cacheStatus", "cacheChunk", "backgroundStatus", "openBackgroundSettings", "selectPrincipal"
    ].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }

    private let player = AVPlayer()
    private var tracks: [JSObject] = []
    private var album: JSObject = [:]
    private var queueID = ""
    private var index = 0
    private var speed: Float = 1
    private var repeatMode = 0
    private var intendedPlaying = false
    private var ended = false
    private var pausedAtTrackEnd = false
    private var errorMessage = ""
    private var sleepRemaining: Double = 0
    private var sleepAtEnd = false
    private var lastTick = ProcessInfo.processInfo.systemUptime
    private var wasPlaying = false
    private var resumeAfterInterruption = false
    private var itemGeneration = 0
    private var seekGeneration = 0
    private var pendingSeekPosition: Double?
    private var pendingSeekCall: CAPPluginCall?
    private var seekTimeout: DispatchWorkItem?
    private var retainedPosition: Double = 0
    private var itemStatus: NSKeyValueObservation?
    private var timeStatus: NSKeyValueObservation?
    private var endObserver: NSObjectProtocol?
    private var timeObserver: Any?
    private var observers: [NSObjectProtocol] = []
    private var commands: [(MPRemoteCommand, Any)] = []
    private var artworkTask: URLSessionDataTask?
    private var artworkRequestID = UUID()
    private var artwork: MPMediaItemArtwork?
    private var widgetArtworkVerified = false
    private var widgetArtworkKey: String?
    private var configured = false
    private var widgetFingerprint = ""
    private var widgetSavedAt = Date.distantPast
    private var widgetReload: DispatchWorkItem?
    private var selectedWidgetPrincipal: String?

    public override func load() {
        DispatchQueue.main.async { [weak self] in self?.configure() }
    }

    private func configure() {
        guard !configured else { return }
        configured = true
        player.actionAtItemEnd = .pause
        timeStatus = player.observe(\.timeControlStatus, options: [.new]) { [weak self] _, _ in
            DispatchQueue.main.async { self?.publish() }
        }
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 1, preferredTimescale: 600), queue: .main) { [weak self] _ in
            guard let self = self, !self.queueID.isEmpty else { return }
            self.publish()
        }
        observe(NativeAudioSession.willStart) { [weak self] note in
            guard let self = self, note.object as AnyObject? !== self else { return }
            self.pausePlayback()
        }
        observe(AVAudioSession.interruptionNotification) { [weak self] note in self?.interrupted(note) }
        observe(AVAudioSession.routeChangeNotification) { [weak self] note in
            if let reason = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
               reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue { self?.pausePlayback() }
        }
        observe(AVAudioSession.mediaServicesWereResetNotification) { [weak self] _ in
            // Không tự phát lại sau khi audio service của hệ điều hành bị reset.
            self?.pausePlayback()
            self?.errorMessage = "Audio service was reset. Please play the track again."
            self?.publish()
        }
        configureCommands()
    }

    private func observe(_ name: Notification.Name, handler: @escaping (Notification) -> Void) {
        observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main, using: handler))
    }

    private func execute(_ call: CAPPluginCall, operation: @escaping () throws -> Void) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.reject("Audio bridge closed", "CLOSED"); return }
            do { try operation(); self.publish(); call.resolve(self.state(includeAlbum: true)) }
            catch { call.reject("Cannot update playback", "PLAYBACK_FAILED", error) }
        }
    }

    @objc public func setQueue(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.reject("Audio bridge closed", "CLOSED"); return }
            do {
                guard let rows = call.getArray("tracks", JSObject.self), !rows.isEmpty, rows.count <= 10000,
                      let id = call.getString("queueId"), !id.isEmpty else { throw self.failure("Invalid playlist") }
                let selected = call.getInt("index") ?? 0
                guard rows.indices.contains(selected), rows.allSatisfy({ row in
                    guard let source = row["url"] as? String else { return false }
                    return (try? self.sourceURL(source)) != nil
                }) else { throw self.failure("Invalid track") }
                self.pausePlayback()
                self.cancelPendingSeek()
                self.queueID = id; self.tracks = rows; self.index = selected; self.ended = false; self.pausedAtTrackEnd = false; self.errorMessage = ""
                self.sleepRemaining = 0; self.sleepAtEnd = false
                self.album = ["id": call.getString("albumId") ?? "", "title": call.getString("album") ?? "",
                    "description": call.getString("artist") ?? "", "artwork": call.getString("originalArtwork") ?? "", "tracks": rows]
                self.saveWidgetRecoveryQueue()
                try self.loadTrack(position: max(0, call.getDouble("position") ?? 0), autoplay: false, call: call)
                self.loadArtwork(call.getString("artwork") ?? "")
            } catch { call.reject("Cannot update playback", "PLAYBACK_FAILED", error) }
        }
    }

    private func failure(_ message: String) -> NSError { NSError(domain: "TuTapAudio", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
    private func cacheURL(_ key: String, partial: Bool = false) throws -> URL {
        let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("DharmaAudio", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let hash = SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
        // AVPlayer receives a local file URL. Keep the generated rhythm's WAV extension.
        let isRosaryWave = key.hasPrefix("asset:///public/assets/audio/rosary-rhythm-v2-") && key.hasSuffix(".wav")
        let fileExtension = isRosaryWave ? ".wav" : ".audio"
        return root.appendingPathComponent(hash + (partial ? ".part" : fileExtension))
    }
    private func sourceURL(_ source: String) throws -> URL {
        if source.hasPrefix("asset:///public/") {
            let root = Bundle.main.bundleURL.appendingPathComponent("public", isDirectory: true).standardizedFileURL
            let relative = String(source.dropFirst("asset:///public/".count)).removingPercentEncoding ?? ""
            let file = root.appendingPathComponent(relative).standardizedFileURL
            guard file.path.hasPrefix(root.path + "/") else { throw failure("Invalid local asset") }
            return file
        }
        guard let url = URL(string: source), url.scheme == "https", url.user == nil, url.password == nil else {
            throw failure("Unsupported audio URL")
        }
        return url
    }
    private func playbackURL(_ source: String) throws -> URL {
        let cached = try cacheURL(source)
        if FileManager.default.fileExists(atPath: cached.path) { return cached }
        return try sourceURL(source)
    }

    private func loadTrack(position: Double, autoplay: Bool, call: CAPPluginCall? = nil) throws {
        guard tracks.indices.contains(index), let source = tracks[index]["url"] as? String else { throw failure("Missing track") }
        let url = try playbackURL(source)
        itemGeneration += 1
        let generation = itemGeneration
        cancelPendingSeek()
        itemStatus?.invalidate()
        if let observer = endObserver { NotificationCenter.default.removeObserver(observer) }
        endObserver = nil
        player.pause()
        ended = false; pausedAtTrackEnd = false; errorMessage = ""; intendedPlaying = autoplay
        let item = AVPlayerItem(url: url)
        itemStatus = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            DispatchQueue.main.async {
                guard let self = self, generation == self.itemGeneration else { return }
                if item.status == .failed {
                    self.errorMessage = item.error?.localizedDescription ?? "Cannot play audio"
                    self.intendedPlaying = false
                    self.cancelPendingSeek(code: "PLAYBACK_FAILED", message: "Cannot play audio")
                    NativeAudioSession.deactivate(self)
                }
                self.publish()
            }
        }
        endObserver = NotificationCenter.default.addObserver(forName: AVPlayerItem.didPlayToEndTimeNotification, object: item, queue: .main) { [weak self] _ in
            guard let self = self, generation == self.itemGeneration else { return }
            self.trackFinished()
        }
        player.replaceCurrentItem(with: item)
        lastTick = ProcessInfo.processInfo.systemUptime; wasPlaying = false
        beginSeek(position: position.isFinite ? max(0, position) : 0, call: call)
    }

    private func cancelPendingSeek(code: String = "SEEK_CANCELLED", message: String = "Seek was superseded") {
        seekGeneration += 1
        seekTimeout?.cancel(); seekTimeout = nil
        pendingSeekPosition = nil
        let call = pendingSeekCall
        pendingSeekCall = nil
        player.currentItem?.cancelPendingSeeks()
        call?.reject(message, code)
    }

    private func beginSeek(position: Double, call: CAPPluginCall? = nil) {
        tickSleep()
        cancelPendingSeek()
        let seekID = seekGeneration
        let generation = itemGeneration
        pendingSeekPosition = position
        retainedPosition = position
        pendingSeekCall = call
        errorMessage = ""
        // KVO có thể chạy trước seek completion; không phát hoặc ghi tiến độ 0 tạm thời.
        player.pause()
        wasPlaying = false
        let timeout = DispatchWorkItem { [weak self] in
            guard let self = self, generation == self.itemGeneration, seekID == self.seekGeneration,
                  self.pendingSeekPosition != nil else { return }
            self.errorMessage = "Audio seek timed out. Please try again."
            self.intendedPlaying = false
            self.cancelPendingSeek(code: "SEEK_TIMEOUT", message: "Audio seek timed out")
            NativeAudioSession.deactivate(self)
            self.publish()
        }
        seekTimeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 30, execute: timeout)
        player.seek(to: CMTime(seconds: position, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] finished in
            DispatchQueue.main.async {
                guard let self = self, generation == self.itemGeneration, seekID == self.seekGeneration else { return }
                guard finished, self.player.currentItem?.status != .failed else {
                    self.errorMessage = "Cannot seek audio. Please try again."
                    self.intendedPlaying = false
                    self.cancelPendingSeek(code: "SEEK_CANCELLED", message: "Cannot seek audio")
                    NativeAudioSession.deactivate(self)
                    self.publish()
                    return
                }
                self.pendingSeekPosition = nil
                self.seekTimeout?.cancel(); self.seekTimeout = nil
                let pendingCall = self.pendingSeekCall
                self.pendingSeekCall = nil
                self.lastTick = ProcessInfo.processInfo.systemUptime
                if self.intendedPlaying { self.player.playImmediately(atRate: self.speed) }
                self.publishWidget(force: true)
                self.publish()
                pendingCall?.resolve(self.state(includeAlbum: true))
            }
        }
    }

    private func startPlayback() throws {
        if isRosaryPlayback && ended { throw failure("Rosary session has completed") }
        guard !queueID.isEmpty, player.currentItem != nil else { throw failure("No active playlist") }
        try NativeAudioSession.activate(self)
        resumeAfterInterruption = false
        if pausedAtTrackEnd {
            pausedAtTrackEnd = false
            if repeatMode != 1 && index + 1 < tracks.count { index += 1 }
            else if repeatMode == 2 { index = 0 }
            try loadTrack(position: 0, autoplay: true)
        }
        if ended { try loadTrack(position: 0, autoplay: true) }
        if player.currentItem?.status == .failed {
            // Tạo lại item lỗi ở vị trí đã giữ; play không tải lại item đã thất bại.
            try loadTrack(position: retainedPosition, autoplay: true)
            return
        }
        intendedPlaying = true; ended = false
        lastTick = ProcessInfo.processInfo.systemUptime
        if pendingSeekPosition == nil { player.playImmediately(atRate: speed) }
    }
    private func pausePlayback() {
        tickSleep()
        intendedPlaying = false; wasPlaying = false; resumeAfterInterruption = false
        player.pause()
        NativeAudioSession.deactivate(self)
        publish()
    }
    private func trackFinished() {
        tickSleep()
        if sleepAtEnd {
            sleepAtEnd = false; sleepRemaining = 0; intendedPlaying = false; wasPlaying = false
            pausedAtTrackEnd = true
            player.pause(); NativeAudioSession.deactivate(self); publish(); return
        }
        let next = repeatMode == 1 ? index : index + 1 < tracks.count ? index + 1 : repeatMode == 2 ? 0 : -1
        guard next >= 0 else {
            ended = true; intendedPlaying = false; wasPlaying = false
            player.pause(); NativeAudioSession.deactivate(self); publish(); return
        }
        index = next
        do { try loadTrack(position: 0, autoplay: intendedPlaying); publish() }
        catch { errorMessage = error.localizedDescription; intendedPlaying = false; publish() }
    }
    private func tickSleep() {
        let now = ProcessInfo.processInfo.systemUptime
        if sleepRemaining > 0 && wasPlaying {
            sleepRemaining = max(0, sleepRemaining - max(0, now - lastTick) * 1000)
            if sleepRemaining == 0 { intendedPlaying = false; player.pause(); NativeAudioSession.deactivate(self) }
        }
        lastTick = now
        wasPlaying = player.timeControlStatus == .playing
    }
    private func seconds(_ time: CMTime) -> Double { let value = time.seconds; return value.isFinite ? max(0, value) : 0 }
    private func playbackPosition() -> Double {
        if let position = pendingSeekPosition { return position }
        if errorMessage.isEmpty { retainedPosition = seconds(player.currentTime()) }
        return retainedPosition
    }
    private func state(includeAlbum: Bool = false) -> JSObject {
        var value: JSObject = ["queueId": queueID, "trackIndex": index, "position": playbackPosition(), "observedAtMs": Date().timeIntervalSince1970 * 1000,
            "duration": seconds(player.currentItem?.duration ?? .zero), "playing": player.timeControlStatus == .playing,
            "playWhenReady": intendedPlaying, "buffering": pendingSeekPosition != nil || player.timeControlStatus == .waitingToPlayAtSpecifiedRate,
            "ended": ended, "speed": Double(speed), "volume": Double(player.volume), "repeat": repeatMode,
            "error": errorMessage, "sleepRemainingMs": sleepRemaining, "sleepAtEnd": sleepAtEnd]
        if includeAlbum && !queueID.isEmpty { value["album"] = album }
        return value
    }
    private func publish() {
        tickSleep()
        updateNowPlaying()
        publishWidget()
        notifyListeners("state", data: state())
    }

    @objc public func play(_ call: CAPPluginCall) { execute(call) { try self.startPlayback() } }
    @objc public func pause(_ call: CAPPluginCall) { execute(call) { self.pausePlayback() } }
    @objc public func stop(_ call: CAPPluginCall) {
        execute(call) { self.stopAndClearWidget() }
    }

    private func stopAndClearWidget() {
        pausePlayback(); itemGeneration += 1
        cancelPendingSeek(); retainedPosition = 0
        itemStatus?.invalidate(); itemStatus = nil
        if let observer = endObserver { NotificationCenter.default.removeObserver(observer) }
        endObserver = nil
        player.replaceCurrentItem(with: nil)
        queueID = ""; album = [:]; tracks = []; index = 0; ended = false; pausedAtTrackEnd = false
        sleepRemaining = 0; sleepAtEnd = false
        artworkRequestID = UUID()
        artworkTask?.cancel(); artworkTask = nil; artwork = nil; widgetArtworkVerified = false; widgetArtworkKey = nil
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        clearWidgetRecovery()
    }

    @objc public func selectPrincipal(_ call: CAPPluginCall) {
        execute(call) {
            guard let key = call.getString("principalKey"), !key.isEmpty, key.utf8.count <= 1024,
                  !key.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
                  let url = self.recoveryFile("dharma-widget-principal.txt") else { throw self.failure("Invalid audio principal") }
            let previous = self.widgetPrincipalOnDisk()
            if previous != key {
                // Bản lưu chưa có owner không được nhận làm dữ liệu của tài khoản vừa đăng nhập.
                self.stopAndClearWidget()
            }
            do {
                try Data(key.utf8).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                var excluded = url
                var values = URLResourceValues(); values.isExcludedFromBackup = true
                try excluded.setResourceValues(values)
                self.selectedWidgetPrincipal = key
            } catch {
                self.selectedWidgetPrincipal = nil
                self.stopAndClearWidget()
                throw error
            }
        }
    }
    @objc public func seek(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.reject("Audio bridge closed", "CLOSED"); return }
            guard !self.isRosaryPlayback else { call.reject("Rosary seeking is unavailable", "ROSARY_SEEK_DISABLED"); return }
            let position = call.getDouble("position") ?? 0
            guard position.isFinite, self.player.currentItem != nil else { call.reject("Invalid seek position", "INVALID_SEEK"); return }
            self.ended = false; self.pausedAtTrackEnd = false
            self.errorMessage = ""
            self.beginSeek(position: max(0, position), call: call)
        }
    }
    @objc public func options(_ call: CAPPluginCall) {
        execute(call) {
            if self.isRosaryPlayback,
               (call.getDouble("speed").map { $0 != 1 } ?? false) || (call.getInt("repeat").map { $0 != 0 } ?? false) {
                throw self.failure("Rosary cadence is fixed for this session")
            }
            if let rate = call.getDouble("speed"), rate.isFinite {
                self.speed = Float(min(3, max(0.3, rate)))
                if self.intendedPlaying && self.pendingSeekPosition == nil { self.player.rate = self.speed }
            }
            if let volume = call.getDouble("volume"), volume.isFinite { self.player.volume = Float(min(1, max(0, volume))) }
            if let mode = call.getInt("repeat"), (0...2).contains(mode) { self.repeatMode = mode }
        }
    }
    @objc public func sleep(_ call: CAPPluginCall) {
        execute(call) {
            self.tickSleep()
            let value = call.getDouble("remainingMs") ?? 0
            self.sleepRemaining = value.isFinite ? max(0, value) : 0
            self.sleepAtEnd = call.getBool("atEnd") ?? false
        }
    }
    @objc public func getState(_ call: CAPPluginCall) { execute(call) {} }
    @objc public func peek(_ call: CAPPluginCall) { execute(call) {} }
    @objc public func backgroundStatus(_ call: CAPPluginCall) { call.resolve(["restricted": false, "batteryOptimized": false]) }
    @objc public func openBackgroundSettings(_ call: CAPPluginCall) {
        // iOS không có trang miễn tối ưu pin như Android; không dùng private URL scheme.
        call.reject("Background audio is managed by iOS", "UNAVAILABLE")
    }

    @objc public func cacheStatus(_ call: CAPPluginCall) {
        do {
            let key = call.getString("key") ?? ""
            _ = try sourceURL(key)
            let file = try cacheURL(key)
            let attributes = try? FileManager.default.attributesOfItem(atPath: file.path)
            call.resolve(["bytes": (attributes?[.size] as? NSNumber)?.int64Value ?? 0])
        } catch { call.reject("Cannot inspect audio cache", "CACHE_FAILED", error) }
    }
    @objc public func cacheChunk(_ call: CAPPluginCall) {
        do {
            let key = call.getString("key") ?? ""
            _ = try sourceURL(key)
            guard let encoded = call.getString("data"), encoded.count <= 800000,
                  let data = Data(base64Encoded: encoded), let offset = call.getInt("offset"), offset >= 0 else {
                throw failure("Invalid audio chunk")
            }
            let partial = try cacheURL(key, partial: true)
            if offset == 0 { try Data().write(to: partial, options: .atomic) }
            let handle = try FileHandle(forWritingTo: partial)
            defer { try? handle.close() }
            let end = try handle.seekToEnd()
            guard end == UInt64(offset) else { throw failure("Audio cache offset mismatch") }
            try handle.write(contentsOf: data)
            if call.getBool("last") == true {
                try handle.synchronize()
                let target = try cacheURL(key)
                if FileManager.default.fileExists(atPath: target.path) {
                    _ = try FileManager.default.replaceItemAt(target, withItemAt: partial)
                } else { try FileManager.default.moveItem(at: partial, to: target) }
            }
            call.resolve()
        } catch { call.reject("Cannot cache offline audio", "CACHE_FAILED", error) }
    }

    private func interrupted(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        if type == .began {
            let resume = intendedPlaying
            pausePlayback(); resumeAfterInterruption = resume
        } else {
            let options = AVAudioSession.InterruptionOptions(rawValue: note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0)
            if resumeAfterInterruption && options.contains(.shouldResume) { try? startPlayback() }
            resumeAfterInterruption = false; publish()
        }
    }
    private func command(_ control: MPRemoteCommand, action: @escaping () -> Void) {
        let token = control.addTarget { [weak self] _ in
            guard let self = self, !self.queueID.isEmpty else { return .noSuchContent }
            DispatchQueue.main.async(execute: action)
            return .success
        }
        commands.append((control, token))
    }
    private func moveTrack(_ offset: Int) {
        let next = index + offset
        guard tracks.indices.contains(next) else { return }
        index = next
        do { try NativeAudioSession.activate(self); try loadTrack(position: 0, autoplay: true); publish() }
        catch { errorMessage = error.localizedDescription; publish() }
    }
    private func configureCommands() {
        let center = MPRemoteCommandCenter.shared()
        command(center.playCommand) { [weak self] in do { try self?.startPlayback(); self?.publish() } catch { self?.errorMessage = error.localizedDescription; self?.publish() } }
        command(center.pauseCommand) { [weak self] in self?.pausePlayback() }
        command(center.togglePlayPauseCommand) { [weak self] in
            guard let self = self else { return }
            if self.intendedPlaying { self.pausePlayback() } else { try? self.startPlayback(); self.publish() }
        }
        command(center.nextTrackCommand) { [weak self] in
            guard let self = self else { return }
            guard !self.isRosaryPlayback else { return }
            if self.repeatMode == 2 && self.index + 1 >= self.tracks.count { self.moveTrack(-self.index) }
            else { self.moveTrack(1) }
        }
        command(center.previousTrackCommand) { [weak self] in
            guard let self = self else { return }
            guard !self.isRosaryPlayback else { return }
            if self.playbackPosition() > 3 || self.index == 0 { self.skip(-self.playbackPosition()) }
            else { self.moveTrack(-1) }
        }
        center.skipForwardCommand.preferredIntervals = [30]
        center.skipBackwardCommand.preferredIntervals = [10]
        command(center.skipForwardCommand) { [weak self] in self?.skip(30) }
        command(center.skipBackwardCommand) { [weak self] in self?.skip(-10) }
        let token = center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let self = self, let seek = event as? MPChangePlaybackPositionCommandEvent, !self.queueID.isEmpty, !self.isRosaryPlayback else { return .noSuchContent }
            DispatchQueue.main.async { self.beginSeek(position: max(0, seek.positionTime)); self.ended = false; self.pausedAtTrackEnd = false; self.publish() }
            return .success
        }
        commands.append((center.changePlaybackPositionCommand, token))
    }
    private func skip(_ delta: Double) {
        guard !isRosaryPlayback else { return }
        let duration = seconds(player.currentItem?.duration ?? .zero)
        let target = max(0, playbackPosition() + delta)
        beginSeek(position: duration > 0 ? min(duration, target) : target)
        ended = false; pausedAtTrackEnd = false; publish()
    }
    private func isBrandingArtwork(_ source: String) -> Bool {
        let decoded = source.removingPercentEncoding ?? source
        let path = (URLComponents(string: decoded)?.path ?? decoded).lowercased()
        return path.contains("/assets/branding/") || path.hasPrefix("assets/branding/")
            || path.hasSuffix("/tu-tap-logo.png") || path == "tu-tap-logo.png"
    }

    private var hasAlbumArtwork: Bool {
        guard let source = album["artwork"] as? String,
              !source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        return !isBrandingArtwork(source)
    }
    private func loadArtwork(_ source: String) {
        artworkRequestID = UUID()
        let requestID = artworkRequestID
        artworkTask?.cancel(); artwork = nil; widgetArtworkVerified = false; widgetArtworkKey = nil
        DharmaAudioWidgetStore.writeArtwork(nil)
        let id = queueID
        let owner = selectedWidgetPrincipal
        guard hasAlbumArtwork, !isBrandingArtwork(source), let url = try? sourceURL(source) else {
            publishWidget(force: true); return
        }
        if url.isFileURL {
            if let image = UIImage(contentsOfFile: url.path) {
                artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
                saveWidgetArtwork(image)
            }
            return
        }
        let request = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: 15)
        artworkTask = URLSession.shared.dataTask(with: request) { [weak self] data, response, _ in
            guard let data = data, data.count <= 8 * 1024 * 1024,
                  (response as? HTTPURLResponse)?.statusCode == 200, let image = UIImage(data: data) else { return }
            DispatchQueue.main.async {
                guard let self = self, self.artworkRequestID == requestID,
                      self.queueID == id, self.selectedWidgetPrincipal == owner, self.hasAlbumArtwork else { return }
                self.artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
                self.saveWidgetArtwork(image)
                self.updateNowPlaying()
            }
        }
        artworkTask?.resume()
    }
    private func updateNowPlaying() {
        guard !queueID.isEmpty, tracks.indices.contains(index) else { return }
        var info: [String: Any] = [MPMediaItemPropertyTitle: tracks[index]["title"] as? String ?? "",
            MPMediaItemPropertyAlbumTitle: album["title"] as? String ?? "", MPMediaItemPropertyArtist: album["description"] as? String ?? "",
            MPMediaItemPropertyPlaybackDuration: seconds(player.currentItem?.duration ?? .zero),
            MPNowPlayingInfoPropertyElapsedPlaybackTime: playbackPosition(),
            MPNowPlayingInfoPropertyPlaybackRate: intendedPlaying && pendingSeekPosition == nil ? Double(speed) : 0,
            MPNowPlayingInfoPropertyDefaultPlaybackRate: Double(speed)]
        if let artwork = artwork { info[MPMediaItemPropertyArtwork] = artwork }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func recoveryFile(_ name: String) -> URL? {
        guard let root = try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true) else { return nil }
        return root.appendingPathComponent(name)
    }

    private func clearWidgetRecovery() {
        for name in ["dharma-widget-queue.json", "dharma-widget-position.json"] {
            if let url = recoveryFile(name) { try? FileManager.default.removeItem(at: url) }
        }
        widgetReload?.cancel()
        widgetFingerprint = ""
        DharmaAudioWidgetStore.clear()
    }

    private func widgetPrincipalOnDisk() -> String? {
        guard let url = recoveryFile("dharma-widget-principal.txt"), let data = try? Data(contentsOf: url),
              !data.isEmpty, data.count <= 1024, let value = String(data: data, encoding: .utf8),
              !value.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else { return nil }
        return value
    }

    private func isPracticeQueue(_ id: String, album: JSObject) -> Bool {
        ["practice:meditation", "practice:rosary"].contains(album["id"] as? String ?? "")
            || id.hasPrefix("practice:meditation:") || id.hasPrefix("practice:rosary:")
    }

    private var isRosaryPlayback: Bool {
        (album["id"] as? String) == "practice:rosary" || queueID.hasPrefix("practice:rosary:")
    }

    private var excludesAudioWidget: Bool { isPracticeQueue(queueID, album: album) }

    private func saveWidgetRecoveryQueue() {
        // Nhạc thiền thuộc phiên tu tập; widget pháp thoại không được phát hoặc phục hồi phiên đó.
        guard !excludesAudioWidget else { clearWidgetRecovery(); return }
        guard let url = recoveryFile("dharma-widget-queue.json") else { return }
        // Không lưu URL ký tạm/token vào bản phục hồi; hàng đợi lớn vẫn hoạt động như cũ trong app.
        let safe = tracks.count <= 2048 && tracks.allSatisfy { row in
            guard let source = row["url"] as? String else { return false }
            return isRecoverableWidgetSource(source)
        }
        let artwork = album["artwork"] as? String ?? ""
        let savedAlbum: JSObject = ["id": album["id"] as? String ?? "", "title": album["title"] as? String ?? "",
            "description": album["description"] as? String ?? "", "artwork": isRecoverableWidgetSource(artwork) ? artwork : "",
            "tracks": tracks.map { ["title": $0["title"] as? String ?? "", "url": $0["url"] as? String ?? ""] }]
        guard safe, let principal = selectedWidgetPrincipal,
              let data = try? JSONSerialization.data(withJSONObject: ["queueId": queueID, "album": savedAlbum, "principalKey": principal]), data.count <= 4194304 else {
            try? FileManager.default.removeItem(at: url)
            return
        }
        try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        var excluded = url
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try? excluded.setResourceValues(values)
    }

    private func isRecoverableWidgetSource(_ source: String) -> Bool {
        if source.hasPrefix("asset:///public/") { return (try? sourceURL(source)) != nil }
        guard let parsed = URLComponents(string: source) else { return false }
        return parsed.scheme == "https" && parsed.host?.isEmpty == false && parsed.user == nil && parsed.password == nil && parsed.query == nil && parsed.fragment == nil
    }

    private func saveWidgetPosition() {
        guard !excludesAudioWidget, let url = recoveryFile("dharma-widget-position.json"), !queueID.isEmpty else { return }
        let value: [String: Any] = ["queueId": queueID, "index": index, "position": playbackPosition(), "repeat": repeatMode,
            "speed": Double(speed), "volume": Double(player.volume), "sleepRemainingMs": sleepRemaining, "sleepAtEnd": sleepAtEnd,
            "ended": ended, "pausedAtTrackEnd": pausedAtTrackEnd]
        guard let data = try? JSONSerialization.data(withJSONObject: value) else { return }
        try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        var excluded = url
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try? excluded.setResourceValues(values)
    }

    private func restoreWidgetQueue() throws {
        guard queueID.isEmpty else { return }
        guard let principal = widgetPrincipalOnDisk() else {
            clearWidgetRecovery()
            throw failure("Mở app để xác nhận tài khoản và chọn bài nghe.")
        }
        guard let queueURL = recoveryFile("dharma-widget-queue.json"), let data = try? Data(contentsOf: queueURL), data.count <= 4194304,
              let saved = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              saved["principalKey"] as? String == principal,
              let id = saved["queueId"] as? String, !id.isEmpty,
              let savedAlbum = saved["album"] as? JSObject,
              !isPracticeQueue(id, album: savedAlbum),
              let rows = savedAlbum["tracks"] as? [JSObject], !rows.isEmpty, rows.count <= 2048,
              rows.allSatisfy({ row in guard let source = row["url"] as? String else { return false }; return isRecoverableWidgetSource(source) }) else {
            clearWidgetRecovery()
            throw failure("Mở app để chọn bài nghe trước.")
        }
        // Queue và checkpoint ghi riêng; chỉ phục hồi cặp đã khớp để không phát nhầm bài sau khi app bị dừng giữa hai lần ghi.
        guard let positionURL = recoveryFile("dharma-widget-position.json"), let positionData = try? Data(contentsOf: positionURL), positionData.count <= 8192,
              let checkpoint = try? JSONSerialization.jsonObject(with: positionData) as? [String: Any],
              checkpoint["queueId"] as? String == id,
              let selected = checkpoint["index"] as? Int, rows.indices.contains(selected),
              let position = checkpoint["position"] as? Double, position.isFinite, position >= 0 else {
            clearWidgetRecovery()
            throw failure("Bài nghe đã thay đổi. Mở app để chọn lại.")
        }
        selectedWidgetPrincipal = principal
        queueID = id; album = savedAlbum; tracks = rows; index = selected
        let rate = checkpoint["speed"] as? Double ?? 1
        speed = Float(rate.isFinite ? min(3, max(0.3, rate)) : 1)
        let volume = checkpoint["volume"] as? Double ?? 1
        player.volume = Float(volume.isFinite ? min(1, max(0, volume)) : 1)
        repeatMode = min(2, max(0, checkpoint["repeat"] as? Int ?? 0))
        let remaining = checkpoint["sleepRemainingMs"] as? Double ?? 0
        sleepRemaining = remaining.isFinite ? max(0, remaining) : 0
        sleepAtEnd = checkpoint["sleepAtEnd"] as? Bool ?? false
        try loadTrack(position: position, autoplay: false)
        // Chỉ nút Phát xử lý phát lại/chuyển bài; vị trí seek cuối bài không tự được coi là đã nghe xong.
        ended = checkpoint["ended"] as? Bool ?? false
        pausedAtTrackEnd = checkpoint["pausedAtTrackEnd"] as? Bool ?? false
        loadArtwork(savedAlbum["artwork"] as? String ?? "")
    }

    // AppIntent và bridge điều khiển cùng một AVPlayer, kể cả khi WebView chưa được tạo.
    @MainActor func widgetPerform(_ action: String, trackId: String? = nil) throws {
        if !queueID.isEmpty && selectedWidgetPrincipal == nil {
            stopAndClearWidget()
            throw failure("Mở app để xác nhận tài khoản trước khi phát tiếp.")
        }
        configure()
        try restoreWidgetQueue()
        guard !excludesAudioWidget else {
            clearWidgetRecovery()
            throw failure("Phiên thiền đang do công cụ tu tập quản lý. Mở app để điều khiển phiên này.")
        }
        switch action {
        case "toggle": if intendedPlaying { pausePlayback() } else { try startPlayback() }
        case "backward": skip(-15)
        case "forward": skip(15)
        case "track":
            guard let trackId = trackId, trackId.hasPrefix(queueID + ":"),
                  let next = Int(trackId.dropFirst(queueID.count + 1)), tracks.indices.contains(next) else { throw failure("Bài nghe không còn trong hàng đợi.") }
            index = next
            try NativeAudioSession.activate(self)
            try loadTrack(position: 0, autoplay: true)
        case "repeat": repeatMode = (repeatMode + 1) % 3
        case "sleep":
            tickSleep()
            let minutes = sleepRemaining / 60000
            sleepRemaining = minutes <= 0 ? 15 * 60000 : minutes <= 15 ? 30 * 60000 : minutes <= 30 ? 60 * 60000 : 0
            sleepAtEnd = false
        default: throw failure("Thao tác không được hỗ trợ.")
        }
        publishWidget(force: true)
        publish()
    }

    private func saveWidgetArtwork(_ image: UIImage) {
        guard selectedWidgetPrincipal != nil, !excludesAudioWidget, hasAlbumArtwork,
              image.size.width.isFinite, image.size.height.isFinite, image.size.width > 0, image.size.height > 0 else {
            widgetArtworkVerified = false; widgetArtworkKey = nil
            DharmaAudioWidgetStore.writeArtwork(nil)
            publishWidget(force: true)
            return
        }
        // Giữ tỉ lệ cover, không phóng lớn và không nhân mật độ màn hình khi tạo cache pixel.
        let factor = min(CGFloat(1), 256 / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * factor, height: image.size.height * factor)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let rendered = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        if let data = rendered.pngData() {
            let key = UUID().uuidString
            widgetArtworkVerified = DharmaAudioWidgetStore.writeArtwork(data, key: key)
            widgetArtworkKey = widgetArtworkVerified ? key : nil
        } else {
            widgetArtworkVerified = false; widgetArtworkKey = nil
            DharmaAudioWidgetStore.writeArtwork(nil)
        }
        // UUID chỉ nhận diện cover dẫn xuất; không lưu URL, tài khoản hoặc credential vào file ảnh.
        publishWidget(force: true)
    }
    private func scheduleWidgetReload() {
        widgetReload?.cancel()
        let work = DispatchWorkItem { WidgetCenter.shared.reloadTimelines(ofKind: DharmaAudioWidgetStore.kind) }
        widgetReload = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: work)
    }

    private func publishWidget(force: Bool = false) {
        guard selectedWidgetPrincipal != nil, !excludesAudioWidget, !queueID.isEmpty, tracks.indices.contains(index) else { return }
        let sleepMinutes = DharmaAudioWidgetStore.sleepMinutes(sleepRemaining)
        let fingerprint = "\(queueID)|\(index)|\(intendedPlaying)|\(ended)|\(repeatMode)|\(sleepMinutes)|\(errorMessage)"
        let changed = fingerprint != widgetFingerprint
        guard force || changed || (intendedPlaying && Date().timeIntervalSince(widgetSavedAt) >= 15) else { return }
        let duration = seconds(player.currentItem?.duration ?? .zero)
        let position = playbackPosition()
        let upcoming = tracks.indices.dropFirst(index + 1).prefix(3).map { next in
            let row = tracks[next]
            let seconds = (row["duration"] as? Double) ?? (row["duration"] as? NSNumber)?.doubleValue ?? 0
            return DharmaAudioTrackWidgetData(id: "\(queueID):\(next)", title: String((row["title"] as? String ?? "").prefix(300)), duration: seconds > 0 ? DharmaAudioWidgetStore.time(seconds) : "")
        }
        let snapshot = DharmaAudioWidgetData(trackId: "\(queueID):\(index)", title: String((tracks[index]["title"] as? String ?? "").prefix(300)),
            speakerOrCategory: String((album["description"] as? String ?? album["title"] as? String ?? "").prefix(300)),
            currentTime: DharmaAudioWidgetStore.time(position), totalDuration: DharmaAudioWidgetStore.time(duration), progress: duration > 0 ? min(1, max(0, position / duration)) : 0,
            isPlaying: intendedPlaying && !ended, playlist: upcoming, repeatMode: repeatMode, sleepRemainingMinutes: sleepMinutes, updatedAt: Date(), error: errorMessage, albumId: album["id"] as? String, hasAlbumArtwork: widgetArtworkVerified, artworkKey: widgetArtworkKey)
        DharmaAudioWidgetStore.write(snapshot)
        saveWidgetPosition()
        widgetSavedAt = Date(); widgetFingerprint = fingerprint
        if changed || force { scheduleWidgetReload() }
    }

    deinit {
        widgetReload?.cancel()
        seekTimeout?.cancel()
        pendingSeekCall?.reject("Audio bridge closed", "CLOSED")
        if let token = timeObserver { player.removeTimeObserver(token) }
        if let token = endObserver { NotificationCenter.default.removeObserver(token) }
        observers.forEach(NotificationCenter.default.removeObserver)
        commands.forEach { $0.0.removeTarget($0.1) }
        artworkTask?.cancel()
    }
}
