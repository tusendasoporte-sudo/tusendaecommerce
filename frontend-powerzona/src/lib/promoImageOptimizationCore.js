export const PROMO_UPLOAD_IMAGE_TARGET_BYTES = 768 * 1024;
export const PROMO_UPLOAD_IMAGE_WEBP_QUALITIES = Object.freeze([0.84, 0.74, 0.64, 0.54, 0.44]);

const PROMO_UPLOAD_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);

const PROMO_UPLOAD_IMAGE_POLICIES = Object.freeze({
  hero: Object.freeze({ minWidth: 640, minHeight: 320, maxWidth: 1920, maxHeight: 1080 }),
  service: Object.freeze({ minWidth: 240, minHeight: 240, maxWidth: 1200, maxHeight: 1200 }),
  gallery: Object.freeze({ minWidth: 320, minHeight: 240, maxWidth: 1600, maxHeight: 1600 }),
  owner: Object.freeze({ minWidth: 320, minHeight: 400, maxWidth: 1200, maxHeight: 1600 }),
  footer: Object.freeze({ minWidth: 480, minHeight: 120, maxWidth: 1600, maxHeight: 800 }),
  social: Object.freeze({ minWidth: 600, minHeight: 315, maxWidth: 1200, maxHeight: 630 }),
  video_poster: Object.freeze({ minWidth: 640, minHeight: 360, maxWidth: 1600, maxHeight: 900 }),
  qr: Object.freeze({ minWidth: 1, minHeight: 1, maxWidth: 512, maxHeight: 512 }),
  logo: Object.freeze({ minWidth: 1, minHeight: 1, maxWidth: 1024, maxHeight: 1024 }),
});

export function isPromoUploadImageType(type) {
  return PROMO_UPLOAD_IMAGE_TYPES.has(String(type || '').trim().toLowerCase());
}

export function getPromoUploadImageDimensions(purpose, width, height, scale = 1) {
  const policy = PROMO_UPLOAD_IMAGE_POLICIES[purpose];
  const sourceWidth = Math.max(0, Math.round(Number(width) || 0));
  const sourceHeight = Math.max(0, Math.round(Number(height) || 0));
  if (!policy || !sourceWidth || !sourceHeight) return { width: 0, height: 0 };

  const ratio = Math.min(
    1,
    policy.maxWidth / sourceWidth,
    policy.maxHeight / sourceHeight,
  ) * Math.min(1, Math.max(0.1, Number(scale) || 1));
  const targetWidth = Math.max(1, Math.round(sourceWidth * ratio));
  const targetHeight = Math.max(1, Math.round(sourceHeight * ratio));
  if (targetWidth < policy.minWidth || targetHeight < policy.minHeight) {
    return { width: 0, height: 0 };
  }
  return { width: targetWidth, height: targetHeight };
}

export function buildPromoUploadImageFilename(filename) {
  const safeName = String(filename || 'promo')
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 72) || 'promo';
  return `${safeName}_promo.webp`;
}

async function decodeBrowserImage(file) {
  if (typeof globalThis.createImageBitmap === 'function') {
    const bitmap = await globalThis.createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw(context, width, height) {
        context.drawImage(bitmap, 0, 0, width, height);
      },
      close() {
        if (typeof bitmap.close === 'function') bitmap.close();
      },
    };
  }
  throw new Error('promo_media_type_mismatch');
}

async function encodeBrowserWebp(decoded, { width, height, quality }) {
  const documentObject = globalThis.document;
  if (!documentObject?.createElement) throw new Error('promo_media_unavailable');
  const canvas = documentObject.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('promo_media_unavailable');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  decoded.draw(context, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
}

function createBrowserFile(blob, filename, options) {
  return new globalThis.File([blob], filename, options);
}

export async function optimizePromoUploadImageFile(file, purpose, runtime = {}) {
  if (!file || !isPromoUploadImageType(file.type)) throw new Error('promo_media_type_invalid');
  const policy = PROMO_UPLOAD_IMAGE_POLICIES[purpose];
  if (!policy) throw new Error('promo_media_type_invalid');

  const decodeImage = runtime.decodeImage || decodeBrowserImage;
  const encodeWebp = runtime.encodeWebp || encodeBrowserWebp;
  const createFile = runtime.createFile || createBrowserFile;
  let decoded = null;

  try {
    decoded = await decodeImage(file);
    const sourceWidth = Math.round(Number(decoded?.width) || 0);
    const sourceHeight = Math.round(Number(decoded?.height) || 0);
    if (sourceWidth < policy.minWidth || sourceHeight < policy.minHeight
      || sourceWidth > 6000 || sourceHeight > 6000
      || sourceWidth * sourceHeight > 36_000_000) {
      throw new Error('promo_media_dimensions_invalid');
    }

    const originalFitsTransport = file.size <= PROMO_UPLOAD_IMAGE_TARGET_BYTES
      && sourceWidth <= policy.maxWidth && sourceHeight <= policy.maxHeight;
    if (originalFitsTransport) return file;

    for (const scale of [1, 0.85, 0.7, 0.55]) {
      const dimensions = getPromoUploadImageDimensions(purpose, sourceWidth, sourceHeight, scale);
      if (!dimensions.width || !dimensions.height) continue;
      for (const quality of PROMO_UPLOAD_IMAGE_WEBP_QUALITIES) {
        const blob = await encodeWebp(decoded, { ...dimensions, quality });
        if (String(blob?.type || '').toLowerCase() !== 'image/webp' || !Number(blob?.size)) continue;
        if (blob.size <= PROMO_UPLOAD_IMAGE_TARGET_BYTES) {
          return createFile(blob, buildPromoUploadImageFilename(file.name), {
            type: 'image/webp',
            lastModified: Number(runtime.now?.() ?? Date.now()),
          });
        }
      }
    }
    throw new Error('promo_media_output_too_large');
  } finally {
    try {
      if (typeof decoded?.close === 'function') decoded.close();
    } catch {
      // La limpieza del decodificador no debe invalidar el archivo ya preparado.
    }
  }
}
