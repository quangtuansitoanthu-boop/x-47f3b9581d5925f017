import { corsPreflight, withCors } from './cors';
import type { CloudflareEnvLike, CloudflareRequestContext } from '../cloudflare-context';
import { OAuthError, beginGoogleAuthorization, completeGoogleAuthorization } from '../auth/google-oauth';
import { beginFacebookAuthorization, completeFacebookAuthorization } from '../auth/facebook-oauth';
import { redeemFacebookHandoff, validFacebookChallenge } from '../auth/facebook-browser-handoff';
import { can } from '../auth/rbac';
import { adapterSessionShape, clearSessionCookie, publicSession, requiredSecret, revokeSession } from '../auth/sessions';
import type { InternalSession } from '../auth/types';
import { sha256 } from '../crypto';
import { ServerInputError } from '../errors';
import { tableDefinition } from '../domain/data-contract';
import { createArticlesService } from '../services/articles';
import { deleteAccount } from '../services/account-deletion';
import { createCommunityModerationService } from '../services/community-moderation';
import { createMindfulCommunityService } from '../services/mindful-community';
import { createPersonalSettingsService } from '../services/personal-settings';
import { createNotificationReadStateService } from '../services/notification-read-state';
import { getNotificationState, saveNotificationState } from '../services/notification-state';
import { createAdminCommunityModerationService } from '../services/admin-community-moderation';
import { createAdminDashboardService } from '../services/admin-dashboard';
import { createAdminAnalyticsService } from '../services/admin-analytics';
import { createAdminCommunityService } from '../services/admin-community';
import { createAdminMembersService } from '../services/admin-members';
import { createPracticeParticipationService } from '../services/practice-participation';
import { getAdminNotifications } from '../services/admin-notifications';
import { createMediaService } from '../services/media';
import { createPresenceService } from '../services/presence';
import {
  createFacebookIntegrationService,
  facebookConfigurationReady,
  facebookImportEnabled,
} from '../services/facebook-integration';
import { createPracticeSessionsService } from '../services/practice-sessions';
import { createPracticeCommunityService } from '../services/practice-community';
import {
  publicPracticeCommunityEnabled,
  requirePublicPracticeCommunity,
} from '../services/practice-community-gate';
import { createReadingActivityService } from '../services/reading-activity';
import { createSyncService } from '../services/sync';
import { readPersonalEvents, writePersonalEvents } from '../services/personal-events';
import { createThanhTinhService } from '../services/thanh-tinh';
import { createCopyingService } from '../services/scripture-copying';
import { assertNoNewArchiveTrackUrls } from '../services/talk-track-policy';
import { createTalksService } from '../services/talks';
import { contentUpdateIds, createContentUpdatesService } from '../services/content-updates';
import { listAlbumPlays, recordAlbumPlay } from '../services/album-plays';
import {
  createPhapBaoItem,
  deletePhapBaoItem,
  getUserPhapBaoHistory,
  listPublicPhapBaoItems,
  recordPhapBaoClaim,
  updateCampaignShopeeLink,
  updatePhapBaoItem
} from '../services/phap-bao';
import { readJson } from './request';
import { apiError, json, methodNotAllowed, redirect, withRequestId } from './responses';
import { checkRateLimit } from './rate-limit';
import { clientAddressHashInput, enforceLoginOrigin, enforcePublicWriteOrigin, enforceSameOriginMutation, isAllowedOrigin } from './security';
import { type EventLike, getApiLocals } from './runtime';
import { incrementView } from '../../../worker/api/views-and-comments.js';
import { scanGoogleDriveTalks } from '../../../worker/api/google-drive-talk-scan.js';
import { handleData as legacyHandleData } from '../../../worker/api/data.js';

export async function handleApiRequest(event: EventLike): Promise<Response> {
  const runtime = getApiLocals(event);
  const requestId = runtime.requestId;
  // App native (Capacitor) gọi API cross-origin từ capacitor://localhost:
  // phải trả CORS + xử lý preflight, nếu không fetch bị chặn dù có mạng.
  const cors = corsPreflight(event.request);
  if (cors) return withRequestId(cors, requestId);
  try {
    if (!runtime.env) {
      return withCors(withRequestId(apiError(503, 'platform_unavailable', 'Cloudflare bindings chưa sẵn sàng.', requestId), requestId), event.request);
    }
    const url = new URL(event.request.url);
    if (url.pathname === '/api/health') {
      return withCors(withRequestId(await health(runtime.env), requestId), event.request);
    }
    if (!runtime.migrationSealed) {
      return withCors(withRequestId(apiError(503, 'migration_unsealed', 'Dữ liệu chưa được xác minh.', requestId), requestId), event.request);
    }
    const response = await dispatch(event, runtime.env, runtime.session, requestId);
    return withCors(withRequestId(response, requestId), event.request);
  } catch (error) {
    if (isServerInputError(error)) {
      return withCors(withRequestId(apiError(error.status, error.code, error.message, requestId, error.details), requestId), event.request);
    }
    if (error instanceof OAuthError) {
      return withCors(withRequestId(apiError(error.status, error.code, error.message, requestId), requestId), event.request);
    }
    if (isLegacyHttpInputError(error)) {
      return withCors(withRequestId(apiError(error.status, error.code, error.message, requestId, error.details), requestId), event.request);
    }
    console.error(JSON.stringify({ level: 'error', event: 'api_failure', requestId, name: (error as Error)?.name }));
    return withCors(withRequestId(apiError(500, 'internal_error', 'Đã xảy ra lỗi máy chủ.', requestId), requestId), event.request);
  }
}

