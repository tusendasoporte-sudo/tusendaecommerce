import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { serverPocketBaseUrl } from './pocketBaseServerUrl.ts';
import {
  publicSecurityProxyDiagnostics,
  publicSecurityProxyHeaders,
} from './publicSecurity.ts';
import {
  STOREFRONT_BOOTSTRAP_CODE_PATTERN,
  STOREFRONT_INSTALLATION_CREDENTIAL_PATTERN,
  STOREFRONT_SESSION_TOKEN_PATTERN,
  canonicalStorefrontJson,
  readStorefrontJson,
  storefrontInstallationCredential,
} from './storefrontPushContracts.ts';

const APP_CHECK_HEADER = 'x-firebase-appcheck';
const INTERNAL_SECRET_HEADER = 'x-pz-storefront-internal';
const INTERNAL_TIMESTAMP_HEADER = 'x-pz-storefront-timestamp';
const INTERNAL_NONCE_HEADER = 'x-pz-storefront-nonce';
const INTERNAL_SIGNATURE_HEADER = 'x-pz-storefront-signature';
const FIREBASE_APP_NAME = 'pz-storefront-app-check';
const INTERNAL_RESPONSE_MAX_BYTES = 65_536;
const RATE_WINDOW_MS = 60_000;
const RATE_BUCKET_LIMIT = 20_000;

const JSON_HEADERS = Object.freeze({
  'Cache-Control': 'private, no-store, max-age=0',
  'Content-Type': 'application/json; charset=utf-8',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
});

const ACTION_LIMITS = Object.freeze({
  installations_register: 12,
  installations_heartbeat: 60,
  installations_permission: 30,
  installations_disable: 12,
  session_bootstrap: 12,
  session_consume: 24,
  campaigns_resolve_target: 30,
  events_record: 120,
});

type StorefrontAction = keyof typeof ACTION_LIMITS;
type GatewayPayloadParser<T> = (value: unknown) => T | null;
type AppCheckVerifier = (token: string) => Promise<{ appId: string }>;
type FetchLike = typeof fetch;

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();
let rateOperations = 0;

export type StorefrontInternalEnvelope<T = unknown> = Readonly<{
  app_id: string;
  credential: string;
  client: Readonly<{
    ip: string;
    country_code: string;
    region_code: string;
  }>;
  payload: T;
}>;

export type StorefrontNativeGatewayOptions<T> = Readonly<{
  request: Request;
  clientAddress?: string;
  action: Exclude<StorefrontAction, 'session_consume'>;
  internalPath: string;
  maxBodyBytes: number;
  allowEmptyBody?: boolean;
  credential: 'optional' | 'required';
  parsePayload: GatewayPayloadParser<T>;
  mapSuccess?: (payload: Record<string, unknown>) => Record<string, unknown> | null;
  verifyAppCheckToken?: AppCheckVerifier;
  fetchImpl?: FetchLike;
  now?: Date;
}>;

function environmentValue(name: string) {
  const runtime = typeof process !== 'undefined' ? process.env?.[name] : '';
  const buildEnvironment = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
  return String(runtime || buildEnvironment?.[name] || '').trim();
}

function constantTimeTextEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function storefrontJson(status: number, body: Record<string, unknown>, extraHeaders?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...(extraHeaders || {}) },
  });
}

export function storefrontRequestTransportAllowed(url: string, nodeEnvironment = environmentValue('NODE_ENV')) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') return true;
    if (nodeEnvironment === 'production') return false;
    return parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export function storefrontGatewayTransportAllowed(
  request: Request,
  clientAddress?: string,
  nodeEnvironment = environmentValue('NODE_ENV'),
) {
  if (storefrontRequestTransportAllowed(request.url, nodeEnvironment)) return true;
  const proxy = publicSecurityProxyDiagnostics(request, clientAddress);
  let requestHost = '';
  try { requestHost = new URL(request.url).host.toLowerCase(); } catch { return false; }
  const forwardedHost = String(request.headers.get('x-forwarded-host') || '').trim().toLowerCase();
  return proxy.forwarded_proto === 'https'
    && proxy.forwarded_for.present
    && !proxy.forwarded_for.oversized
    && proxy.forwarded_for.count > 0
    && proxy.x_real_ip !== 'missing'
    && proxy.x_real_ip !== 'invalid'
    && Boolean(requestHost)
    && forwardedHost === requestHost;
}

export function validateStorefrontInternalSecret(
  internalSecret: string,
  comparedSecrets: readonly string[] = [],
) {
  if (internalSecret.length < 32 || internalSecret.length > 512) return false;
  return comparedSecrets
    .filter(Boolean)
    .every((candidate) => !constantTimeTextEqual(internalSecret, candidate));
}

