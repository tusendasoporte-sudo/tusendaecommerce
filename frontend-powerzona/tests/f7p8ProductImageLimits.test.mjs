import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_MIME_TYPES,
  PRODUCT_IMAGE_PHYSICAL_LIMIT,
  buildProductImageDropFeedback,
  classifyProductImageDrop,
  getOrderedProductImageNames,
  getProductImageAdmission,
  getProductImageSlotStates,
  getPublicProductImageNamesForLimit,
  resolveProductImageActiveLimitFromAccess,
  validateProductImageFileMetadata,
} from '../src/lib/productImageLimitsCore.js';

const access = (limit, allowed = true) => ({ allowed, limit });
const product = {
  images: ['a.webp', 'b.webp', 'c.webp', 'd.webp'],
  image_order: JSON.stringify(['b.webp', 'a.webp', 'd.webp', 'c.webp']),
};

test('F7P8: normaliza acceso central con límite 2 para Free/Básico', () => {
  assert.equal(resolveProductImageActiveLimitFromAccess(access(2)), 2);
});

test('F7P8: normaliza acceso central con límite 4 para Premium', () => {
  assert.equal(resolveProductImageActiveLimitFromAccess(access(4)), 4);
  assert.equal(PRODUCT_IMAGE_PHYSICAL_LIMIT, 4);
});

test('F7P8: una tienda o capacidad inválida falla cerrada', () => {
  assert.equal(resolveProductImageActiveLimitFromAccess(null), 0);
  assert.equal(resolveProductImageActiveLimitFromAccess(access(4, false)), 0);
  assert.equal(resolveProductImageActiveLimitFromAccess(access(5)), 0);
});

test('F7P8: ordena antes de aplicar el recorte público', () => {
  assert.deepEqual(getOrderedProductImageNames(product), ['b.webp', 'a.webp', 'd.webp', 'c.webp']);
  assert.deepEqual(getPublicProductImageNamesForLimit(product, 2), ['b.webp', 'a.webp']);
});

test('F7P8: público entrega 2 para Free/Básico y 4 para Premium', () => {
  assert.equal(getPublicProductImageNamesForLimit(product, 2).length, 2);
  assert.equal(getPublicProductImageNamesForLimit(product, 4).length, 4);
});

test('F7P8: slots activos, bloqueados y cola conservada quedan identificados', () => {
  const slots = getProductImageSlotStates(product, 2);
  assert.deepEqual(slots.map((slot) => slot.active), [true, true, false, false]);
  assert.deepEqual(slots.map((slot) => slot.locked), [false, false, true, true]);
  assert.deepEqual(slots.map((slot) => slot.conserved), [false, false, true, true]);
  assert.deepEqual(slots.slice(2).map((slot) => slot.existing), ['d.webp', 'c.webp']);
});

test('F7P8: reemplazo del prefijo activo no elimina la cola conservada', () => {
  const replaced = {
    images: ['nuevo.webp', 'a.webp', 'd.webp', 'c.webp'],
    image_order: ['nuevo.webp', 'a.webp', 'd.webp', 'c.webp'],
  };
  assert.deepEqual(getOrderedProductImageNames(replaced).slice(2), ['d.webp', 'c.webp']);
  assert.deepEqual(getPublicProductImageNamesForLimit(replaced, 2), ['nuevo.webp', 'a.webp']);
});

test('F7P8: la serialización de galería pública no incluye inactivas', () => {
  const publicNames = getPublicProductImageNamesForLimit(product, 2);
  const serialized = JSON.stringify(publicNames);
  assert.equal(serialized.includes('d.webp'), false);
  assert.equal(serialized.includes('c.webp'), false);
  assert.equal(serialized, '["b.webp","a.webp"]');
});

test('F7P8: MIME usa lista cerrada JPEG, PNG y WebP', () => {
  assert.deepEqual([...PRODUCT_IMAGE_MIME_TYPES], ['image/jpeg', 'image/png', 'image/webp']);
  for (const type of PRODUCT_IMAGE_MIME_TYPES) {
    assert.deepEqual(validateProductImageFileMetadata({ type, size: 100 }), { valid: true, code: 'allowed' });
  }
  for (const type of ['image/svg+xml', 'image/gif', 'image/bmp', 'application/octet-stream', '']) {
    assert.deepEqual(validateProductImageFileMetadata({ type, size: 100 }), {
      valid: false,
      code: 'invalid_product_image_type',
    });
  }
});

