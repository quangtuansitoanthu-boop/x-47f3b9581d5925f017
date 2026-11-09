import { expect, test } from '@playwright/test';

const modes = [
  { kind:'thien', screen:'.meditation-chooser', controls:'.meditation-chooser__actions button,.meditation-chooser__tabs button,.meditation-sound-picker__tile,.meditation-chooser__check', back:'.meditation-chooser__actions button:first-child' },
  { kind:'chuoi', screen:'.tt-rosary', controls:'.tt-rosary__header button,.tt-rosary__preferences label' },
  { kind:'le-phat', screen:'.lp', controls:'.lp__header button' },
  { kind:'thanh-tinh', screen:'.thanh-tinh-overlay', controls:'.btn-back, .btn-onboarding-join', back:'.btn-back' },
  { kind:'kinh', screen:'.tt-section-view', controls:'.tt-search' },
  { kind:'tri-chu', screen:'.tt-section-view', controls:'.tt-search' },
  { kind:'nghi-thuc', screen:'.tt-section-view', controls:'.tt-search' },
  { kind:'rec', screen:'.practice-recommendations', controls:'.tt-rec-toggle-btn', back:'.tt-rec-toggle-btn' },
  { kind:'tracker', screen:'.tt-tracker__card', controls:'.tt-tracker__close, .tt-tracker__btn-add', back:'.tt-tracker__close' },
];

for (const section of ['kinh', 'tri-chu', 'nghi-thuc']) {
  test(`category ${section}: the only Back control returns a direct link to the practice hub`, async ({ page }) => {
    await page.route('**/api/**', (route) => route.abort('failed'));
    await page.goto(`/tu-tap?muc=${section}`);
    await expect(page.locator('.tt-section-view')).toBeVisible();
    await expect(page.locator('.tt-section-view .tt-back-btn')).toHaveCount(0);
    await page.locator('.tt-topbar .tt-back-btn').click();
    await expect(page.locator('.tt-mode-card--thien')).toBeVisible();
    await expect(page.locator('.tt-section-view')).toHaveCount(0);
    await expect(page).toHaveURL(/\/tu-tap$/);
  });
}

