import { isPromoServiceIconKey } from './promoServiceIcons.ts';

export const PROMO_CMS_API_PATH = '/api/admin/promo-cms';
export const PROMO_CMS_DEFAULT_LOCALE = 'es';
export const PROMO_CMS_DOCUMENT_CONTRACT = 'promo.site.v2';
export const PROMO_CMS_LEGACY_DOCUMENT_CONTRACT = 'promo.site.v1';
export const PROMO_CMS_DRAFT_CONTRACT = 'promo.live.v1';
export const PROMO_CMS_VIDEO_GALLERY_KEY = 'videos-main';
export const PROMO_CMS_WORK_GALLERY_KEY = PROMO_CMS_VIDEO_GALLERY_KEY;

export const PROMO_CMS_HERO_LAYOUTS = Object.freeze([
  'immersive',
  'split',
  'centered',
  'editorial',
] as const);

export const PROMO_CMS_HERO_CONTRAST_MODES = Object.freeze([
  'auto',
  'light',
  'dark',
  'custom',
] as const);

export const PROMO_CMS_HERO_OVERLAY_STRENGTHS = Object.freeze([
  'soft',
  'medium',
  'strong',
] as const);

export const PROMO_CMS_HERO_DEFAULT_COLORS = Object.freeze({
  title: '#ffffff',
  body: '#e2e8f0',
  accent: '#93c5fd',
});

export const PROMO_CMS_HERO_BUTTON_TARGETS = Object.freeze([
  'primary-contact',
  'contact-section',
  'services-section',
  'work-section',
] as const);

export const PROMO_CMS_HERO_MAX_HIGHLIGHTS = 4;
export const PROMO_CMS_HERO_MAX_BUTTONS = 2;

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

export const PROMO_CMS_FOOTER_CONTRAST_MODES = Object.freeze([
  'auto',
  'light',
  'dark',
  'custom',
] as const);

