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

test('crear tiendas consume el catálogo y deriva plan, periodos, importes y cuota Promo', () => {
  const controller = fs.readFileSync(path.join(ROOT, 'src/components/master/MasterStoreActionsController.astro'), 'utf8');
  assert.match(controller, /CommercialPlanCatalog/);
  assert.match(controller, /storeTypes\.map/);
  assert.match(controller, /name="promo_plan"/);
  assert.match(controller, /plan\.pricing\.trial/);
  assert.match(controller, /plan\.pricing\.periods/);
  assert.match(controller, /monthly_equivalent_cup/);
  assert.match(controller, /total_cup/);
  assert.match(controller, /savings_cup/);
  assert.match(controller, /name="promo_duration_months"/);
  assert.match(controller, /name="promo_validity"/);
  assert.match(controller, /Permanente compatible · sin vencimiento/);
  assert.doesNotMatch(controller, /name="promo_image_limit"/);
  assert.match(controller, /promoDefinition\?\.imageLimit/);
  assert.match(controller, /name="promo_theme_id"/);
  assert.match(controller, /Promo Black Gold/);
  assert.match(controller, /data-store-promo-only/);
  assert.match(controller, /promo_duration_months: promoDurationMonths/);
  assert.match(controller, /promo_is_permanent: promoIsPermanent/);
  assert.match(controller, /promo_image_limit: promoImageLimit/);
  assert.match(controller, /navigateToMasterStoreList\(1\)/);
  assert.match(controller, /if \(id\) window\.location\.reload\(\)/);
  assert.doesNotMatch(controller, /Array\.from\(\{ length: 12/);
  assert.doesNotMatch(controller, /window\.location\.assign\(id \? window\.location\.href/);
});
