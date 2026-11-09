import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  cacheDir: './.cache/vitest-copying-editor',
  plugins: [sveltekit()],
  resolve: { conditions: ['browser'] },
  // Dual-engine geometry owns browser processes; keep its existing timing and geometry checks.
  test: { environment: 'jsdom', maxWorkers: process.env.COPYING_GEOMETRY_WEBKIT === '1' ? 1 : undefined, include: ['tests/component/reader/pdf-book-format.browser.spec.ts', 'tests/component/home/content-update-transition.browser.spec.ts', 'tests/component/notifications/notification-bell.browser.spec.ts', 'tests/component/practice/mindful-notification-target.browser.spec.ts', 'tests/component/practice/mindful-cache-race.browser.spec.ts', 'tests/component/practice/routine-editor-validation.browser.spec.ts', 'tests/component/practice/personal-journal-draft.browser.spec.ts', 'tests/component/practice/rosary-auto-target.browser.spec.ts', 'tests/component/practice/ios-reminder-permission.browser.spec.ts', 'tests/component/practice/le-phat-routine.browser.spec.ts', 'tests/component/practice/copying-editor.browser.spec.ts', 'tests/component/practice/personal-events-storage.browser.spec.ts', 'tests/component/reader/quote-export.browser.spec.ts', 'tests/component/reader/native-download.browser.spec.ts', 'tests/component/reader/community-safety.browser.spec.ts', 'tests/component/practice/native-select-picker.browser.spec.ts', 'tests/component/audio/audio-download-session.browser.spec.ts', 'tests/component/shared/app-dialog.browser.spec.ts', 'tests/component/auth/account-delete-session.browser.spec.ts', 'tests/component/auth/blocked-users.browser.spec.ts', 'tests/component/admin-member-suspend.browser.spec.ts', 'tests/component/auth/account-settings-safety.browser.spec.ts', 'tests/component/reader/pdf-probe-budget.browser.spec.ts'] },
});

