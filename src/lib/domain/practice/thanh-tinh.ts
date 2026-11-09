import { getLunarEvent } from '../../components/lunar/lunar-events';
import { getVietnamIsoDate, shiftVietnamDate } from './stats';

export interface ThanhTinhMilestone {
  days: number;
  title: string;
  subtitle: string;
  icon: string;
  description: string;
  quote: string;
}

export const THANH_TINH_MILESTONES: readonly ThanhTinhMilestone[] = [
  {
    days: 1,
    title: 'Sơ Khởi Tâm',
    subtitle: 'Bước đầu tỉnh giác',
    icon: '🌱',
    description: 'Vượt qua 24 giờ đầu tiên, dũng cảm đối diện với bản năng và phát tâm giữ gìn thân tâm thanh tịnh.',
    quote: 'Chiến thắng vạn quân không bằng tự chiến thắng chính mình. Chiến thắng chính mình là chiến công oanh liệt nhất.'
  },
  {
    days: 3,
    title: 'Vượt Ải Dopamine',
    subtitle: 'Hạ nhiệt cơn nghiện',
    icon: '🌿',
    description: 'Cơn thèm dopamine cấp thấp bắt đầu lắng xuống, năng lượng cơ thể bắt đầu hồi phục, đầu óc bớt vướng bận.',
    quote: 'Tâm dẫn đầu các pháp, tâm làm chủ tâm tạo. Nếu với tâm thanh tịnh nói năng hay hành động, an lạc sẽ theo ta.'
  },
  {
    days: 7,
    title: 'Nhất Tuần Thanh Tịnh',
    subtitle: 'Khí sắc hồi phục',
    icon: '🪷',
    description: 'Tròn một tuần gìn giữ trinh bạch. Mắt sáng hơn, giấc ngủ sâu hơn, năng lượng cơ thể được tái tích tụ rõ rệt.',
    quote: 'Chư Phật mười phương đều hoan hỷ khi thấy một người con Phật dứt trừ phóng túng, quay về nẻo thiện.'
  },
  {
    days: 14,
    title: 'Tinh Tấn Bất Thoái',
    subtitle: 'Ý chí kiên định',
    icon: '💎',
    description: 'Hai tuần vững vàng qua các cơn kích thích mạnh nhất. Thần thái bắt đầu tự tin, không còn cảm giác lén lút tội lỗi.',
    quote: 'Dù ở trong phòng tối một mình, mười phương Chư Phật, Bồ Tát và Hộ Pháp Thiện Thần vẫn luôn từ bi chứng giám.'
  },
  {
    days: 21,
    title: 'Tái Lập Thói Quen',
    subtitle: 'Não bộ tái cấu trúc',
    icon: '✨',
    description: 'Đủ 21 ngày để hình thành đường mòn thần kinh mới. Dâm niệm ít khởi hơn, sức tập trung làm việc và học tập tăng vọt.',
    quote: 'Thân tâm trong sạch thì tà quỷ tự lui, phước đức tự đến, vận mạng tự nhiên hanh thông sáng lạn.'
  },
  {
    days: 30,
    title: 'Một Tháng Tẩy Trần',
    subtitle: 'Nguyên khí sung mãn',
    icon: '🔥',
    description: 'Một tháng giữ trọn giới hạnh! Thận khí vững vàng, giọng nói trầm ấm, trí tuệ minh mẫn, tinh thần sảng khoái.',
    quote: 'Ấn Quang Đại Sư dạy: Giữ gìn tinh khí là giữ gìn mạng sống và phước báo của chính mình và con cháu mai sau.'
  },
  {
    days: 60,
    title: 'Định Lực Vững Vàng',
    subtitle: 'Làm chủ bản năng',
    icon: '🛡️',
    description: 'Hai tháng chuyển hóa dục hỏa thành công. Bạn đã làm chủ được các xung động cảm xúc và làm chủ cơ thể mình.',
    quote: 'Người không đắm nhiễm dục vọng thì tâm thanh như nước hồ thu, sáng suốt thấy rõ chân lý muôn đời.'
  },
  {
    days: 90,
    title: 'Tái Sinh Thân Tâm',
    subtitle: 'Full Reboot hoàn toàn',
    icon: '👑',
    description: '90 ngày giải độc dopamine hoàn toàn! Não bộ phục hồi trọn vẹn, nội tâm an lạc, từ trường thanh tịnh bao bọc.',
    quote: 'Dục vọng đã phục, ma chướng tiêu tan, hào quang thiện thần thường chiếu sáng hộ trì người giữ giới.'
  },
  {
    days: 180,
    title: 'Kim Cương Bất Hoại',
    subtitle: 'Nửa năm thanh tịnh',
    icon: '☀️',
    description: 'Nửa năm gìn giữ giới thể thanh lương. Thân thể dẻo dai, trí tuệ phát quang, tâm hồn rộng mở bao dung.',
    quote: 'Thọ Khang Bảo Giám: Tiết dục bảo tinh là gốc rễ của trường thọ, an khang và phúc trạch vô lượng.'
  },
  {
    days: 365,
    title: 'Đại Viên Mãn',
    subtitle: 'Một năm chuyển hóa trọn vẹn',
    icon: '🏆',
    description: 'Một năm tinh tấn phi thường! Bạn đã hoàn toàn chuyển hóa năng lượng tính dục thành Bồ-đề tâm và sức mạnh phụng sự.',
    quote: 'Nguyện đem công đức giữ giới thanh tịnh này hồi hướng khắp pháp giới chúng sinh đều được ly dục giải thoát.'
  },
  {
    days: 730,
    title: 'Thân Tâm Trinh Bạch',
    subtitle: 'Hai năm thanh tịnh kiên cố',
    icon: '🌟',
    description: 'Hai năm bền bỉ giữ giới. Khí huyết thuần khiết, gương mặt sáng ngời đoan chính, tâm niệm an định không còn dao động trước cám dỗ trần tục.',
    quote: 'Người giữ giới thanh tịnh hai năm thì chân khí sung mãn, tinh thần an lạc, phước đức sâu dày như đất mẹ.'
  },
  {
    days: 1095,
    title: 'Tam Niên Đoạn Dục',
    subtitle: 'Ba năm chuyển hóa căn bản',
    icon: '🕊️',
    description: 'Ba năm công phu viên thành! Bản năng dục vọng được chuyển hóa hoàn toàn thành trí tuệ và tình thương rộng lớn. Thần khí vững chãi bất động.',
    quote: 'Kinh Lăng Nghiêm dạy: Dâm tâm bất trừ, trần bất khả xuất. Ba năm dứt niệm dâm dục là bước lên đài sen thanh tịnh.'
  },
  {
    days: 1825,
    title: 'Ngũ Niên Định Lực',
    subtitle: 'Năm năm giới thể trang nghiêm',
    icon: '🛡️',
    description: 'Năm năm kiên cường giữ gìn giới tướng giới thể. Từ trường an lành lan tỏa, chư Thiên thiện thần ngày đêm hộ trì, tai ương tiêu trừ, phúc thọ tăng trưởng.',
    quote: 'Giới năng sinh Định, Định năng phát Tuệ. Năm năm giữ giới là nền móng kim cương cho muôn hạnh lành.'
  },
  {
    days: 2555,
    title: 'Thất Niên Chuyển Nghiệp',
    subtitle: 'Bảy năm hoán cốt đoạt thai',
    icon: '🪷',
    description: 'Bảy năm tẩy sạch túc nghiệp, toàn bộ tế bào và tạng phủ trong cơ thể được tái sinh hoàn toàn trong năng lượng thanh tịnh thuần khiết.',
    quote: 'Bảy năm trai giới thanh tịnh, thân như lưu ly trong ngoài sáng suốt, tâm như hư không không chút bợn nhơ.'
  },
  {
    days: 3650,
    title: 'Thập Niên Đại Định',
    subtitle: 'Mười năm công đức cao dày',
    icon: '⚜️',
    description: 'Mười năm một chặng đường phi thường! Bạn đã chiến thắng hoàn toàn tập khí luân hồi hiểm ác, trở thành tấm gương sáng ngời về tiết dục và đức hạnh.',
    quote: 'Mười năm không phạm tà dâm, công đức ngang với xây dựng bảo tháp, quỷ thần kính sợ, chư Phật hộ niệm.'
  },
  {
    days: 5475,
    title: 'Bồ Đề Tâm Nguyện',
    subtitle: 'Mười lăm năm chí nguyện Bồ Tát',
    icon: '🌠',
    description: 'Mười lăm năm gìn giữ thân tâm trinh bạch tuyệt đối. Năng lượng tính dục đã hóa thành đại nguyện Bồ-đề, cứu độ tha nhân, phổ chiếu ánh sáng thiện lành.',
    quote: 'Tâm Bồ-đề kiên cố qua mười lăm năm thanh tịnh, không còn chút dục nhiễm trần ai, thong dong nơi biển sinh tử.'
  },
  {
    days: 7300,
    title: 'Viên Mãn Kim Cang',
    subtitle: 'Hai mươi năm đạo hạnh vô thượng',
    icon: '👑',
    description: 'Hai mươi năm giới đức viên dung! Thân tâm bất hoại như kim cang, định lực siêu phàm, bước vào cảnh giới an lạc giải thoát tột cùng giữa cõi nhân gian.',
    quote: 'Hai mươi năm thanh tịnh trọn vẹn, giới đức tỏa hương thơm ngược gió khắp mười phương, đạo nghiệp viên thành thù thắng.'
  }
];

