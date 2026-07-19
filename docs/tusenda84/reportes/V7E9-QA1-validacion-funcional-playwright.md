REPORTE FINAL — PROMPT ID: V7E9-QA1

# Validación funcional integral de V7E9 — Vencimiento de productos Premium

- Source revisado: `V108`.
- Fecha de ejecución: `2026-07-18`.
- Ambiente: exclusivamente local.
- Resultado: **QA NO APROBADO — V7E9 REQUIERE CORRECCIONES**.
- V7E9 permanece en revisión; este QA no lo marca como completado y no actualiza la bitácora PDF.

## 1. Permiso usado

Se utilizó el permiso normal **“Preguntar solo para acciones potenciales”** durante toda la sesión. No fue necesario solicitar Full Access. Se usó Playwright estándar desde un script Node efímero; no se usaron `playwright-interactive` ni `js_repl`.

## 2. Preflight

| Comprobación | Resultado |
|---|---|
| `Get-Location` | `E:\Trabajo\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt` |
| `git rev-parse --show-toplevel` | `E:/Trabajo/PROYECTOS/WEb E_Comerce PowerZona_ChatGpt` |
| `git branch --show-current` | `dev` |
| Estado Git inicial | limpio: `git status --short`, `git diff --name-only` y `git diff --stat` sin salida |
| ZIP de revisión | no utilizado ni abierto |
| Source funcional | no modificado |

La configuración activa del frontend fue inspeccionada sin imprimir valores sensibles y apuntaba a PocketBase local. No se detectaron URLs de staging, producción, Coolify, Cloudflare, `tusenda84.com` ni IPs remotas.

## 3. URLs locales

- Frontend: `http://127.0.0.1:4321`.
- PocketBase: `http://127.0.0.1:8091`.
- Health de PocketBase: HTTP 200 antes de crear fixtures.
- Frontend: HTTP 200 antes de iniciar la matriz.

Los puertos estaban libres al comenzar. Todo el tráfico funcional, HTTP y de navegador se limitó a esas dos direcciones loopback.

## 4. Playwright y Chromium

| Elemento | Resultado |
|---|---|
| Node | `v24.16.0` |
| npm | `11.13.0` mediante `npm.cmd` |
| Playwright declarado | `^1.61.1` en los manifiestos |
| Playwright materializado | `1.61.1` |
| Import | `playwright import ok` |
| Smoke Chromium | PASS: abrió `about:blank`, confirmó página activa y cerró página/contexto/browser |
| Navegación QA | Chromium headless, contextos aislados por rol y viewport |

No se ejecutó `npm install` ni se modificaron manifiestos o lockfiles.

## 5. Servidores y procesos

Los servicios no existían antes del QA y se iniciaron solo para esta validación.

| Servicio | PID | Inicio local | Puerto | Comando efectivo | Terminal QA |
|---|---:|---|---:|---|---|
| PocketBase | `28296` | `2026-07-18 19:45:50` | `8091` | `pocketbase.exe serve --http 127.0.0.1:8091`, con hooks/migraciones del repositorio y `pb_data` temporal | sesión `64377` |
| Astro listener | `35744` | `2026-07-18 19:46:06` | `4321` | `npm.cmd run dev -- --host 127.0.0.1 --port 4321` con PocketBase local | sesión `1386` |
| Proceso Node lanzador de Astro | `29368` | `2026-07-18 19:46:05` | — | proceso hijo del comando anterior | sesión `1386` |

No se utilizaron secretos ni datos reales. Las credenciales y secretos temporales se generaron en memoria, no se imprimieron en el informe ni se conservaron.

## 6. Fixtures y método

Prefijo único: `V7E9QA_20260718T194550`.

Se crearon cuatro tiendas temporales (Premium, Básico, Free y segunda Premium), siete usuarios temporales para Master/Admin/Staff/suspendido y planes auxiliares, y productos/variaciones para todas las fechas solicitadas. Las fechas se derivaron dinámicamente de la fecha civil de `America/Havana`.

