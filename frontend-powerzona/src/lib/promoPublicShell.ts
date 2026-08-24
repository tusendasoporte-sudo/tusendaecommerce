import { serverPocketBaseUrl } from './pocketBaseServerUrl.ts';
import { request as nodeHttpRequest } from 'node:http';
import { request as nodeHttpsRequest } from 'node:https';

export const PROMO_PUBLIC_SHELL_CONTRACT = 'promo.public.shell.v1';
export const PROMO_PUBLIC_ROUTE_CONTRACT = 'promo.public.route.v1';
export const PROMO_PUBLIC_INTERNAL_PATH = '/__pz/promo-shell';

const PUBLIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KEY_PATTERN = /^[a-z][a-z0-9_-]{0,119}$/;
const THEME_PATTERN = /^[a-z][a-z0-9.-]{0,79}$/;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const TOKEN_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const LOCALE_PATH_PATTERN = /^\/([A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*)$/;
const SECTION_TYPES = new Set([
  'hero', 'services', 'featured_work', 'gallery', 'owner', 'store_rating', 'contact', 'footer',
]);
const CONTACT_TYPES = new Set(['whatsapp', 'phone', 'email', 'internal_form', 'approved_live_chat']);
const MEDIA_PURPOSES = new Set(['hero', 'service', 'gallery', 'owner', 'footer', 'social', 'video_poster']);
const SYSTEM_MESSAGE_KEYS = Object.freeze([
  'a11y.contact_action', 'a11y.language_selector', 'a11y.main_content', 'a11y.main_navigation',
  'a11y.skip_to_content', 'contact.call', 'contact.email', 'contact.open_chat',
  'contact.request_estimate', 'contact.send_message', 'contact.unavailable', 'contact.whatsapp',
  'error.locale_unavailable', 'error.site_unavailable', 'locale.current', 'locale.option_aria',
  'navigation.contact', 'navigation.gallery', 'navigation.home', 'navigation.owner',
  'navigation.services', 'state.available', 'state.loading', 'state.unavailable',
]);
const THEME_TOKEN_VALUES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  surface: ['obsidian'],
  text: ['ivory'],
  accent: ['heritage_gold', 'champagne_gold'],
  border: ['heritage_gold', 'champagne_gold'],
  focus: ['ivory_ring'],
  heading_font: ['editorial_serif'],
  body_font: ['humanist_sans'],
  radius: ['subtle', 'soft'],
  shadow: ['ambient', 'lifted'],
  density: ['comfortable', 'compact'],
  motion: ['subtle', 'reduced'],
});

type JsonRecord = Record<string, any>;

export type PromoPublicSection = Readonly<{
  key: string;
  type: string;
  variant: 'default';
  config: Readonly<JsonRecord>;
  media_use_keys: readonly string[];
}>;

export type PromoPublicProfile = Readonly<{
  site: Readonly<{ public_slug: string }>;
  system: Readonly<{ catalog_version: 'promo.system.v1'; messages: Readonly<Record<string, string>> }>;
  locale: Readonly<{
    effective: string;
    default: string;
    source: 'url' | 'preference' | 'accept-language' | 'default';
    lang: string;
    direction: 'ltr' | 'rtl';
    canonical_path: string;
  }>;
  selector: Readonly<{
    label: string;
    options: readonly Readonly<{ locale: string; label: string; aria_label: string; href: string; active: boolean }>[];
  }>;
  theme: Readonly<{ theme_id: string; version: string; tokens: Readonly<Record<string, string>> }>;
  section_order: readonly string[];
  sections: readonly PromoPublicSection[];
  media: readonly Readonly<JsonRecord>[];
  contact: Readonly<JsonRecord>;
  content: Readonly<JsonRecord>;
  adapters: Readonly<JsonRecord>;
}>;

export type PromoPublicShellResult = Readonly<{
  route: Readonly<{ source: 'platform' | 'custom'; action: 'serve' | 'redirect'; location?: string }>;
  profile?: PromoPublicProfile;
  response: Readonly<{ contentLanguage: string; setCookie: string; vary: string }>;
}>;

