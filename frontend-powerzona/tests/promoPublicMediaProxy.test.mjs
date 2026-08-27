import assert from 'node:assert/strict';
import test from 'node:test';

import {
  promoPublicLogoMediaPath,
  proxyPromoPublicMedia,
  resolvePromoPublicMedia,
} from '../src/lib/promoPublicMediaProxy.ts';

const digest = 'a'.repeat(64);
const params = Object.freeze({
  publicSlug: 'aladdins-carpet-stg',
  useKey: 'logo-business',
  digest,
  filename: 'w512.webp',
});

test('reconoce solamente la ruta pública reservada al logo WebP', () => {
  const path = `/api/pz/promo/public/v1/sites/aladdins-carpet-stg/media/logo-business/${digest}/w512.webp`;
  assert.deepEqual(promoPublicLogoMediaPath(path), params);
  assert.deepEqual(resolvePromoPublicMedia(params), { path, mime: 'image/webp' });
  assert.ok(resolvePromoPublicMedia({ ...params, useKey: 'logo-business-1z141z3' }));
  for (const invalid of [
    `/api/pz/promo/public/v1/sites/otra/media/hero-main/${digest}/w512.webp`,
    `/api/pz/promo/public/v1/sites/otra/media/qr-contact/${digest}/w512.webp`,
    `/api/pz/promo/public/v1/sites/otra/media/logo-business/${digest}/original.mp4`,
    `/api/pz/promo/public/v1/sites/../media/logo-business/${digest}/w512.webp`,
  ]) assert.equal(promoPublicLogoMediaPath(invalid), null);
});

test('reenvía el logo sin cookies ni credenciales y conserva solamente headers seguros', async () => {
  let receivedUrl = '';
  let receivedInit;
  const resolved = resolvePromoPublicMedia(params);
  assert.ok(resolved);
  const response = await proxyPromoPublicMedia(
    new Request('https://promo.example.test' + resolved.path, {
      headers: { Cookie: 'sensible=1', Authorization: 'Bearer sensible' },
    }),
    params,
    {
      baseUrl: 'http://pocketbase:8090',
      fetcher: async (url, init) => {
        receivedUrl = String(url);
        receivedInit = init;
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            'Content-Type': 'image/webp',
            'Content-Length': '3',
            'Set-Cookie': 'never=forward',
          },
        });
      },
    },
  );
  assert.equal(receivedUrl, `http://pocketbase:8090${resolved.path}`);
  assert.deepEqual(receivedInit.headers, { Accept: 'image/webp' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('content-length'), '3');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
});

test('falla cerrado ante rango, query, MIME inesperado o archivo inexistente', async () => {
  const resolved = resolvePromoPublicMedia(params);
  assert.ok(resolved);
  const notCalled = async () => { throw new Error('no debe llamarse'); };
  for (const request of [
    new Request('https://promo.example.test' + resolved.path + '?download=1'),
    new Request('https://promo.example.test' + resolved.path, { headers: { Range: 'bytes=0-99' } }),
  ]) {
    const response = await proxyPromoPublicMedia(request, params, {
      baseUrl: 'http://pocketbase:8090', fetcher: notCalled,
    });
    assert.equal(response.status, 404);
  }

  for (const upstream of [
    new Response(new Uint8Array([1]), { status: 200, headers: { 'Content-Type': 'text/html' } }),
    new Response(null, { status: 404, headers: { 'Content-Type': 'image/webp' } }),
  ]) {
    const response = await proxyPromoPublicMedia(new Request(
      'https://promo.example.test' + resolved.path,
    ), params, { baseUrl: 'http://pocketbase:8090', fetcher: async () => upstream });
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  }
});

test('HEAD valida el logo pero no devuelve cuerpo', async () => {
  const resolved = resolvePromoPublicMedia(params);
  assert.ok(resolved);
  const response = await proxyPromoPublicMedia(new Request(
    'https://promo.example.test' + resolved.path,
    { method: 'HEAD' },
  ), params, {
    baseUrl: 'http://pocketbase:8090',
    fetcher: async (_url, init) => {
      assert.equal(init.method, 'HEAD');
      return new Response(null, { status: 200, headers: { 'Content-Type': 'image/webp', 'Content-Length': '7' } });
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body, null);
  assert.equal(response.headers.get('content-length'), '7');
});
