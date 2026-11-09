export const BUDDHIST_CALENDAR_WIDGET_COPY = {
  fastingNote: 'Ngày Thập Trai (Ăn chay, làm lành)',
  abstinenceNote: 'Hôm nay là ngày kiêng hành dâm theo lịch Thọ Khang Bảo Giám.',
  weekdays: ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'],
} as const;

export function buddhistCalendarWidgetCopy(locale = 'vi') {
  return locale === 'en' ? {
    fastingNote: 'Ten fasting days (vegetarian practice and good deeds)',
    abstinenceNote: 'Today is an abstinence day in the Tho Khang Bao Giam calendar.',
    weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  } : BUDDHIST_CALENDAR_WIDGET_COPY;
}
