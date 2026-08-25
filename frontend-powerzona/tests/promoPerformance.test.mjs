import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';

import {
  PROMO_PERFORMANCE_BUDGETS,
  promoRepresentationVariantKey,
  resetPromoRepresentationCacheForTests,
  selectPromoContentEncoding,
  servePromoPublicRepresentation,
} from '../src/lib/promoPerformance.ts';
import {
  applyPromoPublicHeaders,
  platformPromoPublicPath,
} from '../src/lib/promoPublicShell.ts';

const CACHE_KEY_A = 'a'.repeat(64);
const CACHE_KEY_B = 'b'.repeat(64);

function shellResult(cacheKey = CACHE_KEY_A, action = 'serve') {
  return {
    ok: true,
    contract: 'promo.public.shell.v1',
    route: { source: 'platform', action },
    profile: action === 'serve' ? {} : undefined,
    seo: action === 'serve' ? {} : undefined,
    response: { cacheKey, contentLanguage: 'es', setCookie: '', vary: '' },
  };
}

function htmlResponse() {
  return new Response(`<!doctype html><html><body>${'contenido-promo '.repeat(400)}</body></html>`, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

test('presupuestos ARC-ADR-010 quedan expresados en bytes y requests', () => {
  assert.deepEqual(PROMO_PERFORMANCE_BUDGETS, {
    htmlCompressedBytes: 80 * 1024,
    cssCompressedBytes: 50 * 1024,
    initialJavaScriptCompressedBytes: 75 * 1024,
    initialFontBytes: 160 * 1024,
    mobileHeroBytes: 300 * 1024,
    desktopHeroBytes: 450 * 1024,
    mobileInitialTransferBytes: 650 * 1024,
    desktopInitialTransferBytes: 900 * 1024,
    initialRequests: 20,
    eagerImages: 1,
    initialVideoBytes: 0,
  });
});

test('negociación de compresión respeta q y mantiene identity como fallback', () => {
  assert.equal(selectPromoContentEncoding('br, gzip;q=0.8'), 'br');
  assert.equal(selectPromoContentEncoding('gzip;q=1, br;q=0.2'), 'gzip');
  assert.equal(selectPromoContentEncoding('br;q=0, gzip;q=0'), 'identity');
  assert.equal(selectPromoContentEncoding(''), 'identity');
});

test('caché de origen separa encoding y generación, coalesce y valida ETag', async () => {
  resetPromoRepresentationCacheForTests();
  let renders = 0;
  const render = async () => { renders += 1; return htmlResponse(); };
  const brRequest = new Request('https://tusenda84.com/promo/demo-promo/es', {
    headers: { 'Accept-Encoding': 'br, gzip' },
  });
  const first = await servePromoPublicRepresentation(brRequest, shellResult(), render);
  assert.equal(first.headers.get('content-encoding'), 'br');
  assert.match(first.headers.get('cache-status') || '', /stored/);
  assert.match(first.headers.get('etag') || '', /^"pz-promo-[a-f0-9]{32}"$/);
  assert.match(brotliDecompressSync(Buffer.from(await first.arrayBuffer())).toString(), /contenido-promo/);

  const second = await servePromoPublicRepresentation(brRequest, shellResult(), render);
  assert.match(second.headers.get('cache-status') || '', /hit/);
  assert.equal(renders, 1);
  const conditional = await servePromoPublicRepresentation(new Request(brRequest.url, {
    headers: {
      'Accept-Encoding': 'br',
      'If-None-Match': second.headers.get('etag') || '',
    },
  }), shellResult(), render);
  assert.equal(conditional.status, 304);
  assert.equal(renders, 1);

  const gzip = await servePromoPublicRepresentation(new Request(brRequest.url, {
    headers: { 'Accept-Encoding': 'gzip' },
  }), shellResult(), render);
  assert.equal(gzip.headers.get('content-encoding'), 'gzip');
  assert.match(gunzipSync(Buffer.from(await gzip.arrayBuffer())).toString(), /contenido-promo/);
  assert.equal(renders, 2);

  const nextGeneration = await servePromoPublicRepresentation(brRequest, shellResult(CACHE_KEY_B), render);
  assert.match(nextGeneration.headers.get('cache-status') || '', /stored/);
  assert.equal(renders, 3);
  assert.notEqual(
    promoRepresentationVariantKey(shellResult(), 'br'),
    promoRepresentationVariantKey(shellResult(CACHE_KEY_B), 'br'),
  );
});

test('caché falla cerrada sin clave completa y headers no-store cubren estados no públicos', async () => {
  resetPromoRepresentationCacheForTests();
  let renders = 0;
  const request = new Request('https://tusenda84.com/promo/demo-promo/es', {
    headers: { 'Accept-Encoding': 'br' },
  });
  for (let index = 0; index < 2; index += 1) {
    const response = await servePromoPublicRepresentation(request, shellResult(''), async () => {
      renders += 1;
      return htmlResponse();
    });
    assert.match(response.headers.get('cache-status') || '', /cache-key-unavailable/);
  }
  assert.equal(renders, 2);

  const published = applyPromoPublicHeaders(htmlResponse(), shellResult());
  assert.equal(published.headers.get('cache-control'), 'private, no-cache, max-age=0, must-revalidate');
  const varyResult = shellResult();
  varyResult.response.vary = 'Host';
  const varied = htmlResponse();
  varied.headers.set('Vary', 'Accept-Encoding');
  applyPromoPublicHeaders(varied, varyResult);
  assert.equal(varied.headers.get('vary'), 'Accept-Encoding, Host');
  for (const result of [shellResult('', 'serve'), shellResult('', 'redirect'), undefined]) {
    const response = applyPromoPublicHeaders(htmlResponse(), result);
    assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  }
});

test('rutas de plataforma son exactas y el runtime conserva Analytics y políticas MEDIA/SEC', () => {
  assert.deepEqual(platformPromoPublicPath('/promo/demo-promo/es'), { publicSlug: 'demo-promo', locale: 'es' });
  assert.deepEqual(platformPromoPublicPath('/promo/demo-promo/'), { publicSlug: 'demo-promo', locale: undefined });
  assert.equal(platformPromoPublicPath('/promo/demo-promo/es/private'), null);

  const layout = readFileSync(new URL('../src/layouts/PromoPublicLayout.astro', import.meta.url), 'utf8');
  const hero = readFileSync(new URL('../src/components/promo-public/PromoHero.astro', import.meta.url), 'utf8');
  const media = readFileSync(new URL('../src/components/promo-public/PromoSectionMedia.astro', import.meta.url), 'utf8');
  const middleware = readFileSync(new URL('../src/middleware.ts', import.meta.url), 'utf8');
  const config = readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf8');
  for (const event of ['page_view', 'section_view', 'contact_activate', 'landing_qr_open']) {
    assert.match(layout, new RegExp(`['\"]${event}['\"]`));
  }
  assert.match(layout, /requestIdleCallback/);
  assert.match(layout, /keepalive: true/);
  assert.match(layout, /navigator\.doNotTrack/);
  assert.match(hero, /loading=\{media\.delivery\.loading\}/);
  assert.match(hero, /preload=\{media\.delivery\.preload\}/);
  assert.match(media, /loading=\{media\.delivery\.loading\}/);
  assert.match(media, /preload=\{media\.delivery\.preload\}/);
  assert.doesNotMatch(`${hero}\n${media}`, /autoplay(?:\s|=)/i);
  assert.match(middleware, /validatePromoFrontendRequest/);
  assert.match(middleware, /servePromoPublicRepresentation/);
  assert.match(middleware, /method !== 'GET'.*method !== 'HEAD'/);
  assert.match(config, /security:\s*\{\s*checkOrigin:\s*true/);
  assert.match(config, /PromoPublicShell.*\.css/);
  assert.match(config, /PromoPublicLayout.*\.js/);
});
