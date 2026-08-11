import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const auth = read('src/lib/auth.ts');
const middleware = read('src/middleware.ts');
const masterUsers = read('src/lib/masterUsers.ts');
const devices = read('src/lib/masterUserDevices.ts');
const devicesProxy = read('src/pages/api/master/store-user-devices.ts');
const account = read('src/lib/storeAccount.ts');
const listView = read('src/components/master/MasterStoreUsersView.astro');
const detailView = read('src/components/master/MasterStoreUserDetailView.astro');
const accountPage = read('src/pages/t/[storeSlug]/admin/account.astro');
const temporaryPage = read('src/pages/t/[storeSlug]/admin/change-temporary-password.astro');
const login = read('src/pages/login.astro');
const sidebar = read('src/components/admin/AdminSidebar.astro');
const masterSidebar = read('src/components/master/MasterSidebar.astro');
const actionsController = read('src/components/master/MasterStoreActionsController.astro');
const listPage = read('src/pages/master/stores/[storeId]/users/index.astro');
const usersStyles = read('src/styles/master-users.css');

test('AuthUser y helpers puros modelan el cambio temporal', () => {
  assert.match(auth, /must_change_password\?: boolean/);
  assert.match(auth, /export function requiresTemporaryPasswordChange/);
  assert.match(auth, /export function getTemporaryPasswordRedirect/);
  assert.match(auth, /change-temporary-password/);
});

test('middleware central bloquea el panel y libera al usuario normal', () => {
  assert.match(middleware, /requiresTemporaryPasswordChange\(adminContext\.user\)/);
  assert.match(middleware, /normalizedPath !== temporaryPath/);
  assert.match(middleware, /if \(isTemporaryRoute\) return context\.redirect\(canonicalAdminPath\)/);
  assert.equal((middleware.match(/requiresTemporaryPasswordChange/g) || []).length >= 2, true);
});

