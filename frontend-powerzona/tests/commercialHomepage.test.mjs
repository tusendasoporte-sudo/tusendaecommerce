import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const page = read('src/pages/index.astro');
const styles = read('src/styles/commercial-home.css');

test('la portada comercial consume el catálogo oficial y conserva las tiendas reales', () => {
  assert.match(page, /getPublicCommercialPlanCatalog\(serverPocketBaseUrl\(\)\)/);
  assert.match(page, /getFeaturedStores\(\)/);
  assert.match(page, /commercialCatalog\.store_types/);
  assert.match(page, /commercialPeriods/);
  assert.match(page, /pricingView\(plan, months\)/);
  assert.doesNotMatch(page, /US\$|USD/);
});

test('las tarjetas muestran precio, total, ahorro, duración, límites, funciones y aplicaciones', () => {
  for (const text of [
    'Total a pagar:',
    'Límites principales',
    'Funciones incluidas',
    'App administrativa Android',
    'App Android para clientes',
    'data-plan-total',
    'data-period-name',
  ]) assert.match(page, new RegExp(text));
  assert.match(page, /monthly_equivalent_cup/);
  assert.match(page, /savings_cup/);
  assert.match(page, /Seguridad avanzada no incluida por defecto\./);
  assert.match(page, /permanece apagada al crearla/);
});

test('la portada contiene todas las secciones y selectores pedidos', () => {
  for (const marker of [
    'id="soluciones"',
    'commercial-benefit-grid',
    'id="planes"',
    'data-store-mode="promotional"',
    'data-store-mode="ecommerce"',
    'data-billing-period',
    'id="comparacion"',
    'id="aplicaciones"',
    'id="tiendas"',
    'id="preguntas"',
    'commercial-final-cta',
  ]) assert.match(page, new RegExp(marker));
  assert.match(page, /La tienda que necesitas hoy, lista para crecer mañana\./);
  assert.match(page, /Elige una presencia promocional para mostrar tu catálogo y recibir contactos/);
});

test('la interacción alterna modalidad, periodo, comparación y selección accesible', () => {
  assert.match(page, /aria-pressed/);
  assert.match(page, /panel\.dataset\.panelMode !== activeMode/);
  assert.match(page, /panel\.dataset\.panelPeriod !== activePeriod/);
  assert.match(page, /table\.dataset\.comparisonTable !== activeMode/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /HTMLDetailsElement/);
});

test('la composición tiene cortes responsive, foco visible y movimiento reducido', () => {
  assert.match(styles, /@media \(max-width: 860px\)/);
  assert.match(styles, /@media \(max-width: 640px\)/);
  assert.match(styles, /@media \(max-width: 390px\)/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /overflow-x: auto/);
});
