import { describe, expect, it } from 'vitest';
import { doctrinalGuideSections } from '../../../src/lib/content/guide-doctrinal-content';
import { enDoctrinalGuideSections, enSoftwareGuideSections } from '../../../src/lib/content/guide-content.en';
import {
  createGuideSearchTargets,
  searchGuideTargets,
  selectGuideSections,
  softwareGuideSections,
} from '../../../src/lib/content/guide-content';

const sections = [...softwareGuideSections, ...doctrinalGuideSections];
const targets = createGuideSearchTargets(sections);

it('splits app and study guides without losing content, legacy IDs or mutating the source', () => {
  const before = JSON.stringify(sections);
  const softwareIds = softwareGuideSections.map(section => section.id);
  expect(selectGuideSections(sections, softwareIds, null)).toBe(sections);
  const study = selectGuideSections(sections, softwareIds, 'tu-hoc');
  const app = selectGuideSections(sections, softwareIds, 'ung-dung');
  const studyIds = createGuideSearchTargets(study).map(target => target.id);
  const appIds = createGuideSearchTargets(app).map(target => target.id);
  expect(studyIds).not.toContain('dung-web');
  expect(studyIds).not.toContain('faq-xoa-trinh-duyet');
  expect(appIds).toContain('faq-xoa-trinh-duyet');
  expect(appIds).toContain('faq-dung-tren-may-tinh');
  expect(appIds).not.toContain('huong-dan-tung-kinh');
  expect(searchGuideTargets(createGuideSearchTargets(study), 'xóa trình duyệt')).toHaveLength(0);
  expect(searchGuideTargets(createGuideSearchTargets(app), 'kinh nguyệt')).toHaveLength(0);
  expect([...new Set([...studyIds, ...appIds])].sort()).toEqual([...new Set(targets.filter(target => target.sectionId !== 'gioi-thieu-tac-gia').map(target => target.id))].sort());
  expect(JSON.stringify(sections)).toBe(before);
});

it.each([
  [softwareGuideSections, doctrinalGuideSections],
  [enSoftwareGuideSections, enDoctrinalGuideSections],
])('omits the duplicate author from study navigation and search while retaining its source', (software, doctrinal) => {
  const all = [...software, ...doctrinal];
  const study = selectGuideSections(all, software.map(section => section.id), 'tu-hoc');
  expect(study.some(section => section.id === 'gioi-thieu-tac-gia')).toBe(false);
  expect(createGuideSearchTargets(study).some(target => target.sectionId === 'gioi-thieu-tac-gia')).toBe(false);
  expect(doctrinal.find(section => section.id === 'gioi-thieu-tac-gia')).toBeDefined();
  expect(selectGuideSections(all, software.map(section => section.id), null)).toBe(all);
});

