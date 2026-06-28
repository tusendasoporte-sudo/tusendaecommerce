import { pb, getPocketBaseFileUrl } from './pocketbase';
import { getCurrentStore } from './stores';

type StoreQueryOptions = {
  storeId?: string;
};

type StoreQueryInput = string | StoreQueryOptions | undefined;

export type ReviewSummary = {
  average: number;
  roundedAverage: number;
  count: number;
  distribution: { 1: number; 2: number; 3: number; 4: number; 5: number };
};

export type PublicReviewPayload = {
  type: 'store' | 'product';
  product?: string;
  rating: number;
  customer_name: string;
  customer_contact?: string;
  comment?: string;
  source: 'public_store' | 'public_product';
};

function escapePocketBaseValue(value: string) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function resolveStoreId(options?: StoreQueryInput) {
  if (typeof options === 'string') return options;
  if (options?.storeId) return options.storeId;
  return (await getCurrentStore()).id;
}

async function storeFilter(baseFilter: string, options?: StoreQueryInput) {
  const storeId = await resolveStoreId(options);
  return `${baseFilter} && store="${escapePocketBaseValue(storeId)}"`;
}

export async function getSettings(options?: StoreQueryInput) {
  const records = await pb.collection('settings').getFullList({
    filter: await storeFilter('active = true', options),
    expand: 'default_currency',
  });

  const settings = records[0] ?? null;
  if (!settings) return null;

  const logo = normalizeFileValue(settings.logo_image)[0] || '';
  const cover = normalizeFileValue(settings.cover_image)[0] || '';
  const coverSlots = ['cover_image_1', 'cover_image_2', 'cover_image_3', 'cover_image_4']
    .map((field) => normalizeFileValue(settings[field])[0] || '')
    .filter(Boolean);
  const coverGallery = coverSlots.length
    ? coverSlots
    : orderedFileValues(normalizeFileValue(settings.cover_gallery), settings.cover_gallery_order).slice(0, 4);
  const giftsPublicImage = normalizeFileValue(settings.gifts_public_image)[0] || '';

  return {
    ...settings,
    logoImageUrl: logo ? getPocketBaseFileUrl('settings', settings.id, logo) : null,
    coverImageUrl: cover ? getPocketBaseFileUrl('settings', settings.id, cover) : null,
    coverGalleryUrls: coverGallery.map((filename: string) => getPocketBaseFileUrl('settings', settings.id, filename)),
    giftsPublicImageUrl: giftsPublicImage ? getPocketBaseFileUrl('settings', settings.id, giftsPublicImage) : null,
  };
}

export async function getCategories(options?: StoreQueryInput) {
  const categories = await pb.collection('categories').getFullList({
    filter: await storeFilter('active = true', options),
    sort: 'order,name',
  });

  return categories.map((category) => ({
    ...category,
    imageUrl: category.image
      ? getPocketBaseFileUrl('categories', category.id, category.image)
      : null,
  }));
}

export async function getSubcategories(options?: StoreQueryInput) {
  const subcategories = await pb.collection('subcategories').getFullList({
    filter: await storeFilter('active = true', options),
    sort: 'order,name',
    expand: 'category',
  });

  return subcategories
    .filter((subcategory: any) => {
      const categoryIsVisible = !subcategory.category || subcategory.expand?.category?.active === true;
      return subcategory.active === true && categoryIsVisible;
    })
    .map((subcategory: any) => {
      const image = normalizeFileValue(subcategory.image)[0] || '';
      return {
        ...subcategory,
        imageUrl: image ? getPocketBaseFileUrl('subcategories', subcategory.id, image) : null,
      };
    });
}

export async function getCurrencies(options?: StoreQueryInput) {
  return await pb.collection('currencies').getFullList({
    filter: await storeFilter('active = true', options),
    sort: 'code',
  });
}

