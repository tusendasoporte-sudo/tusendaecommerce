# TS84-PROMO-PERF-0001 — Implementación de performance, compresión y caché pública segura

Fecha: 2026-08-25
Estado: COMPLETADO
Rama de trabajo: `dev`
HEAD de partida verificado: `1b01c5b`
Worktree de partida: limpio
Commit: no creado; los cambios quedan locales y sin commit

## 1. Alcance ejecutado

Se implementó exclusivamente `TS84-PROMO-PERF-0001` sobre el shell público Promo ya aprobado. El cambio optimiza SSR, CSS, JavaScript y transferencia inicial; añade compresión HTTP y una caché privada de origen generation-aware; conserva la estrategia MEDIA responsive/lazy y vuelve pasiva la analítica no causada por interacción.

No se conectaron Cloudflare, DNS, zonas, certificados, staging, producción, cuentas, plugins ni secretos. No se modificaron Commerce, tiendas sin Promo, Landing QR Commerce, Admin, Master, preview/draft ni superficies externas al shell Promo.

Contratos leídos y respetados:

- `TS84_PROMO_MAPA_MAESTRO_PROMPTS.md`;
- `TS84-PROMO-ARC-0001-arquitectura-adrs.md`, en particular ARC-ADR-010;
- `TS84-PROMO-PUBLISH-0001`, `DOM-CORE-0001`, `DOM-CF-0001`, `MEDIA-0001`, `SHELL-0001`, `HERO-0001`, `SECTIONS-0001`, `GALLERY-0001`, `SEO-0001`, `ANALYTICS-0001` y `SEC-0001`.

## 2. Diseño implementado

### 2.1 Identidad generation-aware

El backend construye una identidad opaca SHA-256 solo después de resolver y revalidar una proyección publicada exacta. El material de la identidad incluye, con serialización determinista:

1. versión del contrato `promo.public.cache.v1`;
2. Host canónico;
3. tenant/site interno;
4. revisión publicada exacta;
5. generation actual del slot;
6. locale efectivo;
7. Theme ID;
8. versión de Theme;
9. ruta pública canonical;
10. representación HTML exacta.

El encoding real (`br`, `gzip` o `identity`) se agrega a la clave de variante en el origen. Cambiar cualquiera de estas dimensiones produce una variante distinta. La clave nunca forma parte del JSON público ni de la respuesta al navegador: viaja únicamente en headers internos SHELL backend→frontend y el cliente solo acepta el contrato exacto más 64 caracteres hexadecimales.

Redirects de locale/canonical/alias, errores de Host, sitios pausados o despublicados y cualquier resultado no `serve` no reciben identidad. Si hashing, validación de una dimensión o lectura del contrato falla, el sistema conserva la respuesta pero la excluye de caché.

### 2.2 Caché privada de origen e invalidación

La caché añadida vive exclusivamente en memoria del proceso Astro; no es una caché compartida ni una integración CDN:

- backend/PocketBase se consulta en cada request para volver a validar Host, binding, tenant, estado, generation y revisión;
- una publicación, rollback o cambio canonical incrementa generation y vuelve inalcanzables los bytes anteriores;
- pause, unpublish, suspensión, binding inválido o error fallan antes de consultar la caché de representación;
- TTL máximo: 5 minutos;
- máximo: 128 entradas y 8 MiB;
- fuente HTML máxima procesable: 512 KiB;
- single-flight por variante para evitar renders concurrentes duplicados;
- solo `GET 200 text/html` entra en caché;
- una representación HTML comprimida que exceda 80 KiB se sirve `no-cache` pero no se almacena;
- `Set-Cookie` nunca se almacena y se aplica desde la resolución backend actual;
- ETag fuerte deriva de clave de variante y bytes codificados;
- `If-None-Match` produce `304` solo dentro de la variante completa.

No existe purga externa: la invalidación demostrable se basa en revalidación backend por request, generation/revision en clave, proceso local acotado y TTL. No se introdujo dependencia por request de Cloudflare.

### 2.3 Headers y compresión

