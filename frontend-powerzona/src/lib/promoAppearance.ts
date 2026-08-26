import { normalizePromoCmsDocument } from './promoCms.ts';

export const PROMO_APPEARANCE_CATALOG_CONTRACT = 'promo.theme.catalog.v1';
export const PROMO_APPEARANCE_CATALOG_API_PATH = '/api/admin/promo-appearance';
export const PROMO_APPEARANCE_DRAFT_API_PATH = '/api/admin/promo-cms';

const THEME_ID_PATTERN = /^promo\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const SEMVER_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const RENDERER_KEY_PATTERN = /^[a-z][a-z0-9._-]{0,79}$/;
const TOKEN_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const TOKEN_VALUE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SECTION_TYPE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

type JsonRecord = Record<string, any>;

export type PromoAppearanceTokenDefinition = Readonly<{
  type: 'enum';
  values: readonly string[];
  default: string;
}>;

export type PromoAppearanceTheme = Readonly<{
  themeId: string;
  version: string;
  rendererKey: string;
  contractVersion: number;
  tokens: Readonly<Record<string, PromoAppearanceTokenDefinition>>;
  defaultTokens: Readonly<Record<string, string>>;
  sectionVariants: Readonly<Record<string, readonly string[]>>;
  accessibility: Readonly<{
    normalTextContrastMin: number;
    largeTextContrastMin: number;
    focusContrastMin: number;
    reducedMotionSupported: boolean;
  }>;
  performance: Readonly<{
    cssBudgetKib: number;
    initialJsBudgetKib: number;
    thirdPartyScripts: boolean;
  }>;
}>;

export type PromoAppearanceSelection = Readonly<{
  source: 'selected' | 'safe_fallback';
  status: string;
  themeId: string;
  version: string;
  tokens: Readonly<Record<string, string>>;
  overrideKeys: readonly string[];
}>;

export type PromoAppearanceCatalog = Readonly<{
  current: PromoAppearanceSelection;
  fallback: Readonly<{
    source: 'safe_fallback';
    themeId: string;
    version: string;
    tokens: Readonly<Record<string, string>>;
    selectable: boolean;
  }>;
  themes: readonly PromoAppearanceTheme[];
}>;

export type PromoAppearancePreview = Readonly<{
  rendererAvailable: boolean;
  themeLabel: string;
  version: string;
  style: Readonly<{
    surface: string;
    surfaceRaised: string;
    text: string;
    muted: string;
    accent: string;
    border: string;
    focus: string;
    headingFont: string;
    bodyFont: string;
    radius: string;
    shadow: string;
    spacing: string;
    motionDuration: string;
  }>;
}>;

export class PromoAppearanceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code = 'promo_appearance_unavailable', status = 400) {
    super('No se pudo completar la edición de apariencia Promo.');
    this.name = 'PromoAppearanceError';
    this.code = code;
    this.status = status;
  }
}

function fail(code = 'invalid_payload', status = 400): never {
  throw new PromoAppearanceError(code, status);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactRecord(value: unknown, expected: readonly string[]) {
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

function safeEnum(value: unknown, pattern = TOKEN_VALUE_PATTERN) {
  const normalized = typeof value === 'string' ? value : '';
  if (!pattern.test(normalized)) fail('invalid_payload');
  return normalized;
}

function safeNumber(value: unknown, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail('invalid_payload');
  }
  return value;
}

function safeInteger(value: unknown, min: number, max: number) {
  const normalized = safeNumber(value, min, max);
  if (!Number.isSafeInteger(normalized)) fail('invalid_payload');
  return normalized;
}

function normalizeTokenValues(
  value: unknown,
  exactKeys?: readonly string[],
  errorCode = 'invalid_payload',
) {
  if (!isRecord(value)) fail(errorCode);
  const keys = Object.keys(value);
  if (keys.length > 64 || keys.some((key) => !TOKEN_KEY_PATTERN.test(key))) fail(errorCode);
  if (exactKeys) {
    const actual = [...keys].sort();
    const expected = [...exactKeys].sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
      fail(errorCode);
    }
  }
  return Object.fromEntries(keys.sort().map((key) => {
    const tokenValue = typeof value[key] === 'string' ? value[key] : '';
    if (!TOKEN_VALUE_PATTERN.test(tokenValue)) fail(errorCode);
    return [key, tokenValue];
  }));
}

