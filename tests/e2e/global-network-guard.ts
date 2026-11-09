import { createServer, request as httpRequest } from 'node:http';
import { connect, type Socket } from 'node:net';
import type { FullConfig } from '@playwright/test';

const configuredPort = Number(process.env.TUTAM_E2E_PROXY_PORT || '8799');
if (!Number.isInteger(configuredPort) || configuredPort < 1024 || configuredPort > 65535) {
  throw new Error('TUTAM_E2E_PROXY_PORT must be an integer between 1024 and 65535');
}

export const LOCAL_ONLY_PROXY = {
  server: `http://127.0.0.1:${configuredPort}`,
  // Local runtime traffic goes directly to Wrangler; external traffic remains blocked by the proxy.
  bypass: 'localhost,127.0.0.1,[::1]',
};

function localHost(hostname: string): string | null {
  if (hostname === 'localhost' || hostname === '127.0.0.1') return '127.0.0.1';
  if (hostname === '[::1]' || hostname === '::1') return '::1';
  return null;
}

/** Chặn ở tầng mạng sau mock, kể cả request được route.continue() chuyển tiếp. */
export default async function startLocalNetworkGuard(config: FullConfig): Promise<() => Promise<void>> {
  for (const project of config.projects) {
    const baseURL = project.use.baseURL || 'http://localhost:8787';
    if (!localHost(new URL(baseURL).hostname)) {
      throw new Error('Local-only E2E guard refuses a non-loopback baseURL');
    }
  }

  const sockets = new Set<Socket>();
  const track = (socket: Socket): Socket => {
    sockets.add(socket);
    // Client có thể reset ngay sau phản hồi chặn CONNECT; listener phải có trước mọi nhánh trả về.
    socket.on('error', () => socket.destroy());
    socket.once('close', () => sockets.delete(socket));
    return socket;
  };
  const server = createServer((incoming, response) => {
    incoming.on('error', () => response.destroy());
    response.on('error', () => incoming.destroy());
    let target: URL;
    try {
      target = new URL(incoming.url || '', 'http://invalid.test');
    } catch {
      response.writeHead(400).end('Invalid E2E proxy request');
      return;
    }
    const hostname = localHost(target.hostname);
    if (target.protocol !== 'http:' || !hostname) {
      console.warn(`[e2e-local-only] Blocked external ${incoming.method || 'HTTP'} request`);
      response.writeHead(403).end('External network is disabled for this E2E run');
      return;
    }
    const upstream = httpRequest({
      hostname,
      port: target.port || 80,
      method: incoming.method,
      path: `${target.pathname}${target.search}`,
      headers: { ...incoming.headers, host: target.host },
      agent: false,
    }, upstreamResponse => {
      upstreamResponse.on('error', () => response.destroy());
      upstreamResponse.on('aborted', () => response.destroy());
      if (response.destroyed) {
        upstreamResponse.destroy();
        return;
      }
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    upstream.on('socket', track);
    upstream.on('error', () => {
      if (response.destroyed) return;
      if (!response.headersSent) response.writeHead(502);
      response.end('Local E2E target is unavailable');
    });
    incoming.on('aborted', () => upstream.destroy());
    response.once('close', () => {
      if (!response.writableFinished) upstream.destroy();
    });
    incoming.pipe(upstream);
  });
  server.on('connection', track);
  server.on('connect', (request, client, head) => {
    let target: URL;
    try {
      target = new URL(`https://${request.url || ''}`);
    } catch {
      client.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      return;
    }
    const hostname = localHost(target.hostname);
    if (!hostname) {
      // CONNECT mã hóa cả method, phải chặn mọi tunnel ngoài loopback để tránh ghi ngoài ý muốn.
      console.warn('[e2e-local-only] Blocked external CONNECT tunnel');
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    const upstream = track(connect(Number(target.port || 443), hostname));
    upstream.once('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      client.pipe(upstream);
      upstream.pipe(client);
    });
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
    client.once('close', () => upstream.destroy());
  });
  server.on('clientError', (_error, socket) => socket.destroy());

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(configuredPort, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  };
}
