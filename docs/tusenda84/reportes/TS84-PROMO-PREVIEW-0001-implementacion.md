# TS84-PROMO-PREVIEW-0001 — Preview privado desktop/móvil y comparación con publicado

## Estado

**COMPLETADO** y verificado localmente sobre la rama `dev`, sin commit, push, merge, despliegue ni release.

Antes de modificar se confirmó:

- rama local: `dev`;
- HEAD: `e5b7e85` (`feat(promo): agrega editor de idiomas para tiendas promo`);
- worktree: limpio; e
- infraestructura externa: no consultada ni modificada.

## Objetivo cumplido

Se implementó exclusivamente `TS84-PROMO-PREVIEW-0001` para añadir en la sección privada `Publicación` del Admin Promo:

- preparación explícita de una candidata inmutable desde la versión exacta del draft;
- preview por locale de esa candidata, sin leer ni renderizar el draft mutable directamente;
- representación desktop de `1280 × 800` y móvil de `390 × 844`;
- consulta de la revisión que ocupa exactamente el slot publicado actual;
- modos `Borrador`, `Publicado` y `Comparar`;
- comparación semántica de identidad, tema, navegación, secciones, contacto y media;
- renderer privado first-party del tema aprobado `promo.black-gold@1.0.0`; y
- serving SSR same-origin de medios protegidos, ligado a tenant, revisión, locale y descriptor exactos.

No se creó una audiencia de preview compartible, enlace firmado, sitio público, publicación automática, rollback, shell público, resolución pública de dominios, integración Cloudflare ni acción de contacto real. No se inició `TS84-PROMO-DOM-CF-0001`, `TS84-PROMO-SHELL-0001` ni ningún prompt posterior.

## Contratos reutilizados

La implementación consume y conserva la semántica de:

- ADMIN-SHELL/PERM para aislamiento Promo previo a Commerce y proyección backend de `allowed_actions`;
- PUBCFG para draft versionado, tenant efectivo y documento `promo.site.v1`;
- CMS, GALLERY, APPEARANCE y LOCALES-ADMIN para las facetas editables que alimentan la candidata;
- I18N para locale exacto publicado y prohibición de fallback por campo;
- THEME para identidad/versionado del paquete first-party y tokens allowlisted;
- MEDIA para descriptores de media revision-scoped y archivos protegidos;
- PUBLISH para CAS, validación pública integral, revisión inmutable, lectura privada de preview y slot publicado exacto; y
- AUDIT mediante el flujo existente de creación de candidata.

No se añadieron permisos, capabilities, catálogos de roles, colecciones, migrations, rules, índices, estados de publicación ni contratos Commerce.

## Contexto privado de preview

PUBLISH incorpora un endpoint privado autenticado:

```text
POST /api/pz/promo/private/v1/publication/preview/context
```

Su request exacto es:

```json
{ "contract": "promo.preview.context.read.v1" }
```

La respuesta `promo.preview.context.v1` expone exclusivamente:

- versión, SHA-256 y locales del draft;
- estado y generación del slot de publicación; y
- metadatos saneados de la revisión que ocupa el slot, cuando es válida.

No devuelve el documento mutable, records PocketBase, actor, filtros, secretos, rutas físicas, destinos de contacto ni contenido completo. Dentro de una única transacción relee draft y slot al final; si cambió versión, digest, estado, generación o revisión publicada, falla cerrado con `promo_preview_unavailable`.

La revisión publicada no se obtiene por `latest`, fecha o consulta amplia: se sigue exclusivamente `promo_publication_slots.published_revision` del sitio/tenant efectivo. Si esa revisión ya no supera el gate privado de preview, la comparación queda no disponible en vez de seleccionar otra revisión.

## Candidata, CAS y ausencia de escrituras implícitas

Abrir `Publicación`, cambiar viewport, seleccionar locale o alternar modos no persiste nada. La única escritura del flujo ocurre al pulsar explícitamente **Preparar preview**:

1. el frontend obtiene contexto y conserva `draft.version`;
2. envía `promo.candidate.create.v1` con `expected_draft_version` exacto;
3. PUBLISH vuelve a exigir tenant, capability, `promo.publication.publish`, documento público completo y CAS;
4. crea o reutiliza la revisión inmutable conforme al contrato existente; y
5. el frontend lee esa revisión por `candidate_revision_id + locale` mediante `promo.preview.read.v1`.

Un draft cambiado produce `promo_draft_conflict`; no hay last-write-wins. El navegador no construye una candidata desde estado local, no renderiza el draft mutable y no puede elegir `store_id`, site, actor, digest ni revisión publicada.

Preparar una candidata no publica ni cambia slot, generación, dominio o estado público. Sí conserva la revisión y auditoría inmutables que PUBLISH ya define, razón por la cual la acción es explícita y está protegida por autoridad backend.

## Autoridad y aislamiento por tenant

- La sección Promo sigue visible únicamente por clasificación ADMIN-SHELL, sin reutilizar rutas Commerce.
- El preview y su contexto requieren `promo.site.view` efectivo en backend.
- Crear la candidata requiere `promo.publication.publish` efectivo en backend.
- La UI recibe `canPrepare` desde `allowed_actions`; no infiere autoridad por rol, texto, plan o capability.
- Admin usa exclusivamente la tienda de su sesión.
- Master requiere un store explícito ya resuelto por el contexto central; `X-PZ-Promo-Store` se añade solo server-side.
- `store`, `store_id`, filtros PocketBase o tenancy inyectada en body son rechazados por contratos exactos.
- El bearer central permanece server-side y nunca llega al HTML ni a las URLs de medios.
- Cada lectura valida nuevamente site, store, entitlement, sesión, permiso, revisión y relaciones del mismo tenant.

Las rutas Astro exactas exigen slug canonical y coincidencia con el contexto Admin/Master. Todas responden con `private, no-store`, `noindex,nofollow,noarchive`, `no-referrer` y `nosniff`.

## Renderer privado y fallo cerrado

El normalizador frontend trata la respuesta backend como datos no confiables y acepta solo el contrato tipado de preview:

- locale exacto;
- identidad y navegación localizadas;
- secciones, variantes, config e items allowlisted;
- theme ID, versión y tokens aprobados;
- contacto sin ampliar acciones;
- media, adapters y mensajes de sistema tipados; y
- URLs de media privadas o same-origin seguras.

La representación usa exclusivamente componentes/estilos first-party. Para `promo.black-gold@1.0.0` transforma los tokens aprobados a variables internas; nunca inserta CSS, HTML, JavaScript o plantillas arbitrarias del documento. Un tema, variante, field, media descriptor o contrato desconocido produce preview no disponible; no intenta un renderer aproximado.

El DOM se construye con nodos y `textContent`, sin `innerHTML`. Las CTA se muestran como elementos no interactivos: el preview no expone teléfono, email, WhatsApp, URL, deep link ni otro destino de contacto.

## Comparación con publicado

El modo `Comparar` mantiene separadas la candidata y la revisión del slot actual. Normaliza facetas semánticas y presenta un resumen de cambios en:

- identidad;
- tema;
- navegación;
- estructura y contenido de secciones;
- acciones/configuración de contacto; y
- referencias, variantes y accesibilidad de media.

Las URLs temporales de entrega no cuentan como cambios de contenido. La comparación se habilita solo cuando ambas revisiones ofrecen el locale exacto; nunca mezcla campos de otro idioma ni cae al default. Si el sitio está `unpublished` o la revisión del slot no es validable, el modo publicado/comparar queda cerrado con estado explícito.

## Medios protegidos

Los descriptores de PUBLISH se reescriben a una ruta same-origin privada:

```text
/api/admin/promo-preview-media
```

Cada solicitud queda ligada exactamente a:

```text
store + revision + locale + media + resource + variant
```

El proxy:

1. revalida cookie central, tenant y soporte Master;
2. vuelve a solicitar el preview exacto al backend;
3. resuelve la ruta protegida únicamente desde el descriptor allowlisted recibido;
4. permite solo WebP, MP4 y WebM tipados;
5. admite `Range` solo para video; y
6. transmite una allowlist mínima de headers con caché privada deshabilitada.

No acepta paths, URLs de origen, collection IDs o tokens proporcionados por el cliente. Los videos usan controles nativos, `preload="none"`, sin autoplay, y conservan poster/alt o semántica decorativa según el contrato.

## Accesibilidad y responsive

- selector de locale y modos con botones nativos y estados accesibles;
- toolbar para desktop/móvil con dimensiones explícitas;
- headings y regiones jerárquicas dentro del preview;
- mensajes de estado `aria-live=polite` y errores con `role=alert`;
- labels, nombres accesibles y foco visible de alto contraste;
- textos alternativos o marca decorativa obligatoria para media;
- CTA desactivadas semánticamente para impedir navegación accidental;
- preview escalado con `ResizeObserver` sin perder el viewport contractual;
- layout de comparación que se adapta a una o dos columnas;
- breakpoints 1120/760/420 px y targets táctiles; y
- reducción de animaciones/transiciones bajo `prefers-reduced-motion`.

Las rutas canonical y legacy del Admin añaden headers privados/noindex específicamente en `Publicación`, sin cambiar el comportamiento de otras secciones.

## Compatibilidad preservada

- No se importan, consultan ni modelan products, categories, orders, precios, monedas, stock, inventario, carrito, checkout, shipping, cupones, regalos o promociones Commerce.
- No se reutilizan tablas, endpoints, infraestructura, componentes o capacidades Commerce para Promo.
- Master conserva soporte explícito y authority server-side; Admin conserva tenant de sesión.
- CMS, Gallery, Appearance, Locales, publicación, rollback y slot existentes no cambian de semántica.
- No se abrió CRUD/realtime de colecciones `promo_*` ni acceso del navegador a PocketBase.
- No se creó preview público/shareable, iframe remoto, cookie pública o token en URL.
- No se modificaron Landing QR, ratings, analytics, Seguridad, APKs, Commerce ni navegación pública.
- No se implementó shell público, canonical público, `hreflang`, sitemap, contacto operativo o DOM-CF.

## Archivos modificados

### Backend

- `backend-powerzona/pb_hooks/pz_promo_publish.pb.js`
- `backend-powerzona/pb_hooks/pz_promo_publish_api_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_publish_lib.js`
- `backend-powerzona/tests/pz_promo_pubcfg_http_runtime.test.cjs`
- `backend-powerzona/tests/pz_promo_publish.test.cjs`

### Frontend

- `frontend-powerzona/src/components/admin/promo/PromoAdminShell.astro`
- `frontend-powerzona/src/components/admin/promo/PromoPreviewEditor.astro`
- `frontend-powerzona/src/lib/promoAdminShell.ts`
- `frontend-powerzona/src/lib/promoPreview.ts`
- `frontend-powerzona/src/pages/admin/promo/[section].astro`
- `frontend-powerzona/src/pages/t/[storeSlug]/admin/promo/[section].astro`
- `frontend-powerzona/src/pages/api/admin/promo-preview.ts`
- `frontend-powerzona/src/pages/api/admin/promo-preview-media.ts`
- `frontend-powerzona/src/styles/promo-preview.css`
- `frontend-powerzona/tests/promoPreview.test.mjs`

### Documentación

- `docs/tusenda84/reportes/TS84-PROMO-PREVIEW-0001-implementacion.md`

## Migraciones y dependencias

- Migraciones: ninguna.
- Dependencias de paquete nuevas: ninguna.
- Seeds o backfill: ninguno.
- Colecciones, fields, rules e índices: sin cambios.
- Datos persistentes reales modificados: ninguno.

## Pruebas ejecutadas

### Línea base focal previa

```text
Frontend dependencias PREVIEW: 35/35 PASS
Backend dependencias PREVIEW: 59/59 PASS
```

