# TS84-PROMO-MASTER-0001 — Implementación

## Estado

Implementado y verificado localmente sobre la rama `dev`, sin commit, push, merge, despliegue ni release. El trabajo integra Tiendas Promo en el panel Master sin iniciar `TS84-PROMO-ADMIN-SHELL-0001`, `TS84-PROMO-DOM-CF-0001` ni prompts posteriores.

## Alcance implementado

- clasificación backend de tiendas `promo` frente a `commerce`;
- alta transaccional de una Tienda Promo con tenant, entitlement cerrado, draft vacío válido, slot sin publicar en generación cero y auditoría saneada;
- resumen Master Promo de lifecycle, entitlements, draft, revisiones, dominios, Theme, publicación, salud y actividad reciente;
- lifecycle Master con CAS, transiciones acotadas y auditoría central;
- controles de entitlements con CAS y motivo auditable;
- controles de dominio que reutilizan DOM-CORE;
- control global de releases Theme que reutiliza THEME;
- creación de candidato y transiciones publish, rollback, unpublish, canonical switch, pause y resume que reutilizan PUBLISH;
- navegación y listado Master conscientes del tipo de tienda;
- cierre de rutas específicas Commerce cuando el backend clasifica la tienda como Promo o no puede clasificarla;
- estados seguros de vacío, capability ausente, error, conflicto e incoherencia.

No se implementó editor de contenido, Admin Promo, shell público Promo, DNS/Cloudflare ni serving alternativo.

## Contratos

### Contratos Master añadidos

| Ruta | Request | Response / finalidad |
|---|---|---|
| `POST /api/pz/promo/master/v1/stores/catalog` | `promo.master.store.catalog.read.v1` | `promo.master.store.catalog.v1`; clasificación mínima de tiendas Promo para el Master activo |
| `POST /api/pz/promo/master/v1/overview` | `promo.master.overview.read.v1` + `X-PZ-Promo-Store` | `promo.master.overview.v1`; proyección saneada del tenant explícito |
| `POST /api/pz/promo/master/v1/lifecycle/update` | `promo.master.lifecycle.update.v1` + CAS + reason code + header de tenant | `promo.master.lifecycle.v1`; lifecycle reservado y auditado |

`POST /api/pz/master/stores/create` conserva el payload histórico y acepta de forma aditiva `store_type: commerce|promo`. La ausencia de `store_type` continúa significando Commerce. El alta Promo no crea settings ni monedas Commerce; crea su foundation Promo dentro de la misma transacción de la tienda.

### Contratos aprobados reutilizados

- PERM: `promo.master.support`, `promo.master.site.lifecycle`, `promo.master.entitlements.manage`, `promo.master.domains.manage`, `promo.master.theme_releases.manage`, `promo.master.publication.rollback`, `promo.publication.publish` y `/api/pz/promo/master/entitlements/update`.
- PUBCFG, I18N y MEDIA: validación de draft/candidato/revisión y proyección pública por las funciones centrales existentes; el Master no reimplementa schema, locale ni media readiness.
- AUDIT: `createPromoAudit`, `mapAuditRecord`, snapshots allowlisted y acciones `promo.site.create`/`promo.site.status.update`.
- THEME: registry compilado, integridad, estados y `/api/pz/promo/private/v1/themes/releases/update`.
- DOM-CORE: `domainPrivateProjection` y rutas privadas create/verify/status; solo se entrega SHA-256 de evidencia, nunca challenge o evidencia cruda.
- PUBLISH: contratos de candidate, publish, rollback, unpublish, canonical switch, pause y resume; CAS por `expected_generation`, idempotency key por intento y reason codes del catálogo aprobado.

## Navegación y vistas

- El listado `/master/stores` presenta tipo, lifecycle Promo, entitlement, publicación, generación y modo canónico desde el catálogo backend.
- Una fila Promo solo ofrece `Abrir control Promo`; no muestra storefront, Admin, productos, analíticas, Seguridad ni acciones genéricas Commerce.
- Una clasificación no disponible queda como `unknown` y mantiene los controles cerrados.
- `/master/stores/{storeId}` consulta primero la proyección Promo. Solo `404 store_not_promo` explícito habilita el resumen Commerce existente; cualquier otro fallo queda cerrado.
- El sidebar de una tienda Promo muestra únicamente su resumen/control y regreso al listado. Los módulos Commerce permanecen sin cambios para tiendas Commerce.
- Plan, app Android, usuarios, productos, analíticas, pedidos y Seguridad Master revalidan el tipo por backend y redirigen al control central si no es Commerce.
- El formulario de alta permite seleccionar Commerce o Promo. WhatsApp se oculta y limpia para el alta Promo, porque no constituye su contrato de contacto.