test('F7P8: tamaño final máximo es exactamente 2 MiB', () => {
  assert.equal(PRODUCT_IMAGE_MAX_BYTES, 2_097_152);
  assert.equal(validateProductImageFileMetadata({ type: 'image/webp', size: PRODUCT_IMAGE_MAX_BYTES }).valid, true);
  assert.deepEqual(validateProductImageFileMetadata({ type: 'image/webp', size: PRODUCT_IMAGE_MAX_BYTES + 1 }), {
    valid: false,
    code: 'invalid_product_image_size',
  });
});

test('F7P8: admisión múltiple respeta únicamente espacios activos disponibles', () => {
  assert.deepEqual(getProductImageAdmission({ activeImageLimit: 2, occupiedActiveSlots: 1, incomingFiles: 4 }), {
    limit: 2,
    available: 1,
    accepted: 1,
    rejected: 3,
  });
  assert.deepEqual(getProductImageAdmission({ activeImageLimit: 4, occupiedActiveSlots: 1, incomingFiles: 4 }), {
    limit: 4,
    available: 3,
    accepted: 3,
    rejected: 1,
  });
});

test('F7P8-C1: slot individual con dos válidas acepta una y clasifica un excedente del slot', () => {
  const result = classifyProductImageDrop({ context: 'single-slot', incomingFiles: 2, availableSlots: 1 });
  assert.deepEqual(result, {
    processCount: 1,
    planLimitRejectedCount: 0,
    singleSlotExtraCount: 1,
  });
  const feedback = buildProductImageDropFeedback({
    acceptedCount: 1,
    invalidCount: 0,
    planLimitRejectedCount: result.planLimitRejectedCount,
    singleSlotExtraCount: result.singleSlotExtraCount,
  });
  assert.equal(
    feedback.message,
    'Se aceptó 1 foto. Este espacio solo permite una foto a la vez; se descartó 1 archivo adicional.',
  );
  assert.equal(feedback.message.includes('límite'), false);
});

test('F7P8-C1: slot individual con tres archivos procesa solo el primero y separa dos adicionales', () => {
  assert.deepEqual(
    classifyProductImageDrop({ context: 'single-slot', incomingFiles: 3, availableSlots: 1 }),
    { processCount: 1, planLimitRejectedCount: 0, singleSlotExtraCount: 2 },
  );
  const feedback = buildProductImageDropFeedback({ acceptedCount: 1, singleSlotExtraCount: 2 });
  assert.equal(feedback.message.includes('se descartaron 2 archivos adicionales'), true);
  assert.equal(feedback.message.includes('límite'), false);
});

test('F7P8-C1: slot individual con un archivo no muestra mensaje de carga múltiple', () => {
  const result = classifyProductImageDrop({ context: 'single-slot', incomingFiles: 1, availableSlots: 1 });
  assert.deepEqual(result, { processCount: 1, planLimitRejectedCount: 0, singleSlotExtraCount: 0 });
  const feedback = buildProductImageDropFeedback({ acceptedCount: 1 });
  assert.equal(feedback.type, 'success');
  assert.equal(feedback.message.includes('una foto a la vez'), false);
});

test('F7P8-C1: área general con un espacio libre separa el rechazo por límite activo', () => {
  const result = classifyProductImageDrop({ context: 'general', incomingFiles: 2, availableSlots: 1 });
  assert.deepEqual(result, { processCount: 1, planLimitRejectedCount: 1, singleSlotExtraCount: 0 });
  const feedback = buildProductImageDropFeedback({
    acceptedCount: result.processCount,
    planLimitRejectedCount: result.planLimitRejectedCount,
  });
  assert.equal(feedback.message.includes('límite activo del plan'), true);
  assert.equal(feedback.message.includes('una foto a la vez'), false);
});