El arnés usó formularios reales para login, edición de productos/variaciones y cambio de plan; listeners de red para los gates; y solicitudes HTTP directas controladas para F12, aislamiento, permisos y manipulación. El cleanup estuvo dentro de `finally` y terminó en PASS.

## 7. Resumen PASS / FAIL / BLOCKED

El script estándar de Playwright registró **79 verificaciones**:

| Estado | Total |
|---|---:|
| PASS | 72 |
| FAIL | 6 |
| BLOCKED | 1 |

La revisión visual manual añadió un fallo de solapamiento en la página independiente móvil, visible en la evidencia 04. Ese hallazgo no aumenta el contador interno del script porque la medición automática comprobaba ancho y solapamiento con la acción de regreso, pero no con las dos barras fijas.

## 8. Matriz funcional completa

| ID | Estado | Resultado observado |
|---|---|---|
| A1 — producto sin fecha | **FAIL** | Backend puro: sin fecha no crea ciclos/notificaciones y es vendible. UI: al editar descripción sin configurar fecha, el guardado falla con “Escribe una fecha de vencimiento válida” porque envía el campo vacío. |
| A2 — fecha general | PASS | Se guardó con Admin Premium; apareció en Resumen/página independiente, fecha y rango correctos. |
| A3 — primera fecha de variación | PASS | Eliminó la fecha general y dejó una sola fuente individual activa. |
| A4 — borrar todas las fechas de variaciones | **FAIL** | La UI mostró “No se pudo guardar la variación”; permaneció `2026-08-02 00:00:00.000Z` y el campo general siguió deshabilitado. |
| A5 — cambiar fecha | PASS | Eliminó ciclo/alerta anterior, creó solo el umbral 60 vigente y no duplicó notificaciones. |
| B1 — Resumen PC 1440×900 | PASS | Cinco filas, enlace arriba a la derecha, grupos en línea, icono de 24 px, filas compactas y sin scroll horizontal. |
| B2 — Resumen móvil 390/412 | **FAIL** | Sin scroll horizontal y 412 px ajusta correctamente, pero en 390 px se midió un control táctil de solo `22.56 px`; además las barras fijas cubren parcialmente contenido/controles al desplazarse. |
| B3 — paginación del Resumen | PASS | Máximo 5, anterior/siguiente, segunda página con 3 y corrección a página 1 al cambiar filtro. |
| B4 — filtros 30/60/90/Vencidos | PASS | Rangos acumulativos correctos; 31 excluido de 30, 60 incluido en 60/90, 90 solo en 90 y expirados separados. |
| B5 — borde crítico | PASS | Borde rojo completo en 30 o menos y vencidos; 31/60/90 sin borde crítico. Los próximos siguen vendibles. |
| C — página independiente | **FAIL visual** | Ruta, regreso, páginas de 10, búsquedas, vacío, tabs, rangos, badges, edición y PC pasan. En móvil, los pills superiores quedan parcialmente ocultos bajo la cabecera/acción fija; evidencia 04. |
| D1 — una variación vencida | PASS | Vencida deshabilitada; la variación sin fecha y el producto continúan vendibles. |
| D2 — todas vencidas | PASS | Producto no disponible, oculto de listados y URL directa con fallback genérico. |
| D3 — variaciones con misma fecha | PASS | Dos ciclos técnicos, una notificación agrupada y un conteo general. |
| D4 — fechas diferentes | PASS | Ciclos/notificaciones separados sin duplicar el conteo del producto. |
| E1 — productos próximos públicos | PASS | 90/60/31/30/15/7/2/1 aparecen, CTA habilitado, precio operativo y sin revelar fecha; el añadido/revalidación real se cubrió con fixtures representativos en F. |
| E2 — producto vencido en listados | PASS | Ausente de home/destacados, categoría, subcategoría, relacionados y búsqueda pública. |
| E3 — enlace directo vencido | PASS | Fallback seguro, sin fecha/motivo técnico/precio/stock/variaciones/IDs; botón y redirección automática funcionan. |
| F1 — carrito antiguo | PASS | Al vencer el fixture durante la sesión se eliminó/bloqueó, se mostró mensaje genérico y se recalculó el total. |
| F2 — variación vencida en carrito | PASS | Rechazada sin sustituirla silenciosamente; alternativa vendible operativa. |
| F3 — checkout | PASS | No creó orden/order_item, no descontó stock ni abrió WhatsApp; carrito quedó vacío con mensaje funcional. |
| G — defensa backend/F12 | **FAIL** | Vencido, variación vencida, cruce de tienda, store arbitraria y accesos de planes no Premium fueron rechazados. La manipulación de precio fue aceptada y creó 1 `order_item` con `unit_price_usd=0.01` en vez de `10`; solo el nombre fue canonizado. |
| H1 — catch-up | PASS | Generó solo umbral vigente; día 7 reutilizó catch-up de 30 y no creó umbral 7 independiente. |
| H2 — dedupe | PASS | Eliminar la notificación visible y reprocesar la misma combinación no la recreó. |
| H3 — agrupación | PASS | Misma fecha agrupó; fechas diferentes permanecieron separadas. |
| H4 — cambio/borrado | **FAIL** | El cambio pasa, pero borrar la fecha por JSON `null` o multipart vacío devuelve HTTP 400 `invalid_expiration_date`; el ciclo no puede limpiarse por esa ruta. |
| I1 — gate Free/Básico | PASS | “Función Premium”, sin datos reales ni filtros funcionales. |
| I2 — red Free/Básico | PASS | Cero llamadas a `/api/pz/admin/product-expirations`, sin polling ni payload oculto. |
| I3 — solicitud directa/residual | **BLOCKED parcial** | Fecha directa y endpoint Premium rechazados con 403; cero alertas y producto sin fecha vendible. No existe ruta pública segura para sembrar una fecha residual en Free/Básico sin bypass; el comportamiento residual pasó en prueba aislada. |
| J1 — Premium→Básico | PASS | Diálogo irreversible con conteos y confirmación; tras confirmar quedaron 0 fechas generales, 0 fechas de variaciones, 0 notificaciones y 0 ciclos. |
| J2 — Premium→Free | PASS | HTTP 200; plan Free; 0 fechas y 0 alertas. |
| J3 — regreso a Premium | PASS | No restauró fechas, ciclos ni notificaciones antiguas. |
| J4 — cancelar downgrade | PASS | No cambió plan, fechas, notificaciones ni ciclos. |
| K — roles y aislamiento | **FAIL parcial** | Admin Premium, suspendido, segunda tienda, lectura/escritura cruzada, store arbitraria y alcance Master se comportan correctamente. Store Staff activo recibió 404 al intentar guardar una fecha Premium, aunque el contrato aislado afirma que debe conservar ese permiso. |
| L — fecha límite/Havana | PASS | Pruebas con reloj inyectado: `03:59:59.999Z` sigue vendible y `04:00:00.000Z` queda vencido para medianoche civil Habana; sin cambiar el reloj de Windows. |