function normalizeTheme(value: unknown): PromoAppearanceTheme {
  const theme = exactRecord(value, [
    'theme_id', 'version', 'renderer_key', 'contract_version', 'tokens', 'default_tokens',
    'section_variants', 'accessibility', 'performance',
  ]);
  const themeId = safeEnum(theme.theme_id, THEME_ID_PATTERN);
  const version = safeEnum(theme.version, SEMVER_PATTERN);
  const rendererKey = safeEnum(theme.renderer_key, RENDERER_KEY_PATTERN);
  if (theme.contract_version !== 1 || !isRecord(theme.tokens) || !isRecord(theme.default_tokens)) {
    fail('invalid_payload');
  }
  const tokenKeys = Object.keys(theme.tokens).sort();
  if (!tokenKeys.length || tokenKeys.length > 64 || tokenKeys.some((key) => !TOKEN_KEY_PATTERN.test(key))) {
    fail('invalid_payload');
  }
  const tokens: Record<string, PromoAppearanceTokenDefinition> = {};
  tokenKeys.forEach((key) => {
    const definition = exactRecord(theme.tokens[key], ['type', 'values', 'default']);
    if (definition.type !== 'enum' || !Array.isArray(definition.values)
      || !definition.values.length || definition.values.length > 32) fail('invalid_payload');
    const values = definition.values.map((item: unknown) => safeEnum(item));
    if (new Set(values).size !== values.length || !values.includes(definition.default)) fail('invalid_payload');
    tokens[key] = Object.freeze({ type: 'enum', values: Object.freeze(values), default: definition.default });
  });
  const defaultTokens = normalizeTokenValues(theme.default_tokens, tokenKeys);
  tokenKeys.forEach((key) => {
    if (defaultTokens[key] !== tokens[key].default) fail('invalid_payload');
  });

  if (!isRecord(theme.section_variants)) fail('invalid_payload');
  const sectionVariants: Record<string, readonly string[]> = {};
  const sectionTypes = Object.keys(theme.section_variants).sort();
  if (!sectionTypes.length || sectionTypes.length > 64) fail('invalid_payload');
  sectionTypes.forEach((sectionType) => {
    if (!SECTION_TYPE_PATTERN.test(sectionType) || !Array.isArray(theme.section_variants[sectionType])) {
      fail('invalid_payload');
    }
    const variants = theme.section_variants[sectionType].map((item: unknown) => safeEnum(item));
    if (!variants.length || new Set(variants).size !== variants.length) fail('invalid_payload');
    sectionVariants[sectionType] = Object.freeze(variants);
  });

  const accessibility = exactRecord(theme.accessibility, [
    'normal_text_contrast_min', 'large_text_contrast_min', 'focus_contrast_min',
    'reduced_motion_supported',
  ]);
  if (typeof accessibility.reduced_motion_supported !== 'boolean') fail('invalid_payload');
  const performance = exactRecord(theme.performance, [
    'css_budget_kib', 'initial_js_budget_kib', 'third_party_scripts',
  ]);
  if (typeof performance.third_party_scripts !== 'boolean') fail('invalid_payload');

  return Object.freeze({
    themeId,
    version,
    rendererKey,
    contractVersion: 1,
    tokens: Object.freeze(tokens),
    defaultTokens: Object.freeze(defaultTokens),
    sectionVariants: Object.freeze(sectionVariants),
    accessibility: Object.freeze({
      normalTextContrastMin: safeNumber(accessibility.normal_text_contrast_min, 1, 21),
      largeTextContrastMin: safeNumber(accessibility.large_text_contrast_min, 1, 21),
      focusContrastMin: safeNumber(accessibility.focus_contrast_min, 1, 21),
      reducedMotionSupported: accessibility.reduced_motion_supported,
    }),
    performance: Object.freeze({
      cssBudgetKib: safeInteger(performance.css_budget_kib, 0, 1024),
      initialJsBudgetKib: safeInteger(performance.initial_js_budget_kib, 0, 1024),
      thirdPartyScripts: performance.third_party_scripts,
    }),
  });
}

