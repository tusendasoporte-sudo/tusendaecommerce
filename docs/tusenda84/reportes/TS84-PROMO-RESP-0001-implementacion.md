# TS84-PROMO-RESP-0001 — Implementación responsive móvil y táctil

Fecha: 2026-08-24
Rama local: `dev`
HEAD de partida y cierre: `ff7f2e1`
Estado: **IMPLEMENTADO Y VALIDADO LOCALMENTE**

## 1. Integridad de partida

Antes de modificar el proyecto se comprobó:

- rama activa exacta: `dev`;
- HEAD exacto: `ff7f2e1`;
- worktree limpio;
- el commit de partida contiene la aprobación humana de `TS84-PROMO-MOB-VIS-0001` y `G-MOB-VIS` como `SUPERADO`.

No se creó commit y el HEAD permanece en `ff7f2e1`.

## 2. Alcance ejecutado

Se cerró exclusivamente `TS84-PROMO-RESP-0001` sobre el shell Promo negro/dorado existente. La implementación conserva la misma proyección SSR, contenido, orden de secciones, funciones, acciones y destinos de desktop.

La superficie validada incluye:

- cabecera y marca;
- navegación horizontal accesible;
- selector exacto ES/EN;
- acceso independiente a Landing QR;
- Hero, CTA, carrusel, imagen, video y controles;
- servicios, trabajo destacado, galería y propietario;
- reseñas;
- contacto;
- footer, enlaces, redes y branding reservado.

No se modificaron componentes de dominio, contratos de datos, rutas, destinos, URLs, colecciones, migraciones ni backend.

## 3. Contratos respetados

Se aplicaron los contratos del mapa maestro, la propuesta visual móvil aprobada y sus cuatro evidencias, además de los reportes QR, ALADDIN, HERO, SECTIONS, REVIEWS, CONTACT y FOOTER y sus dependencias de arquitectura, i18n, media, shell, tema y accesibilidad.

Decisiones preservadas:

- shell Promo independiente de Commerce y sin hidratación comercial;
- locale efectivo exacto por URL, sin mezcla ES/EN ni fallback por campo;
- CTA único compilado por CONTACT y reutilizado por Hero y contacto;
- Landing QR independiente, sin alterar su función ni destino;
- una sola imagen Hero con `loading="eager"` y `fetchpriority="high"`;
- medios fuera del Hero con lazy loading;
- videos con poster, controles nativos, `preload="none"` y sin autoplay;
- redes y navegación compiladas/allowlisted;
- ausencia de carrito, checkout, precios, pedidos, analytics y scripts comerciales.

## 4. Cambios realizados

### Cabecera, navegación, locales y QR

- Se aseguró la composición móvil aprobada de tres filas visuales: marca, utilidades/locales y navegación.
- Navegación y selector se confinan a su propio scroller o wrap sin ampliar la página.
- Se fijaron targets mínimos de `44 × 44 px` para navegación y locales.
- Se corrigió expresamente el corte estrecho que permitía locales de `42 px`; ahora permanece en `44 × 44 px`.
- En `320 px`, el acceso QR conserva un target `44 × 44 px` y oculta solo su etiqueta visual; el nombre accesible y el destino permanecen.
- Se añadieron `min-width: 0`, wrapping robusto y contención de overscroll donde corresponde.

### Hero y contacto

- Se corrigieron expresamente los controles Hero que podían reducirse a `36 px`; ahora son `44 × 44 px` en todos los cortes móviles.
- El CTA conserva altura mínima de `54 px`, ancho disponible y el mismo `tel:+13055550184` en Hero y contacto.
- Hero mantiene una columna móvil y media `4:3` según el mockup aprobado.
- El video Hero recibió foco visible explícito de `3 px` sin sustituir sus controles nativos.
- Se evitó movimiento residual en hover cuando el token del tema exige movimiento reducido.

### Secciones, propietario, reseñas y footer

