const STORE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function storefrontAppDownloadAliasUrl(publicPocketBaseOrigin: unknown, rawStoreSlug: unknown) {
  const storeSlug = String(rawStoreSlug || '').trim().toLowerCase();
  if (!STORE_SLUG_PATTERN.test(storeSlug) || storeSlug.length > 80) return '';
  try {
    const origin = new URL(String(publicPocketBaseOrigin || '').trim());
    if (!['http:', 'https:'].includes(origin.protocol)
      || origin.username || origin.password || origin.search || origin.hash
      || (origin.pathname && origin.pathname !== '/')) return '';
    return `${origin.origin}/api/pz/storefront-app-downloads/by-store/${encodeURIComponent(storeSlug)}`;
  } catch (_) {
    return '';
  }
}
