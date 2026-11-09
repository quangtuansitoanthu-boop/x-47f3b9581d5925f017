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
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, expect, it } from 'vitest';

// Upstream @capacitor/local-notifications 7.0.7, Ionic MIT; exact scheduling excerpt.
const legacySource = "import Foundation\nimport Capacitor\nimport UserNotifications\n\nenum LocalNotificationError: LocalizedError {\n    case triggerConstructionFailed\n}\n\nclass Fixture {\n    @objc func schedule(_ call: CAPPluginCall) {\n        guard let notifications = call.getArray(\"notifications\", JSObject.self) else {\n            call.reject(\"Must provide notifications array as notifications option\")\n            return\n        }\n        var ids = [String]()\n\n        for notification in notifications {\n            guard let identifier = notification[\"id\"] as? Int else {\n                call.reject(\"Notification missing identifier\")\n                return\n            }\n\n            // let extra = notification[\"options\"] as? JSObject ?? [:]\n\n            var content: UNNotificationContent\n            do {\n                content = try makeNotificationContent(notification)\n            } catch {\n                CAPLog.print(error.localizedDescription)\n                call.reject(\"Unable to make notification\", nil, error)\n                return\n            }\n\n            var trigger: UNNotificationTrigger?\n\n            do {\n                if let schedule = notification[\"schedule\"] as? JSObject {\n                    try trigger = handleScheduledNotification(call, schedule)\n                }\n            } catch {\n                call.reject(\"Unable to create notification, trigger failed\", nil, error)\n                return\n            }\n\n            // Schedule the request.\n            let request = UNNotificationRequest(identifier: \"\\(identifier)\", content: content, trigger: trigger)\n\n            self.notificationDelegationHandler.notificationRequestLookup[request.identifier] = notification\n\n            let center = UNUserNotificationCenter.current()\n            center.add(request) { (error: Error?) in\n                if let theError = error {\n                    CAPLog.print(theError.localizedDescription)\n                    call.reject(theError.localizedDescription)\n                }\n            }\n\n            ids.append(request.identifier)\n        }\n\n        let ret = ids.map({ (id) -> JSObject in\n            return [\n                \"id\": Int(id) ?? -1\n            ]\n        })\n        call.resolve([\n            \"notifications\": ret\n        ])\n    }\n\n\n    func handleScheduledNotification(_ call: CAPPluginCall, _ schedule: JSObject) throws -> UNNotificationTrigger? {\n            if dateInfo.date! < Date() {\n                call.reject(\"Scheduled time must be *after* current time\")\n                return nil\n            }\n\n        return nil\n    }\n\n    func untouchedMarker() { print(\"preserve unrelated code\") }\n}\n";

