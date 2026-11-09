import { handleBookImport } from '$lib/server/http/admin-book-handler';
import type { EventLike } from '$lib/server/http/runtime';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) => handleBookImport(event as unknown as EventLike);
