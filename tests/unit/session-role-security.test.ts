import { expect, it } from 'vitest';
import { detectUserRole } from '../../src/lib/stores/session.svelte';
it.each([
  ['stranger@example.test', 'Quang Từ', 'user'], ['quangtu-attacker@example.test', 'Member', 'user'],
  ['tutap.phatphap26@gmail.com', 'Member', 'user'], ['hotboymic1@gmail.com', 'Member', undefined],
])('does not derive privileges from email/name %s', (email, name, role) => {
  expect(detectUserRole(email, name, role)).toBe('user');
});
it.each(['admin', 'ctv'] as const)('retains the server %s role', (role) => {
  expect(detectUserRole('member@example.test', 'Member', role)).toBe(role);
});