export class PromoPublicShellError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code = 'promo_public_unavailable', status = 503) {
    super(code);
    this.name = 'PromoPublicShellError';
    this.code = code;
    this.status = status;
  }
}

function fail(code = 'promo_public_unavailable', status = 503): never {
  throw new PromoPublicShellError(code, status);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactRecord(value: unknown, keys: readonly string[]): JsonRecord {
  if (!isRecord(value)) fail();
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail();
  return value;
}

function subsetRecord(value: unknown, keys: readonly string[]): JsonRecord {
  if (!isRecord(value) || Object.keys(value).some((key) => !keys.includes(key))) fail();
  return value;
}

function safeText(value: unknown, max: number, required = false) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value)
    || (required && !value.trim())) fail();
  return value;
}

function safePattern(value: unknown, pattern: RegExp) {
  const text = safeText(value, 160, true);
  if (!pattern.test(text)) fail();
  return text;
}

function safeInteger(value: unknown, minimum: number, maximum: number) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) fail();
  return Number(value);
}

function canonicalLocale(value: unknown) {
  const text = safeText(value, 80, true);
  let canonical = '';
  try { canonical = Intl.getCanonicalLocales(text)[0] || ''; } catch (_) { fail(); }
  if (canonical !== text) fail();
  return canonical;
}

function exactStringMap(value: unknown, keys: readonly string[], max = 4000) {
  const record = exactRecord(value, keys);
  return Object.fromEntries(keys.map((key) => [key, safeText(record[key], max, true)]));
}

function optionalTextMap(value: unknown, keys: readonly string[], limits: Readonly<Record<string, number>>) {
  const record = subsetRecord(value, keys);
  return Object.fromEntries(Object.keys(record).sort().map((key) => [
    key,
    safeText(record[key], limits[key] || 4000),
  ]));
}

function safeHref(value: unknown, source: 'platform' | 'custom') {
  const path = safeText(value, 240, true);
  if (source === 'platform') {
    if (!/^\/promo\/[a-z0-9]+(?:-[a-z0-9]+)*\/[A-Za-z0-9-]{2,80}$/.test(path)) fail();
  } else if (!LOCALE_PATH_PATTERN.test(path)) fail();
  return path;
}

function safeRedirect(value: unknown) {
  const location = safeText(value, 420, true);
  if (location.startsWith('/')) {
    if (!/^\/promo\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[A-Za-z0-9-]{2,80})?$/.test(location)) fail();
    return location;
  }
  let parsed: URL;
  try { parsed = new URL(location); } catch (_) { fail(); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port
    || parsed.search || parsed.hash || !parsed.hostname || parsed.pathname.startsWith('//')
    || (parsed.pathname !== '/' && !LOCALE_PATH_PATTERN.test(parsed.pathname))) fail();
  return parsed.toString();
}

function normalizeSection(value: unknown): PromoPublicSection {
  const section = exactRecord(value, ['key', 'type', 'variant', 'config', 'media_use_keys']);
  const type = safePattern(section.type, KEY_PATTERN);
  if (!SECTION_TYPES.has(type) || section.variant !== 'default' || !isRecord(section.config)
    || !Array.isArray(section.media_use_keys) || section.media_use_keys.length > 30) fail();
  const allowedConfig: Readonly<Record<string, readonly string[]>> = {
    hero: ['media_use_key', 'action_key'], services: ['item_keys'], featured_work: ['item_keys'],
    gallery: ['item_keys'], owner: ['media_use_key'], store_rating: [], contact: ['action_keys'], footer: [],
  };
  if (Object.keys(section.config).some((key) => !(allowedConfig[type] || []).includes(key))) fail();
  const config: JsonRecord = {};
  for (const [key, raw] of Object.entries(section.config)) {
    if (Array.isArray(raw)) {
      if (raw.length > 50) fail();
      config[key] = raw.map((item) => safePattern(item, KEY_PATTERN));
    } else {
      config[key] = raw === '' ? '' : safePattern(raw, KEY_PATTERN);
    }
  }
  return {
    key: safePattern(section.key, KEY_PATTERN),
    type,
    variant: 'default',
    config,
    media_use_keys: section.media_use_keys.map((item: unknown) => safePattern(item, KEY_PATTERN)),
  };
}

