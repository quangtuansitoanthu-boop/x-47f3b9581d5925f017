/*
Copyright 2020-present Ionic
https://ionic.io

MIT License

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const legacyScheduleHash = "2ae33219022cb23d78c58542310a3990ae1c95ded8ec33aabc59544d27f0d42b";
const completionScheduleHash = 'b3cbd9f5d0b427efaea0c1e871b7ba10c458158d860bcbcf3443d67b28200e99';
const patchedSchedule = String.raw`    @objc func schedule(_ call: CAPPluginCall) {
        guard let notifications = call.getArray("notifications", JSObject.self) else {
            call.reject("Must provide notifications array as notifications option")
            return
        }
        var ids = [String]()
        var requests = [(request: UNNotificationRequest, notification: JSObject)]()

        // Kiểm tra cả batch trước khi đưa bất kỳ yêu cầu nào vào lịch của hệ điều hành.
        for notification in notifications {
            guard let identifier = notification["id"] as? Int else {
                call.reject("Notification missing identifier")
                return
            }

            var content: UNNotificationContent
            do {
                content = try makeNotificationContent(notification)
            } catch {
                CAPLog.print(error.localizedDescription)
                call.reject("Unable to make notification", nil, error)
                return
            }

            var trigger: UNNotificationTrigger?
            do {
                if let schedule = notification["schedule"] as? JSObject {
                    try trigger = handleScheduledNotification(call, schedule)
                }
            } catch LocalNotificationError.triggerDateInPast {
                call.reject("Scheduled time must be *after* current time")
                return
            } catch {
                call.reject("Unable to create notification, trigger failed", nil, error)
                return
            }

            let request = UNNotificationRequest(identifier: "\(identifier)", content: content, trigger: trigger)
            requests.append((request: request, notification: notification))
            ids.append(request.identifier)
        }

        let center = UNUserNotificationCenter.current()
        let affectedIds = Set(ids)
        center.getPendingNotificationRequests { allPending in
            // Chỉ giữ bản trước của những ID batch này có thể thay thế.
            let previousRequests = allPending.filter { affectedIds.contains($0.identifier) }
            let previousIds = Set(previousRequests.map { $0.identifier })
            let createdIds = Array(affectedIds.subtracting(previousIds))
            DispatchQueue.main.async {
                let previousLookup = self.notificationDelegationHandler.notificationRequestLookup.filter { affectedIds.contains($0.key) }
                let group = DispatchGroup()
                let stateLock = NSLock()
                var firstError: Error?
                for pending in requests {
                    let request = pending.request
                    self.notificationDelegationHandler.notificationRequestLookup[request.identifier] = pending.notification
                    group.enter()
                    center.add(request) { (error: Error?) in
                        defer { group.leave() }
                        if let theError = error {
                            CAPLog.print(theError.localizedDescription)
                            stateLock.lock()
                            if firstError == nil { firstError = theError }
                            stateLock.unlock()
                        }
                    }
                }
                // Không trả promise trước callback cuối hoặc trước khi hoàn tác xong.
                group.notify(queue: .main) {
                    stateLock.lock()
                    let error = firstError
                    stateLock.unlock()
                    if let theError = error {
                        center.removePendingNotificationRequests(withIdentifiers: createdIds)
                        let rollback = DispatchGroup()
                        var rollbackError: Error?
                        for previous in previousRequests {
                            var restoreRequest = previous
                            // Re-adding the original interval would restart its full delay.
                            // The SDK retains the absolute at date in cap_schedule.
                            if let interval = previous.trigger as? UNTimeIntervalNotificationTrigger, !interval.repeats {
                                let schedule = previous.content.userInfo["cap_schedule"] as? JSObject
                                let remaining = (schedule?["at"] as? NSDate)?.timeIntervalSinceNow ?? 0
                                if remaining > 0 {
                                    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: remaining, repeats: false)
                                    restoreRequest = UNNotificationRequest(identifier: previous.identifier, content: previous.content, trigger: trigger)
                                } else {
                                    stateLock.lock()
                                    if rollbackError == nil {
                                        rollbackError = NSError(domain: "TuTapLocalNotifications", code: 1, userInfo: [NSLocalizedDescriptionKey: "Previous notification deadline expired or unavailable"])
                                    }
                                    stateLock.unlock()
                                    continue
                                }
                            }
                            rollback.enter()
                            center.add(restoreRequest) { restoreError in
                                defer { rollback.leave() }
                                if let restoreError = restoreError {
                                    stateLock.lock()
                                    if rollbackError == nil { rollbackError = restoreError }
                                    stateLock.unlock()
                                }
                            }
                        }
                        rollback.notify(queue: .main) {
                            for identifier in affectedIds {
                                self.notificationDelegationHandler.notificationRequestLookup[identifier] = previousLookup[identifier]
                            }
                            // removePending có API void; đọc lại sau các callback để kiểm tra ID mới đã được dọn.
                            center.getPendingNotificationRequests { remaining in
                                let createdRemain = remaining.contains { createdIds.contains($0.identifier) }
                                stateLock.lock()
                                let restoreError = rollbackError
                                stateLock.unlock()
                                DispatchQueue.main.async {
                                    if let restoreError = restoreError {
                                        call.reject("Notification rollback failed: \(restoreError.localizedDescription); original: \(theError.localizedDescription)")
                                    } else if createdRemain {
                                        call.reject("Notification rollback incomplete; original: \(theError.localizedDescription)")
                                    } else {
                                        call.reject(theError.localizedDescription)
                                    }
                                }
                            }
                        }
                        return
                    }
                    let ret = ids.map({ (id) -> JSObject in
                        return ["id": Int(id) ?? -1]
                    })
                    call.resolve(["notifications": ret])
                }
            }
        }
    }`;

const relativeSwift = 'ios/Sources/LocalNotificationsPlugin/LocalNotificationsPlugin.swift';
const atomicScheduleHash = '7166240b5023fa27eb9aa20472377e21ab10eda4df308b0d8fb500b6ee9313d0';
const originalCheckPermissions = String.raw`    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        self.notificationDelegationHandler.checkPermissions { status in
            let permission: String

            switch status {
            case .authorized, .ephemeral, .provisional:
                permission = "granted"
            case .denied:
                permission = "denied"
            case .notDetermined:
                permission = "prompt"
            @unknown default:
                permission = "prompt"
            }

            call.resolve(["display": permission])
        }
    }`;
const diagnosticHelper = String.raw`#if DEBUG
private func tuTapNotificationQA(_ phase: String, status: Int = -1, error: Error? = nil) {
    guard ProcessInfo.processInfo.arguments.contains("-tutam-qa-events") else { return }
    let phases: Set<String> = [
        "check_entry", "check_settings_callback", "check_resolve",
        "schedule_entry", "schedule_invalid_batch", "schedule_invalid_id",
        "schedule_content_reject", "schedule_past_reject", "schedule_trigger_reject",
        "schedule_pending_start", "schedule_pending_callback", "schedule_add_error",
        "schedule_callbacks_complete", "schedule_restore_error", "schedule_rollback_expired",
        "schedule_rollback_reject", "schedule_rollback_incomplete", "schedule_reject", "schedule_resolve"
    ]
    guard phases.contains(phase) else { return }
    let failure = error.map { $0 as NSError }
    let domains: Set<String> = ["UNErrorDomain", "NSCocoaErrorDomain", "NSPOSIXErrorDomain", "NSURLErrorDomain", "TuTapLocalNotifications"]
    let domain = failure.map { domains.contains($0.domain) ? $0.domain : "other" } ?? "none"
    let code = failure.map { (-999999...999999).contains($0.code) ? $0.code : 0 } ?? 0
    let state = (-1...4).contains(status) ? status : -1
    NSLog("TUTAM_NOTIFICATION_QA phase=%@ status=%ld domain=%@ errorCode=%ld", phase, state, domain, code)
}
#endif`;
const observedDiagnosticHelper = diagnosticHelper.replace('\n}\n#endif', String.raw`
    let process = ProcessInfo.processInfo
    let pid = Int(process.processIdentifier)
    let uptime = process.systemUptime
    guard pid > 0, uptime.isFinite else { return }
    let payload: [String: Any] = [
        "type": "native-notification-sdk", "phase": phase, "pid": pid, "uptime": uptime,
        "status": state, "domain": domain, "errorCode": code
    ]
    NotificationCenter.default.post(name: Notification.Name("TuTapQANativeDiagnostic"),
        object: nil, userInfo: payload)
}
#endif`);

// Chỉ chèn log sau các đoạn đã ghim; bỏ DEBUG phải trả lại đúng method cũ.
function insertDebugLogs(value, sites) {
  for (const [anchor, phase, argumentsText = '', position = 'before', inner = false] of sites) {
    if (value.split(anchor).length !== 2) throw new Error('Unsupported LocalNotifications diagnostic anchor');
    const line = position === 'after' ? anchor.split('\n').at(-1) : anchor;
    const indent = line.match(/^[ \t]*/u)[0] + (inner ? '    ' : '');
    const block = `${indent}#if DEBUG\n${indent}tuTapNotificationQA("${phase}"${argumentsText})\n${indent}#endif`;
    value = value.replace(anchor, position === 'after' ? anchor + '\n' + block : block + '\n' + anchor);
  }
  return value;
}

