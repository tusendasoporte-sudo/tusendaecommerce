export const PROMO_PREVIEW_API_PATH = '/api/admin/promo-preview';
export const PROMO_PREVIEW_MEDIA_API_PATH = '/api/admin/promo-preview-media';
export const PROMO_PREVIEW_CONTEXT_CONTRACT = 'promo.preview.context.v1';
export const PROMO_PREVIEW_PREPARE_CONTRACT = 'promo.admin.preview.prepare.v1';
export const PROMO_PREVIEW_READ_CONTRACT = 'promo.admin.preview.read.v1';
export const PROMO_PREVIEW_RESPONSE_CONTRACT = 'promo.preview.v1';

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const STORE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/;
const KEY_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const USE_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,79}$/;
const THEME_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const TOKEN_VALUE_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const PRIVATE_MEDIA_PATH_PATTERN = /^\/api\/pz\/promo\/private\/v1\/media\/[a-z0-9]{15}\/[a-f0-9]{64}\/(?:original|w[0-9]+)\.(?:webp|mp4|webm)$/;
const MEDIA_VARIANT_PATTERN = /^(?:original|w[0-9]+)$/;
const SECTION_TYPES = new Set([
  'hero', 'services', 'featured_work', 'gallery', 'owner', 'store_rating', 'contact', 'footer',
]);
const CONTACT_TYPES = new Set(['whatsapp', 'phone', 'email', 'internal_form', 'approved_live_chat']);
const SYSTEM_MESSAGE_KEYS = Object.freeze([
  'a11y.contact_action', 'a11y.language_selector', 'a11y.main_content', 'a11y.main_navigation',
  'a11y.skip_to_content', 'contact.call', 'contact.email', 'contact.open_chat',
  'contact.request_estimate', 'contact.send_message', 'contact.unavailable', 'contact.whatsapp',
  'error.locale_unavailable', 'error.site_unavailable', 'locale.current', 'locale.option_aria',
  'navigation.contact', 'navigation.gallery', 'navigation.home', 'navigation.owner',
  'navigation.services', 'reviews.average', 'reviews.count.many', 'reviews.count.one',
  'reviews.empty', 'reviews.list', 'reviews.rating', 'reviews.unavailable',
  'state.available', 'state.loading', 'state.unavailable',
]);
const SECTION_CONFIG_KEYS: Record<string, readonly string[]> = Object.freeze({
  hero: Object.freeze(['media_use_key', 'action_key']),
  services: Object.freeze(['item_keys']),
  featured_work: Object.freeze(['item_keys']),
  gallery: Object.freeze(['item_keys']),
  owner: Object.freeze(['media_use_key']),
  store_rating: Object.freeze([]),
  contact: Object.freeze(['action_keys']),
  footer: Object.freeze([]),
});
const LOCALIZED_SECTION_KEYS: Record<string, readonly string[]> = Object.freeze({
  hero: Object.freeze(['heading', 'summary']),
  services: Object.freeze(['heading', 'summary', 'items']),
  featured_work: Object.freeze(['heading', 'summary', 'items']),
  gallery: Object.freeze(['heading', 'summary', 'items']),
  owner: Object.freeze(['heading', 'name', 'bio']),
  store_rating: Object.freeze(['heading']),
  contact: Object.freeze(['heading', 'summary']),
  footer: Object.freeze(['text']),
});

type JsonRecord = Record<string, any>;
type MediaUrlMode = 'private' | 'local' | 'either';

export type PromoPreviewRevision = Readonly<{
  revisionId: string;
  sequence: number;
  digest: string;
  sourceDraftVersion: number;
  created: string;
  locales: Readonly<{ default: string; published: readonly string[] }>;
}>;

export type PromoPreviewContext = Readonly<{
  draft: Readonly<{
    version: number;
    digest: string;
    locales: Readonly<{ default: string; published: readonly string[] }>;
  }>;
  publication: Readonly<{
    state: 'unpublished' | 'active' | 'paused';
    generation: number;
    current: PromoPreviewRevision | null;
  }>;
}>;

export type PromoPreviewCandidate = Readonly<{
  revisionId: string;
  sequence: number;
  digest: string;
  sourceDraftVersion: number;
  created: string;
  reused: boolean;
}>;

export type PromoPreviewResult = Readonly<{
  candidate: PromoPreviewCandidate;
  preview: JsonRecord;
}>;

export class PromoPreviewError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code = 'promo_preview_unavailable', status = 400) {
    super('No se pudo preparar la vista previa Promo.');
    this.name = 'PromoPreviewError';
    this.code = code;
    this.status = status;
  }
}

