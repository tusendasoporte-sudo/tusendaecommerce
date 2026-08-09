import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const home = readFileSync(
  new URL('../src/components/public-store/PublicStoreHome.astro', import.meta.url),
  'utf8',
);

test('PUBLIC-HEADER: nombres largos no invaden el buscador', () => {
  assert.match(
    home,
    /\.public-store-brand\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden;/,
  );
  assert.match(
    home,
    /\.public-store-brand\s*>\s*div:last-child\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?flex:\s*1\s+1\s+auto;[\s\S]*?overflow:\s*hidden;/,
  );
  assert.match(
    home,
    /\.public-store-name\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*100%;/,
  );
  assert.match(home, /class="public-store-name"\s+title=\{storeName\}/);
});
