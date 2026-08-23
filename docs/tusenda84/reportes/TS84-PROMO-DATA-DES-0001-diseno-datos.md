# TS84-PROMO-DATA-DES-0001 — Diseño de datos de Tiendas Promo

## 1. Ficha de control

| Campo | Resultado |
|---|---|
| Proyecto | Tu Senda 84 / Tiendas Promo |
| Prompt ID | `TS84-PROMO-DATA-DES-0001` |
| Estado | **APROBADO POR PRODUCTO/KRAKEN** |
| Fecha | 2026-08-22 |
| Rama/base observada | `dev` equivalente, commit `8464b9d533563701f0dca0af22de1d3b8ffc2b20` |
| Gate de entrada | `TS84-PROMO-ARC-0001` aprobado por el usuario en la conversación vigente |
| Contratos de entrada | ARC aprobado, COMPAT normativo y mapa maestro |
| Modalidad | Diseño documental de persistencia, reglas, índices, transacciones, rollback y migración |
| Migraciones creadas/modificadas | **NINGUNA** |
| Código funcional | **NO IMPLEMENTADO** |
| Entregable autorizado | `docs/tusenda84/reportes/TS84-PROMO-DATA-DES-0001-diseno-datos.md` |

El documento quedó aprobado por el usuario/Kraken al autorizar el inicio de `TS84-PROMO-DATA-0001`. Las decisiones que permanecen para prompts posteriores se representan mediante estados deshabilitados, cuotas cero o gates explícitos; no se convierten en defaults implícitos.

## 2. Dictamen

El modelo futuro debe ser **100 % aditivo**. No se añadirán ni reinterpretarán campos de `stores`, `settings`, `store_visual_items`, `reviews`, `store_analytics_events`, `store_activity_audit`, planes o permisos actuales dentro de la migración base Promo. La presencia de un registro 1:1 en `promo_sites` clasificará una extensión Promo de una tienda existente sin cambiar la semántica de Commerce.

El contenido editable se almacenará como un documento privado `promo.site.v1` sujeto a compare-and-swap. Una candidata publicable se convertirá en una revisión JSON canónica e inmutable, con hash SHA-256, tema versionado, locales completos y referencias de medios verificadas. El público nunca consultará el draft: resolverá binding → sitio → slot de publicación → una revisión exacta.

Se proponen trece colecciones nuevas, todas cerradas a la API directa de PocketBase. El público y los paneles consumirán en el futuro servicios server-side con proyecciones allowlisted. Los archivos Promo serán protegidos; solo una capa de entrega autorizada podrá servir un asset perteneciente a una revisión publicada.

Producto confirmó durante DATA-DES la convivencia pública v1: toda Promo tendrá una URL pública estable bajo Tu Senda 84 identificada por `public_slug`; si no posee dominio propio, esa URL sirve la revisión publicada y es canonical. Un dominio personalizado verificado puede convertirse, mediante transición Master auditada, en el canonical; desde entonces la URL pública de plataforma redirige a él. La ruta Commerce genérica de un `store` con `promo_sites.status=active` no renderizará Commerce: un guard aditivo la redirigirá al canonical Promo efectivo. Una tienda sin sitio Promo activo conserva exactamente el comportamiento Commerce actual. No se habilita modo híbrido en v1 y el preview de drafts/revisiones continúa privado, autenticado y separado de `public_slug`.

## 3. Alcance y exclusiones

### 3.1 Incluido

- Catálogo final propuesto de colecciones, campos lógicos, tipos, restricciones e índices.
- Documento editorial `promo.site.v1` y snapshot publicado.
- Relaciones y ownership por tienda.
- Reglas PocketBase, enforcement server-side y límites público/privado.
- Estados de sitio, dominio, tema, medio y publicación.
- Operaciones transaccionales, concurrencia, idempotencia y publicación atómica.
- Diseño de rollback de contenido, dominio, tema, datos y migración.
- Estrategia de migraciones futuras, orden, preflight, activación y down seguro.
- Auditoría, analítica sin PII, retención, borrado y recuperación.
- Trazabilidad ARC/COMPAT hacia colecciones, constraints y gates.

### 3.2 Excluido

- Crear, editar o ejecutar migraciones.
- Crear colecciones en PocketBase local o desplegado.
- Implementar hooks, APIs, rutas, DTOs, componentes, permisos, capacidades o UI.
- Sembrar Aladdin, temas, dominios, entitlements, drafts o revisiones.
- Modificar `stores`, `settings`, Commerce, Landing QR, ratings, i18n actual, planes, apps o APKs.
- Consultar PocketBase desplegado, Cloudflare, Coolify, staging o producción.
- Diseñar automatización Cloudflare/DNS/TLS/ingress.
- Leer secretos o generar tokens reales.
- Iniciar `TS84-PROMO-DATA-0001`, `TS84-PROMO-MOB-VIS-0001` o cualquier implementación.

## 4. Base, evidencia y restricciones heredadas

### 4.1 Contratos documentales

- ARC fija bounded context, ownership, publicación inmutable, host/binding, i18n, temas, CTA, adaptadores y gates (`docs/tusenda84/reportes/TS84-PROMO-ARC-0001-arquitectura-adrs.md:22-30`, `docs/tusenda84/reportes/TS84-PROMO-ARC-0001-arquitectura-adrs.md:166-185`, `docs/tusenda84/reportes/TS84-PROMO-ARC-0001-arquitectura-adrs.md:203-364`).
- ARC exige una revisión pública coherente y define preview/publicación/rollback (`docs/tusenda84/reportes/TS84-PROMO-ARC-0001-arquitectura-adrs.md:383-445`).
- ARC fija límites de datos y API pública mínima (`docs/tusenda84/reportes/TS84-PROMO-ARC-0001-arquitectura-adrs.md:366-381`).
- COMPAT congela invariantes y superficies inmutables (`docs/tusenda84/reportes/TS84-PROMO-COMPAT-0001-especificacion-compatibilidad.md:112-175`) y prohíbe dependencias Commerce (`docs/tusenda84/reportes/TS84-PROMO-COMPAT-0001-especificacion-compatibilidad.md:176-220`).
- El mapa ordena DATA-DES antes de migraciones y DATA (`docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md:274-304`, `docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md:354-369`).

COMPAT no está propagado a este worktree; se leyó previamente desde otro worktree local de la misma base y se conserva como ruta lógica aprobada. No se copió. AUD tampoco se propagó y no se recreó.

### 4.2 Evidencia versionada necesaria

- `stores` ya tiene slug único, estados y planes actuales; sus reglas y semántica pública no son un registry Promo (`backend-powerzona/pb_migrations/1780469000_created_stores_multistore_base.js:5-33`).
- Planes actuales agregan lifecycle directamente a `stores`; DATA-DES evita extenderlos sin decisión comercial (`backend-powerzona/pb_migrations/1783386300_store_plan_foundation.js:87-100`).
- El patrón actual de permisos usa `store_user_access`, JSON privado y unique `(store,user)` (`backend-powerzona/pb_migrations/1784595600_store_team_permissions.js:320-369`).
- La auditoría existente es server-only, saneada y con índices por tienda/actor/módulo/recurso (`backend-powerzona/pb_migrations/1784595800_store_activity_audit.js:82-123`).
- `store_visual_items` tiene semántica Commerce/marketing, ficheros públicos y lectura anónima de activos; no sirve como almacén de drafts Promo (`backend-powerzona/pb_migrations/1780450000_created_store_visual_items.js:23-76`, `backend-powerzona/pb_migrations/1780450000_created_store_visual_items.js:205-213`).
- `reviews` mezcla tienda, producto y orden; el adaptador Promo debe seleccionar solo `type="store"` y `status="approved"` (`backend-powerzona/pb_migrations/1780471000_created_reviews_rating.js:196-230`).
- Analytics actual admite vocabulario Commerce y campos que Promo no debe heredar (`backend-powerzona/pb_migrations/1780471600_created_store_analytics_events.js:78-156`, `backend-powerzona/pb_migrations/1780471600_created_store_analytics_events.js:178-190`).
- El pipeline de medios actual aporta precedentes de hash, dimensiones y cuotas, no un contrato Promo reutilizable (`backend-powerzona/pb_hooks/pz_storefront_media_lib.js:22-35`, `backend-powerzona/pb_hooks/pz_storefront_media_lib.js:105-114`, `backend-powerzona/pb_hooks/pz_storefront_media_lib.js:297-309`).
- El borrado Master enumera colecciones actuales y verifica residuos explícitamente; las colecciones Promo requerirán una integración aditiva autorizada antes de permitir borrado de una tienda Promo (`backend-powerzona/pb_hooks/pz_master_store_deletion_lib.js:11-40`, `backend-powerzona/pb_hooks/pz_master_store_deletion_lib.js:728-790`).

## 5. Principios del diseño

1. **Ninguna mutación de esquema existente:** toda persistencia Promo vive en colecciones nuevas.
2. **Store-first:** cada registro tenant-owned se relaciona directa o transitivamente con un único `promo_sites`, que a su vez tiene una relación 1:1 con `stores`.
3. **Registry global explícito:** `promo_theme_releases` es la única excepción global; no contiene código configurable.
4. **API directa cerrada:** `listRule`, `viewRule`, `createRule`, `updateRule` y `deleteRule` son `null` en todas las nuevas colecciones.
5. **Server-only writes/reads:** servicios futuros autentican, autorizan, filtran por tenant y proyectan DTOs mínimos.
6. **Un documento editorial:** estructura y traducciones se validan como una unidad; no hay publicación por fila.
7. **Revisión inmutable:** snapshot, digest, tema y media refs no cambian después de crear revisión.
8. **Puntero mutable mínimo:** solo `promo_publication_slots` cambia para publicar/rollback/unpublish.
9. **Media inmutable al quedar ready:** reemplazar crea un asset nuevo.
10. **Fallo cerrado:** referencias cruzadas, unknown theme, locale incompleto, binding inválido o entitlement ausente bloquean.
11. **Defaults sin efecto:** entitlements falsos y cuotas cero hasta decisión Master/producto.
12. **No PII de visitante:** analytics no almacena mensaje, destino, email, teléfono, URL completa, IP cruda o user-agent.
13. **Rollback conserva datos:** desactivar primero; destruir schema/datos solo con operación separada y aprobada.
14. **URL pública de plataforma siempre disponible:** una Promo activa no depende de comprar o activar dominio propio; `canonical_mode` decide entre plataforma y custom mediante una transición explícita.