- Servicios y galería refluyen a una columna en el ancho estrecho.
- Trabajo destacado y propietario conservan composición, contenido y marco desplazado sin recorte accidental.
- Reseñas permanecen como scroller propio, con tarjetas de `84–86vw`, navegación por teclado y wrapping de nombres/comentarios largos.
- El footer pasa a una sola columna cuando el ancho lo exige, manteniendo todos sus enlaces y redes.
- Etiquetas, captions, CTA y textos editoriales aceptan strings largos mediante wrapping seguro.

### Accesibilidad, zoom y preferencias

- El skip link tiene target mínimo de `44 px`, wrapping seguro y foco visible de `3 px` con offset.
- El orden natural de foco permanece sin índices positivos: skip link, marca, navegación, locales, QR, CTA, scroller Hero, video y controles, seguido por el resto del documento.
- Se conserva `text-size-adjust: 100%` y los contenedores permiten crecimiento vertical con texto al `200 %`.
- La navegación, reseñas y medios no fuerzan desborde horizontal de página en reflujo equivalente a `400 %`.
- `prefers-reduced-motion` y el token `motion="reduced"` eliminan desplazamientos/transiciones no esenciales.
- El contrato de ahorro de datos queda cubierto por poster, `preload="none"`, ausencia de autoplay y carga progresiva de imágenes.

## 5. Archivos modificados

- `frontend-powerzona/src/styles/promo-public-shell.css`
- `frontend-powerzona/src/styles/promo-black-gold.css`
- `frontend-powerzona/src/styles/promo-landing-qr.css`
- `frontend-powerzona/src/styles/promo-hero.css`
- `frontend-powerzona/src/styles/promo-sections.css`
- `frontend-powerzona/src/styles/promo-reviews.css`
- `frontend-powerzona/src/styles/promo-contact.css`
- `frontend-powerzona/src/styles/promo-footer.css`
- `frontend-powerzona/tests/promoResponsive.test.mjs`
- `docs/tusenda84/reportes/evidencias/TS84-PROMO-RESP-0001/01-recorrido-es-390x844.png`
- `docs/tusenda84/reportes/evidencias/TS84-PROMO-RESP-0001/02-locale-en-412x915.png`
- `docs/tusenda84/reportes/evidencias/TS84-PROMO-RESP-0001/03-reflow-320x700.png`
- `docs/tusenda84/reportes/evidencias/TS84-PROMO-RESP-0001/04-foco-visible-skip-link-390x844.png`
- `docs/tusenda84/reportes/evidencias/TS84-PROMO-RESP-0001/05-texto-200-390x844.png`
- `docs/tusenda84/reportes/TS84-PROMO-RESP-0001-implementacion.md`

## 6. Pruebas automatizadas

### Focal RESP + shell público

```text
node --test tests/promoResponsive.test.mjs tests/promoPublicShell.test.mjs

Resultado: 19/19 PASS
```

Las cinco pruebas nuevas fijan:

- targets táctiles y CTA;
- cabecera de tres filas, QR estrecho y navegación confinada;
- reflujo de Hero, secciones, reseñas y footer;
- teclado, foco, zoom de texto y strings largos;
- media progresiva, video bajo interacción y movimiento reducido.

### Frontend completo

```text
node --test

Resultado: 730/730 PASS
```

### Backend completo, solo regresión local

```text
node --test --test-reporter=dot

Resultado final: PASS, código de salida 0
```

La primera ejecución dentro del sandbox no pudo crear cinco directorios temporales locales `.tmp` y terminó con `EPERM` antes de ejercer esos runtimes. Se repitió fuera del sandbox con el mismo worktree y la suite completa terminó sin fallos. No se consultó PocketBase desplegado ni ningún servicio externo.

### Build SSR

```text
npm run build

Resultado: PASS
```

