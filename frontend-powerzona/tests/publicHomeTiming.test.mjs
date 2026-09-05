import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { appendPublicHomeTiming, isPublicStoreHome, measurePublicHome, publicHomeTimingHeader } from '../src/lib/publicHomeTiming.ts';
import { optimizePublicCatalogResponse } from '../src/lib/publicCatalogResponse.ts';

const encode = text => new TextEncoder().encode(text);
test('mediciones de portada no incluyen admin, checkout, API ni otras rutas', () => {
  for (const path of ['/t/powerzona', '/t/otra/']) assert.equal(isPublicStoreHome(path), true);
  for (const path of ['/', '/t/a/admin', '/t/a/checkout', '/api/t/a', '/t/a/producto/b']) assert.equal(isPublicStoreHome(path), false);
});

test('medir conserva valores, errores y aislamiento por solicitud', async () => {
  const a = {}, b = {}, object = { price: 20 };
  assert.equal(await measurePublicHome(a, 'products', () => object), object);
  assert.equal(await measurePublicHome(undefined, 'products', () => object), object);
  const failure = new Error('original');
  await assert.rejects(measurePublicHome(a, 'settings', () => { throw failure; }), e => e === failure);
  await measurePublicHome(b, 'store', () => 1);
  assert.deepEqual(Object.keys(a).sort(), ['products', 'settings']);
  assert.deepEqual(Object.keys(b), ['store']);
  assert.ok(a.products >= 0 && a.settings >= 0);
});

test('solo nombres autorizados y duraciones finitas llegan a cabeceras', () => {
  assert.equal(publicHomeTimingHeader({ store: -10, settings: NaN, route: Infinity, data: 12.34, cookie: 'secret', 'bad\r\nheader': 20 }), 'pz-home-store;dur=0.0, pz-home-data;dur=12.3');
});

test('primera porcion incluye trabajo tardio sin esperar todo el HTML', async () => {
  const timing = {};
  let source;
  const stream = new ReadableStream({start(controller) { source = controller; }});
  const original = new Response(stream, {headers: {'Content-Type': 'text/html', 'Server-Timing': 'existing;dur=1', 'Cache-Control': 'private', 'Set-Cookie': 'locale=es'}});
  const measuring = appendPublicHomeTiming(original, timing, performance.now());
  await measurePublicHome(timing, 'settings', async () => { await Promise.resolve(); });
  source.enqueue(encode('<html>'));
  const response = await measuring;
  assert.match(response.headers.get('Server-Timing'), /existing;dur=1.*pz-home-settings.*pz-home-first-chunk/);
  assert.equal(response.headers.get('Cache-Control'), 'private');
  assert.equal(response.headers.get('Set-Cookie'), 'locale=es');
  source.enqueue(encode('original</html>'));
  source.close();
  assert.equal(await response.text(), '<html>original</html>');
});

test('cuerpo vacio, codificacion y gzip conservan bytes', async () => {
  for (const html of ['', '<html>Ñ 😀 &amp; —</html>']) {
    const response = await appendPublicHomeTiming(new Response(html, {headers:{'Content-Type':'text/html'}}), {}, performance.now());
    const optimized = optimizePublicCatalogResponse(new Request('https://x.test/t/a', {headers:{'Accept-Encoding':'gzip'}}), response, '/t/a');
    assert.equal(gunzipSync(Buffer.from(await optimized.arrayBuffer())).toString(), html);
  }
});

test('HEAD, redirecciones, errores y contenido no HTML no consumen el cuerpo', async () => {
  for (const [method,status,type] of [['HEAD',200,'text/html'], ['GET',307,'text/html'], ['GET',503,'text/html'], ['GET',200,'application/json']]) {
    const response = new Response('original', {status,headers:{'Content-Type':type}});
    assert.equal(await appendPublicHomeTiming(response, {}, performance.now(), method), response);
    assert.equal(response.bodyUsed, false);
    assert.equal(await response.text(), 'original');
  }
  const noBody = new Response(null, {status:204});
  assert.equal(await appendPublicHomeTiming(noBody, {}, performance.now()), noBody);
});

test('cancelacion se propaga al stream original', async () => {
  let reason;
  const stream = new ReadableStream({start(c){c.enqueue(encode('prefix'));},cancel(value){reason=value;}});
  const response = await appendPublicHomeTiming(new Response(stream,{headers:{'Content-Type':'text/html'}}),{},performance.now());
  await response.body.cancel('client disconnected');
  assert.equal(reason, 'client disconnected');
});

test('errores tempranos y tardios del stream siguen siendo errores', async () => {
  const error = new Error('stream failure');
  const early = new ReadableStream({start(c){c.error(error);}});
  await assert.rejects(appendPublicHomeTiming(new Response(early,{headers:{'Content-Type':'text/html'}}),{},performance.now()), e=>e===error);
  let source;
  const late = new ReadableStream({start(c){source=c;c.enqueue(encode('prefix'));}});
  const response = await appendPublicHomeTiming(new Response(late,{headers:{'Content-Type':'text/html'}}),{},performance.now());
  source.error(error);
  await assert.rejects(response.text(), e=>e===error);
});

test('integracion conserva el control de acceso antes de observar y comprimir', () => {
  const middleware=readFileSync(new URL('../src/middleware.ts',import.meta.url),'utf8');
  assert.match(middleware,/publicAccessDecision[\s\S]*if \(!decision.allowed\)[\s\S]*const homeTiming[\s\S]*await next\(\)[\s\S]*appendPublicHomeTiming[\s\S]*optimizePublicCatalogResponse/);
  const home=readFileSync(new URL('../src/components/public-store/PublicStoreHome.astro',import.meta.url),'utf8');
  assert.match(home,/await Promise.all/);
  assert.match(home,/isTemporarilyClosed \? Promise.resolve\(\[\]\) : measurePublicHome/);
  const timing=readFileSync(new URL('../src/lib/publicHomeTiming.ts',import.meta.url),'utf8');
  assert.doesNotMatch(timing,/console\.|localStorage|PZ_POCKETBASE_INTERNAL_URL/);
});
