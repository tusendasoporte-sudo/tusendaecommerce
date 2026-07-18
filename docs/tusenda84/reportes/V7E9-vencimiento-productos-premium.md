# REPORTE FINAL — PROMPT ID: V7E9

Estado final: **EN REVISIÓN — pendiente de confirmación explícita de Kraken**

## 1. Identificación y preflight

- Repositorio real: `C:\Users\workd\Desktop\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt`.
- Rama verificada antes de modificar: `dev`.
- Commit base y `HEAD` final: `c947e1a38170154b14be1f1ba21e787e04f45c1e`.
- `git status --short` inicial: sin salida.
- `git diff --name-only` inicial: sin salida.
- Cambios heredados: ninguno. El árbol estaba limpio y no fue necesario conciliar trabajo ajeno.
- No se abrió, importó ni utilizó `Proyecto actualizado V104.zip`; V104 se trató únicamente como referencia de continuidad indicada por el prompt.

## 2. Continuidad F7P8

Antes de implementar V7E9 se actualizó `docs/tusenda84/reportes/F7P8-limite-fotos-producto.md`, el reporte privado específico ya existente. F7P8 quedó registrado como **COMPLETADO**, cerrado el **17 de julio de 2026**, **confirmado por Kraken**, con referencia a la **bitácora v30** y Source de continuidad **V104**.

No se cambió la lógica F7P8 2/4, la cola Premium conservada, sus hooks ni sus pruebas. Su suite continuó pasando dentro de la regresión completa.

## 3. Hallazgos confirmados en el source real

- La matriz central backend/frontend ya contenía `product_expiration_tools_enabled`; se reutilizó como única fuente comercial.
- `products.expiration_date` y `product_variations.expiration_date` ya existían y se conservaron.
- El Resumen ya tenía la tarjeta **Por vencer** y `#productos-proximos-vencer`; ambas zonas fueron reutilizadas.
- Los campos administrativos y los cálculos de vencimiento del navegador estaban repartidos entre productos, ajustes, Resumen y `AdminSidebar.astro`.
- El cambio manual de plan ya estaba centralizado en `pz_store_plan_management_lib.js`; la limpieza V7E9 se integró dentro de su transacción.
- El detalle público ya tenía el fallback **Producto no disponible**; se reutilizó sin revelar fechas ni motivos.
- Catálogo, destacados, relacionados y páginas públicas convergen en los helpers de `src/lib/api.ts`, lo que permitió una defensa compartida sin duplicar consultas por página.

## 4. Arquitectura implementada

La solución queda dividida en cuatro capas:

1. `pz_product_expiration_lib.js`: reglas civiles, capacidad, disponibilidad comercial, endpoint privado, alertas, ciclos y limpieza.
2. `pz_product_expiration.pb.js`: hooks de producto/variación/settings/order_items, endpoint y cron.
3. `productExpiration.ts` y `api.ts`: filtrado SSR público coherente con la tienda real.
4. UI administrativa: gates, Resumen ligero, formularios Premium y confirmación de downgrade.

No se añadieron dependencias. El endpoint detallado devuelve campos mínimos, no carga imágenes y pagina a 10 productos. Free/Básico no lo invocan.

## 5. Archivos creados

- `backend-powerzona/pb_hooks/pz_product_expiration.pb.js`.
- `backend-powerzona/pb_hooks/pz_product_expiration_lib.js`.
- `backend-powerzona/pb_migrations/1784304000_v7e9_product_expiration_cycles.js`.
- `backend-powerzona/tests/pz_v7e9_product_expiration.test.cjs`.
- `frontend-powerzona/src/lib/productExpiration.ts`.
- `frontend-powerzona/tests/v7e9ProductExpiration.test.mjs`.
- `docs/tusenda84/reportes/V7E9-vencimiento-productos-premium.md`.

## 6. Archivos modificados

- Backend: `pz_store_plan_management_lib.js` y `pz_store_plan_management.test.cjs`.
- Documentación: `F7P8-limite-fotos-producto.md`.
- Público: `cart-live-validator.js`, `Layout.astro`, `api.ts` y `producto/[slug].astro`.
- Admin: `AdminSidebar.astro`, `admin/index.astro`, `admin/products.astro`, `admin/store-settings.astro` y `StoreCapabilityGate.astro`.
- Master: `MasterStorePlanView.astro`, `masterStorePlans.ts` y `master-ui.css`.

No se modificaron migraciones históricas ni `pb_data` real.

## 7. Migración nueva

`1784304000_v7e9_product_expiration_cycles.js` es una migración forward-only e idempotente que:

- agrega `settings.notify_expiration_alerts` con backfill activo para ajustes existentes;
- registra solo los tipos de notificación V7E9 90/60/30/0;
- crea la colección técnica privada `product_expiration_cycles`;
- relaciona tienda, producto, variación y notificación con cascadas acotadas;
- guarda entidad, día civil, umbral y `cycle_key`;
- aplica índice único persistente a `cycle_key` e índices de consulta por tienda/producto/notificación.

El arranque runtime de PocketBase aplicó la migración desde una base temporal vacía sin errores.

## 8. Endpoints, hooks y cron

- Endpoint privado: `POST /api/pz/admin/product-expirations`.
- Payload exacto: `view`, `window_days`, `page`; ventanas permitidas 30/60/90.
- Respuestas privadas con `Cache-Control: private, no-store`, `Pragma: no-cache`, `X-Robots-Tag` y `Referrer-Policy` restrictivos.
- Aislamiento: la tienda se obtiene del usuario autenticado, no del body; solo Store Admin/Staff activos de la tienda y con capacidad Premium.
- Hooks de create/update para fechas de producto y variación, settings y `order_items`.
- Hooks posteriores de create/update/delete reinician o eliminan ciclos según el cambio real entre el registro original y el guardado.
- Cron `pz_v7e9_product_expiration_alerts` a los 8 minutos de cada hora, con fallo aislado por tienda.
- La detección de vencimiento fue retirada de `AdminSidebar.astro`; stock bajo/agotado, polling y realtime permanecen.

La validación runtime detectó y corrigió dos incompatibilidades que no aparecían en los mocks: PocketBase representa el campo `date` como medianoche UTC dentro del request y recompila callbacks `.pb.js` sin helpers globales. La versión final acepta únicamente `YYYY-MM-DD` o su representación PocketBase inequívoca a medianoche, y los helpers viven en el módulo requerido.

## 9. Día civil y zona horaria

- Zona única: `America/Havana`.
- Se compara el día civil, no una hora del navegador.
- Una fecha permanece vendible hasta las 23:59:59 del día anterior y se bloquea desde las 00:00 del propio día.
- Los helpers backend y frontend fueron centralizados y probados alrededor del cambio de día y el horario de verano cubano.
- Formatos ambiguos, fechas imposibles y horas distintas de medianoche se rechazan.

## 10. Comportamiento Premium

- Campos de fecha habilitados en producto y variación.
- Tarjeta **Por vencer** compacta con vencidos, próximos en 30 días y ancla a la sección existente.
- Sección existente con pestañas Próximos/Vencidos, rangos acumulativos 30/60/90, detalle de variaciones y máximo 10 productos por página.
- Detalle cargado bajo demanda con `IntersectionObserver`; sin imágenes.
- Un único switch: **Alertas de vencimiento — Recibe avisos a 90, 60 y 30 días, y el día del vencimiento.**
- Catálogo, destacados, relacionados, detalle, carrito vivo y orden final aplican el bloqueo.

## 11. Comportamiento Free y Básico

- La capacidad se evalúa antes que cualquier fecha residual; las fechas no bloquean ventas.
- Formularios no muestran ni envían `expiration_date`.
- Ajustes no leen ni guardan `notify_expiration_alerts`.
- Resumen conserva sus dos zonas con el gate compacto **Función Premium**.
- No se calculan vencimientos ni se consulta el endpoint privado.
- Request directo de fecha recibe `403 expiration_premium_required`.
- Request directo al endpoint privado recibe `403` seguro.
- No se generan alertas.

## 12. Producto y variaciones

- Producto sin variaciones: fecha general opcional.
- Producto con variaciones: fecha general mientras ninguna variación tenga fecha propia.
- La primera fecha individual exige confirmación visual, elimina la fecha general y elimina su ciclo anterior.
- Backend rechaza fecha general si existe cualquier fecha individual.
- Una variación sin fecha sigue vendible; una vencida se bloquea individualmente.
- El producto queda no disponible solo si todas las variaciones que de otro modo serían vendibles están vencidas.
- Si todas las fechas individuales se borran, el campo general vuelve a habilitarse vacío; no se restaura una fecha anterior.
- Una fecha general vencida bloquea producto y todas sus variaciones.

## 13. Alertas y deduplicación

