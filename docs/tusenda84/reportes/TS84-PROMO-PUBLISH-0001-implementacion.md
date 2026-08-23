# TS84-PROMO-PUBLISH-0001 — Candidata, preview y publicación transaccional

**Estado:** COMPLETADO

**Fecha:** 2026-08-23

**Rama de trabajo:** `dev`

**HEAD de partida verificado:** `b5865b3` (`feat(promo): implementa resolucion segura de dominios`)

**Commit anterior verificado:** `4394ceb` (`feat(promo): implementa pipeline seguro de medios`)

**Commit creado:** ninguno

## 1. Resultado y alcance

Se implementó exclusivamente `TS84-PROMO-PUBLISH-0001` sobre las fundaciones aprobadas DATA, PERM, PUBCFG, AUDIT, I18N, THEME, MEDIA y DOM-CORE.

El backend es la única autoridad para:

1. congelar un draft exacto como revisión candidata inmutable;
2. reutilizar una candidata idéntica por `(site, digest)`;
3. producir preview privado de una revisión exacta y un único locale;
4. ejecutar primera publicación y publicaciones posteriores;
5. ejecutar rollback histórico explícito;
6. despublicar, pausar y reanudar;
7. cambiar atómicamente el canonical entre plataforma y binding custom;
8. aplicar CAS por `generation` e idempotencia por evento;
9. registrar evento de publicación y AUDIT saneado; y
10. conservar el serving público ligado solo a `slot → published_revision`.

No se creó frontend, panel Master/Admin, scheduler, shell público nuevo, integración DNS/Cloudflare, caché externa, deploy o acceso a infraestructura.

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
- `docs/tusenda84/reportes/TS84-PROMO-THEME-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-MEDIA-0001-implementacion.md`; y
- `docs/tusenda84/reportes/TS84-PROMO-DOM-CORE-0001-implementacion.md`.

Decisiones contractuales aplicadas:

- DATA conserva el schema, relaciones same-site, records inmutables y enforcement server-side.
- PERM resuelve actor, tenant, estado, capability y permiso; el cliente no declara ninguno.
- PUBCFG valida el documento y continúa siendo el único lector público `slot → revision`.
- AUDIT continúa como escritor central único.
- I18N valida todos los catálogos publicados y proyecta un único locale en preview.
- THEME decide releases seleccionables y retenidas; `blocked` siempre falla cerrado.
- MEDIA decide ownership, purpose, estado, poster, cuotas y delivery protegido.
- DOM-CORE decide si un binding exacto es primary, current, active y del mismo site.

No se reutilizó ningún modelo, permiso, ruta o fallback Commerce.

## 3. Endpoints y payloads versionados

Todos los endpoints son `POST`, privados, autenticados, con body máximo de 4096 bytes, query vacía, `private/no-store`, `noindex`, `nosniff` y `no-referrer`.

| Ruta | Contrato de entrada | Resultado |
|---|---|---|
| `/api/pz/promo/private/v1/publication/candidates/create` | `promo.candidate.create.v1` | `promo.candidate.v1` |
| `/api/pz/promo/private/v1/publication/preview` | `promo.preview.read.v1` | `promo.preview.v1` |
| `/api/pz/promo/private/v1/publication/publish` | `promo.publication.publish.v1` | `promo.publication.result.v1` |
| `/api/pz/promo/private/v1/publication/rollback` | `promo.publication.rollback.v1` | `promo.publication.result.v1` |
| `/api/pz/promo/private/v1/publication/unpublish` | `promo.publication.unpublish.v1` | `promo.publication.result.v1` |
| `/api/pz/promo/private/v1/publication/canonical/switch` | `promo.publication.canonical.switch.v1` | `promo.publication.result.v1` |
| `/api/pz/promo/private/v1/publication/pause` | `promo.publication.pause.v1` | `promo.publication.result.v1` |
| `/api/pz/promo/private/v1/publication/resume` | `promo.publication.resume.v1` | `promo.publication.result.v1` |

Los payloads aceptan únicamente sus fields exactos. Según la operación, estos son:

- `contract`;
- `expected_draft_version` para candidata;
- `candidate_revision_id` y `locale` canonical para preview;
- `expected_generation`;
- `idempotency_key` opaca y acotada;
- `reason_code` de un catálogo cerrado;
- `candidate_revision_id` para publish/rollback; y
- `canonical`, exactamente `{ mode: "platform" }` o `{ mode: "custom", primary_binding_id }`.

