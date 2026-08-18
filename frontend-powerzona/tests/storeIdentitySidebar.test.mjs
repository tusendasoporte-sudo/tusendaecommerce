import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getStoreInitials, getStoreOrderPrefix } from '../src/lib/storeIdentity.ts';

const sidebar = readFileSync(new URL('../src/components/admin/AdminSidebar.astro', import.meta.url), 'utf8');
const indicator = readFileSync(new URL('../src/components/shared/StorePlanIndicator.astro', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../src/pages/admin/store-settings.astro', import.meta.url), 'utf8');

test('las iniciales de tienda se derivan del nombre real', () => {
  assert.equal(getStoreInitials('Lo que estás buscando aquí lo encuentras'), 'LQ');
  assert.equal(getStoreInitials('PowerZona'), 'PZ');
  assert.equal(getStoreInitials('Ámbar'), 'ÁM');
  assert.match(sidebar, /getStoreInitials\(resolvedStoreName\)/);
  assert.doesNotMatch(sidebar, /brand-logo">PZ</);
});

test('el prefijo inicial usa dos letras del nombre y queda en ASCII', () => {
  assert.equal(getStoreOrderPrefix('Lo que estás buscando aquí lo encuentras'), 'LQ');
  assert.equal(getStoreOrderPrefix('PowerZona'), 'PZ');
  assert.equal(getStoreOrderPrefix('Ámbar'), 'AM');
});

test('el encabezado y el plan del sidebar permiten mostrar todo el contenido', () => {
  assert.match(sidebar, /\.pz-admin-sidebar__brand-title\s*\{[\s\S]*?overflow-wrap:\s*anywhere\s*!important;[\s\S]*?white-space:\s*normal\s*!important;/);
  assert.match(indicator, /\.store-plan-indicator--store-sidebar \.store-plan-indicator__copy\s*\{[\s\S]*?flex-direction:\s*column;[\s\S]*?overflow:\s*visible;/);
  assert.match(indicator, /\.store-plan-indicator--store-sidebar \.store-plan-indicator__detail\s*\{[\s\S]*?white-space:\s*nowrap;/);
});

test('una tienda nueva usa su nombre al crear los ajustes y un ejemplo genérico', () => {
  assert.match(settings, /value=\{currentStoreName\} placeholder="Ej: Mi tienda 84"/);
  assert.match(settings, /value=\{currentStorePrefix\} placeholder="Ej: MT"/);
  assert.match(settings, /CURRENT_STORE_NAME_PUBLIC_SETTINGS/);
  assert.match(settings, /CURRENT_STORE_PREFIX_PUBLIC_SETTINGS/);
  assert.doesNotMatch(settings, /stored_name:\s*'PowerZona'/);
  assert.doesNotMatch(settings, /store_name:\s*'PowerZona'/);
});

test('el contacto publico inicia con el WhatsApp indicado por el master admin', () => {
  assert.match(settings, /const currentStoreOwnerPhone = String\(adminContext\.store\.owner_phone \|\| ''\)\.trim\(\);/);
  assert.match(settings, /CURRENT_STORE_OWNER_PHONE_PUBLIC_SETTINGS = String\(currentStoreOwnerPhone \|\| ''\)\.trim\(\);/);
  assert.match(settings, /record\.whatsapp_number \|\| CURRENT_STORE_OWNER_PHONE_PUBLIC_SETTINGS/);
  assert.match(settings, /data\.append\('whatsapp_number', composeWhatsappNumber\(\)\)/);
});

test('la vista inicial de categorias usa una fila y permite cambiar a dos', () => {
  assert.match(settings, /settings-public-category-columns"><option value="1">1 por fila<\/option><option value="2">2 por fila<\/option>/);
  assert.match(settings, /record\.public_category_columns \|\| '1'/);
  assert.match(settings, /public_category_columns:\s*fields\.categoryColumns\.value \|\| '1'/);
});

test('los ajustes nuevos detectan cambios parciales y resuelven la carga inicial', () => {
  assert.match(settings, /import \{ readPocketBaseAuthToken \} from '\.\.\/\.\.\/lib\/storeActivity'/);
  assert.match(settings, /storeSettingsWindow\.__pzStoreSettingsAuthToken = \(\) => readPocketBaseAuthToken\(\)/);
  assert.doesNotMatch(settings, /<script define:vars=\{\{ adminAuthToken \}\}>/);
  assert.match(settings, /orderPrefix:\s*cleanOrderPrefix\(fields\.orderPrefix\?\.value \|\| ''\)/);
  assert.match(settings, /fields\.storeName\?\.value\?\.trim\(\) && fields\.orderPrefix\?\.value\?\.trim\(\)/);
  assert.doesNotMatch(settings, /fields\.storeName\?\.value\?\.trim\(\) && fields\.welcome\?\.value\?\.trim\(\)/);
  assert.doesNotMatch(settings, /id="settings-whatsapp-number"[^>]*required/);
  assert.match(settings, /loadSettings\(\)\.catch\(\(\) => \{[\s\S]*?renderSettings\(\);/);
});
