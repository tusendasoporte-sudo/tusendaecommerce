REPORTE FINAL — PROMPT ID: V7E9-C3

# 1. Preflight

- Repositorio verificado: `E:\Trabajo\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt`.
- `git rev-parse --show-toplevel` coincidió con el repositorio requerido.
- Rama verificada: `dev`.
- Estado inicial: árbol de trabajo limpio; no había cambios heredados que integrar.
- Se ejecutaron antes de modificar: `Get-Location`, `git rev-parse --show-toplevel`, `git branch --show-current`, `git status --short`, `git diff --name-only` y `git diff --stat`.
- No se importó, descomprimió ni utilizó ningún ZIP como source. La continuidad documental usada fue V114.
- No se ejecutó Git destructivo ni se cambió de rama.

# 2. Cierre documental de M7U2

Antes de iniciar las correcciones V7E9 se registró:

```text
M7U2 — Mi equipo y permisos granulares
COMPLETADO
Confirmado expresamente por Kraken
Fecha: 20 de julio de 2026
Source de cierre: V114
```

El cierre incluye M7U2-C1, M7U2-C2, M7U2-C2F1 y M7U2-C3 como `COMPLETADO`. Se actualizaron el reporte oficial de M7U2, el cierre confirmado de M7U2-C3 y el mapa maestro de `docs/tusenda84/`. Los conteos históricos de M7U2-C3 se preservaron y no se modificó la bitácora PDF.

# 3. Hallazgos reales

1. `null`, string vacío, espacios y multipart vacío se normalizaban en la librería, pero el valor vacío no se escribía explícitamente en el record de PocketBase; el validador del campo podía devolver `400 invalid_expiration_date`.
2. La autorización V7E9 tenía filtros previos por `store_admin`/`store_staff` que impedían que el helper granular M7U2 fuera la única autoridad.
3. La ruta independiente podía habilitar requests solo por capacidad del plan, sin exigir primero `catalog.expirations.manage`.
4. Había controles de 38/40 px, padding móvil sin safe area y wrapping insuficiente en acciones/filtros.
5. El footer público no cerraba todos sus contenedores y textos largos con `min-width: 0` y wrap explícito.
6. El runtime descubrió que `product_expiration_cycles.threshold` era numérico y requerido: PocketBase considera `0` vacío para esa validación, lo que impedía persistir el ciclo oficial de 0 días.
7. Un runtime M7U2 heredado sembraba fechas mediante Master/superusuario; se actualizó para usar un administrador principal real después de cerrar ese bypass.
8. PZ-ORD-PRICE01 ya resolvía precio y nombre canónicos. Se conservó esa arquitectura y solo se validó como regresión.

# 4. Archivos modificados

Backend:

- `backend-powerzona/pb_hooks/pz_product_expiration_lib.js`.
- `backend-powerzona/pb_migrations/1784596000_v7e9_c3_zero_day_threshold.js`.
- `backend-powerzona/tests/pz_v7e9_product_expiration.test.cjs`.
- `backend-powerzona/tests/pz_v7e9_c3_http_runtime.test.cjs`.
- `backend-powerzona/tests/pz_m7u2_c3_http_runtime.test.cjs`.

Frontend:

- `frontend-powerzona/src/pages/admin/expirations.astro`.
- `frontend-powerzona/src/pages/admin/index.astro`.
- `frontend-powerzona/src/components/PublicFooter.astro`.
- `frontend-powerzona/tests/v7e9ProductExpiration.test.mjs`.
- `frontend-powerzona/tests/m7u2C3FrontendPermissions.test.mjs`.

Documentación:

- `docs/tusenda84/Master_document_powerzona_v27_visual_ux_admin_arreglos_funcionales_2026_06_18.md`.
- `docs/tusenda84/reportes/M7U2-mi-equipo-permisos-granulares.md`.
- `docs/tusenda84/reportes/M7U2-C3-correccion-permisos-qa-final.md`.
- Este reporte.

# 5. Borrado de fecha general

