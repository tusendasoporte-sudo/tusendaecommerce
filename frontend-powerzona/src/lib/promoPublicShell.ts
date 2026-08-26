import { serverPocketBaseUrl } from './pocketBaseServerUrl.ts';
import { request as nodeHttpRequest } from 'node:http';
import { request as nodeHttpsRequest } from 'node:https';
import {
  applyPromoSecurityHeaders,
  isPromoPlatformHostRequest,
  promoRequestAuthority,
} from './promoSecurity.ts';

export const PROMO_PUBLIC_SHELL_CONTRACT = 'promo.public.shell.v1';
export const PROMO_PUBLIC_ROUTE_CONTRACT = 'promo.public.route.v1';
export const PROMO_PUBLIC_LOCALIZED_CONTRACT = 'promo.public.localized.v1';
export const PROMO_PUBLIC_INTERNAL_PATH = '/promo-shell-internal';
export const PROMO_BLACK_GOLD_THEME_ID = 'promo.black-gold';
export const PROMO_BLACK_GOLD_THEME_VERSION = '1.0.0';
export const PROMO_BLACK_GOLD_RENDERER_KEY = 'promo.black-gold';
export const PROMO_PUBLIC_RENDERER_KEYS = Object.freeze([
  'promo.black-gold',
  'promo.minimal',
  'promo.artisan',
  'promo.vibrant',
  'promo.professional',
  'promo.portfolio',
] as const);
export const PROMO_PUBLIC_SEO_CONTRACT = 'promo.public.seo.v1';
export const PROMO_PLATFORM_ORIGIN = 'https://tusenda84.com';
export const PROMO_PUBLIC_CACHE_CONTRACT = 'promo.public.cache.v1';

const PUBLIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KEY_PATTERN = /^[a-z][a-z0-9_-]{0,119}$/;
const THEME_PATTERN = /^[a-z][a-z0-9.-]{0,79}$/;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const TOKEN_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const MEDIA_VARIANT_PATTERN = /^(?:original|w[0-9]{2,4})$/;
const LOCALE_PATH_PATTERN = /^\/([A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*)$/;
const SECTION_TYPES = new Set([
  'hero', 'services', 'featured_work', 'gallery', 'owner', 'store_rating', 'contact', 'footer',
]);
const CONTACT_TYPES = new Set(['whatsapp', 'phone', 'email', 'internal_form', 'approved_live_chat']);
const EXECUTABLE_CONTACT_TYPES = new Set(['whatsapp', 'phone', 'email']);
const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_ACTION_CONTRACT = 'promo.contact.action.v1';
const FOOTER_CONTRACT = 'promo.footer.v1';
const LANDING_QR_LINK_CONTRACT = 'promo.landing-qr-link.v1';
const LANDING_QR_PLATFORM_ORIGIN = 'https://tusenda84.com';
const RESERVED_FOOTER_BRAND = 'Tu Senda 84';
const FOOTER_SOCIALS: Readonly<Record<string, Readonly<{
  label: string;
  handle: RegExp;
  href: (handle: string) => string;
}>>> = Object.freeze({
  instagram: { label: 'Instagram', handle: /^(?!.*\.\.)(?:[a-z0-9](?:[a-z0-9._]{0,28}[a-z0-9_])?)$/, href: (handle) => `https://www.instagram.com/${handle}/` },
  facebook: { label: 'Facebook', handle: /^(?!.*\.\.)(?:[a-z0-9](?:[a-z0-9.]{0,48}[a-z0-9])?)$/, href: (handle) => `https://www.facebook.com/${handle}` },
  linkedin: { label: 'LinkedIn', handle: /^(?:[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?)$/, href: (handle) => `https://www.linkedin.com/company/${handle}/` },
  youtube: { label: 'YouTube', handle: /^(?:[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?)$/, href: (handle) => `https://www.youtube.com/@${handle}` },
});
const MEDIA_PURPOSES = new Set(['hero', 'service', 'gallery', 'owner', 'footer', 'social', 'video_poster', 'qr', 'logo']);
const MEDIA_DELIVERY_CONTRACT = 'promo.media.delivery.v1';
const MEDIA_PURPOSE_POLICIES: Readonly<Record<string, Readonly<{
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  widths: readonly number[];
  sizes: string;
}>>> = Object.freeze({
  hero: { minWidth: 640, minHeight: 320, maxWidth: 1920, maxHeight: 1080, widths: [480, 768, 1280], sizes: '100vw' },
  service: { minWidth: 240, minHeight: 240, maxWidth: 1200, maxHeight: 1200, widths: [320, 640, 960], sizes: '(min-width: 900px) 33vw, 100vw' },
  gallery: { minWidth: 320, minHeight: 240, maxWidth: 1600, maxHeight: 1600, widths: [480, 768, 1280], sizes: '(min-width: 900px) 50vw, 100vw' },
  owner: { minWidth: 320, minHeight: 400, maxWidth: 1200, maxHeight: 1600, widths: [320, 640, 960], sizes: '(min-width: 900px) 40vw, 100vw' },
  footer: { minWidth: 480, minHeight: 120, maxWidth: 1600, maxHeight: 800, widths: [480, 960, 1280], sizes: '100vw' },
  social: { minWidth: 600, minHeight: 315, maxWidth: 1200, maxHeight: 630, widths: [600, 1200], sizes: '100vw' },
  video_poster: { minWidth: 640, minHeight: 360, maxWidth: 1600, maxHeight: 900, widths: [480, 960, 1440], sizes: '100vw' },
  qr: { minWidth: 512, minHeight: 512, maxWidth: 512, maxHeight: 512, widths: [512], sizes: 'min(18rem, 80vw)' },
  logo: { minWidth: 256, minHeight: 256, maxWidth: 1024, maxHeight: 1024, widths: [256, 512, 1024], sizes: 'min(10rem, 40vw)' },
});
const SECTION_MEDIA_PURPOSES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  hero: ['hero'], services: ['service'], featured_work: ['gallery'], gallery: ['gallery'],
  owner: ['owner'], store_rating: [], contact: [], footer: ['footer'],
});
const SYSTEM_MESSAGE_KEYS = Object.freeze([
  'a11y.contact_action', 'a11y.footer_links', 'a11y.footer_social', 'a11y.footer_social_link',
  'a11y.landing_qr_link',
  'a11y.language_selector', 'a11y.main_content', 'a11y.main_navigation', 'a11y.skip_to_content',
  'contact.call', 'contact.email', 'contact.open_chat',
  'contact.request_estimate', 'contact.send_message', 'contact.unavailable', 'contact.whatsapp',
  'error.locale_unavailable', 'error.site_unavailable', 'locale.current', 'locale.option_aria',
  'footer.platform_branding', 'landing_qr.open',
  'navigation.contact', 'navigation.gallery', 'navigation.home', 'navigation.owner',
  'navigation.services', 'reviews.average', 'reviews.count.many', 'reviews.count.one',
  'reviews.empty', 'reviews.list', 'reviews.rating', 'reviews.unavailable',
  'state.available', 'state.loading', 'state.unavailable',
]);
const PUBLIC_THEME_MANIFESTS: Readonly<Record<string, Readonly<{
  rendererKey: (typeof PROMO_PUBLIC_RENDERER_KEYS)[number];
  tokens: Readonly<Record<string, readonly string[]>>;
}>>> = Object.freeze({
  'promo.black-gold@1.0.0': Object.freeze({ rendererKey: 'promo.black-gold', tokens: Object.freeze({
    surface: ['obsidian'], text: ['ivory'], accent: ['heritage_gold', 'champagne_gold'],
    border: ['heritage_gold', 'champagne_gold'], focus: ['ivory_ring'], heading_font: ['editorial_serif'],
    body_font: ['humanist_sans'], radius: ['subtle', 'soft'], shadow: ['ambient', 'lifted'],
    density: ['comfortable', 'compact'], motion: ['subtle', 'reduced'],
  }) }),
  'promo.minimal@1.0.0': Object.freeze({ rendererKey: 'promo.minimal', tokens: Object.freeze({
    surface: ['porcelain'], text: ['ink'], accent: ['cobalt'], border: ['mist'], focus: ['cobalt_ring'],
    heading_font: ['geometric_sans'], body_font: ['clean_sans'], radius: ['crisp'], shadow: ['none'],
    density: ['airy'], motion: ['subtle', 'reduced'],
  }) }),
  'promo.artisan@1.0.0': Object.freeze({ rendererKey: 'promo.artisan', tokens: Object.freeze({
    surface: ['parchment'], text: ['espresso'], accent: ['terracotta'], border: ['clay'], focus: ['espresso_ring'],
    heading_font: ['crafted_serif'], body_font: ['warm_sans'], radius: ['organic'], shadow: ['paper'],
    density: ['comfortable'], motion: ['subtle', 'reduced'],
  }) }),
  'promo.vibrant@1.0.0': Object.freeze({ rendererKey: 'promo.vibrant', tokens: Object.freeze({
    surface: ['midnight'], text: ['white'], accent: ['coral'], border: ['electric_blue'], focus: ['lime_ring'],
    heading_font: ['display_sans'], body_font: ['modern_sans'], radius: ['bold'], shadow: ['neon'],
    density: ['energetic'], motion: ['expressive', 'reduced'],
  }) }),
  'promo.professional@1.0.0': Object.freeze({ rendererKey: 'promo.professional', tokens: Object.freeze({
    surface: ['navy'], text: ['white'], accent: ['sky'], border: ['steel'], focus: ['white_ring'],
    heading_font: ['corporate_sans'], body_font: ['clean_sans'], radius: ['structured'], shadow: ['precise'],
    density: ['compact'], motion: ['subtle', 'reduced'],
  }) }),
  'promo.portfolio@1.0.0': Object.freeze({ rendererKey: 'promo.portfolio', tokens: Object.freeze({
    surface: ['charcoal'], text: ['white'], accent: ['sand'], border: ['graphite'], focus: ['white_ring'],
    heading_font: ['gallery_display'], body_font: ['modern_sans'], radius: ['minimal'], shadow: ['cinematic'],
    density: ['image_first'], motion: ['cinematic', 'reduced'],
  }) }),
});

type JsonRecord = Record<string, any>;

export type PromoPublicSection = Readonly<{
  key: string;
  type: string;
  variant: 'default';
  config: Readonly<JsonRecord>;
  media_use_keys: readonly string[];
}>;

export type PromoPublicImageSource = Readonly<{
  key: string;
  width: number;
  height: number;
  url: string;
}>;

export type PromoPublicImageDelivery = Readonly<{
  contract: typeof MEDIA_DELIVERY_CONTRACT;
  mime: 'image/webp';
  src: string;
  srcset: readonly PromoPublicImageSource[];
  sizes: string;
  loading: 'eager' | 'lazy';
  fetch_priority: 'high' | 'auto';
  decoding: 'async';
}>;

export type PromoPublicVideoDelivery = Readonly<{
  contract: typeof MEDIA_DELIVERY_CONTRACT;
  mime: 'video/mp4' | 'video/webm';
  src: string;
  preload: 'none';
  controls_required: true;
  autoplay: false;
  plays_inline: true;
  reduced_motion: 'poster';
  save_data: 'poster';
  poster: PromoPublicImageDelivery;
}>;

type PromoPublicMediaBase = Readonly<{
  key: string;
  purpose: string;
  width: number;
  height: number;
  duration_ms: number;
  accessibility: Readonly<{ alt: string; decorative: boolean }>;
}>;

export type PromoPublicMedia =
  | (PromoPublicMediaBase & Readonly<{ kind: 'image'; delivery: PromoPublicImageDelivery }>)
  | (PromoPublicMediaBase & Readonly<{ kind: 'video'; delivery: PromoPublicVideoDelivery }>);

export type PromoPublicStoreReview = Readonly<{
  rating: number;
  name: string;
  comment: string;
  date: string;
}>;

export type PromoPublicStoreRating = Readonly<{
  contract: 'promo.store-rating.v1';
  enabled: boolean;
  summary: Readonly<{ average: number; count: number }>;
  reviews: readonly PromoPublicStoreReview[];
}>;

export type PromoPublicContactAction = Readonly<{
  contract: typeof CONTACT_ACTION_CONTRACT;
  available: boolean;
  action: Readonly<{
    key: string;
    type: 'whatsapp' | 'phone' | 'email';
    label: string;
    aria_label: string;
    href: string;
  }> | null;
}>;

export type PromoPublicFooterSection = Readonly<{
  key: string;
  navigation_label: string;
  social_label: string;
  navigation_links: readonly Readonly<{ section_key: string; label: string; href: string }>[];
  social_links: readonly Readonly<{
    network: 'instagram' | 'facebook' | 'linkedin' | 'youtube';
    label: string;
    aria_label: string;
    href: string;
  }>[];
  branding: Readonly<{ label: string; name: typeof RESERVED_FOOTER_BRAND }>;
}>;

export type PromoPublicFooter = Readonly<{
  contract: typeof FOOTER_CONTRACT;
  sections: readonly PromoPublicFooterSection[];
}>;

export type PromoPublicLandingQrLink = Readonly<{
  contract: typeof LANDING_QR_LINK_CONTRACT;
  enabled: boolean;
  link: Readonly<{ label: string; aria_label: string; href: string }> | null;
}>;

export type PromoPublicSeoImage = Readonly<{
  url: string;
  width: number;
  height: number;
  alt: string;
  type: 'image/webp';
}>;

export type PromoPublicSeo = Readonly<{
  contract: typeof PROMO_PUBLIC_SEO_CONTRACT;
  canonical_url: string;
  sitemap_url: string;
  alternates: readonly Readonly<{ locale: string; url: string }>[];
  x_default: string;
  open_graph: Readonly<{
    type: 'website';
    url: string;
    title: string;
    description: string;
    site_name: string;
    locale: string;
    alternate_locales: readonly string[];
    image: PromoPublicSeoImage | null;
  }>;
  twitter: Readonly<{
    card: 'summary' | 'summary_large_image';
    title: string;
    description: string;
    image: string;
    image_alt: string;
  }>;
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
  theme: Readonly<{
    theme_id: string;
    version: string;
    renderer_key: (typeof PROMO_PUBLIC_RENDERER_KEYS)[number];
    tokens: Readonly<Record<string, string>>;
  }>;
  section_order: readonly string[];
  sections: readonly PromoPublicSection[];
  media: readonly PromoPublicMedia[];
  contact: Readonly<JsonRecord>;
  contact_action: PromoPublicContactAction;
  footer: PromoPublicFooter;
  content: Readonly<JsonRecord>;
  adapters: Readonly<JsonRecord>;
  store_rating: PromoPublicStoreRating;
  landing_qr_link: PromoPublicLandingQrLink;
}>;

export type PromoPublicShellResult = Readonly<{
  route: Readonly<{ source: 'platform' | 'custom'; action: 'serve' | 'redirect'; location?: string }>;
  profile?: PromoPublicProfile;
  seo?: PromoPublicSeo;
  response: Readonly<{ cacheKey: string; contentLanguage: string; setCookie: string; vary: string }>;
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

function publicThemeRenderer(themeId: string, version: string) {
  return PUBLIC_THEME_MANIFESTS[`${themeId}@${version}`]?.rendererKey
    || fail('promo_public_renderer_unavailable', 503);
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

function decodedCanonicalComponent(value: string, max: number) {
  let decoded = '';
  try { decoded = decodeURIComponent(value); } catch (_) { fail(); }
  if (encodeURIComponent(decoded) !== value) fail();
  return safeText(decoded, max, true);
}

function safeContactHref(type: string, value: unknown) {
  const href = safeText(value, 4096, true);
  if (type === 'phone') {
    const phone = href.slice(4);
    if (!href.startsWith('tel:') || !E164_PATTERN.test(phone)) fail();
    return href;
  }
  if (type === 'whatsapp') {
    const match = href.match(/^https:\/\/wa\.me\/([1-9][0-9]{7,14})(?:\?text=(.+))?$/);
    if (!match) fail();
    if (match[2]) decodedCanonicalComponent(match[2], 1000);
    return href;
  }
  if (type === 'email') {
    const match = href.match(/^mailto:([^?]+)(?:\?body=(.+))?$/);
    if (!match) fail();
    let address = '';
    try { address = decodeURIComponent(match[1]); } catch (_) { fail(); }
    if (safeText(address, 254, true) !== address || !EMAIL_PATTERN.test(address)
      || encodeURIComponent(address).replace(/%40/gi, '@') !== match[1]) fail();
    if (match[2]) decodedCanonicalComponent(match[2], 1000);
    return href;
  }
  return fail();
}

function normalizeContactAction(value: unknown): PromoPublicContactAction {
  const compiled = exactRecord(value, ['contract', 'available', 'action']);
  if (compiled.contract !== CONTACT_ACTION_CONTRACT || typeof compiled.available !== 'boolean') fail();
  if (!compiled.available) {
    if (compiled.action !== null) fail();
    return { contract: CONTACT_ACTION_CONTRACT, available: false, action: null };
  }
  const action = exactRecord(compiled.action, ['key', 'type', 'label', 'aria_label', 'href']);
  if (!EXECUTABLE_CONTACT_TYPES.has(action.type)) fail();
  const type = action.type as 'whatsapp' | 'phone' | 'email';
  return {
    contract: CONTACT_ACTION_CONTRACT,
    available: true,
    action: {
      key: safePattern(action.key, KEY_PATTERN),
      type,
      label: safeText(action.label, 80, true),
      aria_label: safeText(action.aria_label, 160, true),
      href: safeContactHref(type, action.href),
    },
  };
}

function normalizeLandingQrLink(
  value: unknown,
  adapterEnabled: boolean,
  messages: Readonly<Record<string, string>>,
  business: string,
): PromoPublicLandingQrLink {
  const compiled = exactRecord(value, ['contract', 'enabled', 'link']);
  if (compiled.contract !== LANDING_QR_LINK_CONTRACT || typeof compiled.enabled !== 'boolean') fail();
  if (!compiled.enabled) {
    if (compiled.link !== null) fail();
    return { contract: LANDING_QR_LINK_CONTRACT, enabled: false, link: null };
  }
  if (!adapterEnabled) fail();
  const link = exactRecord(compiled.link, ['label', 'aria_label', 'href']);
  const expectedLabel = messages['landing_qr.open'];
  const expectedAria = formatSystemMessage(messages['a11y.landing_qr_link'], { business });
  if (link.label !== expectedLabel || link.aria_label !== expectedAria) fail();
  const href = safeText(link.href, 420, true);
  let parsed: URL;
  try { parsed = new URL(href); } catch (_) { fail(); }
  if (parsed.origin !== LANDING_QR_PLATFORM_ORIGIN || parsed.username || parsed.password || parsed.port
    || parsed.search || parsed.hash
    || !/^\/t\/[a-z0-9]+(?:-[a-z0-9]+)*\/links$/.test(parsed.pathname)
    || parsed.toString() !== href) fail();
  return {
    contract: LANDING_QR_LINK_CONTRACT,
    enabled: true,
    link: {
      label: safeText(link.label, 80, true),
      aria_label: safeText(link.aria_label, 240, true),
      href,
    },
  };
}

function safePublicMediaPath(value: unknown, input: {
  slug: string;
  key: string;
  variant: string;
  extension: 'webp' | 'mp4' | 'webm';
}) {
  const path = safeText(value, 420, true);
  const variant = input.variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expected = new RegExp(
    `^/api/pz/promo/public/v1/sites/${input.slug}/media/${input.key}/[a-f0-9]{64}/${variant}\\.${input.extension}$`,
  );
  if (!expected.test(path)) fail();
  return path;
}

function normalizeImageDelivery(value: unknown, input: {
  slug: string;
  key: string;
  purpose: string;
  priority: boolean;
  poster?: boolean;
  width?: number;
  height?: number;
}): PromoPublicImageDelivery {
  const delivery = exactRecord(value, [
    'contract', 'mime', 'src', 'srcset', 'sizes', 'loading', 'fetch_priority', 'decoding',
  ]);
  const policy = MEDIA_PURPOSE_POLICIES[input.purpose];
  if (!policy || delivery.contract !== MEDIA_DELIVERY_CONTRACT || delivery.mime !== 'image/webp'
    || delivery.sizes !== policy.sizes || delivery.decoding !== 'async'
    || delivery.loading !== (input.priority ? 'eager' : 'lazy')
    || delivery.fetch_priority !== (input.priority ? 'high' : 'auto')
    || !Array.isArray(delivery.srcset) || !delivery.srcset.length || delivery.srcset.length > 4) fail();
  const srcset = delivery.srcset.map((raw: unknown, index: number) => {
    const source = exactRecord(raw, ['key', 'width', 'height', 'url']);
    const key = safePattern(source.key, MEDIA_VARIANT_PATTERN);
    const width = safeInteger(source.width, 1, 4096);
    const height = safeInteger(source.height, 1, 4096);
    const last = index === delivery.srcset.length - 1;
    if ((last && key !== 'original') || (!last && key !== `w${width}`)
      || (!last && !policy.widths.includes(width))) fail();
    return {
      key,
      width,
      height,
      url: safePublicMediaPath(source.url, {
        slug: input.slug,
        key: input.key,
        variant: `${input.poster ? 'poster-' : ''}${key}`,
        extension: 'webp',
      }),
    };
  });
  if (srcset.some((source, index) => index > 0 && source.width <= srcset[index - 1].width)) fail();
  const original = srcset[srcset.length - 1];
  if (original.width < policy.minWidth || original.height < policy.minHeight
    || original.width > policy.maxWidth || original.height > policy.maxHeight
    || (input.width !== undefined && original.width !== input.width)
    || (input.height !== undefined && original.height !== input.height)
    || srcset.some((source) => source.key !== 'original'
      && source.height !== Math.max(1, Math.round((original.height * source.width) / original.width)))) fail();
  const src = safePublicMediaPath(delivery.src, {
    slug: input.slug,
    key: input.key,
    variant: `${input.poster ? 'poster-' : ''}original`,
    extension: 'webp',
  });
  if (src !== original.url) fail();
  return {
    contract: MEDIA_DELIVERY_CONTRACT,
    mime: 'image/webp',
    src,
    srcset,
    sizes: policy.sizes,
    loading: input.priority ? 'eager' : 'lazy',
    fetch_priority: input.priority ? 'high' : 'auto',
    decoding: 'async',
  };
}

function normalizePublicMedia(value: unknown, slug: string, priorityMediaKey: string): PromoPublicMedia {
  const item = exactRecord(value, [
    'key', 'purpose', 'kind', 'width', 'height', 'duration_ms', 'delivery', 'accessibility',
  ]);
  const key = safePattern(item.key, KEY_PATTERN);
  const purpose = safePattern(item.purpose, KEY_PATTERN);
  const policy = MEDIA_PURPOSE_POLICIES[purpose];
  const width = safeInteger(item.width, 1, 4096);
  const height = safeInteger(item.height, 1, 4096);
  const duration = safeInteger(item.duration_ms, 0, 30 * 60 * 1000);
  const accessibility = exactRecord(item.accessibility, ['alt', 'decorative']);
  const alt = safeText(accessibility.alt, 300);
  const decorative = accessibility.decorative;
  if (!policy || !MEDIA_PURPOSES.has(purpose) || typeof decorative !== 'boolean'
    || (decorative && alt) || (!decorative && !alt)
    || width < policy.minWidth || height < policy.minHeight
    || width > policy.maxWidth || height > policy.maxHeight) fail();
  const priority = Boolean(priorityMediaKey) && key === priorityMediaKey;
  if (item.kind === 'image') {
    if (duration !== 0) fail();
    return {
      key, purpose, kind: 'image', width, height, duration_ms: 0,
      accessibility: { alt, decorative },
      delivery: normalizeImageDelivery(item.delivery, { slug, key, purpose, priority, width, height }),
    };
  }
  if (item.kind !== 'video' || duration === 0 || !['hero', 'gallery'].includes(purpose)) fail();
  const delivery = exactRecord(item.delivery, [
    'contract', 'mime', 'src', 'preload', 'controls_required', 'autoplay', 'plays_inline',
    'reduced_motion', 'save_data', 'poster',
  ]);
  if (delivery.contract !== MEDIA_DELIVERY_CONTRACT || !['video/mp4', 'video/webm'].includes(delivery.mime)
    || delivery.preload !== 'none' || delivery.controls_required !== true || delivery.autoplay !== false
    || delivery.plays_inline !== true || delivery.reduced_motion !== 'poster' || delivery.save_data !== 'poster') fail();
  const mime = delivery.mime as 'video/mp4' | 'video/webm';
  const extension = mime === 'video/webm' ? 'webm' : 'mp4';
  return {
    key, purpose, kind: 'video', width, height, duration_ms: duration,
    accessibility: { alt, decorative },
    delivery: {
      contract: MEDIA_DELIVERY_CONTRACT,
      mime,
      src: safePublicMediaPath(delivery.src, { slug, key, variant: 'original', extension }),
      preload: 'none',
      controls_required: true,
      autoplay: false,
      plays_inline: true,
      reduced_motion: 'poster',
      save_data: 'poster',
      poster: normalizeImageDelivery(delivery.poster, {
        slug, key, purpose: 'video_poster', priority, poster: true,
      }),
    },
  };
}

function normalizeSection(value: unknown): PromoPublicSection {
  const section = exactRecord(value, ['key', 'type', 'variant', 'config', 'media_use_keys']);
  const type = safePattern(section.type, KEY_PATTERN);
  if (!SECTION_TYPES.has(type) || section.variant !== 'default' || !isRecord(section.config)
    || !Array.isArray(section.media_use_keys) || section.media_use_keys.length > 30) fail();
  const mediaUseKeys = section.media_use_keys.map((item: unknown) => safePattern(item, KEY_PATTERN));
  if (new Set(mediaUseKeys).size !== mediaUseKeys.length) fail();
  const list = (raw: unknown, maximum = 50, empty = false) => {
    if (!Array.isArray(raw) || raw.length > maximum) fail();
    const result = raw.map((item) => {
      if (empty && item === '') return '';
      return safePattern(item, KEY_PATTERN);
    });
    if (new Set(result).size !== result.length && !empty) fail();
    return result;
  };
  const optionalKey = (raw: unknown) => raw === '' ? '' : safePattern(raw, KEY_PATTERN);
  const config: JsonRecord = {};
  if (type === 'hero') {
    const source = exactRecord(section.config, ['media_use_key', 'action_key']);
    config.media_use_key = optionalKey(source.media_use_key);
    config.action_key = optionalKey(source.action_key);
  } else if (type === 'services') {
    const source = exactRecord(section.config, ['item_keys', 'gallery_keys']);
    config.item_keys = list(source.item_keys);
    config.gallery_keys = list(source.gallery_keys, 50, true);
    if (config.item_keys.length !== config.gallery_keys.length || mediaUseKeys.length) fail();
  } else if (type === 'featured_work') {
    const source = exactRecord(section.config, ['item_keys']);
    config.item_keys = list(source.item_keys);
    if (config.item_keys.length || mediaUseKeys.length) fail();
  } else if (type === 'gallery') {
    const source = exactRecord(section.config, ['item_keys', 'cover_media_use_key', 'items']);
    config.item_keys = list(source.item_keys);
    config.cover_media_use_key = optionalKey(source.cover_media_use_key);
    if (!Array.isArray(source.items) || source.items.length > 50) fail();
    config.items = source.items.map((raw: unknown) => {
      const item = exactRecord(raw, ['key', 'media_use_keys', 'featured', 'visible']);
      if (typeof item.featured !== 'boolean' || typeof item.visible !== 'boolean') fail();
      const itemMedia = list(item.media_use_keys, 3);
      return {
        key: safePattern(item.key, KEY_PATTERN),
        media_use_keys: itemMedia,
        featured: item.featured,
        visible: item.visible,
      };
    });
    if (config.items.length !== config.item_keys.length
      || config.items.some((item: JsonRecord, index: number) => item.key !== config.item_keys[index])) fail();
    const configuredMedia: string[] = [];
    const addMedia = (key: string) => { if (key && !configuredMedia.includes(key)) configuredMedia.push(key); };
    addMedia(config.cover_media_use_key);
    config.items.forEach((item: JsonRecord) => item.media_use_keys.forEach(addMedia));
    if (configuredMedia.length !== mediaUseKeys.length
      || configuredMedia.some((key, index) => key !== mediaUseKeys[index])) fail();
  } else if (type === 'owner') {
    const source = exactRecord(section.config, ['media_use_key']);
    config.media_use_key = optionalKey(source.media_use_key);
  } else if (type === 'contact') {
    const source = exactRecord(section.config, ['action_keys']);
    config.action_keys = list(source.action_keys, 32);
  } else if (type === 'footer') {
    const source = subsetRecord(section.config, ['navigation_section_keys', 'social_profiles']);
    config.navigation_section_keys = list(source.navigation_section_keys || [], 8);
    if (!Array.isArray(source.social_profiles) || source.social_profiles.length > 4) fail();
    config.social_profiles = source.social_profiles.map((item: unknown) => {
      const profile = exactRecord(item, ['network', 'handle']);
      const network = safePattern(profile.network, TOKEN_PATTERN);
      const handle = safeText(profile.handle, 100, true);
      if (!FOOTER_SOCIALS[network]?.handle.test(handle)) fail();
      return { network, handle };
    });
    if (new Set(config.social_profiles.map((item: JsonRecord) => item.network)).size !== config.social_profiles.length) fail();
  } else {
    exactRecord(section.config, []);
  }
  return {
    key: safePattern(section.key, KEY_PATTERN),
    type,
    variant: 'default',
    config,
    media_use_keys: mediaUseKeys,
  };
}

function formatSystemMessage(template: unknown, values: Readonly<Record<string, string>>) {
  const message = safeText(template, 240, true);
  const expected = Array.from(new Set((message.match(/\{[a-z_]+\}/g) || [])
    .map((item) => item.slice(1, -1)))).sort();
  const actual = Object.keys(values).sort();
  if (expected.length !== actual.length || expected.some((key, index) => key !== actual[index])) fail();
  return message.replace(/\{([a-z_]+)\}/g, (_, key) => safeText(values[key], 160, true));
}

function normalizeFooter(
  value: unknown,
  sections: readonly PromoPublicSection[],
  content: JsonRecord,
  messages: Readonly<Record<string, string>>,
): PromoPublicFooter {
  const footer = exactRecord(value, ['contract', 'sections']);
  if (footer.contract !== FOOTER_CONTRACT || !Array.isArray(footer.sections)) fail();
  const configured = sections.filter((section) => section.type === 'footer');
  if (footer.sections.length !== configured.length) fail();
  const sectionByKey = new Map(sections.map((section) => [section.key, section]));
  const business = safeText(content.identity.name, 140, true);
  const normalizedSections = footer.sections.map((raw: unknown, index: number) => {
    const entry = exactRecord(raw, [
      'key', 'navigation_label', 'social_label', 'navigation_links', 'social_links', 'branding',
    ]);
    const section = configured[index];
    if (!section || entry.key !== section.key || !Array.isArray(entry.navigation_links)
      || !Array.isArray(entry.social_links)) fail();
    const navigationKeys = Array.isArray(section.config.navigation_section_keys)
      ? section.config.navigation_section_keys : [];
    const socialProfiles = Array.isArray(section.config.social_profiles)
      ? section.config.social_profiles : [];
    if (entry.navigation_links.length !== navigationKeys.length
      || entry.social_links.length !== socialProfiles.length) fail();
    const navigationLinks = entry.navigation_links.map((linkValue: unknown, linkIndex: number) => {
      const link = exactRecord(linkValue, ['section_key', 'label', 'href']);
      const sectionKey = navigationKeys[linkIndex];
      const target = sectionByKey.get(sectionKey);
      const label = safeText(link.label, 80, true);
      if (!target || target.type === 'footer' || link.section_key !== sectionKey
        || label !== content.navigation[sectionKey]
        || link.href !== `#promo-section-${sectionKey}`) fail();
      return { section_key: sectionKey, label, href: link.href };
    });
    const socialLinks = entry.social_links.map((linkValue: unknown, linkIndex: number) => {
      const link = exactRecord(linkValue, ['network', 'label', 'aria_label', 'href']);
      const source = socialProfiles[linkIndex];
      const definition = source && FOOTER_SOCIALS[source.network];
      if (!definition || link.network !== source.network || link.label !== definition.label
        || link.href !== definition.href(source.handle)
        || link.aria_label !== formatSystemMessage(messages['a11y.footer_social_link'], {
          business, network: definition.label,
        })) fail();
      return {
        network: source.network as 'instagram' | 'facebook' | 'linkedin' | 'youtube',
        label: definition.label,
        aria_label: safeText(link.aria_label, 240, true),
        href: link.href,
      };
    });
    const branding = exactRecord(entry.branding, ['label', 'name']);
    if (branding.label !== messages['footer.platform_branding'] || branding.name !== RESERVED_FOOTER_BRAND) fail();
    const navigationLabel = formatSystemMessage(messages['a11y.footer_links'], { business });
    const socialLabel = formatSystemMessage(messages['a11y.footer_social'], { business });
    if (entry.navigation_label !== navigationLabel || entry.social_label !== socialLabel) fail();
    return {
      key: section.key,
      navigation_label: navigationLabel,
      social_label: socialLabel,
      navigation_links: navigationLinks,
      social_links: socialLinks,
      branding: { label: safeText(branding.label, 160, true), name: RESERVED_FOOTER_BRAND },
    };
  });
  return { contract: FOOTER_CONTRACT, sections: normalizedSections };
}

function normalizeContent(value: unknown, sections: readonly PromoPublicSection[], mediaKeys: readonly string[], actionKeys: readonly string[]) {
  const content = exactRecord(value, ['identity', 'navigation', 'sections', 'contact', 'media_alt', 'seo']);
  const sectionKeys = sections.map((section) => section.key);
  const identity = optionalTextMap(content.identity, ['name', 'slogan', 'summary', 'owner_name', 'owner_bio'], {
    name: 140, slogan: 120, summary: 600, owner_name: 140, owner_bio: 4000,
  });
  if (!identity.name) fail();
  const navigation = exactStringMap(content.navigation, sectionKeys, 80);
  const localizedSections = exactRecord(content.sections, sectionKeys);
  const normalizedSections: JsonRecord = {};
  for (const section of sections) {
    const fieldsByType: Readonly<Record<string, readonly string[]>> = {
      hero: ['heading', 'summary'], services: ['heading', 'summary', 'items'],
      featured_work: ['heading', 'summary'], gallery: ['heading', 'summary', 'items'],
      owner: ['heading', 'name', 'bio'], store_rating: ['heading'],
      contact: ['heading', 'summary'], footer: ['heading', 'summary', 'text'],
    };
    const fields = fieldsByType[section.type] || [];
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

function normalizeStoreRating(value: unknown, adapterEnabled: boolean, sectionAvailable: boolean): PromoPublicStoreRating {
  const rating = exactRecord(value, ['contract', 'enabled', 'summary', 'reviews']);
  const summary = exactRecord(rating.summary, ['average', 'count']);
  if (rating.contract !== 'promo.store-rating.v1' || typeof rating.enabled !== 'boolean'
    || !Number.isFinite(summary.average) || summary.average < 0 || summary.average > 5
    || Math.round(Number(summary.average) * 10) / 10 !== summary.average
    || !Number.isSafeInteger(summary.count) || summary.count < 0 || summary.count > 1_000_000
    || !Array.isArray(rating.reviews) || rating.reviews.length > 12) fail();
  const normalizedReviews = rating.reviews.map((raw: unknown) => {
    const review = exactRecord(raw, ['rating', 'name', 'comment', 'date']);
    const date = safeText(review.date, 10);
    let validDate = !date;
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      try { validDate = new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date; }
      catch (_) { validDate = false; }
    }
    if (!Number.isSafeInteger(review.rating) || review.rating < 1 || review.rating > 5
      || !validDate) fail();
    return {
      rating: review.rating,
      name: safeText(review.name, 120, true),
      comment: safeText(review.comment, 1200),
      date,
    };
  });
  if (rating.enabled && (!adapterEnabled || !sectionAvailable)) fail();
  if (!rating.enabled && (summary.average !== 0 || summary.count !== 0 || normalizedReviews.length)) fail();
  if (rating.enabled && ((summary.count === 0 && summary.average !== 0)
    || (summary.count > 0 && (summary.average < 1 || summary.average > 5)))) fail();
  return {
    contract: 'promo.store-rating.v1',
    enabled: rating.enabled,
    summary: { average: summary.average, count: summary.count },
    reviews: normalizedReviews,
  };
}

function normalizeProfile(value: unknown, source: 'platform' | 'custom'): PromoPublicProfile {
  const profile = exactRecord(value, [
    'ok', 'contract', 'site', 'system', 'locale', 'selector', 'theme', 'section_order', 'sections',
    'media', 'contact', 'contact_action', 'footer', 'content', 'adapters', 'store_rating',
    'landing_qr_link',
  ]);
  if (profile.ok !== true || profile.contract !== PROMO_PUBLIC_LOCALIZED_CONTRACT) fail();
  const site = exactRecord(profile.site, ['public_slug']);
  const system = exactRecord(profile.system, ['catalog_version', 'messages']);
  if (system.catalog_version !== 'promo.system.v1') fail();
  const systemMessages = exactStringMap(system.messages, SYSTEM_MESSAGE_KEYS, 240);
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
  const themeId = safePattern(theme.theme_id, THEME_PATTERN);
  const themeVersion = safePattern(theme.version, VERSION_PATTERN);
  const rendererKey = publicThemeRenderer(themeId, themeVersion);
  const themeManifest = PUBLIC_THEME_MANIFESTS[`${themeId}@${themeVersion}`];
  if (!themeManifest || themeManifest.rendererKey !== rendererKey) fail('promo_public_renderer_unavailable', 503);
  const tokens = exactRecord(theme.tokens, Object.keys(themeManifest.tokens));
  const normalizedTokens = Object.fromEntries(Object.entries(tokens).map(([key, raw]) => {
    const token = safePattern(raw, TOKEN_PATTERN);
    if (!themeManifest.tokens[key]?.includes(token)) fail();
    return [key, token];
  }));
  if (themeId === PROMO_BLACK_GOLD_THEME_ID && normalizedTokens.accent !== normalizedTokens.border) fail();
  if (!Array.isArray(profile.sections) || profile.sections.length > 64) fail();
  const sections = profile.sections.map(normalizeSection);
  if (new Set(sections.map((section) => section.key)).size !== sections.length) fail();
  if (!Array.isArray(profile.section_order) || profile.section_order.length !== sections.length) fail();
  const sectionOrder = profile.section_order.map((item: unknown) => safePattern(item, KEY_PATTERN));
  if (sectionOrder.some((key, index) => key !== sections[index]?.key)) fail();
  const firstHero = sections.find((section) => section.type === 'hero');
  const priorityMediaKey = firstHero
    ? String(firstHero.config.media_use_key || firstHero.media_use_keys[0] || '')
    : '';
  if (!Array.isArray(profile.media) || profile.media.length > 512) fail();
  const media = profile.media.map((raw: unknown) => normalizePublicMedia(raw, slug, priorityMediaKey));
  const mediaKeys = media.map((item) => item.key);
  if (new Set(mediaKeys).size !== mediaKeys.length) fail();
  const contact = exactRecord(profile.contact, [
    'enabled', 'primary_action_key', 'secondary_action_keys', 'actions', 'logo_media_use_key', 'qr_media_use_key',
  ]);
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
    logo_media_use_key: contact.logo_media_use_key === '' ? '' : safePattern(contact.logo_media_use_key, KEY_PATTERN),
    qr_media_use_key: contact.qr_media_use_key === '' ? '' : safePattern(contact.qr_media_use_key, KEY_PATTERN),
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
    const allowedPurposes = SECTION_MEDIA_PURPOSES[section.type] || [];
    const referencedMedia = new Set([...section.media_use_keys, ...(configMedia ? [configMedia] : [])]);
    if ([...referencedMedia].some((key) => {
      const item = media.find((candidate) => candidate.key === key);
      return !item || !allowedPurposes.includes(item.purpose);
    })) fail();
  }
  if (normalizedContact.qr_media_use_key) {
    const qrMedia = media.find((item) => item.key === normalizedContact.qr_media_use_key);
    if (!qrMedia || qrMedia.kind !== 'image' || qrMedia.purpose !== 'qr') fail();
  }
  if (normalizedContact.logo_media_use_key) {
    const logoMedia = media.find((item) => item.key === normalizedContact.logo_media_use_key);
    if (!logoMedia || logoMedia.kind !== 'image' || logoMedia.purpose !== 'logo') fail();
  }
  const sectionsByKey = new Map(sections.map((section) => [section.key, section]));
  for (const section of sections.filter((item) => item.type === 'services')) {
    if (section.config.gallery_keys.some((galleryKey: string) => {
      if (!galleryKey) return false;
      const gallery = sectionsByKey.get(galleryKey);
      return !gallery || gallery.type !== 'gallery';
    })) fail();
  }
  const normalizedContent = normalizeContent(profile.content, sections, mediaKeys, actionKeys);
  const contactAction = normalizeContactAction(profile.contact_action);
  if (contactAction.available) {
    const action = contactAction.action;
    const sourceAction = actions.find((candidate) => candidate.key === action?.key);
    const sourceCopy = action ? normalizedContent.contact[action.key] : null;
    if (!action || !normalizedContact.enabled || action.key !== normalizedContact.primary_action_key
      || !sourceAction || sourceAction.type !== action.type || !sourceCopy
      || sourceCopy.label !== action.label || sourceCopy.aria_label !== action.aria_label) fail();
  }
  for (const section of sections.filter((item) => ['services', 'gallery'].includes(item.type))) {
    const configuredKeys = section.config.item_keys;
    const localizedItems = normalizedContent.sections[section.key]?.items;
    if (!Array.isArray(configuredKeys) || !Array.isArray(localizedItems)
      || configuredKeys.length !== localizedItems.length
      || configuredKeys.some((key: string, index: number) => localizedItems[index]?.key !== key)
      || new Set(configuredKeys).size !== configuredKeys.length) fail();
  }
  if (media.some((item) => {
    const localized = normalizedContent.media_alt[item.key];
    return !localized || localized.alt !== item.accessibility.alt
      || localized.decorative !== item.accessibility.decorative;
  })) fail();
  const footer = normalizeFooter(profile.footer, sections, normalizedContent, systemMessages);
  const adapters = exactRecord(profile.adapters, ['store_rating', 'landing_qr_link']);
  const rating = exactRecord(adapters.store_rating, ['enabled']);
  const landing = exactRecord(adapters.landing_qr_link, ['enabled']);
  if (typeof rating.enabled !== 'boolean' || typeof landing.enabled !== 'boolean') fail();
  const storeRating = normalizeStoreRating(
    profile.store_rating,
    rating.enabled,
    sections.some((section) => section.type === 'store_rating'),
  );
  const landingQrLink = normalizeLandingQrLink(
    profile.landing_qr_link,
    landing.enabled,
    systemMessages,
    safeText(normalizedContent.identity.name, 140, true),
  );
  return {
    site: { public_slug: slug },
    system: { catalog_version: 'promo.system.v1', messages: systemMessages },
    locale: {
      effective, default: defaultLocale, source: locale.source, lang: effective,
      direction: locale.direction, canonical_path: expectedCanonical,
    },
    selector: { label: safeText(selector.label, 80, true), options },
    theme: {
      theme_id: themeId,
      version: themeVersion,
      renderer_key: rendererKey,
      tokens: normalizedTokens,
    },
    section_order: sectionOrder,
    sections,
    media,
    contact: normalizedContact,
    contact_action: contactAction,
    footer,
    content: normalizedContent,
    adapters: { store_rating: { enabled: rating.enabled }, landing_qr_link: { enabled: landing.enabled } },
    store_rating: storeRating,
    landing_qr_link: landingQrLink,
  };
}

function normalizedSeoUrl(value: unknown) {
  const text = safeText(value, 500, true);
  let parsed: URL;
  try { parsed = new URL(text); } catch (_) { fail(); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port
    || parsed.search || parsed.hash || parsed.origin + parsed.pathname !== text
    || !/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(parsed.hostname)
    || parsed.hostname.includes('..')) fail();
  return parsed;
}

function normalizePageSeo(value: unknown, profile: PromoPublicProfile, source: 'platform' | 'custom'): PromoPublicSeo {
  const seo = exactRecord(value, [
    'contract', 'canonical_url', 'sitemap_url', 'alternates', 'x_default', 'open_graph', 'twitter',
  ]);
  if (seo.contract !== PROMO_PUBLIC_SEO_CONTRACT) fail();
  const canonical = normalizedSeoUrl(seo.canonical_url);
  const origin = source === 'platform' ? PROMO_PLATFORM_ORIGIN : canonical.origin;
  if (source === 'platform' && canonical.origin !== PROMO_PLATFORM_ORIGIN) fail();
  if (canonical.pathname !== profile.locale.canonical_path) fail();
  if (!Array.isArray(seo.alternates) || seo.alternates.length !== profile.selector.options.length) fail();
  const alternates = seo.alternates.map((raw: unknown, index: number) => {
    const entry = exactRecord(raw, ['locale', 'url']);
    const locale = canonicalLocale(entry.locale);
    const expectedOption = profile.selector.options[index];
    const url = normalizedSeoUrl(entry.url);
    const expectedPath = source === 'platform'
      ? `/promo/${profile.site.public_slug}/${locale}`
      : `/${locale}`;
    if (!expectedOption || expectedOption.locale !== locale || url.origin !== origin || url.pathname !== expectedPath) fail();
    return { locale, url: url.toString() };
  });
  const xDefault = normalizedSeoUrl(seo.x_default);
  const expectedDefault = alternates.find((entry) => entry.locale === profile.locale.default);
  if (!expectedDefault || xDefault.toString() !== expectedDefault.url) fail();
  const sitemap = normalizedSeoUrl(seo.sitemap_url);
  const expectedSitemapPath = source === 'platform'
    ? `/promo/${profile.site.public_slug}/sitemap.xml`
    : '/sitemap.xml';
  if (sitemap.origin !== origin || sitemap.pathname !== expectedSitemapPath) fail();
  const og = exactRecord(seo.open_graph, [
    'type', 'url', 'title', 'description', 'site_name', 'locale', 'alternate_locales', 'image',
  ]);
  const expectedSocialTitle = profile.content.seo.social_title || profile.content.seo.title;
  const expectedSocialDescription = profile.content.seo.social_description || profile.content.seo.description;
  const expectedAlternateLocales = alternates
    .filter((entry) => entry.locale !== profile.locale.effective)
    .map((entry) => entry.locale);
  if (og.type !== 'website' || og.url !== canonical.toString()
    || og.title !== expectedSocialTitle || og.description !== expectedSocialDescription
    || og.site_name !== profile.content.identity.name || og.locale !== profile.locale.effective
    || !Array.isArray(og.alternate_locales)
    || JSON.stringify(og.alternate_locales) !== JSON.stringify(expectedAlternateLocales)) fail();
  let image: PromoPublicSeoImage | null = null;
  if (og.image !== null) {
    const rawImage = exactRecord(og.image, ['url', 'width', 'height', 'alt', 'type']);
    const imageUrl = normalizedSeoUrl(rawImage.url);
    if (imageUrl.origin !== PROMO_PLATFORM_ORIGIN
      || !imageUrl.pathname.startsWith(`/api/pz/promo/public/v1/sites/${profile.site.public_slug}/media/`)
      || !imageUrl.pathname.endsWith('.webp') || rawImage.type !== 'image/webp') fail();
    image = {
      url: imageUrl.toString(),
      width: safeInteger(rawImage.width, 1, 4096),
      height: safeInteger(rawImage.height, 1, 4096),
      alt: safeText(rawImage.alt, 300, true),
      type: 'image/webp',
    };
  }
  const twitter = exactRecord(seo.twitter, ['card', 'title', 'description', 'image', 'image_alt']);
  const expectedCard = image ? 'summary_large_image' : 'summary';
  if (twitter.card !== expectedCard || twitter.title !== expectedSocialTitle
    || twitter.description !== expectedSocialDescription
    || twitter.image !== (image?.url || '') || twitter.image_alt !== (image?.alt || '')) fail();
  return {
    contract: PROMO_PUBLIC_SEO_CONTRACT,
    canonical_url: canonical.toString(),
    sitemap_url: sitemap.toString(),
    alternates,
    x_default: xDefault.toString(),
    open_graph: {
      type: 'website', url: canonical.toString(), title: expectedSocialTitle,
      description: expectedSocialDescription, site_name: profile.content.identity.name,
      locale: profile.locale.effective, alternate_locales: expectedAlternateLocales, image,
    },
    twitter: {
      card: expectedCard, title: expectedSocialTitle, description: expectedSocialDescription,
      image: image?.url || '', image_alt: image?.alt || '',
    },
  };
}

function normalizeEnvelope(value: unknown): Omit<PromoPublicShellResult, 'response'> {
  const hasProfile = isRecord(value) && Object.hasOwn(value, 'profile');
  const hasSeo = isRecord(value) && Object.hasOwn(value, 'seo');
  const envelope = exactRecord(value, ['ok', 'contract', 'route', ...(hasProfile ? ['profile'] : []), ...(hasSeo ? ['seo'] : [])]);
  if (envelope.ok !== true || envelope.contract !== PROMO_PUBLIC_SHELL_CONTRACT) fail();
  const route = exactRecord(envelope.route, ['source', 'action', ...(isRecord(envelope.route) && Object.hasOwn(envelope.route, 'location') ? ['location'] : [])]);
  if (!['platform', 'custom'].includes(route.source) || !['serve', 'redirect'].includes(route.action)) fail();
  if (route.action === 'redirect') {
    if (hasProfile || hasSeo) fail();
    return { route: { source: route.source, action: 'redirect', location: safeRedirect(route.location) } };
  }
  if (Object.hasOwn(route, 'location') || !hasProfile || !hasSeo) fail();
  const profile = normalizeProfile(envelope.profile, route.source);
  return {
    route: { source: route.source, action: 'serve' },
    profile,
    seo: normalizePageSeo(envelope.seo, profile, route.source),
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

export async function requestPromoPublicJson(input: {
  endpoint: string;
  request: Request;
  host?: string;
  fetcher?: typeof fetch;
}) {
  if (!/^\/api\/pz\/promo\/public\/v1\/[A-Za-z0-9/_-]+$/.test(input.endpoint)) {
    fail('promo_public_backend_unavailable', 503);
  }
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
  return body;
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
  const cacheContract = response.headers.get('x-pz-promo-cache-contract') || '';
  const rawCacheKey = response.headers.get('x-pz-promo-cache-key') || '';
  const cacheKey = cacheContract === PROMO_PUBLIC_CACHE_CONTRACT && /^[a-f0-9]{64}$/.test(rawCacheKey)
    ? rawCacheKey
    : '';
  return {
    ...normalized,
    response: {
      cacheKey,
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
  const host = promoRequestAuthority(request).authority;
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
  return isPromoPlatformHostRequest(request);
}

export function platformPromoPublicPath(pathname: string) {
  const match = String(pathname || '').match(
    /^\/promo\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/([A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*))?\/?$/,
  );
  return match
    ? { publicSlug: match[1], locale: match[2] || undefined }
    : null;
}

export function applyPromoPublicHeaders(response: Response, result?: PromoPublicShellResult) {
  applyPromoSecurityHeaders(response);
  const indexable = result?.route.action === 'serve' && Boolean(result.profile && result.seo);
  const safelyRevalidatable = indexable && response.status === 200
    && /^[a-f0-9]{64}$/.test(result?.response.cacheKey || '');
  response.headers.set(
    'Cache-Control',
    safelyRevalidatable
      ? 'private, no-cache, max-age=0, must-revalidate'
      : 'private, no-store, max-age=0',
  );
  response.headers.set('X-Robots-Tag', indexable ? 'index, follow' : 'noindex, nofollow, noarchive');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (indexable && result?.seo) response.headers.set('Link', `<${result.seo.sitemap_url}>; rel="sitemap"`);
  if (result?.response.contentLanguage) response.headers.set('Content-Language', result.response.contentLanguage);
  if (result?.response.setCookie) response.headers.append('Set-Cookie', result.response.setCookie);
  if (result?.response.vary) {
    const vary = [response.headers.get('Vary') || '', result.response.vary]
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter((value, index, values) => value && values.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index);
    if (vary.length) response.headers.set('Vary', vary.join(', '));
  }
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