function normalizeContent(value: unknown, sections: readonly PromoPublicSection[], mediaKeys: readonly string[], actionKeys: readonly string[]) {
  const content = exactRecord(value, ['identity', 'navigation', 'sections', 'contact', 'media_alt', 'seo']);
  const sectionKeys = sections.map((section) => section.key);
  const identity = optionalTextMap(content.identity, ['name', 'summary', 'owner_name', 'owner_bio'], {
    name: 140, summary: 600, owner_name: 140, owner_bio: 4000,
  });
  if (!identity.name) fail();
  const navigation = exactStringMap(content.navigation, sectionKeys, 80);
  const localizedSections = exactRecord(content.sections, sectionKeys);
  const normalizedSections: JsonRecord = {};
  for (const section of sections) {
    const fields = section.type === 'footer'
      ? ['heading', 'summary', 'text']
      : section.type === 'owner'
        ? ['heading', 'summary', 'name', 'bio']
        : ['heading', 'summary', 'items'];
    const localized = subsetRecord(localizedSections[section.key], fields);
    const result = optionalTextMap(
      Object.fromEntries(Object.entries(localized).filter(([key]) => key !== 'items')),
      fields.filter((field) => field !== 'items'),
      { heading: 160, summary: 600, name: 140, bio: 4000, text: 4000 },
    );
    if (Object.hasOwn(localized, 'items')) {
      if (!Array.isArray(localized.items) || localized.items.length > 50) fail();
      result.items = localized.items.map((raw: unknown) => {
        const item = subsetRecord(raw, ['key', 'name', 'summary', 'caption']);
        return {
          key: safePattern(item.key, KEY_PATTERN),
          ...optionalTextMap(
            Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'key')),
            ['name', 'summary', 'caption'],
            { name: 160, summary: 600, caption: 500 },
          ),
        };
      });
    }
    normalizedSections[section.key] = result;
  }
  const contact = subsetRecord(content.contact, actionKeys);
  const normalizedContact = Object.fromEntries(Object.entries(contact).map(([key, raw]) => [
    key,
    optionalTextMap(raw, ['label', 'aria_label', 'message'], { label: 80, aria_label: 160, message: 1000 }),
  ]));
  const mediaAlt = exactRecord(content.media_alt, mediaKeys);
  const normalizedMediaAlt = Object.fromEntries(mediaKeys.map((key) => {
    const item = exactRecord(mediaAlt[key], ['alt', 'decorative']);
    if (typeof item.decorative !== 'boolean') fail();
    const alt = safeText(item.alt, 300);
    if ((item.decorative && alt) || (!item.decorative && !alt)) fail();
    return [key, { alt, decorative: item.decorative }];
  }));
  const seo = optionalTextMap(content.seo, ['title', 'description', 'social_title', 'social_description'], {
    title: 70, description: 170, social_title: 70, social_description: 170,
  });
  if (!seo.title || !seo.description) fail();
  return { identity, navigation, sections: normalizedSections, contact: normalizedContact, media_alt: normalizedMediaAlt, seo };
}