Se rechazan fields adicionales, `store_id`, `site_id`, actor, hostname, URL, filters, sort, fields, expand, credenciales, tokens, secretos y motivos libres. `X-PZ-Promo-Store` se admite únicamente como contexto Master server-validated; nunca sustituye el tenant derivado de la sesión.

## 4. Modelo y estados

La fuente pública sigue siendo el único `promo_publication_slots` del site:

```text
promo_site
   └── promo_publication_slot (state, generation, canonical)
          └── published_revision exacta
                 ├── snapshot_json inmutable
                 ├── theme_release exacto
                 └── revision_media_refs exactas
```

No existe lookup público a draft, última revisión, candidata más reciente, sequence máxima o timestamp.

| Site antes | Slot antes | Operación aprobada | Site/slot después |
|---|---|---|---|
| `draft` | `unpublished` | primera publicación | `active/active` |
| `active` | `active` | publicación posterior | `active/active` |
| `active` | `active` | rollback | `active/active` |
| `active` | `active` | canonical switch | `active/active` |
| `active` | `active` | pause | `paused/paused` |
| `paused` | `paused` | resume o rollback | `active/active` |
| `active` o `paused` | `active` o `paused` coherente | unpublish | `paused/unpublished` |
| `paused` | `unpublished` | recuperación Master por publish/rollback | `active/active` |

Combinaciones incoherentes entre estado del site, estado del slot, revisión, canonical y binding se rechazan sin reparación silenciosa. Suspended, retired, site/store ajenos o incompletos fallan cerrados mediante PERM/PUBCFG.

## 5. Candidata y preview

### 5.1 Candidata

La creación de candidata:

1. autoriza `promo.publication.publish` y deriva site/entitlement desde sesión;
2. bloquea el draft y el site dentro de una transacción;
3. revalida `expected_draft_version`;
4. exige un documento `promo.site.v1` publicable completo;
5. valida locales publicados y catálogo general para cada locale;
6. exige Theme exacto `approved` y manifest/tokens compatibles;
7. carga media exclusivamente del mismo site;
8. exige assets y posters `ready`, purpose correcto y refs coherentes;
9. revalida capabilities y cuotas proyectadas;
10. canonicaliza y calcula digest;
11. reutiliza la revisión existente si `(site, digest)` ya existe; o
12. crea revision y media refs inmutables en una transacción y audita `promo.revision.create`.

Crear o reutilizar candidata nunca modifica slot, site state o superficie pública.

### 5.2 Preview

El preview:

- exige sesión central con `promo.site.view` y revisión del mismo site;
- revalida snapshot, digest, locales, Theme, media, refs, quotas y capabilities;
- devuelve exactamente un locale, su catálogo general y selector allowlisted;
- reemplaza toda ruta pública de media por delivery privado protegido;
- no expone destino crudo de contacto, record completo, tenant interno o canonical público;
- devuelve `visibility=private` y `robots=noindex,nofollow,noarchive`; y
- no lee draft ni cambia datos.

Preview y revisión pública no comparten ruta, headers ni selección implícita.

## 6. Publicación, rollback y unpublish

### 6.1 Primera publicación y publicación posterior

Publish exige `promo.publish`, `publish_enabled`, store/site aptos, candidata del mismo site, CAS exacto y canonical válido. Una nueva publicación exige Theme `approved`; no acepta release deprecated/retired como selección nueva.

La primera publicación cambia atómicamente site `draft → active`, slot `unpublished → active`, revisión, canonical, actor, timestamp y `generation 0 → 1`. Una publicación posterior sustituye la revisión exacta y aumenta una sola generación.

### 6.2 Rollback explícito

Rollback es reservado al Master y recibe una revisión histórica explícita; nunca infiere “la anterior” por sequence, fecha o latest.

Antes de activar el target vuelve a validar:

- relation site/revision exacta;
- schema y digest del snapshot;
- metadata de locales y catálogos completos;
- Theme retenido compatible; deprecated/retired se admite, `blocked` se rechaza;
- refs y assets/posters `ready` del mismo tenant;
- purpose de media, capabilities y quotas; y
- canonical y binding actuales solicitados.

Un asset retired/quarantined, Theme blocked, binding inválido, digest divergente o cuota/capability insuficiente conserva la revisión pública previa.

### 6.3 Unpublish, pause y resume

- `unpublish` es Master-only, limpia `published_revision` y `primary_binding` del slot, restaura `canonical_mode=platform`, deja slot `unpublished`, site `paused` y conserva draft/revisiones/bindings históricos.
- `pause` es Master-only, conserva revisión/canonical retenidos pero cambia site y slot a `paused`; el lector público deja de servir.
- `resume` es Master-only y no confía en el estado retenido: revalida integralmente revisión, Theme, media, cuotas, capabilities y canonical antes de volver a `active`.

