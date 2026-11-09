export type PracticeTimeWindow = 'morning' | 'daytime' | 'evening';

export interface PracticeArticleReference {
  id: string;
  title: string;
  category: 'KINH PHẬT' | 'CÁC NGHI THỨC' | 'TRÌ CHÚ' | 'NGHI THỨC KHÁC';
  tags?: readonly string[];
}

export interface PracticeRecommendationContext {
  hour: number;
  lunarEvent: {
    isEvent: boolean;
    isThapTrai: boolean;
    lunarDay: number;
    lunarMonth: number;
    viaName: string | null;
  };
  availableArticles?: readonly PracticeArticleReference[];
  locale?: string;
}

export interface PracticeRecommendation {
  id: string;
  step?: number;
  stepLabel?: string;
  title: string;
  description: string;
  reason: 'morning' | 'evening' | 'lunar_event' | 'fallback';
  activity: 'ceremony' | 'meditation' | 'rosary' | 'scripture';
  buttonLabel?: string;
  articleId?: string;
  articleCategory?: 'KINH PHẬT' | 'CÁC NGHI THỨC' | 'TRÌ CHÚ' | 'NGHI THỨC KHÁC';
  articleKeywords?: readonly string[];
}

export function practiceTimeWindow(hour: number): PracticeTimeWindow {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('invalid_local_hour');
  if (hour >= 4 && hour < 11) return 'morning';
  if (hour >= 17 || hour < 4) return 'evening';
  return 'daytime';
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/gu, 'd')
    .toLocaleLowerCase('vi-VN');
}

function isKarmicRepentance(title: string): boolean {
  const normalized = normalizeText(title);
  return (normalized.includes('sam hoi') && normalized.includes('oan gia trai chu'))
    || (normalized.includes('repentance') && normalized.includes('karmic creditors'));
}

function findMatchingArticle(
  articles: readonly PracticeArticleReference[],
  keywords: readonly string[],
  category?: PracticeArticleReference['category'],
): PracticeArticleReference | undefined {
  const normKeywords = keywords.map(normalizeText);
  return articles.find((article) => {
    if (category && article.category !== category) return false;
    const titleNorm = normalizeText(article.title);
    return normKeywords.some((kw) => titleNorm.includes(kw));
  });
}

