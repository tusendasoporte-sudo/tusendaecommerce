import { serverPocketBaseUrl } from './pocketBaseServerUrl.ts';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const USE_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,119}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const DELIVERY_FILE_PATTERN = /^(?:poster-(?:original|w[0-9]{2,4})|original|w[0-9]{2,4})\.webp$/;
const PUBLIC_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export type PromoPublicMediaParams = Readonly<{
  publicSlug?: string;
  useKey?: string;
  digest?: string;
  filename?: string;
}>;

const PUBLIC_MEDIA_PATH_PATTERN = /^\/api\/pz\/promo\/public\/v1\/sites\/([a-z0-9]+(?:-[a-z0-9]+)*)\/media\/([a-z][a-z0-9_-]{0,119})\/([a-f0-9]{64})\/((?:poster-(?:original|w[0-9]{2,4})|original|w[0-9]{2,4})\.webp)$/;

type ProxyOptions = Readonly<{
  baseUrl?: string;
  fetcher?: typeof fetch;
}>;

type ValidPublicMedia = Readonly<{
  path: string;
  mime: 'image/webp';
}>;

function responseHeaders(contentType = '') {
  const headers = new Headers({
    'Cache-Control': contentType ? PUBLIC_CACHE_CONTROL : 'private, no-store, max-age=0',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  });
  if (contentType) {
    headers.set('Content-Type', contentType);
    headers.set('Content-Disposition', 'inline');
  }
  return headers;
}

function notFound() {
  return new Response(null, { status: 404, headers: responseHeaders() });
}

function unavailable() {
  return new Response(null, { status: 503, headers: responseHeaders() });
}

export function resolvePromoPublicMedia(params: PromoPublicMediaParams): ValidPublicMedia | null {
  const publicSlug = String(params.publicSlug || '');
  const useKey = String(params.useKey || '');
  const digest = String(params.digest || '');
  const filename = String(params.filename || '');
  if (!SLUG_PATTERN.test(publicSlug) || !USE_KEY_PATTERN.test(useKey)
    || !SHA256_PATTERN.test(digest) || !DELIVERY_FILE_PATTERN.test(filename)) return null;
  return Object.freeze({
    path: `/api/pz/promo/public/v1/sites/${publicSlug}/media/${useKey}/${digest}/${filename}`,
    mime: 'image/webp',
  });
}

export function promoPublicMediaPath(pathname: unknown): PromoPublicMediaParams | null {
  const match = String(pathname || '').match(PUBLIC_MEDIA_PATH_PATTERN);
  return match ? Object.freeze({
    publicSlug: match[1],
    useKey: match[2],
    digest: match[3],
    filename: match[4],
  }) : null;
}

export async function proxyPromoPublicMedia(
  request: Request,
  params: PromoPublicMediaParams,
  options: ProxyOptions = {},
) {
  const method = request.method.toUpperCase();
  if ((method !== 'GET' && method !== 'HEAD') || new URL(request.url).search) return notFound();
  const media = resolvePromoPublicMedia(params);
  if (!media) return notFound();

  if (request.headers.has('range')) return notFound();

  const baseUrl = options.baseUrl === undefined ? serverPocketBaseUrl() : String(options.baseUrl || '');
  if (!baseUrl) return unavailable();
  let upstream: Response;
  try {
    upstream = await (options.fetcher || fetch)(`${baseUrl}${media.path}`, {
      method,
      headers: {
        Accept: media.mime,
      },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
  } catch (_) {
    return unavailable();
  }

  const contentType = String(upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (upstream.status !== 200 || contentType !== media.mime || (method === 'GET' && !upstream.body)) return notFound();

  const headers = responseHeaders(media.mime);
  const contentLength = String(upstream.headers.get('content-length') || '').trim();
  if (/^[0-9]{1,20}$/.test(contentLength)) headers.set('Content-Length', contentLength);
  return new Response(method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers });
}
