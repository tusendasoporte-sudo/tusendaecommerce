# TS84-PROMO-DOM-CF-0001 — Boundary Cloudflare server-only y simulación segura

- Fecha de cierre técnico: 2026-08-24
- Rama local: `dev`
- HEAD de partida: `c8839a9`
- Estado: **COMPLETADO Y VALIDADO LOCALMENTE**
- Modalidad autorizada: diseño e implementación server-only con simulación determinista

## 1. Integridad de partida

Antes de modificar el proyecto se comprobó:

- rama exacta `dev`;
- HEAD exacto `c8839a9`;
- worktree limpio;
- el commit de partida cierra `TS84-PROMO-RESP-0001`.

Se trabajó directamente sobre el proyecto guardado. Los cambios quedan visibles en Visual Studio. No se creó commit y el HEAD continúa en `c8839a9`.

## 2. Contratos leídos y respetados

Se leyó primero el mapa maestro completo y después los cierres que el mapa declara como dependencias directas de este Prompt ID:

- `docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md`;
- `docs/tusenda84/reportes/TS84-PROMO-RESP-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-MASTER-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-DOM-CORE-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-AUDIT-0001-implementacion.md`.

También se contrastaron los límites de Host/binding y datos de `ARC-0001` y `DATA-DES-0001` citados por DOM-CORE: el resolver público consume estado local; Cloudflare, DNS, TLS e ingress se sincronizan fuera del request; ningún token se guarda en el binding público; las rutas administrativas permanecen centrales.

Decisiones del propietario aplicadas como contrato adicional:

- Cloudflare queda preparado únicamente para tiendas con dominio propio y capability `custom_domain_enabled`;
- las rutas predeterminadas de plataforma no importan ni llaman este módulo;
- no existe transporte real, conexión de cuenta, operación DNS, certificado, ingress, staging o producción;
- no se solicita, lee, escribe, registra ni proyecta ningún secreto;
- una integración real necesitará otro prompt y autorización separada durante producción.

## 3. Resultado

Se añadió una integración exclusivamente backend compuesta por:

1. un cliente server-only con boundary explícito;
2. un transporte de simulación local, determinista y sin red;
3. un manifiesto de permisos mínimos futuro, declarativo y sin credenciales;
4. una ruta privada Master tenant-scoped para simular `prepare`, `inspect` y `remove`;
5. normalización y revalidación mediante DOM-CORE;
6. CAS de lectura por estado y `state_version` esperados;
7. auditoría crítica, saneada e idempotente de las tres simulaciones; y
8. pruebas unitarias, de contrato y runtime PocketBase real efímero.

El código no contiene `fetch`, cliente HTTP, lectura de variables de entorno o fallback live. `createCloudflareServerClient` acepta únicamente `mode=simulation` y un transporte con identidad exacta `cloudflare.deterministic-simulation.v1`. Cualquier modo live, browser o transporte distinto falla cerrado.

## 4. Contrato privado

Se añadió una sola ruta:

| Método | Ruta | Request | Response |
|---|---|---|---|
| `POST` | `/api/pz/promo/private/v1/domains/cloudflare/simulate` | `promo.domain.cloudflare.simulate.v1` | `promo.domain.cloudflare.simulation.v1` |

Payload exacto:

```json
{
  "binding_id": "<binding privado existente>",
  "contract": "promo.domain.cloudflare.simulate.v1",
  "expected_state_version": 1,
  "expected_status": "pending",
  "mode": "simulation",
  "operation": "prepare"
}
```

No acepta `store_id`, `site_id`, hostname, zone/account ID, provider reference, token, credencial, filtros PocketBase, `fields`, `sort` o `expand`. El hostname se obtiene exclusivamente del binding tenant-scoped persistido por DOM-CORE.

La respuesta privada contiene solo:

- binding ID ya necesario para la operación Master;
- hostname canónico y rol/estado/versión del binding;
- referencia y fingerprint marcados como simulados;
- descriptor allowlisted de la operación que se ejecutaría;
- todos los estados de proveedor, certificado, DNS e ingress como `not_executed`;
- lista explícita de acciones externas diferidas; y
- confirmación del action key AUDIT, sin ID de evento o relaciones tenant.

Se aplican `private, no-store`, noindex, nosniff y no-referrer. No existe ruta pública equivalente.

## 5. Operaciones y estados

| Operación | Estados locales admitidos | Descriptor simulado | Efecto real |
|---|---|---|---|
| `prepare` | `pending`, `verified` | `POST .../custom_hostnames` con hostname exacto, DV/TXT, sin wildcard y TLS mínimo 1.2 | Ninguno |
| `inspect` | `pending`, `verified`, `active`, `paused`, `revoked` | `GET .../custom_hostnames/{simulation_reference}` | Ninguno |
| `remove` | `pending`, `verified`, `paused`, `revoked` | `DELETE .../custom_hostnames/{simulation_reference}` | Ninguno |

`prepare/remove` en un binding `active`, cualquier operación sobre `released`, un CAS stale, hostname de plataforma, authority no canónica o relación cross-tenant fallan cerrados.

Las referencias simuladas se derivan con SHA-256 del contrato, binding, hostname, operación y versión. Un replay idéntico produce la misma referencia/fingerprint y un solo evento AUDIT. No se persiste `provider_reference`, challenge, validation record o resultado de proveedor.

## 6. Permisos mínimos

La simulación declara, pero no crea ni usa, este perfil futuro:

- proveedor: Cloudflare;
- recurso: una sola zona SaaS autorizada mediante configuración server-only;
- permission group: `SSL and Certificates`;
- access: `Write`;
- operaciones acotadas: crear, leer y eliminar custom hostnames;
- permisos excluidos: administración de cuenta, DNS Write, Zone Settings Write, cache purge y Workers Write.

La decisión sigue la documentación oficial vigente de Cloudflare: crear un Custom Hostname exige `SSL and Certificates Write`; listar/consultar admite Read o Write; el lifecycle no requiere que este cliente reciba DNS Write. Fuentes consultadas:

- https://developers.cloudflare.com/api/resources/custom_hostnames/methods/create/
- https://developers.cloudflare.com/api/resources/custom_hostnames/methods/list/
- https://developers.cloudflare.com/api/resources/custom_hostnames/
- https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/

Esto no aprueba un token ni decide todavía su custodia, rotación, zone ID, fallback origin, CNAME target o modelo comercial. Si producción adopta gestión autoritativa de zonas/DNS en vez de Custom Hostnames for SaaS, necesitará diseño, scopes y autorización separados; este prompt no lo anticipa con permisos amplios.

## 7. Autorización y aislamiento

- Reutiliza exclusivamente `promo.master.domains.manage` de PERM.
- Exige usuario Master activo, sesión vigente y `X-PZ-Promo-Store` explícito.
- Reutiliza los gates `promo_site_enabled + custom_domain_enabled`.
- El binding se busca por ID y se vuelve a comprobar contra el `promo_site` derivado por backend.
- El body no puede declarar tienda, sitio o hostname.
- Se bloquea la fila durante la transacción y se revalida estado, versión, `is_current`, rol, hostname y tenant antes/después de simular.
- Admin Promo, Staff, Commerce, Master sin contexto y cruce tenant A/B fallan cerrados.
- Las colecciones Promo continúan con CRUD/realtime directo cerrado.

No se añadió permiso, rol, capability, plan o default nuevo. Las tiendas sin dominio propio no reciben acceso ni dependencia alguna de este módulo.

## 8. Normalización y Host

No se creó un normalizador paralelo. La integración consume `normalizeAuthority` e `isPlatformNamespace` de DOM-CORE y exige que el hostname persistido sea ya el A-label lowercase exacto, sin puerto ni punto final.

Se preservan:

- IDN/punycode con round-trip;
- rechazo de IP, wildcard, authority ambigua, path/query/userinfo y puerto;
- exclusión del namespace `tusenda84.com` y sus subdominios reservados;
- unicidad global current y un primary current por site mediante DATA/DOM-CORE;
- resolución pública exclusivamente local y exacta;
- rechazo de XFH salvo decisión posterior de proxy confiable.

DOM-CF no modifica `resolveHostContext`, el shell Promo, canonical, Origin, `security.checkOrigin`, caché o rutas Commerce.

## 9. Auditoría

Se amplió de forma estrictamente aditiva el catálogo central AUDIT con:

- `promo.domain.cloudflare.prepare.simulate`;
- `promo.domain.cloudflare.inspect.simulate`;
- `promo.domain.cloudflare.remove.simulate`.

Los tres eventos:

- usan módulo `domain`, severidad `critical` y recurso `promo_domain_binding`;
- se escriben con `createPromoAudit` dentro de la misma transacción;
- son idempotentes por `site + source_event_key` determinista;
- registran solo `role`, `status`, `is_current`, `state_version` y `verification_method`;
- no registran hostname, tienda/sitio, zone/account ID, request descriptor, simulation reference, provider reference, challenge, evidencia, token, credential, payload o respuesta del proveedor.

Si AUDIT falla, la ruta no devuelve éxito.

## 10. Archivos modificados

### Nuevos

- `backend-powerzona/pb_hooks/pz_promo_cloudflare_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_cloudflare_api_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_cloudflare.pb.js`
- `backend-powerzona/tests/pz_promo_cloudflare.test.cjs`
- `docs/tusenda84/reportes/TS84-PROMO-DOM-CF-0001-implementacion.md`

### Actualizados

- `backend-powerzona/pb_hooks/pz_promo_audit_lib.js`
- `backend-powerzona/tests/pz_promo_audit.test.cjs`
- `backend-powerzona/tests/pz_promo_permissions_http_runtime.test.cjs`

No se modificó frontend, mobile, shell Promo, rutas públicas, Commerce, migraciones, schema, seeds, infraestructura ni archivos de configuración de despliegue.

## 11. Migraciones y dependencias

- Migraciones nuevas o modificadas: **ninguna**.
- Backfill: **ninguno**.
- Seeds: **ninguno**.
- Paquetes/dependencias añadidos: **ninguno**.
- Datos persistentes reales: **ninguno**.
- Variables de entorno nuevas: **ninguna**.

El runtime HTTP usó una base PocketBase temporal descartable y eliminó del entorno heredado variables cuyo nombre pudiera corresponder a tokens, secrets, passwords, Cloudflare, Coolify o PocketBase remoto.

## 12. Pruebas y resultados

### 12.1 Sintaxis

```text
node --check pb_hooks/pz_promo_cloudflare_lib.js
node --check pb_hooks/pz_promo_cloudflare_api_lib.js
node --check pb_hooks/pz_promo_cloudflare.pb.js
node --check pb_hooks/pz_promo_audit_lib.js

Resultado: PASS
```

### 12.2 Focales DOM-CF, DOM-CORE y AUDIT

```text
node --test tests/pz_promo_cloudflare.test.cjs
  tests/pz_promo_domain.test.cjs
  tests/pz_promo_audit.test.cjs

Resultado: 27/27 PASS
```

Cubren determinismo, tres operaciones, boundary server-only, rechazo live/browser/transporte externo, normalización IDN, namespace plataforma, estados, payload exacto, scopes mínimos, ausencia de secretos, rutas privadas y actions AUDIT.

### 12.3 Gate HTTP PocketBase real efímero

```text
node --test tests/pz_promo_cloudflare.test.cjs
  tests/pz_promo_permissions_http_runtime.test.cjs

Resultado: 9/9 PASS
```

El gate runtime valida Master/Admin, contexto obligatorio, capability, tenant A/B, binding persistido, payload injection, las tres simulaciones, replay determinista, un evento por operación, lectura AUDIT saneada, REST privado y rollback efímero.

