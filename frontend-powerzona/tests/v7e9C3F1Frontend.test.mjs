import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function source(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function compileInlineFunction(fileSource, name, parameters) {
  const start = fileSource.indexOf(`function ${name}(`);
  const openingBrace = fileSource.indexOf('{', start);
  assert.ok(start >= 0 && openingBrace > start, `No se encontró ${name}`);
  let depth = 0;
  for (let index = openingBrace; index < fileSource.length; index += 1) {
    if (fileSource[index] === '{') depth += 1;
    if (fileSource[index] !== '}') continue;
    depth -= 1;
    if (depth === 0) return new Function(...parameters, fileSource.slice(openingBrace + 1, index));
  }
  throw new Error(`No se pudo aislar ${name}`);
}

function createValidatorHarness() {
  const records = {
    products: new Map(),
    product_variations: new Map(),
  };
  const window = {
    PZ_POCKETBASE_URL: 'https://pb.test',
    PZ_CURRENT_STORE_ID: 'store-one',
    addEventListener() {},
    dispatchEvent() {},
  };
  const context = {
    window,
    document: { visibilityState: 'visible', addEventListener() {} },
    localStorage: { setItem() {} },
    Event: class Event {},
    URL,
    URLSearchParams,
    fetch: async (value) => {
      const url = new URL(String(value));
      const match = /\/api\/collections\/([^/]+)\/records\/([^/?]+)/.exec(url.pathname);
      const record = match ? records[decodeURIComponent(match[1])]?.get(decodeURIComponent(match[2])) : null;
      return {
        status: record ? 200 : 404,
        ok: Boolean(record),
        json: async () => ({ ...record }),
      };
    },
  };
  vm.runInNewContext(source('../public/cart-live-validator.js'), context, { filename: 'cart-live-validator.js' });
  return { validator: window.PZCartLiveValidator, records };
}

function publicProduct(overrides = {}) {
  return {
    id: 'product-one',
    store: 'store-one',
    active: true,
    has_variations: true,
    base_price_usd: 12,
    regular_price_usd: 12,
    track_stock: true,
    stock: 3,
    allow_preorder: false,
    ...overrides,
  };
}

function cartItem(overrides = {}) {
  return {
    id: 'product-one',
    title: 'Creatina',
    price: 9,
    quantity: 1,
    stock: 1,
    store_id: 'store-one',
    cost_usd: 4,
    variation_cost_usd: 3,
    variation_ref: 'PRIVADA',
    internal_ref: 'PADRE-PRIVADA',
    expiration_date: '2026-07-01',
    ...overrides,
  };
}

test('V7E9-C3F1: carrito rechaza variation_id cuando el modo está desactivado', async () => {
  const { validator, records } = createValidatorHarness();
  records.products.set('product-one', publicProduct({ has_variations: false }));

  const result = await validator.validateCartAgainstStore(
    [cartItem({ variation_id: 'variation-one' })],
    { force: true },
  );

  assert.equal(result.invalidCount, 1);
  assert.equal(result.cart[0].cart_validation_reason, 'variation_mode_disabled');
  assert.equal('cost_usd' in result.cart[0], false);
  assert.equal('variation_ref' in result.cart[0], false);
});

test('V7E9-C3F1: carrito exige variación cuando el padre es contenedor', async () => {
  const { validator, records } = createValidatorHarness();
  records.products.set('product-one', publicProduct());

  const result = await validator.validateCartAgainstStore([cartItem()], { force: true });

  assert.equal(result.invalidCount, 1);
  assert.equal(result.cart[0].cart_validation_reason, 'variation_required');
});

test('V7E9-C3F1: carrito ignora ofertas legacy que no reducen el precio regular', async () => {
  const { validator, records } = createValidatorHarness();
  records.products.set('product-one', publicProduct({
    has_variations: false,
    is_offer: true,
    offer_price_usd: 20,
  }));

  const result = await validator.validateCartAgainstStore([cartItem()], { force: true });

  assert.equal(result.invalidCount, 0);
  assert.equal(result.cart[0].price, 12);
  assert.equal(result.cart[0].is_offer, false);
});

test('V7E9-C3F1: carrito falla cerrado ante otra tienda u otra relación padre', async () => {
  const tenantHarness = createValidatorHarness();
  tenantHarness.records.products.set('product-one', publicProduct({ store: '' }));
  const tenantResult = await tenantHarness.validator.validateCartAgainstStore([cartItem()], { force: true });
  assert.equal(tenantResult.invalidCount, 1);
  assert.equal(tenantResult.cart[0].cart_validation_reason, 'product_unavailable');

  const relationHarness = createValidatorHarness();
  relationHarness.records.products.set('product-one', publicProduct());
  relationHarness.records.product_variations.set('variation-one', {
    id: 'variation-one',
    product: 'another-product',
    active: true,
    price_usd: 15,
    stock: 2,
  });
  const relationResult = await relationHarness.validator.validateCartAgainstStore(
    [cartItem({ variation_id: 'variation-one' })],
    { force: true },
  );
  assert.equal(relationResult.invalidCount, 1);
  assert.equal(relationResult.cart[0].cart_validation_reason, 'variation_unavailable');
});

test('V7E9-C3F1: carrito usa precio/stock públicos de la unidad y limpia datos privados', async () => {
  const { validator, records } = createValidatorHarness();
  records.products.set('product-one', publicProduct());
  records.product_variations.set('variation-one', {
    id: 'variation-one',
    product: 'product-one',
    active: true,
    variation_type: 'Sabor',
    value: 'Vainilla',
    price_usd: 15,
    is_offer: true,
    offer_price_usd: 20,
    stock: 2,
    allow_preorder: false,
  });

  const result = await validator.validateCartAgainstStore(
    [cartItem({ variation_id: 'variation-one' })],
    { force: true },
  );

  assert.equal(result.invalidCount, 0);
  assert.equal(result.cart[0].price, 15);
  assert.equal(result.cart[0].stock, 2);
  assert.equal(result.cart[0].variation_label, 'Sabor: Vainilla');
  for (const field of ['cost_usd', 'variation_cost_usd', 'variation_ref', 'internal_ref', 'expiration_date']) {
    assert.equal(field in result.cart[0], false, `${field} no debe persistirse`);
  }
});

test('V7E9-C3F1: DTO, búsqueda, detalle y OG respetan el contrato público', () => {
  const api = source('../src/lib/api.ts');
  const search = source('../src/pages/buscar.astro');
  const detail = source('../src/pages/producto/[slug].astro');
  const layout = source('../src/layouts/Layout.astro');
  const validator = source('../public/cart-live-validator.js');
  const jpg = source('../src/pages/api/og/producto/[storeSlug]/[slug].jpg.ts');
  const png = source('../src/pages/api/og/producto/[storeSlug]/[slug].png.ts');
  const productDto = api.slice(api.indexOf('function publicProductRecord'), api.indexOf('function addProductImages'));
  const variationDto = api.slice(api.indexOf('function addVariationImages'), api.indexOf('async function attachVariationPriceSummary'));

  assert.equal(api.includes('filterPublicCatalogByExpiration'), false);
  assert.equal(api.includes('isPublicProductAllowedByExpiration'), false);
  for (const privateField of ['cost_usd', 'internal_ref', 'expiration_date']) {
    assert.equal(productDto.includes(privateField), false);
    assert.equal(variationDto.includes(privateField), false);
  }
  assert.equal(search.includes('product.internal_ref'), false);
  assert.match(search, /variation_public_labels/);
  assert.match(detail, /const hasPublicVariations = product\.has_variations === true/);
  assert.match(detail, /variations\.length === 0\) productUnavailable = true/);
  assert.equal(detail.includes('data-cost='), false);
  assert.equal(detail.includes('data-ref='), false);
  assert.equal(layout.includes('PZ_PRODUCT_EXPIRATION_ENABLED'), false);
  assert.equal(validator.includes('expirationDateExpired'), false);
  assert.match(jpg, /private, no-store, max-age=0/);
  assert.match(png, /private, no-store, max-age=0/);
});

