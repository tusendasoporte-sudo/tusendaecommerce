# TS84-PROMO-MEDIA-0001 — Pipeline de medios Promo

- Fecha de cierre técnico: 2026-08-23
- Estado: **COMPLETADO**
- Base solicitada y verificada antes de modificar: rama local `dev`, `HEAD 34c0ada` (`TS84-PROMO-THEME-0001`)
- Estado inicial del worktree: limpio
- Estado de entrega: cambios locales visibles en `dev`; **sin commit, push, merge, despliegue ni release**
- Dependencias reutilizadas: DATA-0001, PERM-0001, PUBCFG-0001, AUDIT-0001, I18N-0001 y THEME-0001

## 1. Resultado y alcance

Se implementó el pipeline MEDIA de Tiendas Promo sobre `promo_media_assets`, sin crear almacenamiento, permisos o publicación paralelos. El backend continúa siendo la única fuente de verdad para tenant, ownership, estado, digest, metadata, cuotas, poster, referencias de revisión y entrega pública.

El cierre aporta:

1. admisión server-side de JPEG, PNG, WebP y AVIF para normalización de imagen;
2. conversión única a WebP, eliminación de EXIF/perfiles y nombre aleatorio de 128 bits;
3. perfiles cerrados para Hero, servicio, galería/trabajo destacado, propietario, footer, social y poster;
4. validación backend de bytes, firma/MIME real, SHA-256, dimensiones, duración, tamaño, bitrate y metadata;
5. admisión de MP4/WebM optimizados para Hero o galería, siempre con poster `ready` del mismo tenant;
6. variantes WebP responsivas deterministas y acotadas, validadas también después de generarlas;
7. catálogo y preview privados con gates PERM y headers `private/no-store`;
8. entrega pública content-addressed ligada al slug, `use_key`, digest y revisión publicada exacta;
9. integración con PUBCFG para referencias de media tipadas y con I18N para `alt`/decorative del locale efectivo;
10. metadata de carga accesible y performance-first para imagen y video;
11. retiro auditado que falla cerrado cuando el asset sigue en draft o en la revisión publicada activa; y
12. pruebas unitarias, frontend, runtime PocketBase real, aislamiento y regresión Commerce.

No se implementaron editor CMS/galería, UI visual, renderer Hero, publicación/rollback, dominio, CDN, Cloudflare, shell público, SEO, analítica o transcodificación de video. Esas responsabilidades permanecen en sus Prompt IDs posteriores.

## 2. Contratos respetados

La implementación se cerró contra:

- `docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md`;
- `docs/tusenda84/reportes/TS84-PROMO-ARC-0001-arquitectura-adrs.md`;
- `docs/tusenda84/reportes/TS84-PROMO-DATA-DES-0001-diseno-datos.md`;
- `docs/tusenda84/reportes/TS84-PROMO-DATA-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-PERM-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-PUBCFG-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-AUDIT-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-I18N-0001-implementacion.md`; y
- `docs/tusenda84/reportes/TS84-PROMO-THEME-0001-implementacion.md`.

Decisiones aplicadas:

- DATA conserva ownership de `promo_media_assets`, `promo_revision_media_refs`, schema, estados, índices, file protegido, hard ceilings y reglas `null`.
- PERM conserva `promo.site.view`, `promo.media.manage`, `promo.media.video.manage`, sesión, tenant, capabilities y contexto Master explícito.
- PUBCFG conserva `promo.site.v1`, draft CAS, revisión exacta y `promo.public.projection.v1`; MEDIA amplía únicamente la validación/proyección de los assets ya referenciados.
- AUDIT conserva el writer único y las acciones aprobadas `promo.media.create` / `promo.media.status.update`.
- I18N conserva su negociación y añade al medio proyectado solo el `alt`/decorative del locale efectivo, sin mezclar idiomas.
- THEME se copia intacto en la misma proyección; MEDIA no interpreta renderer, tokens o CSS.
- El cliente no declara `store_id`, `site_id`, revision, actor, URL, ruta, filename final, filter, sort, fields o expand.
- El asset protegido de PocketBase nunca se entrega por `/api/files`; toda entrega pasa por un resolver privado o público tipado.

## 3. Pipeline

### 3.1 Imágenes

