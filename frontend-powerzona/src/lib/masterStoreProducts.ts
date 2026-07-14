import { getPocketBaseFileUrl } from './pocketbase';

export const MASTER_PRODUCT_STATUSES = [
  'all',
  'visible',
  'hidden',
  'out_of_stock',
  'low_stock',
  'with_variations',
  'without_variations',
  'featured',
  'offer',
  'preorder',
] as const;

export const MASTER_PRODUCT_SORTS = [
  'updated_desc',
  'created_desc',
  'name_asc',
  'name_desc',
  'stock_asc',
  'stock_desc',
  'price_asc',
  'price_desc',
] as const;

export const MASTER_PRODUCT_WATCH_FILTERS = ['all', 'active', 'paused', 'none'] as const;

export type MasterProductStatus = (typeof MASTER_PRODUCT_STATUSES)[number];
export type MasterProductSort = (typeof MASTER_PRODUCT_SORTS)[number];
export type MasterProductWatchFilter = (typeof MASTER_PRODUCT_WATCH_FILTERS)[number];
export type MasterInventoryState = 'untracked' | 'available' | 'out_of_stock' | 'preorder';
export type MasterVisibilityReason = 'visible' | 'product_hidden' | 'category_hidden' | 'subcategory_hidden' | 'store_suspended';

export type MasterProductsStore = {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
};

export type MasterProductSummary = {
  total: number;
  publicly_visible: number;
  hidden: number;
  out_of_stock: number;
  with_variations: number;
  featured: number;
  offers: number;
  preorder: number;
};

export type MasterProductTaxonomy = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
};

export type MasterProductSubcategory = MasterProductTaxonomy & {
  category_id: string;
};

export type MasterProductListItem = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  category_active: boolean;
  subcategory_active: boolean;
  publicly_visible: boolean;
  visibility_reason: MasterVisibilityReason;
  featured: boolean;
  has_variations: boolean;
  variation_count: number;
  active_variation_count: number;
  track_stock: boolean;
  stored_stock: number;
  all_variations_stock: number;
  active_variations_stock: number;
  allow_preorder: boolean;
  inventory_state: MasterInventoryState;
  base_price_usd: number;
  regular_price_usd: number;
  offer_price_usd: number;
  is_offer: boolean;
  current_price_usd: number;
  min_variation_price_usd: number | null;
  max_variation_price_usd: number | null;
  variation_price_fallback: boolean;
  category: MasterProductTaxonomy | null;
  subcategory: MasterProductTaxonomy | null;
  delivery_mode: 'delivery' | 'pickup' | 'both';
  only_usd: boolean;
  expiration_date: string;
  internal_ref: string;
  primary_image: string;
  primary_image_url: string;
  created: string;
  updated: string;
  watch_status: 'none' | 'active' | 'paused';
  watch_started_at: string;
};

export type MasterProductVariation = {
  id: string;
  variation_type: string;
  value: string;
  label: string;
  active: boolean;
  price_usd: number;
  offer_price_usd: number;
  is_offer: boolean;
  current_price_usd: number;
  stock: number;
  allow_preorder: boolean;
  inventory_state: Exclude<MasterInventoryState, 'untracked'>;
  internal_ref: string;
  sort_order: number;
  expiration_date: string;
  image: string;
  image_url: string;
  created: string;
  updated: string;
};

export type MasterProductDetail = {
  id: string;
  name: string;
  slug: string;
  description_text: string;
  images: string[];
  image_urls: string[];
  active: boolean;
  category_active: boolean;
  subcategory_active: boolean;
  publicly_visible: boolean;
  visibility_reason: MasterVisibilityReason;
  featured: boolean;
  featured_order: number;
  category: MasterProductTaxonomy | null;
  subcategory: MasterProductTaxonomy | null;
  base_price_usd: number;
  regular_price_usd: number;
  offer_price_usd: number;
  is_offer: boolean;
  current_price_usd: number;
  stock: number;
  track_stock: boolean;
  has_variations: boolean;
  variation_view: 'buttons' | 'dropdown' | 'checkbox';
  allow_preorder: boolean;
  only_usd: boolean;
  delivery_mode: 'delivery' | 'pickup' | 'both';
  expiration_date: string;
  internal_ref: string;
  extra_info: Array<{ label: string; value: string }>;
  created: string;
  updated: string;
  related_product_count: number;
};

