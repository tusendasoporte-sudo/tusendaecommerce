# TS84-PROMO-AUDIT-0001 — Implementación de auditoría Promo

- Fecha de cierre técnico: 2026-08-23
- Estado: **COMPLETADO**
- Base solicitada: `dev` en `6a53d9b7495e32ee47a9c3e994b3de0c6a2bdc87` (`feat(promo): implementa contratos públicos y edición privada`)
- Estado Git durante el trabajo: worktree desacoplado exactamente en la base solicitada; **sin commit, push, merge, despliegue ni release**.

## 1. Resultado

Se implementó la capa AUDIT Promo sobre la única colección preexistente `promo_audit_events` creada por DATA-0001. El resultado aporta:

- un writer server-only central e idempotente;
- catálogo versionado de acciones, módulos, recursos, severidades y paths Promo;
- `before/after` por allowlist y saneamiento recursivo;
- elevación automática a `critical` para acciones o facetas sensibles;
- dos contratos privados de lectura, paginados y tenant-scoped;
- proyección de salida mínima que no entrega relaciones internas, claves de idempotencia ni correlación;
- integración de los writers focales ya existentes en PERM y PUBCFG;
- pruebas unitarias, de contrato y runtime PocketBase real.

No se creó una identidad, autorización, colección, migración, modelo de auditoría o almacenamiento paralelo. `store_activity_audit` y todos sus eventos, contratos, rutas y consumidores Commerce permanecen sin cambios.

## 2. Contratos respetados

La implementación se cerró contra los siguientes contratos normativos:

- `docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md`;
- `docs/tusenda84/reportes/TS84-PROMO-ARC-0001-arquitectura-adrs.md`;
- `docs/tusenda84/reportes/TS84-PROMO-DATA-DES-0001-diseno-datos.md`;
- `docs/tusenda84/reportes/TS84-PROMO-DATA-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-PERM-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-PUBCFG-0001-implementacion.md`.

Decisiones aplicadas:

1. DATA sigue siendo dueño de schema, reglas `null`, append-only, índices e idempotencia por `(scope_key, source_event_key)`.
2. PERM sigue siendo la única autoridad. AUDIT reutiliza `managementDecision` y los action gates de las mutaciones; no añade permisos, roles o grants.
3. PUBCFG sigue siendo dueño del documento y de sus paths cambiados. AUDIT recibe solo su snapshot estructural saneado, nunca el documento.
4. El tenant Admin se deriva exclusivamente del actor autenticado. Master requiere `X-PZ-Promo-Store` explícito y validado por PERM.
5. El CRUD directo y realtime de `promo_audit_events` continúan cerrados, incluso para Admin y Master.
6. Un evento almacenado con acción/recurso, módulo, actor, origen, severidad, paths o snapshots fuera del catálogo falla cerrado y la API responde `promo_audit_unavailable` sin reflejar detalles.

## 3. Arquitectura implementada

### 3.1 Writer único

`pz_promo_audit_lib.js` es el adaptador único para escribir `promo_audit_events`. El caller entrega una decisión PERM y datos operativos mínimos; el adaptador deriva y valida:

- `scope_key` y relación `site`;
- actor y snapshot mínimo de actor;
- origen, módulo, acción y severidad desde catálogos server-side;
- tipo e ID snapshot del recurso;
- paths cambiados;
- snapshots anterior/nuevo;
- resumen fijo del catálogo;
- source key determinista e idempotente;
- correlation ID opcional de formato cerrado.

Un replay del mismo `scope_key + source_event_key` devuelve el evento existente. Si una carrera produce la restricción unique al guardar, el writer vuelve a localizar el mismo evento y no duplica actividad.

### 3.2 Lectura privada

Se añadieron únicamente estas rutas Promo:

| Método | Ruta | Contrato de entrada | Salida |
|---|---|---|---|
| `POST` | `/api/pz/promo/private/v1/audit/list` | `promo.audit.list.v1` | Lista paginada `promo.audit.event.v1` |
| `POST` | `/api/pz/promo/private/v1/audit/detail` | `promo.audit.detail.v1` | Un `promo.audit.event.v1` |

Ambas exigen auth central, body exacto, límites de tamaño, headers `private, no-store`, anti-indexación y consultas SQL parametrizadas con `site = tenant resuelto`. No aceptan `store_id`, `site_id`, `actor_id`, `filter`, `sort`, `fields`, `expand`, búsqueda libre ni otra expresión PocketBase.

La lista permite exclusivamente:

- página y tamaño de página de 1 a 100;
- `module`, `action`, `severity` y `resource_type` catalogados;
- rango cerrado `date_from/date_to` de hasta 366 días.

La proyección de lectura expone solo:

```text
id, contract,
actor { name, role },
origin, module, action, severity,
resource { type, id },
changed_paths, before, after,
summary, created
```

No expone `site`, `store`, actor ID, `scope_key`, `source_event_key`, `correlation_id`, `actor_snapshot_json`, relaciones PocketBase ni el record persistido completo.

## 4. Matriz de actores y operaciones

| Actor/estado | Mutación Promo auditada | List/detail AUDIT | Resultado |
|---|---|---|---|
| Público/no autenticado | Ninguna | No | `403 unauthorized` |
| Usuario Commerce | Ninguna | No | `404`/denegación saneada; nunca degrada a Commerce |
| Admin principal activo de la Promo | Writers según action gate existente | Sí, solo su tenant derivado | Permitido |
| Admin secundario activo | Draft solo si PERM concede la acción | No | La escritura sigue su gate; lectura AUDIT `403` |
| Store Staff activo | Draft solo si PERM concede la acción | No | La escritura sigue su gate; lectura AUDIT `403` |
| Master activo sin contexto | Ninguna | No | `promo_store_context_required` |
| Master activo con `X-PZ-Promo-Store` válido | Soporte/entitlements/draft según gates reservados existentes | Sí, solo el tenant explícito validado | Permitido y trazable |
| Usuario suspendido, inactivo, bloqueado por plan o con sesión revocada | Ninguna | No | Denegado fail-closed |
| Actor A solicitando evento/tenant B | Ninguna | No | Lista vacía o `404`, sin inferencia cross-tenant |

No se añadió un action key `audit.view`: la lectura operativa reutiliza exactamente la autoridad de gestión ya cerrada por PERM, principal o Master en soporte explícito. Los secundarios/staff no reciben acceso implícito por poder editar contenido.

## 5. Eventos y severidades

### 5.1 Writers conectados en este prompt

| Acción | Recurso | Severidad | `before/after` |
|---|---|---|---|
| `promo.team.permissions.update` | `promo_user_permissions` | `critical` | permisos Promo, versión y rotación lógica de sesiones como booleano; nunca `tokenKey` |
| `promo.entitlements.update` | `promo_site_entitlements` | `critical` | source, updated y capacidades Promo tipadas |
| `promo.draft.update` | `promo_draft_document` | `important`; `critical` si toca theme/locales/contact/adapters | digest, versión y resumen estructural allowlisted |

Los eventos PERM y PUBCFG se siguen guardando dentro de la misma transacción de su mutación. Se eliminaron los builders locales duplicados y las source keys basadas en reloj/azar.

### 5.2 Vocabulario reservado para integraciones Promo posteriores

AUDIT registra el vocabulario server-side necesario para que los módulos posteriores usen el mismo writer, sin implementar sus flujos:

| Familia | Acciones catalogadas | Severidad base |
|---|---|---|
| Sitio | create, status update | `critical` |
| Revisión | create | `important` |
| Media | create, status update | `important` / `critical` |
| Tema | release update, selection update | `critical` |
| Localización/contacto | localization update, contact update | `important` / `critical` |
| Publicación | publish, rollback, unpublish, pause, resume, binding switch | `critical` |
| Dominio | create, verify, activate, pause, revoke, release | `critical` |
| Seguridad | reject | `important` |

El catálogo contiene 25 acciones y 10 tipos de recurso exclusivamente Promo. No activa I18N, THEME, MEDIA, PUBLISH, dominio ni ningún workflow posterior; solo fija el contrato que esos módulos deberán invocar cuando sean autorizados.

## 6. Campos saneados

Los snapshots permiten únicamente estas familias:

| Recurso | Campos permitidos |
|---|---|
| Sitio | status, public slug, versión de contrato |
| Permisos | permisos Promo, versión, indicador booleano de sesiones revocadas |
| Entitlements | source, updated, capabilities Promo |
| Draft | digest, versión, theme ID/version y nombres de overrides seguros, metadata de locales, flags/tipos de contacto, conteos media/secciones y flags de adapters |
| Revisión | secuencia, digest, theme, default/published locales, versión draft de origen |
| Media | kind, purpose, status, MIME detectado, bytes y dimensiones/duración |
| Theme release | theme ID/version, status, renderer key y versión de contrato |
| Publication slot | state, generation, canonical mode, revision digest y binding state |
| Domain binding | role, status, current, state version y verification method |
| Security event | class, result y reason code |

