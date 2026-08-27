import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import sharp from 'sharp';

export const PROMO_MEDIA_IMAGE_INPUT_MAX_BYTES = 8 * 1024 * 1024;
export const PROMO_MEDIA_IMAGE_OUTPUT_MAX_BYTES = 100 * 1024;
export const PROMO_MEDIA_VIDEO_MAX_BYTES = 25 * 1024 * 1024;
export const PROMO_MEDIA_VIDEO_MAX_DURATION_MS = 30 * 60 * 1000;
export const PROMO_MEDIA_VIDEO_MAX_BITRATE_BPS = 8 * 1000 * 1000;
export const PROMO_MEDIA_MULTIPART_MAX_BYTES = PROMO_MEDIA_VIDEO_MAX_BYTES + (512 * 1024);
const PROMO_CONTACT_IMAGE_SIZE = 512;

export const PROMO_MEDIA_PURPOSE_POLICIES = Object.freeze({
  hero: Object.freeze({ minWidth: 640, minHeight: 320, maxWidth: 1920, maxHeight: 1080 }),
  service: Object.freeze({ minWidth: 240, minHeight: 240, maxWidth: 1200, maxHeight: 1200 }),
  gallery: Object.freeze({ minWidth: 320, minHeight: 240, maxWidth: 1600, maxHeight: 1600 }),
  owner: Object.freeze({ minWidth: 320, minHeight: 400, maxWidth: 1200, maxHeight: 1600 }),
  footer: Object.freeze({ minWidth: 480, minHeight: 120, maxWidth: 1600, maxHeight: 800 }),
  social: Object.freeze({ minWidth: 600, minHeight: 315, maxWidth: 1200, maxHeight: 630 }),
  video_poster: Object.freeze({ minWidth: 640, minHeight: 360, maxWidth: 1600, maxHeight: 900 }),
  qr: Object.freeze({ minWidth: 128, minHeight: 128, maxWidth: 512, maxHeight: 512 }),
  review: Object.freeze({ minWidth: 320, minHeight: 240, maxWidth: 1600, maxHeight: 1600 }),
  logo: Object.freeze({ minWidth: 256, minHeight: 256, maxWidth: 1024, maxHeight: 1024 }),
});

export type PromoMediaPurpose = keyof typeof PROMO_MEDIA_PURPOSE_POLICIES;
export type PromoMediaErrorCode =
  | 'promo_media_required'
  | 'promo_media_name_invalid'
  | 'promo_media_type_invalid'
  | 'promo_media_type_mismatch'
  | 'promo_media_size_invalid'
  | 'promo_media_dimensions_invalid'
  | 'promo_media_animated_unsupported'
  | 'promo_media_corrupt'
  | 'promo_media_output_too_large'
  | 'promo_media_video_duration_invalid'
  | 'promo_media_video_bitrate_invalid'
  | 'promo_media_poster_required';

export class PromoMediaError extends Error {
  readonly code: PromoMediaErrorCode;

  constructor(code: PromoMediaErrorCode) {
    super(code);
    this.name = 'PromoMediaError';
    this.code = code;
  }
}

type FileLike = Pick<File, 'name' | 'type' | 'size' | 'arrayBuffer'>;

export type PreparedPromoMedia = Readonly<{
  buffer: Buffer;
  filename: string;
  kind: 'image' | 'video';
  purpose: PromoMediaPurpose;
  mime: 'image/webp' | 'video/mp4' | 'video/webm';
  sha256: string;
  bytes: number;
  width: number;
  height: number;
  durationMs: number;
  posterAssetId: string;
}>;

const IMAGE_TYPES = Object.freeze({
  jpeg: Object.freeze({ extensions: Object.freeze(['jpg', 'jpeg']), mime: 'image/jpeg' }),
  png: Object.freeze({ extensions: Object.freeze(['png']), mime: 'image/png' }),
  webp: Object.freeze({ extensions: Object.freeze(['webp']), mime: 'image/webp' }),
  heif: Object.freeze({ extensions: Object.freeze(['avif']), mime: 'image/avif' }),
});

function fileLike(value: unknown): value is FileLike {
  const file = value as FileLike | null;
  return !!file && typeof file.name === 'string' && typeof file.type === 'string'
    && Number.isSafeInteger(file.size) && typeof file.arrayBuffer === 'function';
}