export const THANH_TINH_MILESTONES_EN: readonly ThanhTinhMilestone[] = [
  {
    days: 1,
    title: 'Awakening Heart',
    subtitle: 'First step of mindfulness',
    icon: '🌱',
    description: 'Surpassed the first 24 hours, courageously confronting instinctual urges and vowing to maintain body and mind in pure mindfulness.',
    quote: 'Conquering oneself is a far greater victory than conquering a thousand armies in battle.'
  },
  {
    days: 3,
    title: 'Overcoming Dopamine Rush',
    subtitle: 'Cooling the craving',
    icon: '🌿',
    description: 'Low-level dopamine cravings begin to subside, physical energy restores, mental fog disperses.',
    quote: 'Mind precedes all mental states. Mind is their chief; with a pure mind one speaks and acts, happiness follows like an inseparable shadow.'
  },
  {
    days: 7,
    title: 'One Week of Purity',
    subtitle: 'Vital radiance restored',
    icon: '🪷',
    description: 'A full week of guarding celibacy. Brighter eyes, deeper sleep, physical vital essence tangibly accumulates.',
    quote: 'All Buddhas of the ten directions rejoice seeing a disciple renounce sensual indulgence and return to the wholesome path.'
  },
  {
    days: 14,
    title: 'Steadfast Diligence',
    subtitle: 'Unwavering willpower',
    icon: '💎',
    description: 'Two weeks standing firm against the strongest urges. Radiating genuine confidence without guilt or shame.',
    quote: 'Even alone in a dark room, all Buddhas, Bodhisattvas, and Dharma Protectors compassionately witness your conduct.'
  },
  {
    days: 21,
    title: 'Habit Rewiring',
    subtitle: 'Neural reconstruction',
    icon: '✨',
    description: '21 days to form brand-new neural pathways. Lustful impulses seldom arise; focus in work and studies surges.',
    quote: 'When body and mind remain immaculate, evil spirits retreat, blessings naturally arrive, and destiny shines bright.'
  },
  {
    days: 30,
    title: 'One Month Cleansing',
    subtitle: 'Abundant vital essence',
    icon: '🔥',
    description: 'One full month upholding pure conduct! Kidney essence firmly rooted, clear voice, sharp intellect, elevated spirit.',
    quote: 'Master Yinguang taught: Preserving vital essence is preserving your life, longevity, and future generations.'
  },
  {
    days: 60,
    title: 'Solid Concentration',
    subtitle: 'Mastering instincts',
    icon: '🛡️',
    description: 'Two months transmuting sensual fire. You have mastered emotional surges and gained sovereign control over bodily impulses.',
    quote: 'One untainted by sensual craving possesses a mind as tranquil as an autumn lake, perceiving eternal truth.'
  },
  {
    days: 90,
    title: 'Rebirth of Body & Mind',
    subtitle: 'Full dopamine reset',
    icon: '👑',
    description: '90 days complete dopamine detox! Brain architecture fully restored, inner peace, enveloped in a pure energy aura.',
    quote: 'Sensual cravings subdued, demonic obstacles vanish, divine light continuously shields the disciplined practitioner.'
  },
  {
    days: 180,
    title: 'Indestructible Diamond',
    subtitle: 'Half a year of purity',
    icon: '☀️',
    description: 'Six months cultivating tranquil precepts. Resilient physique, luminous wisdom, expansive compassionate heart.',
    quote: 'Treasury of Longevity and Health: Chastity and conserving vital essence is the foundation of longevity and boundless fortune.'
  },
  {
    days: 365,
    title: 'Great Fulfillment',
    subtitle: 'One year of transformation',
    icon: '🏆',
    description: 'One year of extraordinary perseverance! Sensual energy fully sublimated into Bodhicitta and dedicated altruism.',
    quote: 'May the merit of maintaining pure precepts be dedicated to all sentient beings across the universe to attain liberation from craving.'
  },
  {
    days: 730,
    title: 'Immaculate Purity',
    subtitle: 'Two years of steadfast discipline',
    icon: '🌟',
    description: 'Two years of unwavering virtue. Pure vitality, dignified serene countenance, unshakable composure before worldly temptations.',
    quote: 'One who remains pure for two years gathers abundant vital force, experiencing tranquility as steadfast as the earth.'
  },
  {
    days: 1095,
    title: 'Three-Year Transcendence',
    subtitle: 'Fundamental habit transmutation',
    icon: '🕊️',
    description: 'Three years of spiritual mastery! Instinctual cravings transformed into wisdom and vast compassion. Vitality unshakable.',
    quote: 'The Shurangama Sutra teaches: Unless lustful desire is severed, one cannot escape cyclic existence. Three years of purity is stepping onto the lotus throne.'
  },
  {
    days: 1825,
    title: 'Five-Year Deep Stillness',
    subtitle: 'Precept body adorned',
    icon: '🛡️',
    description: 'Five years strictly upholding pure conduct. Peaceful aura radiating, celestial beings day and night protect, perils averted.',
    quote: 'Precepts give rise to concentration; concentration yields wisdom. Five years of pure discipline forms an adamantine foundation for all virtues.'
  },
  {
    days: 2555,
    title: 'Seven-Year Karmic Renewal',
    subtitle: 'Transmuting bone and marrow',
    icon: '🪷',
    description: 'Seven years purifying past karma; all cells and internal organs completely renewed in pristine life force.',
    quote: 'Seven years of celibate purity renders the body like clear crystal, inside and out, untainted by earthly dust.'
  },
  {
    days: 3650,
    title: 'Decade of Great Samadhi',
    subtitle: 'Ten years of profound merit',
    icon: '⚜️',
    description: 'Ten years along an extraordinary journey! Completely triumphing over cyclic habit energies, shining as a beacon of virtue.',
    quote: 'Ten years free from sexual misconduct equals the merit of erecting sacred stupas; revered by guardian spirits and guarded by all Buddhas.'
  },
  {
    days: 5475,
    title: 'Bodhisattva Vow',
    subtitle: 'Fifteen years of pure aspiration',
    icon: '🌠',
    description: 'Fifteen years guarding absolute purity. Sensual energy sublimated into the great Bodhi vow, liberating self and others.',
    quote: 'Bodhicitta unyielding through fifteen years of pure conduct, roaming freely across the ocean of birth and death without sensual attachment.'
  },
  {
    days: 7300,
    title: 'Vajra Supreme Completion',
    subtitle: 'Twenty years of consummate virtue',
    icon: '👑',
    description: 'Twenty years of immaculate virtue! Body and mind indestructible like diamond, entering ultimate peace and liberation.',
    quote: 'Twenty years of immaculate purity emits a fragrance of virtue wafting against the wind throughout the ten directions.'
  }
];

