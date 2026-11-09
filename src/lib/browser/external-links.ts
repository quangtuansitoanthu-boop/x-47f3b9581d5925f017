import { registerPlugin } from '@capacitor/core';
import { isNativeApp, nativePlatform } from './native-platform';

interface ExternalLinksPlugin {
  openBrowser(options: { url: string }): Promise<void>;
}
const externalLinks = registerPlugin<ExternalLinksPlugin>('ExternalLinks');

export async function openExternalBrowser(value: string): Promise<void> {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('invalid_external_url');
  if (isNativeApp() && nativePlatform() === 'android') {
    try { await externalLinks.openBrowser({ url: url.href }); }
    catch { throw new Error('external_browser_unavailable'); }
    return;
  }
  // Capacitor iOS chuyển cửa sổ mới sang trình duyệt hệ thống; web mở tab riêng.
  window.open(url.href, '_blank', 'noopener,noreferrer');
}

export async function copyExternalLink(value: string): Promise<void> {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('invalid_external_url');
  if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
  await navigator.clipboard.writeText(url.href);
}