## 6. Modelo lógico

```text
stores (existente, sin cambios)
   1
   |
   | 1:1
   v
promo_sites
   |-- 1:1 promo_site_entitlements
   |-- 1:1 promo_draft_documents
   |-- 1:1 promo_publication_slots ----> promo_revisions
   |                                     |       |
   |                                     |       +--> promo_theme_releases (global)
   |                                     |
   |                                     +--> promo_revision_media_refs --> promo_media_assets
   |
   |-- 1:N promo_domain_bindings
   |-- 1:N promo_media_assets
   |-- 1:N promo_revisions
   |-- 1:N promo_publication_events
   |-- 1:N promo_audit_events
   |-- 1:N promo_analytics_events
   +-- 1:N promo_analytics_daily

Request URL Promo de plataforma
   -> promo_sites(public_slug exacto, active)
   -> promo_site_entitlements(promo_site_enabled)
   -> promo_publication_slots(active, canonical_mode)
   -> render si canonical_mode=platform; redirect si canonical_mode=custom
   -> promo_revisions(snapshot_sha256 verificado)
   -> proyección pública allowlisted

Request custom host
   -> promo_domain_bindings(hostname_ascii exacto, current+active)
   -> promo_sites(active)
   -> promo_site_entitlements(promo_site_enabled)
   -> promo_publication_slots(active, canonical_mode=custom, primary_binding exacto, generación N)
   -> promo_revisions(snapshot_sha256 verificado)
   -> proyección pública allowlisted
```

Los resolvers Promo buscan `promo_sites.public_slug` o `promo_domain_bindings.hostname_ascii`, nunca `stores` por slug. Después de resolver el sitio pueden leer el `store` relacionado únicamente para comprobar estado/identidad mínima. No caen a `getCurrentStore`, PowerZona o Commerce. El guard futuro de la ruta Commerce solo comprueba si ese `store` posee un `promo_sites.status=active` y, en ese caso, redirige al canonical Promo efectivo; no utiliza Commerce como fallback.

## 7. Catálogo de colecciones

| ID | Colección propuesta | Scope | Mutabilidad | Propósito |
|---|---|---|---|---|
| `D-01` | `promo_sites` | Tenant root | Controlada | Extensión Promo 1:1 de `stores`, estado y slug público de plataforma. |
| `D-02` | `promo_site_entitlements` | Tenant | Controlada Master | Gates y cuotas Promo sin cambiar planes actuales. |
| `D-03` | `promo_theme_releases` | Global Master | Append/state controlado | Catálogo operacional de releases empaquetados. |
| `D-04` | `promo_domain_bindings` | Tenant/Master | State machine | Host canonical/alias y verificación local, sin secretos. |
| `D-05` | `promo_draft_documents` | Tenant/Admin | Mutable con CAS | Único workspace editorial privado por sitio. |
| `D-06` | `promo_media_assets` | Tenant/Admin | Inmutable tras ready | Archivos protegidos y metadata verificada. |
| `D-07` | `promo_revisions` | Tenant | Inmutable | Snapshot canonical candidato/publicable. |
| `D-08` | `promo_revision_media_refs` | Tenant | Inmutable con revisión | Integridad y GC de referencias de media. |
| `D-09` | `promo_publication_slots` | Tenant | Puntero atómico | Revisión y primary binding activos por generación. |
| `D-10` | `promo_publication_events` | Tenant | Append-only | Historial/idempotencia de publish/rollback/unpublish. |
| `D-11` | `promo_audit_events` | Tenant/global | Append-only | Auditoría Promo saneada sin cambiar auditoría existente. |
| `D-12` | `promo_analytics_events` | Tenant | Append-only/TTL | Eventos Promo mínimos y sin PII. |
| `D-13` | `promo_analytics_daily` | Tenant | Upsert server-only | Agregados diarios privados. |

No se propone colección propia para rating ni Landing QR: se consumen por adaptadores de solo lectura y aprobación expresa. Tampoco se propone colección de traducciones/secciones separada: ambas forman parte del documento versionado para impedir mezcla de revisiones.

## 8. Especificación de colecciones

Convenciones: `id` es el ID PocketBase estándar; `created`/`updated` son autodates cuando se listan; relaciones tenant-owned usan `cascadeDelete: true` respecto a `promo_sites` solo para borrar explícitamente el root Promo. La relación `promo_sites.store` usa `cascadeDelete: false` y el borrado de `stores` se bloquea hasta ejecutar el orquestador aprobado.

### 8.1 `D-01 promo_sites`

| Campo | Tipo/longitud | Requerido | Restricción |
|---|---|---:|---|
| `store` | relation→`stores`, max 1 | Sí | Unique; no cambia ni reemplaza el store. |
| `public_slug` | text 1..80 | Sí | `^[a-z0-9]+(?:-[a-z0-9]+)*$`; unique; denylist de reservados; identifica la URL pública Promo de plataforma y no un preview. |
| `status` | select | Sí | `draft`, `active`, `paused`, `suspended`, `retired`; default `draft`. |
| `contract_version` | integer | Sí | `1`; solo aumenta mediante migración compatible. |
| `created_by` | relation→`users` | Sí | Actor Master snapshotado también en audit. |
| `updated_by` | relation→`users` | Sí | Server-only. |
| `created`, `updated` | autodate | Sí | Trazabilidad. |

Índices:

- `ux_promo_sites_store` unique (`store`).
- `ux_promo_sites_public_slug` unique (`public_slug`).
- `ix_promo_sites_status` (`status`, `updated`).

Reglas: todas `null`. Solo Master crea/retira; Admin nunca cambia `store` o `status`. `public_slug` queda inmutable después de la creación en v1; una futura renominación requerirá diseño de alias/redirect separado. `active` exige entitlement y publicación coherente. La presencia de un sitio activo activa la política Promo-only v1 para el guard aditivo de la ruta Commerce; no reinterpreta el registro `stores` ni afecta tiendas sin sitio Promo activo.

### 8.2 `D-02 promo_site_entitlements`

| Campo | Tipo | Requerido/default | Restricción |
|---|---|---|---|
| `site` | relation→`promo_sites` | Sí | Unique. |
| `source` | select | `unassigned` | `unassigned`, `contract`, `addon`, `master_override`. |
| `promo_site_enabled` | bool | `false` | Gate raíz. |
| `publish_enabled` | bool | `false` | Publicación/rollback que cambia serving. |
| `custom_domain_enabled` | bool | `false` | Binding activo. |
| `theme_customization_enabled` | bool | `false` | Overrides de tokens, no selección del tema base aprobado. |
| `multilanguage_enabled` | bool | `false` | Más de un locale. |
| `video_enabled` | bool | `false` | Upload/render de video. |
| `analytics_enabled` | bool | `false` | Captura de eventos Promo. |
| `landing_qr_bridge_enabled` | bool | `false` | Solo enlace separado, además del gate existente. |
| `max_services` | integer 0..50 | `0` | Cuota efectiva; 50 es hard ceiling técnico. |
| `max_gallery_assets` | integer 0..24 | `0` | Cuota efectiva visible por revisión; 24 es hard ceiling técnico. |
| `max_locales` | integer 0..10 | `0` | Debe ser ≥1 para publicar; 10 es hard ceiling técnico. |
| `max_videos` | integer 0..3 | `0` | Cero deshabilita; 3 es hard ceiling técnico. |
| `max_storage_bytes` | integer 0..262144000 | `0` | Suma de assets no eliminados; hard ceiling 250 MiB. |
| `valid_from`, `valid_until` | date opcional | Vacío | Ventana explícita; fuera de ventana falla cerrado. |
| `updated_by`, `updated` | relation/autodate | Sí | Master-only. |

Índices: unique `ux_promo_entitlements_site` (`site`); `ix_promo_entitlements_enabled_until` (`promo_site_enabled`, `valid_until`).

Esta colección evita reinterpretar `free/basic/premium`. Para DATA, Kraken confirmó que toda alta inicia `unassigned`, con gates false y cuotas cero; no habrá backfill ni asignación desde planes Commerce. PERM podrá proyectar contratos Promo futuros sin modificar el resultado efectivo de Commerce y sin superar los hard ceilings.

### 8.3 `D-03 promo_theme_releases`

| Campo | Tipo/longitud | Requerido | Restricción |
|---|---|---:|---|
| `theme_id` | text 1..100 | Sí | ID estable, p. ej. `promo.black-gold`. |
| `version` | text 1..32 | Sí | SemVer canónica. |
| `status` | select | Sí | `draft`, `approved`, `deprecated`, `retired`, `blocked`. |
| `renderer_key` | text 1..100 | Sí | Debe existir en registry compilado; no es ruta/import libre. |
| `contract_version` | integer | Sí | Versión del contrato de secciones/tokens. |
| `manifest_sha256` | text 64 | Sí | Hex lower del manifest empaquetado. |
| `token_schema_sha256` | text 64 | Sí | Hex lower del schema cerrado. |
| `approved_by` | relation→`users` opcional | No | Obligatorio para estado approved. |
| `approved_at`, `retired_at` | date opcional | No | State machine. |
| `created`, `updated` | autodate | Sí | Metadata. |

Índices: unique `ux_promo_theme_release` (`theme_id`, `version`); `ix_promo_theme_status` (`status`, `updated`).

No contiene CSS/JS/HTML, tokens de tenant, URL remota ni archivos ejecutables. Un release referenciado por revisión no se elimina: pasa a `retired` o `blocked`. `blocked` por vulnerabilidad hace no servible la revisión hasta rollback/remediación.

### 8.4 `D-04 promo_domain_bindings`

