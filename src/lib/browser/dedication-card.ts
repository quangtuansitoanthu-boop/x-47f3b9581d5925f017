import type { PracticeBadgeId } from '$lib/domain/practice/progress-achievements';
import { savePngImage } from './image-export';

export const DEDICATION_CARD_WIDTH = 1200;
export const DEDICATION_CARD_HEIGHT = 630;
export const DEDICATION_CARD_LOGO = '/assets/branding/tu-tap-logo.png';
export const DEDICATION_CARD_FONT_FAMILY = 'San Francisco Web';
export const DEDICATION_CARD_FONT_ASSETS = [
  { path: '/fonts/san-francisco/SanFranciscoText-Regular.otf', weight: '400' },
  { path: '/fonts/san-francisco/SanFranciscoText-Medium.otf', weight: '500' },
  { path: '/fonts/san-francisco/SanFranciscoText-Semibold.otf', weight: '600' },
  { path: '/fonts/san-francisco/SanFranciscoText-Bold.otf', weight: '700' },
] as const;

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
let dedicationCardFontsReady: Promise<void> | null = null;

interface DedicationFontFace {
  load: () => Promise<DedicationFontFace>;
}

interface DedicationFontFaceConstructor {
  new (family: string, source: string, descriptors: { weight: string }): DedicationFontFace;
}

interface DedicationFontSet {
  add: (face: DedicationFontFace) => unknown;
  ready: Promise<unknown>;
}

export interface DedicationCardInput {
  displayName: string;
  currentStreak: number;
  longestStreak: number;
  totalAcceptedCount: number;
  totalAcceptedDurationSeconds: number;
  totalSessions: number;
  selectedBadge: PracticeBadgeId | null;
  badgeLabel: string;
  today: string;
}

export async function createDedicationCardBlob(input: DedicationCardInput): Promise<Blob> {
  if (typeof document === 'undefined') throw new Error('dedication_card_browser_required');
  const canvas = document.createElement('canvas');
  canvas.width = DEDICATION_CARD_WIDTH;
  canvas.height = DEDICATION_CARD_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('dedication_card_canvas_unavailable');

  await ensureBundledDedicationCardFonts();
  const logo = await loadSameOriginImage(DEDICATION_CARD_LOGO);
  paintCard(context, input, logo);
  const blob = await canvasBlob(canvas);
  if (!await hasPngSignature(blob)) throw new Error('dedication_card_invalid_png');
  return blob;
}

export function triggerDedicationCardDownload(blob: Blob, today: string): Promise<boolean> {
  return savePngImage(blob, `hoi-huong-${safeFileSegment(today)}.png`);
}

export async function createDedicationCardDownload(
  input: DedicationCardInput,
  isCurrent: () => boolean,
  createBlob: (value: DedicationCardInput) => Promise<Blob> = createDedicationCardBlob,
  triggerDownload: (blob: Blob, today: string) => void | boolean | Promise<void | boolean> = triggerDedicationCardDownload,
): Promise<boolean> {
  const blob = await createBlob(input);
  if (!isCurrent()) return false;
  const saved = await triggerDownload(blob, input.today);
  return saved !== false && isCurrent();
}

export async function downloadDedicationCard(input: DedicationCardInput): Promise<void> {
  await createDedicationCardDownload(input, () => true);
}

