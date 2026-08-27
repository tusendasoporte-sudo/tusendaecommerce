import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map((value) => Number.parseInt(value, 16) / 255);
  const linear = channels.map((value) => value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

const layout = read('../src/layouts/PromoPublicLayout.astro');
const theme = read('../src/components/promo-public/PromoBlackGoldTheme.astro');
const hero = read('../src/components/promo-public/PromoHero.astro');
const sectionMedia = read('../src/components/promo-public/PromoSectionMedia.astro');
const sections = read('../src/components/promo-public/PromoSections.astro');
const reviews = read('../src/components/promo-public/PromoReviews.astro');
const contactAction = read('../src/components/promo-public/PromoContactAction.astro');
const footer = read('../src/components/promo-public/PromoFooter.astro');
const qr = read('../src/components/promo-public/PromoLandingQrLink.astro');
const heroCarousel = read('../src/lib/promoHeroCarousel.ts');
const shellStyles = read('../src/styles/promo-public-shell.css');
const themeStyles = read('../src/styles/promo-black-gold.css');
const heroStyles = read('../src/styles/promo-hero.css');
const sectionStyles = read('../src/styles/promo-sections.css');
const reviewStyles = read('../src/styles/promo-reviews.css');
const contactStyles = read('../src/styles/promo-contact.css');
const footerStyles = read('../src/styles/promo-footer.css');
const qrStyles = read('../src/styles/promo-landing-qr.css');
const components = [theme, hero, sectionMedia, sections, reviews, contactAction, footer, qr].join('\n');
const publicStyles = [
  shellStyles, themeStyles, heroStyles, sectionStyles, reviewStyles,
  contactStyles, footerStyles, qrStyles,
].join('\n');

test('A11Y conserva documento adaptable, landmarks, skip link y jerarquía de encabezados', () => {
  assert.match(layout, /<html lang=\{lang\} dir=\{direction\}>/);
  assert.match(layout, /width=device-width, initial-scale=1/);
  assert.doesNotMatch(layout, /maximum-scale|user-scalable\s*=\s*no/i);
  assert.match(theme, /class="promo-skip-link" href="#promo-main"/);
  assert.match(theme, /<header class(?::list)?=[\s\S]*?promo-shell-header/);
  assert.match(theme, /<main id="promo-main"[\s\S]*?tabindex="-1"/);
  assert.match(footer, /<footer[\s\S]*?aria-label=/);
  assert.match(theme, /<nav class="promo-shell-navigation" aria-label=/);
  assert.match(theme, /<nav class="promo-shell-locales" aria-label=/);
  assert.match(theme, /mainSections.length === 0 && <h1/);
  for (const source of [hero, sections, reviews, contactAction]) {
    if (source === contactAction) continue;
    assert.match(source, /primaryHeading[\s\S]*?<h1[\s\S]*?<h2/);
  }
  assert.doesNotMatch(components, /tabindex=["'][1-9]|autofocus|accesskey=/i);
});

test('A11Y materializa nombres, estados y alternativas de media sin semántica ARIA huérfana', () => {
  assert.match(theme, /aria-current=\{option\.active \? 'page'/);
  assert.match(contactAction, /href=\{action\.href\}[\s\S]*?aria-label=\{action\.aria_label\}/);
  assert.match(contactAction, /role="status"/);
  assert.match(qr, /aria-label=\{link\.aria_label\}/);
  assert.match(footer, /aria-label=\{footer\.navigation_label\}/);
  assert.match(footer, /aria-label=\{footer\.social_label\}/);
  assert.match(reviews, /role="group"[\s\S]*?reviews\.average/);
  assert.match(reviews, /class="promo-reviews__stars" role="img" aria-label=\{ratingLabel\}/);
  assert.match(hero, /alt=\{media\.accessibility\.alt\}/);
  assert.match(sectionMedia, /alt=\{media\.accessibility\.alt\}/);
  assert.match(hero, /controls=\{media\.delivery\.controls_required\}/);
  assert.match(hero, /poster=\{media\.delivery\.poster\.src\}/);
  assert.match(hero, /aria-label=\{mediaLabel\(media, index\)\}/);
  assert.match(hero, /mediaControlLabel[\s\S]*?index \+ 1\}\/\$\{heroMedia\.length\}/);
  assert.doesNotMatch([hero, sectionMedia].join('\n'), /autoplay=/);
});

test('A11Y mantiene teclado completo, foco visible y controles de video no ocultos', () => {
  assert.match(shellStyles, /\.promo-skip-link:focus-visible[\s\S]*?outline: 3px/);
  assert.match(themeStyles, /\.promo-black-gold a:focus-visible[\s\S]*?outline: 3px/);
  assert.match(heroStyles, /\.promo-hero__slides:focus-visible[\s\S]*?outline: 3px/);
  assert.match(reviewStyles, /\.promo-reviews__viewport:focus-visible[\s\S]*?outline: 3px/);
  assert.match(heroStyles, /video:focus-visible[\s\S]*?box-shadow: inset 0 0 0 8px/);
  assert.match(sectionStyles, /video:focus-visible[\s\S]*?box-shadow: inset 0 0 0 8px/);
  assert.match(themeStyles, /@media \(forced-colors: active\)[\s\S]*?outline: 3px solid Highlight/);
  assert.match(heroStyles, /\.promo-hero__controls \{[\s\S]*?inset-block-start:/);
  assert.doesNotMatch(heroStyles.match(/\.promo-hero__controls \{[\s\S]*?\}/)?.[0] || '', /inset-block-end/);
  assert.match(hero, /tabindex=\{heroMedia\.length > 1 \? '0'/);
  assert.match(heroCarousel, /document\.createElement\('button'\)/);
  assert.match(heroCarousel, /toggle\.setAttribute\('aria-label', label\)/);
  assert.match(heroCarousel, /control\.setAttribute\('aria-current', 'true'\)/);
  assert.match(heroStyles, /\.promo-hero__toggle \{[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px/);
  assert.match(heroStyles, /\.promo-hero__toggle:focus-visible[\s\S]*?outline: 3px/);
  assert.match(reviews, /tabindex="0"[\s\S]*?role="region"[\s\S]*?aria-label=/);
});

test('A11Y verifica contraste Theme AA y estados disponibles/no disponibles', () => {
  const textPairs = [
    ['f6f1e7', '0b0b0b'],
    ['c9c0b0', '0b0b0b'],
    ['ead49b', '0b0b0b'],
    ['0b0b0b', 'c8a45a'],
    ['c9c0b0', '1d1a15'],
  ];
  for (const [foreground, background] of textPairs) {
    assert.ok(contrast(foreground, background) >= 4.5, foreground + ' sobre ' + background);
  }
  assert.ok(contrast('f6f1e7', '0b0b0b') >= 3, 'foco marfil sobre superficie');
  assert.match(themeStyles, /--promo-text-soft: #c9c0b0/);
  assert.match(themeStyles, /@media \(prefers-contrast: more\)/);
  assert.match(contactStyles, /\.promo-contact-action--unavailable[\s\S]*?border-style: dashed[\s\S]*?background: var\(--promo-surface-soft\)[\s\S]*?color: var\(--promo-muted\)/);
  const unavailableStateRule =
    contactStyles.match(/\.promo-contact-action__state\s*\{[^}]*\}/)?.[0] || '';
  assert.doesNotMatch(unavailableStateRule, /opacity:/);
});

test('A11Y preserva targets táctiles, reflow, zoom de texto, RTL y strings largos', () => {
  assert.match(shellStyles, /text-size-adjust: 100%/);
  assert.match(themeStyles, /min-width: 44px;[\s\S]*?min-height: 44px/);
  assert.match(heroStyles, /\.promo-hero__control[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px/);
  assert.match(contactStyles, /\.promo-contact-action[\s\S]*?min-height: 54px/);
  assert.match(footerStyles, /min-height: 44px/);
  assert.match(qrStyles, /min-height: 44px/);
  assert.match(themeStyles, /overflow-wrap: anywhere/);
  assert.match(footerStyles, /overflow-wrap: anywhere/);
  assert.match(contactStyles, /overflow-wrap: anywhere/);
  assert.match(themeStyles, /inset-inline|border-inline/);
  assert.match(sectionStyles, /inset-inline|border-inline/);
  assert.doesNotMatch(publicStyles, /orientation\s*:/i);
});

test('A11Y respeta movimiento reducido por sistema y por token sin tocar video o Analytics', () => {
  assert.match(shellStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?scroll-behavior: auto/);
  assert.match(themeStyles, /data-promo-token-motion="reduced"/);
  assert.match(contactStyles, /data-promo-token-motion="reduced"[\s\S]*?transition: none/);
  assert.match(reviewStyles, /data-promo-token-motion="reduced"[\s\S]*?scroll-behavior: auto/);
  assert.match(footerStyles, /data-promo-token-motion="reduced"[\s\S]*?transition: none/);
  assert.match(qrStyles, /data-promo-token-motion="reduced"[\s\S]*?transition: none/);
  assert.match(layout, /requestIdleCallback/);
  assert.match(layout, /landing_qr_open/);
  assert.match(layout, /credentials: 'omit'/);
  assert.match(heroCarousel, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(heroCarousel, /dataset\.promoTokenMotion === 'reduced'/);
  assert.match(heroCarousel, /window\.setInterval\([\s\S]*?CAROUSEL_INTERVAL_MS/);
  assert.match(heroCarousel, /window\.clearInterval\(timer\)/);
  assert.match(hero, /class="promo-hero__control"/);
  assert.match(hero, /type="button"/);
  assert.doesNotMatch(hero, /href=\{`#\$\{sectionId\}-media-/);
  assert.doesNotMatch(hero, /id=\{`\$\{sectionId\}-media-/);
  assert.match(heroCarousel, /legacyMediaHash/);
  assert.match(heroCarousel, /window\.history\.replaceState\(null, '', cleanUrl\)/);
  assert.match(heroCarousel, /track\.addEventListener\('wheel'[\s\S]*?window\.scrollBy[\s\S]*?passive: false/);
});

test('A11Y conserva alternativa y marco estable cuando una imagen pública falla', () => {
  assert.match(layout, /markUnavailablePromoImage/);
  assert.match(layout, /image\.addEventListener\('error'/);
  assert.match(layout, /image\.removeAttribute\('srcset'\)/);
  assert.match(layout, /image\.removeAttribute\('src'\)/);
  assert.match(layout, /promoMediaFallback/);
  assert.match(layout, /fallback\.setAttribute\('aria-label', alternative\)/);
  assert.match(themeStyles, /\[data-promo-media-frame-state="error"\]/);
  assert.match(themeStyles, /background-image:/);
  assert.match(themeStyles, /visibility: hidden/);
  assert.match(hero, /alt=\{media\.accessibility\.alt\}/);
  assert.match(sectionMedia, /alt=\{media\.accessibility\.alt\}/);
});
