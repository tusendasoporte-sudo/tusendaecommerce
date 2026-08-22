import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const footer = readFileSync(new URL('../src/components/PublicFooter.astro', import.meta.url), 'utf8');

test('los accesos principales usan iconos premium rasterizados y optimizados', () => {
  assert.match(footer, /<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">/);
  assert.match(footer, /footer-icon-payment-v2\.webp/);
  assert.match(footer, /footer-icon-catalog-v2\.webp/);
  assert.match(footer, /footer-icon-whatsapp-v2\.webp/);
  assert.match(footer, /width="256" height="256" loading="lazy" decoding="async"/);
  assert.match(footer, /\.pz-footer-utility-icon img\s*\{[^}]*object-fit:\s*contain;/s);
  assert.match(footer, /\.pz-footer-utility\.is-whatsapp \.pz-footer-utility-icon\s*\{[^}]*color:\s*#52f39a/s);
});

test('el footer no duplica WhatsApp con un acceso Contáctanos', () => {
  assert.doesNotMatch(footer, /label:\s*['"]Contáctanos['"]/);
  assert.match(footer, /label:\s*'WhatsApp', detail:\s*'Atención directa'/);
});

test('la información contextual prioriza horarios, envíos, ubicación e información real', () => {
  assert.match(footer, /const contextualUtility = formattedBusinessHours/);
  assert.match(footer, /:\s*shippingDeliveryInfo/);
  assert.match(footer, /:\s*locationDescription/);
  assert.match(footer, /:\s*aboutStoreText/);
  assert.match(footer, /data-pz-footer-modal="hours"/);
  assert.match(footer, /data-pz-footer-modal="location"/);
  assert.match(footer, /label:\s*'Catálogo'.*href:\s*homePath/s);
});

test('la llamada comercial usa el diseño premium aprobado', () => {
  assert.match(footer, />Para emprendedores</);
  assert.match(footer, />Convierte tu negocio en una tienda online</);
  assert.match(footer, />Quiero crear mi tienda</);
  assert.match(footer, />\s*Ver cómo funciona/);
  assert.match(footer, />Tecnología de</);
  assert.match(footer, /class="pz-platform-visual"/);
  assert.match(footer, /tusenda84-storefront-platform-v2\.webp/);
  assert.match(footer, /loading="lazy" decoding="async" width="840" height="1050"/);
  assert.match(footer, /class="pz-footer-platform-backed"/);
  assert.match(footer, /data-pz-footer-modal="creator-info"/);
});

test('los accesos útiles usan una sola franja premium adaptable', () => {
  assert.match(footer, /\.pz-footer-utilities\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
  assert.match(footer, /\.pz-footer-utilities\.count-2\s*\{[^}]*repeat\(2,/s);
  assert.match(footer, /\.pz-footer-utilities\s*\{[^}]*gap:\s*0;[^}]*overflow:\s*hidden;/s);
  assert.match(footer, /\.pz-footer-utility:not\(:first-child\)\s*\{[^}]*border-left:/s);
  assert.match(footer, /@media \(max-width: 720px\)[\s\S]*grid-template-areas:\s*'copy visual' 'button button' 'learn learn'/);
});
