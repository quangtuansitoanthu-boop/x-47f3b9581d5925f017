import SiAndroid from '@icons-pack/svelte-simple-icons/icons/SiAndroid';
import SiApple from '@icons-pack/svelte-simple-icons/icons/SiApple';
import SiBrave from '@icons-pack/svelte-simple-icons/icons/SiBrave';
import SiDuckduckgo from '@icons-pack/svelte-simple-icons/icons/SiDuckduckgo';
import SiFacebook from '@icons-pack/svelte-simple-icons/icons/SiFacebook';
import SiFirefox from '@icons-pack/svelte-simple-icons/icons/SiFirefox';
import SiGithub from '@icons-pack/svelte-simple-icons/icons/SiGithub';
import SiGoogle from '@icons-pack/svelte-simple-icons/icons/SiGoogle';
import SiGooglechrome from '@icons-pack/svelte-simple-icons/icons/SiGooglechrome';
import SiLinux from '@icons-pack/svelte-simple-icons/icons/SiLinux';
import SiMacos from '@icons-pack/svelte-simple-icons/icons/SiMacos';
import SiOpera from '@icons-pack/svelte-simple-icons/icons/SiOpera';
import SiSafari from '@icons-pack/svelte-simple-icons/icons/SiSafari';
import SiUbuntu from '@icons-pack/svelte-simple-icons/icons/SiUbuntu';
import SiYoutube from '@icons-pack/svelte-simple-icons/icons/SiYoutube';
import AppWindow from '@lucide/svelte/icons/app-window';
import Bot from '@lucide/svelte/icons/bot';
import Building2 from '@lucide/svelte/icons/building-2';
import Earth from '@lucide/svelte/icons/earth';
import ExternalLink from '@lucide/svelte/icons/external-link';
import FileText from '@lucide/svelte/icons/file-text';
import Globe from '@lucide/svelte/icons/globe';
import Laptop from '@lucide/svelte/icons/laptop';
import Link from '@lucide/svelte/icons/link';
import MapPin from '@lucide/svelte/icons/map-pin';
import Monitor from '@lucide/svelte/icons/monitor';
import PanelsTopLeft from '@lucide/svelte/icons/panels-top-left';
import Search from '@lucide/svelte/icons/search';
import Smartphone from '@lucide/svelte/icons/smartphone';
import Tablet from '@lucide/svelte/icons/tablet';
import type { AnalyticsIconDimension } from './analytics-breakdown';

const BRAND_ICONS = {
  android: { color: '#3ddc84', component: SiAndroid },
  apple: { color: 'currentColor', component: SiApple },
  brave: { color: '#fb542b', component: SiBrave },
  chrome: { color: '#4285f4', component: SiGooglechrome },
  duckduckgo: { color: '#de5833', component: SiDuckduckgo },
  facebook: { color: '#0866ff', component: SiFacebook },
  firefox: { color: '#ff7139', component: SiFirefox },
  github: { color: 'currentColor', component: SiGithub },
  google: { color: '#4285f4', component: SiGoogle },
  linux: { color: '#2d2d2d', component: SiLinux },
  macos: { color: 'currentColor', component: SiMacos },
  opera: { color: '#ff1b2d', component: SiOpera },
  safari: { color: '#006cff', component: SiSafari },
  ubuntu: { color: '#e95420', component: SiUbuntu },
  youtube: { color: '#ff0033', component: SiYoutube },
} as const;

const LUCIDE_ICONS = {
  bing: { color: '#008373', component: Search },
  browser: { color: 'currentColor', component: Globe },
  chatgpt: { color: '#10a37f', component: Bot },
  city: { color: 'currentColor', component: Building2 },
  country: { color: 'currentColor', component: Globe },
  desktop: { color: 'currentColor', component: Monitor },
  device: { color: 'currentColor', component: Laptop },
  edge: { color: '#0ea5e9', component: Earth },
  external: { color: 'currentColor', component: ExternalLink },
  link: { color: 'currentColor', component: Link },
  mobile: { color: 'currentColor', component: Smartphone },
  'operating-system': { color: 'currentColor', component: AppWindow },
  page: { color: 'currentColor', component: FileText },
  region: { color: 'currentColor', component: MapPin },
  samsung: { color: '#1428a0', component: Smartphone },
  source: { color: 'currentColor', component: ExternalLink },
  tablet: { color: 'currentColor', component: Tablet },
  windows: { color: '#00a4ef', component: PanelsTopLeft },
} as const;

export type AnalyticsResolvedIcon = keyof typeof BRAND_ICONS | keyof typeof LUCIDE_ICONS;

export function resolveAnalyticsIcon(type: AnalyticsIconDimension, value: string): AnalyticsResolvedIcon {
  if (type === 'source') {
    if (value.includes('trực tiếp') || value.includes('direct')) return 'link';
    if (value.includes('google')) return 'google';
    if (value.includes('chatgpt') || value.includes('openai')) return 'chatgpt';
    if (value.includes('github')) return 'github';
    if (value.includes('duckduckgo')) return 'duckduckgo';
    if (value.includes('bing')) return 'bing';
    if (value.includes('facebook')) return 'facebook';
    if (value.includes('youtube')) return 'youtube';
    if (value.includes('brave')) return 'brave';
    if (value.includes('nội bộ') || value.includes('internal')) return 'external';
    return 'source';
  }
  if (type === 'browser') {
    if (value.includes('chrome')) return 'chrome';
    if (value.includes('safari')) return 'safari';
    if (value.includes('firefox')) return 'firefox';
    if (value.includes('edge')) return 'edge';
    if (value.includes('brave')) return 'brave';
    if (value.includes('opera')) return 'opera';
    if (value.includes('samsung')) return 'samsung';
    if (value.includes('duckduckgo')) return 'duckduckgo';
    return 'browser';
  }
  if (type === 'operating-system') {
    if (value.includes('windows')) return 'windows';
    if (value.includes('android')) return 'android';
    if (value.includes('ubuntu')) return 'ubuntu';
    if (value.includes('linux')) return 'linux';
    if (value.includes('chrome')) return 'chrome';
    if (value.includes('mac')) return 'macos';
    if (value.includes('ios') || value.includes('ipad')) return 'apple';
    return 'operating-system';
  }
  if (type === 'device') {
    if (value.includes('điện thoại') || value.includes('mobile')) return 'mobile';
    if (value.includes('máy tính bảng') || value.includes('tablet')) return 'tablet';
    if (value.includes('máy tính') || value.includes('desktop')) return 'desktop';
    return 'device';
  }
  return type;
}

export function getBrandIcon(icon: AnalyticsResolvedIcon) {
  return BRAND_ICONS[icon as keyof typeof BRAND_ICONS];
}

export function getLucideIcon(icon: AnalyticsResolvedIcon) {
  return LUCIDE_ICONS[icon as keyof typeof LUCIDE_ICONS];
}

export function countryFlag(value: string): string {
  const names: Record<string, string> = {
    canada: 'CA', china: 'CN', france: 'FR', germany: 'DE', india: 'IN', japan: 'JP',
    singapore: 'SG', thailand: 'TH', 'united kingdom': 'GB', 'united states': 'US',
    vietnam: 'VN', 'việt nam': 'VN',
  };
  const raw = value.trim();
  const code = (/^[a-z]{2}$/iu.test(raw) ? raw : names[raw.toLocaleLowerCase('vi-VN')])?.toUpperCase();
  if (!code) return '';
  return String.fromCodePoint(...[...code].map((character) => 127397 + character.charCodeAt(0)));
}
