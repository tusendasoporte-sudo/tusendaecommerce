import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  RESERVED_STORE_PERMISSION_KEYS,
  STORE_PERMISSION_CAPABILITIES,
  STORE_PERMISSION_DEFINITIONS,
  STORE_PERMISSION_DEPENDENCIES,
  STORE_PERMISSION_KEYS,
  STORE_PERMISSION_TEMPLATE_CODES,
  STORE_PERMISSION_TEMPLATES,
  detectStorePermissionTemplate,
  hasStorePermission,
  normalizeStorePermissions,
  resolvePermissionDependencies,
  resolveEffectiveStorePermissions,
  toggleStorePermission,
} from '../src/lib/storeTeamPermissions.ts';
import {
  STORE_TEAM_API_PATHS,
  canCreateStoreTeamUser,
  createStoreTeamUser,
  formatStoreTeamActiveCount,
  getStoreAccessContext,
  getStoreTeamErrorMessage,
  getStoreTeamSummary,
} from '../src/lib/storeTeam.ts';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const require = createRequire(import.meta.url);

test('M7U2: catálogo frontend contiene las 28 claves asignables y excluye las reservadas', () => {
  assert.equal(STORE_PERMISSION_KEYS.length, 28);
  assert.equal(new Set(STORE_PERMISSION_KEYS).size, STORE_PERMISSION_KEYS.length);
  assert.deepEqual(RESERVED_STORE_PERMISSION_KEYS, [
    'team.manage',
    'plan.manage',
    'primary_admin.replace',
    'premium_downgrade.confirm',
    'global_cleanup.execute',
  ]);
  for (const key of RESERVED_STORE_PERMISSION_KEYS) assert.equal(STORE_PERMISSION_KEYS.includes(key), false);
  assert.equal(STORE_PERMISSION_KEYS.includes('catalog.expirations.manage'), true);
});

test('M7U2: catálogo, reservas, dependencias, capacidades y plantillas son paritarios con backend', () => {
  const backend = require('../../backend-powerzona/pb_hooks/pz_store_team_permissions_lib.js');
  assert.deepEqual([...STORE_PERMISSION_KEYS], [...backend.ASSIGNABLE_PERMISSION_KEYS]);
  assert.deepEqual([...RESERVED_STORE_PERMISSION_KEYS], [...backend.RESERVED_PERMISSIONS]);
  assert.deepEqual(STORE_PERMISSION_DEPENDENCIES, backend.PERMISSION_DEPENDENCIES);
  assert.deepEqual(STORE_PERMISSION_CAPABILITIES, backend.PERMISSION_CAPABILITIES);
  assert.deepEqual([...STORE_PERMISSION_TEMPLATE_CODES], Object.keys(backend.PERMISSION_TEMPLATES));
  for (const code of STORE_PERMISSION_TEMPLATE_CODES) {
    assert.deepEqual(
      [...STORE_PERMISSION_TEMPLATES[code].permissions],
      [...backend.PERMISSION_TEMPLATES[code].permissions],
      `plantilla ${code}`,
    );
  }
  for (const key of STORE_PERMISSION_KEYS) {
    assert.equal(STORE_PERMISSION_DEFINITIONS[key].label, backend.PERMISSION_CATALOG[key].label, `etiqueta ${key}`);
  }
});

test('M7U2: dependencias se agregan y se retiran sin combinaciones imposibles', () => {
  assert.deepEqual(normalizeStorePermissions(['catalog.products.stock']), [
    'catalog.view',
    'catalog.products.stock',
  ]);
  assert.deepEqual(normalizeStorePermissions(['orders.price_adjustment']), [
    'orders.view',
    'orders.price_adjustment',
  ]);
  assert.deepEqual(normalizeStorePermissions(['security.manage']), [
    'security.view',
    'security.manage',
  ]);
  assert.deepEqual(
    toggleStorePermission(['orders.view', 'orders.status.manage'], 'orders.view', false),
    [],
  );
});

test('M7U2: plantillas rápidas respetan alcance y cambios manuales pasan a Personalizado', () => {
  assert.equal(STORE_PERMISSION_TEMPLATES.secondary_admin.permissions.length, STORE_PERMISSION_KEYS.length);
  assert.equal(STORE_PERMISSION_TEMPLATES.catalog_inventory.permissions.includes('catalog.expirations.manage'), true);
  assert.equal(STORE_PERMISSION_TEMPLATES.orders_shipping.permissions.includes('orders.price_adjustment'), false);
  assert.equal(STORE_PERMISSION_TEMPLATES.marketing_promotions.permissions.includes('landing_qr.manage'), true);
  assert.deepEqual(resolvePermissionDependencies(['analytics.view']), ['catalog.view', 'orders.view', 'analytics.view']);
  assert.equal(STORE_PERMISSION_TEMPLATES.read_only.permissions.every((key) => key.endsWith('.view')), true);
  assert.deepEqual(STORE_PERMISSION_TEMPLATES.custom.permissions, []);
  const manuallyChanged = toggleStorePermission(STORE_PERMISSION_TEMPLATES.read_only.permissions, 'shipping.manage', true);
  assert.equal(detectStorePermissionTemplate(manuallyChanged), 'custom');
});