function normalizeProfile(value: unknown, source: 'platform' | 'custom'): PromoPublicProfile {
  const profile = exactRecord(value, [
    'site', 'system', 'locale', 'selector', 'theme', 'section_order', 'sections',
    'media', 'contact', 'content', 'adapters',
  ]);
  const site = exactRecord(profile.site, ['public_slug']);
  const system = exactRecord(profile.system, ['catalog_version', 'messages']);
  if (system.catalog_version !== 'promo.system.v1') fail();
  const locale = exactRecord(profile.locale, ['effective', 'default', 'source', 'lang', 'direction', 'canonical_path']);
  const effective = canonicalLocale(locale.effective);
  const defaultLocale = canonicalLocale(locale.default);
  if (locale.lang !== effective || !['url', 'preference', 'accept-language', 'default'].includes(locale.source)
    || !['ltr', 'rtl'].includes(locale.direction)) fail();
  const slug = safePattern(site.public_slug, PUBLIC_SLUG_PATTERN);
  const expectedCanonical = source === 'platform' ? `/promo/${slug}/${effective}` : `/${effective}`;
  if (locale.canonical_path !== expectedCanonical) fail();
  const selector = exactRecord(profile.selector, ['label', 'options']);
  if (!Array.isArray(selector.options) || !selector.options.length || selector.options.length > 10) fail();
  const options = selector.options.map((raw: unknown) => {
    const option = exactRecord(raw, ['locale', 'label', 'aria_label', 'href', 'active']);
    if (typeof option.active !== 'boolean') fail();
    return {
      locale: canonicalLocale(option.locale),
      label: safeText(option.label, 80, true),
      aria_label: safeText(option.aria_label, 160, true),
      href: safeHref(option.href, source),
      active: option.active,
    };
  });
  if (new Set(options.map((option) => option.locale)).size !== options.length
    || options.filter((option) => option.active).length !== 1
    || !options.some((option) => option.active && option.locale === effective)
    || !options.some((option) => option.locale === defaultLocale)
    || options.some((option) => option.href !== (source === 'platform'
      ? `/promo/${slug}/${option.locale}` : `/${option.locale}`))) fail();
  const theme = exactRecord(profile.theme, ['theme_id', 'version', 'tokens']);
  const tokens = exactRecord(theme.tokens, Object.keys(THEME_TOKEN_VALUES));
  const normalizedTokens = Object.fromEntries(Object.entries(tokens).map(([key, raw]) => {
    const token = safePattern(raw, TOKEN_PATTERN);
    if (!THEME_TOKEN_VALUES[key]?.includes(token)) fail();
    return [key, token];
  }));
  if (normalizedTokens.accent !== normalizedTokens.border) fail();
  if (!Array.isArray(profile.sections) || profile.sections.length > 64) fail();
  const sections = profile.sections.map(normalizeSection);
  if (new Set(sections.map((section) => section.key)).size !== sections.length) fail();
  if (!Array.isArray(profile.section_order) || profile.section_order.length !== sections.length) fail();
  const sectionOrder = profile.section_order.map((item: unknown) => safePattern(item, KEY_PATTERN));
  if (sectionOrder.some((key, index) => key !== sections[index]?.key)) fail();
  if (!Array.isArray(profile.media) || profile.media.length > 512) fail();
  const media = profile.media.map((raw: unknown) => {
    const item = subsetRecord(raw, ['key', 'purpose', 'kind', 'width', 'height', 'duration_ms', 'delivery', 'accessibility']);
    const accessibility = exactRecord(item.accessibility, ['alt', 'decorative']);
    const purpose = safePattern(item.purpose, KEY_PATTERN);
    const width = safeInteger(item.width, 1, 4096);
    const height = safeInteger(item.height, 1, 4096);
    const duration = safeInteger(item.duration_ms, 0, 30 * 60 * 1000);
    const alt = safeText(accessibility.alt, 300);
    if (!['image', 'video'].includes(item.kind) || !MEDIA_PURPOSES.has(purpose)
      || typeof accessibility.decorative !== 'boolean'
      || (accessibility.decorative && alt) || (!accessibility.decorative && !alt)
      || (item.kind === 'image' && duration !== 0) || (item.kind === 'video' && duration === 0)) fail();
    return {
      key: safePattern(item.key, KEY_PATTERN), purpose,
      kind: item.kind, width, height, duration_ms: duration,
      accessibility: { alt, decorative: accessibility.decorative },
    };
  });
  const mediaKeys = media.map((item) => item.key);
  if (new Set(mediaKeys).size !== mediaKeys.length) fail();
  const contact = exactRecord(profile.contact, ['enabled', 'primary_action_key', 'secondary_action_keys', 'actions']);
  if (typeof contact.enabled !== 'boolean' || !Array.isArray(contact.actions) || contact.actions.length > 32
    || !Array.isArray(contact.secondary_action_keys)) fail();
  const actions = contact.actions.map((raw: unknown) => {
    const action = exactRecord(raw, ['key', 'type', 'enabled']);
    if (action.enabled !== true || !CONTACT_TYPES.has(action.type)) fail();
    return { key: safePattern(action.key, KEY_PATTERN), type: action.type, enabled: true };
  });
  const actionKeys = actions.map((action) => action.key);
  if (new Set(actionKeys).size !== actionKeys.length || contact.secondary_action_keys.length > 32) fail();
  const normalizedContact = {
    enabled: contact.enabled,
    primary_action_key: contact.primary_action_key === '' ? '' : safePattern(contact.primary_action_key, KEY_PATTERN),
    secondary_action_keys: contact.secondary_action_keys.map((item: unknown) => safePattern(item, KEY_PATTERN)),
    actions,
  };
  if (new Set(normalizedContact.secondary_action_keys).size !== normalizedContact.secondary_action_keys.length
    || (normalizedContact.enabled && (!actionKeys.includes(normalizedContact.primary_action_key)
      || normalizedContact.secondary_action_keys.includes(normalizedContact.primary_action_key)
      || normalizedContact.secondary_action_keys.some((key) => !actionKeys.includes(key))))
    || (!normalizedContact.enabled && (normalizedContact.primary_action_key
      || normalizedContact.secondary_action_keys.length || actions.length))) fail();
  for (const section of sections) {
    if (section.media_use_keys.some((key) => !mediaKeys.includes(key))) fail();
    const configMedia = typeof section.config.media_use_key === 'string' ? section.config.media_use_key : '';
    const configAction = typeof section.config.action_key === 'string' ? section.config.action_key : '';
    const configActions = Array.isArray(section.config.action_keys) ? section.config.action_keys : [];
    if ((configMedia && !mediaKeys.includes(configMedia))
      || (configAction && !actionKeys.includes(configAction))
      || configActions.some((key) => !actionKeys.includes(key))) fail();
  }
  const adapters = exactRecord(profile.adapters, ['store_rating', 'landing_qr_link']);
  const rating = exactRecord(adapters.store_rating, ['enabled']);
  const landing = exactRecord(adapters.landing_qr_link, ['enabled']);
  if (typeof rating.enabled !== 'boolean' || typeof landing.enabled !== 'boolean') fail();
  return {
    site: { public_slug: slug },
    system: { catalog_version: 'promo.system.v1', messages: exactStringMap(system.messages, SYSTEM_MESSAGE_KEYS, 240) },
    locale: {
      effective, default: defaultLocale, source: locale.source, lang: effective,
      direction: locale.direction, canonical_path: expectedCanonical,
    },
    selector: { label: safeText(selector.label, 80, true), options },
    theme: {
      theme_id: safePattern(theme.theme_id, THEME_PATTERN),
      version: safePattern(theme.version, VERSION_PATTERN), tokens: normalizedTokens,
    },
    section_order: sectionOrder,
    sections,
    media,
    contact: normalizedContact,
    content: normalizeContent(profile.content, sections, mediaKeys, actionKeys),
    adapters: { store_rating: { enabled: rating.enabled }, landing_qr_link: { enabled: landing.enabled } },
  };
}

