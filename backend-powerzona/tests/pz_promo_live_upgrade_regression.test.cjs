'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const contract = require('../pb_hooks/pz_promo_pubcfg_lib.js');

function legacyFeaturedDocument() {
  return {
    contract: 'promo.site.v1',
    system_catalog_version: 'promo.system.v1',
    locales: { default: 'es', published: ['es'] },
    theme: { theme_id: 'promo.black-gold', version: '1.0.0', tokens: {} },
    identity: { public_business_key: 'legacy-rugs' },
    section_order: ['featured-main'],
    sections: [{
      key: 'featured-main', type: 'featured_work', variant: 'default', visible: true,
      config: { item_keys: ['rug-main'] }, media_use_keys: ['featured-rug'],
    }],
    media_refs: {
      'featured-rug': { asset_id: 'd'.repeat(15), purpose: 'gallery' },
    },
    contact: { enabled: false, primary_action_key: '', secondary_action_keys: [], actions: [] },
    content_by_locale: {
      es: {
        identity: { name: 'Taller de alfombras', summary: '' },
        navigation: { 'featured-main': 'Destacados' },
        sections: {
          'featured-main': {
            heading: 'Trabajos destacados', summary: '',
            items: [{ key: 'rug-main', name: 'Alfombra restaurada', summary: '', caption: '' }],
          },
        },
        contact: {},
        media_alt: { 'featured-rug': { alt: 'Alfombra restaurada', decorative: false } },
        seo: { title: 'Taller de alfombras', description: 'Restauración profesional de alfombras' },
      },
    },
    adapters: { store_rating: { enabled: false }, landing_qr_link: { enabled: false } },
  };
}

test('upgrade v1 deriva la portada de una galería creada desde destacados', () => {
  const legacy = legacyFeaturedDocument();
  assert.deepEqual(contract.validatePromoDocument(legacy, { publicRevision: true }), legacy);

  const live = contract.upgradePromoDocument(legacy);
  const gallery = live.sections.find((section) => section.type === 'gallery');

  assert.equal(gallery.config.cover_media_use_key, 'featured-rug');
  assert.deepEqual(contract.validatePromoDocument(live, { publicRevision: true }), live);
});
