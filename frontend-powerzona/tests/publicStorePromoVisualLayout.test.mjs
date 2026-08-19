import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const home = readFileSync(
  new URL('../src/components/public-store/PublicStoreHome.astro', import.meta.url),
  'utf8',
);

test('promo separa la foto izquierda del texto derecho sin superposición', () => {
  assert.match(home, /\.promo-visual-card\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 58%\) minmax\(0, 42%\);[\s\S]*?padding:\s*0;/);
  assert.match(home, /\.promo-visual-card\.has-image img\s*\{[^}]*position:\s*relative;[^}]*grid-column:\s*1;[^}]*grid-row:\s*1;/);
  assert.match(home, /\.promo-visual-copy\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;/);
  assert.doesNotMatch(home, /\.promo-visual-card img\s*\{[^}]*position:\s*absolute;/);
});

test('promo elimina la capa que colocaba contenido encima de la imagen', () => {
  assert.match(home, /\.promo-visual-card::after\s*\{[^}]*content:\s*none[^}]*display:\s*none/);
  assert.match(home, /class:list=\{\['promo-visual-card', item\.imageUrl \? 'has-image' : 'no-image'\]\}/);
});

test('en móvil la foto queda arriba y el texto debajo', () => {
  assert.match(home, /@media \(max-width:\s*560px\)[\s\S]*?\.promo-visual-card\.has-image\s*\{[^}]*grid-template-columns:\s*1fr;/);
  assert.match(home, /\.promo-visual-card\.has-image img\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*1;[^}]*aspect-ratio:\s*16 \/ 9;/);
  assert.match(home, /\.promo-visual-card\.has-image \.promo-visual-copy\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*2;/);
});
