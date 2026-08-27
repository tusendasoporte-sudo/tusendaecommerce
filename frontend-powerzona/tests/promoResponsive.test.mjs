import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const shellStyles = read('../src/styles/promo-public-shell.css');
const themeStyles = read('../src/styles/promo-black-gold.css');
const qrStyles = read('../src/styles/promo-landing-qr.css');
const heroStyles = read('../src/styles/promo-hero.css');
const sectionStyles = read('../src/styles/promo-sections.css');
const reviewStyles = read('../src/styles/promo-reviews.css');
const contactStyles = read('../src/styles/promo-contact.css');
const footerStyles = read('../src/styles/promo-footer.css');
const theme = read('../src/components/promo-public/PromoBlackGoldTheme.astro');
const hero = read('../src/components/promo-public/PromoHero.astro');
const sectionMedia = read('../src/components/promo-public/PromoSectionMedia.astro');

test('RESP fija targets táctiles 44×44 y CTA de 54 px en todos los cortes móviles', () => {
  assert.match(themeStyles, /\.promo-shell-navigation a,[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px;/);
  assert.match(themeStyles, /@media \(max-width: 420px\)[\s\S]*?\.promo-shell-locales a \{ min-width: 44px; min-height: 44px;/);
  assert.match(qrStyles, /\.promo-landing-qr-link[\s\S]*?min-height: 44px;/);
  assert.match(heroStyles, /\.promo-hero__arrow[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px;/);
  assert.doesNotMatch(heroStyles, /\.promo-hero__toggle/);
  assert.doesNotMatch(heroStyles, /min-(?:width|height): 36px/);
  assert.doesNotMatch(themeStyles, /min-(?:width|height): 42px/);
  assert.match(contactStyles, /\.promo-contact-action[\s\S]*?min-height: 54px;/);
  assert.match(footerStyles, /min-height: 44px/);
});

test('RESP conserva cabecera de tres filas, QR icon-only estrecho y navegación confinada', () => {
  assert.ok(theme.indexOf('promo-shell-brand') < theme.indexOf('promo-shell-navigation'));
  assert.ok(theme.indexOf('promo-shell-navigation') < theme.indexOf('promo-shell-locales'));
  assert.ok(theme.indexOf('promo-shell-locales') < theme.indexOf('<PromoLandingQrLink'));
  assert.match(qrStyles, /@media \(max-width: 720px\)[\s\S]*?grid-row: 2;[\s\S]*?\.promo-shell-navigation[\s\S]*?grid-row: 3;/);
  assert.match(qrStyles, /@media \(max-width: 340px\)[\s\S]*?\.promo-landing-qr-link__label[\s\S]*?clip-path: inset\(50%\)/);
  assert.match(themeStyles, /\.promo-shell-navigation[\s\S]*?overscroll-behavior-inline: contain/);
  assert.match(themeStyles, /\.promo-shell-navigation[\s\S]*?overflow-x: auto/);
});

test('RESP aplica reflujo aprobado a Hero, secciones, reseñas y footer', () => {
  assert.match(themeStyles, /\.promo-black-gold \{[\s\S]*?overflow-x: clip;[\s\S]*?overflow-y: visible;/);
  assert.match(themeStyles, /\.promo-black-gold \{[\s\S]*?max-width: 1920px;[\s\S]*?margin-inline: auto/);
  assert.match(themeStyles, /\.promo-shell-section--hero::after \{[\s\S]*?display: none/);
  assert.match(heroStyles, /@media \(min-width: 721px\)[\s\S]*?\.promo-shell-section\.promo-hero--layout-immersive\.promo-hero--with-media[\s\S]*?min-height: 0 !important;[\s\S]*?padding: 0 !important/);
  assert.match(heroStyles, /@media \(min-width: 721px\)[\s\S]*?\.promo-hero--layout-immersive\.promo-hero--with-media \.promo-hero__inner,[\s\S]*?\.promo-hero--layout-centered\.promo-hero--with-media \.promo-hero__inner \{[\s\S]*?width: 100%;[\s\S]*?max-width: none/);
  assert.match(heroStyles, /min-height: clamp\(32rem, 65svh, 45rem\) !important/);
  assert.match(heroStyles, /@media \(min-width: 721px\)[\s\S]*?\.promo-hero--layout-immersive \.promo-hero__slides,[\s\S]*?min-height: 0 !important/);
  assert.match(heroStyles, /@media \(min-width: 721px\)[\s\S]*?\.promo-hero--layout-immersive\.promo-hero--with-media \.promo-hero__copy \{[\s\S]*?margin-inline: clamp\(1\.25rem, 6vw, 8rem\)/);
  assert.match(heroStyles, /@media \(max-width: 720px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\)[\s\S]*?aspect-ratio: 4 \/ 3/);
  assert.match(sectionStyles, /@media \(max-width: 420px\)[\s\S]*?\.promo-sections__service-card \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(sectionStyles, /@media \(max-width: 420px\)[\s\S]*?grid-column: 1 \/ -1/);
  assert.match(sectionStyles, /\.promo-sections__owner-media[\s\S]*?overflow: visible/);
  assert.match(reviewStyles, /@media \(max-width: 720px\)[\s\S]*?\.promo-reviews__all-grid \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(reviewStyles, /@media \(max-width: 420px\)[\s\S]*?\.promo-reviews__card \{ padding: 1\.25rem/);
  assert.match(footerStyles, /@media \(max-width: 640px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(footerStyles, /@media \(max-width: 360px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
});

test('RESP mantiene teclado, foco, zoom de texto y strings largos sin ocultar funciones', () => {
  assert.match(shellStyles, /text-size-adjust: 100%/);
  assert.match(shellStyles, /\.promo-skip-link[\s\S]*?min-height: 44px[\s\S]*?overflow-wrap: anywhere/);
  assert.match(theme, /class="promo-skip-link"/);
  assert.match(theme, /tabindex="-1"/);
  assert.match(theme, /aria-current=\{option\.active \? 'page'/);
  assert.doesNotMatch(theme, /tabindex="[1-9]/);
  assert.match(themeStyles, /overflow-wrap: anywhere/);
  assert.match(contactStyles, /\.promo-contact-action__label[\s\S]*?overflow-wrap: anywhere/);
  assert.match(reviewStyles, /\.promo-reviews blockquote p[\s\S]*?overflow-wrap: anywhere/);
  assert.match(shellStyles, /\.promo-skip-link:focus-visible[\s\S]*?outline: 3px/);
  assert.match(themeStyles, /outline: 3px solid var\(--promo-focus\)/);
  assert.match(heroStyles, /\.promo-hero__figure video:focus-visible[\s\S]*?outline: 3px/);
});

test('RESP conserva media progresiva, video bajo interacción y movimiento reducido', () => {
  assert.match(hero, /loading=\{media\.delivery\.loading\}/);
  assert.match(hero, /fetchpriority=\{media\.delivery\.fetch_priority\}/);
  assert.match(hero, /preload=\{media\.delivery\.preload\}/);
  assert.match(sectionMedia, /loading=\{media\.delivery\.loading\}/);
  assert.match(sectionMedia, /preload=\{media\.delivery\.preload\}/);
  assert.doesNotMatch(`${hero}\n${sectionMedia}`, /autoplay=/);
  assert.match(shellStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(contactStyles, /body\[data-promo-token-motion="reduced"\] \.promo-contact-action:hover[\s\S]*?transform: none/);
  assert.match(reviewStyles, /body\[data-promo-token-motion="reduced"\] \.promo-reviews__viewport/);
});
