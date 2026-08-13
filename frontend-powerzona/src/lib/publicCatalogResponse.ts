const PUBLIC_CATALOG_CACHE_CONTROL = 'private, max-age=15, stale-while-revalidate=30';

const LEGACY_PUBLIC_CATALOG_PATH = /^\/(?:categoria|subcategoria|producto)\/[^/]+\/?$/;
const LEGACY_PUBLIC_CATALOG_INDEX = /^\/(?:buscar|regalos)\/?$/;
const STORE_PUBLIC_CATALOG_PATH = /^\/t\/[^/]+(?:\/(?:categoria|subcategoria|producto)\/[^/]+|\/(?:buscar|regalos))?\/?$/;

export function isPublicCatalogPath(pathname: string) {
  const normalizedPath = String(pathname || '').replace(/\/{2,}/g, '/');
  return normalizedPath === '/'
    || LEGACY_PUBLIC_CATALOG_PATH.test(normalizedPath)
    || LEGACY_PUBLIC_CATALOG_INDEX.test(normalizedPath)
    || STORE_PUBLIC_CATALOG_PATH.test(normalizedPath);
}

export function acceptsGzip(value: string | null) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .some((item) => {
      const [encoding, ...parameters] = item.split(';').map((part) => part.trim());
      if (encoding !== 'gzip' && encoding !== '*') return false;
      const quality = parameters.find((parameter) => parameter.startsWith('q='));
      return !quality || Number(quality.slice(2)) > 0;
    });
}

function appendVary(headers: Headers, value: string) {
  const current = String(headers.get('Vary') || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!current.some((item) => item.toLowerCase() === value.toLowerCase())) current.push(value);
  headers.set('Vary', current.join(', '));
}

export function optimizePublicCatalogResponse(request: Request, response: Response, pathname: string) {
  if (!isPublicCatalogPath(pathname) || response.status !== 200) return response;

  const headers = new Headers(response.headers);
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', PUBLIC_CATALOG_CACHE_CONTROL);

  const contentType = String(headers.get('Content-Type') || '').toLowerCase();
  const canCompress = request.method !== 'HEAD'
    && response.body
    && contentType.includes('text/html')
    && !headers.has('Content-Encoding')
    && acceptsGzip(request.headers.get('Accept-Encoding'))
    && typeof CompressionStream !== 'undefined';

  if (!canCompress) return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });

  headers.set('Content-Encoding', 'gzip');
  headers.delete('Content-Length');
  appendVary(headers, 'Accept-Encoding');

  return new Response(response.body.pipeThrough(new CompressionStream('gzip')), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