test('V7E9-C3F1: editor respeta el switch, valida unidades y conserva al padre', () => {
  const editor = source('../src/pages/admin/products.astro');
  const eligible = compileInlineFunction(editor, 'variationIsModeEligible', ['variation', 'productTracksStock']);
  const validateParent = compileInlineFunction(editor, 'parentCommercialValidationMessage', [
    'productPriceInput',
    'productCostInput',
    'productStockInput',
    'productTracksStock',
    'getValidOfferState',
  ]);

  assert.equal(eligible({ active: true, price_usd: 10, stock: 0, expiration_date: '2020-01-01' }, () => true), true);
  assert.equal(eligible({ active: false, price_usd: 10, stock: 1 }, () => true), false);
  assert.equal(eligible({ active: true, price_usd: 0, stock: 1 }, () => true), false);
  assert.equal(eligible({ active: true, price_usd: 10, stock: Number.NaN }, () => true), false);

  const validParent = validateParent(
    { value: '12.50' },
    { value: '0' },
    { value: '0' },
    () => true,
    () => ({ enabled: false, valid: false }),
  );
  assert.equal(validParent, '');
  assert.match(validateParent(
    { value: '' },
    { value: '0' },
    { value: '0' },
    () => true,
    () => ({ enabled: false, valid: false }),
  ), /precio/);

  assert.match(editor, /const hasVariations = Boolean\(productHasVariationsInput\.checked\)/);
  assert.match(editor, /Boolean\(isEditing && productHasVariationsInput\.checked\)/);
  assert.equal(editor.includes('productHasVariationsInput.checked || productVariations.length'), false);
  assert.equal(editor.includes('getVariationStockSum'), false);
  assert.match(editor, /title: 'Dejar de usar variaciones'/);
  assert.match(editor, /No serán eliminadas y podrás restaurarlas más adelante/);
  assert.match(editor, /if \(!confirmed\) \{[\s\S]*?productHasVariationsInput\.checked = true/);
  assert.match(editor, /const parentCostAmount = Math\.max\(0, Number\(productCostInput\.value \|\| 0\)\)/);
  assert.match(editor, /const parentCostUsd = amountToUsd\(parentCostAmount, priceCurrency\)/);
  assert.match(editor, /const finalStock = Math\.max\(0, Math\.floor\(Number\(productStockInput\.value \|\| 0\)\)\)/);
  const postSave = editor.slice(editor.indexOf('async function confirmPostSaveVariationChoice()'), editor.indexOf('async function declinePostSaveVariationChoice()'));
  assert.equal(postSave.includes("set('has_variations', 'true')"), false);
  assert.match(postSave, /El modo se activará después de guardarla/);
});

test('V7E9-C3F1: ambas vistas V7E9 renderizan y cuentan unidades independientes', () => {
  const dashboard = source('../src/pages/admin/index.astro');
  const standalone = source('../src/pages/admin/expirations.astro');

  for (const view of [dashboard, standalone]) {
    assert.match(view, /productos o variaciones/);
    assert.match(view, /const variation = variations\[0\] \|\| null/);
    assert.match(view, /const isVariationUnit =/);
    assert.match(view, /— \$\{variation/);
    assert.match(view, /Modalidad: Variación/);
    assert.match(view, /Modalidad: Producto general/);
  }
  assert.match(dashboard, /Mostrando \$\{rangeStart\}–\$\{rangeEnd\} de \$\{totalItems\} productos o variaciones/);
  assert.match(standalone, /Mostrando \$\{rangeStart\}–\$\{rangeEnd\} de \$\{total\} productos o variaciones/);
  assert.match(standalone, /page_size: 10, query/);
  assert.match(standalone, /Buscar producto o variación/);
});
