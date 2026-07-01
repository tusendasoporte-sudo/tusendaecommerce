export type ProductSeoExtraInfoItem = {
  label: string;
  value: string;
};

export const PRODUCT_OG_WIDTH = 1200;
export const PRODUCT_OG_HEIGHT = 630;

export function cleanSeoText(value: unknown, fallback = '') {
  return String(value ?? fallback)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function limitSeoText(value: unknown, max = 120) {
  const text = cleanSeoText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function firstCleanText(...values: unknown[]) {
  for (const value of values) {
    const text = cleanSeoText(value);
    if (text) return text;
  }
  return '';
}

function normalizeForMatch(value: unknown) {
  return cleanSeoText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function parseProductExtraInfo(value: unknown, limit = 12): ProductSeoExtraInfoItem[] {
  if (!value) return [];
  let current = value;

  for (let index = 0; index < 3 && typeof current === 'string'; index += 1) {
    const cleaned = current.trim();
    if (!cleaned) return [];

    try {
      current = JSON.parse(cleaned);
    } catch (_) {
      return cleaned
        .split('\n')
        .map((line) => {
          const [label, ...rest] = line.split(':');
          return {
            label: cleanSeoText(label),
            value: cleanSeoText(rest.join(':')),
          };
        })
        .filter((item) => item.label && item.value)
        .slice(0, limit);
    }
  }

  if (current && !Array.isArray(current) && typeof current === 'object') {
    const record = current as any;
    current = record.items || record.data || record.values || [record];
  }

  return Array.isArray(current)
    ? current
      .map((item: any) => ({
        label: firstCleanText(item?.label, item?.name, item?.title, item?.key, item?.dato),
        value: firstCleanText(item?.value, item?.description, item?.text, item?.valor),
      }))
      .filter((item) => item.label && item.value)
      .slice(0, limit)
    : [];
}

export function pickProductSeoExtraInfo(items: ProductSeoExtraInfoItem[], max = 3) {
  const safeItems = Array.isArray(items)
    ? items.filter((item) => cleanSeoText(item?.label) && cleanSeoText(item?.value))
    : [];
  const selected: ProductSeoExtraInfoItem[] = [];

  const addFirstMatch = (patterns: RegExp[]) => {
    if (selected.length >= max) return;
    const found = safeItems.find((item) => {
      if (selected.includes(item)) return false;
      const label = normalizeForMatch(item.label);
      const combined = normalizeForMatch(`${item.label} ${item.value}`);
      return patterns.some((pattern) => pattern.test(label) || pattern.test(combined));
    });
    if (found) selected.push(found);
  };

  addFirstMatch([/\b(marca|brand|fabricante|laboratorio)\b/]);
  addFirstMatch([/\b(cantidad|contenido|presentacion|capsulas|tabletas|servicios|servicio|servcios|porciones|unidades)\b/]);
  addFirstMatch([/\b(gramaje|tamano|sabor|medida|peso|volumen|talla|color|formato)\b/]);

  for (const item of safeItems) {
    if (selected.length >= max) break;
    if (!selected.includes(item)) selected.push(item);
  }

  return selected.slice(0, max).map((item) => ({
    label: formatProductSeoInfoLabel(item.label),
    value: limitSeoText(item.value, 56),
  }));
}

function formatProductSeoInfoLabel(label: unknown) {
  const text = cleanSeoText(label);
  const normalized = normalizeForMatch(text);
  if (normalized === 'servcios') return 'Servicios';
  return limitSeoText(text, 30);
}

export function formatProductSeoPrice(value: unknown) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return '';
  return number.toFixed(2);
}

export function getVariationRegularPrice(variation: any) {
  const price = Number(variation?.price_usd ?? variation?.precio_usd ?? 0);
  return Number.isFinite(price) ? Math.max(0, price) : 0;
}

export function getVariationPublicPrice(variation: any) {
  const regularPrice = getVariationRegularPrice(variation);
  const offerPrice = Math.max(0, Number(variation?.offer_price_usd || 0));
  return Boolean(variation?.is_offer) && offerPrice > 0 && offerPrice < regularPrice
    ? offerPrice
    : regularPrice;
}

export function getProductPublicSeoPrice(product: any, variations: any[] = []) {
  const publicVariations = Array.isArray(variations) ? variations : [];
  if (publicVariations.length > 0) {
    const tracksStock = product?.track_stock !== false;
    const availablePrices = publicVariations
      .filter((variation) => {
        const price = getVariationPublicPrice(variation);
        if (price <= 0) return false;
        if (!tracksStock) return true;
        return Number(variation?.stock || 0) > 0 || Boolean(variation?.allow_preorder);
      })
      .map((variation) => getVariationPublicPrice(variation));
    const fallbackPrices = publicVariations
      .map((variation) => getVariationPublicPrice(variation))
      .filter((price) => price > 0);
    const prices = availablePrices.length ? availablePrices : fallbackPrices;
    return prices.length ? Math.min(...prices) : 0;
  }

  const price = Number(product?.base_price_usd || product?.public_price_usd || 0);
  return Number.isFinite(price) ? Math.max(0, price) : 0;
}

export function buildProductSeoTitle(productName: unknown, price: unknown) {
  const name = limitSeoText(productName, 76) || 'Producto';
  const priceText = formatProductSeoPrice(price);
  return priceText ? `${name} | $${priceText}` : name;
}

export function buildProductSeoDescription(input: {
  productName?: unknown;
  extraInfoItems?: ProductSeoExtraInfoItem[];
  storeName?: unknown;
  formattedPrice?: unknown;
  price?: unknown;
}) {
  const storeName = cleanSeoText(input.storeName, 'la tienda') || 'la tienda';
  const formattedInputPrice = cleanSeoText(input.formattedPrice);
  const numericPrice = formatProductSeoPrice(input.price);
  const priceText = formattedInputPrice || (numericPrice ? `$${numericPrice}` : '');
  const details = pickProductSeoExtraInfo(input.extraInfoItems || [], 3)
    .filter((item) => !/\b(precio|price)\b/.test(normalizeForMatch(item.label)))
    .map((item) => `${item.label}: ${item.value}`)
    .slice(0, 3);
  const parts = priceText ? [`Precio: ${priceText}`, ...details] : details;
  const shouldAddWhatsAppHint = details.length === 0;
  const description = parts.length
    ? `${parts.join(' · ')}. Disponible en ${storeName}.${shouldAddWhatsAppHint ? ' Compra fácil por WhatsApp.' : ''}`
    : `Disponible en ${storeName}. Compra fácil por WhatsApp.`;

  return limitSeoText(description, 155);
}

function cleanWhatsAppBoldText(value: unknown, fallback = '') {
  return cleanSeoText(value, fallback).replace(/\*/g, '').trim();
}

export function buildProductShareMessage(input: {
  productName?: unknown;
  extraInfoItems?: ProductSeoExtraInfoItem[];
  storeName?: unknown;
  formattedPrice?: unknown;
  price?: unknown;
}) {
  const productName = cleanWhatsAppBoldText(input.productName, 'Producto') || 'Producto';
  const storeName = cleanSeoText(input.storeName, 'la tienda') || 'la tienda';
  const formattedInputPrice = cleanSeoText(input.formattedPrice);
  const numericPrice = formatProductSeoPrice(input.price);
  const priceText = formattedInputPrice || (numericPrice ? `$${numericPrice}` : '');
  const details = pickProductSeoExtraInfo(input.extraInfoItems || [], 3)
    .filter((item) => !/\b(precio|price)\b/.test(normalizeForMatch(item.label)))
    .map((item) => `${item.label}: ${item.value}`)
    .slice(0, 3);
  const heading = priceText
    ? `*${productName}* | *${cleanWhatsAppBoldText(priceText)}*`
    : `*${productName}*`;

  if (!details.length) {
    return `${heading}\n\nDisponible en ${storeName}. Compra fácil por WhatsApp.`;
  }

  const detailLines = details.map((detail, index) => (index === 0 ? detail : `· ${detail}`));
  return `${heading}\n\n${detailLines.join('\n')}\n\nDisponible en ${storeName}.`;
}

export function buildProductSocialImageAlt(productName: unknown, storeName: unknown) {
  const product = cleanSeoText(productName, 'Producto') || 'Producto';
  const store = cleanSeoText(storeName);
  return limitSeoText(store ? `${product} en ${store}` : product, 125);
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function serializeFingerprint(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

export function getProductSeoVersion(input: {
  product?: any;
  settings?: any;
  price?: unknown;
  extraInfoItems?: ProductSeoExtraInfoItem[];
}) {
  const product = input.product || {};
  const settings = input.settings || {};
  const fingerprint = [
    product.id,
    product.updated,
    product.slug,
    product.name,
    product.image,
    product.images,
    product.image_order,
    product.base_price_usd,
    product.regular_price_usd,
    product.is_offer,
    product.public_price_usd,
    product.variation_price_min_usd,
    product.variation_price_max_usd,
    input.price,
    product.extra_info,
    product.extraInfo,
    product.additional_info,
    product.product_extra_info,
    input.extraInfoItems,
    settings.id,
    settings.updated,
    settings.store_name,
    settings.stored_name,
    settings.logo_image,
    settings.logoImageUrl,
  ].map(serializeFingerprint).join('|');

  return hashString(fingerprint);
}

export function buildProductSocialImagePath(input: {
  storeSlug: unknown;
  productSlug: unknown;
  version?: unknown;
}) {
  const storeSlug = encodeURIComponent(cleanSeoText(input.storeSlug).toLowerCase());
  const productSlug = encodeURIComponent(cleanSeoText(input.productSlug));
  if (!storeSlug || !productSlug) return '';

  const version = cleanSeoText(input.version);
  return `/api/og/producto/${storeSlug}/${productSlug}.png${version ? `?v=${encodeURIComponent(version)}` : ''}`;
}
