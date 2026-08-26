import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PROMO_ADMIN_MODULES,
  canOpenPromoAdminSection,
  getPromoAdminSectionPath,
  normalizePromoAdminSection,
  resolvePromoAdminStore,
  visiblePromoAdminModules,
} from '../src/lib/promoAdminShell.ts';

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function context(actions) {
  return {
    ok: true,
    user: { display_name: 'Ada', role: 'store_admin' },
    store: { name: 'Promo A', slug: 'promo-a', status: 'active' },
    site: { public_slug: 'promo-a', status: 'draft' },
    access: {
      is_master: false,
      is_primary_admin: true,
      blocked_by_plan: false,
      permissions: [],
      reserved_permissions: [],
      allowed_actions: actions,
    },
    capabilities: {
      promo_site_enabled: true,
      publish_enabled: false,
      custom_domain_enabled: false,
      theme_customization_enabled: false,
      multilanguage_enabled: false,
      video_enabled: false,
      analytics_enabled: false,
      landing_qr_bridge_enabled: false,
      max_services: 0,
      max_gallery_assets: 0,
      max_locales: 0,
      max_videos: 0,
      max_storage_bytes: 0,
    },
  };
}

test('catálogo del shell usa únicamente action keys Promo y rutas centrales por tienda', () => {
  assert.equal(new Set(PROMO_ADMIN_MODULES.map((module) => module.section)).size, PROMO_ADMIN_MODULES.length);
  for (const module of PROMO_ADMIN_MODULES) {
    assert.ok(module.actions.length >= 1);
    assert.ok(module.actions.every((action) => action.startsWith('promo.')));
  }
  assert.equal(getPromoAdminSectionPath(' Promo A ', 'overview'), '/t/promo-a/admin');
  assert.equal(getPromoAdminSectionPath(' Promo A ', 'landing-qr'), '/t/promo-a/admin/promo/landing-qr');
  assert.equal(normalizePromoAdminSection(''), 'overview');
  assert.equal(normalizePromoAdminSection('promo/content'), 'content');
  assert.equal(normalizePromoAdminSection('promo/gallery'), 'content');
  assert.equal(PROMO_ADMIN_MODULES.some((module) => module.section === 'gallery'), false);
  assert.equal(normalizePromoAdminSection('orders'), null);
  assert.equal(normalizePromoAdminSection('promo/unknown'), null);
});

test('módulos visibles y rutas directas nunca amplían allowed_actions del backend', () => {
  const access = context([
    'promo.site.view',
    'promo.content.manage',
    'promo.theme.select',
  ]);
  assert.deepEqual(
    visiblePromoAdminModules(access).map((module) => module.section),
    ['content', 'appearance'],
  );
  assert.equal(canOpenPromoAdminSection(access, 'overview'), true);
  assert.equal(canOpenPromoAdminSection(access, 'appearance'), true);
  assert.equal(canOpenPromoAdminSection(access, 'gallery'), false);
  assert.deepEqual(visiblePromoAdminModules(context(['promo.content.manage'])), []);
  assert.equal(canOpenPromoAdminSection(context(['promo.content.manage']), 'overview'), false);
});

