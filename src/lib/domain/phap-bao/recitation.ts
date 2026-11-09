export type RecitationTitleKind = 'dia_tang' | 'quan_the_am' | 'a_di_da';

export interface RecitationTargetConfig {
  id: RecitationTitleKind;
  displayName: string;
  displayNameEn?: string;
  variants: string[];
  canonical: string;
  coreTokens: string[];
}

export const RECITATION_TARGETS: Record<RecitationTitleKind, RecitationTargetConfig> = {
  dia_tang: {
    id: 'dia_tang',
    displayName: 'NAM MÔ ĐỊA TẠNG BỒ TÁT',
    displayNameEn: 'NAMO KSITIGARBHA BODHISATTVA',
    canonical: 'NAM MÔ ĐỊA TẠNG BỒ TÁT',
    variants: [
      'NAM MÔ ĐỊA TẠNG BỒ TÁT',
      'NAM MÔ ĐỊA TẠNG VƯƠNG BỒ TÁT',
      'NAM MO DIA TANG BO TAT',
      'NAM MO DIA TANG VUONG BO TAT',
      'NAMO KSITIGARBHA BODHISATTVA',
      'NAMO KSITIGARBHA',
      'NAM MO KSITIGARBHA',
      'NAMO DIA TANG BO TAT',
      'KSITIGARBHA BODHISATTVA',
      'KSITIGARBHA',
      'HOMAGE TO KSITIGARBHA BODHISATTVA',
      'HOMAGE TO KSITIGARBHA',
      'HOMAGE TO BODHISATTVA KSITIGARBHA',
      'NAMO KSITIGARBHA BODHISATVA',
      'NAMO BODHISATTVA KSITIGARBHA',
      'NAMO KSITIGARBHA MAHASATTVA',
      'NAMO KSITIGARBHA RAJA BODHISATTVA',
      'NAMO DIZANG BODHISATTVA',
      'NAMO DIZANG WANG PUSA',
      'NAMO DIZANG',
      'DIZANG BODHISATTVA',
      'DIZANG'
    ],
    coreTokens: ['NAM', 'MO', 'DIA', 'TANG', 'BO', 'TAT', 'NAMO', 'KSITIGARBHA', 'BODHISATTVA', 'DIZANG', 'HOMAGE', 'MAHASATTVA']
  },
  quan_the_am: {
    id: 'quan_the_am',
    displayName: 'NAM MÔ QUÁN THẾ ÂM BỒ TÁT',
    displayNameEn: 'NAMO AVALOKITESHVARA BODHISATTVA',
    canonical: 'NAM MÔ QUÁN THẾ ÂM BỒ TÁT',
    variants: [
      'NAM MÔ QUÁN THẾ ÂM BỒ TÁT',
      'NAM MO QUAN THE AM BO TAT',
      'NAM MO QUAN AM BO TAT',
      'NAMO AVALOKITESHVARA BODHISATTVA',
      'NAMO AVALOKITESVARA BODHISATTVA',
      'NAMO GUANYIN BODHISATTVA',
      'NAMO GUAN YIN BODHISATTVA',
      'NAMO AVALOKITESHVARA',
      'NAMO AVALOKITESVARA',
      'NAMO QUAN THE AM BO TAT',
      'AVALOKITESHVARA BODHISATTVA',
      'AVALOKITESVARA BODHISATTVA',
      'AVALOKITESHVARA',
      'AVALOKITESVARA',
      'HOMAGE TO AVALOKITESHVARA BODHISATTVA',
      'HOMAGE TO AVALOKITESVARA BODHISATTVA',
      'HOMAGE TO AVALOKITESHVARA',
      'HOMAGE TO GUANYIN BODHISATTVA',
      'HOMAGE TO GUAN YIN BODHISATTVA',
      'HOMAGE TO GUANYIN',
      'HOMAGE TO BODHISATTVA AVALOKITESHVARA',
      'NAMO BODHISATTVA AVALOKITESHVARA',
      'NAMO AVALOKITESHVARA BODHISATVA',
      'NAMO GUANYIN',
      'NAMO GUAN YIN',
      'GUANYIN BODHISATTVA',
      'GUAN YIN BODHISATTVA',
      'GUANYIN',
      'NAMO KWAN YIN BODHISATTVA',
      'NAMO KWAN YIN',
      'KWAN YIN BODHISATTVA',
      'KWANYIN BODHISATTVA',
      'NAMO GUANYIN PUSA',
      'NAMO GUAN YIN PU SA'
    ],
    coreTokens: ['NAM', 'MO', 'QUAN', 'THE', 'AM', 'BO', 'TAT', 'NAMO', 'AVALOKITESHVARA', 'AVALOKITESVARA', 'BODHISATTVA', 'GUANYIN', 'GUAN', 'YIN', 'KWANYIN', 'HOMAGE']
  },
  a_di_da: {
    id: 'a_di_da',
    displayName: 'NAM MÔ A DI ĐÀ PHẬT',
    displayNameEn: 'NAMO AMITABHA BUDDHA',
    canonical: 'NAM MÔ A DI ĐÀ PHẬT',
    variants: [
      'NAM MÔ A DI ĐÀ PHẬT',
      'NAM MO A DI DA PHAT',
      'NAM MÔ A-DI-ĐÀ PHẬT',
      'NAM MO A-DI-DA PHAT',
      'A DI ĐÀ PHẬT',
      'A DI DA PHAT',
      'NAMO AMITABHA BUDDHA',
      'NAMO AMITABHA',
      'NAMO A DI DA PHAT',
      'AMITABHA BUDDHA',
      'AMITABHA',
      'HOMAGE TO AMITABHA BUDDHA',
      'HOMAGE TO AMITABHA',
      'HOMAGE TO BUDDHA AMITABHA',
      'NAMO BUDDHA AMITABHA',
      'NAMO AMIDA BUDDHA',
      'NAMO AMIDA',
      'AMIDA BUDDHA',
      'AMIDA',
      'NAMO AMITAYUS BUDDHA',
      'NAMO AMITAYUS',
      'AMITAYUS BUDDHA',
      'AMITAYUS',
      'NAMO OMITOFO',
      'NAMO EMITUOFO',
      'OMITOFO',
      'EMITUOFO'
    ],
    coreTokens: ['NAM', 'MO', 'A', 'DI', 'DA', 'PHAT', 'NAMO', 'AMITABHA', 'BUDDHA', 'AMIDA', 'OMITOFO', 'EMITUOFO', 'HOMAGE', 'AMITAYUS']
  }
};

