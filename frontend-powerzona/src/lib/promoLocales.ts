import {
  normalizePromoCmsDocument,
  PROMO_CMS_DOCUMENT_CONTRACT,
} from './promoCms.ts';

export const PROMO_LOCALES_API_PATH = '/api/admin/promo-cms';
export const PROMO_LOCALES_SYSTEM_CATALOG = 'promo.system.v1';

export const PROMO_LOCALES_CATALOG = Object.freeze([
  Object.freeze({ locale: 'en', label: 'English', direction: 'ltr' }),
  Object.freeze({ locale: 'es', label: 'Español', direction: 'ltr' }),
] as const);

export const PROMO_LOCALES_TEXT_LIMITS = Object.freeze({
  businessName: 140,
  heading: 160,
  shortSummary: 600,
  body: 4000,
  itemName: 160,
  caption: 500,
  navigation: 80,
  contactLabel: 80,
  contactAria: 160,
  contactMessage: 1000,
  alt: 300,
  seoTitle: 70,
  seoDescription: 170,
});

const LOCALIZED_KEYS = Object.freeze(['identity', 'navigation', 'sections', 'contact', 'media_alt', 'seo']);
const IDENTITY_KEYS = Object.freeze(['name', 'summary', 'owner_name', 'owner_bio']);
const CONTACT_TEXT_KEYS = Object.freeze(['label', 'aria_label', 'message']);
const SEO_KEYS = Object.freeze(['title', 'description', 'social_title', 'social_description']);
const SECTION_TEXT_KEYS = Object.freeze({
  hero: ['heading', 'summary'],
  services: ['heading', 'summary', 'items'],
  featured_work: ['heading', 'summary', 'items'],
  gallery: ['heading', 'summary', 'items'],
  owner: ['heading', 'name', 'bio'],
  store_rating: ['heading'],
  contact: ['heading', 'summary'],
  footer: ['text'],
} as const);
const SECTION_REQUIRED_TEXT = Object.freeze({
  hero: ['heading'],
  services: ['heading'],
  featured_work: ['heading'],
  gallery: ['heading'],
  owner: ['heading', 'name', 'bio'],
  store_rating: ['heading'],
  contact: ['heading'],
  footer: ['text'],
} as const);
const KEY_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;

type JsonRecord = Record<string, any>;

export type PromoLocaleId = (typeof PROMO_LOCALES_CATALOG)[number]['locale'];

export type PromoLocaleDiagnostic = Readonly<{
  locale: PromoLocaleId;
  complete: boolean;
  completed: number;
  total: number;
  percent: number;
  missing: readonly string[];
}>;

export type PromoLocalesWorkspace = Readonly<{
  document: JsonRecord;
  enabledLocales: readonly PromoLocaleId[];
  diagnostics: readonly PromoLocaleDiagnostic[];
}>;

export type PromoLocalesPatch = Readonly<{
  defaultLocale: string;
  publishedLocales: readonly string[];
  contentByLocale: Readonly<Record<string, unknown>>;
}>;

export class PromoLocalesError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code = 'promo_locales_unavailable', status = 400) {
    super('No se pudo completar la edición de idiomas Promo.');
    this.name = 'PromoLocalesError';
    this.code = code;
    this.status = status;
  }
}

function fail(code = 'invalid_payload', status = 400): never {
  throw new PromoLocalesError(code, status);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: unknown, expected: readonly string[]) {
  if (!isRecord(value)) fail('invalid_payload');
  const actual = Object.keys(value).sort();
  const target = [...expected].sort();
  if (actual.length !== target.length || actual.some((entry, index) => entry !== target[index])) {
    fail('invalid_payload');
  }
  return value;
}

function onlyKeys(value: unknown, expected: readonly string[]) {
  if (!isRecord(value) || Object.keys(value).some((entry) => !expected.includes(entry))) {
    fail('invalid_promo_document');
  }
  return value;
}

