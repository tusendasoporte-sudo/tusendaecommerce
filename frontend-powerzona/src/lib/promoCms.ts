export const PROMO_CMS_API_PATH = '/api/admin/promo-cms';
export const PROMO_CMS_DEFAULT_LOCALE = 'es';
export const PROMO_CMS_DOCUMENT_CONTRACT = 'promo.site.v2';
export const PROMO_CMS_LEGACY_DOCUMENT_CONTRACT = 'promo.site.v1';
export const PROMO_CMS_DRAFT_CONTRACT = 'promo.live.v1';

export const PROMO_CMS_MANAGED_SECTION_TYPES = Object.freeze([
  'hero',
  'services',
  'owner',
  'contact',
  'footer',
] as const);

export const PROMO_CMS_CONTACT_TYPES = Object.freeze([
  'whatsapp',
  'phone',
  'email',
] as const);

export const PROMO_CMS_FOOTER_SOCIAL_NETWORKS = Object.freeze([
  Object.freeze({ key: 'instagram', label: 'Instagram' }),
  Object.freeze({ key: 'facebook', label: 'Facebook' }),
  Object.freeze({ key: 'linkedin', label: 'LinkedIn' }),
  Object.freeze({ key: 'youtube', label: 'YouTube' }),
] as const);

export const PROMO_CMS_FOOTER_MAX_LINKS = 8;

export const PROMO_CMS_TEXT_LIMITS = Object.freeze({
  businessName: 140,
  slogan: 120,
  heading: 160,
  shortSummary: 600,
  body: 4000,
  itemName: 160,
  caption: 500,
  navigation: 80,
  contactLabel: 80,
  contactAria: 160,
  contactMessage: 1000,
});

const DOCUMENT_KEYS = Object.freeze([
  'contract', 'system_catalog_version', 'locales', 'theme', 'identity', 'section_order',
  'sections', 'media_refs', 'contact', 'content_by_locale', 'adapters',
]);
const LOCALIZED_KEYS = Object.freeze(['identity', 'navigation', 'sections', 'contact', 'media_alt', 'seo']);
const KEY_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const STORE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/;
const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FOOTER_SOCIAL_PATTERNS: Readonly<Record<string, RegExp>> = Object.freeze({
  instagram: /^(?!.*\.\.)(?:[a-z0-9](?:[a-z0-9._]{0,28}[a-z0-9_])?)$/,
  facebook: /^(?!.*\.\.)(?:[a-z0-9](?:[a-z0-9.]{0,48}[a-z0-9])?)$/,
  linkedin: /^(?:[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?)$/,
  youtube: /^(?:[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?)$/,
});
const SUPPORTED_SECTION_TYPES = new Set([
  'hero', 'services', 'featured_work', 'gallery', 'owner', 'store_rating', 'contact', 'footer',
]);

type JsonRecord = Record<string, any>;

export type PromoCmsScope = 'content' | 'contact';

export type PromoCmsDraft = Readonly<{
  version: number;
  document: JsonRecord;
}>;

export type PromoCmsContentPatch = Readonly<{
  identity: Readonly<{ name: string; slogan: string; summary: string }>;
  sectionOrder: readonly string[];
  sections: readonly Readonly<{
    key: string;
    visible: boolean;
    navigationLabel: string;
    heading?: string;
    summary?: string;
    name?: string;
    bio?: string;
    text?: string;
    navigationSectionKeys?: readonly string[];
    socialProfiles?: readonly Readonly<{ network: string; handle: string }>[];
    items?: readonly Readonly<{
      key: string;
      name: string;
      summary: string;
      caption: string;
      galleryKey?: string;
    }>[];
  }>[];
}>;

export type PromoCmsContactPatch = Readonly<{
  enabled: boolean;
  logoMediaUseKey?: string;
  qrMediaUseKey?: string;
  primaryActionKey: string;
  secondaryActionKeys: readonly string[];
  section: Readonly<{
    key: string;
    visible: boolean;
    navigationLabel: string;
    heading: string;
    summary: string;
  }>;
  actions: readonly Readonly<{
    key: string;
    type: string;
    enabled: boolean;
    destination: string;
    label: string;
    ariaLabel: string;
    message: string;
    preserve?: boolean;
  }>[];
}>;

export class PromoCmsError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code = 'promo_cms_unavailable', status = 400) {
    super('No se pudo completar la edición de contenido Promo.');
    this.name = 'PromoCmsError';
    this.code = code;
    this.status = status;
  }
}