| Superficie/estado | Política efectiva |
|---|---|
| HTML publicado `serve`, clave completa y status 200 | `private, no-cache, max-age=0, must-revalidate`, ETag, `Vary` preservado + `Accept-Encoding`, Brotli q=5 / gzip nivel 6 |
| Clave ausente o inválida | `private, no-store, max-age=0`; compresión permitida, almacenamiento prohibido |
| Redirect canonical, locale o alias | `private, no-store, max-age=0` |
| Host/Origin inválido, 404/421/5xx, pausa, unpublish o suspensión | `private, no-store, max-age=0`, noindex |
| Draft, preview, Admin, Master y APIs privadas | política existente `private/no-store`, sin cambio |
| Media pública content-addressed | política immutable existente de MEDIA, sin cambio |

`Vary` se fusiona de forma case-insensitive para no perder `Host`, locale/cookie contractual ni `Accept-Encoding`. No se comprime una respuesta ya codificada y no se procesan representaciones que no sean HTML 200.

### 2.4 CSS, JavaScript, Analytics y media

- El CSS combinado del shell/Theme se incrusta únicamente en las rutas Promo. Se elimina un request bloqueante sin alterar assets de Commerce/Admin.
- El único runtime Promo queda como asset first-party hasheado externo; esto preserva CSP `script-src 'self'` y evita depender de inline script.
- `page_view` y la instalación del observador `section_view` se difieren mediante `requestIdleCallback` con timeout de 1.500 ms y fallback no bloqueante.
- `contact_activate` y `landing_qr_open` se conservan inmediatos al click, con `keepalive`, DNT/GPC, sin cookies/credenciales ni PII.
- Hero conserva una sola imagen `eager`, `fetchpriority=high`, dimensiones y `srcset/sizes` MEDIA.
- Galería/secciones conservan `loading=lazy`, `decoding=async` y render SSR sin hidratación.
- Video conserva `preload=none`, controles, `playsinline`, ausencia de autoplay y posters content-addressed. No se transfieren bytes del stream antes de interacción; el poster permitido permanece como fallback visual.
- Se conservan `security.checkOrigin: true`, CSP, resolución exacta de Host/Origin/proxy y la barrera Promo fail-closed.

## 3. Archivos

### Backend

- `backend-powerzona/pb_hooks/pz_promo_performance_lib.js`: contrato e identidad generation-aware fail-closed.
- `backend-powerzona/pb_hooks/pz_promo_shell_api_lib.js`: adjunta la identidad no enumerable a `serve` y la transporta por headers internos; SHELL continúa `no-store`.
- `backend-powerzona/tests/pz_promo_performance.test.cjs`: separación de dimensiones y entradas inválidas.
- `backend-powerzona/tests/pz_promo_pubcfg_http_runtime.test.cjs`: claves reales por tenant/locale/generation/revisión/Host, publish, rollback, canonical, pausa y redirects.

### Frontend

- `frontend-powerzona/src/lib/promoPerformance.ts`: negociación de encoding, Brotli/gzip, caché acotada, single-flight, ETag y fail-closed.
- `frontend-powerzona/src/lib/promoPublicShell.ts`: consume el contrato interno, reconoce rutas plataforma exactas y aplica matriz de headers segura.
- `frontend-powerzona/src/middleware.ts`: unifica plataforma/custom bajo resolución backend previa y caché de origen; mantiene aliases y errores fuera de caché.
- `frontend-powerzona/astro.config.mjs`: CSS Promo inline focal y runtime Analytics externo first-party.
- `frontend-powerzona/src/layouts/PromoPublicLayout.astro`: Analytics pasiva no bloqueante sin perder eventos de interacción.
- `frontend-powerzona/tests/promoPerformance.test.mjs`: compresión, variantes, hits, ETag/304, fail-closed, headers, rutas y regresiones SEC/MEDIA/Analytics.
- `frontend-powerzona/tests/promoPublicShell.test.mjs`: transporte interno de la identidad opaca.
- `frontend-powerzona/scripts/verify-promo-performance.mjs`: gate reproducible sobre el build SSR y ARC-ADR-010.

## 4. Presupuestos ARC-ADR-010

Comando de medición: `node frontend-powerzona/scripts/verify-promo-performance.mjs`, después de `npm run build`.

La medición renderiza localmente el componente SSR compilado con una representación pública focal y Hero responsive, inserta el CSS exacto generado por el build y comprime con la misma calidad Brotli del servidor. CSS y JS son medidas exactas del build. El límite de Hero usa el máximo verificable de MEDIA (100 KiB por variante). Para transferencia inicial se usa además el caso conservador de hasta tres posters de video permitidos por DATA/MEDIA, aun cuando no sean streams de video.