La operación oficial ahora convierte `null`, `""`, espacios y multipart vacío en `expiration_date` vacío mediante `record.set`. La normalización ocurre después de autorización y antes del guardado. Una fecha no vacía fuera del contrato civil se rechaza sin mutar el record.

Al cambiar o borrar se retiran dentro de la transacción los ciclos de la entidad y las notificaciones V7E9 que ya no tienen ciclos asociados. El borrado no ejecuta el generador de alertas y no modifica stock, precio, imágenes, promociones ni otros campos.

# 6. Borrado de variaciones

Se aplicó el mismo contrato a `product_variations.expiration_date`. La primera fecha individual continúa limpiando la fecha general incompatible y deja actividad central. Al borrar la última fecha individual:

- se eliminan sus ciclos y alertas;
- la fecha general permanece vacía;
- no se restaura ninguna fecha anterior;
- no se crea una alerta nueva;
- las reglas de disponibilidad de las demás variaciones permanecen intactas.

# 7. Limpieza de ciclos y notificaciones

La limpieza utilizada desde una escritura HTTP es estricta: un fallo de delete/save se propaga y revierte la operación transaccional. Al cambiar fecha se limpia el estado anterior antes de calcular únicamente el umbral nuevo. Al borrar fecha no se procesa la tienda completa, evitando crear avisos para entidades no relacionadas.

Las notificaciones no V7E9 se conservan. El runtime confirmó `0` ciclos y `0` alertas V7E9 después de borrar y después del downgrade confirmado.

# 8. Permisos M7U2

La autorización reutiliza `teamPermissions.hasStorePermission(..., "catalog.expirations.manage")` y exige actor autenticado, activo, de la tienda, no Master, capacidad Premium y permiso granular. El administrador principal conserva el permiso implícito M7U2.

Se validó:

- principal Premium: consulta, guarda y borra;
- adicional con `catalog.expirations.manage`: consulta, guarda y borra producto/variación;
- adicional sin permiso: `403 permission_denied`;
- Basic/Free: `403` por capacidad;
- otra tienda: `404` seguro;
- Master: `403` en la superficie privada Store;
- la ruta frontend directa sin permiso muestra rechazo amigable y el script no hace requests V7E9.

# 9. Alertas

Se preservó exactamente `90/60/30/0`; no existe umbral 7. La deduplicación sigue ligada a tienda, entidad, fecha, umbral y clave de ciclo. Las prioridades vigentes son normal para 90/60, importante para 30 y crítica para 0/vencido.

La nueva migración permite almacenar el valor numérico `0` sin abrir la colección a escritura externa: `product_expiration_cycles` continúa privada y el motor siempre escribe un umbral validado.

# 10. Responsive estructural

Se añadieron o ajustaron:

- safe area y padding inferior para la barra móvil;
- wrap de filtros 1/2/3 meses;
- áreas táctiles de 44 px en filtros, búsqueda, edición y paginación;
- `min-width: 0`, `max-width: 100%` y protección contra overflow horizontal;
- wrap del CTA `Ver todos los vencimientos →`;
- protección de tarjetas y textos largos;
- borde crítico existente para 30 días o menos sin cambiar el icono global ni la bottom bar.

Las referencias 390 × 844 y 412 × 915 se cubrieron mediante contratos CSS automatizados. No se afirma aprobación visual.

# 11. Footer largo

El footer público ahora permite wrap del nombre, encabezados y enlaces; sus columnas y contenedores principales usan `min-width: 0`/`max-width: 100%`, y el contenedor evita overflow horizontal. Se mantuvo el branding y el fallback genérico `Producto no disponible`, sin fecha ni motivo de vencimiento.

# 12. Comercio

Las pruebas unitarias cubren catálogo, búsqueda/filtrado compartido, taxonomía, relacionados, carrito/validación viva, producto general y variaciones. El runtime HTTP confirmó:

- producto vencido: checkout `422 order_unavailable` genérico;
- variación vencida: checkout rechazado;
- variación sin fecha válida: checkout permitido;
- producto con otra variación vendible: disponible;
- respuesta sin fecha, ID privado ni motivo de vencimiento;
- `order_item` REST directo manipulado: rechazado;
- con capacidad Basic inactiva, una fecha residual no bloquea comercio; tras el downgrade las fechas se limpian y el producto vuelve a venderse.