function fail(code = 'invalid_payload', status = 400): never {
  throw new PromoPreviewError(code, status);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactRecord(value: unknown, keys: readonly string[], code = 'invalid_payload') {
  if (!isRecord(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(code);
  }
  return value;
}

function subsetRecord(value: unknown, keys: readonly string[], code = 'invalid_payload') {
  if (!isRecord(value) || Object.keys(value).some((key) => !keys.includes(key))) fail(code);
  return value;
}

function safeText(value: unknown, max: number, empty = true) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail('invalid_payload');
  return value;
}

function safeInteger(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < min || normalized > max) fail('invalid_payload');
  return normalized;
}

function safePattern(value: unknown, pattern: RegExp, code = 'invalid_payload') {
  const normalized = typeof value === 'string' ? value : '';
  if (!pattern.test(normalized)) fail(code);
  return normalized;
}

function canonicalLocale(value: unknown) {
  const normalized = typeof value === 'string' ? value : '';
  if (!/^[a-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(normalized)) fail('invalid_promo_locale');
  try {
    if (Intl.getCanonicalLocales(normalized)[0] !== normalized) fail('invalid_promo_locale');
  } catch (_) {
    fail('invalid_promo_locale');
  }
  return normalized;
}

function stringArray(value: unknown, pattern: RegExp, max: number) {
  if (!Array.isArray(value) || value.length > max) fail('invalid_payload');
  const normalized = value.map((item) => safePattern(item, pattern));
  if (new Set(normalized).size !== normalized.length) fail('invalid_payload');
  return normalized;
}

function normalizeLocales(value: unknown) {
  const locales = exactRecord(value, ['default', 'published']);
  const defaultLocale = canonicalLocale(locales.default);
  if (!Array.isArray(locales.published) || !locales.published.length || locales.published.length > 10) {
    fail('invalid_payload');
  }
  const published = locales.published.map(canonicalLocale);
  if (new Set(published).size !== published.length
    || published.some((locale, index) => locale !== [...published].sort()[index])
    || !published.includes(defaultLocale)) fail('invalid_payload');
  return Object.freeze({ default: defaultLocale, published: Object.freeze(published) });
}

function normalizeCandidate(value: unknown): PromoPreviewCandidate {
  const candidate = exactRecord(value, [
    'revision_id', 'sequence', 'digest', 'source_draft_version', 'created', 'reused',
  ]);
  if (typeof candidate.reused !== 'boolean') fail('invalid_payload');
  return Object.freeze({
    revisionId: safePattern(candidate.revision_id, RECORD_ID_PATTERN),
    sequence: safeInteger(candidate.sequence, 1),
    digest: safePattern(candidate.digest, SHA256_PATTERN),
    sourceDraftVersion: safeInteger(candidate.source_draft_version, 1),
    created: safeText(candidate.created, 80),
    reused: candidate.reused,
  });
}

function normalizeRevision(value: unknown): PromoPreviewRevision {
  const revision = exactRecord(value, [
    'revision_id', 'sequence', 'digest', 'source_draft_version', 'created', 'locales',
  ]);
  return Object.freeze({
    revisionId: safePattern(revision.revision_id, RECORD_ID_PATTERN),
    sequence: safeInteger(revision.sequence, 1),
    digest: safePattern(revision.digest, SHA256_PATTERN),
    sourceDraftVersion: safeInteger(revision.source_draft_version, 1),
    created: safeText(revision.created, 80),
    locales: normalizeLocales(revision.locales),
  });
}

export function normalizePromoPreviewContext(value: unknown): PromoPreviewContext {
  const response = exactRecord(value, ['ok', 'contract', 'draft', 'publication']);
  if (response.ok !== true || response.contract !== PROMO_PREVIEW_CONTEXT_CONTRACT) fail('invalid_payload');
  const draft = exactRecord(response.draft, ['version', 'digest', 'locales']);
  const publication = exactRecord(response.publication, ['state', 'generation', 'current']);
  if (!['unpublished', 'active', 'paused'].includes(publication.state)) fail('invalid_payload');
  const current = publication.current === null ? null : normalizeRevision(publication.current);
  if (publication.state === 'unpublished' && current) fail('invalid_payload');
  return Object.freeze({
    draft: Object.freeze({
      version: safeInteger(draft.version, 1),
      digest: safePattern(draft.digest, SHA256_PATTERN),
      locales: normalizeLocales(draft.locales),
    }),
    publication: Object.freeze({
      state: publication.state,
      generation: safeInteger(publication.generation),
      current,
    }),
  });
}

export function normalizePromoCandidateResponse(value: unknown) {
  const response = exactRecord(value, ['ok', 'contract', 'candidate']);
  if (response.ok !== true || response.contract !== 'promo.candidate.v1') fail('invalid_payload');
  return normalizeCandidate(response.candidate);
}

function validLocalMediaUrl(value: string) {
  if (!value.startsWith(`${PROMO_PREVIEW_MEDIA_API_PATH}?`)) return false;
  try {
    const url = new URL(value, 'https://preview.invalid');
    const entries = Array.from(url.searchParams.entries());
    const expected = ['store', 'revision', 'locale', 'media', 'resource', 'variant'];
    if (entries.length !== expected.length || entries.some(([key], index) => key !== expected[index])) return false;
    const params = Object.fromEntries(entries);
    return STORE_SLUG_PATTERN.test(params.store)
      && RECORD_ID_PATTERN.test(params.revision)
      && canonicalLocale(params.locale) === params.locale
      && USE_KEY_PATTERN.test(params.media)
      && ['source', 'poster'].includes(params.resource)
      && MEDIA_VARIANT_PATTERN.test(params.variant);
  } catch (_) {
    return false;
  }
}

function mediaUrl(value: unknown, mode: MediaUrlMode) {
  const normalized = typeof value === 'string' ? value : '';
  const privateUrl = PRIVATE_MEDIA_PATH_PATTERN.test(normalized);
  const localUrl = validLocalMediaUrl(normalized);
  if ((mode === 'private' && !privateUrl) || (mode === 'local' && !localUrl)
    || (mode === 'either' && !privateUrl && !localUrl)) fail('invalid_payload');
  return normalized;
}

function normalizeImageDelivery(value: unknown, mode: MediaUrlMode) {
  const delivery = exactRecord(value, [
    'contract', 'mime', 'src', 'srcset', 'loading', 'fetch_priority', 'decoding',
  ]);
  if (delivery.contract !== 'promo.media.preview.delivery.v1' || delivery.mime !== 'image/webp'
    || !['eager', 'lazy'].includes(delivery.loading)
    || !['high', 'auto'].includes(delivery.fetch_priority) || delivery.decoding !== 'async'
    || !Array.isArray(delivery.srcset) || !delivery.srcset.length || delivery.srcset.length > 8) {
    fail('invalid_payload');
  }
  const variants = delivery.srcset.map((raw: unknown) => {
    const variant = exactRecord(raw, ['key', 'width', 'height', 'url']);
    return {
      key: safePattern(variant.key, MEDIA_VARIANT_PATTERN),
      width: safeInteger(variant.width, 1, 8192),
      height: safeInteger(variant.height, 1, 8192),
      url: mediaUrl(variant.url, mode),
    };
  });
  if (new Set(variants.map((variant) => variant.key)).size !== variants.length) fail('invalid_payload');
  const src = mediaUrl(delivery.src, mode);
  if (!variants.some((variant) => variant.url === src)) fail('invalid_payload');
  return {
    contract: delivery.contract,
    mime: delivery.mime,
    src,
    srcset: variants,
    loading: delivery.loading,
    fetch_priority: delivery.fetch_priority,
    decoding: delivery.decoding,
  };
}

function normalizeMedia(value: unknown, mode: MediaUrlMode) {
  if (!isRecord(value)) fail('invalid_payload');
  const kind = value.kind;
  const expected = ['key', 'purpose', 'kind', 'width', 'height', 'duration_ms', 'delivery'];
  const media = exactRecord(value, expected);
  const base = {
    key: safePattern(media.key, USE_KEY_PATTERN),
    purpose: safePattern(media.purpose, KEY_PATTERN),
    kind,
    width: safeInteger(media.width, 1, 8192),
    height: safeInteger(media.height, 1, 8192),
    duration_ms: safeInteger(media.duration_ms, 0, 600_000),
  };
  if (kind === 'image') {
    if (base.duration_ms !== 0) fail('invalid_payload');
    return { ...base, kind: 'image', delivery: normalizeImageDelivery(media.delivery, mode) };
  }
  if (kind !== 'video') fail('invalid_payload');
  const delivery = exactRecord(media.delivery, [
    'contract', 'mime', 'src', 'preload', 'controls_required', 'autoplay', 'plays_inline',
    'reduced_motion', 'save_data', 'poster',
  ]);
  if (delivery.contract !== 'promo.media.preview.delivery.v1'
    || !['video/mp4', 'video/webm'].includes(delivery.mime)
    || delivery.preload !== 'none' || delivery.controls_required !== true
    || delivery.autoplay !== false || delivery.plays_inline !== true
    || delivery.reduced_motion !== 'poster' || delivery.save_data !== 'poster') fail('invalid_payload');
  return {
    ...base,
    kind: 'video',
    delivery: {
      contract: delivery.contract,
      mime: delivery.mime,
      src: mediaUrl(delivery.src, mode),
      preload: 'none',
      controls_required: true,
      autoplay: false,
      plays_inline: true,
      reduced_motion: 'poster',
      save_data: 'poster',
      poster: normalizeImageDelivery(delivery.poster, mode),
    },
  };
}

function normalizeTheme(value: unknown) {
  const theme = exactRecord(value, ['theme_id', 'version', 'tokens']);
  if (!isRecord(theme.tokens) || Object.keys(theme.tokens).length > 64) fail('invalid_payload');
  const tokens: JsonRecord = {};
  Object.keys(theme.tokens).sort().forEach((key) => {
    tokens[safePattern(key, KEY_PATTERN)] = safePattern(theme.tokens[key], TOKEN_VALUE_PATTERN);
  });
  return {
    theme_id: safePattern(theme.theme_id, THEME_ID_PATTERN),
    version: safePattern(theme.version, VERSION_PATTERN),
    tokens,
  };
}

function normalizeSection(value: unknown) {
  const section = exactRecord(value, ['key', 'type', 'variant', 'config', 'media_use_keys']);
  const type = typeof section.type === 'string' ? section.type : '';
  if (!SECTION_TYPES.has(type) || section.variant !== 'default') fail('invalid_payload');
  const config = exactRecord(section.config, SECTION_CONFIG_KEYS[type] || []);
  const normalizedConfig: JsonRecord = {};
  if (['services', 'featured_work', 'gallery'].includes(type)) {
    normalizedConfig.item_keys = stringArray(config.item_keys, KEY_PATTERN, 50);
  } else if (type === 'hero') {
    normalizedConfig.media_use_key = config.media_use_key === '' ? '' : safePattern(config.media_use_key, USE_KEY_PATTERN);
    normalizedConfig.action_key = config.action_key === '' ? '' : safePattern(config.action_key, KEY_PATTERN);
  } else if (type === 'owner') {
    normalizedConfig.media_use_key = config.media_use_key === '' ? '' : safePattern(config.media_use_key, USE_KEY_PATTERN);
  } else if (type === 'contact') {
    normalizedConfig.action_keys = stringArray(config.action_keys, KEY_PATTERN, 32);
  }
  return {
    key: safePattern(section.key, KEY_PATTERN),
    type,
    variant: 'default',
    config: normalizedConfig,
    media_use_keys: stringArray(section.media_use_keys, USE_KEY_PATTERN, 30),
  };
}

function normalizeContact(value: unknown) {
  const contact = exactRecord(value, ['enabled', 'primary_action_key', 'secondary_action_keys', 'actions']);
  if (typeof contact.enabled !== 'boolean' || !Array.isArray(contact.actions) || contact.actions.length > 32) {
    fail('invalid_payload');
  }
  const actions = contact.actions.map((raw: unknown) => {
    const action = exactRecord(raw, ['key', 'type', 'enabled']);
    if (!CONTACT_TYPES.has(action.type) || action.enabled !== true) fail('invalid_payload');
    return { key: safePattern(action.key, KEY_PATTERN), type: action.type, enabled: true };
  });
  if (new Set(actions.map((action: JsonRecord) => action.key)).size !== actions.length) fail('invalid_payload');
  const primary = contact.primary_action_key === '' ? '' : safePattern(contact.primary_action_key, KEY_PATTERN);
  const secondary = stringArray(contact.secondary_action_keys, KEY_PATTERN, 32);
  if (contact.enabled && (!actions.some((action: JsonRecord) => action.key === primary)
    || secondary.some((key) => !actions.some((action: JsonRecord) => action.key === key)))) fail('invalid_payload');
  if (!contact.enabled && (primary || secondary.length || actions.length)) fail('invalid_payload');
  return { enabled: contact.enabled, primary_action_key: primary, secondary_action_keys: secondary, actions };
}

function normalizeTextRecord(value: unknown, allowed: readonly string[], limits: Record<string, number>) {
  const record = subsetRecord(value, allowed);
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, safeText(record[key], limits[key] || 4000)]));
}