test('servicio Master expone filtros paginacion actividad planes y estado temporal', () => {
  for (const token of ['listMasterStoreUsers', 'getMasterStoreUserDetail', 'updateMasterStoreUser', 'issueMasterTemporaryPassword', 'revokeMasterStoreUserSessions', 'getMasterStoreUserAudit', 'last_admin_activity_at', 'temporary_password_state', 'max_devices_per_user', 'max_store_devices']) {
    assert.match(masterUsers, new RegExp(token));
  }
  assert.doesNotMatch(masterUsers, /collection\(['"]users['"]\)/);
});

test('servicio de dispositivos usa solo endpoints privados sanitizados', () => {
  assert.match(devices, /\/api\/pz\/master\/store-user-devices\//);
  assert.match(devices, /authorized.*revoked.*all/s);
  assert.match(devices, /deleteMasterUserDevice/);
  for (const secret of ['device_digest', 'tokenKey', 'user_agent', 'location', 'latitude', 'longitude']) assert.doesNotMatch(devices, new RegExp(secret, 'i'));
});

test('acciones Master siempre sincronizan la cookie activa antes de usar el cliente compartido', () => {
  const masterComponents = [
    'MasterStoreUsersView.astro',
    'MasterStoreUserDetailView.astro',
    'MasterStoreProductsView.astro',
    'MasterStorePlanView.astro',
    'MasterStoreDeleteDialog.astro',
    'MasterNotificationsDeleteAllDialog.astro',
    'MasterNotificationsBell.astro',
    'MasterProductReadonlyView.astro',
    'MasterNotificationsView.astro',
    'MasterPriceWatchDetailView.astro',
    'MasterStoreActionsController.astro',
  ].map((name) => read(`src/components/master/${name}`));
  for (const component of masterComponents) {
    assert.match(component, /pb\.authStore\.loadFromCookie\(document\.cookie, 'pb_auth'\)/);
    assert.doesNotMatch(component, /if \(!pb\.authStore\.isValid\)\s+pb\.authStore\.loadFromCookie/);
  }
  assert.match(devices, /candidate\?\.message/);
});

test('acciones dinÃ¡micas de dispositivos usan un proxy mismo origen con la cookie Master', () => {
  assert.match(devices, /fetch\('\/api\/master\/store-user-devices'/);
  assert.match(devices, /credentials: 'same-origin'/);
  assert.match(devices, /client === pb && typeof window !== 'undefined'/);
  assert.match(devicesProxy, /refreshAuthFromCookie\(request\.headers\.get\('cookie'\)/);
  assert.match(devicesProxy, /requireMasterAdmin/);
  for (const action of ['listMasterUserDevices', 'revokeMasterUserDevice', 'deleteMasterUserDevice', 'getMasterUserDeviceAudit']) {
    assert.match(devicesProxy, new RegExp(action));
  }
  assert.match(devicesProxy, /hasExactKeys\(body, ACTION_KEYS\[action\]\)/);
  assert.doesNotMatch(devicesProxy, /authStore\.token|Authorization/);
});

test('servicio de cuenta limpia auth y cookie despues de mutaciones', () => {
  assert.match(account, /change-temporary-password/);
  assert.match(account, /change-password/);
  assert.match(account, /revoke-sessions/);
  assert.match(account, /client\.authStore\.clear\(\)/);
  assert.match(account, /Max-Age=0/);
  assert.match(account, /password_setup=1.*password_changed=1.*sessions_closed=1/s);
});

test('listado implementa filtros debounce abort paginacion y evita pending como estado de usuario', () => {
  assert.match(listView, /type="search"/);
  assert.match(listView, /setTimeout\(\(\) => load\(1\), 320\)/);
  assert.match(listView, /AbortController/);
  assert.match(listView, /activeController\?\.abort\(\)/);
  assert.match(listView, /perPage: 10/);
  assert.match(listView, /store_admin.*store_staff/s);
  assert.match(listView, /active.*suspended/s);
  assert.doesNotMatch(listView, /value="pending"/);
});

test('limites 1 1 4 y 5 5 20 se consumen desde la respuesta dinamica', () => {
  assert.match(listView, /plan\.active_users.*plan\.max_active_users/);
  assert.match(listView, /plan\.max_devices_per_user/);
  assert.match(listView, /plan\.max_store_devices/);
  assert.doesNotMatch(listView, /Premium permite|Premium solamente|PowerZona Premium/);
});

test('creacion temporal genera con Web Crypto muestra copia y limpia el secreto', () => {
  assert.match(listView, /crypto\.getRandomValues/);
  assert.match(listView, /chars\.length < 18/);
  assert.match(listView, /data-create-copy/);
  assert.match(listView, /data-create-secret-result/);
  assert.match(listView, /transientSecret = ''/);
  assert.match(listView, /secretNode\.textContent = ''/);
  assert.match(listView, /let issuedSecret = ''/);
  assert.match(listView, /issuedSecret = submittedSecret/);
  assert.match(listView, /copyIssuedSecret/);
  assert.match(listView, /navigator\.clipboard\.writeText\(issuedSecret\)/);
  assert.doesNotMatch(listView, /transientSecret \|\| password/);
  assert.match(listView, /toggle\.textContent = 'Mostrar'/);
  for (const storage of ['localStorage', 'sessionStorage']) assert.doesNotMatch(listView, new RegExp(storage));
});

test('detalle protege al principal y al ultimo admin, con eliminacion critica solo en zona de peligro', () => {
  assert.match(detailView, /único Administrador activo/);
  assert.match(detailView, /disabled=\{isPrimaryAdmin \|\| detail\.protection\.last_active_admin\}/);
  assert.match(detailView, /Este usuario es el Administrador principal/);
  assert.match(detailView, /Reemplaza primero al Administrador principal/);
  assert.match(detailView, /last_active_admin_required|Debe existir al menos/);
  assert.match(detailView, /Zona de peligro/);
  assert.match(detailView, /deleteMasterStoreUser/);
  assert.match(detailView, /Crea o activa otro Administrador/);
  assert.match(detailView, /data-open-delete-user disabled=\{deleteBlocked\}/);
});

test('restablecimiento Master es temporal cierra sesiones y limpia secreto', () => {
  assert.match(detailView, /Restablecer acceso/);
  assert.match(detailView, /vencerá en 72 horas/);
  assert.match(detailView, /todas las sesiones actuales dejarán de funcionar/);
  assert.match(detailView, /issueMasterTemporaryPassword/);
  assert.match(detailView, /resetSecret\.textContent = ''/);
  assert.match(detailView, /issuedSecret = submittedSecret/);
  assert.match(detailView, /navigator\.clipboard\.writeText\(issuedSecret\)/);
  assert.doesNotMatch(detailView, /transientSecret \|\| resetPassword/);
  assert.match(detailView, /resetToggle\.textContent = 'Mostrar'/);
  assert.doesNotMatch(detailView, /establecer contraseña permanente|excepto la actual/i);
});

test('dispositivos no inventan IP ubicacion ni identificadores visibles', () => {
  for (const visible of ['label', 'browser_name', 'os_name', 'device_type', 'first_seen_at', 'last_seen_at']) assert.match(detailView, new RegExp(visible));
  for (const forbidden of ['Ubicación', 'Ciudad', 'País', 'IP:', 'device_digest', 'User-Agent']) assert.doesNotMatch(detailView, new RegExp(forbidden, 'i'));
  assert.match(detailView, /no solamente la sesión de este dispositivo/);
  assert.match(detailView, /data-delete-device-index/);
  assert.match(detailView, /Borrar dispositivo revocado/);
  assert.match(detailView, /deleteMasterUserDevice/);
});

test('filtros de dispositivos marcan la pestaña seleccionada', () => {
  assert.match(detailView, /data-device-filter="authorized" aria-pressed="true"/);
  assert.match(detailView, /data-device-filter="revoked" aria-pressed="false"/);
  assert.match(detailView, /syncDeviceFilterButtons/);
  assert.match(detailView, /classList\.toggle\('master-btn--secondary', selected\)/);
  assert.match(detailView, /setAttribute\('aria-pressed', String\(selected\)\)/);
});

test('auditoria combinada traduce eventos y carga incremental sin duplicados', () => {
  for (const action of ['user_created', 'user_updated', 'temporary_password_issued', 'forced_password_changed', 'sessions_revoked', 'self_password_changed', 'device_authorized', 'device_revoked', 'device_deleted']) assert.match(detailView, new RegExp(action));
  assert.match(detailView, /new Set/);
  assert.match(detailView, /data-audit-id=\{`\$\{item\.auditNamespace\}:\$\{item\.id\}`\}/);
  assert.match(detailView, /userAuditHasMore/);
  assert.match(detailView, /deviceAuditHasMore/);
  assert.match(detailView, /rebuildCombinedAudit/);
  for (const label of ['Email', 'Nombre', 'Teléfono', 'Rol', 'Estado']) assert.match(detailView, new RegExp(`'${label}'`));
  assert.match(detailView, /Cargar más/);
});

test('mutaciones de dispositivo recargan detalle lista contador y ambas auditorias', () => {
  assert.match(detailView, /refreshAfterDeviceMutation/);
  assert.match(detailView, /getMasterStoreUserDetail/);
  assert.match(detailView, /currentDeviceFilter/);
  assert.match(detailView, /getMasterStoreUserAudit/);
  assert.match(detailView, /getMasterUserDeviceAudit/);
  assert.match(detailView, /data-summary-device-count/);
  assert.match(detailView, /data-summary-last-activity/);
  assert.match(detailView, /data-summary-active-count/);
});

test('registro push asocia la instalación con la identidad administrativa', () => {
  assert.match(sidebar, /readCookieValue\('pz_admin_device'\)/);
  assert.match(sidebar, /headers\['X-PZ-Admin-Device'\] = adminDeviceToken/);
});

test('existe un solo formulario oficial de creacion y create=1 abre una vez', () => {
  assert.equal((listView.match(/data-create-form/g) || []).length, 2);
  assert.doesNotMatch(actionsController, /master-user-dialog|data-user-form|data-user-save|createStoreUserFromMaster/);
  assert.match(actionsController, /users\?create=1/);
  assert.match(listView, /get\('create'\) === '1'/);
  assert.match(listView, /searchParams\.delete\('create'\)/);
});

test('eliminacion exige email motivo checkbox usa endpoint privado y redirige', () => {
  assert.match(detailView, /data-delete-user-reason/);
  assert.match(detailView, /deleteEmail\?\.value !== userEmail/);
  assert.match(detailView, /data-delete-user-confirm/);
  assert.match(detailView, /Entiendo que esta acción es permanente/);
  assert.match(detailView, /aria-live="assertive"/);
  assert.match(detailView, /addEventListener\('cancel'.*deletingUser/s);
  assert.match(detailView, /users\?deleted=1/);
  assert.match(masterUsers, /deleteMasterStoreUser/);
  assert.match(masterUsers, /confirmation_email/);
  assert.doesNotMatch(masterUsers, /collection\(['"]users['"]\)\.delete/);
  assert.match(listView, /Usuario eliminado permanentemente\./);
  assert.match(listPage, /page > initialData\.pagination\.total_pages/);
});

test('zona critica conserva reglas responsive sin anchos rigidos ni scroll horizontal propio', () => {
  assert.match(usersStyles, /\.master-users-page \{[^}]*min-width: 0/);
  assert.match(usersStyles, /\.master-delete-user-summary span \{[^}]*min-width: 0/);
  assert.match(usersStyles, /@media \(max-width: 820px\)/);
  assert.match(usersStyles, /@media \(max-width: 480px\)/);
  assert.match(usersStyles, /\[data-delete-user-submit\] \{ width: 100%/);
  assert.doesNotMatch(usersStyles, /overflow-x:\s*(auto|scroll)/);
});

test('Mi cuenta cubre Admin y Staff y exige reautenticacion total', () => {
  assert.doesNotMatch(accountPage, /if \(!isStoreAdmin\(adminContext\.user\)\)/);
  assert.match(accountPage, /isStoreStaff\(user\)/);
  assert.match(accountPage, /incluida esta sesión/);
  assert.match(accountPage, /Cerrar todas mis sesiones/);
  assert.match(accountPage, /changeStoreAdminPassword/);
  assert.match(accountPage, /revokeStoreAdminSessions/);
  assert.doesNotMatch(accountPage, /Editar email|Cambiar email|gestionar otros usuarios/i);
});

test('cambio obligatorio admite Admin Staff sin navegacion operativa', () => {
  assert.match(temporaryPage, /isStoreUser\(adminContext\.user\)/);
  assert.match(temporaryPage, /Debes crear tu contraseña personal/);
  assert.match(temporaryPage, /changeTemporaryPassword/);
  assert.match(temporaryPage, /password_setup=1/);
  for (const operational of ['AdminSidebar', 'Productos', 'Pedidos', 'Dispositivos autorizados', 'Auditoría']) assert.doesNotMatch(temporaryPage, new RegExp(operational));
});

test('login muestra mensajes neutrales y dirige la sesion temporal', () => {
  assert.match(login, /Contraseña personal creada\. Inicia sesión nuevamente\./);
  assert.match(login, /Contraseña actualizada\. Inicia sesión nuevamente\./);
  assert.match(login, /Sesiones cerradas\. Inicia sesión nuevamente\./);
  assert.match(login, /temporary_password_expired/);
  assert.match(login, /getTemporaryPasswordRedirect/);
});

test('sidebars integran rutas sin crear layouts paralelos ni quinto boton movil', () => {
  assert.match(masterSidebar, /\/users/);
  assert.match(masterSidebar, />Usuarios</);
  assert.match(sidebar, /adminAccountPath/);
  assert.match(sidebar, />Mi cuenta</);
  const mobileBottom = sidebar.slice(sidebar.indexOf('<nav class="pz-admin-mobile-bottom-nav"'), sidebar.indexOf('</nav>', sidebar.indexOf('<nav class="pz-admin-mobile-bottom-nav"')));
  assert.match(sidebar, /const mobileBottomItems = mobileBottomCandidates[\s\S]*?\.slice\(0, 4\)/);
  assert.match(mobileBottom, /mobileBottomItems\.map\(\(item\) => <a/);
  assert.doesNotMatch(mobileBottom, /Mi cuenta/);
});

test('rutas canonicas y legacy existen', () => {
  for (const route of [
    'src/pages/master/stores/[storeId]/users/index.astro',
    'src/pages/master/stores/[storeId]/users/[userId].astro',
    'src/pages/t/[storeSlug]/admin/change-temporary-password.astro',
    'src/pages/t/[storeSlug]/admin/account.astro',
    'src/pages/admin/change-temporary-password.astro',
    'src/pages/admin/account.astro',
  ]) assert.equal(fs.existsSync(path.join(ROOT, route)), true, route);
});
