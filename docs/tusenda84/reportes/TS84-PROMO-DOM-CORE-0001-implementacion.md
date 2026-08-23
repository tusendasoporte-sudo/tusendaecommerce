# TS84-PROMO-DOM-CORE-0001 — Registro privado y resolución local por Host

- Fecha de cierre técnico: 2026-08-23
- Estado: **COMPLETADO**
- Base solicitada y verificada antes de modificar: rama local `dev`, `HEAD 34c0ada` (`TS84-PROMO-THEME-0001`)
- Estado inicial del worktree: cambios sin commit exclusivamente de `TS84-PROMO-MEDIA-0001` y su reporte, revisados y preservados
- Estado de entrega: cambios DOM-CORE locales visibles en `dev`; **sin commit, push, merge, despliegue ni release**
- Dependencias reutilizadas: DATA-0001, PERM-0001, PUBCFG-0001 y AUDIT-0001

## 1. Resultado y alcance

Se implementó el núcleo local de dominios Promo sobre la colección privada `promo_domain_bindings`. El backend es la única fuente de verdad para tenant, hostname canónico, rol primary/alias, estado, versión CAS, entitlement, slot y revisión publicada.

El cierre aporta:

1. registro privado Master-only con lista, creación, verificación y transición de estado;
2. normalización inequívoca de hostname, punto final, puerto e IDN hacia A-label lowercase;
3. rechazo de IP, authority ambigua, wildcard, suffix matching, path, query, userinfo, puerto inválido y A-label corrupto;
4. selección de `Host` por defecto y de un único `X-Forwarded-Host` solo cuando el caller declara un peer confiable;
5. lookup local exacto `hostname_ascii + is_current + active`, sin DNS o proveedor durante el request;
6. resolución a un solo `promo_site`, store, entitlement, slot custom, primary y revisión del mismo tenant;
7. primary servido y alias redirigido exclusivamente al primary activo/current del mismo site;
8. reutilización del lector PUBCFG completo para validar documento, digest, locales, Theme, media, cuotas, binding, generación y revisión;
9. fallo cerrado `421` para host desconocido o cualquier incoherencia pública;
10. payloads y proyecciones allowlisted sin filtros, IDs tenant, evidencia, provider reference, secretos o PII;
11. transiciones CAS e idempotencia de reintento inmediato con AUDIT transaccional; y
12. pruebas focales y runtime PocketBase real con aislamiento A/B.

No se implementaron shell público, publicación/rollback, cambio de canonical mode, panel Master, DNS, Cloudflare, certificados, ingress, SEO, Origin/CSP, caché/CDN, staging o producción. Esas responsabilidades pertenecen a Prompt IDs posteriores.

## 2. Contratos respetados

La implementación se cerró contra:

- `docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md`;
- `docs/tusenda84/reportes/TS84-PROMO-ARC-0001-arquitectura-adrs.md`;
- `docs/tusenda84/reportes/TS84-PROMO-DATA-DES-0001-diseno-datos.md`;
- `docs/tusenda84/reportes/TS84-PROMO-DATA-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-PERM-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-PUBCFG-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-AUDIT-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-I18N-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-THEME-0001-implementacion.md`; y
- `docs/tusenda84/reportes/TS84-PROMO-MEDIA-0001-implementacion.md`.

Decisiones aplicadas:

- DATA conserva ownership de colección, campos, índices parciales, states, CAS, relaciones same-site y rules `null`.
- PERM conserva `promo.master.domains.manage`, sesión central, contexto Master explícito y gates `promo_site_enabled + custom_domain_enabled`.
- PUBCFG conserva `promo.site.v1` y `promo.public.projection.v1`; DOM-CORE extrae un lector interno por site/modo sin alterar el endpoint público de plataforma por slug.
- AUDIT conserva el writer único y las acciones aprobadas `promo.domain.create`, `verify`, `activate`, `pause`, `revoke` y `release`.
- I18N, Theme y MEDIA se validan indirectamente mediante el mismo lector publicado de PUBCFG; DOM-CORE no crea alternativas ni modifica sus contratos.
- Un host custom nunca busca `stores` por slug, no usa `getCurrentStore`, no cae a Commerce y no acepta un tenant alternativo desde body/query.

