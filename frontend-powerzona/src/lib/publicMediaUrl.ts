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