- Umbrales únicos: **90, 60, 30 y 0**. No existe alerta de 7 días.
- 90/60: prioridad normal.
- 30: prioridad alta/`important`, presentación roja.
- 0 o vencido: prioridad crítica, presentación roja.
- Catch-up único: 75→90, 45→60, 20→30 y hoy/pasado→0.
- `cycle_key` deduplica persistentemente por tienda, colección/entidad, fecha y umbral.
- Borrar, leer, archivar o expirar por retención la notificación visible no recrea el mismo ciclo.
- Variaciones del mismo producto/fecha/umbral se agrupan en una notificación; fechas distintas se separan.
- Cambiar/borrar fecha elimina ciclos y notificaciones anteriores antes de evaluar el nuevo ciclo.
- El destino se construye internamente hacia el editor del producto/variación; no admite URLs del cliente.

## 14. Downgrade irreversible y upgrade vacío

El detalle del plan expone solo conteos de productos, variaciones, notificaciones y ciclos. Premium→Básico/Free:

- muestra advertencia irreversible y exige checkbox explícito;
- envía `confirm_expiration_cleanup` en un payload exacto;
- servidor vuelve a validar actor, tienda real y transición;
- dentro de la transacción cambia plan, vacía fechas, elimina notificaciones V7E9 y ciclos solo de esa tienda;
- usa operaciones estrictas: cualquier fallo se propaga para rollback;
- no toca productos, imágenes, cola F7P8, stock, precios, órdenes, reseñas ni otros tipos de notificación.

El upgrade posterior a Premium no restaura fechas, notificaciones ni ciclos.

## 15. Defensa pública, carrito, checkout y F12

- Los helpers SSR filtran fechas generales y variaciones para listados, búsqueda, categorías, subcategorías, destacados y relacionados.
- El enlace directo reutiliza **Producto no disponible**, sin fecha ni motivo.
- `cart-live-validator.js` vuelve a consultar producto/variación y aplica el día civil; el mensaje es genérico.
- El checkout hereda esa validación viva.
- El hook más bajo de `order_items` resuelve orden→tienda, producto→tienda y variación→producto desde la base; no usa store, nombre, fecha ni estado suministrados para decidir disponibilidad.
- Nombres y referencias del item se canonizan desde registros reales.
- Producto inactivo, variación inválida/inactiva, stock no vendible o vencimiento Premium devuelven **Este producto ya no está disponible.**
- Free/Básico salen por capacidad antes de evaluar fechas.

## 16. Pruebas focalizadas

- Backend: `node --test tests/pz_v7e9_product_expiration.test.cjs tests/pz_store_plan_management.test.cjs` → **28/28**, 0 fallos, 0 omitidas.
- Frontend final: `node --test tests/v7e9ProductExpiration.test.mjs` → **9/9**, 0 fallos, 0 omitidas.

Cobertura focal real: formato civil, medianoche Habana, Premium/Basic/Free, 90/60/30/0, ausencia de 7, catálogo, variaciones, conteos únicos, payload privado, deduplicación, agrupación, reinicio/borrado de ciclo, F12 de fechas y orden, aislamiento, limpieza estricta, UI sin consultas Premium, sidebar sin detección browser, confirmación Master y contrato responsive compacto sin imágenes.

## 17. Validación runtime aislada

Se creó una base PocketBase temporal dentro del workspace, nunca se abrió `backend-powerzona/pb_data`, y se ejecutaron migraciones/hooks reales con datos desechables. Resultados finales:

- PocketBase inició con migraciones y hooks V7E9.
- Endpoint Premium autenticado: 1 próximo y 1 vencido; lista sin imágenes.
- Endpoint Básico: `403`.
- Guardado directo de fecha en Básico: `403 expiration_premium_required`.
- Cambio de fecha Premium: PocketBase guardó medianoche, eliminó el ciclo anterior y creó exactamente 1 ciclo umbral 30 y 1 notificación `important` para la fecha nueva.
- Downgrade: preview 1 producto, 0 variaciones, 1 notificación y 1 ciclo.
- Downgrade sin confirmación: `409`.
- Downgrade confirmado: eliminó 1 fecha, 1 notificación y 1 ciclo; plan real quedó `basic`.
- Upgrade posterior: plan real `premium`, 0 fechas restauradas.
- `order_item` directo con producto vencido y nombre/precio manipulados: `400 product_unavailable`, mensaje genérico.
- SSR público: producto vencido ausente del catálogo; enlace directo devolvió **Producto no disponible**.

## 18. Suites completas

- Backend final: `node --test "tests/*.test.cjs"` → **377 totales, 372 pasan, 5 omitidas por variables runtime no suministradas, 0 fallos**.
- Frontend final: `node --test "tests/*.test.mjs"` → **147/147, 0 omitidas, 0 fallos**.
- Las 5 omitidas son suites HTTP históricas condicionadas por credenciales/URLs propias; V7E9 sí tuvo la validación runtime aislada descrita arriba.

## 19. Build

`npm.cmd run build` en `frontend-powerzona` → **exit 0**, SSR server build completo.