1. La ruta SSR Admin revalida auth central, contexto de tienda y same-origin.
2. El input admite exclusivamente extensión y MIME coherentes de JPEG, PNG, WebP o AVIF, con máximo temporal de 8 MiB y 36 millones de píxeles.
3. Sharp detecta el contenido real, aplica orientación, rechaza animación y normaliza a WebP sin metadata heredada.
4. La conversión reduce dimensiones dentro del perfil y recorre escalas/calidades cerradas hasta producir un WebP de máximo 100 KiB.
5. El nombre original se descarta; se genera `<128-bit-hex>.webp` y SHA-256 de los bytes normalizados.
6. PocketBase vuelve a leer el archivo completo, recalcula SHA-256, valida RIFF/WebP, dimensiones y tamaño. Solo permite chunks de imagen; EXIF, XMP, ICC, animación, chunks desconocidos o datos anexados fallan cerrados.
7. Se crea el record tenant-scoped en `processing`, se generan variantes allowlisted, se comprueba que cada derivado exista y no exceda 100 KiB, y una segunda transacción cambia a `ready` y escribe AUDIT.
8. Un fallo elimina record y prefix de archivos; no deja un asset parcialmente publicable.

El original aportado por el usuario nunca se persiste. Solo se guarda la salida WebP ya normalizada y sus derivados deterministas.

### 3.2 Video y poster

- Formatos finales: MP4 o WebM.
- Usos de video v1: `hero` y `gallery`.
- El contenedor se examina tanto en SSR como en PocketBase; el body no decide MIME, dimensiones o duración.
- MP4 exige `ftyp`, `moov`, track de video, dimensiones y duración coherentes; WebM exige EBML/WebM, Info y video track.
- Se rechazan contenedores corruptos y bloques conocidos de metadata privada (`meta`, `udta`, `uuid`, `ilst`, Tags o Attachments).
- El video no se transcodifica en v1: debe llegar ya optimizado y cumplir simultáneamente peso, bitrate, resolución y duración.
- Cada video exige `poster_asset_id` con record `image/ready/video_poster` del mismo `promo_site`; un poster de otro tenant, retirado o de propósito distinto se trata como ausente.
- El video permanece `preload=none`; el contrato prohíbe autoplay y exige controles. Reduced motion y ahorro de datos usan el poster.

### 3.3 Estado, duplicados y retiro

- Alta válida: `processing → ready`.
- La unicidad DATA `(site, sha256)` se verifica también antes de crear; no hay deduplicación cross-tenant.
- Los records `ready` no se reescriben. Sustituir exige un asset nuevo.
- Retiro permitido: `ready → retired`, con `expected_status=ready`.
- El retiro se bloquea si el asset aparece en el único draft del sitio, en la revisión de un slot público activo o es el poster de un video `processing/ready`.
- Una lectura, error de consulta o estado estructural ambiguo falla cerrado; no se abre cuota ni se autoriza retiro.
- Los archivos retirados no se borran automáticamente: se conservan para evidencia/retención hasta que un prompt de GC defina una política aprobada.

## 4. Límites estrictos

### 4.1 Límites globales y por entitlement

| Límite | Valor |
|---|---:|
| Input raster temporal SSR | 8 MiB |
| WebP persistido, original o derivado | 100 KiB |
| Video persistido | 25 MiB |
| Duración de video | 30 minutos |
| Bitrate máximo calculado | 8 Mbps |
| Resolución máxima de video | 1920×1080 |
| Imágenes almacenadas por sitio | 200 |
| Videos almacenados por sitio | 3 |
| Almacenamiento canónico hard ceiling | 250 MiB |
| Imágenes referenciadas por revisión | 30 |
| Assets visibles de galería | 24 |
| Referencias media del documento | 512 |

`max_storage_bytes` y `max_videos` de PERM pueden reducir esos techos. Records retirados continúan contando mientras sus archivos permanezcan almacenados. Las variantes tienen conteo finito por perfil y cada archivo se valida contra 100 KiB.

### 4.2 Dimensiones y variantes por propósito

| Propósito | Dimensiones admitidas | Anchos responsivos máximos | Carga pública |
|---|---|---|---|
| `hero` | 640×320 a 1920×1080 | 480, 768, 1280 + original | Solo el primer medio del primer Hero visible es eager/high |
| `service` | 240×240 a 1200×1200 | 320, 640, 960 + original | lazy |
| `gallery` | 320×240 a 1600×1600 | 480, 768, 1280 + original | lazy |
| `owner` | 320×400 a 1200×1600 | 320, 640, 960 + original | lazy |
| `footer` | 480×120 a 1600×800 | 480, 960, 1280 + original | lazy |
| `social` | 600×315 a 1200×630 | 600, 1200 + original | lazy |
| `video_poster` | 640×360 a 1600×900 | 480, 960, 1440 + original | hereda prioridad solo si cubre el Hero LCP |

