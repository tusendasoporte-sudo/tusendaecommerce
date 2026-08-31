import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  formatStorefrontAppDownloadSize,
  parseStorefrontAppDownloadMetadata,
  storefrontAppDownloadAliasUrl,
  storefrontAppDownloadMetadataUrl,
} from '../src/lib/storefrontAppDownload.ts';

test('enlace humano dirige al alias público de la tienda', () => {
  assert.equal(
    storefrontAppDownloadAliasUrl('https://api.tusenda84.com/', 'PowerZona'),
    'https://api.tusenda84.com/api/pz/storefront-app-downloads/by-store/powerzona',
  );
  assert.equal(
    storefrontAppDownloadMetadataUrl('https://api.tusenda84.com/', 'PowerZona'),
    'https://api.tusenda84.com/api/pz/storefront-app-downloads/by-store/powerzona/metadata',
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

test('metadatos públicos se validan y el tamaño se presenta sin hash', () => {
  assert.deepEqual(parseStorefrontAppDownloadMetadata({
    ok: true,
    app: { display_name: 'Power Zona' },
    artifact: { bytes: 15728640, file_name: 'powerzona-0.2.11-21-direct.apk', version_code: 21, version_name: '0.2.11' },
  }), {
    displayName: 'Power Zona', bytes: 15728640,
    versionCode: 21, versionName: '0.2.11',
  });
  assert.equal(formatStorefrontAppDownloadSize(15728640), '15 MB');
  assert.equal(parseStorefrontAppDownloadMetadata({ ok: true, app: {}, artifact: {} }), null);
});

test('enlace principal presenta la app y la descarga conserva el alias dinámico', () => {
  const page = readFileSync(new URL('../src/pages/app/[storeSlug].astro', import.meta.url), 'utf8');
  const download = readFileSync(new URL('../src/pages/app/[storeSlug]/descargar.ts', import.meta.url), 'utf8');
  assert.match(page, /Descargar APK/);
  assert.match(page, /Versión/);
  assert.match(page, /Tamaño/);
  assert.match(page, /powerzona-app-preview-android\.png/);
  assert.match(page, /storefrontAppDownloadMetadataUrl/);
  assert.match(page, /cache:\s*'no-store'/);
  assert.match(page, /Cache-Control', 'no-store, max-age=0, must-revalidate'/);
  assert.match(page, /Pragma', 'no-cache'/);
  assert.doesNotMatch(page, /SHA-?256|\bsha\b/i);
  assert.match(download, /status:\s*307/);
  assert.match(download, /publicPocketBaseUrl\(\)/);
  assert.match(download, /Cache-Control[^\n]+no-store/);
  assert.doesNotMatch(download, /0\.2\.11|version_code/);
});