Advertencias no bloqueantes preexistentes: Astro ignora `getStaticPaths()` en las páginas dinámicas de categoría, subcategoría y producto. No hubo error de compilación. `dist` y `.astro` se eliminaron después de registrar el resultado.

## 20. Responsive PC/móvil

No se afirma una prueba visual real. Se intentó usar el navegador integrado conforme al skill, pero su puente falló antes de abrir/controlar una pestaña con `codex/sandbox-state-meta: missing field sandboxPolicy`. Por ello no hay capturas ni verificación pixel a pixel PC/móvil.

Sí se ejecutaron: build SSR, respuestas HTTP reales, contrato automatizado de gate compacto, media queries 760/640, `minmax(0, 1fr)`, ancho máximo, ausencia de imágenes y adaptación móvil del item. La comprobación visual manual en PC/móvil y la ausencia perceptual de scroll horizontal quedan pendientes de Kraken.

## 21. Aislamiento multi-tienda y request directo

- Unidad: admin de otra tienda no puede guardar fecha; ciclo incluye tienda; limpieza conserva variaciones/notificaciones ajenas.
- Runtime: Premium obtuvo datos propios; Básico recibió `403`; el plan del navegador nunca formó parte del payload.
- Endpoint no recibe `store_id` y rechaza campos adicionales.
- Downgrade opera con el `store_id` validado por el flujo Master y vuelve a resolver todas las relaciones.
- `order_items` con relaciones inconsistentes devuelve error genérico.

## 22. Seguridad y artefactos

- Escaneo final de archivos V7E9: 0 `TODO`, 0 `FIXME`, 0 `console.log/info/warn`, 0 hook diagnóstico y 0 credenciales runtime.
- 0 source maps fuera de dependencias.
- 0 secretos, tokens o contraseñas añadidos al estado Git.
- `pb_data`, `node_modules`, `dist`, `.astro`, `.tmp` y el archivo local de secretos no aparecen como cambios Git.
- El `pb_data` real preexistente permanece ignorado e intacto.
- No se añadió bypass global de CSRF/origin.

## 23. Limpieza final

La base temporal completa fue eliminada después de cerrar PocketBase y Astro; al estar todos los fixtures exclusivamente dentro de esa base, su eliminación verificable deja:

- 0 fixtures temporales.
- 0 tiendas temporales.
- 0 usuarios temporales.
- 0 productos temporales.
- 0 variaciones temporales.
- 0 órdenes temporales.
- 0 `order_items` temporales.
- 0 notificaciones temporales.
- 0 ciclos temporales.
- 0 sesiones temporales persistentes.
- 0 imágenes/archivos temporales.
- 0 bases temporales.
- 0 carpetas runtime `.tmp`.
- 0 `dist` y 0 `.astro` generados.
- 0 procesos PocketBase/Node/Astro abiertos por V7E9.
- Puertos 4321, 4322 y 8091: 0 listeners de la tarea.
- Terminales/sesiones adicionales de la tarea cerradas; no se alteraron terminales oficiales ajenas.

## 24. Git final

- `git diff --check`: **exit 0**, sin errores de whitespace. Git solo informó la política normal LF→CRLF del entorno Windows.
- Rama final: `dev`.
- `HEAD` final: `c947e1a38170154b14be1f1ba21e787e04f45c1e`.
- No se ejecutó `git add`, commit, push, merge, cambio de rama ni deploy.
- No se modificó Coolify, Cloudflare, staging ni production.

`git status --short` final esperado para esta entrega:

```text
 M backend-powerzona/pb_hooks/pz_store_plan_management_lib.js
 M backend-powerzona/tests/pz_store_plan_management.test.cjs
 M docs/tusenda84/reportes/F7P8-limite-fotos-producto.md
 M frontend-powerzona/public/cart-live-validator.js
 M frontend-powerzona/src/components/admin/AdminSidebar.astro
 M frontend-powerzona/src/components/master/MasterStorePlanView.astro
 M frontend-powerzona/src/components/shared/StoreCapabilityGate.astro
 M frontend-powerzona/src/layouts/Layout.astro
 M frontend-powerzona/src/lib/api.ts
 M frontend-powerzona/src/lib/masterStorePlans.ts
 M frontend-powerzona/src/pages/admin/index.astro
 M frontend-powerzona/src/pages/admin/products.astro
 M frontend-powerzona/src/pages/admin/store-settings.astro
 M frontend-powerzona/src/pages/producto/[slug].astro
 M frontend-powerzona/src/styles/master-ui.css
?? backend-powerzona/pb_hooks/pz_product_expiration.pb.js
?? backend-powerzona/pb_hooks/pz_product_expiration_lib.js
?? backend-powerzona/pb_migrations/1784304000_v7e9_product_expiration_cycles.js
?? backend-powerzona/tests/pz_v7e9_product_expiration.test.cjs
?? docs/tusenda84/reportes/V7E9-vencimiento-productos-premium.md
?? frontend-powerzona/src/lib/productExpiration.ts
?? frontend-powerzona/tests/v7e9ProductExpiration.test.mjs
```

