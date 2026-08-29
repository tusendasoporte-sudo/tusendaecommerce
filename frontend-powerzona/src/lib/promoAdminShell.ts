import {
  getPromoAccessContext,
  hasPromoAction,
  hasPromoCapability,
  PromoAccessApiError,
  type PromoAccessClientOptions,
  type PromoAccessContext,
  type PromoActionKey,
} from './promoAccess.ts';
import { getStoreAdminPath } from './adminRoutes.ts';

export const PROMO_ADMIN_MODULES = Object.freeze([
  Object.freeze({
    section: 'content',
    label: 'Organización',
    shortLabel: 'Organización',
    description: 'Identidad, estructura, servicios y pie del sitio.',
    actions: Object.freeze(['promo.content.manage'] as PromoActionKey[]),
    delivery: 'Guarda contenido validado y actualiza la página pública automáticamente.',
  }),
  Object.freeze({
    section: 'gallery',
    label: 'Galería y productos',
    shortLabel: 'Galería y productos',
    description: 'Portada visual, fotos de servicios, ofertas, productos y trabajos.',
    actions: Object.freeze(['promo.content.manage', 'promo.media.manage'] as PromoActionKey[]),
    delivery: 'Administra los medios vinculados a la página sin una biblioteca privada separada.',
  }),
  Object.freeze({
    section: 'appearance',
    label: 'Apariencia',
    shortLabel: 'Apariencia',
    description: 'Tema aprobado y personalización visual permitida.',
    actions: Object.freeze(['promo.theme.select', 'promo.appearance.manage'] as PromoActionKey[]),
    delivery: 'La selección y personalización del tema se habilitarán en su etapa específica.',
  }),
  Object.freeze({
    section: 'languages',
    label: 'Idiomas',
    shortLabel: 'Idiomas',
    description: 'Locales habilitados, traducciones y completitud.',
    actions: Object.freeze(['promo.translations.manage'] as PromoActionKey[]),
    delivery: 'La edición de idiomas y traducciones se habilitará en su etapa específica.',
  }),
  Object.freeze({
    section: 'contact',
    label: 'Contacto',
    shortLabel: 'Contacto',
    description: 'Método principal y canales de contacto permitidos.',
    actions: Object.freeze(['promo.contact.manage'] as PromoActionKey[]),
    delivery: 'La configuración de contacto se habilitará junto al editor de contenido aprobado.',
  }),
  Object.freeze({
    section: 'reviews',
    label: 'Reseñas',
    shortLabel: 'Reseñas',
    description: 'Presentación y moderación de reseñas de la tienda.',
    actions: Object.freeze(['promo.reviews.manage'] as PromoActionKey[]),
    delivery: 'Gestiona únicamente reseñas generales de tienda con moderación Promo separada de pedidos.',
  }),
  Object.freeze({
    section: 'analytics',
    label: 'Analíticas',
    shortLabel: 'Analíticas',
    description: 'Visitas e interacciones agregadas sin datos personales.',
    actions: Object.freeze(['promo.analytics.view'] as PromoActionKey[]),
    delivery: 'Las analíticas Promo se habilitarán después del sitio público y su instrumentación aprobada.',
  }),
] as const);

export type PromoAdminModule = (typeof PROMO_ADMIN_MODULES)[number];
export type PromoAdminModuleSection = PromoAdminModule['section'];
export type PromoAdminSection = 'overview' | PromoAdminModuleSection;

export type PromoAdminStoreResolution =
  | Readonly<{ kind: 'promo'; context: PromoAccessContext }>
  | Readonly<{ kind: 'commerce' }>
  | Readonly<{ kind: 'blocked'; code: string; status: number }>;

const MODULE_BY_SECTION = new Map<PromoAdminModuleSection, PromoAdminModule>(
  PROMO_ADMIN_MODULES.map((module) => [module.section, module]),
);

function safeText(value: unknown) {
  try {
    return String(value === null || value === undefined ? '' : value).trim();
  } catch (_) {
    return '';
  }
}

export function getPromoAdminModule(section: unknown) {
  return MODULE_BY_SECTION.get(safeText(section) as PromoAdminModuleSection) || null;
}

export function normalizePromoAdminSection(section: unknown): PromoAdminSection | null {
  const normalized = safeText(section).replace(/^\/+|\/+$/g, '').toLowerCase();
  if (!normalized || normalized === 'promo') return 'overview';
  if (!normalized.startsWith('promo/')) return null;
  const module = getPromoAdminModule(normalized.slice('promo/'.length));
  return module?.section || null;
}

export function canOpenPromoAdminModule(
  context: PromoAccessContext | null | undefined,
  module: PromoAdminModule,
) {
  if (module.section === 'languages'
    && !hasPromoCapability(context, 'language_selector_enabled')) return false;
  return module.actions.some((action) => hasPromoAction(context, action));
}

export function visiblePromoAdminModules(context: PromoAccessContext | null | undefined) {
  if (!hasPromoAction(context, 'promo.site.view')) return [];
  return PROMO_ADMIN_MODULES.filter((module) => canOpenPromoAdminModule(context, module));
}

export function canOpenPromoAdminSection(
  context: PromoAccessContext | null | undefined,
  section: PromoAdminSection | null,
) {
  if (!section || !hasPromoAction(context, 'promo.site.view')) return false;
  if (section === 'overview') return true;
  const module = getPromoAdminModule(section);
  return Boolean(module && canOpenPromoAdminModule(context, module));
}

export function getPromoAdminSectionPath(storeSlug: string, section: PromoAdminSection) {
  return section === 'overview'
    ? getStoreAdminPath(storeSlug)
    : getStoreAdminPath(storeSlug, `promo/${section}`);
}

export function firstAllowedPromoAdminPath(
  storeSlug: string,
  context: PromoAccessContext | null | undefined,
) {
  return hasPromoAction(context, 'promo.site.view')
    ? getPromoAdminSectionPath(storeSlug, 'overview')
    : '';
}

export async function resolvePromoAdminStore(
  options: PromoAccessClientOptions,
): Promise<PromoAdminStoreResolution> {
  try {
    return Object.freeze({ kind: 'promo', context: await getPromoAccessContext(options) });
  } catch (error) {
    if (error instanceof PromoAccessApiError
      && error.status === 404
      && error.code === 'store_not_promo') {
      return Object.freeze({ kind: 'commerce' });
    }
    return Object.freeze({
      kind: 'blocked',
      code: error instanceof PromoAccessApiError
        ? safeText(error.code) || 'promo_permissions_unavailable'
        : 'promo_permissions_unavailable',
      status: error instanceof PromoAccessApiError && Number.isInteger(error.status)
        ? error.status
        : 503,
    });
  }
}
