import assert from 'node:assert/strict';
import test from 'node:test';

import {
  storefrontFirebaseProjectForPush,
  storefrontFirebaseProjects,
} from '../src/lib/storefrontFirebaseProjects.ts';

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  try { return callback(); }
  finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
}

const registry = () => JSON.stringify([
  {
    project_id: 'tu-senda-84-storefront-staging',
    project_number: '115337530324',
    app_ids: ['1:115337530324:android:8d3f78f8a93cdc1ea8e441'],
    credential_env: 'PZ_STOREFRONT_FIREBASE_CREDENTIAL_POWERZONA',
  },
  {
    project_id: 'tusenda84-tenant-c10',
    project_number: '215337530325',
    app_ids: ['1:215337530325:android:aaaaaaaaaaaaaaaa'],
    credential_env: 'PZ_STOREFRONT_FIREBASE_CREDENTIAL_TENANT_C10',
  },
]);

test('registro multi-proyecto conserva metadatos públicos y referencias a secretos por env', () => {
  withEnvironment({
    PZ_STOREFRONT_FIREBASE_PROJECTS_JSON: registry(),
    PZ_STOREFRONT_FIREBASE_PROJECT_ID: undefined,
    PZ_STOREFRONT_FIREBASE_SERVICE_ACCOUNT_JSON: undefined,
  }, () => {
    const projects = storefrontFirebaseProjects();
    assert.deepEqual(projects.map((item) => [item.projectId, item.projectNumber, item.credentialEnv]), [
      ['tu-senda-84-storefront-staging', '115337530324', 'PZ_STOREFRONT_FIREBASE_CREDENTIAL_POWERZONA'],
      ['tusenda84-tenant-c10', '215337530325', 'PZ_STOREFRONT_FIREBASE_CREDENTIAL_TENANT_C10'],
    ]);
    assert.equal(projects.every((item) => item.legacyServiceAccountJson === ''), true);
  });
});

test('rechaza proyectos o app IDs duplicados y campos secretos inline', () => {
  const duplicate = JSON.parse(registry());
  duplicate[1].app_ids = duplicate[0].app_ids;
  withEnvironment({ PZ_STOREFRONT_FIREBASE_PROJECTS_JSON: JSON.stringify(duplicate) }, () => {
    assert.throws(() => storefrontFirebaseProjects(), /firebase_registry_invalid/);
  });
  const inline = JSON.parse(registry());
  inline[0].service_account_json = '{"private_key":"forbidden"}';
  withEnvironment({ PZ_STOREFRONT_FIREBASE_PROJECTS_JSON: JSON.stringify(inline) }, () => {
    assert.throws(() => storefrontFirebaseProjects(), /firebase_registry_invalid/);
  });
});

test('fallback legacy permanece disponible para PowerZona sin registro nuevo', () => {
  withEnvironment({
    PZ_STOREFRONT_FIREBASE_PROJECTS_JSON: undefined,
    PZ_STOREFRONT_FIREBASE_PROJECT_ID: 'tu-senda-84-storefront-staging',
    PZ_STOREFRONT_FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"tu-senda-84-storefront-staging"}',
  }, () => {
    const [legacy] = storefrontFirebaseProjects();
    assert.equal(legacy.projectId, 'tu-senda-84-storefront-staging');
    assert.equal(legacy.projectNumber, '');
    assert.equal(legacy.appIds.length, 0);
  });
});

test('relay push acepta el proyecto explícito coincidente en modo Firebase legacy', () => {
  withEnvironment({
    PZ_STOREFRONT_FIREBASE_PROJECTS_JSON: undefined,
    PZ_STOREFRONT_FIREBASE_PROJECT_ID: 'tu-senda-84-storefront-staging',
    PZ_STOREFRONT_FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"tu-senda-84-storefront-staging"}',
  }, () => {
    const legacy = storefrontFirebaseProjectForPush(
      'tu-senda-84-storefront-staging',
      '1:115337530324:android:8d3f78f8a93cdc1ea8e441',
    );
    assert.equal(legacy.projectId, 'tu-senda-84-storefront-staging');
    assert.equal(legacy.appIds.length, 0);
    assert.throws(() => storefrontFirebaseProjectForPush(
      'otro-proyecto-storefront',
      '1:115337530324:android:8d3f78f8a93cdc1ea8e441',
    ), /firebase_project_not_allowed/);
  });
});
