import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const promosUrl = new URL('../src/pages/admin/promos.astro', import.meta.url);
const promos = readFileSync(promosUrl, 'utf8');

test('el nombre interno del cupón lo genera el sistema y no se solicita al usuario', () => {
  assert.doesNotMatch(promos, /id="coupon-name"/);
  assert.doesNotMatch(promos, /Nombre interno/);
  assert.match(promos, /name:\s*couponInternalName\(code\)/);
  assert.match(promos, /return `Cupón \$\{String\(code/);
});

test('el código admite símbolos ASCII hasta ocho caracteres y explica los rechazos', () => {
  assert.match(promos, /id="coupon-code"[^>]*minlength="2"[^>]*maxlength="8"/);
  assert.match(promos, /pattern="\[\\x20-\\x7E\]\{2,8\}"/);
  assert.match(promos, /El código no admite acentos, ñ ni emojis\./);
  assert.match(promos, /El código admite un máximo de 8 caracteres\./);
  assert.match(promos, /couponCodeError\.classList\.toggle\('hidden', !message\)/);
});

test('la migración que preserva el historial forma parte del despliegue backend', () => {
  const migration = new URL('../../backend-powerzona/pb_migrations/1787292100_manual_coupon_lifecycle.js', import.meta.url);
  assert.equal(existsSync(migration), true);
});
