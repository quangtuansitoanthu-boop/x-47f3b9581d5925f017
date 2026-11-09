import { afterEach, expect, it, vi } from 'vitest';
import { providerFetch } from '../../src/lib/server/auth/native-token-verification.ts';

afterEach(() => vi.restoreAllMocks());

it('can reach a token verifier using the actual Workers fetch runtime', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    // Validate options using workerd's real Request, unlike Node-only mocks.
    new Request(input, init);
    return Response.json({ error: 'invalid_token' }, { status: 400 });
  });
  const response = await providerFetch('https://oauth2.googleapis.com/tokeninfo?id_token=diagnostic');
  expect(response.status).toBe(400);
});

it('rejects provider redirects without sending the token to the redirect target', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    new Request(input, init);
    return new Response('', { status: 302, headers: { location: 'https://unexpected.example/steal' } });
  });
  await expect(providerFetch('https://oauth2.googleapis.com/tokeninfo?id_token=redirect-test')).rejects.toThrow();
});
