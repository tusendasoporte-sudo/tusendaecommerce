# TS84-PROMO-GALLERY-0001 — Editor privado de trabajos destacados y galería

## Estado

**COMPLETADO** y verificado localmente sobre la rama `dev`, sin commit, push, merge, despliegue ni release.

Antes de modificar se confirmó:

- rama local: `dev`;
- HEAD: `cf174f1` (`feat(promo): agrega editor CMS para tiendas promo`);
- worktree: limpio;
- infraestructura externa: no consultada ni modificada.

## Objetivo cumplido

Se implementó exclusivamente el editor privado `TS84-PROMO-GALLERY-0001` para:

- trabajos destacados;
- galería ordenable;
- asociación de imágenes y videos del catálogo Promo;
- carga de imágenes de galería y posters;
- carga de MP4/WebM optimizado cuando el backend proyecta la acción de video;
- preview privado de cada asset dentro del Admin;
- textos, captions y metadata accesible del locale predeterminado;
- uso, cuotas, estados y retiro seguro de medios; y
- guardado del borrador completo mediante CAS.

El placeholder `Galería y medios` del Admin Shell fue reemplazado por el editor funcional. Apariencia, administración de locales, preview integral del sitio, Cloudflare y los prompts posteriores permanecen sin iniciar.

El preview incorporado en este alcance es únicamente el archivo privado de la biblioteca dentro del editor. No crea candidata, revisión, URL de preview del sitio, comparación con publicado ni ninguna función de `TS84-PROMO-PREVIEW-0001`.

## Contratos reutilizados

La implementación consume sin cambiar su semántica:

- ADMIN-SHELL/PERM para clasificación Promo previa a Commerce, tenant de sesión, soporte Master explícito y `allowed_actions` como defensa visual;
- PUBCFG para `promo.site.v1`, lectura privada, reemplazo completo, permisos derivados, cuotas backend y CAS;
- MEDIA para catálogo tenant-scoped, normalización de imagen, video+poster, metadata real, límites, preview protegido y retiro auditado;
- I18N para contenido y `media_alt` del locale predeterminado sin inventar otro sistema de idioma;
- AUDIT mediante los writers backend ya integrados en el update de draft y las mutaciones MEDIA; y
- THEME únicamente como faceta preservada del documento completo.

No se añadieron endpoints PocketBase, action keys, permisos, capabilities, colecciones, migraciones, rules, índices, roles, planes o contratos backend.

## Autoridad, permisos y fallo cerrado

El módulo continúa visible solo con `promo.site.view` y `promo.media.manage` proyectados por el backend.

Las operaciones quedan separadas:

| Operación | Defensa visual | Autoridad backend efectiva |
|---|---|---|
| Listar y previsualizar biblioteca | módulo autorizado | `promo.site.view`, tenant y sesión vigentes |
| Subir imagen/poster | `promo.media.manage` | action MEDIA, cuotas de conteo/bytes/almacenamiento y metadata real |
| Subir video | `promo.media.video.manage` | permiso media, `video_enabled`, `max_videos`, poster y límites MEDIA |
| Asociar, ordenar o editar alt/caption | `promo.content.manage` + `promo.media.manage` | PUBCFG deriva nuevamente actions, assets, cuotas y CAS |
| Cambiar metadata de un video | acción video proyectada | PUBCFG exige `promo.media.video.manage` cuando cambia la faceta media de video |
| Retirar medio | `promo.media.manage` | MEDIA bloquea draft, revisión publicada, poster dependiente, cruce tenant y estado divergente |

La ausencia de una acción bloquea el control correspondiente, pero el frontend nunca concede autoridad. Una request manipulada vuelve a pasar por PERM/PUBCFG/MEDIA en backend.

La tienda normal se deriva de la sesión central. Soporte Master conserva `X-PZ-Promo-Store` exclusivamente server-side después de resolver el slug central exacto. Los bodies no aceptan `store_id`, `site_id`, actor, filter, sort, fields, expand, revision o destino backend.

## Documento, orden y CAS

Cuando el draft está estructuralmente vacío, el editor crea solo en memoria:

- locale inicial `es`, ya soportado por `promo.system.v1`;
- una sección `featured_work`; y
- una sección `gallery`.

No crea Hero, servicios, propietario, contacto, footer, tema, publicación, adapter o SEO. Nada se persiste hasta Guardar.

Cada elemento mantiene:

- `item_key` estable para el contenido localizado;
- `use_key` estable para la referencia media y su metadata accesible;
- `asset_id` privado del catálogo tenant-scoped;
- propósito obligatorio `gallery`;
- orden idéntico entre `config.item_keys` y `media_use_keys`; y
- `alt` no vacío o `decorative=true` con alt vacío.