async function dispatch(event: EventLike, env: NonNullable<ReturnType<typeof getApiLocals>['env']>, session: InternalSession | null, requestId: string): Promise<Response> {
  const request = event.request;
  const url = new URL(request.url);
  const path = url.pathname;
  const context: CloudflareRequestContext = { env, principal: session, requestId };

  if (path === '/api/content-updates') {
    if (request.method !== 'GET') return methodNotAllowed(['GET'], requestId);
    const service = createContentUpdatesService(env);
    const action = url.searchParams.get('action') ?? 'catalog';
    let payload: unknown;
    if (action === 'catalog') payload = await service.catalog(url);
    else if (action === 'estimate') payload = await service.estimate(contentUpdateIds(url.searchParams.get('ids')));
    else if (action === 'article') {
      const ids = contentUpdateIds(url.searchParams.get('id'));
      const after = url.searchParams.has('after') ? Number(url.searchParams.get('after')) : null;
      if (ids.length !== 1 || (after !== null && !Number.isSafeInteger(after))) throw new ServerInputError(400, 'invalid_cursor', 'Mốc tải không hợp lệ.');
      payload = await service.article(ids[0], after, url.searchParams.get('version') ?? '');
    } else throw new ServerInputError(400, 'invalid_action', 'Thao tác cập nhật không hợp lệ.');
    const response = json(payload);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  if (path === '/api/session' && request.method === 'GET') {
    return json(publicSession(session));
  }
  if (path === '/api/auth/session' && request.method === 'GET') {
    return json(adapterSessionShape(session));
  }
  if (path === '/api/auth/google' && request.method === 'GET') {
    const canonicalStartUrl = canonicalOAuthStartUrl(request, env);
    if (canonicalStartUrl) return redirect(canonicalStartUrl);
    const rateLimitFailure = await enforceOAuthStartRateLimit(request, env, requestId);
    if (rateLimitFailure) return rateLimitFailure;
    const result = await beginGoogleAuthorization(request, env);
    const headers = new Headers();
    headers.append('Set-Cookie', result.transactionCookie);
    return redirect(result.url, headers);
  }
  if (path === '/api/auth/google/start' && request.method === 'POST') {
    const originFailure = enforceLoginOrigin(request, env, requestId);
    if (originFailure) return originFailure;
    const rateLimitFailure = await enforceOAuthStartRateLimit(request, env, requestId);
    if (rateLimitFailure) return rateLimitFailure;
    const body = await readJson(request, 10_000);
    const requestUrl = new URL(request.url);
    if (typeof body.returnTo === 'string') requestUrl.searchParams.set('returnTo', body.returnTo);
    const result = await beginGoogleAuthorization(new Request(requestUrl, {
      method: 'GET',
      headers: request.headers,
    }), env);
    return json({ url: result.url }, 200, { 'Set-Cookie': result.transactionCookie });
  }
  if (path === '/api/auth/google/callback' && request.method === 'GET') {
    const result = await completeGoogleAuthorization(request, env);
    const headers = new Headers();
    headers.append('Set-Cookie', result.sessionCookie);
    headers.append('Set-Cookie', result.transactionCookie);
    return redirect(new URL(result.returnPath, env.APP_ORIGIN || request.url).toString(), headers);
  }
  if (path === '/api/auth/facebook/native' && request.method === 'GET') {
    const canonicalStartUrl = canonicalOAuthStartUrl(request, env);
    if (canonicalStartUrl) return redirect(canonicalStartUrl);
    const challenge = url.searchParams.get('challenge') || '';
    if (!validFacebookChallenge(challenge)) throw new OAuthError('facebook_challenge_invalid', 'Phiên đăng nhập không hợp lệ.', 400);
    const denied = await enforceOAuthStartRateLimit(request, env, requestId, 'facebook');
    if (denied) return denied;
    const result = await beginFacebookAuthorization(request, env, 'login', null, challenge);
    return redirect(result.url, new Headers({ 'Set-Cookie': result.transactionCookie }));
  }
  if (path === '/api/auth/facebook/native/redeem') {
    if (request.method !== 'POST') return methodNotAllowed(['POST'], requestId);
    const denied = enforceLoginOrigin(request, env, requestId);
    if (denied) return denied;
    const ipHash = await authClientIpHash(request, env);
    const rateDenied = await enforceAuthRateLimit(env, `facebook-redeem:ip:${ipHash}`, requestId);
    if (rateDenied) return rateDenied;
    const body = await readJson(request, 2_048);
    const result = await redeemFacebookHandoff(env, body.code, body.verifier);
    return json(result.payload, 200, { 'Set-Cookie': result.cookie });
  }
  if (path === '/api/auth/facebook' && request.method === 'GET') {
    const canonicalStartUrl = canonicalOAuthStartUrl(request, env);
    if (canonicalStartUrl) return redirect(canonicalStartUrl);
    const rateLimitFailure = await enforceOAuthStartRateLimit(request, env, requestId, 'facebook');
    if (rateLimitFailure) return rateLimitFailure;
    const result = await beginFacebookAuthorization(request, env, 'login', session);
    return redirect(result.url, new Headers({ 'Set-Cookie': result.transactionCookie }));
  }
  if (path === '/api/auth/facebook/start' && request.method === 'POST') {
    const originFailure = enforceLoginOrigin(request, env, requestId);
    if (originFailure) return originFailure;
    const rateLimitFailure = await enforceOAuthStartRateLimit(request, env, requestId, 'facebook');
    if (rateLimitFailure) return rateLimitFailure;
    const body = await readJson(request, 10_000);
    const requestUrl = new URL(request.url);
    if (typeof body.returnTo === 'string') requestUrl.searchParams.set('returnTo', body.returnTo);
    const result = await beginFacebookAuthorization(new Request(requestUrl, {
      method: 'GET', headers: request.headers,
    }), env, 'login', session);
    return json({ url: result.url }, 200, { 'Set-Cookie': result.transactionCookie });
  }
  if (path === '/api/auth/facebook/link/start') {
    if (request.method !== 'POST') return methodNotAllowed(['POST'], requestId);
    requireAuthentication(session);
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    const rateLimitFailure = await enforceOAuthStartRateLimit(request, env, requestId, 'facebook-link');
    if (rateLimitFailure) return rateLimitFailure;
    const body = await readJson(request, 10_000);
    const requestUrl = new URL(request.url);
    if (typeof body.returnTo === 'string') requestUrl.searchParams.set('returnTo', body.returnTo);
    const result = await beginFacebookAuthorization(new Request(requestUrl, {
      method: 'GET', headers: request.headers,
    }), env, 'link', session);
    return json({ url: result.url }, 200, { 'Set-Cookie': result.transactionCookie });
  }
  if (path === '/api/integrations/facebook/connect/start') {
    if (request.method !== 'POST') return methodNotAllowed(['POST'], requestId);
    requireCapability(session, 'admin:dashboard');
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    if (!facebookImportEnabled(env)) throw new ServerInputError(503, 'facebook_import_disabled', 'Nhập Facebook đang tắt.');
    if (!facebookConfigurationReady(env)) throw new ServerInputError(503, 'facebook_configuration_error', 'Facebook chưa được cấu hình.');
    const rateLimitFailure = await enforceOAuthStartRateLimit(request, env, requestId, 'facebook-connector');
    if (rateLimitFailure) return rateLimitFailure;
    const body = await readJson(request, 10_000);
    const requestUrl = new URL(request.url);
    requestUrl.searchParams.set('returnTo', typeof body.returnTo === 'string' ? body.returnTo : '/admin/settings');
    const result = await beginFacebookAuthorization(new Request(requestUrl, {
      method: 'GET', headers: request.headers,
    }), env, 'connector', session);
    return json({ url: result.url }, 200, { 'Set-Cookie': result.transactionCookie });
  }
  if (path === '/api/auth/facebook/callback' && request.method === 'GET') {
    const result = await completeFacebookAuthorization(request, env, session);
    const headers = new Headers();
    if (result.sessionCookie) headers.append('Set-Cookie', result.sessionCookie);
    headers.append('Set-Cookie', result.transactionCookie);
    if (result.nativeCallbackUrl) return redirect(result.nativeCallbackUrl, headers);
    const destination = new URL(result.returnPath, env.APP_ORIGIN || request.url);
    destination.searchParams.set('facebook', result.outcome);
    return redirect(destination.toString(), headers);
  }
  if (path === '/api/auth/logout') {
    if (request.method !== 'POST') return methodNotAllowed(['POST'], requestId);
    requireAuthentication(session);
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    let preserveSessionCookie = false;
    if (request.body) {
      try {
        preserveSessionCookie = (await readJson(request, 32_768)).preserveSessionCookie === true;
      } catch {
        // Legacy logout ignores its body, including malformed or oversized JSON.
      }
    }
    await revokeSession(env, session);
    // A delayed response for A must not expire a newer B cookie for opted-in clients.
    return json({ authenticated: false }, 200, preserveSessionCookie ? {} : { 'Set-Cookie': clearSessionCookie(env) });
  }

  if (path === '/api/auth/delete-account') {
    if (request.method !== 'POST') return methodNotAllowed(['POST'], requestId);
    requireAuthentication(session);
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;

    const authorization = request.body ? await readJson(request, 32_768) : {};
    for (const key of ['appleIdentityToken', 'appleAuthorizationCode']) {
      if (authorization[key] !== undefined && (typeof authorization[key] !== 'string'
        || !(authorization[key] as string).trim() || (authorization[key] as string).length > 16_384)) {
        throw new ServerInputError(400, 'invalid_field', 'Thông tin xác thực Apple không hợp lệ.');
      }
    }
    await deleteAccount(env, session, authorization);
    return json({ deleted: true, authenticated: false }, 200, authorization.preserveSessionCookie === true ? {} : { 'Set-Cookie': clearSessionCookie(env) });
  }

  if (path === '/api/admin/talks/drive-scan') {
    if (request.method !== 'POST') return methodNotAllowed(['POST'], requestId);
    requireCapability(session, 'talks:drive-scan');
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    return denied || json(await scanGoogleDriveTalks(request, env));
  }

  if (path === '/api/admin/dashboard') {
    if (request.method !== 'GET') return methodNotAllowed(['GET'], requestId);
    requireCapability(session, 'admin:dashboard');
    return json(await createAdminDashboardService(context).getDashboard(Date.now(), url.searchParams.get('range')));
  }

  if (path === '/api/admin/analytics') {
    if (request.method !== 'GET') return methodNotAllowed(['GET'], requestId);
    requireCapability(session, 'admin:dashboard');
    return json(await createAdminAnalyticsService(context).getAnalytics(url.searchParams.get('range')));
  }

  const moderationMatch = path.match(/^\/api\/admin\/community\/moderation(?:\/([^/]+)\/([^/]+))?$/u);
  if (moderationMatch) {
    requireCapability(session, 'admin:dashboard');
    const service = createAdminCommunityModerationService(context);
    if (!moderationMatch[1]) {
      if (request.method !== 'GET') return methodNotAllowed(['GET'], requestId);
      return json(await service.list(url.searchParams.get('kind'), {
        after: url.searchParams.get('after'), limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined,
      }));
    }
    if (request.method !== 'PATCH') return methodNotAllowed(['PATCH'], requestId);
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    return json(await service.decide(decodeURIComponent(moderationMatch[1]), decodeURIComponent(moderationMatch[2]), await readJson(request, 8_000)));
  }

  if (path === '/api/practice/personal-settings') {
    requireAppUser(session);
    const service = createPersonalSettingsService(context);
    if (request.method === 'GET') return json(await service.read(), 200, { 'Cache-Control': 'no-store' });
    if (request.method !== 'PUT') return methodNotAllowed(['GET', 'PUT'], requestId);
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    if (!await checkRateLimit((env as unknown as Record<string, unknown>).COMMENT_RATE_LIMITER as { limit: (input: { key: string }) => Promise<{ success?: boolean }> } | undefined,
      await sha256(`${env.RATE_LIMIT_SALT || ''}:personal-settings:${session.appUserId}`))) {
      return apiError(429, 'rate_limited', 'Thử lại sau ít phút.', requestId);
    }
    return json(await service.write(await readJson(request, 92_000)), 200, { 'Cache-Control': 'no-store' });
  }

  if (path === '/api/notifications/state') {
    if (request.method === 'GET') return json(session ? await getNotificationState(context, session) : { collapsedDate: null, readIds: [] }, 200, { 'Cache-Control': 'no-store' });
    if (request.method !== 'PUT') return methodNotAllowed(['GET', 'PUT'], requestId);
    if (!session) return json({ ok: false }, 200, { 'Cache-Control': 'no-store' });
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    await saveNotificationState(context, session, await readJson(request, 20_000));
    return json({ ok: true }, 200, { 'Cache-Control': 'no-store' });
  }

  if (path === '/api/notifications/read-state') {
    requireAppUser(session);
    const service = createNotificationReadStateService(context);
    if (request.method === 'GET') return json(await service.read(url.searchParams.get('ids')), 200, { 'Cache-Control': 'no-store' });
    if (request.method !== 'POST') return methodNotAllowed(['GET', 'POST'], requestId);
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    if (!await checkRateLimit((env as unknown as Record<string, unknown>).COMMENT_RATE_LIMITER as { limit: (input: { key: string }) => Promise<{ success?: boolean }> } | undefined,
      await sha256(`${env.RATE_LIMIT_SALT || ''}:notification-read:${session.appUserId}`))) {
      return apiError(429, 'rate_limited', 'Thử lại sau ít phút.', requestId);
    }
    return json(await service.write(await readJson(request, 16_000)), 200, { 'Cache-Control': 'no-store' });
  }

  if (path === '/api/practice/mindful-notifications') {
    if (request.method !== 'GET') return methodNotAllowed(['GET'], requestId);
    requireAppUser(session);
    return json(await createMindfulCommunityService(context).notifications(url.searchParams.get('after')),
      200, { 'Cache-Control': 'no-store' });
  }
  const mindfulMatch = path.match(/^\/api\/practice\/mindful-posts(?:\/([^/]+)(\/reactions)?)?$/u);
  if (mindfulMatch) {
    const service = createMindfulCommunityService(context);
    const postId = mindfulMatch[1] ? decodeURIComponent(mindfulMatch[1]) : null;
    const reactions = Boolean(mindfulMatch[2]);
    if (request.method === 'GET') {
      return json(postId ? reactions ? await service.reactions(postId, url.searchParams.get('after')) : await service.get(postId, url.searchParams.get('reactionId'))
        : await service.list(url.searchParams.get('kind'), url.searchParams.get('mine') === '1', url.searchParams.get('after'), url.searchParams.get('period')),
      200, { 'Cache-Control': 'no-store' });
    }
    const allowed = !postId || reactions ? ['GET', 'POST'] : ['GET', 'DELETE'];
    if (!allowed.includes(request.method)) return methodNotAllowed(allowed, requestId);
    requireAppUser(session);
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    if (!await checkRateLimit((env as unknown as Record<string, unknown>).COMMENT_RATE_LIMITER as { limit: (input: { key: string }) => Promise<{ success?: boolean }> } | undefined,
      await sha256(`${env.RATE_LIMIT_SALT || ''}:mindful:${session.appUserId}`))) {
      return apiError(429, 'rate_limited', 'Thử lại sau ít phút.', requestId);
    }
    if (request.method === 'DELETE' && postId) return json(await service.remove(postId), 200, { 'Cache-Control': 'no-store' });
    const input = await readJson(request, 16_000);
    return json(postId ? await service.react(postId, input) : await service.create(input), 200, { 'Cache-Control': 'no-store' });
  }

  const blockMatch = path.match(/^\/api\/community\/blocks\/([^/]+)$/u);
  if (path === '/api/community/profile' || path === '/api/community/blocks' || path === '/api/community/reports' || blockMatch) {
    requireAppUser(session);
    const service = createCommunityModerationService(context);
    if (request.method === 'GET' && path === '/api/community/profile') return json(await service.getOwnProfile());
    if (request.method === 'GET' && path === '/api/community/blocks') return json(await service.listBlocks({
      after: url.searchParams.get('after'), limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined,
    }));
    const allowed = blockMatch ? ['PUT', 'DELETE'] : path === '/api/community/blocks' ? ['GET']
      : path === '/api/community/profile' ? ['GET', 'POST'] : ['POST'];
    if (!allowed.includes(request.method) || request.method === 'GET') return methodNotAllowed(allowed, requestId);
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    if (!await checkRateLimit((env as unknown as Record<string, unknown>).COMMENT_RATE_LIMITER as { limit: (input: { key: string }) => Promise<{ success?: boolean }> } | undefined, await sha256(`${env.RATE_LIMIT_SALT || ''}:community:${session.appUserId}`))) {
      return apiError(429, 'rate_limited', 'Thử lại sau ít phút.', requestId);
    }
    if (blockMatch) return json(await service[request.method === 'DELETE' ? 'unblock' : 'block'](decodeURIComponent(blockMatch[1])));
    if (path === '/api/community/reports') return json(await service.report(await readJson(request, 8_000)));
    return json(await service.submitOwnProfile());
  }

  if (path === '/api/admin/community') {
    if (request.method !== 'GET') return methodNotAllowed(['GET'], requestId);
    requireCapability(session, 'admin:dashboard');
    return json(await createAdminCommunityService(context).getCommunity(url.searchParams.get('period')));
  }

  if (path === '/api/admin/practice-participation') {
    if (request.method !== 'GET') return methodNotAllowed(['GET'], requestId);
    requireCapability(session, 'admin:dashboard');
    const service = createPracticeParticipationService(context);
    const owner = url.searchParams.get('owner');
    return json(owner ? await service.detail(owner) : await service.list(url.searchParams));
  }

  if (path === '/api/practice/participation') {
    if (request.method !== 'POST') return methodNotAllowed(['POST'], requestId);
    requireAppUser(session);
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    const limited = await checkRateLimit(env.AUTH_RATE_LIMITER, `participation:${session.appUserId}`);
    if (!limited) return apiError(429, 'rate_limited', 'Thử lại sau ít phút.', requestId);
    return json(await createPracticeParticipationService(context).record(await readJson(request, 6_000)));
  }

  if (path === '/api/admin/members') {
    if (request.method !== 'GET') return methodNotAllowed(['GET'], requestId);
    requireCapability(session, 'members:manage');
    return json(await createAdminMembersService(env, session).listMembers());
  }

  if (path === '/api/admin/notifications') {
    if (request.method !== 'GET') return methodNotAllowed(['GET'], requestId);
    requireCapability(session, 'notifications:read');
    return json(await getAdminNotifications(context));
  }

  if (path === '/api/admin/facebook') {
    requireCapability(session, 'admin:dashboard');
    const service = createFacebookIntegrationService(env);
    if (request.method === 'GET') return json(await service.getAdminData(session, {
      importOffset: Number(url.searchParams.get('importOffset') || 0),
      importLimit: Number(url.searchParams.get('importLimit') || 50),
    }));
    if (request.method === 'PATCH') {
      const denied = enforceSameOriginMutation(request, env, session, requestId);
      if (denied) return denied;
      return json({ settings: await service.updateSettings(session, await readJson(request, 10_000)) });
    }
    if (request.method === 'DELETE') {
      const denied = enforceSameOriginMutation(request, env, session, requestId);
      if (denied) return denied;
      await service.disconnect(session);
      return new Response(null, { status: 204 });
    }
    return methodNotAllowed(['GET', 'PATCH', 'DELETE'], requestId);
  }

  if (path === '/api/admin/facebook/sync') {
    if (request.method !== 'POST') return methodNotAllowed(['POST'], requestId);
    requireCapability(session, 'admin:dashboard');
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    return json({ summary: await createFacebookIntegrationService(env).syncForAdmin(session) });
  }

  const facebookImportAction = path.match(/^\/api\/admin\/facebook\/imports\/([^/]+)\/(publish|review|detach|remove|retry)$/u);
  if (facebookImportAction) {
    if (request.method !== 'POST') return methodNotAllowed(['POST'], requestId);
    requireCapability(session, 'admin:dashboard');
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    await createFacebookIntegrationService(env).manageImport(
      session,
      decodeURIComponent(facebookImportAction[1]),
      facebookImportAction[2],
    );
    return json({ ok: true });
  }

  if (path === '/api/phap-bao' && request.method === 'GET') {
    return json({ items: await listPublicPhapBaoItems(env) });
  }

  if (path === '/api/phap-bao/claim' && request.method === 'POST') {
    const denied = enforcePublicWriteOrigin(request, env, requestId);
    if (denied) return denied;
    const body = await readJson(request, 10_000);
    if (session?.appUserId) {
      const record = await recordPhapBaoClaim(env, session.appUserId, body);
      return json({ success: true, recorded: true, record });
    }
    return json({ success: true, recorded: false });
  }

  if (path === '/api/phap-bao/history' && request.method === 'GET') {
    requireAuthentication(session);
    return json({ history: await getUserPhapBaoHistory(env, session.appUserId!) });
  }

  if (path === '/api/admin/phap-bao') {
    if (request.method === 'GET') {
      requireCapability(session, 'admin:dashboard');
      return json({ items: await listPublicPhapBaoItems(env) });
    }
    if (request.method === 'POST') {
      requireCapability(session, 'admin:dashboard');
      const denied = enforceSameOriginMutation(request, env, session, requestId);
      if (denied) return denied;
      const body = await readJson(request, 20_000);
      const item = await createPhapBaoItem(env, body);
      return json({ item }, 201);
    }
    return methodNotAllowed(['GET', 'POST'], requestId);
  }

  if (path === '/api/admin/phap-bao/link-shopee') {
    if (request.method === 'PUT') {
      requireCapability(session, 'admin:dashboard');
      const denied = enforceSameOriginMutation(request, env, session, requestId);
      if (denied) return denied;
      const body = await readJson(request, 10_000);
      const linkShopee = typeof body === 'object' && body !== null && 'link_shopee' in body
        ? String((body as Record<string, unknown>).link_shopee ?? '')
        : '';
      const result = await updateCampaignShopeeLink(env, linkShopee);
      return json({ success: true, linkShopee: result.linkShopee });
    }
    return methodNotAllowed(['PUT'], requestId);
  }

  if (path.startsWith('/api/admin/phap-bao/')) {
    const itemId = decodeURIComponent(path.replace('/api/admin/phap-bao/', ''));
    if (request.method === 'PUT') {
      requireCapability(session, 'admin:dashboard');
      const denied = enforceSameOriginMutation(request, env, session, requestId);
      if (denied) return denied;
      const body = await readJson(request, 20_000);
      const item = await updatePhapBaoItem(env, itemId, body);
      return json({ item });
    }
    if (request.method === 'DELETE') {
      requireCapability(session, 'admin:dashboard');
      const denied = enforceSameOriginMutation(request, env, session, requestId);
      if (denied) return denied;
      await deletePhapBaoItem(env, itemId);
      return json({ success: true });
    }
    return methodNotAllowed(['PUT', 'DELETE'], requestId);
  }


  if (path === '/api/meta/deauthorize' || path === '/api/meta/data-deletion') {
    if (request.method !== 'POST') return methodNotAllowed(['POST'], requestId);
    const signedRequest = await readSignedRequest(request);
    return json(await createFacebookIntegrationService(env).handleSignedCallback(
      signedRequest,
      path.endsWith('data-deletion') ? 'data-deletion' : 'deauthorize',
      request.url,
    ));
  }

  if (path === '/api/meta/data-deletion/status') {
    if (request.method !== 'GET') return methodNotAllowed(['GET'], requestId);
    return json(await createFacebookIntegrationService(env).deletionStatus(url.searchParams.get('code') || ''));
  }

  const adminMemberMatch = path.match(/^\/api\/admin\/members\/([^/]+)$/u)
    ?? path.match(/^\/api\/admin\/members\/google\/([^/]+)$/u);
  if (adminMemberMatch) {
    if (!['PATCH', 'DELETE'].includes(request.method)) return methodNotAllowed(['PATCH', 'DELETE'], requestId);
    requireCapability(session, 'members:manage');
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    const service = createAdminMembersService(env, session);
    const id = decodeURIComponent(adminMemberMatch[1]);
    if (request.method === 'DELETE') {
      const isMobile = request.headers.get('sec-ch-ua-mobile') === '?1'
        || /iPad|Tablet|Nexus 7|Nexus 10|SM-T|Mobi|iPhone|Android/i.test(request.headers.get('user-agent') || '');
      if (isMobile) {
        throw new ServerInputError(
          403,
          'mobile_delete_forbidden',
          'Không được phép xoá thành viên trên thiết bị di động để bảo vệ an toàn dữ liệu tu tập. Vui lòng thực hiện trên máy tính hoặc sử dụng tính năng Đình chỉ tài khoản.',
        );
      }
      await service.remove(id);
      return new Response(null, { status: 204 });
    }
    return json({ member: await service.update(id, await readJson(request, 20_000)) });
  }

  if (path === '/api/app/stats') {
    if (request.method !== 'GET') return methodNotAllowed(['GET'], requestId);
    return handleAppStatsRequest(env);
  }

  if (path === '/api/thanh-tinh/stats') {
    if (request.method !== 'GET') return methodNotAllowed(['GET'], requestId);
    const service = createThanhTinhService(context);
    const publicHeaders = { 'Cache-Control': 'public, max-age=300, s-maxage=600' };
    return json(await service.getStats(), 200, publicHeaders);
  }

  if (path === '/api/thanh-tinh/pledge') {
    if (request.method !== 'POST') return methodNotAllowed(['POST'], requestId);
    const denied = enforcePublicWriteOrigin(request, env, requestId, session);
    if (denied) return denied;
    const body = await readJson(request, 20_000).catch(() => ({} as Record<string, unknown>));
    const bodyClientId = typeof body?.clientId === 'string' && body.clientId.trim().length >= 8
      ? body.clientId.trim().slice(0, 100)
      : null;
    const identitySeed = session?.appUserId
      ? `user:${session.appUserId}`
      : (bodyClientId ? `client:${bodyClientId}` : `ip:${clientAddressHashInput(request)}`);
    const clientKey = `${env.RATE_LIMIT_SALT || ''}:${identitySeed}`;
    const anonIdHash = await sha256(clientKey);
    const service = createThanhTinhService(context);
    return json(await service.recordPledge({
      anonIdHash,
      userId: session?.appUserId || null,
      displayName: session?.displayName || (typeof body?.displayName === 'string' ? body.displayName : undefined),
      email: (session?.email ?? undefined) || (typeof body?.email === 'string' ? body.email : undefined)
    }));
  }

  // Daily batch sync (called once per day when user checks in to minimize server requests)
  if (path === '/api/thanh-tinh/sync') {
    if (request.method !== 'POST') return methodNotAllowed(['POST'], requestId);
    const denied = enforcePublicWriteOrigin(request, env, requestId, session);
    if (denied) return denied;
    const body = await readJson(request, 20_000).catch(() => ({} as Record<string, unknown>));
    const bodyClientId = typeof body?.clientId === 'string' && body.clientId.trim().length >= 8
      ? body.clientId.trim().slice(0, 100)
      : null;
    const identitySeed = session?.appUserId
      ? `user:${session.appUserId}`
      : (bodyClientId ? `client:${bodyClientId}` : `ip:${clientAddressHashInput(request)}`);
    const clientKey = `${env.RATE_LIMIT_SALT || ''}:${identitySeed}`;
    const anonIdHash = await sha256(clientKey);
    const service = createThanhTinhService(context);
    return json(await service.syncDailyProgress({
      anonIdHash,
      streakDays: Number(body?.streakDays || 0),
      resistedDelta: Number(body?.resistedDelta || 0)
    }));
  }

  // QTV Admin view (strictly protected, normal users cannot access)
  if (path === '/api/admin/thanh-tinh/participants') {
    if (request.method !== 'GET') return methodNotAllowed(['GET'], requestId);
    requireCapability(session, 'admin:dashboard');
    const service = createThanhTinhService(context);
    return json(await service.listParticipantsForAdmin());
  }

  if (path === '/api/practice/copying') {
    requireAppUser(session);
    const service = createCopyingService(env, session.appUserId);
    if (request.method === 'GET') {
      const sutra = url.searchParams.get('sutra') ?? '';
      const chapter = Number(url.searchParams.get('chapter'));
      const run = url.searchParams.get('run');
      if (run) return json({ copy: await service.read(sutra, chapter, run) });
      const copies = await service.list(sutra, chapter, url.searchParams.get('cursor') ?? '');
      const last = copies.at(-1);
      return json({ copies, nextCursor: copies.length === 20 && last ? `${last.savedAt}~${last.runId}` : null });
    }
    if (request.method === 'PUT') {
      const denied = enforceSameOriginMutation(request, env, session, requestId);
      if (denied) return denied;
      if (!await checkRateLimit(env.AUTH_RATE_LIMITER, `copying:${session.appUserId}`)) {
        return apiError(429, 'rate_limited', 'Vui lòng chờ rồi bấm lưu lại.', requestId);
      }
      return json(await service.save(await readJson(request, 550_000)));
    }
    return methodNotAllowed(['GET', 'PUT'], requestId);
  }

  if (path === '/api/personal-events') {
    requireAppUser(session);
    if (request.method === 'GET') {
      return json(await readPersonalEvents(env, session.appUserId), 200, { 'Cache-Control': 'no-store' });
    }
    if (request.method === 'POST') {
      const origin = request.headers.get('origin');
      // Old mobile releases send JSON through native HTTP without Origin/CSRF.
      // Keep that non-browser path while new clients always send a real token.
      // Browser cross-site and simple form requests cannot use this fallback.
      if (request.headers.has('x-csrf-token')) {
        const denied = enforceSameOriginMutation(request, env, session, requestId);
        if (denied) return denied;
      } else if ((origin && !isAllowedOrigin(origin, request, env)) ||
          request.headers.get('sec-fetch-site') === 'cross-site' ||
          (!origin && request.headers.has('sec-fetch-site'))) {
        return apiError(403, 'invalid_origin', 'Nguồn yêu cầu không hợp lệ.', requestId);
      }
      const body = await readJson(request, 100_000);
      return json(await writePersonalEvents(env, session.appUserId, body), 200, { 'Cache-Control': 'no-store' });
    }
    return methodNotAllowed(['GET', 'POST'], requestId);
  }

  if (path === '/api/downloads/access') {
    if (request.method !== 'POST') return methodNotAllowed(['POST'], requestId);
    requireCapability(session, 'downloads:use');
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    return denied || json({ allowed: true, role: session.role });
  }

  if (path === '/api/presence') {
    if (request.method !== 'POST') return methodNotAllowed(['POST'], requestId);
    const denied = enforcePublicWriteOrigin(request, env, requestId, session);
    if (denied) return denied;
    const body = await readJson(request, 2_000);
    const location = cloudflareLocation(request);
    return json(await createPresenceService(context).heartbeat({
      visitorId: typeof body.visitorId === 'string' ? body.visitorId : '',
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : '',
      pageviewId: typeof body.pageviewId === 'string' ? body.pageviewId : '',
      source: typeof body.source === 'string' ? body.source : '',
      clientAddress: clientAddressHashInput(request),
      currentPath: typeof body.currentPath === 'string' ? body.currentPath : '/',
      countryCode: location.countryCode,
      regionCode: location.regionCode,
      city: location.city,
      userAgent: request.headers.get('user-agent'),
      practiceVisible: body.practiceVisible === true,
      practiceActivity: typeof body.practiceActivity === 'string' ? body.practiceActivity : null,
      practiceStartedAt: typeof body.practiceStartedAt === 'number' ? body.practiceStartedAt : null,
    }));
  }

  const albumDownloadSizeMatch = path.match(/^\/api\/talks\/([^/]+)\/download-size$/u);
  if (albumDownloadSizeMatch) {
    if (request.method !== 'GET') return methodNotAllowed(['GET'], requestId);
    return json(await createTalksService(context).readAlbumDownloadSize(albumDownloadSizeMatch[1]), 200, {
      'Cache-Control': 'no-store',
    });
  }

  const driveAudioMatch = path.match(/^\/api\/audio\/drive\/([^/]+)$/u);
  if (driveAudioMatch) {
    if (!['GET', 'HEAD'].includes(request.method)) return methodNotAllowed(['GET', 'HEAD'], requestId);
    return createTalksService(context).getGoogleDriveAudio(driveAudioMatch[1], request);
  }

  const dataMatch = path.match(/^\/api\/data\/([a-z_]+)$/u);
  if (dataMatch) {
    if (dataMatch[1] === 'binh_luan' && request.method === 'GET') {
      return json(await createArticlesService(context).selectTable('binh_luan', {
        select: url.searchParams.get('select') || '*',
        filters: Object.fromEntries(url.searchParams.entries()), order: url.searchParams.get('order'),
        limit: Number(url.searchParams.get('limit') || 500), offset: Number(url.searchParams.get('offset') || 0),
      }));
    }
    if (dataMatch[1] === 'luot_xem' && request.method === 'POST') {
      const denied = enforcePublicWriteOrigin(request, env, requestId, session);
      if (denied) return denied;
      const body = await readJson(request, 20_000);
      const articleId = String(body.bai_viet_id || '').trim();
      if (!articleId) {
        throw new ServerInputError(400, 'invalid_field', 'bai_viet_id là bắt buộc.');
      }
      const key = `${env.RATE_LIMIT_SALT || ''}:${articleId}:${clientAddressHashInput(request)}`;
      if (!await checkRateLimit(
        (env as unknown as Record<string, unknown>).VIEW_RATE_LIMITER as {
          limit: (input: { key: string }) => Promise<{ success?: boolean }>;
        } | undefined,
        await sha256(key),
      )) {
        return apiError(429, 'rate_limited', 'Thử lại sau ít phút.', requestId);
      }
      return json([await incrementView(env, articleId)]);
    }
    const denied = await guardDataMutation(request, env, session, requestId, dataMatch[1]);
    if (denied) return denied;
    if (dataMatch[1] === 'binh_luan' && request.method === 'POST') {
      return json(await createCommunityModerationService(context).submitLegacyComments(await readResourceJson(request)), 201);
    }
    if ((dataMatch[1] === 'baiviet' || dataMatch[1] === 'tap_noi_dung')
      && ['POST', 'PATCH', 'DELETE'].includes(request.method)) {
      const service = createArticlesService(context);
      const filters = Object.fromEntries(new URL(request.url).searchParams.entries());
      if (request.method === 'POST') {
        return json(await service.insertTable(
          dataMatch[1],
          await readResourceJson(request),
          { onConflict: url.searchParams.get('on_conflict') || request.headers.get('x-upsert-key') },
        ));
      }
      return json(request.method === 'PATCH'
        ? await service.updateTable(dataMatch[1], await readJson(request), filters)
        : await service.deleteTable(dataMatch[1], filters));
    }
    if (dataMatch[1] === 'phap_thoai') {
      if (['POST', 'PATCH'].includes(request.method)) requireCapability(session, 'talks:write');
      if (request.method === 'DELETE') requireCapability(session, 'talks:delete');
      await enforceTalkArchivePolicy(request, env);
    }
    const data = await legacyHandleData(request, env, session, dataMatch[1]);
    const table = dataMatch[1];
    const detailFilter = table === 'baiviet' ? url.searchParams.get('id')
      : table === 'tap_noi_dung' ? url.searchParams.get('bai_viet_id') : null;
    const sameOrigin = !request.headers.get('origin') || request.headers.get('origin') === url.origin;
    // Receipt dùng đúng phiên đã kiểm quyền cho legacy read, không thêm SQL.
    const identity = session?.userId
      ? `${encodeURIComponent(session.userId)}:${session.role}` : 'anonymous:guest';
    return json(data, 200, request.method === 'GET' && sameOrigin && detailFilter?.startsWith('eq.')
      ? { 'X-Practice-Content-Identity': identity, 'Cache-Control': 'private, no-store' } : {});
  }

  const resource = resourceDataRoute(path);
  if (resource) {
    if (!resource.methods.includes(request.method)) return methodNotAllowed(resource.methods, requestId);
    return handleResourceRequest(resource.table, request, env, session, requestId, context, resource.filters);
  }

  const viewMatch = path.match(/^\/api\/articles\/([^/]+)\/views$/u);
  if (viewMatch && request.method === 'POST') {
    const denied = enforcePublicWriteOrigin(request, env, requestId, session);
    if (denied) return denied;
    const key = `${env.RATE_LIMIT_SALT || ''}:${decodeURIComponent(viewMatch[1])}:${clientAddressHashInput(request)}`;
      if (!await checkRateLimit((env as unknown as Record<string, unknown>).VIEW_RATE_LIMITER as { limit: (input: { key: string }) => Promise<{ success?: boolean }> } | undefined, await sha256(key))) {
      return apiError(429, 'rate_limited', 'Thử lại sau ít phút.', requestId);
    }
    return json(await incrementView(env, decodeURIComponent(viewMatch[1])));
  }

  if (path === '/api/album-plays') {
    if (request.method !== 'GET') return methodNotAllowed(['GET'], requestId);
    return json(await listAlbumPlays(env), 200, { 'Cache-Control': 'public, max-age=30, s-maxage=30' });
  }
  const playMatch = path.match(/^\/api\/talks\/([^/]+)\/plays$/u);
  if (playMatch) {
    if (request.method !== 'POST') return methodNotAllowed(['POST'], requestId);
    const denied = enforcePublicWriteOrigin(request, env, requestId, session);
    if (denied) return denied;
    const listener = session?.appUserId || `${clientAddressHashInput(request)}:${request.headers.get('user-agent') || ''}`;
    const listenerHash = await sha256(`${env.RATE_LIMIT_SALT || ''}:album:${listener}`);
    if (!await checkRateLimit((env as unknown as Record<string, unknown>).VIEW_RATE_LIMITER as { limit: (input: { key: string }) => Promise<{ success?: boolean }> } | undefined, listenerHash)) {
      return apiError(429, 'rate_limited', 'Thử lại sau ít phút.', requestId);
    }
    const playback = await readJson(request, 8_000);
    return json(await recordAlbumPlay(env, decodeURIComponent(playMatch[1]), playback));
  }

  const commentMatch = path.match(/^\/api\/articles\/([^/]+)\/comments$/u);
  if (commentMatch) {
    const articleId = decodeURIComponent(commentMatch[1]);
    if (request.method === 'GET') {
      const rawAfter = new URL(request.url).searchParams.get('after');
      const after = rawAfter === null ? null : Number(rawAfter);
      if (after !== null && (!Number.isSafeInteger(after) || after < 1)) return apiError(400, 'invalid_cursor', 'Invalid comment cursor', requestId);
      const comments = await createCommunityModerationService(context).listComments(articleId, {
        after, includeOwn: url.searchParams.get('includeOwn') === '1',
      });
      return json(comments, 200, { 'X-Next-Cursor': comments.length === 50 ? String(comments.at(-1)!.id) : '' });
    }
    if (request.method === 'POST') {
      requireAuthentication(session);
      const denied = enforceSameOriginMutation(request, env, session, requestId);
      if (denied) return denied;
      const key = `${env.RATE_LIMIT_SALT || ''}:${articleId}:${session.userId || clientAddressHashInput(request)}`;
      if (!await checkRateLimit((env as unknown as Record<string, unknown>).COMMENT_RATE_LIMITER as { limit: (input: { key: string }) => Promise<{ success?: boolean }> } | undefined, await sha256(key))) {
        return apiError(429, 'rate_limited', 'Thử lại sau ít phút.', requestId);
      }
      return json(await createCommunityModerationService(context).submitComment(articleId, await readJson(request, 20_000)), 201);
    }
    return methodNotAllowed(['GET', 'POST'], requestId);
  }

  if (path === '/api/practice/sessions') {
    requireAppUser(session);
    const service = createPracticeSessionsService(context);
    if (request.method === 'GET') {
      return json(await service.list(url.searchParams.get('from'), url.searchParams.get('limit')));
    }
    if (request.method !== 'POST') return methodNotAllowed(['GET', 'POST'], requestId);
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    const result = await service.start(await readJson(request, 20_000));
    return json(result, result.created ? 201 : 200);
  }

  const practiceCompletionMatch = path.match(/^\/api\/practice\/sessions\/([^/]+)\/complete$/u);
  if (practiceCompletionMatch) {
    if (request.method !== 'POST') return methodNotAllowed(['POST'], requestId);
    requireAppUser(session);
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    return json(await createPracticeSessionsService(context).complete(
      decodeURIComponent(practiceCompletionMatch[1]),
      await readJson(request, 20_000),
    ));
  }

  if (path === '/api/practice/summary') {
    if (request.method !== 'GET') return methodNotAllowed(['GET'], requestId);
    requireAppUser(session);
    return json(await createPracticeSessionsService(context).summary(url.searchParams.get('from')));
  }

  if (path === '/api/reading/progress') {
    requireAppUser(session);
    const service = createReadingActivityService(context);
    if (request.method === 'GET') return json(await service.listProgress(url.searchParams.get('limit')));
    if (!['PUT', 'DELETE'].includes(request.method)) return methodNotAllowed(['GET', 'PUT', 'DELETE'], requestId);
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    const body = await readJson(request, 50_000);
    return json(request.method === 'PUT'
      ? await service.writeProgress(body)
      : await service.deleteProgress(body));
  }

  const readingProgressMatch = path.match(/^\/api\/reading\/progress\/([^/]+)\/([^/]+)$/u);
  if (readingProgressMatch) {
    if (request.method !== 'GET') return methodNotAllowed(['GET'], requestId);
    requireAppUser(session);
    return json(await createReadingActivityService(context).getProgress(
      decodeURIComponent(readingProgressMatch[1]),
      decodeURIComponent(readingProgressMatch[2]),
    ));
  }

  if (path === '/api/reading/annotations') {
    requireAppUser(session);
    const service = createReadingActivityService(context);
    if (request.method === 'GET') {
      return json(await service.listAnnotations({
        contentKind: url.searchParams.get('contentKind'),
        contentId: url.searchParams.get('contentId'),
        cursor: url.searchParams.get('cursor'),
        limit: url.searchParams.get('limit'),
      }));
    }
    if (request.method !== 'POST') return methodNotAllowed(['GET', 'POST'], requestId);
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    const result = await service.createAnnotation(await readJson(request, 50_000));
    return json(result, result.created ? 201 : 200);
  }

  const readingAnnotationMatch = path.match(/^\/api\/reading\/annotations\/([^/]+)$/u);
  if (readingAnnotationMatch) {
    requireAppUser(session);
    const annotationId = decodeURIComponent(readingAnnotationMatch[1]);
    const service = createReadingActivityService(context);
    if (request.method === 'GET') return json(await service.getAnnotation(annotationId));
    if (!['PATCH', 'DELETE'].includes(request.method)) return methodNotAllowed(['GET', 'PATCH', 'DELETE'], requestId);
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    return json(request.method === 'PATCH'
      ? await service.updateAnnotation(annotationId, await readJson(request, 50_000))
      : await service.deleteAnnotation(annotationId));
  }

  if (path === '/api/practice/completed-logs') {
    requireAppUser(session);
    if (request.method !== 'POST') return methodNotAllowed(['POST'], requestId);
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    requirePublicPracticeCommunity(env);
    return json(await createPracticeCommunityService(context).recordCompletedLogs(await readJson(request, 200_000)));
  }

  if (path === '/api/practice/progress') {
    requireAppUser(session);
    const service = createPracticeCommunityService(context);
    if (request.method === 'GET') return json(await service.privateProgress());
    if (request.method !== 'PATCH') return methodNotAllowed(['GET', 'PATCH'], requestId);
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    return json(await service.updateProfile(await readJson(request, 20_000)));
  }

  if (path === '/api/practice/leaderboard') {
    if (request.method !== 'GET') return methodNotAllowed(['GET'], requestId);
    if (!publicPracticeCommunityEnabled(env)) {
      return json({
        enabled: false,
        generatedAt: new Date().toISOString(),
        metric: {
          key: 'accepted_count',
          windowDays: 30,
          description: 'Bảng xếp hạng cộng đồng đang tạm dừng.',
        },
        ranking: [],
      });
    }
    return json(await createPracticeCommunityService(context).leaderboard());
  }

  if (path === '/api/practice/campaigns') {
    const service = createPracticeCommunityService(context);
    if (request.method === 'GET') {
      const includeDrafts = url.searchParams.get('includeDrafts') === '1';
      if (includeDrafts) requireCapability(session, 'admin:dashboard');
      if (!includeDrafts && !publicPracticeCommunityEnabled(env)) {
        return json({ enabled: false, campaigns: [] });
      }
      return json(await service.listCampaigns(includeDrafts));
    }
    if (request.method !== 'POST') return methodNotAllowed(['GET', 'POST'], requestId);
    requireCapability(session, 'admin:dashboard');
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    return json(await service.createCampaign(await readJson(request, 20_000)), 201);
  }

  const campaignActionMatch = path.match(/^\/api\/practice\/campaigns\/([^/]+)(?:\/(join|membership|members|contribute))?$/u);
  if (campaignActionMatch) {
    const campaignId = decodeURIComponent(campaignActionMatch[1]);
    const action = campaignActionMatch[2] ?? null;
    const service = createPracticeCommunityService(context);
    if (action === 'contribute') {
      if (request.method === 'POST') {
        requireAppUser(session);
        const denied = enforceSameOriginMutation(request, env, session, requestId);
        if (denied) return denied;
        requirePublicPracticeCommunity(env);
        return json(await service.contributeManualLog(campaignId, await readJson(request, 20_000)));
      }
      if (request.method === 'DELETE') {
        requireAppUser(session);
        const denied = enforceSameOriginMutation(request, env, session, requestId);
        if (denied) return denied;
        requirePublicPracticeCommunity(env);
        return json(await service.deleteManualLogContribution(campaignId, url.searchParams.get('logId')));
      }
      return methodNotAllowed(['POST', 'DELETE'], requestId);
    }
    if (action === 'members') {
      if (request.method !== 'GET') return methodNotAllowed(['GET'], requestId);
      requireCapability(session, 'admin:dashboard');
      return json(await service.listCampaignMembers(campaignId));
    }
    if (action === 'join') {
      if (request.method !== 'POST') return methodNotAllowed(['POST'], requestId);
      requireAppUser(session);
      const denied = enforceSameOriginMutation(request, env, session, requestId);
      if (denied) return denied;
      requirePublicPracticeCommunity(env);
      return json(await service.joinCampaign(campaignId));
    }
    if (action === 'membership') {
      if (request.method !== 'DELETE') return methodNotAllowed(['DELETE'], requestId);
      requireAppUser(session);
      const denied = enforceSameOriginMutation(request, env, session, requestId);
      if (denied) return denied;
      requirePublicPracticeCommunity(env);
      return json(await service.leaveCampaign(campaignId));
    }
    if (!['PATCH', 'DELETE'].includes(request.method)) return methodNotAllowed(['PATCH', 'DELETE'], requestId);
    requireCapability(session, 'admin:dashboard');
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    return json(request.method === 'DELETE'
      ? await service.deleteCampaign(campaignId)
      : await service.updateCampaign(campaignId, await readJson(request, 20_000)));
  }

  if (path === '/api/sync' || path === '/api/player-sync') {
    if (path === '/api/sync') requireAppUser(session);
    else requireAuthentication(session);
    const service = createSyncService(context);
    if (request.method === 'GET') {
      return json(path === '/api/sync' ? await service.getUserSync() : await service.getPlayerSync());
    }
    if (request.method !== 'PUT') return methodNotAllowed(['GET', 'PUT'], requestId);
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    return json(path === '/api/sync'
      ? await service.putUserSync(await readJson(request, 800_000))
      : await service.putPlayerSync(await readJson(request, 600_000)));
  }

  if (path === '/api/media' && request.method === 'POST') {
    requireCapability(session, 'media:upload');
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    if (!await checkRateLimit((env as unknown as Record<string, unknown>).UPLOAD_RATE_LIMITER as { limit: (input: { key: string }) => Promise<{ success?: boolean }> } | undefined, session.userId)) {
      return apiError(429, 'rate_limited', 'Thử lại sau ít phút.', requestId);
    }
    const multipart = (request.headers.get('content-type') || '').startsWith('multipart/form-data');
    if (multipart) {
      throw new ServerInputError(415, 'multipart_unsupported', 'Chỉ hỗ trợ tải media bằng request body thô.');
    }
    return json(await createMediaService(context).uploadMedia({
      userId: session.userId,
      idempotencyKey: request.headers.get('idempotency-key'),
      prefix: request.headers.get('x-media-prefix') || '',
      contentType: request.headers.get('content-type') || '',
      contentLength: Number(request.headers.get('content-length')),
      fileName: request.headers.get('x-file-name') || 'upload',
      expectedSha256: request.headers.get('x-content-sha256'),
      body: request.body,
    }), 201);
  }
  if (path === '/api/media' && request.method === 'DELETE') {
    requireCapability(session, 'media:delete');
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    const body = await readJson(request, 10_000);
    if (!body.key || typeof body.key !== 'string') {
      throw new ServerInputError(400, 'invalid_object_key', 'Khóa media không hợp lệ.');
    }
    const key = normalizeMediaKey(body.key, env.MEDIA_PUBLIC_BASE_URL);
    return json(await createMediaService(context).tombstoneMedia(encodeURIComponent(key), request.headers.get('idempotency-key')));
  }
  const mediaMatch = path.match(/^\/api\/media\/(.+)$/u);
  if (mediaMatch && request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type, Accept',
        'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Range, Content-Length, Content-Type, ETag',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
  if (mediaMatch && request.method === 'GET') {
    const resp = await createMediaService(context).getMedia(mediaMatch[1], request);
    resp.headers.set('Access-Control-Allow-Origin', '*');
    resp.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    resp.headers.set('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
    resp.headers.set('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Range, Content-Length, Content-Type, ETag');
    return resp;
  }
  if (mediaMatch && request.method === 'DELETE') {
    requireCapability(session, 'media:delete');
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    return denied || json(await createMediaService(context).tombstoneMedia(mediaMatch[1], request.headers.get('idempotency-key')));
  }

  return apiError(404, 'not_found', 'API không tồn tại.', requestId);
}

function cloudflareLocation(request: Request): { city: string; countryCode: string; regionCode: string } {
  const cf = (request as Request & { cf?: Record<string, unknown> }).cf;
  return {
    city: typeof cf?.city === 'string' ? cf.city : '',
    countryCode: typeof cf?.country === 'string' ? cf.country : '',
    regionCode: typeof cf?.regionCode === 'string' ? cf.regionCode : '',
  };
}

type AuthRateLimiterEnv = NonNullable<ReturnType<typeof getApiLocals>['env']>;

function canonicalOAuthStartUrl(request: Request, env: AuthRateLimiterEnv): string | null {
  const requestUrl = new URL(request.url);
  const configuredOrigin = new URL(env.APP_ORIGIN || request.url).origin;
  if (requestUrl.origin === configuredOrigin) return null;
  return new URL(`${requestUrl.pathname}${requestUrl.search}`, configuredOrigin).toString();
}

async function enforceOAuthStartRateLimit(
  request: Request,
  env: AuthRateLimiterEnv,
  requestId: string,
  provider = 'google',
): Promise<Response | null> {
  const ipHash = await authClientIpHash(request, env);
  const ipFailure = await enforceAuthRateLimit(env, `${provider}-oauth-start:ip:${ipHash}`, requestId);
  if (ipFailure) return ipFailure;
  if (await claimGlobalOAuthStart(env)) return null;
  return apiError(429, 'rate_limited', 'Thử lại sau ít phút.', requestId);
}

async function readSignedRequest(request: Request): Promise<string> {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 20_000) throw new ServerInputError(413, 'payload_too_large', 'Yêu cầu Facebook quá lớn.');
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/x-www-form-urlencoded') && !contentType.includes('multipart/form-data')) {
    throw new ServerInputError(415, 'unsupported_media_type', 'Định dạng callback Facebook không hợp lệ.');
  }
  const form = await request.formData();
  return typeof form.get('signed_request') === 'string' ? String(form.get('signed_request')) : '';
}

async function claimGlobalOAuthStart(env: AuthRateLimiterEnv): Promise<boolean> {
  const minuteStart = Math.floor(Date.now() / 60_000) * 60_000;
  const bucket = new Date(minuteStart).toISOString();
  const expiresAt = new Date(minuteStart + 10 * 60_000).toISOString();
  const result = await env.DB.prepare(`
    INSERT INTO oauth_start_rate_limits (bucket, attempt_count, expires_at)
    VALUES (?, 1, ?)
    ON CONFLICT(bucket) DO UPDATE SET attempt_count = attempt_count + 1
    WHERE attempt_count < 30
  `).bind(bucket, expiresAt).run();
  return Number(result.meta?.changes || 0) === 1;
}

async function authClientIpHash(request: Request, env: AuthRateLimiterEnv): Promise<string> {
  return sha256(`${requiredSecret(env, 'RATE_LIMIT_SALT')}:${clientAddressHashInput(request)}`);
}

async function enforceAuthRateLimit(
  env: AuthRateLimiterEnv,
  key: string,
  requestId: string,
): Promise<Response | null> {
  const limiter = (env as unknown as Record<string, unknown>).AUTH_RATE_LIMITER as {
    limit: (input: { key: string }) => Promise<{ success?: boolean }>;
  } | undefined;
  if (await checkRateLimit(limiter, key)) return null;
  return apiError(429, 'rate_limited', 'Thử lại sau ít phút.', requestId);
}

function isLegacyHttpInputError(error: unknown): error is {
  status: number;
  code: string;
  message: string;
  details?: unknown;
} {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as Record<string, unknown>;
  return Number.isInteger(candidate.status)
    && Number(candidate.status) >= 400
    && Number(candidate.status) < 600
    && candidate.name === 'HttpInputError'
    && typeof candidate.code === 'string'
    && typeof candidate.message === 'string';
}

function isServerInputError(error: unknown): error is {
  status: number;
  code: string;
  message: string;
  details?: unknown;
} {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as Record<string, unknown>;
  return Number.isInteger(candidate.status)
    && Number(candidate.status) >= 400
    && Number(candidate.status) < 600
    && typeof candidate.code === 'string'
    && typeof candidate.message === 'string'
    && candidate.name === 'ServerInputError';
}

async function enforceTalkArchivePolicy(
  request: Request,
  env: NonNullable<ReturnType<typeof getApiLocals>['env']>,
): Promise<void> {
  if (!['POST', 'PATCH'].includes(request.method)) return;
  let payload: Record<string, unknown> | Array<Record<string, unknown>>;
  try {
    payload = await request.clone().json() as Record<string, unknown> | Array<Record<string, unknown>>;
  } catch {
    return;
  }
  const currentTracks = new Map<string, unknown[]>();
  const currentArchiveIds = new Map<string, string>();
  const url = new URL(request.url);
  const talkId = url.searchParams.get('id');
  const conflict = url.searchParams.get('on_conflict') || request.headers.get('x-upsert-key') || '';
  const payloadRows = Array.isArray(payload) ? payload : [payload];
  const ids = request.method === 'PATCH' && talkId?.startsWith('eq.')
    ? [talkId.slice(3)]
    : conflict.split(',').map((column) => column.trim()).includes('id')
      ? payloadRows.map((row) => String(row.id || '')).filter(Boolean)
      : [];
  const uniqueIds = [...new Set(ids)].slice(0, 100);
  if (uniqueIds.length) {
    const placeholders = uniqueIds.map(() => '?').join(', ');
    const result = await env.DB.prepare(
      `SELECT id, tracks, archive_id FROM phap_thoai WHERE id IN (${placeholders})`,
    ).bind(...uniqueIds).all<Record<string, unknown>>();
    for (const row of result.results ?? []) {
      currentArchiveIds.set(String(row.id), String(row.archive_id || '').trim());
      try {
        currentTracks.set(String(row.id), JSON.parse(String(row.tracks || '[]')) as unknown[]);
      } catch {
        currentTracks.set(String(row.id), []);
      }
    }
  }
  assertNoNewArchiveTrackUrls(payload, currentTracks, currentArchiveIds);
}

async function handleResourceRequest(
  table: string,
  request: Request,
  env: NonNullable<ReturnType<typeof getApiLocals>['env']>,
  session: InternalSession | null,
  requestId: string,
  context: CloudflareRequestContext,
  filters: Record<string, string>,
): Promise<Response> {
  const url = new URL(request.url);
  const queryFilters = resourceFilters(table, url, filters);
  const defaultLimit = table === 'tap_noi_dung' ? 5000 : 500;
  const selectOptions = {
    select: url.searchParams.get('select') || '*',
    order: url.searchParams.get('order'),
    limit: Number(url.searchParams.get('limit') || defaultLimit),
    offset: Number(url.searchParams.get('offset') || 0),
    filters: queryFilters,
  };
  const onConflict = url.searchParams.get('on_conflict') || request.headers.get('x-upsert-key');
  if (table === 'baiviet' || table === 'tap_noi_dung') {
    const service = createArticlesService(context);
    if (request.method === 'GET') {
      return json(await service.selectTable(table, selectOptions));
    }
    const denied = await guardDataMutation(request, env, session, requestId, table);
    if (denied) return denied;
    if (request.method === 'POST') {
      return json(await service.insertTable(table, await readResourceJson(request), { onConflict }));
    }
    if (request.method === 'PATCH') return json(await service.updateTable(table, await readJson(request), queryFilters));
    if (request.method === 'DELETE') return json(await service.deleteTable(table, queryFilters));
  }
  if (table === 'phap_thoai') {
    const service = createTalksService(context);
    if (request.method === 'GET') {
      const data = await service.selectTable(selectOptions);
      const isPublic = !session || session.role === 'user';
      const cacheHeaders: Record<string, string> = isPublic
        ? { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400' }
        : {};
      return json(data, 200, cacheHeaders);
    }
    const denied = await guardDataMutation(request, env, session, requestId, table);
    if (denied) return denied;
    if (request.method === 'POST') {
      if (onConflict) {
        requireCapability(session, 'talks:write');
        await enforceTalkArchivePolicy(request, env);
        return json(await legacyHandleData(request, env, session, table));
      }
      return json(await service.insertTable(await readResourceJson(request)));
    }
    if (request.method === 'PATCH') return json(await service.updateTable(await readJson(request), queryFilters));
    if (request.method === 'DELETE') return json(await service.deleteTable(queryFilters));
  }
  return apiError(404, 'not_found', 'API không tồn tại.', requestId);
}

function resourceFilters(
  table: string,
  url: URL,
  routeFilters: Record<string, string>,
): Record<string, string> {
  const definition = tableDefinition(table);
  const filters: Record<string, string> = {};
  for (const column of definition.columns) {
    const value = url.searchParams.get(column);
    if (value) filters[column] = value;
  }
  for (const [column, value] of Object.entries(routeFilters)) {
    filters[column] = `eq.${value}`;
  }
  return filters;
}

async function readResourceJson(
  request: Request,
): Promise<Record<string, unknown> | Array<Record<string, unknown>>> {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new ServerInputError(415, 'content_type', 'Yêu cầu phải dùng application/json.');
  }
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > 1_000_000) {
    throw new ServerInputError(413, 'payload_too_large', 'Dữ liệu gửi lên vượt giới hạn.');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 1_000_000) {
    throw new ServerInputError(413, 'payload_too_large', 'Dữ liệu gửi lên vượt giới hạn.');
  }
  try {
    const payload = JSON.parse(text) as unknown;
    const validRecord = (value: unknown): value is Record<string, unknown> =>
      Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    if (Array.isArray(payload)) {
      if (payload.some((row) => !validRecord(row))) throw new Error('invalid-array-row');
      return payload;
    }
    if (!validRecord(payload)) throw new Error('invalid-payload');
    return payload;
  } catch {
    throw new ServerInputError(400, 'invalid_json', 'JSON không hợp lệ.');
  }
}

