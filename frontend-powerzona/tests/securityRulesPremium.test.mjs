import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('Seguridad: Reglas reutiliza el resumen compacto del catálogo y conserva desplegables', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');
  const rulesStart = view.indexOf("params.section === 'rules'");
  const rulesEnd = view.indexOf("params.section === 'customers'", rulesStart);
  const rules = view.slice(rulesStart, rulesEnd);

  assert.ok(rulesStart > -1);
  assert.ok(rulesEnd > rulesStart);
  assert.match(rules, /class="info-grid rules-layout"/);
  assert.match(rules, /class="admin-compact-summary security-compact-summary rules-summary-card"/);
  assert.match(rules, /class="admin-compact-summary__head"/);
  assert.match(rules, /class="admin-compact-summary__list"/);
  assert.doesNotMatch(rules, /class="fact-grid"/);
  assert.match(rules, /<details class="admin-compact-summary security-compact-summary security-compact-disclosure">[\s\S]*?Capacidades administrativas/);
  assert.match(rules, /<details class="admin-compact-summary security-compact-summary security-compact-disclosure">[\s\S]*?Bloqueos privados/);
  assert.equal((rules.match(/<details class="admin-compact-summary security-compact-summary security-compact-disclosure">/g) || []).length, 2);
  assert.doesNotMatch(rules, /rules-premium-list|capability-row/);
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

test('Seguridad: Resumen usa el mismo sistema visual compacto de Productos', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');
  const summaryStart = view.indexOf("params.section === 'summary'");
  const summaryEnd = view.indexOf("params.section === 'rules'", summaryStart);
  const summary = view.slice(summaryStart, summaryEnd);

  assert.match(summary, /class="summary-layout"/);
  assert.match(summary, /class="admin-compact-summary security-compact-summary summary-general-card"/);
  assert.match(summary, /class="admin-compact-summary security-compact-summary summary-settings-card"/);
  assert.equal((summary.match(/class="admin-compact-summary__head/g) || []).length, 3);
  assert.match(summary, /admin-compact-summary__label">Visitantes hoy/);
  assert.match(summary, /admin-compact-summary__label">Visibilidad de IP/);
  assert.match(summary, /<details class="admin-compact-summary security-compact-summary security-compact-disclosure summary-capabilities-disclosure">[\s\S]*?Capacidades administrativas/);
  assert.doesNotMatch(summary, /class="metrics-grid"|class="metric-card"|class="fact-grid"|class="fact-box"/);
  assert.doesNotMatch(summary, /premium-summary-list|capability-row/);
  assert.doesNotMatch(summary, /La IP completa se muestra directamente/);
});

test('Seguridad: el estilo compacto global cubre tienda, Master y detalle de visitante', () => {
  const globalCss = read('../src/styles/global.css');

  assert.match(globalCss, /:is\(\.pz-admin-content, \.security-monitoring, \.visitor-detail, \.store-team-page\) \.admin-compact-summary \{/);
  assert.match(globalCss, /\.admin-compact-summary__head \{/);
  assert.match(globalCss, /\.admin-compact-summary__item \{/);
  assert.match(globalCss, /\.admin-compact-summary__item\.is-danger \.admin-compact-summary__value/);
});