Cada transición exitosa es una operación nueva con `generation + 1`. Los no-op se rechazan y no consumen generación.

## 7. Canonical y primary binding

`canonical_mode` permanece cerrado a:

- `platform`: `primary_binding` debe ser vacío; o
- `custom`: exige capability `custom_domain_enabled` y un `primary_binding_id` exacto.

Para custom se reutiliza `DOM-CORE.assertActiveBinding`, que exige relation del mismo site, role `primary`, `status=active` e `is_current=true`. Un alias, binding pending/paused/revoked/released, binding ajeno o record ausente falla cerrado.

Publish y rollback cambian revisión + canonical en una sola transacción. `binding_switch` cambia únicamente el canonical de una revisión activa ya validada, también con CAS, evento y AUDIT atómicos. Pausar o activar un binding por DOM-CORE no cambia el canonical de forma implícita.

## 8. Actores y autorización

| Acción | Actor autorizado |
|---|---|
| Crear candidata | actor operativo con `promo.publish`; Master en soporte explícito mientras el estado operativo lo permita |
| Preview | actor del site con `promo.site.view`; Master con contexto explícito |
| Publicar en `draft/active` | actor con `promo.publish`; Master con contexto explícito |
| Publicar/recuperar desde `paused` | Master mediante `promo.master.publication.rollback` |
| Rollback | solo Master |
| Unpublish | solo Master |
| Canonical switch | solo Master |
| Pause/resume | solo Master |

Todas las decisiones reutilizan sesión vigente, usuario activo, store, site, entitlement, capability, permiso y aislamiento de PERM. Staff o secundario no obtienen publicación por rol; necesitan el permiso asignable exacto. Commerce no obtiene ninguna acción Promo.

## 9. Atomicidad, CAS e idempotencia

En una transición exitosa, una sola transacción PocketBase:

1. resuelve actor/site/entitlement;
2. localiza un evento previo por `(site, idempotency_key)`;
3. bloquea y vuelve a leer el slot;
4. compara `expected_generation`;
5. valida estado y target completo;
6. crea `promo_publication_events` con before/after y `result=succeeded`;
7. actualiza slot y site;
8. crea AUDIT con source key derivada del event ID; y
9. hace commit.

Un fallo de evento, slot, site o AUDIT revierte el conjunto. No hay ventana donde el slot apunte a una revisión sin su evento exitoso.

La unique `(site, idempotency_key)` impide duplicados por tenant. Un replay exacto devuelve el resultado persistido con `replayed=true`; reutilizar la key con actor, operación, reason o target distintos devuelve `promo_idempotency_conflict`. Una carrera que alcanza la unique vuelve a leer el evento ganador y responde como replay seguro.

Los rechazos post-autorización con contrato válido crean, en una transacción separada del intento fallido, un evento `rejected/failed` con `generation_before = generation_after`, fingerprint saneado del request y un único AUDIT `promo.security.reject`. El replay del mismo rechazo conserva error, evento y audit sin duplicarlos. Inputs inválidos, actores no autorizados o tenancy no resuelta no crean basura ni oráculos persistentes.

La `idempotency_key`, IDs internos, snapshot, texto localizado y valores sensibles no aparecen en AUDIT.

## 10. Aislamiento y fallo cerrado

- Ninguna entrada recibe tenant o actor desde body.
- Admin deriva store/site desde su sesión; Master debe declarar contexto explícito en header y se vuelve a validar.
- Revisión, Theme, media ref, asset, poster y binding se comparan contra el mismo site.
- Las queries server-side son constantes y parametrizadas; no aceptan filtros PocketBase aportados por cliente.
- Query params están prohibidos en los ocho endpoints.
- Relaciones ambiguas o duplicadas producen ausencia/fallo, nunca selección arbitraria.
- Digest, schema, locale metadata, refs y slot se revalidan antes del commit.
- El lector público vuelve a comprobar slot/generation/revision al final de su lectura.
- Slot no activo, site no activo, entitlement inválido, Theme blocked o media no ready producen `promo_public_unavailable` sin fallback.
- La proyección pública conserva `Cache-Control: private, no-store`; no hubo invalidación externa ni caché que pudiera servir una generación previa.

## 11. AUDIT

Se reutiliza exclusivamente `createPromoAudit`:

- `promo.revision.create` para una candidata nueva;
- `promo.publication.publish`;
- `promo.publication.rollback`;
- `promo.publication.unpublish`;
- `promo.publication.binding_switch`;
- `promo.publication.pause`;
- `promo.publication.resume`; y
- `promo.security.reject` para rechazos persistibles.