function normalizeContent(value: unknown, sections: JsonRecord[], media: JsonRecord[], contact: JsonRecord) {
  const content = exactRecord(value, ['identity', 'navigation', 'sections', 'contact', 'media_alt', 'seo']);
  const sectionMap = new Map(sections.map((section) => [section.key, section]));
  const mediaKeys = new Set(media.map((item) => item.key));
  const actionKeys = new Set(contact.actions.map((action: JsonRecord) => action.key));
  const identity = normalizeTextRecord(content.identity, ['name', 'summary', 'owner_name', 'owner_bio'], {
    name: 140, summary: 600, owner_name: 140, owner_bio: 4000,
  });
  const navigation = normalizeTextRecord(content.navigation, [...sectionMap.keys()], {});
  const localizedSections = subsetRecord(content.sections, [...sectionMap.keys()]);
  const normalizedSections: JsonRecord = {};
  Object.keys(localizedSections).sort().forEach((sectionKey) => {
    const section = sectionMap.get(sectionKey);
    if (!section) fail('invalid_payload');
    const localized = subsetRecord(localizedSections[sectionKey], LOCALIZED_SECTION_KEYS[section.type] || []);
    const normalized: JsonRecord = {};
    for (const field of ['heading', 'summary', 'name', 'bio', 'text']) {
      if (Object.prototype.hasOwnProperty.call(localized, field)) {
        normalized[field] = safeText(localized[field], ({ heading: 160, summary: 600, name: 140, bio: 4000, text: 4000 } as JsonRecord)[field]);
      }
    }
    if (Object.prototype.hasOwnProperty.call(localized, 'items')) {
      if (!Array.isArray(localized.items) || localized.items.length > 50) fail('invalid_payload');
      normalized.items = localized.items.map((raw: unknown) => {
        const allowed = section.type === 'gallery' ? ['key', 'caption'] : ['key', 'name', 'summary', 'caption'];
        const item = subsetRecord(raw, allowed);
        if (!Object.prototype.hasOwnProperty.call(item, 'key')) fail('invalid_payload');
        const result: JsonRecord = { key: safePattern(item.key, KEY_PATTERN) };
        if (Object.prototype.hasOwnProperty.call(item, 'name')) result.name = safeText(item.name, 160);
        if (Object.prototype.hasOwnProperty.call(item, 'summary')) result.summary = safeText(item.summary, 600);
        if (Object.prototype.hasOwnProperty.call(item, 'caption')) result.caption = safeText(item.caption, 500);
        return result;
      });
    }
    normalizedSections[sectionKey] = normalized;
  });
  const localizedContact = subsetRecord(content.contact, [...actionKeys]);
  const normalizedContact: JsonRecord = {};
  Object.keys(localizedContact).sort().forEach((actionKey) => {
    normalizedContact[actionKey] = normalizeTextRecord(localizedContact[actionKey], ['label', 'aria_label', 'message'], {
      label: 80, aria_label: 160, message: 1000,
    });
  });
  const mediaAlt = subsetRecord(content.media_alt, [...mediaKeys]);
  const normalizedAlt: JsonRecord = {};
  Object.keys(mediaAlt).sort().forEach((mediaKey) => {
    const alt = exactRecord(mediaAlt[mediaKey], ['alt', 'decorative']);
    if (typeof alt.decorative !== 'boolean') fail('invalid_payload');
    const text = safeText(alt.alt, 300);
    if ((alt.decorative && text) || (!alt.decorative && !text)) fail('invalid_payload');
    normalizedAlt[mediaKey] = { alt: text, decorative: alt.decorative };
  });
  const seo = normalizeTextRecord(content.seo, ['title', 'description', 'social_title', 'social_description'], {
    title: 70, description: 170, social_title: 70, social_description: 170,
  });
  if (!identity.name || !seo.title || !seo.description
    || sections.some((section) => !navigation[section.key] || !normalizedSections[section.key])
    || media.some((item) => !normalizedAlt[item.key])
    || (contact.enabled && [contact.primary_action_key, ...contact.secondary_action_keys].some((actionKey) => (
      !normalizedContact[actionKey]?.label || !normalizedContact[actionKey]?.aria_label
    )))) fail('invalid_payload');
  return { identity, navigation, sections: normalizedSections, contact: normalizedContact, media_alt: normalizedAlt, seo };
}

