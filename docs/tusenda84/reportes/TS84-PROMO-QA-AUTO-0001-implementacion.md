# TS84-PROMO-QA-AUTO-0001 — QA automatizado integral

Fecha: 2026-08-25
Estado: **COMPLETADO**
Rama verificada: `dev`
HEAD de partida y cierre: `c97380e`
Worktree de partida: limpio
Commit: no creado; los cambios quedan locales y sin commit

## 1. Alcance ejecutado

Se ejecutó exclusivamente `TS84-PROMO-QA-AUTO-0001`. Se completaron suites frontend/backend, runtimes PocketBase efímeros, migraciones y rollback, build SSR, gates de accesibilidad y performance, y regresiones completas de Commerce. Se corrigieron únicamente dos defectos demostrados en infraestructura de pruebas automatizadas y se aisló una tercera incidencia de contención; no se cambió código productivo, migraciones, contratos compartidos ni comportamiento funcional.

Contratos leídos y respetados antes de modificar:

- `docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md`;
- `docs/tusenda84/reportes/TS84-PROMO-SEC-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-PERF-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-A11Y-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-ARC-0001-arquitectura-adrs.md`, en particular `ARC-ADR-010`.

No se inició `TS84-PROMO-QA-VIS-0001`, staging ni ningún prompt posterior.

## 2. Defectos demostrados y correcciones

### 2.1 Rollback runtime DATA/PERM desactualizado

Reproducción inicial:

```powershell
node --test tests/pz_promo_data_http_runtime.test.cjs tests/pz_promo_permissions_http_runtime.test.cjs
```

Resultado inicial: `0/2`; ambas pruebas fallaron porque sus cantidades fijas de `migrate down` no contemplaban `1787520600_promo_analytics_landing_qr.js`. DATA revertía seis migraciones sin alcanzar foundation; PERM revertía dos migraciones sin alcanzar el campo de permisos.

Corrección:

- DATA enumera ahora las siete migraciones Promo en orden y falla si aparece una migración Promo no incorporada a la matriz;
- el rollback vacío DATA recorre las siete migraciones;
- el rollback DATA con registros revierte, una por una y en orden inverso, Analytics Landing QR, compatibilidad generation cero y PERM antes de comprobar el bloqueo `unsafe_rollback_promo_data`;
- PERM enumera explícitamente sus dos sucesoras, las revierte en orden y después comprueba tanto reversibilidad vacía como bloqueo `unsafe_rollback_promo_permissions` con grants.

Resultado corregido: `2/2`, PocketBase `0.39.8`, `209` migraciones aplicadas sin duplicados, `13` colecciones Promo y `42` índices; rollback vacío aprobado y rollback con datos bloqueado sin pérdida.

### 2.2 Runtime media Commerce acoplado a dos relojes de proceso

La suite completa con concurrencia acotada demostró una falla intermitente en `pz_storefront_media_runtime.test.cjs`: la retención se comparaba contra `Date.now()` del proceso Node mientras `delete_after` era generado por PocketBase. El mismo runtime aislado pasó, confirmando jitter entre procesos y no una regresión de media.

Corrección:

- la prueba valida la ventana de retención usando `created` y `delete_after` del mismo registro autoritativo;
- exige timestamps válidos, duración mayor de `23 h` y menor o igual a `24 h`;
- se preservan sin cambios upload, MIME WebP, SHA-256, tamaño, cache, reinicio, restauración y limpieza.

Resultado corregido aislado: `1/1`. El runtime también pasó dentro de la suite completa final.

### 2.3 Contención de arranque en regresión Rifas

Una pasada completa con concurrencia automática agotó la espera de arranque Astro de `pz_r7p2_http_runtime.test.cjs`. No falló ninguna aserción funcional. La reproducción aislada pasó `1/1` y la suite completa final con `--test-concurrency=4` volvió a pasar el runtime. No fue necesario modificar ese test.

## 3. Matriz contractual validada

