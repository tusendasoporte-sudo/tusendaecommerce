import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { safeAdminNotificationTarget } from '../src/lib/adminNotificationTarget.js';

const origin = 'https://powerzona.example';
const adminBase = '/t/tienda-uno/admin';

test('acepta solo rutas del admin del tenant y devuelve una URL relativa', () => {
  assert.equal(
    safeAdminNotificationTarget('/t/tienda-uno/admin/orders/abc?tab=items#total', adminBase, origin),
    '/t/tienda-uno/admin/orders/abc?tab=items#total',
  );
  assert.equal(
    safeAdminNotificationTarget('https://powerzona.example/t/tienda-uno/admin/notifications', adminBase, origin),
    '/t/tienda-uno/admin/notifications',
  );
  assert.equal(safeAdminNotificationTarget('/t/tienda-uno/admin', adminBase, origin), adminBase);
});

test('rechaza esquemas ejecutables, orígenes externos y otros tenants', () => {
  for (const target of [
    'javascript:alert(document.domain)',
    'data:text/html,<script>alert(1)</script>',
    'https://evil.example/t/tienda-uno/admin/orders',
    '//evil.example/t/tienda-uno/admin/orders',
    '/t/tienda-dos/admin/orders',
    '/t/tienda-uno/admin-evil',
    '/admin/orders',
  ]) {
    assert.equal(safeAdminNotificationTarget(target, adminBase, origin), '', target);
  }
});

test('rechaza ambigüedades de ruta, credenciales y entradas de control', () => {
  for (const target of [
    '/t/tienda-uno/admin/%2f%2fevil.example',
    '/t/tienda-uno/admin/%5c%5cevil.example',
    '/t/tienda-uno/admin/%2e%2e/public',
    '/t/tienda-uno/admin/%252e%252e/public',
    '/t/tienda-uno/admin/../public',
    'https://user:password@powerzona.example/t/tienda-uno/admin/orders',
    '/t/tienda-uno/admin\\orders',
    '/t/tienda-uno/admin/orders\njavascript:alert(1)',
  ]) {
    assert.equal(safeAdminNotificationTarget(target, adminBase, origin), '', target);
  }
});

test('las dos superficies de notificaciones reutilizan el helper seguro', () => {
  const sidebar = readFileSync(new URL('../src/components/admin/AdminSidebar.astro', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/pages/admin/notifications.astro', import.meta.url), 'utf8');

  for (const source of [sidebar, page]) {
    assert.match(source, /safeAdminNotificationTarget/);
    assert.match(source, /tenantAdminBasePath/);
  }
});