function normalizePreview(value: unknown, mode: MediaUrlMode) {
  const preview = exactRecord(value, [
    'site', 'system', 'locale', 'locale_options', 'theme', 'section_order', 'sections',
    'media', 'contact', 'content', 'adapters',
  ]);
  const site = exactRecord(preview.site, ['public_slug']);
  const system = exactRecord(preview.system, ['catalog_version', 'messages']);
  if (system.catalog_version !== 'promo.system.v1') fail('invalid_payload');
  const messages = exactRecord(system.messages, SYSTEM_MESSAGE_KEYS);
  const normalizedMessages = Object.fromEntries(SYSTEM_MESSAGE_KEYS.map((key) => [key, safeText(messages[key], 240, false)]));
  const locale = exactRecord(preview.locale, ['effective', 'default', 'lang', 'direction']);
  const effectiveLocale = canonicalLocale(locale.effective);
  const defaultLocale = canonicalLocale(locale.default);
  if (locale.lang !== effectiveLocale || !['ltr', 'rtl'].includes(locale.direction)) fail('invalid_payload');
  if (!Array.isArray(preview.locale_options) || !preview.locale_options.length || preview.locale_options.length > 10) {
    fail('invalid_payload');
  }
  const localeOptions = preview.locale_options.map((raw: unknown) => {
    const option = exactRecord(raw, ['locale', 'label', 'active']);
    if (typeof option.active !== 'boolean') fail('invalid_payload');
    return { locale: canonicalLocale(option.locale), label: safeText(option.label, 80, false), active: option.active };
  });
  if (new Set(localeOptions.map((option: JsonRecord) => option.locale)).size !== localeOptions.length
    || localeOptions.filter((option: JsonRecord) => option.active).length !== 1
    || !localeOptions.some((option: JsonRecord) => option.active && option.locale === effectiveLocale)
    || !localeOptions.some((option: JsonRecord) => option.locale === defaultLocale)) fail('invalid_payload');
  if (!Array.isArray(preview.sections) || preview.sections.length > 64) fail('invalid_payload');
  const sections = preview.sections.map(normalizeSection);
  const sectionKeys = sections.map((section) => section.key);
  const sectionOrder = stringArray(preview.section_order, KEY_PATTERN, 64);
  if (sectionOrder.length !== sectionKeys.length || sectionOrder.some((key, index) => key !== sectionKeys[index])) {
    fail('invalid_payload');
  }
  if (!Array.isArray(preview.media) || preview.media.length > 512) fail('invalid_payload');
  const media = preview.media.map((item: unknown) => normalizeMedia(item, mode));
  if (new Set(media.map((item) => item.key)).size !== media.length) fail('invalid_payload');
  const contact = normalizeContact(preview.contact);
  const adapters = exactRecord(preview.adapters, ['store_rating', 'landing_qr_link']);
  const rating = exactRecord(adapters.store_rating, ['enabled']);
  const landing = exactRecord(adapters.landing_qr_link, ['enabled']);
  if (typeof rating.enabled !== 'boolean' || typeof landing.enabled !== 'boolean') fail('invalid_payload');
  return {
    site: { public_slug: safePattern(site.public_slug, STORE_SLUG_PATTERN) },
    system: { catalog_version: system.catalog_version, messages: normalizedMessages },
    locale: { effective: effectiveLocale, default: defaultLocale, lang: effectiveLocale, direction: locale.direction },
    locale_options: localeOptions,
    theme: normalizeTheme(preview.theme),
    section_order: sectionOrder,
    sections,
    media,
    contact,
    content: normalizeContent(preview.content, sections, media, contact),
    adapters: { store_rating: { enabled: rating.enabled }, landing_qr_link: { enabled: landing.enabled } },
  };
}

