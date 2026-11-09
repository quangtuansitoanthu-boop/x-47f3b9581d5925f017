import { getLunarEvent } from '$lib/components/lunar/lunar-events';
import {
  getPracticeRecommendations as getDomainPracticeRecommendations,
  type PracticeArticleReference,
} from '$lib/domain/practice/recommendations';

export type { PracticeArticleReference };
export type PracticeRecommendationPeriod = 'morning' | 'evening';
export type PracticeRecommendationAction = 'ceremony' | 'meditation' | 'rosary' | 'scripture';

export interface PracticeRecommendation {
  action: PracticeRecommendationAction;
  articleCategory?: 'KINH PHẬT' | 'TRÌ CHÚ' | 'NGHI THỨC KHÁC' | 'CÁC NGHI THỨC';
  articleId?: string;
  articleKeywords?: string[];
  buttonLabel?: string;
  description: string;
  id: string;
  reason: 'daily' | 'holy_day' | 'lunar_observance';
  step?: number;
  stepLabel?: string;
  title: string;
}

export interface PracticeRecommendationSet {
  contextLabel: string;
  lunarLabel: string | null;
  period: PracticeRecommendationPeriod;
  recommendations: PracticeRecommendation[];
}

function vietnamParts(date: Date): { day: number; hour: number; month: number; year: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: 'numeric',
    hour: 'numeric',
    hourCycle: 'h23',
    month: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { day: value('day'), hour: value('hour'), month: value('month'), year: value('year') };
}

export function getPracticeRecommendations(
  date: Date,
  selectedPeriod?: PracticeRecommendationPeriod,
  availableArticles?: readonly PracticeArticleReference[],
  locale?: string,
): PracticeRecommendationSet {
  const isEn = locale === 'en';
  const parts = vietnamParts(date);
  const period = selectedPeriod ?? (parts.hour < 12 ? 'morning' : 'evening');
  // Noon local construction lets the existing lunar utility resolve the intended
  // Vietnam civil day even when tests or clients run in another host timezone.
  const vietnamCivilDate = new Date(parts.year, parts.month - 1, parts.day, 12);
  const lunarEvent = getLunarEvent(vietnamCivilDate, locale);
  const recommendations: PracticeRecommendation[] = getDomainPracticeRecommendations({
    hour: period === 'morning' ? 8 : 20,
    lunarEvent,
    availableArticles,
    locale,
  }).map((recommendation) => ({
    action: recommendation.activity,
    ...(recommendation.articleCategory ? { articleCategory: recommendation.articleCategory } : {}),
    ...(recommendation.articleId ? { articleId: recommendation.articleId } : {}),
    ...(recommendation.articleKeywords ? { articleKeywords: [...recommendation.articleKeywords] } : {}),
    ...(recommendation.buttonLabel ? { buttonLabel: recommendation.buttonLabel } : {}),
    description: recommendation.description,
    id: recommendation.id,
    reason: recommendation.reason === 'lunar_event'
      ? lunarEvent.viaName ? 'holy_day' : 'lunar_observance'
      : 'daily',
    step: recommendation.step,
    stepLabel: recommendation.stepLabel,
    title: recommendation.title,
  }));
  const can = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];
  const chi = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];
  const canChiYear = `${can[(lunarEvent.lunarYear + 6) % 10]} ${chi[(lunarEvent.lunarYear + 8) % 12]}`;
  const baseDate = isEn
    ? `Day ${lunarEvent.lunarDay}, Month ${lunarEvent.lunarMonth}${lunarEvent.lunarLeap ? ' (leap)' : ''}, ${lunarEvent.lunarYear} (${canChiYear})`
    : `Ngày ${lunarEvent.lunarDay} tháng ${lunarEvent.lunarMonth}${lunarEvent.lunarLeap ? ' (nhuận)' : ''} năm ${lunarEvent.lunarYear} (${canChiYear})`;
  const extra = lunarEvent.viaName ?? (lunarEvent.isThapTrai ? (isEn ? 'Ten Fasting Day' : 'Ngày Thập Trai') : null);
  const lunarLabel = extra ? `${baseDate} · ${extra}` : baseDate;

  return {
    contextLabel: isEn
      ? (period === 'morning' ? 'Morning Recommendation' : 'Evening Recommendation')
      : (period === 'morning' ? 'Gợi ý buổi sáng' : 'Gợi ý buổi tối'),
    lunarLabel,
    period,
    recommendations,
  };
}