## 25. Guía manual pendiente para Kraken

1. Premium con producto sin fecha.
2. Fechas Premium a 90, 60 y 30 días y prioridades de campana.
3. Producto que vence hoy alrededor de las 00:00 de La Habana.
4. Producto vencido oculto y fallback directo.
5. Una variación vencida con otra válida.
6. Todas las variaciones vendibles vencidas.
7. Carrito viejo que contiene un producto ahora vencido.
8. Request directo a `order_items` y manipulación de relaciones/precios/nombres.
9. Cambio y borrado de fecha con limpieza de aviso/ciclo.
10. Notificación visible eliminada que no reaparece para el mismo ciclo.
11. Free y Básico mostrando **Función Premium** y vendiendo fechas residuales.
12. F12 contra endpoint, campos y cruce de tienda.
13. Downgrade con conteos, confirmación y limpieza irreversible.
14. Upgrade posterior con fechas vacías.
15. Revisión visual real en PC y móvil, incluido scroll horizontal, foco y navegación táctil.

## 26. Cierre

V7E9 queda implementado y verificado técnicamente, pero la validación visual real PC/móvil y la aceptación funcional final corresponden a Kraken.

Estado: **EN REVISIÓN — pendiente de confirmación explícita de Kraken**

## 27. Addendum privado V7E9-C1 — 18 de julio de 2026

Se aplicó `V7E9-C1 — Correcciones funcionales y visuales finales de V7E9` sobre el mismo árbol no confirmado, sin borrar ni sustituir la evidencia anterior de este reporte.

Correcciones incorporadas:

- página independiente en `/admin/expirations` y `/t/[storeSlug]/admin/expirations`, sin nueva entrada fija en el sidebar;
- tarjeta **Por vencer** enlazada a la vista `Vencidos` y Resumen reducido a una vista previa lazy de hasta cinco productos, sin imágenes ni paginación;
- diálogo Master con encabezado y footer fijos dentro de una cuadrícula acotada, cuerpo desplazable y safe area móvil;
- hook V7E9 alineado con `store_staff` activo de la misma tienda sin ampliar los permisos generales de Productos;
- presentación roja específica para avisos V7E9 de 30 días y vencidos en campana, listas y aviso visual interno;
- prueba frontend portable mediante `productExpirationCore.js`, sin importar TypeScript desde Node;
- pruebas focales, suites completas y build aprobados; la validación visual real PC/móvil no pudo ejecutarse porque la conexión del navegador integrado falló antes de abrir una sesión y queda expresamente pendiente para Kraken.

El detalle, los comandos reales, la evidencia de limpieza y la limitación visual se registran en `docs/tusenda84/reportes/V7E9-C1-correcciones-finales.md`.

Estado: **EN REVISIÓN — pendiente de confirmación explícita de Kraken**

## 28. Addendum privado V7E9-C2 — 18 de julio de 2026

Se aplicó V7E9-C2 — Pulido visual Premium y paginación de Vencimientos sobre el mismo punto todavía no confirmado.

El Resumen ahora usa una única tarjeta ligera, filas con icono genérico y jerarquía clara, estado vencido con borde rojo completo, acción Ver producto y paginación real de 5 resultados solicitados al servidor. La página independiente integra encabezado compacto, campana real, acción ← Volver al Resumen, filtros, búsqueda server-side segura, filas Premium y paginación de 10 dentro de una sola superficie.

El endpoint privado existente admite únicamente page_size 5/10 y query normalizada de hasta 80 caracteres; continúa resolviendo tienda y plan desde la autenticación, rechazando store_id y campos adicionales. Free/Básico, Store Staff, reglas 90/60/30/0, bloqueo desde el día exacto y limpieza por downgrade permanecen intactos.

Las pruebas focales, suites completas y build finalizaron sin fallos. La revisión visual real no se declara porque la herramienta del navegador integrado no estuvo disponible en esta sesión y queda pendiente para Kraken. El detalle técnico y la evidencia de limpieza están en docs/tusenda84/reportes/V7E9-C2-pulido-visual-vencimientos.md.

Estado: **EN REVISIÓN — pendiente de confirmación explícita de Kraken**
