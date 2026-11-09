import { expect, test } from '@playwright/test';
import { loginAsAdmin, settleClient } from './runtime-helpers';

test.describe('admin dashboard', () => {
  test('uses a seeded Google admin session, lands on the dashboard, and opens the mobile drawer', async ({ page }) => {
    await loginAsAdmin(page);
    await settleClient(page);

    await page.goto('/admin');
    await settleClient(page);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.locator('.admin-dashboard').getByRole('heading', { name: 'Bảng điều khiển', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Quản lý nội dung' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Vận hành & Hệ thống' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chọn khoảng thời gian. Hiện tại: 28 ngày gần nhất' })).toBeVisible();
    const liveCard = page.locator('.admin-dashboard__overview-links > a').first();
    await expect(liveCard).toContainText('Đang online');
    await expect(liveCard.locator('.admin-dashboard__live-dot')).toBeVisible();
    await expect(page.locator('.admin-dashboard__overview-links').getByText('Hệ thống', { exact: true })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin');
    await settleClient(page);

    const openButton = page.getByRole('button', { name: 'Mở menu quản trị' });
    await expect(openButton).toBeVisible();
    await openButton.click();

    const sidebar = page.locator('#admin-sidebar');
    await expect(sidebar).toHaveClass(/admin-sidebar--open/);
    await expect(page.locator('.admin-shell__scrim')).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Bảng điều khiển' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Phân tích truy cập', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Hoạt động cộng đồng', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Thành viên', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Cài đặt', exact: true })).toBeVisible();

    await sidebar.getByRole('link', { name: 'Thành viên', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/members$/);
    await expect(sidebar).not.toHaveClass(/admin-sidebar--open/);
    await expect(page.locator('.admin-shell__scrim')).toHaveCount(0);
  });

  test('keeps analytics and community query filters in sync with navigation', async ({ page }) => {
    // Giữ tọa độ hover ổn định, không để prompt thông báo trễ đẩy biểu đồ.
    await page.addInitScript(() => {
      localStorage.setItem('tutam_notification_prompt_dismissed_until', String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    });
    await loginAsAdmin(page);

    await page.goto('/admin?view=compact');
    await settleClient(page);
    const dashboardRange = page.getByRole('button', { name: 'Chọn khoảng thời gian. Hiện tại: 28 ngày gần nhất' });
    await dashboardRange.click();
    await page.getByRole('menuitem', { name: '7 ngày gần nhất' }).click();
    await settleClient(page);
    await expect(page).toHaveURL(/\/admin\?view=compact&range=7d$/u);
    await expect(page.getByRole('button', { name: 'Chọn khoảng thời gian. Hiện tại: 7 ngày gần nhất' })).toBeVisible();

    await page.goto('/admin/analytics?range=7d');
    await settleClient(page);
    const analyticsRange = page.getByRole('button', { name: 'Chọn khoảng thời gian. Hiện tại: 7 ngày gần nhất' });
    const sourceTabs = page.getByRole('tablist', { name: 'Nguồn truy cập' });
    const pageTabs = page.getByRole('tablist', { name: 'Trang được xem nhiều' });
    const technologyTabs = page.getByRole('tablist', { name: 'Trình duyệt, hệ điều hành và thiết bị' });
    const locationTabs = page.getByRole('tablist', { name: 'Quốc gia, vùng tỉnh và thành phố' });
    const metricTabs = page.getByRole('tablist', { name: 'Chỉ số biểu đồ' });
    const trafficChart = page.locator('#analytics-overview .traffic-chart');
    await expect(page.getByRole('navigation', { name: 'Các phần phân tích' })).toHaveCount(0);
    await expect(page.locator('.admin-analytics__anchors')).toHaveCount(0);
    await expect(analyticsRange).toBeVisible();
    await expect(page.getByRole('button', { name: 'Làm mới' })).toBeVisible();
    await expect(page.locator('.admin-analytics__metrics')).toHaveCount(0);
    await expect(metricTabs).toBeVisible();
    await expect(metricTabs.getByRole('tab')).toHaveCount(6);
    await expect(metricTabs.getByRole('tab', { name: /Khách duy nhất/u })).toHaveAttribute('aria-selected', 'true');
    await expect(trafficChart).toHaveAttribute('data-active-metric', 'visitors');
    await metricTabs.getByRole('tab', { name: /Khách duy nhất/u }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(metricTabs.getByRole('tab', { name: /Phiên truy cập/u })).toHaveAttribute('aria-selected', 'true');
    await expect(trafficChart).toHaveAttribute('data-active-metric', 'visits');
    await metricTabs.getByRole('tab', { name: /Lượt xem trang/u }).click();
    await expect(metricTabs.getByRole('tab', { name: /Lượt xem trang/u })).toHaveAttribute('aria-selected', 'true');
    await expect(trafficChart).toHaveAttribute('data-active-metric', 'pageviews');
    await expect(trafficChart.locator('svg')).toHaveAttribute('aria-label', /lượt xem trang/u);
    await expect(sourceTabs.getByRole('tab')).toHaveCount(1);
    await expect(pageTabs.getByRole('tab')).toHaveCount(1);
    await expect(sourceTabs.getByRole('tab', { name: 'Nguồn truy cập' })).toHaveAttribute('aria-selected', 'true');
    await expect(pageTabs.getByRole('tab', { name: 'Trang được xem nhiều' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#analytics-content > header')).toHaveCount(0);
    await expect(technologyTabs).toBeVisible();
    await expect(locationTabs).toBeVisible();
    await expect(technologyTabs.getByRole('tab')).toHaveCount(3);
    await expect(locationTabs.getByRole('tab')).toHaveCount(3);
    await expect(technologyTabs.getByRole('tab', { name: 'Trình duyệt' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#analytics-technology-panel-browsers')).toBeVisible();
    await expect(page.locator('#analytics-location-panel-countries')).toBeVisible();
    await expect(page.locator('#analytics-environment > header')).toHaveCount(0);
    await expect(page.locator('#analytics-environment > h2')).toHaveCount(0);

    await technologyTabs.getByRole('tab', { name: 'Trình duyệt' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(technologyTabs.getByRole('tab', { name: 'Hệ điều hành' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#analytics-technology-panel-operating-systems')).toBeVisible();
    await technologyTabs.getByRole('tab', { name: 'Thiết bị' }).click();
    await expect(page.locator('#analytics-technology-panel-devices')).toBeVisible();

    const desktopCards = page.locator('.admin-analytics__grid--environment > .analytics-breakdown');
    const contentCards = page.locator('.admin-analytics__grid--content > .analytics-breakdown');
    await expect(contentCards).toHaveCount(2);
    const firstContentCard = await contentCards.nth(0).boundingBox();
    const secondContentCard = await contentCards.nth(1).boundingBox();
    expect(firstContentCard).not.toBeNull();
    expect(secondContentCard).not.toBeNull();
    expect(Math.abs(firstContentCard!.width - secondContentCard!.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(firstContentCard!.height - 440)).toBeLessThanOrEqual(1);
    expect(Math.abs(secondContentCard!.height - 440)).toBeLessThanOrEqual(1);
    await expect(page.locator('#analytics-pages-panel-top-pages')).toHaveCSS('overflow-y', 'auto');
    const leadingPageRow = page.locator('#analytics-pages-panel-top-pages .analytics-breakdown__list > li').first();
    await expect(leadingPageRow.locator('.analytics-breakdown__label .analytics-breakdown__note')).toHaveCount(1);
    const inlineRowMetrics = await leadingPageRow.evaluate((row) => {
      const icon = row.querySelector<HTMLElement>('.analytics-row-icon');
      const label = row.querySelector<HTMLElement>('.analytics-breakdown__label-text');
      const note = row.querySelector<HTMLElement>('.analytics-breakdown__note');
      const center = (element: HTMLElement | null) => {
        if (!element) return Number.POSITIVE_INFINITY;
        const rect = element.getBoundingClientRect();
        return rect.top + rect.height / 2;
      };
      return {
        height: row.getBoundingClientRect().height,
        iconCenter: center(icon),
        labelCenter: center(label),
        noteCenter: center(note),
      };
    });
    expect(inlineRowMetrics.height).toBeLessThanOrEqual(49);
    expect(Math.abs(inlineRowMetrics.iconCenter - inlineRowMetrics.labelCenter)).toBeLessThanOrEqual(2);
    expect(Math.abs(inlineRowMetrics.noteCenter - inlineRowMetrics.labelCenter)).toBeLessThanOrEqual(2);
    const fillBottomGap = await leadingPageRow.evaluate((row) => {
      const fill = row.querySelector<HTMLElement>('.analytics-breakdown__bar');
      if (!fill) return Number.POSITIVE_INFINITY;
      return row.getBoundingClientRect().bottom - fill.getBoundingClientRect().bottom;
    });
    expect(fillBottomGap).toBeLessThanOrEqual(1);
    await expect(desktopCards).toHaveCount(2);
    const firstDesktopCard = await desktopCards.nth(0).boundingBox();
    const secondDesktopCard = await desktopCards.nth(1).boundingBox();
    expect(firstDesktopCard).not.toBeNull();
    expect(secondDesktopCard).not.toBeNull();
    expect(Math.abs(firstDesktopCard!.width - secondDesktopCard!.width)).toBeLessThanOrEqual(2);

    await analyticsRange.click();
    await expect(page.getByRole('menuitem', { name: '7 ngày gần nhất' })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('menuitem', { name: '12 tháng gần nhất' }).click();
    await settleClient(page);
    await expect(page).toHaveURL(/\/admin\/analytics\?range=365d$/u);
    await expect(page.getByRole('button', { name: 'Chọn khoảng thời gian. Hiện tại: 12 tháng gần nhất' })).toBeVisible();
    await expect(trafficChart).toHaveAttribute('data-active-metric', 'pageviews');
    await expect(page.locator('.traffic-chart__dot')).toHaveCount(12);
    await page.locator('.traffic-chart__point').first().hover();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await expect(page.getByRole('tooltip')).toContainText('Lượt xem trang');
    await expect(page.getByRole('tooltip')).toContainText(/Tháng \d{1,2}, \d{4}/u);
    await expect(page.locator('.traffic-chart__date')).toHaveText([
      /Tháng \d{1,2}, \d{4}/u,
      /Tháng \d{1,2}, \d{4}/u,
      /Tháng \d{1,2}, \d{4}/u,
      /Tháng \d{1,2}, \d{4}/u,
      /Tháng \d{1,2}, \d{4}/u,
      /Tháng \d{1,2}, \d{4}/u,
    ]);
    await expect(page.getByText('Xem dữ liệu theo tháng')).toBeVisible();

    await page.getByRole('button', { name: 'Chọn khoảng thời gian. Hiện tại: 12 tháng gần nhất' }).click();
    await page.getByRole('menuitem', { name: 'Năm nay' }).click();
    await settleClient(page);
    const currentMonthCount = Number(new Intl.DateTimeFormat('en-US', {
      month: 'numeric', timeZone: 'Asia/Ho_Chi_Minh',
    }).format(new Date()));
    await expect(page).toHaveURL(/\/admin\/analytics\?range=year$/u);
    await expect(page.getByRole('button', { name: 'Chọn khoảng thời gian. Hiện tại: Năm nay' })).toBeVisible();
    await expect(page.locator('.traffic-chart__dot')).toHaveCount(currentMonthCount);
    await expect(page.getByText('Xem dữ liệu theo tháng')).toBeVisible();

    await page.setViewportSize({ width: 320, height: 700 });
    await expect(page.locator('.traffic-chart__dot')).toHaveCount(currentMonthCount);
    await expect(metricTabs).toHaveCSS('grid-template-columns', /.+ .+/u);
    const firstMobileCard = await desktopCards.nth(0).boundingBox();
    const secondMobileCard = await desktopCards.nth(1).boundingBox();
    expect(firstMobileCard).not.toBeNull();
    expect(secondMobileCard).not.toBeNull();
    expect(secondMobileCard!.y).toBeGreaterThan(firstMobileCard!.y + firstMobileCard!.height);
    const firstMobileContentCard = await contentCards.nth(0).boundingBox();
    const secondMobileContentCard = await contentCards.nth(1).boundingBox();
    expect(firstMobileContentCard).not.toBeNull();
    expect(secondMobileContentCard).not.toBeNull();
    expect(Math.abs(firstMobileContentCard!.height - 400)).toBeLessThanOrEqual(1);
    expect(secondMobileContentCard!.y).toBeGreaterThan(firstMobileContentCard!.y + firstMobileContentCard!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

    await page.goto('/admin/analytics');
    await settleClient(page);
    await page.getByRole('button', { name: 'Chọn khoảng thời gian. Hiện tại: 28 ngày gần nhất' }).click();
    const narrowMenu = page.getByRole('menu', { name: 'Chọn khoảng thời gian' });
    const narrowMenuBox = await narrowMenu.boundingBox();
    expect(narrowMenuBox).not.toBeNull();
    expect(narrowMenuBox!.x).toBeGreaterThanOrEqual(0);
    expect(narrowMenuBox!.x + narrowMenuBox!.width).toBeLessThanOrEqual(320);
    expect(narrowMenuBox!.y + narrowMenuBox!.height).toBeLessThanOrEqual(700);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

    // Các lựa chọn cuối vẫn tới được bằng bàn phím khi menu phải cuộn.
    const rangeItems = narrowMenu.getByRole('menuitem');
    await page.keyboard.press('End');
    await expect(rangeItems.last()).toBeFocused();
    const lastRangeBox = await rangeItems.last().boundingBox();
    expect(lastRangeBox).not.toBeNull();
    expect(lastRangeBox!.y + lastRangeBox!.height).toBeLessThanOrEqual(700);
    await page.keyboard.press('Home');
    await expect(rangeItems.first()).toBeFocused();

    await page.setViewportSize({ width: 320, height: 500 });
    await expect.poll(async () => {
      const box = await narrowMenu.boundingBox();
      return box ? box.y + box.height : Infinity;
    }).toBeLessThanOrEqual(500);
    const shortMenuBox = await narrowMenu.boundingBox();
    expect(shortMenuBox).not.toBeNull();
    expect(shortMenuBox!.y).toBeGreaterThanOrEqual(0);
    expect(shortMenuBox!.y + shortMenuBox!.height).toBeLessThanOrEqual(500);
    await page.keyboard.press('End');
    await expect(rangeItems.last()).toBeFocused();
    const shortLastBox = await rangeItems.last().boundingBox();
    expect(shortLastBox).not.toBeNull();
    expect(shortLastBox!.y + shortLastBox!.height).toBeLessThanOrEqual(500);
    await page.keyboard.press('Escape');
    await expect(narrowMenu).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Chọn khoảng thời gian. Hiện tại: 28 ngày gần nhất' })).toBeFocused();
    await page.setViewportSize({ width: 320, height: 700 });

    await page.goto('/admin/community?period=month');
    await settleClient(page);
    const communityPeriods = page.getByRole('navigation', { name: 'Khoảng thời gian xếp hạng' });
    await expect(communityPeriods).toBeVisible();
    await expect(communityPeriods.getByRole('link')).toHaveCount(3);
    await expect(communityPeriods).toHaveCSS('display', 'grid');
    await expect(communityPeriods.getByRole('link', { name: 'Tháng này' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('link', { name: 'Tháng này' })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: 'Năm nay' }).click();
    await settleClient(page);
    await expect(page).toHaveURL(/\/admin\/community\?period=year$/u);
    await expect(page.getByRole('link', { name: 'Năm nay' })).toHaveAttribute('aria-current', 'page');
    await page.setViewportSize({ width: 320, height: 700 });
    await expect(communityPeriods).toHaveCSS('display', 'grid');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
