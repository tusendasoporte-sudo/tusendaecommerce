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

export async function getCurrentStore(_context?: unknown): Promise<PublicStore> {
  return getDefaultStore();
}