Los snapshots de revisión contienen solo sequence, digest, Theme, locale metadata y draft source version. Los snapshots de slot contienen únicamente state, generation, canonical mode, revision digest, binding state y `reason_code`. Los rechazos contienen solo class, result y reason code.

AUDIT comparte la transacción de su evento. Su unique `scope_key/source_event_key` y el event ID determinista hacen el writer idempotente.

## 12. Archivos modificados

### Nuevos

- `backend-powerzona/pb_hooks/pz_promo_publish_lib.js` — contratos exactos, reason codes, proyecciones saneadas y helpers de estado.
- `backend-powerzona/pb_hooks/pz_promo_publish_api_lib.js` — candidata, preview, validación integral, máquina de estados, CAS, idempotencia, evento y AUDIT.
- `backend-powerzona/pb_hooks/pz_promo_publish.pb.js` — ocho rutas POST privadas.
- `backend-powerzona/pb_migrations/1787520500_promo_publication_zero_generation.js` — compatibilidad segura de la primera generación con PocketBase 0.39.
- `backend-powerzona/tests/pz_promo_publish.test.cjs` — pruebas focales de contratos, estado, preview, migración e integración de fundaciones.
- `docs/tusenda84/reportes/TS84-PROMO-PUBLISH-0001-implementacion.md` — este reporte.

### Actualizados

- `backend-powerzona/pb_hooks/pz_promo_domain_lib.js` — exporta el validador interno `assertActiveBinding` ya aprobado por DOM-CORE.
- `backend-powerzona/pb_hooks/pz_promo_audit_lib.js` — permite `reason_code` saneado en snapshots/paths del slot.
- `backend-powerzona/tests/pz_promo_pubcfg_http_runtime.test.cjs` — flujo HTTP completo de candidata, preview, publicación, rollback, canonical, pause/resume, unpublish, fallos e idempotencia.
- `backend-powerzona/tests/pz_promo_data_http_runtime.test.cjs` — reconoce y revierte de forma segura la migración aditiva nueva.
- `backend-powerzona/tests/pz_promo_permissions_http_runtime.test.cjs` — mantiene el orden de rollback efímero con la migración nueva.

No se modificaron frontend, mobile, rutas Commerce, contratos Commerce, traducciones, permisos, roles, capabilities, planes, templates o defaults existentes.

## 13. Migración

`1787520500_promo_publication_zero_generation.js` cambia únicamente `generation_before` y `generation_after` de `promo_publication_events` a `required=false` a nivel de field PocketBase.

Motivo: PocketBase 0.39 interpreta el número cero como blank en un number field marcado required, pero la primera publicación necesita persistir `generation_before=0`.

La relajación no admite null operacional:

- las reglas REST de la colección siguen cerradas;
- el hook DATA sigue exigiendo ambos enteros no negativos; y
- exige `after = before + 1` para success o `after = before` para rejected/failed.

El down verifica IDs/nombres exactos y aborta con `unsafe_rollback_promo_publication_zero_generation` si existe cualquier evento con generación cero, porque restaurar `required=true` perdería compatibilidad con datos válidos. Sin esos datos, restaura ambos fields.

- Backfill: ninguno.
- Seed: ninguno.
- Dependencia de paquete: ninguna.
- Registros reales persistidos: ninguno; todos los gates HTTP usaron bases temporales descartables.

## 14. Pruebas ejecutadas

### 14.1 Focal PUBLISH

```text
node --test tests/pz_promo_publish.test.cjs
Resultado: 9/9 PASS
```

Valida payloads exactos, canonical, reason/idempotency allowlists, fingerprint saneado, candidata/AUDIT, preview privado, estados, rutas, generación cero e integración de las ocho fundaciones.

### 14.2 Runtime publicación/PUBCFG con PocketBase 0.39.8

```text
node --test tests/pz_promo_pubcfg_http_runtime.test.cjs
Resultado: 1/1 PASS
```

Incluye dos tenants y actores Master, principal, secundario, staff, suspendido, sesión revocada y Commerce; primera publicación, replay, CAS stale, cuota reducida después de crear candidata, publicación posterior, rollback, custom/platform, binding cross-tenant, pause/resume, unpublish, recuperación, Theme blocked, media retired, preview privado, serving exacto, AUDIT saneado/idempotente y down bloqueado ante un evento válido de generación cero.

### 14.3 Regresiones DATA/PERM con PocketBase real

