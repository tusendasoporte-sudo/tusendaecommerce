import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const promoBar = read('../src/components/PromoBar.astro');
const promosAdmin = read('../src/pages/admin/promos.astro');

test('el cintillo público usa una tarjeta premium completa como enlace', () => {
  assert.match(promoBar, /class=\{`promo-bar-item[\s\S]*?href=\{item\.url \|\| undefined\}/);
  assert.match(promoBar, /class="promo-bar-icon"/);
  assert.match(promoBar, /class="promo-bar-kicker">Oferta destacada/);
  assert.match(promoBar, /class="promo-bar-subtext"/);
  assert.match(promoBar, /class="promo-bar-button" aria-hidden="true"/);
  assert.doesNotMatch(promoBar, /<a\s+class="promo-bar-button"/);
  assert.match(promoBar, /target=\{item\.url && item\.isExternal \? '_blank'/);
  assert.match(promoBar, /rel=\{item\.url && item\.isExternal \? 'noopener noreferrer'/);
});

test('el carrusel premium presenta una oferta por turno y ofrece efectos discretos', () => {
  assert.match(promoBar, /\.promo-bar-carousel \.promo-bar-item \{\s*flex: 0 0 100%/);
  assert.match(promoBar, /data-promo-dot=\{index\}/);
  assert.match(promoBar, /\.promo-bar-item\.is-link:hover/);
  assert.match(promoBar, /\.promo-bar-item\.is-link:active/);
  assert.match(promoBar, /\.promo-bar-shine/);
  assert.match(promoBar, /prefers-reduced-motion: reduce/);
  assert.match(promoBar, /bar\.addEventListener\('focusin', stop\)/);
});

test('el máximo de tres ofertas queda visible y deshabilitado hasta liberar espacio', () => {
  assert.match(promoBar, /\.slice\(0, 3\)/);
  assert.doesNotMatch(promosAdmin, /marketingAddOfferBtn\.classList\.toggle\('hidden', items\.length >= 3\)/);
  assert.match(promosAdmin, /marketingAddOfferBtn\.disabled = limitReached/);
  assert.match(promosAdmin, /buttonLabel\.textContent = limitReached \? 'Límite alcanzado' : 'Agregar oferta'/);
  assert.match(promosAdmin, /marketingBarAvailableHint\.textContent = remaining > 0[\s\S]*?'3 de 3 ofertas'/);
  assert.match(promosAdmin, /if \(currentMarketingItems\(\)\.length >= 3\)/);
});