La vista Promo usa el mismo `MasterShell`, componentes, escalas y patrones visuales del Master actual, con CSS focal responsive y regiones `aria-live` para feedback.

## Actores y autorización

- El catálogo reservado exige usuario `master_admin`, estado `active` y `tokenKey` idéntico entre la sesión y el record recargado.
- Overview y mutaciones exigen contexto explícito `X-PZ-Promo-Store` y gates PERM server-side.
- El alta Promo revalida la sesión Master vigente dentro de la transacción antes de crear el tenant.
- Ninguna operación toma actor, tenant, store, site, filter, sort, fields o expand desde el body.
- El frontend solo oculta o ofrece controles usando `operations`, `controls` y transiciones proyectadas; la autorización efectiva permanece en backend.

## Operaciones

### Lifecycle

Las transiciones reservadas del panel son:

- `active -> suspended`;
- `paused -> suspended|retired`;
- `suspended -> retired`.

Las transiciones `draft/active/paused` que pertenecen a publicación se ejecutan exclusivamente mediante PUBLISH. Lifecycle usa `expected_status`, `expected_updated` y reason codes cerrados: `administrative_request`, `contract_change`, `incident_recovery`, `incident_response`.

### Entitlements

Se exponen las ocho capabilities booleanas y cinco cuotas numéricas de PERM, su `source`, `updated` CAS y motivo requerido. `unassigned` nace con todos los booleanos `false` y cuotas cero. El campo legado `stores.plan` no concede capacidades Promo.

### Dominios

Se listan bindings mediante proyección DOM-CORE y solo aparecen transiciones devueltas por backend. Create, verify y status update conservan sus payloads exactos y CAS por `expected_state_version`/`expected_status`. Canonical switch se ejecuta por PUBLISH, no modificando directamente el slot o el binding.

### Theme

El panel muestra selección de draft/publicado y releases del registry compilado. Las transiciones se obtienen del backend y se ejecutan mediante el endpoint THEME aprobado; no existe selección o edición de tokens en este prompt.

### Publicación

- candidate create usa `expected_draft_version`;
- publish/rollback usan revisión, canonical, CAS, idempotency y reason code;
- unpublish/pause/resume usan CAS, idempotency y reason code;
- canonical switch usa target platform o binding primary activo, CAS, idempotency y reason code;
- readiness de draft/revisiones y salud pública reutilizan validadores PUBLISH/PUBCFG/I18N/THEME/MEDIA/DOM-CORE.

## Estados seguros

- `loading`: los formularios quedan deshabilitados y la región accesible anuncia la operación;
- `empty`: revisiones, dominios y auditoría tienen estados vacíos explícitos;
- `error`: no se muestran valores estimados ni se degrada a Commerce;
- `conflict`: CAS de lifecycle, entitlements, dominio, Theme y publicación exige recarga antes de repetir;
- `capability absent`: se muestran avisos y no se ofrecen controles dependientes;
- `incoherent`: códigos operativos saneados bloquean readiness o la vista completa;
- `not_serving`: draft, paused, suspended y retired no se confunden con un serving sano;
- `unknown type`: rutas y acciones específicas de Commerce fallan cerradas.

## Aislamiento y privacidad

- Todas las colecciones `promo_*` continúan privadas con reglas CRUD nulas.
- La clasificación global devuelve solo `store_id` para correlación Master y metadata operativa mínima Promo.
- Overview deriva `store`, `site`, entitlement, slot, revisiones, dominios y auditoría a partir del header validado y vuelve a comprobar relaciones por site.
- Solo se exponen IDs internos requeridos por contratos de mutación ya aprobados (`binding_id` y `revision_id`).
- No se exponen records PocketBase, tokenKey, token, cookie, secretos, configuración de proveedor, PII de contacto, documentos completos, snapshots de revisión, destinations, evidencia o filtros.
- AUDIT del overview contiene únicamente fecha, módulo, acción, severidad, resumen y snapshot saneado de nombre/rol del actor.

## Archivos modificados

### Backend

