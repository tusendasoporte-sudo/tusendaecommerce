# TS84-PROMO-SECTIONS-0001 — Reporte de implementación

**Fecha:** 2026-08-24

**Estado:** COMPLETADO

**Rama de trabajo:** `dev`

**Base autorizada verificada:** `a34d022`

**Commit creado:** no; pendiente de autorización separada

## 1. Resultado

Se implementaron exclusivamente las secciones públicas especializadas `services`, `featured_work`, `gallery` y `owner` sobre el renderer Promo negro/dorado y el Hero aprobados. La salida sigue siendo SSR first-party, sin hidratación ni scripts tenant-controlled, y consume únicamente el documento público ya normalizado desde una revisión publicada e inmutable.

La implementación conserva el orden editorial exacto y no incorpora destinos de contacto, carrito, checkout, precios, pedidos, analítica ni infraestructura Commerce.

## 2. Precondiciones verificadas antes de modificar

- Rama local exacta: `dev`.
- `HEAD` exacto: `a34d022`.
- Worktree limpio.
- La base contenía las implementaciones aprobadas de `TS84-PROMO-ALADDIN-0001` y `TS84-PROMO-HERO-0001`.

## 3. Contratos respetados

Se revisaron como contratos la hoja de ruta maestra y los reportes previos necesarios para el alcance: CMS, GALLERY, MEDIA, THEME, SHELL, PUBLISH, I18N, PUBCFG, ALADDIN y HERO. La dirección visual `VIS-0001` se tomó de la definición canónica incluida en el mapa maestro; no existe un archivo independiente con ese Prompt ID en el repositorio.

Decisiones contractuales conservadas:

- una sola lectura pública SSR del snapshot publicado e inmutable;
- locale exacto, sin fallback silencioso;
- orden de secciones e items determinado por el documento publicado;
- media entregada solo mediante `promo.media.delivery.v1`;
- rutas de media content-addressed y sin URLs tenant-controlled;
- compatibilidad multi-tenant sin mezclar tenant, revisión o locale;
- HTML semántico sin ejecución de contenido del tenant;
- Tema Promo independiente de Master, Commerce y Admin.

## 4. Implementación

### 4.1 Renderer especializado

Se añadió `PromoSections.astro`, despachado únicamente para estos tipos exactos:

- `services`: grilla editorial ordenada con nombre, resumen, caption y media opcional emparejada por posición;
- `featured_work`: secuencia editorial alterna entre media y texto, con imagen o video normalizado;
- `gallery`: mosaico responsive para imágenes y videos, con caption y sin enlaces, lightbox o scripts;
- `owner`: retrato o placeholder, nombre, biografía y media resuelta por `media_use_key` exacto o por la primera media publicada de la sección.

Los tipos no incluidos en el alcance conservan el renderer genérico aprobado. En particular, no se implementó comportamiento de contacto ni reseñas.

### 4.2 Media pública

Se añadió `PromoSectionMedia.astro` como adaptador de presentación del contrato MEDIA ya normalizado:

- imágenes con `src`, `srcset`, `sizes`, dimensiones, `alt`, `loading`, `decoding` y `fetchpriority` provenientes del pipeline aprobado;
- carga diferida fuera del Hero;
- videos nativos con `controls`, `preload="none"`, `playsinline`, poster y MIME normalizados;
- sin autoplay, trackers, embeds, URLs externas ni reproductores tenant-controlled;
- estado visual estable cuando una sección no tiene media.

### 4.3 Integridad editorial

La normalización pública ahora falla cerrada si `services`, `featured_work` o `gallery` presentan cualquiera de estas divergencias:

- `config.item_keys` no es una lista válida;
- existen claves duplicadas;
- la cantidad de claves no coincide con los items localizados;
- una clave o su posición no coincide exactamente con el item publicado.

Esta validación ocurre después de seleccionar el locale exacto y antes de renderizar, sin consultar otra revisión ni fuente de datos.

### 4.4 Tema, responsive y accesibilidad

Se añadió CSS first-party compilado para el lenguaje visual negro/dorado aprobado:

