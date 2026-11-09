import fs from 'node:fs';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
let xml = fs.readFileSync(manifestPath, 'utf8');

// 1. Add tools namespace if not present
if (!xml.includes('xmlns:tools')) {
  xml = xml.replace(
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android"\n    xmlns:tools="http://schemas.android.com/tools">'
  );
}

// 2. Replace usesCleartextTraffic with networkSecurityConfig
if (xml.includes('android:usesCleartextTraffic="true"')) {
  xml = xml.replace(
    'android:usesCleartextTraffic="true"',
    'android:networkSecurityConfig="@xml/network_security_config"'
  );
}

// 3. Remove AD_ID permission if not already removed
if (!xml.includes('permission.AD_ID')) {
  xml = xml.replace(
    '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n\n    <!-- Google Play: Remove Advertising ID permission injected by Facebook SDK -->\n    <uses-permission android:name="com.google.android.gms.permission.AD_ID" tools:node="remove" />'
  );
}

fs.writeFileSync(manifestPath, xml, 'utf8');
console.log('✓ AndroidManifest.xml patched successfully');
