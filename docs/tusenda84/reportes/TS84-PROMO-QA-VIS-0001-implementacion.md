# TS84-PROMO-QA-VIS-0001 — QA visual desktop/móvil

Fecha: 2026-08-25
Estado: **COMPLETADO TÉCNICAMENTE / PENDIENTE DE APROBACIÓN VISUAL DE KRAKEN**
Rama verificada: `dev`
HEAD de partida y cierre: `5f4362a`
Worktree de partida: limpio
Commit: no creado; los cambios quedan locales y sin commit

## 1. Precondiciones y contratos

Antes de modificar se verificó:

| Control | Resultado |
|---|---|
| Rama | `dev` |
| HEAD | `5f4362a` |
| Worktree | limpio |
| Asunto de HEAD | `test(promo): cierra QA automatizado integral` |

Se leyeron y respetaron como contratos:

- `docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md`;
- `docs/tusenda84/reportes/TS84-PROMO-QA-AUTO-0001-implementacion.md`;
- `TS84-PROMO-ARC-0001-arquitectura-adrs.md`, incluido `ARC-ADR-010`;
- los cierres `SEC-0001`, `PERF-0001` y `A11Y-0001` indicados por QA-AUTO;
- `TS84-PROMO-MOB-VIS-0001-propuesta.md`, con `G-MOB-VIS` aprobado;
- `TS84-PROMO-RESP-0001-implementacion.md` y `TS84-PROMO-ALADDIN-0001-implementacion.md` para composición y responsive.

El archivo `TS84-PROMO-VIS-0001-direccion-visual.md` mencionado históricamente por ALADDIN no existe en este checkout. Conforme al contrato MOB-VIS, la fuente visual canónica usada fue la decisión registrada en el mapa maestro: negro/dorado, composición premium, conversión por contacto, sin bloque QR redundante y Landing QR independiente.

## 2. Entorno y método

| Superficie | Entorno |
|---|---|
| Sistema | Windows, worktree local sin red externa |
| Node.js | `v24.16.0` |
| npm | `11.13.0` |
| Astro | `7.2.4`, SSR Node |
| Playwright | `1.62.1` con Chromium local ya instalado |
| Navegador interactivo | Codex In-app Browser, viewport explícito `390×844` durante la inspección y restaurado al terminar |
| Datos | proyección Promo sintética, determinista y allowlisted; cero datos desplegados o persistentes |
| Medios de evidencia | WebP locales generados en memoria por el verificador; no son uploads ni datos del producto |

Se añadió `frontend-powerzona/scripts/verify-promo-visual.mjs`. El verificador:

- renderiza el componente SSR compilado y el CSS exacto del build;
- ejecuta el runtime JavaScript first-party compilado;
- sirve únicamente loopback `127.0.0.1` y se detiene al finalizar;
- captura PNG en viewports contractuales;
- valida geometría, contenido, locales, navegación, teclado/foco, movimiento reducido, carga y error de media;
- usa el HTML real de errores `404`, `421` y `503` extraído del código productivo;
- no consulta PocketBase desplegado, Cloudflare, Coolify, DNS, staging o producción.

## 3. Matriz visual ejecutada

### 3.1 Viewports

| Viewport | Estado principal | Resultado |
|---|---|---|
| `1440×900` | contenido completo ES, desktop | PASS |
| `1280×800` | contenido completo ES, laptop | PASS |
| `768×1024` | contenido completo ES, tablet | PASS |
| `390×844` | contenido completo ES y estados de error | PASS |
| `412×915` | contenido completo EN | PASS |
| `320×700` | contenido esparso/estrecho | PASS |

Todos conservaron `documentElement.scrollWidth <= innerWidth + 1`, un único `h1` visible, shell negro/dorado, navegación confinada y ausencia de infraestructura Commerce en el DOM.

### 3.2 Contenido, temas y publicación

