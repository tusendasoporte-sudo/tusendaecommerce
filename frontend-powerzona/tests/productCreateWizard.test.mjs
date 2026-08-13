import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildProductVariationCombinations,
  clampProductCreateStep,
  getProductCreationPublishPlan,
  parseProductVariationValues,
  validateProductCreateWizardStep,
} from '../src/lib/adminProductCreateWizard.js';

const productsAdmin = readFileSync(new URL('../src/pages/admin/products.astro', import.meta.url), 'utf8');

test('CREAR-PRODUCTO: los pasos se limitan al rango 1-3', () => {
  assert.equal(clampProductCreateStep(-4), 1);
  assert.equal(clampProductCreateStep(2), 2);
  assert.equal(clampProductCreateStep(99), 3);
});

test('CREAR-PRODUCTO: la validación distingue simples, variaciones y borradores', () => {
  assert.equal(validateProductCreateWizardStep({ step: 1 }).code, 'missing_name');
  assert.deepEqual(
    validateProductCreateWizardStep({ step: 1, name: 'Vitamina C' }),
    { valid: true, code: 'valid', message: '' },
  );
  assert.equal(validateProductCreateWizardStep({ step: 2, name: 'Vitamina C' }).code, 'missing_currency');
  assert.equal(validateProductCreateWizardStep({
    step: 2,
    name: 'Vitamina C',
    currencyId: 'usd',
    usesVariations: true,
  }).code, 'missing_variation');
  assert.equal(validateProductCreateWizardStep({
    step: 2,
    name: 'Vitamina C',
    currencyId: 'usd',
    usesVariations: false,
    parentCommercialError: 'Escribe un precio válido.',
  }).code, 'invalid_parent_commerce');
  assert.equal(validateProductCreateWizardStep({ step: 2, name: 'Borrador', allowDraft: true }).valid, true);
});

test('CREAR-PRODUCTO: variaciones y borradores nacen ocultos antes del estado final', () => {
  assert.deepEqual(getProductCreationPublishPlan({ usesVariations: true, requestedVisible: true }), {
    initialVisible: false,
    initialHasVariations: false,
    finalVisible: true,
    finalHasVariations: true,
  });
  assert.deepEqual(getProductCreationPublishPlan({ asDraft: true, usesVariations: true, requestedVisible: true }), {
    initialVisible: false,
    initialHasVariations: false,
    finalVisible: false,
    finalHasVariations: true,
  });
});

test('CREAR-PRODUCTO: el generador limpia duplicados y crea uno o dos atributos', () => {
  assert.deepEqual(
    parseProductVariationValues(' Vainilla, Chocolate, Vainilla,  '),
    ['Vainilla', 'Chocolate'],
  );
  assert.deepEqual(buildProductVariationCombinations({
    attributeOne: 'Sabor',
    valuesOne: 'Vainilla, Chocolate',
  }), {
    valid: true,
    code: 'valid',
    items: [
      { type: 'Sabor', value: 'Vainilla' },
      { type: 'Sabor', value: 'Chocolate' },
    ],
  });
  assert.deepEqual(buildProductVariationCombinations({
    attributeOne: 'Sabor',
    valuesOne: 'Vainilla, Chocolate',
    attributeTwo: 'Tamaño',
    valuesTwo: '1 lb, 2 lb',
  }).items, [
    { type: 'Sabor / Tamaño', value: 'Vainilla / 1 lb' },
    { type: 'Sabor / Tamaño', value: 'Vainilla / 2 lb' },
    { type: 'Sabor / Tamaño', value: 'Chocolate / 1 lb' },
    { type: 'Sabor / Tamaño', value: 'Chocolate / 2 lb' },
  ]);
});

test('CREAR-PRODUCTO: el generador rechaza el segundo atributo incompleto y más de 30 combinaciones', () => {
  assert.equal(buildProductVariationCombinations({
    attributeOne: 'Sabor',
    valuesOne: 'Vainilla',
    attributeTwo: 'Tamaño',
  }).code, 'incomplete_secondary_attribute');
  assert.equal(buildProductVariationCombinations({
    attributeOne: 'Color',
    valuesOne: Array.from({ length: 31 }, (_, index) => `Color ${index + 1}`).join(','),
  }).code, 'combination_limit');
});