| Campo | Tipo/longitud | Requerido | Restricción |
|---|---|---:|---|
| `site` | relation→`promo_sites` | Sí | Tenant owner. |
| `hostname_ascii` | text 1..253 | Sí | A-label UTS #46 no transicional/STD3; sin puerto/punto final. |
| `hostname_display` | text 1..253 | Sí | Solo UI; nunca lookup/tenancy. |
| `role` | select | Sí | `primary` o `alias`. |
| `status` | select | Sí | `pending`, `verified`, `active`, `paused`, `revoked`, `released`. |
| `is_current` | bool | Sí | `true` hasta liberación controlada; evita takeover histórico. |
| `verification_method` | select | No | `manual`, `dns`, `http`; no implica proveedor. |
| `verification_evidence_sha256` | text 64 opcional | No | Digest de evidencia, nunca secreto/challenge crudo. |
| `provider_reference` | text 0..160, hidden | No | ID opaco no secreto; nunca público. |
| `state_version` | integer ≥1 | Sí | CAS de transiciones Master. |
| `verified_by` | relation→`users` opcional | No | Master. |
| `verified_at`, `activated_at`, `retired_at` | date opcional | No | Ciclo de vida. |
| `created`, `updated` | autodate | Sí | Trazabilidad. |

Índices:

- `ux_promo_domain_current_host` unique (`hostname_ascii`) WHERE `is_current = 1`.
- `ux_promo_domain_current_primary` unique (`site`) WHERE `is_current = 1 AND role = 'primary'`.
- `ix_promo_domain_lookup` (`hostname_ascii`, `is_current`, `status`).
- `ix_promo_domain_site_state` (`site`, `status`, `role`, `updated`).

El lookup público exige exactamente un row `is_current=true,status=active`. No se guarda token Cloudflare. Reusar un hostname requiere `released`, nuevo proceso de verificación y un registro nuevo; el histórico no se reanima.

### 8.5 `D-05 promo_draft_documents`

| Campo | Tipo | Requerido | Restricción |
|---|---|---:|---|
| `site` | relation→`promo_sites` | Sí | Unique. |
| `schema_version` | integer | Sí | `1`. |
| `document_json` | JSON ≤1 MiB | Sí | Debe validar `promo.site.v1`; nunca HTML/CSS/JS libre. |
| `version` | integer ≥1 | Sí | CAS; cada write exige `expected_version`. |
| `document_sha256` | text 64 | Sí | JSON canonical después de write. |
| `created_by`, `updated_by` | relation→`users` | Sí | Tenant autorizado. |
| `created`, `updated` | autodate | Sí | Trazabilidad. |

Índices: unique `ux_promo_draft_site` (`site`); `ix_promo_draft_updated` (`site`, `updated`).

No existe flag `published`. El draft puede contener locales incompletos o media en procesamiento, pero no referencias cross-tenant, código arbitrario ni tipos desconocidos. La auditoría guarda paths/digests, no copias completas del documento.

### 8.6 `D-06 promo_media_assets`

| Campo | Tipo | Requerido | Restricción |
|---|---|---:|---|
| `site` | relation→`promo_sites` | Sí | Tenant owner. |
| `kind` | select | Sí | `image` o `video`. |
| `purpose` | select | Sí | `hero`, `service`, `gallery`, `owner`, `footer`, `social`, `video_poster`. |
| `status` | select | Sí | `uploaded`, `processing`, `ready`, `rejected`, `retired`, `quarantined`. |
| `file` | protected file, max 25 MiB | Sí | Imagen persistida solo como WebP optimizado; video allowlisted. Hook valida bytes reales. |
| `mime_detected` | select | Sí al ready | `image/webp`, `video/mp4`, `video/webm`. |
| `sha256` | text 64 | Sí al ready | Digest de bytes almacenados. |
| `bytes` | integer >0 | Sí al ready | WebP ≤100 KiB; video ≤25 MiB hard ceiling. |
| `width`, `height` | integer >0 | Sí al ready | Verificados por decoder/probe. |
| `duration_ms` | integer ≥0 | Video | Cero para imagen. |
| `poster_asset` | self relation opcional | Video | Debe ser image ready, mismo site, purpose poster. |
| `created_by` | relation→`users` | Sí | Actor tenant. |
| `ready_at`, `retired_at` | date opcional | No | Lifecycle. |
| `created`, `updated` | autodate | Sí | Metadata. |

Índices:

- `ux_promo_media_site_sha` unique (`site`, `sha256`) WHERE `sha256 != ''`.
- `ix_promo_media_site_state` (`site`, `status`, `kind`, `created`).
- `ix_promo_media_site_purpose` (`site`, `purpose`, `status`).
- `ix_promo_media_poster` (`poster_asset`).

Una vez `ready`, `file`, hash, MIME, dimensiones y duración son inmutables. Solo puede pasar a `retired` o `quarantined`. Sustituir crea otro ID. El original de imagen es temporal: se reutiliza el flujo de conversión/validación WebP existente y solo se persiste la salida normalizada, sin reutilizar `push_media`. Cada sitio admite como hard ceiling 200 imágenes almacenadas —incluidas las retenidas por draft/rollback—, 30 imágenes referenciadas por una revisión y 24 visibles en galería; los videos requieren entitlement y se limitan a 3. Todo cuenta contra 250 MiB. Variantes derivadas se identifican por asset+digest+transform allowlisted en la capa de media; no son URLs arbitrarias en el documento.

### 8.7 `D-07 promo_revisions`

| Campo | Tipo | Requerido | Restricción |
|---|---|---:|---|
| `site` | relation→`promo_sites` | Sí | Tenant owner. |
| `sequence` | integer ≥1 | Sí | Monótono por site, asignado en transacción. |
| `schema_version` | integer | Sí | `1`. |
| `snapshot_json` | JSON ≤1 MiB | Sí | JSON canonical `promo.site.v1`, completo e inmutable. |
| `snapshot_sha256` | text 64 | Sí | Digest de serialización canonical UTF-8. |
| `theme_release` | relation→`promo_theme_releases` | Sí | Debe estar approved al crear/publicar. |
| `default_locale` | text 2..35 | Sí | BCP 47 canonical, incluido en published locales. |
| `published_locales_json` | JSON ≤4 KiB | Sí | Array sorted, unique, BCP 47; duplicado queryable del snapshot. |
| `source_draft_version` | integer ≥1 | Sí | Trazabilidad optimista. |
| `created_by` | relation→`users` | Sí | Actor. |
| `created` | autodate | Sí | Inmutable. |

Índices:

- `ux_promo_revision_sequence` unique (`site`, `sequence`).
- `ux_promo_revision_digest` unique (`site`, `snapshot_sha256`).
- `ix_promo_revision_created` (`site`, `created`).
- `ix_promo_revision_theme` (`theme_release`, `created`).

Todas las operaciones API son cerradas y el hook server-only rechaza update/delete. Un digest repetido reutiliza la revisión existente; no crea copias semánticamente idénticas.

### 8.8 `D-08 promo_revision_media_refs`

| Campo | Tipo | Requerido | Restricción |
|---|---|---:|---|
| `site` | relation→`promo_sites` | Sí | Debe coincidir con revision y asset. |
| `revision` | relation→`promo_revisions` | Sí | Inmutable. |
| `media_asset` | relation→`promo_media_assets` | Sí | Debe estar ready y no quarantined. |
| `use_key` | text 1..120 | Sí | ID estable del slot de uso en snapshot. |
| `created` | autodate | Sí | Inmutable. |

Índices: unique `ux_promo_revision_media_use` (`revision`, `use_key`); `ix_promo_revision_media_asset` (`media_asset`, `revision`); `ix_promo_revision_media_site` (`site`, `revision`).

La creación de revisión y todas sus refs ocurre en una transacción. El set de refs debe ser exactamente igual a los IDs/use keys del snapshot; esto evita media huérfana o cross-tenant escondida en JSON.

### 8.9 `D-09 promo_publication_slots`

| Campo | Tipo | Requerido/default | Restricción |
|---|---|---|---|
| `site` | relation→`promo_sites` | Sí | Unique. |
| `state` | select | `unpublished` | `unpublished`, `active`, `paused`. |
| `published_revision` | relation→`promo_revisions` opcional | No | Obligatorio en active; mismo site. |
| `canonical_mode` | select | `platform` | `platform`, `custom`; define el origen canonical publicado. |
| `primary_binding` | relation→`promo_domain_bindings` opcional | No | Obligatorio solo en `canonical_mode=custom`; mismo site, current, role primary, active. Debe ser null en `platform`. |
| `generation` | integer ≥0 | `0` | CAS y cache generation. |
| `published_by` | relation→`users` opcional | No | Último actor de transición exitosa. |
| `published_at` | date opcional | No | Última activación. |
| `updated` | autodate | Sí | Metadata. |

Índices: unique `ux_promo_publication_site` (`site`); `ix_promo_publication_state` (`state`, `updated`); `ix_promo_publication_revision` (`published_revision`); `ix_promo_publication_canonical` (`canonical_mode`, `primary_binding`, `state`).

Es el único puntero público mutable. `state=active` exige revisión. Con `canonical_mode=platform`, `primary_binding` es null y la URL pública por `public_slug` sirve esa revisión. Con `canonical_mode=custom`, `primary_binding` debe ser válido: el custom host sirve y la URL de plataforma redirige. Un binding pending/paused/revoked jamás altera el modo por sí solo ni deja el sitio sin una decisión explícita.

### 8.10 `D-10 promo_publication_events`

