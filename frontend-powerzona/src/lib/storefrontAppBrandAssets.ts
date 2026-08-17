import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';

import sharp from 'sharp';

export const STOREFRONT_APP_BRAND_INPUT_MAX_BYTES = 12 * 1024 * 1024;
export const STOREFRONT_APP_BRAND_MULTIPART_MAX_BYTES = STOREFRONT_APP_BRAND_INPUT_MAX_BYTES + (256 * 1024);
export const STOREFRONT_APP_BRAND_INPUT_MAX_SIDE = 8000;
export const STOREFRONT_APP_BRAND_INPUT_MAX_PIXELS = 40_000_000;
export const STOREFRONT_APP_BRAND_OUTPUT_MAX_BYTES = 8 * 1024 * 1024;
export const STOREFRONT_APP_BRAND_NORMALIZER_VERSION = 'storefront-brand-v1-sharp-0.34';

export const STOREFRONT_APP_BRAND_PROFILES = Object.freeze({
  icon: Object.freeze({ width: 1024, height: 1024 }),
  splash: Object.freeze({ width: 1080, height: 1920 }),
});

const INPUT_TYPES = Object.freeze({
  jpeg: Object.freeze({ extensions: Object.freeze(['jpg', 'jpeg']), mime: 'image/jpeg' }),
  png: Object.freeze({ extensions: Object.freeze(['png']), mime: 'image/png' }),
  webp: Object.freeze({ extensions: Object.freeze(['webp']), mime: 'image/webp' }),
});

export type StorefrontAppBrandAssetKind = keyof typeof STOREFRONT_APP_BRAND_PROFILES;
export type StorefrontAppBrandFile = Pick<File, 'name' | 'type' | 'size' | 'arrayBuffer'>;
export type StorefrontAppBrandErrorCode =
  | 'brand_asset_required'
  | 'brand_asset_kind_invalid'
  | 'brand_asset_name_invalid'
  | 'brand_asset_type_invalid'
  | 'brand_asset_type_mismatch'
  | 'brand_asset_empty'
  | 'brand_asset_input_too_large'
  | 'brand_asset_dimensions_invalid'
  | 'brand_asset_dimensions_too_large'
  | 'brand_asset_animated_unsupported'
  | 'brand_asset_corrupt'
  | 'brand_asset_output_too_large'
  | 'brand_asset_output_invalid'
  | 'brand_asset_busy';

export class StorefrontAppBrandAssetError extends Error {
  readonly code: StorefrontAppBrandErrorCode;

  constructor(code: StorefrontAppBrandErrorCode) {
    super(code);
    this.name = 'StorefrontAppBrandAssetError';
    this.code = code;
  }
}

export type NormalizedStorefrontAppBrandAsset = Readonly<{
  buffer: Buffer;
  filename: string;
  mime: 'image/png';
  sha256: string;
  width: number;
  height: number;
  bytes: number;
  sourceFormat: 'jpeg' | 'png' | 'webp';
  sourceWidth: number;
  sourceHeight: number;
  normalizerVersion: typeof STOREFRONT_APP_BRAND_NORMALIZER_VERSION;
}>;

let activeConversions = 0;
const pendingConversions: Array<() => void> = [];

export async function withStorefrontAppBrandConversionSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeConversions >= 1) {
    if (pendingConversions.length >= 4) throw new StorefrontAppBrandAssetError('brand_asset_busy');
    await new Promise<void>((resolve) => pendingConversions.push(resolve));
  }
  activeConversions += 1;
  try {
    return await task();
  } finally {
    activeConversions -= 1;
    pendingConversions.shift()?.();
  }
}

function fileLike(file: unknown): file is StorefrontAppBrandFile {
  const candidate = file as StorefrontAppBrandFile | null;
  return !!candidate
    && typeof candidate.name === 'string'
    && typeof candidate.type === 'string'
    && Number.isFinite(candidate.size)
    && typeof candidate.arrayBuffer === 'function';
}

function inputMetadata(file: unknown) {
  if (!fileLike(file)) throw new StorefrontAppBrandAssetError('brand_asset_required');
  const name = String(file.name || '').trim();
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f/\\]/.test(name)) {
    throw new StorefrontAppBrandAssetError('brand_asset_name_invalid');
  }
  const match = name.match(/^(.+)\.(jpe?g|png|webp)$/i);
  if (!match || !String(match[1] || '').trim() || String(match[1]).startsWith('.')) {
    throw new StorefrontAppBrandAssetError('brand_asset_name_invalid');
  }
  const declaredType = String(file.type || '').trim().toLowerCase();
  if (!Object.values(INPUT_TYPES).some((entry) => entry.mime === declaredType)) {
    throw new StorefrontAppBrandAssetError('brand_asset_type_invalid');
  }
  if (!Number.isInteger(file.size) || file.size <= 0) {
    throw new StorefrontAppBrandAssetError('brand_asset_empty');
  }
  if (file.size > STOREFRONT_APP_BRAND_INPUT_MAX_BYTES) {
    throw new StorefrontAppBrandAssetError('brand_asset_input_too_large');
  }
  return { file, extension: String(match[2]).toLowerCase(), declaredType };
}

function sourceFormat(format: unknown, extension: string, declaredType: string) {
  const key = String(format || '') as keyof typeof INPUT_TYPES;
  const definition = INPUT_TYPES[key];
  if (!definition) throw new StorefrontAppBrandAssetError('brand_asset_type_invalid');
  const extensions: readonly string[] = definition.extensions;
  if (!extensions.includes(extension) || definition.mime !== declaredType) {
    throw new StorefrontAppBrandAssetError('brand_asset_type_mismatch');
  }
  return key;
}

