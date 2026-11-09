import { test } from '@playwright/test';
import { registerJournalKeyboardCases } from './helpers/journal-keyboard-overlap';

test.use({ browserName: 'chromium' });
registerJournalKeyboardCases();
