REPORTE FINAL — PROMPT ID: V7E9-C3F1

## 1. Preflight

- Repositorio confirmado: `E:\Trabajo\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt`.
- Rama confirmada y conservada: `dev`.
- HEAD de partida: `693222e3b5640852f3e649d3015e9008360427c4`.
- El árbol estaba limpio al iniciar. No se importó, descomprimió ni utilizó un ZIP como source; se trabajó directamente sobre la continuidad V115 del repositorio.
- El estado documental se preservó: M7U2 continúa `COMPLETADO` y V7E9 continúa `EN REVISIÓN`.
- Procesos oficiales preservados desde el preflight: PocketBase PID `16780` y Node PID `37416`/`40456`.

## 2. Causa del producto vencido vendible

La fecha se procesaba para alertas y listados V7E9, pero la disponibilidad pública y transaccional no consumía un único predicado autoritativo. Por eso una unidad podía aparecer como vencida administrativamente mientras seguía entrando por consultas públicas, carrito o caminos de orden.

Se corrigió evaluando el registro completo en backend antes de sanear la respuesta y reutilizando la misma decisión comercial en listado, detalle, carrito, checkout e inventario.

## 3. Causa de `has_variations` falso ignorado

Había caminos que inferían el modo mediante la existencia de registros de variación, equivalentes a `has_variations || variations.length > 0`. Esa inferencia reactivaba comercialmente variaciones conservadas aunque el checkbox se guardara en `false`.

Se eliminaron las inferencias en pricing, vistas Master y administración. La única fuente de verdad es ahora `product.has_variations`.

## 4. Predicado central

Se creó `backend-powerzona/pb_hooks/pz_product_commerce_lib.js` con:

- `usesVariations(product)`;
- `buildProductUnits(product, variations)`;
- `effectiveUnitExpirationDate(product, unit, variations)`;
- `evaluateUnitAvailability(context)`.

El helper devuelve una unidad padre cuando el modo está apagado y una unidad por variación activa cuando está encendido. Evalúa tienda, tenant, estado, taxonomía, relación padre, precio canónico, stock, preventa, capability Premium y fecha civil de La Habana.

Las consultas de variaciones en catálogo público, checkout y V7E9 se paginan por lotes de 500 con orden estable `sort_order,id`; una unidad posterior al primer lote ya no queda omitida.

## 5. Enforcement del padre

- Un padre vencido o no vendible se elimina de listas públicas antes de serializar.
- La repaginación recalcula `items`, `totalItems` y `totalPages` después del filtro.
- El detalle directo devuelve 404 genérico y la UI presenta `Producto no disponible` sin fecha, precio, stock, imágenes, variaciones ni motivo comercial.
- Productos y variaciones públicos usan `Cache-Control: private, no-store, max-age=0` y `Pragma: no-cache`.
- Las promociones públicas dirigidas a un producto solo aparecen si este conserva al menos una unidad vendible; también se bloqueó traversal/expand público hacia campos privados del producto.
- Se ocultan costo, referencia interna, fecha de vencimiento y campos equivalentes antes de responder al consumidor público.

## 6. Enforcement de variaciones

Con `has_variations=true`, cada variación activa se resuelve por separado. Una variación vencida, inactiva, sin precio válido, sin stock y sin preventa, con relación incorrecta o perteneciente a otro tenant queda fuera del catálogo y es rechazada transaccionalmente. El padre permanece visible mientras exista al menos una hermana vendible y deja de estar disponible cuando el total es cero.

Con `has_variations=false`, todos los registros conservados se ignoran comercialmente y un `variation_id` suministrado directamente es rechazado.

## 7. Desactivar variaciones

- El checkbox guarda `false` real y ya no se combina con la cantidad de registros existentes.
- Se añadió la confirmación aprobada `Dejar de usar variaciones`; cancelar restaura el modo sin mutar datos.
- Antes de guardar se validan precio del padre, oferta, costo no negativo y stock cuando corresponde.
- El backend conserva nombres, imágenes, precio, costo, stock, orden y fechas de las variaciones.
- Dentro de la operación oficial se limpian notificaciones y ciclos V7E9 activos de esas variaciones y se recalcula usando solo al padre.
- Se registra `product_variations_disabled` únicamente tras una mutación administrativa exitosa.

## 8. Reactivar variaciones

La activación exige al menos una variación activa con estructura comercial válida. Las variaciones almacenadas vuelven a ser las unidades comerciales, el padre deja de aportar precio/stock y se recalculan fechas, disponibilidad y la alerta vigente actual. No se restauran alertas antiguas ni se duplican ciclos. La actividad registrada es `product_variations_enabled`.