test('M7U2: permisos efectivos respetan suspensión, bloqueo y capacidades del plan', () => {
  assert.deepEqual(resolveEffectiveStorePermissions({
    permissions: ['orders.view'],
    blocked_by_plan: true,
  }), []);
  assert.deepEqual(resolveEffectiveStorePermissions({
    is_primary_admin: true,
    status: 'suspended',
  }), []);
  const principal = resolveEffectiveStorePermissions({
    is_primary_admin: true,
    capabilities: {
      product_expiration_tools_enabled: false,
      raffles_enabled: false,
      landing_qr_enabled: false,
      security_enabled: false,
    },
  });
  assert.equal(principal.includes('catalog.products.edit'), true);
  assert.equal(principal.includes('catalog.expirations.manage'), false);
  assert.equal(principal.includes('raffles.manage'), false);
  assert.equal(principal.includes('security.view'), false);
  assert.equal(hasStorePermission(['orders.status.manage'], 'orders.view'), true);
});

test('M7U2: contador y disponibilidad cubren 1/4, 4/4 y ausencia de cupo', () => {
  assert.equal(formatStoreTeamActiveCount(1, 4), '1 de 4');
  assert.equal(formatStoreTeamActiveCount(4, 4), '4 de 4');
  assert.equal(canCreateStoreTeamUser({
    can_create: true,
    user_counts: { active: 1, total: 1, available: 3 },
    plan: { code: 'premium', label: 'Plan Premium', max_active_users: 4 },
  }), true);
  assert.equal(canCreateStoreTeamUser({
    can_create: false,
    user_counts: { active: 4, total: 4, available: 0 },
    plan: { code: 'premium', label: 'Plan Premium', max_active_users: 4 },
  }), false);
  assert.equal(canCreateStoreTeamUser({
    can_create: false,
    user_counts: { active: 1, total: 4, available: 0 },
    plan: { code: 'basic', label: 'Plan Básico', max_active_users: 1 },
  }), false);
});