function normalizeSelection(value: unknown): PromoAppearanceSelection {
  if (!isRecord(value)) fail('invalid_payload');
  const hasOverrides = Object.prototype.hasOwnProperty.call(value, 'override_keys');
  const selection = exactRecord(value, hasOverrides
    ? ['source', 'status', 'theme_id', 'version', 'tokens', 'override_keys']
    : ['source', 'status', 'theme_id', 'version', 'tokens']);
  if (!['selected', 'safe_fallback'].includes(selection.source)
    || typeof selection.status !== 'string' || !/^[a-z][a-z_]{0,31}$/.test(selection.status)) {
    fail('invalid_payload');
  }
  if ((selection.source === 'selected' && !hasOverrides)
    || (selection.source === 'safe_fallback' && hasOverrides)
    || (selection.source === 'safe_fallback' && selection.status !== 'not_selected')
    || (selection.source === 'selected' && !['approved', 'deprecated'].includes(selection.status))) {
    fail('invalid_payload');
  }
  const overrideKeys = hasOverrides && Array.isArray(selection.override_keys)
    ? selection.override_keys.map((key: unknown) => safeEnum(key, TOKEN_KEY_PATTERN))
    : [];
  if ((hasOverrides && !Array.isArray(selection.override_keys))
    || new Set(overrideKeys).size !== overrideKeys.length) fail('invalid_payload');
  const tokens = normalizeTokenValues(selection.tokens);
  if (overrideKeys.some((key) => !Object.prototype.hasOwnProperty.call(tokens, key))) fail('invalid_payload');
  return Object.freeze({
    source: selection.source,
    status: selection.status,
    themeId: safeEnum(selection.theme_id, THEME_ID_PATTERN),
    version: safeEnum(selection.version, SEMVER_PATTERN),
    tokens: Object.freeze(tokens),
    overrideKeys: Object.freeze(overrideKeys.sort()),
  });
}