async function guardDataMutation(
  request: Request,
  env: NonNullable<ReturnType<typeof getApiLocals>['env']>,
  session: InternalSession | null,
  requestId: string,
  table: string,
): Promise<Response | null> {
  if (request.method === 'GET') return null;
  if (table === 'binh_luan' && request.method === 'POST') {
    requireAppUser(session);
    const denied = enforceSameOriginMutation(request, env, session, requestId);
    if (denied) return denied;
    let articleId = new URL(request.url).searchParams.get('bai_viet_id') || '';
    if (!articleId) {
      try {
        const body = await request.clone().json() as Record<string, unknown> | Array<Record<string, unknown>>;
        articleId = Array.isArray(body) ? String(body[0]?.bai_viet_id || '') : String(body.bai_viet_id || '');
      } catch {
        articleId = 'invalid';
      }
    }
    const key = `${env.RATE_LIMIT_SALT || ''}:${articleId}:${clientAddressHashInput(request)}`;
    if (!await checkRateLimit((env as unknown as Record<string, unknown>).COMMENT_RATE_LIMITER as { limit: (input: { key: string }) => Promise<{ success?: boolean }> } | undefined, await sha256(key))) {
      return apiError(429, 'rate_limited', 'Thử lại sau ít phút.', requestId);
    }
    return null;
  }
  requireAuthentication(session);
  return enforceSameOriginMutation(request, env, session, requestId);
}