| Estado | Resultado verificable |
|---|---|
| Completo | Hero imagen+video, servicios, destacado, seis galerías, propietario, reseñas, contacto, QR y footer pasan |
| Sin logo | El contrato público actual no porta logo tenant; marca textual y ornamento first-party permanecen legibles |
| Sin video | Cero `<video>`; Hero imagen mantiene única prioridad eager/high |
| Sin media | Ornamentos/placeholders conservan geometría, copy, navegación y CTA |
| Pocas/muchas imágenes | Una y seis imágenes de galería conservan lazy loading y reflow |
| Reseñas vacías | Estado localizado con `role=status`; sin scroller vacío |
| Adaptador de reseñas no disponible | Estado localizado seguro; sin datos crudos |
| Contacto no disponible | Hero y Contacto muestran estado inerte; cero `href` vacío o fallback QR |
| Landing QR deshabilitada | Utilidad ausente por gate; CTA no cambia de destino ni semántica |
| Publicado | Renderer exacto `promo.black-gold@1.0.0` y contenido localized |
| No publicado | `404`, genérico, noindex y no-store |
| Tema retirado/no empaquetado | `503`, sin fallback visual silencioso |
| Dominio pendiente/suspendido | `421`, genérico, noindex y no-store |
| Rechazo SEC | `421`, genérico, saneado y visualmente responsive |

Solo existe un tema aprobado/empaquetado. “Todos los temas” equivale por contrato a Aladdin negro/dorado positivo y tema desconocido/retirado negativo fail-closed; no se inventó un segundo preset.

### 3.3 Locales, navegación y acciones

- ES usa `lang=es`, copy ES exacto y locale Español activo.
- EN usa `lang=en`, copy EN exacto, locale English activo y cero mezcla de las cadenas ES auditadas.
- El enlace real de locale navegó de `/state/full-es` a `/state/full-en` sin JavaScript de negocio.
- La navegación de Servicios actualizó el fragmento exacto y dejó visible la sección destino.
- Hero y Contacto comparten exactamente `tel:+13055550184` en la fixture; el verificador exige un solo destino para ambos CTA.
- Landing QR usa un enlace separado y nunca se convierte en fallback de contacto.
- El DOM Promo no contiene selectores de carrito, checkout o precio; no se activaron scripts Commerce.

### 3.4 Accesibilidad, foco y movimiento

- Secuencia de foco, skip link, landmarks, headings, nombres y targets ≥ `44×44` permanecen verdes en el gate A11Y.
- Evidencia desktop captura el skip link visible con foco.
- El navegador interactivo confirmó fallback de media con tres nombres accesibles y cero imágenes rotas visibles en el primer viewport.
- `prefers-reduced-motion=reduce` y token `motion=reduced` producen scroll `auto` y transiciones no esenciales ≤ `0.001 s`.
- Video conserva controles, poster, `preload=none`, `playsinline`, sin autoplay y cero requests MP4 antes de interacción.

### 3.5 Carga y error de medios

- Carga lenta de `1.200 ms`: HTML, navegación, `h1` y CTA aparecen por SSR antes de completar imágenes; cero overflow.
- Error HTTP de todas las imágenes: la geometría permanece estable y el runtime aplica un marco negro/dorado first-party.
- La imagen rota se oculta visualmente, conserva el alt en un reemplazo `role=img`/`aria-label` y no intenta URL alternativa.
- Medios fuera del Hero siguen lazy; solo una imagen Hero es eager/high; video no transfiere stream.

## 4. Defectos demostrados y corregidos

### `QA-VIS-DV-01` — artefacto nativo de imagen rota

- Severidad: media.
- Reproducción: `/state/media-error`, Chromium, `390×844`.
- Antes: el marco conservaba tamaño, pero Chromium mostraba icono/alt roto en la esquina superior izquierda.
- Corrección: el runtime first-party marca únicamente imágenes Promo fallidas, retira `src/srcset`, oculta el elemento roto, aplica fallback visual al frame y materializa un reemplazo accesible con el alt original.
- Seguridad: no añade URL, request, dependencia, HTML tenant-controlled ni fallback remoto.
- Evidencia corregida: `07-mobile-error-media-390x844.png`.

### `QA-VIS-DV-02` — error SEC `421` visualmente inconsistente

- Severidad: media.
- Reproducción: HTML de `promoSecurityUnavailable`, Chromium, `390×844`.
- Antes: solo mostraba un `h1` con estilos de navegador, sin `meta viewport` ni copy genérico equivalente.
- Corrección: se igualó a la composición genérica ya usada por `promoPublicUnavailable`.
- Seguridad preservada: mismo status saneado, `noindex,nofollow,noarchive`, `private, no-store`, headers SEC y cero reflexión de Host, Origin, tenant o payload.
- Evidencia corregida: `09-mobile-error-seguridad-421-390x844.png`.

