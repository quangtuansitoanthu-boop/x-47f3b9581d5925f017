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

        let group = DispatchGroup()
        let stateLock = NSLock()
        var firstError: Error?
        let center = UNUserNotificationCenter.current()
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

        let ret = ids.map({ (id) -> JSObject in
            return [
                "id": Int(id) ?? -1
            ]
        })
        // Callback có thể đến từ các hàng đợi khác nhau; chỉ hoàn tất lời gọi một lần.
        group.notify(queue: .main) {
            stateLock.lock()
            let error = firstError
            stateLock.unlock()
            if let theError = error {
                call.reject(theError.localizedDescription)
                return
            }
            call.resolve([
                "notifications": ret
            ])
        }
    }`;

const relativeSwift = 'ios/Sources/LocalNotificationsPlugin/LocalNotificationsPlugin.swift';
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
  if (method.value === patchedSchedule) {
    if (occurrences(source, '    case triggerDateInPast\n') !== 1 ||
        occurrences(source, newPastDate) !== 1 || source.includes(oldPastDate)) {
      throw new Error('Unsupported partial LocalNotifications source patch');
    }
    return false;
  }
  if (createHash('sha256').update(method.value).digest('hex') !== legacyScheduleHash ||
      occurrences(source, oldEnum) !== 1 || source.includes('    case triggerDateInPast\n') ||
      occurrences(source, oldPastDate) !== 1 || source.includes(newPastDate)) {
    throw new Error('Unsupported LocalNotifications SDK source; refusing partial or unexpected patch');
  }

  let updated = source.slice(0, method.start) + patchedSchedule + source.slice(method.end);
  updated = updated.replace(oldEnum, newEnum).replace(oldPastDate, newPastDate);
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
