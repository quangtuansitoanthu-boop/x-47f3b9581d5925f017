import type { CloudflareEnvLike } from '../../../lib/server/cloudflare-context';
import { handleApiRequest } from '../../../lib/server/http/api-handler';

const handle = async (event: {
  request: Request;
  params: Record<string, string>;
  locals: Record<string, unknown>;
  platform?: { env?: CloudflareEnvLike; context?: unknown } | null;
}): Promise<Response> => handleApiRequest(event);

export {
  handle as DELETE,
  handle as GET,
  handle as HEAD,
  handle as OPTIONS,
  handle as PATCH,
  handle as POST,
  handle as PUT,
};
