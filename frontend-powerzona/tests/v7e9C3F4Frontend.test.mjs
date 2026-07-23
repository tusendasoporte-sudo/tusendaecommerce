import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  getProductEditorVisibilityState,
  getVariationEditorVisibilityState,
  isRecordManuallyActive,
} from '../src/lib/adminStoreProducts.ts';
import {
  buildTeamActivityProductHistoryPath,
  resolveProductHistoryReturnNavigation,
} from '../src/lib/productHistoryNavigation.ts';
import { getStoreActivityListSummary } from '../src/lib/storeActivity.ts';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');
const NOW = '2026-07-23T16:00:00.000Z';

test('V7E9-C3F4: checkbox de producto conserva intención manual separada del vencimiento', () => {
  const visible = getProductEditorVisibilityState({
    active: true, has_variations: false, expiration_date: '2026-08-23',
  }, true, true, NOW);
  assert.equal(visible.checked, true);
  assert.equal(visible.disabled, false);

  const hidden = getProductEditorVisibilityState({
    active: false, has_variations: false, expiration_date: '2026-08-23',
  }, true, true, NOW);
  assert.equal(hidden.checked, false);
  assert.equal(hidden.disabled, false);
  assert.equal(hidden.effective_status_label, 'OCULTO');

  const expired = getProductEditorVisibilityState({
    active: true, has_variations: false, expiration_date: '2026-07-23',
  }, true, true, NOW);
  assert.equal(expired.checked, false);
  assert.equal(expired.disabled, true);
  assert.equal(expired.manual_active, true);
  assert.equal(expired.effective_status_label, 'VENCIDO');

  const hiddenExpired = getProductEditorVisibilityState({
    active: false, has_variations: false, expiration_date: '2026-07-22',
  }, true, true, NOW);
  assert.equal(hiddenExpired.checked, false);
  assert.equal(hiddenExpired.disabled, true);
  assert.equal(hiddenExpired.manual_active, false);
  assert.equal(hiddenExpired.effective_status_label, 'OCULTO');
  assert.equal(isRecordManuallyActive({ active: 'false' }), false);
});

test('V7E9-C3F4: checkbox de variación persiste ocultación y bloquea vencidas o conservadas', () => {
  const product = { id: 'productc3f4001', active: true, has_variations: true, expiration_date: '' };
  const active = { id: 'variationc3f401', product: product.id, active: true, expiration_date: '2026-08-23' };
  const hidden = { id: 'variationc3f402', product: product.id, active: false, expiration_date: '2026-08-23' };
  const expired = { id: 'variationc3f403', product: product.id, active: true, expiration_date: '2026-07-23' };
  const hiddenExpired = { id: 'variationc3f404', product: product.id, active: false, expiration_date: '2026-07-22' };
  const variations = [active, hidden, expired, hiddenExpired];

  assert.deepEqual(
    [active, hidden, expired, hiddenExpired].map((variation) => {
      const state = getVariationEditorVisibilityState(product, variation, variations, true, true, NOW);
      return [state.checked, state.disabled, state.effective_status_label];
    }),
    [
      [true, false, 'Activa'],
      [false, false, 'Oculta'],
      [false, true, 'Vencida'],
      [false, true, 'Oculta'],
    ],
  );
  const conserved = getVariationEditorVisibilityState(
    { ...product, has_variations: false },
    active,
    variations,
    true,
    true,
    NOW,
  );
  assert.equal(conserved.checked, false);
  assert.equal(conserved.disabled, true);
  assert.equal(conserved.effective_status_label, 'Conservada');
});

