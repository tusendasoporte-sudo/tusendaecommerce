import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildPromoLandingQrDocument } from '../src/lib/promoLandingQr.ts';
import { normalizePromoCmsDocument } from '../src/lib/promoCms.ts';

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function documentFixture() {
  return {
    contract: 'promo.site.v1', system_catalog_version: 'promo.system.v1',
    locales: { default: 'es', published: ['es'] },
    theme: { theme_id: 'promo.black-gold', version: '1.0.0', tokens: {} },
    identity: { public_business_key: 'aladdins-carpet' },
    section_order: ['hero-main'],
    sections: [{
      key: 'hero-main', type: 'hero', variant: 'default', visible: true,
      config: { media_use_key: '', action_key: '' }, media_use_keys: [],
    }],
    media_refs: {},
    contact: { enabled: false, primary_action_key: '', secondary_action_keys: [], actions: [] },
    content_by_locale: {
      es: {
        identity: { name: "Aladdin's Carpet", summary: 'Restauración profesional' },
        navigation: { 'hero-main': 'Inicio' },
        sections: { 'hero-main': { heading: 'Alfombras con historia' } },
        contact: {}, media_alt: {},
        seo: { title: "Aladdin's Carpet", description: 'Restauración profesional' },
      },
    },
    adapters: { store_rating: { enabled: true }, landing_qr_link: { enabled: false } },
  };
}

test('el editor cambia únicamente el flag del puente en el borrador normalizado', () => {
  const original = documentFixture();
  const enabled = buildPromoLandingQrDocument(original, true);
  assert.equal(enabled.adapters.landing_qr_link.enabled, true);
  assert.equal(enabled.adapters.store_rating.enabled, true);
  const expected = normalizePromoCmsDocument(original);
  expected.adapters.landing_qr_link.enabled = true;
  assert.deepEqual(enabled, expected);
  assert.equal(original.adapters.landing_qr_link.enabled, false);
  assert.equal(buildPromoLandingQrDocument(enabled, false).adapters.landing_qr_link.enabled, false);
});

test('Admin reutiliza CMS/CAS y no modifica, genera ni modela Landing QR', () => {
  const component = read('../src/components/admin/promo/PromoLandingQrEditor.astro');
  const adminShell = read('../src/components/admin/promo/PromoAdminShell.astro');
  const helper = read('../src/lib/promoLandingQr.ts');
  assert.match(component, /\/api\/admin\/promo-cms\?store=/);
  assert.match(component, /expected_version/);
  assert.match(component, /getLandingQrPath/);
  assert.match(adminShell, /section === 'landing-qr'/);
  assert.match(helper, /document\.adapters\.landing_qr_link\.enabled = enabled/);
  assert.doesNotMatch(`${component}\n${helper}`, /landing_qr_links|landing_qr_title|qr\.png|qr\.svg|analytics|checkout|cart|price|order/i);
});

test('renderer usa enlace SSR localizado, sin apertura forzada ni script público', () => {
  const component = read('../src/components/promo-public/PromoLandingQrLink.astro');
  const theme = read('../src/components/promo-public/PromoBlackGoldTheme.astro');
  const styles = read('../src/styles/promo-landing-qr.css');
  assert.match(component, /aria-label=\{link\.aria_label\}/);
  assert.match(component, /href=\{link\.href\}/);
  assert.match(component, /promo-landing-qr-link__label/);
  assert.match(theme, /PromoLandingQrLink value=\{profile\.landing_qr_link\}/);
  assert.match(styles, /min-height:\s*44px/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(styles, /\.promo-shell-navigation\s*\{[\s\S]*grid-row:\s*3/);
  assert.match(styles, /@media \(max-width: 340px\)[\s\S]*\.promo-landing-qr-link__label/);
  assert.doesNotMatch(component, /target=|<script|set:html|client:/);
});

test('Preview conserva el acceso como referencia inerte y nunca compila un destino', () => {
  const preview = read('../src/components/admin/promo/PromoPreviewEditor.astro');
  assert.match(preview, /element\('span', 'pz-promo-site__landing-qr'/);
  assert.match(preview, /preview\.adapters\.landing_qr_link\.enabled === true/);
  assert.doesNotMatch(preview, /landingQr\.setAttribute\(['"]href|landingQr\.addEventListener/);
});
