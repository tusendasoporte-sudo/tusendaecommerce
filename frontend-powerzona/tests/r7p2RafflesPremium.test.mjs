import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  RAFFLES_PRIVATE_NO_STORE_HEADERS,
  rafflesUnavailableRedirectResponse,
  resolveRafflesCapability,
} from '../src/lib/raffleAccess.ts';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const future = '2099-12-31T23:59:59.000Z';
const store = (plan, overrides = {}) => ({
  id: 'storer7p2000001',
  slug: 'tienda-r7p2',
  status: 'active',
  plan,
  plan_started_at: '2026-07-01T00:00:00.000Z',
  plan_expires_at: future,
  plan_is_permanent: false,
  ...overrides,
});

test('R7P2: capacidad efectiva permite solo Premium vigente y falla cerrada', () => {
  assert.equal(resolveRafflesCapability(store('premium')).allowed, true);
  assert.equal(resolveRafflesCapability(store('free')).allowed, false);
  assert.equal(resolveRafflesCapability(store('basic')).allowed, false);
  assert.equal(resolveRafflesCapability(store('premium', {
    plan_expires_at: '2000-01-01T00:00:00.000Z',
  })).reason, 'plan_expired');
  assert.equal(resolveRafflesCapability(store('inválido')).reason, 'invalid_plan_data');
  assert.equal(resolveRafflesCapability(null).allowed, false);
});

test('R7P2: fallback público redirige 302 al home canónico con no-store/noindex', async () => {
  const response = rafflesUnavailableRedirectResponse(store('basic'));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/t/tienda-r7p2');
  assert.match(response.headers.get('cache-control') || '', /private/);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  assert.equal(await response.text(), '');
  assert.equal(RAFFLES_PRIVATE_NO_STORE_HEADERS.Pragma, 'no-cache');
});