function safeText(value: unknown, max: number, allowEmpty = true) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) {
    fail('invalid_promo_document');
  }
  if (/<\/?[a-z][^>]*>/i.test(value)
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
    || /(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/i.test(value)
    || /\b[a-z][a-z0-9+.-]*:\/\//i.test(value)
    || /(?:@import\s+|expression\s*\(|url\s*\(|=>|\bfunction\s*\()/i.test(value)) {
    fail('unsafe_promo_document_value');
  }
  return value;
}

function key(value: unknown) {
  const normalized = typeof value === 'string' ? value : '';
  return KEY_PATTERN.test(normalized) ? normalized : fail('invalid_promo_document');
}

function localeMetadata(value: unknown): (typeof PROMO_LOCALES_CATALOG)[number] {
  const normalized = String(value || '');
  const result = PROMO_LOCALES_CATALOG.find((entry) => entry.locale === normalized);
  return result || fail('unsupported_promo_locale');
}

function effectiveMaxLocales(value: unknown) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) return 0;
  return Math.min(normalized, PROMO_LOCALES_CATALOG.length);
}

function emptyLocalizedContent() {
  return {
    identity: {},
    navigation: {},
    sections: {},
    contact: {},
    media_alt: {},
    seo: {},
  };
}

function normalizeStringFields(value: unknown, keys: readonly string[], limits: Readonly<Record<string, number>>) {
  const source = onlyKeys(value, keys);
  const result: JsonRecord = {};
  Object.keys(source).forEach((field) => {
    result[field] = safeText(source[field], limits[field] || PROMO_LOCALES_TEXT_LIMITS.body);
  });
  return result;
}

function normalizeLocalizedItems(section: JsonRecord, value: unknown) {
  if (!Array.isArray(value) || value.length > 50) fail('invalid_promo_document');
  const configured = Array.isArray(section.config?.item_keys) ? section.config.item_keys.map(key) : [];
  const seen = new Set<string>();
  const result = value.map((item) => {
    const allowed = section.type === 'gallery'
      ? ['key', 'caption']
      : ['key', 'name', 'summary', 'caption'];
    const source = onlyKeys(item, allowed);
    const itemKey = key(source.key);
    if (seen.has(itemKey) || !configured.includes(itemKey)) fail('invalid_promo_document');
    seen.add(itemKey);
    if (section.type === 'gallery') {
      return { key: itemKey, caption: safeText(source.caption || '', PROMO_LOCALES_TEXT_LIMITS.caption) };
    }
    return {
      key: itemKey,
      name: safeText(source.name || '', PROMO_LOCALES_TEXT_LIMITS.itemName),
      summary: safeText(source.summary || '', PROMO_LOCALES_TEXT_LIMITS.shortSummary),
      caption: safeText(source.caption || '', PROMO_LOCALES_TEXT_LIMITS.caption),
    };
  });
  return result;
}

function normalizeLocalizedContent(document: JsonRecord, value: unknown) {
  const source = exactKeys(value, LOCALIZED_KEYS);
  const result = emptyLocalizedContent();
  result.identity = normalizeStringFields(source.identity, IDENTITY_KEYS, {
    name: PROMO_LOCALES_TEXT_LIMITS.businessName,
    summary: PROMO_LOCALES_TEXT_LIMITS.shortSummary,
    owner_name: PROMO_LOCALES_TEXT_LIMITS.businessName,
    owner_bio: PROMO_LOCALES_TEXT_LIMITS.body,
  });

  const sectionMap = new Map(document.sections.map((section: JsonRecord) => [section.key, section]));
  const navigation = isRecord(source.navigation) ? source.navigation : fail('invalid_promo_document');
  Object.keys(navigation).forEach((sectionKey) => {
    if (!sectionMap.has(sectionKey)) fail('invalid_promo_document');
    const text = safeText(navigation[sectionKey], PROMO_LOCALES_TEXT_LIMITS.navigation);
    if (text.trim()) result.navigation[sectionKey] = text;
  });

  const sections = isRecord(source.sections) ? source.sections : fail('invalid_promo_document');
  Object.keys(sections).forEach((sectionKey) => {
    const section = sectionMap.get(sectionKey);
    if (!section) fail('invalid_promo_document');
    const allowed = SECTION_TEXT_KEYS[section.type as keyof typeof SECTION_TEXT_KEYS];
    if (!allowed) fail('invalid_promo_document');
    const localized = onlyKeys(sections[sectionKey], allowed);
    const normalized: JsonRecord = {};
    Object.keys(localized).forEach((field) => {
      if (field === 'items') normalized.items = normalizeLocalizedItems(section, localized.items);
      else {
        const max = field === 'heading' || field === 'name'
          ? (field === 'heading' ? PROMO_LOCALES_TEXT_LIMITS.heading : PROMO_LOCALES_TEXT_LIMITS.businessName)
          : field === 'summary'
            ? PROMO_LOCALES_TEXT_LIMITS.shortSummary
            : PROMO_LOCALES_TEXT_LIMITS.body;
        normalized[field] = safeText(localized[field], max);
      }
    });
    result.sections[sectionKey] = normalized;
  });

  const actionKeys = new Set(document.contact.actions.map((action: JsonRecord) => action.key));
  const contact = isRecord(source.contact) ? source.contact : fail('invalid_promo_document');
  Object.keys(contact).forEach((actionKey) => {
    if (!actionKeys.has(actionKey)) fail('invalid_promo_document');
    result.contact[actionKey] = normalizeStringFields(contact[actionKey], CONTACT_TEXT_KEYS, {
      label: PROMO_LOCALES_TEXT_LIMITS.contactLabel,
      aria_label: PROMO_LOCALES_TEXT_LIMITS.contactAria,
      message: PROMO_LOCALES_TEXT_LIMITS.contactMessage,
    });
  });

  const mediaKeys = new Set(Object.keys(document.media_refs));
  const mediaAlt = isRecord(source.media_alt) ? source.media_alt : fail('invalid_promo_document');
  Object.keys(mediaAlt).forEach((useKey) => {
    if (!mediaKeys.has(useKey)) fail('invalid_promo_document');
    const entry = exactKeys(mediaAlt[useKey], ['alt', 'decorative']);
    if (typeof entry.decorative !== 'boolean') fail('invalid_promo_document');
    const alt = safeText(entry.alt, PROMO_LOCALES_TEXT_LIMITS.alt);
    if (entry.decorative && alt) fail('invalid_promo_document');
    if (entry.decorative || alt.trim()) result.media_alt[useKey] = { alt, decorative: entry.decorative };
  });

  result.seo = normalizeStringFields(source.seo, SEO_KEYS, {
    title: PROMO_LOCALES_TEXT_LIMITS.seoTitle,
    description: PROMO_LOCALES_TEXT_LIMITS.seoDescription,
    social_title: PROMO_LOCALES_TEXT_LIMITS.seoTitle,
    social_description: PROMO_LOCALES_TEXT_LIMITS.seoDescription,
  });
  return result;
}

function normalizedLocaleList(value: unknown, options: { empty?: boolean } = {}) {
  if (!Array.isArray(value) || (!options.empty && !value.length)) fail('invalid_promo_document');
  const locales = value.map((entry) => localeMetadata(entry).locale);
  if (new Set(locales).size !== locales.length) fail('invalid_promo_document');
  return locales.slice().sort();
}

export function buildPromoLocalesDocument(
  value: unknown,
  patch: PromoLocalesPatch,
  maxLocales: number,
) {
  const document = normalizePromoCmsDocument(value);
  if (document.contract !== PROMO_CMS_DOCUMENT_CONTRACT
    || document.system_catalog_version !== PROMO_LOCALES_SYSTEM_CATALOG
    || !isRecord(patch)
    || !isRecord(patch.contentByLocale)) {
    fail('invalid_payload');
  }
  const defaultLocale = localeMetadata(patch.defaultLocale).locale;
  const publishedLocales = normalizedLocaleList(patch.publishedLocales);
  const enabledLocales = Object.keys(patch.contentByLocale).map((entry) => localeMetadata(entry).locale).sort();
  if (!enabledLocales.includes(defaultLocale)
    || !publishedLocales.includes(defaultLocale)
    || publishedLocales.some((locale) => !enabledLocales.includes(locale))) {
    fail('invalid_promo_document');
  }
  if (enabledLocales.length > effectiveMaxLocales(maxLocales)) fail('promo_capability_denied', 403);

  const contentByLocale: JsonRecord = {};
  enabledLocales.forEach((locale) => {
    contentByLocale[locale] = normalizeLocalizedContent(document, patch.contentByLocale[locale]);
  });
  document.locales = { default: defaultLocale, published: publishedLocales };
  document.content_by_locale = contentByLocale;
  return document;
}

function baseWorkspace(value: unknown) {
  const document = normalizePromoCmsDocument(value);
  if (document.system_catalog_version !== PROMO_LOCALES_SYSTEM_CATALOG) fail('unsupported_promo_system_catalog');
  exactKeys(document.locales, ['default', 'published']);
  if (!document.locales.default && document.locales.published.length === 0
    && Object.keys(document.content_by_locale).length === 0) {
    document.locales = { default: 'es', published: ['es'] };
    document.content_by_locale.es = emptyLocalizedContent();
  }
  const defaultLocale = localeMetadata(document.locales.default).locale;
  const publishedLocales = normalizedLocaleList(document.locales.published);
  if (!publishedLocales.includes(defaultLocale)) fail('invalid_promo_document');
  const enabled = new Set(Object.keys(document.content_by_locale).map((entry) => localeMetadata(entry).locale));
  enabled.add(defaultLocale);
  publishedLocales.forEach((locale) => enabled.add(locale));
  [...enabled].forEach((locale) => {
    const source = document.content_by_locale[locale] || emptyLocalizedContent();
    document.content_by_locale[locale] = normalizeLocalizedContent(document, source);
  });
  document.locales = { default: defaultLocale, published: publishedLocales };
  return document;
}

function textPresent(value: unknown) {
  return typeof value === 'string' && Boolean(value.trim());
}

export function diagnosePromoLocale(value: unknown, requestedLocale: string): PromoLocaleDiagnostic {
  const document = normalizePromoCmsDocument(value);
  const locale = localeMetadata(requestedLocale).locale;
  const localized = isRecord(document.content_by_locale[locale])
    ? document.content_by_locale[locale]
    : emptyLocalizedContent();
  const missing: string[] = [];
  let completed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (condition) completed += 1;
    else missing.push(label);
  };

  check(document.system_catalog_version === PROMO_LOCALES_SYSTEM_CATALOG, 'Catálogo general del sistema');
  check(textPresent(localized.identity?.name), 'Identidad: nombre público');
  document.sections.filter((section: JsonRecord) => section.visible === true).forEach((section: JsonRecord) => {
    const label = String(localized.navigation?.[section.key] || section.key);
    check(textPresent(localized.navigation?.[section.key]), `Navegación: ${section.key}`);
    const sectionContent = localized.sections?.[section.key];
    check(isRecord(sectionContent), `Sección: ${label}`);
    if (!isRecord(sectionContent)) return;
    const required = SECTION_REQUIRED_TEXT[section.type as keyof typeof SECTION_REQUIRED_TEXT] || [];
    required.forEach((field) => check(textPresent(sectionContent[field]), `${label}: ${field}`));
    if (['services', 'featured_work', 'gallery'].includes(section.type)) {
      const configured = Array.isArray(section.config?.item_keys) ? section.config.item_keys : [];
      const items = Array.isArray(sectionContent.items) ? sectionContent.items : [];
      const byKey = new Map(items.map((item: JsonRecord) => [item.key, item]));
      configured.forEach((itemKey: string) => {
        const item = byKey.get(itemKey);
        check(Boolean(item), `${label}: elemento ${itemKey}`);
        if (item && section.type !== 'gallery') check(textPresent(item.name), `${label}: nombre ${itemKey}`);
      });
    }
  });
  if (document.contact.enabled) {
    [document.contact.primary_action_key, ...document.contact.secondary_action_keys].forEach((actionKey: string) => {
      check(textPresent(localized.contact?.[actionKey]?.label), `Contacto ${actionKey}: texto`);
      check(textPresent(localized.contact?.[actionKey]?.aria_label), `Contacto ${actionKey}: nombre accesible`);
    });
  }
  Object.keys(document.media_refs).forEach((useKey) => {
    const alt = localized.media_alt?.[useKey];
    check(Boolean(alt && (alt.decorative === true || textPresent(alt.alt))), `Medio ${useKey}: texto alternativo`);
  });
  check(textPresent(localized.seo?.title), 'SEO: título');
  check(textPresent(localized.seo?.description), 'SEO: descripción');
  return Object.freeze({
    locale,
    complete: missing.length === 0,
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
    missing: Object.freeze(missing),
  });
}