export const REQUIRED_RECITATION_COUNT = 108;

export function stripVietnameseDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function normalizeLineText(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/**
 * Tính khoảng cách Levenshtein giữa 2 chuỗi
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) row[j] = j;

  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const val = Math.min(row[j] + 1, prev + 1, row[j - 1] + cost);
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }

  return row[b.length];
}

/**
 * Tính độ tương đồng từ 0 -> 1 giữa 2 chuỗi
 */
export function stringSimilarity(a: string, b: string): number {
  const normA = normalizeLineText(a);
  const normB = normalizeLineText(b);
  if (normA === normB) return 1.0;

  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(normA, normB);
  return Math.max(0, 1 - distance / maxLen);
}

/**
 * Kiểm tra 1 dòng có khớp với danh hiệu hay không (hỗ trợ cả tiếng Việt và tiếng Anh)
 */
export function isLineMatchingTarget(line: string, targetKind: RecitationTitleKind): boolean {
  const normalized = normalizeLineText(line);
  if (normalized.length < 5) return false;

  const strippedLine = stripVietnameseDiacritics(normalized);
  const cleanLine = strippedLine.replace(/[.,!?;:()\-]/g, ' ').replace(/\s+/g, ' ').trim();
  const target = RECITATION_TARGETS[targetKind];

  // 1. Kiểm tra loại trừ nhầm lẫn giữa các vị Phật / Bồ Tát
  if (targetKind === 'dia_tang') {
    if (
      cleanLine.includes('QUAN THE AM') ||
      cleanLine.includes('QUAN AM') ||
      cleanLine.includes('AVALOKITESHVARA') ||
      cleanLine.includes('AVALOKITESVARA') ||
      cleanLine.includes('GUANYIN') ||
      cleanLine.includes('GUAN YIN') ||
      cleanLine.includes('KWAN YIN') ||
      cleanLine.includes('KWANYIN') ||
      cleanLine.includes('A DI DA') ||
      cleanLine.includes('AMITABHA') ||
      cleanLine.includes('AMIDA') ||
      cleanLine.includes('OMITOFO') ||
      cleanLine.includes('EMITUOFO')
    ) {
      return false;
    }
  } else if (targetKind === 'quan_the_am') {
    if (
      cleanLine.includes('DIA TANG') ||
      cleanLine.includes('KSITIGARBHA') ||
      cleanLine.includes('DIZANG') ||
      cleanLine.includes('A DI DA') ||
      cleanLine.includes('AMITABHA') ||
      cleanLine.includes('AMIDA') ||
      cleanLine.includes('OMITOFO') ||
      cleanLine.includes('EMITUOFO')
    ) {
      return false;
    }
  } else if (targetKind === 'a_di_da') {
    if (
      cleanLine.includes('DIA TANG') ||
      cleanLine.includes('KSITIGARBHA') ||
      cleanLine.includes('DIZANG') ||
      cleanLine.includes('QUAN THE AM') ||
      cleanLine.includes('QUAN AM') ||
      cleanLine.includes('AVALOKITESHVARA') ||
      cleanLine.includes('AVALOKITESVARA') ||
      cleanLine.includes('GUANYIN') ||
      cleanLine.includes('GUAN YIN') ||
      cleanLine.includes('KWAN YIN') ||
      cleanLine.includes('KWANYIN')
    ) {
      return false;
    }
  }

  // 2. Phải chứa từ nhận diện cốt lõi của vị Phật / Bồ Tát đó
  if (targetKind === 'dia_tang') {
    const hasDia = cleanLine.includes('DIA') || cleanLine.includes('ĐIA');
    const hasTang = cleanLine.includes('TANG') || cleanLine.includes('TẠNG');
    const hasKsiti = cleanLine.includes('KSITI') || cleanLine.includes('GARBHA') || cleanLine.includes('DIZANG');
    if (!hasDia && !hasTang && !hasKsiti) return false;
  } else if (targetKind === 'quan_the_am') {
    const hasQuan = cleanLine.includes('QUAN');
    const hasAm = cleanLine.includes('AM');
    const hasAvalo = cleanLine.includes('AVALOKIT') || cleanLine.includes('GUANYIN') || cleanLine.includes('GUAN YIN') || cleanLine.includes('KWAN YIN') || cleanLine.includes('KWANYIN');
    if (!hasQuan && !hasAm && !hasAvalo) return false;
  } else if (targetKind === 'a_di_da') {
    const hasDiDa = cleanLine.includes('DI DA') || cleanLine.includes('A DI') || cleanLine.includes('DA PHAT');
    const hasAmita = cleanLine.includes('AMITABHA') || cleanLine.includes('AMITA') || cleanLine.includes('AMIDA') || cleanLine.includes('OMITOFO') || cleanLine.includes('EMITUOFO') || cleanLine.includes('AMITAYUS');
    if (!hasDiDa && !hasAmita) return false;
  }

  // 3. Khớp tuyệt đối với các biến thể
  for (const variant of target.variants) {
    const normVariant = normalizeLineText(variant);
    const cleanVariant = stripVietnameseDiacritics(normVariant).replace(/[.,!?;:()\-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (normalized === normVariant || cleanLine === cleanVariant) return true;
  }

  // 4. Nhận diện trực tiếp qua các cụm từ tiếng Anh / tiếng Phạn đặc trưng
  if (targetKind === 'dia_tang' && (cleanLine.includes('KSITIGARBHA') || cleanLine.includes('DIZANG'))) return true;
  if (targetKind === 'quan_the_am' && (cleanLine.includes('AVALOKITESHVARA') || cleanLine.includes('AVALOKITESVARA') || cleanLine.includes('GUANYIN') || cleanLine.includes('GUAN YIN') || cleanLine.includes('KWAN YIN') || cleanLine.includes('KWANYIN'))) return true;
  if (targetKind === 'a_di_da' && (cleanLine.includes('AMITABHA') || cleanLine.includes('AMIDA') || cleanLine.includes('OMITOFO') || cleanLine.includes('EMITUOFO') || cleanLine.includes('AMITAYUS'))) return true;

  // 5. Kiểm tra độ tương đồng Levenshtein với các biến thể (dung sai lỗi gõ phím)
  for (const variant of target.variants) {
    const cleanVariant = stripVietnameseDiacritics(variant).replace(/[.,!?;:()\-]/g, ' ').replace(/\s+/g, ' ').trim();
    const rawSim = stringSimilarity(normalized, variant);
    if (rawSim >= 0.70) return true;

    const cleanSim = stringSimilarity(cleanLine, cleanVariant);
    if (cleanSim >= 0.70) return true;
  }

  // 6. Token matching
  const lineTokens = cleanLine.split(/[\s,.-]+/);
  let matchedCore = 0;
  for (const core of target.coreTokens) {
    if (lineTokens.some((t) => stringSimilarity(t, core) >= 0.75)) {
      matchedCore++;
    }
  }

  if (targetKind === 'dia_tang' && matchedCore >= 3) return true;
  if (targetKind === 'quan_the_am' && matchedCore >= 3) return true;
  if (targetKind === 'a_di_da' && matchedCore >= 3) return true;

  return false;
}

export interface LineVerificationResult {
  lineIndex: number;
  lineNumber: number;
  text: string;
  isValid: boolean;
  errorReason?: string;
}

export interface RecitationVerificationReport {
  targetKind: RecitationTitleKind;
  totalLines: number;
  validCount: number;
  targetCount: number;
  isComplete: boolean;
  missingCount: number;
  lineResults: LineVerificationResult[];
  invalidLineNumbers: number[];
}

/**
 * Kiểm tra và rà soát toàn bộ các dòng theo danh hiệu đã chọn
 */
export function verifyRecitationLines(
  lines: string[],
  targetKind: RecitationTitleKind,
  targetCount = REQUIRED_RECITATION_COUNT,
  locale?: string
): RecitationVerificationReport {
  const count = Math.max(lines.length, targetCount);
  const lineResults: LineVerificationResult[] = [];
  const invalidLineNumbers: number[] = [];
  let validCount = 0;

  for (let i = 0; i < count; i++) {
    const text = lines[i] ?? '';
    const lineNumber = i + 1;
    const isValid = isLineMatchingTarget(text, targetKind);

    let errorReason: string | undefined;
    if (!isValid) {
      if (!text.trim()) {
        errorReason = locale === 'en' ? 'Line is empty' : 'Dòng còn để trống';
      } else {
        const displayName = getRecitationDisplayName(targetKind, locale);
        errorReason = locale === 'en'
          ? `Incorrect sacred name (${displayName})`
          : `Chưa đúng danh hiệu (${displayName})`;
      }
      invalidLineNumbers.push(lineNumber);
    } else {
      validCount++;
    }

    lineResults.push({
      lineIndex: i,
      lineNumber,
      text,
      isValid,
      errorReason
    });
  }

  const isComplete = validCount >= targetCount && invalidLineNumbers.length === 0;
  const missingCount = Math.max(0, targetCount - validCount);

  return {
    targetKind,
    totalLines: count,
    validCount,
    targetCount,
    isComplete,
    missingCount,
    lineResults,
    invalidLineNumbers
  };
}

export function getRecitationDisplayName(kind: RecitationTitleKind, locale?: string): string {
  if (locale === 'en') {
    return RECITATION_TARGETS[kind].displayNameEn || RECITATION_TARGETS[kind].displayName;
  }
  return RECITATION_TARGETS[kind].displayName;
}

