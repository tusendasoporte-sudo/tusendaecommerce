import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/pages/admin/index.astro', import.meta.url), 'utf8');

test('E005: el resumen Landing QR consume la serie diaria privada', () => {
  assert.match(source, /series: \(Array\.isArray\(landing\?\.daily\) \? landing\.daily : \[\]\)\.map/);
  assert.match(source, /day: String\(item\?\.day \|\| ''\)/);
  assert.match(source, /views: Number\(item\?\.views \|\| 0\)/);
  assert.match(source, /clicks: Number\(item\?\.clicks \|\| 0\)/);
  assert.doesNotMatch(source, /function computeLandingQrAnalytics\(\)[\s\S]*?series:\s*\[\][\s\S]*?\n\s*};/);
});

test('E005: la gráfica conserva el estado vacío y la visualización con datos', () => {
  assert.match(source, /function createLandingQrChartMarkup\(points\)/);
  assert.match(source, /Sin actividad visible todav/);
  assert.match(source, /trafficLandingChart\.innerHTML = metrics\.series\.length[\s\S]*?createLandingQrChartMarkup\(metrics\.series\)/);
  assert.match(source, /renderPoints\(viewCoords, '#16a34a', 'landingQrViews'\)/);
  assert.match(source, /renderPoints\(clickCoords, '#2563eb', 'landingQrClicks'\)/);
});
