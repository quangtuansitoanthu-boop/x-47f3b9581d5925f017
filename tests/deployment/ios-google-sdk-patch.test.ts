import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { patchIosGoogleSdk } from '../../scripts/lib/ios-google-sdk-patch.mjs';

// Các đoạn API thật của bridge 3.4.0-rc.4; giữ cả nhánh restore để tránh vá nhầm.
const legacySwift = `
import GoogleSignIn
public class GoogleAuth: CAPPlugin {
    func loadSignInClient(customClientId: String, customScopes: [String]) {
        googleSignIn = GIDSignIn.sharedInstance;
        let serverClientId = getServerClientIdValue();
        googleSignInConfiguration = GIDConfiguration.init(clientID: customClientId, serverClientID: serverClientId)
        additionalScopes = customScopes.filter { !["email", "profile", "openid"].contains($0) };
        NotificationCenter.default.addObserver(self, selector: #selector(handleOpenUrl(_ :)), name: Notification.Name(Notification.Name.capacitorOpenURL.rawValue), object: nil);
    }
    func signIn(_ call: CAPPluginCall) {
        if self.googleSignIn.hasPreviousSignIn() && !self.forceAuthCode {
            self.googleSignIn.restorePreviousSignIn() { user, error in
                self.resolveSignInCallWith(user: user!)
            }
        } else {
                self.googleSignIn.signIn(with: self.googleSignInConfiguration, presenting: presentingVc, hint: nil, additionalScopes: self.additionalScopes) { user, error in
                    if let error = error {
                        self.signInCall?.reject(error.localizedDescription, "\\(error._code)");
                        return;
                    }
                    self.resolveSignInCallWith(user: user!);
                };
        }
    }
    func refresh(_ call: CAPPluginCall) {
            self.googleSignIn.currentUser!.authentication.do { (authentication, error) in
                guard let authentication = authentication else {
                    call.reject(error?.localizedDescription ?? "Something went wrong.");
                    return;
                }
                let authenticationData: [String: Any] = [
                    "accessToken": authentication.accessToken,
                    "idToken": authentication.idToken ?? NSNull(),
                    "refreshToken": authentication.refreshToken
                ]
                call.resolve(authenticationData);
            }
    }
    func resolveSignInCallWith(user: GIDGoogleUser) {
        var userData: [String: Any] = [
            "authentication": [
                "accessToken": user.authentication.accessToken,
                "idToken": user.authentication.idToken,
                "refreshToken": user.authentication.refreshToken
            ],
            "serverAuthCode": user.serverAuthCode ?? NSNull(),
            "email": user.profile?.email ?? NSNull(),
            "familyName": user.profile?.familyName ?? NSNull(),
            "givenName": user.profile?.givenName ?? NSNull(),
            "id": user.userID ?? NSNull(),
            "name": user.profile?.name ?? NSNull()
        ];
        if let imageUrl = user.profile?.imageURL(withDimension: 100)?.absoluteString {
            userData["imageUrl"] = imageUrl;
        }
        signInCall?.resolve(userData);
    }
    func getClientIdValue() -> String? { return getConfig().getString("iosClientId"); }
    func getServerClientIdValue() -> String? { return getConfig().getString("serverClientId"); }
    func handleOpenUrl(_ notification: Notification) { googleSignIn.handle(url); }
}
`;
const legacyPod = `Pod::Spec.new do |s|
  s.name = 'CodetrixStudioCapacitorGoogleAuth'
  s.ios.deployment_target = '12.0'
  s.dependency 'Capacitor'
  s.dependency 'GoogleSignIn', '~> 6.2.4'
  s.static_framework = true
end
`;
let root: string;
let swiftFile: string;
let podFile: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tutam-ios-google-sdk-'));
  swiftFile = path.join(root, 'ios/Plugin/Plugin.swift');
  podFile = path.join(root, 'CodetrixStudioCapacitorGoogleAuth.podspec');
  fs.mkdirSync(path.dirname(swiftFile), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@codetrix-studio/capacitor-google-auth', version: '3.4.0-rc.4' }));
  fs.writeFileSync(swiftFile, legacySwift);
  fs.writeFileSync(podFile, legacyPod);
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

it('migrates iOS SDK APIs together while retaining JS identity, config, callback and Android files', () => {
  const androidFile = path.join(root, 'android/GoogleAuth.java');
  fs.mkdirSync(path.dirname(androidFile), { recursive: true });
  fs.writeFileSync(androidFile, 'android source must remain byte-for-byte unchanged');
  const androidBefore = fs.readFileSync(androidFile);
  const packageBefore = fs.readFileSync(path.join(root, 'package.json'));
  expect(patchIosGoogleSdk(root)).toBe(true);
  const swift = fs.readFileSync(swiftFile, 'utf8');
  expect(fs.readFileSync(podFile, 'utf8')).toBe(legacyPod.replace("'~> 6.2.4'", "'7.1.0'"));
  expect(swift).toContain('googleSignIn.configuration = googleSignInConfiguration');
  expect(swift).toContain('signIn(withPresenting: presentingVc, hint: nil, additionalScopes: self.additionalScopes) { result, error in');
  expect(swift).toContain('self.resolveSignInCallWith(user: result.user, serverAuthCode: result.serverAuthCode)');
  expect(swift).toContain('self.resolveSignInCallWith(user: user!)\n');
  expect(swift).toContain('refreshTokensIfNeeded { (user, error) in');
  expect(swift).not.toMatch(/user\.authentication|authentication\.do|signIn\(with:/u);
  for (const field of ['accessToken', 'idToken', 'refreshToken']) expect(swift).toContain(`user.${field}${field === 'idToken' ? '?' : ''}.tokenString`);
  for (const unchanged of [
    'clientID: customClientId, serverClientID: serverClientId',
    '["email", "profile", "openid"]', 'getString("iosClientId")', 'getString("serverClientId")',
    'Notification.Name.capacitorOpenURL.rawValue', 'googleSignIn.handle(url)',
    '"authentication": [', '"email": user.profile?.email', '"familyName": user.profile?.familyName',
    '"givenName": user.profile?.givenName', '"id": user.userID', '"name": user.profile?.name',
    'userData["imageUrl"] = imageUrl', 'signInCall?.resolve(userData)',
  ]) expect(swift).toContain(unchanged);
  expect(fs.readFileSync(androidFile)).toEqual(androidBefore);
  expect(fs.readFileSync(path.join(root, 'package.json'))).toEqual(packageBefore);
});

it('is repeatable without changing an already migrated adapter', () => {
  patchIosGoogleSdk(root);
  const swift = fs.readFileSync(swiftFile);
  const pod = fs.readFileSync(podFile);
  expect(patchIosGoogleSdk(root)).toBe(false);
  expect(fs.readFileSync(swiftFile)).toEqual(swift);
  expect(fs.readFileSync(podFile)).toEqual(pod);
});

it('keeps one named URL observer across repeated initialization without removing other observers', () => {
  patchIosGoogleSdk(root);
  const swift = fs.readFileSync(swiftFile, 'utf8');
  const observerCalls = [...swift.matchAll(/NotificationCenter\.default\.(addObserver|removeObserver)\(([^\n]+)\);/g)];
  let registrations = 0;
  for (let initialization = 0; initialization < 3; initialization++) {
    for (const [, operation, argumentsText] of observerCalls) {
      expect(argumentsText).toContain('name: Notification.Name(Notification.Name.capacitorOpenURL.rawValue), object: nil');
      expect(argumentsText).toMatch(/^self,/);
      registrations = operation === 'removeObserver' ? 0 : registrations + 1;
    }
  }
  expect(registrations).toBe(1);
});

it('upgrades an already SDK7-patched bridge that still registers duplicate URL observers', () => {
  patchIosGoogleSdk(root);
  // Mô phỏng gói đã chạy bản vá SDK7 cũ, trước khi có dọn observer.
  const oldSdk7 = fs.readFileSync(swiftFile, 'utf8').replace(/^.*NotificationCenter\.default\.removeObserver\(self, name: Notification.Name\(Notification.Name.capacitorOpenURL.rawValue\), object: nil\);\r?\n/m, '');
  fs.writeFileSync(swiftFile, oldSdk7);
  const pod = fs.readFileSync(podFile);
  expect(patchIosGoogleSdk(root)).toBe(true);
  expect(fs.readFileSync(swiftFile, 'utf8')).toContain('NotificationCenter.default.removeObserver(self, name: Notification.Name(Notification.Name.capacitorOpenURL.rawValue), object: nil);');
  expect(fs.readFileSync(podFile)).toEqual(pod);
  expect(patchIosGoogleSdk(root)).toBe(false);
});

it('rejects an unknown observer layout before changing SDK or Swift files', () => {
  fs.writeFileSync(swiftFile, legacySwift.replace('NotificationCenter.default.addObserver(self,', 'NotificationCenter.default.addObserver(otherPlugin,'));
  const swift = fs.readFileSync(swiftFile);
  const pod = fs.readFileSync(podFile);
  expect(() => patchIosGoogleSdk(root)).toThrow(/Unsupported GoogleAuth iOS URL observer/u);
  expect(fs.readFileSync(swiftFile)).toEqual(swift);
  expect(fs.readFileSync(podFile)).toEqual(pod);
});

it.each(['swift', 'pod', 'package'] as const)('rejects unknown %s input before modifying either native file', file => {
  if (file === 'swift') fs.writeFileSync(swiftFile, legacySwift.replace('authentication.do', 'unexpectedAuthenticationAPI'));
  if (file === 'pod') fs.writeFileSync(podFile, legacyPod.replace('~> 6.2.4', '~> 8.0'));
  if (file === 'package') fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@codetrix-studio/capacitor-google-auth', version: '99.0.0' }));
  const swift = fs.readFileSync(swiftFile);
  const pod = fs.readFileSync(podFile);
  expect(() => patchIosGoogleSdk(root)).toThrow(/Unsupported GoogleAuth iOS/u);
  expect(fs.readFileSync(swiftFile)).toEqual(swift);
  expect(fs.readFileSync(podFile)).toEqual(pod);
});
