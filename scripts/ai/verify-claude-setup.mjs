import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = async (path) => JSON.parse(await readFile(join(root, path), 'utf8'));
const config = await readJson('.mcp.json');
const lock = await readJson('.claude/sources.lock.json');
assert.equal(lock.schemaVersion, 1);
assert.ok(lock.skills.length > 0);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [relative(root, path).replaceAll('\\', '/')];
  }))).flat();
}

let checked = 0;
for (const skill of lock.skills) {
  assert.match(skill.revision, /^[a-f0-9]{40}$/);
  assert.ok(['https://github.com/capawesome-team/skills', 'https://github.com/Cap-go/capgo-skills'].includes(skill.repository));
  const folder = `.claude/skills/${skill.name}`;
  assert.deepEqual((await listFiles(join(root, folder))).sort(), Object.keys(skill.files).sort());
  const instructions = await readFile(join(root, folder, 'SKILL.md'), 'utf8');
  assert.match(instructions, /^---\r?\n/);
  assert.ok(instructions.includes(`name: ${skill.name}`));
  for (const [path, expected] of Object.entries(skill.files)) {
    const actual = createHash('sha256').update(await readFile(join(root, path))).digest('hex');
    assert.equal(actual, expected, `Integrity mismatch: ${path}`);
    checked++;
  }
}
for (const [path, expected] of Object.entries(lock.licenses)) {
  assert.equal(createHash('sha256').update(await readFile(join(root, path))).digest('hex'), expected, path);
}
for (const name of ['svelte', 'cloudflare-docs']) {
  assert.equal(config.mcpServers[name].type, 'http');
  assert.equal(config.mcpServers[name].url, lock.mcp[name].url);
}
assert.ok(config.mcpServers.playwright.args.includes(`${lock.mcp.playwright.package}@${lock.mcp.playwright.version}`));
assert.ok(config.mcpServers.playwright.args.includes('--isolated'));
assert.ok(config.mcpServers.playwright.args.includes('--headless'));
console.log(`PASS: ${lock.skills.length} skills, ${checked} upstream files, licenses and 3 MCP configurations.`);

const initialize = {
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'tutam-setup-verifier', version: '1.0.0' } },
};
const initialized = { jsonrpc: '2.0', method: 'notifications/initialized' };
const toolsList = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };

async function httpProbe(name, server) {
  let sessionId;
  let protocolVersion;
  async function send(message) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;
    if (protocolVersion) headers['MCP-Protocol-Version'] = protocolVersion;
    const response = await fetch(server.url, { method: 'POST', headers, body: JSON.stringify(message), signal: AbortSignal.timeout(30_000) });
    assert.ok(response.ok, `${name}: HTTP ${response.status}`);
    sessionId = response.headers.get('mcp-session-id') || sessionId;
    if (!('id' in message)) { await response.body?.cancel(); return; }
    let payload;
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (!payload) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n');
          let boundary;
          while ((boundary = buffer.indexOf('\n\n')) !== -1) {
            const event = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const data = event.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
            if (!data) continue;
            const candidate = JSON.parse(data);
            if (candidate.id === message.id) payload = candidate;
          }
        }
      } finally { await reader.cancel(); }
    } else { payload = await response.json(); }
    assert.ok(payload, `${name}: missing JSON-RPC response`);
    assert.ok(!payload.error, `${name}: ${JSON.stringify(payload.error)}`);
    return payload.result;
  }
  try {
    const result = await send(initialize);
    protocolVersion = result.protocolVersion;
    await send(initialized);
    const tools = await send(toolsList);
    assert.ok(tools.tools.length > 0, `${name}: no tools`);
    console.log(`PASS: ${name} initialize + tools/list (${tools.tools.length} tools).`);
  } finally {
    if (sessionId) {
      await fetch(server.url, { method: 'DELETE', headers: { 'Mcp-Session-Id': sessionId, 'MCP-Protocol-Version': protocolVersion || '2025-03-26' }, signal: AbortSignal.timeout(5000) }).then((response) => response.body?.cancel()).catch(() => {});
    }
  }
}

async function stdioProbe(server) {
  const child = spawn(server.command, server.args, { cwd: root, env: { ...process.env, ...server.env }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let diagnostics = '';
  child.stderr.on('data', (chunk) => { diagnostics = (diagnostics + chunk).slice(-2000); });
  try {
    await new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error(`playwright: handshake timed out. ${diagnostics}`)), 60_000);
      const lines = createInterface({ input: child.stdout });
      const finish = (error) => { clearTimeout(timer); lines.close(); error ? reject(error) : resolvePromise(); };
      child.once('error', finish);
      child.once('exit', (code) => finish(new Error(`playwright exited (${code}). ${diagnostics}`)));
      lines.on('line', (line) => {
        try {
          const message = JSON.parse(line);
          if (message.error) throw new Error(JSON.stringify(message.error));
          if (message.id === 1) {
            assert.ok(message.result.serverInfo);
            child.stdin.write(`${JSON.stringify(initialized)}\n${JSON.stringify(toolsList)}\n`);
          } else if (message.id === 2) {
            assert.ok(message.result.tools.length > 0);
            console.log(`PASS: playwright initialize + tools/list (${message.result.tools.length} tools).`);
            finish();
          }
        } catch (error) { finish(error); }
      });
      child.stdin.write(`${JSON.stringify(initialize)}\n`);
    });
  } finally {
    // Closing stdin lets npx and its MCP child exit without leaving a browser/server running.
    child.stdin.end();
    if (child.exitCode === null) {
      await new Promise((done) => {
        const timer = setTimeout(() => { child.kill(); done(); }, 5000);
        child.once('exit', () => { clearTimeout(timer); done(); });
      });
    }
  }
}

if (process.argv.includes('--connect')) {
  const probes = await Promise.allSettled([
    httpProbe('svelte', config.mcpServers.svelte),
    httpProbe('cloudflare-docs', config.mcpServers['cloudflare-docs']),
    stdioProbe(config.mcpServers.playwright),
  ]);
  for (const probe of probes) {
    if (probe.status === 'rejected') { console.error(`FAIL: ${probe.reason.message}`); process.exitCode = 1; }
  }
}
