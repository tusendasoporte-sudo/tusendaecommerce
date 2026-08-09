import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('MANUAL-IP: cliente SSR envia solo el contrato administrativo estricto', () => {
  const source = read('../src/lib/securityMonitoring.ts');
  const createStart = source.indexOf('export async function runSecurityManualIpBlockCreate');
  const reviewStart = source.indexOf('export async function runSecurityBlockDeviceCandidateAction');
  const revokeStart = source.indexOf('export async function runSecurityBlockRevoke');
  assert.ok(createStart > 0 && reviewStart > createStart && revokeStart > reviewStart);

  const create = source.slice(createStart, reviewStart);
  assert.match(create, /action: 'create_manual_ip'/);
  assert.match(create, /ip: String\(options\.ip/);
  assert.match(create, /visitor_session_id: String\(options\.visitorSessionId/);
  assert.match(create, /ip_source_ids: Array\.from\(new Set\(options\.ipSourceIds/);
  assert.match(create, /device_session_ids: Array\.from\(new Set\(options\.deviceSessionIds/);
  assert.match(create, /\/api\/pz\/security\/manual-ip-devices/);
  assert.match(create, /\.filter\(\(candidate: any\) => isValidRecordId\(candidate\?\.session_id\)\)/);
  assert.doesNotMatch(create, /review_devices/);
  assert.doesNotMatch(create, /cookie|hmac|cipher|x-forwarded/i);

  const review = source.slice(reviewStart, revokeStart);
  assert.match(review, /confirm_device_candidate/);
  assert.match(review, /dismiss_device_candidate/);
  assert.match(review, /candidate_id: candidateId/);
  assert.doesNotMatch(review, /device_hmac|browser_token|cookie/i);
});

test('MANUAL-IP: tienda y Master procesan crear, confirmar y descartar con redireccion privada', () => {
  for (const relative of [
    '../src/pages/t/[storeSlug]/admin/security.astro',
    '../src/pages/master/security/[storeId].astro',
  ]) {
    const page = read(relative);
    assert.match(page, /manual_ip_block_create/);
    assert.match(page, /runSecurityManualIpBlockCreate/);
    assert.match(page, /block_device_candidate_review/);
    assert.match(page, /runSecurityBlockDeviceCandidateAction/);
    assert.match(page, /getAll\('manual_ip_source_ids'\)/);
    assert.match(page, /section=blocked&notice=manual_ip_block_created/);
    assert.doesNotMatch(page, /console\.(?:log|info|warn)|checkOrigin\s*:\s*false/);
  }
});

test('MANUAL-IP: interfaz previsualiza y selecciona dispositivos sin exponer identificadores protegidos', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');
  assert.match(view, />Agregar bloqueo por IP</);
  assert.match(view, /name="manual_ip"/);
  assert.match(view, /selected=\{value === \(manualIpDraft\?\.scope \|\| 'orders'\)\}/);
  assert.match(view, /selected=\{value === \(manualIpDraft\?\.duration \|\| 'hours_24'\)\}/);
  assert.match(view, /manual_ip_device_preview/);
  assert.match(view, /name="manual_ip_source_ids"/);
  assert.match(view, /name="manual_device_session_ids"/);
  assert.match(view, /data-manual-ip-select-all/);
  assert.match(view, />Seleccionar todas</);
  assert.match(view, />Seleccionar todos</);
  assert.match(view, /Las IP nuevas que aparezcan despues no se agregaran automaticamente y deberan revisarse por separado/);
  assert.match(view, /Ningun bloqueo se creara en este paso/);
  assert.match(view, /Buscar dispositivos/);
  assert.match(view, /Crear bloqueo/);
  assert.match(view, />Agregar al bloqueo</);
  assert.match(view, />Descartar</);
  assert.doesNotMatch(view, /device_hmac|ip_hmac|manual_ip_encrypted|reason_internal/);
});

test('MANUAL-IP: security.checkOrigin permanece activo', () => {
  const config = read('../astro.config.mjs');
  assert.match(config, /checkOrigin:\s*true/);
  assert.doesNotMatch(config, /checkOrigin:\s*false/);
});

test('MANUAL-IP: tienda y Master conservan Origin en formularios internos', () => {
  for (const relative of [
    '../src/pages/t/[storeSlug]/admin/security.astro',
    '../src/pages/master/security/[storeId].astro',
  ]) {
    const page = read(relative);
    assert.match(page, /Referrer-Policy', 'same-origin'/);
    assert.doesNotMatch(page, /Referrer-Policy', 'no-referrer'/);
  }
});

test('MANUAL-IP: el bloqueo modal conserva el submitter durante el POST nativo', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');
  const submitStart = view.indexOf("document.addEventListener('submit'");
  const submitEnd = view.indexOf('</script>', submitStart);
  assert.ok(submitStart > 0 && submitEnd > submitStart);

  const submitHandler = view.slice(submitStart, submitEnd);
  assert.match(submitHandler, /form\.dataset\.submitting = 'true'/);
  assert.match(submitHandler, /setAttribute\('aria-disabled', 'true'\)/);
  assert.match(submitHandler, /setAttribute\('aria-busy', 'true'\)/);
  assert.doesNotMatch(submitHandler, /button\.disabled\s*=\s*true/);
  assert.doesNotMatch(submitHandler, /submitter\.disabled\s*=\s*true/);
});
