import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const page = read('src/pages/index.astro');
const styles = read('src/styles/commercial-home.css');
const settings = read('src/lib/publicHomepageSettings.ts');

test('la portada comercial consume el catálogo oficial y conserva las tiendas reales', () => {
  assert.match(page, /const pocketbaseUrl = serverPocketBaseUrl\(\)/);
  assert.match(page, /getPublicCommercialPlanCatalog\(pocketbaseUrl\)/);
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
  assert.match(page, /Seguridad avanzada', value: \(\) => 'No incluida'/);
  assert.doesNotMatch(page, /Opcional · apagada por defecto/);
  assert.match(settings, /No está incluida ni activada por defecto/);
});

test('los planes promocionales no muestran límites de idiomas ni almacenamiento', () => {
  assert.doesNotMatch(page, /capabilities\.max_locales|capabilities\.max_storage_bytes/);
  assert.doesNotMatch(page, /label: 'Idiomas'|label: 'Almacenamiento'|MB de archivos/);
  assert.match(page, /Contenido multilenguaje/);
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

test('las tiendas destacadas usan una fila navegable de logos grandes, circulares y animados', () => {
  assert.match(page, /store\.logoCardUrl \|\| store\.logoUrl \|\| store\.bazarImageUrl/);
  assert.match(page, /alt=\{`Logo de \$\{store\.name\}`\}/);
  assert.match(page, /data-store-rail/);
  assert.match(page, /data-store-scroll="1"/);
  assert.match(styles, /\.commercial-store-grid\s*\{[\s\S]*?grid-auto-flow:\s*column[\s\S]*?overflow-x:\s*auto/);
  assert.match(styles, /\.commercial-store-image\s*\{[\s\S]*?width:\s*144px[\s\S]*?border-radius:\s*50%/);
  assert.match(styles, /\.commercial-store-image > img[\s\S]*?object-fit:\s*contain/);
  assert.match(styles, /-webkit-line-clamp:\s*2/);
  assert.match(page, /storeRail\.scrollBy/);
  assert.doesNotMatch(page, /Tienda destacada/);
  assert.match(styles, /commercial-store-arrive/);
  assert.match(styles, /commercial-store-shine/);
  assert.match(styles, /:is\(:hover, :focus-visible\)/);
});

test('la portada usa texto secundario legible sin alterar la escala de sus títulos', () => {
  assert.match(styles, /\.commercial-hero-copy > p\s*\{[\s\S]*?font-size:\s*20px/);
  assert.match(styles, /\.commercial-section-head > p,[\s\S]*?font-size:\s*19px/);
  assert.match(styles, /\.commercial-type-card > p\s*\{[\s\S]*?font-size:\s*17px/);
  assert.match(styles, /\.commercial-plan-card h3\s*\{[\s\S]*?font-size:\s*34px/);
  assert.match(styles, /\.commercial-plan-detail h4\s*\{[\s\S]*?font-size:\s*14px/);
  assert.match(styles, /\.commercial-plan-detail li\s*\{[\s\S]*?font-size:\s*14px/);
  assert.match(styles, /\.commercial-app-card p\s*\{[\s\S]*?font-size:\s*16px/);
  assert.match(styles, /\.commercial-faq-list details p\s*\{[\s\S]*?font-size:\s*16px/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.commercial-hero-copy > p\s*\{[\s\S]*?font-size:\s*18px/);
});

test('los planes eliminan el aviso repetido y elevan controles, botones y comparación', () => {
  assert.doesNotMatch(page, /commercial-security-note/);
  assert.match(styles, /\.commercial-segment button\s*\{[\s\S]*?min-height:\s*46px[\s\S]*?font-size:\s*16px/);
  assert.match(styles, /\.commercial-plan-action::after\s*\{[\s\S]*?content:\s*'→'/);
  assert.match(styles, /commercial-plan-button-shine/);
  assert.match(styles, /\.commercial-table-wrap thead th\s*\{[\s\S]*?linear-gradient/);
  assert.match(styles, /\.commercial-table-wrap thead th:last-child::after\s*\{[\s\S]*?MÁS COMPLETO/);
});

test('la portada consume configuración Master y usa un icono Android genérico', () => {
  assert.match(page, /getPublicHomepageSettings\(\)/);
  assert.match(page, /homepageSettings\.storesSectionEnabled/);
  assert.match(page, /showFeaturedStores && <a class="commercial-button commercial-button-ghost" href="#tiendas"/);
  assert.match(page, /showFaqSection &&/);
  assert.match(page, /visibleFaqs\.map/);
  assert.match(page, /\/brand\/android-platform-icon\.svg/);
  assert.doesNotMatch(page, /powerzona-app-preview-android\.png/);
});
