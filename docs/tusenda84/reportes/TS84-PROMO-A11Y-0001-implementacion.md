# TS84-PROMO-A11Y-0001 — Implementación y auditoría de accesibilidad del shell público Promo

Fecha: 2026-08-25
Estado: COMPLETADO
Rama de trabajo: `dev`
HEAD de partida verificado: `5dcf6d6`
Worktree de partida: limpio
Commit: no creado; los cambios quedan locales y sin commit

## 1. Alcance ejecutado

Se implementó exclusivamente `TS84-PROMO-A11Y-0001` sobre el shell público Promo aprobado. Se auditaron semántica, landmarks, encabezados, nombres y estados accesibles, alternativas de media, teclado, orden y visibilidad del foco, reflow, orientación, contraste, locales, RTL, strings largos, movimiento reducido, targets táctiles y el contrato de video.

La referencia normativa usada para la matriz fue WCAG 2.2, nivel AA: <https://www.w3.org/TR/WCAG22/>. Este resultado es una auditoría técnica local de los criterios cubiertos, no una certificación de conformidad de todo contenido publicado.

No se conectaron Cloudflare, DNS, zonas, certificados, staging, producción, cuentas ni servicios externos. No se instalaron paquetes ni plugins y no se solicitaron, leyeron o escribieron secretos. No se modificaron contratos compartidos, migraciones, backend, Commerce, tiendas sin Promo, Landing QR Commerce, Admin, Master, preview/draft, publicación o rollback.

Contratos leídos y respetados:

- `TS84_PROMO_MAPA_MAESTRO_PROMPTS.md` y `TS84-PROMO-ARC-0001-arquitectura-adrs.md`;
- `RESP-0001`, `MOB-VIS-0001`, `I18N-0001`, `THEME-0001`, `MEDIA-0001`, `SHELL-0001` y `HERO-0001`;
- `SECTIONS-0001`, `GALLERY-0001`, `CONTACT-0001`, `FOOTER-0001`, `REVIEWS-0001` y `LANDING-QR-0001`;
- `SEO-0001`, `ANALYTICS-0001`, `SEC-0001`, `L7Q1-0001` y `PERF-0001`, incluidos sus reportes y dependencias indicadas por el mapa.

## 2. Cambios implementados

### 2.1 Semántica y nombres accesibles

- El resumen de puntuación de reseñas expone un grupo con nombre accesible; la representación por estrellas de cada reseña se materializa como imagen semántica con su puntuación.
- Los enlaces de control del carrusel Hero ahora diferencian nombre del medio, posición actual y total, evitando nombres repetidos ambiguos.
- Se conservaron `lang`, `dir`, `aria-current`, nombres de navegación, landmarks `header/main/footer`, un solo `h1`, headings de sección, regiones scrollables y mensajes `role="status"`.
- Imágenes informativas conservan `alt` localizado; elementos ornamentales siguen ocultos al árbol accesible. No se añadió ARIA sobre elementos cuyo rol no admite nombre.

### 2.2 Teclado, foco y targets

- Se verificó la secuencia completa de tabulación, acceso al skip link, activación hacia `main`, continuidad del foco y ausencia de trampas en un render SSR representativo.
- Hero y reseñas conservan regiones enfocables y desplazamiento horizontal operable mediante teclado.
- El foco de video incorpora un anillo interior oscuro más contorno marfil, legible sobre posters o fotogramas variables.
- En `forced-colors` el shell usa el color de sistema `Highlight`; `prefers-contrast: more` eleva texto secundario, acento y bordes.
- Los controles del carrusel Hero se mueven al inicio superior del medio para no cubrir la franja inferior de controles nativos del video.
- El gate dinámico verifica 44×44 px mínimos para todos los enlaces visibles del escenario; el CTA conserva 54 px conforme a RESP/MOB-VIS.

### 2.3 Contraste, estados y movimiento

- Se definió el token `--promo-text-soft` que reseñas ya consumía, con valor de contraste aprobado.
- El estado de contacto no disponible deja de depender de opacidad: usa borde discontinuo, superficie secundaria, texto contrastado, ausencia de sombra y ninguna respuesta de hover que sugiera interactividad.
- Se calculan localmente relaciones de contraste de texto normal ≥ 4,5:1 y foco/componente ≥ 3:1 para las combinaciones efectivas auditadas.
- Landing QR respeta tanto `prefers-reduced-motion` como el token Theme `motion=reduced`; los demás componentes mantienen sus contratos de transición y scroll reducidos.

### 2.4 Video y media

- El video conserva controles nativos, nombre accesible, poster, `preload=none`, `playsinline` y ausencia de autoplay.
- El gate Chromium confirmó cero solicitudes del stream MP4 antes de interacción.
- El cambio de posición del carrusel evita superponer controles Promo sobre la zona de controles nativos del video.
- No se alteraron contratos MEDIA, descriptores content-addressed, lazy/eager, compresión, cache o presupuestos.

## 3. Archivos modificados

### Componentes y estilos