test('R7P2: Principal sin capacidad ve gate y el editor pesado no se monta', () => {
  const page = read('../src/pages/admin/promos/raffles.astro');
  assert.match(page, /resolveRafflesAdminAccess\(/);
  assert.match(page, /const canRenderRafflesEditor = rafflesAdminAccess\.allowed/);
  assert.match(page, /const showRafflesGate = rafflesAdminAccess\.isPrimaryAdmin && !rafflesAdminAccess\.capability\.allowed/);
  assert.match(page, /if \(!canRenderRafflesEditor && !showRafflesGate\)[\s\S]*?status: 404/);
  assert.match(page, /\{canRenderRafflesEditor \? \([\s\S]*?data-raffles-editor/);
  assert.match(page, /\) : \([\s\S]*?data-raffles-premium-gate[\s\S]*?<StoreCapabilityGate/);
  assert.match(page, /planExpiredUsesPlanGate=\{true\}/);
  assert.match(page, /\{canRenderRafflesEditor && \([\s\S]*?<script define:vars=/);
  assert.match(page, /mobileActionLabel=\{canRenderRafflesEditor \? 'Actualizar' : undefined\}/);
  assert.equal((page.match(/data-raffles-editor/g) || []).length, 1);
  assert.equal((page.match(/data-raffles-premium-gate/g) || []).length, 1);
});

test('R7P2-C1: middleware deja llegar solo al Principal al gate de Rifas', () => {
  const middleware = read('../src/middleware.ts');
  const helper = middleware.match(
    /function primaryAdminCanReachRafflesGate[\s\S]*?\r?\n}\r?\n/,
  )?.[0] || '';

  assert.match(
    helper,
    /return normalized === 'promos\/raffles' && isPrimaryAdmin;/,
  );
  assert.doesNotMatch(helper, /plan|capability|permission|raffles_enabled|blocked_by_plan/i);
  assert.equal((middleware.match(/primaryAdminCanReachRafflesGate/g) || []).length, 2);
  assert.match(
    middleware,
    /const allowed = primaryAdminCanReachRafflesGate\([\s\S]*?requestedSection,[\s\S]*?is_primary_admin === true,[\s\S]*?\) \|\| \(accessRule\.primary === true/,
  );
  assert.match(
    middleware,
    /if \(normalized === 'promos\/raffles'\) return \{ any: \['raffles\.manage'\] \};/,
  );
  assert.equal(
    (middleware.match(/if \(normalized === 'promos\/raffles'\)/g) || []).length,
    1,
  );
});

test('R7P2-C1: matriz SSR conserva gate comercial, editor Premium y bloqueo de adicionales', () => {
  const page = read('../src/pages/admin/promos/raffles.astro');
  const access = read('../src/lib/raffleAccess.ts');

  for (const blockedStore of [
    store('basic'),
    store('free'),
    store('premium', { plan_expires_at: '2000-01-01T00:00:00.000Z' }),
  ]) {
    assert.equal(resolveRafflesCapability(blockedStore).allowed, false);
  }
  assert.equal(resolveRafflesCapability(store('premium')).allowed, true);

  assert.match(access, /allowed: capability\.allowed && hasPermission/);
  assert.match(
    page,
    /const showRafflesGate = rafflesAdminAccess\.isPrimaryAdmin && !rafflesAdminAccess\.capability\.allowed/,
  );
  assert.match(
    page,
    /if \(!canRenderRafflesEditor && !showRafflesGate\)[\s\S]*?status: 404/,
  );
  assert.match(
    page,
    /\{canRenderRafflesEditor \? \([\s\S]*?data-raffles-editor[\s\S]*?\) : \([\s\S]*?data-raffles-premium-gate/,
  );
  assert.match(page, /\{canRenderRafflesEditor && \([\s\S]*?<script define:vars=/);
});

test('R7P2-C1: rutas legacy y canónica comparten gate sin otra excepción de acceso', () => {
  const middleware = read('../src/middleware.ts');
  const canonical = read('../src/pages/t/[storeSlug]/admin/promos/raffles.astro');
  const gatePage = read('../src/pages/admin/promos/raffles.astro');

  assert.match(canonical, /import AdminRaffles from '\.\.\/\.\.\/\.\.\/\.\.\/admin\/promos\/raffles\.astro';/);
  assert.match(canonical, /<AdminRaffles \/>/);
  assert.match(
    middleware,
    /const requestedSection = isAdminRoute[\s\S]*?\? getLegacyAdminSection\(pathname\)[\s\S]*?: String\(professionalAdminMatch\?\.\[2\] \|\| ''\)/,
  );
  assert.match(middleware, /if \(isAdminRoute\)[\s\S]*?getLegacyAdminSection\(pathname\)/);
  assert.equal((gatePage.match(/data-raffles-premium-gate/g) || []).length, 1);
  assert.equal((gatePage.match(/data-raffles-editor/g) || []).length, 1);
  assert.match(gatePage, /\{canRenderRafflesEditor && \([\s\S]*?<script define:vars=/);
});

test('R7P2: API administrativa autoriza antes de asegurar slots o procesar body', () => {
  const api = read('../src/pages/api/admin/raffles.ts');
  const requireIndex = api.indexOf('await requireRafflesAdminAccess(adminContext');
  const ensureIndex = api.indexOf('ensureRaffleSlotsForStore(adminContext.storeId');
  const formIndex = api.indexOf('await request.formData()');
  assert.ok(requireIndex > -1);
  assert.ok(ensureIndex > requireIndex);
  assert.ok(formIndex > requireIndex);
  assert.match(api, /export const GET[\s\S]*?getAdminContext\(request\)[\s\S]*?ensureRaffleSlotsForStore/);
  assert.match(api, /export const POST[\s\S]*?getAdminContext\(request\)[\s\S]*?request\.formData/);
  assert.match(api, /export const PATCH[\s\S]*?getAdminContext\(request\)[\s\S]*?request\.json/);
  assert.match(api, /export const DELETE[\s\S]*?getAdminContext\(request\)/);
  assert.doesNotMatch(api, /return \{ message: rawMessage/);
});

test('R7P2: rutas públicas bloquean por capacidad antes de ajustes o rifas', () => {
  for (const relative of [
    '../src/pages/t/[storeSlug]/rifa.astro',
    '../src/pages/t/[storeSlug]/rifa/[raffleSlug].astro',
  ]) {
    const source = read(relative);
    const capabilityIndex = source.indexOf('resolveRafflesCapability(currentStore)');
    const settingsIndex = source.indexOf('await getSettings');
    const raffleIndex = source.indexOf('await getPublicRafflePageData');
    assert.ok(capabilityIndex > -1, relative);
    assert.ok(settingsIndex > capabilityIndex, relative);
    assert.ok(raffleIndex > capabilityIndex, relative);
    assert.match(source, /if \(!resolveRafflesCapability\(currentStore\)\.allowed\)[\s\S]*?rafflesUnavailableRedirectResponse\(currentStore\)/);
  }
});

test('R7P2: home no consulta ni renderiza Rifas sin capacidad', () => {
  const home = read('../src/components/public-store/PublicStoreHome.astro');
  const capabilityIndex = home.indexOf('resolveRafflesCapability(currentStore)');
  const queryIndex = home.indexOf('await getVisibleRafflesForStore(currentStore.slug)');
  assert.ok(capabilityIndex > -1);
  assert.ok(queryIndex > capabilityIndex);
  assert.match(home, /isTemporarilyClosed \|\| !rafflesCapability\.allowed[\s\S]*?\? \[\][\s\S]*?: await getVisibleRafflesForStore/);
  assert.match(home, /<PublicRafflesSection[\s\S]*?raffles=\{visibleRaffles\}/);
});

test('R7P2: lectura pública usa snapshot canónico y no REST directo', () => {
  const lib = read('../src/lib/raffles.ts');
  const start = lib.indexOf('type PublicRafflesPayload');
  const end = lib.indexOf('function hasLegacyRaffleContent');
  const publicSection = lib.slice(start, end);
  assert.match(publicSection, /\/api\/pz\/raffles\/public/);
  assert.match(publicSection, /action: 'home' \| 'first' \| 'detail'/);
  assert.match(publicSection, /cache: 'no-store'/);
  assert.doesNotMatch(publicSection, /collection\('raffles'\)/);
  assert.doesNotMatch(publicSection, /collection\('raffle_entries'\)/);
  assert.match(publicSection, /occupied_numbers/);
});

test('R7P2: enter/status son proxies canónicos privados y no tocan colecciones', () => {
  for (const [relative, endpoint] of [
    ['../src/pages/api/raffles/enter.ts', '/api/pz/raffles/enter'],
    ['../src/pages/api/raffles/status.ts', '/api/pz/raffles/status'],
  ]) {
    const source = read(relative);
    assert.match(source, new RegExp(endpoint.replaceAll('/', '\\/')));
    assert.match(source, /RAFFLES_PRIVATE_NO_STORE_HEADERS/);
    assert.match(source, /cache: 'no-store'/);
    assert.match(source, /canonicalizeReceiptLinks/);
    assert.doesNotMatch(source, /collection\('raffles'\)/);
    assert.doesNotMatch(source, /collection\('raffle_entries'\)/);
    assert.doesNotMatch(source, /collection\('store_notifications'\)/);
  }
});

test('R7P2: sidebar distingue gate comercial y bloquea avisos durante downgrade', () => {
  const sidebar = read('../src/components/admin/AdminSidebar.astro');
  const promos = read('../src/pages/admin/promos.astro');
  assert.match(sidebar, /'raffles_enabled',[\s\S]*?enforceExpiration: true/);
  assert.match(sidebar, /canShowModule\('raffles\.manage'\)/);
  assert.match(sidebar, /canManageRaffles[\s\S]*?\|\| \(isPrimaryAdmin && !rafflesAccess\.allowed\)/);
  assert.match(sidebar, /const canGenerateRaffleNotifications = isPrimaryAdmin[\s\S]*?rafflesAccess\.allowed[\s\S]*?canManageRaffles/);
  assert.match(sidebar, /if \(!canGenerateRaffleNotifications\) return/);
  assert.match(promos, /const canShowRaffles = canManageRaffles[\s\S]*?is_primary_admin[\s\S]*?!rafflesCapabilityAccess\.allowed/);
  assert.match(promos, /\{canManageRaffles && <a class="tab-btn" href=\{adminRafflesPath\}>Rifas<\/a>\}/);
  assert.match(promos, /\{!canManageRaffles && canShowRaffles && <a class="tab-btn" href=\{adminRafflesPath\}>Rifas<\/a>\}/);
});

test('R7P2: página pública no serializa código privado ni datos de participantes', () => {
  const page = read('../src/components/public-store/RafflePublicPage.astro');
  const publicSection = read('../src/components/public-store/PublicRafflesSection.astro');
  const defineVars = page.match(/<script define:vars=\{\{([\s\S]*?)\}\}>/)?.[1] || '';
  assert.doesNotMatch(defineVars, /access_code|receipt_code|phone|occupiedNumbers|raffle\b/);
  assert.doesNotMatch(publicSection, /access_code|receipt_code|phone/);
  assert.match(page, /data-store-slug=\{storeSlug\}/);
  assert.match(page, /data-raffle-slug=\{raffleSlug\}/);
});

test('R7P2-C2: tarjetas conservan dos acciones y kebab sin historial directo', () => {
  const page = read('../src/pages/admin/promos/raffles.astro');
  const renderListStart = page.indexOf('function renderList()');
  const renderListEnd = page.indexOf('function renderEntries()', renderListStart);
  const renderList = page.slice(renderListStart, renderListEnd);
  const actionBlock = renderList.match(
    /<div class="raffle-row-actions">([\s\S]*?)\$\{actionMenuHtml\(raffle, status, fullHref\)\}[\s\S]*?<\/div>/,
  )?.[1] || '';
  const actionMenuStart = page.indexOf('function actionMenuHtml(');
  const actionMenuEnd = page.indexOf('function updateControlButtons(', actionMenuStart);
  const actionMenu = page.slice(actionMenuStart, actionMenuEnd);

  assert.ok(renderListStart > -1);
  assert.ok(renderListEnd > renderListStart);
  assert.ok(actionBlock);
  assert.equal((renderList.match(/<div class="raffle-row-actions">/g) || []).length, 1);
  assert.equal((actionBlock.match(/class="raffle-btn pz-admin-action-btn[^"]*"/g) || []).length, 2);
  assert.match(actionBlock, /<span>Ver rifa pública<\/span>/);
  assert.match(actionBlock, /class="raffle-btn pz-admin-action-btn js-raffle-edit"/);
  assert.match(actionBlock, /<span>\$\{escapeHtml\(editText\)\}<\/span>/);
  assert.doesNotMatch(actionBlock, /Ver historial|activityHistoryPath/);
  assert.doesNotMatch(actionBlock, /isSelected/);
  assert.match(renderList, /\$\{actionMenuHtml\(raffle, status, fullHref\)\}/);
  assert.match(
    page,
    /\.raffle-row-actions\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1\.25fr\)\s+minmax\(0,\s*1fr\)\s+54px;/,
  );

  assert.match(page, /id="raffle-history-link"[\s\S]*?>Ver historial<\/a>/);
  assert.match(page, /function activityHistoryPath\(resourceType, resourceId\)/);
  assert.doesNotMatch(actionMenu, /Ver historial|activityHistoryPath/);
  assert.match(actionMenu, /data-menu-button/);
  assert.match(actionMenu, /data-control-action=/);
  assert.match(actionMenu, /Copiar enlace/);

  assert.match(page, /data-raffles-premium-gate/);
  assert.match(page, /const showRafflesGate = rafflesAdminAccess\.isPrimaryAdmin && !rafflesAdminAccess\.capability\.allowed/);
});

test('R7P2: layout conserva responsive y evita scroll horizontal', () => {
  const page = read('../src/pages/admin/promos/raffles.astro');
  assert.match(page, /overflow-x:\s*hidden/);
  assert.match(page, /@media \(max-width: 1023px\)/);
  assert.match(page, /@media \(max-width: 900px\)/);
  assert.match(page, /@media \(max-width: 720px\)/);
  assert.match(page, /@media \(max-width: 560px\)/);
  assert.match(page, /<AdminSidebar/);
  assert.doesNotMatch(page, /TODO|FIXME|Codex|console\.(?:log|info|warn)/);
});