for (const hash of ['#tri-chu', '#notes']) {
  test(`category Back clears restored legacy aliases and preserves unrelated URL state (${hash})`, async ({ page }) => {
    await page.route('**/api/**', (route) => route.abort('failed'));
    await page.goto('/tu-tap?muc=tri-chu');
    await expect(page.locator('.tt-section-view')).toBeVisible();
    await page.evaluate((fragment) => {
      history.pushState({}, '', `/tu-tap?category=tri-chu&keep=1${fragment}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, hash);
    await page.locator('.tt-topbar .tt-back-btn').click();
    await expect(page.locator('.tt-mode-card--thien')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/tu-tap\\?keep=1${hash === '#notes' ? '#notes' : ''}$`));
  });
}

for (const width of [360, 390]) for (const mode of modes) {
  test(`${mode.kind}: controls remain reachable and separate at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.route('**/api/**', (route) => route.abort('failed'));
    await page.goto('/');
    await expect(page.locator('.daily-dhammapada-card')).toBeVisible();
    await page.evaluate(() => {
      const win = window as any;
      win.CapacitorCustomPlatform = { name:'android' };
      win.Capacitor = { ...win.Capacitor, isNativePlatform:() => true };
    });
    await page.getByRole('navigation', { name:'Điều hướng nhanh' }).getByRole('link', { name:'Tu tập', exact:true }).click();
    await page.locator(`button.tt-mode-card--${mode.kind}`).click();
    if (mode.kind === 'chuoi') await page.locator('.practice-confirm__primary').click();
    const screen = page.locator(mode.screen);
    await expect(screen).toBeVisible();
    for (const tabName of mode.kind === 'thien' ? ['Thời gian', 'Nhạc thiền'] : [null]) {
    if (tabName) {
      const tab = screen.getByRole('tab', { name:tabName, exact:true });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      const panel = screen.getByRole('tabpanel', { name:tabName, exact:true });
      await expect(panel).toBeVisible();
      await expect(panel.locator('.meditation-sound-picker__tile').filter({ visible:true }))
        .toHaveCount(tabName === 'Thời gian' ? 5 : 4);
    }
    const controls = screen.locator(mode.controls).filter({ visible:true });
    expect(await controls.count()).toBeGreaterThan(0);
    for (const control of await controls.all()) {
      await control.scrollIntoViewIfNeeded();
      await expect.poll(() => control.evaluate((element) => {
        const r = element.getBoundingClientRect();
        return Math.round(r.width * 1000) >= 44000 && Math.round(r.height * 1000) >= 44000 && r.x >= 0 && r.right <= innerWidth + 1
          && element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }), { message:`${mode.kind}: control must receive taps without an overlay` }).toBe(true);
    }
    const overlaps = await controls.evaluateAll((elements) => {
      // A scrolled card's layout box can extend under a fixed tab while its paint is clipped.
      // Compare painted rectangles; the per-control hit test above still proves each card reachable.
      const painted = elements.map(element => {
        const rect = element.getBoundingClientRect();
        let left = Math.max(0, rect.left), right = Math.min(innerWidth, rect.right);
        let top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
        for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          const box = ancestor.getBoundingClientRect();
          if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
            left = Math.max(left, box.left + ancestor.clientLeft);
            right = Math.min(right, box.left + ancestor.clientLeft + ancestor.clientWidth);
          }
          if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
            top = Math.max(top, box.top + ancestor.clientTop);
            bottom = Math.min(bottom, box.top + ancestor.clientTop + ancestor.clientHeight);
          }
        }
        return { left, right, top, bottom, label:element.textContent?.trim() };
      });
      return painted.flatMap((a, i) => painted.slice(i + 1).filter(b =>
        Math.min(a.right,b.right) - Math.max(a.left,b.left) > 1
        && Math.min(a.bottom,b.bottom) - Math.max(a.top,b.top) > 1,
      ).map(b => ({ first:a, second:b })));
    });
    expect(overlaps).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    if (mode.back || ['kinh','tri-chu','nghi-thuc'].includes(mode.kind)) {
      if (mode.back) await screen.locator(mode.back).click();
      else await page.locator('.tt-topbar .tt-back-btn').click();
      await expect(page.locator('.tt-mode-card--thien')).toBeVisible();
      await expect(screen).toHaveCount(0);
    }
  });
}

for (const width of [360,390]) for (const safeTop of [0,44]) {
  test(`native category content stays below the header without authoring actions at ${width}px with ${safeTop}px inset`, async ({ page }) => {
    await page.setViewportSize({ width, height:844 });
    await page.addInitScript((inset) => {
      const win = window as any;
      win.CapacitorCustomPlatform = { name:'android' };
      win.Capacitor = { ...win.Capacitor, isNativePlatform:() => true };
      localStorage.setItem('tutam_native_session', JSON.stringify({ authenticated:true, user:{ id:'qa-admin', email:'qa-admin@example.test', displayName:'Kiểm tra bố cục', avatarUrl:'', role:'admin' }, csrfToken:'qa-token', expiresAt:'2099-01-01' }));
      document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--app-safe-top', `${inset}px`));
    }, safeTop);
    await page.route('**/api/**', (route) => route.abort('failed'));
    await page.goto('/');
    await expect(page.locator('.daily-dhammapada-card')).toBeVisible();
    await page.evaluate(() => {
      const win = window as any;
      win.CapacitorCustomPlatform = { name:'android' };
      win.Capacitor = { ...win.Capacitor, isNativePlatform:() => true };
    });
    await page.getByRole('navigation', { name:'Điều hướng nhanh' }).getByRole('link', { name:'Tu tập', exact:true }).click();
    await page.locator('.tt-mode-card--tri-chu').click();
    const actions = page.locator('.tt-section-topbar .tt-create-btn');
    await expect(actions).toHaveCount(0);
    await expect(page.locator('.tt-section-topbar .tt-back-btn')).toHaveCount(0);
    await expect(page.locator('.tt-topbar .tt-back-btn')).toBeVisible();
    await expect(page.locator('.tt-card-edit,.tt-card-delete')).toHaveCount(0);
    const firstArticle = page.locator('.tt-section-view .tt-card').first();
    await expect(firstArticle).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const header = document.querySelector('.tt-topbar')!.getBoundingClientRect();
      return [...document.querySelectorAll('.tt-section-view .tt-card')].slice(0, 1).every((button) => {
        const r = button.getBoundingClientRect();
        return r.top >= header.bottom && r.x >= 0 && r.right <= innerWidth
          && button.contains(document.elementFromPoint(r.x + r.width / 2,r.y + r.height / 2));
      });
    })).toBe(true);
  });
}