Cuando la primera fecha individual válida entra en uso, la fecha general se limpia. Al desaparecer la última fecha individual no se restaura una fecha vieja.

## 9. Listados V7E9

- Producto sin variaciones: una fila de modalidad general.
- Producto con variaciones: el padre no se lista como unidad; cada variación activa con fecha relevante ocupa su propia fila.
- Variaciones hermanas pueden aparecer simultáneamente en pestañas distintas, por ejemplo una vencida y otra próxima.
- Se ignoran variaciones inactivas, sin fecha, de otro tenant o pertenecientes a un padre cuyo modo está apagado.
- La búsqueda privada coincide por nombre del padre o etiqueta de variación.

## 10. Contadores

Los totales cuentan unidades comerciales reales: un padre general equivale a una unidad y cada variación activa equivale a una unidad. No se agrupan variaciones por padre. Los textos de resumen, listado y paginación hablan de `productos o variaciones`.

## 11. Notificaciones y ciclos

- Se conservan únicamente los umbrales `90/60/30/0`.
- En modo general, la alerta pertenece al producto.
- En modo variaciones, cada variación activa genera como máximo una alerta vigente propia y un ciclo deduplicado.
- Desactivar variaciones elimina su estado activo sin borrar fechas.
- Reactivar evalúa el estado actual, sin revivir notificaciones antiguas.
- Cambiar o borrar una fecha limpia el ciclo/notificación anterior de la unidad.

## 12. Carrito, checkout y órdenes

El carrito vuelve a consultar producto y variación con `no-store`, elimina solo la unidad inválida y limpia de almacenamiento costo, referencia y fecha privados.

Checkout e inventario usan precio, costo, stock, relación, tenant y fecha canónicos del servidor. Se rechazan padre sin variación cuando el modo está encendido, variación cuando está apagado, variación vencida/inactiva/ajena y precios manipulados. La escritura REST directa de `order_items` permanece cerrada y la operación oficial valida todas las líneas antes de reservar inventario.

## 13. Endpoints públicos

El filtro central se aplica a listas, vistas directas y realtime de `products`/`product_variations`, además de promociones dirigidas a producto. El frontend de home, catálogo, categoría, subcategoría, búsqueda, destacados, relacionados, detalle y OG consume únicamente DTO públicos filtrados. Los endpoints OG devuelven fallback seguro y `no-store` cuando el producto no está disponible.

## 14. Cache y sincronización

- Las lecturas públicas de producto/variación y los fallbacks no son cacheables.
- La validación viva del carrito fuerza una consulta nueva y no conserva respuestas canónicas antiguas.
- El almacenamiento del carrito se sanea al cargar y al validar.
- Los cambios de modo, fecha, actividad y stock se reflejan en la siguiente lectura sin depender de datos serializados con fechas privadas.

## 15. Actividad

Se integraron los eventos seguros:

- `product_variations_disabled`;
- `product_variations_enabled`;
- `product_unit_expired`;
- `product_unit_reactivated`.

Solo se generan por mutaciones administrativas exitosas. Los snapshots usan etiquetas y campos seguros; no se crea actividad por consultas públicas.

## 16. Pruebas backend focales

Comando final:

```powershell
cd backend-powerzona
node --check pb_hooks/pz_store_permission_enforcement_lib.js
node --check pb_hooks/pz_order_pricing_lib.js
node --check pb_hooks/pz_product_expiration_lib.js
node --test tests/pz_store_privacy_c3.test.cjs tests/pz_order_pricing.test.cjs tests/pz_product_commerce.test.cjs tests/pz_v7e9_product_expiration.test.cjs
```

Resultado: `80/80` aprobadas, `0` fallas. Incluye F12, privacidad, promoción product-scoped, paginación posterior a 500 variaciones, precio/stock canónicos, tenant, modos, alertas, ciclos, conteos y búsqueda.

## 17. Frontend

Comando focal:

```powershell
cd frontend-powerzona
node --experimental-strip-types --test tests/v7e9ProductExpiration.test.mjs tests/v7e9C3F1Frontend.test.mjs
```

Resultado focal: `28/28` aprobadas. Se cubren switch, confirmación/cancelación, payload `false`, validación del padre, conservación de valores, listado por variación, etiquetas, contadores, búsqueda, fallback, carrito y no exposición de fecha.

## 18. Runtime HTTP real

Comando final:

```powershell
cd backend-powerzona
node --test tests/pz_v7e9_c3_http_runtime.test.cjs
```

