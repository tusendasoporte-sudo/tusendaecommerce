export const STORE_SOCIAL_IMAGE_WIDTH = 1200;
export const STORE_SOCIAL_IMAGE_HEIGHT = 630;
export const STORE_SOCIAL_IMAGE_REVISION = '20260820a';

export function cleanStoreSeoText(value: unknown, fallback = '') {
  const text = String(value ?? fallback)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || fallback;
}

export function buildStoreSocialImagePath(input: { storeSlug: unknown; version?: unknown }) {
  const storeSlug = encodeURIComponent(cleanStoreSeoText(input.storeSlug).toLowerCase());
  if (!storeSlug) return '';

  const version = cleanStoreSeoText(input.version);
  const searchParams = new URLSearchParams({ r: STORE_SOCIAL_IMAGE_REVISION });
  if (version) searchParams.set('v', version);
  return `/api/og/tienda/${storeSlug}.jpg?${searchParams.toString()}`;
}
