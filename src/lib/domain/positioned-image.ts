export interface PositionedImage {
  position: string;
  src: string;
}

export function parsePositionedImage(value: string | null | undefined): PositionedImage {
  const raw = String(value ?? '').trim();
  const firstMarker = raw.indexOf('#pos=');
  const lastMarker = raw.lastIndexOf('#pos=');
  if (firstMarker < 0) return { src: raw, position: 'center' };

  const src = raw.slice(0, firstMarker);
  try {
    return { src, position: decodeURIComponent(raw.slice(lastMarker + 5)) || 'center' };
  } catch {
    return { src, position: 'center' };
  }
}
