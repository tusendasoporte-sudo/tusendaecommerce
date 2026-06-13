export function normalizeAdminStoreSlug(value: string | undefined | null) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'powerzona';
}

export function getStoreAdminBasePath(storeSlug: string | undefined | null) {
  return `/t/${encodeURIComponent(normalizeAdminStoreSlug(storeSlug))}/admin`;
}

export function getStoreAdminPath(storeSlug: string | undefined | null, section = '') {
  const basePath = getStoreAdminBasePath(storeSlug);
  const cleanSection = String(section || '').trim().replace(/^\/+|\/+$/g, '');
  return cleanSection ? `${basePath}/${cleanSection}` : basePath;
}

export function getPublicStorePath(storeSlug: string | undefined | null) {
  return `/t/${encodeURIComponent(normalizeAdminStoreSlug(storeSlug))}`;
}

export function getLegacyAdminSection(pathname: string) {
  const cleanPath = String(pathname || '').replace(/^\/admin\/?/, '').replace(/^\/+|\/+$/g, '');
  return cleanPath;
}
