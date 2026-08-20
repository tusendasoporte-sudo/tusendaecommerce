import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const sidebar = read('../src/components/master/MasterSidebar.astro');
const styles = read('../src/styles/master-ui.css');
const proxy = read('../src/pages/api/master/server-metrics.ts');
const backendRoute = read('../../backend-powerzona/pb_hooks/pz_master_server_metrics.pb.js');

test('el monitor aparece entre la marca Master y la navegación principal', () => {
  const brandIndex = sidebar.indexOf('master-sidebar__brand');
  const monitorIndex = sidebar.indexOf('data-master-server-monitor');
  const navIndex = sidebar.indexOf('<nav class="master-sidebar__nav">');
  assert.ok(brandIndex >= 0);
  assert.ok(monitorIndex > brandIndex);
  assert.ok(navIndex > monitorIndex);
  assert.match(sidebar, /Memoria/);
  assert.match(sidebar, /Disco/);
  assert.match(sidebar, /data-server-metric-value/);
  assert.match(sidebar, /data-server-metric-percent/);
});

test('muestra usado sobre total, porcentaje, umbrales y refresco periódico', () => {
  assert.match(sidebar, /formatBytes\(metric\.used_bytes\).*formatBytes\(metric\.total_bytes\)/s);
  assert.match(sidebar, /percent >= 85/);
  assert.match(sidebar, /percent >= 70/);
  assert.match(sidebar, /const REFRESH_MS = 30_000/);
  assert.match(sidebar, /Información temporalmente no disponible/);
  assert.match(styles, /data-level="warning"/);
  assert.match(styles, /data-level="danger"/);
});

test('el proxy revalida la sesión Master y nunca expone secretos del servidor', () => {
  assert.match(proxy, /refreshAuthFromCookie/);
  assert.match(proxy, /requireMasterAdmin/);
  assert.match(proxy, /\/api\/pz\/master\/server-metrics/);
  assert.match(proxy, /Cache-Control': 'private, no-store/);
  assert.doesNotMatch(proxy, /SENTINEL_TOKEN|COOLIFY_API_TOKEN|docker\.sock/);
});

test('PocketBase protege la ruta y evita registrar cada sondeo exitoso', () => {
  assert.match(backendRoute, /"GET"/);
  assert.match(backendRoute, /\/api\/pz\/master\/server-metrics/);
  assert.match(backendRoute, /\$apis\.requireAuth\(\)/);
  assert.match(backendRoute, /\$apis\.skipSuccessActivityLog\(\)/);
});