const roots: string[] = [];
const relativeSwift = 'ios/Sources/LocalNotificationsPlugin/LocalNotificationsPlugin.swift';
const pluginName = '@capacitor/local-notifications';
const license = 'Copyright 2020-present Ionic\nMIT License fixture retained verbatim\n';
function fixture(outside = false, crlf = false) {
  const prefix = outside ? path.join(os.tmpdir(), 'tutam-notifications-outside-')
    : path.resolve('node_modules/.tutam-notifications-patch-test-');
  const root = fs.mkdtempSync(prefix);
  roots.push(root);
  const directory = path.join(root, 'node_modules/@capacitor/local-notifications');
  const swift = path.join(directory, relativeSwift);
  fs.mkdirSync(path.dirname(swift), { recursive: true });
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: pluginName, version: '7.0.7' }));
  fs.writeFileSync(path.join(directory, 'LICENSE'), license);
  fs.writeFileSync(swift, crlf ? legacySource.replaceAll('\n', '\r\n') : legacySource);
  return { root, directory, swift };
}
async function patch() {
  const file = path.resolve('scripts/lib/ios-local-notifications-patch.mjs');
  if (!fs.existsSync(file)) throw new Error('LocalNotifications completion patch is not implemented');
  return (await import(pathToFileURL(file).href)).patchIosLocalNotifications as (directory?: string) => boolean;
}
function schedule(source: string) {
  return source.split('    @objc func schedule(_ call: CAPPluginCall) {')[1].split('\n    /**')[0];
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (!path.basename(root).startsWith('tutam-notifications-outside-') && !path.basename(root).startsWith('.tutam-notifications-patch-test-')) throw new Error('Unsafe fixture cleanup');
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('installed iOS SDK resolves schedule only after all native add callbacks finish', () => {
  const source = fs.readFileSync(path.resolve('node_modules/@capacitor/local-notifications', relativeSwift), 'utf8');
  const method = schedule(source);
  const notify = method.indexOf('.notify(queue: .main)');
  expect(notify, 'schedule must wait for native center.add completions').toBeGreaterThan(-1);
  expect(method.indexOf('call.resolve(')).toBeGreaterThan(notify);
  expect(method).toContain('DispatchGroup()');
  expect(method).toContain('NSLock()');
  const callback = method.split('center.add(request)')[1].split('.notify(queue: .main)')[0];
  expect(callback).not.toContain('call.reject(');
});

it('stages valid requests before enqueueing and settles once with the original ordered payload', async () => {
  const value = fixture();
  expect((await patch())(value.directory)).toBe(true);
  const source = fs.readFileSync(value.swift, 'utf8');
  const method = schedule(source);
  expect(method.indexOf('requests.append')).toBeLessThan(method.indexOf('center.add(request)'));
  expect(method.indexOf('Notification missing identifier')).toBeLessThan(method.indexOf('center.add(request)'));
  expect(method.indexOf('Unable to make notification')).toBeLessThan(method.indexOf('center.add(request)'));
  expect(method.indexOf('Unable to create notification, trigger failed')).toBeLessThan(method.indexOf('center.add(request)'));
  expect(method).toContain('DispatchGroup()');
  expect(method).toContain('NSLock()');
  expect(method.match(/call\.resolve\(/gu)).toHaveLength(1);
  expect(method).toContain('"notifications": ret');
  expect(method).toContain('"id": Int(id) ?? -1');
  expect(method).not.toMatch(/notifications\.count\s*>\s*0/u);
  expect(method).not.toMatch(/\.wait\(/u);
  const settlement = method.slice(method.indexOf('.notify(queue: .main)'));
  expect(settlement).toMatch(/if let[^\n]*[Ee]rror[^\n]*\{[\s\S]*call\.reject\([\s\S]*return[\s\S]*call\.resolve\(/u);
  expect(source).toContain('case triggerDateInPast');
  expect(source).toContain('throw LocalNotificationError.triggerDateInPast');
  expect(method).toContain('catch LocalNotificationError.triggerDateInPast');
  expect(method).toContain('Scheduled time must be *after* current time');
  expect(source).toContain('func untouchedMarker() { print("preserve unrelated code") }');
  expect(fs.readFileSync(path.join(value.directory, 'LICENSE'), 'utf8')).toBe(license);
  expect(JSON.parse(fs.readFileSync(path.join(value.directory, 'package.json'), 'utf8'))).toEqual({ name: pluginName, version: '7.0.7' });
});

it('is idempotent and preserves the upstream line endings', async () => {
  const value = fixture(false, true);
  const apply = await patch();
  expect(apply(value.directory)).toBe(true);
  const once = fs.readFileSync(value.swift);
  expect(once.toString()).not.toMatch(/(?<!\r)\n/u);
  expect(apply(value.directory)).toBe(false);
  expect(fs.readFileSync(value.swift)).toEqual(once);
});

it('fails closed on unsupported SDK versions without rewriting source', async () => {
  const value = fixture();
  fs.writeFileSync(path.join(value.directory, 'package.json'), JSON.stringify({ name: pluginName, version: '7.0.8' }));
  const before = fs.readFileSync(value.swift);
  const apply = await patch();
  expect(() => apply(value.directory)).toThrow(/unsupported|7\.0\.7/iu);
  expect(fs.readFileSync(value.swift)).toEqual(before);
});

it('fails closed on unexpected or partial SDK source without rewriting it', async () => {
  const value = fixture();
  fs.writeFileSync(value.swift, legacySource.replace('center.add(request)', 'center.addUnexpected(request)'));
  const before = fs.readFileSync(value.swift);
  const apply = await patch();
  expect(() => apply(value.directory)).toThrow(/unsupported|unexpected|source/iu);
  expect(fs.readFileSync(value.swift)).toEqual(before);
});

it('rejects fixtures outside current repository node_modules without writes', async () => {
  const value = fixture(true);
  const before = fs.readFileSync(value.swift);
  const apply = await patch();
  expect(() => apply(value.directory)).toThrow(/scope|outside|node_modules|repository/iu);
  expect(fs.readFileSync(value.swift)).toEqual(before);
});

it('runs the version-checked patch from the existing postinstall entry point', () => {
  const source = fs.readFileSync('scripts/patch-google-auth.mjs', 'utf8');
  expect(source).toContain("'./lib/ios-local-notifications-patch.mjs'");
  expect(source).toContain('patchIosLocalNotifications();');
});