export function diagnosePromoLocalesPublication(value: unknown) {
  const document = normalizePromoCmsDocument(value);
  const issues: string[] = [];
  let published: PromoLocaleId[] = [];
  try {
    published = normalizedLocaleList(document.locales.published) as PromoLocaleId[];
    const defaultLocale = localeMetadata(document.locales.default).locale;
    if (!published.includes(defaultLocale)) issues.push('El idioma predeterminado no está incluido para publicación.');
  } catch (_) {
    issues.push('La configuración de idiomas no es compatible con el catálogo general.');
  }
  const diagnostics = published.map((locale) => diagnosePromoLocale(document, locale));
  diagnostics.filter((entry) => !entry.complete).forEach((entry) => {
    issues.push(`${localeMetadata(entry.locale).label} tiene ${entry.missing.length} requisito(s) pendiente(s).`);
  });
  return Object.freeze({
    ready: issues.length === 0 && diagnostics.length > 0,
    issues: Object.freeze(issues),
    diagnostics: Object.freeze(diagnostics),
  });
}

export function createPromoLocalesWorkspace(value: unknown): PromoLocalesWorkspace {
  const document = baseWorkspace(value);
  const enabledLocales = Object.keys(document.content_by_locale)
    .map((locale) => localeMetadata(locale).locale)
    .sort((left, right) => {
      if (left === document.locales.default) return -1;
      if (right === document.locales.default) return 1;
      return left.localeCompare(right);
    });
  const diagnostics = enabledLocales.map((locale) => diagnosePromoLocale(document, locale));
  return Object.freeze({ document, enabledLocales: Object.freeze(enabledLocales), diagnostics: Object.freeze(diagnostics) });
}