export const PROMO_CMS_FOOTER_DEFAULT_COLORS = Object.freeze({
  title: '#ffffff',
  body: '#e2e8f0',
  accent: '#d8b25c',
});

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
  contactCtaLabel: 80,
  contactLabel: 80,
  contactAria: 160,
  contactMessage: 1000,
  heroIntro: 120,
  heroHighlight: 80,
  heroButton: 80,
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
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
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
  identity: Readonly<{ name: string; slogan: string; summary: string; contactCtaLabel: string }>;
  sectionOrder: readonly string[];
  sections: readonly Readonly<{
    key: string;
    visible: boolean;
    navigationLabel: string;
    heading?: string;
    summary?: string;
    consultationHeading?: string;
    qrHeading?: string;
    intro?: string;
    heroLayout?: string;
    heroContrastMode?: string;
    heroTitleColor?: string;
    heroBodyColor?: string;
    heroAccentColor?: string;
    heroOverlayStrength?: string;
    highlights?: readonly string[];
    buttons?: readonly Readonly<{ target: string; label: string }>[];
    name?: string;
    bio?: string;
    text?: string;
    footerContrastMode?: string;
    footerTitleColor?: string;
    footerBodyColor?: string;
    footerAccentColor?: string;
    navigationSectionKeys?: readonly string[];
    socialProfiles?: readonly Readonly<{ network: string; handle: string }>[];
    items?: readonly Readonly<{
      key: string;
      name: string;
      summary: string;
      caption: string;
      galleryKey?: string;
      iconKey?: string;
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

function serviceIconKey(value: unknown) {
  const normalized = typeof value === 'string' ? value : '';
  if (!normalized || isPromoServiceIconKey(normalized)) return normalized;
  return fail('invalid_promo_document');
}

function promoColor(value: unknown) {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  if (HEX_COLOR_PATTERN.test(normalized)) return normalized;
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
    hero: {
      key: 'hero-main',
      config: {
        media_use_key: '',
        action_key: '',
        layout: 'immersive',
        button_targets: ['primary-contact'],
        contrast_mode: 'auto',
        title_color: PROMO_CMS_HERO_DEFAULT_COLORS.title,
        body_color: PROMO_CMS_HERO_DEFAULT_COLORS.body,
        accent_color: PROMO_CMS_HERO_DEFAULT_COLORS.accent,
        overlay_strength: 'medium',
      },
    },
    services: { key: 'services-main', config: { item_keys: [], gallery_keys: [], icon_keys: [] } },
    owner: { key: 'owner-main', config: { media_use_key: '' } },
    contact: { key: 'contact-main', config: { action_keys: [] } },
    footer: {
      key: 'footer-main',
      config: {
        navigation_section_keys: [],
        social_profiles: [],
        contrast_mode: 'auto',
        title_color: PROMO_CMS_FOOTER_DEFAULT_COLORS.title,
        body_color: PROMO_CMS_FOOTER_DEFAULT_COLORS.body,
        accent_color: PROMO_CMS_FOOTER_DEFAULT_COLORS.accent,
      },
    },
  };
  return definitions[type];
}

function localizedSectionDefinition(type: string) {
  const definitions: Record<string, JsonRecord> = {
    hero: { heading: '', intro: '', summary: '', highlights: [], button_labels: [''] },
    services: { heading: '', summary: '', items: [] },
    owner: { heading: '', name: '', bio: '' },
    contact: { heading: '', consultation_heading: '', summary: '', qr_heading: '' },
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

function upgradeHeroPresentation(document: JsonRecord) {
  const heroSections = Array.isArray(document.sections)
    ? document.sections.filter((section: JsonRecord) => section?.type === 'hero')
    : [];
  heroSections.forEach((section: JsonRecord) => {
    const config = isRecord(section.config) ? section.config : {};
    const layout = PROMO_CMS_HERO_LAYOUTS.includes(config.layout as any)
      ? config.layout
      : 'immersive';
    const targets = Array.isArray(config.button_targets)
      ? config.button_targets.filter((target: unknown) => PROMO_CMS_HERO_BUTTON_TARGETS.includes(target as any))
      : ['primary-contact'];
    const contrastMode = PROMO_CMS_HERO_CONTRAST_MODES.includes(config.contrast_mode as any)
      ? config.contrast_mode : 'auto';
    const overlayStrength = PROMO_CMS_HERO_OVERLAY_STRENGTHS.includes(config.overlay_strength as any)
      ? config.overlay_strength : 'medium';
    section.config = {
      media_use_key: String(config.media_use_key || ''),
      action_key: String(config.action_key || ''),
      layout,
      button_targets: Array.from(new Set(targets)).slice(0, PROMO_CMS_HERO_MAX_BUTTONS),
      contrast_mode: contrastMode,
      title_color: HEX_COLOR_PATTERN.test(String(config.title_color || ''))
        ? String(config.title_color).toLowerCase() : PROMO_CMS_HERO_DEFAULT_COLORS.title,
      body_color: HEX_COLOR_PATTERN.test(String(config.body_color || ''))
        ? String(config.body_color).toLowerCase() : PROMO_CMS_HERO_DEFAULT_COLORS.body,
      accent_color: HEX_COLOR_PATTERN.test(String(config.accent_color || ''))
        ? String(config.accent_color).toLowerCase() : PROMO_CMS_HERO_DEFAULT_COLORS.accent,
      overlay_strength: overlayStrength,
    };
  });
  Object.values(document.content_by_locale || {}).forEach((rawLocalized) => {
    const localized = rawLocalized as JsonRecord;
    if (!isRecord(localized.sections)) return;
    heroSections.forEach((section: JsonRecord) => {
      const content = isRecord(localized.sections[section.key]) ? localized.sections[section.key] : {};
      const highlights = Array.isArray(content.highlights)
        ? content.highlights.map(String).slice(0, PROMO_CMS_HERO_MAX_HIGHLIGHTS)
        : [];
      const buttonLabels = Array.isArray(content.button_labels)
        ? content.button_labels.map(String).slice(0, PROMO_CMS_HERO_MAX_BUTTONS)
        : section.config.button_targets.map(() => '');
      while (buttonLabels.length < section.config.button_targets.length) buttonLabels.push('');
      localized.sections[section.key] = {
        ...content,
        intro: String(content.intro || ''),
        highlights,
        button_labels: buttonLabels.slice(0, section.config.button_targets.length),
      };
    });
  });
  return document;
}

function upgradeFooterPresentation(document: JsonRecord) {
  if (!Array.isArray(document.sections)) return document;
  document.sections.filter((section: JsonRecord) => section?.type === 'footer')
    .forEach((section: JsonRecord) => {
      const config = isRecord(section.config) ? section.config : {};
      section.config = {
        navigation_section_keys: Array.isArray(config.navigation_section_keys)
          ? config.navigation_section_keys.slice() : [],
        social_profiles: Array.isArray(config.social_profiles) ? clone(config.social_profiles) : [],
        contrast_mode: PROMO_CMS_FOOTER_CONTRAST_MODES.includes(config.contrast_mode as any)
          ? config.contrast_mode : 'auto',
        title_color: HEX_COLOR_PATTERN.test(String(config.title_color || ''))
          ? String(config.title_color).toLowerCase() : PROMO_CMS_FOOTER_DEFAULT_COLORS.title,
        body_color: HEX_COLOR_PATTERN.test(String(config.body_color || ''))
          ? String(config.body_color).toLowerCase() : PROMO_CMS_FOOTER_DEFAULT_COLORS.body,
        accent_color: HEX_COLOR_PATTERN.test(String(config.accent_color || ''))
          ? String(config.accent_color).toLowerCase() : PROMO_CMS_FOOTER_DEFAULT_COLORS.accent,
      };
    });
  return document;
}

function upgradeServiceIcons(document: JsonRecord) {
  if (!Array.isArray(document.sections)) return document;
  document.sections.filter((section: JsonRecord) => section && section.type === 'services')
    .forEach((section: JsonRecord) => {
      if (!isRecord(section.config) || !Array.isArray(section.config.item_keys)) {
        fail('invalid_payload');
      }
      if (!Object.prototype.hasOwnProperty.call(section.config, 'icon_keys')) {
        section.config = {
          ...section.config,
          icon_keys: section.config.item_keys.map(() => ''),
        };
      } else if (!Array.isArray(section.config.icon_keys)
        || section.config.icon_keys.length !== section.config.item_keys.length
        || section.config.icon_keys.some((iconKey: unknown) => (
          typeof iconKey !== 'string' || (iconKey !== '' && !isPromoServiceIconKey(iconKey))
        ))) {
        fail('invalid_payload');
      }
    });
  return document;
}

function upgradeLegacyPromoCmsDocument(value: JsonRecord) {
  const next = clone(value);
  if (next.contract === PROMO_CMS_DOCUMENT_CONTRACT) {
    if (isRecord(next.contact)) {
      if (!Object.prototype.hasOwnProperty.call(next.contact, 'logo_media_use_key')) next.contact.logo_media_use_key = '';
      if (!Object.prototype.hasOwnProperty.call(next.contact, 'qr_media_use_key')) next.contact.qr_media_use_key = '';
    }
    return upgradeFooterPresentation(upgradeHeroPresentation(upgradeServiceIcons(next)));
  }
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
      icon_keys: section.config.item_keys.map(() => ''),
    };
    section.media_use_keys = [];
  });
  localizedEntries.forEach((localized: any) => {
    localized.identity = {
      ...localized.identity,
      slogan: String(localized.identity.slogan || ''),
      contact_cta_label: String(localized.identity.contact_cta_label || ''),
    };
  });
  return upgradeFooterPresentation(upgradeHeroPresentation(upgradeServiceIcons(next)));
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

export function ensurePromoWorkGallerySection(document: JsonRecord, locale: string) {
  const existing = document.sections.find((section: JsonRecord) => section.key === PROMO_CMS_VIDEO_GALLERY_KEY);
  if (existing) {
    if (existing.type !== 'gallery') fail('invalid_promo_document');
    Object.values(document.content_by_locale).forEach((rawContent) => {
      const content = rawContent as JsonRecord;
      if (content.navigation?.[PROMO_CMS_VIDEO_GALLERY_KEY] === 'Videos') {
        content.navigation[PROMO_CMS_VIDEO_GALLERY_KEY] = 'Trabajos realizados';
      }
      const localized = content.sections?.[PROMO_CMS_VIDEO_GALLERY_KEY];
      if (localized?.heading === 'Videos') localized.heading = 'Trabajos realizados';
    });
    return existing;
  }
  const section = {
    key: PROMO_CMS_VIDEO_GALLERY_KEY,
    type: 'gallery',
    variant: 'default',
    visible: false,
    config: { item_keys: [], cover_media_use_key: '', items: [] },
    media_use_keys: [],
  };
  const insertion = document.sections.findIndex((item: JsonRecord) => ['contact', 'footer'].includes(item.type));
  document.sections.splice(insertion < 0 ? document.sections.length : insertion, 0, section);
  document.section_order = document.sections.map((item: JsonRecord) => item.key);
  Object.values(document.content_by_locale).forEach((rawContent) => {
    const content = rawContent as JsonRecord;
    content.navigation[PROMO_CMS_VIDEO_GALLERY_KEY] = 'Trabajos realizados';
    content.sections[PROMO_CMS_VIDEO_GALLERY_KEY] = { heading: 'Trabajos realizados', summary: '', items: [] };
  });
  return section;
}

function enforceFixedSectionOrder(document: JsonRecord) {
  const heroSections = document.sections.filter((section: JsonRecord) => section.type === 'hero');
  const footerSections = document.sections.filter((section: JsonRecord) => section.type === 'footer');
  if (heroSections.length > 1 || footerSections.length > 1) fail('invalid_promo_document');
  const movableSections = document.sections.filter((section: JsonRecord) => (
    section.type !== 'hero' && section.type !== 'footer'
  ));
  document.sections = [...heroSections, ...movableSections, ...footerSections];
  document.section_order = document.sections.map((section: JsonRecord) => section.key);
  return document;
}

function assertFixedSectionOrder(sectionOrder: readonly string[], sectionMap: Map<string, JsonRecord>) {
  const heroKeys = Array.from(sectionMap.values())
    .filter((section) => section.type === 'hero')
    .map((section) => section.key);
  const footerKeys = Array.from(sectionMap.values())
    .filter((section) => section.type === 'footer')
    .map((section) => section.key);
  if (heroKeys.length > 1 || footerKeys.length > 1
    || (heroKeys.length === 1 && sectionOrder[0] !== heroKeys[0])
    || (footerKeys.length === 1 && sectionOrder[sectionOrder.length - 1] !== footerKeys[0])) {
    fail('invalid_promo_document');
  }
}

export const ensurePromoVideoGallerySection = ensurePromoWorkGallerySection;

export function createPromoCmsWorkspace(value: unknown, scope: PromoCmsScope) {
  const document = normalizePromoCmsDocument(value);
  const locale = ensureLocale(document);
  if (scope === 'content') {
    (['hero', 'services', 'owner', 'footer'] as const).forEach((type) => ensureSection(document, locale, type));
    ensurePromoWorkGallerySection(document, locale);
  } else if (scope === 'contact') {
    ensureSection(document, locale, 'contact');
  } else {
    fail('invalid_payload');
  }
  enforceFixedSectionOrder(document);
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

export function isPromoCmsWorkGalleryReady(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.sections)) return false;
  const section = value.sections.find((candidate: JsonRecord) => (
    candidate?.key === PROMO_CMS_WORK_GALLERY_KEY && candidate?.type === 'gallery'
  ));
  if (!isRecord(section) || !isRecord(section.config) || !Array.isArray(section.media_use_keys)) return false;
  const coverKey = String(section.config.cover_media_use_key || '');
  const mediaKeys = new Set(section.media_use_keys.filter((mediaKey: unknown) => typeof mediaKey === 'string'));
  const items = Array.isArray(section.config.items) ? section.config.items : [];
  const visibleItems = items.filter((item: unknown) => isRecord(item) && item.visible === true);
  return coverKey.length > 0
    && mediaKeys.has(coverKey)
    && visibleItems.length > 0
    && visibleItems.every((item: JsonRecord) => (
      Array.isArray(item.media_use_keys)
      && item.media_use_keys.length > 0
      && item.media_use_keys.every((mediaKey: unknown) => typeof mediaKey === 'string' && mediaKeys.has(mediaKey))
    ));
}