function normalizedName(file: FileLike) {
  const name = String(file.name || '').trim();
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f/\\]/.test(name)) {
    throw new PromoMediaError('promo_media_name_invalid');
  }
  const match = name.match(/^(.+)\.([A-Za-z0-9]{2,5})$/);
  if (!match || !match[1].trim() || match[1].startsWith('.')) {
    throw new PromoMediaError('promo_media_name_invalid');
  }
  return { extension: match[2].toLowerCase(), name };
}

function randomFilename(extension: 'webp' | 'mp4' | 'webm', source = randomBytes) {
  const token = source(16).toString('hex').toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(token)) throw new PromoMediaError('promo_media_corrupt');
  return `${token}.${extension}`;
}

function assertPurpose(value: unknown): PromoMediaPurpose {
  const purpose = String(value || '') as PromoMediaPurpose;
  if (!Object.prototype.hasOwnProperty.call(PROMO_MEDIA_PURPOSE_POLICIES, purpose)) {
    throw new PromoMediaError('promo_media_type_invalid');
  }
  return purpose;
}

function assertDimensions(purpose: PromoMediaPurpose, width: number, height: number) {
  const policy = PROMO_MEDIA_PURPOSE_POLICIES[purpose];
  if ((purpose === 'qr' || purpose === 'logo')
    && (width !== PROMO_CONTACT_IMAGE_SIZE || height !== PROMO_CONTACT_IMAGE_SIZE)) {
    throw new PromoMediaError('promo_media_dimensions_invalid');
  }
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < policy.minWidth || height < policy.minHeight
    || width > policy.maxWidth || height > policy.maxHeight) {
    throw new PromoMediaError('promo_media_dimensions_invalid');
  }
}

function imageInput(file: unknown) {
  if (!fileLike(file)) throw new PromoMediaError('promo_media_required');
  const name = normalizedName(file);
  const type = String(file.type || '').trim().toLowerCase();
  const definition = Object.values(IMAGE_TYPES).find((item) => item.mime === type);
  if (!definition) throw new PromoMediaError('promo_media_type_invalid');
  if (!definition.extensions.includes(name.extension)) throw new PromoMediaError('promo_media_type_mismatch');
  if (file.size < 1 || file.size > PROMO_MEDIA_IMAGE_INPUT_MAX_BYTES) {
    throw new PromoMediaError('promo_media_size_invalid');
  }
  return { file, definition, extension: name.extension };
}

function orientedDimensions(metadata: sharp.Metadata) {
  const orientation = Number(metadata.orientation || 1);
  const swap = orientation >= 5 && orientation <= 8;
  return {
    width: Number(swap ? metadata.height : metadata.width),
    height: Number(swap ? metadata.width : metadata.height),
  };
}

