import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { storefrontAppDownloadAliasUrl } from '../src/lib/storefrontAppDownload.ts';

test('enlace humano dirige al alias público de la tienda', () => {
  assert.equal(
    storefrontAppDownloadAliasUrl('https://api.tusenda84.com/', 'PowerZona'),
    'https://api.tusenda84.com/api/pz/storefront-app-downloads/by-store/powerzona',
  );
});

test('enlace humano falla cerrado ante slug u origen inseguros', () => {
  for (const slug of ['', '../powerzona', 'power/zona', 'powerzona?next=evil.test', 'a'.repeat(81)]) {
    assert.equal(storefrontAppDownloadAliasUrl('https://api.tusenda84.com', slug), '', slug);
  }
  for (const origin of [
    '',
    'javascript:alert(1)',
    'https://user:password@api.tusenda84.com',
    'https://api.tusenda84.com/private',
    'https://api.tusenda84.com?next=evil.test',
  ]) {
    assert.equal(storefrontAppDownloadAliasUrl(origin, 'powerzona'), '', origin);
  }
});

test('ruta corta es temporal, no cacheable y no contiene una versión fija', () => {
  const source = readFileSync(new URL('../src/pages/app/[storeSlug].ts', import.meta.url), 'utf8');
  assert.match(source, /status:\s*307/);
  assert.match(source, /publicPocketBaseUrl\(\)/);
  assert.match(source, /Cache-Control[^\n]+no-store/);
  assert.doesNotMatch(source, /0\.2\.10|version_code|\.apk/);
});
