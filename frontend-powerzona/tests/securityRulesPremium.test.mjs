import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('Seguridad: Reglas usa resumen premium y desplegables compactos', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');
  const rulesStart = view.indexOf("params.section === 'rules'");
  const rulesEnd = view.indexOf("params.section === 'customers'", rulesStart);
  const rules = view.slice(rulesStart, rulesEnd);

  assert.ok(rulesStart > -1);
  assert.ok(rulesEnd > rulesStart);
  assert.match(rules, /class="info-grid rules-layout"/);
  assert.match(rules, /class="capability-list rules-premium-list"/);
  assert.doesNotMatch(rules, /class="fact-grid"/);
  assert.match(rules, /<details class="monitoring-card rules-disclosure">[\s\S]*?Capacidades administrativas/);
  assert.match(rules, /<details class="monitoring-card rules-disclosure">[\s\S]*?Bloqueos privados/);
  assert.equal((rules.match(/<details class="monitoring-card rules-disclosure">/g) || []).length, 2);
});

test('Seguridad: control VPN conserva funcionalidad sin los dos carteles explicativos', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');
  const rulesStart = view.indexOf("params.section === 'rules'");
  const rulesEnd = view.indexOf("params.section === 'customers'", rulesStart);
  const rules = view.slice(rulesStart, rulesEnd);

  assert.match(rules, /class="customer-search rules-vpn-form"/);
  assert.match(rules, /name="security_action" value="vpn_policy_update"/);
  assert.match(rules, /name="vpn_policy" disabled=\{!actionsEnabled\}/);
  assert.match(rules, />Desactivada<\/option>/);
  assert.match(rules, />Solo detectar<\/option>/);
  assert.match(rules, />Detectar y bloquear<\/option>/);
  assert.match(rules, />Guardar politica<\/button>/);
  assert.doesNotMatch(rules, /Piloto gratuito con caché privada/);
  assert.doesNotMatch(rules, /La deteccion es probabilistica/);
});

test('Seguridad: la pestaña Resumen conserva su presentación existente', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');
  const summaryStart = view.indexOf("params.section === 'summary'");
  const summaryEnd = view.indexOf("params.section === 'rules'", summaryStart);
  const summary = view.slice(summaryStart, summaryEnd);

  assert.match(summary, /class="fact-grid"/);
  assert.match(summary, />Capacidades administradas</);
});
