import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bannerSource = readFileSync('src/lib/components/phap-bao/PhapBaoBanner.svelte', 'utf8');
const modalSource = readFileSync('src/lib/components/phap-bao/PhapBaoModal.svelte', 'utf8');
const headerSource = readFileSync('src/lib/components/layout/SiteHeader.svelte', 'utf8');

describe('PhapBao component contracts', () => {
  describe('PhapBaoBanner contract', () => {
    it('dispatches open-phap-bao event on button click', () => {
      expect(bannerSource).toContain("window.dispatchEvent(new CustomEvent('quangtu:open-phap-bao'))");
    });

    it('contains clear, compact messaging for free gift claiming on homepage without cluttering mobile', () => {
      expect(bannerSource).toContain('Thỉnh Kinh & Pháp Bảo Miễn Phí');
      expect(bannerSource).toContain('ẤN TỐNG MIỄN PHÍ');
      expect(bannerSource).toContain('108 biến danh hiệu');
      expect(bannerSource).toContain('Chép Danh Hiệu & Thỉnh Ngay');
      expect(bannerSource).not.toContain('lừa đảo');
    });
  });

  describe('PhapBaoModal contract', () => {
    it('supports pasting lines for testing and verification', () => {
      expect(modalSource).toContain('handleLinePaste');
      expect(modalSource).toContain('event.clipboardData');
      expect(modalSource).toContain('if (!isAdmin)');
      expect(modalSource).toContain('triggerPasteNotice()');
      expect(modalSource).toContain('index === 0');
    });

    it('forces uppercase text transformation', () => {
      expect(modalSource).toContain('input.value.toUpperCase()');
      expect(modalSource).toContain('text-transform: uppercase');
    });

    it('implements 108 lines counting and line jumps on Enter', () => {
      expect(modalSource).toContain('REQUIRED_RECITATION_COUNT');
      expect(modalSource).toContain("event.key === 'Enter'");
      expect(modalSource).toContain('pb-line-input');
    });

    it('handles guest data removal upon opening Shopee vs member history saving', () => {
      expect(modalSource).toContain('/api/phap-bao/claim');
      expect(modalSource).toContain('clearDraft()');
      expect(modalSource).toContain('window.open(shopeeUrl');
    });

    it('provides title selection between Dia Tang, Quan The Am, and A Di Da and resets lines on change', () => {
      expect(modalSource).toContain('NAM MÔ ĐỊA TẠNG BỒ TÁT');
      expect(modalSource).toContain('NAM MÔ QUÁN THẾ ÂM BỒ TÁT');
      expect(modalSource).toContain('NAM MÔ A DI ĐÀ PHẬT');
      expect(modalSource).toContain('chooseTitleKind');
      expect(modalSource).toContain('lines = Array.from({ length: REQUIRED_RECITATION_COUNT }, () => \'\')');
    });

    it('auto-fills all 108 lines when admin types line 1', () => {
      expect(modalSource).toContain('isAdmin && index === 0');
      expect(modalSource).toContain('for (let i = 1; i < REQUIRED_RECITATION_COUNT; i++)');
    });

    it('bypasses individual item selection, states 5000d platform fee, and provides scam warnings', () => {
      expect(modalSource).not.toContain('select_item');
      expect(modalSource).toContain('select_title');
      expect(modalSource).toContain('activeShopeeUrl');
      expect(modalSource).toContain('5.000');
      expect(modalSource).toContain('lừa đảo');
      expect(modalSource).toContain('em Đức');
      expect(modalSource).toContain('Quang Từ');
      expect(modalSource).toContain('xin suất ăn từ thiện');
      expect(modalSource).toContain('theo dõi đơn hàng');
      expect(modalSource).toContain('thông tin cá nhân');
      expect(modalSource).toContain('chuyển khoản');
    });

    it('keeps header clean without redundant management controls', () => {
      expect(modalSource).not.toContain('adminManagerOpen');
      expect(modalSource).not.toContain('AdminPhapBaoManager');
      expect(modalSource).not.toContain('pb-btn-admin-nav');
    });

    it('displays titles cleanly without sub-descriptions or out-of-stock blocks', () => {
      expect(modalSource).not.toContain('Độ sinh tiêu chướng');
      expect(modalSource).not.toContain('Từ bi cứu khổ');
      expect(modalSource).not.toContain('đã được thỉnh hết');
    });

    it('resets to select_title step when closing or reopening after claim without requiring cache clear', () => {
      expect(modalSource).toContain("step === 'completed' || claimSuccess");
      expect(modalSource).toContain("step = 'select_title'");
      expect(modalSource).toContain('Chép lại danh hiệu khác');
    });

    it('allows admin to edit and update the Shopee link', () => {
      expect(modalSource).toContain('pb-btn-admin-edit');
      expect(modalSource).toContain('/api/admin/phap-bao/link-shopee');
      expect(modalSource).toContain('handleSaveShopeeLink');
      expect(modalSource).toContain('startEditShopeeLink');
    });

    it('hides raw shopee url and provides a single Thỉnh ngay button to open Shopee', () => {
      expect(modalSource).toContain('handleOpenShopee');
      expect(modalSource).not.toContain('pb-direct-link-box');
      expect(modalSource).not.toContain('pb-shopee-raw-link');
      expect(modalSource).toContain('Thỉnh ngay');
    });

    it('presents gratitude message and 15s countdown with mobile app trigger', () => {
      expect(modalSource).toContain('countdownSeconds');
      expect(modalSource).toContain('startShopeeCountdown');
      expect(modalSource).toContain('cảm ơn và tri ân công đức');
      expect(modalSource).toContain('chúc quý vị');
      expect(modalSource).toContain('com.shopee.vn');
    });
  });

  describe('Homepage and Library integration', () => {
    it('provides prominent entry via PhapBaoBanner and keeps header clean', () => {
      expect(bannerSource).toContain("window.dispatchEvent(new CustomEvent('quangtu:open-phap-bao'))");
      expect(headerSource).not.toContain('nav-phap-bao');
    });

    it('renders PhapBaoBanner compact on the homepage', () => {
      const pageSource = readFileSync('src/routes/+page.svelte', 'utf8');
      expect(pageSource).toContain("import PhapBaoBanner from '$lib/components/phap-bao/PhapBaoBanner.svelte'");
      expect(pageSource).toContain('<PhapBaoBanner compact />');
    });

    it('does not duplicate Thỉnh Kinh & Pháp Bảo button in Kho Kinh Sách since homepage already features it', () => {
      const kinhSachSource = readFileSync('src/routes/kinh-sach/+page.svelte', 'utf8');
      expect(kinhSachSource).not.toContain('ks-phap-bao-bar');
      expect(kinhSachSource).not.toContain("window.dispatchEvent(new CustomEvent('quangtu:open-phap-bao'))");
    });
  });
});
