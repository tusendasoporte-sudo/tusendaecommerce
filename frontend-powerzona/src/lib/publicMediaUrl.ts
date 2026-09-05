function normalizePublicOrigin(value: unknown) {
  const candidate = String(value || '').trim();
  if (!candidate) return '';

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    if (url.username || url.password || url.search || url.hash) return '';
    if (url.pathname !== '/' && url.pathname !== '') return '';
    return url.origin;
  } catch {
    return '';
  }
}

export function resolvePublicMediaBaseUrl(mediaCdnUrl: unknown, pocketbaseUrl: unknown) {
  const configuredMediaUrl = String(mediaCdnUrl || '').trim();
  if (configuredMediaUrl) return normalizePublicOrigin(configuredMediaUrl);
  return normalizePublicOrigin(pocketbaseUrl);
}

// The API already has its own connection hint. Do not duplicate it or add a
// connection for the current document's origin when the CDN is not separate.
export function getPublicMediaPreconnectOrigin(mediaCdnUrl: unknown, pocketbaseUrl: unknown, pageOrigin: unknown) {
  const mediaOrigin = resolvePublicMediaBaseUrl(mediaCdnUrl, pocketbaseUrl);
  return mediaOrigin
    && mediaOrigin !== normalizePublicOrigin(pocketbaseUrl)
    && mediaOrigin !== normalizePublicOrigin(pageOrigin)
    ? mediaOrigin
    : '';
}
