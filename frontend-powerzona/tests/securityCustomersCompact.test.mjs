import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('Seguridad: Clientes agrupa la informacion en cinco columnas compactas', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');
  const customersStart = view.indexOf("params.section === 'customers'");
  const customersEnd = view.indexOf("params.section === 'customers' && selectedCustomer", customersStart);
  const customers = view.slice(customersStart, customersEnd);

  assert.ok(customersStart > -1);
  assert.ok(customersEnd > customersStart);
  assert.match(customers, /role="columnheader">Cliente/);
  assert.match(customers, /role="columnheader">Pedidos y vinculos/);
  assert.match(customers, /role="columnheader">Actividad y compras/);
  assert.match(customers, /role="columnheader">Estado/);
  assert.match(customers, /role="columnheader">Acciones/);
  assert.doesNotMatch(customers, /role="columnheader">Telefono principal/);
  assert.doesNotMatch(customers, /role="columnheader">Total confirmado/);
  assert.match(customers, /customer-links-cell/);
  assert.match(customers, /customer-activity-cell/);
});

test('Seguridad: Ver ficha vive dentro del menu de tres puntos y sigue disponible en modo lectura', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');
  const triggerStart = view.indexOf('class="icon-action customer-menu-trigger"');
  const triggerEnd = view.indexOf('</button>', triggerStart);
  const trigger = view.slice(triggerStart, triggerEnd);

  assert.match(view, /data-customer-href=\{customerDetailHref/);
  assert.match(trigger, /data-actions-enabled=\{actionsEnabled \? 'true' : 'false'\}/);
  assert.match(trigger, /<span aria-hidden="true">⋮<\/span>/);
  assert.match(view, /data-customer-menu-view role="menuitem">Ver ficha<\/a>/);
  assert.match(view, /viewItem\.href = trigger\.dataset\.customerHref \|\| '#'/);
  assert.match(view, /lifecycleItem\.disabled = !canManageCustomer \|\| trigger\.dataset\.lifecycleDisabled === 'true'/);
  assert.doesNotMatch(trigger, /disabled=\{!actionsEnabled\}/);
});