function configuredInternalSecret() {
  const secret = environmentValue('PZ_STOREFRONT_INTERNAL_SECRET');
  return validateStorefrontInternalSecret(secret, [
    environmentValue('PZ_PUSH_RELAY_SECRET'),
    environmentValue('PZ_SECURITY_HMAC_SECRET'),
  ]) ? secret : '';
}

function initializeStorefrontFirebaseAdmin() {
  const existing = getApps().find((app) => app.name === FIREBASE_APP_NAME);
  if (existing) return existing;

  const projectId = environmentValue('PZ_STOREFRONT_FIREBASE_PROJECT_ID');
  const inlineServiceAccount = environmentValue('PZ_STOREFRONT_FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!projectId || !inlineServiceAccount) {
    throw new Error('Storefront Firebase credentials are not configured');
  }

  const serviceAccount = JSON.parse(inlineServiceAccount) as Record<string, unknown>;
  if (String(serviceAccount.project_id || '').trim() !== projectId) {
    throw new Error('Storefront Firebase project mismatch');
  }
  return initializeApp({ credential: cert(serviceAccount), projectId }, FIREBASE_APP_NAME);
}

async function defaultAppCheckVerifier(token: string) {
  const result = await getAppCheck(initializeStorefrontFirebaseAdmin()).verifyToken(token);
  return { appId: String(result.appId || '').trim() };
}

export function storefrontAppCheckToken(request: Request) {
  const token = String(request.headers.get(APP_CHECK_HEADER) || '').trim();
  return token.length >= 32 && token.length <= 8192 && !/[\s\u0000-\u001f\u007f]/.test(token)
    ? token
    : '';
}

export async function verifyStorefrontAppCheck(
  request: Request,
  verifier: AppCheckVerifier = defaultAppCheckVerifier,
) {
  const token = storefrontAppCheckToken(request);
  if (!token) return { ok: false as const, status: 401, error: 'app_check_required' };
  try {
    const verified = await verifier(token);
    const appId = String(verified?.appId || '').trim();
    if (!appId || appId.length > 255 || /[\s\u0000-\u001f\u007f]/.test(appId)) {
      return { ok: false as const, status: 401, error: 'app_check_invalid' };
    }
    return { ok: true as const, appId };
  } catch {
    return { ok: false as const, status: 401, error: 'app_check_invalid' };
  }
}

function pruneRateBuckets(nowMs: number) {
  rateOperations += 1;
  if (rateBuckets.size < RATE_BUCKET_LIMIT && rateOperations % 256 !== 0) return;
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= nowMs) rateBuckets.delete(key);
  }
  if (rateBuckets.size <= RATE_BUCKET_LIMIT) return;
  const excess = rateBuckets.size - RATE_BUCKET_LIMIT;
  let removed = 0;
  for (const key of rateBuckets.keys()) {
    rateBuckets.delete(key);
    removed += 1;
    if (removed >= excess) break;
  }
}

