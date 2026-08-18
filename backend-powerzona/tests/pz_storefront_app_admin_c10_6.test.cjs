'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const admin = require('../pb_hooks/pz_storefront_app_admin_lib.js');

const BACKEND_DIR = path.resolve(__dirname, '..');
const WORKSPACE_DIR = path.resolve(BACKEND_DIR, '..');
const REMOVAL_SCRIPT = path.join(WORKSPACE_DIR, 'mobile-storefront', 'runner', 'remove-store-app-artifacts.ps1');
const POWERSHELL = process.platform === 'win32'
  ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  : 'pwsh';

function record(id, values) {
  return { id, get(key) { return values[key]; } };
}

test('contrato administrativo C10.6 es cerrado y exige confirmaciones escritas exactas', () => {
  const storeId = 'storec106test01';
  assert.deepEqual(admin.parseAdminActionPayload({
    store_id: storeId,
    action: 'delete_artifacts',
    confirmation: 'ELIMINAR ARTEFACTOS',
    reason: 'Retiro solicitado por Master',
  }), {
    storeId,
    action: 'delete_artifacts',
    confirmation: 'ELIMINAR ARTEFACTOS',
    reason: 'Retiro solicitado por Master',
  });
  assert.equal(admin.parseAdminActionPayload({
    store_id: storeId,
    action: 'delete_artifacts',
    confirmation: 'ELIMINAR ARTEFACTOS',
    reason: '',
    unexpected: true,
  }), null);
  assert.equal(admin.parseAdminActionPayload({
    store_id: storeId,
    action: 'delete_everything',
    confirmation: '',
    reason: '',
  }), null);

  const profile = record('profilec106t01', { package_name: 'com.tusenda84.tenant' });
  assert.equal(admin.expectedDeleteConfirmation(profile), 'ELIMINAR APP com.tusenda84.tenant');
  const digest = admin.hashConfirmation('ELIMINAR ARTEFACTOS', (value) => (
    createHash('sha256').update(value, 'utf8').digest('hex')
  ));
  assert.match(digest, /^[a-f0-9]{64}$/);
});

test('distribucion, ciclo Android y disponibilidad se calculan sin usar el estado de la tienda web', () => {
  const active = record('profilec106t01', {
    status: 'provisioned', distribution_status: 'active', lifecycle_status: 'active',
  });
  const withdrawn = record('profilec106t01', {
    status: 'provisioned', distribution_status: 'withdrawn', lifecycle_status: 'active',
    distribution_reason: 'plan_downgrade',
  });
  const scheduled = record('profilec106t01', {
    status: 'provisioned', distribution_status: 'withdrawn', lifecycle_status: 'deletion_scheduled',
    deletion_recover_until: '2026-09-16T12:00:00.000Z',
  });
  assert.equal(admin.profileAdminSnapshot(active).downloads_allowed, true);
  assert.equal(admin.profileAdminSnapshot(withdrawn).downloads_allowed, false);
  assert.equal(admin.profileAdminSnapshot(withdrawn).distribution_reason, 'plan_downgrade');
  assert.equal(admin.profileAdminSnapshot(scheduled, '2026-08-18T12:00:00.000Z').can_recover, true);
  assert.equal(admin.profileAdminSnapshot(scheduled, '2026-09-17T12:00:00.000Z').can_recover, false);
  assert.throws(() => admin.assertDistributionAvailable(withdrawn), /app_distribution_withdrawn/);
  assert.throws(() => admin.assertBuildAllowed(scheduled), /app_deletion_pending/);
});

test('completion del runner administrativo valida identidad, resultado e IDs sin duplicados', () => {
  assert.deepEqual(admin.parseRunnerCompletion({
    action_id: 'actionc106test1',
    runner_id: 'runner-c106',
    status: 'succeeded',
    failure_code: '',
    deleted_artifact_ids: ['artifactc106t01'],
  }), {
    actionId: 'actionc106test1',
    runnerId: 'runner-c106',
    status: 'succeeded',
    failureCode: '',
    deletedArtifactIds: ['artifactc106t01'],
  });
  assert.equal(admin.parseRunnerCompletion({
    action_id: 'actionc106test1',
    runner_id: 'runner-c106',
    status: 'succeeded',
    failure_code: '',
    deleted_artifact_ids: ['artifactc106t01', 'artifactc106t01'],
  }), null);
  assert.equal(admin.parseRunnerCompletion({
    action_id: 'actionc106test1',
    runner_id: 'runner-c106',
    status: 'needs_attention',
    failure_code: '',
    deleted_artifact_ids: [],
  }), null);
});