function fail(code = 'invalid_payload', status = 400): never {
  throw new PromoCmsError(code, status);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: unknown, expected: readonly string[]) {
  if (!isRecord(value)) fail('invalid_payload');
  const actual = Object.keys(value).sort();
  const target = [...expected].sort();
  if (actual.length !== target.length || actual.some((key, index) => key !== target[index])) {
    fail('invalid_payload');
  }
  return value;
}

function clone<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return fail('invalid_payload');
  }
}

function safeText(value: unknown, max: number, empty = true) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) {
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

function key(value: unknown, empty = false) {
  const normalized = typeof value === 'string' ? value : '';
  if ((empty && !normalized) || KEY_PATTERN.test(normalized)) return normalized;
  return fail('invalid_promo_document');
}

function emptyLocalizedContent(): JsonRecord {
  return {
    identity: {},
    navigation: {},
    sections: {},
    contact: {},
    media_alt: {},
    seo: {},
  };
}

function sectionDefinition(type: (typeof PROMO_CMS_MANAGED_SECTION_TYPES)[number]) {
  const definitions: Record<string, JsonRecord> = {
    hero: { key: 'hero-main', config: { media_use_key: '', action_key: '' } },
    services: { key: 'services-main', config: { item_keys: [], gallery_keys: [] } },
    owner: { key: 'owner-main', config: { media_use_key: '' } },
    contact: { key: 'contact-main', config: { action_keys: [] } },
    footer: { key: 'footer-main', config: { navigation_section_keys: [], social_profiles: [] } },
  };
  return definitions[type];
}

function localizedSectionDefinition(type: string) {
  const definitions: Record<string, JsonRecord> = {
    hero: { heading: '', summary: '' },
    services: { heading: '', summary: '', items: [] },
    owner: { heading: '', name: '', bio: '' },
    contact: { heading: '', summary: '' },
    footer: { heading: '', summary: '', text: '' },
  };
  return clone(definitions[type] || {});
}

function navigationDefault(type: string) {
  return ({
    hero: 'Inicio',
    services: 'Servicios',
    owner: 'Propietario',
    contact: 'Contacto',
    footer: 'Pie del sitio',
  } as Record<string, string>)[type] || 'Sección';
}

function uniqueMigratedKey(used: Set<string>, preferred: string, maximum = 64) {
  const normalized = String(preferred || 'item').toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, maximum) || 'item';
  const base = /^[a-z]/.test(normalized) ? normalized : `item-${normalized}`.slice(0, maximum);
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const ending = `-${suffix}`;
    const candidate = `${base.slice(0, Math.max(1, maximum - ending.length))}${ending}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  return fail('invalid_promo_document');
}

function upgradeLegacyPromoCmsDocument(value: JsonRecord) {
  const next = clone(value);
  if (next.contract === PROMO_CMS_DOCUMENT_CONTRACT) return next;
  if (next.contract !== PROMO_CMS_LEGACY_DOCUMENT_CONTRACT) fail('invalid_payload');
  if (!Array.isArray(next.sections) || !Array.isArray(next.section_order)
    || !isRecord(next.contact) || !isRecord(next.content_by_locale)) fail('invalid_payload');

  next.contract = PROMO_CMS_DOCUMENT_CONTRACT;
  next.contact = { ...next.contact, logo_media_use_key: '', qr_media_use_key: '' };
  const localizedEntries = Object.values(next.content_by_locale);
  localizedEntries.forEach((localized) => {
    if (!isRecord(localized) || !isRecord(localized.identity) || !isRecord(localized.sections)) {
      fail('invalid_payload');
    }
  });

  const sectionKeys = new Set(next.sections.map((section: JsonRecord) => String(section && section.key || '')));
  const gallerySections = next.sections.filter((section: JsonRecord) => section && section.type === 'gallery');
  const legacyFeatured = next.sections.filter((section: JsonRecord) => section && section.type === 'featured_work');
  if (!gallerySections.length && legacyFeatured.some((section: JsonRecord) => (
    Array.isArray(section.config?.item_keys) && section.config.item_keys.length
  ))) {
    const sectionKey = uniqueMigratedKey(sectionKeys, 'gallery-portfolio');
    const gallery = {
      key: sectionKey,
      type: 'gallery',
      variant: 'default',
      visible: true,
      config: { item_keys: [], cover_media_use_key: '', items: [] },
      media_use_keys: [],
    };
    next.sections.push(gallery);
    next.section_order.push(sectionKey);
    gallerySections.push(gallery);
    localizedEntries.forEach((localized: any) => {
      localized.navigation[sectionKey] = 'Galería';
      localized.sections[sectionKey] = { heading: 'Galería', summary: '', items: [] };
    });
  }

  gallerySections.forEach((section: JsonRecord) => {
    if (!isRecord(section.config) || !Array.isArray(section.config.item_keys)
      || !Array.isArray(section.media_use_keys)) fail('invalid_payload');
    const itemKeys = section.config.item_keys.slice();
    const mediaKeys = section.media_use_keys.slice();
    section.config = {
      item_keys: itemKeys,
      cover_media_use_key: mediaKeys[0] || '',
      items: itemKeys.map((itemKey: string, index: number) => ({
        key: itemKey,
        media_use_keys: mediaKeys[index] ? [mediaKeys[index]] : [],
        featured: false,
        visible: true,
      })),
    };
    section.media_use_keys = Array.from(new Set([
      section.config.cover_media_use_key,
      ...section.config.items.flatMap((item: JsonRecord) => item.media_use_keys),
    ].filter(Boolean)));
    localizedEntries.forEach((localized: any) => {
      const content = isRecord(localized.sections[section.key])
        ? localized.sections[section.key]
        : { heading: '', summary: '', items: [] };
      const existing = new Map((Array.isArray(content.items) ? content.items : [])
        .filter(isRecord).map((item: JsonRecord) => [item.key, item]));
      content.items = itemKeys.map((itemKey: string, index: number) => {
        const item = existing.get(itemKey) || {};
        const caption = String(item.caption || '');
        return {
          key: itemKey,
          name: String(item.name || caption || `Trabajo ${index + 1}`),
          summary: String(item.summary || ''),
          caption,
        };
      });
      localized.sections[section.key] = content;
    });
  });

  const targetGallery = gallerySections[0] || null;
  legacyFeatured.forEach((section: JsonRecord) => {
    if (!isRecord(section.config) || !Array.isArray(section.config.item_keys)
      || !Array.isArray(section.media_use_keys)) fail('invalid_payload');
    const itemKeys = section.config.item_keys.slice();
    const mediaKeys = section.media_use_keys.slice();
    if (targetGallery) {
      const usedItemKeys = new Set(targetGallery.config.item_keys);
      itemKeys.forEach((legacyKey: string, index: number) => {
        const itemKey = uniqueMigratedKey(usedItemKeys, legacyKey);
        const mediaKey = mediaKeys[index] || '';
        targetGallery.config.item_keys.push(itemKey);
        targetGallery.config.items.push({
          key: itemKey,
          media_use_keys: mediaKey ? [mediaKey] : [],
          featured: true,
          visible: true,
        });
        if (mediaKey && !targetGallery.media_use_keys.includes(mediaKey)) targetGallery.media_use_keys.push(mediaKey);
        localizedEntries.forEach((localized: any) => {
          const featured = isRecord(localized.sections[section.key]) ? localized.sections[section.key] : {};
          const legacyItem = (Array.isArray(featured.items) ? featured.items : [])
            .find((item: JsonRecord) => item && item.key === legacyKey) || {};
          const target = localized.sections[targetGallery.key];
          target.items.push({
            key: itemKey,
            name: String(legacyItem.name || legacyItem.caption || `Trabajo ${target.items.length + 1}`),
            summary: String(legacyItem.summary || ''),
            caption: String(legacyItem.caption || ''),
          });
        });
      });
    }
    section.config = { item_keys: [] };
    section.media_use_keys = [];
    localizedEntries.forEach((localized: any) => {
      const content = localized.sections[section.key];
      if (isRecord(content)) delete content.items;
    });
  });

  next.sections.filter((section: JsonRecord) => section && section.type === 'services').forEach((section: JsonRecord) => {
    if (!isRecord(section.config) || !Array.isArray(section.config.item_keys)) fail('invalid_payload');
    section.config = {
      item_keys: section.config.item_keys.slice(),
      gallery_keys: section.config.item_keys.map(() => targetGallery ? targetGallery.key : ''),
    };
    section.media_use_keys = [];
  });
  localizedEntries.forEach((localized: any) => {
    localized.identity = { ...localized.identity, slogan: String(localized.identity.slogan || '') };
  });
  return next;
}

export function normalizePromoCmsDocument(value: unknown) {
  const input = exactKeys(value, DOCUMENT_KEYS);
  if (![PROMO_CMS_DOCUMENT_CONTRACT, PROMO_CMS_LEGACY_DOCUMENT_CONTRACT].includes(String(input.contract || ''))
    || input.system_catalog_version !== 'promo.system.v1'
    || !isRecord(input.locales)
    || !Array.isArray(input.locales.published)
    || !isRecord(input.theme)
    || !isRecord(input.identity)
    || !Array.isArray(input.section_order)
    || !Array.isArray(input.sections)
    || !isRecord(input.media_refs)
    || !isRecord(input.contact)
    || !isRecord(input.content_by_locale)
    || !isRecord(input.adapters)) {
    fail('invalid_payload');
  }
  const document = upgradeLegacyPromoCmsDocument(input);
  if (document.contract !== PROMO_CMS_DOCUMENT_CONTRACT
    || document.system_catalog_version !== 'promo.system.v1'
    || !isRecord(document.locales)
    || !Array.isArray(document.locales.published)
    || !isRecord(document.theme)
    || !isRecord(document.identity)
    || !Array.isArray(document.section_order)
    || !Array.isArray(document.sections)
    || !isRecord(document.media_refs)
    || !isRecord(document.contact)
    || !isRecord(document.content_by_locale)
    || !isRecord(document.adapters)) {
    fail('invalid_payload');
  }
  const sectionKeys = document.sections.map((section: unknown) => {
    if (!isRecord(section) || !KEY_PATTERN.test(String(section.key || ''))
      || !SUPPORTED_SECTION_TYPES.has(String(section.type || ''))
      || !isRecord(section.config) || !Array.isArray(section.media_use_keys)) {
      fail('invalid_payload');
    }
    return String(section.key);
  });
  if (new Set(sectionKeys).size !== sectionKeys.length
    || document.section_order.length !== sectionKeys.length
    || document.section_order.some((sectionKey: unknown, index: number) => sectionKey !== sectionKeys[index])) {
    fail('invalid_payload');
  }
  return clone(document);
}

export function normalizePromoCmsDraftResponse(value: unknown): PromoCmsDraft {
  const response = exactKeys(value, ['ok', 'contract', 'draft']);
  if (response.ok !== true || response.contract !== PROMO_CMS_DRAFT_CONTRACT) fail('invalid_payload');
  const draft = exactKeys(response.draft, ['schema_version', 'version', 'generation', 'public_state', 'document']);
  if (draft.schema_version !== 2 || !Number.isSafeInteger(draft.version) || draft.version < 1
    || !Number.isSafeInteger(draft.generation) || draft.generation < 0
    || !['active', 'inactive'].includes(String(draft.public_state || ''))) {
    fail('invalid_payload');
  }
  return Object.freeze({
    version: draft.version,
    document: normalizePromoCmsDocument(draft.document),
  });
}

export function promoCmsStoreSlug(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  return STORE_SLUG_PATTERN.test(normalized) ? normalized : '';
}

export function promoCmsSameOriginMutation(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const origin = new URL(String(request.headers.get('origin') || '').trim());
    const fetchSite = String(request.headers.get('sec-fetch-site') || '').trim().toLowerCase();
    if (fetchSite && fetchSite !== 'same-origin') return false;
    if (origin.origin === requestUrl.origin) return true;
    const forwardedProto = String(request.headers.get('x-forwarded-proto') || '').trim().toLowerCase();
    const forwardedHost = String(request.headers.get('x-forwarded-host') || '').trim().toLowerCase();
    if (!forwardedProto || !forwardedHost || forwardedProto.includes(',') || forwardedHost.includes(',')) return false;
    return forwardedProto === origin.protocol.slice(0, -1)
      && forwardedHost === requestUrl.host.toLowerCase()
      && forwardedHost === origin.host.toLowerCase();
  } catch (_) {
    return false;
  }
}

export function parsePromoCmsUpdate(value: unknown) {
  const body = exactKeys(value, ['expected_version', 'document']);
  const expectedVersion = Number(body.expected_version);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) fail('invalid_payload');
  return Object.freeze({
    expectedVersion,
    document: normalizePromoCmsDocument(body.document),
  });
}

function ensureLocale(document: JsonRecord) {
  let locale = String(document.locales.default || '');
  if (!locale) {
    locale = PROMO_CMS_DEFAULT_LOCALE;
    document.locales = { default: locale, published: [locale] };
  }
  if (!document.locales.published.includes(locale)) fail('invalid_payload');
  if (!isRecord(document.content_by_locale[locale])) {
    document.content_by_locale[locale] = emptyLocalizedContent();
  } else {
    const localized = exactKeys(document.content_by_locale[locale], LOCALIZED_KEYS);
    LOCALIZED_KEYS.forEach((field) => {
      if (!isRecord(localized[field])) fail('invalid_payload');
    });
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

function ensureSection(document: JsonRecord, locale: string, type: (typeof PROMO_CMS_MANAGED_SECTION_TYPES)[number]) {
  const existing = document.sections.find((section: JsonRecord) => section.type === type);
  if (existing) return existing;
  const definition = sectionDefinition(type);
  const sectionKey = uniqueSectionKey(document, definition.key);
  const section = {
    key: sectionKey,
    type,
    variant: 'default',
    visible: true,
    config: clone(definition.config),
    media_use_keys: [],
  };
  document.sections.push(section);
  document.section_order.push(sectionKey);
  const localized = document.content_by_locale[locale];
  localized.navigation[sectionKey] = navigationDefault(type);
  localized.sections[sectionKey] = localizedSectionDefinition(type);
  return section;
}

export function createPromoCmsWorkspace(value: unknown, scope: PromoCmsScope) {
  const document = normalizePromoCmsDocument(value);
  const locale = ensureLocale(document);
  if (scope === 'content') {
    (['hero', 'services', 'owner', 'footer'] as const).forEach((type) => ensureSection(document, locale, type));
  } else if (scope === 'contact') {
    ensureSection(document, locale, 'contact');
  } else {
    fail('invalid_payload');
  }
  return Object.freeze({ document, locale });
}

function patchByKey<T extends { key: string }>(items: readonly T[]) {
  const result = new Map<string, T>();
  items.forEach((item) => {
    const itemKey = key(item?.key);
    if (result.has(itemKey)) fail('invalid_payload');
    result.set(itemKey, item);
  });
  return result;
}

function footerSocialProfiles(value: unknown) {
  if (!Array.isArray(value) || value.length > PROMO_CMS_FOOTER_SOCIAL_NETWORKS.length) {
    fail('invalid_promo_document');
  }
  const networks = new Set<string>();
  return value.map((raw) => {
    if (!isRecord(raw) || Object.keys(raw).sort().join(',') !== 'handle,network') fail('invalid_payload');
    const network = String(raw.network || '');
    const handle = String(raw.handle || '').trim().toLowerCase();
    if (networks.has(network) || !FOOTER_SOCIAL_PATTERNS[network]?.test(handle)) {
      fail('invalid_promo_document');
    }
    networks.add(network);
    return { network, handle };
  });
}

export function buildPromoCmsContentDocument(
  value: unknown,
  patch: PromoCmsContentPatch,
  maxServices = 50,
) {
  const document = normalizePromoCmsDocument(value);
  const locale = ensureLocale(document);
  const localized = document.content_by_locale[locale];
  const patchSections = patchByKey(patch.sections || []);
  const sectionKeys = document.sections.map((section: JsonRecord) => section.key);
  if (!Array.isArray(patch.sectionOrder)
    || patch.sectionOrder.length !== sectionKeys.length
    || new Set(patch.sectionOrder).size !== sectionKeys.length
    || patch.sectionOrder.some((sectionKey) => !sectionKeys.includes(sectionKey))
    || patchSections.size !== sectionKeys.length) {
    fail('invalid_payload');
  }

  const name = safeText(patch.identity?.name, PROMO_CMS_TEXT_LIMITS.businessName);
  const slogan = safeText(patch.identity?.slogan || '', PROMO_CMS_TEXT_LIMITS.slogan);
  const summary = safeText(patch.identity?.summary, PROMO_CMS_TEXT_LIMITS.shortSummary);
  localized.identity = { ...localized.identity, name, slogan, summary };

  let serviceCount = 0;
  const sectionMap = new Map(document.sections.map((section: JsonRecord) => [section.key, section]));
  document.section_order = patch.sectionOrder.slice();
  document.sections = document.section_order.map((sectionKey: string) => {
    const section = sectionMap.get(sectionKey);
    const sectionPatch = patchSections.get(sectionKey);
    if (!section || !sectionPatch || typeof sectionPatch.visible !== 'boolean') fail('invalid_payload');
    section.visible = sectionPatch.visible;
    localized.navigation[sectionKey] = safeText(
      sectionPatch.navigationLabel,
      PROMO_CMS_TEXT_LIMITS.navigation,
      false,
    );
    const current = isRecord(localized.sections[sectionKey]) ? localized.sections[sectionKey] : {};
    if (section.type === 'hero') {
      localized.sections[sectionKey] = {
        ...current,
        heading: safeText(sectionPatch.heading || '', PROMO_CMS_TEXT_LIMITS.heading),
        summary: safeText(sectionPatch.summary || '', PROMO_CMS_TEXT_LIMITS.shortSummary),
      };
    } else if (section.type === 'services') {
      const items = Array.isArray(sectionPatch.items) ? sectionPatch.items : [];
      const itemKeys = new Set<string>();
      const previousGalleryByItem = new Map<string, string>((section.config.item_keys || []).map(
        (itemKey: string, index: number) => [itemKey, String(section.config.gallery_keys?.[index] || '')],
      ));
      const normalizedItems = items.map((item) => {
        const itemKey = key(item.key);
        if (itemKeys.has(itemKey)) fail('invalid_promo_document');
        itemKeys.add(itemKey);
        return {
          key: itemKey,
          name: safeText(item.name, PROMO_CMS_TEXT_LIMITS.itemName),
          summary: safeText(item.summary, PROMO_CMS_TEXT_LIMITS.shortSummary),
          caption: safeText(item.caption, PROMO_CMS_TEXT_LIMITS.caption),
          galleryKey: key(item.galleryKey ?? previousGalleryByItem.get(itemKey) ?? '', true),
        };
      });
      serviceCount += normalizedItems.length;
      section.config.item_keys = normalizedItems.map((item) => item.key);
      section.config.gallery_keys = normalizedItems.map((item) => item.galleryKey);
      localized.sections[sectionKey] = {
        ...current,
        heading: safeText(sectionPatch.heading || '', PROMO_CMS_TEXT_LIMITS.heading),
        summary: safeText(sectionPatch.summary || '', PROMO_CMS_TEXT_LIMITS.shortSummary),
        items: normalizedItems.map(({ key: itemKey, name, summary, caption }) => ({
          key: itemKey,
          name,
          summary,
          caption,
        })),
      };
    } else if (section.type === 'owner') {
      localized.sections[sectionKey] = {
        ...current,
        heading: safeText(sectionPatch.heading || '', PROMO_CMS_TEXT_LIMITS.heading),
        name: safeText(sectionPatch.name || '', PROMO_CMS_TEXT_LIMITS.businessName),
        bio: safeText(sectionPatch.bio || '', PROMO_CMS_TEXT_LIMITS.body),
      };
    } else if (section.type === 'footer') {
      const navigationSectionKeys = Array.isArray(sectionPatch.navigationSectionKeys)
        ? sectionPatch.navigationSectionKeys.map((sectionKey) => key(sectionKey))
        : [];
      if (navigationSectionKeys.length > PROMO_CMS_FOOTER_MAX_LINKS
        || new Set(navigationSectionKeys).size !== navigationSectionKeys.length
        || navigationSectionKeys.some((targetKey) => {
          const target = sectionMap.get(targetKey);
          const targetPatch = patchSections.get(targetKey);
          return !target || target.type === 'footer' || !targetPatch?.visible;
        })) {
        fail('invalid_promo_document');
      }
      const socialProfiles = footerSocialProfiles(sectionPatch.socialProfiles || []);
      section.config = {
        navigation_section_keys: navigationSectionKeys,
        social_profiles: socialProfiles,
      };
      localized.sections[sectionKey] = {
        ...current,
        heading: safeText(sectionPatch.heading || '', PROMO_CMS_TEXT_LIMITS.heading),
        summary: safeText(sectionPatch.summary || '', PROMO_CMS_TEXT_LIMITS.shortSummary),
        text: safeText(sectionPatch.text || '', PROMO_CMS_TEXT_LIMITS.body),
      };
    }
    return section;
  });

  const effectiveMax = Number.isSafeInteger(maxServices) && maxServices >= 0 ? maxServices : 0;
  if (serviceCount > effectiveMax) fail('promo_capability_denied', 403);
  return document;
}

function actionConfig(type: string, destination: string) {
  if (type === 'whatsapp' || type === 'phone') {
    if (!E164_PATTERN.test(destination)) fail('invalid_promo_document');
    return { phone_e164: destination };
  }
  if (type === 'email') {
    if (destination.length > 254 || !EMAIL_PATTERN.test(destination)) fail('invalid_promo_document');
    return { email_address: destination };
  }
  return fail('unsupported_promo_action');
}

export function buildPromoCmsContactDocument(value: unknown, patch: PromoCmsContactPatch) {
  const document = normalizePromoCmsDocument(value);
  const locale = ensureLocale(document);
  const localized = document.content_by_locale[locale];
  const contactSection = document.sections.find((section: JsonRecord) => section.key === patch.section?.key);
  if (!contactSection || contactSection.type !== 'contact' || typeof patch.section.visible !== 'boolean') {
    fail('invalid_payload');
  }
  contactSection.visible = patch.section.visible;
  localized.navigation[contactSection.key] = safeText(
    patch.section.navigationLabel,
    PROMO_CMS_TEXT_LIMITS.navigation,
    false,
  );
  localized.sections[contactSection.key] = {
    ...(isRecord(localized.sections[contactSection.key]) ? localized.sections[contactSection.key] : {}),
    heading: safeText(patch.section.heading, PROMO_CMS_TEXT_LIMITS.heading),
    summary: safeText(patch.section.summary, PROMO_CMS_TEXT_LIMITS.shortSummary),
  };

  const previousActions = new Map(document.contact.actions.map((action: JsonRecord) => [action.key, action]));
  const previousText = isRecord(localized.contact) ? localized.contact : {};
  const actionKeys = new Set<string>();
  const nextText: JsonRecord = { ...previousText };
  const actions = (patch.actions || []).map((action) => {
    const actionKey = key(action.key);
    if (actionKeys.has(actionKey)) fail('invalid_payload');
    actionKeys.add(actionKey);
    if (action.preserve === true) {
      const previous = previousActions.get(actionKey);
      if (!previous || previous.type !== action.type) fail('invalid_payload');
      return clone(previous);
    }
    if (!PROMO_CMS_CONTACT_TYPES.includes(action.type as any)) fail('unsupported_promo_action');
    if (typeof action.enabled !== 'boolean') fail('invalid_payload');
    nextText[actionKey] = {
      label: safeText(action.label, PROMO_CMS_TEXT_LIMITS.contactLabel),
      aria_label: safeText(action.ariaLabel, PROMO_CMS_TEXT_LIMITS.contactAria),
      message: safeText(action.message, PROMO_CMS_TEXT_LIMITS.contactMessage),
    };
    return {
      key: actionKey,
      type: action.type,
      enabled: action.enabled,
      config: actionConfig(action.type, String(action.destination || '').trim()),
    };
  });
  if (actions.length > 32) fail('invalid_promo_document');
  if ([...previousActions.keys()].some((actionKey) => !actionKeys.has(actionKey))) {
    fail('invalid_payload');
  }

  const enabledKeys = new Set(actions.filter((action: JsonRecord) => action.enabled).map((action: JsonRecord) => action.key));
  const enabled = patch.enabled === true;
  const primaryActionKey = enabled ? key(patch.primaryActionKey) : '';
  const secondaryActionKeys = enabled ? [...patch.secondaryActionKeys] : [];
  if (enabled && !enabledKeys.has(primaryActionKey)) fail('invalid_promo_document');
  if (new Set(secondaryActionKeys).size !== secondaryActionKeys.length
    || secondaryActionKeys.some((actionKey) => (
      actionKey === primaryActionKey || !enabledKeys.has(actionKey) || !KEY_PATTERN.test(actionKey)
    ))) {
    fail('invalid_promo_document');
  }
  document.contact = {
    enabled,
    primary_action_key: primaryActionKey,
    secondary_action_keys: secondaryActionKeys,
    actions,
    logo_media_use_key: key(patch.logoMediaUseKey ?? document.contact.logo_media_use_key ?? '', true),
    qr_media_use_key: key(patch.qrMediaUseKey ?? document.contact.qr_media_use_key ?? '', true),
  };
  contactSection.config.action_keys = actions.filter((action: JsonRecord) => action.enabled)
    .map((action: JsonRecord) => action.key);
  localized.contact = nextText;
  return document;
}

export function promoCmsErrorMessage(code: unknown) {
  const messages: Record<string, string> = {
    unauthorized: 'Tu sesión terminó. Vuelve a iniciar sesión.',
    session_revoked: 'Tu sesión ya no está vigente. Vuelve a iniciar sesión.',
    blocked_by_plan: 'El plan actual bloquea la edición de este sitio.',
    promo_capability_denied: 'La capacidad o cuota necesaria no está disponible para esta tienda.',
    promo_permission_denied: 'Tu sesión no tiene todos los permisos requeridos para guardar este cambio.',
    promo_live_conflict: 'La página cambió en otra sesión. Recárgala antes de volver a guardar.',
    promo_draft_conflict: 'La página cambió en otra sesión. Recárgala antes de volver a guardar.',
    invalid_promo_document: 'Revisa los campos: hay datos incompletos o con un formato no permitido.',
    unsafe_promo_document_value: 'El contenido incluye código, una URL o texto activo no permitido.',
    unsupported_promo_action: 'Ese tipo de contacto todavía no está habilitado.',
    invalid_origin: 'La solicitud no proviene del panel administrativo.',
  };
  return messages[String(code || '')] || 'No se pudo completar la operación. Intenta nuevamente.';
}