export function normalizePromoPreviewResponse(
  value: unknown,
  mode: MediaUrlMode = 'either',
): PromoPreviewResult {
  const response = exactRecord(value, ['ok', 'contract', 'visibility', 'robots', 'candidate', 'preview']);
  if (response.ok !== true || response.contract !== PROMO_PREVIEW_RESPONSE_CONTRACT
    || response.visibility !== 'private' || response.robots !== 'noindex,nofollow,noarchive') fail('invalid_payload');
  return Object.freeze({ candidate: normalizeCandidate(response.candidate), preview: normalizePreview(response.preview, mode) });
}

export function promoPreviewStoreSlug(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return STORE_SLUG_PATTERN.test(normalized) ? normalized : '';
}

export function promoPreviewMediaUrl(input: {
  storeSlug: string; revisionId: string; locale: string; mediaKey: string;
  resource: 'source' | 'poster'; variant: string;
}) {
  const store = promoPreviewStoreSlug(input.storeSlug);
  const revision = safePattern(input.revisionId, RECORD_ID_PATTERN);
  const locale = canonicalLocale(input.locale);
  const media = safePattern(input.mediaKey, USE_KEY_PATTERN);
  if (!store || !['source', 'poster'].includes(input.resource)) fail('invalid_payload');
  const variant = safePattern(input.variant, MEDIA_VARIANT_PATTERN);
  const query = new URLSearchParams([
    ['store', store], ['revision', revision], ['locale', locale], ['media', media],
    ['resource', input.resource], ['variant', variant],
  ]);
  return `${PROMO_PREVIEW_MEDIA_API_PATH}?${query.toString()}`;
}

