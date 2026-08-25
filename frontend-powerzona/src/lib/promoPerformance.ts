import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import {
  brotliCompress as brotliCompressCallback,
  constants as zlibConstants,
  gzip as gzipCallback,
} from 'node:zlib';
import type { PromoPublicShellResult } from './promoPublicShell.ts';

export const PROMO_PERFORMANCE_BUDGETS = Object.freeze({
  htmlCompressedBytes: 80 * 1024,
  cssCompressedBytes: 50 * 1024,
  initialJavaScriptCompressedBytes: 75 * 1024,
  initialFontBytes: 160 * 1024,
  mobileHeroBytes: 300 * 1024,
  desktopHeroBytes: 450 * 1024,
  mobileInitialTransferBytes: 650 * 1024,
  desktopInitialTransferBytes: 900 * 1024,
  initialRequests: 20,
  eagerImages: 1,
  initialVideoBytes: 0,
});

type PromoContentEncoding = 'br' | 'gzip' | 'identity';
type CachedRepresentation = Readonly<{
  body: Buffer;
  createdAt: number;
  etag: string;
  headers: readonly (readonly [string, string])[];
  status: number;
}>;

const CACHE_KEY_PATTERN = /^[a-f0-9]{64}$/;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_BYTES = 8 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 128;
const MAX_SOURCE_BYTES = 512 * 1024;
const MIN_COMPRESS_BYTES = 1024;
const brotliCompress = promisify(brotliCompressCallback);
const gzip = promisify(gzipCallback);
const representationCache = new Map<string, CachedRepresentation>();
const pendingRepresentations = new Map<string, Promise<void>>();
let cachedBytes = 0;

function encodingScores(header: string) {
  const scores = new Map<string, number>();
  for (const rawPart of header.toLowerCase().split(',')) {
    const [rawName, ...parameters] = rawPart.trim().split(';');
    if (!rawName) continue;
    let quality = 1;
    const q = parameters.map((part) => part.trim()).find((part) => part.startsWith('q='));
    if (q) {
      const parsed = Number(q.slice(2));
      quality = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0;
    }
    scores.set(rawName, quality);
  }
  return scores;
}

export function selectPromoContentEncoding(header: string): PromoContentEncoding {
  const scores = encodingScores(String(header || ''));
  const wildcard = scores.get('*') ?? 0;
  const br = scores.get('br') ?? wildcard;
  const gzipScore = scores.get('gzip') ?? wildcard;
  if (br > 0 && br >= gzipScore) return 'br';
  if (gzipScore > 0) return 'gzip';
  return 'identity';
}

function appendVary(headers: Headers, name: string) {
  const values = (headers.get('Vary') || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!values.some((item) => item.toLowerCase() === name.toLowerCase())) values.push(name);
  if (values.length) headers.set('Vary', values.join(', '));
}

function safeBaseKey(result: PromoPublicShellResult) {
  const key = String(result.response.cacheKey || '');
  return result.route.action === 'serve' && CACHE_KEY_PATTERN.test(key) ? key : '';
}

export function promoRepresentationVariantKey(result: PromoPublicShellResult, encoding: PromoContentEncoding) {
  const base = safeBaseKey(result);
  return base ? `${base}|text-html|${encoding}` : '';
}

function pruneCache(now: number) {
  for (const [key, entry] of representationCache) {
    if (now - entry.createdAt <= CACHE_TTL_MS) continue;
    representationCache.delete(key);
    cachedBytes -= entry.body.byteLength;
  }
  while (representationCache.size > MAX_CACHE_ENTRIES || cachedBytes > MAX_CACHE_BYTES) {
    const oldest = representationCache.entries().next().value as [string, CachedRepresentation] | undefined;
    if (!oldest) break;
    representationCache.delete(oldest[0]);
    cachedBytes -= oldest[1].body.byteLength;
  }
}

