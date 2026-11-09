import { expect, test } from '@playwright/test';
import { settleClient } from './runtime-helpers';

test('personal guides split study from app usage while keeping legacy hashes', async ({ page }) => {
  await page.setViewportSize({width:375,height:667});
  await page.goto('/ca-nhan'); await settleClient(page);
  await page.getByRole('button',{name:/^Hướng dẫn tu học Phật pháp/}).click();
  await expect(page).toHaveURL(/phan=tu-hoc/);
  await expect(page.getByRole('heading',{name:'Hướng dẫn tu học Phật pháp',exact:true})).toBeVisible();
  await expect(page.locator('#dung-web')).toHaveCount(0);
  await expect(page.locator('#faq-xoa-trinh-duyet')).toHaveCount(0);
  await expect(page.locator('#gioi-thieu-tac-gia')).toHaveCount(0);
  await expect(page.locator('a[href="#gioi-thieu-tac-gia"]')).toHaveCount(0);
  await page.screenshot({path:test.info().outputPath('study-guide.png')});
  await page.getByRole('searchbox').fill('xóa trình duyệt');
  await expect(page.getByRole('button',{name:/Dữ liệu công phu của tôi có bị mất/})).toHaveCount(0);
  // The two guide entries live on Personal; the study page has no cross-guide link.
  await page.getByRole('button',{name:'Quay lại',exact:true}).click();
  await expect(page).toHaveURL(/\/ca-nhan$/);
  await expect(page.locator('.cn-tab-theme-author')).toBeVisible();
  await page.getByRole('button',{name:/^Hướng dẫn sử dụng ứng dụng/}).click();
  await expect(page).toHaveURL(/phan=ung-dung/);
  await expect(page.getByRole('heading',{name:'Hướng dẫn sử dụng ứng dụng',exact:true})).toBeVisible();
  await expect(page.locator('#huong-dan-tung-kinh')).toHaveCount(0);
  await page.screenshot({path:test.info().outputPath('app-guide.png')});
  await page.getByRole('searchbox').fill('xóa trình duyệt');
  await page.getByRole('button',{name:/Dữ liệu công phu của tôi có bị mất/}).click();
  await expect(page.locator('#faq-xoa-trinh-duyet')).toHaveAttribute('open','');
  await page.goto('/huong-dan#huong-dan-tung-kinh'); await settleClient(page);
  await expect(page.locator('#huong-dan-tung-kinh')).toHaveAttribute('open','');
});

test('practice keeps Dharma giving visible after a previous dismissal and links to study guides', async ({ page }) => {
  await page.addInitScript(()=>localStorage.setItem('tutam_dharma_giving_seen_guest','1'));
  await page.goto('/tu-tap'); await settleClient(page);
  const banner=page.locator('[data-dharma-giving-prompt]');
  await expect(banner).toBeVisible();
  await expect(banner.locator('.dharma-giving-close-x,.btn-dismiss-dharma')).toHaveCount(0);
  await page.reload(); await settleClient(page);
  await expect(banner).toBeVisible();
  await page.getByRole('link',{name:/Hướng dẫn tu học Phật pháp/}).click();
  await expect(page).toHaveURL(/phan=tu-hoc/);
  await expect(page.getByRole('heading',{name:'Hướng dẫn tu học Phật pháp',exact:true})).toBeVisible();
});

test.describe('native guide search and navigation', () => {
  test('ignores a malformed fragment and still handles the next valid hash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/huong-dan?audit=fragment#%');
    await settleClient(page);
    await expect(page).toHaveURL(/\/huong-dan\?audit=fragment$/u);
    await expect(page.getByRole('searchbox', { name: 'Tìm câu hỏi hoặc tính năng' })).toBeVisible();
    await page.evaluate(() => { window.location.hash = '%E0%A4%A'; });
    await expect(page).toHaveURL(/\/huong-dan\?audit=fragment$/u);
    await page.evaluate(() => { window.location.hash = 'faq-xoa-trinh-duyet'; });
    await expect(page.locator('#faq-xoa-trinh-duyet')).toHaveAttribute('open', '');
    await expect(page.locator('#faq-xoa-trinh-duyet summary')).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('search opens a topic ancestor, keeps a shareable hash and moves focus', async ({ page }) => {
    await page.goto('/huong-dan');
    await settleClient(page);

    const search = page.getByRole('searchbox', { name: 'Tìm câu hỏi hoặc tính năng' });
    await search.fill('ngủ mơ');
    await page.getByRole('button', { name: /Các hoàn cảnh nên tụng Kinh Địa Tạng/u }).click();

    await expect(page).toHaveURL(/#hoan-canh-nen-tung-kinh-dia-tang$/u);
    await expect(page.locator('#huong-dan-tung-kinh')).toHaveAttribute('open', '');
    await expect(page.locator('#hoan-canh-nen-tung-kinh-dia-tang')).toBeFocused();
  });

  test('search opens and focuses the requested FAQ', async ({ page }) => {
    await page.goto('/huong-dan');
    await settleClient(page);

    await page.getByRole('searchbox', { name: 'Tìm câu hỏi hoặc tính năng' }).fill('xóa trình duyệt');
    await page.getByRole('button', { name: /Dữ liệu công phu của tôi có bị mất/u }).click();

    const faq = page.locator('#faq-xoa-trinh-duyet');
    await expect(page).toHaveURL(/#faq-xoa-trinh-duyet$/u);
    await expect(faq).toHaveAttribute('open', '');
    await expect(faq.locator('summary')).toBeFocused();
    await expect(faq).toContainText('đăng nhập bằng Google hoặc Facebook');
  });

  test('search and content remain usable at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/huong-dan');
    await settleClient(page);

    await page.getByRole('searchbox', { name: 'Tìm câu hỏi hoặc tính năng' }).fill('xóa trình duyệt');
    await page.getByRole('button', { name: /Dữ liệu công phu của tôi có bị mất/u }).press('Enter');
    await expect(page).toHaveURL(/#faq-xoa-trinh-duyet$/u);
    await expect(page.locator('#faq-xoa-trinh-duyet')).toHaveAttribute('open', '');
    await expect(page.locator('#faq-xoa-trinh-duyet summary')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
  });
});
