REPORTE FINAL — PROMPT ID: PZ-ORD-PRICE01

Fecha de ejecución: 2026-07-18  
Repositorio: `E:\Trabajo\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt`  
Rama: `dev`  
Source de revisión indicado: V108

## 1. Preflight

- `Get-Location`: `E:\Trabajo\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt`.
- `git rev-parse --show-toplevel`: `E:/Trabajo/PROYECTOS/WEb E_Comerce PowerZona_ChatGpt`.
- `git branch --show-current`: `dev`.
- `git status --short`, `git diff --name-only` y `git diff --stat`: limpios antes de modificar.
- No había listeners en 8090, 4321 ni 3000 al comenzar.
- Suite backend inicial: 379 totales, 374 aprobadas, 0 fallidas y 5 omitidas.
- Suite frontend inicial: 157 totales, 157 aprobadas, 0 fallidas y 0 omitidas.
- No se importó ni descomprimió ningún ZIP y no se modificó `pb_data` persistente.

## 2. Causa raíz

El checkout público creaba primero `orders` y después cada `order_item` mediante las APIs públicas de colecciones de PocketBase. El navegador enviaba nombres, precios unitarios, subtotales, descuentos, envío y total; la regla pública de creación de `order_items` permitía conservar esos valores.

El hook V7E9 existente resolvía producto y variación y canonizaba nombres cuando la capacidad Premium de vencimientos estaba activa, pero no sustituía precios ni totales. Además, el rollback desde JavaScript del navegador no constituía una transacción atómica del servidor.

## 3. Rutas de escritura encontradas

- `/checkout`: creación pública directa de `orders`, `order_items`, usos de cupón, actualización del contador de cupón y notificación.
- `/t/[storeSlug]/checkout`: reutiliza la misma página `/checkout`; no contiene un segundo flujo.
- `src/pages/admin/orders.astro`: operaciones autenticadas de creación/actualización/eliminación de líneas y actualización de órdenes.
- REST/SDK/F12 de `orders` y `order_items`: la creación anónima estaba permitida por reglas de colección.
- Hooks V7E9 de `order_items`: validación de disponibilidad/nombres, sin canonización monetaria previa a esta corrección.
- Rutas de recibo y reseña: solo lectura; se conservaron.

## 4. Archivos modificados o agregados

- `backend-powerzona/pb_hooks/pz_master_price_watch_lib.js`.
- `backend-powerzona/pb_hooks/pz_order_pricing_lib.js`.
- `backend-powerzona/pb_hooks/pz_order_pricing.pb.js`.
- `backend-powerzona/pb_migrations/1784422800_canonical_order_pricing_backend.js`.
- `backend-powerzona/tests/pz_order_pricing.test.cjs`.
- `backend-powerzona/tests/pz_order_pricing_http_runtime.test.cjs`.
- `frontend-powerzona/src/pages/checkout.astro`.
- `frontend-powerzona/tests/orderPricingBackend.test.mjs`.
- `docs/tusenda84/reportes/PZ-ORD-PRICE01-canonizacion-precios-backend.md`.

## 5. Fuente de verdad elegida

La escritura oficial es ahora `POST /api/pz/checkout/orders`. El cliente envía exclusivamente tienda solicitada, clave idempotente, datos de contacto, moneda/servicio, zona, código de cupón y referencias `product_id`/`variation_id`/`gift_id` con cantidad.

El backend vuelve a resolver tienda, configuración activa, moneda, zona, producto, taxonomía, variación, stock, preorder, vencimiento, promociones, cupón y regalo desde los registros actuales. Los campos monetarios o nombres adicionales enviados por F12 son ignorados.

Las actualizaciones autenticadas directas de `order_items` pasan por hooks que vuelven a resolver la relación real y sobrescriben nombres, precio y total. Las actualizaciones de `orders` recalculan subtotal, descuentos, cupón, envío, equivalencias y total desde líneas almacenadas canónicas.

## 6. Cálculo canónico

- Producto general y oferta reutilizan `productSnapshotPrice` del helper oficial de price watch.
- Variaciones reutilizan la misma semántica oficial mediante `variationSnapshotPrice` y `effectiveCommercialPrice`; no se creó una segunda fórmula de precio base/oferta.
- Las fórmulas aprobadas de promociones y cupones se ejecutan en backend y tienen una prueba de paridad numérica contra `public/cart-promotions.js`.
- Cantidades deben ser enteros entre 1 y 100000 y no pueden superar stock salvo preorder autorizado.
- Se validan tienda activa, producto activo, categoría/subcategoría activas, relación producto-variación, horario que no admite pedidos, moneda de la tienda, zona real y V7E9.
- `unit_price_usd`, subtotales de línea, descuentos, equivalencias y total se generan únicamente en servidor.
- Se conservan snapshots canónicos de nombre, variación e imagen para recibo.

## 7. Defensa contra creación directa

La migración elimina la creación anónima de `orders`, `order_items` y usos de cupón. Solo Master o Store Admin de la tienda correspondiente pueden usar esas escrituras de colección. Se preservó también la regla previa que impide enviar los campos internos `customer`, `security_registered_at` y `security_identity_erased_at`.

La prueba HTTP envió solicitudes REST anónimas directas y confirmó respuesta genérica de PocketBase y cero registros creados. Una actualización directa autenticada con `0.01`, `999999`, nombre falso y total falso terminó almacenando el nombre y precio reales.