test('V7E9-C3F4: editores envían active=false y no lo derivan del estado efectivo', async () => {
  const products = await source('src/pages/admin/products.astro');
  assert.match(products, /productManualActive = Boolean\(productActiveInput\.checked\)/);
  assert.match(products, /variationManualActive = Boolean\(variationActiveInput\.checked\)/);
  assert.match(products, /formData\.append\('active', productManualActive \? 'true' : 'false'\)/);
  assert.match(products, /formData\.append\('active', variationManualActive \? 'true' : 'false'\)/);
  assert.match(products, /getProductEditorVisibilityState/);
  assert.match(products, /getVariationEditorVisibilityState/);
  assert.doesNotMatch(products, /productManualActive = state\.effective_visible/);
  assert.doesNotMatch(products, /variationManualActive = state\.effective_status/);
});

test('V7E9-C3F4: Última modificación usa auditoría, fallback updated y formato Habana sin actor', async () => {
  const products = await source('src/pages/admin/products.astro');
  const metadata = await source('src/components/admin/LastModificationMeta.astro');
  assert.match(products, /id="product-editor-last-modification"/);
  assert.match(products, /data-fallback-updated="\$\{escapeHtml\(product\.updated \|\| ''\)\}"/);
  assert.match(products, /data-simple-last-modification="true"/);
  assert.match(metadata, /item\?\.last_modified_at \|\| fallbackUpdated/);
  assert.match(metadata, /timeZone: 'America\/Havana'/);
  assert.match(metadata, /`Última modificación: \$\{created\}`/);
  assert.match(products, /showActor=\{false\}/);
});

test('V7E9-C3F4: Actividad elimina Abrir, acorta títulos y conserva cambios', async () => {
  const view = await source('src/components/admin/StoreActivityView.astro');
  const renderEvents = view.slice(view.indexOf('function renderEvents()'), view.indexOf('function renderPagination()'));
  assert.doesNotMatch(renderEvents, />Abrir<\/a>/);
  assert.doesNotMatch(view, /Abrir elemento|data-activity-open-resource/);
  assert.match(renderEvents, />Ver historial<\/a>/);
  assert.match(renderEvents, />Ver detalle<\/button>/);
  assert.match(renderEvents, /compactChanges\(event\)/);
  assert.match(renderEvents, /getStoreActivityListSummary\(event\)/);

  const resource = { label: 'Creatina Creator 120 Servicios · Sabor: fresa' };
  assert.equal(getStoreActivityListSummary({
    action: 'variation_expiration_corrected',
    summary: `Corrigió el vencimiento de ${resource.label}`,
    changes: [{ field: 'expiration_date' }],
    resource,
  }), 'Corrigió el vencimiento');
  assert.equal(getStoreActivityListSummary({
    action: 'product_updated',
    summary: `Cambió stock de ${resource.label}`,
    changes: [{ field: 'stock' }],
    resource,
  }), 'Cambió el stock');
  assert.equal(getStoreActivityListSummary({
    action: 'variation_manual_hidden',
    summary: `Ocultó manualmente ${resource.label}`,
    changes: [{ field: 'active' }],
    resource,
  }), 'Ocultó manualmente');
});

test('V7E9-C3F4: retorno contextual usa allowlist y nunca returnUrl arbitraria', () => {
  const history = '/t/powerzona/admin/products/abcdefghijklmno/history?from=products&variation=1234567890abcde';
  const fromActivity = buildTeamActivityProductHistoryPath('powerzona', history, {
    module: 'catalog',
    action: 'variation_expiration_corrected',
    severity: 'important',
    review_status: 'pending',
    date_from: '2026-07-01',
    date_to: '2026-07-23',
    search: 'creatina',
    page: 3,
  });
  assert.match(fromActivity, /^\/t\/powerzona\/admin\/products\/abcdefghijklmno\/history\?/);
  assert.match(fromActivity, /from=team-activity/);
  assert.match(fromActivity, /variation=1234567890abcde/);
  assert.equal(buildTeamActivityProductHistoryPath('powerzona', 'https://evil.example/history', {}), '');

  const activityReturn = resolveProductHistoryReturnNavigation(
    'powerzona',
    new URLSearchParams('from=team-activity&module=catalog&search=creatina&page=3&returnUrl=https://evil.example'),
  );
  assert.equal(activityReturn.label, 'Volver a Actividad del equipo');
  assert.equal(activityReturn.path, '/t/powerzona/admin/team?tab=activity&module=catalog&search=creatina&page=3');
  assert.equal(activityReturn.path.includes('evil'), false);

  const expirationReturn = resolveProductHistoryReturnNavigation(
    'powerzona',
    new URLSearchParams('from=expirations&view=upcoming&range=60&page=2&query=creatina'),
  );
  assert.equal(expirationReturn.label, 'Volver a Vencimientos');
  assert.equal(expirationReturn.path, '/t/powerzona/admin/expirations?view=upcoming&range=60&page=2&query=creatina');

  const fallback = resolveProductHistoryReturnNavigation(
    'powerzona',
    new URLSearchParams('from=https://evil.example&returnUrl=https://evil.example'),
  );
  assert.deepEqual(fallback, {
    origin: 'products',
    path: '/t/powerzona/admin/products',
    label: 'Volver a Productos',
  });
});