const diagnosticSchedule = insertDebugLogs(patchedSchedule, [
  ['    @objc func schedule(_ call: CAPPluginCall) {', 'schedule_entry', '', 'after', true],
  ['            call.reject("Must provide notifications array as notifications option")', 'schedule_invalid_batch'],
  ['                call.reject("Notification missing identifier")', 'schedule_invalid_id'],
  ['                call.reject("Unable to make notification", nil, error)', 'schedule_content_reject', ', error: error'],
  ['                call.reject("Scheduled time must be *after* current time")', 'schedule_past_reject'],
  ['                call.reject("Unable to create notification, trigger failed", nil, error)', 'schedule_trigger_reject', ', error: error'],
  ['        center.getPendingNotificationRequests { allPending in', 'schedule_pending_start'],
  ['        center.getPendingNotificationRequests { allPending in', 'schedule_pending_callback', '', 'after', true],
  ['                            if firstError == nil { firstError = theError }\n                            stateLock.unlock()', 'schedule_add_error', ', error: theError', 'after'],
  ['                    let error = firstError\n                    stateLock.unlock()', 'schedule_callbacks_complete', ', error: error', 'after'],
  ['                                        rollbackError = NSError(domain: "TuTapLocalNotifications", code: 1, userInfo: [NSLocalizedDescriptionKey: "Previous notification deadline expired or unavailable"])\n                                    }\n                                    stateLock.unlock()', 'schedule_rollback_expired', '', 'after'],
  ['                                    if rollbackError == nil { rollbackError = restoreError }\n                                    stateLock.unlock()', 'schedule_restore_error', ', error: restoreError', 'after'],
  ['                                        call.reject("Notification rollback failed: \\(restoreError.localizedDescription); original: \\(theError.localizedDescription)")', 'schedule_rollback_reject', ', error: restoreError'],
  ['                                        call.reject("Notification rollback incomplete; original: \\(theError.localizedDescription)")', 'schedule_rollback_incomplete', ', error: theError'],
  ['                                        call.reject(theError.localizedDescription)', 'schedule_reject', ', error: theError'],
  ['                    call.resolve(["notifications": ret])', 'schedule_resolve'],
]);
const diagnosticCheckPermissions = insertDebugLogs(originalCheckPermissions, [
  ['    @objc override public func checkPermissions(_ call: CAPPluginCall) {', 'check_entry', '', 'after', true],
  ['        self.notificationDelegationHandler.checkPermissions { status in', 'check_settings_callback', ', status: status.rawValue', 'after', true],
  ['            call.resolve(["display": permission])', 'check_resolve', ', status: status.rawValue'],
]);
const helperAnchor = 'import UserNotifications\n';
const oldEnum = '    case triggerConstructionFailed\n';
const newEnum = oldEnum + '    case triggerDateInPast\n';
const oldPastDate = '            if dateInfo.date! < Date() {\n                call.reject("Scheduled time must be *after* current time")\n                return nil\n            }';
const newPastDate = '            if dateInfo.date! < Date() {\n                throw LocalNotificationError.triggerDateInPast\n            }';
const occurrences = (value, fragment) => value.split(fragment).length - 1;
const samePath = (left, right) => process.platform === 'win32'
  ? left.toLowerCase() === right.toLowerCase() : left === right;
