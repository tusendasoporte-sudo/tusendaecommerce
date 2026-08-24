# TS84-PROMO-REVIEWS-0001 — Reporte de implementación

**Fecha:** 2026-08-24

**Estado:** COMPLETADO

**Rama de trabajo:** `dev`

**Base autorizada verificada:** `431a620`

**Commit creado:** no; pendiente de autorización separada

## 1. Resultado

Se implementó exclusivamente el adaptador de ratings y reseñas generales de tienda para Promo, su moderación privada y su presentación pública SSR sobre el renderer negro/dorado aprobado.

La fuente sigue siendo la colección `reviews` existente, con aislamiento exacto por tienda y filtro server-side `type = 'store'`. La salida pública adjunta datos dinámicos únicamente cuando la revisión publicada e inmutable habilita `adapters.store_rating` y contiene una sección `store_rating`; solo proyecta reseñas `approved` y nunca expone IDs, pedidos, productos, compra verificada ni relaciones internas.

No se incorporaron precios, carrito, checkout, pedidos, destinos de contacto, analítica, scripts comerciales ni infraestructura Commerce.

## 2. Precondiciones verificadas antes de modificar

- Rama local exacta: `dev`.
- `HEAD` exacto: `431a620`.
- Worktree limpio.
- La base contenía la implementación aprobada de `TS84-PROMO-SECTIONS-0001`.

## 3. Contratos respetados

Se revisaron el mapa maestro, el reporte de SECTIONS y los contratos previos requeridos por REVIEWS: ARC, DATA-DES, PERM, PUBCFG, PUBLISH, CMS, I18N, THEME, ADMIN-SHELL, SHELL y HERO.

Decisiones conservadas:

- fuente transversal read-only basada en reseñas de tienda existentes, sin dependencia de pedidos;
- lectura pública del snapshot publicado inmutable antes de resolver el adaptador opcional;
- activación doble y cerrada: adaptador publicado más sección `store_rating` publicada;
- tenant derivado por el servidor, nunca aceptado desde el body o filtros del cliente;
- locale exacto y catálogo del sistema versionado, sin fallback silencioso;
- moderación privada protegida por `promo.reviews.manage` y CAS por `expected_updated`;
- auditoría Promo central sin nombres, comentarios, datos de pedido ni contenido personal;
- renderer first-party SSR sin scripts, URLs o variantes tenant-controlled.

## 4. Implementación

### 4.1 Adaptador público

Se añadió el contrato `promo.store-rating.v1`, adjuntado por el pipeline SHELL después de localizar la revisión publicada exacta.

- consulta exclusiva de `reviews` con `store = contexto`, `type = 'store'` y `status = 'approved'`;
- orden estable por destacado y fecha;
- máximo de 12 reseñas visibles;
- resumen agregado con promedio de una decimal y total aprobado;
- DTO público mínimo: `rating`, `name`, `comment` y fecha civil;
- fallo aislado del adaptador opcional: el sitio sigue sirviendo y la sección queda en estado no disponible;
- ninguna lectura de catálogo, productos, pedidos o relaciones Commerce.

### 4.2 Moderación privada

Se añadieron dos rutas Promo POST autenticadas y `no-store`:

- listado paginado y filtrado por estado;
- moderación con acciones exactas `approve`, `reject`, `hide`, `feature` y `unfeature`.

La API exige la acción `promo.reviews.manage`, deriva la tienda desde el contexto Promo aprobado, fuerza `type = 'store'`, usa transacción y CAS, y registra solamente cambios allowlisted de estado, destacado y existencia de aprobación en el writer AUDIT central.

### 4.3 Admin Promo

El módulo Reviews del shell Admin dejó de ser placeholder y ahora ofrece:

- activación de la sección y título del locale principal guardados únicamente en el draft CMS existente;
- aviso explícito de que hace falta publicar una nueva revisión para cambiar la salida pública;
- métricas de reseñas de tienda, filtros y paginación de 20 elementos;
- acciones de moderación según estado;
- permisos separados para lectura/moderación y configuración editorial;
- construcción DOM mediante `textContent`, sin `innerHTML` ni interpolación ejecutable.

No se creó almacenamiento paralelo ni se reutilizó infraestructura Admin/Commerce para modelar Promo.

### 4.4 Renderer, responsive y accesibilidad

Se añadió `PromoReviews.astro` al tema negro/dorado:

- encabezado localizado, promedio y conteo;
- lista semántica SSR de tarjetas, sin hidratación;
- región de desplazamiento rotulada y alcanzable por teclado;
- estrellas con etiqueta accesible y decoración separada con `aria-hidden`;
- fechas formateadas con el locale efectivo;
- cuadrícula de tres columnas en escritorio y carrusel horizontal de una fila en tablet/móvil;
- foco visible, scroll snap y respeto de `prefers-reduced-motion`;
- estados localizados para lista vacía o adaptador no disponible.

## 5. Archivos

### Nuevos