test('V7E9-C3F4: Planes de la tienda solo se resuelve y renderiza para Principal', async () => {
  const account = await source('src/pages/t/[storeSlug]/admin/account.astro');
  assert.match(account, /getStoreAccessContext/);
  assert.match(account, /storeAccess\?\.access\.is_primary_admin === true/);
  assert.match(account, /const planPresentation = isPrimaryStoreAdmin[\s\S]*?\? resolveStorePlanPresentation\(adminContext\.store\)[\s\S]*?: null/);
  assert.match(account, /\{isPrimaryStoreAdmin && planPresentation && \(/);
  assert.match(account, /<h2 id="account-plan-title">Planes de la tienda<\/h2>/);
  assert.doesNotMatch(account, /style=.*Planes de la tienda/);
});

test('V7E9-C3F4: permisos usan accordions cerrados con contador, teclado y apertura por error', async () => {
  const team = await source('src/components/admin/StoreTeamView.astro');
  const styles = await source('src/styles/store-team.css');
  assert.match(team, /data-team-permission-group-toggle/);
  assert.match(team, /aria-expanded="false"/);
  assert.match(team, /aria-controls=\{`store-team-permission-panel-\$\{group\.code\}`\}/);
  assert.match(team, /data-team-permission-group-panel[\s\S]*?hidden/);
  assert.match(team, /`\$\{count\} de \$\{inputs\.length\} activos`/);
  assert.match(team, /closePermissionGroups\(\);[\s\S]*?syncPermissionInputs\(\)/);
  assert.match(team, /templateSelect\?\.addEventListener\('change'[\s\S]*?syncPermissionInputs\(\)/);
  assert.match(team, /if \(templateSelect\) templateSelect\.value = 'custom'/);
  assert.match(team, /openPermissionGroupForError\(error\)/);
  assert.match(styles, /\.store-team-permission-group__toggle:focus-visible/);
  assert.match(styles, /\.store-team-permission-list\[hidden\] \{ display: none; \}/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.store-team-permission-list[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
});

test('V7E9-C3F4: filtros 1/2/3 meses permanecen en una línea en PC y grid controlado en móvil', async () => {
  const expirations = await source('src/pages/admin/expirations.astro');
  assert.match(expirations, />1 mes<\/button>[\s\S]*?>2 meses<\/button>[\s\S]*?>3 meses<\/button>/);
  assert.match(expirations, /\.expiration-controls \.expiration-ranges \{[\s\S]*?flex: 0 0 auto;[\s\S]*?flex-wrap: nowrap;/);
  assert.match(expirations, /\.expiration-ranges \.expiration-filter \{ min-width: 74px; white-space: nowrap; \}/);
  assert.match(expirations, /@media \(max-width: 820px\) \{[\s\S]*?\.expiration-ranges \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(expirations, /data-expiration-range="30"/);
  assert.match(expirations, /data-expiration-range="60"/);
  assert.match(expirations, /data-expiration-range="90"/);
});