async function health(env: NonNullable<ReturnType<typeof getApiLocals>['env']>): Promise<Response> {
  let sealed = false;
  try {
    sealed = (env as unknown as Record<string, unknown>).MIGRATION_SEAL_REQUIRED === 'false'
      ? true
      : Boolean(await env.DB.prepare('SELECT id FROM sealed_migration LIMIT 1').first());
  } catch {
    sealed = false;
  }
  return json({ ok: sealed, service: 'quangtu-worker', database: sealed ? 'sealed' : 'unsealed' }, sealed ? 200 : 503);
}

function resourceDataRoute(path: string): null | {
  table: 'baiviet' | 'tap_noi_dung' | 'phap_thoai';
  filters: Record<string, string>;
  methods: string[];
} {
  if (path === '/api/articles') return { table: 'baiviet', filters: {}, methods: ['GET', 'POST'] };
  if (path === '/api/talks') return { table: 'phap_thoai', filters: {}, methods: ['GET', 'POST'] };
  const article = path.match(/^\/api\/articles\/([^/]+)$/u);
  if (article) return { table: 'baiviet', filters: { id: decodeURIComponent(article[1]) }, methods: ['GET', 'PATCH', 'DELETE'] };
  const chapters = path.match(/^\/api\/articles\/([^/]+)\/chapters$/u);
  if (chapters) return { table: 'tap_noi_dung', filters: { bai_viet_id: decodeURIComponent(chapters[1]) }, methods: ['GET'] };
  const talk = path.match(/^\/api\/talks\/([^/]+)$/u);
  if (talk) return { table: 'phap_thoai', filters: { id: decodeURIComponent(talk[1]) }, methods: ['GET', 'PATCH', 'DELETE'] };
  return null;
}

