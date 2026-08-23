# TS84-PROMO-PUBCFG-0001 — Contrato público saneado y edición privada

## 1. Ficha de control

| Campo | Resultado |
|---|---|
| Proyecto | Tu Senda 84 / Tiendas Promo |
| Prompt ID | `TS84-PROMO-PUBCFG-0001` |
| Estado | **COMPLETADO** |
| Fecha | 2026-08-23 |
| Base | Rama local `dev`, commit `ff4b07f` |
| Dependencias | DATA-0001 y PERM-0001 completados |
| Migración | **No requerida** |
| Base persistente | No se usó ni modificó `backend-powerzona/pb_data` |
| Infraestructura externa | No consultada ni modificada |
| Commit de este cierre | No creado; pendiente de autorización separada |

## 2. Resultado

Se implementó una capa backend aditiva para Tiendas Promo que reutiliza las trece colecciones privadas de DATA y los action keys, sesiones, membresía, principal, soporte Master, permisos y capabilities de PERM. No se creó modelo, identidad, autorización, almacenamiento, tema, publicación ni resolución de dominio paralelos.

La capa incorpora:

1. un resolver público v1 exclusivamente por `promo_sites.public_slug`, que es el único contexto público canónico aprobado antes de DOM-CORE;
2. una proyección pública construida por allowlist positiva desde una sola revisión señalada por el slot activo;
3. lectura privada versionada del único draft del tenant autenticado;
4. reemplazo privado versionado del documento completo mediante CAS y transacción;
5. validación estructural estricta de `promo.site.v1`, referencias tenant-scoped, cuotas y digests canónicos; y
6. derivación de permisos adicionales según las partes modificadas del documento, para que `promo.content.manage` no conceda tema, apariencia, traducciones, media, contacto, reseñas o Landing QR de forma implícita.

No se implementaron preview, creación de candidata, publicación, rollback, custom host, shell público, CMS, temas, i18n, entrega de medios, contacto ejecutable, SEO, analítica ni caché de PERF.

## 3. Endpoints finales

| Método | Ruta | Contexto | Contrato |
|---|---|---|---|
| `GET` | `/api/pz/promo/public/v1/sites/{publicSlug}` | Público; slug Promo exacto en path; query vacía | `promo.public.projection.v1` |
| `POST` | `/api/pz/promo/private/v1/draft/read` | Auth central; tenant derivado de sesión o header Master explícito | Request `promo.draft.read.v1`; response `promo.draft.v1` |
| `POST` | `/api/pz/promo/private/v1/draft/update` | Auth central; tenant derivado de sesión o header Master explícito | Request `promo.draft.update.v1`; response `promo.draft.v1` |

Las rutas privadas usan `requireAuth`, body limit, `private, no-store`, `noindex, nofollow, noarchive`, `no-referrer` y `nosniff`. La API pública también queda `no-store/noindex` de forma conservadora hasta PERF/SEO; PUBCFG no inaugura caché pública.

No existe endpoint genérico con `filter`, `sort`, `fields`, `expand`, `realtime`, IDs de tenant o revisión. Las colecciones `promo_*` conservan sus cinco reglas CRUD directas en `null` y los files continúan protegidos.

## 4. Contrato server-only final

### 4.1 Contexto público permitido en esta fase

La única entrada de tenancy es `publicSlug` canonical en el path. El backend resuelve y fija internamente:

```text
public_slug exacto
  -> promo_sites único, contract_version=1, status=active
  -> stores relacionado, status=active
  -> promo_site_entitlements único, vigente y promo_site_enabled
  -> promo_publication_slots único, state=active, canonical_mode=platform,
     primary_binding vacío y generation >= 1
  -> published_revision exacta del mismo site
  -> theme_release exacto y compatible
  -> media refs exactas de esa revisión
  -> proyección allowlisted
```

`store_id`, `site_id`, `revision_id`, binding, host custom, tenant alternativo, slug Commerce, “última revisión”, draft, candidata, query parameters y body no forman parte de este contexto.

PUBCFG rechaza `canonical_mode=custom`: DOM-CORE todavía no existe y el endpoint por slug de plataforma no suplanta al futuro HostResolver. No consulta DNS, Cloudflare, Coolify ni otro proveedor.

### 4.2 Coherencia obligatoria

Antes de proyectar, el servicio exige conjuntamente:

- store activo, site Promo activo y `contract_version=1`;
- entitlement asignado/vigente, gate raíz y cuotas suficientes;
- slot único activo, platform-only, generación válida y revisión exacta;
- revisión `schema_version=1` y `snapshot_sha256` igual al SHA-256 del JSON canónico UTF-8;
- `default_locale` y `published_locales_json` idénticos a los del snapshot;
- theme relation del snapshot, mismo `theme_id/version`, contrato 1 y estado `approved`, `deprecated` o `retired`, nunca `draft` o `blocked`;
- cada media ref del snapshot enlazada por una row exacta de `promo_revision_media_refs`;
- asset del mismo site, mismo purpose y estado `ready`; y
- slot sin cambios de generation/revision/mode al terminar la lectura lógica.

Cualquier ausencia, duplicado, cruce, digest inválido, schema desconocido, capability insuficiente, slot no activo o registro corrupto falla cerrado con una respuesta pública genérica sin enumerar la causa.

### 4.3 Contexto privado

Para Admin/Staff el tenant proviene únicamente del usuario recargado y su relación `store`. Para Master proviene exclusivamente de `X-PZ-Promo-Store` y requiere el action key reservado `promo.master.support`.

En ambos casos se reutilizan:

- sesión vigente por `tokenKey` central;
- usuario `active`;
- rol central conocido;
- pertenencia exacta o soporte Master explícito;
- bloqueo por plan existente;
- clasificación 1:1 `promo_sites`;
- estado de store/site;
- entitlement vigente;
- action key canónico; y
- permiso efectivo o autoridad Master reservada.

El contexto server-only nunca se serializa como record. Store/site/entitlement/draft/revision/theme/media records, actor IDs, permisos y capabilities permanecen internos.

## 5. Contrato privado editable `promo.site.v1`

### 5.1 Forma exacta del documento

El root acepta exactamente:

| Campo | Forma allowlisted |
|---|---|
| `contract` | Literal `promo.site.v1` |
| `system_catalog_version` | Literal `promo.system.v1` |
| `locales` | `{ default, published[] }`, BCP 47 canonical y ordenado |
| `theme` | `{ theme_id, version, tokens }`; release exacto; tokens `{}` hasta THEME-0001 |
| `identity` | `{ public_business_key }`, referencia opaca acotada |
| `section_order` | Keys únicas y en el mismo orden que `sections` |
| `sections` | Objetos exactos `{ key, type, variant, visible, config, media_use_keys }` |
| `media_refs` | Mapa `use_key -> { asset_id, purpose }` |
| `contact` | `{ enabled, primary_action_key, secondary_action_keys, actions }` |
| `content_by_locale` | Contenido localized tipado por locale |
| `adapters` | `{ store_rating: { enabled }, landing_qr_link: { enabled } }` |

Tipos de sección v1: `hero`, `services`, `featured_work`, `gallery`, `owner`, `store_rating`, `contact` y `footer`. La única variante aceptada antes de THEME es `default`. Cada tipo posee un config exacto; no se aceptan unknown keys.

Tipos de contacto estructuralmente conocidos: `whatsapp`, `phone`, `email`, `internal_form` y `approved_live_chat`. WhatsApp/teléfono aceptan E.164 y email una dirección acotada. `internal_form` y `approved_live_chat` no pueden quedar enabled antes de sus contratos de privacidad/adapter. No se aceptan URL genérica, protocolo libre, snippet o Landing QR como action.

El contenido localized separa exactamente identidad, navegación, secciones, textos de contacto, alt/decoration de media y SEO. Los límites DATA-DES de nombre, heading, resumen, cuerpo, caption, alt, CTA y SEO se validan en backend. Texto con HTML, código activo o URL con scheme se rechaza.

### 5.2 Límites e integridad

El backend valida:

- documento máximo 1 MiB y profundidad máxima 20;
- arrays/objetos acotados;
- 64 secciones, 32 actions, 512 media refs y patterns de keys;
- 50 servicios, 24 galería visible, 10 locales, 3 videos y 250 MiB según hard ceilings y entitlement efectivo;
- media del mismo site y purpose exacto;
- estados `uploaded/processing/ready` para referencias de draft;
- release de tema exacto `approved/deprecated` para una selección de draft;
- refs de sección/contacto existentes y sin duplicados;
- contenido público completo por locale cuando el mismo contrato se valida como revisión publicada; y
- JSON canónico con digest determinista.

Draft puede permanecer incompleto de forma estructuralmente segura; una revisión pública no. PUBCFG no crea candidatas ni publica.

### 5.3 Read/update y CAS

Request de lectura exacto:

```json
{ "contract": "promo.draft.read.v1" }
```

Request de actualización exacto:

```json
{
  "contract": "promo.draft.update.v1",
  "expected_version": 3,
  "document": { "contract": "promo.site.v1" }
}
```