export interface ThanhTinhRelapse {
  date: string;
  reason?: string;
  note?: string;
}

export interface ThanhTinhState {
  joined: boolean;
  joinedAt: string | null;
  cleanSince: string; // ISO string
  longestStreakDays: number;
  resistedUrgesCount: number;
  pendingResistedCount: number; // un-synced urges to batch sync at end of day
  lastCheckInDate: string | null;
  checkInDates: string[];
  relapseHistory: ThanhTinhRelapse[];
  hasRecentRelapse: boolean;
  consecutiveCheckInsSinceRelapse: number;
  // undefined: dữ liệu cũ chưa có mốc giờ; null: chuỗi điểm danh đã dừng.
  checkInRunStartedAt?: string | null;
  checkInRunStartDate?: string;
  longestCheckInStreakDays?: number;
}

export const THANH_TINH_STORAGE_KEY = 'tutam_thanh_tinh_v1';

export function getDefaultThanhTinhState(nowIso = new Date().toISOString()): ThanhTinhState {
  return {
    joined: false,
    joinedAt: null,
    cleanSince: nowIso,
    longestStreakDays: 0,
    resistedUrgesCount: 0,
    pendingResistedCount: 0,
    lastCheckInDate: null,
    checkInDates: [],
    relapseHistory: [],
    hasRecentRelapse: false,
    consecutiveCheckInsSinceRelapse: 2
  };
}

