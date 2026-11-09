/** Only Wrangler's serialized proxy transport disconnect; never application/build errors. */
export function isProxyTransportDisconnect(event) {
  if (event?.type !== 'error' || event.source !== 'ProxyController' || event.reason !== 'Error inside ProxyWorker') return false;
  const error = event.cause?.cause;
  return event.cause instanceof Error && event.cause.message === '' &&
    error?.name === 'Error' && error.message === 'Network connection lost.' &&
    error.stack === 'Error: Network connection lost.';
}

/** Same Wrangler config/bundler/local bindings as CLI, without CLI's fatal disconnect policy. */
export async function startLocalDevRuntime({ config, persistence, cleanup }) {
  const { unstable_DevEnv } = await import('wrangler');
  const environment = new unstable_DevEnv();
  let stopping = false;
  let shutdownPromise;
  async function shutdown(code) {
    if (shutdownPromise) return shutdownPromise;
    stopping = true;
    shutdownPromise = (async () => {
      try { await environment.teardown(); }
      catch (error) { console.error('[e2e-runtime-api] teardown failed', error); code = 1; }
      finally { cleanup(); process.exit(code); }
    })();
    return shutdownPromise;
  }
  // Attach before config/bundling/runtime startup; unknown errors always fail closed.
  environment.on('error', event => {
    if (!stopping && isProxyTransportDisconnect(event)) {
      console.warn('[e2e-runtime-api] Failed request: Wrangler proxy transport disconnected; no request retry or server restart.');
      return;
    }
    if (!stopping) {
      console.error('[e2e-runtime-api] fatal controller error', event?.source, event?.reason, event?.cause);
      void shutdown(1);
    }
  });
  environment.on('buildFailed', event => {
    if (!stopping) {
      console.error('[e2e-runtime-api] build failed', event?.cause);
      void shutdown(1);
    }
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void shutdown(0); });
  try {
    const worker = await environment.startWorker({
      config,
      dev: {
        remote: false,
        server: { hostname: '127.0.0.1', port: 8787 },
        persist: persistence,
        liveReload: false,
        logLevel: 'warn',
      },
    });
    await worker.ready;
    console.log(`[e2e-runtime-api] Ready at ${await worker.url}; fresh local persistence, canonical Wrangler config.`);
    return { worker, shutdown };
  } catch (error) {
    console.error('[e2e-runtime-api] startup failed', error);
    await shutdown(1);
  }
}