| Superficie | Evidencia automatizada | Resultado |
|---|---|---|
| Migraciones existentes | `pz_promo_data_http_runtime`, `pz_promo_data_migrations`, `pz_promo_permissions_http_runtime`, suite completa | Siete migraciones Promo aplican; segundo `up` no duplica; rollback vacío revierte; datos/grants bloquean rollback fail-closed |
| Aislamiento tenant | DATA, PERM, PUBCFG runtime; DOM, PUBLISH, MEDIA, Analytics | Tiendas A/B aisladas; cross-store, relaciones, campos, filtros, expands y REST directo fallan cerrados |
| Host/Origin/proxy | SEC frontend/backend, DOM-CORE, PUBCFG runtime | Host exacto, aliases/primary, puertos, suffix/list spoofing, Origin JSON, XFH y peer proxy validados; `security.checkOrigin` preservado |
| Dominios y rutas | DOM-CORE, SHELL, SEO, SEC | Plataforma/custom separados; admin/API privadas no se sirven desde custom; aliases/canonical/locale coherentes; unknown Host falla cerrado |
| i18n/locales | I18N, LOCALES, SHELL, SEO, A11Y | ES/EN, locale explícito, default, selector, `lang`, RTL, strings largos, canonical y `hreflang` validados sin mezcla |
| Publicación/rollback | PUBLISH, PUBCFG runtime, PERF | Draft/candidata no se filtran; publish, nueva revisión, rollback histórico, pausa, resume y unpublish preservan generation |
| Caché generation-aware | PERF frontend/backend y runtime PUBCFG | Separación por Host, tenant, revisión, generation, locale, Theme, ruta, HTML y encoding; ETag/304; no-store/no-cache fail-closed |
| Analytics y privacidad | ANALYTICS frontend/backend, SEC, PERF | `page_view`, `section_view`, `contact_activate` y `landing_qr_open`; payload exacto, DNT/GPC, cero PII y tenant derivado server-side |
| Landing QR | Promo QR/Analytics más L7Q1 frontend/backend y suite completa | Puente Promo separado; Landing QR Commerce, capacidad, permisos, tracking y datos existentes preservados |
| Accesibilidad | tests focales + `verify-promo-accessibility.mjs` | Landmarks, headings, nombres, teclado, skip link, foco, targets 44 px, video, reflow 320, orientación, RTL y reduced motion aprobados |
| Performance | tests PERF + build + `verify-promo-performance.mjs` | Todos los presupuestos locales ARC-ADR-010 aprobados |
| Regresión e-commerce | frontend completo `754/754`; backend completo `903/903` ejecutadas | Home/catalog/product/cart/checkout, pedidos, precios, inventario, promociones, Rifas, seguridad, Landing QR, permisos, planes y apps sin regresión crítica |

## 4. Comandos y resultados exactos

### 4.1 Precondiciones

```powershell
git branch --show-current; git rev-parse --short HEAD; git status --short
```

Resultado: `dev`, `c97380e`, sin salida de status.

### 4.2 Focales corregidos

```powershell
node --check tests/pz_promo_data_http_runtime.test.cjs
node --check tests/pz_promo_permissions_http_runtime.test.cjs
node --check tests/pz_storefront_media_runtime.test.cjs
node --test tests/pz_promo_data_http_runtime.test.cjs tests/pz_promo_permissions_http_runtime.test.cjs
node --test tests/pz_storefront_media_runtime.test.cjs
node --test tests/pz_r7p2_http_runtime.test.cjs
```

Resultados: sintaxis aprobada; DATA/PERM `2/2`; media Commerce `1/1`; Rifas `1/1`.

### 4.3 Matrices focales Promo

```powershell
$promoTests = Get-ChildItem tests -Filter 'promo*.test.mjs' | Sort-Object Name | Select-Object -ExpandProperty FullName
node --test $promoTests
```

Frontend Promo: `108/108`, cero fallos y cero omitidas.

```powershell
$promoTests = Get-ChildItem tests -Filter 'pz_promo_*.test.cjs' | Sort-Object Name | Select-Object -ExpandProperty FullName
node --test --test-concurrency=4 $promoTests
```

Backend Promo: `156/156`, cero fallos y cero omitidas.

### 4.4 Suites completas

```powershell
node --test
```

Frontend: `754/754`, cero fallos y cero omitidas.

La primera pasada backend dentro del sandbox obtuvo `898` aprobadas, `5` fallidas por `EPERM` al crear temporales bajo `backend-powerzona/.tmp` y `7` omitidas. Se repitió fuera del sandbox como exigen esos runtimes locales. Una pasada con concurrencia automática obtuvo `902` aprobadas, `1` timeout de arranque Rifas y `7` omitidas. Rifas aislada pasó.

Gate backend final:

```powershell
node --test --test-concurrency=4
```

Resultado: `910` totales; `903` aprobadas, `0` fallidas, `7` omitidas.

Las siete omitidas requieren URLs y credenciales de runtimes locales preconfigurados, ausentes y deliberadamente no solicitados por este prompt:

- `pz_f7p8_product_image_limits_http_runtime.test.cjs`;
- `pz_m7u2_http_runtime.test.cjs`;
- `pz_order_pricing_http_runtime.test.cjs`;
- `pz_u7i7_http_runtime.test.cjs`;
- `pz_store_user_deletion_http_runtime.test.cjs`;
- `pz_store_user_devices_runtime.test.cjs`;
- `pzpw01_http_runtime.test.cjs`.

Sus contratos estáticos y los runtimes efímeros equivalentes incluidos en la suite permanecieron verdes. No se usaron cuentas, datos ni secretos externos para forzar su ejecución.