- `backend-powerzona/pb_hooks/pz_promo_reviews.pb.js`
- `backend-powerzona/pb_hooks/pz_promo_reviews_api_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_reviews_lib.js`
- `backend-powerzona/tests/pz_promo_reviews.test.cjs`
- `frontend-powerzona/src/components/admin/promo/PromoReviewsEditor.astro`
- `frontend-powerzona/src/components/promo-public/PromoReviews.astro`
- `frontend-powerzona/src/lib/promoReviews.ts`
- `frontend-powerzona/src/pages/api/admin/promo-reviews.ts`
- `frontend-powerzona/src/styles/promo-reviews-admin.css`
- `frontend-powerzona/src/styles/promo-reviews.css`
- `frontend-powerzona/tests/promoReviews.test.mjs`
- `docs/tusenda84/reportes/TS84-PROMO-REVIEWS-0001-implementacion.md`

### Modificados

- `backend-powerzona/pb_hooks/pz_promo_audit_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_i18n_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_shell_api_lib.js`
- `frontend-powerzona/src/components/admin/promo/PromoAdminShell.astro`
- `frontend-powerzona/src/components/promo-public/PromoBlackGoldTheme.astro`
- `frontend-powerzona/src/lib/promoAdminShell.ts`
- `frontend-powerzona/src/lib/promoPreview.ts`
- `frontend-powerzona/src/lib/promoPublicShell.ts`
- `frontend-powerzona/tests/promoPublicShell.test.mjs`

No se añadieron dependencias, migraciones, colecciones, variables de entorno ni fuentes de datos.

## 6. Pruebas y verificación

### Pruebas focales backend

Comando:

```text
node --test tests/pz_promo_reviews.test.cjs tests/pz_promo_audit.test.cjs tests/pz_promo_i18n.test.cjs tests/pz_promo_shell.test.cjs
```

Resultado: **29/29 PASS**.

Cobertura: gate publicado del adaptador, filtro exacto de tienda/aprobación, DTO público sin Commerce, transiciones de moderación, contratos privados exactos, rutas autenticadas, tenant server-side y auditoría saneada.

### Pruebas focales frontend

Comando:

```text
node --test tests/promoReviews.test.mjs tests/promoPublicShell.test.mjs tests/promoPreview.test.mjs tests/promoAdminShell.test.mjs
```

Resultado: **26/26 PASS**.

Cobertura: edición del draft sin alterar el resto del documento, DTOs exactos, extensión dinámica del shell publicado, renderer SSR accesible sin acciones comerciales y Admin con permisos/DOM seguro.

### Build SSR

Comando:

```text
npm.cmd run build
```

Resultado: **PASS**. Persisten únicamente tres advertencias Astro preexistentes sobre `getStaticPaths()` ignorado en rutas dinámicas con `output: server`.

### Regresión completa

- Frontend: **717 PASS, 0 FAIL**.
- Backend: **864 PASS, 0 FAIL, 7 SKIP esperados**; total 871.
- `git diff --check`: **PASS**; solo avisos informativos de conversión LF/CRLF del worktree Windows.

### QA visual local

Se usó Playwright con Chrome headless contra un backend sintético estrictamente local; no se consultó ningún servicio externo.

- escritorio `1440 × 1000`: página sin overflow, tarjetas en tres columnas de 376 px;
- móvil `390 × 844`: página sin overflow, carrusel de una fila, viewport de 358 px y contenido desplazable de 1010 px;
- cuatro reseñas renderizadas, un único `h1`, región rotulada y foco visible;
- contraste, jerarquía, fechas, estrellas y textos inspeccionados visualmente sin cortes ni solapamientos.

## 7. Compatibilidad y límites conservados

- **Master:** soporte cross-tenant solo mediante el contexto central aprobado y el header interno exacto; no se amplían acciones.
- **Admin:** módulo Promo dedicado, autorización granular y escritura editorial mediante el draft/revisión existentes.
- **Commerce:** sus reseñas y flujos comerciales permanecen separados; Promo solo reutiliza las filas generales `type = 'store'`.
- **Público:** SSR desde una revisión publicada inmutable, con el adaptador read-only habilitado por esa misma revisión.
- No se consultaron ni modificaron PocketBase desplegado, Cloudflare, Coolify, staging o producción.
- No se leyeron secretos.
- No se realizó push, merge, despliegue, release ni commit.

## 8. Alcance no iniciado

No se inició `TS84-PROMO-CONTACT-0001`, `TS84-PROMO-DOM-CF-0001` ni ningún prompt posterior. No se activaron destinos de contacto, carrito, checkout, precios, pedidos, analítica ni scripts comerciales.

## 9. Siguiente Prompt ID habilitado

Con `TS84-PROMO-REVIEWS-0001` completado, el siguiente Prompt ID de la secuencia maestra es:

**`TS84-PROMO-CONTACT-0001`**

Su implementación no forma parte de este cambio y no fue iniciada.