Un ancho de preset mayor o igual al original no crea un archivo redundante. PUBCFG comprueba además la compatibilidad sección→propósito: Hero→hero, servicios→service, trabajo destacado/galería→gallery, propietario→owner y footer→footer.

## 5. Contratos y rutas

### 5.1 Backend privado

| Método | Ruta | Request/response | Gate |
|---|---|---|---|
| `POST` | `/api/pz/promo/private/v1/media/upload` | `promo.media.upload.v1` → `promo.media.asset.v1` | imagen: `promo.media.manage`; video: `promo.media.video.manage` |
| `POST` | `/api/pz/promo/private/v1/media/list` | `promo.media.list.v1` → `promo.media.catalog.v1` | `promo.site.view` |
| `POST` | `/api/pz/promo/private/v1/media/retire` | `promo.media.retire.v1` → `promo.media.asset.v1` | `promo.media.manage` |
| `GET` | `/api/pz/promo/private/v1/media/{assetId}/{digest}/{filename}` | archivo exacto allowlisted | `promo.site.view` y ownership tenant |

Todos los JSON/form-data son exactos, la query debe estar vacía, el body tiene límite explícito y las respuestas privadas usan no-store, noindex, nosniff y no-referrer.

### 5.2 Backend público

| Método | Ruta | Contrato |
|---|---|---|
| `GET` | `/api/pz/promo/public/v1/sites/{publicSlug}/media/{useKey}/{digest}/{filename}` | `promo.media.delivery.v1` derivado de `promo.public.projection.v1` |

La ruta pública no acepta record IDs o revision IDs del cliente. El resolver exige:

- slug exacto de un sitio Promo activo;
- slot `active/platform`, sin binding custom;
- revisión, digest, locales, Theme y entitlement coherentes;
- `promo_revision_media_refs` exactas;
- asset `ready` del mismo site y propósito del documento;
- poster del mismo site para video; y
- generación del slot sin cambio antes de responder.

La query debe estar vacía; parámetros como `download`, filters o selectors se rechazan.

El URL es content-addressed por SHA-256 y la respuesta usa `public, max-age=31536000, immutable`. Al cambiar la revisión activa, una URL que ya no pertenece a ella deja de resolverse; no cae a draft, última revisión, otro locale, otro tenant o Commerce.

### 5.3 Adaptador SSR Admin

`/api/admin/promo-media` aporta GET/POST/DELETE del mismo origen. Reutiliza `refreshAuthFromCookie`, `requireCurrentStoreForAdmin`, el contexto Master existente y el slot de conversión compartido del pipeline WebP Commerce sin modificar su contrato.

El adaptador no escribe en disco, no recibe destino de backend y compara la respuesta PocketBase contra los metadatos enviados antes de devolver éxito.

## 6. Metadatos accesibles y públicos

### Imagen

- `key`, `purpose`, `kind`, `width`, `height`;
- `src`, `srcset` estructurado con ancho/alto, `sizes` allowlisted;
- `loading`, `fetch_priority` y `decoding=async`;
- `accessibility.alt` y `accessibility.decorative` desde el único locale I18N efectivo.

Una revisión pública exige para cada `use_key` un alt no vacío o `decorative=true` con alt vacío. No hay fallback por campo desde otro idioma.

### Video

- MIME, ancho, alto y `duration_ms` verificados;
- `src` content-addressed;
- `preload=none` para transferir cero bytes de video antes de interacción;
- `controls_required=true`, `autoplay=false`, `plays_inline=true`;
- `reduced_motion=poster` y `save_data=poster`;
- poster responsivo con el mismo contrato de imagen y alt localizado asociado al `use_key`.

Ni la proyección pública ni I18N exponen asset ID, poster ID, site/store ID, SHA interno como campo, actor, filename original, record, permiso, capability, secreto o PII.

## 7. Actores y operaciones