- `frontend-powerzona/src/components/promo-public/PromoHero.astro`
- `frontend-powerzona/src/components/promo-public/PromoReviews.astro`
- `frontend-powerzona/src/styles/promo-black-gold.css`
- `frontend-powerzona/src/styles/promo-contact.css`
- `frontend-powerzona/src/styles/promo-hero.css`
- `frontend-powerzona/src/styles/promo-landing-qr.css`
- `frontend-powerzona/src/styles/promo-sections.css`

### Pruebas y documentación

- `frontend-powerzona/tests/promoAccessibility.test.mjs`: seis pruebas focales de contrato y contraste.
- `frontend-powerzona/scripts/verify-promo-accessibility.mjs`: gate SSR + Chromium reproducible, sin red ni datos externos.
- `docs/tusenda84/reportes/TS84-PROMO-A11Y-0001-implementacion.md`: este cierre.

## 4. Matriz de criterios y evidencia

| Criterio WCAG 2.2 | Superficie/evidencia local | Resultado |
|---|---|---|
| 1.1.1 Contenido no textual | `alt` obligatorio, ornamentación `aria-hidden`, video con nombre y poster | Cubierto estructuralmente; calidad editorial del texto alternativo requiere revisión humana |
| 1.3.1 Información y relaciones | landmarks, nav con nombre, secciones etiquetadas, listas, reseñas y estados semánticos | Pasa tests y Chromium |
| 1.3.2 Secuencia significativa | orden DOM SSR y secuencia real de tabulación | Pasa Chromium |
| 1.3.4 Orientación | 390×844 y 844×390 sin restricción ni overflow global | Pasa Chromium |
| 1.4.3 Contraste mínimo | combinaciones de texto Theme calculadas ≥ 4,5:1 | Pasa test focal |
| 1.4.4 Cambio de tamaño del texto | viewport escalado/reflow y preservación de zoom en meta viewport | Pasa tests locales; zoom de navegador real queda en checklist manual |
| 1.4.10 Reflow | 320 px sin scroll horizontal de documento | Pasa Chromium |
| 1.4.11 Contraste no textual | foco ≥ 3:1, estados y bordes; soporte forced-colors/high-contrast | Pasa tests y Chromium focal |
| 1.4.12 Espaciado del texto | line-height 1,5, letter-spacing 0,12em y word-spacing 0,16em sin overflow global | Pasa Chromium focal |
| 2.1.1 Teclado / 2.1.2 Sin trampas | enlaces, selector de locale, CTA, Hero, reseñas, QR, footer y video en secuencia operable | Pasa Chromium |
| 2.2.2 Pausar/detener/ocultar | no autoplay; controles de video; animación y scroll reducidos | Pasa tests y Chromium |
| 2.3.1 Tres destellos | no se introducen flashes ni animaciones de destello | Pasa auditoría de código |
| 2.4.1 Evitar bloques | skip link visible y activación que enfoca `main` | Pasa Chromium |
| 2.4.3 Orden del foco | DOM lógico, sin `tabindex` positivo, `autofocus` o `accesskey` | Pasa tests y Chromium |
| 2.4.4 Propósito del enlace / 2.4.6 Encabezados y etiquetas | nombres de navegación/locale/CTA/QR/social/carrusel y encabezados localizados | Pasa tests y Chromium |
| 2.4.7 Foco visible | anillos de 3 px, foco de video bicolor y forced-colors | Pasa tests y Chromium |
| 2.4.11 Foco no oculto (mínimo) | controles Hero fuera de la zona inferior del video; skip link por encima del shell | Pasa geometría Chromium focal |
| 2.5.7 Movimientos de arrastre | carruseles desplazables sin drag obligatorio, con teclado y enlaces de posición | Pasa Chromium |
| 2.5.8 Tamaño del objetivo | contrato de 44×44 px y CTA de 54 px, superior al mínimo WCAG | Pasa tests y Chromium focal |
| 3.1.1 Idioma de la página | `html lang` efectivo | Pasa tests y Chromium |
| 3.1.2 Idioma de las partes | opciones del selector conservan `lang`/`hreflang` | Pasa test focal |
| 3.2.3 Navegación consistente / 3.2.4 Identificación consistente | orden publicado, nombres localizados y acción principal única | Pasa regresiones SHELL/RESP/I18N |
| 4.1.2 Nombre, función, valor | ARIA válida en controles, rating, video, estados y locale activo | Pasa tests y Chromium focal |
| 4.1.3 Mensajes de estado | contacto y estados de reseñas usan `role="status"` | Pasa test focal |

### Contenido audiovisual dependiente de publicación

Los criterios 1.2.x no se declaran conformes de manera global. El contrato actual garantiza poster, nombre, controles, cero autoplay y cero carga de stream antes de interacción, pero no contiene campos compartidos para pista de subtítulos, transcripción o audiodescripción. Si un video publicado contiene habla o información visual esencial, el contenido debe aportar el equivalente temporal correspondiente y validarse manualmente. Añadir ese contrato editorial/compartido excedería este prompt y requiere autorización separada.

