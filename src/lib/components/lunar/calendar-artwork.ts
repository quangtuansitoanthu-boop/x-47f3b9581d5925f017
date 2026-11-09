import type { LunarEventNotificationInfo } from './lunar-events';

export const DAILY_CALENDAR_ARTWORKS = [
  'lotus-dawn', 'temple-mist', 'bamboo-path', 'bodhi-leaves', 'stupa-moon',
  'incense-lotus', 'rosary-stillness', 'lotus-lanterns', 'zen-garden', 'pagoda-hills',
].map(name => `/images/calendar/${name}.webp`);

const traditional = (name: string) => `/images/le-phat/${name}.webp`;
const additional = (name: string) => `/images/calendar/feasts/${name}.webp`;
export const FEAST_CALENDAR_ARTWORKS: Record<string, string> = {
  '1-1': traditional('di-lac'),
  '2-8': traditional('thich-ca-mau-ni'), '2-15': traditional('thich-ca-mau-ni'),
  '2-19': traditional('quan-the-am-approved'), '2-21': traditional('pho-hien'),
  '3-6': additional('ca-diep'), '3-16': additional('chuan-de'),
  '4-4': traditional('van-thu-su-loi'), '4-8': traditional('thich-ca-mau-ni'),
  '4-15': traditional('thich-ca-mau-ni'), '4-20': additional('thich-quang-duc'),
  '4-23': traditional('pho-hien'), '4-28': traditional('duoc-su-approved'),
  '5-13': additional('gia-lam'), '6-3': additional('ho-phap'),
  '6-15': traditional('thich-ca-mau-ni'), '6-19': traditional('quan-the-am-approved'),
  '7-13': traditional('dai-the-chi-approved'), '7-30': traditional('dia-tang-vuong'),
  '8-8': additional('a-nan'), '8-22': additional('nhien-dang'),
  '9-19': traditional('quan-the-am-approved'), '9-30': traditional('duoc-su-approved'),
  '10-5': additional('bo-de-dat-ma'), '11-11': additional('tran-nhan-tong'),
  '11-17': traditional('a-di-da-approved'), '12-8': traditional('thich-ca-mau-ni'),
};

export function getCalendarArtwork(date: Date, event: LunarEventNotificationInfo, manualIndex: number | null = null) {
  const feastImage = event.viaKey ? FEAST_CALENDAR_ARTWORKS[event.viaKey] : null;
  if (feastImage) return { src: feastImage, feast: true };
  // Civil-day index: unaffected by DST or the device time zone offset.
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  const index = manualIndex ?? ((day % DAILY_CALENDAR_ARTWORKS.length) + DAILY_CALENDAR_ARTWORKS.length) % DAILY_CALENDAR_ARTWORKS.length;
  return { src: DAILY_CALENDAR_ARTWORKS[index % DAILY_CALENDAR_ARTWORKS.length], feast: false };
}
