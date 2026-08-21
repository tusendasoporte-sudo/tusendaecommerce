import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const account = read('../src/pages/t/[storeSlug]/admin/account.astro');
const history = read('../src/pages/t/[storeSlug]/admin/account/history.astro');
const activity = read('../src/components/admin/StoreActivityView.astro');
const styles = read('../src/styles/account-ui.css');
const middleware = read('../src/middleware.ts');

test('E008: Mi cuenta resume el historial en una acción que abre una página propia', () => {
  assert.match(account, /activityHistoryPath = getStoreAdminPath\(storeSlug, 'account\/history'\)/);
  assert.match(account, /href=\{activityHistoryPath\}>Ver historial<\/a>/);
  assert.match(account, /pz-account-heading--account-home/);
  assert.match(styles, /@media \(max-width: 1023px\)[\s\S]*?\.pz-account-heading--account-home h1 \{\s*display: none;/);
  assert.match(styles, /\.pz-account-heading--account-home p \{\s*margin-top: 0;/);
  assert.doesNotMatch(account, /<StoreActivityView/);
  assert.match(history, /<StoreActivityView[\s\S]*?mode="self"/);
  assert.match(history, /mobileBackHref=\{backPath\}/);
  assert.match(history, /backPath = returnToTeam \? getStoreAdminPath\(storeSlug, 'team'\) : accountPath/);
  assert.match(middleware, /normalized\.startsWith\('account\/'\)/);
  assert.match(middleware, /requestedSection\.startsWith\('account\/'\)/);
});

test('E008: el historial inicia con filtros cerrados y solicita diez eventos', () => {
  assert.match(history, /pz-account-heading--history/);
  assert.match(styles, /\.pz-account-heading--history h1 \{\s*display: none;/);
  assert.match(styles, /\.pz-account-heading--history p \{\s*margin-top: 0;/);
  assert.match(history, /filtersInitiallyOpen=\{false\}/);
  assert.match(history, /pageSize=\{10\}/);
  assert.match(activity, /open=\{filtersInitiallyOpen\}/);
  assert.match(activity, /data-activity-page-size=\{resolvedPageSize\}/);
  assert.match(activity, /per_page: activityPageSize/);
});

test('E008: el regreso móvil del historial es compacto y no cubre el encabezado', () => {
  assert.match(history, /pz-account-history-page/);
  assert.match(
    styles,
    /\.pz-account-history-page \.pz-admin-mobile-back-link \{[\s\S]*?left: auto !important;[\s\S]*?right: 14px !important;[\s\S]*?width: fit-content !important;/,
  );
  assert.match(
    styles,
    /\.pz-account-history-page \.pz-account-history-shell \{\s*padding-top: 148px;/,
  );
});

test('E008: cambiar contraseña abre un diálogo accesible y conserva el flujo seguro', () => {
  assert.match(account, /data-open-password-dialog>Cambiar contraseña<\/button>/);
  assert.match(account, /<dialog id="account-password-dialog"/);
  assert.match(account, /aria-label="Cerrar cambio de contraseña"/);
  assert.match(account, /passwordDialog\.showModal\(\)/);
  assert.match(account, /changeStoreAdminPassword\(input\)/);
  assert.match(account, /finishStoreAccountMutation\('password_changed=1'\)/);
  assert.match(styles, /\.pz-account-dialog::backdrop/);
  assert.match(styles, /\.pz-account-action-grid/);
});
