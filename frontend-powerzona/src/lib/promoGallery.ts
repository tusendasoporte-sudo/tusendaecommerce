import {
  normalizePromoCmsDocument,
  normalizePromoCmsDraftResponse,
  promoCmsStoreSlug,
  PromoCmsError,
} from './promoCms.ts';

export const PROMO_GALLERY_MEDIA_API_PATH = '/api/admin/promo-media';
export const PROMO_GALLERY_DRAFT_API_PATH = '/api/admin/promo-cms';
export const PROMO_GALLERY_SECTION_TYPES = Object.freeze(['featured_work', 'gallery'] as const);
export const PROMO_GALLERY_HARD_MAX_VISIBLE = 24;

export const PROMO_GALLERY_TEXT_LIMITS = Object.freeze({
  navigation: 80,
  heading: 160,
  summary: 600,
  name: 160,
  caption: 500,
  alt: 300,
});

const KEY_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const USE_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,119}$/;
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const MEDIA_KINDS = new Set(['image', 'video']);
const MEDIA_PURPOSES = new Set(['hero', 'service', 'gallery', 'owner', 'footer', 'social', 'video_poster']);
const MEDIA_STATUSES = new Set(['uploaded', 'processing', 'ready', 'retired', 'rejected', 'quarantined']);
const MIME_TYPES = new Set(['image/webp', 'video/mp4', 'video/webm']);
const LOCALIZED_KEYS = Object.freeze(['identity', 'navigation', 'sections', 'contact', 'media_alt', 'seo']);

type JsonRecord = Record<string, any>;
export type PromoGallerySectionType = (typeof PROMO_GALLERY_SECTION_TYPES)[number];

export type PromoGalleryAsset = Readonly<{
  assetId: string;
  kind: 'image' | 'video';
  purpose: string;
  status: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  durationMs: number;
  posterAssetId: string;
}>;

export type PromoGalleryCatalog = Readonly<{
  assets: readonly PromoGalleryAsset[];
  usage: Readonly<{ images: number; videos: number; bytes: number }>;
  limits: Readonly<{
    maxImageBytes: number;
    maxVideoBytes: number;
    maxVideoDurationMs: number;
    maxStoredImages: number;
    maxStoredVideos: number;
    maxStorageBytes: number;
    purposes: readonly string[];
  }>;
}>;

export type PromoGalleryPatch = Readonly<{
  sections: readonly Readonly<{
    key: string;
    type: PromoGallerySectionType;
    visible: boolean;
    navigationLabel: string;
    heading: string;
    summary: string;
    items: readonly Readonly<{
      key: string;
      useKey: string;
      assetId: string;
      name: string;
      summary: string;
      caption: string;
      alt: string;
      decorative: boolean;
    }>[];
  }>[];
}>;

function fail(code = 'invalid_payload', status = 400): never {
  throw new PromoCmsError(code, status);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: unknown, expected: readonly string[]) {
  if (!isRecord(value)) fail();
  const actual = Object.keys(value).sort();
  const target = [...expected].sort();
  if (actual.length !== target.length || actual.some((entry, index) => entry !== target[index])) fail();
  return value;
}

function clone<T>(value: T): T {
  try { return JSON.parse(JSON.stringify(value)); }
  catch (_) { return fail(); }
}

function integer(value: unknown, minimum = 0) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < minimum) fail();
  return normalized;
}

