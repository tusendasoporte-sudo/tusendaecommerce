import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildPromoAppearanceDocument,
  findPromoAppearanceTheme,
  normalizePromoAppearanceCatalog,
  promoAppearanceChangeRequirements,
  promoAppearanceEffectiveTokens,
  promoAppearancePreview,
  PromoAppearanceError,
} from '../src/lib/promoAppearance.ts';
import { normalizePromoCmsDocument } from '../src/lib/promoCms.ts';

const require = createRequire(import.meta.url);
const backendTheme = require('../../backend-powerzona/pb_hooks/pz_promo_theme_lib.js');
const backendDocument = require('../../backend-powerzona/pb_hooks/pz_promo_pubcfg_lib.js');

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const entry = backendTheme.registryEntry('promo.black-gold', '1.0.0');
const manifest = backendTheme.publicManifest(entry);
const defaults = backendTheme.safeFallbackSelection().tokens;

function catalogResponse(overrides = {}) {
  return {
    ok: true,
    contract: 'promo.theme.catalog.v1',
    current: {
      source: 'selected',
      status: 'approved',
      theme_id: 'promo.black-gold',
      version: '1.0.0',
      tokens: defaults,
      override_keys: [],
    },
    fallback: {
      source: 'safe_fallback',
      theme_id: 'promo.black-gold',
      version: '1.0.0',
      tokens: defaults,
      selectable: true,
    },
    themes: [manifest],
    ...overrides,
  };
}

function documentFixture(theme = {
  theme_id: 'promo.black-gold',
  version: '1.0.0',
  tokens: {},
}) {
  return {
    contract: 'promo.site.v1',
    system_catalog_version: 'promo.system.v1',
    locales: { default: 'es', published: ['es'] },
    theme,
    identity: { public_business_key: 'negocio-demo' },
    section_order: ['hero-main'],
    sections: [{
      key: 'hero-main', type: 'hero', variant: 'default', visible: true,
      config: { media_use_key: '', action_key: '' }, media_use_keys: [],
    }],
    media_refs: {},
    contact: { enabled: false, primary_action_key: '', secondary_action_keys: [], actions: [] },
    content_by_locale: {
      es: {
        identity: { name: 'Negocio demo', summary: 'Resumen' },
        navigation: { 'hero-main': 'Inicio' },
        sections: { 'hero-main': { heading: 'Portada', summary: 'Presentación' } },
        contact: {}, media_alt: {}, seo: { title: 'Demo', description: 'Descripción' },
      },
    },
    adapters: { store_rating: { enabled: false }, landing_qr_link: { enabled: false } },
  };
}

test('catálogo privado acepta solo manifests aprobados con schema enum exacto', () => {
  const catalog = normalizePromoAppearanceCatalog(catalogResponse());
  assert.equal(catalog.themes.length, 1);
  assert.equal(catalog.themes[0].themeId, 'promo.black-gold');
  assert.deepEqual(catalog.themes[0].tokens.accent.values, ['heritage_gold', 'champagne_gold']);
  assert.equal(catalog.fallback.selectable, true);
  assert.equal(findPromoAppearanceTheme(catalog, 'promo.black-gold', '1.0.0')?.rendererKey, 'promo.black-gold');

  assert.throws(
    () => normalizePromoAppearanceCatalog(catalogResponse({ store_id: 'storeaaaaaaaaaa' })),
    PromoAppearanceError,
  );
  const hostile = structuredClone(catalogResponse());
  hostile.themes[0].tokens.accent.values.push('#ff00ff');
  assert.throws(() => normalizePromoAppearanceCatalog(hostile), PromoAppearanceError);
  const hiddenRelease = structuredClone(catalogResponse());
  hiddenRelease.themes[0].status = 'draft';
  assert.throws(() => normalizePromoAppearanceCatalog(hiddenRelease), PromoAppearanceError);
});

test('edición guarda solo overrides permitidos y preserva todas las demás facetas', () => {
  const catalog = normalizePromoAppearanceCatalog(catalogResponse());
  const original = documentFixture();
  const normalizedOriginal = normalizePromoCmsDocument(original);
  const protectedBefore = structuredClone({
    locales: normalizedOriginal.locales,
    identity: normalizedOriginal.identity,
    sections: normalizedOriginal.sections,
    media_refs: normalizedOriginal.media_refs,
    contact: normalizedOriginal.contact,
    content_by_locale: normalizedOriginal.content_by_locale,
    adapters: normalizedOriginal.adapters,
  });
  const updated = buildPromoAppearanceDocument(original, catalog, {
    themeId: 'promo.black-gold',
    version: '1.0.0',
    tokenValues: {
      ...defaults,
      accent: 'champagne_gold',
      border: 'champagne_gold',
      radius: 'soft',
      shadow: 'lifted',
    },
  });
  assert.deepEqual(updated.theme, {
    theme_id: 'promo.black-gold',
    version: '1.0.0',
    tokens: {
      accent: 'champagne_gold',
      border: 'champagne_gold',
      radius: 'soft',
      shadow: 'lifted',
    },
  });
  assert.deepEqual(backendDocument.validatePromoDocument(updated, { publicRevision: false }), updated);
  assert.deepEqual({
    locales: updated.locales,
    identity: updated.identity,
    sections: updated.sections,
    media_refs: updated.media_refs,
    contact: updated.contact,
    content_by_locale: updated.content_by_locale,
    adapters: updated.adapters,
  }, protectedBefore);
  assert.deepEqual(
    backendDocument.changedActionKeys(normalizedOriginal, updated, []),
    ['promo.content.manage', 'promo.appearance.manage'],
  );
});

