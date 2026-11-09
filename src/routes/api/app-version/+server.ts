import { version } from '$app/environment';
import type { RequestHandler } from './$types';

// Bump MIN_APP_VERSION only when a native shell release must be force-updated.
const MIN_APP_VERSION = '1.0.0';

export const GET: RequestHandler = () =>
  new Response(JSON.stringify({ minVersion: MIN_APP_VERSION, latestBuild: version }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