## 3. Modelo y reglas de dominio

Se reutiliza sin migraciones `promo_domain_bindings`:

| Campo decisivo | Regla DOM-CORE |
|---|---|
| `site` | Lo deriva PERM para operaciones privadas y el binding exacto para serving |
| `hostname_ascii` | Única clave de autorización/lookup; lowercase A-label, sin puerto o punto final |
| `hostname_display` | Solo presentación normalizada; nunca autoriza |
| `role` | `primary` o `alias` |
| `status` | `pending`, `verified`, `active`, `paused`, `revoked`, `released` |
| `is_current` | `true` hasta `released`; el histórico no resuelve |
| `verification_method` | `manual`, `dns` o `http`; describe evidencia local, no ejecuta proveedor |
| `verification_evidence_sha256` | Solo digest SHA-256; nunca challenge/token crudo ni respuesta DNS |
| `provider_reference` | DOM-CORE no lo recibe, escribe o proyecta |
| `state_version` | CAS obligatorio; cada mutación real incrementa exactamente uno |

Restricciones operativas:

- hostname current es globalmente único por el índice DATA;
- existe como máximo un primary current por site;
- crear un primary adicional falla `409`;
- activar un alias exige exactamente un primary activo/current del mismo site;
- el primary que gobierna un slot `active/custom` no puede pausarse, revocarse o liberarse;
- reutilizar hostname exige primero `revoked → released`, después un record nuevo `pending` y una verificación nueva;
- un replay inmediato idéntico de create/verify/transición devuelve `changed=false` y no duplica AUDIT;
- un CAS stale o un replay con evidencia/estado diferente falla cerrado; y
- el catálogo privado queda acotado a 100 bindings históricos por site.

## 4. Normalización de hostname y puerto

El pipeline acepta un authority y produce `{ hostname_ascii, hostname_display, port }`:

1. exige string no vacío, sin whitespace/control inicial, final o embebido;
2. mapea separadores Unicode de dominio, aplica normalización Unicode determinista y lowercase;
3. separa como máximo un puerto decimal `1..65535` solo cuando la operación lo permite;
4. elimina como máximo un punto raíz final;
5. exige al menos dos labels, cada uno de 1..63 bytes A-label y hostname total de hasta 253;
6. aplica reglas STD3 para ASCII y Punycode con round-trip para IDN/A-label;
7. rechaza wildcard, IP/numeric host, corchetes, múltiples puntos finales, label vacío, guion inválido, colon ambiguo, coma, scheme, path, query, fragment, userinfo y escapes; y
8. persiste/busca exclusivamente el A-label canónico.

Ejemplos cubiertos:

| Entrada | Resultado |
|---|---|
| `Shop.Example.COM.:443` | `shop.example.com`, puerto `443` |
| `Mañana.Example.` | `xn--maana-pta.example`, display `mañana.example` |
| `XN--MAANA-PTA.EXAMPLE` | mismo A-label/display por round-trip |
| `*.example.test`, `127.0.0.1`, `host:0`, `host:65536`, `host/path` | rechazo |

El namespace de plataforma `tusenda84.com`, `www.tusenda84.com`, `api.tusenda84.com` y subdominios bajo la raíz reservada no puede registrarse como custom.

## 5. Resolución local por Host

`resolveHostContext` es el seam server-only que deberá consumir el futuro SHELL:

1. usa `Host` salvo que el caller haya comprobado un peer confiable y habilite un único `X-Forwarded-Host`;
2. normaliza el authority y clasifica los hosts de plataforma sin tratarlos como custom;
3. consulta exactamente `promo_domain_bindings.hostname_ascii`, `is_current=true`, `status=active`;
4. exige una sola coincidencia y valida su rol;
5. deriva `site` y después valida store activo, site activo/contract v1 y entitlement raíz/custom;
6. exige un solo slot `active/custom`, generation positiva, revisión y primary binding explícitos;
7. comprueba que binding, primary, revisión, slot y todas sus relaciones pertenezcan al mismo site;
8. relee los registros decisivos para detectar cambios durante la resolución;
9. delega en PUBCFG la validación completa de revisión, digest, locales, Theme, media, cuotas y el mismo slot/generation/binding; y
10. solo entonces permite proyectar `serve` para primary o `redirect` para alias.

La proyección de ruta contiene únicamente:

```json
{
  "ok": true,
  "contract": "promo.domain.route.v1",
  "action": "serve|redirect",
  "host": "custom.example",
  "canonical_host": "primary.example",
  "site": { "public_slug": "slug-publico" }
}
```

No expone binding/site/store/revision IDs, generation, entitlement, provider metadata, records o evidencia. DOM-CORE no registra una ruta pública catch-all: materializar HTML/redirects pertenece a SHELL/SEO y deberá llamar el resolver completo, nunca la capa parcial de binding.

## 6. Headers, aislamiento y fallo cerrado

- `Host` duplicado, ausente, vacío o con lista/coma falla `421`.
- En un peer no confiable, `X-Forwarded-Host` se ignora y solo `Host` decide.
- En un peer confiable, XFH debe ser único e inequívoco; el ingress futuro deberá sobrescribirlo, no anexarlo.
- No existe wildcard, suffix, parent-domain, slug, último tenant, current store o fallback Commerce.
- Host desconocido, binding no activo/current, primary inválido, site/store inactivo, capability ausente, slot incoherente o PUBCFG inválido falla `421` con código saneado.
- La consulta y las revalidaciones comparan IDs same-site; una relación cross-tenant no se corrige ni se sigue.
- Las operaciones privadas derivan el site desde `X-PZ-Promo-Store` solo después de PERM Master; body/query no pueden declarar tenant.
- Las colecciones continúan privadas y el CRUD REST/realtime directo de PocketBase permanece cerrado.

## 7. Actores y operaciones privadas

| Actor/estado | Listar | Crear/verificar/transicionar | Resultado |
|---|---|---|---|
| Público/anon | No | No | 403; no existe API pública de registro |
| Admin/Staff Promo | No | No | Operaciones globales reservadas al Master |
| Master activo sin contexto | No | No | `promo_store_context_required` |
| Master con contexto Promo válido y entitlement custom | Sí, solo ese site | Sí | CAS, transacción y AUDIT |
| Master con contexto Commerce/no Promo | No | No | Gate PERM falla cerrado |
| Usuario bloqueado/inactivo/sesión revocada | No | No | Denegado por auth/PERM |
| Master de tenant A aportando binding B | No | No | 404 tenant-scoped, sin enumeración |

Rutas privadas:

| Método | Ruta | Request → response |
|---|---|---|
| `POST` | `/api/pz/promo/private/v1/domains/list` | `promo.domain.list.read.v1` → `promo.domain.catalog.v1` |
| `POST` | `/api/pz/promo/private/v1/domains/create` | `promo.domain.create.v1` → `promo.domain.binding.v1` |
| `POST` | `/api/pz/promo/private/v1/domains/verify` | `promo.domain.verify.v1` → `promo.domain.binding.v1` |
| `POST` | `/api/pz/promo/private/v1/domains/status/update` | `promo.domain.status.update.v1` → `promo.domain.binding.v1` |

Todas exigen auth central, query vacía, body exacto y acotado, `private/no-store`, noindex, nosniff y no-referrer. No aceptan filters, sort, fields, expand, `store_id`, `site_id`, actor, provider token/reference, DNS payload, secret o raw challenge.

