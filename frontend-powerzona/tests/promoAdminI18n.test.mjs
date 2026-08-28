import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePromoAdminLocale,
  PROMO_ADMIN_LOCALE_COOKIE,
  promoAdminText,
} from '../../frontend-powerzona/src/lib/promoAdminI18n.ts';

test('idioma del Admin Promo queda cerrado a español o inglés', () => {
  assert.equal(PROMO_ADMIN_LOCALE_COOKIE, 'pz_promo_admin_locale');
  assert.equal(normalizePromoAdminLocale('en'), 'en');
  assert.equal(normalizePromoAdminLocale('EN'), 'en');
  assert.equal(normalizePromoAdminLocale('fr'), 'es');
  assert.equal(normalizePromoAdminLocale(undefined), 'es');
});

test('traducción cubre shell, editores y textos dinámicos sin alterar contenido desconocido', () => {
  assert.equal(promoAdminText('en', 'Contenido'), 'Content');
  assert.equal(promoAdminText('en', 'Organización'), 'Organization');
  assert.equal(promoAdminText('en', 'Galería y productos'), 'Gallery and products');
  assert.equal(promoAdminText('en', 'Imágenes usadas en la página'), 'Images used on the page');
  assert.equal(promoAdminText('en', 'Logo del negocio'), 'Business logo');
  assert.equal(promoAdminText('en', 'Solicitar una reseña'), 'Request a review');
  assert.equal(promoAdminText('en', 'Tema actual: Artesanal cálida'), 'Current theme: Artesanal cálida');
  assert.equal(promoAdminText('en', 'Nombre propio de la tienda'), 'Nombre propio de la tienda');
  assert.equal(promoAdminText('es', 'Contenido'), 'Contenido');
});

test('shell guarda la preferencia sin tocar idioma público ni usar storage del navegador', () => {
  const shell = readFileSync(new URL('../../frontend-powerzona/src/components/admin/promo/PromoAdminShell.astro', import.meta.url), 'utf8');
  assert.match(shell, /data-promo-admin-locale-select/);
  assert.match(shell, /Max-Age=31536000; SameSite=Lax/);
  assert.match(shell, /window\.location\.reload\(\)/);
  assert.doesNotMatch(shell, /localStorage|sessionStorage/);
});