| Campo | Tipo | Requerido | Restricción |
|---|---|---:|---|
| `site` | relation→`promo_sites` | Sí | Tenant. |
| `operation` | select | Sí | `publish`, `rollback`, `unpublish`, `binding_switch`, `pause`, `resume`. |
| `result` | select | Sí | `succeeded`, `rejected`, `failed`. |
| `generation_before`, `generation_after` | integer | Sí | Igual en intento fallido; +1 en transición exitosa. |
| `from_revision`, `to_revision` | relation opcional | No | Mismo site. |
| `from_binding`, `to_binding` | relation opcional | No | Mismo site. |
| `from_canonical_mode`, `to_canonical_mode` | select opcional | No | `platform`, `custom`; obligatorios en `binding_switch` exitoso. |
| `actor` | relation→`users` opcional | No | Sistema permitido. |
| `actor_snapshot_json` | JSON ≤4 KiB | Sí | ID/nombre/rol saneados. |
| `reason` | text 1..500 | Sí | Obligatorio para rollback/unpublish/binding switch. |
| `idempotency_key` | text 16..128 | Sí | Generada/validada server-side. |
| `revision_sha256` | text 64 opcional | No | Digest target. |
| `error_class` | text 0..80 | No | Clase saneada, no stack/payload. |
| `created` | autodate | Sí | Append-only. |

Índices: unique `ux_promo_publication_idempotency` (`site`, `idempotency_key`); `ix_promo_publication_events_created` (`site`, `created`); `ix_promo_publication_generation` (`site`, `generation_after`); `ix_promo_publication_target` (`to_revision`, `created`).

Slot y evento exitoso se guardan en la misma transacción. Intentos rechazados/fallidos no modifican slot y se registran con generation sin cambio.

### 8.11 `D-11 promo_audit_events`

| Campo | Tipo | Requerido | Restricción |
|---|---|---:|---|
| `scope_key` | text 1..80 | Sí | `site:<siteId>` o `global`; construida server-side. |
| `site` | relation→`promo_sites` opcional | Condicional | Obligatoria si scope site. |
| `actor` | relation→`users` opcional | No | Sistema/migration admitidos. |
| `actor_snapshot_json` | JSON ≤4 KiB | Sí | Saneado. |
| `origin` | select | Sí | `store_admin`, `master_admin`, `system`, `migration`. |
| `module` | select | Sí | `content`, `media`, `publication`, `domain`, `theme`, `localization`, `contact`, `entitlement`, `security`, `support`. |
| `action` | text 1..100 | Sí | Allowlist server-side versionada. |
| `severity` | select | Sí | `normal`, `important`, `critical`. |
| `resource_type` | text 1..80 | Sí | Allowlist. |
| `resource_id_snapshot` | text 0..80 | No | No secreto. |
| `changed_paths_json` | JSON ≤16 KiB | No | Paths, no documento completo. |
| `previous_values_json`, `new_values_json` | JSON ≤64 KiB | No | Allowlist y redacción. |
| `summary` | text 1..500 | Sí | Saneado. |
| `source_event_key` | text 1..255 | Sí | Idempotencia. |
| `correlation_id` | text 0..80 | No | No token de auth. |
| `created` | autodate | Sí | Append-only. |

Índices: unique `ux_promo_audit_source` (`scope_key`, `source_event_key`); `ix_promo_audit_site_created` (`site`, `created`); `ix_promo_audit_module_created` (`scope_key`, `module`, `created`); `ix_promo_audit_resource_created` (`scope_key`, `resource_type`, `resource_id_snapshot`, `created`).

No modifica `store_activity_audit`. Un adaptador futuro puede unir ambas fuentes en UI sin reescribir eventos históricos.

### 8.12 `D-12 promo_analytics_events`

| Campo | Tipo | Requerido | Restricción |
|---|---|---:|---|
| `site` | relation→`promo_sites` | Sí | Del contexto server-only. |
| `revision` | relation→`promo_revisions` | Sí | Revisión servida. |
| `event_type` | select | Sí | `page_view`, `section_view`, `contact_activate`. |
| `day` | text 10 | Sí | UTC `YYYY-MM-DD`. |
| `locale` | text 2..35 | Sí | Debe pertenecer a revisión. |
| `theme_key` | text 1..140 | Sí | `theme_id@version`, del release. |
| `section_key` | text 0..64 | No | Solo section_view y allowlisted en snapshot. |
| `action_type` | select opcional | No | `whatsapp`, `phone`, `email`, `internal_form`, `approved_live_chat`. |
| `device_class` | select opcional | No | `mobile`, `tablet`, `desktop`, `unknown`. |
| `dedupe_key` | text 0..128 | No | HMAC rotada/no reversible; nunca visitor ID crudo. |
| `occurred_at`, `expires_at` | date | Sí | Retención server-side. |
| `created` | autodate | Sí | Append-only. |

Índices: unique parcial `ux_promo_analytics_dedupe` (`site`, `dedupe_key`) WHERE `dedupe_key != ''`; `ix_promo_analytics_site_time` (`site`, `occurred_at`); `ix_promo_analytics_type_time` (`site`, `event_type`, `occurred_at`); `ix_promo_analytics_expiry` (`expires_at`).

No contiene URL, referrer, user-agent, IP, mensaje, destino, email, teléfono, producto, precio, carrito, orden ni formulario. Mientras retención/consentimiento no estén aprobados, `analytics_enabled=false` y no se crea evento.

### 8.13 `D-13 promo_analytics_daily`

| Campo | Tipo | Requerido | Restricción |
|---|---|---:|---|
| `site` | relation→`promo_sites` | Sí | Tenant. |
| `day` | text 10 | Sí | UTC `YYYY-MM-DD`. |
| `event_type` | select | Sí | Igual a raw events. |
| `locale` | text 2..35 | Sí | Canonical. |
| `theme_key` | text 1..140 | Sí | ID@version. |
| `dimension_key` | text 0..80 | Sí | Empty, section key o action type allowlisted. |
| `event_count` | integer ≥0 | Sí | Agregado. |
| `unique_count` | integer ≥0 | Sí | Solo desde HMAC/dedupe aprobada; nunca reidentificable. |
| `updated` | autodate | Sí | Server aggregation. |

Índices: unique `ux_promo_analytics_daily_bucket` (`site`, `day`, `event_type`, `locale`, `theme_key`, `dimension_key`); `ix_promo_analytics_daily_site_day` (`site`, `day`).

Los agregados son privados y no autorizan exposición de raw events. La política de retención puede conservar agregados más tiempo que raw solo con aprobación.

## 9. Contrato `promo.site.v1`

### 9.1 Decisión de modelado

Se elige un documento JSON estructurado frente a tablas de secciones/traducciones por fila porque:

- draft y revisión se validan/hashean como una unidad;
- publicar no puede mezclar filas de momentos distintos;
- el editor tiene un único `version` para concurrencia;
- temas y locales pueden evolucionar bajo `schema_version`;
- referencias a media se refuerzan con una tabla relacional independiente;
- no se recicla `settings` como CMS ilimitado.

La desventaja es reescribir el documento completo al guardar y limitar consultas editoriales. Se acepta con tope de 1 MiB, CAS y bajo volumen por sitio. Analítica, dominio, media y auditoría siguen normalizados porque tienen lifecycle/consultas independientes.

### 9.2 Forma normativa

```text
promo.site.v1
  contract                 = "promo.site.v1"
  system_catalog_version   = identificador allowlisted
  locales
    default                = BCP 47 canonical
    published[]            = sorted unique BCP 47
  theme
    theme_id
    version
    tokens                 = objeto validado por schema del release
  identity
    public_business_key    = referencia opaca/no record completo
  section_order[]          = section keys unique
  sections[]
    key                    = ID estable
    type                   = enum allowlisted
    variant                = enum del tema
    visible                = boolean
    config                 = objeto tipado por section type
    media_use_keys[]       = referencias lógicas
  media_refs
    <use_key>
      asset_id             = promo_media_assets del mismo site
      purpose              = enum compatible
  contact
    enabled
    primary_action_key
    secondary_action_keys[]
    actions[]              = tipo + configuración tipada
  content_by_locale
    <locale>
      identity             = nombre/resumen/propietario localized
      navigation           = labels por section key
      sections             = contenido localized por section key
      contact              = label/aria/message por action key
      media_alt            = alt por use_key o decorative=true
      seo                   = title/description/social text
  adapters
    store_rating.enabled
    landing_qr_link.enabled
```

No se guarda HTML, Markdown executable, CSS, JavaScript, nombres de componente, imports, scripts, embeds, URLs de media, redirect targets ni protocolos libres.

### 9.3 Tipos de sección v1

| Tipo | Contenido permitido | Prohibido |
|---|---|---|
| `hero` | Headline, resumen, media use key y CTA action key. | Precio, Product/Offer, QR redundante. |
| `services` | Servicios informativos, icon/media, resumen, orden. | Precio, stock, SKU, cart action. |
| `featured_work` | Trabajo, texto, media y destacado. | Producto/order relation. |
| `gallery` | Media use keys, captions y orden. | URLs/embeds arbitrarios. |
| `owner` | Nombre público, bio, retrato. | Owner record/email interno. |
| `store_rating` | Config visual del adaptador aprobado. | Product/order/verified purchase. |
| `contact` | Actions tipadas y textos localized. | Landing QR fallback, generic URL/script. |
| `footer` | Texto, enlaces sociales tipados y branding permitido. | Admin/Master/API/Commerce links. |

Toda sección debe tener key unique con patrón `^[a-z][a-z0-9_-]{0,63}$`. `section_order` y `sections` deben contener exactamente el mismo conjunto de keys visibles/ocultas, sin duplicados.

### 9.4 Límites de texto de plataforma

| Campo | Máximo |
|---|---:|
| Nombre público | 140 caracteres |
| Heading | 160 |
| Resumen corto | 600 |
| Cuerpo plain text | 4,000 |
| Nombre de servicio/trabajo | 160 |
| Caption | 500 |
| Alt | 300 |
| CTA label/aria | 80/160 |
| Mensaje CTA configurable | 1,000 |
| SEO title/description | 70/170 |

Los máximos efectivos por sitio provienen de `promo_site_entitlements` y nunca superan los hard ceilings confirmados: 50 servicios, 24 elementos visibles de galería, 10 locales, 3 videos, 64 secciones, 32 CTA, 512 referencias media totales, 30 imágenes por revisión, 200 imágenes almacenadas y 250 MiB. Las cuotas comerciales permanecen en cero hasta asignación Promo explícita.

### 9.5 Completitud i18n