Resultado: **cero defectos visuales críticos abiertos y cero defectos demostrados abiertos dentro de la matriz local ejecutable**.

## 5. Evidencia

Directorio: `docs/tusenda84/reportes/evidencias/TS84-PROMO-QA-VIS-0001/`

| Archivo | Evidencia |
|---|---|
| `01-desktop-completo-es-1440x900.png` | recorrido completo desktop ES |
| `02-desktop-foco-skip-1440x900.png` | pliegue desktop y skip link enfocado |
| `03-tablet-completo-es-768x1024.png` | recorrido completo tablet |
| `04-mobile-completo-es-390x844.png` | recorrido completo móvil ES |
| `05-mobile-completo-en-412x915.png` | recorrido completo móvil EN |
| `06-estrecho-vacio-sin-media-320x700.png` | sin media/QR/contacto y reseñas vacías |
| `07-mobile-error-media-390x844.png` | fallback corregido de media rota |
| `08-mobile-no-publicado-suspendido-390x844.png` | dominio suspendido/no publicado |
| `09-mobile-error-seguridad-421-390x844.png` | rechazo SEC `421` corregido |

## 6. Comandos y resultados exactos

### Precondiciones

```powershell
git branch --show-current
git rev-parse --short=7 HEAD
git status --short
git show -s --format=%s HEAD
```

Resultado: `dev`, `5f4362a`, status vacío, `test(promo): cierra QA automatizado integral`.

### Build y QA focal

```powershell
npm.cmd run build
node --test tests\promoAccessibility.test.mjs tests\promoSecurity.test.mjs tests\promoResponsive.test.mjs
node --check scripts\verify-promo-visual.mjs
```

Resultados: build PASS; `16/16` focales PASS; sintaxis PASS. Permanecen los tres warnings preexistentes de `getStaticPaths()` ignorado en rutas Commerce dinámicas de categoría, subcategoría y producto.

### QA visual reproducible

```powershell
node scripts\verify-promo-visual.mjs
```

Resultado: PASS; seis viewports, once perfiles/estados renderizados, cinco estados fail-closed y nueve PNG. Matrices `viewports`, `content`, `media`, `states`, `interaction` e `isolation` aprobadas.

### Regresión frontend, A11Y y PERF

```powershell
node --test
node scripts\verify-promo-accessibility.mjs
node scripts\verify-promo-performance.mjs
```

Resultados:

- frontend completo `755/755`, cero fallos, cero omitidas;
- A11Y dinámico PASS: landmarks, headings, nombres, teclado, skip link, foco, targets, video, reflow 320, orientación, strings largos, RTL, espaciado, movimiento reducido y forced colors;
- PERF PASS tras las correcciones:

| Métrica | Resultado |
|---|---:|
| HTML SSR Brotli / gzip | `8.400 B / 8.823 B` |
| CSS shell+Theme raw / Brotli | `38.662 B / 7.155 B` |
| JavaScript inicial raw / Brotli | `4.779 B / 1.973 B`, 2 assets |
| Fuentes iniciales | `0 B` |
| Hero/LCP contractual | `≤ 102.400 B` |
| Hasta tres posters | `≤ 307.200 B` |
| Transferencia inicial conservadora | `≤ 419.973 B` |
| Requests antes de interacción | `≤ 8` |
| Imágenes eager | `1` |
| Stream de video | `0 B` |

Todos permanecen dentro de `ARC-ADR-010`. Frente a QA-AUTO, el fallback añadió `645 B` raw / `209 B` Brotli de JS y `530 B` raw / `136 B` Brotli de CSS, sin request nuevo.

### Regresiones visuales legacy Commerce

```powershell
$visualTests = Get-ChildItem tests -Filter '*.visual.mjs' | Sort-Object Name | Select-Object -ExpandProperty FullName
node --test $visualTests
```

Resultado: el comando agregado no alcanzó aserciones visuales. Tres runners M7U2 recibieron `EPERM` al crear runtimes bajo `backend-powerzona/.tmp`; los dos runners Order Pricing se detuvieron por ausencia deliberada de variables `PZ_C1_VISUAL_*` / `PZ_C2_VISUAL_*` y credenciales, que no se solicitaron.