const inside = (root, file) => {
  const relative = path.relative(root, file);
  return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
};

function ownedPath(nodeModules, file) {
  const resolved = path.resolve(file);
  if (!inside(nodeModules, resolved)) throw new Error('LocalNotifications patch target outside repository node_modules scope');
  let current = nodeModules;
  for (const part of path.relative(nodeModules, resolved).split(path.sep)) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('LocalNotifications patch refuses linked node_modules paths');
  }
  const real = fs.realpathSync(resolved);
  if (!inside(nodeModules, real) || !samePath(real, resolved)) throw new Error('LocalNotifications patch realpath outside repository node_modules scope');
  return real;
}

function scheduleMethod(source) {
  const startMarker = '    @objc func schedule(_ call: CAPPluginCall) {';
  const start = source.indexOf(startMarker);
  const closing = start < 0 ? -1 : source.indexOf('\n    }', start);
  if (start < 0 || closing < 0 || occurrences(source, startMarker) !== 1) throw new Error('Unsupported LocalNotifications schedule source');
  const end = closing + '\n    }'.length;
  return { start, end, value: source.slice(start, end) };
}

function checkPermissionsMethod(source) {
  const marker = '    @objc override public func checkPermissions(_ call: CAPPluginCall) {';
  const start = source.indexOf(marker);
  const closing = start < 0 ? -1 : source.indexOf('\n    }', start);
  if (start < 0 || closing < 0 || occurrences(source, marker) !== 1) throw new Error('Unsupported LocalNotifications permission source');
  return source.slice(start, closing + '\n    }'.length);
}