Resultado: `1/1` aprobado en `14.928 s`. El runtime levantó PocketBase temporal, ejecutó upgrade/down/up, dos tiendas, usuarios, producto general, variaciones mixtas, lista/detalle públicos, headers `no-store`, V7E9, checkout, modo off/on, aislamiento, actividad, alertas y deduplicación. El `finally` confirmó cleanup antes de cerrar el PocketBase temporal.

## 19. Migraciones

No fue necesaria una migración. El esquema ya contiene `has_variations` y permite conservar registros sin utilizarlos. No se añadió un segundo flag global ni se modificó el historial de migraciones.

## 20. Suites completas

Backend:

```powershell
cd backend-powerzona
node --test
```

Resultado: `553` pruebas, `546` aprobadas, `0` fallas y `7` omitidas por depender de entornos externos no configurados.

Frontend:

```powershell
cd frontend-powerzona
node --experimental-strip-types --test
```

Resultado: `235/235` aprobadas, `0` fallas y `0` omitidas.

La fixture runtime heredada de M7U2 se actualizó para activar explícitamente `has_variations=true`; ya no presupone activación implícita por existencia de registros. El runtime M7U2 pasó dentro de la suite completa.

## 21. Build

Comando real en Windows:

```powershell
cd frontend-powerzona
npm.cmd run build
```

Astro SSR terminó correctamente en `12.90 s`. Se conservaron tres avisos no bloqueantes ya conocidos sobre `getStaticPaths()` ignorado en páginas dinámicas de categoría, subcategoría y producto. La inspección del build encontró `0` source maps públicos.

## 22. Limpieza

- `0` fixtures runtime `V7E9C3F1QA_` después del `finally`.
- `0` procesos temporales de esta tarea.
- Eliminados `backend-powerzona/.tmp`, `frontend-powerzona/dist` y `frontend-powerzona/.astro`.
- `test-results` y `playwright-report` estaban ausentes en raíz, backend y frontend.
- Se preservaron exactamente los procesos oficiales: PocketBase `16780`, Node `37416` y Node `40456`.
- No se tocó `pb_data`, `node_modules`, sesiones oficiales ni bases persistentes.

## 23. Git

- Rama final: `dev`.
- HEAD sin alterar: `693222e3b5640852f3e649d3015e9008360427c4`.
- `git diff --check`: correcto; solo avisos informativos de normalización LF/CRLF.
- Índice/staging: vacío.
- No aparecen `pb_data`, `node_modules`, `dist`, `.astro`, `.tmp`, perfiles, bases temporales, credenciales ni archivos generados.

## 24. No commit, push ni deploy

No se ejecutó `git add`, commit, push, merge, cambio de rama, deploy, staging, Coolify ni Cloudflare. El trabajo queda únicamente en el árbol local de `dev` para revisión.

## 25. Limitaciones

- No se realizaron pruebas visuales manuales ni Playwright, conforme a la regla de QA de este prompt.
- Siete pruebas generales permanecen omitidas porque requieren URLs/credenciales de runtimes externos específicos; el runtime temporal obligatorio de este alcance sí pasó.
- El repaginado público prioriza corrección de totales y disponibilidad y recorre el conjunto candidato; un catálogo extraordinariamente grande puede requerir posteriormente un endpoint materializado o índices/consulta bulk para optimizar costo, sin cambiar el contrato funcional.
- El storefront actual no consume realtime público de productos; la frescura efectiva se garantiza mediante HTTP `no-store`, recarga SSR y revalidación del carrito. Si en el futuro se añade una vista pública suscrita, deberá incorporarse un contrato explícito de invalidación que no revele eventos de unidades nunca públicas.
- Los tres avisos de rutas dinámicas del build son preexistentes y no impiden el artefacto SSR.

## 26. PRUEBAS MANUALES PENDIENTES DE KRAKEN

Quedan pendientes de confirmación manual por Kraken:

1. Padre vencido ausente de home/catálogo/búsqueda y fallback seguro por enlace directo.
2. Familia con una variación vencida, otra próxima y otra sin fecha; selección pública y pestañas V7E9 independientes.
3. Desactivar variaciones, cancelar la confirmación y después confirmar guardando `false` real sin borrar registros.
4. Reactivar variaciones y comprobar que solo regresan unidades válidas y alertas actuales sin duplicados.
5. Carrito y checkout ante unidad que vence o cambia de modo mientras la pestaña permanece abierta.
6. Inspección F12 de productos, variaciones y promociones sin fechas, costos, referencias ni traversal privado.
7. Aislamiento visual y transaccional entre dos tiendas.

EN REVISIÓN — V7E9 PENDIENTE DE PRUEBAS MANUALES Y CONFIRMACIÓN DE KRAKEN
