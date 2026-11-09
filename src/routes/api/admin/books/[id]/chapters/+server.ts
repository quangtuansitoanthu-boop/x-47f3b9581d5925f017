import { handleBookChapters } from '$lib/server/http/admin-book-handler';
import type { EventLike } from '$lib/server/http/runtime';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = (event) => handleBookChapters(event as unknown as EventLike);
