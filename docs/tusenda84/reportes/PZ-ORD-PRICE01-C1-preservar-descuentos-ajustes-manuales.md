REPORTE FINAL — PROMPT ID: PZ-ORD-PRICE01-C1

# Preservación de descuentos y ajustes manuales en pedidos

## Estado

Implementación terminada y verificada localmente. La edición administrativa de pedidos conserva el acuerdo económico capturado al crear la orden, recalcula desde snapshots versionados y separa cualquier ajuste manual del precio automático. No se marcaron como completados `PZ-ORD-PRICE01` ni `V7E9`; ambos mantienen su estado previo y este cambio queda pendiente de QA final.

## Problema resuelto

El flujo anterior podía volver a consultar precios, promociones o cupones vigentes cuando un administrador cambiaba una cantidad o agregaba una unidad. Eso hacía posible que una orden histórica heredara reglas comerciales nuevas. Además, editar directamente `order_items.price` mezclaba el acuerdo automático con una decisión manual y no dejaba una auditoría inmutable.

La corrección establece tres capas económicas explícitas:

1. precio original y descuento automático congelados al checkout;
2. ajuste manual administrativo, separado y auditable;
3. precio final y totales derivados usados por administración, recibo y WhatsApp.

## Backend y persistencia

- Se agregó `backend-powerzona/pb_migrations/1784509200_order_economic_snapshots_adjustments.js` con snapshots económicos privados y versionados para órdenes e ítems.
- La migración separa precio original, precio después de promoción/cupón, precio final, delta manual unitario, totales antes/después del ajuste y beneficio final.
- Se creó `order_price_adjustments` como bitácora inmutable. Sus reglas de escritura REST son nulas y cada evento registra orden, línea, actor, tienda, motivo, detalle, valores anterior/nuevo, delta y fecha.
- La lectura de auditoría queda limitada a Master activo o `store_admin` activo de la misma tienda. Staff, usuarios suspendidos, público y administradores de otra tienda no acceden.
- Se cerró la creación, actualización y eliminación REST directa de `order_items`; las mutaciones económicas pasan por rutas privadas y transaccionales.
- Se agregó defensa idempotente para el uso normal de cupones por la combinación orden/cupón. Editar una orden no crea otro uso ni incrementa `used_count`.
- La migración repara de forma idempotente campos canónicos económicos que una instalación limpia de PocketBase 0.38 podía omitir por el comportamiento nulo de `getByName`. Esto mantiene instalaciones existentes y nuevas en el mismo contrato.
- `down` elimina únicamente las estructuras C1, restaura los campos obligatorios previos y conserva la reparación compatible de los campos pertenecientes a la canonización base.

## Motor económico

- El checkout guarda una copia del precio/costo/taxonomía, la promoción originalmente aplicada o el cupón ganador, moneda, tasa y envío.
- Cambiar cantidad, agregar una unidad de una línea existente o eliminar una línea recalcula toda la orden desde esos snapshots. Nunca consulta el precio actual del catálogo ni promociones/cupones nuevos.
- Agregar un producto que no estaba en la orden usa su precio base actual, pero evalúa solamente el acuerdo automático original de esa orden; una promoción creada después no se incorpora.
- Las órdenes legacy sin snapshots congelan sus valores económicos almacenados antes de la primera mutación. El fallback no vuelve a ejecutar promociones vigentes.
- Los importes aceptan cero sólo con confirmación explícita y rechazan negativos, no finitos, excesivos o motivos fuera del catálogo cerrado.
- Los ajustes se permiten en `pending`, `confirmed` y `preparing`. Se rechazan en `delivered` y `cancelled`.
- El stock continúa siendo una restricción independiente: no se usa como sustituto del permiso económico.

## API privada

Se incorporaron las siguientes rutas autenticadas, limitadas por cuerpo y con respuestas saneadas:

- `PATCH /api/pz/admin/orders/{orderId}/items/{itemId}/quantity`
- `POST /api/pz/admin/orders/{orderId}/items`
- `DELETE /api/pz/admin/orders/{orderId}/items/{itemId}`
- `POST /api/pz/admin/orders/{orderId}/items/{itemId}/price-adjustments`
- `POST /api/pz/admin/orders/{orderId}/items/{itemId}/price-adjustments/reset`