El ejemplo abreviado no representa un documento válido completo; únicamente muestra los tres fields del envelope.

La escritura:

1. autoriza tenant y `promo.content.manage`;
2. bloquea la row exacta del draft dentro de una transacción;
3. relee y valida el digest del draft vigente;
4. compara `expected_version`;
5. deriva y exige los action keys granulares aplicables;
6. valida tema, referencias, capabilities y cuotas;
7. calcula SHA-256 canónico;
8. si el digest es idéntico responde `changed=false` sin escribir ni incrementar versión;
9. si cambia, guarda documento/digest/version+1/actor y un evento focal saneado en la misma transacción.

Conflicto devuelve 409 `promo_draft_conflict`; nunca aplica last-write-wins.

### 5.4 Permisos derivados por cambio

| Parte modificada | Action key adicional |
|---|---|
| Cualquier cambio | `promo.content.manage` |
| `theme.theme_id/version` | `promo.theme.select` |
| `theme.tokens` | `promo.appearance.manage` |
| Locales múltiples o contenido fuera del locale default | `promo.translations.manage` |
| Media refs o alt | `promo.media.manage` |
| Media de video modificada | `promo.media.video.manage` |
| Contacto/config/textos de contacto | `promo.contact.manage` |
| Adapter de rating | `promo.reviews.manage` |
| Adapter Landing QR | `promo.landing_qr.bridge.manage`, incluido su doble gate Commerce existente |

Master usa primero `promo.master.support`; luego se aplican estados y capabilities operativas de los action keys afectados sin guardar grants asignables ni crear una autoridad nueva.

## 6. Contrato público `promo.public.projection.v1`

### 6.1 Campos allowlisted

| Bloque | Campos públicos |
|---|---|
| Envelope | `ok`, `contract` |
| Site | `site.public_slug` |
| Catálogo | `system_catalog_version` |
| Locales | `locales.default`, `locales.published[]` |
| Tema | `theme.theme_id`, `theme.version`, `theme.tokens` validados |
| Composición | `section_order` visible; secciones visibles con `key`, `type`, `variant`, config tipado y use keys |
| Media | Logical `key`, `purpose`, `kind`, `width`, `height`, `duration_ms`; sin asset ID, filename o URL |
| Contacto | Estado, action keys y actions con solo `key/type/enabled`; sin config/destino |
| Contenido | Identidad pública localized, navegación visible, contenido de sección visible, textos CTA, alt/decoration y SEO |
| Adapters | Solo flags públicos `store_rating.enabled` y `landing_qr_link.enabled` |

Las secciones hidden y su navegación/contenido no se proyectan. Contact actions disabled tampoco se proyectan.

### 6.2 Campos y semánticas expresamente excluidos

- IDs de store, site, slot, revisión, theme release, media asset, binding, actor o usuario.
- Sequence, generation, digest, schema interno, source draft version, timestamps e historial.
- Drafts, candidatas, revisiones no publicadas y diagnósticos de preview.
- Roles, permisos, permisos reservados, templates, plan, capabilities y entitlements raw.
- Email/teléfono internos, owner record, `tokenKey`, password, tokens, secretos, challenge o config proveedor.
- `provider_reference`, evidencia/verificación de dominio, bindings privados y records PocketBase.
- Config/destino crudo de contacto; no se generan URLs, `tel:`, `mailto:`, WhatsApp, HTML, CSS, JavaScript, scripts, embeds ni redirect targets en PUBCFG.
- Filtros, sorts, fields, expands, realtime y payload/query reflejado.
- Products, categories Commerce, SKU, precio, moneda, oferta, promoción e-commerce, stock, inventario, carrito, checkout, shipping, coupon, gift, order o verified purchase.

La respuesta se construye como objeto nuevo campo por campo; no serializa un record privado para después eliminar propiedades.

## 7. Matriz actor × tienda × estado × capability × permiso × operación

