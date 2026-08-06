import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  getLandingQrPath,
  getLandingQrStorePath,
  isLandingQrStoredEnabled,
  landingQrRedirectResponse,
  resolveLandingQrCapability,
} from '../src/lib/landingQr.ts';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const future = '2099-12-31T23:59:59.000Z';
const past = '2000-01-01T00:00:00.000Z';
const store = (plan, overrides = {}) => ({
  id: 'storel7q100001',
  slug: 'tienda-l7q1',
  status: 'active',
  plan,
  plan_started_at: '2026-07-01T00:00:00.000Z',
  plan_expires_at: future,
  plan_is_permanent: false,
  ...overrides,
});

test('L7Q1: capacidad pública falla cerrada y respeta vencimiento sin mutar estado almacenado', () => {
  assert.equal(resolveLandingQrCapability(store('free')).allowed, false);
  assert.equal(resolveLandingQrCapability(store('basic')).allowed, false);
  assert.equal(resolveLandingQrCapability(store('premium')).allowed, true);
  assert.equal(resolveLandingQrCapability(store('premium', { plan_expires_at: past })).reason, 'plan_expired');
  assert.equal(resolveLandingQrCapability(store('desconocido')).reason, 'invalid_plan_data');

  for (const value of [true, 1, '1', 'true', 'TRUE']) {
    assert.equal(isLandingQrStoredEnabled(value), true);
  }
  for (const value of [false, 0, '0', 'false', '', null, undefined]) {
    assert.equal(isLandingQrStoredEnabled(value), false);
  }
});

test('L7Q1: redirección pública usa home canónico y cabeceras privadas no-store', async () => {
  const currentStore = store('basic');
  const response = landingQrRedirectResponse(currentStore);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/t/tienda-l7q1');
  assert.match(response.headers.get('cache-control') || '', /private/);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  assert.equal(response.headers.get('pragma'), 'no-cache');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(await response.text(), '');
  assert.equal(getLandingQrPath(currentStore), '/t/tienda-l7q1/links');
  assert.equal(getLandingQrStorePath(currentStore), '/t/tienda-l7q1');
});