export function normalizePromoAppearanceCatalog(value: unknown): PromoAppearanceCatalog {
  const response = exactRecord(value, ['ok', 'contract', 'current', 'fallback', 'themes']);
  if (response.ok !== true || response.contract !== PROMO_APPEARANCE_CATALOG_CONTRACT
    || !Array.isArray(response.themes) || response.themes.length > 100) fail('invalid_payload');
  const themes = response.themes.map(normalizeTheme);
  const themeKeys = themes.map((theme) => `${theme.themeId}@${theme.version}`);
  if (new Set(themeKeys).size !== themeKeys.length) fail('invalid_payload');

  const current = normalizeSelection(response.current);
  const fallbackValue = exactRecord(response.fallback, [
    'source', 'theme_id', 'version', 'tokens', 'selectable',
  ]);
  if (fallbackValue.source !== 'safe_fallback' || typeof fallbackValue.selectable !== 'boolean') {
    fail('invalid_payload');
  }
  const fallback = Object.freeze({
    source: 'safe_fallback' as const,
    themeId: safeEnum(fallbackValue.theme_id, THEME_ID_PATTERN),
    version: safeEnum(fallbackValue.version, SEMVER_PATTERN),
    tokens: Object.freeze(normalizeTokenValues(fallbackValue.tokens)),
    selectable: fallbackValue.selectable,
  });

  const fallbackTheme = themes.find((theme) => (
    theme.themeId === fallback.themeId && theme.version === fallback.version
  ));
  if (fallback.selectable !== Boolean(fallbackTheme)) fail('invalid_payload');
  if (fallbackTheme) {
    const effective = promoAppearanceEffectiveTokens(fallbackTheme, {});
    if (!sameJson(effective, fallback.tokens)) fail('invalid_payload');
  }
  const currentTheme = themes.find((theme) => (
    theme.themeId === current.themeId && theme.version === current.version
  ));
  if (current.status === 'approved' && !currentTheme) fail('invalid_payload');
  if (currentTheme) {
    promoAppearanceEffectiveTokens(currentTheme, current.tokens);
  }
  return Object.freeze({ current, fallback, themes: Object.freeze(themes) });
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function sameJson(first: unknown, second: unknown) {
  return JSON.stringify(canonical(first)) === JSON.stringify(canonical(second));
}

export function promoAppearanceThemeKey(themeId: string, version: string) {
  return `${themeId}@${version}`;
}

export function findPromoAppearanceTheme(
  catalog: PromoAppearanceCatalog,
  themeId: string,
  version: string,
) {
  return catalog.themes.find((theme) => theme.themeId === themeId && theme.version === version) || null;
}

function assertKnownCombination(theme: PromoAppearanceTheme, tokens: Record<string, string>) {
  if (theme.themeId === 'promo.black-gold' && theme.version === '1.0.0'
    && tokens.accent !== tokens.border) {
    fail('incompatible_promo_theme_tokens');
  }
}

export function promoAppearanceEffectiveTokens(
  theme: PromoAppearanceTheme,
  overrides: unknown,
) {
  if (!isRecord(overrides)) fail('invalid_promo_theme_tokens');
  const overrideKeys = Object.keys(overrides);
  if (overrideKeys.some((key) => !Object.prototype.hasOwnProperty.call(theme.tokens, key))) {
    fail('invalid_promo_theme_tokens');
  }
  const effective: Record<string, string> = { ...theme.defaultTokens };
  overrideKeys.forEach((key) => {
    const value = typeof overrides[key] === 'string' ? overrides[key] : '';
    if (!TOKEN_VALUE_PATTERN.test(value)) fail('invalid_promo_theme_tokens');
    if (!theme.tokens[key].values.includes(value)) fail('invalid_promo_theme_tokens');
    effective[key] = value;
  });
  assertKnownCombination(theme, effective);
  return Object.freeze(effective);
}

export function buildPromoAppearanceDocument(
  value: unknown,
  catalogValue: PromoAppearanceCatalog,
  selection: Readonly<{ themeId: string; version: string; tokenValues: Readonly<Record<string, string>> }>,
) {
  const document = normalizePromoCmsDocument(value);
  const catalog = normalizePromoAppearanceCatalog({
    ok: true,
    contract: PROMO_APPEARANCE_CATALOG_CONTRACT,
    current: {
      source: catalogValue.current.source,
      status: catalogValue.current.status,
      theme_id: catalogValue.current.themeId,
      version: catalogValue.current.version,
      tokens: catalogValue.current.tokens,
      ...(catalogValue.current.source === 'selected'
        ? { override_keys: catalogValue.current.overrideKeys }
        : {}),
    },
    fallback: {
      source: catalogValue.fallback.source,
      theme_id: catalogValue.fallback.themeId,
      version: catalogValue.fallback.version,
      tokens: catalogValue.fallback.tokens,
      selectable: catalogValue.fallback.selectable,
    },
    themes: catalogValue.themes.map((theme) => ({
      theme_id: theme.themeId,
      version: theme.version,
      renderer_key: theme.rendererKey,
      contract_version: theme.contractVersion,
      tokens: Object.fromEntries(Object.entries(theme.tokens).map(([key, definition]) => [key, {
        type: definition.type, values: definition.values, default: definition.default,
      }])),
      default_tokens: theme.defaultTokens,
      section_variants: theme.sectionVariants,
      accessibility: {
        normal_text_contrast_min: theme.accessibility.normalTextContrastMin,
        large_text_contrast_min: theme.accessibility.largeTextContrastMin,
        focus_contrast_min: theme.accessibility.focusContrastMin,
        reduced_motion_supported: theme.accessibility.reducedMotionSupported,
      },
      performance: {
        css_budget_kib: theme.performance.cssBudgetKib,
        initial_js_budget_kib: theme.performance.initialJsBudgetKib,
        third_party_scripts: theme.performance.thirdPartyScripts,
      },
    })),
  });
  const theme = findPromoAppearanceTheme(catalog, selection.themeId, selection.version);
  if (!theme) fail('promo_theme_not_selectable', 403);
  const tokenValues = normalizeTokenValues(
    selection.tokenValues,
    Object.keys(theme.tokens),
    'invalid_promo_theme_tokens',
  );
  const effective = promoAppearanceEffectiveTokens(theme, tokenValues);
  const overrides = Object.fromEntries(Object.keys(theme.tokens).sort()
    .filter((key) => effective[key] !== theme.defaultTokens[key])
    .map((key) => [key, effective[key]]));
  document.theme = { theme_id: theme.themeId, version: theme.version, tokens: overrides };
  return document;
}

export function promoAppearanceChangeRequirements(previousValue: unknown, nextValue: unknown) {
  const previous = normalizePromoCmsDocument(previousValue);
  const next = normalizePromoCmsDocument(nextValue);
  const changed = !sameJson(previous, next);
  return Object.freeze({
    changed,
    content: changed,
    themeSelect: previous.theme.theme_id !== next.theme.theme_id
      || previous.theme.version !== next.theme.version,
    appearanceManage: !sameJson(previous.theme.tokens, next.theme.tokens),
  });
}

const TOKEN_LABELS: Record<string, string> = Object.freeze({
  surface: 'Superficie',
  text: 'Texto',
  accent: 'Acento',
  border: 'Borde',
  focus: 'Foco visible',
  heading_font: 'Tipografía de títulos',
  body_font: 'Tipografía de lectura',
  radius: 'Redondeo',
  shadow: 'Profundidad',
  density: 'Densidad',
  motion: 'Movimiento',
});

const VALUE_LABELS: Record<string, string> = Object.freeze({
  obsidian: 'Obsidiana',
  ivory: 'Marfil',
  heritage_gold: 'Dorado clásico',
  champagne_gold: 'Dorado champaña',
  ivory_ring: 'Anillo marfil',
  editorial_serif: 'Serif editorial',
  humanist_sans: 'Sans humanista',
  subtle: 'Sutil',
  soft: 'Suave',
  ambient: 'Ambiental',
  lifted: 'Elevada',
  comfortable: 'Cómoda',
  compact: 'Compacta',
  reduced: 'Reducido',
});

function humanize(value: string) {
  const normalized = value.replace(/^promo\./, '').replace(/[._-]+/g, ' ').trim();
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : 'Tema Promo';
}

export function promoAppearanceThemeLabel(themeId: string) {
  return ({
    'promo.black-gold': 'Negro y dorado',
    'promo.minimal': 'Minimalista clara',
    'promo.artisan': 'Artesanal cálida',
    'promo.vibrant': 'Vibrante moderna',
    'promo.professional': 'Profesional corporativa',
    'promo.portfolio': 'Portafolio visual',
  } as Record<string, string>)[themeId] || humanize(themeId);
}

export function promoAppearanceTokenLabel(key: string) {
  return TOKEN_LABELS[key] || humanize(key);
}

export function promoAppearanceValueLabel(value: string) {
  return VALUE_LABELS[value] || humanize(value);
}

const SAFE_PREVIEW_DEFAULTS = Object.freeze({
  surface: '#0b0b0b',
  surfaceRaised: '#151411',
  text: '#f6f1e7',
  muted: '#bcb4a5',
  accent: '#c8a45a',
  border: '#c8a45a',
  focus: '#f6f1e7',
  headingFont: 'Georgia, "Times New Roman", serif',
  bodyFont: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  radius: '8px',
  shadow: '0 18px 48px rgba(0, 0, 0, 0.34)',
  spacing: '1.25rem',
  motionDuration: '220ms',
});

export function promoAppearancePreview(
  theme: PromoAppearanceTheme,
  tokenValues: Readonly<Record<string, string>>,
): PromoAppearancePreview {
  const tokens = promoAppearanceEffectiveTokens(theme, tokenValues);
  const styles: Record<string, PromoAppearancePreview['style']> = {
    'promo.black-gold': Object.freeze({
      ...SAFE_PREVIEW_DEFAULTS,
      accent: tokens.accent === 'champagne_gold' ? '#d9bf84' : '#c8a45a',
      border: tokens.border === 'champagne_gold' ? '#d9bf84' : '#c8a45a',
      radius: tokens.radius === 'soft' ? '18px' : '8px',
      shadow: tokens.shadow === 'lifted' ? '0 24px 64px rgba(0, 0, 0, 0.5)' : SAFE_PREVIEW_DEFAULTS.shadow,
      spacing: tokens.density === 'compact' ? '0.85rem' : '1.25rem',
      motionDuration: tokens.motion === 'reduced' ? '0ms' : '220ms',
    }),
    'promo.minimal': Object.freeze({
      surface: '#ffffff', surfaceRaised: '#f5f7fa', text: '#17212b', muted: '#667085',
      accent: '#175cd3', border: '#d7dee7', focus: '#175cd3',
      headingFont: 'Inter, system-ui, sans-serif', bodyFont: 'Inter, system-ui, sans-serif',
      radius: '2px', shadow: 'none', spacing: '1.6rem', motionDuration: tokens.motion === 'reduced' ? '0ms' : '180ms',
    }),
    'promo.artisan': Object.freeze({
      surface: '#f5ead9', surfaceRaised: '#fff7eb', text: '#3b2418', muted: '#745445',
      accent: '#9b3f24', border: '#c98f70', focus: '#3b2418',
      headingFont: 'Georgia, serif', bodyFont: 'system-ui, sans-serif',
      radius: '24px 8px 20px 6px', shadow: '0 16px 34px rgba(92, 51, 28, .16)', spacing: '1.25rem',
      motionDuration: tokens.motion === 'reduced' ? '0ms' : '220ms',
    }),
    'promo.vibrant': Object.freeze({
      surface: '#10142e', surfaceRaised: '#20285a', text: '#ffffff', muted: '#c7c8eb',
      accent: '#ff8a6b', border: '#58a6ff', focus: '#c8f560',
      headingFont: 'Impact, system-ui, sans-serif', bodyFont: 'system-ui, sans-serif',
      radius: '28px', shadow: '0 0 32px rgba(88, 166, 255, .32)', spacing: '1rem',
      motionDuration: tokens.motion === 'reduced' ? '0ms' : '300ms',
    }),
    'promo.professional': Object.freeze({
      surface: '#0c2d48', surfaceRaised: '#123e60', text: '#ffffff', muted: '#c3d7e6',
      accent: '#78b7ff', border: '#7693aa', focus: '#ffffff',
      headingFont: 'Arial, system-ui, sans-serif', bodyFont: 'Arial, system-ui, sans-serif',
      radius: '4px', shadow: '0 12px 26px rgba(3, 18, 30, .24)', spacing: '.85rem',
      motionDuration: tokens.motion === 'reduced' ? '0ms' : '160ms',
    }),
    'promo.portfolio': Object.freeze({
      surface: '#171717', surfaceRaised: '#252525', text: '#ffffff', muted: '#c7c7c7',
      accent: '#e7c99b', border: '#626262', focus: '#ffffff',
      headingFont: 'Georgia, serif', bodyFont: 'system-ui, sans-serif',
      radius: '2px', shadow: '0 26px 70px rgba(0, 0, 0, .48)', spacing: '1.4rem',
      motionDuration: tokens.motion === 'reduced' ? '0ms' : '360ms',
    }),
  };
  const style = styles[theme.rendererKey];
  return Object.freeze({
    rendererAvailable: Boolean(style),
    themeLabel: promoAppearanceThemeLabel(theme.themeId),
    version: theme.version,
    style: style || SAFE_PREVIEW_DEFAULTS,
  });
}

export function promoAppearanceErrorMessage(code: unknown) {
  const messages: Record<string, string> = {
    unauthorized: 'Tu sesión terminó. Vuelve a iniciar sesión.',
    session_revoked: 'Tu sesión ya no está vigente. Vuelve a iniciar sesión.',
    blocked_by_plan: 'El plan actual bloquea la edición de este sitio.',
    promo_capability_denied: 'La personalización visual no está habilitada para esta tienda.',
    promo_permission_denied: 'Tu sesión no tiene todos los permisos requeridos para guardar este cambio.',
    promo_live_conflict: 'La página cambió en otra sesión. Recárgala antes de volver a guardar.',
    promo_draft_conflict: 'La página cambió en otra sesión. Recárgala antes de volver a guardar.',
    promo_theme_not_selectable: 'Ese tema ya no está aprobado para una nueva selección.',
    promo_theme_unavailable: 'La selección visual actual no puede editarse de forma segura.',
    invalid_promo_theme_tokens: 'Uno de los valores visuales no pertenece al tema aprobado.',
    incompatible_promo_theme_tokens: 'Esa combinación visual no está aprobada para este tema.',
    invalid_promo_document: 'El backend rechazó la combinación visual o el documento completo.',
    invalid_origin: 'La solicitud no proviene del panel administrativo.',
  };
  return messages[String(code || '')] || 'No se pudo completar la operación. Intenta nuevamente.';
}