export function loadThanhTinhState(): ThanhTinhState {
  if (typeof window === 'undefined') return getDefaultThanhTinhState();
  try {
    const raw = localStorage.getItem(THANH_TINH_STORAGE_KEY);
    if (!raw) return getDefaultThanhTinhState();
    const parsed = JSON.parse(raw) as Partial<ThanhTinhState>;
    return {
      joined: Boolean(parsed.joined),
      joinedAt: parsed.joinedAt ? String(parsed.joinedAt) : null,
      cleanSince: parsed.cleanSince ? String(parsed.cleanSince) : new Date().toISOString(),
      longestStreakDays: Number(parsed.longestStreakDays || 0),
      resistedUrgesCount: Number(parsed.resistedUrgesCount || 0),
      pendingResistedCount: Number(parsed.pendingResistedCount || 0),
      lastCheckInDate: parsed.lastCheckInDate ? String(parsed.lastCheckInDate) : null,
      checkInDates: Array.isArray(parsed.checkInDates) ? parsed.checkInDates.map(String) : [],
      relapseHistory: Array.isArray(parsed.relapseHistory) ? parsed.relapseHistory : [],
      hasRecentRelapse: Boolean(parsed.hasRecentRelapse),
      consecutiveCheckInsSinceRelapse: typeof parsed.consecutiveCheckInsSinceRelapse === 'number'
        ? parsed.consecutiveCheckInsSinceRelapse
        : 2,
      ...(parsed.checkInRunStartedAt === undefined ? {} : {
        checkInRunStartedAt: typeof parsed.checkInRunStartedAt === 'string' && Number.isFinite(Date.parse(parsed.checkInRunStartedAt))
          ? parsed.checkInRunStartedAt : null
      }),
      ...(validCheckInDate(parsed.checkInRunStartDate) ? { checkInRunStartDate: parsed.checkInRunStartDate } : {}),
      ...(typeof parsed.longestCheckInStreakDays === 'number' && Number.isFinite(parsed.longestCheckInStreakDays)
        ? { longestCheckInStreakDays: Math.max(0, Math.floor(parsed.longestCheckInStreakDays)) } : {})
    };
  } catch {
    return getDefaultThanhTinhState();
  }
}

