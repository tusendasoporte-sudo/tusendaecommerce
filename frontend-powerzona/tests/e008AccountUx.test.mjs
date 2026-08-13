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
  assert.doesNotMatch(account, /<StoreActivityView/);
  assert.match(history, /<StoreActivityView[\s\S]*?mode="self"/);
  assert.match(history, /mobileBackHref=\{accountPath\}/);
  assert.match(middleware, /normalized\.startsWith\('account\/'\)/);
  assert.match(middleware, /requestedSection\.startsWith\('account\/'\)/);
});

test('E008: el historial inicia con filtros cerrados y solicita diez eventos', () => {
  assert.match(history, /filtersInitiallyOpen=\{false\}/);
  assert.match(history, /pageSize=\{10\}/);
  assert.match(activity, /open=\{filtersInitiallyOpen\}/);
  assert.match(activity, /data-activity-page-size=\{resolvedPageSize\}/);
  assert.match(activity, /per_page: activityPageSize/);
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