export function rewritePromoPreviewMedia(value: unknown, storeSlug: string) {
  const normalized = normalizePromoPreviewResponse(value, 'private');
  const revisionId = normalized.candidate.revisionId;
  const locale = normalized.preview.locale.effective;
  const media = normalized.preview.media.map((item: JsonRecord) => {
    const rewriteImage = (delivery: JsonRecord, resource: 'source' | 'poster') => {
      const variants = delivery.srcset.map((variant: JsonRecord) => ({
        ...variant,
        url: promoPreviewMediaUrl({
          storeSlug, revisionId, locale, mediaKey: item.key, resource, variant: variant.key,
        }),
      }));
      const sourceVariant = delivery.srcset.find((variant: JsonRecord) => variant.url === delivery.src);
      if (!sourceVariant) fail('invalid_payload');
      return {
        ...delivery,
        src: promoPreviewMediaUrl({
          storeSlug, revisionId, locale, mediaKey: item.key, resource, variant: sourceVariant.key,
        }),
        srcset: variants,
      };
    };
    if (item.kind === 'image') return { ...item, delivery: rewriteImage(item.delivery, 'source') };
    return {
      ...item,
      delivery: {
        ...item.delivery,
        src: promoPreviewMediaUrl({
          storeSlug, revisionId, locale, mediaKey: item.key, resource: 'source', variant: 'original',
        }),
        poster: rewriteImage(item.delivery.poster, 'poster'),
      },
    };
  });
  const response = {
    ok: true,
    contract: PROMO_PREVIEW_RESPONSE_CONTRACT,
    visibility: 'private',
    robots: 'noindex,nofollow,noarchive',
    candidate: {
      revision_id: normalized.candidate.revisionId,
      sequence: normalized.candidate.sequence,
      digest: normalized.candidate.digest,
      source_draft_version: normalized.candidate.sourceDraftVersion,
      created: normalized.candidate.created,
      reused: normalized.candidate.reused,
    },
    preview: { ...normalized.preview, media },
  };
  normalizePromoPreviewResponse(response, 'local');
  return response;
}