/** Vá SDK đã khóa phiên bản; không ghi vào checkout hay node_modules liên kết khác. */
export function patchIosLocalNotifications(packageDirectory = path.resolve('node_modules/@capacitor/local-notifications')) {
  const cwd = path.resolve(process.cwd());
  const root = fs.realpathSync(cwd);
  if (!samePath(cwd, root)) throw new Error('LocalNotifications patch refuses linked repository paths');
  const nodeModules = path.join(root, 'node_modules');
  if (fs.lstatSync(nodeModules).isSymbolicLink() || !samePath(fs.realpathSync(nodeModules), nodeModules)) {
    throw new Error('LocalNotifications patch refuses linked repository node_modules');
  }
  const directory = ownedPath(nodeModules, packageDirectory);
  const packageFile = ownedPath(nodeModules, path.join(directory, 'package.json'));
  const swiftFile = ownedPath(nodeModules, path.join(directory, relativeSwift));
  const metadata = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  if (metadata.name !== '@capacitor/local-notifications' || metadata.version !== '7.0.7') {
    throw new Error('Unsupported LocalNotifications SDK; expected @capacitor/local-notifications 7.0.7');
  }

  const original = fs.readFileSync(swiftFile, 'utf8');
  const crlf = original.includes('\r\n');
  if (crlf && /(?<!\r)\n/u.test(original)) throw new Error('Unsupported mixed LocalNotifications source line endings');
  const source = original.replaceAll('\r\n', '\n');
  const method = scheduleMethod(source);
  const permissionMethod = checkPermissionsMethod(source);
  const supportsDiagnosticHelper = (helper) => {
    const remainder = source.replace(diagnosticSchedule, '').replace(diagnosticCheckPermissions, '').replace(helper, '');
    return method.value === diagnosticSchedule && permissionMethod === diagnosticCheckPermissions &&
      occurrences(source, helperAnchor + '\n' + helper + '\n') === 1 &&
      !remainder.includes('tuTapNotificationQA') && !remainder.includes('TUTAM_NOTIFICATION_QA') &&
      !remainder.includes('TuTapQANativeDiagnostic');
  };
  const previousDiagnosticPatch = supportsDiagnosticHelper(diagnosticHelper);
  const observedDiagnosticPatch = supportsDiagnosticHelper(observedDiagnosticHelper);
  if (previousDiagnosticPatch || observedDiagnosticPatch) {
    if (occurrences(source, '    case triggerDateInPast\n') !== 1 ||
        occurrences(source, newPastDate) !== 1 || source.includes(oldPastDate)) {
      throw new Error('Unsupported partial LocalNotifications source patch');
    }
    if (observedDiagnosticPatch) return false;
  }
  if (!previousDiagnosticPatch && (source.includes('tuTapNotificationQA') || source.includes('TUTAM_NOTIFICATION_QA') ||
      source.includes('TuTapQANativeDiagnostic') || permissionMethod !== originalCheckPermissions || occurrences(source, helperAnchor) !== 1)) {
    throw new Error('Unsupported partial or unexpected LocalNotifications diagnostic patch');
  }
  const methodHash = createHash('sha256').update(method.value).digest('hex');
  const upgradingCompletionPatch = methodHash === completionScheduleHash;
  const upgradingAtomicPatch = methodHash === atomicScheduleHash && method.value === patchedSchedule;
  const validDateSource = previousDiagnosticPatch || upgradingCompletionPatch || upgradingAtomicPatch
    ? occurrences(source, '    case triggerDateInPast\n') === 1 && occurrences(source, newPastDate) === 1 && !source.includes(oldPastDate)
    : occurrences(source, oldEnum) === 1 && !source.includes('    case triggerDateInPast\n') && occurrences(source, oldPastDate) === 1 && !source.includes(newPastDate);
  if ((!previousDiagnosticPatch && !upgradingCompletionPatch && !upgradingAtomicPatch && methodHash !== legacyScheduleHash) || !validDateSource) {
    throw new Error('Unsupported LocalNotifications SDK source; refusing partial or unexpected patch');
  }

  let updated;
  if (previousDiagnosticPatch) {
    updated = source.replace(diagnosticHelper, observedDiagnosticHelper);
  } else {
    updated = source.slice(0, method.start) + diagnosticSchedule + source.slice(method.end);
    if (!upgradingCompletionPatch && !upgradingAtomicPatch) updated = updated.replace(oldEnum, newEnum).replace(oldPastDate, newPastDate);
    updated = updated.replace(originalCheckPermissions, diagnosticCheckPermissions)
      .replace(helperAnchor, helperAnchor + '\n' + observedDiagnosticHelper + '\n');
  }
  if (crlf) updated = updated.replaceAll('\n', '\r\n');
  const temporary = swiftFile + '.tutam-schedule.tmp';
  if (fs.existsSync(temporary)) throw new Error('LocalNotifications patch temporary source already exists');
  let created = false;
  try {
    fs.writeFileSync(temporary, updated, { flag: 'wx', mode: fs.statSync(swiftFile).mode & 0o777 });
    created = true;
    fs.renameSync(temporary, swiftFile);
    created = false;
  } finally {
    if (created) fs.unlinkSync(temporary);
  }
  return true;
}
