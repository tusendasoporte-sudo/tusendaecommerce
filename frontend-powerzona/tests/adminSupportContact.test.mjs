import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { getAdminSupportContact } from '../src/lib/adminSupport.ts';

const sidebarUrl = new URL('../src/components/admin/AdminSidebar.astro', import.meta.url);
const sidebar = readFileSync(sidebarUrl, 'utf8');

test('consulta el contacto privado y acepta únicamente enlaces wa.me válidos', async () => {
  let request = null;
  const result = await getAdminSupportContact({
    baseUrl: 'https://api.example.test/',
    token: 'store-admin-token',
    fetcher: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({
        ok: true,
        contact: {
          configured: true,
          href: 'https://wa.me/5351234567?text=Hola%20soporte',
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  assert.equal(request.url, 'https://api.example.test/api/pz/admin/support-contact');
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.headers.Authorization, 'Bearer store-admin-token');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(result.available, true);
  assert.equal(result.contact.configured, true);
  assert.match(result.contact.href, /^https:\/\/wa\.me\/5351234567\?text=/);
});

test('el modo soporte Master envía el contexto explícito de la tienda', async () => {
  let request = null;
  const result = await getAdminSupportContact({
    baseUrl: 'https://api.example.test',
    token: 'master-token',
    supportStoreId: 'supportstore001',
    fetcher: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({
        ok: true,
        contact: {
          configured: true,
          href: 'https://wa.me/5351234567?text=Hola%20soporte',
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  assert.equal(request.options.headers.Authorization, 'Bearer master-token');
  assert.equal(request.options.headers['X-PZ-Support-Store'], 'supportstore001');
  assert.equal(result.available, true);
});

test('un contexto Master inválido falla cerrado sin hacer la solicitud', async () => {
  let called = false;
  const result = await getAdminSupportContact({
    baseUrl: 'https://api.example.test',
    token: 'master-token',
    supportStoreId: 'no-valido',
    fetcher: async () => {
      called = true;
      throw new Error('no debería ejecutarse');
    },
  });

  assert.equal(called, false);
  assert.equal(result.available, false);
  assert.deepEqual(result.contact, { configured: false, href: '' });
});

test('una respuesta manipulada no habilita el botón', async () => {
  const result = await getAdminSupportContact({
    baseUrl: 'https://api.example.test',
    token: 'store-admin-token',
    fetcher: async () => new Response(JSON.stringify({
      ok: true,
      contact: { configured: true, href: 'https://example.test/phishing' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  });
  assert.equal(result.available, false);
  assert.deepEqual(result.contact, { configured: false, href: '' });
});

test('la tarjeta aprobada separa la marca Tu Senda 84 del canal WhatsApp', () => {
  assert.match(sidebar, /getAdminSupportContact/);
  assert.doesNotMatch(sidebar, /PUBLIC_MASTER_SUPPORT_WHATSAPP/);
  assert.match(sidebar, /¿Necesitas ayuda\?/);
  assert.match(sidebar, /Habla con nuestro equipo por WhatsApp/);
  assert.match(sidebar, /Contactar por WhatsApp/);
  assert.match(sidebar, /Soporte no disponible/);
  assert.match(sidebar, /\/brand\/tu-senda-84-admin-icon-512\.png/);
  assert.doesNotMatch(sidebar, /mobile-admin\/store-assets/);
  assert.match(sidebar, /pz-admin-sidebar__support-brandmark/);
  assert.match(sidebar, /pz-admin-sidebar__support-btn[\s\S]*?background:\s*#0f7a3d\s*!important/);

  const brandAsset = new URL('../public/brand/tu-senda-84-admin-icon-512.png', import.meta.url);
  assert.equal(existsSync(brandAsset), true);
});