El writer conserva exactamente las facetas fuera de GALLERY:

- identidad y secciones no especializadas;
- tema, versión y tokens;
- contacto;
- adapters;
- SEO;
- locales distintos al predeterminado; y
- media usada por Hero, servicios, propietario, footer u otras secciones.

Al retirar un item del locale predeterminado, su ref se elimina solo si ya no la usa ninguna sección ni existe metadata de otro locale. Si otro locale todavía conserva `media_alt`, la referencia queda privada y no visible para preservar ese locale sin exigir anticipadamente `promo.translations.manage`. La administración/limpieza traducida corresponde a `TS84-PROMO-LOCALES-ADMIN-0001`.

El guardado usa el proxy SSR aprobado `/api/admin/promo-cms`, con envelope exacto `{ expected_version, document }`. Un conflicto devuelve `promo_draft_conflict`; la UI exige recarga y nunca aplica last-write-wins.

## Biblioteca, cuotas y video

La biblioteca consume `/api/admin/promo-media`:

| Método | Uso |
|---|---|
| `GET ?store=<slug>` | catálogo, usage y límites efectivos |
| `GET ?store=<slug>&asset=<id>` | preview privado exacto, resuelto server-side |
| `POST ?store=<slug>` | upload con form-data exacto `file`, `purpose`, `poster_asset_id` |
| `DELETE ?store=<slug>` | retiro por `asset_id` exacto |

El editor muestra:

- cantidad de elementos de galería frente a `max_gallery_assets`;
- videos almacenados frente a `max_videos`;
- bytes utilizados frente a almacenamiento efectivo del catálogo; y
- estado, dimensiones, peso, duración y uso actual por asset.

La cuota de galería se aplica conservadoramente a todos sus items, igual que la métrica backend vigente. Trabajos destacados no inventan otra cuota comercial: continúan gobernados por referencias, imágenes, videos, almacenamiento y hard ceilings de PUBCFG/MEDIA.

Imágenes se entregan al pipeline MEDIA para JPEG/PNG/WebP/AVIF y solo persiste WebP normalizado de hasta 100 KiB. Videos admiten MP4/WebM ya optimizado, con poster `video_poster` ready del mismo tenant. No se añadió transcodificación, encoder, formato, dependencia o almacenamiento paralelo.

## Preview privado

El catálogo backend continúa entregando rutas privadas que exigen bearer. Para no exponer el bearer al navegador, el adaptador SSR ahora resuelve el asset así:

1. exige query exacta con slug canonical y asset ID de 15 caracteres;
2. renueva auth central y resuelve la misma tienda de la ruta;
3. lista el catálogo tenant-scoped mediante MEDIA;
4. selecciona únicamente el descriptor exacto `ready` retornado por backend;
5. valida una ruta privada content-addressed allowlisted;
6. solicita el archivo server-to-server con bearer y contexto Master cuando corresponde; y
7. transmite solo WebP/MP4/WebM con headers `private, no-store`, anti-indexación y `nosniff`.

No acepta URL, path, digest, filename, host o destino backend aportado por el navegador. `Sec-Fetch-Site` conocido debe ser `same-origin`. Video soporta un único header `Range` acotado y reenvía solo `Content-Range`, `Accept-Ranges` y `Content-Length` validados.

## Accesibilidad y responsive

- labels asociados y límites de texto visibles;
- estado `role=status`/`aria-live=polite` y resumen de error enfocable `role=alert`;
- orden mediante botones Subir/Bajar, operable por teclado y sin drag obligatorio;
- alt obligatorio o marca decorativa explícita;
- videos con controles, `playsInline`, poster y `preload=none`;
- previews de imagen con dimensiones reservadas y lazy loading;
- controles bloqueados durante mutaciones para evitar carreras visuales;
- aviso de cambios sin guardar al abandonar;
- foco visible de alto contraste y targets táctiles de 40–44 px;
- layouts 3/2/1 columnas y breakpoints 980/700/420 px sin anchos rígidos; y
- reducción explícita de animaciones bajo `prefers-reduced-motion`.

## Compatibilidad preservada

- No se importan, consultan ni modelan `products`, `categories`, `orders`, precios, monedas, stock, inventario, carrito, checkout, shipping, cupones, regalos o promociones Commerce.
- `AdminSidebar.astro`, layout y rutas Commerce permanecen sin cambios.
- El shell Promo continúa separado y se clasifica antes de Commerce.
- No se modificaron Master, Landing QR, ratings, analytics, Seguridad, APKs, sitio público o publicación.
- No se abrió CRUD/realtime de colecciones `promo_*` ni acceso directo a files PocketBase.
- Guardar afecta solo el draft; no crea candidata, revisión, preview integral, publicación, rollback o cambio de slot.