export interface ThanhTinhAbstinenceReasonItem {
  type: 'via' | 'thaptrai' | 'thokhang';
  title: string;
  desc: string;
  harm?: string;
}

export interface ThanhTinhAbstinenceInfo {
  isAbstinenceDay: boolean;
  lunarDay: number;
  lunarMonth: number;
  lunarYear: number;
  lunarLeap?: boolean;
  viaName: string | null;
  isThapTrai: boolean;
  kiengDamReason: string | null;
  kiengDamHarm: string | null;
  reasons: ThanhTinhAbstinenceReasonItem[];
  dayTitle: string;
  harmSummary: string;
}

export function getThanhTinhAbstinenceInfo(date: Date = new Date(), isEn: boolean = false): ThanhTinhAbstinenceInfo {
  const lunar = getLunarEvent(date);
  const isAbstinenceDay = Boolean(lunar.viaName || lunar.isThapTrai || lunar.kiengDam);

  const reasons: ThanhTinhAbstinenceReasonItem[] = [];
  const dayNames: string[] = [];

  if (lunar.viaName) {
    reasons.push({
      type: 'via',
      title: isEn ? `Holy Day: ${lunar.viaName}` : `Ngày Vía: ${lunar.viaName}`,
      desc: isEn
        ? 'Commemorating the Buddha or Bodhisattva. Observe pure precepts and maintain celibacy.'
        : 'Ngày kỷ niệm chư Phật, Bồ Tát giáng đản, xuất gia hoặc thành đạo. Thân tâm phải giữ gìn trai giới thanh tịnh, tuyệt đối kiêng sắc dục.'
    });
    dayNames.push(lunar.viaName);
  }

  if (lunar.isThapTrai) {
    reasons.push({
      type: 'thaptrai',
      title: isEn
        ? `Ten Vegetarian Days (Lunar day ${lunar.lunarDay})`
        : `Ngày Thập Trai (Ngày ${lunar.lunarDay} Âm lịch)`,
      desc: isEn
        ? 'Strict fasting and precept day. Celestial guardians observe worldly deeds; sensual indulgence is strictly avoided.'
        : 'Ngày trai giới nghiêm ngặt. Chư Thiên Vương và Thiện Thần tuần hành xem xét thiện ác của nhân gian, kỵ dâm dục.'
    });
    dayNames.push(isEn ? `Ten Vegetarian Days (${lunar.lunarDay} Lunar)` : `Thập Trai (${lunar.lunarDay} Âm lịch)`);
  }

  if (lunar.kiengDam) {
    reasons.push({
      type: 'thokhang',
      title: isEn ? `Treasury of Longevity & Health: ${lunar.kiengDam.reason}` : `Thọ Khang Bảo Giám: ${lunar.kiengDam.reason}`,
      desc: isEn
        ? 'Solemn ancestral teaching to preserve vital essence, protect destiny, and prevent harm.'
        : 'Lời dạy nghiêm huấn trong Thọ Khang Bảo Giám nhằm bảo tồn nguyên khí, tránh tai ương và tổn hại thọ mạng.',
      harm: lunar.kiengDam.harm || undefined
    });
    const reasonText = lunar.kiengDam.reason.trim();
    if (!dayNames.some(name => name.toLowerCase().includes(reasonText.toLowerCase()))) {
      dayNames.push(isEn ? `Abstinence day according to Shou Kang Bao Jian (${reasonText})` : `ngày phạm kỵ theo Thọ Khang Bảo Giám (${reasonText})`);
    }
  }

  const rawDayTitle = dayNames.join(', ');
  const dayTitle = rawDayTitle
    ? (isEn
        ? (rawDayTitle.toLowerCase().startsWith('holy') ? rawDayTitle : `Holy Day (${rawDayTitle})`)
        : (rawDayTitle.toLowerCase().startsWith('ngày') ? rawDayTitle : `ngày ${rawDayTitle}`))
    : '';

  let harmSummary = '';
  if (lunar.kiengDam?.harm && lunar.kiengDam.harm.trim()) {
    const rawHarm = lunar.kiengDam.harm.trim();
    harmSummary = isEn
      ? (rawHarm.charAt(0).toLowerCase() + rawHarm.slice(1))
      : (rawHarm.charAt(0).toLowerCase() + rawHarm.slice(1));
  } else {
    harmSummary = isEn
      ? 'severe loss of blessings, shortened lifespan, and depletion of vital essence'
      : 'tổn hại nghiêm trọng phước đức, giảm thọ mạng và suy hao nguyên khí';
  }

  return {
    isAbstinenceDay,
    lunarDay: lunar.lunarDay,
    lunarMonth: lunar.lunarMonth,
    lunarYear: lunar.lunarYear,
    lunarLeap: lunar.lunarLeap,
    viaName: lunar.viaName,
    isThapTrai: lunar.isThapTrai,
    kiengDamReason: lunar.kiengDam?.reason ?? null,
    kiengDamHarm: lunar.kiengDam?.harm ?? null,
    reasons,
    dayTitle,
    harmSummary
  };
}