## 8. Transacción y atomicidad

Orden, líneas, uso/incremento de cupón y notificación se crean dentro de una sola `$app.runInTransaction`. El plan completo se valida antes de la primera escritura. Cualquier error propaga rollback y la respuesta pública solo contiene un código genérico.

La prueba con una primera línea válida y una segunda línea de otra tienda confirmó sin cambios:

- cantidad de órdenes;
- cantidad de `order_items`;
- stock del producto;
- notificaciones y recibo válido.

La clave idempotente se genera con Web Crypto, se reutiliza solo para la misma huella de carrito y contexto de checkout y está protegida por un índice único `(store, receipt_token)`. Dos reenvíos idénticos devolvieron el mismo ID y dejaron una sola orden.

## 9. Resultados runtime

Comando focal real con variables locales contra PocketBase temporal: 1 total, 1 aprobada, 0 fallidas, 0 omitidas.

Casos confirmados:

- precio real 10.00 frente a `0.01`, `999999`, texto y precio omitido;
- nombre, subtotal, total, envío, tasa y tienda manipulados;
- variación de precio 12.00 frente a precio general/de otra variación;
- variación de otro producto, variación de otra tienda y producto de otra tienda rechazados;
- oferta real 7.00 frente a precios inferiores/superiores enviados;
- cantidades 1 y múltiples; cero, negativa, decimal y superior al stock rechazadas;
- envío real, moneda 1:1, CUP y carrito mixto;
- promoción automática, cupón con uso transaccional y regalo gratuito;
- producto y variación vencidos rechazados;
- productos a 30 y 1 día vendibles con precio canónico;
- fallo de segunda línea sin creación parcial ni descuento de stock;
- doble envío idempotente sin duplicado;
- respuestas de error sin IDs, costos, consultas ni stack traces.

La migración completa, incluida la nueva migración, se aplicó correctamente desde una base vacía temporal. El `finally` de runtime verificó 0 fixtures `PZPRICEQA_` en tiendas, usuarios, productos, variaciones, órdenes, líneas, promociones, cupones, regalos y notificaciones. También eliminó usos de cupón, dispositivos/sesiones administrativas temporales y demás relaciones del fixture.

## 10. Pruebas automatizadas

- Focal backend canónico: 12 totales, 12 aprobadas, 0 fallidas, 0 omitidas.
- Focal frontend: 4 totales, 4 aprobadas, 0 fallidas, 0 omitidas.
- Suite backend completa final: 392 totales, 386 aprobadas, 0 fallidas, 6 omitidas.
- Suite frontend completa final: 161 totales, 161 aprobadas, 0 fallidas, 0 omitidas.

Las seis omisiones backend son runtimes opt-in ajenos o sin variables en la ejecución completa: F7P8 HTTP, PZ-ORD-PRICE01 HTTP, U7I7F1D8 HTTP, dispositivos PocketBase 0.38.2, U7I7 HTTP y PZPW01 HTTP. El runtime PZ-ORD-PRICE01 fue ejecutado por separado con su PocketBase local y aprobó 1/1.

## 11. Build

`cd frontend-powerzona && npm.cmd run build`: aprobado.

Astro generó el servidor sin errores. Se conservaron tres advertencias preexistentes de `getStaticPaths()` ignorado en las rutas dinámicas de categoría, producto y subcategoría.

## 12. No regresiones

- Checkout normal conserva orden pendiente y segundo paso de WhatsApp.
- WhatsApp y recibo consumen la orden, líneas y totales devueltos por servidor.
- Producto general, variación, oferta, promoción, cupón, regalo, moneda 1:1, CUP y mezcla monetaria tienen cobertura focal/runtime.
- Stock y preorder se validan antes de escribir; el descuento de inventario sigue ocurriendo únicamente en el flujo administrativo aprobado de confirmación.
- La validación viva continúa antes del endpoint y el backend repite las defensas críticas.
- Aislamiento multi-tienda y reglas de identidad internas se preservaron.
- V7E9 continuó verde dentro de la suite completa; no se marcó como COMPLETADO.
- F7P8 y el resto de suites no presentaron fallos.
- No se rediseñó interfaz ni responsive.

## 13. Limpieza

- 0 fixtures `PZPRICEQA_` comprobados por el runtime.
- PocketBase temporal cerrado; comprobación HTTP posterior: `CLOSED`.
- Sin listeners finales en 8090, 4321 o 3000 iniciados por esta tarea.
- Eliminados `frontend-powerzona/dist`, `frontend-powerzona/.astro` y `.tmp` con las dos bases temporales.
- No se generaron capturas, `playwright-report`, `test-results` ni archivos de producto.
- No quedaron watchers, Chromium, Astro ni procesos Node/PocketBase de prueba.

## 14. Git final

- Rama final: `dev`.
- `git diff --check`: aprobado; solo advertencias informativas de conversión LF/CRLF al consultar dos archivos existentes.
- `git status --short`: únicamente los archivos de implementación, pruebas y este reporte.
- Sin `pb_data`, `dist`, `.astro`, `.tmp`, `node_modules`, credenciales, capturas ni archivos temporales.

## 15. Operaciones no realizadas

No se ejecutó `git add`, commit, push, merge, cambio de rama, deploy, Coolify, Cloudflare ni modificación de datos reales. No se actualizó la bitácora PDF.

EN REVISIÓN — CORRECCIÓN DE PRECIO PENDIENTE DE QA
