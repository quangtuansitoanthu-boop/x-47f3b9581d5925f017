import { isParticipationModule, type ParticipationPage } from '$lib/contracts/practice-participation';
import { fetchWithSessionRefresh } from './session-csrf';
import { isHtmlResponse } from './native-api';
export class ParticipationReadError extends Error {
  constructor(public status: number) { super('participation_read_failed'); }
}
export async function readAdminParticipation(params: string, signal: AbortSignal): Promise<ParticipationPage> {
  const response = await fetchWithSessionRefresh(`/api/admin/practice-participation?${params}`, { credentials:'include', signal, headers:{accept:'application/json'} });
  if (!response.ok || isHtmlResponse(response)) throw new ParticipationReadError(isHtmlResponse(response) ? 503 : response.status);
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object') throw new ParticipationReadError(502);
  const page = data as ParticipationPage;
  if (!Array.isArray(page.rows) || page.rows.length > 20 || !(page.next === null || typeof page.next === 'string')
    || page.rows.some(row => !row || !isParticipationModule(row.module) || typeof row.ownerId !== 'string' || typeof row.name !== 'string' || typeof row.at !== 'string' || !['started','recorded','completed'].includes(row.event))) throw new ParticipationReadError(502);
  return page;
}