| Actor/estado | Tipo/tenant | Estado store/site | Capability | Permiso/autoridad | Operación | Resultado |
|---|---|---|---|---|---|---|
| Público | Promo A por slug exacto | active/active; slot active platform | Gate raíz/cuotas presentes | No aplica | Leer publicada | Permitido; revisión exacta allowlisted |
| Público | Promo A | slot inactive/custom/unpublished | Cualquiera | No aplica | Leer publicada | 404 genérico; sin draft/latest fallback |
| Público | Promo A | revisión/digest/theme/media incoherente | Presente | No aplica | Leer publicada | 404 genérico, fail-closed |
| Público | Promo A | active/active | Capability ausente/vencida | No aplica | Leer publicada | 404 genérico |
| Público | Commerce o tenant unknown | Cualquiera | Incluso grant inyectado | No aplica | Leer Promo | 404 genérico |
| Master activo, sesión viva | Promo A explícita | store activo; site draft/active/paused | Presente | `promo.master.support` reservado | Read draft | Permitido |
| Master activo, sesión viva | Sin header, Promo B no declarada o Commerce | Cualquiera | Cualquiera | Reservado | Read/update | 403/404 saneado |
| Master activo, sesión viva | Promo A explícita | Estado operativo permitido | Presente | Soporte reservado + gates de action | Update CAS | Permitido |
| Administrador principal activo | Su Promo A | Estado permitido | Presente | Autoridad implícita PERM | Read/update CAS | Permitido según capabilities |
| Administrador secundario activo | Su Promo A | Estado permitido | Presente | `promo.site.view` | Read draft | Permitido |
| Administrador secundario activo | Su Promo A | Estado permitido | Presente | `promo.content.manage` | Editar contenido default | Permitido |
| Administrador secundario activo | Su Promo A | Estado permitido | Presente | Sin `promo.theme.select` | Cambiar tema | 403; UI no es barrera |
| Staff activo | Su Promo A | Estado permitido | Presente | `promo.site.view` | Read draft | Permitido |
| Staff activo | Su Promo A | Estado permitido | Presente | Sin manage | Update draft | 403 |
| Cualquier Admin/Staff | Promo B | Cualquiera | Cualquiera | Incluso grant A | Read/update | 404 saneado por aislamiento |
| Usuario suspendido | Su Promo | Cualquiera | Presente | Persistido | Read/update | 401/403 |
| Usuario bloqueado por plan | Su Promo | Cualquiera | Presente | Persistido | Read/update | Denegado por PERM; grant no se borra |
| Sesión revocada | Su Promo | Permitido | Presente | Persistido | Read/update | 401/403; token anterior no sirve |
| Usuario Commerce | Commerce | Active | Incluso grants Promo inyectados | Cualquiera | Read/update Promo | 404 `store_not_promo` saneado |
| Actor válido | Promo | Permitido | Ausente/excede cuota | Con permiso | Update | 403 capability denied |
| Actor válido | Promo | Permitido | Presente | Falta permiso específico | Cambio granular | 403 permission denied |
| Cualquier cliente | Cualquier tipo | Cualquiera | Cualquiera | Cualquiera | CRUD/realtime directo `promo_*` | Rechazado por rules `null` |

El frontend no fue modificado. Por tanto, ocultar controles no es ni se presenta como enforcement; todas las decisiones de acceso de PUBCFG ocurren en backend.

## 8. Archivos modificados o añadidos

### Backend

- `backend-powerzona/pb_hooks/pz_promo_pubcfg_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_pubcfg_api_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_pubcfg.pb.js`
- `backend-powerzona/tests/pz_promo_pubcfg.test.cjs`
- `backend-powerzona/tests/pz_promo_pubcfg_http_runtime.test.cjs`

### Documentación

- `docs/tusenda84/reportes/TS84-PROMO-PUBCFG-0001-implementacion.md`

No se modificó frontend, migraciones, schemas, roles, permisos, action keys, capabilities, planes, templates, defaults, rutas Commerce ni comportamiento efectivo existente.

## 9. Migraciones

**Ninguna.** PUBCFG consume el schema DATA y los fields PERM existentes. No hubo migrate-up/down específico, backfill, seed, Aladdin real, dominio, publicación ni registro persistente.

Los gates PocketBase se ejecutaron exclusivamente sobre directorios temporales bajo el temporal del sistema; cada prueba verifica el path y elimina DB/files en `finally`. No se usó `backend-powerzona/pb_data`.

## 10. Pruebas ejecutadas y resultados

### 10.1 Baseline focal previo

```text
node --test tests/pz_promo_data.test.cjs tests/pz_promo_permissions.test.cjs tests/pz_promo_permissions_api.test.cjs
```

Resultado: **27/27 aprobadas**.

### 10.2 Pruebas nuevas PUBCFG

```text
node --test tests/pz_promo_pubcfg.test.cjs tests/pz_promo_pubcfg_http_runtime.test.cjs
```

Resultado: **9/9 aprobadas**, cero fallos y cero omisiones.

El gate usa PocketBase local efímero y cubre:

- contrato exacto y digest canónico;
- unknown/extra keys, Commerce fields, HTML/JS, URL y theme token desconocido;
- proyección positiva sin IDs, destinos, secretos ni semántica Commerce;
- Master, principal, secundario, staff, suspendido y sesión revocada;
- Commerce frente a Promo;
- dos tiendas Promo aisladas;
- permisos granulares y capability ausente;
- read/update con CAS correcto y conflicto;
- store/site/revision/filter/sort/fields/expand inyectados;
- draft y candidata no publicados;
- revisión publicada exacta frente a digest corrupto;
- slot activo, paused y custom antes de DOM-CORE;
- REST directo cerrado para Admin y Master;
- auditoría focal sin documento ni secretos.

DATA runtime se ejecutó adicionalmente antes del gate nuevo y pasó **1/1**, verificando carga de hooks, 13 colecciones privadas, 42 índices, aislamiento, límites, REST/realtime y rollback efímero.

### 10.3 Regresión backend completa

```text
node --test
```

Resultado: **799 tests; 792 aprobados, 0 fallos, 7 omitidos**. Las omisiones son runtimes que exigen URLs/credenciales externas o configuración no autorizada. Los runtimes PocketBase locales descartables de DATA, PERM, PUBCFG, planes, equipo, Master/Admin, Landing QR, catálogo, pedidos, promociones, seguridad y módulos Commerce protegidos sí se ejecutaron.

La suite mantiene explícitamente el catálogo de **29 permisos Commerce ejecutables** —los 28 históricos más `marketing.push.manage` preexistente—, cinco reservados, templates y capacidades Commerce sin cambios.

### 10.4 Frontend y build

```text
node --test
npm.cmd run build
```

Resultado: **655/655 pruebas frontend aprobadas** y build Astro completado. Persisten tres warnings preexistentes de `getStaticPaths()` ignorado en páginas dinámicas de categoría, subcategoría y producto; no están relacionados con PUBCFG.

### 10.5 Calidad

- `node --check` sobre libs/tests nuevos: aprobado.
- `git diff --check` y verificación no-index de archivos nuevos: sin errores de whitespace.
- Dependencias añadidas: ninguna.
- Push, merge, commit, deploy y release: no realizados.

## 11. Riesgos residuales y límites intencionales

| Riesgo/límite | Tratamiento actual |
|---|---|
| Custom domain todavía no resuelve | PUBCFG sirve solo slug platform y rechaza slot custom; DOM-CORE deberá aportar HostResolver exacto |
| Tokens de tema aún no tienen schema runtime | Solo se acepta `{}`; THEME-0001 registrará schemas allowlisted, sin abrir claves arbitrarias |
| Catálogo i18n general aún no existe | Se fija `promo.system.v1` y se valida contenido completo, pero no se implementan negociación/fallback/selector |
| Media aún no tiene delivery | Público recibe use keys y metadata mínima, nunca asset ID, filename o URL; MEDIA-0001 añadirá entrega protegida |
| Contacto aún no es ejecutable | Público recibe action key/type/textos, nunca config o destino; CONTACT deberá compilar canales tipados |
| Publicación no está implementada | PUBCFG solo lee slots/revisiones sintéticas o futuras; no crea candidata, no cambia slot y no hace rollback |
| Caché/SEO final no implementados | Todas las APIs quedan no-store/noindex; PERF/SEO decidirán caché y representación indexable |
| Auditoría Promo general sigue pendiente | Solo se escribe el evento focal saneado de update draft; lectores, retención y cobertura general pertenecen a AUDIT-0001 |
| UI Promo no existe | Intencional; ADMIN-SHELL/CMS no fueron iniciados y backend sigue siendo única autoridad |

## 12. Siguiente Prompt ID habilitado

Según el orden del mapa maestro, el siguiente Prompt ID del camino es **`TS84-PROMO-AUDIT-0001`**: extender auditoría de actividad a entidades y acciones Promo con before/after saneado y acciones críticas registradas. **No fue iniciado.**

Al completar PUBCFG también quedan satisfechas sus dependencias directas para trabajos posteriores como I18N, THEME y MEDIA, pero este cierre no los inicia ni altera el orden/gates del mapa.

## 13. Confirmaciones de cierre

- No se consultó ni modificó PocketBase desplegado.
- No se consultaron ni modificaron Cloudflare, Coolify, staging o producción.
- No se leyeron secretos; las pruebas eliminaron del environment claves sensibles y generaron valores sintéticos.
- No se inició AUDIT, I18N, THEME, MEDIA, PUBLISH, DOM-CORE, ADMIN-SHELL, CMS, SHELL ni otro prompt posterior.
- No se modificó ningún proceso Commerce ni se concedió proyección/capability Promo a una tienda Commerce.
- No se hizo push, merge, despliegue, release ni commit.