function normalizeEnvelope(value: unknown): Omit<PromoPublicShellResult, 'response'> {
  const envelope = exactRecord(value, ['ok', 'contract', 'route', ...(isRecord(value) && Object.hasOwn(value, 'profile') ? ['profile'] : [])]);
  if (envelope.ok !== true || envelope.contract !== PROMO_PUBLIC_SHELL_CONTRACT) fail();
  const route = exactRecord(envelope.route, ['source', 'action', ...(isRecord(envelope.route) && Object.hasOwn(envelope.route, 'location') ? ['location'] : [])]);
  if (!['platform', 'custom'].includes(route.source) || !['serve', 'redirect'].includes(route.action)) fail();
  if (route.action === 'redirect') {
    if (route.source !== 'custom' || Object.hasOwn(envelope, 'profile')) fail();
    return { route: { source: route.source, action: 'redirect', location: safeRedirect(route.location) } };
  }
  if (Object.hasOwn(route, 'location') || !Object.hasOwn(envelope, 'profile')) fail();
  return {
    route: { source: route.source, action: 'serve' },
    profile: normalizeProfile(envelope.profile, route.source),
  };
}

export function normalizePromoPublicShellResponse(value: unknown) {
  return normalizeEnvelope(value);
}

function normalizeRouteEnvelope(value: unknown) {
  const envelope = exactRecord(value, ['ok', 'contract', 'route']);
  if (envelope.ok !== true || envelope.contract !== PROMO_PUBLIC_ROUTE_CONTRACT) fail();
  const route = exactRecord(envelope.route, ['source', 'action', 'location']);
  if (route.source !== 'commerce-bridge' || route.action !== 'redirect') fail();
  return { route: { source: 'commerce-bridge' as const, action: 'redirect' as const, location: safeRedirect(route.location) } };
}