test('M7U2: cliente privado usa POST JSON y nunca envía tienda ni actor desde el frontend', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(String(options.body || '{}')) });
    return new Response(JSON.stringify({
      ok: true,
      user: {
        id: 'user123',
        email: 'inventario@example.com',
        display_name: 'Inventario',
        role: 'store_staff',
        status: 'active',
        template_code: 'catalog_inventory',
        permissions: ['catalog.products.stock'],
      },
      temporary_password: 'Once-Only-123',
      temporary_password_expires_at: '2026-07-22 12:00:00Z',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const response = await createStoreTeamUser({
    email: 'INVENTARIO@example.com',
    display_name: 'Inventario',
    phone: '555',
    template_code: 'catalog_inventory',
    permissions: ['catalog.products.stock'],
    reason: 'Alta QA',
  }, { baseUrl: 'https://pb.example.test/', token: 'private-token', fetcher });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://pb.example.test${STORE_TEAM_API_PATHS.create}`);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].body.email, 'inventario@example.com');
  assert.deepEqual(calls[0].body.permissions, ['catalog.view', 'catalog.products.stock']);
  assert.equal(Object.hasOwn(calls[0].body, 'store'), false);
  assert.equal(Object.hasOwn(calls[0].body, 'store_id'), false);
  assert.equal(Object.hasOwn(calls[0].body, 'actor'), false);
  assert.equal(Object.hasOwn(calls[0].body, 'actor_id'), false);
  assert.equal(response.temporary_password, 'Once-Only-123');
});

test('M7U2: contexto de acceso se normaliza y el 403 tiene mensaje amigable', async () => {
  const context = await getStoreAccessContext({
    baseUrl: 'https://pb.example.test',
    token: 'private-token',
    fetcher: async () => new Response(JSON.stringify({
      ok: true,
      user: { display_name: 'Principal', role: 'store_admin' },
      store: { name: 'Tienda QA', slug: 'tienda-qa' },
      access: {
        is_primary_admin: true,
        blocked_by_plan: false,
        permissions: ['catalog.products.edit'],
        template_code: 'custom',
      },
      plan: { code: 'premium', max_active_users: 4, product_expiration_tools_enabled: true },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  });
  assert.equal(context.access.is_primary_admin, true);
  assert.deepEqual(context.access.permissions, ['catalog.view', 'catalog.products.edit']);

  await assert.rejects(
    getStoreTeamSummary({
      baseUrl: 'https://pb.example.test',
      token: 'private-token',
      fetcher: async () => new Response(JSON.stringify({ ok: false, error: 'permission_denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    }),
    (error) => {
      assert.equal(error.status, 403);
      assert.equal(getStoreTeamErrorMessage(error), 'No tienes permiso para realizar esta acción.');
      return true;
    },
  );
  assert.equal(
    getStoreTeamErrorMessage({ code: 'principal_not_configured' }),
    'El Administrador principal de esta tienda aún no está definido.',
  );
});

test('M7U2: ruta canónica, alias legacy y sidebar exclusivo del principal', () => {
  const canonicalWrapper = read('../src/pages/t/[storeSlug]/admin/team.astro');
  const legacyPage = read('../src/pages/admin/team.astro');
  const sidebar = read('../src/components/admin/AdminSidebar.astro');
  assert.match(canonicalWrapper, /import AdminTeam from '\.\.\/\.\.\/\.\.\/admin\/team\.astro'/);
  assert.match(canonicalWrapper, /<AdminTeam \/>/);
  assert.match(legacyPage, /getStoreAccessContext/);
  assert.match(legacyPage, /accessContext\.access\.is_primary_admin === true/);
  assert.match(legacyPage, /<h1>No tienes permiso<\/h1>/);
  assert.match(sidebar, /isPrimaryAdmin && <a class=\{navClass\('team'\)\}/);
  assert.match(sidebar, />Mi equipo<\/span>/);

  const bottomStart = sidebar.indexOf('<nav class="pz-admin-mobile-bottom-nav"');
  const bottomEnd = sidebar.indexOf('</nav>', bottomStart);
  const bottom = sidebar.slice(bottomStart, bottomEnd);
  assert.equal((bottom.match(/<a /g) || []).length, 4);
  assert.equal(bottom.includes('Mi equipo'), false);
});

test('M7U2: vista funcional cubre estados, acciones, secreto único y downgrade preservado', () => {
  const view = read('../src/components/admin/StoreTeamView.astro');
  assert.match(view, /Usuarios activos/);
  assert.match(view, /Cupos disponibles/);
  assert.match(view, /Plan actual/);
  assert.match(view, /Activo/);
  assert.match(view, /Suspendido/);
  assert.match(view, /Inactivo por plan/);
  assert.match(view, /Acceso temporal pendiente/);
  assert.match(view, /Contraseña temporal vencida/);
  assert.match(view, /Editar usuario/);
  assert.match(view, /Restablecer acceso/);
  assert.match(view, /Cerrar sesiones/);
  assert.match(view, /Revocar dispositivos/);
  assert.match(view, /Ver auditoría/);
  assert.equal(view.includes('data-team-action="delete"'), false);
  assert.match(view, /Tu plan permite un solo usuario activo/);
  assert.match(view, /permisos se muestran en modo lectura/);
  assert.match(view, /createButton\.disabled = !canCreateStoreTeamUser\(summary\)/);
  assert.match(view, /clearTemporarySecret\(\)/);
  assert.match(view, /secretValue\.textContent = ''/);
  assert.match(view, /secretDialog\?\.addEventListener\('close', \(\) => clearTemporarySecret\(\)\)/);
});

test('M7U2: UI no expone permisos reservados y aplica selección dependiente', () => {
  const view = read('../src/components/admin/StoreTeamView.astro');
  const permissions = read('../src/lib/storeTeamPermissions.ts');
  assert.match(view, /STORE_PERMISSION_CATALOG\.map/);
  assert.match(view, /toggleStorePermission\(selectedPermissions, input\.value, input\.checked\)/);
  assert.match(view, /templateSelect\.value = 'custom'/);
  for (const key of RESERVED_STORE_PERMISSION_KEYS) {
    assert.equal(view.includes(`value="${key}"`), false);
  }
  assert.match(permissions, /'catalog\.expirations\.manage': 'product_expiration_tools_enabled'/);
});

test('M7U2: gating evita notificaciones sin permiso y mantiene responsive de tabla a tarjetas', () => {
  const sidebar = read('../src/components/admin/AdminSidebar.astro');
  const view = read('../src/components/admin/StoreTeamView.astro');
  const styles = read('../src/styles/store-team.css');
  assert.match(sidebar, /canShowNotificationsNav/);
  assert.match(sidebar, /if \(config\.enabled === false\) return/);
  assert.match(sidebar, /canShowModule\('orders\.view'\)/);
  assert.match(sidebar, /canShowModule\('catalog\.view'\)/);
  assert.match(sidebar, /canShowModule\('shipping\.manage'\)/);
  assert.match(sidebar, /: \{ permissions: \[\], blocked_by_plan: true \}/);
  assert.doesNotMatch(sidebar, /!hasResolvedStoreAccess \|\|/);
  assert.match(view, /if \(root && config\.isPrimaryAdmin === true\)/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*?\.store-team-row \{[\s\S]*?border-radius: 16px/);
  assert.match(styles, /@media \(max-width: 640px\)/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
});