export function checkAndApplyMissedCheckIns(
  state: ThanhTinhState,
  now: Date = new Date(),
  _isEn: boolean = false
): { state: ThanhTinhState; missed: boolean } {
  if (state.checkInRunStartedAt === null) return { state, missed: false };
  const isJoined = state.joined || Boolean(state.lastCheckInDate);
  if (!isJoined) {
    return { state, missed: false };
  }

  const todayStr = getVietnamIsoDate(now);
  let refDateStr = validCheckInDate(state.lastCheckInDate) ? state.lastCheckInDate : null;
  if (!refDateStr) {
    // Cho phép chọn ngày bắt đầu cũ mà không áp nghĩa vụ điểm danh trước khi tham gia.
    refDateStr = [state.cleanSince, state.joinedAt]
      .filter((value): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)))
      .map(value => getVietnamIsoDate(new Date(value))).sort().slice(-1)[0] ?? todayStr;
  }

  if (refDateStr >= shiftVietnamDate(todayStr, -1)) {
    return { state, missed: false };
  }

  // Bỏ điểm danh chỉ ngắt chuỗi; không suy diễn hành vi hoặc sửa bằng chứng giữ giới.
  return { state: { ...state, checkInRunStartedAt: null,
    ...(state.hasRecentRelapse ? { consecutiveCheckInsSinceRelapse: 0 } : {})
  }, missed: true };
}

function validCheckInDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function currentCheckInRun(state: ThanhTinhState, now: Date): { days: number; diffMs: number; firstDate?: string } {
  if (state.checkInRunStartedAt === null) return { days: 0, diffMs: 0 };
  const today = getVietnamIsoDate(now);
  const runBoundary = validCheckInDate(state.checkInRunStartDate)
    ? `${state.checkInRunStartDate}T00:00:00+07:00` : state.checkInRunStartedAt;
  const boundaries = [state.cleanSince, state.joinedAt, runBoundary]
    .filter((value): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)))
    .map(value => getVietnamIsoDate(new Date(value)));
  const startDate = boundaries.sort().slice(-1)[0] ?? today;
  const dates = new Set([...state.checkInDates, state.lastCheckInDate]
    .filter((value): value is string => validCheckInDate(value) && value >= startDate && value <= today));
  let cursor = dates.has(today) ? today : shiftVietnamDate(today, -1);
  let days = 0;
  while (dates.has(cursor)) {
    days++;
    cursor = shiftVietnamDate(cursor, -1);
  }
  // Mốc giờ của dữ liệu cũ không xác định: giữ ngày đã điểm danh, không tự bịa thời gian.
  const anchor = state.checkInRunStartedAt ? Date.parse(state.checkInRunStartedAt) : NaN;
  return { days, diffMs: days && Number.isFinite(anchor) ? Math.max(0, now.getTime() - anchor) : 0,
    firstDate: days ? shiftVietnamDate(cursor, 1) : undefined };
}

