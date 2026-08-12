import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import sharp from 'sharp';

export const STOREFRONT_PUSH_MEDIA_INPUT_MAX_BYTES = 8 * 1024 * 1024;
export const STOREFRONT_PUSH_MEDIA_INPUT_MAX_SIDE = 6000;
export const STOREFRONT_PUSH_MEDIA_INPUT_MAX_PIXELS = 36_000_000;
export const STOREFRONT_PUSH_MEDIA_OUTPUT_MAX_BYTES = 100 * 1024;
export const STOREFRONT_PUSH_MEDIA_OUTPUT_MAX_WIDTH = 1200;
export const STOREFRONT_PUSH_MEDIA_OUTPUT_MAX_HEIGHT = 630;
export const STOREFRONT_PUSH_MEDIA_WEBP_QUALITIES = Object.freeze([82, 72, 62, 52, 42, 34, 28]);
export const STOREFRONT_PUSH_MEDIA_OUTPUT_PROFILES = Object.freeze([
  Object.freeze({ width: 1200, height: 630 }),
  Object.freeze({ width: 1000, height: 525 }),
  Object.freeze({ width: 800, height: 420 }),
  Object.freeze({ width: 640, height: 336 }),
  Object.freeze({ width: 480, height: 252 }),
]);
export const STOREFRONT_PUSH_MEDIA_MULTIPART_MAX_BYTES = STOREFRONT_PUSH_MEDIA_INPUT_MAX_BYTES + (256 * 1024);
export const STOREFRONT_PUSH_MEDIA_MAX_CONCURRENT_CONVERSIONS = 1;
export const STOREFRONT_PUSH_MEDIA_MAX_PENDING_CONVERSIONS = 4;

const INPUT_TYPES = Object.freeze({
  jpeg: Object.freeze({ extensions: Object.freeze(['jpg', 'jpeg']), mime: 'image/jpeg' }),
  png: Object.freeze({ extensions: Object.freeze(['png']), mime: 'image/png' }),
  webp: Object.freeze({ extensions: Object.freeze(['webp']), mime: 'image/webp' }),
});

export type StorefrontPushMediaErrorCode =
  | 'media_required'
  | 'media_name_invalid'
  | 'media_type_invalid'
  | 'media_type_mismatch'
  | 'media_empty'
  | 'media_input_too_large'
  | 'media_dimensions_invalid'
  | 'media_dimensions_too_large'
  | 'media_animated_unsupported'
  | 'media_corrupt'
  | 'media_output_too_large'
  | 'media_output_invalid'
  | 'media_busy'
  | 'media_origin_invalid'
  | 'media_record_invalid';

export class StorefrontPushMediaError extends Error {
  readonly code: StorefrontPushMediaErrorCode;

  constructor(code: StorefrontPushMediaErrorCode) {
    super(code);
    this.name = 'StorefrontPushMediaError';
    this.code = code;
  }
}

export type StorefrontPushMediaFile = Pick<File, 'name' | 'type' | 'size' | 'arrayBuffer'>;

export type OptimizedStorefrontPushMedia = Readonly<{
  buffer: Buffer;
  filename: string;
  mime: 'image/webp';
  sha256: string;
  width: number;
  height: number;
  bytes: number;
  quality: number;
  sourceFormat: 'jpeg' | 'png' | 'webp';
}>;

let activeConversions = 0;
const pendingConversions: Array<() => void> = [];

export async function withStorefrontPushMediaConversionSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeConversions >= STOREFRONT_PUSH_MEDIA_MAX_CONCURRENT_CONVERSIONS) {
    if (pendingConversions.length >= STOREFRONT_PUSH_MEDIA_MAX_PENDING_CONVERSIONS) {
      throw new StorefrontPushMediaError('media_busy');
    }
    await new Promise<void>((resolve) => pendingConversions.push(resolve));
  }
  activeConversions += 1;
  try {
    return await task();
  } finally {
    activeConversions -= 1;
    const next = pendingConversions.shift();
    if (next) next();
  }
}

function normalizedInputName(value: unknown) {
  const name = String(value || '').trim();
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f/\\]/.test(name)) {
    throw new StorefrontPushMediaError('media_name_invalid');
  }
  const match = name.match(/^([A-Za-z0-9][A-Za-z0-9 _-]{0,99})\.(jpe?g|png|webp)$/i);
  if (!match) throw new StorefrontPushMediaError('media_name_invalid');
  return { name, extension: match[2].toLowerCase() };
}