| Actor/estado | Listar/preview | Subir imagen | Subir video | Retirar | Resultado |
|---|---|---|---|---|---|
| Público | No | No | No | No | Solo delivery de revisión publicada exacta |
| Admin principal Promo activo | Sí | Sí | Sí si entitlement video | Sí | Permisos implícitos del principal, cuotas backend |
| Admin secundario/Staff | Con `promo.site.view` | Con `promo.media.manage` | Con permiso media + gates de video | Con `promo.media.manage` | Ausencia de permiso/capability falla cerrada |
| Master activo sin contexto | No | No | No | No | `promo_store_context_required` |
| Master con `X-PZ-Promo-Store` Promo válido | Sí | Sí | Sí según capabilities del tenant | Sí | Contexto explícito y AUDIT con actor real |
| Usuario Commerce | No | No | No | No | `store_not_promo` |
| Usuario suspendido/bloqueado/sesión revocada | No | No | No | No | Denegado por PERM/auth central |
| Actor A contra asset/poster/revisión B | No | No | No | No | 404/invalid reference; sin enumeración ni mezcla |

## 8. Auditoría

Se reutiliza exclusivamente `createPromoAudit`:

- el alta lista crea `promo.media.create` dentro de la transacción que fija `ready`;
- el retiro crea `promo.media.status.update` dentro de la misma transacción de estado;
- snapshots allowlisted: kind, purpose, status, MIME detectado, bytes, ancho, alto y duración;
- source keys deterministas por asset/estado;
- no se auditan bytes, archivo, alt, contenido, IDs tenant, poster ID, filename, token, record, secreto o PII.

Un fallo de audit revierte el cambio transaccional; no se informa éxito sin evidencia.

## 9. Archivos modificados

### Nuevos

- `backend-powerzona/pb_hooks/pz_promo_media_lib.js` — contratos, límites, probes, SHA-256, perfiles y descriptores.
- `backend-powerzona/pb_hooks/pz_promo_media_api_lib.js` — operaciones tenant-scoped, cuotas, derivados, retiro, delivery y AUDIT.
- `backend-powerzona/pb_hooks/pz_promo_media.pb.js` — rutas privadas/pública y bloqueo de file directo.
- `backend-powerzona/tests/pz_promo_media.test.cjs` — pruebas focales backend.
- `frontend-powerzona/src/lib/promoMedia.ts` — normalización raster y validación de video.
- `frontend-powerzona/src/pages/api/admin/promo-media.ts` — adaptador SSR protegido.
- `frontend-powerzona/tests/promoMedia.test.mjs` — pruebas focales frontend.
- `docs/tusenda84/reportes/TS84-PROMO-MEDIA-0001-implementacion.md` — este reporte.

### Actualizados

- `backend-powerzona/pb_hooks/pz_promo_pubcfg_lib.js` — compatibilidad sección/propósito, descriptor público y único Hero prioritario.
- `backend-powerzona/pb_hooks/pz_promo_pubcfg_api_lib.js` — carga/validación de asset/poster y resolver público revision-scoped.
- `backend-powerzona/pb_hooks/pz_promo_i18n_lib.js` — metadata accesible por locale efectivo.
- `backend-powerzona/tests/pz_promo_pubcfg.test.cjs` — propósito compatible por sección.
- `backend-powerzona/tests/pz_promo_pubcfg_http_runtime.test.cjs` — upload, derivados, preview, proyección, I18N, delivery, retiro y aislamiento reales.

No se modificaron colecciones, migraciones, `store_visual_items`, `push_media`, permisos, roles, capabilities, planes, templates, rutas Commerce o mobile.

## 10. Migraciones, seeds y dependencias

- Migraciones nuevas o modificadas: **ninguna**.
- Backfill: **ninguno**.
- Seed: **ninguno**.
- Dependencias de paquete: **ninguna**; se reutilizó Sharp ya instalado en frontend.
- Records persistentes reales: **ninguno**; el gate HTTP usó una base PocketBase temporal descartable.

La implementación consume sin cambios la colección `promo_media_assets` y sus campos/índices creados por DATA-0001.

## 11. Pruebas ejecutadas

### 11.1 Focales MEDIA/PUBCFG/I18N/THEME

```text
node --test tests/pz_promo_media.test.cjs tests/pz_promo_pubcfg.test.cjs
  tests/pz_promo_i18n.test.cjs tests/pz_promo_theme.test.cjs
  tests/pz_promo_pubcfg_http_runtime.test.cjs
Resultado: 34/34 PASS
```

Incluyen contratos exactos, límites, MIME/metadata/digest, MP4, posters cross-tenant, cuotas, propósito por sección, prioridad Hero, alt localizado, rutas cerradas y PocketBase real.