export function addPromoLocale(value: unknown, requestedLocale: string, maxLocales: number) {
  const document = baseWorkspace(value);
  const locale = localeMetadata(requestedLocale).locale;
  const enabled = Object.keys(document.content_by_locale);
  if (enabled.includes(locale)) fail('promo_locale_already_enabled');
  if (enabled.length >= effectiveMaxLocales(maxLocales)) fail('promo_capability_denied', 403);
  document.content_by_locale[locale] = emptyLocalizedContent();
  return document;
}

export function removePromoLocale(value: unknown, requestedLocale: string) {
  const document = baseWorkspace(value);
  const locale = localeMetadata(requestedLocale).locale;
  if (locale === document.locales.default) fail('promo_default_locale_required');
  if (!Object.prototype.hasOwnProperty.call(document.content_by_locale, locale)) fail('promo_locale_not_enabled');
  delete document.content_by_locale[locale];
  document.locales.published = document.locales.published.filter((entry: string) => entry !== locale);
  return document;
}

export function setPromoDefaultLocale(value: unknown, requestedLocale: string) {
  const document = baseWorkspace(value);
  const locale = localeMetadata(requestedLocale).locale;
  if (!Object.prototype.hasOwnProperty.call(document.content_by_locale, locale)) fail('promo_locale_not_enabled');
  if (!diagnosePromoLocale(document, locale).complete) fail('incomplete_promo_locale');
  document.locales.default = locale;
  document.locales.published = [...new Set([...document.locales.published, locale])].sort();
  return document;
}

