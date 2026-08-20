import assert from 'node:assert/strict';
import test from 'node:test';

import { powerZonaStorefrontDefaults } from '../src/lib/storefrontAppDefaults.ts';

test('conserva los valores de staging cuando no hay configuración de entorno', () => {
  assert.deepEqual(powerZonaStorefrontDefaults({}), {
    appKey: 'powerzona-storefront-staging',
    firebaseProjectId: 'tu-senda-84-storefront-staging',
  });
});

test('permite separar la identidad PowerZona de producción mediante runtime', () => {
  assert.deepEqual(powerZonaStorefrontDefaults({
    PZ_POWERZONA_STOREFRONT_APP_KEY: 'powerzona-storefront-production',
    PZ_STOREFRONT_FIREBASE_PROJECT_ID: 'tu-senda-84-storefront-prod',
  }), {
    appKey: 'powerzona-storefront-production',
    firebaseProjectId: 'tu-senda-84-storefront-prod',
  });
});

test('falla cerrado ante identidades productivas inválidas', () => {
  assert.throws(() => powerZonaStorefrontDefaults({
    PZ_POWERZONA_STOREFRONT_APP_KEY: '../powerzona',
  }), /powerzona_app_key_invalid/);
  assert.throws(() => powerZonaStorefrontDefaults({
    PZ_STOREFRONT_FIREBASE_PROJECT_ID: 'Google_invalid',
  }), /powerzona_firebase_project_id_invalid/);
});