function randomFilename(kind: StorefrontAppBrandAssetKind, randomSource: (size: number) => Buffer) {
  const token = randomSource(16).toString('hex').toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(token)) throw new StorefrontAppBrandAssetError('brand_asset_output_invalid');
  return `${kind}-${token}.png`;
}

export async function normalizeStorefrontAppBrandAsset(
  file: unknown,
  kind: StorefrontAppBrandAssetKind,
  options: { randomSource?: (size: number) => Buffer } = {},
): Promise<NormalizedStorefrontAppBrandAsset> {
  const profile = STOREFRONT_APP_BRAND_PROFILES[kind];
  if (!profile) throw new StorefrontAppBrandAssetError('brand_asset_kind_invalid');
  const input = inputMetadata(file);
  let source: Buffer;
  try {
    source = Buffer.from(await input.file.arrayBuffer());
  } catch (_) {
    throw new StorefrontAppBrandAssetError('brand_asset_corrupt');
  }
  if (source.byteLength !== input.file.size || source.byteLength > STOREFRONT_APP_BRAND_INPUT_MAX_BYTES) {
    throw new StorefrontAppBrandAssetError('brand_asset_input_too_large');
  }

  let metadata;
  try {
    metadata = await sharp(source, {
      failOn: 'error',
      limitInputPixels: STOREFRONT_APP_BRAND_INPUT_MAX_PIXELS,
      sequentialRead: true,
    }).metadata();
  } catch (_) {
    throw new StorefrontAppBrandAssetError('brand_asset_corrupt');
  }
  const format = sourceFormat(metadata.format, input.extension, input.declaredType);
  const sourceWidth = Number(metadata.autoOrient?.width || metadata.width || 0);
  const sourceHeight = Number(metadata.autoOrient?.height || metadata.height || 0);
  if (!Number.isInteger(sourceWidth) || sourceWidth <= 0 || !Number.isInteger(sourceHeight) || sourceHeight <= 0) {
    throw new StorefrontAppBrandAssetError('brand_asset_dimensions_invalid');
  }
  if (sourceWidth > STOREFRONT_APP_BRAND_INPUT_MAX_SIDE
    || sourceHeight > STOREFRONT_APP_BRAND_INPUT_MAX_SIDE
    || sourceWidth * sourceHeight > STOREFRONT_APP_BRAND_INPUT_MAX_PIXELS) {
    throw new StorefrontAppBrandAssetError('brand_asset_dimensions_too_large');
  }
  if (Number(metadata.pages || 1) !== 1) {
    throw new StorefrontAppBrandAssetError('brand_asset_animated_unsupported');
  }

  let output: Buffer;
  try {
    let pipeline = sharp(source, {
      failOn: 'error',
      limitInputPixels: STOREFRONT_APP_BRAND_INPUT_MAX_PIXELS,
      sequentialRead: true,
    })
      .rotate()
      .toColourspace('srgb')
      .resize({
        width: profile.width,
        height: profile.height,
        fit: 'contain',
        background: kind === 'icon'
          ? { r: 255, g: 255, b: 255, alpha: 0 }
          : { r: 255, g: 255, b: 255, alpha: 1 },
      });
    if (kind === 'splash') pipeline = pipeline.flatten({ background: '#FFFFFF' });
    output = await pipeline.png({ compressionLevel: 9, adaptiveFiltering: false, force: true }).toBuffer();
  } catch (_) {
    throw new StorefrontAppBrandAssetError('brand_asset_corrupt');
  }
  if (output.byteLength <= 0 || output.byteLength > STOREFRONT_APP_BRAND_OUTPUT_MAX_BYTES) {
    throw new StorefrontAppBrandAssetError('brand_asset_output_too_large');
  }

  let outputMetadata;
  try { outputMetadata = await sharp(output, { failOn: 'error' }).metadata(); }
  catch (_) { throw new StorefrontAppBrandAssetError('brand_asset_output_invalid'); }
  if (outputMetadata.format !== 'png'
    || outputMetadata.width !== profile.width
    || outputMetadata.height !== profile.height
    || Number(outputMetadata.pages || 1) !== 1) {
    throw new StorefrontAppBrandAssetError('brand_asset_output_invalid');
  }

  return Object.freeze({
    buffer: output,
    filename: randomFilename(kind, options.randomSource || randomBytes),
    mime: 'image/png' as const,
    sha256: createHash('sha256').update(output).digest('hex'),
    width: profile.width,
    height: profile.height,
    bytes: output.byteLength,
    sourceFormat: format,
    sourceWidth,
    sourceHeight,
    normalizerVersion: STOREFRONT_APP_BRAND_NORMALIZER_VERSION,
  });
}

export function storefrontAppBrandSameOriginMutation(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const origin = new URL(String(request.headers.get('origin') || '').trim());
    const fetchSite = String(request.headers.get('sec-fetch-site') || '').trim().toLowerCase();
    if (fetchSite && fetchSite !== 'same-origin') return false;
    if (origin.origin === requestUrl.origin) return true;
    const proto = String(request.headers.get('x-forwarded-proto') || '').trim().toLowerCase();
    const host = String(request.headers.get('x-forwarded-host') || '').trim().toLowerCase();
    return !!proto && !!host && !proto.includes(',') && !host.includes(',')
      && proto === origin.protocol.slice(0, -1) && host === requestUrl.host.toLowerCase();
  } catch (_) {
    return false;
  }
}