Todas exigen Master activo o `store_admin` activo de la tienda propietaria. No se exponen motivo, detalle interno, actor, IDs internos de auditoría ni excepciones de persistencia en las respuestas públicas.

## Administración, recibo y WhatsApp

- Se eliminó la edición libre de precio y nombre en la línea administrativa.
- Cada línea muestra precio base, promoción/cupón automático, ajuste especial y precio final.
- Cantidad, alta y baja usan exclusivamente los endpoints privados.
- El modal “Ajustar precio” exige precio final y motivo, solicita detalle para “Otro”, advierte aumentos y reducciones, requiere confirmación adicional para cero y permite restablecer el acuerdo automático.
- El modal es centrado, responsive, cierra con Escape, contiene el foco y devuelve el foco al control de origen.
- El recibo público y los resúmenes copiados/WhatsApp usan precio unitario y total final. Sólo presentan la etiqueta genérica “Ajuste especial”; nunca muestran motivo, detalle o actor.

## Verificación automatizada

Resultados finales:

- pruebas focales backend: 15 aprobadas, 0 fallos;
- pruebas focales frontend: 6 aprobadas, 0 fallos;
- suite backend completa: 395 pruebas, 389 aprobadas, 6 omitidas por requerir entornos HTTP opt-in, 0 fallos;
- suite frontend completa: 163 aprobadas, 0 omitidas, 0 fallos;
- runtime HTTP C1 con PocketBase real y base temporal aislada: 1 escenario integral aprobado, 0 fallos y limpieza de fixtures comprobada;
- build Astro SSR: correcto;
- `git diff --check`: correcto, sin errores de whitespace;
- migración sobre base temporal vacía: correcta;
- ciclo final `down 1` y `up` de `1784509200`: correcto.

El escenario HTTP real cubrió manipulación de payloads, cambio de catálogo/promoción después del checkout, preservación de promoción y cupón originales, alta de líneas, cantidades, eliminación, ajuste/reinicio, cero explícito, validaciones de importes y motivos, estados de orden, Master, Admin, Staff, suspendido, cruce de tienda, lectura/immutabilidad de auditoría y no duplicación de usos de cupón.

## Evidencias Playwright estándar

Las evidencias se generaron contra Astro y PocketBase reales usando exclusivamente bases y fixtures temporales, que se eliminan al cerrar la validación:

- `docs/tusenda84/reportes/evidencias/PZ-ORD-PRICE01-C1/01-linea-desglose-pc.png`
- `docs/tusenda84/reportes/evidencias/PZ-ORD-PRICE01-C1/02-modal-ajuste-precio.png`
- `docs/tusenda84/reportes/evidencias/PZ-ORD-PRICE01-C1/03-aumento-advertencia.png`
- `docs/tusenda84/reportes/evidencias/PZ-ORD-PRICE01-C1/04-ajuste-movil.png`
- `docs/tusenda84/reportes/evidencias/PZ-ORD-PRICE01-C1/05-recibo-ajuste.png`

La inspección visual confirmó desglose legible, modal centrado, advertencia de aumento, adaptación móvil sin desborde y recibo sin información interna.

## Archivos principales

- `backend-powerzona/pb_hooks/pz_order_pricing.pb.js`
- `backend-powerzona/pb_hooks/pz_order_pricing_lib.js`
- `backend-powerzona/pb_migrations/1784509200_order_economic_snapshots_adjustments.js`
- `backend-powerzona/tests/pz_order_pricing.test.cjs`
- `backend-powerzona/tests/pz_order_pricing_http_runtime.test.cjs`
- `frontend-powerzona/src/pages/admin/orders.astro`
- `frontend-powerzona/src/pages/orden/[orderNumber]/[token].astro`
- `frontend-powerzona/tests/orderPricingBackend.test.mjs`
- `frontend-powerzona/tests/orderPricingC1.visual.mjs`

## Límites de esta entrega

- No se usó ni modificó `backend-powerzona/pb_data` real.
- No se ejecutaron operaciones Git de stage, commit, push, merge o cambio de rama.
- No se realizó despliegue.
- Las seis omisiones de la suite backend pertenecen a runtimes opt-in de otros módulos o al propio runtime C1 cuando no se suministran variables; el escenario C1 sí fue ejecutado aparte contra PocketBase real y pasó.

EN REVISIÓN — PZ-ORD-PRICE01-C1 PENDIENTE DE QA FINAL
