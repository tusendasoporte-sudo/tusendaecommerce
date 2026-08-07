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
  assert.match(create, /review_devices: options\.reviewDevices === true/);
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
    assert.match(page, /section=blocked&notice=manual_ip_block_created/);
    assert.doesNotMatch(page, /console\.(?:log|info|warn)|checkOrigin\s*:\s*false/);
  }
});

test('MANUAL-IP: interfaz usa Pedidos y 24 horas, confirma dispositivo y no expone identificadores', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');
  assert.match(view, />Agregar bloqueo por IP</);
  assert.match(view, /name="manual_ip"/);
  assert.match(view, /value=\{value\} selected=\{value === 'orders'\}/);
  assert.match(view, /value=\{value\} selected=\{value === 'hours_24'\}/);
  assert.match(view, /name="review_devices" checked/);
  assert.match(view, /No se agregara al bloqueo hasta que lo confirmes/);
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
