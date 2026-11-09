import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const gradle = readFileSync('android/app/build.gradle', 'utf8');
const activity = readFileSync('android/app/src/main/java/vn/quangtu/tutam/MainActivity.java', 'utf8');
const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');

it('keeps stable API 36 with an Android Gradle plugin that supports it', () => {
  const variables = readFileSync('android/variables.gradle', 'utf8');
  const build = readFileSync('android/build.gradle', 'utf8');
  const version = build.match(/com\.android\.tools\.build:gradle:(\d+)\.(\d+)\.(\d+)/u);
  expect(version).not.toBeNull();
  const [major, minor, patch] = version!.slice(1).map(Number);
  expect(variables).toContain('compileSdkVersion = 36');
  expect(variables).toContain('targetSdkVersion = 36');
  expect(major > 8 || (major === 8 && (minor > 9 || (minor === 9 && patch >= 1)))).toBe(true);
});

it('limits the custom asset handler to the configured app origin and delegates ranges', () => {
  const intercept = activity.slice(activity.indexOf('public WebResourceResponse shouldInterceptRequest'));
  const assetOpen = intercept.indexOf('getAssets().open(assetPath)');
  expect(assetOpen).toBeGreaterThan(0);
  expect(intercept.indexOf('bridge.getHost().equalsIgnoreCase(url.getHost())')).toBeGreaterThan(0);
  expect(intercept.indexOf('bridge.getHost().equalsIgnoreCase(url.getHost())')).toBeLessThan(assetOpen);
  expect(intercept.indexOf('containsKey("Range")')).toBeLessThan(assetOpen);
  expect(intercept.indexOf('containsKey("Range")')).toBeGreaterThan(0);
  expect(intercept.indexOf('containsKey("range")')).toBeGreaterThan(0);
});

it('declares vibration and explicit keyboard resizing without dropping exact-alarm fallback', () => {
  expect(manifest).toContain('android.permission.VIBRATE');
  expect(manifest.match(/<activity\b[^>]*android:name="\.MainActivity"[^>]*>/su)?.[0])
    .toContain('android:windowSoftInputMode="adjustResize"');
  expect(manifest).toContain('android.permission.SCHEDULE_EXACT_ALARM');
  expect(manifest).not.toContain('android.permission.USE_EXACT_ALARM');
});

it('excludes session cookies from both backup generations while retaining offline drafts', () => {
  expect(manifest).toContain('android:fullBackupContent="@xml/backup_rules"');
  expect(manifest).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');
  for (const file of ['backup_rules', 'data_extraction_rules']) {
    const rules = readFileSync(`android/app/src/main/res/xml/${file}.xml`, 'utf8');
    expect(rules).toContain('path="app_webview/Default/Cookies"');
    expect(rules).toContain('path="app_webview/Default/Network/"');
    expect(rules).not.toMatch(/<exclude[^>]*path="(?:\.|app_webview\/?)"/u);
    expect(rules).not.toMatch(/<exclude[^>]*(?:Local Storage|IndexedDB)/u);
  }
});

it('uses a small monochrome vector instead of the opaque bitmap for notification rendering', () => {
  const icon = readFileSync('android/app/src/main/res/drawable/ic_notification_small.xml', 'utf8');
  expect(icon).toContain('<vector');
  expect(icon).toContain('android:width="24dp"');
  expect(icon).toContain('android:fillColor="#FFFFFFFF"');
  expect(icon.length).toBeLessThan(2_000);
  expect(readFileSync('capacitor.config.ts', 'utf8')).toContain("smallIcon: 'ic_notification_small'");
  expect(readFileSync('android/app/src/main/java/vn/quangtu/tutam/reminders/ReminderScheduler.java', 'utf8'))
    .toContain('R.drawable.ic_notification_small');
});
it('does not embed release signing passwords or sign debug builds with the release key', () => {
  expect(/(?:storePassword|keyPassword)\s+['"]/u.test(gradle)).toBe(false);
  expect(/debug\s*\{\s*signingConfig signingConfigs.release/u.test(gradle)).toBe(false);
  expect(gradle).toContain('KEYSTORE_PASSWORD');
  expect(readFileSync('.gitignore', 'utf8')).toContain('android/keystore.properties');
});
it('only enables WebView debugging for debuggable builds', () => {
  expect(activity).not.toContain('setWebContentsDebuggingEnabled(true)');
  expect(activity).toContain('setWebContentsDebuggingEnabled(isDebug)');
});
it('serves local AAC assets using their audio MIME types', () => {
  expect(activity).toContain('if (lower.endsWith(".m4a")) return "audio/mp4";');
  expect(activity).toContain('if (lower.endsWith(".aac")) return "audio/aac";');
});
it('keeps local notifications on the supported Capacitor major', () => {
  const core = JSON.parse(readFileSync('node_modules/@capacitor/core/package.json', 'utf8'));
  const notifications = JSON.parse(readFileSync('node_modules/@capacitor/local-notifications/package.json', 'utf8'));
  expect(notifications.version.split('.')[0]).toBe(core.version.split('.')[0]);
});
it('does not trust unrelated workers.dev hosts inside the native bridge', () => {
  const config = readFileSync('capacitor.config.ts', 'utf8');
  expect(config).not.toContain("'*.workers.dev'");
  expect(config).toContain("'quangtu-web.quangtu-ansitoanthu.workers.dev'");
});
it('does not allow cleartext traffic through the native bridge', () => {
  const config = readFileSync('capacitor.config.ts', 'utf8');
  expect(config).not.toMatch(/cleartext\s*:\s*true/u);
});
it('leaves notification permission requests to the reminder opt-in flow', () => {
  expect(activity).not.toContain('ActivityCompat.requestPermissions(');
  const reminders = readFileSync('src/lib/browser/practice-reminder-service.ts', 'utf8');
  expect(reminders).toContain('await requestUnifiedNotificationPermission()');
  expect(readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8'))
    .toContain('android.permission.POST_NOTIFICATIONS');
});
