import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('ADDRESS-ALERT: cliente SSR envia solamente IDs de pedidos seleccionados', () => {
  const source = read('../src/lib/securityMonitoring.ts');
  const start = source.indexOf('export async function runSecurityBlockCreate');
  const end = source.indexOf('export async function runSecurityManualIpBlockCreate', start);
  const contract = source.slice(start, end);
  assert.match(contract, /addressOrderIds: string\[\]/);
  assert.match(contract, /address_order_ids: Array\.from\(new Set\(options\.addressOrderIds/);
  assert.match(contract, /\.filter\(isValidRecordId\)\.slice\(0, 50\)/);
  assert.doesNotMatch(contract, /address_hmac|fingerprint|customer_address|municipality/i);
});

test('ADDRESS-ALERT: tienda y Master recopilan una, varias o todas las direcciones del formulario', () => {
  for (const relative of [
    '../src/pages/t/[storeSlug]/admin/security.astro',
    '../src/pages/master/security/[storeId].astro',
  ]) {
    const page = read(relative);
    assert.match(page, /addressOrderIds: formData\.getAll\('block_address_order_ids'\)\.map\(String\)/);
    assert.match(page, /addressCandidates = customerDetail\.addressCandidates/);
    assert.match(page, /addressCandidates=\{addressCandidates\}/);
    assert.doesNotMatch(page, /address_hmac|delivery_address_exact_v1/);
  }
});

test('ADDRESS-ALERT: modal permite seleccionar direcciones y aclara que solo genera alertas', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');
  assert.match(view, />Direcciones para alertas</);
  assert.match(view, /name="block_address_order_ids"/);
  assert.match(view, /checked=\{candidate\.preselected\}/);
  assert.match(view, /data-address-select-all/);
  assert.match(view, />Seleccionar todas</);
  assert.match(view, /Selecciona al menos una direccion para la alerta/);
  assert.match(view, /no bloquean ni cancelan automaticamente/);
  assert.match(view, /el pedido entrara normalmente y Seguridad avisara/);
  assert.doesNotMatch(view, /address_hmac|delivery_address_exact_v1/);
});

test('ADDRESS-ALERT: registro de identidad evalua la coincidencia despues de crear el pedido', () => {
  const identity = read('../../backend-powerzona/pb_hooks/pz_security_identity_lib.js');
  const registerStart = identity.indexOf('function registerOrderSecurityIdentity');
  const registerEnd = identity.indexOf('function relinkOrderToPhoneCustomer', registerStart);
  const register = identity.slice(registerStart, registerEnd);
  assert.match(register, /createOrderCreatedEventIfMissing[\s\S]*?recordBlockedAddressMatchForOrder/);
  assert.match(register, /txOrder,[\s\S]*?customer,[\s\S]*?txSettings,[\s\S]*?secret/);
});

test('ADDRESS-ALERT: actividad y campana administrativa reconocen la nueva alerta', () => {
  const monitoring = read('../src/lib/securityMonitoring.ts');
  const sidebar = read('../src/components/admin/AdminSidebar.astro');
  assert.match(monitoring, /blocked_address_match: 'Dirección vinculada a bloqueo'/);
  assert.match(sidebar, /security_address_match/);
  assert.match(sidebar, /Dirección vinculada a un cliente bloqueado/);
  assert.match(sidebar, /Un pedido necesita revisión de Seguridad/);
});

test('ADDRESS-ALERT: salud exige el contrato y checkOrigin permanece activo', () => {
  const health = read('../../backend-powerzona/pb_hooks/pz_security_health_lib.js');
  const config = read('../astro.config.mjs');
  assert.match(health, /store_security_block_addresses/);
  assert.match(health, /address_alerts_ready/);
  assert.match(config, /checkOrigin:\s*true/);
  assert.doesNotMatch(config, /checkOrigin:\s*false/);
});
