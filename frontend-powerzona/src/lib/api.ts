import { pb, getPocketBaseFileUrl } from './pocketbase';
import { getCurrentStore } from './stores';

type StoreQueryOptions = {
  storeId?: string;
};

type StoreQueryInput = string | StoreQueryOptions | undefined;

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

// PZ-API-SETTINGS-V6-REGALOS-FOTOS-THUMB-20260604
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

// PZ-API-PUBLIC-SUBCATEGORIES-V1-20260603
export async function getSubcategories(options?: StoreQueryInput) {
  const subcategories = await pb.collection('subcategories').getFullList({
    filter: await storeFilter('active = true', options),
    sort: 'order,name',
    expand: 'category',
  });

  return subcategories.filter((subcategory: any) => {
    const categoryIsVisible = !subcategory.category || subcategory.expand?.category?.active === true;
    return subcategory.active === true && categoryIsVisible;
  });
}

export async function getCurrencies() {
  return await pb.collection('currencies').getFullList({
    filter: 'active = true',
    sort: 'code',
  });
}

// PZ-API-PUBLIC-PRODUCTS-V26-GALERIA-PORTADA-20260603
// Reglas públicas:
// - Producto visible sin categoría => aparece en la página principal.
// - Producto visible con categoría visible => aparece.
// - Producto visible con categoría oculta => no aparece.
// - Producto visible con subcategoría oculta => no aparece.
// - Variaciones visibles => solo active=true y ordenadas por sort_order, tipo y valor.
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

export async function getProducts(options?: StoreQueryInput) {
  const products = await pb.collection('products').getFullList({
    filter: await storeFilter('active = true', options),
    sort: '-created',
    expand: 'category,subcategory',
  });

  return products
    .filter(isProductPublicVisible)
    .map(addProductImages);
}

// PZ-API-FEATURED-ORDER-V1-20260603
export async function getFeaturedProducts(options?: StoreQueryInput) {
  const products = await pb.collection('products').getFullList({
    filter: await storeFilter('active = true && featured = true', options),
    sort: 'featured_order,-updated',
    expand: 'category,subcategory',
  });

  return products
    .filter(isProductPublicVisible)
    .map(addProductImages);
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
    console.warn('store_visual_items no disponible todavía. Reinicia PocketBase para aplicar la migración.', error);
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
    console.warn('gifts no disponible todavía. Reinicia PocketBase para aplicar la migración de regalos.', error);
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
    console.warn('automatic_promotions no disponible todavÃ­a. Reinicia PocketBase para aplicar la migraciÃ³n.', error);
    return [];
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
