import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const feedback = read('../src/components/admin/AdminRefreshFeedback.astro');
const sidebar = read('../src/components/admin/AdminSidebar.astro');

test('el shell administrativo monta un feedback global accesible y temporal', () => {
  assert.match(sidebar, /import AdminRefreshFeedback/);
  assert.match(sidebar, /<AdminRefreshFeedback\s*\/>/);
  assert.match(feedback, /role="status"/);
  assert.match(feedback, /aria-live="polite"/);
  assert.match(feedback, /window\.PZAdminRefreshFeedback/);
  assert.match(feedback, /successMessage \|\| 'Datos actualizados'/);
  assert.match(feedback, /errorMessage \|\| 'No se pudieron actualizar los datos'/);
  assert.match(feedback, /tone === 'error' \? 4200 : 3000/);
});

test('el controlador bloquea duplicados, muestra carga y restaura el control', () => {
  assert.match(feedback, /const active = new WeakMap\(\)/);
  assert.match(feedback, /if \(existing\?\.promise\) return existing\.promise/);
  assert.match(feedback, /className = 'pz-admin-refresh-spinner'/);
  assert.match(feedback, /button\.setAttribute\('aria-busy', 'true'\)/);
  assert.match(feedback, /button\.disabled = true/);
  assert.match(feedback, /button\.disabled = state\.wasDisabled/);
  assert.match(feedback, /\.then\(\(result\) => \{/);
  assert.match(feedback, /\.catch\(\(error\) => \{/);
});

test('los enlaces que recargan la pagina conservan el aviso hasta la nueva vista', () => {
  const installations = read('../src/pages/admin/app-installation-details.astro');
  assert.match(feedback, /sessionStorage\.setItem\(navigationKey/);
  assert.match(feedback, /sessionStorage\.removeItem\(navigationKey\)/);
  assert.match(feedback, /data-pz-refresh-result="error"/);
  assert.match(installations, /data-pz-refresh-navigation/);
  assert.match(installations, /data-pz-refresh-success="Instalaciones actualizadas"/);
  assert.match(installations, /data-pz-refresh-error-message="No se pudieron actualizar las instalaciones"/);
});

test('todas las vistas administrativas que muestran Actualizar usan el contrato global', () => {
  const sources = [
    read('../src/components/admin/PushCampaignsView.astro'),
    read('../src/components/admin/StoreActivityView.astro'),
    read('../src/pages/admin/gifts.astro'),
    read('../src/pages/admin/orders.astro'),
    read('../src/pages/admin/organization.astro'),
    read('../src/pages/admin/products.astro'),
    read('../src/pages/admin/promos.astro'),
    read('../src/pages/admin/promos/raffles.astro'),
    read('../src/pages/admin/store-settings.astro'),
  ];

  for (const source of sources) {
    const updateButtons = (source.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) || [])
      .filter((button) => button.includes('Actualizar'));
    assert.ok(updateButtons.length > 0);
    updateButtons.forEach((button) => assert.match(button, /data-pz-refresh-feedback/));
    assert.match(source, /PZAdminRefreshFeedback/);
  }
});

test('resultados de campañas push solo confirman despues de una lectura exitosa', () => {
  const push = read('../src/components/admin/PushCampaignsView.astro');
  assert.match(push, /data-campaign-form data-pz-refresh-surface/);
  assert.match(push, /refreshCampaignMetrics\(\{ silent: true, throwOnError: true \}\)/);
  assert.match(push, /successMessage: 'Resultados actualizados'/);
  assert.match(push, /if \(options\.throwOnError\) throw error/);
  assert.match(feedback, /anchor\.closest\('\[data-pz-refresh-surface\]'\)/);
  assert.match(feedback, /preferredBelow <= maximumTop/);
  assert.match(feedback, /show\(options\.successMessage \|\| 'Datos actualizados', 'success', button\)/);
});