function localeCookie(header: string) {
  const matches = String(header || '').split(';').map((part) => part.trim()).filter((part) => part.startsWith('pz_promo_locale='));
  return matches.length === 1 && matches[0].length <= 100 ? matches[0] : '';
}

function normalizedBaseUrl(value: unknown) {
  const text = String(value || '').trim();
  let parsed: URL;
  try { parsed = new URL(text); } catch (_) { fail('promo_public_backend_unavailable', 503); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password
    || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== '/')) {
    fail('promo_public_backend_unavailable', 503);
  }
  return parsed.origin;
}

function requestBackendWithAuthoritativeHost(url: string, headers: Headers) {
  return new Promise<Response>((resolve, reject) => {
    const target = new URL(url);
    const send = target.protocol === 'https:' ? nodeHttpsRequest : nodeHttpRequest;
    const request = send(target, {
      method: 'GET',
      headers: Object.fromEntries(headers.entries()),
    }, (incoming) => {
      const chunks: Buffer[] = [];
      let size = 0;
      incoming.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 1024 * 1024) {
          request.destroy(new Error('promo_public_response_too_large'));
          return;
        }
        chunks.push(chunk);
      });
      incoming.on('end', () => {
        const responseHeaders = new Headers();
        for (const [name, raw] of Object.entries(incoming.headers)) {
          if (Array.isArray(raw)) raw.forEach((value) => responseHeaders.append(name, value));
          else if (raw !== undefined) responseHeaders.set(name, raw);
        }
        resolve(new Response(Buffer.concat(chunks), {
          status: incoming.statusCode || 502,
          statusText: incoming.statusMessage,
          headers: responseHeaders,
        }));
      });
    });
    request.setTimeout(8_000, () => request.destroy(new Error('promo_public_backend_timeout')));
    request.on('error', reject);
    request.end();
  });
}

async function requestContract(input: {
  endpoint: string;
  request: Request;
  host?: string;
  fetcher?: typeof fetch;
  contract?: 'shell' | 'route';
}) {
  const baseUrl = normalizedBaseUrl(serverPocketBaseUrl());
  const headers = new Headers({ Accept: 'application/json' });
  const language = input.request.headers.get('accept-language') || '';
  const cookie = localeCookie(input.request.headers.get('cookie') || '');
  if (language) headers.set('Accept-Language', language.slice(0, 512));
  if (cookie) headers.set('Cookie', cookie);
  if (input.host) headers.set('Host', input.host);
  let response: Response;
  try {
    response = input.host && !input.fetcher
      ? await requestBackendWithAuthoritativeHost(`${baseUrl}${input.endpoint}`, headers)
      : await (input.fetcher || fetch)(`${baseUrl}${input.endpoint}`, {
        method: 'GET', headers, cache: 'no-store', redirect: 'manual',
      });
  } catch (_) { fail('promo_public_backend_unavailable', 503); }
  const raw = await response.text();
  if (raw.length > 1024 * 1024) fail('promo_public_backend_unavailable', 503);
  let body: unknown = null;
  try { body = raw ? JSON.parse(raw) : null; } catch (_) { fail('promo_public_backend_unavailable', 503); }
  if (!response.ok) {
    const code = isRecord(body) && typeof body.error === 'string' ? body.error : 'promo_public_unavailable';
    fail(code, response.status);
  }
  const normalized = input.contract === 'route' ? normalizeRouteEnvelope(body) : normalizeEnvelope(body);
  return {
    ...normalized,
    response: {
      contentLanguage: response.headers.get('content-language') || '',
      setCookie: response.headers.get('set-cookie') || '',
      vary: response.headers.get('vary') || '',
    },
  } as PromoPublicShellResult;
}

