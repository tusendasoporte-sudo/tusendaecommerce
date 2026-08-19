export const STORE_VISUAL_IMAGE_MAX_WIDTH = 1200;
export const STORE_VISUAL_IMAGE_MAX_HEIGHT = 675;
export const STORE_VISUAL_IMAGE_WEBP_QUALITY = 0.82;

const CONVERTIBLE_STORE_VISUAL_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
]);

export function shouldConvertStoreVisualImageType(type) {
  return CONVERTIBLE_STORE_VISUAL_IMAGE_TYPES.has(String(type || '').trim().toLowerCase());
}

export function getStoreVisualImageDimensions(width, height) {
  const sourceWidth = Math.max(0, Math.round(Number(width) || 0));
  const sourceHeight = Math.max(0, Math.round(Number(height) || 0));
  if (!sourceWidth || !sourceHeight) return { width: 0, height: 0 };

  const ratio = Math.min(
    1,
    STORE_VISUAL_IMAGE_MAX_WIDTH / sourceWidth,
    STORE_VISUAL_IMAGE_MAX_HEIGHT / sourceHeight,
  );
  return {
    width: Math.max(1, Math.round(sourceWidth * ratio)),
    height: Math.max(1, Math.round(sourceHeight * ratio)),
  };
}

export function shouldUseStoreVisualWebp(originalSize, webpSize) {
  const sourceBytes = Number(originalSize) || 0;
  const outputBytes = Number(webpSize) || 0;
  return sourceBytes > 0 && outputBytes > 0 && outputBytes < sourceBytes;
}

export function isStoreVisualWebpBlob(blob) {
  return String(blob?.type || '').trim().toLowerCase() === 'image/webp';
}

export function buildStoreVisualWebpFilename(filename) {
  const safeName = String(filename || 'visual')
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 72) || 'visual';
  return `${safeName}_visual.webp`;
}

async function decodeBrowserImage(file) {
  if (typeof globalThis.createImageBitmap === 'function') {
    try {
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
    } catch {
      // Algunos navegadores requieren el decodificador HTML para ciertos JPEG o PNG.
    }
  }

  const ImageConstructor = globalThis.Image;
  const urlApi = globalThis.URL;
  if (!ImageConstructor || typeof urlApi?.createObjectURL !== 'function') {
    throw new Error('store_visual_image_decoder_unavailable');
  }

  const objectUrl = urlApi.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new ImageConstructor();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = objectUrl;
    });
    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      draw(context, width, height) {
        context.drawImage(image, 0, 0, width, height);
      },
      close() {
        urlApi.revokeObjectURL(objectUrl);
      },
    };
  } catch (error) {
    urlApi.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function encodeBrowserWebp(decoded, { width, height, quality }) {
  const documentObject = globalThis.document;
  if (!documentObject?.createElement) throw new Error('store_visual_image_canvas_unavailable');

  const canvas = documentObject.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('store_visual_image_canvas_context_unavailable');

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  decoded.draw(context, width, height);

  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/webp', quality);
  });
}

function createBrowserFile(blob, filename, options) {
  return new globalThis.File([blob], filename, options);
}

export async function optimizeStoreVisualImageFile(file, runtime = {}) {
  if (!file || !shouldConvertStoreVisualImageType(file.type)) return file;

  const decodeImage = runtime.decodeImage || decodeBrowserImage;
  const encodeWebp = runtime.encodeWebp || encodeBrowserWebp;
  const createFile = runtime.createFile || createBrowserFile;
  let decoded = null;

  try {
    decoded = await decodeImage(file);
    const dimensions = getStoreVisualImageDimensions(decoded?.width, decoded?.height);
    if (!dimensions.width || !dimensions.height) return file;

    const blob = await encodeWebp(decoded, {
      ...dimensions,
      quality: STORE_VISUAL_IMAGE_WEBP_QUALITY,
    });
    if (!isStoreVisualWebpBlob(blob) || !shouldUseStoreVisualWebp(file.size, blob.size)) return file;

    return createFile(blob, buildStoreVisualWebpFilename(file.name), {
      type: 'image/webp',
      lastModified: Number(runtime.now?.() ?? Date.now()),
    });
  } catch {
    return file;
  } finally {
    try {
      if (typeof decoded?.close === 'function') decoded.close();
    } catch {
      // La limpieza del decodificador no debe invalidar el archivo procesado.
    }
  }
}
