import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { normalizePromoAdminSection, PROMO_ADMIN_MODULES } from '../src/lib/promoAdminShell.ts';

function url(relativePath) {
  return new URL(relativePath, import.meta.url);
}

function read(relativePath) {
  return readFileSync(url(relativePath), 'utf8');
}

test('Landing QR Promo queda fuera del catálogo, sidebar y rutas administrativas', () => {
  const shell = read('../src/components/admin/promo/PromoAdminShell.astro');
  const moduleRoute = read('../src/pages/t/[storeSlug]/admin/promo/[section].astro');
  assert.equal(PROMO_ADMIN_MODULES.some((module) => module.section === 'landing-qr'), false);
  assert.equal(normalizePromoAdminSection('promo/landing-qr'), null);
  assert.doesNotMatch(shell, /PromoLandingQrEditor|section === 'landing-qr'|Landing QR/);
  assert.match(moduleRoute, /if \(!section \|\| section === 'overview'/);
  assert.equal(existsSync(url('../src/components/admin/promo/PromoLandingQrEditor.astro')), false);
  assert.equal(existsSync(url('../src/lib/promoLandingQr.ts')), false);
});

test('renderer, preview e instrumentación pública Promo no exponen Landing QR', () => {
  const theme = read('../src/components/promo-public/PromoBlackGoldTheme.astro');
  const preview = read('../src/components/admin/promo/PromoPreviewEditor.astro');
  const layout = read('../src/layouts/PromoPublicLayout.astro');
  assert.doesNotMatch(theme, /PromoLandingQrLink|landing_qr_link|Landing QR/);
  assert.doesNotMatch(preview, /landing_qr|Landing QR/);
  assert.doesNotMatch(layout, /landing_qr_open|promo-landing-qr/);
  assert.equal(existsSync(url('../src/components/promo-public/PromoLandingQrLink.astro')), false);
  assert.equal(existsSync(url('../src/styles/promo-landing-qr.css')), false);
  assert.equal(existsSync(url('../src/styles/promo-landing-qr-admin.css')), false);
});

test('contrato público legado solo acepta el estado deshabilitado y rechaza enlaces antiguos', () => {
  const publicShell = read('../src/lib/promoPublicShell.ts');
  assert.match(publicShell, /function normalizeLandingQrLink[\s\S]*?compiled\.enabled !== false \|\| compiled\.link !== null[\s\S]*?enabled: false, link: null/);
  assert.doesNotMatch(publicShell, /function landingQrHref|\/t\/\$\{[^}]+\}\/links/);
});

test('control Master oculta la capacidad y la fuerza inactiva en futuras actualizaciones', () => {
  const master = read('../src/components/master/MasterPromoStoreView.astro');
  assert.doesNotMatch(master, /landing_qr_bridge_enabled|Landing QR/);
});
