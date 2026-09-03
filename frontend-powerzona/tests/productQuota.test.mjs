import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PRODUCT_QUOTA_CATALOG_CONTRACT,
  normalizeProductQuota,
  productQuotaLabel,
  productQuotaMessage,
} from '../src/lib/productQuota.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function payload(plan, used, limit) {
  const remaining = Math.max(0, limit - used);
  const overBy = Math.max(0, used - limit);
  const state = used > limit
    ? 'over_limit'
    : used === limit
      ? 'limit_reached'
      : used >= Math.ceil(limit * 0.8)
        ? 'near_limit'
        : 'available';
  return {
    catalog_contract: PRODUCT_QUOTA_CATALOG_CONTRACT,
    store_type: 'ecommerce',
    plan,
    used,
    limit,
    remaining,
    over_by: overBy,
    percentage: Math.round((used / limit) * 10000) / 100,
    state,
    can_create: used < limit,
  };
}

test('normaliza consumo backend de Gratis, Básico y Premium sin redefinir límites', () => {
  for (const [plan, limit] of [['free', 100], ['basic', 700], ['premium', 1600]]) {
    const quota = normalizeProductQuota(payload(plan, limit - 1, limit));
    assert.ok(quota);
    assert.equal(quota.limit, limit);
    assert.equal(quota.can_create, true);
  }
  assert.equal(productQuotaLabel(normalizeProductQuota(payload('basic', 643, 700))), '643 de 700 productos');
});

test('rechaza contratos, aritmética o permiso de creación manipulados', () => {
  const contract = payload('free', 10, 100);
  contract.catalog_contract = 'parallel-plan-source.v1';
  assert.equal(normalizeProductQuota(contract), null);

  const remaining = payload('free', 10, 100);
  remaining.remaining = 100;
  assert.equal(normalizeProductQuota(remaining), null);

  const percentage = payload('free', 10, 100);
  percentage.percentage = 99;
  assert.equal(normalizeProductQuota(percentage), null);

  const create = payload('free', 100, 100);
  create.can_create = true;
  assert.equal(normalizeProductQuota(create), null);
});

test('explica cercanía, límite, downgrade y fallo cerrado sin bloquear ediciones', () => {
  assert.match(productQuotaMessage(normalizeProductQuota(payload('free', 80, 100))), /Quedan 20/);
  assert.match(productQuotaMessage(normalizeProductQuota(payload('free', 100, 100))), /ediciones existentes siguen disponibles/);
  assert.match(productQuotaMessage(normalizeProductQuota(payload('free', 101, 100))), /No se modificó el catálogo existente/);
  const unavailable = normalizeProductQuota({
    catalog_contract: PRODUCT_QUOTA_CATALOG_CONTRACT,
    store_type: 'ecommerce',
    plan: null,
    used: 0,
    limit: null,
    remaining: null,
    over_by: null,
    percentage: null,
    state: 'unavailable',
    can_create: false,
  });
  assert.match(productQuotaMessage(unavailable), /creaciones permanecen bloqueadas/);
  assert.match(productQuotaMessage(unavailable), /existentes se pueden editar/);
});

test('panel propietario consume la cuota del bootstrap y sólo bloquea nuevas altas', () => {
  const owner = read('src/pages/admin/products.astro');
  assert.match(owner, /applyProductQuota\(data\.product_quota\)/);
  assert.match(owner, /const quotaBlocksCreation = !isEditing && productQuotaApplies && productQuota\?\.can_create !== true/);
  assert.match(owner, /productSaveBtn\.disabled = isSavingProduct \|\| quotaBlocksCreation/);
  assert.match(owner, /isEditing \? canMutateExistingProduct\(\) : CAN_CREATE_PRODUCTS && !quotaBlocksCreation/);
  assert.match(owner, /productQuotaApplies = value !== null/);
  assert.match(owner, /643 de 700 productos|productQuotaLabel/);
});

test('Plan y productos Master exigen y presentan el contrato backend', () => {
  const planClient = read('src/lib/masterStorePlans.ts');
  const productsClient = read('src/lib/masterStoreProducts.ts');
  const planView = read('src/components/master/MasterStorePlanView.astro');
  const productsView = read('src/components/master/MasterStoreProductsView.astro');
  for (const source of [planClient, productsClient]) {
    assert.match(source, /normalizeProductQuota/);
    assert.match(source, /product_quota/);
  }
  assert.match(planView, /productQuotaLabel\(productQuota\)/);
  assert.match(planView, /near_limit/);
  assert.match(productsView, /productQuotaMessage\(productQuota\)/);
  assert.match(productsView, /is-\$\{productQuota\.state\}/);
});
