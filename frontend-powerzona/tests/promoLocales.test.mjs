import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  addPromoLocale,
  buildPromoLocalesDocument,
  createPromoLocalesWorkspace,
  diagnosePromoLocale,
  diagnosePromoLocalesPublication,
  PROMO_LOCALES_CATALOG,
  PromoLocalesError,
  removePromoLocale,
  setPromoDefaultLocale,
  setPromoLocalePublished,
} from '../src/lib/promoLocales.ts';

const require = createRequire(import.meta.url);
const backendI18n = require('../../backend-powerzona/pb_hooks/pz_promo_i18n_lib.js');
const backendDocument = require('../../backend-powerzona/pb_hooks/pz_promo_pubcfg_lib.js');

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function emptyDraft() {
  return {
    contract: 'promo.site.v1',
    system_catalog_version: 'promo.system.v1',
    locales: { default: '', published: [] },
    theme: { theme_id: '', version: '', tokens: {} },
    identity: { public_business_key: '' },
    section_order: [],
    sections: [],
    media_refs: {},
    contact: { enabled: false, primary_action_key: '', secondary_action_keys: [], actions: [] },
    content_by_locale: {},
    adapters: { store_rating: { enabled: false }, landing_qr_link: { enabled: false } },
  };
}

function localized(name, navigation = 'Inicio', heading = 'Portada', footer = 'Todos los derechos reservados.') {
  return {
    identity: { name, summary: 'Resumen del negocio' },
    navigation: { 'hero-main': navigation, 'footer-main': 'Pie' },
    sections: {
      'hero-main': { heading, summary: 'Presentación' },
      'footer-main': {
        heading: 'Información del negocio',
        summary: 'Cierre editorial del sitio Promo.',
        text: footer,
      },
    },
    contact: {},
    media_alt: {},
    seo: { title: name, description: 'Descripción localizada del negocio.' },
  };
}

function completeDocument() {
  const document = emptyDraft();
  document.locales = { default: 'es', published: ['es'] };
  document.theme = { theme_id: 'promo.black-gold', version: '1.0.0', tokens: {} };
  document.identity = { public_business_key: 'negocio-demo' };
  document.section_order = ['hero-main', 'footer-main'];
  document.sections = [
    {
      key: 'hero-main', type: 'hero', variant: 'default', visible: true,
      config: { media_use_key: '', action_key: '' }, media_use_keys: [],
    },
    {
      key: 'footer-main', type: 'footer', variant: 'default', visible: true,
      config: {}, media_use_keys: [],
    },
  ];
  document.content_by_locale = { es: localized('Negocio demo') };
  return document;
}

test('catálogo administrativo replica locales exactos del catálogo general backend', () => {
  assert.deepEqual(PROMO_LOCALES_CATALOG.map((entry) => ({
    locale: entry.locale,
    label: entry.label,
    direction: entry.direction,
  })), Object.entries(backendI18n.SYSTEM_CATALOGS['promo.system.v1']).map(([locale, entry]) => ({
    locale,
    label: entry.native_name,
    direction: entry.direction,
  })));
  assert.deepEqual(PROMO_LOCALES_CATALOG.map((entry) => entry.locale), ['en', 'es']);
});

test('workspace vacío crea solo español base y añadir idioma no copia fallback ni lo anuncia', () => {
  const workspace = createPromoLocalesWorkspace(emptyDraft());
  assert.deepEqual(workspace.document.locales, { default: 'es', published: ['es'] });
  assert.deepEqual(Object.keys(workspace.document.content_by_locale), ['es']);

  const withEnglish = addPromoLocale(completeDocument(), 'en', 2);
  assert.deepEqual(withEnglish.locales, { default: 'es', published: ['es'] });
  assert.deepEqual(withEnglish.content_by_locale.en, {
    identity: {}, navigation: {}, sections: {}, contact: {}, media_alt: {}, seo: {},
  });
  assert.notDeepEqual(withEnglish.content_by_locale.en, withEnglish.content_by_locale.es);
  assert.deepEqual(backendDocument.validatePromoDocument(buildPromoLocalesDocument(withEnglish, {
    defaultLocale: 'es',
    publishedLocales: ['es'],
    contentByLocale: withEnglish.content_by_locale,
  }, 2), { publicRevision: false }).content_by_locale.en, withEnglish.content_by_locale.en);
  assert.throws(
    () => addPromoLocale(withEnglish, 'fr', 3),
    (error) => error instanceof PromoLocalesError && error.code === 'unsupported_promo_locale',
  );
});

test('workspace de idiomas acepta todos los campos del pie creados por el CMS', () => {
  const workspace = createPromoLocalesWorkspace(completeDocument());
  assert.deepEqual(workspace.document.content_by_locale.es.sections['footer-main'], {
    heading: 'Información del negocio',
    summary: 'Cierre editorial del sitio Promo.',
    text: 'Todos los derechos reservados.',
  });
});