Controles adicionales:

- top-level y nodos JSON tienen profundidad, cantidad, longitud y tipo acotados;
- cada path debe corresponder al recurso y a sus prefijos allowlisted;
- campos con semántica de secret/token/cookie/auth/config/payload/record/PII se rechazan;
- theme override keys también se filtran por formato y sensibilidad;
- los resúmenes vienen del catálogo, no de texto del usuario o del nombre del objetivo;
- un draft se resume por estructura: no copia `content_by_locale`, identity, textos, destinos, configs, URLs, asset IDs ni documentos completos.

Quedan explícitamente fuera: secrets, API keys, passwords, bearer/cookies, `tokenKey`, session tokens, provider references, IP/user-agent, evidencia cruda, email/teléfono/destino/mensaje, payload/form data, HTML, archivos/binarios, records completos y datos Commerce.

## 7. Archivos modificados

### Nuevos

| Archivo | Propósito |
|---|---|
| `backend-powerzona/pb_hooks/pz_promo_audit_lib.js` | Catálogos, saneamiento, writer idempotente y proyección privada |
| `backend-powerzona/pb_hooks/pz_promo_audit_api_lib.js` | Contratos list/detail, gates PERM, queries tenant-scoped y errores saneados |
| `backend-powerzona/pb_hooks/pz_promo_audit.pb.js` | Dos rutas POST privadas |
| `backend-powerzona/tests/pz_promo_audit.test.cjs` | Pruebas focales unitarias y de contrato |
| `docs/tusenda84/reportes/TS84-PROMO-AUDIT-0001-implementacion.md` | Este cierre |

### Actualizados

| Archivo | Cambio focal |
|---|---|
| `backend-powerzona/pb_hooks/pz_promo_permissions_api_lib.js` | PERM delega al writer central y registra acciones críticas saneadas/idempotentes |
| `backend-powerzona/pb_hooks/pz_promo_pubcfg_api_lib.js` | PUBCFG delega al writer central y genera snapshot estructural de draft |
| `backend-powerzona/tests/pz_promo_permissions_http_runtime.test.cjs` | Matriz runtime de eventos críticos, lector privado, REST cerrado y tenant A/B |
| `backend-powerzona/tests/pz_promo_pubcfg_http_runtime.test.cjs` | Matriz runtime list/detail, severidad por paths, saneamiento, actores e inyecciones |

No se modificó ningún archivo frontend, mobile, Commerce, migración o infraestructura.

## 8. Migraciones

**No existen migraciones en AUDIT-0001.** Se reutiliza sin alterar la colección `promo_audit_events`, sus rules `null`, validaciones, índices, append-only y unique source key creados por DATA-0001.

No se ejecutó ninguna migración sobre `pb_data` persistente. Los runtimes levantaron PocketBase local contra directorios temporales descartables, eliminaron variables sensibles heredadas y usaron secretos sintéticos aleatorios únicamente en memoria/environment del proceso de prueba.

## 9. Pruebas y resultados

### 9.1 Sintaxis y pruebas focales

```text
node --check pz_promo_audit_lib.js / pz_promo_audit_api_lib.js /
  pz_promo_permissions_api_lib.js / pz_promo_pubcfg_api_lib.js
Resultado: PASS

node --test pz_promo_audit.test.cjs pz_promo_permissions.test.cjs
  pz_promo_permissions_api.test.cjs pz_promo_pubcfg.test.cjs
Resultado: 31/31 PASS
```

Cobertura focal:

- catálogo de acciones/recursos sin Commerce;
- before/after y paths allowlisted;
- rechazo de secrets, records, campos y acciones unknown;
- draft sin contenido, teléfono, destino, config o asset ID;
- idempotencia y proyección privada mínima;
- payloads exactos y rechazo de tenancy/filtros inyectados;
- rutas privadas y CRUD genérico ausente;
- un solo writer usado por PERM/PUBCFG;
- corrupción almacenada rechazada fail-closed.

### 9.2 Runtime PocketBase real Promo

Se usó temporalmente el binario local PocketBase 0.39.8 ya documentado por DATA/PUBCFG, SHA-256 `7503E40F3B36F772F26C9DD9DD971A3A176D601701B3C10D70F2FA8FA70E90D4`. La copia temporal fue retirada al finalizar.

```text
node --test pz_promo_permissions_http_runtime.test.cjs
  pz_promo_pubcfg_http_runtime.test.cjs
Resultado: 2/2 PASS
```