export function setPromoLocalePublished(value: unknown, requestedLocale: string, published: boolean) {
  const document = baseWorkspace(value);
  const locale = localeMetadata(requestedLocale).locale;
  if (!Object.prototype.hasOwnProperty.call(document.content_by_locale, locale)) fail('promo_locale_not_enabled');
  if (!published && locale === document.locales.default) fail('promo_default_locale_required');
  if (published && !diagnosePromoLocale(document, locale).complete) fail('incomplete_promo_locale');
  const next = new Set(document.locales.published);
  if (published) next.add(locale);
  else next.delete(locale);
  document.locales.published = [...next].sort();
  return document;
}

export function promoLocalesErrorMessage(code: unknown) {
  const messages: Record<string, string> = {
    unauthorized: 'Tu sesión terminó. Vuelve a iniciar sesión.',
    session_revoked: 'Tu sesión ya no está vigente. Vuelve a iniciar sesión.',
    blocked_by_plan: 'El plan actual bloquea la edición de este sitio.',
    promo_capability_denied: 'La cuota de idiomas de esta tienda no permite completar la operación.',
    promo_permission_denied: 'Tu sesión no tiene todos los permisos requeridos para guardar idiomas.',
    promo_draft_conflict: 'El borrador cambió en otra sesión. Recárgalo antes de volver a guardar.',
    incomplete_promo_locale: 'Completa todos los requisitos de ese idioma antes de incluirlo o usarlo como predeterminado.',
    promo_default_locale_required: 'El idioma predeterminado no se puede retirar ni excluir.',
    promo_locale_already_enabled: 'Ese idioma ya está habilitado.',
    unsupported_promo_locale: 'Ese idioma no tiene un catálogo general completo y no puede habilitarse.',
    unsupported_promo_system_catalog: 'El catálogo general del borrador no es compatible con este editor.',
    invalid_promo_document: 'La configuración contiene datos incompletos o no permitidos.',
    unsafe_promo_document_value: 'La traducción incluye código, una URL o texto activo no permitido.',
    invalid_origin: 'La solicitud no proviene del panel administrativo.',
  };
  return messages[String(code || '')] || 'No se pudo completar la operación. Intenta nuevamente.';
}
