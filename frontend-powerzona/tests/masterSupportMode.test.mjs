import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getStoreAccessContext } from '../src/lib/storeTeam.ts';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('cliente de equipo envia el tenant de soporte en header y conserva payload cerrado', async () => {
  let request = null;
  const response = {
    ok: true,
    user: { display_name: 'Master', role: 'master_admin' },
    store: { name: 'Mi tienda', slug: 'mi-tienda' },
    access: {
      is_primary_admin: true,
      blocked_by_plan: false,
      permissions: ['catalog.view'],
      template_code: 'primary_admin',
    },
    plan: { code: 'free', max_active_users: 1, product_expiration_tools_enabled: false },
  };
  await getStoreAccessContext({
    baseUrl: 'https://api.example.test',
    token: 'token-master',
    supportStoreId: 'abcdefghijklmn1',
    fetcher: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  assert.equal(request.options.headers['X-PZ-Support-Store'], 'abcdefghijklmn1');
  assert.deepEqual(JSON.parse(request.options.body), {});
});

test('entrada Master usa URL profesional, barra exclusiva y salida al resumen', () => {
  const middleware = read('../src/middleware.ts');
  const context = read('../src/lib/storeContext.ts');
  const sidebar = read('../src/components/admin/AdminSidebar.astro');
  const stores = read('../src/components/master/MasterStoresView.astro');
  const header = read('../src/components/master/MasterStoreContextHeader.astro');
  const professionalRoot = read('../src/pages/t/[storeSlug]/admin.astro');

  assert.match(middleware, /isMasterAdmin\(authPb\.authStore\.record as any\) && !isProfessionalAdminRoute/);
  assert.match(middleware, /requireCurrentStoreForAdmin\(authPb, \{ pathname \}\)/);
  assert.match(context, /isMasterSupport: true/);
  assert.match(context, /getSupportStoreSlug/);
  assert.match(sidebar, /isMasterAdmin\(sidebarAuth\.authStore\.record as any\)/);
  assert.match(sidebar, /Modo soporte Master/);
  assert.match(sidebar, /Tus cambios quedan registrados como Master Admin/);
  assert.match(sidebar, /\/master\/stores\/\$\{encodeURIComponent\(storeId\)\}/);
  assert.match(stores, /Administrar tienda/);
  assert.match(header, /Administrar tienda/);
  assert.doesNotMatch(professionalRoot, /isMasterAdmin\(authPb\.authStore\.record as any\)[\s\S]{0,100}redirect\('\/master'\)/);
  assert.match(professionalRoot, /requireCurrentStoreForAdmin\(authPb, \{ pathname: Astro\.url\.pathname \}\)/);
});

test('clientes de endpoints privados propagan el contexto Master', () => {
  for (const relative of [
    '../src/pages/admin/expirations.astro',
    '../src/pages/admin/organization.astro',
    '../src/pages/admin/promos.astro',
    '../src/pages/admin/index.astro',
  ]) {
    const source = read(relative);
    assert.match(source, /X-PZ-Support-Store/, relative);
  }
});

test('modo soporte no presenta la cuenta personal del administrador de tienda', () => {
  const sidebar = read('../src/components/admin/AdminSidebar.astro');
  const middleware = read('../src/middleware.ts');
  assert.match(sidebar, /!isMasterSupportMode && <a class=\{navClass\('account'\)\}/);
  assert.match(middleware, /requestedSection === 'account'/);
  assert.match(middleware, /context\.redirect\(`\/master\/stores\/\$\{encodeURIComponent\(adminContext\.storeId\)\}`\)/);
});