### 12.4 Backend completo

```text
node --test --test-reporter=dot

Resultado final fuera del sandbox: PASS, código de salida 0
```

La primera ejecución dentro del sandbox ejerció la suite pero cinco runtimes Commerce/Seguridad heredados no pudieron crear directorios locales `.tmp` y terminaron con `EPERM`. Se repitió fuera del sandbox sobre el mismo worktree y toda la suite terminó sin fallos. No se consultó ningún servicio externo.

### 12.5 Frontend completo y build SSR

```text
node --test
Resultado: 730/730 PASS

npm run build
Resultado: PASS
```

El build conserva tres warnings preexistentes de Astro sobre `getStaticPaths()` ignorado en las rutas dinámicas Commerce de producto, categoría y subcategoría. No pertenecen a DOM-CF.

### 12.6 Higiene Git

```text
git diff --check
Resultado: PASS
```

## 13. Compatibilidad preservada

- No se modificó ninguna ruta por slug/plataforma.
- El shell público Promo y su endpoint por Host siguen usando únicamente DOM-CORE/PUBCFG y estado local.
- No existe import o llamada DOM-CF en renderer, SSR público, frontend, Master UI o Commerce.
- Tiendas sin dominio propio conservan exactamente sus rutas, respuestas y capacidades actuales.
- Commerce conserva home, catálogo, producto, carrito, checkout, pedidos, ratings, Landing QR, Seguridad, analítica y planes.
- No cambió `security.checkOrigin`, proxy trust, Host/XFH, canonical, cache, SEO o publicación.
- No se creó fallback a tienda, slug, binding, provider o último tenant.

## 14. Límites y pendientes explícitos

- No existe transporte Cloudflare real; el boundary lo rechaza deliberadamente.
- No se validó disponibilidad comercial de Cloudflare for SaaS ni configuración de una cuenta/zone real.
- No se decidió zone ID, fallback/custom origin, CNAME target, ownership DCV, certificate DCV, CAA, apex/`www`, HTTPS al origen o mínimo TLS definitivo de producción.
- No se generaron o entregaron records DNS, challenges o validation records.
- No se cambió DNS, certificado, proxy, trusted peer, Coolify/Traefik ingress, firewall, caché, staging o producción.
- No se persiste `provider_reference`; la referencia simulada solo identifica el resultado local reproducible.
- No se conectó el lifecycle local `pending/verified/active` a un estado remoto; hacerlo requiere autorización y rollback real.
- SEC deberá cerrar Origin/proxy/CSP/rate limit sobre el Host ya aprobado; SEO deberá cerrar canonical/OG/sitemap por dominio. Ninguno se adelantó aquí.

La fase de producción deberá decidir expresamente topología, producto Cloudflare, permisos/token, custodia/rotación, scopes por zona, idempotencia remota, reconciliation/backoff, safe logging, rollback de proveedor, DNS, certificados, ingress, staging y operación. Este reporte no constituye autorización para esas acciones.

## 15. Confirmaciones externas

- Cuenta Cloudflare real: **no conectada ni consultada**.
- Plugin Cloudflare: **no instalado ni conectado**.
- DNS/zonas/dominios/certificados: **no creados, activados, modificados o eliminados**.
- Coolify/Traefik/ingress: **no consultados ni modificados**.
- PocketBase desplegado: **no consultado ni modificado**.
- Staging/producción: **no consultados ni modificados**.
- Secretos/credenciales/tokens: **no solicitados, leídos, escritos o registrados**.
- Push/merge/deploy/release/commit: **no realizados**.

## 16. Siguiente Prompt ID

Según el mapa maestro, el siguiente Prompt ID es **`TS84-PROMO-SEO-0001`**.

`TS84-PROMO-SEO-0001` y todos los prompts posteriores **no fueron iniciados**. Su mención no concede autorización para ejecutarlos.
