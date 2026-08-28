import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const service = read('src/lib/masterPrimaryAdmin.ts');
const control = read('src/components/master/MasterPrimaryAdminControl.astro');
const usersView = read('src/components/master/MasterStoreUsersView.astro');
const detailView = read('src/components/master/MasterStoreUserDetailView.astro');
const usersPage = read('src/pages/master/stores/[storeId]/users/index.astro');
const detailPage = read('src/pages/master/stores/[storeId]/users/[userId].astro');
const styles = read('src/styles/master-users.css');

test('el cliente Master usa endpoints privados y payloads cerrados', () => {
  assert.match(service, /\/api\/pz\/master\/primary-admin\/\$\{action\}/);
  assert.match(service, /action: 'status' \| 'assign' \| 'replace'/);
  assert.match(service, /store_id: input\.storeId/);
  assert.match(service, /user_id: input\.userId/);
  assert.match(service, /previous_user_mode: input\.previousUserMode/);
  assert.match(service, /template_code: templateCode/);
  assert.match(service, /permissions,/);
  assert.match(service, /requestKey: null/);
});

test('el reemplazo exige advertencia fuerte y confirmación textual exacta', () => {
  assert.match(service, /REEMPLAZAR ADMINISTRADOR PRINCIPAL/);
  assert.match(control, /esta operación transfiere el control/);
  assert.match(control, /cerrarán todas las sesiones del Administrador principal anterior y del nuevo/);
  assert.match(control, /No se transfieren contraseñas, tokens ni secretos/);
  assert.match(control, /data-primary-confirmation/);
  assert.match(control, /data-primary-ack/);
  assert.match(control, /Reemplazar definitivamente/);
});

test('el Master decide si el anterior queda adicional con permisos o suspendido', () => {
  assert.match(control, /value="keep_active"/);
  assert.match(control, /value="suspend"/);
  assert.match(control, /STORE_PERMISSION_TEMPLATES/);
  assert.match(control, /STORE_PERMISSION_CATALOG/);
  assert.match(control, /data-primary-permission/);
  assert.match(control, /toggleStorePermission/);
  assert.match(control, /detectStorePermissionTemplate/);
  assert.match(service, /normalizeStorePermissions\(input\.permissions\)/);
});

test('lista y detalle consultan estado, muestran badge y reutilizan el flujo protegido', () => {
  assert.match(usersPage, /getMasterPrimaryAdminStatus\(storeId, authPb\)/);
  assert.match(detailPage, /getMasterPrimaryAdminStatus\(storeId, authPb\)/);
  assert.match(usersView, /MasterPrimaryAdminControl/);
  assert.match(detailView, /MasterPrimaryAdminControl/);
  assert.match(usersView, /master-primary-admin-badge/);
  assert.match(detailView, /Administrador principal/);
  assert.match(detailView, /isPrimaryAdmin \|\| detail\.protection\.last_active_admin/);
  assert.match(detailView, /Reemplaza primero al Administrador principal/);
});

test('las tiendas Promo conservan su aviso y pueden definir al Administrador principal', () => {
  assert.match(usersView, /store\.storeType === 'promo'[\s\S]*Usuarios de Tienda Promo/);
  assert.match(usersView, /<MasterPrimaryAdminControl storeId=\{store\.id\} status=\{primaryAdmin\} \/>/);
  assert.doesNotMatch(usersView, /\)\s*:\s*<MasterPrimaryAdminControl/);
  assert.match(detailView, /<MasterPrimaryAdminControl storeId=\{store\.id\} status=\{primaryAdmin\} fixedTargetId=\{user\.id\} compact \/>/);
  assert.doesNotMatch(detailView, /store\.storeType !== 'promo'\s*&&\s*<MasterPrimaryAdminControl/);
});

test('los estados pendientes y sin candidato son visibles para el Master', () => {
  assert.match(service, /pending_multiple/);
  assert.match(service, /pending_single/);
  assert.match(service, /La tienda necesita un Administrador principal/);
  assert.match(control, /Acción pendiente/);
  assert.match(control, /Crea o activa un Administrador/);
});

test('el control se adapta a móvil sin ampliar la barra ni forzar ancho horizontal', () => {
  assert.match(styles, /\.master-primary-admin-card/);
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*\.master-primary-admin-card \{ align-items: stretch; flex-direction: column/);
  assert.match(styles, /@media \(max-width: 480px\)[\s\S]*\.master-primary-admin-permissions fieldset > div \{ grid-template-columns: 1fr/);
  assert.doesNotMatch(control, /master-bottom-nav|barra inferior/i);
});
