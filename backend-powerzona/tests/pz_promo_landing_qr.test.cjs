const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const landingQr = require('../pb_hooks/pz_promo_landing_qr_lib.js');

function record(values) {
  return {
    ...values,
    get(key) { return this[key]; },
    getString(key) { return this[key] === undefined || this[key] === null ? '' : String(this[key]); },
  };
}

function fixture(overrides = {}) {
  const store = record({
    id: 'storeaaaaaaaaaa', slug: 'aladdins-carpet', status: 'active',
    plan: 'premium', plan_is_permanent: true, plan_expires_at: '',
    ...(overrides.store || {}),
  });
  const site = record({ id: 'siteaaaaaaaaaaa', store: store.id, status: 'active' });
  const entitlement = record({
    id: 'entitlementaaaa', site: site.id, source: 'contract',
    promo_site_enabled: true, landing_qr_bridge_enabled: true,
    valid_from: '', valid_until: '',
    ...(overrides.entitlement || {}),
  });
  const settings = record({
    id: 'settingsaaaaaaa', store: store.id, active: true, landing_qr_enabled: true,
    ...(overrides.settings || {}),
  });
  const collections = { stores: [store], promo_site_entitlements: [entitlement], settings: [settings] };
  const app = {
    findRecordById(collection, id) {
      const found = (collections[collection] || []).find((item) => item.id === id);
      if (!found) throw new Error('not_found');
      return found;
    },
    findRecordsByFilter(collection, filter, sort, limit, offset, params) {
      const rows = (collections[collection] || []).filter((item) => {
        if (collection === 'promo_site_entitlements') return item.site === params.site;
        if (collection === 'settings') return item.store === params.store && item.active === true;
        return true;
      });
      return rows.slice(offset || 0, (offset || 0) + limit);
    },
  };
  const document = { adapters: { landing_qr_link: { enabled: overrides.adapter !== false } } };
  const localized = {
    system: { messages: {
      'landing_qr.open': 'Más enlaces',
      'a11y.landing_qr_link': 'Abrir la página de enlaces de {business}',
    } },
    content: { identity: { name: "Aladdin's Carpet" } },
    adapters: { landing_qr_link: { enabled: overrides.adapter !== false } },
  };
  return { app, context: { document, entitlement, site, store }, localized };
}

test('compila exclusivamente la ruta central existente sin query, variante o destino tenant-controlled', () => {
  assert.equal(landingQr.PLATFORM_ORIGIN, 'https://tusenda84.com');
  assert.equal(landingQr.landingQrPath('aladdins-carpet'), '/t/aladdins-carpet/links');
  assert.equal(landingQr.landingQrHref('aladdins-carpet'), 'https://tusenda84.com/t/aladdins-carpet/links');
  for (const invalid of ['Aladdins', 'other/path', 'other?store=x', '', '-other']) {
    assert.throws(() => landingQr.landingQrHref(invalid), /promo_landing_qr_unavailable/);
  }
});

test('adjunta enlace localizado solo con revisión, entitlement, capacidad y activación L7Q1 vigentes', () => {
  const data = fixture();
  const result = landingQr.attachPublicLandingQr(data.app, data.localized, data.context);
  assert.deepEqual(result.landing_qr_link, {
    contract: 'promo.landing-qr-link.v1',
    enabled: true,
    link: {
      label: 'Más enlaces',
      aria_label: "Abrir la página de enlaces de Aladdin's Carpet",
      href: 'https://tusenda84.com/t/aladdins-carpet/links',
    },
  });
  assert.deepEqual(Object.keys(result.landing_qr_link.link).sort(), ['aria_label', 'href', 'label']);
  assert.doesNotMatch(JSON.stringify(result.landing_qr_link), /settings|entitlement|storeaaaaaaaaaa|landing_qr_enabled/);
});

test('un fallo opcional omite el acceso y nunca cae en otro tenant o ruta', () => {
  const cases = [
    fixture({ adapter: false }),
    fixture({ entitlement: { landing_qr_bridge_enabled: false } }),
    fixture({ store: { plan: 'basic' } }),
    fixture({ store: { status: 'suspended' } }),
    fixture({ settings: { landing_qr_enabled: false } }),
    fixture({ settings: { store: 'storebbbbbbbbbb' } }),
  ];
  for (const data of cases) {
    assert.deepEqual(landingQr.attachPublicLandingQr(data.app, data.localized, data.context).landing_qr_link, {
      contract: 'promo.landing-qr-link.v1', enabled: false, link: null,
    });
  }
});

test('el pipeline y renderer conservan el adaptador separado de CTA, QR y analytics', () => {
  const shellApi = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_shell_api_lib.js'), 'utf8');
  const component = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend-powerzona', 'src', 'components', 'promo-public', 'PromoLandingQrLink.astro'), 'utf8');
  assert.match(shellApi, /promoLandingQr\.attachPublicLandingQr/);
  assert.match(component, /data-promo-landing-qr-link/);
  assert.doesNotMatch(component, /target=|script|canvas|analytics|contact_action|checkout|cart|price|order/i);
});
