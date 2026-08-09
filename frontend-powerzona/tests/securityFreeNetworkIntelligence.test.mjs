import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('FREE-NETWORK-UI: diferencia sospecha, VPN, hosting bloqueado e IP abusiva', () => {
  const client = read('../src/lib/securityMonitoring.ts');
  const detail = read('../src/components/admin/SecurityVisitorDetailView.astro');

  assert.match(client, /EVENT_TYPE_FILTERS = \[[^\]]*'network_suspected'/);
  assert.match(client, /EVENT_TYPE_FILTERS = \[[^\]]*'hosting_blocked'/);
  assert.match(client, /EVENT_TYPE_FILTERS = \[[^\]]*'abusive_ip_blocked'/);
  assert.match(client, /'none' \| 'suspected' \| 'detected' \| 'blocked' \| 'unavailable'/);
  assert.match(client, /network_suspected: 'Red sospechosa sin confirmar VPN'/);
  assert.match(client, /suspected_ip_count: normalizeNumber/);
  assert.match(detail, /labelFromMap\(EVENT_TYPE_LABELS, vpnInfo\.event_type\)/);
  assert.match(detail, /Puntuacion de abuso/);
  assert.match(detail, /Confirmado por ambos proveedores/);
  assert.match(detail, /no alcanzo una regla activa de bloqueo/);
});

test('FREE-NETWORK-BACKEND: aplica bloqueo estricto con señales separadas', () => {
  const reputation = read('../../backend-powerzona/pb_hooks/pz_security_ip_reputation_lib.js');
  const monitoring = read('../../backend-powerzona/pb_hooks/pz_security_monitoring_lib.js');
  const hook = read('../../backend-powerzona/pb_hooks/pz_security_monitoring.pb.js');

  assert.match(reputation, /ABUSEIPDB_BLOCK_THRESHOLD = 25/);
  assert.match(reputation, /ABUSEIPDB_DAILY_BUDGET = 800/);
  assert.match(reputation, /function strictBlockReason/);
  assert.match(reputation, /"abusive_ip_blocked"/);
  assert.match(reputation, /"hosting_blocked"/);
  assert.match(reputation, /AUTHENTICATED_DAILY_BUDGET = 900/);
  assert.match(reputation, /ANONYMOUS_DAILY_BUDGET = 90/);
  assert.match(reputation, /PROXYCHECK_DAILY_BUDGET = 300/);
  assert.match(reputation, /PROXYCHECK_MIN_CONFIDENCE = 90/);
  assert.match(monitoring, /suspected_ip_count: statuses\.filter\(\(status\) => status === "suspected"\)\.length/);
  assert.match(hook, /pz_security_tor_exit_refresh/);
  assert.match(hook, /pz_security_ip_reputation_cleanup/);
});

test('FREE-NETWORK-SAFETY: conserva checkOrigin y no contiene secretos reales', () => {
  const astroConfig = read('../astro.config.mjs');
  const reputation = read('../../backend-powerzona/pb_hooks/pz_security_ip_reputation_lib.js');

  assert.match(astroConfig, /security:\s*\{[\s\S]*?checkOrigin:\s*true/);
  assert.match(reputation, /PROVIDER_KEY_ENV = "PZ_IPAPI_KEY"/);
  assert.match(reputation, /PROXYCHECK_KEY_ENV = "PZ_PROXYCHECK_KEY"/);
  assert.match(reputation, /ABUSEIPDB_KEY_ENV = "PZ_ABUSEIPDB_KEY"/);
  assert.doesNotMatch(reputation, /PZ_IPAPI_KEY\s*=\s*["'][^"']+["']/);
  assert.doesNotMatch(reputation, /PZ_PROXYCHECK_KEY\s*=\s*["'][^"']+["']/);
  assert.doesNotMatch(reputation, /PZ_ABUSEIPDB_KEY\s*=\s*["'][^"']+["']/);
});