- Services: 3 columnas, luego 2 y finalmente 1.
- Featured work: composición editorial alterna de dos columnas y apilado móvil.
- Gallery: mosaico de 12 columnas, reducción a 2 y luego 1.
- Owner: composición retrato/texto que se apila en móvil.
- Escala tipográfica fluida, bordes dorados discretos y contraste consistente con Hero.
- Un único `h1` en el documento; las secciones posteriores usan `h2`.
- Regiones rotuladas mediante `aria-labelledby`.
- Focus visible para controles de video.
- Respeto de `prefers-reduced-motion`.
- Sin overflow horizontal en los viewports comprobados.

## 5. Archivos

### Nuevos

- `frontend-powerzona/src/components/promo-public/PromoSectionMedia.astro`
- `frontend-powerzona/src/components/promo-public/PromoSections.astro`
- `frontend-powerzona/src/styles/promo-sections.css`
- `docs/tusenda84/reportes/TS84-PROMO-SECTIONS-0001-implementacion.md`

### Modificados

- `frontend-powerzona/src/components/promo-public/PromoBlackGoldTheme.astro`
- `frontend-powerzona/src/lib/promoPublicShell.ts`
- `frontend-powerzona/tests/promoPublicShell.test.mjs`

No se añadieron dependencias, migraciones, colecciones, endpoints, variables de entorno ni cambios de datos.

## 6. Pruebas y verificación

### Pruebas focales

Comando:

```text
node --test tests/promoPublicShell.test.mjs
```

Resultado: **10/10 PASS**.

Cobertura añadida:

- normalización exacta y orden editorial de las cuatro secciones;
- asociación de media por `use_key` y propósito;
- imágenes lazy fuera del Hero;
- video sin autoplay y con `preload="none"`;
- rechazo de propósito MEDIA incompatible;
- composición estructural del renderer y CSS;
- ausencia de enlaces, botones, formularios, contacto, Commerce y scripts en las secciones nuevas;
- presupuesto CSS y breakpoints responsive.

### Build SSR

Comando:

```text
npm.cmd run build
```

Resultado: **PASS**. Se conservaron tres advertencias Astro preexistentes sobre `getStaticPaths()` ignorado en rutas dinámicas con `output: server`; no son introducidas por este prompt.

### Regresión frontend

Comando:

```text
node --test
```

Resultado: **712 PASS, 0 FAIL**.

### Regresión backend

Comando:

```text
node --test
```

Resultado: **858 PASS, 0 FAIL, 7 SKIP esperados**; total 865.

### QA visual local

Se ejecutó contra una respuesta sintética estrictamente local, sin consultar servicios externos, PocketBase desplegado, staging ni producción.

Viewports inspeccionados:

- escritorio: `1440 × 900`;
- tablet: `768 × 1024`;
- móvil: `390 × 844`;
- móvil estrecho y sin media: `320 × 700`.

Resultado:

- orden exacto `services → featured_work → gallery → owner`;
- integración visual coherente con Header, Hero y Footer aprobados;
- un solo `h1`;
- cero acciones dentro de las secciones;
- cero overflow horizontal y cero descendientes fuera del viewport;
- 12/12 imágenes de sección con carga diferida y prioridad automática;
- video con controles, `preload="none"`, sin autoplay y alcanzable por teclado;
- cero solicitudes de video antes de interacción;
- placeholders estables y legibles cuando no existe media;
- sin solapamientos, cortes de texto ni captions ilegibles en los tamaños revisados.

## 7. Compatibilidad y límites conservados

- **Master:** no se cambian control, permisos, publicación ni configuración global.
- **Admin:** no se cambia autoría, revisión, publicación ni vista previa.
- **Commerce:** permanece separado; no se reutilizan catálogo, precios, carrito, checkout ni pedidos.
- **Promo público:** solo lectura SSR del contrato público aprobado y media first-party normalizada.
- No se consultaron ni modificaron PocketBase desplegado, Cloudflare, Coolify, staging o producción.
- No se leyeron secretos.
- No se realizó push, merge, despliegue, release ni commit.

## 8. Alcance no iniciado

No se inició `TS84-PROMO-REVIEWS-0001`, `TS84-PROMO-CONTACT-0001`, `TS84-PROMO-DOM-CF-0001` ni ningún prompt posterior. Tampoco se activaron destinos de contacto, acciones comerciales, analítica o scripts de terceros.

## 9. Siguiente Prompt ID habilitado

Con `TS84-PROMO-SECTIONS-0001` completado, el siguiente Prompt ID de la secuencia maestra es:

**`TS84-PROMO-REVIEWS-0001`**

Su implementación no forma parte de este cambio y no fue iniciada.