function inputFileLike(file: unknown): file is StorefrontPushMediaFile {
  const candidate = file as StorefrontPushMediaFile | null;
  return !!candidate
    && typeof candidate.name === 'string'
    && typeof candidate.type === 'string'
    && Number.isFinite(candidate.size)
    && typeof candidate.arrayBuffer === 'function';
}

function assertInputMetadata(file: unknown) {
  if (!inputFileLike(file)) throw new StorefrontPushMediaError('media_required');
  const name = normalizedInputName(file.name);
  const type = String(file.type || '').trim().toLowerCase();
  if (!Object.values(INPUT_TYPES).some((definition) => definition.mime === type)) {
    throw new StorefrontPushMediaError('media_type_invalid');
  }
  if (!Number.isInteger(file.size) || file.size <= 0) {
    throw new StorefrontPushMediaError('media_empty');
  }
  if (file.size > STOREFRONT_PUSH_MEDIA_INPUT_MAX_BYTES) {
    throw new StorefrontPushMediaError('media_input_too_large');
  }
  return { file, extension: name.extension, declaredType: type };
}

function validDimensions(width: unknown, height: unknown) {
  return Number.isInteger(width) && Number.isInteger(height)
    && Number(width) > 0 && Number(height) > 0;
}

function assertSourceMatches(
  format: unknown,
  extension: string,
  declaredType: string,
) {
  if (!Object.prototype.hasOwnProperty.call(INPUT_TYPES, String(format || ''))) {
    throw new StorefrontPushMediaError('media_type_invalid');
  }
  const sourceFormat = String(format) as keyof typeof INPUT_TYPES;
  const definition = INPUT_TYPES[sourceFormat];
  const allowedExtensions: readonly string[] = definition.extensions;
  if (!allowedExtensions.includes(extension) || definition.mime !== declaredType) {
    throw new StorefrontPushMediaError('media_type_mismatch');
  }
  return sourceFormat;
}

export function randomStorefrontPushMediaFilename(randomSource: (size: number) => Buffer = randomBytes) {
  const token = randomSource(16).toString('hex').toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(token)) throw new StorefrontPushMediaError('media_output_invalid');
  return `${token}.webp`;
}

