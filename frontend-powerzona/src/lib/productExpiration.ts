import { resolveStoreCapabilityAccess } from './storeCapabilities.ts';
import {
  filterPublicCatalogByExpirationAccess,
  getExpirationDaysLeft,
  getHavanaCivilDateKey,
  isExpirationDateExpired,
  normalizeExpirationCivilDate,
} from './productExpirationCore.js';

export {
  PRODUCT_EXPIRATION_THRESHOLDS,
  PRODUCT_EXPIRATION_TIME_ZONE,
  getExpirationDaysLeft,
  getHavanaCivilDateKey,
  isExpirationDateExpired,
  normalizeExpirationCivilDate,
} from './productExpirationCore.js';

export function productExpirationEnabled(store: any) {
  return resolveStoreCapabilityAccess(store, 'product_expiration_tools_enabled').allowed === true;
}

export function filterPublicCatalogByExpiration(products: any[], variations: any[], store: any, now: Date | string | number = new Date()) {
  return filterPublicCatalogByExpirationAccess(products, variations, productExpirationEnabled(store), now);
}

export function isPublicProductAllowedByExpiration(product: any, variations: any[], store: any, now: Date | string | number = new Date()) {
  return filterPublicCatalogByExpiration([product], variations, store, now).products.length === 1;
}