test('borrado fisico elimina solo un archivo exacto bajo releases y rechaza escapar de custodia', {
  skip: process.platform !== 'win32' && !fs.existsSync('/usr/bin/pwsh'),
}, () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-c106-removal-'));
  const releasesRoot = path.join(fixtureRoot, 'releases');
  const tenantRoot = path.join(releasesRoot, 'tenant-c106');
  const outsideRoot = path.join(fixtureRoot, 'outside');
  fs.mkdirSync(tenantRoot, { recursive: true });
  fs.mkdirSync(outsideRoot, { recursive: true });
  const payload = Buffer.from('apk-c10.6-fixture', 'utf8');
  const apkPath = path.join(tenantRoot, 'tenant-c106.apk');
  const outsidePath = path.join(outsideRoot, 'outside.apk');
  fs.writeFileSync(apkPath, payload);
  fs.writeFileSync(outsidePath, payload);
  const sha256 = createHash('sha256').update(payload).digest('hex');
  const actionPath = path.join(fixtureRoot, 'action.json');
  const command = [
    '$action = Get-Content -LiteralPath $env:PZ_C106_ACTION_FILE -Raw | ConvertFrom-Json',
    '& $env:PZ_C106_REMOVAL_SCRIPT -Action $action -ArtifactsRoot $env:PZ_C106_ARTIFACT_ROOT | ConvertTo-Json -Compress',
  ].join('; ');
  const run = (storageLocator) => {
    fs.writeFileSync(actionPath, JSON.stringify({
      id: 'actionc106test1',
      type: 'delete_artifacts',
      target: {
        schema_version: 1,
        artifacts: [{
          id: 'artifactc106t01', kind: 'apk', file_name: path.basename(storageLocator),
          storage_locator: storageLocator, sha256, bytes: payload.length,
        }],
      },
    }));
    return spawnSync(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      cwd: WORKSPACE_DIR,
      env: {
        ...process.env,
        PZ_C106_ACTION_FILE: actionPath,
        PZ_C106_REMOVAL_SCRIPT: REMOVAL_SCRIPT,
        PZ_C106_ARTIFACT_ROOT: releasesRoot,
      },
      encoding: 'utf8',
      windowsHide: true,
    });
  };

  try {
    const removed = run(apkPath);
    assert.equal(removed.status, 0, `${removed.stdout}\n${removed.stderr}`);
    assert.equal(fs.existsSync(apkPath), false);
    assert.equal(fs.existsSync(outsidePath), true);
    assert.match(removed.stdout, /artifactc106t01/);

    const rejected = run(outsidePath);
    assert.notEqual(rejected.status, 0);
    assert.match(`${rejected.stdout}\n${rejected.stderr}`, /artifact_path_outside_custody/);
    assert.equal(fs.existsSync(outsidePath), true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('integracion declara la tienda web independiente y la bajada llama solo al retiro Android', () => {
  const planSource = fs.readFileSync(path.join(BACKEND_DIR, 'pb_hooks', 'pz_store_plan_management_lib.js'), 'utf8');
  const adminSource = fs.readFileSync(path.join(BACKEND_DIR, 'pb_hooks', 'pz_storefront_app_admin_lib.js'), 'utf8');
  const buildsSource = fs.readFileSync(path.join(BACKEND_DIR, 'pb_hooks', 'pz_storefront_app_builds_lib.js'), 'utf8');
  const routesSource = fs.readFileSync(path.join(BACKEND_DIR, 'pb_hooks', 'pz_storefront_app_builds.pb.js'), 'utf8');
  assert.match(planSource, /withdrawForPlanDowngrade\([\s\S]*previous\.plan,[\s\S]*next\.plan/);
  assert.doesNotMatch(adminSource, /store\.set\(["']status["']/);
  assert.match(buildsSource, /web_store_independent: true/);
  assert.match(routesSource, /storefront-app-admin-actions\/claim[\s\S]*requireRunner/);
  assert.match(routesSource, /storefront-app-admin-actions\/complete[\s\S]*requireRunner/);
});
