import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  formatMasterStoreUserCount,
  shouldUseCompactStoreUserList,
} from '../src/lib/masterUserListMode.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const view = read('src/components/master/MasterStoreUsersView.astro');
const page = read('src/pages/master/stores/[storeId]/users/index.astro');
const service = read('src/lib/masterUsers.ts');
const styles = read('src/styles/master-users.css');

test('0, 1, 4 y 10 usuarios usan modo compacto; 11 usa modo completo', () => {
  for (const total of [0, 1, 4, 10]) assert.equal(shouldUseCompactStoreUserList(total), true);
  assert.equal(shouldUseCompactStoreUserList(11), false);
});

test('el contador usa un único helper con singular y plural correctos', () => {
  assert.equal(formatMasterStoreUserCount(0), '0 usuarios');
  assert.equal(formatMasterStoreUserCount(1), '1 usuario');
  assert.equal(formatMasterStoreUserCount(2), '2 usuarios');
  assert.match(view, /formatMasterStoreUserCount\(initialData\.pagination\.total_items\)/);
  assert.match(view, /formatMasterStoreUserCount\(data\.pagination\.total_items\)/);
  assert.doesNotMatch(view, /\$\{data\.pagination\.total_items\} usuarios/);
});

test('total_users sin filtros controla el modo y se normaliza de forma retrocompatible', () => {
  assert.match(service, /total_users: number/);
  assert.match(service, /normalizeMasterStoreUserPlan/);
  assert.match(service, /hasOwnProperty\.call\(value \|\| \{\}, 'total_users'\)/);
  assert.match(view, /shouldUseCompactStoreUserList\(plan\.total_users\)/);
  assert.match(page, /shouldUseCompactStoreUserList\(initialData\.plan\.total_users\)/);
});

test('modo compacto expone solo estado y elimina filtros heredados', () => {
  assert.match(view, /data-users-status-tab[\s\S]*data-status-value="all"[\s\S]*data-status-value="active"[\s\S]*data-status-value="suspended"/);
  assert.match(view, /search: compactMode \? ''/);
  assert.match(view, /compactMode \? 'all' : role\?\.value/);
  assert.match(page, /searchParams\.delete\('search'\)/);
  assert.match(page, /searchParams\.delete\('role'\)/);
  assert.match(page, /searchParams\.delete\('page'\)/);
  assert.match(view, /statusTab[\s\S]*load\(1\)/);
});

test('modo completo conserva debounce, abort, búsqueda, rol y paginación de diez', () => {
  assert.match(view, /type="search"/);
  assert.match(view, /setTimeout\(\(\) => load\(1\), 320\)/);
  assert.match(view, /activeController\?\.abort\(\)/);
  assert.match(view, /perPage: 10/);
  assert.match(view, /data-users-role/);
  assert.match(view, /data-users-page/);
});

test('la navegación se oculta con una página y reaparece con varias', () => {
  assert.match(view, /data-users-navigation hidden=\{initialData\.pagination\.total_pages <= 1\}/);
  assert.match(view, /navigation\.hidden = total <= 1/);
  assert.match(view, /pagination\?\.classList\.toggle\('is-count-only', total <= 1\)/);
});

test('las reglas responsive cubren 1440, 1024, 768, 430, 390 y 375 sin scroll horizontal propio', () => {
  const widths = [1440, 1024, 768, 430, 390, 375];
  assert.deepEqual(widths.filter((width) => width <= 1100), [1024, 768, 430, 390, 375]);
  assert.deepEqual(widths.filter((width) => width <= 820), [768, 430, 390, 375]);
  assert.deepEqual(widths.filter((width) => width <= 480), [430, 390, 375]);
  assert.match(styles, /@media \(max-width: 1100px\)[^{]*\{[^}]*\.master-users-layout \{ grid-template-columns: 1fr/);
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*\.master-users-mobile \{ display: grid/);
  assert.match(styles, /@media \(max-width: 480px\)[\s\S]*\.master-users-compact-filter \{ align-items: stretch; flex-direction: column/);
  assert.doesNotMatch(styles, /overflow-x:\s*(auto|scroll)/);
});
