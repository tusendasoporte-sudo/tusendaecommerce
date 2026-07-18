REPORTE FINAL — PROMPT ID: V7E9-C6

# Filtros en línea y borde crítico hasta 30 días

## Preflight real

- Repositorio: `E:\Trabajo\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt`.
- Rama obligatoria confirmada: `dev`.
- El árbol ya contenía cambios C3–C5 sin commit en la bitácora V7E9, las dos páginas administrativas, la prueba focal, tres reportes y el icono compartido. Se preservaron íntegramente.
- `git diff --stat` inicial de archivos rastreados: 459 inserciones y 35 eliminaciones en 4 archivos.
- Artefactos iniciales: `dist` ausente y `.astro` presente por la terminal oficial.
- Procesos oficiales iniciales: PocketBase PID `5668` desde las 16:03:07 y Node PID `28840`/`29804` desde las 16:03:08. PocketBase escuchaba en `127.0.0.1:8091` y Astro en `[::1]:4321`.

## Causa del salto de línea

C5 había dejado ambos grupos dentro del mismo contenedor flex y con ancho intrínseco, pero la regla de escritorio aún declaraba `flex-wrap: wrap`. Por eso el navegador podía colocar el grupo 30/60/90 debajo incluso antes del breakpoint móvil.

## Archivos modificados por C6

- `frontend-powerzona/src/pages/admin/index.astro`
- `frontend-powerzona/src/pages/admin/expirations.astro`
- `frontend-powerzona/tests/v7e9ProductExpiration.test.mjs`
- `docs/tusenda84/reportes/V7E9-C6-filtros-en-linea-borde-30-dias.md`

No se modificaron backend, endpoints, datos, `pb_data`, búsqueda, paginación, carrito, checkout, alertas, downgrade ni F7P8. La ruta `frontend-powerzona/src/pages/t/[storeSlug]/admin/expirations.astro` permanece intacta y sigue reutilizando `AdminExpirations`; su SHA-256 se mantuvo en `16CC4A0D467D1A14BF3B06B7A3E39E1EF9B5E34B632D795AA305AC15F2DD950B`.

## Estructura final PC y móvil

En PC, `.expiration-summary-filters` conserva un único contenedor con `display: flex`, `align-items: center`, `gap: 10px` y `flex-wrap: nowrap`. Los dos grupos usan `inline-flex`, `width: fit-content` y `flex: 0 0 auto`; no usan `width: 100%`, `flex: 1`, grid expansivo, `<br>` ni scroll horizontal.

La disposición queda:

`[ Próximos | Vencidos ]   [ 30 días | 60 días | 90 días ]`

En el breakpoint móvil de 760 px, el mismo contenedor cambia explícitamente a `flex-wrap: wrap`, manteniendo los grupos compactos. El enlace `Ver todos los vencimientos →` continúa dentro del encabezado, a la derecha del título en PC y con caída natural en móvil.

## Regla exacta del borde rojo

El contrato real del endpoint expone el cómputo como `days_left`. Cada helper de presentación lo evalúa una sola vez y devuelve la clase semántica `is-expiration-critical` cuando:

- `days_left > 0 && days_left <= 30`; o
- `days_left <= 0`, junto con la clase existente de vencido.

La clase aplica un borde fino `#ef4444` alrededor de toda la fila/tarjeta y fondo `#fff7f7`, sin glow. Se usa en Resumen y página independiente, tanto para producto general como para modalidad por variación y en PC/móvil. El badge existente sigue rojo en 1–30 días y vencidos; 31–60 conserva naranja y 61–90 conserva azul. Los vencidos mantienen `Vencido` y la fecha con `Venció`.

La respuesta administrativa ya ordena las variaciones afectadas y publica el vencimiento más cercano como `days_left` de la fila; C6 solo consume ese dato y no altera el backend.

## Venta antes del vencimiento

El borde es exclusivamente visual. Una prueba funcional con 30, 15, 2 y 1 días confirmó que productos generales y variaciones siguen presentes en el catálogo vendible. El bloqueo comercial continúa únicamente desde las 00:00 de la fecha civil de vencimiento en La Habana.

## Pruebas y build

- Focal: `node --test tests/v7e9ProductExpiration.test.mjs` → 19/19 aprobadas.
- Umbrales comprobados en ambos renderizadores y en modalidad general/variación: 90, 60 y 31 sin clase crítica; 30, 15, 2, 1 y 0 con clase crítica; 0 conserva badge `Vencido`.
- Suite frontend completa final: `node --test "tests/*.test.mjs"` → 157/157 aprobadas.
- Build final: `npm.cmd run build` → correcto.
- Astro emitió únicamente los avisos preexistentes de `getStaticPaths()` ignorado en rutas dinámicas de categoría, subcategoría y producto.
- Validación visual autenticada: no disponible porque el navegador integrado no pudo inicializarse antes de abrir una pestaña. No se utilizó una herramienta de navegador alternativa.

## Limpieza y terminales

- `dist`: 0.
- `.astro`: 0.
- Source maps fuera de `node_modules`: 0.
- Archivos `.tmp` fuera de `node_modules`: 0.
- Procesos temporales iniciados por C6: 0.
- Las terminales oficiales quedaron restauradas al estado inicial: mismos PID `5668`, `28840` y `29804`, mismas horas de inicio y listeners `8091`/`4321`.

## Auditoría Git final

- `git diff --check`: correcto; solo aparecen avisos del entorno Windows sobre futura conversión LF/CRLF.
- La rama continúa en `dev`.
- El estado conserva los cambios heredados C3–C5 y agrega únicamente los cambios C6 indicados en este reporte.
- No se ejecutaron `git add`, commit, push, merge, cambio de rama, deploy, Coolify ni Cloudflare.

EN REVISIÓN — pendiente de confirmación explícita de Kraken
