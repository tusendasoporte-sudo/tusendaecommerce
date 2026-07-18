export const PRODUCT_EXPIRATION_TIME_ZONE = 'America/Havana';
export const PRODUCT_EXPIRATION_THRESHOLDS = Object.freeze([90, 60, 30, 0]);

const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function normalizeExpirationCivilDate(value) {
  if (value === null || value === undefined || value === '') return '';
  const raw = value instanceof Date ? value.toISOString() : String(value).trim();
  const candidate = raw.slice(0, 10);
  const match = CIVIL_DATE_PATTERN.exec(candidate);
  if (!match) return '';
  if (raw.length > 10 && !/^\d{4}-\d{2}-\d{2}(?:[ T]00:00:00(?:\.\d{1,9})?Z?)?$/.test(raw)) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day
    ? candidate
    : '';
}

export function getHavanaCivilDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone: PRODUCT_EXPIRATION_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const mapped = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${mapped.year}-${mapped.month}-${mapped.day}`;
}

function civilDayNumber(value) {
  const date = normalizeExpirationCivilDate(value);
  if (!date) return null;
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

export function getExpirationDaysLeft(expirationDate, now = new Date()) {
  const target = civilDayNumber(expirationDate);
  const today = civilDayNumber(getHavanaCivilDateKey(now));
  return target === null || today === null ? null : target - today;
}

export function isExpirationDateExpired(expirationDate, now = new Date()) {
  const days = getExpirationDaysLeft(expirationDate, now);
  return days !== null && days <= 0;
}

function relationId(value) {
  if (Array.isArray(value)) return relationId(value[0]);
  if (value && typeof value === 'object') return String(value.id || '').trim();
  return String(value || '').trim();
}

function variationOtherwiseSellable(product, variation) {
  if (!variation || variation.active === false) return false;
  const price = Number(variation.price_usd ?? variation.precio_usd ?? 0);
  if (!(price > 0)) return false;
  if (product?.track_stock === false) return true;
  return Number(variation.stock || 0) > 0 || variation.allow_preorder === true;
}

export function filterPublicCatalogByExpirationAccess(products, variations, expirationEnabled, now = new Date()) {
  const sourceProducts = Array.isArray(products) ? products : [];
  const sourceVariations = Array.isArray(variations) ? variations : [];
  if (expirationEnabled !== true) return { products: sourceProducts, variations: sourceVariations };

  const variationsByProduct = new Map();
  sourceVariations.forEach((variation) => {
    const productId = relationId(variation?.product);
    const current = variationsByProduct.get(productId) || [];
    current.push(variation);
    variationsByProduct.set(productId, current);
  });

  const allowedProductIds = new Set();
  const filteredProducts = sourceProducts.filter((product) => {
    const generalDate = normalizeExpirationCivilDate(product?.expiration_date);
    if (generalDate && isExpirationDateExpired(generalDate, now)) return false;
    const productVariations = variationsByProduct.get(String(product?.id || '')) || [];
    const hasOwnDates = productVariations.some((variation) => normalizeExpirationCivilDate(variation?.expiration_date));
    if (product?.has_variations === true && hasOwnDates) {
      const candidates = productVariations.filter((variation) => variationOtherwiseSellable(product, variation));
      if (candidates.length && candidates.every((variation) => {
        const date = normalizeExpirationCivilDate(variation?.expiration_date);
        return Boolean(date) && isExpirationDateExpired(date, now);
      })) return false;
    }
    allowedProductIds.add(String(product?.id || ''));
    return true;
  });

  const filteredVariations = sourceVariations.filter((variation) => {
    const productId = relationId(variation?.product);
    if (!allowedProductIds.has(productId)) return false;
    const siblings = variationsByProduct.get(productId) || [];
    const hasOwnDates = siblings.some((item) => normalizeExpirationCivilDate(item?.expiration_date));
    if (!hasOwnDates) return true;
    const date = normalizeExpirationCivilDate(variation?.expiration_date);
    return !date || !isExpirationDateExpired(date, now);
  });
  return { products: filteredProducts, variations: filteredVariations };
}
