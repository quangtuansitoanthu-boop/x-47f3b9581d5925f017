import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  canonicalRoot,
  isOwnedProcess,
  readRuntimeState,
  removeRuntimeState,
  terminateProcessTree,
  waitForProcessExit,
} from './runtime-state.mjs';

const cleanup = process.argv.includes('--cleanup');
const root = await canonicalRoot(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const state = await readRuntimeState(root);

if (!state) {
  console.log(cleanup ? 'Không có runtime cần cleanup.' : 'Không có dev server của checkout hiện tại đang chạy.');
  process.exit(0);
}

if (state.root !== root) {
  console.error('Từ chối dừng runtime: state file không thuộc checkout hiện tại.');
  process.exit(1);
}

const parentOwned = isOwnedProcess(
  state.parentPid,
  state.parentMarker,
  state.parentStartedAt,
);
const childOwned = isOwnedProcess(
  state.childPid,
  state.childScript,
  state.childStartedAt,
);

if (!parentOwned && !childOwned) {
  await removeRuntimeState(root);
  console.log('Đã xóa runtime state cũ; không có tiến trình thuộc checkout hiện tại đang chạy.');
  process.exit(0);
}

if (parentOwned) {
  terminateProcessTree(state.parentPid, 'SIGTERM');
  const stopped = await waitForProcessExit(state.parentPid);
  if (!stopped && isOwnedProcess(
    state.parentPid,
    state.parentMarker,
    state.parentStartedAt,
  )) {
    terminateProcessTree(state.parentPid, 'SIGKILL');
    await waitForProcessExit(state.parentPid, 1_000);
  }
}

if (isOwnedProcess(state.childPid, state.childScript, state.childStartedAt)) {
  terminateProcessTree(state.childPid, 'SIGTERM');
  const stopped = await waitForProcessExit(state.childPid);
  if (!stopped && isOwnedProcess(state.childPid, state.childScript, state.childStartedAt)) {
    terminateProcessTree(state.childPid, 'SIGKILL');
    await waitForProcessExit(state.childPid, 1_000);
  }
}

const parentStillRunning = isOwnedProcess(
  state.parentPid,
  state.parentMarker,
  state.parentStartedAt,
);
const childStillRunning = isOwnedProcess(
  state.childPid,
  state.childScript,
  state.childStartedAt,
);

if (parentStillRunning || childStillRunning) {
  console.error('Không thể dừng hoàn toàn runtime; giữ nguyên state để có thể cleanup lại.');
  process.exit(1);
}

await removeRuntimeState(root);
console.log(`Đã dừng runtime ${state.mode} của checkout hiện tại.`);
