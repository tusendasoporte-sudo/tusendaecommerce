import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/pages/admin/store-settings.astro', import.meta.url),
  'utf8',
);

const notificationFieldIds = [
  'settings-notifications-enabled',
  'settings-notify-new-order',
  'settings-notify-pending-order',
  'settings-notify-review-pending',
  'settings-pending-order-hours',
  'settings-notification-priority-enabled',
  'settings-notification-priority-important-min',
  'settings-notification-priority-critical-min',
  'settings-notification-show-order-subtotal',
  'settings-notification-bell-priority-colors',
  'settings-notify-expiration-alerts',
  'settings-notify-low-stock',
  'settings-low-stock-threshold',
  'settings-notify-out-of-stock',
  'settings-notification-cleanup-enabled',
  'settings-notification-cleanup-days',
];

test('las notificaciones se organizan en cuatro grupos compactos y plegables', () => {
  const groups = source.match(/<details class="notification-settings-group /g) || [];
  assert.equal(groups.length, 4);
  assert.match(source, /<strong>Pedidos y rese&ntilde;as<\/strong>/);
  assert.match(source, /<strong>Prioridad de pedidos<\/strong>/);
  assert.match(source, /<strong>Inventario y vencimientos<\/strong>/);
  assert.match(source, /<strong>Limpieza autom&aacute;tica<\/strong>/);
  assert.match(source, /id="notification-orders-summary"/);
  assert.match(source, /id="notification-priority-summary"/);
  assert.match(source, /id="notification-inventory-summary"/);
  assert.match(source, /id="notification-cleanup-summary"/);
});

test('la reorganizacion conserva los controles y el mismo payload de guardado', () => {
  notificationFieldIds.forEach((id) => {
    assert.equal((source.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
  });

  assert.match(source, /data\.append\('notifications_enabled', fields\.notificationsEnabled\?\.checked !== false\)/);
  assert.match(source, /data\.append\('notify_pending_order', fields\.notifyPendingOrder\?\.checked !== false\)/);
  assert.match(source, /data\.append\('notification_priority_enabled', fields\.notificationPriorityEnabled\?\.checked !== false\)/);
  assert.match(source, /data\.append\('notify_low_stock', fields\.notifyLowStock\?\.checked !== false\)/);
  assert.match(source, /data\.append\('notification_cleanup_enabled', fields\.notificationCleanupEnabled\?\.checked !== false\)/);
});

test('los campos dependientes se ocultan sin borrar ni deshabilitar sus valores', () => {
  assert.match(source, /function syncNotificationSettingsUi\(\)/);
  assert.match(source, /pendingOrderHoursField\.hidden = !pendingOrdersEnabled/);
  assert.match(source, /priorityFields\.hidden = !priorityEnabled/);
  assert.match(source, /lowStockThresholdField\.hidden = !lowStockEnabled/);
  assert.match(source, /cleanupDaysField\.hidden = !cleanupEnabled/);
  assert.doesNotMatch(source, /pendingOrderHoursField\.disabled/);
  assert.doesNotMatch(source, /priorityFields\.disabled/);
  assert.doesNotMatch(source, /lowStockThresholdField\.disabled/);
  assert.doesNotMatch(source, /cleanupDaysField\.disabled/);
});