function isProductPublicVisible(product: any) {
  const hasCategory = Boolean(product.category);
  const hasSubcategory = Boolean(product.subcategory);

  const categoryIsVisible = !hasCategory || product.expand?.category?.active === true;
  const subcategoryIsVisible = !hasSubcategory || product.expand?.subcategory?.active === true;

  return product.active === true && categoryIsVisible && subcategoryIsVisible;
}

function normalizeFileValue(value: any) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function parseJsonList(value: any) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch (_) {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
}

function orderedFileValues(files: string[], orderValue: any) {
  const order = parseJsonList(orderValue);
  return order.filter((filename) => files.includes(filename)).concat(files.filter((filename) => !order.includes(filename)));
}

function getOrderedProductImages(product: any) {
  const images = normalizeFileValue(product.images);
  let order: string[] = [];
  try {
    order = product?.image_order ? JSON.parse(product.image_order) : [];
  } catch (_) {
    order = [];
  }
  const ordered = Array.isArray(order) ? order.filter((filename) => images.includes(filename)) : [];
  return ordered.concat(images.filter((filename) => !ordered.includes(filename))).slice(0, 4);
}

function addProductImages(product: any) {
  return {
    ...product,
    imageUrls: getOrderedProductImages(product).map((filename: string) =>
      getPocketBaseFileUrl('products', product.id, filename)
    ),
  };
}

function addVariationImages(variation: any) {
  return {
    ...variation,
    imageUrls: normalizeFileValue(variation.image).map((filename: string) =>
      getPocketBaseFileUrl('product_variations', variation.id, filename)
    ),
  };
}

function variationPublicPrice(variation: any) {
  const price = Number(variation?.price_usd ?? variation?.precio_usd ?? 0);
  const regularPrice = Number.isFinite(price) ? Math.max(0, price) : 0;
  const offerPrice = Number(variation?.offer_price_usd ?? 0);
  const validOffer = Boolean(variation?.is_offer) && offerPrice > 0 && offerPrice < regularPrice;
  return validOffer ? offerPrice : regularPrice;
}

function addVariationPriceSummary(products: any[], variations: any[]) {
  const byProduct = new Map<string, number[]>();
  const allByProduct = new Map<string, number[]>();
  const productsById = new Map(products.map((product) => [product.id, product]));
  variations.forEach((variation) => {
    if (!variation?.product || variation.active === false) return;
    const price = variationPublicPrice(variation);
    if (price <= 0) return;
    const allCurrent = allByProduct.get(variation.product) || [];
    allCurrent.push(price);
    allByProduct.set(variation.product, allCurrent);
    const product = productsById.get(variation.product);
    const tracksStock = product?.track_stock !== false;
    if (tracksStock && Number(variation.stock || 0) <= 0 && !variation.allow_preorder) return;
    const current = byProduct.get(variation.product) || [];
    current.push(price);
    byProduct.set(variation.product, current);
  });

  return products.map((product) => {
    const availablePrices = byProduct.get(product.id) || [];
    const fallbackPrices = allByProduct.get(product.id) || [];
    const prices = availablePrices.length ? availablePrices : fallbackPrices;
    if (!product?.has_variations || !prices.length) return product;
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const hasDifferentPrices = prices.some((price) => price !== minPrice);
    return {
      ...product,
      variation_price_min_usd: minPrice,
      variation_price_max_usd: maxPrice,
      variation_price_count: prices.length,
      variation_has_different_prices: hasDifferentPrices,
      public_price_usd: minPrice,
      public_price_prefix: 'Desde',
    };
  });
}

async function attachVariationPriceSummary(products: any[]) {
  const productIds = products
    .filter((product) => product?.has_variations && product?.id)
    .map((product) => product.id);
  if (!productIds.length) return products;

  const variations = await pb.collection('product_variations').getFullList({
    filter: productIds.map((id) => `product="${escapePocketBaseValue(id)}"`).join(' || '),
    sort: 'sort_order,variation_type,value',
  });

  return addVariationPriceSummary(products, variations);
}

