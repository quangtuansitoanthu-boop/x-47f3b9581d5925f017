import { goto } from '$app/navigation';
import { browser } from '$app/environment';

export interface GuideConfirmData {
  href: string;
  label: string;
  text: string;
  buttonLabel?: string;
}

export type GuideConfirmType = 'practice' | 'book' | 'talk' | 'generic';

export function detectGuideConfirmType(item: GuideConfirmData | null): GuideConfirmType {
  if (!item) return 'generic';
  const href = (item.href || '').toLowerCase();
  const label = (item.label || '').toLowerCase();
  const btn = (item.buttonLabel || '').toLowerCase();

  if (
    href.includes('/tu-tap') ||
    href.includes('mode=practice') ||
    href.includes('mode=rosary') ||
    label.includes('tu tập') ||
    label.includes('chú đại bi') ||
    label.includes('trì chú') ||
    label.includes('tụng kinh') ||
    label.includes('niệm phật') ||
    btn.includes('tu tập') ||
    btn.includes('trì tụng')
  ) {
    return 'practice';
  }

  if (
    href.includes('sach=') ||
    href.includes('/kinh-sach') ||
    label.startsWith('sách:') ||
    label.includes('sách') ||
    btn.includes('đọc sách') ||
    btn.includes('xem sách')
  ) {
    return 'book';
  }

  if (
    href.includes('/phap-thoai') ||
    label.startsWith('pháp thoại:') ||
    label.includes('pháp thoại') ||
    btn.includes('pháp thoại') ||
    btn.includes('nghe')
  ) {
    return 'talk';
  }

  return 'generic';
}

class GuideConfirmState {
  isOpen = $state(false);
  item = $state<GuideConfirmData | null>(null);

  open(data: GuideConfirmData): void {
    this.item = data;
    this.isOpen = true;
  }

  close(): void {
    this.isOpen = false;
    this.item = null;
  }

  confirm(): void {
    if (!this.item) return;
    const targetHref = this.item.href;
    this.close();
    if (!browser) return;
    if (targetHref.startsWith('http://') || targetHref.startsWith('https://')) {
      window.open(targetHref, '_blank', 'noopener,noreferrer');
    } else {
      void goto(targetHref);
    }
  }
}

export const guideConfirmState = new GuideConfirmState();
