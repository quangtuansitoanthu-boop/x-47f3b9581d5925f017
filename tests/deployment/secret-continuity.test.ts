import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  REQUIRED_SECRETS,
  verifySecretContinuity,
  verifySecretNames,
} from '../../scripts/deploy/verify-secret-continuity.js';
import { adapterSessionShape } from '../../src/lib/server/auth/sessions';
import { adapterSessionResponse } from '../../src/worker/api/auth.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
    force: true,
    recursive: true,
  })));
});

async function createSecretsFile(names = REQUIRED_SECRETS) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'quangtu-secrets-'));
  temporaryDirectories.push(directory);
  const secretsPath = path.join(directory, 'secrets.json');
  await writeFile(secretsPath, JSON.stringify(names.map((name) => ({ name }))));
  return secretsPath;
}

function internalSession(id = 'user-1') {
  return {
    appUserId: id,
    csrfToken: crypto.randomUUID(),
    displayName: 'Quang Từ',
    email: 'quangtu@example.test',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    id: crypto.randomUUID(),
    rawToken: crypto.randomUUID(),
    role: 'admin' as const,
    userId: id,
  };
}

async function realAdapterFixtures(id = 'user-1') {
  const session = internalSession(id);
  return {
    legacy: await adapterSessionResponse(session).json(),
    rewrite: adapterSessionShape(session),
  };
}

describe('pretraffic secret and session continuity gate', () => {
  it('fails when any required Worker secret name is absent', async () => {
    const secretsPath = await createSecretsFile(REQUIRED_SECRETS.slice(1));
    await expect(verifySecretNames(secretsPath)).rejects.toThrow(
      `missing-worker-secrets:${REQUIRED_SECRETS[0]}`,
    );
  });

  it('requires a production data boundary and an authenticated browser cookie', async () => {
    const secretsPath = await createSecretsFile();
    const input = {
      candidateDataBoundary: 'staging',
      newBaseUrl: new URL('https://candidate.example'),
      oldBaseUrl: new URL('https://legacy.example'),
      secretsPath,
      sessionCookie: '',
    };

    await expect(verifySecretContinuity(input)).rejects.toThrow(
      'candidate-must-bind-production-data',
    );
    await expect(verifySecretContinuity({
      ...input,
      candidateDataBoundary: 'production',
    })).rejects.toThrow('session-continuity-cookie-required');
  });

  it('compares stable authenticated identity across legacy and candidate runtimes', async () => {
    const secretsPath = await createSecretsFile();
    const mismatchedLegacy = await realAdapterFixtures('user-1');
    const mismatchedRewrite = await realAdapterFixtures('user-2');
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => Response.json(url.hostname === 'candidate.example'
      ? mismatchedRewrite.rewrite
      : mismatchedLegacy.legacy)));

    const input = {
      candidateDataBoundary: 'production',
      newBaseUrl: new URL('https://candidate.example'),
      oldBaseUrl: new URL('https://legacy.example'),
      secretsPath,
      sessionCookie: '__Host-quangtu_session=opaque',
    };
    await expect(verifySecretContinuity(input)).rejects.toThrow(
      'session-cookie-continuity-mismatch',
    );

    const matching = await realAdapterFixtures();
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => Response.json(url.hostname === 'candidate.example'
      ? matching.rewrite
      : matching.legacy)));
    await expect(verifySecretContinuity(input)).resolves.toEqual({
      comparedSession: true,
      secretCount: REQUIRED_SECRETS.length,
    });
  });
});