test('L7Q1: Principal sin capacidad descubre gate sin montar el editor ni Guardar contextual', () => {
  const settings = read('../src/pages/admin/store-settings.astro');
  const sidebar = read('../src/components/admin/AdminSidebar.astro');
  const panel = settings.slice(
    settings.indexOf('<section id="tab-landing"'),
    settings.indexOf('<section id="tab-monedas"'),
  );

  assert.match(settings, /resolveStoreCapabilityAccess\([\s\S]*?'landing_qr_enabled',[\s\S]*?enforceExpiration: true/);
  assert.match(settings, /const showLandingQrGate = isPrimaryAdmin && !landingQrAccess\.allowed/);
  assert.match(settings, /const canOpenLandingTab = canManageLanding \|\| showLandingQrGate/);
  assert.match(panel, /showLandingQrGate \? \([\s\S]*?<StoreCapabilityGate/);
  assert.match(panel, /planExpiredUsesPlanGate=\{true\}/);
  assert.match(panel, /\) : canManageLanding && \([\s\S]*?<LandingQrSettings/);
  assert.equal((panel.match(/<LandingQrSettings/g) || []).length, 1);
  assert.match(panel, /Crea una página de enlaces con QR fijo, botones personalizados y analíticas\./);
  assert.match(panel, /Tu configuración permanece guardada y volverá a estar disponible al regresar a Premium\./);
  assert.match(settings, /body\.pz-settings-landing-active \.pz-admin-mobile-topbar__action[\s\S]*?display: none/);
  assert.match(settings, /body\.pz-settings-resolving \.pz-admin-mobile-topbar__action[\s\S]*?visibility: hidden/);
  assert.match(settings, /else if \(window\.location\.hash === '#landing'\) showTab\('landing'\)/);
  assert.match(settings, /\.\.\.\(canOpenLandingTab === true \? \['landing'\] : \[\]\)/);

  assert.match(sidebar, /resolveStoreCapabilityAccess\([\s\S]*?'landing_qr_enabled',[\s\S]*?enforceExpiration: true/);
  assert.match(sidebar, /canShowModule\('landing_qr\.manage'\)[\s\S]*?\|\| \(isPrimaryAdmin && !landingQrAccess\.allowed\)/);
  assert.match(sidebar, /\{canShowLandingQrNav && <a[\s\S]*?#landing/);
});

test('L7Q1: rutas públicas comprueban capacidad y activación antes de render/configuración', () => {
  for (const relative of [
    '../src/pages/links.astro',
    '../src/pages/t/[storeSlug]/links.astro',
  ]) {
    const source = read(relative);
    const capabilityIndex = source.indexOf('resolveLandingQrCapability(currentStore)');
    const settingsIndex = source.indexOf('await getSettings');
    const renderIndex = source.indexOf('<LandingQrPublicPage');
    assert.ok(capabilityIndex > -1, relative);
    assert.ok(settingsIndex > capabilityIndex, relative);
    assert.ok(renderIndex > settingsIndex, relative);
    assert.match(source, /if \(!landingCapability\.allowed\) \{[\s\S]*?landingQrRedirectResponse\(currentStore\)/);
    assert.match(source, /if \(!isLandingQrStoredEnabled\(settings\?\.landing_qr_enabled\)\)/);
  }
});

test('L7Q1: QR depende solo de capacidad y conserva generación fija bajo demanda', () => {
  for (const relative of [
    '../src/pages/t/[storeSlug]/links/qr.png.ts',
    '../src/pages/t/[storeSlug]/links/qr.svg.ts',
  ]) {
    const source = read(relative);
    assert.ok(source.indexOf('resolveLandingQrCapability(store)') < source.indexOf('QRCode.'));
    assert.match(source, /if \(!resolveLandingQrCapability\(store\)\.allowed\)/);
    assert.match(source, /landingQrUnavailableResponse\(\)/);
    assert.match(source, /LANDING_QR_PRIVATE_NO_STORE_HEADERS/);
    assert.doesNotMatch(source, /landing_qr_enabled/);
  }

  const editor = read('../src/components/admin/LandingQrSettings.astro');
  assert.match(editor, /function mountPreview\(\)[\s\S]*?previewMount\.innerHTML/);
  assert.match(editor, /function togglePreview\(\)[\s\S]*?mountPreview\(\)/);
  assert.match(editor, /function mountQr\(\)[\s\S]*?qrMount\.innerHTML/);
  assert.match(editor, /function toggleQr\(\)[\s\S]*?mountQr\(\)/);
});

test('L7Q1: tracking valida plan, estado, tenant, ruta y enlace antes de insertar', () => {
  const click = read('../src/pages/api/landing-qr/click.ts');
  const storeIndex = click.indexOf("pb.collection('stores').getOne");
  const capabilityIndex = click.indexOf('resolveLandingQrCapability(storeRecord)');
  const settingsIndex = click.indexOf('await getSettings');
  const createIndex = click.indexOf("fetch(`${baseUrl}/api/collections/store_analytics_events/records`");
  assert.ok(storeIndex > -1);
  assert.ok(capabilityIndex > storeIndex);
  assert.ok(settingsIndex > capabilityIndex);
  assert.ok(createIndex > settingsIndex);
  assert.match(click, /isLandingQrStoredEnabled\(settings\.landing_qr_enabled\)/);
  assert.match(click, /normalizePath\(body\.path\) !== canonicalPath/);
  assert.match(click, /availableLinks\.find\(\(link\) => link\.id === linkId\)/);
  assert.match(click, /store: storeRecord\.id/);
  assert.match(click, /entity_id: storeRecord\.id/);
  assert.match(click, /link_label: canonicalLink\.label/);
  assert.match(click, /headers: publicSecurityProxyHeaders\(request, clientAddress\)/);
  assert.doesNotMatch(click, /pb\.collection\('store_analytics_events'\)\.create/);
});
