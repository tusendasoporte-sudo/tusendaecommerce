import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  COMMERCIAL_PLAN_CATALOG_CONTRACT,
  commercialPlan,
  commercialStoreType,
  formatCommercialCup,
  getMasterCommercialPlanCatalog,
  normalizeCommercialPlanCatalog,
} from '../src/lib/commercialPlanCatalog.ts';

const require = createRequire(import.meta.url);
const backendCatalog = require('../../backend-powerzona/pb_hooks/pz_plan_catalog_lib.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const payload = () => ({ ok: true, ...backendCatalog.getCatalogDto() });

test('normaliza el contrato backend completo sin redefinir sus valores comerciales', () => {
  const catalog = normalizeCommercialPlanCatalog(payload());
  assert.ok(catalog);
  assert.equal(catalog.contract, COMMERCIAL_PLAN_CATALOG_CONTRACT);
  assert.equal(catalog.currency.code, 'CUP');
  assert.deepEqual(catalog.commercial_period_months, [1, 6, 12]);
  assert.equal(commercialStoreType(catalog, 'promo')?.name, 'Tienda Promocional');
  assert.equal(commercialStoreType(catalog, 'commerce')?.name, 'Tienda Ecommerce');
  assert.equal(commercialPlan(commercialStoreType(catalog, 'ecommerce'), 'free')?.capabilities.max_products, 100);
  assert.equal(commercialPlan(commercialStoreType(catalog, 'ecommerce'), 'basic')?.capabilities.max_products, 700);
  assert.equal(commercialPlan(commercialStoreType(catalog, 'ecommerce'), 'premium')?.capabilities.max_products, 1600);
  assert.deepEqual(
    ['free', 'basic', 'premium'].map((code) => commercialPlan(commercialStoreType(catalog, 'ecommerce'), code)?.capabilities.max_active_users),
    [1, 2, 4],
  );
  assert.deepEqual(
    ['free', 'basic', 'premium'].map((code) => commercialPlan(commercialStoreType(catalog, 'ecommerce'), code)?.capabilities.max_store_devices),
    [5, 10, 20],
  );
  assert.equal(commercialPlan(commercialStoreType(catalog, 'promotional'), 'free')?.capabilities.max_total_images, 150);
  assert.equal(commercialPlan(commercialStoreType(catalog, 'promotional'), 'basic')?.capabilities.max_total_images, 300);
  assert.equal(Object.isFrozen(catalog), true);
});

test('rechaza moneda, periodos, totales o política de Seguridad fuera del contrato v1', () => {
  const currency = structuredClone(payload());
  currency.currency.code = 'USD';
  assert.equal(normalizeCommercialPlanCatalog(currency), null);

  const periods = structuredClone(payload());
  periods.commercial_period_months = [1, 3, 12];
  assert.equal(normalizeCommercialPlanCatalog(periods), null);

  const total = structuredClone(payload());
  total.store_types[1].plans[1].pricing.periods[1].total_cup += 1;
  assert.equal(normalizeCommercialPlanCatalog(total), null);

  const security = structuredClone(payload());
  security.optional_capabilities[0].enabled_by_default = true;
  assert.equal(normalizeCommercialPlanCatalog(security), null);
});

test('cliente consulta GET privado, evita caché y valida la respuesta antes de exponerla', async () => {
  let request;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify(payload()), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const result = await getMasterCommercialPlanCatalog('https://pb.example.test/', 'master-token');
    assert.equal(result.available, true);
    assert.equal(request.url, 'https://pb.example.test/api/pz/master/plan-catalog');
    assert.equal(request.options.method, 'GET');
    assert.equal(request.options.cache, 'no-store');
    assert.equal(request.options.headers.Authorization, 'Bearer master-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('interfaces Master no contienen precios USD, periodos 1..12 ni cuotas Promo elegibles', () => {
  const files = [
    'src/components/master/MasterStorePlanView.astro',
    'src/components/master/MasterPromoStorePlanView.astro',
    'src/components/master/MasterStoreActionsController.astro',
  ].map(read);
  for (const source of files) {
    assert.doesNotMatch(source, /\$\d+\s*USD|Precio por definir|Array\.from\(\{ length: 12/);
    assert.match(source, /monthly_equivalent_cup|pricing\.periods/);
  }
  assert.doesNotMatch(files[2], /name="promo_image_limit"/);
  assert.match(files[0], /Opcional por tienda · solo Master · apagada por defecto/);
  assert.match(read('src/pages/master/stores/[storeId]/plan.astro'), /getMasterCommercialPlanCatalog/);
  assert.match(read('src/pages/master/stores/index.astro'), /showCreateStore=\{commercialCatalog\.available\}/);
  assert.match(formatCommercialCup(1400), /CUP$/);
});