function normalizeMediaKey(value: string, mediaBaseUrl?: string) {
  const raw = String(value);
  if (/^(covers|content|pdfs)\//u.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const base = mediaBaseUrl ? new URL(mediaBaseUrl, url.origin) : null;
    if (base && url.origin === base.origin) {
      const prefix = base.pathname.replace(/\/+$/u, '');
      return prefix && url.pathname.startsWith(`${prefix}/`)
        ? url.pathname.slice(prefix.length + 1)
        : url.pathname.slice(1);
    }
  } catch {
    return raw;
  }
  return raw;
}

function requireAuthentication(session: InternalSession | null): asserts session is InternalSession {
  if (!session) throw new ServerInputError(401, 'authentication_required', 'Cần đăng nhập.');
}

function requireAppUser(session: InternalSession | null): asserts session is InternalSession {
  requireAuthentication(session);
  if (!session.appUserId) throw new ServerInputError(403, 'account_required', 'Cần tài khoản người dùng.');
}

function requireCapability(session: InternalSession | null, capability: string): asserts session is InternalSession {
  requireAuthentication(session);
  if (!can(session, capability)) throw new ServerInputError(403, 'forbidden', 'Không đủ quyền.');
}

let appStatsMemoryCache: {
  data: { total: number; base: number; real: number };
  expiresAt: number;
} | null = null;

const BASE_INSTALL_COUNT = 1230;

async function handleAppStatsRequest(env: CloudflareEnvLike): Promise<Response> {
  const now = Date.now();
  if (appStatsMemoryCache && now < appStatsMemoryCache.expiresAt) {
    return json(appStatsMemoryCache.data, 200, {
      'Cache-Control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400',
    });
  }

  let realCount = 0;
  if (env?.DB) {
    try {
      const [userRow, visitorRow] = await Promise.all([
        env.DB.prepare('SELECT COUNT(*) AS total FROM app_users').first<{ total?: number }>(),
        env.DB.prepare('SELECT COUNT(DISTINCT visitor_id_hash) AS total FROM visitor_daily_presence').first<{ total?: number }>(),
      ]);
      const users = Number(userRow?.total || 0);
      const visitors = Number(visitorRow?.total || 0);
      realCount = Math.max(users, visitors);
    } catch {
      realCount = 0;
    }
  }

  const data = {
    total: BASE_INSTALL_COUNT + realCount,
    base: BASE_INSTALL_COUNT,
    real: realCount,
  };

  appStatsMemoryCache = {
    data,
    expiresAt: now + 30 * 60 * 1000,
  };

  return json(data, 200, {
    'Cache-Control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400',
  });
}
