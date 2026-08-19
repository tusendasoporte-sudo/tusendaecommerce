import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const home = readFileSync(
  new URL('../src/components/public-store/PublicStoreHome.astro', import.meta.url),
  'utf8',
);

test('accesos rápidos usan tarjetas compactas que envuelven sin ocupar toda la fila', () => {
  assert.match(home, /\.quick-access-grid\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-wrap:\s*wrap;[\s\S]*?justify-content:\s*flex-start;/);
  assert.match(home, /\.quick-access-card\s*\{[\s\S]*?flex:\s*0 1 auto;[\s\S]*?width:\s*fit-content;[\s\S]*?max-width:\s*100%;/);
  assert.match(home, /grid-template-columns:\s*78px fit-content\(300px\);/);
  assert.doesNotMatch(home, /\.quick-access-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(190px,\s*1fr\)\)/);
});

test('textos largos se ajustan dentro de la tarjeta sin desbordarla', () => {
  assert.match(home, /\.quick-access-card > span\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*300px;/);
  assert.match(home, /\.quick-access-card strong\s*\{[^}]*overflow-wrap:\s*anywhere;/);
  assert.match(home, /\.quick-access-card small\s*\{[^}]*overflow-wrap:\s*anywhere;/);
});

test('la foto gana presencia sin perder la variante compacta móvil', () => {
  assert.match(home, /\.quick-access-card img, \.quick-access-icon\s*\{[^}]*width:\s*78px;[^}]*height:\s*78px;/);
  assert.match(home, /@media \(max-width:\s*560px\)[\s\S]*?\.quick-access-card\s*\{[^}]*grid-template-columns:\s*68px fit-content\(240px\);/);
  assert.match(home, /@media \(max-width:\s*560px\)[\s\S]*?\.quick-access-card img, \.quick-access-icon\s*\{[^}]*width:\s*68px;[^}]*height:\s*68px;/);
});