export function resolvePromoPreviewMediaSource(value: unknown, input: {
  mediaKey: string; resource: 'source' | 'poster'; variant: string;
}) {
  const normalized = normalizePromoPreviewResponse(value, 'private');
  const mediaKey = safePattern(input.mediaKey, USE_KEY_PATTERN);
  const variant = safePattern(input.variant, MEDIA_VARIANT_PATTERN);
  if (!['source', 'poster'].includes(input.resource)) fail('invalid_payload');
  const media = normalized.preview.media.find((item: JsonRecord) => item.key === mediaKey);
  if (!media) fail('promo_preview_media_not_found', 404);
  let path = '';
  let mime = '';
  if (input.resource === 'poster') {
    if (media.kind !== 'video') fail('promo_preview_media_not_found', 404);
    const selected = media.delivery.poster.srcset.find((item: JsonRecord) => item.key === variant);
    path = selected?.url || '';
    mime = 'image/webp';
  } else if (media.kind === 'video') {
    if (variant !== 'original') fail('promo_preview_media_not_found', 404);
    path = media.delivery.src;
    mime = media.delivery.mime;
  } else {
    const selected = media.delivery.srcset.find((item: JsonRecord) => item.key === variant);
    path = selected?.url || '';
    mime = 'image/webp';
  }
  if (!PRIVATE_MEDIA_PATH_PATTERN.test(path)) fail('promo_preview_media_not_found', 404);
  return Object.freeze({ path, mime, kind: mime.startsWith('video/') ? 'video' : 'image' });
}

export function parsePromoPreviewAdminRequest(value: unknown) {
  if (!isRecord(value)) fail('invalid_payload');
  if (value.contract === PROMO_PREVIEW_PREPARE_CONTRACT) {
    const body = exactRecord(value, ['contract', 'expected_draft_version', 'locale']);
    return Object.freeze({
      operation: 'prepare' as const,
      expectedDraftVersion: safeInteger(body.expected_draft_version, 1),
      locale: canonicalLocale(body.locale),
    });
  }
  if (value.contract === PROMO_PREVIEW_READ_CONTRACT) {
    const body = exactRecord(value, ['contract', 'revision_id', 'locale']);
    return Object.freeze({
      operation: 'read' as const,
      revisionId: safePattern(body.revision_id, RECORD_ID_PATTERN),
      locale: canonicalLocale(body.locale),
    });
  }
  return fail('invalid_payload');
}

const BLACK_GOLD_TOKEN_KEYS = Object.freeze([
  'surface', 'text', 'accent', 'border', 'focus', 'heading_font', 'body_font',
  'radius', 'shadow', 'density', 'motion',
]);
const SAFE_THEME_STYLE = Object.freeze({
  surface: '#0b0b0b', surfaceRaised: '#151411', text: '#f6f1e7', muted: '#bcb4a5',
  accent: '#c8a45a', border: '#c8a45a', focus: '#f6f1e7',
  headingFont: 'Georgia, "Times New Roman", serif',
  bodyFont: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  radius: '8px', shadow: '0 18px 48px rgba(0, 0, 0, 0.34)', spacing: '1.25rem',
  motionDuration: '220ms',
});