- `published` no puede estar vacío y contiene `default`.
- Si multilanguage está false, `published` tiene exactamente un locale.
- Cada locale publicado tiene todos los campos obligatorios de identidad, navegación, secciones visibles, CTA activo, alt no decorativo y SEO.
- No hay fallback por campo dentro del snapshot público.
- Locale draft no publicado puede estar incompleto, pero no se copia a revisión.
- `system_catalog_version` debe existir y estar completo para todos los locales publicados.

### 9.6 CTA tipado

| Tipo | Config guardada | Validación |
|---|---|---|
| `whatsapp` | `phone_e164`, template message key/config | E.164; URL se construye, no se guarda. |
| `phone` | `phone_e164` | E.164; `tel:` se construye. |
| `email` | `email_address`, subject/body localized opcionales | Email simple; `mailto:` se construye/encodea. |
| `internal_form` | `form_key` opaca | Debe existir adapter first-party aprobado. |
| `approved_live_chat` | `adapter_key` allowlisted | Debe estar aprobado por CSP/privacidad/entitlement. |

`primary_action_key` debe apuntar a action enabled y válida. Secondary es una lista explícita, sin ciclos/duplicados. Landing QR no puede aparecer como action type.

## 10. Estados y transiciones

### 10.1 Sitio

```text
draft -> active <-> paused
           |
           v
       suspended
           |
           v
        retired
```

- Solo Master cambia estado.
- `active` exige entitlement válido y slot/revisión coherentes. `canonical_mode=platform` no requiere dominio; `canonical_mode=custom` exige binding primary activo.
- `suspended`/`retired` fallan cerrado. `retired` no vuelve a active; recuperación crea decisión Master explícita/nuevo sitio según política.

### 10.2 Binding

```text
pending -> verified -> active <-> paused -> revoked -> released
    |          |          |          |
    +----------+----------+----------+-> revoked
```

- Cada transición usa `state_version` CAS y audit.
- `released` es terminal. Reutilización crea otro registro/verificación.
- `verified` no sirve público. Solo `active,is_current=true` resuelve.

### 10.3 Media

```text
uploaded -> processing -> ready -> retired
     |           |          |
     +--------> rejected     +-> quarantined
```

- Ready congela bytes/metadata.
- Quarantined bloquea nueva publicación y serving; una revisión afectada requiere rollback/suspensión.
- Retired no entra en candidata nueva, pero se retiene mientras una revisión rollback lo use.

### 10.4 Tema

```text
draft -> approved -> deprecated -> retired
              |
              +-----------------> blocked
```

- Deprecated admite revisiones existentes y puede bloquear nuevas según política Master.
- Retired conserva artefactos referenciados.
- Blocked es emergencia de seguridad y no tiene fallback visual silencioso.

### 10.5 Publicación

```text
unpublished -> active <-> paused
     ^           |
     +-----------+  (unpublish)
```

Cada transición exitosa incrementa `generation` exactamente en uno. Publicar o rollback cambia `published_revision` de forma atómica; un fallo conserva generación y revisión anteriores.

## 11. Operaciones transaccionales

### 11.1 Crear sitio Promo

Transacción futura server-only:

1. verificar Master, store existente y ausencia de `promo_sites` para ese store;
2. crear `promo_sites` en draft con `public_slug` reservado y validado;
3. crear entitlement con todo false/cero;
4. crear draft vacío válido estructuralmente pero no publicable;
5. crear publication slot unpublished, `canonical_mode=platform`, `primary_binding=null`, generation 0;
6. emitir audit `promo_site_created` saneado;
7. commit.

No modifica el store, no crea tema/binding/revisión y no cambia comportamiento público.

### 11.2 Guardar draft

1. autenticar host Tu Senda 84 y resolver store/site desde sesión, no body;
2. exigir permiso Promo y entitlement aplicable;
3. leer row por site y comprobar `expected_version`;
4. validar JSON/schema, tipos, límites, locale tags y refs del mismo tenant;
5. canonicalizar, calcular SHA-256, incrementar version y guardar actor;
6. emitir audit de paths/digests; commit.

Conflicto de versión devuelve error de concurrencia; no hace last-write-wins.

### 11.3 Crear candidata/revisión

1. congelar una lectura del draft por version;
2. validar completitud, cuotas, tema approved, CTA y adaptadores;
3. validar que cada media ref pertenece al site, está ready y cumple purpose;
4. canonicalizar snapshot y digest;
5. si existe `(site,digest)`, reutilizarla;
6. si no, asignar sequence y crear revision + media refs en una transacción;
7. auditar `revision_created` sin snapshot completo.

Crear revisión no publica ni cambia slot.

### 11.4 Preview

- Solo host central y sesión Admin/Master autorizada en v1; no se diseña grant compartible hasta aprobación.
- Lee una revision ID del mismo site; nunca el draft por múltiples queries.
- Media protegida se entrega solo tras validar revision/site/ref.
- No modifica datos; no-store/noindex.

### 11.5 Publicar

Precondiciones:

- permiso `promo.publish` futuro y `publish_enabled` true;
- site/entitlement/store aptos;
- `expected_generation` coincide;
- revision del mismo site, tema no blocked, media no quarantined y locales completos;
- si el target es `platform`, `primary_binding=null`; si es `custom`, primary binding current+active y entitlement custom domain válido;
- modo de caché cumple ARC: key con generation/revision o HTML no-store.

Transacción:

1. revalidar slot/generation y referencias;
2. crear evento succeeded con before/after e idempotency key;
3. actualizar slot a revision/`canonical_mode`/binding/state active, generation+1, actor/fecha; en la primera publicación, cambiar el site de draft a active dentro de la misma transacción;
4. emitir audit derivado idempotente;
5. commit.

La invalidación externa no forma parte de esta transacción ni se diseña aquí. Antes de soportarla, el coordinador debe mantener HTML no-store o un mecanismo generation-aware. Un fallo antes del commit deja visible la revisión anterior.

### 11.6 Rollback/unpublish

- Rollback selecciona una revision histórica explícita, no “la anterior” por timestamp.
- Revalida tema, media, locales y binding; si una dependencia está blocked/quarantined, no publica esa revisión.
- Es una nueva transición con generation+1 y evento `rollback`; no muta revision/draft.
- Unpublish pone slot `unpublished`, cambia el site a paused dentro de la misma transacción, limpia referencias activas necesarias y hace generation+1; conserva revisiones, draft y bindings pausados/administrables.

### 11.7 Binding

- Crear/verificar/activar/pausar/retirar es Master-only, CAS por `state_version` e idempotente.
- Activar primary comprueba unique parcial y entitlement.
- Un binding pending o recién activado no cambia el canonical: la URL de plataforma continúa sirviendo mientras `canonical_mode=platform`.
- Cambiar entre canonical de plataforma y custom, o cambiar el primary custom, ocurre mediante `binding_switch` coordinado, CAS por generation y auditado; aliases nunca deciden canonical.
- Pausar/revocar el primary no hace fallback automático. Primero se ejecuta una transición Master controlada a `canonical_mode=platform`; si el binding deja de ser válido antes, el custom host y la redirección desde plataforma fallan cerrado hasta resolver la incoherencia.
- Ninguna operación guarda token Cloudflare ni llama proveedor durante render.

## 12. Reglas PocketBase y enforcement

### 12.1 Reglas de colección

Para `D-01..D-13`:

| Rule | Valor |
|---|---|
| `listRule` | `null` |
| `viewRule` | `null` |
| `createRule` | `null` |
| `updateRule` | `null` |
| `deleteRule` | `null` |

Esto impide que anonimato, customer, store_admin, store_staff o master_admin accedan directamente mediante PocketBase API, fields/filter/sort/expand/realtime/file URL. Superuser interno no se entrega al navegador.

### 12.2 Servicios futuros obligatorios

- Public projection service: read-only, después de HostResolver, sin parámetros alternativos de tenant.
- Admin authoring service: sesión central, store relation, permission+entitlement+CAS.
- Master domain/theme/entitlement service: Master-only, idempotente y auditado.
- Publication coordinator: única escritura del slot.
- Media service: upload/probe/transform/delivery de protected files.
- Analytics collector: valida vocabulario y deriva tenant/revision/locale del contexto.

Ningún cliente recibe filtros PocketBase crudos. Toda relación expanded se allowlistea server-side; la proyección pública no expone IDs internos salvo referencias opacas imprescindibles.

### 12.3 Permisos futuros

Los permisos candidatos permanecen en el namespace de ARC/mapa: `promo.site.view`, `promo.content.manage`, `promo.media.manage`, `promo.theme.select`, `promo.appearance.manage`, `promo.translations.manage`, `promo.contact.manage`, `promo.reviews.manage`, `promo.analytics.view`, `promo.publish`. PERM decidirá plantillas y enforcement; DATA-DES no modifica `store_user_access.permissions_json` ni keys Commerce.

Master conserva dominios, theme releases, entitlements, suspensión, global rollback/support y borrado. Staff jamás obtiene permiso por la sola existencia de un site.

## 13. Integridad multi-tenant

### 13.1 Constraints obligatorios

1. `promo_sites.store` unique.
2. Toda relación child.site coincide con el site de revisiones/assets/bindings relacionados.
3. `promo_revision_media_refs` cruza tres owners iguales; mismatch rechaza.
4. Slot revision y primary binding pertenecen al mismo site del slot.
5. Publication events solo referencian revisiones/bindings del mismo site.
6. Draft no acepta media ID de otro site aunque exista y esté ready.
7. Analytics site/revision/locale/theme/section/action se derivan de contexto/revisión, no body libre.
8. Rating adapter añade filtro `store=<context.store> AND type='store' AND status='approved'` y excluye product/order.
9. Landing QR adapter genera enlace desde contrato actual central; no copia sus records al snapshot.
10. Theme release es global pero selección requiere status/compatibilidad; tokens son tenant data validada.

### 13.2 Defensa ante JSON

PocketBase no puede aplicar relaciones internas de `document_json`/`snapshot_json`; un hook/servicio transaccional es obligatorio. La migración DATA deberá instalar tests que prueben:

- unknown/extra keys rechazadas;
- profundidad/tamaño/arrays acotados;
- IDs/key patterns y unicidad;
- todos los media refs presentes en relation table;
- sin URLs/protocolos/HTML/CSS/JS arbitrarios;
- locale/theme/CTA/secciones allowlisted;
- serialización canonical determinista y digest reproducible.

No se permite escribir esas colecciones con PocketBase Admin UI en operación normal; cualquier break-glass Master debe quedar auditado y revalidar antes de publicar.

## 14. Lectura pública y proyección

La proyección pública futura se arma en una sola request lógica:

1. En host central, resolver `public_slug` exacto a site; en custom host, resolver hostname exacto a binding current+active.
2. Comprobar site/entitlement/store y leer el slot unique; exigir state active y generation estable.
3. Aplicar canonical: plataforma sirve solo en modo `platform` y redirige al primary en `custom`; custom sirve solo si modo/binding coinciden exactamente.
4. Leer revision exacta; comprobar site, digest/schema/theme.
5. Cargar media refs y assets ready; cualquier inconsistencia obligatoria falla cerrado.
6. Resolver locale publicado sin consultar draft.
7. Proyectar solo campos allowlisted, compilar CTA/URLs media/SEO desde contexto.
8. Adjuntar rating/Landing QR solo si revisión+entitlement+producto los habilitan.
9. Fijar cache key con host+site+generation+revision+locale+theme+path/representación.

Se prohíbe listar `promo_revisions` y elegir “la última”, leer draft como fallback, consultar Cloudflare, buscar store por slug, cambiar site desde query o usar un tema distinto al de revision.

## 15. Dominio y resolución local

- La forma pública conceptual de plataforma es `https://tusenda84.com/promo/<public_slug>`; DATA-DES fija el namespace y la identidad, no crea ni especifica una ruta ejecutable. SHELL deberá ratificar el host público configurado y materializar el contrato sin cambiar la ruta Commerce existente para tiendas no Promo.
- El preview privado nunca usa esa URL pública como bypass: requiere host central, sesión autorizada y revision ID del mismo site.
- `hostname_ascii` es la única key de lookup; `hostname_display` nunca autoriza.
- La canonicalización ocurre antes de DB según ARC; la DB no almacena puerto, punto final o Unicode ambiguo.
- Unique parcial impide dos bindings current para un host y dos primary current por site.
- Unknown/duplicado/inactivo falla antes de leer revisión.
- `canonical_mode=platform` usa la URL pública derivada de `public_slug` y no exige binding.
- `canonical_mode=custom` exige `primary_binding`; un alias activo redirige a ese primary.
- Un dominio pending conserva plataforma como canonical. El retorno desde custom a plataforma exige `binding_switch` Master auditado; no es automático.
- SEO y metadatos canonical se derivan de `canonical_mode`, primary binding cuando aplique, locale publicado y path público allowlisted; una revisión no persiste un canonical alternativo libre.
- Todo cambio de modo incrementa `generation`; redirects y HTML usan esa generación para no conservar un canonical anterior en caché.
- Pausar/revocar binding no borra revision ni draft; Admin/Master central recuperan.
- `provider_reference` no es secreto y nunca llega al DTO público.
- Challenge, token, zone ID sensible, cert key y payload proveedor quedan fuera del modelo o en secret manager futuro, nunca en estas colecciones.

No se define automatización Cloudflare. DOM-CORE podrá implementar binding local; DOM-CF tratará proveedor server-only después de autorización.

## 16. Temas, i18n y CTA en datos

### 16.1 Temas

- Draft selecciona `theme_id/version`; candidata resuelve relation `theme_release` exacta.
- Snapshot duplica ID/version para integridad; relation sigue siendo fuente operacional.
- Tokens deben validar schema/hash del release; no se aceptan unknown tokens.
- `promo.black-gold@1.0.0` no se inserta hasta que THEME/ALADDIN aprueben manifest/activo.
- Retirar release no borra revision; bloquearlo sí impide serving/publicación hasta remediar.

### 16.2 i18n

- Locales viven dentro del documento/revisión; no hay rows traducibles independientes.
- `default_locale` y `published_locales_json` duplican metadata para resolver/validar sin abrir todo el JSON, pero deben coincidir con snapshot.
- Cualquier divergencia bloquea candidata/request; no se “repara” automáticamente.
- Español Commerce no se migra ni copia.

### 16.3 CTA

- Destinos de negocio se guardan tipados dentro del snapshot porque forman parte de la revisión pública.
- URLs finales se construyen desde registry de acciones; no se persisten generic URLs.
- Analytics guarda solo `action_type`, nunca config/destino/mensaje.
- Form/internal chat permanecen inválidos mientras entitlement/adapter/privacidad no estén aprobados.
- Landing QR es un flag de adapter separado, no action.

## 17. Medios y entrega

### 17.1 Decisión sobre `store_visual_items`

Se decide **no reutilizar ni modificar** `store_visual_items` para Promo. Sus tipos, files públicos, reglas y ausencia histórica de índices no satisfacen draft/revision/ownership inmutable. `promo_media_assets` será la fuente Promo nueva; un adaptador puede reutilizar utilidades puras de procesamiento sin cambiar la colección existente.

### 17.2 Seguridad de archivo

- Field file protegido.
- MIME declarado y magic bytes/probe deben coincidir.
- SVG, GIF, PDF, HTML, script y embeds no se admiten.
- Hash/dimensiones/duración se escriben solo desde processor confiable.
- Public delivery comprueba revision media ref; no usa un ID/filename aportado sin contexto.
- Filename público se deriva de digest/variant, no del nombre original.
- EXIF/metadata innecesaria se elimina en derivados.
- Quotas se evalúan por site y estados almacenados, bajo transacción/lock equivalente.

### 17.3 Referencias y GC

- Draft puede referenciar asset uploaded/processing del mismo site, pero preview candidato/publicación exige ready.
- Revision refs son inmutables y retienen el asset.
- Retired asset no entra en revisión nueva; permanece mientras exista ref retenida.
- GC solo elimina asset retired sin draft ref, revision ref ni poster ref, tras grace period aprobado y audit.
- Quarantined nunca se sirve; una publicación que lo use falla cerrado y requiere rollback/remediación.

## 18. Auditoría, analítica, rating y Landing QR

### 18.1 Auditoría

`promo_audit_events` se separa para no ampliar enums o semántica de `store_activity_audit`. Debe registrar site lifecycle, entitlements, draft changes, candidate, publish/rollback, bindings, themes, media, CTA/locales, soporte y seguridad. Before/after solo contiene campos allowlisted; documentos completos se representan por digest y paths.

Publication events son historial transaccional, no sustituto de auditoría. Un evento de publicación exitoso genera un audit con `source_event_key` determinista; unique evita duplicado.

### 18.2 Analítica

Se decide no insertar eventos Promo en `store_analytics_events`, porque su vocabulario/fields Commerce no cumplen minimización. El collector Promo server-side escribe únicamente cuando entitlement y política de privacidad estén aprobados. Agregación y TTL son tareas idempotentes; raw collection nunca es pública.

### 18.3 Rating

No se crea ni modifica colección. Si producto habilita el bloque, el adaptador lee `reviews` con store del contexto, `type=store`, `status=approved`; ignora `product`, `order`, `verified_purchase` y settings Commerce no aprobados para Promo. Moderación/creación actuales no cambian.

### 18.4 Landing QR

No se crea ni modifica colección/campo/ruta. La revisión solo puede incluir `adapters.landing_qr_link.enabled=true`; servirlo exige entitlement Promo y capacidad Landing QR existente. El enlace permanece en host/ruta central Tu Senda 84 y jamás sustituye CTA.

## 19. Retención, borrado y recuperación

### 19.1 Defaults seguros hasta aprobación

- Revisions/theme releases/media referenciada: sin eliminación automática.
- Audit/publication events: sin eliminación automática.
- Analytics raw: collector deshabilitado; no se almacenan eventos hasta aprobar TTL/consentimiento.
- Analytics daily: sin exposición pública; retención pendiente.
- Domain history released: retenida; reutilización crea row nuevo.

Esto evita pérdida mientras `P-13` siga abierto. OPS/privacidad deberá fijar plazos antes de producción.

### 19.2 Borrado de sitio/tienda

El borrado actual enumera colecciones y verifica residuos; por ello una tienda con `promo_sites` debe fallar cerrado hasta que un prompt autorizado extienda el orquestador Master de forma aditiva. El flujo futuro mínimo:

1. despublicar slot y pausar/revocar bindings;
2. invalidar caché y comprobar custom host cerrado;
3. exportar/respaldar según política y registrar autorización;
4. borrar analytics raw/daily y media derivatives;
5. borrar refs, events/audit según retención aprobada, slots, revisions, draft, media, bindings, entitlements y site en orden;
6. comprobar cero rows/archivos Promo para site/store;
7. continuar el borrado actual de store;
8. conservar el audit Master requerido fuera del árbol eliminado.

No se confía únicamente en cascade. La relación store→promo_site y un delete guard deben impedir que el workflow actual deje huérfanos. Modificar el orquestador compartido requerirá aprobación específica y regresiones de borrado existente.

### 19.3 Backup/restore

- Backup debe capturar DB y files del mismo punto lógico; un snapshot DB sin asset bytes no es restaurable.
- Restore valida digest de revision/media/theme manifest antes de activar serving.
- Bindings restaurados vuelven `paused` hasta revalidar DNS/TLS/ownership; no se activan por default.
- Entitlements restaurados pueden mantenerse disabled hasta aprobación operacional.

## 20. Estrategia de migración futura

### 20.1 Principio

La implementación se dividirá en migraciones pequeñas, deterministas y reversibles antes de activación. No habrá backfill de tiendas existentes ni seed público. Todos los nuevos rules serán `null` desde creación. DATA deberá ejecutarse solo después de aprobar este documento.

### 20.2 Orden propuesto