| Presupuesto | Límite | Resultado local verificable | Estado |
|---|---:|---:|---|
| HTML SSR comprimido | 80 KiB | 8.136 B Brotli / 8.566 B gzip | Cumple |
| CSS shell + Theme comprimido | 50 KiB | 6.890 B Brotli; 37.345 B raw | Cumple |
| JavaScript inicial comprimido | 75 KiB | 1.764 B Brotli; 4.134 B raw, 2 assets | Cumple |
| Fuentes first-party iniciales | 160 KiB | 0 B; no `@font-face` ni fuente externa | Cumple |
| Hero/LCP móvil | 300 KiB | ≤ 102.400 B por contrato MEDIA | Cumple |
| Hero/LCP desktop | 450 KiB | ≤ 102.400 B por contrato MEDIA | Cumple |
| Transferencia inicial móvil sin stream de video | 650 KiB | ≤ 419.500 B conservadores, incluyendo Hero + 3 posters | Cumple |
| Transferencia inicial desktop sin stream de video | 900 KiB | ≤ 419.500 B conservadores, incluyendo Hero + 3 posters | Cumple |
| Requests antes de interacción | < 20 | ≤ 8: HTML + 2 JS + Hero + 3 posters + Analytics | Cumple |
| Imágenes eager | 1 | 1, Hero/LCP | Cumple |
| Video antes de interacción/near viewport | 0 B salvo poster | 0 B de stream; `preload=none`, sin autoplay | Cumple por contrato y regresión estructural |

El valor de transferencia es deliberadamente conservador: suma 8.136 B HTML Brotli + 1.764 B JS Brotli + 102.400 B Hero + 307.200 B de hasta tres posters. CSS ya está dentro del HTML. El request de Analytics se cuenta aunque se difiere hasta idle.

## 5. Pruebas ejecutadas

| Gate | Resultado |
|---|---|
| Backend PERF + Analytics + DOM + MEDIA + PUBCFG + PUBLISH + SEC + SHELL | 59/59 pasan |
| Frontend Analytics + MEDIA + PERF + SEO + SHELL + RESP + SEC | 44/44 pasan |
| Regresión HTTP PocketBase real PUBCFG/PUBLISH/DOM/MEDIA/Analytics/tenant/Commerce | 1/1 pasa, ~28,8 s |
| Focal frontend final PERF + SHELL | 19/19 pasan |
| `node --check` de módulos backend modificados | pasa |
| `npm run build` | pasa; permanecen 3 warnings preexistentes de `getStaticPaths()` en rutas Commerce dinámicas |
| `verify-promo-performance.mjs` | pasa todos los presupuestos locales |
| `git diff --check` | pasa |

La matriz runtime verifica adicionalmente:

- plataforma, custom primary y redirects de alias/canonical;
- locales ES/EN y separación tenant A/B;
- publicación sucesiva, nueva revisión, rollback a revisión histórica y nueva generation;
- pausa, resume y unpublish fail-closed;
- claves distintas por Host, tenant, locale, revisión y generation;
- Analytics de las cuatro familias, incluida `landing_qr_open`, privacidad e idempotencia;
- MEDIA responsive/content-addressed, video/poster y retiro;
- Host desconocido, Origin/proxy, CSP/checkOrigin y REST privado;
- guard Commerce y tienda no Promo sin fallback ni modificación.

## 6. Límites y métricas de campo

Esta ejecución valida estructura, bytes del build, compresión real local, límites MEDIA y regresiones funcionales. No hubo tráfico real ni despliegue; por tanto no produce percentiles de usuarios reales.

Los objetivos de ARC-ADR-010 permanecen como objetivos de campo, no como resultados observados:

- LCP p75 ≤ 2,5 s;
- INP p75 ≤ 200 ms;
- CLS p75 ≤ 0,10.

Confirmarlos requiere RUM/CrUX o telemetría equivalente sobre una publicación autorizada y volumen suficiente. No se simuló ni afirmó ese dato. Un laboratorio con Lighthouse/Playwright podrá complementar el gate sintético en un entorno posterior autorizado, pero tampoco reemplazará p75 de campo.

## 7. Cierre y siguiente Prompt ID

`TS84-PROMO-PERF-0001` queda implementado, validado localmente y sin commit. No se inició trabajo posterior.

Siguiente Prompt ID del mapa: `TS84-PROMO-A11Y-0001`.
