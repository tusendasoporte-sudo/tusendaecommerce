import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  mapStorefrontUpdatePolicyResponse,
  mapStorefrontUpdateTicketResponse,
  normalizeStorefrontUpdatePolicyPayload,
  normalizeStorefrontUpdateTicketPayload,
} from '../src/lib/storefrontPushContracts.ts';
import { POWERZONA_EXISTING_APP_BASELINE } from '../src/lib/storefrontAppDefaults.ts';

const ARTIFACT = Object.freeze({
  id: 'artifactupdate1',
  file_name: 'powerzona-0.2.9-11.apk',
  sha256: 'a'.repeat(64),
  bytes: 24_000_000,
  version_code: 11,
  version_name: '0.2.9',
  package_name: 'com.tusenda84.powerzona',
});

test('contratos de consulta y ticket no permiten elegir tienda ni versión ajena', () => {
  assert.deepEqual(normalizeStorefrontUpdatePolicyPayload({
    package_name: 'com.tusenda84.powerzona', version_code: 10, version_name: '0.2.8', install_source: 'direct',
  }), {
    package_name: 'com.tusenda84.powerzona', version_code: 10, version_name: '0.2.8', install_source: 'direct',
  });
  assert.equal(normalizeStorefrontUpdatePolicyPayload({
    package_name: 'com.tusenda84.powerzona', version_code: 10, version_name: '0.2.8', install_source: 'direct',
    store_id: 'anotherstore001',
  }), null);
  assert.deepEqual(normalizeStorefrontUpdateTicketPayload({ artifact_id: ARTIFACT.id }), { artifact_id: ARTIFACT.id });
  assert.equal(normalizeStorefrontUpdateTicketPayload({ artifact_id: ARTIFACT.id, reusable: true }), null);
});

test('política diferencia actualización opcional/obligatoria y Play/privada', () => {
  const privatePolicy = mapStorefrontUpdatePolicyResponse({
    ok: true,
    policy: {
      package_name: ARTIFACT.package_name,
      current_version_code: 10,
      current_version_name: '0.2.8',
      latest_version_code: 11,
      latest_version_name: '0.2.9',
      minimum_supported_version_code: 11,
      update_available: true,
      update_required: true,
      delivery_mode: 'private_apk',
      play_store_url: '',
      artifact: ARTIFACT,
    },
  });
  assert.equal(privatePolicy?.policy.update_required, true);
  assert.equal(privatePolicy?.policy.delivery_mode, 'private_apk');

  const playPolicy = mapStorefrontUpdatePolicyResponse({
    ok: true,
    policy: {
      ...privatePolicy.policy,
      update_required: false,
      minimum_supported_version_code: 0,
      delivery_mode: 'play_store',
      play_store_url: 'https://play.google.com/store/apps/details?id=com.tusenda84.powerzona',
    },
  });
  assert.equal(playPolicy?.policy.delivery_mode, 'play_store');
  assert.equal(mapStorefrontUpdatePolicyResponse({
    ok: true,
    policy: { ...privatePolicy.policy, artifact: null },
  }), null);
});

test('ticket queda ligado a un artefacto, vencimiento y URL HTTPS', () => {
  const ticket = 'Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE';
  assert.equal(ticket.length, 43);
  assert.equal(mapStorefrontUpdateTicketResponse({
    ok: true,
    ticket,
    expires_at: '2026-08-20T12:02:00.000Z',
    artifact: ARTIFACT,
    download_url: `https://tusenda84.com/api/pz/storefront-app-updates/${ARTIFACT.id}/${ticket}/${ARTIFACT.file_name}`,
  })?.artifact.id, ARTIFACT.id);
  assert.equal(mapStorefrontUpdateTicketResponse({
    ok: true,
    ticket,
    expires_at: 'invalid',
    artifact: ARTIFACT,
    download_url: 'http://tusenda84.com/update.apk',
  }), null);
});

test('adopción PowerZona conserva exactamente la identidad auditada y rutas privadas', () => {
  assert.deepEqual(POWERZONA_EXISTING_APP_BASELINE, {
    packageName: 'com.tusenda84.powerzona',
    versionCode: 10,
    versionName: '0.2.8',
    signingCertSha256: '12:5B:DC:CC:B5:53:0D:94:FC:7C:0C:E3:32:21:BE:78:52:96:0C:45:3E:D2:F0:47:46:29:82:FC:C5:4F:B3:72',
  });
  const view = readFileSync(new URL('../src/components/master/MasterStoreAppBuildView.astro', import.meta.url), 'utf8');
  const policyRoute = readFileSync(new URL('../src/pages/api/storefront/v1/updates/policy.ts', import.meta.url), 'utf8');
  const ticketRoute = readFileSync(new URL('../src/pages/api/storefront/v1/updates/ticket.ts', import.meta.url), 'utf8');
  assert.match(view, /ADOPTAR APP EXISTENTE/);
  assert.match(view, /PAUSAR ACTUALIZACION CLIENTES/);
  assert.match(view, /RETIRAR ACTUALIZACION CLIENTES/);
  assert.match(policyRoute, /credential: 'required'/);
  assert.match(ticketRoute, /credential: 'required'/);
});