export function applyDailyThanhTinhCheckIn(state: ThanhTinhState, now: Date = new Date()): ThanhTinhState {
  const today = getVietnamIsoDate(now);
  const run = currentCheckInRun(state, now);
  if (run.days && state.lastCheckInDate === today) return state;
  return {
    ...state,
    lastCheckInDate: today,
    checkInDates: Array.from(new Set([...state.checkInDates, today])),
    checkInRunStartedAt: run.days && state.checkInRunStartedAt ? state.checkInRunStartedAt : now.toISOString(),
    checkInRunStartDate: run.firstDate ?? today,
    longestCheckInStreakDays: Math.max(state.longestCheckInStreakDays ?? 0,
      run.days + (run.days && state.checkInDates.includes(today) ? 0 : 1))
  };
}

export function saveThanhTinhState(state: ThanhTinhState): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(THANH_TINH_STORAGE_KEY, JSON.stringify(state));
  } catch {
    return false;
  }
  // Lỗi observer không được biến dữ liệu đã lưu thành lỗi lưu giả.
  try { window.dispatchEvent(new CustomEvent('tutam:thanh-tinh-saved')); } catch { /* Dữ liệu vẫn được giữ. */ }
  return true;
}

export interface ThanhTinhCalculatedStats {
  diffMs: number;
  totalDays: number;
  totalHours: number;
  hoursRemainder: number;
  minutesRemainder: number;
  secondsRemainder: number;
  currentMilestone: ThanhTinhMilestone;
  nextMilestone: ThanhTinhMilestone | null;
  progressToNextMilestone: number; // 0 to 100
  effectiveLongestStreak: number;
  checkInStreakDays: number;
  checkInDiffMs: number;
  checkInHoursRemainder: number;
  checkInMinutesRemainder: number;
  checkInSecondsRemainder: number;
  checkInCurrentMilestone: ThanhTinhMilestone;
  checkInNextMilestone: ThanhTinhMilestone | null;
  checkInProgressToNextMilestone: number;
  checkInEffectiveLongestStreak: number;
}

export function calculateThanhTinhStats(
  state: ThanhTinhState,
  now: Date = new Date(),
  isEn: boolean = false
): ThanhTinhCalculatedStats {
  const cleanDate = new Date(state.cleanSince);
  const nowMs = now.getTime();
  const cleanMs = isNaN(cleanDate.getTime()) ? nowMs : cleanDate.getTime();
  const diffMs = Math.max(0, nowMs - cleanMs);

  const totalSeconds = Math.floor(diffMs / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);

  const hoursRemainder = totalHours % 24;
  const minutesRemainder = totalMinutes % 60;
  const secondsRemainder = totalSeconds % 60;

  const milestones = isEn ? THANH_TINH_MILESTONES_EN : THANH_TINH_MILESTONES;
  let currentMilestone = milestones[0];
  let nextMilestone: ThanhTinhMilestone | null = null;

  for (let i = 0; i < milestones.length; i++) {
    const milestone = milestones[i];
    if (totalDays >= milestone.days) {
      currentMilestone = milestone;
    } else {
      nextMilestone = milestone;
      break;
    }
  }

  let progressToNextMilestone = 100;
  if (nextMilestone) {
    const prevDays = currentMilestone.days > totalDays ? 0 : currentMilestone.days;
    const targetDays = nextMilestone.days;
    const span = Math.max(1, targetDays - prevDays);
    const completed = Math.max(0, totalDays - prevDays) + (hoursRemainder / 24) + (minutesRemainder / 1440);
    progressToNextMilestone = Math.min(100, Math.max(0, Math.round((completed / span) * 100)));
  }

  const effectiveLongestStreak = Math.max(state.longestStreakDays, totalDays);
  const checkInRun = currentCheckInRun(state, now);
  const checkInHoursRemainder = Math.floor(checkInRun.diffMs / 3_600_000) % 24;
  const checkInMinutesRemainder = Math.floor(checkInRun.diffMs / 60_000) % 60;
  const checkInSecondsRemainder = Math.floor(checkInRun.diffMs / 1000) % 60;
  const reached = milestones.filter(milestone => milestone.days <= checkInRun.days);
  const checkInCurrentMilestone = reached[reached.length - 1] ?? milestones[0];
  const checkInNextMilestone = milestones.find(milestone => milestone.days > checkInRun.days) ?? null;
  const previousDays = reached[reached.length - 1]?.days ?? 0;
  const checkInProgressToNextMilestone = checkInNextMilestone
    ? Math.min(100, Math.max(0, Math.round((checkInRun.days - previousDays) / (checkInNextMilestone.days - previousDays) * 100)))
    : 100;

  return {
    diffMs,
    totalDays,
    totalHours,
    hoursRemainder,
    minutesRemainder,
    secondsRemainder,
    currentMilestone,
    nextMilestone,
    progressToNextMilestone,
    effectiveLongestStreak,
    checkInStreakDays: checkInRun.days,
    checkInDiffMs: checkInRun.diffMs,
    checkInHoursRemainder,
    checkInMinutesRemainder,
    checkInSecondsRemainder,
    checkInCurrentMilestone,
    checkInNextMilestone,
    checkInProgressToNextMilestone,
    checkInEffectiveLongestStreak: Math.max(state.longestStreakDays, state.longestCheckInStreakDays ?? 0, checkInRun.days)
  };
}