# 13. Downgrade

Premium → Basic sin confirmación devolvió `409` y preservó fechas, ciclos y alertas. Con confirmación:

- se limpiaron fechas generales e individuales;
- se eliminaron ciclos y alertas V7E9;
- se conservaron productos, variaciones, stock, precios, pedidos, otras notificaciones y actividad M7U2;
- la respuesta incluyó el resumen de limpieza;
- el upgrade posterior a Premium no restauró fechas, ciclos ni alertas.

La limpieza y la auditoría permanecen dentro de la transacción oficial de cambio de plan.

# 14. Timezone

La fecha comercial sigue calculándose con clave civil `America/Havana`, sin depender del navegador. Con reloj controlado se validó:

- un milisegundo antes de 00:00 Habana: disponible;
- 00:00 exacto del día indicado: vencido;
- calendario, fin de mes y horario de verano sin desplazamiento UTC de un día.

# 15. Precio canónico

No se reimplementó PZ-ORD-PRICE01. En PocketBase real se envió checkout con `unit_price_usd: 0.01` y nombre manipulado para un producto de USD 17. La respuesta y el `order_item` persistido usaron nombre y precio canónicos. La creación REST directa fue rechazada y la consulta final confirmó:

```text
0 order_items con precio o nombre manipulado
```

# 16. Pruebas backend

Comando focal final:

```text
node --test tests/pz_v7e9_product_expiration.test.cjs tests/pz_store_plan_management.test.cjs tests/pz_v7e9_c3_http_runtime.test.cjs
```

Resultado: 33 totales, 33 aprobadas, 0 fallidas, 0 omitidas.

Incluye normalización, fecha inválida, 90/60/30/0, ausencia de 7, timezone Habana, producto/variaciones, permisos, aislamiento, alertas, downgrade, actividad, comercio y precio canónico.

# 17. Pruebas frontend

Focal V7E9:

```text
node --test tests/v7e9ProductExpiration.test.mjs
```

Resultado: 20 totales, 20 aprobadas, 0 fallidas, 0 omitidas.

Se cubrieron payload vacío, gates, no-request sin permiso, planes, filtros, paginación, responsive, footer, fallback seguro, umbrales, borde e icono compartido.

# 18. Runtime HTTP

Se creó `backend-powerzona/tests/pz_v7e9_c3_http_runtime.test.cjs`, autocontenido, con PocketBase temporal, base vacía, secretos aleatorios locales y prefijo `V7E9C3QA_<timestamp>`.

Resultado final: 1 total, 1 aprobada, 0 fallidas, 0 omitidas. Validó los 17 puntos solicitados: principal, null, multipart, adicional con/sin permiso, Free/Basic y endpoint, cambio/borrado de ciclos, producto/variación vencidos, aislamiento, precio, cancelación/downgrade/upgrade y actor M7U2 correcto.

El test detiene PocketBase y elimina la base temporal en `finally`, incluso ante fallo.

# 19. Migraciones

Fue necesaria una migración append-only posterior a la última existente:

```text
1784596000_v7e9_c3_zero_day_threshold.js
```

Motivo: permitir el umbral oficial numérico `0`, que PocketBase rechaza como blank cuando un number es `required`. La migración solo cambia `required` en el campo privado `product_expiration_cycles.threshold`.

Se probó:

- base vacía con todas las migraciones;
- `migrate down 1`;
- `migrate up` posterior;
- esquema final `required: false`;
- persistencia HTTP real del ciclo 0;
- ejecución idempotente dentro de las suites existentes.

No se editó ninguna migración aplicada.

# 20. Suites completas

Backend completo (`node --test`):

- 532 totales;
- 525 aprobadas;
- 0 fallidas;
- 7 omitidas.

Las siete omisiones corresponden a runtimes externos opcionales sin URL/credenciales locales o marcados `SKIP`: F7P8 HTTP externo, M7U2 HTTP externo, PZ-ORD-PRICE01 HTTP externo, U7I7F1D8, dos runtimes U7I7 PocketBase y PZPW01. Los runtimes autocontenidos M7U2-C2, M7U2-C3 y V7E9-C3 sí se ejecutaron y aprobaron.

