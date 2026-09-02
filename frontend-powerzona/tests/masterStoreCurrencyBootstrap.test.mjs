import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'src/lib/stores.ts'), 'utf8');

test('crear tienda usa el endpoint atómico y conserva el aprovisionamiento Commerce', () => {
  const start = source.indexOf('export async function createStoreFromMaster');
  const end = source.indexOf('export async function updateStoreFromMaster');
  const createSource = source.slice(start, end);
  assert.match(createSource, /\/api\/pz\/master\/stores\/create/);
  assert.match(createSource, /method: 'POST'/);
  assert.match(createSource, /body: payload/);
  assert.match(createSource, /store_type: storeType/);
  assert.match(createSource, /promo_plan: promoPlan/);
  assert.match(createSource, /promo_duration_months: promoDurationMonths/);
  assert.match(createSource, /promo_is_permanent: promoIsPermanent/);
  assert.match(createSource, /promo_image_limit: promoImageLimit/);
  assert.match(createSource, /promo_theme_id: promoThemeId/);
  assert.doesNotMatch(createSource, /collection\('stores'\)\.create/);
});

test('crear Tienda Promo permite escoger Gratis 30/150 o Básico configurable', () => {
  const controller = fs.readFileSync(path.join(ROOT, 'src/components/master/MasterStoreActionsController.astro'), 'utf8');
  assert.match(controller, /name="promo_plan"/);
  assert.match(controller, /Gratis — 30 días · 150 fotos/);
  assert.match(controller, /Básico — vigencia y fotos configurables/);
  assert.match(controller, /name="promo_duration_months"/);
  assert.match(controller, /name="promo_validity"/);
  assert.match(controller, /Permanente · sin vencimiento/);
  assert.match(controller, /name="promo_image_limit"/);
  assert.match(controller, /150 fotos/);
  assert.match(controller, /300 fotos/);
  assert.match(controller, /name="promo_theme_id"/);
  assert.match(controller, /Promo Black Gold/);
  assert.match(controller, /data-store-promo-only/);
  assert.match(controller, /promo_duration_months: promoDurationMonths/);
  assert.match(controller, /promo_is_permanent: promoIsPermanent/);
  assert.match(controller, /promo_image_limit: promoImageLimit/);
  assert.match(controller, /navigateToMasterStoreList\(1\)/);
  assert.match(controller, /if \(id\) window\.location\.reload\(\)/);
  assert.doesNotMatch(controller, /window\.location\.assign\(id \? window\.location\.href/);
});