export interface CommunityThanhTinhStats {
  participantCount: number;
  totalUrgesResisted: number;
  totalDaysClean: number;
}

export const FALLBACK_COMMUNITY_STATS: CommunityThanhTinhStats = {
  participantCount: 1352,
  totalUrgesResisted: 8640,
  totalDaysClean: 33450
};

export interface CachedCommunityThanhTinhStats {
  stats: CommunityThanhTinhStats;
  cachedAt: number; // timestamp ms
}

export const THANH_TINH_COMMUNITY_CACHE_KEY = 'tutam_thanh_tinh_comm_v1';
export const THANH_TINH_CLIENT_ID_KEY = 'tutam_thanh_tinh_client_id';

// Toi uu hoa luot request: cap nhat du lieu cong dong 2 ngay 1 lan (2 days = 172_800_000 ms)
export const COMMUNITY_STATS_CACHE_TTL_MS = 2 * 24 * 60 * 60 * 1000;

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    return null;
  }
  return null;
}

export function loadCachedCommunityStats(): CommunityThanhTinhStats | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(THANH_TINH_COMMUNITY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedCommunityThanhTinhStats>;
    if (parsed && parsed.stats && typeof parsed.stats.participantCount === 'number') {
      return {
        participantCount: Math.max(FALLBACK_COMMUNITY_STATS.participantCount, Number(parsed.stats.participantCount || 0)),
        totalUrgesResisted: Math.max(FALLBACK_COMMUNITY_STATS.totalUrgesResisted, Number(parsed.stats.totalUrgesResisted || 0)),
        totalDaysClean: Math.max(FALLBACK_COMMUNITY_STATS.totalDaysClean, Number(parsed.stats.totalDaysClean || 0))
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function loadCachedCommunityStatsWithTimestamp(): CachedCommunityThanhTinhStats | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(THANH_TINH_COMMUNITY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedCommunityThanhTinhStats>;
    if (parsed && parsed.stats && typeof parsed.stats.participantCount === 'number') {
      return {
        stats: {
          participantCount: Math.max(FALLBACK_COMMUNITY_STATS.participantCount, Number(parsed.stats.participantCount || 0)),
          totalUrgesResisted: Math.max(FALLBACK_COMMUNITY_STATS.totalUrgesResisted, Number(parsed.stats.totalUrgesResisted || 0)),
          totalDaysClean: Math.max(FALLBACK_COMMUNITY_STATS.totalDaysClean, Number(parsed.stats.totalDaysClean || 0))
        },
        cachedAt: Number(parsed.cachedAt || 0)
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveCachedCommunityStats(stats: CommunityThanhTinhStats, cachedAt = Date.now()): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const payload: CachedCommunityThanhTinhStats = {
      stats: {
        participantCount: Math.max(FALLBACK_COMMUNITY_STATS.participantCount, Number(stats.participantCount || 0)),
        totalUrgesResisted: Math.max(FALLBACK_COMMUNITY_STATS.totalUrgesResisted, Number(stats.totalUrgesResisted || 0)),
        totalDaysClean: Math.max(FALLBACK_COMMUNITY_STATS.totalDaysClean, Number(stats.totalDaysClean || 0))
      },
      cachedAt
    };
    storage.setItem(THANH_TINH_COMMUNITY_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors
  }
}

export function getThanhTinhClientId(): string {
  const storage = getStorage();
  if (!storage) return '';
  try {
    let id = storage.getItem(THANH_TINH_CLIENT_ID_KEY);
    if (!id || typeof id !== 'string' || id.length < 8) {
      id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `tt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      storage.setItem(THANH_TINH_CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}
