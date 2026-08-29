import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePromoAdminLocale,
  PROMO_ADMIN_LOCALE_COOKIE,
  promoAdminText,
  resolvePromoAdminLocale,
} from '../../frontend-powerzona/src/lib/promoAdminI18n.ts';

test('idioma del Admin Promo queda cerrado a español o inglés', () => {
  assert.equal(PROMO_ADMIN_LOCALE_COOKIE, 'pz_promo_admin_locale');
  assert.equal(normalizePromoAdminLocale('en'), 'en');
  assert.equal(normalizePromoAdminLocale('EN'), 'en');
  assert.equal(normalizePromoAdminLocale('fr'), 'es');
  assert.equal(normalizePromoAdminLocale(undefined), 'es');
  assert.equal(resolvePromoAdminLocale('en', true), 'en');
  assert.equal(resolvePromoAdminLocale('en', false), 'es');
  assert.equal(resolvePromoAdminLocale(undefined, true), 'es');
});

test('traducción cubre shell, editores y textos dinámicos sin alterar contenido desconocido', () => {
  assert.equal(promoAdminText('en', 'Contenido'), 'Content');
  assert.equal(promoAdminText('en', 'Organización'), 'Organization');
  assert.equal(promoAdminText('en', 'Galería y productos'), 'Gallery and products');
  assert.equal(promoAdminText('en', 'Contenido visual actualizado.'), 'Visual content updated.');
  assert.equal(
    promoAdminText('en', 'No se guardaron cambios en la página pública. Las imágenes continúan pendientes para reintentar.'),
    'No changes were saved to the public page. The images remain pending so you can try again.',
  );
  assert.equal(promoAdminText('en', 'Logo del negocio'), 'Business logo');
  assert.equal(promoAdminText('en', 'Solicitar una reseña'), 'Request a review');
  assert.equal(promoAdminText('en', 'Artesanal cálida'), 'Warm artisan');
  assert.equal(promoAdminText('en', 'Tema actual: Artesanal cálida'), 'Current theme: Warm artisan');
  assert.equal(promoAdminText('en', 'Título SEO'), 'SEO title');
  assert.equal(promoAdminText('en', 'Estado visual de la página'), 'Page appearance status');
  assert.equal(promoAdminText('en', 'Cargando reseñas…'), 'Loading reviews…');
  assert.equal(promoAdminText('en', 'No fue posible cargar las analíticas. Intenta nuevamente.'), 'Analytics could not be loaded. Try again.');
  assert.equal(promoAdminText('en', 'Productos de Limpieza de alfombras'), 'Products for Limpieza de alfombras');
  assert.equal(promoAdminText('en', 'La navegación de Apariencia está lista'), 'Appearance navigation is ready');
  assert.equal(promoAdminText('en', 'Nombre propio de la tienda'), 'Nombre propio de la tienda');
  assert.equal(promoAdminText('es', 'Contenido'), 'Contenido');
});

test('shell guarda la preferencia sin tocar idioma público ni usar storage del navegador', () => {
  const shell = readFileSync(new URL('../../frontend-powerzona/src/components/admin/promo/PromoAdminShell.astro', import.meta.url), 'utf8');
  assert.match(shell, /data-promo-admin-locale-select/);
  assert.match(shell, /hasPromoCapability\(accessContext, 'language_selector_enabled'\)/);
  assert.match(shell, /languageSelectorEnabled && <label class="pz-promo-admin__language"/);
  assert.match(shell, /resolvePromoAdminLocale/);
  assert.match(shell, /Max-Age=31536000; SameSite=Lax/);
  assert.match(shell, /window\.location\.reload\(\)/);
  assert.doesNotMatch(shell, /localStorage|sessionStorage/);
  assert.match(shell, /attributeFilter: \['aria-label', 'title', 'placeholder'\]|observePromoAdminTranslations/);
});

test('analíticas y contenido dinámico respetan el idioma administrativo y protegen texto editorial', () => {
  const analytics = readFileSync(new URL('../../frontend-powerzona/src/layouts/PromoAnalyticsAdminPage.astro', import.meta.url), 'utf8');
  const products = readFileSync(new URL('../../frontend-powerzona/src/components/admin/promo/PromoServiceProductsEditor.astro', import.meta.url), 'utf8');
  const reviews = readFileSync(new URL('../../frontend-powerzona/src/components/admin/promo/PromoReviewsEditor.astro', import.meta.url), 'utf8');
  const i18n = readFileSync(new URL('../../frontend-powerzona/src/lib/promoAdminI18n.ts', import.meta.url), 'utf8');
  assert.match(analytics, /htmlLang=\{adminLocale\}/);
  assert.match(analytics, /hasPromoCapability\(accessContext, 'language_selector_enabled'\)/);
  assert.match(analytics, /resolvePromoAdminLocale/);
  assert.match(analytics, /observePromoAdminTranslations\(analyticsRoot, adminLocale\)/);
  assert.match(analytics, /new Intl\.NumberFormat\(adminLocale\)/);
  assert.match(i18n, /attributeFilter: \['aria-label', 'title', 'placeholder'\]/);
  assert.match(products, /promoAdminNoTranslate/);
  assert.match(reviews, /new Intl\.DateTimeFormat\(adminLocale/);
  assert.match(reviews, /promoAdminNoTranslate/);
});
