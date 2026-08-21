import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const promos = readFileSync(new URL('../src/pages/admin/promos.astro', import.meta.url), 'utf8');

test('Marketing evita repetir el encabezado de accesos rápidos antes de Crear tarjeta', () => {
  const quickPanel = promos.slice(
    promos.indexOf('<div class="marketing-featured-panel marketing-quick-panel">'),
    promos.indexOf('<form id="visual-form"'),
  );

  assert.match(quickPanel, /id="open-visual-form-btn"[\s\S]*?>Crear tarjeta<|pz-admin-btn__label">Crear tarjeta/);
  assert.doesNotMatch(quickPanel, /<h2>Accesos rápidos<\/h2>/);
  assert.doesNotMatch(quickPanel, /Tarjetas visuales para WhatsApp, enlaces, categorías o archivos\./);
});

test('Nueva promoción vive dentro del panel de promociones y no en la cabecera global', () => {
  const header = promos.slice(
    promos.indexOf('<AdminSectionHeader'),
    promos.indexOf('<section id="marketing-summary-card"'),
  );
  const promotionsPanel = promos.slice(
    promos.indexOf('<div class="marketing-featured-panel marketing-promos-panel">'),
    promos.indexOf('<form id="promotion-form"'),
  );

  assert.doesNotMatch(header, /id="promotion-new-btn"/);
  assert.match(promotionsPanel, /id="promotion-new-btn"[\s\S]*?pz-admin-btn__label">Nueva promoción/);
  assert.match(promotionsPanel, /id="promotion-readme-btn"/);
});
