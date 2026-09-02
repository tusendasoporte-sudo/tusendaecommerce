import type PocketBase from 'pocketbase';
import { isMasterAdmin } from './auth';
import { pb, getPocketBaseFileUrl } from './pocketbase';
import { getCachedPublicData } from './publicDataCache';

export const DEFAULT_STORE_SLUG = 'powerzona';
export const ACTIVE_STORE_STATUS = 'active';

export type PublicStore = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan?: string;
  plan_started_at?: string;
  plan_expires_at?: string;
  plan_duration_months?: number;
  plan_is_permanent?: boolean;
  free_trial_used?: boolean;
  plan_updated_at?: string;
  plan_updated_by?: string;
  featured?: boolean;
  protected?: boolean;
  [key: string]: any;
};

export type MasterStoreSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan?: string;
  plan_started_at?: string;
  plan_expires_at?: string;
  plan_duration_months?: number;
  plan_is_permanent?: boolean;
  free_trial_used?: boolean;
  plan_updated_at?: string;
  plan_updated_by?: string;
  featured?: boolean;
  featured_order?: number;
  protected?: boolean;
  owner_phone?: string;
  views_count?: number;
  orders_count?: number;
  created?: string;
  updated?: string;
};

export type MasterStoreInput = {
  name: string;
  slug: string;
  status?: string;
  owner_phone?: string;
  store_type?: 'commerce' | 'promo';
  promo_plan?: 'free' | 'basic';
  promo_duration_months?: number;
  promo_is_permanent?: boolean;
  promo_image_limit?: 150 | 300;
  promo_theme_id?: string;
};

export type MasterStoresPage = {
  items: MasterStoreSummary[];
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
};

export type MasterStoreCounts = {
  total: number;
  active: number;
  suspended: number;
};

function normalizeStoreFileValue(value: any) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function addStoreImages(store: PublicStore) {
  const logo = normalizeStoreFileValue(store.logo || store.logo_image || store.logo_file)[0] || '';
  const banner = normalizeStoreFileValue(store.banner || store.banner_image || store.cover_image)[0] || '';
  const bazaar = normalizeStoreFileValue(store.bazaar_image)[0] || '';

  return {
    ...store,
    logoUrl: logo ? getPocketBaseFileUrl('stores', store.id, logo, { thumb: '300x300' }) : null,
    bannerUrl: banner ? getPocketBaseFileUrl('stores', store.id, banner, { thumb: '1400x500' }) : null,
    bannerHeroUrl: banner ? getPocketBaseFileUrl('stores', store.id, banner) : null,
    bazaarImageUrl: bazaar ? getPocketBaseFileUrl('stores', store.id, bazaar, { thumb: '1200x520' }) : null,
  };
}

export class StoreResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreResolutionError';
  }
}

function escapePocketBaseValue(value: string) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function requireMasterClient(client: PocketBase) {
  if (!isMasterAdmin(client.authStore.record as any)) {
    throw new Error('No tienes permisos para gestionar tiendas.');
  }
}

export function normalizeStoreSlug(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);
}

function normalizeStoreStatus(value: string | undefined) {
  return String(value || ACTIVE_STORE_STATUS).toLowerCase() === 'suspended' ? 'suspended' : ACTIVE_STORE_STATUS;
}

async function assertUniqueStoreSlug(slug: string, currentStoreId = '', client = pb) {
  try {
    const existing = await client.collection('stores').getFirstListItem(
      `slug="${escapePocketBaseValue(slug)}"`,
      { fields: 'id' }
    );

    if (existing?.id && existing.id !== currentStoreId) {
      throw new Error('Ya existe una tienda con ese slug.');
    }
  } catch (error: any) {
    if (error?.status === 404) return;
    throw error;
  }
}

function getMasterStorePayload(input: MasterStoreInput) {
  const name = String(input.name || '').trim();
  const slug = normalizeStoreSlug(input.slug);

  if (!name) throw new Error('Escribe el nombre de la tienda.');
  if (!slug) throw new Error('Escribe un slug valido para la tienda.');

  return {
    name,
    slug,
    status: normalizeStoreStatus(input.status),
    owner_phone: String(input.owner_phone || '').trim(),
  };
}