Los gates cubren Master, principal, secundario, staff, suspendido, sesión revocada, bloqueo por plan y Commerce; dos tenants; CAS; permisos/capabilities; REST directo cerrado; list/detail; payload injection; severidad; saneamiento y rollback efímero.

### 9.3 Regresión backend

La suite se ejecutó en particiones equivalentes para disponer dependencias locales temporales sin alterar el repo:

```text
Suite backend excepto cuatro runtimes que requieren pocketbase.exe:
802 total; 785 PASS; 0 FAIL; 17 SKIP

Runtimes Promo reales:
2/2 PASS

Runtimes Commerce M7U2-C2, M7U2-C3, R7P2 y V7E9-C3F3:
4/4 PASS
```

Los skips restantes son gates opt-in que requieren URLs/credenciales o runners externos y no fueron activados, conforme a la prohibición de consultar entornos externos.

### 9.4 Regresión frontend y build

El `node_modules` del checkout fuente, verificado contra el mismo `package-lock.json` SHA-256 `5FFC6653FFF76B5DBA036ADAC6B98E485B3DC6BCF646729D059116748B37F5AE`, se montó solo mediante junction temporal y se retiró al finalizar.

```text
node --test tests/promoAccess.test.mjs
Resultado: 5/5 PASS

node --test
Resultado: 655 total; 654 PASS; 1 FAIL; 0 SKIP

npm run build
Resultado: PASS
```

La única falla frontend es la aserción preexistente `storefrontPushAdminForm.test.mjs: el detalle enviado usa un panel de resultados...`. El frontend está idéntico a `6a53d9b` y no aparece en el diff de AUDIT-0001; corregir Push C09 estaría fuera de alcance y no se intentó.

### 9.5 Higiene Git

`git diff --check` pasa. No quedaron la copia temporal de `pocketbase.exe` ni el junction temporal `node_modules`. No se creó commit.

## 10. Compatibilidad preservada

- Ningún modelo, hook, ruta, contrato, permiso, rol, plan, default o flujo Commerce fue modificado.
- No se escribió en `store_activity_audit` ni se cambió su reader/UI.
- Ninguna tienda Commerce adquiere sitio, entitlement, evento o acceso Promo por fallback.
- Las rutas nuevas viven solo bajo `/api/pz/promo/private/v1/audit/*`.
- No se abrió CRUD/realtime de colecciones privadas.
- No se incorporaron imports de catálogo, productos, categorías, órdenes, promociones Commerce, carrito o checkout.
- Las source keys y queries siempre quedan asociadas al site resuelto por backend.
- La observabilidad Promo no se publica ni se mezcla con analítica pública.

## 11. Riesgos residuales

| Riesgo | Tratamiento/estado |
|---|---|
| Retención exacta todavía no aprobada (`DP-08`/`P-13`) | AUDIT no crea GC ni borra eventos; se mantiene append-only hasta OPS/privacidad autorizado |
| Un módulo posterior podría crear `promo_audit_events` directamente | Debe importar el writer central; tests focales exigen que PERM/PUBCFG ya no mantengan builders paralelos |
| Acciones futuras aún no generan eventos porque sus workflows no existen | El catálogo queda listo, pero cada prompt posterior debe integrar su mutación y añadir runtime focal dentro de la misma transacción |
| Eventos históricos PERM/PUBCFG tenían severidad `important` | La proyección eleva al mínimo del catálogo; los eventos nuevos se persisten ya como `critical` cuando corresponde, sin reescribir historia |
| Una fila persistida es corrupta o incompatible | El lector falla cerrado con 503 saneado y no entrega una proyección parcial |
| Única falla frontend de baseline Push C09 | Documentada; no afecta AUDIT, build ni backend y requiere un prompt propio |

## 12. Siguiente Prompt ID habilitado

Según el orden del mapa maestro, el siguiente Prompt ID habilitado es **`TS84-PROMO-I18N-0001`**.

AUDIT-0001 no inició I18N-0001, THEME-0001, MEDIA-0001, PUBLISH-0001 ni ningún prompt posterior. El vocabulario de auditoría reservado no implementa ni adelanta esos flujos.

## 13. Confirmaciones de cierre

- No se consultó ni modificó PocketBase desplegado.
- No se consultaron ni modificaron Cloudflare, Coolify, staging o producción.
- No se leyó ningún secreto. Los runtimes eliminaron variables sensibles heredadas y usaron valores sintéticos.
- No se creó identidad, autorización, almacenamiento, auditoría o modelo paralelo.
- No se hizo push, merge, deploy, release ni commit.
- El worktree conserva cambios locales únicamente para revisión y autorización separada.
