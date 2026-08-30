import {
  ensurePromoWorkGallerySection,
  normalizePromoCmsDocument,
  normalizePromoCmsDraftResponse,
  PROMO_CMS_HERO_DEFAULT_COLORS,
  promoCmsStoreSlug,
  PromoCmsError,
} from './promoCms.ts';

export const PROMO_GALLERY_MEDIA_API_PATH = '/api/admin/promo-media';
export const PROMO_GALLERY_DRAFT_API_PATH = '/api/admin/promo-cms';
export const PROMO_GALLERY_SECTION_TYPES = Object.freeze(['gallery'] as const);
export const PROMO_HERO_MAX_MEDIA = 3;
export const PROMO_PRODUCT_MAX_MEDIA = 3;
export const PROMO_GALLERY_HARD_MAX_VIDEOS = 3;

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
const MEDIA_PURPOSES = new Set(['hero', 'service', 'gallery', 'owner', 'footer', 'social', 'video_poster', 'qr', 'review', 'logo']);
const MEDIA_STATUSES = new Set(['uploaded', 'processing', 'ready', 'retired', 'rejected', 'quarantined']);
const MIME_TYPES = new Set(['image/webp', 'video/mp4', 'video/webm']);
const LOCALIZED_KEYS = Object.freeze(['identity', 'navigation', 'sections', 'contact', 'media_alt', 'seo']);

type JsonRecord = Record<string, any>;
export type PromoGallerySectionType = 'gallery';

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

export type PromoGalleryMediaPatch = Readonly<{
  useKey: string;
  assetId: string;
  alt: string;
  decorative: boolean;
  localizedAlt?: Readonly<Record<string, string>>;
}>;

export type PromoGalleryLocalizedItemPatch = Readonly<{
  name: string;
  summary: string;
  caption: string;
}>;