La repetición local autorizada fuera del sandbox de M7U2 tampoco alcanzó render: C2/C2F1 chocaron inicialmente con un servidor Astro local ya abierto y C3 rechazó su fixture legacy con `invalid_permissions`. Tras detener el servidor y repetir C2 secuencialmente, Astro `7.2.4` inició su supervisor hijo y terminó el proceso padre con exit `0`; el runner legacy interpreta esa salida como “terminó antes de iniciar”. No falló ninguna aserción visual de producto.

El runner abortado eliminó temporalmente 38 PNG históricos de evidencia M7U2; se restauraron exactamente desde `HEAD` y el status final no contiene esas eliminaciones. Todos los runtimes locales se detuvieron.

La cobertura Commerce ejecutable queda respaldada por `755/755` frontend, incluida navegación, home/catálogo/producto/carrito/checkout, Landing QR, precios, pedidos, seguridad y aislamiento Promo. La captura visual Commerce con datos sembrados permanece limitada por los runners legacy anteriores y por las credenciales opt-in deliberadamente ausentes.

## 7. Archivos modificados

- `frontend-powerzona/src/layouts/PromoPublicLayout.astro`;
- `frontend-powerzona/src/styles/promo-black-gold.css`;
- `frontend-powerzona/src/lib/promoSecurity.ts`;
- `frontend-powerzona/tests/promoAccessibility.test.mjs`;
- `frontend-powerzona/tests/promoSecurity.test.mjs`;
- `frontend-powerzona/scripts/verify-promo-visual.mjs`;
- `docs/tusenda84/reportes/TS84-PROMO-QA-VIS-0001-implementacion.md`;
- nueve PNG bajo `docs/tusenda84/reportes/evidencias/TS84-PROMO-QA-VIS-0001/`.

Dependencias, plugins y paquetes añadidos: **ninguno**.
Migraciones creadas o modificadas: **ninguna**.

## 8. Contratos preservados

- Fail-closed de Host/Origin/proxy, CSP, `security.checkOrigin`, status y errores saneados no cambió.
- El ajuste SEC no refleja Host, Origin, tenant, payload o motivo interno.
- Aislamiento tenant, publicación inmutable, preview/draft privado y tema exacto permanecen sin cambios.
- Locales, aliases/canonical, rutas plataforma/custom y SEO no se modificaron.
- Analytics conserva sus cuatro familias, DNT/GPC, payload allowlisted y cero PII; no se añadió evento.
- El fallback de media es first-party, no acepta URL tenant adicional y conserva alt.
- Landing QR permanece independiente; Landing QR Commerce no fue modificado.
- Promo continúa sin precios, productos, carrito, checkout, pedidos, stock, moneda o scripts Commerce.
- No se modificaron tiendas sin Promo, Admin, Master, backend, PocketBase, contratos compartidos ni datos persistentes.

## 9. Límites y validación manual pendiente

No se afirma validación de:

- dispositivos físicos, safe areas, touch real, NVDA/JAWS/VoiceOver/TalkBack;
- zoom real de navegador a `200 %/400 %` fuera de los proxies locales ya cubiertos;
- subtítulos, transcripción o audiodescripción de un video editorial concreto;
- una tienda Commerce sembrada en navegador mediante los runners legacy bloqueados descritos;
- DNS/TLS/Cloudflare/Coolify, custom domain real, staging, producción, RUM/CrUX o métricas de campo.

El gate del mapa exige **aprobación visual humana de Kraken**. Esta ejecución deja evidencia lista, pero no se auto-otorga esa aprobación.

## 10. Confirmaciones de alcance

- No se conectaron Cloudflare, Coolify, cuentas o servicios externos.
- No se modificaron DNS, dominios, zonas, certificados o infraestructura.
- No se solicitaron, leyeron ni escribieron secretos.
- No se instaló plugin o dependencia.
- No hubo migración, push, merge, deploy, release ni commit.
- No se inició `TS84-PROMO-STG-DOM-0001`, `TS84-PROMO-STG-0001` ni ningún prompt posterior.

`TS84-PROMO-QA-VIS-0001` queda técnicamente ejecutado con cero defectos visuales críticos abiertos. `TS84-PROMO-STG-DOM-0001` continúa sin autorización externa y no fue iniciado; `TS84-PROMO-STG-0001` continúa pendiente del gate humano de QA-VIS y de sus dependencias previas.
