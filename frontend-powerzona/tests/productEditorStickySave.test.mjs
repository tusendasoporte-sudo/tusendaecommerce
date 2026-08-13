import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const products = readFileSync(new URL('../src/pages/admin/products.astro', import.meta.url), 'utf8');

test('EDITOR-PRODUCTO: la vista previa y el estado permanecen agrupados en la columna fija', () => {
  assert.match(products, /<aside class="editor-side-column" aria-label="Resumen del producto">\s*<div class="editor-side-summary">/);
  assert.match(products, /@media \(min-width: 1181px\)[\s\S]*?html,\s*body,\s*\.app-shell\.pz-admin-content \{[\s\S]*?overflow-x: clip !important;[\s\S]*?overflow-y: visible !important;/);
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

test('EDITOR-PRODUCTO-MOVIL: Guardar aparece solo con cambios y no cubre Estado del producto', () => {
  assert.match(products, /#product-editor:not\(\.hidden\) \.editor-actions-card\[data-mobile-save-visible="false"\] \{\s*display: none !important;/);
  assert.match(products, /#product-editor:not\(\.hidden\)\.has-mobile-save-action:not\(\.has-mobile-inline-save\) \.editor-main-column \{\s*padding-bottom: calc\(86px/);
  assert.match(products, /#product-editor:not\(\.hidden\)\.has-mobile-inline-save \.editor-actions-card \{[\s\S]*?position: static !important;[\s\S]*?background: transparent !important;[\s\S]*?box-shadow: none !important;/);
  assert.match(products, /#product-editor:not\(\.hidden\)\.has-mobile-inline-save \.editor-save-state \{\s*display: none !important;/);
  assert.match(products, /#product-editor:not\(\.hidden\)\.has-mobile-inline-save \.side-save-btn \{[\s\S]*?width: 100% !important;/);
  assert.match(products, /function updateMobileSaveActionState\(hasPendingChanges\)/);
  assert.match(products, /editorActionsCard\.dataset\.mobileSaveVisible = shouldShow \? 'true' : 'false';/);
  assert.match(products, /updateMobileSaveActionState\(isSavingProduct \|\| hasPendingProductChanges\);/);
  assert.match(products, /const statusTop = editorStatusCard\.getBoundingClientRect\(\)\.top;\s*productEditor\.classList\.toggle\('has-mobile-inline-save', statusTop <= inlineThreshold\);/);
  assert.match(products, /productInitialSnapshot = createProductSnapshot\(\);\s*updateProductFormState\(\);/);
});

test('EDITOR-PRODUCTO-MOVIL: Vista previa inicia plegada y se abre bajo demanda', () => {
  assert.match(products, /id="editor-preview-toggle"[\s\S]*?aria-expanded="true" aria-controls="editor-preview-content"/);
  assert.match(products, /id="editor-preview-content" class="editor-preview-content"/);
  assert.match(products, /#product-editor:not\(\.hidden\) \.editor-preview-card\.is-mobile-preview-collapsed \.editor-preview-content \{\s*display: none !important;/);
  assert.match(products, /function updateEditorPreviewDisclosure\(\{ reset = false \} = \{\}\)/);
  assert.match(products, /const isExpanded = !isMobile \|\| isMobileEditorPreviewExpanded;/);
  assert.match(products, /editorPreviewToggle\.tabIndex = isMobile \? 0 : -1;/);
  assert.match(products, /editorPreviewToggle\.setAttribute\('aria-disabled', String\(!isMobile\)\);/);
  assert.match(products, /editorPreviewToggle\.setAttribute\('aria-expanded', String\(isExpanded\)\);/);
  assert.match(products, /editorPreviewToggleLabel\.textContent = isExpanded \? 'Ocultar' : 'Mostrar';/);
  assert.match(products, /editorPreviewToggle\?\.addEventListener\('click', \(\) => \{[\s\S]*?isMobileEditorPreviewExpanded = !isMobileEditorPreviewExpanded;[\s\S]*?updateEditorPreviewDisclosure\(\);/);
  assert.equal((products.match(/updateEditorPreviewDisclosure\(\{ reset: true \}\);/g) || []).length >= 3, true);
});

test('EDITOR-PRODUCTO-MOVIL: Opciones inicia plegado y resume sus estados principales', () => {
  assert.match(products, /id="product-options-toggle"[\s\S]*?aria-expanded="true" aria-controls="product-options-content"/);
  assert.match(products, /id="product-options-summary" class="product-options-summary">Visible · Controla stock · Sin variaciones</);
  assert.match(products, /id="product-options-content" class="product-options-content"/);
  assert.match(products, /#product-editor:not\(\.hidden\) \.product-options-card\.is-mobile-options-collapsed \.product-options-content \{\s*display: none !important;/);
  assert.match(products, /function updateProductOptionsDisclosure\(\{ reset = false \} = \{\}\)/);
  assert.match(products, /const visibilityLabel = productActiveInput\?\.checked \? 'Visible' : 'Oculto';/);
  assert.match(products, /const stockLabel = productTrackStockInput\?\.checked \? 'Controla stock' : 'No controla stock';/);
  assert.match(products, /const variationsLabel = productHasVariationsInput\?\.checked \? 'Con variaciones' : 'Sin variaciones';/);
  assert.match(products, /productOptionsSummary\.textContent = `\$\{visibilityLabel\} · \$\{stockLabel\} · \$\{variationsLabel\}`;/);
  assert.match(products, /productOptionsToggle\?\.addEventListener\('click', \(\) => \{[\s\S]*?isMobileProductOptionsExpanded = !isMobileProductOptionsExpanded;[\s\S]*?updateProductOptionsDisclosure\(\);/);
  assert.equal((products.match(/updateProductOptionsDisclosure\(\{ reset: true \}\);/g) || []).length >= 3, true);
});

test('EDITOR-PRODUCTO-MOVIL: Información adicional inicia plegada y resume la cantidad configurada', () => {
  assert.match(products, /id="product-extra-toggle"[\s\S]*?aria-expanded="true" aria-controls="product-extra-content"/);
  assert.match(products, /id="product-extra-summary" class="product-editor-disclosure-summary">Sin información adicional</);
  assert.match(products, /id="product-extra-content" class="product-editor-disclosure-content"/);
  assert.match(products, /\.product-editor-disclosure-card\.is-mobile-disclosure-collapsed \.product-editor-disclosure-content \{\s*display: none !important;/);
  assert.match(products, /function updateProductExtraDisclosure\(\{ reset = false \} = \{\}\)/);
  assert.match(products, /productExtraSummary\.textContent = count === 0[\s\S]*?'Sin información adicional'[\s\S]*?'dato configurado'[\s\S]*?'datos configurados'/);
  assert.match(products, /productExtraToggle\?\.addEventListener\('click', \(\) => \{[\s\S]*?isMobileProductExtraExpanded = !isMobileProductExtraExpanded;[\s\S]*?updateProductExtraDisclosure\(\);/);
  assert.equal((products.match(/updateProductExtraDisclosure\(\{ reset: true \}\);/g) || []).length >= 3, true);
});

test('EDITOR-PRODUCTO-MOVIL: Productos relacionados inicia plegado y resume la selección', () => {
  assert.match(products, /id="related-products-toggle"[\s\S]*?aria-expanded="true" aria-controls="related-products-content"/);
  assert.match(products, /id="related-products-summary" class="product-editor-disclosure-summary">Sin productos relacionados</);
  assert.match(products, /id="related-products-content" class="product-editor-disclosure-content"/);
  assert.match(products, /function updateRelatedProductsDisclosure\(\{ reset = false \} = \{\}\)/);
  assert.match(products, /const count = getSelectedRelatedProducts\(\)\.length;/);
  assert.match(products, /relatedProductsSummary\.textContent = count === 0[\s\S]*?'Sin productos relacionados'[\s\S]*?'producto seleccionado'[\s\S]*?'productos seleccionados'/);
  assert.match(products, /relatedProductsToggle\?\.addEventListener\('click', \(\) => \{[\s\S]*?isMobileRelatedProductsExpanded = !isMobileRelatedProductsExpanded;[\s\S]*?updateRelatedProductsDisclosure\(\);/);
  assert.equal((products.match(/updateRelatedProductsDisclosure\(\{ reset: true \}\);/g) || []).length >= 3, true);
});

test('EDITOR-PRODUCTO: la mejora no sustituye las validaciones ni el botón de guardado existente', () => {
  assert.match(products, /productSaveBtn\.disabled = isSavingProduct \|\| missingName \|\| missingPriceCurrency \|\| missingStock \|\| invalidOffer \|\| missingValidVariation \|\| Boolean\(invalidParentConfiguration\) \|\| !isDirtyEnough;/);
  assert.match(products, /editorSideSaveBtn\.disabled = productSaveBtn\.disabled;/);
  assert.match(products, /editorSideSaveBtn\.textContent = productSaveBtn\.textContent;/);
  assert.match(products, /const canSaveProduct = isEditing \? canMutateExistingProduct\(\) : CAN_CREATE_PRODUCTS;/);
  assert.match(products, /setEditorSaveState\('No tienes permiso para guardar este producto\.', 'warning'\)/);
});