export type MasterRelatedProduct = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  publicly_visible: boolean;
  primary_image: string;
  primary_image_url: string;
};

export type MasterProductsResult = {
  generated_at: string;
  store: MasterProductsStore;
  summary: MasterProductSummary;
  filters: {
    categories: MasterProductTaxonomy[];
    subcategories: MasterProductSubcategory[];
  };
  page: {
    page: number;
    per_page: 10;
    total_items: number;
    total_pages: number;
    items: MasterProductListItem[];
  };
};

export type MasterProductDetailResult = {
  generated_at: string;
  store: MasterProductsStore;
  product: MasterProductDetail;
  variations: MasterProductVariation[];
  variations_truncated: boolean;
  variations_total: number;
  related_products: MasterRelatedProduct[];
};

export type MasterProductsEndpointResult<T> = {
  available: boolean;
  status: number;
  error: string;
  data: T | null;
};

export type MasterProductsQuery = {
  page?: unknown;
  status?: unknown;
  search?: unknown;
  category_id?: unknown;
  subcategory_id?: unknown;
  sort?: unknown;
  watch?: unknown;
};

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const SAFE_FILE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const REQUEST_TIMEOUT_MS = 9000;
const VISIBILITY_REASONS: MasterVisibilityReason[] = [
  'visible',
  'product_hidden',
  'category_hidden',
  'subcategory_hidden',
  'store_suspended',
];
const INVENTORY_STATES: MasterInventoryState[] = ['untracked', 'available', 'out_of_stock', 'preorder'];

export function isValidRecordId(value: unknown) {
  return RECORD_ID_PATTERN.test(String(value || '').trim());
}

export function normalizeMasterProductStatus(value: unknown): MasterProductStatus {
  const status = String(value || '').trim().toLowerCase();
  return MASTER_PRODUCT_STATUSES.includes(status as MasterProductStatus)
    ? status as MasterProductStatus
    : 'all';
}

export function normalizeMasterProductSort(value: unknown): MasterProductSort {
  const sort = String(value || '').trim().toLowerCase();
  return MASTER_PRODUCT_SORTS.includes(sort as MasterProductSort)
    ? sort as MasterProductSort
    : 'updated_desc';
}

export function normalizeMasterProductWatchFilter(value: unknown): MasterProductWatchFilter {
  const watch = String(value || '').trim().toLowerCase();
  return MASTER_PRODUCT_WATCH_FILTERS.includes(watch as MasterProductWatchFilter)
    ? watch as MasterProductWatchFilter
    : 'all';
}

export function normalizeMasterProductsPage(value: unknown) {
  const page = Number(value);
  return Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
}

function boundedString(value: unknown, maxLength: number) {
  return String(value || '').trim().slice(0, maxLength);
}

function nonNegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function nullableFiniteNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeIsoDate(value: unknown) {
  const raw = boundedString(value, 80);
  if (!raw) return '';
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function safeSlug(value: unknown) {
  const slug = boundedString(value, 120).toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : '';
}

function safeFilename(value: unknown) {
  const filename = boundedString(value, 180);
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) return '';
  return SAFE_FILE_PATTERN.test(filename) ? filename : '';
}

function normalizeVisibilityReason(value: unknown): MasterVisibilityReason {
  const reason = boundedString(value, 40) as MasterVisibilityReason;
  return VISIBILITY_REASONS.includes(reason) ? reason : 'product_hidden';
}

function normalizeInventoryState(value: unknown, allowUntracked = true): MasterInventoryState {
  const state = boundedString(value, 30) as MasterInventoryState;
  if (INVENTORY_STATES.includes(state) && (allowUntracked || state !== 'untracked')) return state;
  return 'out_of_stock';
}

function normalizeDeliveryMode(value: unknown): 'delivery' | 'pickup' | 'both' {
  const mode = boundedString(value, 20);
  return mode === 'delivery' || mode === 'pickup' ? mode : 'both';
}

function normalizeTaxonomy(input: any): MasterProductTaxonomy | null {
  const id = boundedString(input?.id, 15);
  if (!isValidRecordId(id)) return null;
  return {
    id,
    name: boundedString(input?.name, 160) || 'Sin nombre',
    slug: safeSlug(input?.slug),
    active: input?.active === true,
  };
}