test('solo store_not_promo 404 habilita el shell Commerce; capability y fallos quedan cerrados', async () => {
  const commerce = await resolvePromoAdminStore({
    baseUrl: 'https://pb.example',
    token: 'token',
    fetcher: async () => new Response(JSON.stringify({ ok: false, error: 'store_not_promo' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    }),
  });
  assert.deepEqual(commerce, { kind: 'commerce' });

  const capabilityAbsent = await resolvePromoAdminStore({
    baseUrl: 'https://pb.example',
    token: 'token',
    fetcher: async () => new Response(JSON.stringify({ ok: false, error: 'promo_capability_denied' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    }),
  });
  assert.equal(capabilityAbsent.kind, 'blocked');
  assert.equal(capabilityAbsent.code, 'promo_capability_denied');

  const ambiguous404 = await resolvePromoAdminStore({
    baseUrl: 'https://pb.example',
    token: 'token',
    fetcher: async () => new Response(JSON.stringify({ ok: false, error: 'promo_not_found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    }),
  });
  assert.equal(ambiguous404.kind, 'blocked');

  const unavailable = await resolvePromoAdminStore({
    baseUrl: 'https://pb.example',
    token: 'token',
    fetcher: async () => { throw new Error('offline'); },
  });
  assert.equal(unavailable.kind, 'blocked');
  assert.equal(unavailable.code, 'promo_permissions_unavailable');
});

test('respuesta válida conserva soporte Master en header y proyecta acciones saneadas', async () => {
  let request;
  const result = await resolvePromoAdminStore({
    baseUrl: 'https://pb.example/',
    token: 'token',
    supportStoreId: 'store1234567890',
    fetcher: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({
        ok: true,
        user: { display_name: 'Master', role: 'master_admin' },
        store: { name: 'Promo A', slug: 'promo-a', status: 'active' },
        site: { public_slug: 'promo-a', status: 'draft' },
        access: {
          is_master: true,
          is_primary_admin: false,
          blocked_by_plan: false,
          permissions: ['promo.site.view'],
          reserved_permissions: ['promo.support.access'],
          allowed_actions: ['promo.site.view', 'promo.content.manage', 'unknown'],
        },
        capabilities: { promo_site_enabled: true },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  assert.equal(result.kind, 'promo');
  assert.equal(request.url, 'https://pb.example/api/pz/promo/access/context');
  assert.equal(request.init.headers['X-PZ-Promo-Store'], 'store1234567890');
  assert.deepEqual(result.context.access.allowed_actions, ['promo.site.view', 'promo.content.manage']);
});

test('middleware clasifica antes de permisos Commerce y bloquea rutas cruzadas', () => {
  const middleware = read('../src/middleware.ts');
  const classify = middleware.indexOf('const promoResolution = await resolvePromoAdminStore');
  const commercePermissions = middleware.indexOf('storeAccess = await getStoreAccessContext', classify);
  assert.ok(classify >= 0 && commercePermissions > classify);
  assert.match(middleware, /promoResolution\.kind === 'blocked'[\s\S]*?renderPromoValidationBlock/);
  assert.match(middleware, /promoResolution\.kind === 'promo'[\s\S]*?context\.locals\.promoAccessContext/);
  assert.match(middleware, /projectedPromoStoreSlug !== currentStoreSlug/);
  assert.match(middleware, /if \(!promoSection\) return context\.redirect\(promoHomePath\)/);
  assert.match(middleware, /else if \(promoResolution\.kind === 'commerce'\)/);
  assert.match(middleware, /pz-promo-access/);
});

test('shell es separado, responsive y no monta navegación Commerce', () => {
  const shell = read('../src/components/admin/promo/PromoAdminShell.astro');
  const styles = read('../src/styles/promo-admin-shell.css');
  const baseRoute = read('../src/pages/t/[storeSlug]/admin.astro');
  const moduleRoute = read('../src/pages/t/[storeSlug]/admin/promo/[section].astro');

  assert.doesNotMatch(shell, /AdminSidebar|storeTeam|storeCapabilities|StorePlanIndicator/);
  assert.doesNotMatch(shell, /PromoGalleryEditor|section === 'gallery'/);
  assert.match(shell, /visiblePromoAdminModules\(accessContext\)/);
  assert.match(shell, /aria-label="Navegación de Tienda Promo"/);
  assert.match(shell, /aria-current=\{section === module\.section \? 'page' : undefined\}/);
  assert.match(shell, /aria-controls="pz-promo-admin-nav"/);
  assert.match(shell, /event\.key === 'Escape'/);
  assert.match(shell, /event\.key !== 'Tab'/);
  assert.match(shell, /<Layout isMaster=\{true\} htmlLang=\{adminLocale\}>/);
  assert.match(shell, /data-promo-admin-locale-select/);
  assert.match(shell, /PROMO_ADMIN_LOCALE_COOKIE/);
  assert.match(shell, /observePromoAdminTranslations/);
  assert.match(shell, /Contactar a Tu Senda 84/);
  assert.match(shell, /¿Necesitas ayuda con tu página\?/);
  assert.match(shell, /Escribir por WhatsApp/);
  assert.match(shell, /https:\/\/wa\.me\/\$\{supportWhatsapp\}/);
  assert.doesNotMatch(shell, /PUBLIC_MASTER_SUPPORT_EMAIL|Contactar soporte Master/);
  assert.match(styles, /pz-promo-admin__support-card/);
  assert.match(styles, /pz-promo-admin__support-whatsapp[\s\S]*?background:\s*#168c49/);
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(baseRoute, /showPromoDashboard[\s\S]*?<PromoAdminShell/);
  assert.match(moduleRoute, /canOpenPromoAdminSection\(accessContext, section\)/);
  assert.match(moduleRoute, /requestedModule === 'gallery'[\s\S]*?getPromoAdminSectionPath\(storeSlug, 'content'\)/);
});