export function storefrontRateLimitAllowed(
  action: StorefrontAction,
  identity: string,
  nowMs = Date.now(),
) {
  const limit = ACTION_LIMITS[action];
  if (!limit || !identity) return false;
  pruneRateBuckets(nowMs);
  const key = `${action}:${identity}`;
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= nowMs) {
    rateBuckets.set(key, { count: 1, resetAt: nowMs + RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export function resetStorefrontRateLimitsForTests() {
  rateBuckets.clear();
  rateOperations = 0;
}

function trustedClientContext(request: Request, clientAddress?: string) {
  const proxyHeaders = publicSecurityProxyHeaders(request, clientAddress, false);
  const ip = String(proxyHeaders['X-Forwarded-For'] || '').trim();
  const cloudflareAddress = String(request.headers.get('cf-connecting-ip') || '').trim();
  const mayTrustCloudflareGeo = Boolean(ip && cloudflareAddress);
  const countryCandidate = mayTrustCloudflareGeo
    ? String(request.headers.get('cf-ipcountry') || '').trim().toUpperCase()
    : '';
  const regionCandidate = mayTrustCloudflareGeo
    ? String(request.headers.get('cf-region-code') || '').trim()
    : '';
  return Object.freeze({
    ip,
    country_code: /^[A-Z]{2}$/.test(countryCandidate) ? countryCandidate : '',
    region_code: /^[A-Za-z0-9._ -]{1,80}$/.test(regionCandidate) ? regionCandidate : '',
  });
}

function rateIdentity(
  appId: string,
  clientIp: string,
  credential: string,
  payload: unknown,
) {
  const fid = isPlainObject(payload) && typeof payload.fid === 'string' ? payload.fid : '';
  return createHash('sha256')
    .update(`${appId}\n${clientIp}\n${credential || fid || 'anonymous'}`, 'utf8')
    .digest('hex');
}

export function storefrontInternalSignature(
  secret: string,
  timestamp: string,
  nonce: string,
  action: string,
  envelope: StorefrontInternalEnvelope,
) {
  const material = `${timestamp}\n${nonce}\n${action}\n${canonicalStorefrontJson(envelope)}`;
  return createHmac('sha256', secret).update(material, 'utf8').digest('hex');
}

async function readInternalResponse(response: Response) {
  let text = '';
  try { text = await response.text(); } catch { return null; }
  if (!text || new TextEncoder().encode(text).byteLength > INTERNAL_RESPONSE_MAX_BYTES) return null;
  try {
    const payload = JSON.parse(text);
    return isPlainObject(payload) ? payload : null;
  } catch {
    return null;
  }
}

async function signedPocketBaseRequest<T>(options: {
  action: StorefrontAction;
  internalPath: string;
  envelope: StorefrontInternalEnvelope<T>;
  fetchImpl?: FetchLike;
  now?: Date;
}) {
  const baseUrl = serverPocketBaseUrl();
  const secret = configuredInternalSecret();
  if (!baseUrl || !secret) return { ok: false as const, status: 503, error: 'gateway_unavailable' };

  const now = options.now || new Date();
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const nonce = randomUUID();
  const signature = storefrontInternalSignature(secret, timestamp, nonce, options.action, options.envelope);
  const fetcher = options.fetchImpl || fetch;
  try {
    const response = await fetcher(`${baseUrl}${options.internalPath}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json',
        [INTERNAL_SECRET_HEADER]: secret,
        [INTERNAL_TIMESTAMP_HEADER]: timestamp,
        [INTERNAL_NONCE_HEADER]: nonce,
        [INTERNAL_SIGNATURE_HEADER]: signature,
      },
      cache: 'no-store',
      body: canonicalStorefrontJson(options.envelope),
    });
    const payload = await readInternalResponse(response);
    if (!payload) return { ok: false as const, status: 503, error: 'gateway_unavailable' };
    return { ok: response.ok, status: response.status, payload } as const;
  } catch {
    return { ok: false as const, status: 503, error: 'gateway_unavailable' };
  }
}

function publicGatewayError(status: number, payload?: Record<string, unknown>) {
  const safeError = payload && typeof payload.error === 'string'
    ? payload.error.slice(0, 80)
    : 'gateway_unavailable';
  const safeStatus = status >= 400 && status <= 599 ? status : 503;
  return storefrontJson(safeStatus, { ok: false, error: safeError });
}

export async function storefrontNativeGateway<T>(options: StorefrontNativeGatewayOptions<T>) {
  if (!storefrontGatewayTransportAllowed(options.request, options.clientAddress)) {
    return storefrontJson(400, { ok: false, error: 'https_required' });
  }

  const parsedJson = await readStorefrontJson(
    options.request,
    options.maxBodyBytes,
    options.allowEmptyBody === true,
  );
  if (!parsedJson.ok) {
    return storefrontJson(parsedJson.error === 'payload_too_large' ? 413 : 400, {
      ok: false,
      error: parsedJson.error,
    });
  }
  const payload = options.parsePayload(parsedJson.value);
  if (!payload) return storefrontJson(400, { ok: false, error: 'invalid_payload' });

  const credential = storefrontInstallationCredential(options.request);
  const hasAuthorization = options.request.headers.has('authorization');
  if (options.credential === 'required' && !credential) {
    return storefrontJson(401, { ok: false, error: 'credential_required' });
  }
  if (options.credential === 'optional' && hasAuthorization && !credential) {
    return storefrontJson(401, { ok: false, error: 'invalid_credential' });
  }

  const appCheck = await verifyStorefrontAppCheck(
    options.request,
    options.verifyAppCheckToken || defaultAppCheckVerifier,
  );
  if (!appCheck.ok) return storefrontJson(appCheck.status, { ok: false, error: appCheck.error });

  const client = trustedClientContext(options.request, options.clientAddress);
  const identity = rateIdentity(appCheck.appId, client.ip, credential, payload);
  if (!storefrontRateLimitAllowed(options.action, identity, options.now?.getTime())) {
    return storefrontJson(429, { ok: false, error: 'rate_limited' }, { 'Retry-After': '60' });
  }

  const envelope = Object.freeze({
    app_id: appCheck.appId,
    credential,
    client,
    payload,
  });
  const internal = await signedPocketBaseRequest({
    action: options.action,
    internalPath: options.internalPath,
    envelope,
    fetchImpl: options.fetchImpl,
    now: options.now,
  });
  if (!internal.ok) return publicGatewayError(internal.status, internal.payload);
  const mapped = options.mapSuccess ? options.mapSuccess(internal.payload) : internal.payload;
  return mapped
    ? storefrontJson(internal.status, mapped)
    : storefrontJson(503, { ok: false, error: 'gateway_unavailable' });
}

export function storefrontPublicHttpsOrigin(request: Request, clientAddress?: string) {
  let requestUrl: URL;
  try { requestUrl = new URL(request.url); } catch { return ''; }
  if (requestUrl.protocol === 'https:') return requestUrl.origin;
  const forwardedProto = String(request.headers.get('x-forwarded-proto') || '').trim().toLowerCase();
  if (forwardedProto !== 'https'
    || !storefrontGatewayTransportAllowed(request, clientAddress)) return '';
  return `https://${requestUrl.host}`;
}

export function mapBootstrapResponse(
  request: Request,
  payload: Record<string, unknown>,
  clientAddress?: string,
) {
  const code = String(payload.bootstrap_code || '');
  const expiresIn = Number(payload.expires_in_seconds);
  if (!STOREFRONT_BOOTSTRAP_CODE_PATTERN.test(code)
    || !Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 60) return null;
  const origin = storefrontPublicHttpsOrigin(request, clientAddress);
  if (!origin) return null;
  return {
    ok: true,
    bootstrap_url: `${origin}/api/storefront/v1/session/bootstrap/${code}`,
    expires_in_seconds: expiresIn,
  };
}

export async function consumeStorefrontBootstrap(options: {
  request: Request;
  clientAddress?: string;
  code: string;
  fetchImpl?: FetchLike;
  now?: Date;
}) {
  if (!storefrontGatewayTransportAllowed(options.request, options.clientAddress)) {
    return storefrontJson(400, { ok: false, error: 'https_required' });
  }
  if (!STOREFRONT_BOOTSTRAP_CODE_PATTERN.test(options.code)) {
    return storefrontJson(404, { ok: false, error: 'bootstrap_not_found' });
  }

  const client = trustedClientContext(options.request, options.clientAddress);
  const identity = createHash('sha256')
    .update(`${client.ip}\n${options.code}`, 'utf8')
    .digest('hex');
  if (!storefrontRateLimitAllowed('session_consume', identity, options.now?.getTime())) {
    return storefrontJson(429, { ok: false, error: 'rate_limited' }, { 'Retry-After': '60' });
  }

  const envelope = Object.freeze({
    app_id: '',
    credential: '',
    client,
    payload: Object.freeze({ code: options.code }),
  });
  const internal = await signedPocketBaseRequest({
    action: 'session_consume',
    internalPath: '/api/pz/storefront/v1/session/bootstrap/consume',
    envelope,
    fetchImpl: options.fetchImpl,
    now: options.now,
  });
  if (!internal.ok) {
    if (internal.status === 429) return publicGatewayError(429, internal.payload);
    return storefrontJson(404, { ok: false, error: 'bootstrap_not_found' });
  }

  const sessionToken = String(internal.payload.session_token || '');
  const redirectPath = String(internal.payload.redirect_path || '');
  const maxAge = Number(internal.payload.max_age_seconds);
  if (!STOREFRONT_SESSION_TOKEN_PATTERN.test(sessionToken)
    || !/^\/t\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(redirectPath)
    || !Number.isInteger(maxAge) || maxAge < 60 || maxAge > 86_400) {
    return storefrontJson(503, { ok: false, error: 'gateway_unavailable' });
  }

  return new Response(null, {
    status: 303,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      Location: redirectPath,
      Pragma: 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'Set-Cookie': `pz_storefront_session=${sessionToken}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
}

export const STOREFRONT_INTERNAL_HEADERS = Object.freeze({
  secret: INTERNAL_SECRET_HEADER,
  timestamp: INTERNAL_TIMESTAMP_HEADER,
  nonce: INTERNAL_NONCE_HEADER,
  signature: INTERNAL_SIGNATURE_HEADER,
});

export function isStorefrontInstallationCredential(value: unknown) {
  return typeof value === 'string' && STOREFRONT_INSTALLATION_CREDENTIAL_PATTERN.test(value);
}
