/**
 * PocketBase can re-encode WebP thumbnails as PNG and make them heavier than
 * the normalized source. Keep thumbnails for legacy formats, but deliver an
 * already optimized WebP directly.
 *
 * @param {unknown} filename
 * @param {unknown} thumb
 * @returns {{} | { thumb: string }}
 */
export function getPublicImageDeliveryOptions(filename, thumb) {
  const normalizedFilename = String(filename || '').trim();
  const normalizedThumb = String(thumb || '').trim();
  if (!normalizedThumb || /\.webp$/i.test(normalizedFilename)) return {};
  return { thumb: normalizedThumb };
}
