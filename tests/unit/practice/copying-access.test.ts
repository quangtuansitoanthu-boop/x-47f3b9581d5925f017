import { expect, it } from 'vitest';
import { canPasteCopy } from '../../../src/lib/domain/practice/copying-access';

it('allows only an authenticated administrator to paste for testing', () => {
  expect(canPasteCopy(true, 'admin')).toBe(true);
  for (const role of ['user', 'ctv', undefined]) expect(canPasteCopy(true, role)).toBe(false);
  expect(canPasteCopy(false, 'admin')).toBe(false);
});
