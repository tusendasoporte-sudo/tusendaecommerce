const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const landingQr = require('../pb_hooks/pz_promo_landing_qr_lib.js');

test('compatibilidad pública Promo conserva únicamente un contrato deshabilitado', () => {
  assert.deepEqual(landingQr.emptyLandingQrLink(), {
    contract: 'promo.landing-qr-link.v1', enabled: false, link: null,
  });
  assert.deepEqual(Object.keys(landingQr).sort(), [
    'LANDING_QR_LINK_CONTRACT', 'attachPublicLandingQr', 'emptyLandingQrLink',
  ]);
});

test('configuraciones antiguas quedan inactivas sin leer datos ni producir enlaces', () => {
  const localized = {
    content: { identity: { name: 'Negocio Promo' } },
    adapters: { store_rating: { enabled: true }, landing_qr_link: { enabled: true } },
  };
  const trap = new Proxy({}, { get() { throw new Error('legacy_state_must_not_be_read'); } });
  const result = landingQr.attachPublicLandingQr(trap, localized, trap);
  assert.deepEqual(result.adapters, {
    store_rating: { enabled: true }, landing_qr_link: { enabled: false },
  });
  assert.deepEqual(result.landing_qr_link, {
    contract: 'promo.landing-qr-link.v1', enabled: false, link: null,
  });
  assert.equal(JSON.stringify(result).includes('/links'), false);
  assert.equal(localized.adapters.landing_qr_link.enabled, true, 'no muta la configuración histórica');
});

test('pipeline mantiene el adaptador legado cerrado y el frontend no conserva renderer Promo', () => {
  const shellApi = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_shell_api_lib.js'), 'utf8');
  const frontendRoot = path.join(__dirname, '..', '..', 'frontend-powerzona', 'src');
  assert.match(shellApi, /promoLandingQr\.attachPublicLandingQr/);
  assert.equal(fs.existsSync(path.join(frontendRoot, 'components', 'promo-public', 'PromoLandingQrLink.astro')), false);
  assert.equal(fs.existsSync(path.join(frontendRoot, 'components', 'admin', 'promo', 'PromoLandingQrEditor.astro')), false);
  assert.doesNotMatch(fs.readFileSync(path.join(frontendRoot, 'components', 'promo-public', 'PromoBlackGoldTheme.astro'), 'utf8'), /landing_qr|Landing QR/);
});