function normalizeSubcategory(input: any): MasterProductSubcategory | null {
  const taxonomy = normalizeTaxonomy(input);
  const categoryId = boundedString(input?.category_id, 15);
  if (!taxonomy || (categoryId && !isValidRecordId(categoryId))) return null;
  return { ...taxonomy, category_id: categoryId };
}

function normalizeStore(input: any): MasterProductsStore | null {
  const id = boundedString(input?.id, 15);
  if (!isValidRecordId(id)) return null;
  return {
    id,
    name: boundedString(input?.name, 160) || 'Tienda',
    slug: safeSlug(input?.slug),
    status: String(input?.status || '').toLowerCase() === 'active' ? 'active' : 'suspended',
  };
}

function normalizeSummary(input: any): MasterProductSummary {
  return {
    total: nonNegativeInteger(input?.total),
    publicly_visible: nonNegativeInteger(input?.publicly_visible),
    hidden: nonNegativeInteger(input?.hidden),
    out_of_stock: nonNegativeInteger(input?.out_of_stock),
    with_variations: nonNegativeInteger(input?.with_variations),
    featured: nonNegativeInteger(input?.featured),
    offers: nonNegativeInteger(input?.offers),
    preorder: nonNegativeInteger(input?.preorder),
  };
}

function normalizeListItem(input: any): MasterProductListItem | null {
  const id = boundedString(input?.id, 15);
  if (!isValidRecordId(id)) return null;
  const primaryImage = safeFilename(input?.primary_image);
  return {
    id,
    name: boundedString(input?.name, 180) || 'Producto',
    slug: safeSlug(input?.slug),
    active: input?.active === true,
    category_active: input?.category_active === true,
    subcategory_active: input?.subcategory_active === true,
    publicly_visible: input?.publicly_visible === true,
    visibility_reason: normalizeVisibilityReason(input?.visibility_reason),
    featured: input?.featured === true,
    has_variations: input?.has_variations === true,
    variation_count: nonNegativeInteger(input?.variation_count),
    active_variation_count: nonNegativeInteger(input?.active_variation_count),
    track_stock: input?.track_stock === true,
    stored_stock: finiteNumber(input?.stored_stock),
    all_variations_stock: finiteNumber(input?.all_variations_stock),
    active_variations_stock: finiteNumber(input?.active_variations_stock),
    allow_preorder: input?.allow_preorder === true,
    inventory_state: normalizeInventoryState(input?.inventory_state),
    base_price_usd: finiteNumber(input?.base_price_usd),
    regular_price_usd: finiteNumber(input?.regular_price_usd),
    offer_price_usd: finiteNumber(input?.offer_price_usd),
    is_offer: input?.is_offer === true,
    current_price_usd: finiteNumber(input?.current_price_usd),
    min_variation_price_usd: nullableFiniteNumber(input?.min_variation_price_usd),
    max_variation_price_usd: nullableFiniteNumber(input?.max_variation_price_usd),
    variation_price_fallback: input?.variation_price_fallback === true,
    category: normalizeTaxonomy(input?.category),
    subcategory: normalizeTaxonomy(input?.subcategory),
    delivery_mode: normalizeDeliveryMode(input?.delivery_mode),
    only_usd: input?.only_usd === true,
    expiration_date: safeIsoDate(input?.expiration_date),
    internal_ref: boundedString(input?.internal_ref, 160),
    primary_image: primaryImage,
    primary_image_url: primaryImage ? getPocketBaseFileUrl('products', id, primaryImage) : '',
    created: safeIsoDate(input?.created),
    updated: safeIsoDate(input?.updated),
    watch_status: input?.watch_status === 'active' || input?.watch_status === 'paused' ? input.watch_status : 'none',
    watch_started_at: safeIsoDate(input?.watch_started_at),
  };
}