function defaultPromoContactCtaLabel(locale: string) {
  return locale.toLowerCase().startsWith('es') ? 'Solicitar estimado' : 'Request an estimate';
}

export function prunePromoCmsHiddenFooterLinks(document: JsonRecord) {
  const visibleSectionKeys = new Set(document.sections
    .filter((section: JsonRecord) => section.visible === true && section.type !== 'footer')
    .map((section: JsonRecord) => String(section.key || '')));
  document.sections
    .filter((section: JsonRecord) => section.type === 'footer')
    .forEach((section: JsonRecord) => {
      const config = isRecord(section.config) ? section.config : {};
      if (!Array.isArray(config.navigation_section_keys)) return;
      const navigationSectionKeys = config.navigation_section_keys.filter((sectionKey: unknown) => (
        visibleSectionKeys.has(String(sectionKey || ''))
      ));
      section.config = {
        ...config,
        navigation_section_keys: navigationSectionKeys,
      };
    });
  return document;
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
  const contactCtaLabel = safeText(
    patch.identity?.contactCtaLabel || '',
    PROMO_CMS_TEXT_LIMITS.contactCtaLabel,
  );
  const previousContactCtaLabel = String(localized.identity?.contact_cta_label || '').trim();
  if (!previousContactCtaLabel && contactCtaLabel === defaultPromoContactCtaLabel(locale)) {
    Object.entries(document.content_by_locale).forEach(([contentLocale, rawOtherLocalized]) => {
      if (contentLocale === locale || !isRecord(rawOtherLocalized)) return;
      const otherIdentity = isRecord(rawOtherLocalized.identity) ? rawOtherLocalized.identity : {};
      if (String(otherIdentity.contact_cta_label || '').trim()) return;
      rawOtherLocalized.identity = {
        ...otherIdentity,
        contact_cta_label: defaultPromoContactCtaLabel(contentLocale),
      };
    });
  }
  localized.identity = {
    ...localized.identity,
    name,
    slogan,
    summary,
    contact_cta_label: contactCtaLabel,
  };

  let serviceCount = 0;
  const sectionMap = new Map(document.sections.map((section: JsonRecord) => [section.key, section]));
  assertFixedSectionOrder(patch.sectionOrder, sectionMap);
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
      const heroLayout = String(sectionPatch.heroLayout || section.config.layout || 'immersive');
      const heroContrastMode = String(sectionPatch.heroContrastMode || section.config.contrast_mode || 'auto');
      const heroOverlayStrength = String(sectionPatch.heroOverlayStrength || section.config.overlay_strength || 'medium');
      const heroTitleColor = promoColor(sectionPatch.heroTitleColor || section.config.title_color || PROMO_CMS_HERO_DEFAULT_COLORS.title);
      const heroBodyColor = promoColor(sectionPatch.heroBodyColor || section.config.body_color || PROMO_CMS_HERO_DEFAULT_COLORS.body);
      const heroAccentColor = promoColor(sectionPatch.heroAccentColor || section.config.accent_color || PROMO_CMS_HERO_DEFAULT_COLORS.accent);
      const highlights = Array.isArray(sectionPatch.highlights)
        ? sectionPatch.highlights
        : (Array.isArray(current.highlights) ? current.highlights : []);
      const configuredTargets = Array.isArray(section.config.button_targets)
        ? section.config.button_targets : ['primary-contact'];
      const existingLabels = Array.isArray(current.button_labels) ? current.button_labels : [];
      const requestedButtons = Array.isArray(sectionPatch.buttons)
        ? sectionPatch.buttons
        : configuredTargets.map((target: string, index: number) => ({ target, label: existingLabels[index] || '' }));
      if (!PROMO_CMS_HERO_LAYOUTS.includes(heroLayout as any)) fail('invalid_promo_document');
      if (!PROMO_CMS_HERO_CONTRAST_MODES.includes(heroContrastMode as any)
        || !PROMO_CMS_HERO_OVERLAY_STRENGTHS.includes(heroOverlayStrength as any)) {
        fail('invalid_promo_document');
      }
      if (highlights.length > PROMO_CMS_HERO_MAX_HIGHLIGHTS
        || requestedButtons.length > PROMO_CMS_HERO_MAX_BUTTONS) {
        fail('invalid_promo_document');
      }
      const buttonTargets = new Set<string>();
      const buttons = requestedButtons.map((button) => {
        const target = String(button?.target || '');
        if (!PROMO_CMS_HERO_BUTTON_TARGETS.includes(target as any) || buttonTargets.has(target)) {
          fail('invalid_promo_document');
        }
        buttonTargets.add(target);
        return {
          target,
          label: safeText(button.label || '', PROMO_CMS_TEXT_LIMITS.heroButton),
        };
      });
      const nextButtonTargets = buttons.map((button) => button.target);
      section.config = {
        media_use_key: String(section.config.media_use_key || ''),
        action_key: String(section.config.action_key || ''),
        layout: heroLayout,
        button_targets: nextButtonTargets,
        contrast_mode: heroContrastMode,
        title_color: heroTitleColor,
        body_color: heroBodyColor,
        accent_color: heroAccentColor,
        overlay_strength: heroOverlayStrength,
      };
      Object.entries(document.content_by_locale).forEach(([contentLocale, rawOtherLocalized]) => {
        if (contentLocale === locale || !isRecord(rawOtherLocalized)) return;
        const otherLocalized = rawOtherLocalized as JsonRecord;
        if (!isRecord(otherLocalized.sections)) return;
        const otherContent = isRecord(otherLocalized.sections[sectionKey])
          ? otherLocalized.sections[sectionKey] : {};
        const previousLabels = Array.isArray(otherContent.button_labels) ? otherContent.button_labels : [];
        const labelsByTarget = new Map(configuredTargets.map((target: string, index: number) => (
          [target, String(previousLabels[index] || '')]
        )));
        otherLocalized.sections[sectionKey] = {
          ...otherContent,
          button_labels: nextButtonTargets.map((target) => labelsByTarget.get(target) || ''),
        };
      });
      localized.sections[sectionKey] = {
        ...current,
        heading: safeText(sectionPatch.heading || '', PROMO_CMS_TEXT_LIMITS.heading),
        intro: safeText(sectionPatch.intro || '', PROMO_CMS_TEXT_LIMITS.heroIntro),
        summary: safeText(sectionPatch.summary || '', PROMO_CMS_TEXT_LIMITS.shortSummary),
        highlights: highlights.map((highlight) => (
          safeText(highlight, PROMO_CMS_TEXT_LIMITS.heroHighlight)
        )),
        button_labels: buttons.map((button) => button.label),
      };
    } else if (section.type === 'services') {
      const items = Array.isArray(sectionPatch.items) ? sectionPatch.items : [];
      const itemKeys = new Set<string>();
      const previousGalleryByItem = new Map<string, string>((section.config.item_keys || []).map(
        (itemKey: string, index: number) => [itemKey, String(section.config.gallery_keys?.[index] || '')],
      ));
      const previousIconByItem = new Map<string, string>((section.config.item_keys || []).map(
        (itemKey: string, index: number) => [itemKey, String(section.config.icon_keys?.[index] || '')],
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
          iconKey: serviceIconKey(item.iconKey ?? previousIconByItem.get(itemKey) ?? ''),
        };
      });
      serviceCount += normalizedItems.length;
      section.config.item_keys = normalizedItems.map((item) => item.key);
      section.config.gallery_keys = normalizedItems.map((item) => item.galleryKey);
      section.config.icon_keys = normalizedItems.map((item) => item.iconKey);
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
    } else if (section.type === 'gallery' && section.key === PROMO_CMS_VIDEO_GALLERY_KEY) {
      localized.sections[sectionKey] = {
        ...current,
        heading: safeText(sectionPatch.heading || '', PROMO_CMS_TEXT_LIMITS.heading),
        summary: safeText(sectionPatch.summary || '', PROMO_CMS_TEXT_LIMITS.shortSummary),
      };
    } else if (section.type === 'owner') {
      localized.sections[sectionKey] = {
        ...current,
        heading: safeText(sectionPatch.heading || '', PROMO_CMS_TEXT_LIMITS.heading),
        name: safeText(sectionPatch.name || '', PROMO_CMS_TEXT_LIMITS.businessName),
        bio: safeText(sectionPatch.bio || '', PROMO_CMS_TEXT_LIMITS.body),
      };
    } else if (section.type === 'contact') {
      localized.sections[sectionKey] = {
        ...current,
        heading: safeText(sectionPatch.heading || '', PROMO_CMS_TEXT_LIMITS.heading),
        consultation_heading: safeText(
          sectionPatch.consultationHeading || '',
          PROMO_CMS_TEXT_LIMITS.heading,
        ),
        summary: safeText(sectionPatch.summary || '', PROMO_CMS_TEXT_LIMITS.shortSummary),
        qr_heading: safeText(sectionPatch.qrHeading || '', PROMO_CMS_TEXT_LIMITS.heading),
      };
    } else if (section.type === 'footer') {
      const footerContrastMode = String(sectionPatch.footerContrastMode || section.config.contrast_mode || 'auto');
      if (!PROMO_CMS_FOOTER_CONTRAST_MODES.includes(footerContrastMode as any)) {
        fail('invalid_promo_document');
      }
      const footerTitleColor = promoColor(
        sectionPatch.footerTitleColor || section.config.title_color || PROMO_CMS_FOOTER_DEFAULT_COLORS.title,
      );
      const footerBodyColor = promoColor(
        sectionPatch.footerBodyColor || section.config.body_color || PROMO_CMS_FOOTER_DEFAULT_COLORS.body,
      );
      const footerAccentColor = promoColor(
        sectionPatch.footerAccentColor || section.config.accent_color || PROMO_CMS_FOOTER_DEFAULT_COLORS.accent,
      );
      const requestedNavigationSectionKeys = Array.isArray(sectionPatch.navigationSectionKeys)
        ? sectionPatch.navigationSectionKeys.map((sectionKey) => key(sectionKey))
        : [];
      if (requestedNavigationSectionKeys.length > PROMO_CMS_FOOTER_MAX_LINKS
        || new Set(requestedNavigationSectionKeys).size !== requestedNavigationSectionKeys.length
        || requestedNavigationSectionKeys.some((targetKey) => {
          const target = sectionMap.get(targetKey);
          return !target || target.type === 'footer';
        })) {
        fail('invalid_promo_document');
      }
      const navigationSectionKeys = requestedNavigationSectionKeys.filter((targetKey) => (
        patchSections.get(targetKey)?.visible === true
      ));
      const socialProfiles = footerSocialProfiles(sectionPatch.socialProfiles || []);
      section.config = {
        navigation_section_keys: navigationSectionKeys,
        social_profiles: socialProfiles,
        contrast_mode: footerContrastMode,
        title_color: footerTitleColor,
        body_color: footerBodyColor,
        accent_color: footerAccentColor,
      };
      localized.sections[sectionKey] = {
        ...current,
        heading: safeText(sectionPatch.heading || '', PROMO_CMS_TEXT_LIMITS.heading),
        summary: safeText(sectionPatch.summary || '', PROMO_CMS_TEXT_LIMITS.shortSummary),
        text: '',
      };
    }
    return section;
  });

  const effectiveMax = Number.isSafeInteger(maxServices) && maxServices >= 0 ? maxServices : 0;
  if (serviceCount > effectiveMax) fail('promo_capability_denied', 403);
  return prunePromoCmsHiddenFooterLinks(document);
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
  return prunePromoCmsHiddenFooterLinks(document);
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
    promo_translation_unavailable: 'La traducción automática no está disponible. No se guardó ningún cambio; intenta nuevamente.',
    promo_translation_invalid_response: 'La traducción automática devolvió contenido incompleto o no permitido. No se guardó ningún cambio.',
    invalid_promo_document: 'Revisa los campos: hay datos incompletos o con un formato no permitido.',
    promo_work_gallery_incomplete: 'Para mostrar Trabajos realizados, agrega primero al menos un trabajo con una foto.',
    unsafe_promo_document_value: 'El contenido incluye código, una URL o texto activo no permitido.',
    unsupported_promo_action: 'Ese tipo de contacto todavía no está habilitado.',
    promo_media_duplicate: 'Esta imagen ya está guardada en la tienda. Usa el medio existente o selecciona un archivo diferente.',
    promo_media_count_exceeded: 'La tienda alcanzó el máximo de imágenes permitido.',
    promo_media_storage_exceeded: 'La tienda alcanzó su cuota de almacenamiento.',
    promo_media_required: 'Selecciona una imagen para continuar.',
    promo_media_file_required: 'Selecciona una imagen para continuar.',
    promo_media_name_invalid: 'El nombre o la extensión del archivo no son válidos.',
    promo_media_filename_invalid: 'El nombre o la extensión del archivo no son válidos.',
    promo_media_type_invalid: 'El formato de la imagen no está permitido. Usa JPG, PNG, WebP o AVIF.',
    promo_media_type_mismatch: 'El contenido real de la imagen no coincide con su extensión.',
    promo_media_size_invalid: 'La imagen supera el tamaño permitido de 8 MB.',
    promo_media_corrupt: 'La imagen está dañada o no contiene metadatos válidos.',
    promo_media_animated_unsupported: 'Las imágenes animadas no están permitidas.',
    promo_media_output_too_large: 'La imagen no pudo optimizarse dentro del límite permitido. Prueba una imagen más sencilla o liviana.',
    promo_media_dimensions_invalid: 'La imagen no cumple las dimensiones indicadas para este espacio.',
    promo_media_image_dimensions_invalid: 'La imagen no cumple las dimensiones indicadas para este espacio.',
    promo_media_unavailable: 'El procesador de imágenes no está disponible temporalmente. Intenta nuevamente.',
    invalid_origin: 'La solicitud no proviene del panel administrativo.',
  };
  return messages[String(code || '')] || 'No se pudo completar la operación. Intenta nuevamente.';
}