describe('native guide content', () => {
  it('gives every searchable section, topic and FAQ a stable unique id and keywords', () => {
    const ids = targets.map((target) => target.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(targets.every((target) => target.id === target.id.toLocaleLowerCase('vi'))).toBe(true);
    expect(targets.every((target) => target.keywords.length > 0)).toBe(true);
  });

  it('marks sections with verified editorial status', () => {
    expect(doctrinalGuideSections.length).toBeGreaterThan(0);
    expect(doctrinalGuideSections.every((section) => section.editorialStatus === 'verified')).toBe(true);
    expect(softwareGuideSections.every((section) => section.editorialStatus === 'verified-software')).toBe(true);
  });

  it('finds feature and practical topics without requiring Vietnamese accents', () => {
    expect(searchGuideTargets(targets, 'ngu vi tan')[0]?.id).toBe('chuan-bi-truoc-khi-tri-chu-va-tung-kinh');
    expect(searchGuideTargets(targets, 'ngu mo')[0]?.id).toBe('hoan-canh-nen-tung-kinh-dia-tang');
    expect(searchGuideTargets(targets, 'facebook ledger')[0]?.id).toBe('ket-noi-facebook-quan-tri');
    expect(searchGuideTargets(targets, 'my quotes')[0]?.id).toBe('ghi-chu-va-trich-dan');
  });

  it('contains the five requested FAQs from the source document', () => {
    const faqSection = doctrinalGuideSections.find((section) => section.id === 'hoi-dap-thuong-gap');
    const faqIds = faqSection?.faqs?.map((faq) => faq.id) ?? [];

    expect(faqSection?.faqs?.length).toBeGreaterThanOrEqual(5);
    expect(faqIds).toEqual(expect.arrayContaining([
      'faq-ban-di-lam-tu-luc-nao',
      'faq-phu-nu-toi-ngay',
      'faq-khong-co-ban-tho',
      'faq-xoa-trinh-duyet',
      'faq-dung-tren-may-tinh',
    ]));
  });

  it('describes the shipped listen-later icon and both supported login providers', () => {
    const software = JSON.stringify(softwareGuideSections);
    const faq = JSON.stringify(doctrinalGuideSections);

    expect(software).toContain('biểu tượng dấu trang 🔖');
    expect(software).not.toContain('biểu tượng đồng hồ');
    expect(software).toContain('Đăng nhập bằng Google hoặc Facebook');
    expect(faq).toContain('đăng nhập bằng Google hoặc Facebook');
    expect(faq).not.toContain('Hãy đăng nhập Google và chờ đồng bộ');
  });

  it('provides a structured guide for beginners exploring Buddhism and cultivation', () => {
    const beginnerSection = doctrinalGuideSections.find((section) => section.id === 'huong-dan-nguoi-moi');
    expect(beginnerSection).toBeDefined();
    expect(beginnerSection?.title).toBe('Hướng dẫn cho người mới tìm hiểu Phật pháp và tu tập');
    expect(beginnerSection?.shortTitle).toBe('Người Mới');
    expect(beginnerSection?.topics.map((t) => t.id)).toEqual([
      'giai-doan-1-doc-sach-nhan-qua-luan-hoi',
      'giai-doan-2-hang-ngay-tri-tung-chu-dai-bi',
      'giai-doan-3-doc-giang-kinh-dia-tang-va-phap-hoa',
      'giai-doan-4-dinh-hinh-phap-mon-chuyen-tu',
    ]);

    // Search tests
    expect(searchGuideTargets(targets, 'nguoi moi')[0]?.id).toBe('huong-dan-nguoi-moi');
    expect(searchGuideTargets(targets, 'bao ung hien doi')[0]?.id).toBe('giai-doan-1-doc-sach-nhan-qua-luan-hoi');
    expect(searchGuideTargets(targets, 'dia nguc du ky')[0]?.id).toBe('giai-doan-1-doc-sach-nhan-qua-luan-hoi');
    expect(searchGuideTargets(targets, 'su menh do vong')[0]?.id).toBe('giai-doan-1-doc-sach-nhan-qua-luan-hoi');
    expect(searchGuideTargets(targets, 'giang kinh phap hoa')[0]?.id).toBe('giai-doan-3-doc-giang-kinh-dia-tang-va-phap-hoa');
    expect(searchGuideTargets(targets, 'phap mon chuyen tu')[0]?.id).toBe('giai-doan-4-dinh-hinh-phap-mon-chuyen-tu');

    // Dharma talk audio and direct practice links
    const serialized = JSON.stringify(beginnerSection);
    expect(serialized).toContain('Cô Ba Cháo Gà du Địa ngục');
    expect(serialized).toContain('Địa Ngục Du Ký');
    expect(serialized).toContain('Luân Hồi Du Ký');
    expect(serialized).toContain('Ngọc Lịch Bửu Phiêu');
    expect(serialized).toContain('Kinh Địa Tạng Bồ Tát Bổn Nguyện Thiển Thích');
    expect(serialized).toContain('/tu-tap?article=chu-dai-bi&mode=practice');
    expect(serialized).toContain('/tu-tap?article=kinh-dia-tang&mode=practice');
    expect(serialized).toContain('/tu-tap?mode=rosary');
    expect(serialized).toContain('Vào tu tập Chú Đại Bi');
  });

  it('provides comprehensive guidance for the Buddha worship and repentance mode', () => {
    const practiceToolsSection = softwareGuideSections.find((section) => section.id === 'cong-cu-tu-tap');
    expect(practiceToolsSection).toBeDefined();

    const lePhatTopic = practiceToolsSection?.topics.find((topic) => topic.id === 'che-do-le-phat');
    expect(lePhatTopic).toBeDefined();
    expect(lePhatTopic?.title).toContain('Lễ Phật & Sám Hối');

    const serialized = JSON.stringify(lePhatTopic);
    expect(serialized).toContain('Chọn tôn tượng và mục tiêu');
    expect(serialized).toContain('108 lạy');
    expect(serialized).toContain('Mỗi lần bấm tăng một lạy');
    expect(serialized).toContain('phụ thuộc hỗ trợ và trạng thái thiết bị');
    expect(serialized).toContain('/tu-tap?mode=le-phat');
    expect(serialized).toContain('Sổ công phu');

    // Search tests
    expect(searchGuideTargets(targets, 'le phat')[0]?.id).toBe('che-do-le-phat');
    expect(searchGuideTargets(targets, 'sam hoi')[0]?.id).toBe('che-do-le-phat');
    expect(searchGuideTargets(targets, '108 lay')[0]?.id).toBe('che-do-le-phat');
  });

  it('provides comprehensive guidance on donating chanting and Dharma listening machines for spirits', () => {
    const section = doctrinalGuideSections.find((s) => s.id === 'bo-thi-may-nghe-phap');
    expect(section).toBeDefined();
    expect(section?.title).toContain('bố thí pháp');
    expect(section?.shortTitle).toBe('Bố Thí Pháp');
    expect(section?.icon).toBe('📻');
    expect(section?.topics.map((t) => t.id)).toEqual([
      'y-nghia-va-cong-duc-phap-thi-may-nghe-phap',
      'chuan-bi-may-va-the-nho-nghe-phap',
      'vi-tri-dat-may-va-cach-che-chan-ngoai-troi',
      'tam-luong-va-nghi-thuc-khan-nguyen',
      'tai-ve-cac-bai-phap-tuyen-chon-cho-the-nho',
    ]);

    const serialized = JSON.stringify(section);
    expect(serialized).toContain('Pháp thí thắng mọi thí');
    expect(serialized).toContain('CHỌN LOẠI CÓ KHE CẮM THẺ NHỚ');
    expect(serialized).toContain('thẻ 4G');
    expect(serialized).toContain('FAT32');
    expect(serialized).toContain('GIẢI NÉN');
    expect(serialized).toContain('https://drive.google.com/file/d/1QSNeYvzkTMsNorQ_23b3W1TIYrQekYeH/view?usp=sharing');
    expect(serialized).not.toContain('/phap-thoai');
    expect(serialized).toContain('Kinh Địa Tạng Bồ Tát Bổn Nguyện');
    expect(serialized).toContain('Tôn Thắng Phật Đảnh Đà La Ni');

    // Search tests
    expect(searchGuideTargets(targets, 'bo thi phap')[0]?.id).toBe('bo-thi-may-nghe-phap');
    expect(searchGuideTargets(targets, 'may nghe phap')[0]?.sectionId).toBe('bo-thi-may-nghe-phap');
    expect(searchGuideTargets(targets, 'the nho')[0]?.sectionId).toBe('bo-thi-may-nghe-phap');
  });
});

