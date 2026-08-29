/// <reference path="../pb_data/types.d.ts" />

"use strict";

const MEDIA_UPLOAD_CONTRACT = "promo.media.upload.v1";
const MEDIA_LIST_CONTRACT = "promo.media.list.v1";
const MEDIA_RETIRE_CONTRACT = "promo.media.retire.v1";
const MEDIA_DELETE_CONTRACT = "promo.media.delete.v1";
const MEDIA_DELETE_RESPONSE_CONTRACT = "promo.media.deleted.v1";
const MEDIA_RESPONSE_CONTRACT = "promo.media.asset.v1";
const MEDIA_CATALOG_CONTRACT = "promo.media.catalog.v1";
const MEDIA_DELIVERY_CONTRACT = "promo.media.delivery.v1";

const MAX_IMAGE_BYTES = 100 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_DURATION_MS = 30 * 60 * 1000;
const MAX_VIDEO_BITRATE_BPS = 8 * 1000 * 1000;
const MAX_STORED_IMAGES = 150;
const MAX_STORED_VIDEOS = 3;
const MAX_STORAGE_BYTES = 250 * 1024 * 1024;
const MAX_DERIVED_WIDTH_RATIO = 0.5;
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const USE_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,119}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RANDOM_FILE_PATTERN = /^[a-f0-9]{32}\.(?:webp|mp4|webm)$/;
const STORED_FILE_PATTERN = /^[a-f0-9]{32}(?:_[A-Za-z0-9]{6,32})?\.(?:webp|mp4|webm)$/;

const PURPOSES = Object.freeze([
  "hero", "service", "gallery", "owner", "footer", "social", "video_poster", "qr", "logo",
]);
const VIDEO_PURPOSES = Object.freeze(["hero", "gallery"]);
const IMAGE_PURPOSES = Object.freeze(PURPOSES.slice());

const PURPOSE_POLICIES = Object.freeze({
  hero: Object.freeze({ minWidth: 640, minHeight: 320, maxWidth: 1920, maxHeight: 1080, widths: Object.freeze([480, 768, 1280]), sizes: "100vw", priority: true }),
  service: Object.freeze({ minWidth: 240, minHeight: 240, maxWidth: 1200, maxHeight: 1200, widths: Object.freeze([320, 640, 960]), sizes: "(min-width: 900px) 33vw, 100vw", priority: false }),
  gallery: Object.freeze({ minWidth: 320, minHeight: 240, maxWidth: 1600, maxHeight: 1600, widths: Object.freeze([480, 768, 1280]), sizes: "(min-width: 900px) 50vw, 100vw", priority: false }),
  owner: Object.freeze({ minWidth: 320, minHeight: 400, maxWidth: 1200, maxHeight: 1600, widths: Object.freeze([320, 640, 960]), sizes: "(min-width: 900px) 40vw, 100vw", priority: false }),
  footer: Object.freeze({ minWidth: 480, minHeight: 120, maxWidth: 1600, maxHeight: 800, widths: Object.freeze([480, 960, 1280]), sizes: "100vw", priority: false }),
  social: Object.freeze({ minWidth: 600, minHeight: 315, maxWidth: 1200, maxHeight: 630, widths: Object.freeze([600, 1200]), sizes: "100vw", priority: false }),
  video_poster: Object.freeze({ minWidth: 640, minHeight: 360, maxWidth: 1600, maxHeight: 900, widths: Object.freeze([480, 960, 1440]), sizes: "100vw", priority: false }),
  qr: Object.freeze({ minWidth: 512, minHeight: 512, maxWidth: 512, maxHeight: 512, widths: Object.freeze([512]), sizes: "min(18rem, 80vw)", priority: false }),
  logo: Object.freeze({ minWidth: 256, minHeight: 256, maxWidth: 1024, maxHeight: 1024, widths: Object.freeze([256, 512, 1024]), sizes: "min(10rem, 40vw)", priority: false }),
});

function safeText(value, max) {
  let result = "";
  try { result = String(value === null || value === undefined ? "" : value).trim(); } catch (_) {}
  return result.slice(0, Number.isInteger(max) ? max : 1000);
}