test('CREAR-PRODUCTO: el alta usa tres pasos y conserva la edición completa', () => {
  assert.match(productsAdmin, /data-product-create-step="1"[\s\S]*?Información básica/);
  assert.match(productsAdmin, /data-product-create-step="2"[\s\S]*?Precio e inventario/);
  assert.match(productsAdmin, /data-product-create-step="3"[\s\S]*?Revisar y publicar/);
  assert.match(productsAdmin, /openNewProductEditor[\s\S]*?classList\.add\('is-create-wizard'\)/);
  assert.match(productsAdmin, /openEditProductEditor[\s\S]*?classList\.remove\('is-create-wizard', 'is-create-advanced-open', 'is-create-variation-enabled'\)/);
});

test('CREAR-PRODUCTO: las opciones avanzadas son opcionales y no ocultan visibilidad', () => {
  assert.match(productsAdmin, /id="product-create-advanced-toggle"[\s\S]*?Opciones avanzadas/);
  assert.match(productsAdmin, /assignCreateWizardItem\(document\.getElementById\('product-basic-heading'\), 1\)/);
  assert.match(productsAdmin, /assignCreateWizardItem\(document\.getElementById\('product-inventory-heading'\), 2\)/);
  assert.match(productsAdmin, /assignCreateWizardItem\(document\.getElementById\('product-extra-info-heading'\), 3, \{ advanced: true \}\)/);
  assert.match(productsAdmin, /productImagesHeading\?\.classList\.add\('create-wizard-repeat-advanced'\)/);
  assert.match(productsAdmin, /productActiveInput\?\.closest\('\.field'\)[\s\S]*?assignCreateWizardItem\(statusField, 3\)/);
  assert.match(productsAdmin, /productFeaturedInput, productOnlyUsdInput, productAllowPreorderInput, productTrackStockInput/);
  assert.match(productsAdmin, /is-create-advanced-open\[data-create-step="3"\][\s\S]*?create-wizard-advanced-item/);
});

test('CREAR-PRODUCTO: las variaciones se preparan localmente y se crean antes de publicar el padre', () => {
  assert.match(productsAdmin, /id="product-create-generate-variations"[\s\S]*?Generar combinaciones/);
  assert.match(productsAdmin, /Aplicar precio a todas/);
  assert.match(productsAdmin, /Aplicar stock a todas/);
  assert.match(productsAdmin, /function buildPendingVariationDraft\(\)/);
  assert.match(productsAdmin, /_draft:\s*true/);
  assert.match(productsAdmin, /savePendingVariationDraft\(\)/);
  const saveProductStart = productsAdmin.indexOf('async function saveProduct({ asDraft = false } = {})');
  const createBranchStart = productsAdmin.indexOf('const createData = new FormData();', saveProductStart);
  const createBranch = productsAdmin.slice(
    createBranchStart,
    productsAdmin.indexOf('await loadProducts();', createBranchStart),
  );
  assert.match(createBranch, /createData\.set\('active', 'false'\)/);
  assert.match(createBranch, /createData\.set\('has_variations', 'false'\)/);
  assert.match(createBranch, /buildPendingVariationFormData\(variation, created\.id\)/);
  assert.match(createBranch, /api\/collections\/product_variations\/records/);
  assert.match(createBranch, /enableVariationsData\.set\('has_variations', 'true'\)/);
  assert.ok(
    createBranch.indexOf("createData.set('active', 'false')")
      < createBranch.indexOf("enableVariationsData.set('has_variations', 'true')"),
  );
  assert.match(productsAdmin, /createdVariationIdsDuringFlow\.reverse\(\)[\s\S]*?method: 'DELETE'[\s\S]*?createdProductIdDuringFlow[\s\S]*?method: 'DELETE'/);
});

test('CREAR-PRODUCTO: editar conserva el guardado existente y crear decide el modo explícitamente', () => {
  assert.match(
    productsAdmin,
    /forceHasVariations:\s*editingId \? null : requestedHasVariations/,
  );
  assert.match(
    productsAdmin,
    /if \(editingId\) \{[\s\S]*?method: 'PATCH'[\s\S]*?setProductSnapshotFromCurrent\(\)/,
  );
  assert.match(productsAdmin, /savedProductWasActive !== productManualActive/);
});

test('CREAR-PRODUCTO: móvil mantiene acciones visibles y variaciones en tarjetas', () => {
  assert.match(productsAdmin, /\.product-create-wizard-actions \{[\s\S]*?position:\s*sticky/);
  assert.match(productsAdmin, /@media \(max-width: 760px\)[\s\S]*?product-create-wizard-actions/);
  assert.match(productsAdmin, /#variation-manager \.variation-mini-card,[\s\S]*?grid-template-columns:\s*1fr !important/);
});