### Focal PREVIEW y regresión inmediata

```text
node --test tests/promoPreview.test.mjs tests/promoLocales.test.mjs
  tests/promoCms.test.mjs tests/promoGallery.test.mjs
  tests/promoAppearance.test.mjs tests/promoAdminShell.test.mjs
  tests/promoAccess.test.mjs
Resultado: 40/40 PASS

node --test tests/pz_promo_publish.test.cjs
  tests/pz_promo_i18n.test.cjs tests/pz_promo_theme.test.cjs
  tests/pz_promo_pubcfg.test.cjs tests/pz_promo_permissions.test.cjs
  tests/pz_promo_permissions_api.test.cjs
Resultado: 59/59 PASS

node --test tests/pz_promo_pubcfg_http_runtime.test.cjs
Resultado: 1/1 PASS
```

La suite PREVIEW aporta cinco pruebas focales que cubren:

- contexto exacto, CAS, autoridad y aislamiento Admin/Master A/B;
- normalización allowlisted, locale exacto y renderer theme first-party;
- reescritura y resolución protegida de media por revisión;
- comparación semántica sin ruido por URLs de entrega; y
- estructura Admin, noindex/no-store, accesibilidad, responsive, ausencia de Commerce y ausencia de transiciones posteriores.

El runtime PocketBase local y descartable comprueba adicionalmente contexto de tenant A, soporte Master explícito sobre tenant B y rechazo de `store_id` inyectado.

### Regresión frontend completa

```text
node --test
Resultado: 702/702 PASS
```

### Regresión backend completa

```text
node --test
Resultado: 858 tests; 851 PASS; 0 FAIL; 7 SKIP
```

Los siete skips son gates opt-in preexistentes que requieren URLs, credenciales o runners externos. No se activaron por las prohibiciones del prompt. Los runtimes PocketBase locales y descartables, incluidas las regresiones Promo y Commerce pertinentes, sí se ejecutaron.

### Build e higiene

```text
npm.cmd run build
PASS

git diff --check
PASS
```

El build conserva únicamente los tres warnings preexistentes de Astro sobre `getStaticPaths()` ignorado en categoría, subcategoría y producto. No están relacionados con PREVIEW-0001.

## Riesgos y límites residuales

- El renderer privado soporta el paquete first-party actualmente aprobado `promo.black-gold@1.0.0`. Un paquete futuro exige un Prompt ID autorizado y su renderer explícito; no hay fallback arbitrario.
- Solo pueden previsualizarse locales incluidos y completos en la candidata. Un locale draft no publicable no se mezcla ni se rellena desde otro idioma.
- Preparar preview persiste una revisión candidata inmutable y su auditoría, aunque no publica; por ello no existe auto-prepare.
- Si el slot publicado cambia durante la lectura o su revisión ya no valida, la comparación falla cerrada y exige recargar.
- No existe URL compartible ni audiencia externa. Esto conserva la decisión DP-09: preview central-auth exclusivo para Admin/Master.
- CTA y destinos reales quedan deliberadamente inertes. El comportamiento público corresponde a SHELL/CONTACT posteriores.
- No se ejecutó QA visual autenticado contra una tienda real porque implicaría datos/sesiones o entornos fuera del alcance. La UI quedó cubierta por contratos, pruebas estructurales, runtime local, responsive y build.

## Confirmaciones de cierre

- No se consultó ni modificó PocketBase desplegado.
- No se consultaron ni modificaron Cloudflare, Coolify, staging o producción.
- No se leyeron secretos.
- No se inició `TS84-PROMO-DOM-CF-0001`, `TS84-PROMO-SHELL-0001` ni ningún prompt posterior.
- No se hizo push, merge, despliegue, release ni commit.

## Siguiente Prompt ID habilitado

Según el orden y las dependencias del mapa maestro, queda habilitado **`TS84-PROMO-SHELL-0001`**: layout público Promo SSR, ligero y accesible, sin carrito, checkout ni scripts comerciales.

No fue iniciado.
