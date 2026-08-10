import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getStoreInitials } from '../src/lib/storeIdentity.ts';

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

test('el encabezado y el plan del sidebar permiten mostrar todo el contenido', () => {
  assert.match(sidebar, /\.pz-admin-sidebar__brand-title\s*\{[\s\S]*?overflow-wrap:\s*anywhere\s*!important;[\s\S]*?white-space:\s*normal\s*!important;/);
  assert.match(indicator, /\.store-plan-indicator--store-sidebar \.store-plan-indicator__copy\s*\{[\s\S]*?flex-direction:\s*column;[\s\S]*?overflow:\s*visible;/);
  assert.match(indicator, /\.store-plan-indicator--store-sidebar \.store-plan-indicator__detail\s*\{[\s\S]*?white-space:\s*nowrap;/);
});

test('una tienda nueva usa su nombre al crear los ajustes y un ejemplo genérico', () => {
  assert.match(settings, /value=\{currentStoreName\} placeholder="Ej: Mi tienda 84"/);
  assert.match(settings, /CURRENT_STORE_NAME_PUBLIC_SETTINGS/);
  assert.doesNotMatch(settings, /stored_name:\s*'PowerZona'/);
  assert.doesNotMatch(settings, /store_name:\s*'PowerZona'/);
});