export async function optimizePromoImage(
  file: unknown,
  purposeValue: unknown,
  options: { randomSource?: (size: number) => Buffer } = {},
): Promise<PreparedPromoMedia> {
  const purpose = assertPurpose(purposeValue);
  const input = imageInput(file);
  let source: Buffer;
  try { source = Buffer.from(await input.file.arrayBuffer()); }
  catch (_) { throw new PromoMediaError('promo_media_corrupt'); }
  if (source.byteLength !== input.file.size) throw new PromoMediaError('promo_media_size_invalid');

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(source, { failOn: 'error', limitInputPixels: 36_000_000, sequentialRead: true }).metadata();
  } catch (_) {
    throw new PromoMediaError('promo_media_corrupt');
  }
  const format = String(metadata.format || '') as keyof typeof IMAGE_TYPES;
  const detected = IMAGE_TYPES[format];
  if (!detected || detected.mime !== input.definition.mime || !detected.extensions.includes(input.extension)) {
    throw new PromoMediaError('promo_media_type_mismatch');
  }
  if (Number(metadata.pages || 1) !== 1) throw new PromoMediaError('promo_media_animated_unsupported');
  const oriented = orientedDimensions(metadata);
  if (!oriented.width || !oriented.height || oriented.width > 6000 || oriented.height > 6000
    || oriented.width * oriented.height > 36_000_000) throw new PromoMediaError('promo_media_dimensions_invalid');
  const policy = PROMO_MEDIA_PURPOSE_POLICIES[purpose];
  const normalizesContactImage = purpose === 'qr' || purpose === 'logo';
  if (!normalizesContactImage && (oriented.width < policy.minWidth || oriented.height < policy.minHeight)) {
    throw new PromoMediaError('promo_media_dimensions_invalid');
  }

  const scales = normalizesContactImage ? [1] : [1, 0.85, 0.7, 0.55, 0.42];
  const qualities = purpose === 'qr'
    ? [100, 96, 92, 88, 84, 80, 72, 64, 56]
    : [84, 76, 68, 60, 52, 44, 36, 28, 22];
  let output: Buffer | null = null;
  for (const scale of scales) {
    const width = Math.max(policy.minWidth, Math.round(policy.maxWidth * scale));
    const height = Math.max(policy.minHeight, Math.round(policy.maxHeight * scale));
    for (const quality of qualities) {
      try {
        const pipeline = sharp(source, { failOn: 'error', limitInputPixels: 36_000_000, sequentialRead: true })
          .rotate()
          .resize(purpose === 'qr'
            ? {
              width: PROMO_CONTACT_IMAGE_SIZE,
              height: PROMO_CONTACT_IMAGE_SIZE,
              fit: 'contain',
              background: '#ffffff',
              withoutEnlargement: false,
              kernel: oriented.width < PROMO_CONTACT_IMAGE_SIZE || oriented.height < PROMO_CONTACT_IMAGE_SIZE
                ? sharp.kernel.nearest
                : sharp.kernel.lanczos3,
            }
            : (purpose === 'logo'
              ? {
                width: PROMO_CONTACT_IMAGE_SIZE,
                height: PROMO_CONTACT_IMAGE_SIZE,
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 },
                withoutEnlargement: false,
              }
              : { width, height, fit: 'inside', withoutEnlargement: true }));
        const candidate = await (purpose === 'qr'
          ? (quality === 100
            ? pipeline.webp({ lossless: true, effort: 6 })
            : pipeline.webp({ quality, effort: 6, smartSubsample: true }))
          : pipeline.webp({ quality, effort: 4, smartSubsample: true }))
          .toBuffer();
        if (candidate.byteLength <= PROMO_MEDIA_IMAGE_OUTPUT_MAX_BYTES) {
          output = candidate;
          break;
        }
      } catch (_) {
        throw new PromoMediaError('promo_media_corrupt');
      }
    }
    if (output) break;
  }
  if (!output) throw new PromoMediaError('promo_media_output_too_large');
  const outputMetadata = await sharp(output, { failOn: 'error' }).metadata().catch(() => null);
  if (!outputMetadata || outputMetadata.format !== 'webp' || !outputMetadata.width || !outputMetadata.height) {
    throw new PromoMediaError('promo_media_corrupt');
  }
  assertDimensions(purpose, outputMetadata.width, outputMetadata.height);
  return Object.freeze({
    buffer: output,
    filename: randomFilename('webp', options.randomSource || randomBytes),
    kind: 'image',
    purpose,
    mime: 'image/webp',
    sha256: createHash('sha256').update(output).digest('hex'),
    bytes: output.byteLength,
    width: outputMetadata.width,
    height: outputMetadata.height,
    durationMs: 0,
    posterAssetId: '',
  });
}

function u32(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] * 0x10000)
    + (bytes[offset + 2] * 0x100) + bytes[offset + 3]);
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return Buffer.from(bytes.subarray(offset, offset + length)).toString('ascii');
}

type Box = { type: string; data: number; end: number };

function boxes(bytes: Uint8Array, start: number, end: number): Box[] | null {
  const result: Box[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    const size = u32(bytes, offset) || (end - offset);
    if (size < 8 || offset + size > end) return null;
    result.push({ type: ascii(bytes, offset + 4, 4), data: offset + 8, end: offset + size });
    offset += size;
  }
  return offset === end ? result : null;
}

function child(bytes: Uint8Array, parent: Box, type: string) {
  return boxes(bytes, parent.data, parent.end)?.find((item) => item.type === type) || null;
}

