export const PRODUCT_IMAGE_PHYSICAL_LIMIT = 4;
export const PRODUCT_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const PRODUCT_IMAGE_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function normalizeNonNegativeInteger(value, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(maximum, Math.floor(number)));
}

export function normalizeProductImageLimit(value) {
  return normalizeNonNegativeInteger(value, PRODUCT_IMAGE_PHYSICAL_LIMIT);
}

export function resolveProductImageActiveLimitFromAccess(access) {
  const limit = Number(access?.limit);
  if (!access?.allowed || !Number.isInteger(limit) || limit < 0 || limit > PRODUCT_IMAGE_PHYSICAL_LIMIT) return 0;
  return limit;
}

export function parseProductImageOrder(value) {
  let parsed = value;
  if (typeof parsed === 'string') {
    if (!parsed.trim()) return [];
    try {
      parsed = JSON.parse(parsed);
    } catch (_) {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const result = [];
  parsed.forEach((entry) => {
    const name = String(entry || '').trim();
    if (name && !result.includes(name)) result.push(name);
  });
  return result;
}

export function getOrderedProductImageNames(product) {
  const files = Array.isArray(product?.images)
    ? product.images.map(String).filter(Boolean)
    : product?.images
      ? [String(product.images)]
      : [];
  const uniqueFiles = [...new Set(files)].slice(0, PRODUCT_IMAGE_PHYSICAL_LIMIT);
  const order = parseProductImageOrder(product?.image_order);
  return order
    .filter((filename) => uniqueFiles.includes(filename))
    .concat(uniqueFiles.filter((filename) => !order.includes(filename)))
    .slice(0, PRODUCT_IMAGE_PHYSICAL_LIMIT);
}

export function getPublicProductImageNamesForLimit(product, activeImageLimit) {
  return getOrderedProductImageNames(product).slice(0, normalizeProductImageLimit(activeImageLimit));
}

export function getProductImageSlotStates(product, activeImageLimit) {
  const limit = normalizeProductImageLimit(activeImageLimit);
  const ordered = getOrderedProductImageNames(product);
  return Array.from({ length: PRODUCT_IMAGE_PHYSICAL_LIMIT }, (_, index) => ({
    index,
    active: index < limit,
    locked: index >= limit,
    existing: ordered[index] || '',
    conserved: index >= limit && Boolean(ordered[index]),
  }));
}

export function validateProductImageFileMetadata(file) {
  const type = String(file?.type || '').toLowerCase();
  const size = Number(file?.size);
  if (!PRODUCT_IMAGE_MIME_TYPES.includes(type)) {
    return Object.freeze({ valid: false, code: 'invalid_product_image_type' });
  }
  if (!Number.isFinite(size) || size <= 0 || size > PRODUCT_IMAGE_MAX_BYTES) {
    return Object.freeze({ valid: false, code: 'invalid_product_image_size' });
  }
  return Object.freeze({ valid: true, code: 'allowed' });
}

export function getProductImageAdmission(input) {
  const limit = normalizeProductImageLimit(input?.activeImageLimit);
  const occupied = normalizeNonNegativeInteger(input?.occupiedActiveSlots, limit);
  const incoming = normalizeNonNegativeInteger(input?.incomingFiles);
  const available = Math.max(0, limit - occupied);
  const accepted = Math.min(available, incoming);
  return Object.freeze({
    limit,
    available,
    accepted,
    rejected: Math.max(0, incoming - accepted),
  });
}

export function getProductImageUsageFromSlots(slotsValue, activeImageLimit) {
  const limit = normalizeProductImageLimit(activeImageLimit);
  const slots = Array.from(slotsValue || [])
    .slice(0, PRODUCT_IMAGE_PHYSICAL_LIMIT)
    .map((value) => Boolean(value));
  while (slots.length < PRODUCT_IMAGE_PHYSICAL_LIMIT) slots.push(false);
  const used = slots.slice(0, limit).filter(Boolean).length;
  const conserved = slots.slice(limit).filter(Boolean).length;
  return Object.freeze({
    used,
    limit,
    remaining: Math.max(0, limit - used),
    conserved,
    full: used >= limit,
  });
}

export function classifyProductImageDrop(input) {
  const incomingFiles = normalizeNonNegativeInteger(input?.incomingFiles);
  if (input?.context === 'single-slot') {
    const processCount = Math.min(1, incomingFiles);
    return Object.freeze({
      processCount,
      planLimitRejectedCount: 0,
      singleSlotExtraCount: Math.max(0, incomingFiles - processCount),
    });
  }

  const availableSlots = normalizeNonNegativeInteger(input?.availableSlots, PRODUCT_IMAGE_PHYSICAL_LIMIT);
  const processCount = Math.min(availableSlots, incomingFiles);
  return Object.freeze({
    processCount,
    planLimitRejectedCount: Math.max(0, incomingFiles - processCount),
    singleSlotExtraCount: 0,
  });
}

function acceptedPhotoSentence(count) {
  if (count === 1) return 'Se aceptó 1 foto.';
  if (count > 1) return `Se aceptaron ${count} fotos.`;
  return 'No se aceptaron fotos.';
}

function discardedFileSentence(count, singularReason, pluralReason = singularReason) {
  if (count === 1) return `Se descartó 1 archivo ${singularReason}.`;
  return `Se descartaron ${count} archivos ${pluralReason}.`;
}

export function buildProductImageDropFeedback(input) {
  const acceptedCount = normalizeNonNegativeInteger(input?.acceptedCount, PRODUCT_IMAGE_PHYSICAL_LIMIT);
  const invalidCount = normalizeNonNegativeInteger(input?.invalidCount);
  const planLimitRejectedCount = normalizeNonNegativeInteger(input?.planLimitRejectedCount);
  const singleSlotExtraCount = normalizeNonNegativeInteger(input?.singleSlotExtraCount);
  const invalidMessage = String(input?.invalidMessage || '').trim();
  const hasRejections = invalidCount + planLimitRejectedCount + singleSlotExtraCount > 0;

  if (!hasRejections && acceptedCount > 0) {
    return Object.freeze({
      type: 'success',
      message: acceptedCount === 1
        ? '1 foto preparada para guardar.'
        : `${acceptedCount} fotos preparadas para guardar.`,
    });
  }

  const sentences = [acceptedPhotoSentence(acceptedCount)];
  if (invalidCount > 0) {
    sentences.push(invalidCount === 1 && invalidMessage
      ? `${invalidMessage.replace(/[.!?]+$/, '')}.`
      : discardedFileSentence(invalidCount, 'inválido', 'inválidos'));
  }
  if (planLimitRejectedCount > 0) {
    sentences.push(discardedFileSentence(
      planLimitRejectedCount,
      'fuera del límite activo del plan',
      'fuera del límite activo del plan',
    ));
  }
  if (singleSlotExtraCount > 0) {
    const discarded = singleSlotExtraCount === 1
      ? 'se descartó 1 archivo adicional.'
      : `se descartaron ${singleSlotExtraCount} archivos adicionales.`;
    sentences.push(`Este espacio solo permite una foto a la vez; ${discarded}`);
  }

  return Object.freeze({
    type: 'error',
    message: sentences.join(' '),
  });
}