## 9. Evidencia visual

| Archivo | Cobertura |
|---|---|
| [01-resumen-premium-pc.png](evidencias/V7E9-QA1/01-resumen-premium-pc.png) | Resumen Premium 1440×900 |
| [02-resumen-premium-movil.png](evidencias/V7E9-QA1/02-resumen-premium-movil.png) | Resumen 390×844; evidencia de barra inferior sobre contenido |
| [03-pagina-vencimientos-pc.png](evidencias/V7E9-QA1/03-pagina-vencimientos-pc.png) | Página independiente PC |
| [04-pagina-vencimientos-movil.png](evidencias/V7E9-QA1/04-pagina-vencimientos-movil.png) | Página independiente móvil; filtros superiores parcialmente ocultos |
| [05-borde-30-dias.png](evidencias/V7E9-QA1/05-borde-30-dias.png) | Bordes críticos completos en 30 días o menos |
| [06-producto-vencido-fallback.png](evidencias/V7E9-QA1/06-producto-vencido-fallback.png) | Fallback público genérico y seguro |
| [07-free-gate.png](evidencias/V7E9-QA1/07-free-gate.png) | Gate Free sin datos Premium |
| [08-basico-gate.png](evidencias/V7E9-QA1/08-basico-gate.png) | Gate Básico sin datos Premium |
| [09-downgrade-confirmacion.png](evidencias/V7E9-QA1/09-downgrade-confirmacion.png) | Confirmación y conteos de limpieza irreversible |
| [10-carrito-rechazo-vencido.png](evidencias/V7E9-QA1/10-carrito-rechazo-vencido.png) | Revalidación viva y checkout sin ítems |

