import { resolveStoreCapabilityAccess, type StoreCapabilityValues } from './storeCapabilities.ts';
import {
  getPublicProductImageNamesForLimit,
  resolveProductImageActiveLimitFromAccess,
} from './productImageLimitsCore.js';

export {
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_MIME_TYPES,
  PRODUCT_IMAGE_PHYSICAL_LIMIT,
  buildProductImageDropFeedback,
  classifyProductImageDrop,
  getOrderedProductImageNames,
  getProductImageAdmission,
  getProductImageSlotStates,
  getPublicProductImageNamesForLimit,
  normalizeProductImageLimit,
  parseProductImageOrder,
  resolveProductImageActiveLimitFromAccess,
  validateProductImageFileMetadata,
} from './productImageLimitsCore.js';

export function resolveProductImageActiveLimit(store: StoreCapabilityValues | null | undefined) {
  const access = resolveStoreCapabilityAccess(store, 'max_product_images');
  return resolveProductImageActiveLimitFromAccess(access);
}

export function getPublicProductImageNames(product: any, storeOrLimit: StoreCapabilityValues | number | null | undefined) {
  const limit = typeof storeOrLimit === 'number'
    ? storeOrLimit
    : resolveProductImageActiveLimit(storeOrLimit);
  return getPublicProductImageNamesForLimit(product, limit);
}