## 8. Auditoría

Se reutiliza exclusivamente `createPromoAudit` dentro de la misma transacción de estado:

- acciones críticas: create, verify, activate, pause, revoke y release;
- resource type `promo_domain_binding` y source key determinista por binding/estado/versión;
- snapshots allowlisted: role, status, `is_current`, `state_version` y método de verificación;
- changed paths mínimos y sin hostname, site/store ID, evidence digest, verified_by, provider reference, payload, token, secreto o PII; y
- replay/no-op no crea un segundo evento.

Si AUDIT falla, la transacción de dominio se revierte y no se devuelve éxito.

## 9. Archivos modificados

### Nuevos

- `backend-powerzona/pb_hooks/pz_promo_domain_lib.js` — contratos, normalización IDN/authority, selección Host/XFH y resolución local fail-closed.
- `backend-powerzona/pb_hooks/pz_promo_domain_api_lib.js` — registro Master, CAS, estados, idempotencia, tenant isolation y AUDIT.
- `backend-powerzona/pb_hooks/pz_promo_domain.pb.js` — cuatro rutas POST privadas.
- `backend-powerzona/tests/pz_promo_domain.test.cjs` — pruebas focales de host, contratos, aislamiento y rutas.
- `docs/tusenda84/reportes/TS84-PROMO-DOM-CORE-0001-implementacion.md` — este reporte.

### Actualizados

- `backend-powerzona/pb_hooks/pz_promo_pubcfg_api_lib.js` — lector publicado interno reutilizable por site y modo canonical, conservando el endpoint platform existente.
- `backend-powerzona/tests/pz_promo_pubcfg.test.cjs` — validación focal del lector `custom` con binding/generation/revision exactos.
- `backend-powerzona/tests/pz_promo_data_http_runtime.test.cjs` — gate PocketBase real de registro, Master-only, CAS, idempotencia, aislamiento y AUDIT.

Estos tres archivos ya contenían cambios locales de MEDIA donde correspondía; DOM-CORE añadió bloques acotados sin borrar, revertir o sobrescribir el trabajo previo.

No se modificaron migraciones, schema, seeds, roles, permisos, capabilities, planes, defaults, traducciones, rutas Commerce, frontend, mobile o infraestructura.

## 10. Migraciones, seeds y dependencias

- Migraciones nuevas o modificadas: **ninguna**.
- Backfill: **ninguno**.
- Seed: **ninguno**.
- Dependencias de paquete: **ninguna**.
- Registros persistentes reales: **ninguno**; las pruebas HTTP usaron una base PocketBase temporal descartable.

DOM-CORE consume los campos, índices parciales e integridad de `promo_domain_bindings` creados por DATA-0001.

## 11. Pruebas ejecutadas

### 11.1 Focales DOM-CORE/PUBCFG

```text
node --test tests/pz_promo_domain.test.cjs tests/pz_promo_pubcfg.test.cjs
Resultado: 22/22 PASS
```

Incluyen authority/IDN/puerto, Host/XFH, exact match, primary/alias, suffix/unknown, estados inválidos, cross-tenant, payloads, allowlists, registro de rutas y lector PUBCFG `custom` completo.

### 11.2 Gate PocketBase real

```text
node --test tests/pz_promo_data_http_runtime.test.cjs
Resultado: 1/1 PASS
```

El gate valida admin denegado, Master con contexto obligatorio, catálogo tenant-scoped, create normalizado/idempotente, primary y hostname global únicos, evidencia SHA-only, verify/transiciones CAS, replays inmediatos, pause/reactivate/revoke/release, nueva verificación tras release y ocho eventos AUDIT saneados.

### 11.3 Regresiones PUBCFG y Promo

