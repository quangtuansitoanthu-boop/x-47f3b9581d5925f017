import { describe, expect, it } from 'vitest';
import {
  isLineMatchingTarget,
  normalizeLineText,
  stripVietnameseDiacritics,
  stringSimilarity,
  verifyRecitationLines
} from '../../../src/lib/domain/phap-bao/recitation';

describe('phap-bao recitation verification logic', () => {
  describe('normalization and string matching', () => {
    it('normalizes spaces and converts to uppercase', () => {
      expect(normalizeLineText('   nam mô   địa   tạng bồ tát   ')).toBe('NAM MÔ ĐỊA TẠNG BỒ TÁT');
    });

    it('strips vietnamese diacritics reliably', () => {
      expect(stripVietnameseDiacritics('NAM MÔ ĐỊA TẠNG BỒ TÁT')).toBe('NAM MO DIA TANG BO TAT');
      expect(stripVietnameseDiacritics('NAM MÔ QUÁN THẾ ÂM BỒ TÁT')).toBe('NAM MO QUAN THE AM BO TAT');
    });

    it('computes reasonable similarity', () => {
      expect(stringSimilarity('NAM MO DIA TANG BO TAT', 'NAM MO DIA TANG BO TAT')).toBe(1.0);
      expect(stringSimilarity('NAM MO DIA TANG BO TAT', 'NAM MO ĐIA TANG BO TAT')).toBeGreaterThan(0.85);
    });
  });

  describe('isLineMatchingTarget for Địa Tạng Bồ Tát', () => {
    it('matches exact full title with diacritics', () => {
      expect(isLineMatchingTarget('NAM MÔ ĐỊA TẠNG BỒ TÁT', 'dia_tang')).toBe(true);
      expect(isLineMatchingTarget('nam mô địa tạng bồ tát', 'dia_tang')).toBe(true);
    });

    it('matches variants with Vương', () => {
      expect(isLineMatchingTarget('NAM MÔ ĐỊA TẠNG VƯƠNG BỒ TÁT', 'dia_tang')).toBe(true);
    });

    it('matches unaccented or minor typing errors', () => {
      expect(isLineMatchingTarget('NAM MO DIA TANG BO TAT', 'dia_tang')).toBe(true);
      expect(isLineMatchingTarget('NAM MO DIA TANG VUONG BO TAT', 'dia_tang')).toBe(true);
      expect(isLineMatchingTarget('NAM MÔ ĐIA TẠNG BỒ TÁT', 'dia_tang')).toBe(true);
    });

    it('rejects incomplete or irrelevant strings', () => {
      expect(isLineMatchingTarget('', 'dia_tang')).toBe(false);
      expect(isLineMatchingTarget('NAM MO', 'dia_tang')).toBe(false);
      expect(isLineMatchingTarget('BO TAT', 'dia_tang')).toBe(false);
      expect(isLineMatchingTarget('CHÀO BẠN', 'dia_tang')).toBe(false);
      // Shouldn't match Quán Thế Âm when expecting Địa Tạng
      expect(isLineMatchingTarget('NAM MÔ QUÁN THẾ ÂM BỒ TÁT', 'dia_tang')).toBe(false);
    });
  });

  describe('isLineMatchingTarget for Quán Thế Âm Bồ Tát', () => {
    it('matches exact full title', () => {
      expect(isLineMatchingTarget('NAM MÔ QUÁN THẾ ÂM BỒ TÁT', 'quan_the_am')).toBe(true);
      expect(isLineMatchingTarget('nam mô quán thế âm bồ tát', 'quan_the_am')).toBe(true);
    });

    it('matches unaccented and common variations', () => {
      expect(isLineMatchingTarget('NAM MO QUAN THE AM BO TAT', 'quan_the_am')).toBe(true);
      expect(isLineMatchingTarget('NAM MO QUAN AM BO TAT', 'quan_the_am')).toBe(true);
    });

    it('rejects irrelevant strings', () => {
      expect(isLineMatchingTarget('', 'quan_the_am')).toBe(false);
      expect(isLineMatchingTarget('A DI ĐÀ PHẬT', 'quan_the_am')).toBe(false);
      expect(isLineMatchingTarget('NAM MÔ ĐỊA TẠNG BỒ TÁT', 'quan_the_am')).toBe(false);
    });
  });

  describe('isLineMatchingTarget for A Di Đà Phật', () => {
    it('matches exact full title and lowercase', () => {
      expect(isLineMatchingTarget('NAM MÔ A DI ĐÀ PHẬT', 'a_di_da')).toBe(true);
      expect(isLineMatchingTarget('nam mô a di đà phật', 'a_di_da')).toBe(true);
    });

    it('matches unaccented and common variations', () => {
      expect(isLineMatchingTarget('NAM MO A DI DA PHAT', 'a_di_da')).toBe(true);
      expect(isLineMatchingTarget('A DI ĐÀ PHẬT', 'a_di_da')).toBe(true);
      expect(isLineMatchingTarget('A DI DA PHAT', 'a_di_da')).toBe(true);
    });

    it('rejects irrelevant strings and other Bodhisattvas', () => {
      expect(isLineMatchingTarget('', 'a_di_da')).toBe(false);
      expect(isLineMatchingTarget('NAM MÔ ĐỊA TẠNG BỒ TÁT', 'a_di_da')).toBe(false);
      expect(isLineMatchingTarget('NAM MÔ QUÁN THẾ ÂM BỒ TÁT', 'a_di_da')).toBe(false);
    });
  });

  describe('verifyRecitationLines', () => {
    it('reports missing lines and specific line numbers when incomplete', () => {
      const lines = [
        'NAM MÔ ĐỊA TẠNG BỒ TÁT', // 1: valid
        '', // 2: empty
        'NAM MO DIA TANG BO TAT', // 3: valid
        'SAI CÂU', // 4: invalid
      ];

      const report = verifyRecitationLines(lines, 'dia_tang', 5);
      expect(report.isComplete).toBe(false);
      expect(report.validCount).toBe(2);
      expect(report.missingCount).toBe(3);
      expect(report.invalidLineNumbers).toEqual([2, 4, 5]);

      expect(report.lineResults[0].isValid).toBe(true);
      expect(report.lineResults[1].isValid).toBe(false);
      expect(report.lineResults[1].errorReason).toBe('Dòng còn để trống');
      expect(report.lineResults[2].isValid).toBe(true);
      expect(report.lineResults[3].isValid).toBe(false);
      expect(report.lineResults[3].errorReason).toContain('Chưa đúng danh hiệu');
    });

    it('recognizes English recitations for Dia Tang', () => {
      expect(isLineMatchingTarget('NAMO KSITIGARBHA BODHISATTVA', 'dia_tang')).toBe(true);
      expect(isLineMatchingTarget('namo ksitigarbha bodhisattva', 'dia_tang')).toBe(true);
      expect(isLineMatchingTarget('Namo Ksitigarbha', 'dia_tang')).toBe(true);
      expect(isLineMatchingTarget('Homage to Ksitigarbha Bodhisattva', 'dia_tang')).toBe(true);
      expect(isLineMatchingTarget('Namo Dizang Bodhisattva', 'dia_tang')).toBe(true);
      expect(isLineMatchingTarget('Ksitigarbha Bodhisattva', 'dia_tang')).toBe(true);
      expect(isLineMatchingTarget('Namo Ksitigarbha Bodhisatva', 'dia_tang')).toBe(true);
    });

    it('recognizes English recitations for Quan The Am', () => {
      expect(isLineMatchingTarget('NAMO AVALOKITESHVARA BODHISATTVA', 'quan_the_am')).toBe(true);
      expect(isLineMatchingTarget('namo avalokiteshvara bodhisattva', 'quan_the_am')).toBe(true);
      expect(isLineMatchingTarget('Namo Avalokitesvara Bodhisattva', 'quan_the_am')).toBe(true);
      expect(isLineMatchingTarget('Namo Avalokiteshvara', 'quan_the_am')).toBe(true);
      expect(isLineMatchingTarget('Namo Guanyin Bodhisattva', 'quan_the_am')).toBe(true);
      expect(isLineMatchingTarget('Namo Guan Yin Bodhisattva', 'quan_the_am')).toBe(true);
      expect(isLineMatchingTarget('Namo Guanyin', 'quan_the_am')).toBe(true);
      expect(isLineMatchingTarget('Homage to Avalokiteshvara Bodhisattva', 'quan_the_am')).toBe(true);
      expect(isLineMatchingTarget('Namo Kwan Yin Bodhisattva', 'quan_the_am')).toBe(true);
    });

    it('recognizes English recitations for A Di Da', () => {
      expect(isLineMatchingTarget('NAMO AMITABHA BUDDHA', 'a_di_da')).toBe(true);
      expect(isLineMatchingTarget('namo amitabha buddha', 'a_di_da')).toBe(true);
      expect(isLineMatchingTarget('Namo Amitabha', 'a_di_da')).toBe(true);
      expect(isLineMatchingTarget('Amitabha Buddha', 'a_di_da')).toBe(true);
      expect(isLineMatchingTarget('Homage to Amitabha Buddha', 'a_di_da')).toBe(true);
      expect(isLineMatchingTarget('Namo Amida Buddha', 'a_di_da')).toBe(true);
      expect(isLineMatchingTarget('Namo Omitofo', 'a_di_da')).toBe(true);
    });

    it('reports localized English error reasons when locale is en', () => {
      const lines = [
        'NAMO KSITIGARBHA BODHISATTVA',
        '',
        'WRONG PHRASE'
      ];
      const report = verifyRecitationLines(lines, 'dia_tang', 3, 'en');
      expect(report.isComplete).toBe(false);
      expect(report.validCount).toBe(1);
      expect(report.lineResults[1].errorReason).toBe('Line is empty');
      expect(report.lineResults[2].errorReason).toContain('Incorrect sacred name');
      expect(report.lineResults[2].errorReason).toContain('NAMO KSITIGARBHA BODHISATTVA');
    });

    it('reports complete when all 108 lines are valid', () => {
      const lines = Array.from({ length: 108 }, () => 'NAM MÔ ĐỊA TẠNG BỒ TÁT');
      const report = verifyRecitationLines(lines, 'dia_tang', 108);

      expect(report.isComplete).toBe(true);
      expect(report.validCount).toBe(108);
      expect(report.missingCount).toBe(0);
      expect(report.invalidLineNumbers).toHaveLength(0);
    });
  });
});
