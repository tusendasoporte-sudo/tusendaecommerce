import { pb } from './pocketbase';

export const DEFAULT_STORE_SLUG = 'powerzona';
export const ACTIVE_STORE_STATUS = 'active';

export type PublicStore = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan?: string;
  featured?: boolean;
  protected?: boolean;
  [key: string]: any;
};

export class StoreResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreResolutionError';
  }
}

function escapePocketBaseValue(value: string) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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

export async function getStoreBySlug(slug: string): Promise<PublicStore | null> {
  const normalizedSlug = String(slug || '').trim().toLowerCase();
  if (!normalizedSlug) return null;

  try {
    return await pb.collection('stores').getFirstListItem(
      `slug="${escapePocketBaseValue(normalizedSlug)}" && status="${ACTIVE_STORE_STATUS}"`
    ) as PublicStore;
  } catch (error: any) {
    if (error?.status === 404) return null;
    throw error;
  }
}

export async function getDefaultStore(): Promise<PublicStore> {
  const store = await getStoreBySlug(DEFAULT_STORE_SLUG);

  if (!store) {
    throw new StoreResolutionError('No se encontró el store público base PowerZona.');
  }

  return store;
}

export async function getCurrentStore(context?: unknown): Promise<PublicStore> {
  const storeSlug = getStoreSlugFromPath(getPathnameFromContext(context));

  if (storeSlug) {
    const store = await getStoreBySlug(storeSlug);
    if (!store) {
      throw new StoreResolutionError(`No se encontró el store público activo "${storeSlug}".`);
    }
    return store;
  }

  return getDefaultStore();
}