```text
node --test tests/pz_promo_audit.test.cjs tests/pz_promo_data.test.cjs
  tests/pz_promo_data_migrations.test.cjs tests/pz_promo_domain.test.cjs
  tests/pz_promo_i18n.test.cjs tests/pz_promo_media.test.cjs
  tests/pz_promo_permissions.test.cjs tests/pz_promo_permissions_api.test.cjs
  tests/pz_promo_pubcfg.test.cjs tests/pz_promo_theme.test.cjs
Resultado: 87/87 PASS
```

### 11.4 Regresión backend completa

```text
node --test
Resultado: 844 tests; 837 PASS; 0 FAIL; 7 SKIP
```

Los siete skips son gates opt-in que requieren URLs, credenciales o runners externos. No se activaron por las prohibiciones del prompt. Los runtimes PocketBase locales, DOM-CORE/PUBCFG y regresiones Commerce pertinentes sí se ejecutaron.

## 12. Compatibilidad preservada

- Las rutas públicas por slug de PUBCFG siguen exigiendo `canonical_mode=platform` y `primary_binding` vacío exactamente como antes.
- El nuevo lector interno cambia únicamente la condición canonical cuando DOM-CORE lo invoca explícitamente con `custom`, binding, generation y revision esperados.
- MEDIA, I18N y Theme siguen validándose con sus mismos contratos y fallos cerrados.
- No se creó endpoint custom público, redirect HTTP, canonical switch o publication writer antes de sus prompts.
- No se cambió ningún flujo, permiso, role, entitlement default, traducción, ruta o contrato Commerce.
- No existe lookup/fallback a catálogo, carrito, checkout, pedido, precio, stock, Landing QR, rating o analytics Commerce.

## 13. Riesgos y límites residuales

| Riesgo/límite | Tratamiento/estado |
|---|---|
| Determinar si el peer es confiable depende del ingress futuro | DOM-CORE exige una decisión server-side explícita; XFH no tiene autoridad por defecto y una lista ambigua falla cerrada |
| No hay shell/catch-all público todavía | El resolver server-only y su proyección están listos; SHELL debe consumirlos sin duplicar lookup ni abrir hosts Admin/API |
| No se consulta DNS ni se prueba ownership remoto | La verificación local guarda solo método + digest; automatización/proveedor pertenece a DOM-CF y no se inició |
| Activar binding no cambia canonical | Es intencional; `binding_switch` atómico pertenece a PUBLISH/MASTER y un binding pendiente/activo aislado no altera serving |
| Origin/CSP/rate limit no forman parte de este núcleo | SEC deberá añadirlos sobre el contexto Host aprobado, sin debilitar exact match |
| No hay eliminación física de histórico | `released` conserva evidencia y libera la unique current; retención/GC requiere política posterior |
| El límite de 100 bindings puede requerir operación de retención futura | Evita catálogo ilimitado; no borra registros automáticamente |
| IDN visualmente confusable sigue siendo posible entre dominios válidos | La autorización usa A-label exacto; revisión/UX anti-homógrafos podrá endurecerse sin aceptar equivalencias |

## 14. Siguiente Prompt ID habilitado

Según el orden del mapa maestro, el siguiente Prompt ID es **`TS84-PROMO-PUBLISH-0001`**: borrador, preview, publicación y rollback sobre la revisión publicada.

`TS84-PROMO-PUBLISH-0001`, `TS84-PROMO-MASTER-0001`, `TS84-PROMO-DOM-CF-0001` y cualquier prompt posterior **no fueron iniciados**.

## 15. Confirmaciones de cierre

- No se consultó ni modificó PocketBase desplegado.
- No se consultaron ni modificaron Cloudflare, Coolify, staging o producción.
- No se leyeron secretos; los runtimes locales eliminaron variables sensibles heredadas y usaron valores sintéticos.
- No se hizo push, merge, deploy, release ni commit.
- Los cambios sin commit de `TS84-PROMO-MEDIA-0001` permanecen presentes y no fueron borrados o revertidos.