function matchesEtag(header: string, etag: string) {
  return String(header || '').split(',').map((value) => value.trim().replace(/^W\//, ''))
    .some((value) => value === etag || value === '*');
}

function cachedResponse(request: Request, variantKey: string) {
  if (!variantKey) return null;
  const now = Date.now();
  pruneCache(now);
  const entry = representationCache.get(variantKey);
  if (!entry) return null;
  representationCache.delete(variantKey);
  representationCache.set(variantKey, entry);
  const headers = new Headers(entry.headers as [string, string][]);
  headers.set('Cache-Status', 'TuSenda84-Promo-Origin; hit');
  if (matchesEtag(request.headers.get('if-none-match') || '', entry.etag)) {
    headers.delete('Content-Length');
    return new Response(null, { status: 304, headers });
  }
  return new Response(Buffer.from(entry.body), { status: entry.status, headers });
}

async function encodeBody(raw: Buffer, requested: PromoContentEncoding) {
  if (raw.byteLength < MIN_COMPRESS_BYTES || requested === 'identity') {
    return { body: raw, encoding: 'identity' as const };
  }
  if (requested === 'br') {
    const body = await brotliCompress(raw, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
        [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
      },
    });
    return { body, encoding: 'br' as const };
  }
  return { body: await gzip(raw, { level: 6 }), encoding: 'gzip' as const };
}

function cacheHeaders(response: Response, encoding: PromoContentEncoding, body: Buffer, etag: string) {
  const headers = new Headers(response.headers);
  for (const name of ['Connection', 'Content-Length', 'Set-Cookie', 'Transfer-Encoding']) headers.delete(name);
  if (encoding === 'identity') headers.delete('Content-Encoding');
  else headers.set('Content-Encoding', encoding);
  headers.set('Content-Length', String(body.byteLength));
  headers.set('ETag', etag);
  appendVary(headers, 'Accept-Encoding');
  return headers;
}

async function prepareRepresentation(
  request: Request,
  result: PromoPublicShellResult,
  response: Response,
) {
  const contentType = response.headers.get('Content-Type') || '';
  if (response.status !== 200 || !contentType.toLowerCase().startsWith('text/html')
    || response.headers.has('Content-Encoding')) return response;
  const raw = Buffer.from(await response.arrayBuffer());
  if (raw.byteLength > MAX_SOURCE_BYTES) {
    const headers = new Headers(response.headers);
    headers.set('Cache-Status', 'TuSenda84-Promo-Origin; fwd=uri-miss; detail=representation-too-large');
    return new Response(raw, { status: response.status, headers });
  }
  const requestedEncoding = selectPromoContentEncoding(request.headers.get('accept-encoding') || '');
  const encoded = await encodeBody(raw, requestedEncoding);
  const variantKey = promoRepresentationVariantKey(result, encoded.encoding);
  const etag = variantKey
    ? `"pz-promo-${createHash('sha256').update(variantKey).update(encoded.body).digest('hex').slice(0, 32)}"`
    : '';
  const headers = cacheHeaders(response, encoded.encoding, encoded.body, etag || '');
  if (!etag) {
    headers.delete('ETag');
    headers.set('Cache-Status', 'TuSenda84-Promo-Origin; fwd=uri-miss; detail=cache-key-unavailable');
    return new Response(encoded.body, { status: response.status, headers });
  }
  if (encoded.body.byteLength > PROMO_PERFORMANCE_BUDGETS.htmlCompressedBytes) {
    headers.set('Cache-Status', 'TuSenda84-Promo-Origin; fwd=uri-miss; detail=html-budget-exceeded');
    return new Response(encoded.body, { status: response.status, headers });
  }
  const storedHeaders = Array.from(headers.entries()).filter(([name]) => name.toLowerCase() !== 'set-cookie');
  const previous = representationCache.get(variantKey);
  if (previous) cachedBytes -= previous.body.byteLength;
  const stored = Object.freeze({
    body: Buffer.from(encoded.body),
    createdAt: Date.now(),
    etag,
    headers: storedHeaders,
    status: response.status,
  });
  representationCache.set(variantKey, stored);
  cachedBytes += stored.body.byteLength;
  pruneCache(Date.now());
  headers.set('Cache-Status', 'TuSenda84-Promo-Origin; fwd=uri-miss; stored');
  return new Response(encoded.body, { status: response.status, headers });
}

export async function servePromoPublicRepresentation(
  request: Request,
  result: PromoPublicShellResult,
  render: () => Promise<Response>,
) {
  if (request.method !== 'GET') return render();
  const selected = selectPromoContentEncoding(request.headers.get('accept-encoding') || '');
  const selectedVariant = promoRepresentationVariantKey(result, selected);
  const hit = cachedResponse(request, selectedVariant);
  if (hit) return hit;
  if (selectedVariant) {
    const pending = pendingRepresentations.get(selectedVariant);
    if (pending) {
      await pending;
      const coalesced = cachedResponse(request, selectedVariant);
      if (coalesced) return coalesced;
    }
  }
  let releasePending: (() => void) | null = null;
  if (selectedVariant) {
    const pending = new Promise<void>((resolve) => { releasePending = resolve; });
    pendingRepresentations.set(selectedVariant, pending);
  }
  try {
    return await prepareRepresentation(request, result, await render());
  } finally {
    releasePending?.();
    if (selectedVariant) pendingRepresentations.delete(selectedVariant);
  }
}

export function resetPromoRepresentationCacheForTests() {
  representationCache.clear();
  pendingRepresentations.clear();
  cachedBytes = 0;
}
