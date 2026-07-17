const assert = require('node:assert/strict');
const test = require('node:test');

const capabilities = require('../pb_hooks/pz_store_capabilities_lib.js');
const images = require('../pb_hooks/pz_product_image_limits_lib.js');

const names = ['a.webp', 'b.webp', 'c.webp', 'd.webp', 'e.webp'];
const NOW = '2026-07-17T12:00:00.000Z';
const store = (plan) => ({
  plan,
  plan_started_at: NOW,
  plan_expires_at: '2026-08-17T12:00:00.000Z',
  plan_is_permanent: false,
});
const limitFor = (plan) => capabilities.resolveStoreCapabilityAccess(store(plan), 'max_product_images').limit;

function evaluate(activeImageLimit, afterImages, overrides = {}) {
  return images.evaluateProductImageMutation({
    activeImageLimit,
    beforeImages: [],
    beforeOrder: [],
    afterImages,
    imagesTouched: true,
    orderTouched: false,
    ...overrides,
  });
}

function throwsCode(fn, code) {
  assert.throws(fn, (error) => error instanceof images.ProductImageLimitError && error.code === code);
}

test('F7P8: Free acepta 0, 1 y 2 fotos y rechaza 3', () => {
  for (const count of [0, 1, 2]) assert.equal(evaluate(limitFor('free'), names.slice(0, count)).finalOrder.length, count);
  throwsCode(() => evaluate(limitFor('free'), names.slice(0, 3)), 'product_image_limit_exceeded');
});

test('F7P8: Básico acepta 2 fotos y rechaza 3', () => {
  assert.equal(evaluate(limitFor('basic'), names.slice(0, 2)).finalOrder.length, 2);
  throwsCode(() => evaluate(limitFor('basic'), names.slice(0, 3)), 'product_image_limit_exceeded');
});

test('F7P8: Premium acepta 4 fotos y rechaza una quinta', () => {
  assert.deepEqual(evaluate(limitFor('premium'), names.slice(0, 4)).finalOrder, names.slice(0, 4));
  throwsCode(() => evaluate(limitFor('premium'), names), 'product_image_limit_exceeded');
  assert.equal(images.PRODUCT_IMAGE_PHYSICAL_LIMIT, 4);
});

test('F7P8: append no evade el límite activo', () => {
  throwsCode(() => evaluate(2, names.slice(0, 3), {
    beforeImages: names.slice(0, 2),
    beforeOrder: names.slice(0, 2),
  }), 'product_image_limit_exceeded');
});

test('F7P8: reemplazo completo no evade el límite activo', () => {
  throwsCode(() => evaluate(2, names.slice(1, 4), {
    beforeImages: names.slice(0, 2),
    beforeOrder: names.slice(0, 2),
  }), 'product_image_limit_exceeded');
});

test('F7P8: delete y append calculan el estado final real', () => {
  const result = evaluate(2, ['b.webp', 'c.webp'], {
    beforeImages: ['a.webp', 'b.webp'],
    beforeOrder: ['a.webp', 'b.webp'],
  });
  assert.deepEqual(result.deleted, ['a.webp']);
  assert.deepEqual(result.added, ['c.webp']);
  assert.deepEqual(result.finalOrder, ['b.webp', 'c.webp']);
});

test('F7P8: image_order válido conserva todos los nombres finales', () => {
  const result = evaluate(4, names.slice(0, 4), {
    beforeImages: names.slice(0, 4),
    beforeOrder: names.slice(0, 4),
    imagesTouched: false,
    orderTouched: true,
    requestedOrder: JSON.stringify(['b.webp', 'a.webp', 'd.webp', 'c.webp']),
  });
  assert.deepEqual(result.finalOrder, ['b.webp', 'a.webp', 'd.webp', 'c.webp']);
});

test('F7P8: image_order rechaza duplicados, nombres inexistentes y órdenes incompletos', () => {
  const base = {
    beforeImages: names.slice(0, 2),
    beforeOrder: names.slice(0, 2),
    imagesTouched: false,
    orderTouched: true,
  };
  for (const requestedOrder of [
    ['a.webp', 'a.webp'],
    ['a.webp', 'foreign.webp'],
    ['a.webp'],
  ]) {
    throwsCode(() => evaluate(2, names.slice(0, 2), { ...base, requestedOrder }), 'invalid_product_image_order');
  }
});

test('F7P8: una edición no visual conserva exactamente una galería heredada', () => {
  const result = evaluate(2, names.slice(0, 4), {
    beforeImages: names.slice(0, 4),
    beforeOrder: names.slice(0, 4),
    imagesTouched: false,
    orderTouched: false,
  });
  assert.deepEqual(result.finalOrder, names.slice(0, 4));
  assert.deepEqual(result.lockedTail, ['c.webp', 'd.webp']);
  assert.equal(result.shouldSetOrder, false);
});

test('F7P8: downgrade conserva la cola Premium 3 y 4', () => {
  const result = evaluate(2, names.slice(0, 4), {
    beforeImages: names.slice(0, 4),
    beforeOrder: names.slice(0, 4),
    imagesTouched: false,
    orderTouched: false,
  });
  assert.deepEqual(result.activeBefore, ['a.webp', 'b.webp']);
  assert.deepEqual(result.lockedTail, ['c.webp', 'd.webp']);
});