Observación visual secundaria: con el nombre largo y artificial del fixture, el nombre de tienda se solapa con la siguiente columna del footer en la evidencia 06. No afecta la seguridad del fallback, pero conviene endurecer el wrap para nombres reales largos.

## 10. Pruebas HTTP / F12

| Intento | Resultado |
|---|---|
| Producto vencido | PASS: HTTP 400, 0 order_items y respuesta genérica sin ID del producto |
| Variación vencida | PASS: HTTP 400 y 0 creación parcial |
| Producto de otra tienda | PASS: HTTP 400 y 0 creación parcial |
| Precio/nombre manipulados | **FAIL**: petición aceptada; nombre canonizado pero precio `0.01` conservado frente a precio real `10` |
| Admin A modifica producto B | PASS: HTTP 404 |
| Endpoint con `store_id` arbitraria | PASS: HTTP 400 |
| Master usa endpoint de tienda | PASS: HTTP 403 |
| Free/Básico guardan fecha | PASS: HTTP 403 |
| Free/Básico consultan endpoint Premium | PASS: HTTP 403 |
| Store Staff Premium guarda fecha | **FAIL**: HTTP 404 |
| Usuario suspendido | PASS: autenticación rechazada con HTTP 400 |

## 11. Planes y downgrade

El diálogo real mostró 13 fechas generales, 11 fechas de variación, 17 notificaciones y 16 ciclos pendientes de eliminación, con checkbox de confirmación y botones visibles. Cancelar preservó el estado. Premium→Básico eliminó todo en una operación; el regreso a Premium no restauró datos; Premium→Free repitió la limpieza con HTTP 200. No hubo limpieza antes de la confirmación.

## 12. Roles y aislamiento

- Store Admin Premium: autenticación, lectura y escritura propias PASS.
- Store Staff activo: autenticación PASS, escritura de fecha **FAIL 404**.
- Suspendido: backend y UI rechazaron acceso.
- Segunda tienda Premium: lectura propia PASS; tienda A no leyó ni modificó tienda B.
- Master: gestionó planes, pero no amplió el alcance del endpoint privado de tienda.
- Gates Free/Básico: sin solicitud de red ni exposición indirecta de datos Premium.

## 13. Zona horaria

Las suites focales usan reloj controlado y `America/Havana`. Para la fecha `2026-08-20` verificaron:

- `2026-08-20T03:59:59.999Z`: 1 día restante, no vencido.
- `2026-08-20T04:00:00.000Z`: 0 días, vencido.

También validaron fechas civiles inequívocas y evitaron depender del timezone del navegador o introducir desplazamientos UTC de un día.

## 14. Suites automatizadas

| Comando | Total | PASS | FAIL | Omitidas | Resultado |
|---|---:|---:|---:|---:|---|
| `frontend-powerzona: node --test tests/v7e9ProductExpiration.test.mjs` | 19 | 19 | 0 | 0 | PASS |
| `backend-powerzona: node --test tests/pz_v7e9_product_expiration.test.cjs tests/pz_store_plan_management.test.cjs` | 30 | 30 | 0 | 0 | PASS |
| `frontend-powerzona: node --test "tests/*.test.mjs"` | 157 | 157 | 0 | 0 | PASS |
| `backend-powerzona: node --test "tests/*.test.cjs"` | 379 | 374 | 0 | 5 | PASS con omisiones declaradas |