function normalizeProducts(input: any): MasterProductsResult | null {
  if (input?.ok !== true) return null;
  const store = normalizeStore(input?.store);
  if (!store) return null;
  const categories = Array.isArray(input?.filters?.categories)
    ? input.filters.categories.map(normalizeTaxonomy).filter(Boolean) as MasterProductTaxonomy[]
    : [];
  const subcategories = Array.isArray(input?.filters?.subcategories)
    ? input.filters.subcategories.map(normalizeSubcategory).filter(Boolean) as MasterProductSubcategory[]
    : [];
  const totalItems = nonNegativeInteger(input?.page?.total_items);
  const totalPages = Math.max(1, nonNegativeInteger(input?.page?.total_pages));
  return {
    generated_at: safeIsoDate(input?.generated_at),
    store,
    summary: normalizeSummary(input?.summary),
    filters: { categories, subcategories },
    page: {
      page: Math.min(normalizeMasterProductsPage(input?.page?.page), totalPages),
      per_page: 10,
      total_items: totalItems,
      total_pages: totalPages,
      items: Array.isArray(input?.page?.items)
        ? input.page.items.slice(0, 10).map(normalizeListItem).filter(Boolean) as MasterProductListItem[]
        : [],
    },
  };
}

function normalizeVariation(input: any): MasterProductVariation | null {
  const id = boundedString(input?.id, 15);
  if (!isValidRecordId(id)) return null;
  const image = safeFilename(input?.image);
  return {
    id,
    variation_type: boundedString(input?.variation_type, 100),
    value: boundedString(input?.value, 120),
    label: boundedString(input?.label, 220) || 'Variación',
    active: input?.active === true,
    price_usd: finiteNumber(input?.price_usd),
    offer_price_usd: finiteNumber(input?.offer_price_usd),
    is_offer: input?.is_offer === true,
    current_price_usd: finiteNumber(input?.current_price_usd),
    stock: finiteNumber(input?.stock),
    allow_preorder: input?.allow_preorder === true,
    inventory_state: normalizeInventoryState(input?.inventory_state, false) as MasterProductVariation['inventory_state'],
    internal_ref: boundedString(input?.internal_ref, 160),
    sort_order: finiteNumber(input?.sort_order),
    expiration_date: safeIsoDate(input?.expiration_date),
    image,
    image_url: image ? getPocketBaseFileUrl('product_variations', id, image) : '',
    created: safeIsoDate(input?.created),
    updated: safeIsoDate(input?.updated),
  };
}

function normalizeProductDetail(input: any): MasterProductDetail | null {
  const id = boundedString(input?.id, 15);
  if (!isValidRecordId(id)) return null;
  const images = Array.isArray(input?.images)
    ? input.images.slice(0, 4).map(safeFilename).filter(Boolean)
    : [];
  const variationView = boundedString(input?.variation_view, 20);
  return {
    id,
    name: boundedString(input?.name, 180) || 'Producto',
    slug: safeSlug(input?.slug),
    description_text: boundedString(input?.description_text, 6000),
    images,
    image_urls: images.map((filename) => getPocketBaseFileUrl('products', id, filename)),
    active: input?.active === true,
    category_active: input?.category_active === true,
    subcategory_active: input?.subcategory_active === true,
    publicly_visible: input?.publicly_visible === true,
    visibility_reason: normalizeVisibilityReason(input?.visibility_reason),
    featured: input?.featured === true,
    featured_order: finiteNumber(input?.featured_order),
    category: normalizeTaxonomy(input?.category),
    subcategory: normalizeTaxonomy(input?.subcategory),
    base_price_usd: finiteNumber(input?.base_price_usd),
    regular_price_usd: finiteNumber(input?.regular_price_usd),
    offer_price_usd: finiteNumber(input?.offer_price_usd),
    is_offer: input?.is_offer === true,
    current_price_usd: finiteNumber(input?.current_price_usd),
    stock: finiteNumber(input?.stock),
    track_stock: input?.track_stock === true,
    has_variations: input?.has_variations === true,
    variation_view: variationView === 'dropdown' || variationView === 'checkbox' ? variationView : 'buttons',
    allow_preorder: input?.allow_preorder === true,
    only_usd: input?.only_usd === true,
    delivery_mode: normalizeDeliveryMode(input?.delivery_mode),
    expiration_date: safeIsoDate(input?.expiration_date),
    internal_ref: boundedString(input?.internal_ref, 160),
    extra_info: Array.isArray(input?.extra_info)
      ? input.extra_info.slice(0, 3).map((item: any) => ({
        label: boundedString(item?.label, 80),
        value: boundedString(item?.value, 180),
      })).filter((item: { label: string; value: string }) => item.label && item.value)
      : [],
    created: safeIsoDate(input?.created),
    updated: safeIsoDate(input?.updated),
    related_product_count: nonNegativeInteger(input?.related_product_count),
  };
}