export async function hasPngSignature(blob: Blob): Promise<boolean> {
  if (blob.type !== 'image/png' || blob.size < PNG_SIGNATURE.length) return false;
  const bytes = new Uint8Array(await blob.slice(0, PNG_SIGNATURE.length).arrayBuffer());
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

export async function loadBundledDedicationCardFonts(
  fontSet: DedicationFontSet,
  FontFaceConstructor: DedicationFontFaceConstructor,
): Promise<void> {
  const faces = DEDICATION_CARD_FONT_ASSETS.map(({ path, weight }) => new FontFaceConstructor(
    DEDICATION_CARD_FONT_FAMILY,
    `url("${path}") format("opentype")`,
    { weight },
  ));
  const loaded = await Promise.all(faces.map((face) => face.load()));
  loaded.forEach((face) => fontSet.add(face));
  await fontSet.ready;
}

async function ensureBundledDedicationCardFonts(): Promise<void> {
  const FontFaceConstructor = globalThis.FontFace as unknown as DedicationFontFaceConstructor | undefined;
  const fontSet = document.fonts as unknown as DedicationFontSet | undefined;
  if (!FontFaceConstructor || !fontSet?.add) {
    await document.fonts?.ready;
    return;
  }
  if (!dedicationCardFontsReady) {
    dedicationCardFontsReady = loadBundledDedicationCardFonts(fontSet, FontFaceConstructor)
      .catch((cause) => {
        dedicationCardFontsReady = null;
        throw cause;
      });
  }
  await dedicationCardFontsReady;
}

function paintCard(
  context: CanvasRenderingContext2D,
  input: DedicationCardInput,
  logo: HTMLImageElement,
): void {
  const palette = {
    background: '#f8f7f2',
    border: '#d8cfbd',
    gold: '#b88432',
    ink: '#292219',
    muted: '#695d4e',
    panel: '#eee8db',
  };
  context.fillStyle = palette.background;
  context.fillRect(0, 0, DEDICATION_CARD_WIDTH, DEDICATION_CARD_HEIGHT);
  context.strokeStyle = palette.border;
  context.lineWidth = 4;
  context.strokeRect(28, 28, DEDICATION_CARD_WIDTH - 56, DEDICATION_CARD_HEIGHT - 56);

  context.drawImage(logo, 72, 64, 88, 88);
  context.fillStyle = palette.gold;
  context.font = `700 24px "${DEDICATION_CARD_FONT_FAMILY}", "Segoe UI", sans-serif`;
  context.fillText('TU TẬP CÙNG QUANG TỪ', 184, 105);
  context.fillStyle = palette.muted;
  context.font = `500 20px "${DEDICATION_CARD_FONT_FAMILY}", "Segoe UI", sans-serif`;
  context.fillText('Thẻ hồi hướng công phu', 184, 139);

  context.fillStyle = palette.ink;
  context.font = `700 54px "${DEDICATION_CARD_FONT_FAMILY}", "Segoe UI", sans-serif`;
  context.fillText(trimCanvasText(context, input.displayName || 'Phật tử', 950), 72, 240);
  context.fillStyle = palette.muted;
  context.font = `400 24px "${DEDICATION_CARD_FONT_FAMILY}", "Segoe UI", sans-serif`;
  context.fillText('Nguyện hồi hướng công đức tu tập đến tất cả chúng sinh.', 72, 286);

  context.fillStyle = palette.panel;
  roundedRect(context, 72, 330, 1056, 164, 20);
  context.fill();
  const stats = [
    [formatNumber(input.currentStreak), 'ngày hiện tại'],
    [formatNumber(input.longestStreak), 'ngày dài nhất'],
    [formatNumber(input.totalAcceptedCount), 'biến hợp lệ'],
    [formatDuration(input.totalAcceptedDurationSeconds), `${formatNumber(input.totalSessions)} phiên`],
  ];
  stats.forEach(([value, label], index) => {
    const x = 112 + index * 260;
    context.fillStyle = palette.gold;
    context.font = `700 34px "${DEDICATION_CARD_FONT_FAMILY}", "Segoe UI", sans-serif`;
    context.fillText(value, x, 396);
    context.fillStyle = palette.muted;
    context.font = `500 18px "${DEDICATION_CARD_FONT_FAMILY}", "Segoe UI", sans-serif`;
    context.fillText(label, x, 431);
  });

  context.fillStyle = palette.ink;
  context.font = `600 20px "${DEDICATION_CARD_FONT_FAMILY}", "Segoe UI", sans-serif`;
  context.fillText(input.selectedBadge ? `Huy hiệu: ${input.badgeLabel}` : 'Mỗi ngày một bước chân an tĩnh', 72, 550);
  context.textAlign = 'right';
  context.fillStyle = palette.muted;
  context.font = `500 18px "${DEDICATION_CARD_FONT_FAMILY}", "Segoe UI", sans-serif`;
  context.fillText(formatIsoDate(input.today), 1128, 550);
  context.textAlign = 'left';
}

function loadSameOriginImage(path: string): Promise<HTMLImageElement> {
  const url = new URL(path, globalThis.location.href);
  if (url.origin !== globalThis.location.origin) return Promise.reject(new Error('dedication_card_cross_origin_asset'));
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('dedication_card_logo_unavailable'));
    image.src = url.href;
  });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('dedication_card_export_failed')), 'image/png');
  });
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function trimCanvasText(context: CanvasRenderingContext2D, value: string, maxWidth: number): string {
  const normalized = value.trim() || 'Phật tử';
  if (context.measureText(normalized).width <= maxWidth) return normalized;
  let output = normalized;
  while (output.length > 1 && context.measureText(`${output}…`).width > maxWidth) output = output.slice(0, -1);
  return `${output.trim()}…`;
}

function formatNumber(value: number): string {
  return Math.max(0, Math.floor(value || 0)).toLocaleString('vi-VN');
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds || 0) / 60);
  if (minutes < 60) return `${formatNumber(minutes)} phút`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${formatNumber(hours)}g ${remainder}p` : `${formatNumber(hours)} giờ`;
}

function formatIsoDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function safeFileSegment(value: string): string {
  return value.replace(/[^0-9A-Za-z-]/gu, '').slice(0, 40) || 'cong-phu';
}
