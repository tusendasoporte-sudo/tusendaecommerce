# TS84-PROMO-LIVE-CATALOG-0001 — Informe de implementación

## Estado

- Resultado: **COMPLETADO en el proyecto local**.
- Fecha: 2026-08-26.
- Rama: `dev`.
- Base verificada al iniciar: `bbadbe6`, con worktree limpio antes de este cambio.
- Estado Git final: cambios locales sin commit.
- Defectos críticos abiertos: **0**.
- Acciones externas: **0**. No se modificó staging, producción, DNS, Cloudflare, certificados ni dominios.
- No se hizo commit, push, deploy, release ni instalación de dependencias.

## Resultado funcional

### Contenido vivo

- El documento actual usa el contrato `promo.site.v2` y continúa tenant-scoped.
- `Guardar cambios` valida permisos, capability, CAS, contenido, tema, medios y cuotas; si todo es válido reemplaza el documento actual y aumenta la generación técnica de caché.
- La salida pública se construye desde el documento vivo. `published_revision` deja de ser autoridad y se conserva vacío en el flujo nuevo.
- Un sitio activo exige un documento públicamente completo; uno todavía inactivo puede almacenar trabajo parcial, pero no se sirve públicamente.
- El Admin no muestra `Publicar`, candidata, aprobación, revisión, rollback ni despublicación editorial.
- El Master ya no presenta controles editoriales: conserva lifecycle, capacidades, canónico, dominios, salud y apariencia actual.
- El módulo backend histórico de publicación se mantuvo intacto por compatibilidad y auditoría legada, pero no es invocado ni expuesto por el Admin/Master nuevo. En particular, `backend-powerzona/pb_hooks/pz_promo_publish_api_lib.js` no fue modificado.

### Galerías, servicios y portada

- Se pueden crear, ordenar, editar y eliminar varias galerías.
- Cada galería actúa como categoría y dispone de portada, nombre, descripción, visibilidad y trabajos propios.
- Cada trabajo dispone de nombre, descripción, varias imágenes, orden, visibilidad, bandera `featured` y CTA seguro de estimado.
- `Trabajos destacados` se deriva de los trabajos marcados dentro de galerías; no mantiene copias editoriales separadas.
- Los servicios enlazan una galería y reutilizan su portada. El CTA lleva a esa galería.
- La portada acepta una imagen o una secuencia de medios en carrusel accesible.
- No se introdujeron precios, stock, productos Commerce, carrito ni checkout en Promo.

### Identidad, contacto y apariencia

- Se añadió slogan localizado, opcional y limitado a 120 caracteres.
- Contacto conserva los canales tipados existentes y añade QR opcional.
- El QR se procesa como imagen WebP de 512 × 512, con ajuste `contain`, fondo blanco, sin recorte y sin reservar espacio público cuando está ausente.
- Se entregaron seis apariencias first-party con el mismo contrato de contenido:
  - `promo.black-gold`
  - `promo.minimal`
  - `promo.artisan`
  - `promo.vibrant`
  - `promo.professional`
  - `promo.portfolio`
- El lateral fijo del Admin incluye `Ver mi página` y `Contactar soporte Master`, con rutas públicas y texto legible sin IDs privados.

## Compatibilidad y migraciones

### `1787520650_promo_theme_catalog.js`

- Materializa las seis releases desde el registry first-party.
- Conserva aprobación existente cuando existe un release negro/dorado aprobado.
- El rollback elimina únicamente releases adicionales que no estén en uso.

### `1787520660_promo_qr_media.js`

- Añade `qr` al enum de propósito de medios.
- El rollback falla cerrado si existe algún QR almacenado.

### `1787520700_promo_live_content.js`

- Migra determinísticamente los documentos existentes a `promo.site.v2`.
- Si un borrador activo no es válido, usa la revisión publicada existente únicamente como fuente de migración segura.
- Vacía `published_revision`, ajusta el estado técnico del slot y aumenta la generación.
- La analítica pasa a atribuirse a `content_generation`; la relación histórica `revision` deja de ser obligatoria.
- El rollback exige colecciones operativas vacías y aborta sin pérdida si encuentra datos.

Los registros históricos legados se conservan inertes; el guardado vivo nuevo no crea candidatas ni revisiones.

## Matriz funcional

| Área | Resultado | Evidencia |
|---|---|---|
| Guardado automático | OK | Runtime LIVE valida cambio inmediato público y aumento de generación. |
| CAS concurrente | OK | Una versión obsoleta responde conflicto y no sobrescribe. |
| Lifecycle Master | OK | Activación exige documento completo; suspensión/inactividad corta serving. |
| Galerías múltiples | OK | Crear, editar, ordenar, eliminar y limpiar vínculos/medios. |
| Trabajos y destacados | OK | Destacados derivados exclusivamente de `featured` en galerías. |
| Servicios enlazados | OK | Claves de galería validadas y CTA interno permitido. |
| Portada/carrusel | OK | Uno o varios medios, prioridad LCP y controles accesibles. |
| Slogan | OK | Localizado, máximo 120 y ausente si está vacío. |
| QR propio | OK | Upload privado, propósito `qr`, salida 512 × 512 y render opcional. |
| Seis apariencias | OK | Registry, catálogo privado, selección y renderer público allowlisted. |
| Admin | OK | Sin Publicar; guardado vivo; enlaces fijos a página y soporte. |
| Master | OK | Sin candidata/revisiones/operaciones editoriales visibles. |
| i18n | OK | Locale base, adicionales, completitud y salida localizada sin mezclar. |