function getPathnameFromContext(context?: unknown) {
  const candidate = context as any;
  const url = candidate?.url || candidate?.request?.url || candidate;

  if (url instanceof URL) return url.pathname;
  if (typeof url === 'string') {
    try {
      return new URL(url).pathname;
    } catch (_) {
      return url;
    }
  }

  return '';
}

export function isStoreRoute(pathname: string) {
  return /^\/t\/[^/]+(?:\/|$)/.test(String(pathname || ''));
}

export function getStoreSlugFromPath(pathname: string) {
  const match = String(pathname || '').match(/^\/t\/([^/]+)(?:\/|$)/);
  return match ? decodeURIComponent(match[1]).trim().toLowerCase() : '';
}

export function getStorePathPrefix(store: PublicStore | string | null | undefined, pathname?: string) {
  if (pathname !== undefined && !isStoreRoute(pathname)) return '';
  const slug = typeof store === 'string' ? store : store?.slug;
  return slug ? `/t/${encodeURIComponent(String(slug))}` : '';
}

export function getPublicPath(path: string, store?: PublicStore | string | null, pathname?: string) {
  const rawPath = String(path || '/');
  if (/^(https?:|mailto:|tel:|#)/i.test(rawPath)) return rawPath;

  const prefix = getStorePathPrefix(store, pathname);
  if (!prefix) return rawPath;

  if (rawPath === '/') return prefix;
  if (rawPath.startsWith('/#')) return `${prefix}${rawPath.slice(1)}`;
  return `${prefix}${rawPath.startsWith('/') ? rawPath : `/${rawPath}`}`;
}

type PublicStoreReadOptions = {
  fresh?: boolean;
};

export async function getStoreBySlug(
  slug: string,
  options: PublicStoreReadOptions = {},
): Promise<PublicStore | null> {
  const normalizedSlug = String(slug || '').trim().toLowerCase();
  if (!normalizedSlug) return null;

  const loadStore = async () => {
    try {
      const store = await pb.collection('stores').getFirstListItem(
        `slug="${escapePocketBaseValue(normalizedSlug)}" && status="${ACTIVE_STORE_STATUS}"`
      ) as PublicStore;
      return addStoreImages(store);
    } catch (error: any) {
      if (error?.status === 404) return null;
      throw error;
    }
  };

  if (options.fresh === true) return loadStore();
  return getCachedPublicData(`store:${normalizedSlug}`, loadStore);
}

export async function getStoreBySlugAnyStatus(slug: string): Promise<PublicStore | null> {
  const normalizedSlug = String(slug || '').trim().toLowerCase();
  if (!normalizedSlug) return null;

  try {
    const store = await pb.collection('stores').getFirstListItem(
      `slug="${escapePocketBaseValue(normalizedSlug)}"`
    ) as PublicStore;
    return addStoreImages(store);
  } catch (error: any) {
    if (error?.status === 404) return null;
    throw error;
  }
}

export async function getDefaultStore(options: PublicStoreReadOptions = {}): Promise<PublicStore> {
  const store = await getStoreBySlug(DEFAULT_STORE_SLUG, options);

  if (!store) {
    throw new StoreResolutionError('No se encontró el store público base PowerZona.');
  }

  return store;
}

export async function getActiveStores(): Promise<PublicStore[]> {
  const stores = await pb.collection('stores').getFullList({
    filter: `status="${ACTIVE_STORE_STATUS}"`,
    sort: '-featured,-orders_count,-views_count,-created',
  });

  return stores.map((store) => addStoreImages(store as PublicStore));
}

export async function getFeaturedStores(): Promise<PublicStore[]> {
  const stores = await pb.collection('stores').getFullList({
    filter: `status="${ACTIVE_STORE_STATUS}" && featured=true`,
    sort: 'featured_order,name,-created',
  });

  return stores.map((store) => addStoreImages(store as PublicStore));
}

export async function getAllStoresForMaster(client = pb): Promise<MasterStoreSummary[]> {
  const stores = await client.collection('stores').getFullList({
    fields: 'id,name,slug,status,plan,plan_started_at,plan_expires_at,plan_duration_months,plan_is_permanent,free_trial_used,plan_updated_at,plan_updated_by,featured,featured_order,protected,owner_phone,views_count,orders_count,created,updated',
    sort: '-featured,featured_order,status,name',
  });

  return stores.map((store: any) => ({
    id: store.id || '',
    name: store.name || '',
    slug: store.slug || '',
    status: store.status || '',
    plan: store.plan || '',
    plan_started_at: store.plan_started_at || '',
    plan_expires_at: store.plan_expires_at || '',
    plan_duration_months: Number(store.plan_duration_months || 0),
    plan_is_permanent: store.plan_is_permanent === true,
    free_trial_used: store.free_trial_used === true,
    plan_updated_at: store.plan_updated_at || '',
    plan_updated_by: store.plan_updated_by || '',
    featured: store.featured === true,
    featured_order: Number(store.featured_order || 0),
    protected: store.protected === true,
    owner_phone: store.owner_phone || '',
    views_count: Number(store.views_count || 0),
    orders_count: Number(store.orders_count || 0),
    created: store.created || '',
    updated: store.updated || '',
  }));
}

function mapMasterStore(store: any): MasterStoreSummary {
  return {
    id: store.id || '',
    name: store.name || '',
    slug: store.slug || '',
    status: store.status || '',
    plan: store.plan || '',
    plan_started_at: store.plan_started_at || '',
    plan_expires_at: store.plan_expires_at || '',
    plan_duration_months: Number(store.plan_duration_months || 0),
    plan_is_permanent: store.plan_is_permanent === true,
    free_trial_used: store.free_trial_used === true,
    plan_updated_at: store.plan_updated_at || '',
    plan_updated_by: store.plan_updated_by || '',
    featured: store.featured === true,
    featured_order: Number(store.featured_order || 0),
    protected: store.protected === true,
    owner_phone: store.owner_phone || '',
    views_count: Number(store.views_count || 0),
    orders_count: Number(store.orders_count || 0),
    created: store.created || '',
    updated: store.updated || '',
  };
}

export function normalizeMasterStoresPage(value: unknown) {
  const page = Number(value);
  return Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
}

export async function getStoresPageForMaster(client: PocketBase, page: unknown, perPage = 10): Promise<MasterStoresPage> {
  requireMasterClient(client);
  const requestedPage = normalizeMasterStoresPage(page);
  const normalizedPerPage = Math.min(100, Math.max(1, Math.floor(Number(perPage) || 10)));
  const options = {
    fields: 'id,name,slug,status,plan,plan_started_at,plan_expires_at,plan_duration_months,plan_is_permanent,free_trial_used,plan_updated_at,plan_updated_by,featured,featured_order,protected,owner_phone,views_count,orders_count,created,updated',
    sort: '-featured,featured_order,status,name',
  };
  let result = await client.collection('stores').getList(requestedPage, normalizedPerPage, options);
  const totalItems = Math.max(0, Number(result.totalItems || 0));
  const totalPages = Math.max(1, Number(result.totalPages || 0));
  const normalizedPage = Math.min(requestedPage, totalPages);

  if (totalItems > 0 && normalizedPage !== requestedPage) {
    result = await client.collection('stores').getList(normalizedPage, normalizedPerPage, options);
  }

  return {
    items: result.items.map(mapMasterStore),
    page: normalizedPage,
    perPage: normalizedPerPage,
    totalItems,
    totalPages,
  };
}

export async function getMasterStoreCounts(client: PocketBase): Promise<MasterStoreCounts> {
  requireMasterClient(client);
  const fields = 'id';
  const [allStores, activeStores] = await Promise.all([
    client.collection('stores').getList(1, 1, { fields }),
    client.collection('stores').getList(1, 1, { fields, filter: `status="${ACTIVE_STORE_STATUS}"` }),
  ]);
  const total = Math.max(0, Number(allStores.totalItems || 0));
  const active = Math.min(total, Math.max(0, Number(activeStores.totalItems || 0)));
  return { total, active, suspended: Math.max(0, total - active) };
}

export async function createStoreFromMaster(input: MasterStoreInput, client = pb) {
  requireMasterClient(client);
  const basePayload = getMasterStorePayload(input);
  const storeType = input.store_type === 'promo' ? 'promo' : 'commerce';
  const promoPlan = input.promo_plan === 'basic' ? 'basic' : 'free';
  const promoIsPermanent = promoPlan === 'basic' && input.promo_is_permanent === true;
  const promoDurationMonths = promoPlan === 'basic' && !promoIsPermanent
    ? Math.min(12, Math.max(1, Math.floor(Number(input.promo_duration_months || 1))))
    : 0;
  const promoImageLimit = promoPlan === 'basic' && Number(input.promo_image_limit) === 300 ? 300 : 150;
  const promoThemeId = String(input.promo_theme_id || 'promo.black-gold').trim();
  const payload = {
    ...basePayload,
    store_type: storeType,
    ...(storeType === 'promo' ? {
      promo_plan: promoPlan,
      promo_duration_months: promoDurationMonths,
      promo_is_permanent: promoIsPermanent,
      promo_image_limit: promoImageLimit,
      promo_theme_id: promoThemeId,
    } : {}),
  };
  await assertUniqueStoreSlug(payload.slug, '', client);
  try {
    const response = await client.send<{ ok: true; store: MasterStoreSummary }>(
      '/api/pz/master/stores/create',
      {
        method: 'POST',
        body: payload,
        requestKey: null,
      },
    );
    return response.store;
  } catch (error: any) {
    const code = String(error?.data?.error || error?.response?.error || '');
    if (code === 'store_slug_exists') throw new Error('Ya existe una tienda con ese slug.');
    if (code === 'promo_public_slug_exists') throw new Error('Ese slug público Promo ya está reservado.');
    if (code === 'invalid_payload') throw new Error('Revisa los datos de la tienda.');
    if (code === 'unauthorized') throw new Error('No tienes permisos para crear tiendas.');
    throw error;
  }
}

export async function updateStoreFromMaster(storeId: string, input: MasterStoreInput, client = pb) {
  requireMasterClient(client);
  const id = String(storeId || '').trim();
  if (!id) throw new Error('No se encontro la tienda a editar.');

  const payload = getMasterStorePayload(input);
  await assertUniqueStoreSlug(payload.slug, id, client);

  return client.collection('stores').update(id, payload);
}

export async function setStoreStatusFromMaster(storeId: string, status: string, client = pb) {
  requireMasterClient(client);
  const id = String(storeId || '').trim();
  if (!id) throw new Error('No se encontro la tienda.');

  return client.collection('stores').update(id, {
    status: normalizeStoreStatus(status),
  });
}

export async function setStoreFeaturedFromMaster(storeId: string, featured: boolean, featuredOrder = 0, client = pb) {
  requireMasterClient(client);
  const id = String(storeId || '').trim();
  if (!id) throw new Error('No se encontro la tienda.');

  return client.collection('stores').update(id, {
    featured: featured === true,
    featured_order: Math.max(0, Number(featuredOrder || 0)),
  });
}

export async function getCurrentStore(
  context?: unknown,
  options: PublicStoreReadOptions = {},
): Promise<PublicStore> {
  const storeSlug = getStoreSlugFromPath(getPathnameFromContext(context));

  if (storeSlug) {
    const store = await getStoreBySlug(storeSlug, options);
    if (!store) {
      throw new StoreResolutionError(`No se encontró el store público activo "${storeSlug}".`);
    }
    return store;
  }

  return getDefaultStore(options);
}