export async function getProducts(options?: StoreQueryInput) {
  const products = await pb.collection('products').getFullList({
    filter: await storeFilter('active = true', options),
    sort: '-created',
    expand: 'category,subcategory',
  });

  return attachVariationPriceSummary(products
    .filter(isProductPublicVisible)
    .map(addProductImages));
}

export async function getFeaturedProducts(options?: StoreQueryInput) {
  const products = await pb.collection('products').getFullList({
    filter: await storeFilter('active = true && featured = true', options),
    sort: 'featured_order,-updated',
    expand: 'category,subcategory',
  });

  return attachVariationPriceSummary(products
    .filter(isProductPublicVisible)
    .map(addProductImages));
}

function addVisualItemFiles(item: any) {
  const image = normalizeFileValue(item.image)[0] || '';
  const attachment = normalizeFileValue(item.attachment)[0] || '';

  return {
    ...item,
    imageUrl: image ? getPocketBaseFileUrl('store_visual_items', item.id, image) : null,
    attachmentUrl: attachment ? getPocketBaseFileUrl('store_visual_items', item.id, attachment) : null,
  };
}

export async function getStoreVisualItems(options?: StoreQueryInput) {
  try {
    const items = await pb.collection('store_visual_items').getFullList({
      filter: await storeFilter('active = true', options),
      sort: 'sort_order,title',
      expand: 'category',
    });

    return items.map(addVisualItemFiles);
  } catch (error) {
    return [];
  }
}

function addGiftFiles(gift: any) {
  const image = normalizeFileValue(gift.image)[0] || '';
  return {
    ...gift,
    imageUrl: image ? getPocketBaseFileUrl('gifts', gift.id, image) : null,
  };
}

export async function getPublicGifts(options?: StoreQueryInput) {
  try {
    const gifts = await pb.collection('gifts').getFullList({
      filter: await storeFilter('active = true && stock > 0', options),
      sort: 'sort_order,name',
    });
    return gifts.map(addGiftFiles);
  } catch (error) {
    return [];
  }
}

export async function getAutomaticPromotions(options?: StoreQueryInput) {
  try {
    return await pb.collection('automatic_promotions').getFullList({
      filter: await storeFilter('active = true', options),
      sort: 'priority,-updated',
    });
  } catch (error) {
    return [];
  }
}

function emptyReviewSummary(): ReviewSummary {
  return {
    average: 0,
    roundedAverage: 0,
    count: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  };
}

function buildReviewSummary(reviews: any[]): ReviewSummary {
  const summary = emptyReviewSummary();

  reviews.forEach((review) => {
    const rating = Number(review.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;
    summary.count += 1;
    summary.distribution[rating as 1 | 2 | 3 | 4 | 5] += 1;
    summary.average += rating;
  });

  if (!summary.count) return summary;

  summary.average = Number((summary.average / summary.count).toFixed(2));
  summary.roundedAverage = Math.round(summary.average);
  return summary;
}

function emptyProductReviewSummaries(productIds: string[]) {
  return productIds.reduce<Record<string, ReviewSummary>>((acc, productId) => {
    acc[productId] = emptyReviewSummary();
    return acc;
  }, {});
}

function isReviewsCollectionMissing(error: any) {
  const status = error?.status;
  const message = String(error?.message || error?.data?.message || '').toLowerCase();
  return status === 404 || message.includes('reviews') || message.includes('collection');
}

function clampReviewLimit(limit: number) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed)) return 8;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

async function getApprovedReviews(baseFilter: string, options?: StoreQueryInput, queryOptions: Record<string, any> = {}) {
  try {
    return await pb.collection('reviews').getFullList({
      filter: await storeFilter(`status = "approved" && ${baseFilter}`, options),
      ...queryOptions,
    });
  } catch (error) {
    if (isReviewsCollectionMissing(error)) return [];
    return [];
  }
}

export async function getStoreReviewSummary(options?: StoreQueryInput): Promise<ReviewSummary> {
  const reviews = await getApprovedReviews('type = "store"', options, {
    fields: 'id,rating',
  });
  return buildReviewSummary(reviews);
}