test('selección inicial usa defaults sin convertirlos en overrides ni pedir apariencia', () => {
  const catalog = normalizePromoAppearanceCatalog(catalogResponse({
    current: {
      source: 'safe_fallback', status: 'not_selected', theme_id: 'promo.black-gold',
      version: '1.0.0', tokens: defaults,
    },
  }));
  const original = documentFixture({ theme_id: '', version: '', tokens: {} });
  const updated = buildPromoAppearanceDocument(original, catalog, {
    themeId: 'promo.black-gold', version: '1.0.0', tokenValues: defaults,
  });
  assert.deepEqual(updated.theme, { theme_id: 'promo.black-gold', version: '1.0.0', tokens: {} });
  assert.deepEqual(promoAppearanceChangeRequirements(original, updated), {
    changed: true, content: true, themeSelect: true, appearanceManage: false,
  });
  assert.deepEqual(
    backendDocument.changedActionKeys(normalizePromoCmsDocument(original), updated, []),
    ['promo.content.manage', 'promo.theme.select'],
  );
});

test('tokens unknown, valores libres, combinaciones incompatibles y temas ausentes fallan cerrados', () => {
  const catalog = normalizePromoAppearanceCatalog(catalogResponse());
  const theme = catalog.themes[0];
  assert.throws(
    () => promoAppearanceEffectiveTokens(theme, { accent: '#ff00ff' }),
    (error) => error instanceof PromoAppearanceError && error.code === 'invalid_promo_theme_tokens',
  );
  assert.throws(
    () => promoAppearanceEffectiveTokens(theme, { accent: 'champagne_gold', border: 'heritage_gold' }),
    (error) => error instanceof PromoAppearanceError && error.code === 'incompatible_promo_theme_tokens',
  );
  assert.throws(() => buildPromoAppearanceDocument(documentFixture(), catalog, {
    themeId: 'promo.no-aprobado', version: '9.9.9', tokenValues: defaults,
  }), (error) => error instanceof PromoAppearanceError && error.code === 'promo_theme_not_selectable');
});

test('preview mapea enums a valores first-party y respeta densidad y movimiento reducido', () => {
  const catalog = normalizePromoAppearanceCatalog(catalogResponse());
  const theme = catalog.themes[0];
  const preview = promoAppearancePreview(theme, {
    ...defaults,
    accent: 'champagne_gold', border: 'champagne_gold', density: 'compact', motion: 'reduced',
  });
  assert.equal(preview.rendererAvailable, true);
  assert.equal(preview.style.accent, '#d9bf84');
  assert.equal(preview.style.border, '#d9bf84');
  assert.equal(preview.style.spacing, '0.85rem');
  assert.equal(preview.style.motionDuration, '0ms');
  assert.doesNotMatch(JSON.stringify(preview), /champagne_gold|compact|reduced/);
});

test('shell y proxy conservan auth central, tenant exacto, CAS y límites del prompt', () => {
  const shell = read('../src/components/admin/promo/PromoAdminShell.astro');
  const editor = read('../src/components/admin/promo/PromoAppearanceEditor.astro');
  const api = read('../src/pages/api/admin/promo-appearance.ts');
  const styles = read('../src/styles/promo-appearance.css');

  assert.match(shell, /<PromoAppearanceEditor/);
  assert.match(shell, /promo\.content\.manage/);
  assert.match(shell, /promo\.theme\.select/);
  assert.match(shell, /promo\.appearance\.manage/);
  assert.match(api, /refreshAuthFromCookie/);
  assert.match(api, /requireCurrentStoreForAdmin/);
  assert.match(api, /context\.store\.slug[\s\S]*?storeSlug/);
  assert.match(api, /\/api\/pz\/promo\/private\/v1\/themes\/catalog/);
  assert.match(api, /promo\.theme\.catalog\.read\.v1/);
  assert.match(api, /X-PZ-Promo-Store/);
  assert.match(editor, /expected_version: draft\.version/);
  assert.match(editor, /Guardar actualiza la página pública automáticamente/);
  assert.match(editor, /Vista de referencia del tema y sus ajustes visuales antes de guardar/);
  assert.match(editor, /role="alert"/);
  assert.match(editor, /aria-live="polite"/);
  assert.match(editor, /reportValidity\(\)/);
  assert.match(styles, /@media \(max-width: 700px\)/);
  assert.match(styles, /@media \(max-width: 420px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(`${shell}\n${editor}\n${api}`, /products|categories|orders|checkout|cart|Cloudflare|Coolify/);
  assert.doesNotMatch(`${editor}\n${api}`, /publication\/|candidate|preview\/v1|store_id|site_id|\bfilter\b|\bsort\b|\bfields\b|\bexpand\b|\brealtime\b/);
});
