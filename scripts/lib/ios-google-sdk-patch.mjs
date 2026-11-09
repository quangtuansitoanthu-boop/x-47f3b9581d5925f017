import fs from 'node:fs';
import path from 'node:path';

const legacyDependency = "s.dependency 'GoogleSignIn', '~> 6.2.4'";
const currentDependency = "s.dependency 'GoogleSignIn', '7.1.0'";
const addUrlObserver = 'NotificationCenter.default.addObserver(self, selector: #selector(handleOpenUrl(_ :)), name: Notification.Name(Notification.Name.capacitorOpenURL.rawValue), object: nil);';
const removeUrlObserver = 'NotificationCenter.default.removeObserver(self, name: Notification.Name(Notification.Name.capacitorOpenURL.rawValue), object: nil);';
const replaceUrlObserver = `${removeUrlObserver}\n        ${addUrlObserver}`;
const migrations = [
  [
    'googleSignInConfiguration = GIDConfiguration.init(clientID: customClientId, serverClientID: serverClientId)',
    'googleSignInConfiguration = GIDConfiguration.init(clientID: customClientId, serverClientID: serverClientId)\n        googleSignIn.configuration = googleSignInConfiguration',
  ],
  [
    'self.googleSignIn.signIn(with: self.googleSignInConfiguration, presenting: presentingVc, hint: nil, additionalScopes: self.additionalScopes) { user, error in',
    'self.googleSignIn.signIn(withPresenting: presentingVc, hint: nil, additionalScopes: self.additionalScopes) { result, error in',
  ],
  [
    '                    self.resolveSignInCallWith(user: user!);',
    '                    guard let result = result else {\n                        self.signInCall?.reject("Google sign-in returned no user");\n                        return;\n                    }\n                    self.resolveSignInCallWith(user: result.user, serverAuthCode: result.serverAuthCode);',
  ],
  [
    'self.googleSignIn.currentUser!.authentication.do { (authentication, error) in',
    'self.googleSignIn.currentUser!.refreshTokensIfNeeded { (user, error) in',
  ],
  ['guard let authentication = authentication else {', 'guard let user = user else {'],
  ['"accessToken": authentication.accessToken,', '"accessToken": user.accessToken.tokenString,'],
  ['"idToken": authentication.idToken ?? NSNull(),', '"idToken": (user.idToken?.tokenString as Any?) ?? NSNull(),'],
  ['"refreshToken": authentication.refreshToken', '"refreshToken": user.refreshToken.tokenString'],
  [
    'func resolveSignInCallWith(user: GIDGoogleUser) {',
    'func resolveSignInCallWith(user: GIDGoogleUser, serverAuthCode: String? = nil) {',
  ],
  ['"accessToken": user.authentication.accessToken,', '"accessToken": user.accessToken.tokenString,'],
  ['"idToken": user.authentication.idToken,', '"idToken": (user.idToken?.tokenString as Any?) ?? NSNull(),'],
  ['"refreshToken": user.authentication.refreshToken', '"refreshToken": user.refreshToken.tokenString'],
  ['"serverAuthCode": user.serverAuthCode ?? NSNull(),', '"serverAuthCode": (serverAuthCode as Any?) ?? NSNull(),'],
];

export function patchIosGoogleSdk(packageDirectory = path.resolve('node_modules/@codetrix-studio/capacitor-google-auth')) {
  const metadata = JSON.parse(fs.readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'));
  if (metadata.name !== '@codetrix-studio/capacitor-google-auth' || metadata.version !== '3.4.0-rc.4') {
    throw new Error('Unsupported GoogleAuth iOS plugin version; expected 3.4.0-rc.4');
  }
  const swiftFile = path.join(packageDirectory, 'ios/Plugin/Plugin.swift');
  const podFile = path.join(packageDirectory, 'CodetrixStudioCapacitorGoogleAuth.podspec');
  const source = fs.readFileSync(swiftFile, 'utf8');
  const swift = source.replaceAll('\r\n', '\n');
  const pod = fs.readFileSync(podFile, 'utf8');
  const occurrences = (text, fragment) => text.split(fragment).length - 1;

  // SDK 7.1 đóng gói privacy manifest; bridge 6.x phải đổi API cùng lần nâng SDK.
  // Xác minh cả hai file trước khi ghi để không để lại nửa bản vá khi source lạ.
  const migrated = migrations.every(([, after]) => swift.includes(after));
  const legacyCalls = migrations.slice(1).some(([before]) => swift.includes(before));
  const currentSdk = occurrences(pod, currentDependency) === 1 && !pod.includes(legacyDependency) && migrated && !legacyCalls;
  if (!currentSdk && (occurrences(pod, legacyDependency) !== 1 || pod.includes(currentDependency) ||
      migrations.some(([before]) => occurrences(swift, before) !== 1) ||
      swift.includes('googleSignIn.configuration = googleSignInConfiguration'))) {
    throw new Error('Unsupported GoogleAuth iOS native source; expected the SDK 6 bridge or its complete SDK 7.1 patch');
  }
  // initialize được gọi lại khi đăng nhập/đăng xuất; chỉ thay observer URL của chính plugin.
  if (occurrences(swift, addUrlObserver) !== 1 ||
      (swift.includes(removeUrlObserver) && (occurrences(swift, removeUrlObserver) !== 1 || !swift.includes(replaceUrlObserver)))) {
    throw new Error('Unsupported GoogleAuth iOS URL observer source');
  }
  if (currentSdk && swift.includes(replaceUrlObserver)) return false;
  let updatedSwift = swift;
  if (!currentSdk) for (const [before, after] of migrations) updatedSwift = updatedSwift.replace(before, after);
  if (!updatedSwift.includes(replaceUrlObserver)) updatedSwift = updatedSwift.replace(addUrlObserver, replaceUrlObserver);
  if (source.includes('\r\n')) updatedSwift = updatedSwift.replaceAll('\n', '\r\n');
  const temporarySwift = `${swiftFile}.tutam-sdk7.tmp`;
  const temporaryPod = `${podFile}.tutam-sdk7.tmp`;
  try {
    fs.writeFileSync(temporarySwift, updatedSwift);
    fs.writeFileSync(temporaryPod, pod.replace(legacyDependency, currentDependency));
    fs.renameSync(temporarySwift, swiftFile);
    fs.renameSync(temporaryPod, podFile);
  } finally {
    fs.rmSync(temporarySwift, { force: true });
    fs.rmSync(temporaryPod, { force: true });
  }
  return true;
}