export function promoPreviewThemeStyle(themeValue: unknown) {
  const theme = normalizeTheme(themeValue);
  if (theme.theme_id !== 'promo.black-gold' || theme.version !== '1.0.0') {
    return Object.freeze({ rendererAvailable: false, style: SAFE_THEME_STYLE });
  }
  const actualKeys = Object.keys(theme.tokens).sort();
  const expectedKeys = [...BLACK_GOLD_TOKEN_KEYS].sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    fail('promo_preview_renderer_unavailable', 503);
  }
  const allowed: Record<string, readonly string[]> = {
    surface: ['obsidian'], text: ['ivory'], accent: ['heritage_gold', 'champagne_gold'],
    border: ['heritage_gold', 'champagne_gold'], focus: ['ivory_ring'],
    heading_font: ['editorial_serif'], body_font: ['humanist_sans'], radius: ['subtle', 'soft'],
    shadow: ['ambient', 'lifted'], density: ['comfortable', 'compact'], motion: ['subtle', 'reduced'],
  };
  if (Object.entries(theme.tokens).some(([key, value]) => !allowed[key]?.includes(value))
    || theme.tokens.accent !== theme.tokens.border) fail('promo_preview_renderer_unavailable', 503);
  const accent = theme.tokens.accent === 'champagne_gold' ? '#d9bf84' : '#c8a45a';
  return Object.freeze({
    rendererAvailable: true,
    style: Object.freeze({
      ...SAFE_THEME_STYLE,
      accent,
      border: accent,
      radius: theme.tokens.radius === 'soft' ? '18px' : '8px',
      shadow: theme.tokens.shadow === 'lifted'
        ? '0 24px 64px rgba(0, 0, 0, 0.5)'
        : SAFE_THEME_STYLE.shadow,
      spacing: theme.tokens.density === 'compact' ? '0.85rem' : '1.25rem',
      motionDuration: theme.tokens.motion === 'reduced' ? '0ms' : '220ms',
    }),
  });
}

function sameJson(first: unknown, second: unknown) {
  return JSON.stringify(first) === JSON.stringify(second);
}

export function comparePromoPreviews(firstValue: PromoPreviewResult, secondValue: PromoPreviewResult) {
  const first = firstValue.preview;
  const second = secondValue.preview;
  const facets = [
    ['appearance', 'Apariencia', first.theme, second.theme],
    ['composition', 'Composición', { order: first.section_order, sections: first.sections }, { order: second.section_order, sections: second.sections }],
    ['content', 'Contenido', { identity: first.content.identity, navigation: first.content.navigation, sections: first.content.sections, seo: first.content.seo }, { identity: second.content.identity, navigation: second.content.navigation, sections: second.content.sections, seo: second.content.seo }],
    ['media', 'Medios', { media: first.media.map(({ delivery, ...item }: JsonRecord) => item), alt: first.content.media_alt }, { media: second.media.map(({ delivery, ...item }: JsonRecord) => item), alt: second.content.media_alt }],
    ['contact', 'Contacto', { contact: first.contact, content: first.content.contact }, { contact: second.contact, content: second.content.contact }],
    ['adapters', 'Adaptadores', first.adapters, second.adapters],
  ];
  const changed = facets.filter(([, , left, right]) => !sameJson(left, right))
    .map(([key, label]) => Object.freeze({ key, label }));
  return Object.freeze({ identical: changed.length === 0, changed: Object.freeze(changed) });
}

export function promoPreviewErrorMessage(code: unknown) {
  const normalized = typeof code === 'string' ? code : '';
  const messages: Record<string, string> = {
    promo_draft_conflict: 'El borrador cambió. Recarga el contexto antes de preparar otra vista.',
    promo_publication_validation_failed: 'El borrador todavía no cumple todos los gates de una candidata publicable.',
    incomplete_promo_locale: 'Completa o retira los idiomas anunciados antes de preparar la vista.',
    promo_capability_denied: 'La capacidad efectiva ya no permite preparar esta vista.',
    promo_permission_denied: 'La sesión ya no tiene autoridad para preparar esta vista.',
    promo_candidate_not_found: 'La revisión solicitada no pertenece a esta tienda o ya no está disponible.',
    promo_preview_media_not_found: 'El medio solicitado no pertenece a esta revisión.',
    promo_preview_renderer_unavailable: 'El renderer privado de esta versión de tema no está empaquetado.',
    unauthorized: 'La sesión venció. Vuelve a iniciar sesión.',
    invalid_origin: 'La solicitud no procede del panel administrativo autorizado.',
  };
  return messages[normalized] || 'No se pudo cargar la vista privada. Recarga e inténtalo nuevamente.';
}
