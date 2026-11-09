import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

const generator = readFileSync('scripts/patch-google-auth.mjs', 'utf8');
const template = generator.slice(generator.indexOf('const patchedContent = `') + 'const patchedContent = `'.length, generator.lastIndexOf('`;'));
const start = template.indexOf('      ExecutorService executor =');
const end = template.indexOf('    } catch (ApiException e)', start);
if (start < 0 || end < 0) throw new Error('Generated Google sign-in worker missing');
// Chạy đúng khối điều phối sinh ra, chỉ đổi khai báo kiểu và cú pháp lambda Java.
const worker = template.slice(start, end)
  .replace('ExecutorService executor =', 'const executor =')
  .replace('JSONObject accessTokenObject =', 'const accessTokenObject =')
  .replaceAll('() ->', '() =>')
  .replaceAll('catch (Exception e)', 'catch (e)');

it.each(['success', 'optional-token-failure', 'submission-failure'])('releases each sign-in executor without discarding queued identity work (%s)', outcome => {
  const queued: Array<() => void> = [];
  const executor = {
    execute: vi.fn((task: () => void) => {
      if (outcome === 'submission-failure') throw new Error('worker rejected');
      queued.push(task);
    }),
    shutdown: vi.fn(),
  };
  const user = { put: vi.fn() };
  const call = { resolve: vi.fn() };
  const authentication = { put: vi.fn() };
  const run = () => runInNewContext(worker, {
    Executors: { newSingleThreadExecutor: () => executor },
    getAuthToken: () => {
      if (outcome === 'optional-token-failure') throw { getMessage: () => 'token unavailable' };
      return { opt: (key: string) => key };
    },
    account: { getAccount: () => ({}) }, authentication, user, call,
    FIELD_ACCESS_TOKEN: 'accessToken', FIELD_TOKEN_EXPIRES: 'expires', FIELD_TOKEN_EXPIRES_IN: 'expires_in',
    Log: { w: vi.fn() },
  });
  if (outcome === 'submission-failure') expect(run).toThrow('worker rejected');
  else run();
  expect(executor.shutdown).toHaveBeenCalledOnce();
  expect(call.resolve).not.toHaveBeenCalled();
  for (const task of queued) task();
  expect(call.resolve).toHaveBeenCalledTimes(outcome === 'submission-failure' ? 0 : 1);
  if (outcome !== 'submission-failure') {
    expect(call.resolve).toHaveBeenCalledWith(user);
    expect(user.put).toHaveBeenCalledWith('authentication', authentication);
    expect(authentication.put).toHaveBeenCalledTimes(outcome === 'success' ? 3 : 0);
  }
});