export function probePromoMp4(bytes: Uint8Array) {
  const roots = boxes(bytes, 0, bytes.length);
  const moov = roots?.find((item) => item.type === 'moov');
  const metadataBoxes = ['meta', 'udta', 'uuid', 'ilst'];
  if (!roots?.some((item) => item.type === 'ftyp') || !moov
    || roots.some((item) => metadataBoxes.includes(item.type))) return null;
  const mediaData = roots.filter((item) => item.type === 'mdat');
  if (!mediaData.length || mediaData.every((item) => item.end <= item.data)) return null;
  const moovChildren = boxes(bytes, moov.data, moov.end);
  if (!moovChildren || moovChildren.some((item) => metadataBoxes.includes(item.type))) return null;
  const mvhd = child(bytes, moov, 'mvhd');
  if (!mvhd || bytes[mvhd.data] !== 0 || mvhd.data + 20 > mvhd.end) return null;
  const timescale = u32(bytes, mvhd.data + 12);
  const duration = u32(bytes, mvhd.data + 16);
  let width = 0;
  let height = 0;
  moovChildren.filter((item) => item.type === 'trak').forEach((track) => {
    const tkhd = child(bytes, track, 'tkhd');
    const mdia = child(bytes, track, 'mdia');
    const hdlr = mdia && child(bytes, mdia, 'hdlr');
    if (!tkhd || !hdlr || ascii(bytes, hdlr.data + 8, 4) !== 'vide') return;
    width = Math.max(width, Math.floor(u32(bytes, tkhd.end - 8) / 65536));
    height = Math.max(height, Math.floor(u32(bytes, tkhd.end - 4) / 65536));
  });
  const durationMs = timescale ? Math.round((duration * 1000) / timescale) : 0;
  return width && height && durationMs ? { mime: 'video/mp4' as const, width, height, durationMs } : null;
}

function vint(bytes: Uint8Array, offset: number, keepMarker: boolean) {
  const first = bytes[offset];
  if (!first) return null;
  let length = 1;
  let marker = 0x80;
  while (length <= 8 && !(first & marker)) { marker >>= 1; length += 1; }
  if (length > 8 || offset + length > bytes.length) return null;
  let value = keepMarker ? first : (first & (marker - 1));
  let unknown = !keepMarker && value === marker - 1;
  for (let index = 1; index < length; index += 1) {
    const part = bytes[offset + index];
    value = (value * 256) + part;
    if (!keepMarker && part !== 255) unknown = false;
  }
  if (!unknown && !Number.isSafeInteger(value)) return null;
  return { length, value, unknown };
}

type Element = { id: number; data: number; end: number };

function elements(bytes: Uint8Array, start: number, end: number): Element[] | null {
  const result: Element[] = [];
  let offset = start;
  while (offset < end) {
    const id = vint(bytes, offset, true);
    const size = id && vint(bytes, offset + id.length, false);
    if (!id || !size) return null;
    const data = offset + id.length + size.length;
    const next = size.unknown ? end : data + size.value;
    if (next > end || next <= offset) return null;
    result.push({ id: id.value, data, end: next });
    offset = next;
  }
  return result;
}

function uint(bytes: Uint8Array, item?: Element) {
  if (!item || item.end - item.data < 1 || item.end - item.data > 8) return 0;
  let value = 0;
  for (let index = item.data; index < item.end; index += 1) value = (value * 256) + bytes[index];
  return value;
}

export function probePromoWebm(bytes: Uint8Array) {
  if (bytes.length < 16 || bytes[0] !== 0x1a || bytes[1] !== 0x45 || bytes[2] !== 0xdf || bytes[3] !== 0xa3) return null;
  const roots = elements(bytes, 0, bytes.length);
  const header = roots?.find((item) => item.id === 0x1a45dfa3);
  const segment = roots?.find((item) => item.id === 0x18538067);
  if (!header || !segment) return null;
  const docType = elements(bytes, header.data, header.end)?.find((item) => item.id === 0x4282);
  if (!docType || ascii(bytes, docType.data, docType.end - docType.data).toLowerCase() !== 'webm') return null;
  const children = elements(bytes, segment.data, segment.end) || [];
  if (children.some((item) => [0x1254c367, 0x1941a469].includes(item.id))) return null;
  if (!children.some((item) => item.id === 0x1f43b675 && item.end > item.data)) return null;
  const info = children.find((item) => item.id === 0x1549a966);
  const tracks = children.find((item) => item.id === 0x1654ae6b);
  if (!info || !tracks) return null;
  const infoParts = elements(bytes, info.data, info.end) || [];
  const scale = uint(bytes, infoParts.find((item) => item.id === 0x2ad7b1)) || 1_000_000;
  const durationItem = infoParts.find((item) => item.id === 0x4489);
  let duration = 0;
  if (durationItem && [4, 8].includes(durationItem.end - durationItem.data)) {
    duration = durationItem.end - durationItem.data === 4
      ? Buffer.from(bytes.subarray(durationItem.data, durationItem.end)).readFloatBE(0)
      : Buffer.from(bytes.subarray(durationItem.data, durationItem.end)).readDoubleBE(0);
  }
  let width = 0;
  let height = 0;
  (elements(bytes, tracks.data, tracks.end) || []).filter((item) => item.id === 0xae).forEach((track) => {
    const parts = elements(bytes, track.data, track.end) || [];
    const video = parts.find((item) => item.id === 0xe0);
    if (uint(bytes, parts.find((item) => item.id === 0x83)) !== 1 || !video) return;
    const videoParts = elements(bytes, video.data, video.end) || [];
    width = Math.max(width, uint(bytes, videoParts.find((item) => item.id === 0xb0)));
    height = Math.max(height, uint(bytes, videoParts.find((item) => item.id === 0xba)));
  });
  const durationMs = Math.round((duration * scale) / 1_000_000);
  return width && height && durationMs ? { mime: 'video/webm' as const, width, height, durationMs } : null;
}