### 4.5 Build, performance y accesibilidad

```powershell
npm run build
node scripts/verify-promo-performance.mjs
node scripts/verify-promo-accessibility.mjs
```

`npm run build`: aprobado. Permanecen tres warnings preexistentes de `getStaticPaths()` ignorado en rutas Commerce dinámicas:

- `/src/pages/categoria/[slug].astro`;
- `/src/pages/producto/[slug].astro`;
- `/src/pages/subcategoria/[slug].astro`.

Presupuestos PERF medidos:

| Métrica | Resultado |
|---|---:|
| HTML SSR Brotli / gzip | 8.269 B / 8.692 B |
| CSS shell + Theme raw / Brotli | 38.132 B / 7.019 B |
| JavaScript inicial raw / Brotli | 4.134 B / 1.764 B, 2 assets |
| Fuentes iniciales | 0 B |
| Hero/LCP máximo contractual | 102.400 B |
| Hasta tres posters | 307.200 B |
| Transferencia inicial conservadora | 419.633 B |
| Requests antes de interacción | 8 |
| Imágenes eager | 1 |
| Video antes de interacción | 0 B |

El gate A11Y aprobó todos sus flags Chromium: landmarks, jerarquía, nombres, teclado, skip link, foco, targets, video sin autoplay/preload, cero requests de stream, reflow, orientación, strings largos, RTL, espaciado, movimiento reducido y forced colors.

### 4.6 Higiene del diff

```powershell
git diff --check
```

Resultado: aprobado; solo avisos informativos de conversión LF/CRLF de Git para los tres tests modificados.

## 5. Migraciones

No se creó ni modificó ninguna migración. Se validaron explícitamente, en orden:

1. `1787520000_promo_tenant_foundation.js`;
2. `1787520100_promo_authoring_media.js`;
3. `1787520200_promo_revision_publication.js`;
4. `1787520300_promo_audit_analytics.js`;
5. `1787520400_promo_permissions.js`;
6. `1787520500_promo_publication_zero_generation.js`;
7. `1787520600_promo_analytics_landing_qr.js`.

La prueba actualizada exige que la enumeración permanezca completa y ordenada.

## 6. Archivos modificados

- `backend-powerzona/tests/pz_promo_data_http_runtime.test.cjs`;
- `backend-powerzona/tests/pz_promo_permissions_http_runtime.test.cjs`;
- `backend-powerzona/tests/pz_storefront_media_runtime.test.cjs`;
- `docs/tusenda84/reportes/TS84-PROMO-QA-AUTO-0001-implementacion.md`.

Dependencias, plugins y paquetes añadidos: **ninguno**.

## 7. Contratos preservados

- Seguridad fail-closed, CSP, `security.checkOrigin`, Host/Origin/proxy y rate limits no fueron modificados y sus suites pasan.
- Aislamiento tenant, proyecciones públicas allowlisted, draft privado y errores saneados permanecen verdes.
- Publicación/rollback, aliases/canonical, locales y caché generation-aware mantienen sus contratos.
- Analytics conserva las cuatro familias, incluida `landing_qr_open`, sin PII ni identidad de visitante.
- Commerce, tiendas sin Promo, Landing QR Commerce, Admin, Master, productos, carrito, checkout, pedidos, precios, inventario, promociones, Rifas y apps no recibieron cambios productivos.
- Presupuestos ARC-ADR-010 permanecen dentro de límites.

## 8. Límites y validaciones manuales pendientes

No se ejecutaron por restricción del prompt:

- los siete runtimes que requieren un PocketBase local preconfigurado y credenciales aportadas por entorno;
- Cloudflare, DNS, TLS, certificados, proxy/ingress real, CDN o purga distribuida;
- staging, producción, deploy, release, publicación real, RUM o CrUX;
- QA visual desktop/móvil de `TS84-PROMO-QA-VIS-0001`;
- lectores de pantalla reales, zoom de navegador/dispositivos físicos y revisión editorial de alt/subtítulos/transcripciones.

Los objetivos de campo LCP p75 ≤ 2,5 s, INP p75 ≤ 200 ms y CLS p75 ≤ 0,10 siguen pendientes de telemetría autorizada. Los gates locales solo prueban estructura, bytes, requests, compresión y comportamiento reproducible.

No se conectaron Cloudflare ni cuentas externas; no se modificaron DNS, dominios, zonas, certificados, staging o producción; no se solicitaron, leyeron o escribieron secretos reales; no hubo instalación, migración nueva, push, merge, deploy, release ni commit.

## 9. Cierre

`TS84-PROMO-QA-AUTO-0001` queda **COMPLETADO** con cero fallos focales y cero regresiones críticas en los gates ejecutables localmente.

Siguiente Prompt ID del mapa, únicamente habilitado y no iniciado: `TS84-PROMO-QA-VIS-0001`.