Se conservaron tres warnings preexistentes de Astro sobre `getStaticPaths()` ignorado en las rutas dinámicas de producto, categoría y subcategoría. No pertenecen al alcance RESP.

### Consistencia Git

```text
git diff --check

Resultado: PASS
```

Git solo informó la normalización futura LF/CRLF ya propia del entorno Windows; no encontró errores de whitespace.

## 7. QA visual local

Se usó el sitio Astro local con una proyección Promo sintética y determinista, sin red externa ni datos desplegados. Los medios visuales son placeholders locales de QA que ejercen los contratos reales de delivery; no se añadieron como datos del producto.

| Viewport/estado | Resultado |
|---|---|
| `390 × 844`, ES | Cabecera de tres filas, Hero y CTA completos; targets interactivos mínimos de `44 px`; CTA `54 px`; `scrollWidth == clientWidth`; orden y destinos conservados. |
| `412 × 915`, EN | `lang="en"`, locale EN activo, cero strings de contenido ES detectados, misma acción `tel:` y cero desborde de página. |
| `320 × 700`, ES | QR icon-only `44 × 44 px`, controles Hero `44 px`, CTA `54 px`, servicios/galería/footer en una columna y reseñas confinadas a su scroller. |
| Texto `200 %` en `390 × 844` | Root de QA a `32 px`; cero targets bajo `44 px`; ambos CTA crecen a `119.34 px`; cero desborde horizontal de página. |
| Reflujo hasta `400 %` | Validado con el equivalente WCAG de `320 CSS px` desde una referencia de `1280 px`; `scrollWidth == clientWidth` y ninguna función se elimina. |

Comprobaciones adicionales en navegador:

- foco visible real de `3 px` en skip link, marca, locales, QR y video Hero;
- orden DOM de foco exacto y sin `tabindex` positivo;
- carga prioritaria Hero única: una imagen eager/high;
- imágenes fuera del Hero lazy;
- dos videos con poster, controles, `preload="none"`, sin autoplay;
- inventario de recursos observado antes de reproducir: `video: 0`;
- consola local: cero errores y cero warnings;
- movimiento reducido del perfil EN: transiciones no esenciales a `0s` y scroller de reseñas en `auto`.

## 8. Evidencias

- `01-recorrido-es-390x844.png`: composición ES en viewport exacto y foco visible de marca.
- `02-locale-en-412x915.png`: paridad EN y navegación horizontal confinada.
- `03-reflow-320x700.png`: ancho estrecho, QR icon-only y Hero sin overflow.
- `04-foco-visible-skip-link-390x844.png`: skip link visible con anillo de `3 px`.
- `05-texto-200-390x844.png`: crecimiento de texto al `200 %` sin desborde de página.

## 9. Límites de la validación

- El QA se realizó en viewports reproducibles del navegador local; no sustituye una pasada posterior en dispositivos físicos ni con lectores de pantalla de cada sistema operativo.
- La ampliación de texto se emuló únicamente en un proxy efímero de QA mediante `html { font-size: 200% }`; ese estilo no forma parte del proyecto.
- No se probaron DNS, HTTPS público, Cloudflare, Coolify, staging ni producción porque están expresamente fuera de alcance.
- No se activó ni simuló infraestructura Commerce, analytics ni scripts comerciales.

Estos límites no dejan una regresión conocida dentro del alcance frontend de `TS84-PROMO-RESP-0001`.

## 10. Cierre y siguiente Prompt ID

`TS84-PROMO-RESP-0001` queda implementado y validado localmente, con paridad móvil/desktop, targets táctiles, reflujo, accesibilidad de teclado/foco, locales exactos y media progresiva sin desborde horizontal conocido.

Siguiente Prompt ID del mapa maestro: `TS84-PROMO-DOM-CF-0001`.

`TS84-PROMO-DOM-CF-0001` **no fue iniciado**. Requiere una autorización independiente y debe conservar su alcance server-only y de simulación segura, sin activar dominio real.