- `backend-powerzona/pb_hooks/pz_promo_master_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_master.pb.js`
- `backend-powerzona/pb_hooks/pz_promo_permissions_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_publish_api_lib.js`
- `backend-powerzona/pb_hooks/pz_master_store_creation_lib.js`
- `backend-powerzona/tests/pz_promo_master.test.cjs`
- `backend-powerzona/tests/pz_master_store_creation.test.cjs`

### Frontend

- `frontend-powerzona/src/lib/promoMaster.ts`
- `frontend-powerzona/src/lib/stores.ts`
- `frontend-powerzona/src/components/master/MasterPromoStoreView.astro`
- `frontend-powerzona/src/components/master/MasterStoresView.astro`
- `frontend-powerzona/src/components/master/MasterStoreActionsController.astro`
- `frontend-powerzona/src/components/master/MasterSidebar.astro`
- `frontend-powerzona/src/components/master/MasterShell.astro`
- `frontend-powerzona/src/styles/promo-master.css`
- `frontend-powerzona/src/pages/master/stores/index.astro`
- `frontend-powerzona/src/pages/master/stores/[storeId].astro`
- `frontend-powerzona/src/pages/master/stores/[storeId]/plan.astro`
- `frontend-powerzona/src/pages/master/stores/[storeId]/app.astro`
- `frontend-powerzona/src/pages/master/stores/[storeId]/users/index.astro`
- `frontend-powerzona/src/pages/master/stores/[storeId]/users/[userId].astro`
- `frontend-powerzona/src/pages/master/products/[storeId].astro`
- `frontend-powerzona/src/pages/master/products/[storeId]/[productId].astro`
- `frontend-powerzona/src/pages/master/analytics/[storeId].astro`
- `frontend-powerzona/src/pages/master/analytics/[storeId]/orders/[orderId].astro`
- `frontend-powerzona/src/pages/master/security/[storeId].astro`
- `frontend-powerzona/src/pages/master/security/[storeId]/visitors/[visitorSessionId].astro`
- `frontend-powerzona/tests/promoMaster.test.mjs`
- `frontend-powerzona/tests/masterStoreCurrencyBootstrap.test.mjs`

### Documentación

- `docs/tusenda84/reportes/TS84-PROMO-MASTER-0001-implementacion.md`

## Migraciones

No se añadieron migraciones. La implementación consume las trece colecciones privadas y el soporte de generación cero ya aprobados por DATA y PUBLISH.

## Pruebas ejecutadas

- 112 pruebas backend Promo/Master focales sin runtime HTTP: aprobadas.
- runtime HTTP efímero local de PERM, que carga todos los hooks y valida actores, tenant isolation, sesiones, REST privado y rollback: aprobado.
- 667 pruebas frontend `*.test.mjs`: aprobadas.
- build SSR Astro: aprobado.
- pruebas focales nuevas de contratos Master, foundation transaccional, sesión viva, privacidad, separación Commerce/Promo, rutas cerradas y accesibilidad: aprobadas dentro de los conteos anteriores.

No se consultó PocketBase desplegado ni se accedió a Cloudflare, Coolify, staging o producción.

## Compatibilidad

- Commerce conserva componentes, endpoints, monedas fijas, settings, acciones, plan, seguridad, productos, analíticas, usuarios y app Android existentes.
- El payload histórico de alta Commerce sigue aceptado; el selector nuevo envía `store_type: commerce` de forma explícita.
- Promo no reutiliza plan, permisos, módulos, navegación o actividad Commerce como fallback.
- No se modificaron contratos públicos ni serving Commerce.

## Riesgos y límites residuales

- Hasta implementar el futuro Admin Promo/CMS, el Master puede aprovisionar y gobernar el tenant, pero no editar contenido ni volver publicable un draft vacío.
- DOM-CORE solo permite registrar y verificar conforme a su contrato local; la automatización Cloudflare queda fuera de alcance.
- Sitios Promo heredados con foundation incompleta se muestran como incoherentes y requieren una reparación futura explícita; no se hace backfill implícito.
- El catálogo Master tiene un límite defensivo de 5.000 tenants y falla cerrado si se alcanza.
- El overview muestra las 20 revisiones más recientes y 12 eventos recientes; el historial completo permanece en AUDIT.

## Siguiente Prompt ID habilitado

`TS84-PROMO-ADMIN-SHELL-0001` queda habilitado como siguiente prompt del mapa maestro. No fue iniciado en esta implementación.
