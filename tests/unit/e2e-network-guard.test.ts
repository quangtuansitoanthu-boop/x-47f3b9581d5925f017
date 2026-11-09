import { createServer, get, type Server } from 'node:http';
import { connect, type Socket } from 'node:net';
import type { FullConfig } from '@playwright/test';
import { expect, it } from 'vitest';

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return address.port;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

function status(proxyPort: number, destination: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = get({ hostname: '127.0.0.1', port: proxyPort, path: destination }, response => {
      response.resume();
      response.once('end', () => resolve(response.statusCode!));
    });
    request.once('error', reject);
  });
}

it('keeps the loopback proxy alive after rejected CONNECT and active HTTP clients reset their sockets', async () => {
  const reserved = createServer();
  const proxyPort = await listen(reserved);
  await close(reserved);
  const previousPort = process.env.TUTAM_E2E_PROXY_PORT;
  process.env.TUTAM_E2E_PROXY_PORT = String(proxyPort);
  let release: (() => Promise<void>) | undefined;
  let receiveActive: () => void = () => {};
  const activeReceived = new Promise<void>(resolve => { receiveActive = resolve; });
  const targetSockets = new Set<Socket>();
  const target = createServer((request, response) => {
    if (request.url === '/hold') receiveActive();
    else response.writeHead(200).end('healthy');
  });
  target.on('connection', socket => {
    targetSockets.add(socket);
    socket.on('error', () => socket.destroy());
    socket.once('close', () => targetSockets.delete(socket));
  });
  const targetPort = await listen(target);
  try {
    const { default: startGuard, LOCAL_ONLY_PROXY } = await import('../e2e/global-network-guard');
    expect(LOCAL_ONLY_PROXY.bypass.split(',')).toEqual(['localhost', '127.0.0.1', '[::1]']);
    expect(new URL(LOCAL_ONLY_PROXY.server).hostname).toBe('127.0.0.1');
    release = await startGuard({ projects: [{ use: { baseURL: `http://127.0.0.1:${targetPort}` } }] } as FullConfig);

    // Tạo RST thật sau phản hồi CONNECT bị chặn, thay vì chỉ emit lỗi Socket giả.
    await new Promise<void>((resolve, reject) => {
      const client = connect(proxyPort, '127.0.0.1', () => {
        client.write('CONNECT external.invalid:443 HTTP/1.1\r\nHost: external.invalid:443\r\n\r\n');
      });
      client.once('data', data => {
        expect(data.toString()).toContain('403 Forbidden');
        client.resetAndDestroy();
      });
      client.once('error', reject);
      client.once('close', () => resolve());
    });

    // Hủy request khi proxy đã mở kết nối tới local upstream cũng phải được dọn an toàn.
    const client = connect(proxyPort, '127.0.0.1', () => {
      client.write(`GET http://127.0.0.1:${targetPort}/hold HTTP/1.1\r\nHost: 127.0.0.1:${targetPort}\r\n\r\n`);
    });
    client.on('error', () => client.destroy());
    await activeReceived;
    const resetClosed = new Promise<void>(resolve => client.once('close', () => resolve()));
    client.resetAndDestroy();
    await resetClosed;

    expect(await status(proxyPort, 'http://external.invalid/forbidden')).toBe(403);
    expect(await status(proxyPort, `http://127.0.0.1:${targetPort}/healthy`)).toBe(200);
  } finally {
    await release?.();
    for (const socket of targetSockets) socket.destroy();
    await close(target);
    if (previousPort === undefined) delete process.env.TUTAM_E2E_PROXY_PORT;
    else process.env.TUTAM_E2E_PROXY_PORT = previousPort;
  }
});