export function promoPlatformEndpoint(publicSlug: string, locale?: string) {
  const slug = safePattern(publicSlug, PUBLIC_SLUG_PATTERN);
  return locale
    ? `/api/pz/promo/public/v1/shell/sites/${slug}/locales/${encodeURIComponent(locale)}`
    : `/api/pz/promo/public/v1/shell/sites/${slug}`;
}

export function promoHostEndpoint(locale?: string) {
  return locale
    ? `/api/pz/promo/public/v1/shell/host/locales/${encodeURIComponent(locale)}`
    : '/api/pz/promo/public/v1/shell/host';
}

export async function readPlatformPromoShell(request: Request, publicSlug: string, locale?: string) {
  return requestContract({ endpoint: promoPlatformEndpoint(publicSlug, locale), request });
}

export async function readCustomHostPromoShell(request: Request, locale?: string) {
  const host = request.headers.get('host') || '';
  if (!host || host.length > 280 || /[\u0000-\u001f\u007f]/.test(host)) fail('promo_host_unavailable', 421);
  return requestContract({ endpoint: promoHostEndpoint(locale), request, host });
}

export async function readPromoCommerceBridge(request: Request, storeSlug: string) {
  const slug = safePattern(storeSlug, PUBLIC_SLUG_PATTERN);
  const result = await requestContract({
    endpoint: `/api/pz/promo/public/v1/shell/stores/${slug}`,
    request,
    contract: 'route',
  });
  return result.route.action === 'redirect' ? result.route.location || '' : '';
}

export function customPromoPublicPath(pathname: string) {
  if (pathname === '/') return { allowed: true as const, locale: undefined };
  const match = pathname.match(LOCALE_PATH_PATTERN);
  const reserved = new Set(['admin', 'master', 'api', 't', 'checkout']);
  return match && !reserved.has(match[1].toLowerCase())
    ? { allowed: true as const, locale: match[1] }
    : { allowed: false as const, locale: undefined };
}

export function isPromoPlatformRequest(request: Request) {
  let hostname = '';
  try { hostname = new URL(request.url).hostname.toLowerCase(); } catch (_) { return false; }
  const configured = String(typeof process !== 'undefined' ? process.env?.PZ_PROMO_PLATFORM_HOSTS || '' : '')
    .split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
  const exact = new Set([
    'tusenda84.com', 'www.tusenda84.com', 'api.tusenda84.com', 'localhost', '127.0.0.1', '::1',
    'mob76fcvxkxyb8tq0nwys18o.91.99.99.83.sslip.io',
    ...configured,
  ]);
  return exact.has(hostname);
}

export function applyPromoPublicHeaders(response: Response, result?: PromoPublicShellResult) {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (result?.response.contentLanguage) response.headers.set('Content-Language', result.response.contentLanguage);
  if (result?.response.setCookie) response.headers.append('Set-Cookie', result.response.setCookie);
  if (result?.response.vary) response.headers.set('Vary', result.response.vary);
  return response;
}

export function promoPublicUnavailable(status = 404) {
  const safeStatus = status === 421 ? 421 : status >= 500 ? 503 : 404;
  const response = new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Sitio no disponible</title><style>html{font-family:system-ui,sans-serif;color:#172033;background:#f5f7fb}body{min-height:100vh;display:grid;place-items:center;margin:0;padding:24px}main{max-width:36rem}h1{font-size:clamp(1.75rem,5vw,2.5rem)}p{line-height:1.6;color:#667085}</style></head><body><main><h1>Sitio no disponible</h1><p>No pudimos mostrar este sitio en este momento.</p></main></body></html>`, {
    status: safeStatus,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
  return applyPromoPublicHeaders(response);
}