export async function getStoreReviews(options?: StoreQueryInput, limit = 8) {
  return await getApprovedReviews('type = "store"', options, {
    sort: '-featured,-created',
    perPage: clampReviewLimit(limit),
  });
}

export async function getProductReviewSummary(productId: string, options?: StoreQueryInput): Promise<ReviewSummary> {
  if (!productId) return emptyReviewSummary();

  const productFilter = `type = "product" && product = "${escapePocketBaseValue(productId)}"`;
  const reviews = await getApprovedReviews(productFilter, options, {
    fields: 'id,rating',
  });
  return buildReviewSummary(reviews);
}

export async function getProductReviewSummaries(productIds: string[], options?: StoreQueryInput) {
  const uniqueProductIds = Array.from(new Set((productIds || []).filter(Boolean).map(String)));
  const summaries = emptyProductReviewSummaries(uniqueProductIds);

  if (!uniqueProductIds.length) return summaries;

  const productFilter = uniqueProductIds
    .map((productId) => `product = "${escapePocketBaseValue(productId)}"`)
    .join(' || ');
  const reviews = await getApprovedReviews(`type = "product" && (${productFilter})`, options, {
    fields: 'id,product,rating',
  });

  const grouped = reviews.reduce<Record<string, any[]>>((acc, review: any) => {
    if (!review.product || !summaries[review.product]) return acc;
    acc[review.product] = acc[review.product] || [];
    acc[review.product].push(review);
    return acc;
  }, {});

  uniqueProductIds.forEach((productId) => {
    summaries[productId] = buildReviewSummary(grouped[productId] || []);
  });

  return summaries;
}

export async function getProductReviews(productId: string, options?: StoreQueryInput, limit = 8) {
  if (!productId) return [];

  return await getApprovedReviews(`type = "product" && product = "${escapePocketBaseValue(productId)}"`, options, {
    sort: '-featured,-created',
    perPage: clampReviewLimit(limit),
  });
}

function validatePublicReviewPayload(payload: PublicReviewPayload & Record<string, any>) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('La resena no tiene datos validos.');
  }

  if (payload.status && payload.status !== 'pending') {
    throw new Error('Las resenas publicas solo pueden crearse como pending.');
  }
  if ('approved' in payload || 'approved_at' in payload || 'admin_note' in payload || 'featured' in payload) {
    throw new Error('La resena publica contiene campos administrativos no permitidos.');
  }
  if (payload.verified_purchase === true) {
    throw new Error('Una resena publica normal no puede marcarse como compra verificada.');
  }
  if (payload.type !== 'store' && payload.type !== 'product') {
    throw new Error('El tipo de resena debe ser store o product.');
  }
  if (payload.source !== 'public_store' && payload.source !== 'public_product') {
    throw new Error('El origen de la resena publica no es valido.');
  }
  if (payload.type === 'store' && payload.source !== 'public_store') {
    throw new Error('Las resenas de tienda deben usar source public_store.');
  }
  if (payload.type === 'product' && payload.source !== 'public_product') {
    throw new Error('Las resenas de producto deben usar source public_product.');
  }
  if (payload.type === 'product' && !payload.product) {
    throw new Error('Las resenas de producto requieren product.');
  }

  const rating = Number(payload.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error('El rating debe ser un numero entero entre 1 y 5.');
  }
  if (!String(payload.customer_name || '').trim()) {
    throw new Error('El nombre del cliente es obligatorio.');
  }
  if (payload.comment && String(payload.comment).length > 1200) {
    throw new Error('El comentario no puede superar 1200 caracteres.');
  }
}

function isMissingCustomerContactField(error: any) {
  const text = JSON.stringify(error?.data || error || {}).toLowerCase();
  return text.includes('customer_contact') && (text.includes('unknown') || text.includes('invalid') || text.includes('field'));
}

