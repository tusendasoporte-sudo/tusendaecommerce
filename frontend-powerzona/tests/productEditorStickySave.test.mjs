import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const products = readFileSync(new URL('../src/pages/admin/products.astro', import.meta.url), 'utf8');

test('EDITOR-PRODUCTO: la vista previa y el estado permanecen agrupados en la columna fija', () => {
  assert.match(products, /<aside class="editor-side-column" aria-label="Resumen del producto">\s*<div class="editor-side-summary">/);
  assert.match(products, /@media \(min-width: 1181px\)[\s\S]*?\.app-shell\.pz-admin-content \{[\s\S]*?overflow-x: clip !important;[\s\S]*?overflow-y: visible !important;/);
  assert.match(products, /@media \(min-width: 1181px\)[\s\S]*?#product-editor:not\(\.hidden\) \.editor-side-column \{[\s\S]*?position: sticky !important;[\s\S]*?max-height: calc\(100dvh - 116px\) !important;/);
  assert.match(products, /#product-editor:not\(\.hidden\) \.editor-side-summary \{[\s\S]*?overflow-y: auto;[\s\S]*?overscroll-behavior: contain;/);
});

test('EDITOR-PRODUCTO: Guardar permanece accesible y muestra el estado de los cambios', () => {
  assert.match(products, /id="editor-save-state" class="editor-save-state is-pending" role="status"/);
  assert.match(products, /function setEditorSaveState\(message, tone = 'pending'\)/);
  assert.match(products, /setEditorSaveState\('Guardando los cambios\.\.\.', 'saving'\)/);
  assert.match(products, /setEditorSaveState\('Todos los cambios están guardados\.', 'saved'\)/);
  assert.match(products, /setEditorSaveState\('Tienes cambios sin guardar\.', 'dirty'\)/);
  assert.match(products, /@media \(max-width: 768px\)[\s\S]*?#product-editor:not\(\.hidden\) \.editor-actions-card \{[\s\S]*?position: fixed !important;[\s\S]*?bottom: calc\(var\(--pz-admin-mobile-bottom-offset, 98px\)/);
});

test('EDITOR-PRODUCTO: la mejora no sustituye las validaciones ni el botón de guardado existente', () => {
  assert.match(products, /productSaveBtn\.disabled = isSavingProduct \|\| missingName \|\| missingPriceCurrency \|\| missingStock \|\| invalidOffer \|\| missingValidVariation \|\| Boolean\(invalidParentConfiguration\) \|\| !isDirtyEnough;/);
  assert.match(products, /editorSideSaveBtn\.disabled = productSaveBtn\.disabled;/);
  assert.match(products, /editorSideSaveBtn\.textContent = productSaveBtn\.textContent;/);
  assert.match(products, /const canSaveProduct = isEditing \? canMutateExistingProduct\(\) : CAN_CREATE_PRODUCTS;/);
  assert.match(products, /setEditorSaveState\('No tienes permiso para guardar este producto\.', 'warning'\)/);
});
