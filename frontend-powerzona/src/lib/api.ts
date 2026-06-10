import { pb, getPocketBaseFileUrl } from './pocketbase';

// PZ-API-SETTINGS-V6-REGALOS-FOTOS-THUMB-20260604
export async function getSettings() {
  const records = await pb.collection('settings').getFullList({
    filter: 'active = true',
    expand: 'default_currency',
  });

  const settings = records[0] ?? null;
  if (!settings) return null;

  const logo = normalizeFileValue(settings.logo_image)[0] || '';
  const cover = normalizeFileValue(settings.cover_image)[0] || '';
  const giftsPublicImage = normalizeFileValue(settings.gifts_public_image)[0] || '';

  return {
    ...settings,
    logoImageUrl: logo ? getPocketBaseFileUrl('settings', settings.id, logo) : null,
    coverImageUrl: cover ? getPocketBaseFileUrl('settings', settings.id, cover) : null,
    giftsPublicImageUrl: giftsPublicImage ? getPocketBaseFileUrl('settings', settings.id, giftsPublicImage) : null,
  };
}

export async function getCategories() {
  const categories = await pb.collection('categories').getFullList({
    filter: 'active = true',
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
export async function getSubcategories() {
  const subcategories = await pb.collection('subcategories').getFullList({
    filter: 'active = true',
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

export async function getProducts() {
  const products = await pb.collection('products').getFullList({
    filter: 'active = true',
    sort: '-created',
    expand: 'category,subcategory',
  });

  return products
    .filter(isProductPublicVisible)
    .map(addProductImages);
}

// PZ-API-FEATURED-ORDER-V1-20260603
export async function getFeaturedProducts() {
  const products = await pb.collection('products').getFullList({
    filter: 'active = true && featured = true',
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

export async function getStoreVisualItems() {
  try {
    const items = await pb.collection('store_visual_items').getFullList({
      filter: 'active = true',
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

export async function getPublicGifts() {
  try {
    const gifts = await pb.collection('gifts').getFullList({
      filter: 'active = true && stock > 0',
      sort: 'sort_order,name',
    });
    return gifts.map(addGiftFiles);
  } catch (error) {
    console.warn('gifts no disponible todavía. Reinicia PocketBase para aplicar la migración de regalos.', error);
    return [];
  }
}

export async function getAutomaticPromotions() {
  try {
    return await pb.collection('automatic_promotions').getFullList({
      filter: 'active = true',
      sort: 'priority,-updated',
    });
  } catch (error) {
    console.warn('automatic_promotions no disponible todavÃ­a. Reinicia PocketBase para aplicar la migraciÃ³n.', error);
    return [];
  }
}

export function getProductAutomaticPromotionText(product: any, promotions: any[] = []) {
  const now = Date.now();
  const active = promotions.filter((promotion: any) => {
    const starts = promotion.starts_at ? new Date(promotion.starts_at).getTime() : 0;
    const ends = promotion.ends_at ? new Date(promotion.ends_at).getTime() : 0;
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

export async function getProductBySlug(slug: string) {
  const product = await pb
    .collection('products')
    .getFirstListItem(`slug="${slug}" && active=true`, {
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