### 11.2 Gate PocketBase real

```text
node --test tests/pz_promo_pubcfg_http_runtime.test.cjs
Resultado: 1/1 PASS
```

El gate local verificó upload WebP, persistencia `ready`, derivados y tamaño, catálogo privado, preview principal/staff, rechazo de contexto Master B, proyección publicada, alt efectivo, delivery content-addressed, cambio de revisión, retiro y ausencia de IDs tenant en respuestas.

### 11.3 Regresión backend completa

```text
node --test
Resultado: 831 tests; 824 PASS; 0 FAIL; 7 SKIP
```

Los siete skips son gates opt-in que requieren URLs, credenciales o runners externos. No se activaron por las prohibiciones del prompt. Los runtimes PocketBase locales y regresiones Commerce pertinentes sí se ejecutaron.

### 11.4 Frontend y build

```text
node --test
Resultado: 662/662 PASS

npm.cmd run build
Resultado: PASS
```

El build conserva tres warnings preexistentes de Astro sobre `getStaticPaths()` ignorado en categoría, subcategoría y producto. No están relacionados con MEDIA-0001.

## 12. Compatibilidad preservada

- No se cambió ningún flujo, traducción, permiso, role, plan, default, ruta o contrato Commerce.
- No se modificaron las utilidades Commerce de `storefrontPushMedia`; MEDIA solo reutiliza sus guards/slot de conversión.
- No se añadieron relaciones Promo a catálogo, producto, carrito, checkout, pedido, precio, stock, promoción, cupón, shipping, Landing QR o ratings.
- PUBCFG conserva la forma de `promo.site.v1` y amplía únicamente la proyección de `media` que antes estaba reservada.
- I18N conserva sus rutas, cookie, negociación y un solo bloque de contenido efectivo.
- THEME conserva manifest, tokens, selección y fallback aprobados.
- El directo REST/file de PocketBase continúa cerrado; no se abrió realtime o CRUD genérico.

## 13. Riesgos y límites residuales

| Riesgo/límite | Tratamiento/estado |
|---|---|
| No existe UI para ordenar o asociar media | Pertenece a CMS/GALLERY; este prompt entrega API y contratos, no inicia esos prompts |
| Video no se transcodifica | V1 exige MP4/WebM ya optimizado y valida ≤25 MiB, ≤8 Mbps, ≤1080p, ≤30 min y metadata; incorporar encoder requiere aprobación/dependencia separada |
| Videos reales varían por codec/container | Los probes validan estructura/metadata contractual, no decodifican cada frame; SEC/QA/PERF podrán ampliar corpus sin abrir formatos |
| Derivados ocupan almacenamiento físico adicional | Conteo finito por propósito, cada archivo ≤100 KiB y nombres content-addressed; records retirados permanecen contabilizados en el catálogo canónico |
| Retirar un asset rompe un rollback histórico que lo necesite | El archivo se retiene, pero PUBCFG solo sirve `ready`; PUBLISH deberá bloquear o remediar targets con media retirada |
| Garbage collection no está definido | No se borra material listo/retirado sin política de retención y referencias aprobada |
| Un cierre abrupto entre `processing` y `ready` puede dejar un record no publicable | Sigue contando contra cuota y falla cerrado; un reconciliador/GC operativo requerirá un prompt separado |
| Cache/CDN avanzada aún no existe | La URL y headers ya son seguros/content-addressed; PERF/OPS decidirán CDN sin cambiar el documento |
| Render accesible final aún no existe | El contrato ya exige alt/decorative, poster y controles; HERO/SECTIONS/A11Y deberán consumirlo literalmente |

## 14. Siguiente Prompt ID habilitado

Según el orden del mapa maestro, el siguiente Prompt ID es **`TS84-PROMO-DOM-CORE-0001`**: registro privado de dominios y resolución local segura por Host.

`TS84-PROMO-DOM-CORE-0001`, `TS84-PROMO-PUBLISH-0001` y cualquier prompt posterior **no fueron iniciados**.

## 15. Confirmaciones de cierre

- No se consultó ni modificó PocketBase desplegado.
- No se consultaron ni modificaron Cloudflare, Coolify, staging o producción.
- No se leyeron secretos; los runtimes locales eliminaron variables sensibles heredadas y usaron valores sintéticos.
- No se hizo push, merge, deploy, release ni commit.
