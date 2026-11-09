import type { RequestHandler } from './$types';

const DESTINATIONS: Record<string, string> = {
  'index.html': '/',
  'huong-dan.html': '/huong-dan',
  'huongdan.html': '/huong-dan',
  'phap-thoai.html': '/phap-thoai',
  'phapthoai.html': '/phap-thoai',
  'tu-tap.html': '/tu-tap',
  'tutap.html': '/tu-tap'
};

const handle: RequestHandler = ({ params, url }) => {
  const destination = DESTINATIONS[params.legacy];
  if (!destination) return new Response('Not found', { status: 404 });

  const target = new URL(destination, url.origin);
  target.search = url.search;
  return new Response(null, {
    status: 308,
    headers: {
      'Cache-Control': 'public, max-age=3600',
      Location: target.toString()
    }
  });
};

export { handle as GET, handle as HEAD };