test('F7P8: reemplazar el slot 1 conserva la cola y su orden', () => {
  const result = evaluate(2, ['b.webp', 'c.webp', 'd.webp', 'e.webp'], {
    beforeImages: names.slice(0, 4),
    beforeOrder: names.slice(0, 4),
  });
  assert.deepEqual(result.finalOrder, ['e.webp', 'b.webp', 'c.webp', 'd.webp']);
  assert.equal(result.shouldSetOrder, true);
});

test('F7P8: reordenar 1↔2 conserva la cola detrás', () => {
  const result = evaluate(2, names.slice(0, 4), {
    beforeImages: names.slice(0, 4),
    beforeOrder: names.slice(0, 4),
    imagesTouched: false,
    orderTouched: true,
    requestedOrder: ['b.webp', 'a.webp', 'c.webp', 'd.webp'],
  });
  assert.deepEqual(result.finalOrder, ['b.webp', 'a.webp', 'c.webp', 'd.webp']);
});

test('F7P8: borrar una activa con cola bloqueada es rechazado', () => {
  throwsCode(() => evaluate(2, ['b.webp', 'c.webp', 'd.webp'], {
    beforeImages: names.slice(0, 4),
    beforeOrder: names.slice(0, 4),
  }), 'product_image_delete_would_activate_locked');
});

test('F7P8: borrar o reemplazar un slot bloqueado es rechazado', () => {
  throwsCode(() => evaluate(2, ['a.webp', 'b.webp', 'd.webp'], {
    beforeImages: names.slice(0, 4),
    beforeOrder: names.slice(0, 4),
  }), 'product_image_slot_locked');
  throwsCode(() => evaluate(2, ['a.webp', 'b.webp', 'd.webp', 'e.webp'], {
    beforeImages: names.slice(0, 4),
    beforeOrder: names.slice(0, 4),
  }), 'product_image_slot_locked');
});

test('F7P8: image_order no puede promover una foto bloqueada', () => {
  throwsCode(() => evaluate(2, names.slice(0, 4), {
    beforeImages: names.slice(0, 4),
    beforeOrder: names.slice(0, 4),
    imagesTouched: false,
    orderTouched: true,
    requestedOrder: ['c.webp', 'a.webp', 'b.webp', 'd.webp'],
  }), 'product_image_slot_locked');
});

test('F7P8: upgrade vuelve a habilitar las cuatro fotos sin restauración', () => {
  const result = evaluate(4, names.slice(0, 4), {
    beforeImages: names.slice(0, 4),
    beforeOrder: names.slice(0, 4),
    imagesTouched: false,
  });
  assert.deepEqual(result.activeBefore, names.slice(0, 4));
  assert.deepEqual(result.lockedTail, []);
});

test('F7P8: capacidad inválida falla cerrada', () => {
  for (const invalid of [-1, 5, null, '4']) {
    throwsCode(() => evaluate(invalid, []), 'product_image_management_unavailable');
  }
});

test('F7P8: dos tiendas aplican sus capacidades sin compartir el plan', () => {
  assert.equal(limitFor('basic'), 2);
  assert.equal(limitFor('premium'), 4);
  throwsCode(() => evaluate(limitFor('basic'), names.slice(0, 4)), 'product_image_limit_exceeded');
  assert.equal(evaluate(limitFor('premium'), names.slice(0, 4)).finalOrder.length, 4);
});

test('F7P8: errores públicos están saneados', () => {
  const safe = images.getSafeProductImageError({
    code: 'product_image_slot_locked',
    stack: 'C:\\private\\hook.js',
    store: { id: 'secret' },
  });
  assert.deepEqual(safe, {
    status: 400,
    code: 'product_image_slot_locked',
    message: 'No puedes modificar una foto Premium conservada.',
  });
  assert.equal(JSON.stringify(safe).includes('private'), false);
  assert.equal(JSON.stringify(safe).includes('secret'), false);
});

test('F7P8: valida firmas JPEG, PNG y WebP desde bytes reales', () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
  const png = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    1, 2, 3, 4, 5, 6, 7, 8,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  const webp = Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 12, 0, 0, 0,
    0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
    0, 0, 0, 0,
  ]);
  assert.equal(images.detectProductImageMime(jpeg), 'image/jpeg');
  assert.equal(images.detectProductImageMime(png), 'image/png');
  assert.equal(images.detectProductImageMime(webp), 'image/webp');
  for (const file of [jpeg, png, webp]) assert.equal(images.validateProductImageBytes(file.length, file), true);
});

test('F7P8: rechaza SVG, GIF, contenido corrupto y más de 2 MiB', () => {
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const gif = new TextEncoder().encode('GIF89a');
  const corrupt = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
  for (const file of [svg, gif, corrupt]) {
    throwsCode(() => images.validateProductImageBytes(file.length, file), 'invalid_product_image');
  }
  const oversized = new Uint8Array(images.PRODUCT_IMAGE_MAX_BYTES + 1);
  throwsCode(() => images.validateProductImageBytes(oversized.length, oversized), 'invalid_product_image');
});
