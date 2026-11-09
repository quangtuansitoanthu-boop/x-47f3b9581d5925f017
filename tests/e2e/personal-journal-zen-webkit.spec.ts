import { test } from '@playwright/test';
import { registerJournalZenCases } from './helpers/personal-journal-zen';

test.use({ browserName: 'webkit' });
registerJournalZenCases();