## Matriz de seguridad y privacidad

| Control | Resultado |
|---|---|
| Tenant derivado de sesión; soporte Master con contexto explícito | OK |
| Permisos/capabilities granulares y CAS | OK |
| Aislamiento entre tiendas A/B y Commerce | OK |
| Host, Origin, X-Forwarded-Host y rutas ambiguas fail-closed | OK |
| Tema no aprobado, medio ajeno o propósito incorrecto rechazados | OK |
| REST directo, filtros, expansión y tenancy aportada por cliente rechazados | OK |
| CSP/no-store/noindex existentes sin relajación | OK |
| Auditoría sin copy comercial, destinos, IDs de assets ni datos privados | OK |
| Sin tokens, cookies, credenciales ni datos personales en evidencia | OK |
| Sin cambios en contratos Commerce compartidos | OK |

## Responsive y accesibilidad

- Evidencia automatizada desktop/móvil: targets táctiles de 44 × 44, CTA de 54 px, reflow en 720/640/420 px, zoom y textos largos.
- Navegación, galerías, footer, contacto y QR mantienen landmarks, nombres accesibles y foco visible.
- Hero y galerías aceptan teclado; videos conservan controles y carga diferida.
- `prefers-reduced-motion` y el token de movimiento reducido desactivan animaciones no esenciales.
- Las seis apariencias conservan contraste AA dentro de los tokens aprobados.
- No se realizó QA visual humano en staging porque este Prompt no autorizó deploy ni mutación externa.

## Regresiones Commerce, checkout/búsqueda y Landing QR

- Producto, variantes, visibilidad, disponibilidad, precios y búsqueda pública: sin regresión.
- Checkout y pedidos: cálculo canónico, privacidad, stock, reservas, cupones y moneda: sin regresión.
- Landing QR Commerce: capability, permisos, redirección, imagen y tracking: sin regresión.
- Promo continúa sin montar catálogo, productos, inventario, carrito ni checkout.

## Comandos y resultados exactos

Ejecutados desde `frontend-powerzona`:

```text
node --test tests/promo*.test.mjs
111 pruebas; 111 OK; 0 fallos

node --test tests/l7q1LandingQrPremium.test.mjs tests/e005LandingQrChart.test.mjs tests/checkoutShippingFallback.test.mjs tests/publicCatalogPerformance.test.mjs
20 pruebas; 20 OK; 0 fallos

npm run build
OK; Astro server build completo
Avisos preexistentes: getStaticPaths ignorado en tres rutas dinámicas Commerce

node --test tests/promoGallery.test.mjs
6 pruebas; 6 OK; 0 fallos, repetición focal posterior a la corrección de codificación
```

Ejecutados desde `backend-powerzona`:

```text
node --test --test-concurrency=1 tests/pz_promo*.test.cjs
159 pruebas; 159 OK; 0 fallos
Incluye gates runtime DATA, PERM y LIVE con PocketBase 0.39.8

node --test tests/pz_product_commerce.test.cjs tests/pz_order_pricing.test.cjs tests/pz_order_privacy.test.cjs tests/pz_l7q1_landing_qr_premium.test.cjs
46 pruebas; 46 OK; 0 fallos
```

Ejecutado desde la raíz:

```text
git diff --check
OK; sin errores de whitespace (solo avisos de conversión LF/CRLF del entorno Windows)
```

Total de comprobaciones no duplicadas de las suites principales: **336/336 OK**.

La primera ejecución backend completamente paralela produjo una respuesta 400 transitoria en el gate LIVE mientras coexistían tres runtimes PocketBase pesados. El mismo gate pasó aislado y la suite completa pasó 159/159 en orden determinista con `--test-concurrency=1`. No se aplicó una relajación funcional ni de seguridad; el comando estable queda documentado arriba.

## Defectos

### Encontrados y corregidos

1. El builder de servicios copiaba `galleryKey` dentro del objeto localizado, campo que el backend vivo rechaza. Se separó la relación estructural de la copy localizada.
2. Un test antiguo prohibía cualquier endpoint de media dentro del CMS; se acotó para permitir exclusivamente la carga QR requerida sin reintroducir publicación o catálogo de temas en ese editor.
3. Fixtures públicos antiguos omitían `qr_media_use_key`; se actualizaron al contrato exacto v2.
4. El validador de galerías contenía un byte NUL literal en una expresión regular. Se reemplazó por escapes Unicode equivalentes para mantener el archivo textual y el mismo rechazo de controles.

### Pendientes

- Defectos funcionales o de seguridad abiertos: ninguno.
- Validación visual humana, commit, push y despliegue: no ejecutados; requieren autorización posterior explícita.

## Archivos modificados

### Backend — hooks

