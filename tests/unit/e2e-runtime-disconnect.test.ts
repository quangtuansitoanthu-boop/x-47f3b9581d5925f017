import { describe, expect, it } from 'vitest';
import { isProxyTransportDisconnect } from '../e2e/local-dev-runtime.mjs';

function disconnect() {
  const cause = Object.assign(new Error(''), { cause: { name: 'Error', message: 'Network connection lost.', stack: 'Error: Network connection lost.' } });
  return { type: 'error', source: 'ProxyController', reason: 'Error inside ProxyWorker', cause };
}

describe('local runtime transport-only disconnect classification', () => {
  it('recognizes the exact observed serialized Wrangler disconnect', () => {
    expect(isProxyTransportDisconnect(disconnect())).toBe(true);
  });
  it.each(['LocalRuntimeController', 'BundlerController', 'ConfigController', 'InspectorProxyWorker', 'ProxyWorker'])('does not suppress %s errors', source => {
    expect(isProxyTransportDisconnect({ ...disconnect(), source })).toBe(false);
  });
  it('does not suppress application or unknown proxy errors', () => {
    const event = disconnect();
    expect(isProxyTransportDisconnect({ ...event, cause: new Error('Application failure') })).toBe(false);
    expect(isProxyTransportDisconnect({ ...event, reason: 'Failed to start ProxyWorker' })).toBe(false);
    expect(isProxyTransportDisconnect({ ...event, type: 'buildFailed' })).toBe(false);
    expect(isProxyTransportDisconnect({ ...event, cause: { cause: event.cause.cause } })).toBe(false);
    expect(isProxyTransportDisconnect(undefined)).toBe(false);
  });
  it('does not suppress a matching message with an application stack', () => {
    const event = disconnect();
    Object.assign(event.cause.cause, { stack: 'Error: Network connection lost.\n at application' });
    expect(isProxyTransportDisconnect(event)).toBe(false);
  });
});
