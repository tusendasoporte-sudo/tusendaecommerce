import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const footer = readFileSync(new URL('../src/components/PublicFooter.astro', import.meta.url), 'utf8');

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
});

test('la llamada comercial usa el diseño premium aprobado', () => {
  assert.match(footer, />Para emprendedores</);
  assert.match(footer, />Convierte tu negocio en una tienda online</);
  assert.match(footer, />Quiero crear mi tienda</);
  assert.match(footer, />Tecnología de</);
  assert.match(footer, /class="pz-platform-visual"/);
});

test('los accesos útiles conservan una cuadrícula adaptable', () => {
  assert.match(footer, /\.pz-footer-utilities\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
  assert.match(footer, /\.pz-footer-utilities\.count-2\s*\{[^}]*repeat\(2,/s);
  assert.match(footer, /@media \(max-width: 720px\)[\s\S]*\.pz-footer-utility\s*\{/);
});