- `backend-powerzona/pb_hooks/pz_promo_analytics_api_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_audit_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_data_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_domain_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_master_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_media_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_performance_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_pubcfg.pb.js`
- `backend-powerzona/pb_hooks/pz_promo_pubcfg_api_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_pubcfg_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_shell_api_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_theme_lib.js`

### Backend — migraciones y pruebas

- `backend-powerzona/pb_migrations/1787520650_promo_theme_catalog.js`
- `backend-powerzona/pb_migrations/1787520660_promo_qr_media.js`
- `backend-powerzona/pb_migrations/1787520700_promo_live_content.js`
- `backend-powerzona/tests/pz_promo_analytics.test.cjs`
- `backend-powerzona/tests/pz_promo_data_http_runtime.test.cjs`
- `backend-powerzona/tests/pz_promo_domain.test.cjs`
- `backend-powerzona/tests/pz_promo_master.test.cjs`
- `backend-powerzona/tests/pz_promo_performance.test.cjs`
- `backend-powerzona/tests/pz_promo_permissions_http_runtime.test.cjs`
- `backend-powerzona/tests/pz_promo_pubcfg.test.cjs`
- `backend-powerzona/tests/pz_promo_pubcfg_http_runtime.test.cjs`
- `backend-powerzona/tests/pz_promo_theme.test.cjs`

### Frontend — componentes

- `frontend-powerzona/src/components/admin/promo/PromoAdminShell.astro`
- `frontend-powerzona/src/components/admin/promo/PromoAppearanceEditor.astro`
- `frontend-powerzona/src/components/admin/promo/PromoCmsEditor.astro`
- `frontend-powerzona/src/components/admin/promo/PromoGalleryEditor.astro`
- `frontend-powerzona/src/components/admin/promo/PromoLandingQrEditor.astro`
- `frontend-powerzona/src/components/admin/promo/PromoLocalesEditor.astro`
- `frontend-powerzona/src/components/admin/promo/PromoReviewsEditor.astro`
- `frontend-powerzona/src/components/master/MasterPromoStoreView.astro`
- `frontend-powerzona/src/components/promo-public/PromoBlackGoldTheme.astro`
- `frontend-powerzona/src/components/promo-public/PromoContact.astro`
- `frontend-powerzona/src/components/promo-public/PromoHero.astro`
- `frontend-powerzona/src/components/promo-public/PromoPublicShell.astro`
- `frontend-powerzona/src/components/promo-public/PromoSections.astro`

### Frontend — librerías, API y estilos

- `frontend-powerzona/src/lib/promoAdminShell.ts`
- `frontend-powerzona/src/lib/promoAppearance.ts`
- `frontend-powerzona/src/lib/promoCms.ts`
- `frontend-powerzona/src/lib/promoGallery.ts`
- `frontend-powerzona/src/lib/promoLocales.ts`
- `frontend-powerzona/src/lib/promoMedia.ts`
- `frontend-powerzona/src/lib/promoPublicShell.ts`
- `frontend-powerzona/src/pages/api/admin/promo-cms.ts`
- `frontend-powerzona/src/styles/promo-admin-shell.css`
- `frontend-powerzona/src/styles/promo-cms.css`
- `frontend-powerzona/src/styles/promo-contact.css`
- `frontend-powerzona/src/styles/promo-gallery.css`
- `frontend-powerzona/src/styles/promo-hero.css`
- `frontend-powerzona/src/styles/promo-sections.css`
- `frontend-powerzona/src/styles/promo-theme-variants.css`

### Frontend — pruebas

- `frontend-powerzona/tests/promoAppearance.test.mjs`
- `frontend-powerzona/tests/promoCms.test.mjs`
- `frontend-powerzona/tests/promoGallery.test.mjs`
- `frontend-powerzona/tests/promoLandingQr.test.mjs`
- `frontend-powerzona/tests/promoLocales.test.mjs`
- `frontend-powerzona/tests/promoMaster.test.mjs`
- `frontend-powerzona/tests/promoPreview.test.mjs`
- `frontend-powerzona/tests/promoPublicShell.test.mjs`

### Documentación

- `docs/tusenda84/prompts/TS84-PROMO-LIVE-CATALOG-0001.md`
- `docs/tusenda84/reportes/TS84-PROMO-LIVE-CATALOG-0001-implementacion.md`

## Datos de prueba y estado final

- No se crearon ni modificaron tiendas, usuarios, dominios, media ni contenido en staging o producción.
- Los gates runtime crearon únicamente datos sintéticos en directorios temporales locales de PocketBase; sus rutinas de cierre eliminaron esos directorios.
- No se reutilizaron datos ni volúmenes de producción.

## Límites respetados y siguiente paso

- Se mantuvieron Commerce, DNS, Cloudflare, certificados, dominio privado y producción fuera del alcance.
- No se solicitaron, leyeron, imprimieron ni escribieron secretos.
- No se instaló ningún plugin ni dependencia.
- No se hizo commit, push, merge, deploy ni release.
- Siguiente Prompt ID habilitado: **ninguno definido por este contrato**. Una tarea posterior de commit/push/despliegue o QA visual de staging debe autorizarse de forma explícita y no se inició.
