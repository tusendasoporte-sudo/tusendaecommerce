import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const searchPage = readFileSync(new URL('../src/pages/buscar.astro', import.meta.url), 'utf8');

test('los resultados dinámicos conservan el formato de lista con miniaturas', () => {
  assert.match(
    searchPage,
    /\.result-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
  );

  for (const className of [
    'result-card',
    'result-img',
    'result-main',
    'result-name',
    'result-subtitle',
    'result-price',
    'result-type',
  ]) {
    assert.match(searchPage, new RegExp(`:global\\(\\.${className}\\)`));
  }

  assert.match(searchPage, /:global\(\.result-img\)[^{]*\{[^}]*width:\s*72px[^}]*height:\s*72px/s);
  assert.match(searchPage, /@media \(max-width:\s*700px\)[^{]*\{[\s\S]*:global\(\.result-img\)[^{]*\{[^}]*width:\s*64px[^}]*height:\s*64px/);
});