Frontend completo (`node --test`):

- 227 totales;
- 227 aprobadas;
- 0 fallidas;
- 0 omitidas.

# 21. Build

`npm.cmd run build` ejecutó `astro build` y terminó con código 0. El servidor se construyó correctamente. Astro emitió tres warnings ya existentes porque `getStaticPaths()` se ignora en páginas dinámicas de categoría, subcategoría y producto; no bloquean el build ni pertenecen al alcance V7E9-C3.

El intento inicial mediante `npm run build` no ejecutó el build porque la política local de PowerShell bloquea `npm.ps1`; se usó el wrapper oficial `npm.cmd` sin cambiar políticas del sistema.

# 22. Seguridad/F12

- Autorización backend, no solo UI.
- Payload de endpoint privado cerrado y sin `store_id` arbitrario.
- Aislamiento de tenant y Master verificados por HTTP.
- Fechas DateTime arbitrarias rechazadas; fechas civiles y frontera Habana cubiertas.
- Precio/nombre manipulados no persistieron.
- Fallback público genérico sin fecha o causa.
- Actividad privada registra actor y no expone credenciales.
- Escaneo del alcance cambiado sin `TODO`, `FIXME`, `debugger`, logs de desarrollo ni sourcemaps públicos.
- No se añadieron credenciales, tokens o secretos persistentes; el runtime genera valores aleatorios efímeros.
- No se usó Playwright ni se generaron capturas/perfiles.

# 23. Limpieza

Resultado final comprobado:

```text
0 fixtures V7E9C3QA_
0 procesos temporales PocketBase/Node
0 bases temporales V7E9-C3
```

Se eliminaron `backend-powerzona/.tmp`, `frontend-powerzona/dist` y `frontend-powerzona/.astro`. `test-results` y `playwright-report` no existían. Los procesos PocketBase creados por los runtimes fueron detenidos por referencia directa al proceso hijo; la consulta final no encontró procesos `pocketbase` o `node`. No se inició Astro dev, navegador ni watcher.

# 24. Git final

Se ejecutaron `git diff --check`, `git status --short`, `git diff --name-only` y `git diff --stat`. `git diff --check` terminó sin errores. El estado final contiene 11 archivos tracked modificados y 3 archivos nuevos sin staging: la migración, el runtime V7E9-C3 y este reporte. El estado Git no incluye `pb_data`, `node_modules`, `dist`, `.astro`, `.tmp`, perfiles, bases o resultados generados.

# 25. Sin commit, push o deploy

No se ejecutaron `git add`, commit, push, merge, cambio de rama o deploy. No se modificó staging, Coolify, Cloudflare ni Repartos84.

# 26. Limitaciones honestas

- No se ejecutó matriz visual ni Playwright, de acuerdo con la regla de QA del prompt.
- No se afirma validación visual de PC/móvil ni aprobación de diseño.
- Los siete runtimes externos opcionales de la suite backend permanecieron omitidos por no disponer de su configuración externa; el runtime V7E9-C3 equivalente requerido fue autocontenido, real y aprobó.
- Los warnings dinámicos de Astro indicados en Build permanecen fuera del alcance.

# 27. PRUEBAS MANUALES PENDIENTES DE KRAKEN

- Apariencia final en PC y en 390 × 844 / 412 × 915.
- Visibilidad, wrap y acceso táctil de filtros, acciones y paginación junto a header/bottom bar.
- CTA `Ver todos los vencimientos →`, borde crítico e icono compartido.
- Ruta directa sin permiso y experiencia del adicional autorizado.
- Footer público con nombre real largo y fallback `Producto no disponible`.
- Flujo humano de confirmación/cancelación de downgrade y revisión del texto irreversible.
- Recorrido final de catálogo, carrito y checkout desde la interfaz pública.

EN REVISIÓN — V7E9 PENDIENTE DE PRUEBAS MANUALES Y CONFIRMACIÓN DE KRAKEN