export async function validatePromoVideo(
  file: unknown,
  purposeValue: unknown,
  posterAssetIdValue: unknown,
  options: { randomSource?: (size: number) => Buffer } = {},
): Promise<PreparedPromoMedia> {
  if (!fileLike(file)) throw new PromoMediaError('promo_media_required');
  const purpose = assertPurpose(purposeValue);
  if (!['hero', 'gallery'].includes(purpose)) throw new PromoMediaError('promo_media_type_invalid');
  const posterAssetId = String(posterAssetIdValue || '').trim();
  if (!/^[a-z0-9]{15}$/.test(posterAssetId)) throw new PromoMediaError('promo_media_poster_required');
  const name = normalizedName(file);
  const mime = String(file.type || '').trim().toLowerCase();
  const expectedExtension = mime === 'video/mp4' ? 'mp4' : (mime === 'video/webm' ? 'webm' : '');
  if (!expectedExtension) throw new PromoMediaError('promo_media_type_invalid');
  if (name.extension !== expectedExtension) throw new PromoMediaError('promo_media_type_mismatch');
  if (file.size < 1 || file.size > PROMO_MEDIA_VIDEO_MAX_BYTES) throw new PromoMediaError('promo_media_size_invalid');
  let buffer: Buffer;
  try { buffer = Buffer.from(await file.arrayBuffer()); }
  catch (_) { throw new PromoMediaError('promo_media_corrupt'); }
  if (buffer.byteLength !== file.size) throw new PromoMediaError('promo_media_size_invalid');
  const probe = mime === 'video/mp4' ? probePromoMp4(buffer) : probePromoWebm(buffer);
  if (!probe || probe.mime !== mime) throw new PromoMediaError('promo_media_corrupt');
  assertDimensions(purpose, probe.width, probe.height);
  if (probe.width > 1920 || probe.height > 1080) throw new PromoMediaError('promo_media_dimensions_invalid');
  if (probe.durationMs < 1000 || probe.durationMs > PROMO_MEDIA_VIDEO_MAX_DURATION_MS) {
    throw new PromoMediaError('promo_media_video_duration_invalid');
  }
  const bitrate = Math.ceil((buffer.byteLength * 8 * 1000) / probe.durationMs);
  if (bitrate > PROMO_MEDIA_VIDEO_MAX_BITRATE_BPS) throw new PromoMediaError('promo_media_video_bitrate_invalid');
  return Object.freeze({
    buffer,
    filename: randomFilename(expectedExtension, options.randomSource || randomBytes),
    kind: 'video',
    purpose,
    mime: probe.mime,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    bytes: buffer.byteLength,
    width: probe.width,
    height: probe.height,
    durationMs: probe.durationMs,
    posterAssetId,
  });
}

export async function preparePromoMedia(
  file: unknown,
  purpose: unknown,
  posterAssetId: unknown,
  options: { randomSource?: (size: number) => Buffer } = {},
) {
  const type = fileLike(file) ? String(file.type || '').trim().toLowerCase() : '';
  return type.startsWith('video/')
    ? validatePromoVideo(file, purpose, posterAssetId, options)
    : optimizePromoImage(file, purpose, options);
}

export function promoMediaErrorStatus(error: unknown) {
  const code = error instanceof PromoMediaError ? error.code : '';
  if (['promo_media_size_invalid', 'promo_media_output_too_large'].includes(code)) return 413;
  return code ? 400 : 500;
}