## 5. Pruebas ejecutadas

| Gate | Resultado |
|---|---|
| Focal A11Y + RESP + SHELL | 25/25 pasan |
| Frontend integrado A11Y + Analytics + MEDIA + PERF + SEO + SHELL + RESP + SEC | 50/50 pasan |
| Frontend completo `node --test` | 754/754 pasan |
| Backend Promo amplio: Theme/I18N/Media/Shell/Contact/Footer/Reviews/QR/SEO/Analytics/PERF/SEC/DOM/PUBCFG/PUBLISH | 100/100 pasan, incluida matriz runtime |
| `npm run build` | pasa; permanecen tres warnings preexistentes de `getStaticPaths()` en rutas Commerce dinámicas |
| `verify-promo-accessibility.mjs` | pasa en dos ejecuciones consecutivas |
| `verify-promo-performance.mjs` | pasa todos los presupuestos ARC-ADR-010 |

Resultado PERF después de A11Y:

| Métrica | Resultado local |
|---|---:|
| HTML SSR Brotli | 8.269 B |
| CSS shell + Theme Brotli | 7.019 B |
| JavaScript inicial Brotli | 1.764 B |
| Transferencia inicial conservadora | 419.633 B |
| Requests antes de interacción | 8 |
| Imágenes eager | 1 |
| Stream de video antes de interacción | 0 B / 0 requests |

El gate Chromium renderiza el componente SSR compilado con Hero imagen/video, reseñas, contacto, footer, Landing QR, selector ES/EN y strings largos. Intercepta toda red, recorre el foco, activa el skip link, opera ambos carruseles con teclado, mide targets y geometría, prueba 320 px, móvil/landscape, RTL, espaciado de texto, `prefers-reduced-motion`, token Theme reducido y forced-colors.

## 6. Contratos preservados

- Caché generation-aware, ETag/compresión, fail-closed y presupuestos ARC-ADR-010 permanecen sin cambios y con gate PERF verde.
- Analytics sigue pasiva, respeta DNT/GPC y conserva `page_view`, `section_view`, `contact_activate` y `landing_qr_open`.
- No se modificaron aislamiento tenant, CSP, `security.checkOrigin`, Host/Origin/proxy, publicación, rollback, locales, custom domains, aliases/canonical ni rutas de plataforma.
- Commerce, tiendas sin Promo, Landing QR Commerce y superficies privadas permanecen fuera del cambio.
- No hubo migraciones, dependencias nuevas, cambios de contratos compartidos, conexión externa, deploy, release, push, merge o commit.

## 7. Límites de validación y checklist manual

Validado automáticamente/localmente:

- estructura SSR, semántica y nombres accesibles focales;
- contraste de la paleta efectiva auditada;
- teclado y foco en Chromium headless;
- reflow, orientación, strings largos, RTL y espaciado de texto;
- movimiento reducido, forced-colors focal y tamaños de objetivo;
- contrato y carga inicial de video;
- build, regresiones frontend/backend y presupuestos PERF.

No validado en esta ejecución:

- NVDA, JAWS, VoiceOver o TalkBack y sus combinaciones navegador/versión;
- lectura y anuncios reales de landmarks, estados, rating, selector y controles nativos de video;
- zoom 200 %/400 % en navegadores reales y configuración de texto del sistema operativo;
- dispositivos físicos, touch, orientación y safe areas reales;
- contraste sobre posters/fotogramas reales distintos del foco bicolor protegido;
- pertinencia editorial de cada `alt`, traducción, subtítulo, transcripción o audiodescripción;
- páginas servidas por dominios/DNS/TLS reales, RUM/CrUX, staging o producción.

Checklist manual recomendado antes de afirmar conformidad de una publicación concreta:

1. recorrer ES y EN con NVDA + Firefox/Chrome y VoiceOver + Safari;
2. verificar orden, nombre y anuncio de skip link, landmarks, locale, CTA, QR, reseñas y video;
3. probar zoom 200 % y 400 %, contraste alto, texto grande y orientación en dispositivos reales;
4. revisar cada `alt` y marcar como decorativo solo lo que realmente lo sea;
5. reproducir cada video y confirmar subtítulos/transcripción/audiodescripción según su contenido;
6. comprobar foco y controles nativos del video en los navegadores/dispositivos soportados.

No se usó un motor externo tipo axe porque no está instalado y el prompt prohíbe instalar dependencias. La habilidad de navegador interactivo requería una consola `js_repl` no disponible en esta sesión; se usó el Playwright ya incluido en el proyecto y el Chromium local ya existente, sin descargas ni cambios de configuración.

## 8. Cierre y siguiente Prompt ID

`TS84-PROMO-A11Y-0001` queda implementado, auditado localmente, documentado y sin commit. No se inició ningún prompt posterior.

Siguiente Prompt ID del mapa, únicamente habilitado y no iniciado: `TS84-PROMO-QA-AUTO-0001`.