Las cinco omisiones backend son pruebas HTTP runtime de otros módulos (`F7P8`, eliminación U7I7, dispositivos D7A6, temporales U7I7 y PZPW01). Sus archivos requieren variables de URL/credenciales runtime específicas que no estaban definidas. No corresponden a la matriz V7E9 ejecutada por este arnés y no se suministraron credenciales artificiales fuera del alcance.

Existe una brecha entre tests aislados y runtime real: las suites afirman que borrar fecha y el guardado Staff funcionan, pero PocketBase real los rechazó; la prueba aislada de orden tampoco detectó la conservación del precio manipulado.

## 15. Build

`frontend-powerzona: npm.cmd run build` terminó con código 0 en 12.57 s.

Astro emitió tres warnings no bloqueantes: `getStaticPaths()` ignorado en páginas dinámicas legacy de producto, categoría y subcategoría. No hubo errores de compilación. `dist` y `.astro` se eliminaron después de validar.

## 16. Limpieza final

Cleanup runtime: **PASS**.

| Verificación | Resultado final |
|---|---|
| Tiendas, usuarios, productos, variaciones, pedidos y order_items `V7E9QA_` | 0 |
| Notificaciones y ciclos `V7E9QA_` | 0 |
| Settings, categorías, subcategorías y monedas temporales | 0 |
| `.tmp/v7e9-qa`, script y resultados privados | eliminados |
| `dist`, `.astro`, `playwright-report`, `test-results` | 0 |
| Perfiles/traces/videos/storage state temporales | 0 |
| Chromium iniciado por QA | 0 procesos |
| Node iniciado por QA | 0 procesos |
| PIDs `28296`, `35744`, `29368` | cerrados |
| Listeners en 4321/8091 | 0 |

El `pb_data` completo era temporal y fue eliminado después de detener PocketBase, por lo que la cuenta superuser local efímera y sus sesiones también desaparecieron. Solo permanecen este reporte y las diez evidencias aprobadas.

## 17. Git final

- `git diff --check`: PASS, sin salida.
- `git diff --name-only`: sin cambios rastreados.
- `git diff --stat`: sin cambios rastreados.
- `git status --short --untracked-files=all`: únicamente este reporte y los diez PNG de `docs/tusenda84/reportes/evidencias/V7E9-QA1/`.
- No hay cambios en frontend/backend funcional, migraciones, `package.json`, `package-lock.json`, `pb_data`, configuración o dependencias rastreadas.

## 18. Errores priorizados y recomendación

1. **P0 — Integridad de precio en backend:** una creación directa de `order_items` aceptó `unit_price_usd=0.01` para un producto con precio real `10`. El nombre sí fue canonizado, el precio no. Debe rechazarse o canonizarse íntegramente en servidor y cubrirse con una prueba HTTP runtime.
2. **P1 — Contrato de fecha vacía roto:** PocketBase devuelve 400 `invalid_expiration_date` al recibir `null` o multipart vacío. Esto impide guardar una edición normal de producto sin fecha, borrar la última fecha individual y limpiar el ciclo/notificación por la ruta de edición.
3. **P1 — Store Staff autorizado no puede guardar:** el Staff activo Premium recibe 404 al actualizar `expiration_date`; revisar reglas reales de colección/hook frente al contrato aislado.
4. **P2 — Responsive móvil:** controles de 22.56 px y filtros/acciones parcialmente cubiertos por las barras fijas en 390/412; ajustar offsets, padding inferior y tamaño táctil.
5. **P3 — Footer con nombre largo:** el fixture largo se solapa con otra columna en el fallback; endurecer wrap/min-width.
6. **Cobertura pendiente:** agregar casos HTTP runtime para borrar fechas, Staff, precio manipulado y fecha residual Free/Básico. El último caso quedó BLOCKED sin una vía pública segura, aunque el helper aislado pasa.

Recomendación: corregir P0/P1/P2, añadir las regresiones runtime y repetir V7E9-QA1 completo. No solicitar cierre ni confirmación final de Kraken mientras estos fallos permanezcan.

**QA NO APROBADO — V7E9 REQUIERE CORRECCIONES**