| Orden | Bloque | Contenido | Efecto observable inicial |
|---:|---|---|---|
| 0 | Preflight | Verificar colecciones/IDs/capacidades PocketBase requeridas; abortar ante divergencia. | Ninguno. |
| 1 | Root/global | `promo_sites`, entitlements, theme releases. | Ninguno; vacías y cerradas. |
| 2 | Authoring/media | Draft documents y media assets. | Ninguno; no rows. |
| 3 | Revision/publication | Revisions, media refs, slots y publication events. | Ninguno; no sites/slots. |
| 4 | Domain | Domain bindings e índices parciales. | Ninguno; sin bindings. |
| 5 | Audit/analytics | Audit events, analytics raw/daily. | Ninguno; collector disabled. |
| 6 | Enforcement | Hooks/servicios de integridad, state machines, CAS, protected delivery y tests. | Aún sin Promo activas. |
| 7 | Integraciones | PERM/PUBCFG/AUDIT/DOM-CORE según mapa y aprobación. | Solo tras gates. |

IDs de colección/fields se fijarán en DATA y se comprobarán contra el repositorio para evitar colisiones. Este documento fija nombres semánticos, no números de ID de migración.

### 20.3 Preflight obligatorio

- `HEAD`/base esperada y migraciones aplicadas en entorno local autorizado.
- Existen `stores`, `users`, `store_user_access`, `reviews` y contratos esperados.
- No existe ninguna colección `promo_*` con schema incompatible.
- SQLite/PocketBase admite índices parciales usados; si no, sustituir por guard transaccional + tabla de lease, sin debilitar unicidad.
- No hay field/collection IDs elegidos en conflicto.
- Backup local de prueba y espacio suficiente para protected media.
- No acceder a desplegado sin prompt/autorización independiente.

### 20.4 Backfill y seed

- Backfill de Commerce: **cero**.
- `stores`: **cero cambios**.
- Planes/permisos/settings/visuals/reviews/analytics actuales: **cero cambios**.
- Aladdin: no se crea en migración base.
- Theme Aladdin: no se inserta hasta THEME/ALADDIN con manifest aprobado.
- Entitlement por default: no existe hasta crear site; cuando se crea, todo false/cero.

### 20.5 Down/rollback de schema

Antes de cualquier dato Promo, cada migración puede eliminar únicamente las colecciones nuevas creadas por ella, en orden inverso y después de verificar que están vacías/no referenciadas. Después de existir datos:

1. rollback de aplicación deshabilita entitlements, despublica, pausa bindings y conserva schema/data;
2. no ejecutar down destructivo automático;
3. exportar/verificar DB+files;
4. ejecutar una migración de retirada separada, aprobada y con checks de conteo/digest;
5. eliminar colecciones en orden dependiente→root; theme releases al final si no referenciados;
6. verificar que colecciones existentes conservan schema, rules, índices, counts y comportamiento.

Un down que encuentre rows debe abortar. La capacidad de rollback funcional no depende de dropear datos.

## 21. Gates de aceptación de DATA-DES

| Gate | Condición |
|---|---|
| `DG-01 ADDITIVE` | Diff de DATA crea solo colecciones/hooks/tests Promo autorizados; no cambia schemas actuales sin aprobación separada. |
| `DG-02 PRIVATE` | Todas las rules nuevas son null y files protegidos; pruebas API directas negativas para anónimo/roles. |
| `DG-03 TENANT` | Mismatch de site en cada relación/JSON/ref/event falla; dos tenants no cruzan datos/cache/media. |
| `DG-04 IMMUTABLE` | Revision y ready media no admiten update/delete; digest se reproduce. |
| `DG-05 ATOMIC` | Slot+evento cambian en transacción y CAS; fallo/race conserva revisión anterior. |
| `DG-06 HOST` | Unique current hostname/primary, state machine y lookup exacto; sin secretos/Cloudflare request. |
| `DG-07 I18N` | Locales completos/canonical y no fallback por campo público. |
| `DG-08 THEME` | Release relation approved, hashes/schema válidos y sin código configurable. |
| `DG-09 CTA` | Config tipada/encoded, invalid channel bloquea, Landing QR separado y analytics sin destino. |
| `DG-10 MEDIA` | MIME real/hash/ownership/ready/ref/protected delivery/GC seguro. |
| `DG-11 PUBLICATION` | Público solo slot→revision; draft/candidate no aparecen en response/cache. |
| `DG-12 AUDIT` | Acciones críticas saneadas/idempotentes; no secrets/PII/documento completo. |
| `DG-13 ANALYTICS` | Collector disabled por default; payload mínimo y TTL antes de habilitar. |
| `DG-14 DELETE` | Store deletion falla cerrado hasta integrar conteo/orden/zero-residue Promo. |
| `DG-15 REGRESSION` | `stores`, rutas Commerce, planes, permisos, Landing QR, ratings, analytics y Master/Admin existentes permanecen idénticos. |
| `DG-16 ROLLBACK` | App rollback conserva datos; schema down con rows aborta; restore valida DB+files/digests. |

## 22. Trazabilidad ARC → datos

| ADR | Materialización en DATA-DES |
|---|---|
| `ARC-ADR-001` | Colecciones `promo_*`, root 1:1 y cero modificación/import de entidades Commerce. |
| `ARC-ADR-002` | API null, servicios server-only, site ownership y relaciones explícitas. |
| `ARC-ADR-003` | Draft CAS, revision inmutable, slot unique/generation y publication events. |
| `ARC-ADR-004` | Domain bindings A-label/current/unique, primary en slot y lookup local exacto. |
| `ARC-ADR-005` | Locales/content en snapshot unitario, metadata duplicada coherente y completitud. |
| `ARC-ADR-006` | Theme releases globales con renderer key allowlisted y hashes; relation pinned. |
| `ARC-ADR-007` | Contact actions tipadas en `promo.site.v1`; sin URL genérica/Landing QR fallback. |
| `ARC-ADR-008` | Rating/QR read-only sin schema; media/analytics/audit Promo separados. |
| `ARC-ADR-009` | Rules null, server enforcement, audit saneado, analytics sin PII. |
| `ARC-ADR-010` | Protected media, metadata/hash/refs y budgets heredados como publish gate. |
| `ARC-ADR-011` | Migración cero-backfill, gates DG y aprobación para cualquier shared change. |

## 23. Trazabilidad COMPAT

### 23.1 Invariantes

| COMPAT | Decisión de datos/gate |
|---|---|
| `INV-01` | Theme release reservado conceptualmente; no seed hasta aprobación Aladdin. `DG-08`. |
| `INV-02` | CTA tipado en snapshot; no schema/section de QR redundante. `DG-09`. |
| `INV-03` | Cero cambios Landing QR; flag adapter separado. `DG-15`. |
| `INV-04` | Schema/document no contiene precio/moneda/stock/cart/checkout. `DG-01`, `DG-15`. |
| `INV-05` | Sin relations a products/categories/orders/gifts/shipping. `DG-01`. |
| `INV-06` | Theme releases+schema hash; documento sin código. `DG-08`. |
| `INV-07` | Domain binding Master-only, sin token/proveedor público. `DG-06`. |
| `INV-08` | Colecciones/API directas cerradas; Admin/Master/API central. `DG-02`. |
| `INV-09` | Trece colecciones nuevas; schemas actuales intactos. `DG-01`, `DG-15`. |
| `INV-10` | Ningún dato cierra responsive; MOB-VIS continúa gate. |
| `INV-11` | `public_slug` vive en namespace Promo y el preview es privado/separado; un guard aditivo redirige la ruta Commerce solo para sitios Promo activos, sin cambiar `getCurrentStore` ni tiendas existentes. `DG-15`. |
| `INV-12` | Binding/site/entitlement/slot/revision states fallan cerrados. `DG-06`, `DG-11`. |
| `INV-13` | XFH se resuelve antes de datos; DB recibe hostname canonical confiable. `DG-06`. |
| `INV-14` | Unique exact de `hostname_ascii`; sin wildcard/suffix. `DG-06`. |
| `INV-15` | Slot generation/revision/theme/locale alimentan cache key. `DG-05`, `DG-11`. |
| `INV-16` | Domain rows locales; cero Cloudflare en render. `DG-06`. |
| `INV-17` | Todas las colecciones privadas; DTO se proyecta desde snapshot. `DG-02`. |
| `INV-18` | Documento localized nuevo; cero cambio al español Commerce. `DG-07`, `DG-15`. |
| `INV-19` | Server-only writes, entitlement+permission+tenant y audit. `DG-02`, `DG-12`. |
| `INV-20` | Entitlements false/cero, sitio draft y slot unpublished por defecto; crear datos no activa superficie pública. |

### 23.2 Criterios de aceptación

| COMPAT | Evidencia futura de datos |
|---|---|
| `AC-01` | Baseline de schema/datos/rules actual idéntico; cero backfill y regresiones antes/después. |
| `AC-02` | Diff de DATA crea solo objetos Promo; cualquier shared change se detiene para aprobación. |
| `AC-03` | Tabla canonicalización/puerto/punto final/IDN se valida antes de buscar `hostname_ascii`. |
| `AC-04` | Host/XFH/trust se resuelve fuera de DB; datos reciben un único host canonical confiable. |
| `AC-05` | Unique/state de bindings y checks site/entitlement/slot impiden rescatar host inválido. |
| `AC-06` | Matriz dos sites con FK/JSON/ref/slot/cache sin cruces. |
| `AC-07` | Rules null; matrices central/custom/guard Commerce prueban serving, redirect y fallos cerrados sin exponer draft. |
| `AC-08` | Schema, snapshot y refs no dependen de módulos/DTO/colecciones Commerce. |
| `AC-09` | Snapshot/proyección no contienen precio, stock, carrito, checkout u otra semántica Commerce; runtime se prueba después. |
| `AC-10` | Matriz CTA config/locale/encoding/invalid y analytics sin PII. |
| `AC-11` | Theme release valid/unknown/retired/blocked/tokens invalid. |
| `AC-12` | `canonical_mode`+public slug o primary binding+locale publicado derivan SEO; snapshot sin Product/Offer. |
| `AC-13` | Analytics/audit tenant-scoped, vocabulario mínimo y payload saneado. |
| `AC-14` | Cero schema/data change Landing QR y adapter flag separado. |
| `AC-15` | Rating adapter store-only y ninguna relation product/order en Promo. |
| `AC-16` | Documento completo por locale y metadata coherente. |
| `AC-17` | Datos no habilitan cierre RESP; gate MOB-VIS externo. |
| `AC-18` | Resolver usa `promo_domain_bindings` local; proveedor no participa. |