## Archivos modificados

### Frontend

- `frontend-powerzona/src/components/admin/promo/PromoAdminShell.astro`
- `frontend-powerzona/src/components/admin/promo/PromoGalleryEditor.astro`
- `frontend-powerzona/src/lib/promoGallery.ts`
- `frontend-powerzona/src/pages/api/admin/promo-media.ts`
- `frontend-powerzona/src/styles/promo-gallery.css`
- `frontend-powerzona/tests/promoGallery.test.mjs`

### Documentación

- `docs/tusenda84/reportes/TS84-PROMO-GALLERY-0001-implementacion.md`

## Migraciones y dependencias

- Migraciones: ninguna.
- Dependencias de paquete nuevas: ninguna.
- Seeds o backfill: ninguno.
- Backend PocketBase modificado: no.
- Datos persistentes reales modificados: ninguno.

## Pruebas ejecutadas

### Línea base focal previa

```text
Frontend CMS/MEDIA/Admin Shell/PERM: 24/24 PASS
Backend MEDIA/PUBCFG/I18N/PERM: 37/37 PASS
```

### Focal GALLERY y regresión inmediata

```text
node --test tests/promoGallery.test.mjs tests/promoCms.test.mjs
  tests/promoMedia.test.mjs tests/promoAdminShell.test.mjs
Resultado: 25/25 PASS
```

La suite GALLERY aporta seis pruebas y cubre:

- workspace vacío limitado a `featured_work`/`gallery`;
- orden `item_keys`/`media_use_keys`, asociación image/video y validación con el backend real;
- permisos derivados `content + media + video`;
- preservación de tema, contacto, adapters, secciones ajenas y otros locales;
- limpieza segura de refs con metadata traducida;
- cuota efectiva y alt/decorative;
- catálogo exacto, preview same-origin y slug/asset cerrados; y
- auth central, contexto Master, CAS, Range y ausencia estructural de Commerce/infraestructura.

### Regresión frontend completa

```text
node --test
Resultado: 685/685 PASS
```

### Regresión backend completa

```text
node --test
Resultado: 858 tests; 851 PASS; 0 FAIL; 7 SKIP
```

Los siete skips son gates opt-in preexistentes que requieren URLs, credenciales o runners externos. No se activaron por las prohibiciones del prompt. Los runtimes PocketBase locales y descartables, incluidas las regresiones Promo/Commerce pertinentes, sí se ejecutaron.

### Build e higiene

```text
npm.cmd run build
PASS

git diff --check
PASS
```

El build conserva únicamente los tres warnings preexistentes de Astro sobre `getStaticPaths()` ignorado en categoría, subcategoría y producto. No están relacionados con GALLERY-0001.

## Riesgos y límites residuales

- El editor modifica solo el locale predeterminado. Nuevos items en una tienda multilenguaje dejarán la candidata incompleta hasta que `TS84-PROMO-LOCALES-ADMIN-0001` complete captions/alt de los demás locales.
- Una ref conservada por metadata de otro locale continúa contando en métricas del documento y bloquea retiro, deliberadamente, hasta su limpieza localizada autorizada.
- Video continúa sin transcodificación; MEDIA valida contenedor y metadata dentro de sus límites aprobados.
- La biblioteca lista hasta los hard ceilings vigentes; una futura paginación del Admin puede añadirse si el volumen real lo exige, sin cambiar serving público.
- El preview de biblioteca es privado y no representa composición Theme ni la revisión publicada.
- Retirar conserva el archivo por retención; no existe GC aprobado y este prompt no lo añadió.

## Confirmaciones de cierre

- No se consultó ni modificó PocketBase desplegado.
- No se consultaron ni modificaron Cloudflare, Coolify, staging o producción.
- No se leyeron secretos.
- No se inició `TS84-PROMO-APPEARANCE-0001`, `TS84-PROMO-LOCALES-ADMIN-0001`, `TS84-PROMO-PREVIEW-0001`, `TS84-PROMO-DOM-CF-0001` ni ningún prompt posterior.
- No se hizo push, merge, despliegue, release ni commit.

## Siguiente Prompt ID habilitado

Según el orden del mapa maestro, queda habilitado **`TS84-PROMO-APPEARANCE-0001`**: selector de temas aprobados, tokens permitidos y vista previa visual dentro de los límites de ADMIN-SHELL y THEME.

No fue iniciado.