export async function createPublicReview(payload: PublicReviewPayload, options?: StoreQueryInput) {
  validatePublicReviewPayload(payload as PublicReviewPayload & Record<string, any>);

  const storeId = await resolveStoreId(options);
  const reviewData: Record<string, any> = {
    type: payload.type,
    rating: Number(payload.rating),
    customer_name: String(payload.customer_name).trim(),
    comment: payload.comment ? String(payload.comment).slice(0, 1200) : '',
    source: payload.source,
    status: 'pending',
    verified_purchase: false,
    featured: false,
    store: storeId,
  };

  if (payload.type === 'product') {
    reviewData.product = payload.product;
  }
  if (payload.customer_contact) {
    reviewData.customer_contact = String(payload.customer_contact).trim();
  }

  try {
    return await pb.collection('reviews').create(reviewData);
  } catch (error) {
    if (!reviewData.customer_contact || !isMissingCustomerContactField(error)) throw error;
    delete reviewData.customer_contact;
    return await pb.collection('reviews').create(reviewData);
  }
}

function promotionDateTime(value: any, boundary: 'start' | 'end' = 'start') {
  if (!value) return 0;
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number);
    const date = boundary === 'end'
      ? new Date(year, month - 1, day, 23, 59, 59, 999)
      : new Date(year, month - 1, day, 0, 0, 0, 0);
    return date.getTime();
  }
  const time = new Date(text).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function getProductAutomaticPromotionText(product: any, promotions: any[] = []) {
  const now = Date.now();
  const active = promotions.filter((promotion: any) => {
    const starts = promotionDateTime(promotion.starts_at, 'start');
    const ends = promotionDateTime(promotion.ends_at, 'end');
    if (starts && starts > now) return false;
    if (ends && ends < now) return false;
    return promotion.active !== false;
  });

  const candidates = active.filter((promotion: any) => {
    if (promotion.type === 'cart_subtotal_discount' || promotion.scope === 'cart') return false;
    if ((promotion.type === 'product_discount' || promotion.scope === 'product') && promotion.product === product.id) return true;
    if ((promotion.type === 'subcategory_discount' || promotion.scope === 'subcategory') && promotion.subcategory === product.subcategory) return true;
    if ((promotion.type === 'category_discount' || promotion.scope === 'category') && promotion.category === product.category) return true;
    if ((promotion.type === 'buy_x_pay_y' || promotion.type === 'volume_discount') && promotion.product === product.id) return true;
    return false;
  });

  if (!candidates.length) return '';
  const promotion = candidates[0];
  if (promotion.badge_text) return promotion.badge_text;
  if (promotion.type === 'buy_x_pay_y') return `Compra ${promotion.buy_qty} y paga ${promotion.pay_qty}`;
  if (promotion.discount_type === 'percentage') return `${Number(promotion.discount_value || 0)}% OFF automático`;
  if (promotion.discount_type === 'fixed_usd') return `${Number(promotion.discount_value || 0).toFixed(2)} USD de descuento`;
  return promotion.name || '';
}

export async function getProductBySlug(slug: string, options?: StoreQueryInput) {
  const filter = await storeFilter(`slug="${escapePocketBaseValue(slug)}" && active=true`, options);
  const product = await pb
    .collection('products')
    .getFirstListItem(filter, {
      expand: 'category,subcategory',
    });

  if (!isProductPublicVisible(product)) {
    throw new Error('Producto no disponible en el catálogo público.');
  }

  return addProductImages(product);
}

export async function getProductVariations(productId: string) {
  if (!productId) return [];

  const filter = `product="${productId}" && active=true`;
  const variations = await pb.collection('product_variations').getFullList({
    filter,
    sort: 'sort_order,variation_type,value',
  });

  return variations.map(addVariationImages);
}

export async function getShippingZones(options?: StoreQueryInput) {
  return await pb.collection('shipping_zones').getFullList({
    filter: await storeFilter('active = true', options),
    sort: 'municipality,zone',
  });
}