export async function optimizeStorefrontPushMediaUpload(
  file: unknown,
  options: { randomSource?: (size: number) => Buffer } = {},
): Promise<OptimizedStorefrontPushMedia> {
  const input = assertInputMetadata(file);
  let source: Buffer;
  try {
    source = Buffer.from(await input.file.arrayBuffer());
  } catch (_) {
    throw new StorefrontPushMediaError('media_corrupt');
  }
  if (source.byteLength !== input.file.size || source.byteLength > STOREFRONT_PUSH_MEDIA_INPUT_MAX_BYTES) {
    throw new StorefrontPushMediaError('media_input_too_large');
  }

  let metadata;
  try {
    metadata = await sharp(source, {
      failOn: 'error',
      limitInputPixels: STOREFRONT_PUSH_MEDIA_INPUT_MAX_PIXELS,
      sequentialRead: true,
    }).metadata();
  } catch (_) {
    throw new StorefrontPushMediaError('media_corrupt');
  }

  const sourceFormat = assertSourceMatches(metadata.format, input.extension, input.declaredType);
  if (!validDimensions(metadata.width, metadata.height)) {
    throw new StorefrontPushMediaError('media_dimensions_invalid');
  }
  const sourcePixels = Number(metadata.width) * Number(metadata.height);
  if (Number(metadata.width) > STOREFRONT_PUSH_MEDIA_INPUT_MAX_SIDE
    || Number(metadata.height) > STOREFRONT_PUSH_MEDIA_INPUT_MAX_SIDE
    || sourcePixels > STOREFRONT_PUSH_MEDIA_INPUT_MAX_PIXELS) {
    throw new StorefrontPushMediaError('media_dimensions_too_large');
  }
  if (Number(metadata.pages || 1) !== 1) {
    throw new StorefrontPushMediaError('media_animated_unsupported');
  }

  let output: Buffer | null = null;
  let outputQuality = 0;
  for (const profile of STOREFRONT_PUSH_MEDIA_OUTPUT_PROFILES) {
    for (const quality of STOREFRONT_PUSH_MEDIA_WEBP_QUALITIES) {
      try {
        const candidate = await sharp(source, {
          failOn: 'error',
          limitInputPixels: STOREFRONT_PUSH_MEDIA_INPUT_MAX_PIXELS,
          sequentialRead: true,
        })
          .rotate()
          .resize({
            width: profile.width,
            height: profile.height,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality, effort: 4, smartSubsample: true })
          .toBuffer();
        if (candidate.byteLength <= STOREFRONT_PUSH_MEDIA_OUTPUT_MAX_BYTES) {
          output = candidate;
          outputQuality = quality;
          break;
        }
      } catch (_) {
        throw new StorefrontPushMediaError('media_corrupt');
      }
    }
    if (output) break;
  }
  if (!output) throw new StorefrontPushMediaError('media_output_too_large');

  let outputMetadata;
  try {
    outputMetadata = await sharp(output, { failOn: 'error' }).metadata();
  } catch (_) {
    throw new StorefrontPushMediaError('media_output_invalid');
  }
  if (outputMetadata.format !== 'webp'
    || !validDimensions(outputMetadata.width, outputMetadata.height)
    || Number(outputMetadata.width) > STOREFRONT_PUSH_MEDIA_OUTPUT_MAX_WIDTH
    || Number(outputMetadata.height) > STOREFRONT_PUSH_MEDIA_OUTPUT_MAX_HEIGHT
    || output.byteLength > STOREFRONT_PUSH_MEDIA_OUTPUT_MAX_BYTES) {
    throw new StorefrontPushMediaError('media_output_invalid');
  }

  return Object.freeze({
    buffer: output,
    filename: randomStorefrontPushMediaFilename(options.randomSource),
    mime: 'image/webp' as const,
    sha256: createHash('sha256').update(output).digest('hex'),
    width: Number(outputMetadata.width),
    height: Number(outputMetadata.height),
    bytes: output.byteLength,
    quality: outputQuality,
    sourceFormat,
  });
}

function normalizedPublicOrigin(value: unknown) {
  try {
    const url = new URL(String(value || '').trim());
    const localHttp = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !localHttp)
      || url.username || url.password || url.search || url.hash
      || (url.pathname && url.pathname !== '/')) {
      throw new Error('invalid_origin');
    }
    return url.origin;
  } catch (_) {
    throw new StorefrontPushMediaError('media_origin_invalid');
  }
}

export function buildStorefrontPushMediaPublicUrl(
  origin: unknown,
  recordId: unknown,
  filename: unknown,
) {
  const safeRecordId = String(recordId || '').trim();
  const safeFilename = String(filename || '').trim();
  if (!/^[a-z0-9]{15}$/.test(safeRecordId)
    || !/^[A-Za-z0-9_-]{1,180}\.webp$/.test(safeFilename)) {
    throw new StorefrontPushMediaError('media_record_invalid');
  }
  return `${normalizedPublicOrigin(origin)}/api/pz/storefront/v1/media/file/${safeRecordId}/${encodeURIComponent(safeFilename)}`;
}

export function storefrontPushMediaSameOriginMutation(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const originValue = String(request.headers.get('origin') || '').trim();
    const origin = new URL(originValue);
    const fetchSite = String(request.headers.get('sec-fetch-site') || '').trim().toLowerCase();
    if (fetchSite && fetchSite !== 'same-origin') return false;
    if (origin.origin === requestUrl.origin) return true;

    const forwardedProto = String(request.headers.get('x-forwarded-proto') || '').trim().toLowerCase();
    const forwardedHost = String(request.headers.get('x-forwarded-host') || '').trim().toLowerCase();
    if (!forwardedProto || !forwardedHost
      || forwardedProto.includes(',') || forwardedHost.includes(',')) return false;
    return forwardedProto === origin.protocol.slice(0, -1)
      && forwardedHost === requestUrl.host.toLowerCase()
      && forwardedHost === origin.host.toLowerCase();
  } catch (_) {
    return false;
  }
}

export function storefrontPushMediaErrorStatus(error: unknown) {
  const code = error instanceof StorefrontPushMediaError ? error.code : '';
  if (code === 'media_busy') return 429;
  if (code === 'media_input_too_large' || code === 'media_output_too_large') return 413;
  return code ? 400 : 500;
}