export type PromoGalleryPatch = Readonly<{
  heroMedia: readonly PromoGalleryMediaPatch[];
  ownerMedia?: PromoGalleryMediaPatch | null;
  galleries: readonly Readonly<{
    key: string;
    visible: boolean;
    navigationLabel: string;
    heading: string;
    summary: string;
    coverUseKey: string;
    coverMedia?: PromoGalleryMediaPatch | null;
    items: readonly Readonly<{
      key: string;
      featured: boolean;
      visible: boolean;
      name: string;
      summary: string;
      caption: string;
      translations?: Readonly<Record<string, PromoGalleryLocalizedItemPatch>>;
      media: readonly PromoGalleryMediaPatch[];
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

function checkedKey(value: unknown, pattern = KEY_PATTERN, empty = false) {
  const normalized = String(value || '');
  if ((empty && !normalized) || pattern.test(normalized)) return normalized;
  return fail('invalid_promo_document');
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
  if (!isRecord(document.content_by_locale[locale])) document.content_by_locale[locale] = emptyLocalizedContent();
  for (const candidate of Object.keys(document.content_by_locale)) {
    const localized = exactKeys(document.content_by_locale[candidate], LOCALIZED_KEYS);
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

function ensureSection(document: JsonRecord, locale: string, type: 'hero' | 'featured_work' | 'gallery' | 'owner') {
  const existing = document.sections.find((section: JsonRecord) => section.type === type);
  if (existing) return existing;
  const sectionKey = uniqueSectionKey(document, ({
    hero: 'hero-main', featured_work: 'featured-work-main', gallery: 'gallery-main', owner: 'owner-main',
  })[type]);
  const section = {
    key: sectionKey,
    type,
    variant: 'default',
    visible: type !== 'gallery',
    config: type === 'hero'
      ? {
        media_use_key: '', action_key: '', layout: 'immersive', button_targets: ['primary-contact'],
        contrast_mode: 'auto',
        title_color: PROMO_CMS_HERO_DEFAULT_COLORS.title,
        body_color: PROMO_CMS_HERO_DEFAULT_COLORS.body,
        accent_color: PROMO_CMS_HERO_DEFAULT_COLORS.accent,
        overlay_strength: 'medium',
      }
      : (type === 'featured_work'
        ? { item_keys: [] }
        : (type === 'owner'
          ? { media_use_key: '' }
          : { item_keys: [], cover_media_use_key: '', items: [] })),
    media_use_keys: [],
  };
  const footerIndex = document.sections.findIndex((item: JsonRecord) => item.type === 'footer');
  const insertion = footerIndex < 0 ? document.sections.length : footerIndex;
  document.sections.splice(insertion, 0, section);
  document.section_order = document.sections.map((item: JsonRecord) => item.key);
  for (const [candidate, content] of Object.entries(document.content_by_locale)) {
    const localized = content as JsonRecord;
    localized.navigation[sectionKey] = type === 'hero'
      ? (candidate === locale ? 'Inicio' : 'Home')
      : (type === 'featured_work' ? 'Trabajos destacados' : (type === 'owner' ? 'Propietario' : 'Galería'));
    localized.sections[sectionKey] = type === 'gallery'
      ? { heading: '', summary: '', items: [] }
      : (type === 'owner' ? { heading: '', name: '', bio: '' } : { heading: '', summary: '' });
  }
  return section;
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
    kind: kind as 'image' | 'video', purpose, status, mime,
    bytes: integer(asset.bytes, 1), width: integer(asset.width, 1), height: integer(asset.height, 1),
    durationMs: integer(asset.duration_ms), posterAssetId,
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
    usage: Object.freeze({ images: integer(usage.images), videos: integer(usage.videos), bytes: integer(usage.bytes) }),
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
  ensureSection(document, locale, 'hero');
  ensureSection(document, locale, 'featured_work');
  ensureSection(document, locale, 'owner');
  ensurePromoWorkGallerySection(document, locale);
  return Object.freeze({ document, locale });
}

function validateMediaPatch(
  raw: unknown,
  purpose: 'hero' | 'gallery' | 'owner',
  availableAssets: Map<string, PromoGalleryAsset>,
  allUseKeys: Set<string>,
) {
  const item = exactKeys(raw, isRecord(raw) && Object.prototype.hasOwnProperty.call(raw, 'localizedAlt')
    ? ['useKey', 'assetId', 'alt', 'decorative', 'localizedAlt']
    : ['useKey', 'assetId', 'alt', 'decorative']);
  if (typeof item.decorative !== 'boolean') fail();
  const useKey = checkedKey(item.useKey, USE_KEY_PATTERN);
  const assetId = String(item.assetId || '');
  const asset = availableAssets.get(assetId);
  const allowedKinds = purpose === 'gallery' ? ['image', 'video'] : ['image'];
  if (allUseKeys.has(useKey) || !asset || asset.status !== 'ready' || asset.purpose !== purpose
    || !allowedKinds.includes(asset.kind)) fail('invalid_promo_media_reference');
  allUseKeys.add(useKey);
  const decorative = purpose === 'hero' ? true : item.decorative;
  const localizedAlt: Record<string, string> = {};
  if (item.localizedAlt !== undefined) {
    if (!isRecord(item.localizedAlt)) fail('invalid_promo_document');
    Object.entries(item.localizedAlt).forEach(([candidate, value]) => {
      if (!/^[a-z]{2}$/.test(candidate)) fail('invalid_promo_document');
      localizedAlt[candidate] = safeText(decorative ? '' : value, PROMO_GALLERY_TEXT_LIMITS.alt);
    });
  }
  return {
    useKey,
    assetId,
    alt: safeText(decorative ? '' : item.alt, PROMO_GALLERY_TEXT_LIMITS.alt, !decorative),
    decorative,
    localizedAlt,
  };
}

function setMediaReference(document: JsonRecord, locale: string, item: ReturnType<typeof validateMediaPatch>, purpose: string) {
  document.media_refs[item.useKey] = { asset_id: item.assetId, purpose };
  for (const [candidate, rawContent] of Object.entries(document.content_by_locale)) {
    const content = rawContent as JsonRecord;
    if (!isRecord(content.media_alt)) content.media_alt = {};
    if (candidate === locale) {
      content.media_alt[item.useKey] = { alt: item.alt, decorative: item.decorative };
    } else if (Object.prototype.hasOwnProperty.call(item.localizedAlt, candidate)) {
      content.media_alt[item.useKey] = {
        alt: item.decorative ? '' : item.localizedAlt[candidate],
        decorative: item.decorative,
      };
    } else if (item.decorative && !isRecord(content.media_alt[item.useKey])) {
      content.media_alt[item.useKey] = { alt: '', decorative: true };
    }
  }
}

function galleryPatches(patch: PromoGalleryPatch) {
  if (!isRecord(patch)
    || !Array.isArray(patch.heroMedia)
    || patch.heroMedia.length > PROMO_HERO_MAX_MEDIA
    || (patch.ownerMedia !== undefined && !isRecord(patch.ownerMedia) && patch.ownerMedia !== null)
    || !Array.isArray(patch.galleries)) fail();
  const keys = new Set<string>();
  return patch.galleries.map((raw) => {
    const gallery = exactKeys(raw, Object.prototype.hasOwnProperty.call(raw, 'coverMedia')
      ? ['key', 'visible', 'navigationLabel', 'heading', 'summary', 'coverUseKey', 'coverMedia', 'items']
      : ['key', 'visible', 'navigationLabel', 'heading', 'summary', 'coverUseKey', 'items']);
    const sectionKey = checkedKey(gallery.key);
    if (keys.has(sectionKey) || typeof gallery.visible !== 'boolean' || !Array.isArray(gallery.items)) fail();
    keys.add(sectionKey);
    return gallery;
  });
}

function localizedGalleryItems(
  content: JsonRecord,
  sectionKey: string,
  defaults: JsonRecord[],
  isDefault: boolean,
  locale: string,
) {
  const sectionContent = isRecord(content.sections[sectionKey]) ? content.sections[sectionKey] : {};
  const existing = new Map((Array.isArray(sectionContent.items) ? sectionContent.items : []).map(
    (item: JsonRecord) => [String(item.key || ''), item],
  ));
  return defaults.map((item) => {
    const previous = existing.get(item.key) as JsonRecord | undefined;
    const translated = isRecord(item.translations?.[locale]) ? item.translations[locale] : null;
    if (isDefault) return clone({ key: item.key, name: item.name, summary: item.summary, caption: item.caption });
    if (translated) return {
      key: item.key,
      name: safeText(translated.name, PROMO_GALLERY_TEXT_LIMITS.name),
      summary: safeText(translated.summary, PROMO_GALLERY_TEXT_LIMITS.summary),
      caption: safeText(translated.caption, PROMO_GALLERY_TEXT_LIMITS.caption),
    };
    return previous ? {
      key: item.key,
      name: String(previous.name || ''),
      summary: String(previous.summary || ''),
      caption: String(previous.caption || ''),
    } : { key: item.key, name: '', summary: '', caption: '' };
  });
}

export function buildPromoGalleryDocument(
  value: unknown,
  patch: PromoGalleryPatch,
  catalogAssets: readonly PromoGalleryAsset[],
) {
  const workspace = createPromoGalleryWorkspace(value);
  const document = workspace.document;
  const locale = workspace.locale;
  const galleries = galleryPatches(patch);
  const availableAssets = new Map((catalogAssets || []).map((asset) => [asset.assetId, asset]));
  const previousManagedUseKeys = new Set<string>();
  document.sections.filter((section: JsonRecord) => ['hero', 'gallery'].includes(section.type)
    || (section.type === 'owner' && patch.ownerMedia !== undefined))
    .forEach((section: JsonRecord) => {
      section.media_use_keys.forEach((useKey: string) => previousManagedUseKeys.add(useKey));
      if (section.config?.media_use_key) previousManagedUseKeys.add(section.config.media_use_key);
    });
  const allUseKeys = new Set(Object.keys(document.media_refs).filter((useKey) => !previousManagedUseKeys.has(useKey)));

  const hero = document.sections.find((section: JsonRecord) => section.type === 'hero');
  if (!hero) fail();
  const heroMedia = patch.heroMedia.map((item) => validateMediaPatch(item, 'hero', availableAssets, allUseKeys));
  hero.media_use_keys = heroMedia.map((item) => item.useKey);
  hero.config.media_use_key = hero.media_use_keys[0] || '';
  heroMedia.forEach((item) => setMediaReference(document, locale, item, 'hero'));

  const owner = document.sections.find((section: JsonRecord) => section.type === 'owner');
  if (!owner) fail();
  if (patch.ownerMedia !== undefined) {
    const ownerMedia = patch.ownerMedia
      ? validateMediaPatch(patch.ownerMedia, 'owner', availableAssets, allUseKeys)
      : null;
    owner.media_use_keys = ownerMedia ? [ownerMedia.useKey] : [];
    owner.config.media_use_key = ownerMedia?.useKey || '';
    if (ownerMedia) setMediaReference(document, locale, ownerMedia, 'owner');
  }

  const nextGalleries = galleries.map((raw) => {
    const sectionKey = checkedKey(raw.key);
    const existing = document.sections.find((section: JsonRecord) => section.key === sectionKey);
    if (existing && existing.type !== 'gallery') fail('invalid_promo_document');
    const itemKeys = new Set<string>();
    const galleryUseKeys: string[] = [];
    const itemDefinitions: JsonRecord[] = [];
    const localizedItems: JsonRecord[] = [];
    raw.items.forEach((rawItem: unknown) => {
      const item = exactKeys(rawItem, isRecord(rawItem) && Object.prototype.hasOwnProperty.call(rawItem, 'translations')
        ? ['key', 'featured', 'visible', 'name', 'summary', 'caption', 'translations', 'media']
        : ['key', 'featured', 'visible', 'name', 'summary', 'caption', 'media']);
      const itemKey = checkedKey(item.key);
      if (itemKeys.has(itemKey) || typeof item.featured !== 'boolean'
        || typeof item.visible !== 'boolean' || !Array.isArray(item.media)
        || item.media.length > PROMO_PRODUCT_MAX_MEDIA) fail();
      itemKeys.add(itemKey);
      const media = item.media.map((entry: unknown) => validateMediaPatch(entry, 'gallery', availableAssets, allUseKeys));
      media.forEach((entry) => {
        galleryUseKeys.push(entry.useKey);
        setMediaReference(document, locale, entry, 'gallery');
      });
      itemDefinitions.push({
        key: itemKey,
        media_use_keys: media.map((entry) => entry.useKey),
        featured: item.featured,
        visible: item.visible,
      });
      localizedItems.push({
        key: itemKey,
        name: safeText(item.name, PROMO_GALLERY_TEXT_LIMITS.name),
        summary: safeText(item.summary, PROMO_GALLERY_TEXT_LIMITS.summary),
        caption: safeText(item.caption, PROMO_GALLERY_TEXT_LIMITS.caption),
        translations: isRecord(item.translations) ? clone(item.translations) : {},
      });
    });
    const coverMedia = raw.coverMedia
      ? validateMediaPatch(raw.coverMedia, 'gallery', availableAssets, allUseKeys)
      : null;
    if (coverMedia) {
      galleryUseKeys.unshift(coverMedia.useKey);
      setMediaReference(document, locale, coverMedia, 'gallery');
    }
    const coverUseKey = checkedKey(coverMedia?.useKey || raw.coverUseKey, USE_KEY_PATTERN, true);
    if (coverUseKey && !galleryUseKeys.includes(coverUseKey)) fail('invalid_promo_media_reference');
    if (raw.visible && (!coverUseKey || itemDefinitions.some((item) => item.visible && !item.media_use_keys.length))) {
      fail('invalid_promo_document');
    }
    for (const [candidate, rawContent] of Object.entries(document.content_by_locale)) {
      const localized = rawContent as JsonRecord;
      const isDefault = candidate === locale;
      const previous = isRecord(localized.sections[sectionKey]) ? localized.sections[sectionKey] : {};
      localized.navigation[sectionKey] = isDefault
        ? safeText(raw.navigationLabel, PROMO_GALLERY_TEXT_LIMITS.navigation, true)
        : String(localized.navigation[sectionKey] || raw.navigationLabel);
      localized.sections[sectionKey] = {
        heading: isDefault ? safeText(raw.heading, PROMO_GALLERY_TEXT_LIMITS.heading) : String(previous.heading || raw.heading),
        summary: isDefault ? safeText(raw.summary, PROMO_GALLERY_TEXT_LIMITS.summary) : String(previous.summary || raw.summary),
        items: localizedGalleryItems(localized, sectionKey, localizedItems, isDefault, candidate),
      };
    }
    return {
      key: sectionKey,
      type: 'gallery',
      variant: 'default',
      visible: raw.visible,
      config: {
        item_keys: itemDefinitions.map((item) => item.key),
        cover_media_use_key: coverUseKey,
        items: itemDefinitions,
      },
      media_use_keys: Array.from(new Set([coverUseKey, ...galleryUseKeys].filter(Boolean))),
    };
  });

  const nextGalleryKeys = new Set(nextGalleries.map((section) => section.key));
  const removedGalleryKeys = new Set(document.sections
    .filter((section: JsonRecord) => section.type === 'gallery' && !nextGalleryKeys.has(section.key))
    .map((section: JsonRecord) => section.key));
  for (const content of Object.values(document.content_by_locale) as JsonRecord[]) {
    removedGalleryKeys.forEach((sectionKey) => {
      delete content.navigation[sectionKey];
      delete content.sections[sectionKey];
    });
  }
  document.sections.filter((section: JsonRecord) => section.type === 'services').forEach((section: JsonRecord) => {
    section.config.gallery_keys = (section.config.gallery_keys || []).map((galleryKey: string) => (
      removedGalleryKeys.has(galleryKey) ? '' : galleryKey
    ));
  });
  document.sections.filter((section: JsonRecord) => section.type === 'footer').forEach((section: JsonRecord) => {
    section.config.navigation_section_keys = (section.config.navigation_section_keys || [])
      .filter((sectionKey: string) => !removedGalleryKeys.has(sectionKey) && !nextGalleryKeys.has(sectionKey));
  });

  const withoutGalleries = document.sections.filter((section: JsonRecord) => section.type !== 'gallery');
  const featuredIndex = withoutGalleries.findIndex((section: JsonRecord) => section.type === 'featured_work');
  const contactIndex = withoutGalleries.findIndex((section: JsonRecord) => ['contact', 'footer'].includes(section.type));
  const insertion = featuredIndex >= 0 ? featuredIndex + 1 : (contactIndex >= 0 ? contactIndex : withoutGalleries.length);
  withoutGalleries.splice(insertion, 0, ...nextGalleries);
  document.sections = withoutGalleries;
  document.section_order = document.sections.map((section: JsonRecord) => section.key);

  const usedUseKeys = new Set<string>();
  document.sections.forEach((section: JsonRecord) => {
    section.media_use_keys.forEach((useKey: string) => usedUseKeys.add(useKey));
    if (['hero', 'owner'].includes(section.type) && section.config.media_use_key) usedUseKeys.add(section.config.media_use_key);
  });
  if (document.contact.qr_media_use_key) usedUseKeys.add(document.contact.qr_media_use_key);
  if (document.contact.logo_media_use_key) usedUseKeys.add(document.contact.logo_media_use_key);
  previousManagedUseKeys.forEach((useKey) => {
    if (usedUseKeys.has(useKey)) return;
    delete document.media_refs[useKey];
    for (const content of Object.values(document.content_by_locale) as JsonRecord[]) delete content.media_alt[useKey];
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
    blocked_by_plan: 'El plan actual bloquea la gestión de galerías.',
    invalid_payload: 'No se pudo preparar el guardado. Intenta nuevamente.',
    promo_permission_denied: 'Tu sesión no tiene todos los permisos necesarios para esta acción.',
    promo_capability_denied: 'La cuota o capacidad necesaria no está disponible para esta tienda.',
    promo_live_conflict: 'La página cambió en otra sesión. Recárgala antes de guardar.',
    promo_draft_conflict: 'La página cambió en otra sesión. Recárgala antes de guardar.',
    promo_translation_unavailable: 'La traducción automática no está disponible. No se guardó ningún cambio; intenta nuevamente.',
    promo_translation_invalid_response: 'La traducción automática devolvió contenido incompleto o no permitido. No se guardó ningún cambio.',
    invalid_promo_document: 'Revisa las galerías, portadas, trabajos y metadatos accesibles.',
    incomplete_promo_locale: 'Completa las traducciones de cada producto, trabajo y descripción accesible antes de guardar.',
    invalid_promo_media_reference: 'Selecciona un medio listo y del tipo correcto para esta ubicación.',
    unsafe_promo_document_value: 'El contenido incluye código, una URL o texto activo no permitido.',
    promo_media_duplicate: 'Este archivo ya existe en la biblioteca de la tienda.',
    promo_media_count_exceeded: 'La biblioteca alcanzó el máximo de medios permitido.',
    promo_media_storage_exceeded: 'La tienda alcanzó su cuota de almacenamiento.',
    promo_media_in_use: 'El medio sigue asociado a la página.',
    promo_media_conflict: 'El estado del medio cambió. Actualiza la biblioteca.',
    promo_media_not_found: 'El archivo ya no existe o pertenece a otra tienda.',
    promo_media_delete_failed: 'No se pudo eliminar físicamente el archivo. Intenta nuevamente.',
    promo_media_poster_required: 'Selecciona primero un poster listo para el video.',
    promo_media_required: 'Selecciona un archivo para continuar.',
    promo_media_name_invalid: 'El nombre o extensión del archivo no es válido.',
    promo_media_type_invalid: 'El formato del archivo no está permitido.',
    promo_media_type_mismatch: 'El contenido real no coincide con el tipo o extensión del archivo.',
    promo_media_size_invalid: 'El archivo supera el tamaño permitido.',
    promo_media_corrupt: 'El archivo está dañado o no contiene metadata válida.',
    promo_media_animated_unsupported: 'Las imágenes animadas no están permitidas.',
    promo_media_output_too_large: 'La imagen no pudo optimizarse dentro del límite permitido.',
    promo_media_dimensions_invalid: 'Las dimensiones del archivo no cumplen el perfil seleccionado.',
    promo_media_image_dimensions_invalid: 'La imagen debe tener dimensiones válidas.',
    promo_media_video_dimensions_invalid: 'El video debe respetar la resolución permitida.',
    promo_media_video_bitrate_invalid: 'El bitrate del video supera el máximo permitido.',
    invalid_origin: 'La solicitud no proviene del panel administrativo.',
  };
  return messages[String(code || '')] || 'No se pudo completar la operación. Intenta nuevamente.';
}