```text
node --test tests/pz_promo_data_http_runtime.test.cjs
  tests/pz_promo_permissions_http_runtime.test.cjs
Resultado: 2/2 PASS
```

Se verificaron 208 migraciones idempotentes, 13 colecciones Promo privadas, 42 índices, aislamiento, REST cerrado, actores/capabilities/permisos y rollback vacío/bloqueado sin pérdida.

### 14.4 Regresión focal de fundaciones Promo

```text
node --test tests/pz_promo_publish.test.cjs tests/pz_promo_pubcfg.test.cjs
  tests/pz_promo_permissions.test.cjs tests/pz_promo_permissions_api.test.cjs
  tests/pz_promo_audit.test.cjs tests/pz_promo_i18n.test.cjs
  tests/pz_promo_theme.test.cjs tests/pz_promo_media.test.cjs
  tests/pz_promo_domain.test.cjs tests/pz_promo_data.test.cjs
  tests/pz_promo_data_migrations.test.cjs
Resultado: 96/96 PASS
```

### 14.5 Regresión backend completa

```text
node --test
Resultado: 853 tests; 846 PASS; 0 FAIL; 7 SKIP
```

Los siete skips requieren URLs, credenciales o servicios externos opt-in. No se activaron para respetar la prohibición de consultar entornos desplegados o leer secretos. Los runtimes locales, migraciones, publicación Promo y regresiones Commerce sí se ejecutaron.

También se ejecutaron `node --check` sobre los tres hooks nuevos y la migración, además de `git diff --check`, sin errores.

## 15. Compatibilidad preservada

- El endpoint público PUBCFG existente no cambió y continúa sirviendo solo slot active/platform/revision exacta.
- DOM-CORE continúa resolviendo custom solo mediante Host exacto y su lector interno validado.
- Draft, candidata y preview nunca aparecen en serving público.
- No se amplió `stores`, `users`, permisos, roles, planes, rutas ni modelos Commerce.
- No se agregaron traducciones hardcodeadas al producto ni se alteró el español Commerce.
- No hay acceso a productos, precios, stock, carrito, checkout, pedidos, cupones, ratings, Landing QR o analytics Commerce.
- La regresión backend completa terminó con cero fallos.

## 16. Riesgos y límites residuales

| Riesgo/límite | Tratamiento/estado |
|---|---|
| No existe UI Master/Admin para operar estos endpoints | Es intencional; pertenece a `TS84-PROMO-MASTER-0001` y prompts de panel posteriores |
| No existe scheduler aunque `scheduled_release` sea un reason code | El código solo clasifica una petición autenticada inmediata; no programa trabajos ni inicia prompts posteriores |
| No hay caché/CDN externa ni invalidación | El serving actual es no-store y revalida slot/generation/revision; PERF/OPS podrá añadir una key generation-aware |
| Theme o media pueden bloquear una revisión histórica | Rollback/resume revalidan y fallan cerrado; se conserva la revisión pública previa o el sitio pausado |
| Unpublish conserva bindings históricos | El slot deja de referenciarlos y el serving falla cerrado; su lifecycle sigue siendo responsabilidad DOM-CORE/Master |
| El down no puede restaurar required=true tras una primera publicación válida | Aborta explícitamente sin modificar schema ni datos; rollback funcional se hace con unpublish/rollback, no con schema destructivo |
| No se ensayó concurrencia distribuida multi-nodo | Unique + transacción + lock/relectura + CAS + replay post-race cubren el contrato DB; QA/OPS podrá añadir carga sin cambiar semántica |
| No se implementó Cloudflare/DNS/HTTPS | Fuera de alcance; `TS84-PROMO-DOM-CF-0001` no se inició |

## 17. Siguiente Prompt ID habilitado

Según el mapa maestro, el siguiente Prompt ID habilitado es **`TS84-PROMO-MASTER-0001`**: integrar tipo Promo, estado, plan, dominio, Theme y publicación en el panel Master.

`TS84-PROMO-MASTER-0001`, `TS84-PROMO-DOM-CF-0001` y cualquier prompt posterior **no fueron iniciados**.

## 18. Confirmaciones de cierre

- Se trabajó directamente sobre la rama local `dev` y los cambios quedan visibles en VS.
- No se consultó ni modificó PocketBase desplegado.
- No se consultaron ni modificaron Cloudflare, Coolify, staging o producción.
- No se leyeron secretos; los runtimes locales eliminaron variables sensibles heredadas y usaron datos sintéticos.
- No se hizo push, merge, deploy, release ni commit.
- No se borró, revirtió o sobrescribió trabajo ajeno.