test('F7P8-C1: área general Premium llena rechaza la quinta por límite del plan', () => {
  assert.deepEqual(
    classifyProductImageDrop({ context: 'general', incomingFiles: 1, availableSlots: 0 }),
    { processCount: 0, planLimitRejectedCount: 1, singleSlotExtraCount: 0 },
  );
});

test('F7P8-C1: área general Básico vacía admite dos de tres por límite 2', () => {
  assert.deepEqual(
    classifyProductImageDrop({ context: 'general', incomingFiles: 3, availableSlots: 2 }),
    { processCount: 2, planLimitRejectedCount: 1, singleSlotExtraCount: 0 },
  );
});

test('F7P8-C1: archivo inválido conserva su motivo y no se convierte en límite del plan', () => {
  const feedback = buildProductImageDropFeedback({
    acceptedCount: 0,
    invalidCount: 1,
    invalidMessage: 'Solo se permiten fotos JPEG, PNG o WebP válidas.',
  });
  assert.equal(feedback.message.includes('JPEG, PNG o WebP'), true);
  assert.equal(feedback.message.includes('límite'), false);
});

test('F7P8-C1: la prueba portable importa JavaScript puro y nunca TypeScript', () => {
  const source = readFileSync(new URL(import.meta.url), 'utf8');
  assert.equal(/from\s+['"][^'"]+\.ts['"]/.test(source), false);
  assert.equal(source.includes("from '../src/lib/productImageLimitsCore.js'"), true);
});

test('F7P8: el admin usa capacidad SSR, MIME cerrado y drag/drop real', () => {
  const source = readFileSync(new URL('../src/pages/admin/products.astro', import.meta.url), 'utf8');
  assert.equal(source.includes("resolveStoreCapabilityAccess(adminContext.store, 'max_product_images')"), true);
  assert.equal(source.includes('PRODUCT_IMAGE_PHYSICAL_LIMIT = 4'), true);
  assert.equal(source.includes('accept="image/jpeg,image/png,image/webp"'), true);
  for (const eventName of ['dragenter', 'dragover', 'dragleave', 'drop']) {
    assert.equal(source.includes(`addEventListener('${eventName}'`), true, eventName);
  }
  assert.equal(source.includes('Conservada · Premium'), true);
  assert.equal(source.includes('singleSlotExtraCount'), true);
  assert.equal(source.includes('planLimitRejectedCount'), true);
  assert.equal(source.includes('buildProductImageDropFeedback'), true);
  assert.equal(source.includes('localStorage'), false);
});

test('F7P8: las instrucciones de carga distinguen escritorio y móvil sin cambiar el dropzone', () => {
  const source = readFileSync(new URL('../src/pages/admin/products.astro', import.meta.url), 'utf8');
  assert.equal(source.includes('product-upload-instruction-desktop'), true);
  assert.equal(source.includes('product-upload-instruction-mobile'), true);
  assert.equal(source.includes('Arrastra imágenes aquí o selecciona archivos'), true);
  assert.equal(source.includes('Selecciona imágenes'), true);
  assert.equal(source.includes('aria-label="Seleccionar fotos del producto"'), true);
  assert.equal(source.includes("productUploadDropzone?.addEventListener('drop'"), true);
});

test('F7P8-C1: el adaptador productivo conserva la capacidad central sin duplicar planes', () => {
  const source = readFileSync(new URL('../src/lib/productImageLimits.ts', import.meta.url), 'utf8');
  assert.equal(source.includes("resolveStoreCapabilityAccess(store, 'max_product_images')"), true);
  assert.equal(source.includes("from './productImageLimitsCore.js'"), true);
  for (const plan of ["'free'", "'basic'", "'premium'"]) {
    assert.equal(source.includes(plan), false, plan);
  }
});

test('F7P8: api público recibe la tienda real antes de construir URLs', () => {
  const apiSource = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
  const productPage = readFileSync(new URL('../src/pages/producto/[slug].astro', import.meta.url), 'utf8');
  assert.equal(apiSource.includes('getPublicProductImageNames(product, store)'), true);
  assert.equal(productPage.includes('store: currentStore'), true);
  assert.equal(productPage.includes('JSON.stringify(productGalleryImages)'), true);
});