export function getPracticeRecommendations(
  context: PracticeRecommendationContext,
): PracticeRecommendation[] {
  const isEn = context.locale === 'en';
  const window = practiceTimeWindow(context.hour);
  const { lunarDay, lunarMonth, viaName, isEvent, isThapTrai } = context.lunarEvent;
  const articles = context.availableArticles ?? [];

  const sutraFamilies = [
    { title: 'Kinh Địa Tạng', keywords: ['dia tang', 'ksitigarbha'] },
    { title: 'Kinh Diệu Pháp Liên Hoa', keywords: ['dieu phap lien hoa', 'phap hoa', 'lotus sutra'] },
    { title: 'Kinh Lăng Nghiêm', keywords: ['lang nghiem', 'surangama', 'shurangama'] },
    { title: 'Kinh Dược Sư', keywords: ['duoc su', 'medicine buddha', 'bhaisajyaguru'] },
  ];
  const sutras = articles.filter((article) => article.category === 'KINH PHẬT'
    && sutraFamilies.some((family) => family.keywords.some((keyword) => normalizeText(article.title).includes(keyword))));
  const rituals = articles.filter((a) => a.category === 'NGHI THỨC KHÁC' || (a.category as string) === 'CÁC NGHI THỨC');
  const mantras = articles.filter((a) => a.category === 'TRÌ CHÚ');

  const isLunarSpecialDay = Boolean(
    isEvent
    || isThapTrai
    || lunarDay === 1
    || lunarDay === 15
    || (lunarMonth === 7 && (lunarDay === 15 || lunarDay === 30))
    || (lunarDay === 19 && [2, 6, 9].includes(lunarMonth))
  );

  let lunarTargetKeywords: string[] = [];
  let lunarOccasionNotice = isEn
    ? `Lunar day ${lunarDay}/${lunarMonth}`
    : `Ngày ${lunarDay}/${lunarMonth} âm lịch`;

  if (lunarMonth === 7 && lunarDay === 30) {
    lunarTargetKeywords = ['dia tang', 'dia tang bo tat', 'ksitigarbha'];
    lunarOccasionNotice = isEn ? 'Ksitigarbha Bodhisattva Memorial Day' : 'Vía Địa Tạng Bồ Tát';
  } else if (lunarMonth === 7) {
    lunarTargetKeywords = ['vu lan', 'bao hieu', 'phu mau', 'ullambana'];
    lunarOccasionNotice = isEn ? 'Ullambana Filial Piety Season' : 'Mùa Vu Lan Báo Hiếu';
  } else if (lunarDay === 19 && [2, 6, 9].includes(lunarMonth)) {
    lunarTargetKeywords = ['quan the am', 'pho mon', 'dai bi', 'avalokiteshvara'];
    lunarOccasionNotice = isEn ? 'Avalokiteshvara Bodhisattva Memorial Day' : 'Vía Quán Thế Âm Bồ Tát';
  } else if (lunarDay === 1) {
    lunarTargetKeywords = ['sam hoi', 'pho mon', 'repentance'];
    lunarOccasionNotice = isEn ? 'New Moon Day (1st of lunar month)' : 'Mùng 1 đầu tháng';
  } else if (lunarDay === 15) {
    lunarTargetKeywords = ['sam hoi', 'pho mon', 'repentance'];
    lunarOccasionNotice = isEn ? 'Full Moon Day (15th of lunar month)' : 'Ngày Rằm thanh tịnh';
  } else if (isThapTrai) {
    lunarOccasionNotice = isEn
      ? `Ten Fasting Day (Day ${lunarDay}, Month ${lunarMonth} lunar)`
      : `Ngày Thập Trai (${lunarDay}/${lunarMonth} âm lịch)`;
  }

  // Tên ngày vía chỉ thay nhãn; không bỏ qua bài kinh phù hợp với ngày âm lịch.
  if (viaName) lunarOccasionNotice = viaName;

  // Check if library has a sutra matching lunar occasion
  const lunarSutra = lunarTargetKeywords.length
    ? findMatchingArticle(sutras, lunarTargetKeywords, 'KINH PHẬT')
    : undefined;
  const isMorning = window === 'morning';
  const isEvening = window === 'evening';

  // --- BƯỚC 1: LỄ PHẬT / LẠY PHẬT ---
  const ceremonyArticle = findMatchingArticle(rituals, ['le phat', 'lay phat', 'danh le', 'prostration', 'bowing', 'homage']);

  const step1Reason: PracticeRecommendation['reason'] = isLunarSpecialDay
    ? 'lunar_event'
    : (isEvening ? 'evening' : isMorning ? 'morning' : 'fallback');

  const step1: PracticeRecommendation = {
    id: isMorning ? 'morning-prostration' : isEvening ? 'evening-prostration' : 'daytime-prostration',
    step: 1,
    stepLabel: isEn ? 'Step 1 · Prostration' : 'Bước 1 · Lễ Phật',
    title: ceremonyArticle?.title ?? (isEn ? 'Prostration & Bowing' : 'Lễ Phật & Lạy Phật'),
    description: isLunarSpecialDay
      ? (isEn
        ? `${lunarOccasionNotice}; pay homage to the Triple Gem, purify body and mind, and cultivate merit.`
        : `${lunarOccasionNotice}; đảnh lễ Tam Bảo, thanh tịnh thân tâm, tăng trưởng phúc đức.`)
      : (isEvening
        ? (isEn
          ? 'Bow before the Triple Gem, repent karmas of body, speech, and mind after a long day, and settle the heart in serenity.'
          : 'Đảnh lễ Tam Bảo, lạy Phật sám hối ba nghiệp sau ngày dài, lắng dịu tâm tư.')
        : (isEn
          ? 'Start a serene morning by making 3 prostrations before the Triple Gem to steady the mind and awaken.'
          : 'Khởi đầu ngày mới thanh tịnh, đảnh lễ Tam Bảo 3 lạy để định tâm, tỉnh thức.')),
    reason: step1Reason,
    activity: 'ceremony',
    buttonLabel: isEn ? 'Prostration' : 'Lễ Phật',
    ...(ceremonyArticle ? { articleId: ceremonyArticle.id, articleCategory: ceremonyArticle.category } : {}),
    articleKeywords: ['lễ phật', 'lạy phật', 'đảnh lễ', 'prostration', 'bowing', 'homage'],
  };

  // --- BƯỚC 2: TỤNG KINH (Lấy từ KINH PHẬT trong kho) ---
  let selectedSutra: PracticeArticleReference | undefined;
  let sutraReason: PracticeRecommendation['reason'] = isLunarSpecialDay
    ? 'lunar_event'
    : (isMorning ? 'morning' : isEvening ? 'evening' : 'fallback');

  if (lunarSutra) {
    selectedSutra = lunarSutra;
    sutraReason = 'lunar_event';
  } else if (sutras.length > 0) {
    const offset = isEvening ? 1 : 0;
    const index = (Math.max(0, lunarDay - 1) + offset) % sutras.length;
    selectedSutra = sutras[index];
  }

  const step2: PracticeRecommendation = {
    id: isMorning ? 'morning-scripture' : isEvening ? 'evening-scripture' : 'daytime-scripture',
    step: 2,
    stepLabel: isEn ? 'Step 2 · Scripture Recitation' : 'Bước 2 · Tụng Kinh',
    title: selectedSutra?.title ?? (isEn ? 'Ksitigarbha Sutra' : sutraFamilies[0].title),
    description: selectedSutra
      ? (sutraReason === 'lunar_event'
        ? (isEn
          ? `${lunarOccasionNotice}; recommended liturgy to recite ${selectedSutra.title}.`
          : `${lunarOccasionNotice}; gợi ý thời khóa tụng đọc ${selectedSutra.title}.`)
        : (isMorning
          ? (isEn
            ? `Morning practice: recite ${selectedSutra.title} to illuminate wisdom and mindfulness.`
            : `Thời khóa buổi sáng, đọc tụng ${selectedSutra.title} để khai mở trí tuệ, tỉnh giác.`)
          : (isEn
            ? `Evening practice: recite ${selectedSutra.title} to calm the mind and dedicate merit.`
            : `Thời khóa buổi tối, tụng đọc ${selectedSutra.title} lắng đọng tâm tư, hồi hướng thiện căn.`)))
      : (isLunarSpecialDay
        ? (isEn
          ? `${lunarOccasionNotice}; select a scripture from the library to recite.`
          : `${lunarOccasionNotice}; chọn bài kinh phù hợp trong kho để đọc tụng.`)
        : (isMorning
          ? (isEn
            ? 'Select a scripture from the library to recite and illuminate wisdom at the start of the day.'
            : 'Chọn bài kinh trong danh mục để đọc tụng, khai mở trí tuệ đầu ngày.')
          : (isEn
            ? 'Select a scripture from the library to recite and dedicate merits at the end of the day.'
            : 'Chọn bài kinh trong danh mục để đọc tụng, hồi hướng công đức cuối ngày.'))),
    reason: sutraReason,
    activity: 'scripture',
    buttonLabel: isEn ? 'Chant Sutra' : 'Tụng kinh',
    ...(selectedSutra ? { articleId: selectedSutra.id } : {}),
    articleCategory: 'KINH PHẬT',
    articleKeywords: selectedSutra ? [normalizeText(selectedSutra.title)] : sutraFamilies.flatMap((family) => family.keywords),
  };

  // --- BƯỚC 3: TRÌ CHÚ & NIỆM PHẬT (Lấy từ CÁC NGHI THỨC hoặc Lần hạt) ---
  let selectedMantra: PracticeArticleReference | undefined;
  let mantraReason: PracticeRecommendation['reason'] = isMorning ? 'morning' : isEvening ? 'evening' : 'fallback';

  const candidates = [...mantras, ...rituals];
  const rotation = [
    findMatchingArticle(candidates, ['dai bi', 'great compassion']),
    findMatchingArticle(candidates, ['lang nghiem', 'surangama', 'shurangama']),
    candidates.find((article) => isKarmicRepentance(article.title)),
  ].filter((article): article is PracticeArticleReference => Boolean(article));
  if (rotation.length > 0) {
    const offset = Math.max(0, lunarDay - 1) * 2 + (isEvening ? 1 : 0);
    selectedMantra = rotation[offset % rotation.length];
    if (isLunarSpecialDay) mantraReason = 'lunar_event';
  }
  const isRepentance = selectedMantra && isKarmicRepentance(selectedMantra.title);

  const step3: PracticeRecommendation = selectedMantra
    ? {
      id: isMorning ? 'morning-mantra' : isEvening ? 'evening-mantra' : 'daytime-mantra',
      step: 3,
      stepLabel: isRepentance
        ? (isEn ? 'Step 3 · Repentance' : 'Bước 3 · Sám Hối')
        : (isEn ? 'Step 3 · Mantra Recitation' : 'Bước 3 · Trì Chú'),
      title: selectedMantra.title,
      description: mantraReason === 'lunar_event'
        ? (isEn
          ? `${lunarOccasionNotice}; practice session of ${selectedMantra.title}.`
          : `${lunarOccasionNotice}; thời khóa thực hành ${selectedMantra.title}.`)
        : (isMorning
          ? (isEn
            ? `Morning practice: perform ${selectedMantra.title} to dispel obstacles and steady body and mind.`
            : `Thời khóa buổi sáng thực hành ${selectedMantra.title} tiêu trừ chướng ngại, thân tâm an định.`)
          : (isEn
            ? `Evening practice: perform ${selectedMantra.title} to purify the three karmas before restful sleep.`
            : `Thời khóa buổi tối thực hành ${selectedMantra.title} thanh tịnh ba nghiệp trước giờ an nghỉ.`)),
      reason: mantraReason,
      activity: 'scripture',
      buttonLabel: isRepentance ? (isEn ? 'Repentance' : 'Sám hối') : (isEn ? 'Chant Mantra' : 'Trì chú'),
      articleId: selectedMantra.id,
      articleCategory: selectedMantra.category,
      articleKeywords: [normalizeText(selectedMantra.title)],
    }
    : {
      id: isMorning ? 'morning-rosary' : isEvening ? 'evening-rosary' : 'daytime-rosary',
      step: 3,
      stepLabel: isEn ? 'Step 3 · Buddha Recitation' : 'Bước 3 · Niệm Phật',
      title: isEn
        ? (isEvening ? 'Evening Buddha Recitation' : 'Mindful Buddha Recitation')
        : (isEvening ? 'Niệm Phật buổi tối' : 'Niệm Phật tĩnh tâm'),
      description: isEvening
        ? (isEn
          ? 'Conclude the day with gentle, rhythmic recitation of the Buddha’s name to quiet the mind.'
          : 'Khép lại ngày bằng một tràng niệm Phật có nhịp chậm và đều, tâm an định.')
        : (isEn
          ? 'Cultivate morning mindfulness with a round of recitation beads chanting the Buddha’s name.'
          : 'Nuôi dưỡng chánh niệm đầu ngày bằng một tràng chuỗi niệm Phật.'),
      reason: isEvening ? 'evening' : isMorning ? 'morning' : 'fallback',
      activity: 'rosary',
      buttonLabel: isEn ? 'Rosary Beads' : 'Lần hạt',
    };

  return [step1, step2, step3];
}