## 24. Decisiones de producto/Kraken

### 24.1 Decisiones confirmadas durante DATA-DES

| ID | Estado | Decisión vinculante para el diseño |
|---|---|---|
| `DP-02` | **CONFIRMADA 2026-08-22** | V1 Promo-only: URL pública de plataforma por `public_slug` siempre disponible; sin dominio propio es canonical. Un custom domain puede asumir canonical mediante `binding_switch` Master; la URL de plataforma redirige. Para un sitio Promo activo, la ruta Commerce genérica redirige al canonical Promo y nunca renderiza Commerce. Sin sitio Promo activo, Commerce permanece intacto. No hay modo híbrido. |
| `DP-03` | **CONFIRMADA PARA FOUNDATION 2026-08-22** | Entitlements Promo separados de planes Commerce; toda alta comienza `unassigned`, gates false y cuotas cero. DATA no hace backfill ni asigna beneficios comerciales. |
| `DP-10` | **CONFIRMADA 2026-08-22** | Hard ceilings: 50 servicios, 24 galería visible, 10 locales, 3 videos, 64 secciones, 32 CTA, 512 refs media, 30 imágenes por revisión, 200 imágenes almacenadas, WebP 100 KiB, video 25 MiB y 250 MiB por sitio. |

La decisión elimina el bloqueo de diseño y activación asociado a la convivencia de rutas. No autoriza código: el guard aditivo, los resolvers y sus regresiones deberán implementarse únicamente en los prompts correspondientes.

### 24.2 Decisiones aún pendientes

| ID | Decisión | Estado seguro mientras falta | Bloquea |
|---|---|---|---|
| `DP-01` | Aprobar este schema/nombres/JSON v1. | No crear migraciones. | DATA. |
| `DP-04` | Locales/default de Aladdin. | No revision publicable. | I18N/publicación. |
| `DP-05` | CTA channels v1, formulario/chat y privacidad. | Solo registry conceptual; form/chat inválidos. | CONTACT. |
| `DP-06` | Secciones v1, rating y enlace Landing QR. | Flags false; no se muestran. | CMS/adapters. |
| `DP-07` | Primary apex/`www`, aliases y re-verificación. | Binding no active/primary. | DOM/publicación. |
| `DP-08` | Retención audit/publication/revisions/media/analytics. | No GC; analytics disabled. | OPS/analytics/producción. |
| `DP-09` | Audiencia de preview compartible. | Solo sesión central Admin/Master. | PREVIEW externo. |
| `DP-11` | Aprobación de shared change en borrado Master. | Borrado de store con promo_site falla cerrado. | Delete/producción. |
| `DP-12` | Manifest/activo `promo.black-gold@1.0.0`. | No theme release approved/seed. | Primera publicación. |

`DP-02` queda cerrada como decisión de producto. El modelo la representa mediante `public_slug`, `canonical_mode`, `primary_binding` y `generation`; la implementación futura deberá preservar la atomicidad, fallo cerrado y regresiones negativas para tiendas Commerce no Promo.

## 25. Riesgos y mitigaciones

| Prioridad | Riesgo | Mitigación |
|---|---|---|
| Crítica | JSON contiene ID cross-tenant no cubierto por FK | Validación server + refs relacionales exactas + `DG-03`. |
| Crítica | Slot apunta a revisión/binding de otro site | Transaction invariant y tests negativos. |
| Crítica | Publicación parcial o lost update | Draft version y slot generation CAS; revision inmutable. |
| Crítica | Host duplicado/takeover | A-label exacto, partial unique current y released terminal. |
| Alta | API PocketBase filtra draft/secret | Todas rules null; protected files; proyección server-only. |
| Alta | Un sitio Promo activo expone Commerce por la ruta genérica | Guard aditivo exclusivo para `promo_sites.status=active`, redirect al canonical efectivo y regresiones negativas para toda tienda sin Promo activo. |
| Alta | Theme/media cambian debajo de revisión | Release/ready asset inmutables, hashes y refs. |
| Alta | Down borra datos en producción | Abort on rows; rollback funcional conserva schema/data. |
| Alta | Store deletion deja huérfanos | Delete guard + integración Master aditiva obligatoria. |
| Alta | Audit/analytics guarda PII/secrets | Schemas mínimos, redaction allowlist y fields prohibidos. |
| Media | Documento JSON crece o complica merge | 1 MiB, quotas, CAS y editor por paths; no last-write-wins. |
| Media | Media protegida degrada performance | Delivery content-addressed/cacheable tras auth de revision. |
| Media | Índice parcial no soportado por runtime | Preflight; alternativa transaccional sin debilitar unicidad. |
| Media | Retirar tema/asset rompe rollback | No delete referenciado; states retired/blocked/quarantined. |
| Media | Duplicación audit/publication event | Idempotency/source keys unique y derivación determinista. |
| Media | Analytics descontrolada | Disabled default, TTL index, minimal events y aggregation. |

## 26. Plan de validación de DATA futuro

### 26.1 Estática/schema

- Snapshot del schema anterior y posterior: solo `promo_*` nuevos.
- IDs/nombres/índices/rules/file protection exactos.
- `git diff --check` y revisión de migración up/down.
- Linter/test de todas las consultas con tenant explícito.

### 26.2 Migración local efímera

- Base vacía y base representativa actual.
- Up completo, up repetido según runner, down solo vacío.
- Down con row debe abortar sin perder datos.
- Cero backfill y counts/hashes de colecciones actuales iguales.
- No llamadas a red/Cloudflare/Coolify.

### 26.3 Integridad

- Unique store/site, public slug, hostname current/primary, sequence/digest/idempotency.
- Cross-site relations y JSON refs rechazadas.
- Direct API list/view/create/update/delete/realtime/file negativas para todos los roles.
- Immutability revision/media y state machines inválidas.
- CAS draft/slot/binding con carreras.

### 26.4 Publicación

- Candidate valid/invalid por locale/theme/CTA/media/quota.
- Publish success, conflict, failure y replay idempotente.
- Rollback explícito, blocked theme, quarantined asset y unpublish.
- Público solo slot revision, nunca draft/latest query.
- Sin custom domain: plataforma sirve y es canonical; domain pending no altera serving.
- Con custom domain: transición atómica a custom, redirect desde plataforma y aliases al primary.
- Retorno controlado a plataforma y fallo cerrado ante binding incoherente; nunca fallback a Commerce.

### 26.5 Compatibilidad

- Suites baseline de COMPAT (`docs/tusenda84/reportes/TS84-PROMO-COMPAT-0001-especificacion-compatibilidad.md:454-466`).
- `stores`, plans, `store_user_access`, settings, visual items, reviews, analytics, Landing QR y store deletion sin Promo conservan resultados.
- No default/capability/permission nuevo para tiendas existentes.

## 27. Verificaciones documentales realizadas

- Confirmación de base `8464b9d` equivalente a `dev`/`origin/dev` y estado preexistente del worktree.
- Lectura de ARC aprobado y mapa maestro; COMPAT ya había sido leída completa desde el worktree fuente.
- Lectura proporcional de migraciones/hook versionados de stores, planes, permisos, auditoría, visuales, reviews, analytics, media y borrado.
- Revisión de catálogo, relaciones, índices, states, transactions, rollback, gates y trazabilidad.
- Comprobación final de citas/rangos, headings, whitespace y archivos modificados.

No se ejecutaron builds, suites funcionales, migraciones, servidores, llamadas HTTP ni consultas de infraestructura porque DATA-DES es documental y esas acciones podrían alterar estado.

## 28. Próximo prompt recomendado

Después de aprobación expresa de DATA-DES, el siguiente Prompt ID del camino crítico es **`TS84-PROMO-DATA-0001`**: implementar exclusivamente la fundación de datos Promo, migraciones focales, invariantes server-side y pruebas backend acordadas.

Condiciones antes de iniciarlo:

1. `DP-01` aprobado.
2. `DP-02`, `DP-03` y `DP-10` confirmadas; DATA debe fijar IDs únicos y verificar soporte de índices del runtime.
3. Definir archivos exactos permitidos y regresiones baseline.
4. Mantener sin seed Aladdin/tema/dominio salvo autorización explícita posterior.
5. No tocar Cloudflare/Coolify/staging/producción.

`TS84-PROMO-MOB-VIS-0001` sigue como gate visual paralelo antes de RESP; no fue iniciado.

## 29. Archivos modificados

- `docs/tusenda84/reportes/TS84-PROMO-DATA-DES-0001-diseno-datos.md` — creado como único entregable de esta tarea.

Estado preexistente preservado y no modificado:

- `docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md`.
- `docs/tusenda84/reportes/TS84-PROMO-ARC-0001-arquitectura-adrs.md`.

COMPAT y AUD no se copiaron al worktree.

## 30. Confirmaciones de no implementación y no infraestructura

- No se creó, editó ni ejecutó ninguna migración.
- No se creó ni modificó ninguna colección, field, index, rule o record real.
- No se implementaron hooks, APIs, rutas, DTOs, componentes, estilos, permisos, capacidades o planes.
- No se modificaron `stores`, Commerce, settings, Landing QR, ratings, i18n actual, analytics actual, auditoría actual, Master, Admin, apps ni APKs.
- No se sembró Aladdin's Carpet, tema, dominio, entitlement, draft, revisión o publicación.
- No se consultó ni modificó PocketBase desplegado, Cloudflare, Coolify, staging o producción.
- No se leyeron ni expusieron secretos.
- No se hizo push, merge, despliegue, release ni cambio externo.
- No se inició `TS84-PROMO-DATA-0001`, `TS84-PROMO-MOB-VIS-0001` ni implementación alguna.