function integer(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  const text = safeText(value, 40);
  if (!/^(?:0|[1-9][0-9]*)$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function recordValue(record, key) {
  if (!record) return undefined;
  try {
    const value = record.get(key);
    if (value !== undefined) return value;
  } catch (_) {}
  try { return record.getString(key); } catch (_) {}
  return record[key];
}

function recordString(record, key, max) {
  return safeText(recordValue(record, key), Number.isInteger(max) ? max : 1000);
}

function recordInteger(record, key) {
  return integer(recordValue(record, key));
}

function recordId(record) {
  return safeText(record && (record.id || recordString(record, "id", 15)), 15);
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return safeText(value[0], 15);
  if (value && typeof value === "object") return safeText(value.id, 15);
  return safeText(value, 15);
}

function exactObject(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).filter((key) => typeof value[key] !== "function").sort();
  const expected = keys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function bodyValue(body, key) {
  if (!body) return undefined;
  if (typeof body.get === "function") {
    try {
      const value = body.get(key);
      if (value !== undefined) return value;
    } catch (_) {}
  }
  return body[key];
}

function parseUploadPayload(body) {
  const keys = [
    "bytes", "contract", "duration_ms", "height", "kind", "mime", "poster_asset_id",
    "purpose", "sha256", "width",
  ];
  if (!exactObject(body, keys) || bodyValue(body, "contract") !== MEDIA_UPLOAD_CONTRACT) return null;
  const parsed = {
    bytes: integer(bodyValue(body, "bytes")),
    durationMs: integer(bodyValue(body, "duration_ms")),
    height: integer(bodyValue(body, "height")),
    kind: safeText(bodyValue(body, "kind"), 20),
    mime: safeText(bodyValue(body, "mime"), 40).toLowerCase(),
    posterAssetId: safeText(bodyValue(body, "poster_asset_id"), 15),
    purpose: safeText(bodyValue(body, "purpose"), 30),
    sha256: safeText(bodyValue(body, "sha256"), 64),
    width: integer(bodyValue(body, "width")),
  };
  if (!PURPOSES.includes(parsed.purpose) || !SHA256_PATTERN.test(parsed.sha256)
    || !parsed.bytes || !parsed.width || !parsed.height || parsed.durationMs === null) return null;
  if (parsed.kind === "image") {
    if (!IMAGE_PURPOSES.includes(parsed.purpose) || parsed.mime !== "image/webp"
      || parsed.bytes > MAX_IMAGE_BYTES || parsed.durationMs !== 0 || parsed.posterAssetId) return null;
  } else if (parsed.kind === "video") {
    if (!VIDEO_PURPOSES.includes(parsed.purpose) || !["video/mp4", "video/webm"].includes(parsed.mime)
      || parsed.bytes > MAX_VIDEO_BYTES || parsed.durationMs < 1000
      || parsed.durationMs > MAX_VIDEO_DURATION_MS || !RECORD_ID_PATTERN.test(parsed.posterAssetId)) return null;
  } else return null;
  try { assertDimensions(parsed.kind, parsed.purpose, parsed.width, parsed.height); } catch (_) { return null; }
  return Object.freeze(parsed);
}

function parseListPayload(body) {
  return exactObject(body || {}, ["contract"]) && bodyValue(body, "contract") === MEDIA_LIST_CONTRACT
    ? Object.freeze({}) : null;
}

function parseRetirePayload(body) {
  if (!exactObject(body, ["asset_id", "contract", "expected_status"])
    || bodyValue(body, "contract") !== MEDIA_RETIRE_CONTRACT) return null;
  const assetId = safeText(bodyValue(body, "asset_id"), 15);
  const expectedStatus = safeText(bodyValue(body, "expected_status"), 20);
  return RECORD_ID_PATTERN.test(assetId) && expectedStatus === "ready"
    ? Object.freeze({ assetId, expectedStatus }) : null;
}

function parseDeletePayload(body) {
  if (!exactObject(body, ["asset_id", "contract", "expected_status"])
    || bodyValue(body, "contract") !== MEDIA_DELETE_CONTRACT) return null;
  const assetId = safeText(bodyValue(body, "asset_id"), 15);
  const expectedStatus = safeText(bodyValue(body, "expected_status"), 20);
  return RECORD_ID_PATTERN.test(assetId) && expectedStatus === "ready"
    ? Object.freeze({ assetId, expectedStatus }) : null;
}

function assertDimensions(kind, purpose, width, height) {
  const policy = PURPOSE_POLICIES[purpose];
  if (!policy || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < policy.minWidth || height < policy.minHeight
    || width > policy.maxWidth || height > policy.maxHeight) {
    throw new Error(kind === "video" ? "promo_media_video_dimensions_invalid" : "promo_media_image_dimensions_invalid");
  }
  if (kind === "video" && (width > 1920 || height > 1080)) {
    throw new Error("promo_media_video_dimensions_invalid");
  }
  return true;
}

function uploadedFileName(file) {
  return safeText(file && (file.originalName || file.name), 180);
}

function uploadedFileBytes(file, maxBytes) {
  const size = Number(file && file.size);
  if (!Number.isSafeInteger(size) || size < 1 || size > maxBytes) throw new Error("promo_media_size_invalid");
  let reader = null;
  try {
    reader = file && file.reader && typeof file.reader.open === "function" ? file.reader.open() : null;
    if (!reader) throw new Error("promo_media_file_invalid");
    if (typeof toBytes === "function") {
      const bytes = toBytes(reader);
      if (!bytes || Number(bytes.length) !== size) throw new Error("promo_media_size_invalid");
      return bytes;
    }
    const bytes = [];
    while (bytes.length <= maxBytes) {
      const target = new Array(Math.min(64 * 1024, maxBytes + 1 - bytes.length)).fill(0);
      const count = Number(reader.read(target));
      if (!Number.isInteger(count) || count <= 0) break;
      for (let index = 0; index < count; index += 1) bytes.push(Number(target[index]) & 255);
    }
    if (bytes.length !== size || bytes.length > maxBytes) throw new Error("promo_media_size_invalid");
    return bytes;
  } finally {
    try { if (reader && typeof reader.close === "function") reader.close(); } catch (_) {}
  }
}

function byteAt(bytes, index) {
  return Number(bytes && bytes[index]) & 255;
}

function readU16BE(bytes, offset) {
  return (byteAt(bytes, offset) * 256) + byteAt(bytes, offset + 1);
}

function readU32BE(bytes, offset) {
  return ((byteAt(bytes, offset) * 0x1000000)
    + (byteAt(bytes, offset + 1) * 0x10000)
    + (byteAt(bytes, offset + 2) * 0x100)
    + byteAt(bytes, offset + 3));
}

function readU32LE(bytes, offset) {
  return (byteAt(bytes, offset)
    + (byteAt(bytes, offset + 1) * 0x100)
    + (byteAt(bytes, offset + 2) * 0x10000)
    + (byteAt(bytes, offset + 3) * 0x1000000));
}

function readU64BE(bytes, offset) {
  const high = readU32BE(bytes, offset);
  const low = readU32BE(bytes, offset + 4);
  const value = (high * 0x100000000) + low;
  return Number.isSafeInteger(value) ? value : null;
}

function ascii(bytes, offset, length) {
  let result = "";
  for (let index = 0; index < length; index += 1) result += String.fromCharCode(byteAt(bytes, offset + index));
  return result;
}

function probeWebp(bytes) {
  const length = Number(bytes && bytes.length) || 0;
  if (length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP"
    || readU32LE(bytes, 4) + 8 !== length) return null;
  const chunks = [];
  let offset = 12;
  while (offset + 8 <= length) {
    const type = ascii(bytes, offset, 4);
    const size = readU32LE(bytes, offset + 4);
    const data = offset + 8;
    const end = data + size;
    const next = end + (size % 2);
    if (!Number.isSafeInteger(size) || end > length || next > length || next <= offset) return null;
    chunks.push({ type, data, end, size });
    offset = next;
  }
  if (offset !== length || chunks.some((chunk) => !["VP8X", "ALPH", "VP8 ", "VP8L"].includes(chunk.type))) return null;
  const payloads = chunks.filter((chunk) => ["VP8 ", "VP8L"].includes(chunk.type));
  if (payloads.length !== 1) return null;
  const payload = payloads[0];
  let payloadWidth = 0;
  let payloadHeight = 0;
  if (payload.type === "VP8 " && payload.size >= 10
    && byteAt(bytes, payload.data + 3) === 0x9d && byteAt(bytes, payload.data + 4) === 0x01
    && byteAt(bytes, payload.data + 5) === 0x2a) {
    payloadWidth = (byteAt(bytes, payload.data + 6) | (byteAt(bytes, payload.data + 7) << 8)) & 0x3fff;
    payloadHeight = (byteAt(bytes, payload.data + 8) | (byteAt(bytes, payload.data + 9) << 8)) & 0x3fff;
  } else if (payload.type === "VP8L" && payload.size >= 5 && byteAt(bytes, payload.data) === 0x2f) {
    payloadWidth = 1 + byteAt(bytes, payload.data + 1) + ((byteAt(bytes, payload.data + 2) & 0x3f) << 8);
    payloadHeight = 1 + (byteAt(bytes, payload.data + 2) >> 6) + (byteAt(bytes, payload.data + 3) << 2)
      + ((byteAt(bytes, payload.data + 4) & 0x0f) << 10);
  }
  if (!payloadWidth || !payloadHeight) return null;
  const extended = chunks.filter((chunk) => chunk.type === "VP8X");
  if (!extended.length) {
    if (chunks.length !== 1) return null;
    return { mime: "image/webp", width: payloadWidth, height: payloadHeight, duration_ms: 0 };
  }
  if (extended.length !== 1 || chunks[0] !== extended[0] || extended[0].size !== 10) return null;
  const flags = byteAt(bytes, extended[0].data);
  if (flags & 0xef) return null;
  const width = 1 + byteAt(bytes, extended[0].data + 4) + (byteAt(bytes, extended[0].data + 5) << 8)
    + (byteAt(bytes, extended[0].data + 6) << 16);
  const height = 1 + byteAt(bytes, extended[0].data + 7) + (byteAt(bytes, extended[0].data + 8) << 8)
    + (byteAt(bytes, extended[0].data + 9) << 16);
  if (width !== payloadWidth || height !== payloadHeight) return null;
  const alpha = chunks.filter((chunk) => chunk.type === "ALPH");
  if (payload.type === "VP8 ") {
    if ((flags & 0x10) ? alpha.length !== 1 : alpha.length !== 0) return null;
    const expectedPayloadIndex = alpha.length ? 2 : 1;
    if (chunks.indexOf(payload) !== expectedPayloadIndex || (alpha.length && chunks.indexOf(alpha[0]) !== 1)) return null;
  } else if (alpha.length || chunks.indexOf(payload) !== 1) return null;
  return { mime: "image/webp", width, height, duration_ms: 0 };
}

function mp4Boxes(bytes, start, end) {
  const result = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = readU32BE(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    let header = 8;
    if (size === 1) {
      size = readU64BE(bytes, offset + 8);
      header = 16;
    } else if (size === 0) size = end - offset;
    if (!Number.isSafeInteger(size) || size < header || offset + size > end) return null;
    result.push({ type, start: offset, data: offset + header, end: offset + size });
    offset += size;
  }
  return offset === end ? result : null;
}

function mp4Child(bytes, box, type) {
  const children = mp4Boxes(bytes, box.data, box.end);
  return children && children.find((candidate) => candidate.type === type) || null;
}

function probeMp4(bytes) {
  const boxes = mp4Boxes(bytes, 0, Number(bytes && bytes.length) || 0);
  const metadataBoxes = ["meta", "udta", "uuid", "ilst"];
  if (!boxes || !boxes.some((box) => box.type === "ftyp")
    || boxes.some((box) => metadataBoxes.includes(box.type))) return null;
  const mediaData = boxes.filter((box) => box.type === "mdat");
  if (!mediaData.length || mediaData.every((box) => box.end <= box.data)) return null;
  const moov = boxes.find((box) => box.type === "moov");
  if (!moov) return null;
  const moovChildren = mp4Boxes(bytes, moov.data, moov.end);
  if (!moovChildren || moovChildren.some((box) => metadataBoxes.includes(box.type))) return null;
  const mvhd = mp4Child(bytes, moov, "mvhd");
  if (!mvhd || mvhd.data + 20 > mvhd.end) return null;
  const version = byteAt(bytes, mvhd.data);
  const timescaleOffset = mvhd.data + (version === 1 ? 20 : 12);
  const durationOffset = mvhd.data + (version === 1 ? 24 : 16);
  const timescale = readU32BE(bytes, timescaleOffset);
  const duration = version === 1 ? readU64BE(bytes, durationOffset) : readU32BE(bytes, durationOffset);
  if (!timescale || !duration) return null;
  const tracks = moovChildren.filter((box) => box.type === "trak");
  let width = 0;
  let height = 0;
  tracks.forEach((track) => {
    const tkhd = mp4Child(bytes, track, "tkhd");
    const mdia = mp4Child(bytes, track, "mdia");
    const hdlr = mdia && mp4Child(bytes, mdia, "hdlr");
    if (!tkhd || !hdlr || hdlr.data + 12 > hdlr.end || ascii(bytes, hdlr.data + 8, 4) !== "vide") return;
    if (tkhd.end - 8 < tkhd.data) return;
    width = Math.max(width, Math.floor(readU32BE(bytes, tkhd.end - 8) / 65536));
    height = Math.max(height, Math.floor(readU32BE(bytes, tkhd.end - 4) / 65536));
  });
  const durationMs = Math.round((duration * 1000) / timescale);
  return width > 0 && height > 0 && durationMs > 0
    ? { mime: "video/mp4", width, height, duration_ms: durationMs } : null;
}

function readVint(bytes, offset, keepMarker) {
  const first = byteAt(bytes, offset);
  if (!first) return null;
  let length = 1;
  let marker = 0x80;
  while (length <= 8 && !(first & marker)) { marker >>= 1; length += 1; }
  if (length > 8 || offset + length > bytes.length) return null;
  let value = keepMarker ? first : (first & (marker - 1));
  let unknown = !keepMarker && value === marker - 1;
  for (let index = 1; index < length; index += 1) {
    const part = byteAt(bytes, offset + index);
    value = (value * 256) + part;
    if (!keepMarker && part !== 255) unknown = false;
  }
  return { length, value, unknown };
}

function ebmlElements(bytes, start, end) {
  const elements = [];
  let offset = start;
  while (offset < end) {
    const id = readVint(bytes, offset, true);
    if (!id) return null;
    const size = readVint(bytes, offset + id.length, false);
    if (!size) return null;
    const data = offset + id.length + size.length;
    const next = size.unknown ? end : data + size.value;
    if (next > end || next <= offset) return null;
    elements.push({ id: id.value, data, end: next });
    offset = next;
  }
  return elements;
}

function ebmlUInt(bytes, element) {
  const length = element.end - element.data;
  if (length < 1 || length > 8) return null;
  let value = 0;
  for (let index = element.data; index < element.end; index += 1) value = (value * 256) + byteAt(bytes, index);
  return Number.isSafeInteger(value) ? value : null;
}

function ebmlFloat(bytes, element) {
  const length = element.end - element.data;
  if (![4, 8].includes(length)) return null;
  const sign = (byteAt(bytes, element.data) & 0x80) ? -1 : 1;
  let exponent;
  let fraction;
  let bias;
  let maxExponent;
  if (length === 4) {
    exponent = ((byteAt(bytes, element.data) & 0x7f) << 1) | (byteAt(bytes, element.data + 1) >> 7);
    const fractionBits = ((byteAt(bytes, element.data + 1) & 0x7f) * 0x10000)
      + (byteAt(bytes, element.data + 2) * 0x100) + byteAt(bytes, element.data + 3);
    fraction = fractionBits / Math.pow(2, 23);
    bias = 127;
    maxExponent = 255;
  } else {
    exponent = ((byteAt(bytes, element.data) & 0x7f) << 4) | (byteAt(bytes, element.data + 1) >> 4);
    const highFraction = ((byteAt(bytes, element.data + 1) & 0x0f) * 0x10000)
      + (byteAt(bytes, element.data + 2) * 0x100) + byteAt(bytes, element.data + 3);
    const lowFraction = readU32BE(bytes, element.data + 4);
    fraction = ((highFraction * 0x100000000) + lowFraction) / Math.pow(2, 52);
    bias = 1023;
    maxExponent = 2047;
  }
  if (exponent === maxExponent) return null;
  if (exponent === 0) return sign * fraction * Math.pow(2, 1 - bias);
  return sign * (1 + fraction) * Math.pow(2, exponent - bias);
}

function probeWebm(bytes) {
  if (!bytes || bytes.length < 16 || byteAt(bytes, 0) !== 0x1a || byteAt(bytes, 1) !== 0x45
    || byteAt(bytes, 2) !== 0xdf || byteAt(bytes, 3) !== 0xa3) return null;
  const roots = ebmlElements(bytes, 0, bytes.length);
  if (!roots) return null;
  const header = roots.find((item) => item.id === 0x1a45dfa3);
  const segment = roots.find((item) => item.id === 0x18538067);
  if (!header || !segment) return null;
  const headerChildren = ebmlElements(bytes, header.data, header.end) || [];
  const docType = headerChildren.find((item) => item.id === 0x4282);
  if (!docType || ascii(bytes, docType.data, docType.end - docType.data).toLowerCase() !== "webm") return null;
  const children = ebmlElements(bytes, segment.data, segment.end) || [];
  if (children.some((item) => [0x1254c367, 0x1941a469].includes(item.id))) return null;
  if (!children.some((item) => item.id === 0x1f43b675 && item.end > item.data)) return null;
  const info = children.find((item) => item.id === 0x1549a966);
  const tracks = children.find((item) => item.id === 0x1654ae6b);
  if (!info || !tracks) return null;
  const infoChildren = ebmlElements(bytes, info.data, info.end) || [];
  const scaleItem = infoChildren.find((item) => item.id === 0x2ad7b1);
  const durationItem = infoChildren.find((item) => item.id === 0x4489);
  const scale = scaleItem ? ebmlUInt(bytes, scaleItem) : 1000000;
  const duration = durationItem ? ebmlFloat(bytes, durationItem) : null;
  let width = 0;
  let height = 0;
  const trackEntries = (ebmlElements(bytes, tracks.data, tracks.end) || []).filter((item) => item.id === 0xae);
  trackEntries.forEach((track) => {
    const parts = ebmlElements(bytes, track.data, track.end) || [];
    const type = parts.find((item) => item.id === 0x83);
    const video = parts.find((item) => item.id === 0xe0);
    if (!type || ebmlUInt(bytes, type) !== 1 || !video) return;
    const videoParts = ebmlElements(bytes, video.data, video.end) || [];
    width = Math.max(width, ebmlUInt(bytes, videoParts.find((item) => item.id === 0xb0)) || 0);
    height = Math.max(height, ebmlUInt(bytes, videoParts.find((item) => item.id === 0xba)) || 0);
  });
  const durationMs = duration && scale ? Math.round((duration * scale) / 1000000) : 0;
  return width > 0 && height > 0 && durationMs > 0
    ? { mime: "video/webm", width, height, duration_ms: durationMs } : null;
}

function rotateRight(value, count) {
  return (value >>> count) | (value << (32 - count));
}

function sha256Bytes(bytes) {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const total = Number(bytes && bytes.length) || 0;
  const tailLength = ((total + 9 + 63) >> 6) << 6;
  const words = new Array(64).fill(0);
  for (let block = 0; block < tailLength; block += 64) {
    for (let index = 0; index < 16; index += 1) {
      let word = 0;
      for (let part = 0; part < 4; part += 1) {
        const position = block + (index * 4) + part;
        let value = 0;
        if (position < total) value = byteAt(bytes, position);
        else if (position === total) value = 0x80;
        else if (position >= tailLength - 8) {
          const bitLength = total * 8;
          const shiftBytes = tailLength - 1 - position;
          value = shiftBytes < 7 ? Math.floor(bitLength / Math.pow(256, shiftBytes)) & 255 : 0;
        }
        word = ((word << 8) | value) >>> 0;
      }
      words[index] = word;
    }
    for (let index = 16; index < 64; index += 1) {
      const a = words[index - 15];
      const b = words[index - 2];
      const s0 = rotateRight(a, 7) ^ rotateRight(a, 18) ^ (a >>> 3);
      const s1 = rotateRight(b, 17) ^ rotateRight(b, 19) ^ (b >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ ((~e) & g);
      const t1 = (h + s1 + choice + constants[index] + words[index]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0;
  }
  return hash.map((value) => value.toString(16).padStart(8, "0")).join("");
}

function validateUploadedFile(file, payload) {
  if (!file || !payload) throw new Error("promo_media_file_required");
  const expectedExtension = payload.mime === "image/webp" ? "webp" : payload.mime.split("/")[1];
  const name = uploadedFileName(file);
  if (!RANDOM_FILE_PATTERN.test(name) || !name.endsWith(`.${expectedExtension}`)) {
    throw new Error("promo_media_filename_invalid");
  }
  const max = payload.kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  const bytes = uploadedFileBytes(file, max);
  if (Number(bytes.length) !== payload.bytes || sha256Bytes(bytes) !== payload.sha256) {
    throw new Error("promo_media_digest_mismatch");
  }
  const probe = payload.mime === "image/webp"
    ? probeWebp(bytes)
    : (payload.mime === "video/mp4" ? probeMp4(bytes) : probeWebm(bytes));
  if (!probe || probe.mime !== payload.mime || probe.width !== payload.width || probe.height !== payload.height
    || Math.abs(probe.duration_ms - payload.durationMs) > (payload.kind === "video" ? 1000 : 0)) {
    throw new Error("promo_media_metadata_mismatch");
  }
  assertDimensions(payload.kind, payload.purpose, probe.width, probe.height);
  if (payload.kind === "video") {
    const bitrate = Math.ceil((payload.bytes * 8 * 1000) / probe.duration_ms);
    if (bitrate > MAX_VIDEO_BITRATE_BPS) throw new Error("promo_media_video_bitrate_invalid");
  }
  return Object.freeze({ bytes, probe });
}

function variantManifest(purpose, width, height) {
  const policy = PURPOSE_POLICIES[purpose];
  if (!policy) throw new Error("promo_media_purpose_invalid");
  // PocketBase re-encodes thumbs with a fixed quality. Near-original thumbs can
  // become larger than the already-normalized original, so only derive variants
  // that materially reduce both dimensions and remain inside the 100 KiB contract.
  const maxDerivedWidth = Math.floor(width * MAX_DERIVED_WIDTH_RATIO);
  const variants = policy.widths.filter((candidate) => candidate <= maxDerivedWidth).map((candidate) => ({
    key: `w${candidate}`,
    thumb: `${candidate}x0`,
    width: candidate,
    height: Math.max(1, Math.round((height * candidate) / width)),
  }));
  variants.push({ key: "original", thumb: "", width, height });
  return variants;
}

function derivedFilename(sha256, variant) {
  if (!SHA256_PATTERN.test(sha256) || !/^w[0-9]{2,4}$/.test(variant)) throw new Error("promo_media_variant_invalid");
  return `${sha256}_${variant}.webp`;
}

function publicRoute(slug, key, sha256, variant, extension) {
  if (!SLUG_PATTERN.test(slug) || !USE_KEY_PATTERN.test(key) || !SHA256_PATTERN.test(sha256)
    || !/^(?:original|w[0-9]{2,4}|poster-(?:original|w[0-9]{2,4}))$/.test(variant)
    || !["webp", "mp4", "webm"].includes(extension)) throw new Error("promo_media_delivery_invalid");
  return `/api/pz/promo/public/v1/sites/${slug}/media/${key}/${sha256}/${variant}.${extension}`;
}

function privateRoute(assetId, sha256, variant, extension) {
  if (!RECORD_ID_PATTERN.test(assetId) || !SHA256_PATTERN.test(sha256)
    || !/^(?:original|w[0-9]{2,4})$/.test(variant) || !["webp", "mp4", "webm"].includes(extension)) {
    throw new Error("promo_media_delivery_invalid");
  }
  return `/api/pz/promo/private/v1/media/${assetId}/${sha256}/${variant}.${extension}`;
}

function publicImageDescriptor(asset, slug, key, prefix, priorityOverride) {
  const marker = prefix || "";
  const priority = typeof priorityOverride === "boolean"
    ? priorityOverride
    : PURPOSE_POLICIES[asset.purpose].priority;
  const variants = variantManifest(asset.purpose, asset.width, asset.height).map((variant) => {
    const publicVariant = marker ? `${marker}${variant.key}` : variant.key;
    return {
      key: variant.key,
      width: variant.width,
      height: variant.height,
      url: publicRoute(slug, key, asset.sha256, publicVariant, "webp"),
    };
  });
  const original = variants[variants.length - 1];
  return {
    contract: MEDIA_DELIVERY_CONTRACT,
    mime: "image/webp",
    src: original.url,
    srcset: variants,
    sizes: PURPOSE_POLICIES[asset.purpose].sizes,
    loading: priority ? "eager" : "lazy",
    fetch_priority: priority ? "high" : "auto",
    decoding: "async",
  };
}

function publicAssetDescriptor(asset, slug, options) {
  const settings = options || {};
  const base = {
    key: asset.key,
    purpose: asset.purpose,
    kind: asset.kind,
    width: asset.width,
    height: asset.height,
    duration_ms: asset.duration_ms,
  };
  if (asset.kind === "image") {
    return { ...base, delivery: publicImageDescriptor(asset, slug, asset.key, "", settings.priority) };
  }
  const extension = asset.mime === "video/webm" ? "webm" : "mp4";
  const poster = asset.poster;
  if (!poster) throw new Error("promo_media_poster_required");
  return {
    ...base,
    delivery: {
      contract: MEDIA_DELIVERY_CONTRACT,
      mime: asset.mime,
      src: publicRoute(slug, asset.key, asset.sha256, "original", extension),
      preload: "none",
      controls_required: true,
      autoplay: false,
      plays_inline: true,
      reduced_motion: "poster",
      save_data: "poster",
      poster: publicImageDescriptor(poster, slug, asset.key, "poster-", settings.priority),
    },
  };
}

function privateAssetDescriptor(record) {
  const id = recordId(record);
  const kind = recordString(record, "kind", 20);
  const purpose = recordString(record, "purpose", 30);
  const mime = recordString(record, "mime_detected", 40);
  const sha256 = recordString(record, "sha256", 64);
  const width = recordInteger(record, "width") || 0;
  const height = recordInteger(record, "height") || 0;
  const extension = mime === "image/webp" ? "webp" : (mime === "video/webm" ? "webm" : "mp4");
  let ready = false;
  try { ready = assertReadyAsset(record); } catch (_) {}
  const variants = ready && kind === "image"
    ? variantManifest(purpose, width, height).map((variant) => ({
      key: variant.key,
      width: variant.width,
      height: variant.height,
      url: privateRoute(id, sha256, variant.key, extension),
    }))
    : [];
  return {
    asset_id: id,
    kind,
    purpose,
    status: recordString(record, "status", 20),
    mime,
    bytes: recordInteger(record, "bytes") || 0,
    width,
    height,
    duration_ms: recordInteger(record, "duration_ms") || 0,
    poster_asset_id: relationId(record, "poster_asset"),
    preview: ready ? {
      url: privateRoute(id, sha256, "original", extension),
      variants,
      controls_required: kind === "video",
      autoplay: false,
    } : null,
  };
}

function assertReadyAsset(record, options) {
  const settings = options || {};
  if (!record || recordString(record, "status", 20) !== "ready") throw new Error("promo_media_not_ready");
  const kind = recordString(record, "kind", 20);
  const purpose = recordString(record, "purpose", 30);
  const mime = recordString(record, "mime_detected", 40);
  const sha256 = recordString(record, "sha256", 64);
  const width = recordInteger(record, "width");
  const height = recordInteger(record, "height");
  const duration = recordInteger(record, "duration_ms") || 0;
  const bytes = recordInteger(record, "bytes");
  const filename = recordString(record, "file", 220);
  if (!SHA256_PATTERN.test(sha256) || !bytes || !width || !height || !PURPOSES.includes(purpose)
    || !STORED_FILE_PATTERN.test(filename)) {
    throw new Error("promo_media_not_ready");
  }
  assertDimensions(kind, purpose, width, height);
  if (kind === "image") {
    if (mime !== "image/webp" || !filename.endsWith(".webp") || bytes > MAX_IMAGE_BYTES
      || duration !== 0 || relationId(record, "poster_asset")) {
      throw new Error("promo_media_not_ready");
    }
  } else if (kind === "video") {
    if (!VIDEO_PURPOSES.includes(purpose) || !["video/mp4", "video/webm"].includes(mime)
      || !filename.endsWith(mime === "video/mp4" ? ".mp4" : ".webm")
      || bytes > MAX_VIDEO_BYTES || duration < 1000 || duration > MAX_VIDEO_DURATION_MS
      || !RECORD_ID_PATTERN.test(relationId(record, "poster_asset"))) throw new Error("promo_media_not_ready");
  } else throw new Error("promo_media_not_ready");
  if (settings.siteId && relationId(record, "site") !== settings.siteId) throw new Error("promo_media_tenant_mismatch");
  if (settings.purpose && purpose !== settings.purpose) throw new Error("promo_media_purpose_mismatch");
  return true;
}

module.exports = {
  IMAGE_PURPOSES,
  MAX_IMAGE_BYTES,
  MAX_STORAGE_BYTES,
  MAX_STORED_IMAGES,
  MAX_STORED_VIDEOS,
  MAX_VIDEO_BITRATE_BPS,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_DURATION_MS,
  MEDIA_CATALOG_CONTRACT,
  MEDIA_DELETE_CONTRACT,
  MEDIA_DELETE_RESPONSE_CONTRACT,
  MEDIA_DELIVERY_CONTRACT,
  MEDIA_LIST_CONTRACT,
  MEDIA_RESPONSE_CONTRACT,
  MEDIA_RETIRE_CONTRACT,
  MEDIA_UPLOAD_CONTRACT,
  PURPOSES,
  PURPOSE_POLICIES,
  RANDOM_FILE_PATTERN,
  RECORD_ID_PATTERN,
  SHA256_PATTERN,
  STORED_FILE_PATTERN,
  USE_KEY_PATTERN,
  VIDEO_PURPOSES,
  assertDimensions,
  assertReadyAsset,
  derivedFilename,
  parseListPayload,
  parseDeletePayload,
  parseRetirePayload,
  parseUploadPayload,
  privateAssetDescriptor,
  probeMp4,
  probeWebm,
  probeWebp,
  publicAssetDescriptor,
  publicRoute,
  recordId,
  recordInteger,
  recordString,
  recordValue,
  relationId,
  sha256Bytes,
  uploadedFileBytes,
  validateUploadedFile,
  variantManifest,
};