function normalizeRelatedProduct(input: any): MasterRelatedProduct | null {
  const id = boundedString(input?.id, 15);
  if (!isValidRecordId(id)) return null;
  const image = safeFilename(input?.primary_image);
  return {
    id,
    name: boundedString(input?.name, 180) || 'Producto',
    slug: safeSlug(input?.slug),
    active: input?.active === true,
    publicly_visible: input?.publicly_visible === true,
    primary_image: image,
    primary_image_url: image ? getPocketBaseFileUrl('products', id, image) : '',
  };
}

function normalizeDetail(input: any): MasterProductDetailResult | null {
  if (input?.ok !== true) return null;
  const store = normalizeStore(input?.store);
  const product = normalizeProductDetail(input?.product);
  if (!store || !product) return null;
  const total = nonNegativeInteger(input?.variations_total);
  return {
    generated_at: safeIsoDate(input?.generated_at),
    store,
    product,
    variations: Array.isArray(input?.variations)
      ? input.variations.slice(0, 500).map(normalizeVariation).filter(Boolean) as MasterProductVariation[]
      : [],
    variations_truncated: input?.variations_truncated === true,
    variations_total: total,
    related_products: Array.isArray(input?.related_products)
      ? input.related_products.slice(0, 4).map(normalizeRelatedProduct).filter(Boolean) as MasterRelatedProduct[]
      : [],
  };
}

async function postPrivateEndpoint(
  pocketbaseUrl: string,
  token: string,
  endpoint: string,
  body: Record<string, unknown>,
) {
  const baseUrl = boundedString(pocketbaseUrl, 500).replace(/\/$/, '');
  const authToken = boundedString(token, 5000);
  if (!baseUrl || !authToken) return { status: 0, error: 'unavailable', payload: null };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    return {
      status: response.status,
      error: boundedString(payload?.error, 80),
      payload,
    };
  } catch (_) {
    return { status: 0, error: 'unavailable', payload: null };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getMasterStoreProducts(
  pocketbaseUrl: string,
  token: string,
  storeId: string,
  query: MasterProductsQuery = {},
): Promise<MasterProductsEndpointResult<MasterProductsResult>> {
  const safeStoreId = boundedString(storeId, 15);
  if (!isValidRecordId(safeStoreId)) {
    return { available: false, status: 400, error: 'invalid_payload', data: null };
  }
  const categoryId = boundedString(query.category_id, 15);
  const subcategoryId = boundedString(query.subcategory_id, 15);
  const result = await postPrivateEndpoint(pocketbaseUrl, token, '/api/pz/master/store-products', {
    store_id: safeStoreId,
    page: normalizeMasterProductsPage(query.page),
    status: normalizeMasterProductStatus(query.status),
    search: boundedString(query.search, 100),
    category_id: isValidRecordId(categoryId) ? categoryId : '',
    subcategory_id: isValidRecordId(subcategoryId) ? subcategoryId : '',
    sort: normalizeMasterProductSort(query.sort),
    watch: normalizeMasterProductWatchFilter(query.watch),
  });
  if (result.status !== 200) {
    return { available: false, status: result.status, error: result.error, data: null };
  }
  const data = normalizeProducts(result.payload);
  return data
    ? { available: true, status: 200, error: '', data }
    : { available: false, status: 502, error: 'invalid_response', data: null };
}

export async function getMasterStoreProductDetail(
  pocketbaseUrl: string,
  token: string,
  storeId: string,
  productId: string,
): Promise<MasterProductsEndpointResult<MasterProductDetailResult>> {
  const safeStoreId = boundedString(storeId, 15);
  const safeProductId = boundedString(productId, 15);
  if (!isValidRecordId(safeStoreId) || !isValidRecordId(safeProductId)) {
    return { available: false, status: 400, error: 'invalid_payload', data: null };
  }
  const result = await postPrivateEndpoint(pocketbaseUrl, token, '/api/pz/master/store-product-detail', {
    store_id: safeStoreId,
    product_id: safeProductId,
  });
  if (result.status !== 200) {
    return { available: false, status: result.status, error: result.error, data: null };
  }
  const data = normalizeDetail(result.payload);
  return data
    ? { available: true, status: 200, error: '', data }
    : { available: false, status: 502, error: 'invalid_response', data: null };
}
