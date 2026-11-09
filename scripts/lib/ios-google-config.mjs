import fs from 'node:fs';
import { createRequire } from 'node:module';

// Dùng parser đã có trong Capacitor CLI, không cài thêm dependency.
const require = createRequire(import.meta.resolve('@capacitor/cli/package.json'));
const plist = require('plist');

export function resolveIosGoogleClientId(value, required = false) {
  const clientId = String(value ?? '').trim();
  if (!clientId) {
    if (required) throw new Error('VITE_GOOGLE_IOS_CLIENT_ID is required for iOS builds on CI; configure GOOGLE_IOS_CLIENT_ID in repository variables.');
    return '';
  }
  if (!/^\d+-[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error('Invalid Google iOS client ID');
  return clientId;
}

export function configureIosGoogle(file, value) {
  const clientId = resolveIosGoogleClientId(value);
  if (!clientId) return;
  const source = fs.readFileSync(file, 'utf8');
  const info = plist.parse(source);
  const scheme = clientId.split('.').reverse().join('.');
  const types = info.CFBundleURLTypes ?? [];
  if (types.some(type => type.CFBundleURLSchemes?.includes(scheme))) return;
  const existing = types.find(type => type.CFBundleURLName === 'GoogleSignIn');
  if (existing) existing.CFBundleURLSchemes = [scheme];
  else types.push({ CFBundleURLName: 'GoogleSignIn', CFBundleURLSchemes: [scheme] });
  info.CFBundleURLTypes = types;
  const temporary = `${file}.ios-google.tmp`;
  try { fs.writeFileSync(temporary, plist.build(info)); fs.renameSync(temporary, file); }
  finally { fs.rmSync(temporary, { force: true }); }
}