function safeText(value: unknown, maximum: number, required = false) {
  if (typeof value !== 'string' || value.length > maximum || (required && !value.trim())) {
    fail('invalid_promo_document');
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
    || /<\/?[a-z][^>]*>/i.test(value)
    || /(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/i.test(value)
    || /\b[a-z][a-z0-9+.-]*:\/\//i.test(value)
    || /(?:@import\s+|expression\s*\(|url\s*\(|=>|\bfunction\s*\()/i.test(value)) {
    fail('unsafe_promo_document_value');
  }
  return value;
}

function checkedKey(value: unknown, pattern = KEY_PATTERN) {
  const normalized = String(value || '');
  return pattern.test(normalized) ? normalized : fail('invalid_promo_document');
}

function emptyLocalizedContent(): JsonRecord {
  return { identity: {}, navigation: {}, sections: {}, contact: {}, media_alt: {}, seo: {} };
}

function ensureLocale(document: JsonRecord) {
  let locale = String(document.locales.default || '');
  if (!locale) {
    locale = 'es';
    document.locales = { default: locale, published: [locale] };
  }
  if (!document.locales.published.includes(locale)) fail();
  if (!isRecord(document.content_by_locale[locale])) {
    document.content_by_locale[locale] = emptyLocalizedContent();
  } else {
    const localized = exactKeys(document.content_by_locale[locale], LOCALIZED_KEYS);
    LOCALIZED_KEYS.forEach((field) => { if (!isRecord(localized[field])) fail(); });
  }
  return locale;
}

function uniqueSectionKey(document: JsonRecord, preferred: string) {
  const known = new Set(document.sections.map((section: JsonRecord) => String(section.key)));
  if (!known.has(preferred)) return preferred;
  for (let suffix = 2; suffix <= 64; suffix += 1) {
    const candidate = `${preferred}-${suffix}`;
    if (!known.has(candidate)) return candidate;
  }
  return fail('invalid_promo_document');
}

function ensureSection(document: JsonRecord, locale: string, type: PromoGallerySectionType) {
  if (document.sections.some((section: JsonRecord) => section.type === type)) return;
  const preferred = type === 'featured_work' ? 'featured-work-main' : 'gallery-main';
  const sectionKey = uniqueSectionKey(document, preferred);
  document.sections.push({
    key: sectionKey,
    type,
    variant: 'default',
    visible: true,
    config: { item_keys: [] },
    media_use_keys: [],
  });
  document.section_order.push(sectionKey);
  const localized = document.content_by_locale[locale];
  localized.navigation[sectionKey] = type === 'featured_work' ? 'Trabajos destacados' : 'Galería';
  localized.sections[sectionKey] = { heading: '', summary: '', items: [] };
}

function previewShape(value: unknown, kind: string, assetId: string) {
  if (value === null) return;
  const preview = exactKeys(value, ['url', 'variants', 'controls_required', 'autoplay']);
  if (typeof preview.url !== 'string'
    || !preview.url.startsWith(`/api/pz/promo/private/v1/media/${assetId}/`)
    || !Array.isArray(preview.variants)
    || preview.controls_required !== (kind === 'video')
    || preview.autoplay !== false) fail();
  preview.variants.forEach((variant: unknown) => {
    const normalized = exactKeys(variant, ['key', 'width', 'height', 'url']);
    if (!/^(?:original|w[0-9]{2,4})$/.test(String(normalized.key || ''))
      || integer(normalized.width, 1) < 1 || integer(normalized.height, 1) < 1
      || typeof normalized.url !== 'string'
      || !normalized.url.startsWith(`/api/pz/promo/private/v1/media/${assetId}/`)) fail();
  });
}

function normalizeAsset(value: unknown): PromoGalleryAsset {
  const asset = exactKeys(value, [
    'asset_id', 'kind', 'purpose', 'status', 'mime', 'bytes', 'width', 'height',
    'duration_ms', 'poster_asset_id', 'preview',
  ]);
  const assetId = String(asset.asset_id || '');
  const kind = String(asset.kind || '');
  const purpose = String(asset.purpose || '');
  const status = String(asset.status || '');
  const mime = String(asset.mime || '');
  const posterAssetId = String(asset.poster_asset_id || '');
  if (!RECORD_ID_PATTERN.test(assetId) || !MEDIA_KINDS.has(kind) || !MEDIA_PURPOSES.has(purpose)
    || !MEDIA_STATUSES.has(status) || !MIME_TYPES.has(mime)
    || (posterAssetId && !RECORD_ID_PATTERN.test(posterAssetId))) fail();
  previewShape(asset.preview, kind, assetId);
  return Object.freeze({
    assetId,
    kind: kind as 'image' | 'video',
    purpose,
    status,
    mime,
    bytes: integer(asset.bytes, 1),
    width: integer(asset.width, 1),
    height: integer(asset.height, 1),
    durationMs: integer(asset.duration_ms),
    posterAssetId,
  });
}

export function normalizePromoGalleryCatalog(value: unknown): PromoGalleryCatalog {
  const response = exactKeys(value, ['ok', 'contract', 'assets', 'usage', 'limits']);
  if (response.ok !== true || response.contract !== 'promo.media.catalog.v1' || !Array.isArray(response.assets)) fail();
  const usage = exactKeys(response.usage, ['images', 'videos', 'bytes']);
  const limits = exactKeys(response.limits, [
    'max_image_bytes', 'max_video_bytes', 'max_video_duration_ms', 'max_stored_images',
    'max_stored_videos', 'max_storage_bytes', 'purposes',
  ]);
  if (!Array.isArray(limits.purposes) || limits.purposes.some((purpose: unknown) => !MEDIA_PURPOSES.has(String(purpose)))) fail();
  const assets = response.assets.map(normalizeAsset);
  if (new Set(assets.map((asset) => asset.assetId)).size !== assets.length) fail();
  return Object.freeze({
    assets: Object.freeze(assets),
    usage: Object.freeze({
      images: integer(usage.images),
      videos: integer(usage.videos),
      bytes: integer(usage.bytes),
    }),
    limits: Object.freeze({
      maxImageBytes: integer(limits.max_image_bytes, 1),
      maxVideoBytes: integer(limits.max_video_bytes, 1),
      maxVideoDurationMs: integer(limits.max_video_duration_ms, 1),
      maxStoredImages: integer(limits.max_stored_images, 1),
      maxStoredVideos: integer(limits.max_stored_videos),
      maxStorageBytes: integer(limits.max_storage_bytes),
      purposes: Object.freeze(limits.purposes.map(String)),
    }),
  });
}

export function createPromoGalleryWorkspace(value: unknown) {
  const document = normalizePromoCmsDocument(value);
  const locale = ensureLocale(document);
  PROMO_GALLERY_SECTION_TYPES.forEach((type) => ensureSection(document, locale, type));
  return Object.freeze({ document, locale });
}

function patchSections(patch: PromoGalleryPatch, managedSections: JsonRecord[]) {
  if (!isRecord(patch) || !Array.isArray(patch.sections) || patch.sections.length !== managedSections.length) fail();
  const result = new Map<string, PromoGalleryPatch['sections'][number]>();
  patch.sections.forEach((section) => {
    if (!isRecord(section) || !KEY_PATTERN.test(String(section.key || ''))
      || !PROMO_GALLERY_SECTION_TYPES.includes(section.type)
      || result.has(section.key)) fail();
    result.set(section.key, section);
  });
  if (managedSections.some((section) => !result.has(section.key))) fail();
  return result;
}

function nonDefaultMediaAlt(document: JsonRecord, locale: string, useKey: string) {
  return Object.entries(document.content_by_locale).some(([candidate, content]) => (
    candidate !== locale && isRecord(content) && isRecord(content.media_alt)
      && Object.prototype.hasOwnProperty.call(content.media_alt, useKey)
  ));
}

export function buildPromoGalleryDocument(
  value: unknown,
  patch: PromoGalleryPatch,
  maxGalleryAssets: number,
  catalogAssets: readonly PromoGalleryAsset[],
) {
  const workspace = createPromoGalleryWorkspace(value);
  const document = workspace.document;
  const locale = workspace.locale;
  const localized = document.content_by_locale[locale];
  const managedSections = document.sections.filter((section: JsonRecord) => (
    PROMO_GALLERY_SECTION_TYPES.includes(section.type)
  ));
  const patches = patchSections(patch, managedSections);
  const availableAssets = new Map((catalogAssets || []).map((asset) => [asset.assetId, asset]));
  const previousManagedUseKeys = new Set<string>(managedSections.flatMap((section: JsonRecord) => section.media_use_keys));
  const nextManagedUseKeys = new Set<string>();
  let galleryItems = 0;

  managedSections.forEach((section: JsonRecord) => {
    const sectionPatch = patches.get(section.key);
    if (!sectionPatch || sectionPatch.type !== section.type || typeof sectionPatch.visible !== 'boolean'
      || !Array.isArray(sectionPatch.items)) fail();
    section.visible = sectionPatch.visible;
    localized.navigation[section.key] = safeText(
      sectionPatch.navigationLabel,
      PROMO_GALLERY_TEXT_LIMITS.navigation,
      true,
    );
    const itemKeys = new Set<string>();
    const useKeys = new Set<string>();
    const localizedItems = sectionPatch.items.map((item) => {
      if (!isRecord(item) || typeof item.decorative !== 'boolean') fail();
      const itemKey = checkedKey(item.key);
      const useKey = checkedKey(item.useKey, USE_KEY_PATTERN);
      const assetId = String(item.assetId || '');
      const asset = availableAssets.get(assetId);
      if (itemKeys.has(itemKey) || useKeys.has(useKey) || !asset || asset.status !== 'ready'
        || asset.purpose !== 'gallery' || !['image', 'video'].includes(asset.kind)) {
        fail('invalid_promo_media_reference');
      }
      itemKeys.add(itemKey);
      useKeys.add(useKey);
      nextManagedUseKeys.add(useKey);
      const alt = safeText(item.decorative ? '' : item.alt, PROMO_GALLERY_TEXT_LIMITS.alt, !item.decorative);
      localized.media_alt[useKey] = { alt, decorative: item.decorative };
      document.media_refs[useKey] = { asset_id: assetId, purpose: 'gallery' };
      if (section.type === 'gallery') {
        return { key: itemKey, caption: safeText(item.caption, PROMO_GALLERY_TEXT_LIMITS.caption) };
      }
      return {
        key: itemKey,
        name: safeText(item.name, PROMO_GALLERY_TEXT_LIMITS.name),
        summary: safeText(item.summary, PROMO_GALLERY_TEXT_LIMITS.summary),
        caption: safeText(item.caption, PROMO_GALLERY_TEXT_LIMITS.caption),
      };
    });
    if (section.type === 'gallery') galleryItems += localizedItems.length;
    section.config.item_keys = localizedItems.map((item) => item.key);
    section.media_use_keys = sectionPatch.items.map((item) => item.useKey);
    localized.sections[section.key] = {
      ...(isRecord(localized.sections[section.key]) ? localized.sections[section.key] : {}),
      heading: safeText(sectionPatch.heading, PROMO_GALLERY_TEXT_LIMITS.heading),
      summary: safeText(sectionPatch.summary, PROMO_GALLERY_TEXT_LIMITS.summary),
      items: localizedItems,
    };
  });

  const effectiveMaximum = Number.isSafeInteger(maxGalleryAssets) && maxGalleryAssets >= 0
    ? Math.min(maxGalleryAssets, PROMO_GALLERY_HARD_MAX_VISIBLE)
    : 0;
  if (galleryItems > effectiveMaximum) fail('promo_capability_denied', 403);

  const allUsedUseKeys = new Set<string>(document.sections.flatMap((section: JsonRecord) => section.media_use_keys));
  document.sections.forEach((section: JsonRecord) => {
    if (['hero', 'owner'].includes(section.type) && section.config.media_use_key) {
      allUsedUseKeys.add(section.config.media_use_key);
    }
  });
  previousManagedUseKeys.forEach((useKey) => {
    if (nextManagedUseKeys.has(useKey)) return;
    delete localized.media_alt[useKey];
    if (!allUsedUseKeys.has(useKey) && !nonDefaultMediaAlt(document, locale, useKey)) {
      delete document.media_refs[useKey];
    }
  });
  return document;
}

export function promoGalleryPreviewPath(storeSlugValue: unknown, assetIdValue: unknown) {
  const storeSlug = promoCmsStoreSlug(storeSlugValue);
  const assetId = String(assetIdValue || '');
  if (!storeSlug || !RECORD_ID_PATTERN.test(assetId)) return '';
  return `${PROMO_GALLERY_MEDIA_API_PATH}?store=${encodeURIComponent(storeSlug)}&asset=${encodeURIComponent(assetId)}`;
}

export function normalizePromoGalleryDraft(value: unknown) {
  return normalizePromoCmsDraftResponse(value);
}

export function promoGalleryErrorMessage(code: unknown) {
  const messages: Record<string, string> = {
    unauthorized: 'Tu sesión terminó. Vuelve a iniciar sesión.',
    session_revoked: 'Tu sesión ya no está vigente. Vuelve a iniciar sesión.',
    blocked_by_plan: 'El plan actual bloquea la gestión de esta galería.',
    promo_permission_denied: 'Tu sesión no tiene todos los permisos necesarios para esta acción.',
    promo_capability_denied: 'La cuota o capacidad necesaria no está disponible para esta tienda.',
    promo_draft_conflict: 'El borrador cambió en otra sesión. Recárgalo antes de guardar.',
    invalid_promo_document: 'Revisa textos, orden y metadatos accesibles de los trabajos.',
    invalid_promo_media_reference: 'Selecciona un medio listo y perteneciente a esta galería.',
    unsafe_promo_document_value: 'El contenido incluye código, una URL o texto activo no permitido.',
    promo_media_duplicate: 'Este archivo ya existe en la biblioteca de la tienda.',
    promo_media_count_exceeded: 'La biblioteca alcanzó el máximo de medios permitido.',
    promo_media_storage_exceeded: 'La tienda alcanzó su cuota de almacenamiento.',
    promo_media_in_use: 'El medio sigue asociado al borrador o a una revisión publicada.',
    promo_media_conflict: 'El estado del medio cambió. Actualiza la biblioteca.',
    promo_media_poster_required: 'Selecciona primero un poster listo para el video.',
    promo_media_required: 'Selecciona un archivo para continuar.',
    promo_media_name_invalid: 'El nombre o extensión del archivo no es válido.',
    promo_media_type_invalid: 'El formato del archivo no está permitido.',
    promo_media_type_mismatch: 'El contenido real no coincide con el tipo o extensión del archivo.',
    promo_media_size_invalid: 'El archivo supera el tamaño permitido.',
    promo_media_corrupt: 'El archivo está dañado o no contiene metadata válida.',
    promo_media_animated_unsupported: 'Las imágenes animadas no están permitidas.',
    promo_media_output_too_large: 'La imagen no pudo optimizarse dentro del límite permitido.',
    promo_media_dimensions_invalid: 'Las dimensiones del archivo no cumplen el perfil de galería.',
    promo_media_image_dimensions_invalid: 'La imagen debe tener dimensiones válidas para galería o poster.',
    promo_media_video_dimensions_invalid: 'El video debe respetar la resolución permitida.',
    promo_media_video_bitrate_invalid: 'El bitrate del video supera el máximo permitido.',
    invalid_origin: 'La solicitud no proviene del panel administrativo.',
  };
  return messages[String(code || '')] || 'No se pudo completar la operación. Intenta nuevamente.';
}
