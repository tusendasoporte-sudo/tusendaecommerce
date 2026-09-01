import assert from 'node:assert/strict';
import test from 'node:test';

import { resolvePublicMediaBaseUrl } from '../src/lib/publicMediaUrl.ts';

test('usa el CDN publico cuando esta configurado', () => {
  assert.equal(
    resolvePublicMediaBaseUrl('https://media.tusenda84.com/', 'https://api.tusenda84.com'),
    'https://media.tusenda84.com',
  );
});

test('conserva PocketBase como fallback local y de desarrollo', () => {
  assert.equal(
    resolvePublicMediaBaseUrl('', 'http://127.0.0.1:8091/'),
    'http://127.0.0.1:8091',
  );
});

test('rechaza un CDN con credenciales, rutas o protocolos no web', () => {
  for (const invalid of [
    'https://user:password@media.tusenda84.com',
    'https://media.tusenda84.com/private',
    'https://media.tusenda84.com?next=otro.example',
    'ftp://media.tusenda84.com',
    'no-es-una-url',
  ]) {
    assert.equal(resolvePublicMediaBaseUrl(invalid, 'https://api.tusenda84.com'), '', invalid);
  }
});
