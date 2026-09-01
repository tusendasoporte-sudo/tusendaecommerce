const STORE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;

function normalizedStoreSlug(rawStoreSlug: unknown) {
  const storeSlug = String(rawStoreSlug || '').trim().toLowerCase();
  return STORE_SLUG_PATTERN.test(storeSlug) && storeSlug.length <= 80 ? storeSlug : '';
}

function normalizedOrigin(value: unknown) {
  try {
    const origin = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(origin.protocol)
      || origin.username || origin.password || origin.search || origin.hash
      || (origin.pathname && origin.pathname !== '/')) return '';
    return origin.origin;
  } catch (_) {
    return '';
  }
}

export function storefrontAppDownloadAliasUrl(publicPocketBaseOrigin: unknown, rawStoreSlug: unknown) {
  const origin = normalizedOrigin(publicPocketBaseOrigin);
  const storeSlug = normalizedStoreSlug(rawStoreSlug);
  return origin && storeSlug
    ? `${origin}/api/pz/storefront-app-downloads/by-store/${encodeURIComponent(storeSlug)}` : '';
}

export function storefrontAppDownloadMetadataUrl(pocketBaseOrigin: unknown, rawStoreSlug: unknown) {
  const alias = storefrontAppDownloadAliasUrl(pocketBaseOrigin, rawStoreSlug);
  return alias ? `${alias}/metadata` : '';
}

export type StorefrontAppDownloadMetadata = Readonly<{
  displayName: string;
  bytes: number;
  publishedAt: string;
  versionCode: number;
  versionName: string;
}>;

function normalizedPublishedAt(value: unknown) {
  const raw = String(value || '').trim().slice(0, 80);
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : '';
}

export function parseStorefrontAppDownloadMetadata(value: unknown): StorefrontAppDownloadMetadata | null {
  const payload = value && typeof value === 'object' && !Array.isArray(value) ? value as any : null;
  const app = payload?.app && typeof payload.app === 'object' ? payload.app : null;
  const artifact = payload?.artifact && typeof payload.artifact === 'object' ? payload.artifact : null;
  const displayName = String(app?.display_name || '').trim().slice(0, 120);
  const bytes = Number(artifact?.bytes);
  const publishedAt = normalizedPublishedAt(artifact?.published_at);
  const versionCode = Number(artifact?.version_code);
  const versionName = String(artifact?.version_name || '').trim();
  if (payload?.ok !== true || !displayName || !Number.isSafeInteger(bytes) || bytes < 1
    || !Number.isSafeInteger(versionCode) || versionCode < 1
    || !VERSION_PATTERN.test(versionName)) return null;
  return { displayName, bytes, publishedAt, versionCode, versionName };
}

export function formatStorefrontAppDownloadSize(bytes: unknown) {
  const value = Number(bytes);
  if (!Number.isSafeInteger(value) || value < 1) return '';
  const megabytes = value / (1024 * 1024);
  return `${megabytes.toFixed(1).replace(/\.0$/, '')} MB`;
}

export function formatStorefrontAppPublishedDate(value: unknown) {
  const publishedAt = normalizedPublishedAt(value);
  if (!publishedAt) return '';
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Havana',
  }).format(new Date(publishedAt));
}