test('traducciones modifican solo locales y preservan tema, composición, contacto, media y adapters', () => {
  const original = completeDocument();
  const withEnglish = addPromoLocale(original, 'en', 2);
  const protectedBefore = structuredClone({
    theme: withEnglish.theme,
    identity: withEnglish.identity,
    section_order: withEnglish.section_order,
    sections: withEnglish.sections,
    media_refs: withEnglish.media_refs,
    contact: withEnglish.contact,
    adapters: withEnglish.adapters,
    es: withEnglish.content_by_locale.es,
  });
  const updated = buildPromoLocalesDocument(withEnglish, {
    defaultLocale: 'es',
    publishedLocales: ['es'],
    contentByLocale: {
      es: withEnglish.content_by_locale.es,
      en: localized('Demo business', 'Home', 'Welcome', 'All rights reserved.'),
    },
  }, 2);
  assert.deepEqual(backendDocument.validatePromoDocument(updated, { publicRevision: false }), updated);
  assert.deepEqual({
    theme: updated.theme,
    identity: updated.identity,
    section_order: updated.section_order,
    sections: updated.sections,
    media_refs: updated.media_refs,
    contact: updated.contact,
    adapters: updated.adapters,
    es: updated.content_by_locale.es,
  }, protectedBefore);
  assert.deepEqual(backendDocument.changedActionKeys(withEnglish, updated), [
    'promo.content.manage', 'promo.translations.manage',
  ]);
});

test('completitud excluye el fallback editorial y bloquea incluir un locale inválido', () => {
  const original = addPromoLocale(completeDocument(), 'en', 2);
  const incomplete = diagnosePromoLocale(original, 'en');
  assert.equal(incomplete.complete, false);
  assert.ok(incomplete.missing.includes('Identidad: nombre público'));
  assert.throws(
    () => setPromoLocalePublished(original, 'en', true),
    (error) => error instanceof PromoLocalesError && error.code === 'incomplete_promo_locale',
  );
  assert.equal(diagnosePromoLocalesPublication(original).ready, true, 'el locale draft no anunciado no bloquea español');

  const translated = buildPromoLocalesDocument(original, {
    defaultLocale: 'es',
    publishedLocales: ['es'],
    contentByLocale: {
      es: original.content_by_locale.es,
      en: localized('Demo business', 'Home', 'Welcome', 'All rights reserved.'),
    },
  }, 2);
  assert.equal(diagnosePromoLocale(translated, 'en').complete, true);
  const published = setPromoLocalePublished(translated, 'en', true);
  assert.deepEqual(published.locales.published, ['en', 'es']);
  assert.equal(diagnosePromoLocalesPublication(published).ready, true);
  assert.deepEqual(backendDocument.validatePromoDocument(published, { publicRevision: true }), published);
});

test('default, cuotas, retiro y contenido activo fallan cerrados', () => {
  const original = completeDocument();
  assert.throws(() => addPromoLocale(original, 'en', 1), (error) => (
    error instanceof PromoLocalesError && error.code === 'promo_capability_denied'
  ));
  assert.throws(() => removePromoLocale(original, 'es'), (error) => (
    error instanceof PromoLocalesError && error.code === 'promo_default_locale_required'
  ));
  const withEnglish = addPromoLocale(original, 'en', 2);
  assert.throws(() => setPromoDefaultLocale(withEnglish, 'en'), (error) => (
    error instanceof PromoLocalesError && error.code === 'incomplete_promo_locale'
  ));
  const unsafe = structuredClone(withEnglish.content_by_locale);
  unsafe.en.identity.name = '<script>alert(1)</script>';
  assert.throws(() => buildPromoLocalesDocument(withEnglish, {
    defaultLocale: 'es', publishedLocales: ['es'], contentByLocale: unsafe,
  }, 2), (error) => error instanceof PromoLocalesError && error.code === 'unsafe_promo_document_value');
});

test('shell monta el editor con permisos separados, CAS existente, accesibilidad y responsive', () => {
  const shell = read('../src/components/admin/promo/PromoAdminShell.astro');
  const editor = read('../src/components/admin/promo/PromoLocalesEditor.astro');
  const styles = read('../src/styles/promo-locales.css');
  const api = read('../src/pages/api/admin/promo-cms.ts');

  assert.match(shell, /section === 'languages'/);
  assert.match(shell, /<PromoLocalesEditor/);
  assert.match(shell, /promo\.content\.manage/);
  assert.match(shell, /promo\.translations\.manage/);
  assert.match(shell, /max_locales/);
  assert.match(editor, /Al guardar, los cambios válidos se reflejan automáticamente en la página/);
  assert.match(editor, /referencia[^\n]*no se guarda/i);
  assert.match(editor, /role="alert"/);
  assert.match(editor, /aria-live="polite"/);
  assert.match(editor, /reportValidity\(\)/);
  assert.match(editor, /beforeunload/);
  assert.match(editor, /expected_version: version/);
  assert.match(editor, /PROMO_LOCALES_API_PATH/);
  assert.match(editor, /section\.type !== 'gallery'/);
  assert.match(editor, /Productos de \$\{serviceName\}/);
  assert.doesNotMatch(editor, /gallery: 'Galería'/);
  assert.equal((editor.match(/element\('details', 'pz-promo-locales__panel'\)/g) || []).length, 5);
  assert.match(editor, /element\('summary', 'pz-promo-locales__panel-heading'\)/);
  assert.doesNotMatch(editor, /element\('section', 'pz-promo-locales__panel'\)/);
  assert.doesNotMatch(editor, /\/api\/pz\/promo\/(?:preview|publish)|candidate\/create|Cloudflare|Coolify/);
  assert.match(api, /refreshAuthFromCookie/);
  assert.match(api, /requireCurrentStoreForAdmin/);
  assert.match(api, /promoCmsSameOriginMutation/);
  assert.match(api, /promo\.live\.update\.v1/);
  assert.match(styles, /@media \(max-width: 1120px\)/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /@media \(max-width: 420px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /pz-promo-locales__panel\[open\][\s\S]*?pz-promo-locales__panel-chevron/);
  assert.match(styles, /pz-promo-locales__panel-heading:focus-visible|summary:focus-visible/);
  assert.doesNotMatch(editor, /products|categories|orders|cart|checkout|inventory|stock|price|currency/);
});
