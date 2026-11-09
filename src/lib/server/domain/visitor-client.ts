export interface VisitorClientMetadata {
  browserName: string;
  deviceType: string;
  operatingSystem: string;
}

export function visitorClientMetadata(userAgent: string | null): VisitorClientMetadata {
  const source = String(userAgent || '');
  return {
    browserName: browserName(source),
    deviceType: deviceType(source),
    operatingSystem: operatingSystem(source),
  };
}

export function normalizeVisitorPath(value: unknown): string {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return '/';
  return candidate.split(/[?#]/u, 1)[0].slice(0, 200) || '/';
}

export function vietnamDateKey(epochMs: number): string {
  return new Date(epochMs + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function browserName(source: string): string {
  if (/Edg(?:e|A|iOS)?\//u.test(source)) return 'Microsoft Edge';
  if (/SamsungBrowser\//u.test(source)) return 'Samsung Internet';
  if (/OPR\//u.test(source)) return 'Opera';
  if (/(?:Chrome|CriOS)\//u.test(source)) return 'Google Chrome';
  if (/(?:Firefox|FxiOS)\//u.test(source)) return 'Mozilla Firefox';
  if (/Safari\//u.test(source) && /Version\//u.test(source)) return 'Safari';
  return 'Trình duyệt khác';
}

function deviceType(source: string): string {
  if (/iPad|Tablet|Nexus 7|Nexus 10|SM-T/u.test(source)) return 'Máy tính bảng';
  if (/Mobi|iPhone|Android/u.test(source)) return 'Điện thoại';
  return 'Máy tính';
}

function operatingSystem(source: string): string {
  if (/iPhone|iPad|iPod/u.test(source)) return 'iOS / iPadOS';
  if (/Android/u.test(source)) return 'Android';
  if (/Windows NT/u.test(source)) return 'Windows';
  if (/Mac OS X/u.test(source)) return 'macOS';
  if (/Linux/u.test(source)) return 'Linux';
  return 'Hệ điều hành khác';
}
