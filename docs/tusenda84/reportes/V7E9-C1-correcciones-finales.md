REPORTE FINAL — PROMPT ID: V7E9-C1

Fecha técnica: 18 de julio de 2026.

Estado: **EN REVISIÓN — pendiente de confirmación explícita de Kraken**

## 1. Preflight real

- Repositorio: `C:\Users\workd\Desktop\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt`.
- Rama comprobada antes de modificar: `dev`.
- `HEAD` inicial y final: `c947e1a38170154b14be1f1ba21e787e04f45c1e`.
- El ZIP V105 no se abrió, importó, descomprimió ni copió sobre el repositorio.
- El árbol contenía el trabajo no confirmado de V7E9 y se preservó íntegramente.
- `git diff --stat` inicial sobre archivos rastreados: 15 archivos, 553 inserciones y 413 eliminaciones. Además existían los archivos nuevos V7E9 aún no rastreados.
- `git diff --check` inicial: exit 0; solo avisos informativos LF→CRLF de Git en Windows.

`git status --short` inicial conservado:

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

No se ejecutó ninguna operación destructiva de Git.

## 2. Causas reales confirmadas

1. El Resumen combinaba vista previa y administración completa: la tarjeta solo usaba `#productos-proximos-vencer`, el bloque inferior paginaba allí mismo y no existía una ruta independiente.
2. `MasterDialog` usaba `display: grid` sin filas acotadas. Al crecer el aviso irreversible, el cuerpo podía empujar el footer fuera del área visible.
3. `authCanManageStore` aceptaba exclusivamente `store_admin`; por eso el hook V7E9 podía rechazar a un `store_staff` que ya hubiera superado la autorización normal de Productos.
4. El umbral de 30 días usa correctamente `priority: important`, pero la UI pintaba todas las prioridades únicamente por su valor general y no reconocía el tipo V7E9 crítico de 30 días.
5. `tests/v7e9ProductExpiration.test.mjs` importaba `productExpiration.ts` directamente y dependía del soporte no portable de TypeScript del ejecutable Node.

## 3. Página independiente y Resumen

Rutas finales estables:

- `/admin/expirations`;
- `/t/[storeSlug]/admin/expirations` mediante el wrapper compartido solicitado.

No se añadió una opción fija de Vencimientos al sidebar.

La página:

- usa el Admin real, sidebar y barras móviles existentes;
- aplica el gate SSR de `product_expiration_tools_enabled` antes de renderizar cualquier listado;
- en Free/Básico no ejecuta el endpoint ni calcula fechas;
- reutiliza exclusivamente `POST /api/pz/admin/product-expirations` con `{ view, window_days, page }`;
- valida `view`, rango, página, producto y variación mediante allowlists o IDs de 15 caracteres;
- ofrece `Vencidos`, `Próximos a vencer`, 1/2/3 meses, 10 productos por página, variantes afectadas y `Editar producto`;
- no carga imágenes, no usa un retorno arbitrario y fija headers `private, no-store`, `noindex` y `no-referrer` en las superficies privadas correspondientes;
- usa filas horizontales en PC y tarjetas compactas en móvil, con `overflow-x: hidden`.

El Resumen Premium ahora:

- muestra los conteos de vencidos y próximos a 30 días en la tarjeta **Por vencer**;
- usa la acción exacta `Ver vencidos` hacia `?view=expired`, sin ancla;
- carga la vista previa solo al aproximarse al viewport;
- muestra como máximo cinco productos, sin imágenes ni paginación;
- mantiene Próximos/Vencidos y 30/60/90;
- muestra nombre, modalidad general/variaciones, fecha, estado y `Ver`;
- conserva producto, variación, vista y rango mediante parámetros cerrados;
- agrega `Ver todos los vencimientos`.

## 4. Diálogo Master

`master-ui.css` define ahora `grid-template-rows: auto minmax(0, 1fr) auto`. Solo `.master-dialog__body` desplaza verticalmente; header y footer permanecen dentro del alto dinámico visible.

También se incorporaron:

- límites con `100dvh` para teclado/viewport móvil;
- padding inferior con `env(safe-area-inset-bottom)`;
- bloqueo de scroll horizontal;
- acciones flexibles en móvil estrecho;
- guard explícito contra doble clic;
- reactivación del botón en respuestas de error, conservando el comportamiento existente;
- conservación de plan, vigencia, 1/12 meses, motivo y checkbox durante el scroll.

La confirmación irreversible sigue siendo obligatoria. Los tests backend existentes validan duraciones 1–12, payload cerrado, confirmación, conteos y limpieza transaccional tanto con cero como con múltiples datos.

## 5. Store Staff y seguridad

El hook de fechas admite ahora `store_admin` y `store_staff` de la misma tienda siempre que no estén suspendidos. Esto no modifica las reglas generales de las colecciones ni concede funciones Master: el hook deja de ser un bloqueo adicional después de la autorización arquitectónica normal.

Las pruebas cubren:

- producto Premium sin cambiar fecha;
- producto Premium cambiando fecha;
- variación Premium;
- Store Staff activo;
- Store Staff suspendido;
- Store Staff de otra tienda;
- rol no autorizado;
- payload directo y cruce de tienda.

El endpoint privado aplica el mismo control de usuario activo/misma tienda, valida un payload exacto, deriva tienda y plan del usuario autenticado y conserva aislamiento y `Cache-Control: private, no-store`.

## 6. Alerta roja de 30 días

La prioridad backend de 30 días permanece semánticamente `important`. La UI usa una señal cerrada por tipo para presentar como roja:

- `product_expiring_critical`;
- `variation_expiring_critical`;
- `product_expired`;
- `variation_expired`.

La señal llega a campana, contador, panel, página completa y toast interno. La notificación visual del navegador usa un título genérico de alerta y un cuerpo sin fechas ni datos sensibles. Otras notificaciones `important`, como pedidos, conservan su color previo; no se hizo un cambio global.

Se conserva la semántica 90 normal, 60 normal, 30 alta/roja y 0 vencida/crítica/roja.

## 7. Prueba frontend portable

Se creó `frontend-powerzona/src/lib/productExpirationCore.js` como núcleo JavaScript puro. `productExpiration.ts` permanece como adaptador productivo que obtiene la capacidad desde la matriz central; no se duplicaron planes ni permisos.

Comando exacto ejecutado, sin loaders, transpilers ni flags experimentales:

```text
cd frontend-powerzona
node --test tests/v7e9ProductExpiration.test.mjs
```

Resultado final: 12 tests, 12 aprobados, 0 fallos.

## 8. Validaciones ejecutadas

### Focales

- Frontend: `node --test tests/v7e9ProductExpiration.test.mjs` → 12/12, 0 fallos.
- Backend: `node --test tests/pz_v7e9_product_expiration.test.cjs tests/pz_store_plan_management.test.cjs` → 29/29, 0 fallos.

### Regresión completa

- Frontend: `node --test tests/*.test.mjs` → 150/150, 0 omitidos, 0 fallos.
- Backend: `node --test tests/*.test.cjs` → 378 totales, 373 aprobados, 5 omitidos por requerir runtimes externos no provistos, 0 fallos.

### Build

- `npm run build` fue bloqueado inicialmente por la política de scripts de PowerShell.
- `npm.cmd run build` dentro del sandbox fue bloqueado al intentar leer dependencias ya instaladas fuera de su alcance permitido.
- El mismo `npm.cmd run build`, ejecutado con la autorización de acceso solicitada, terminó correctamente con Astro SSR y adapter Node. Solo aparecieron tres warnings preexistentes sobre `getStaticPaths()` ignorado en rutas dinámicas.

No se añadieron dependencias.

## 9. Validación PC/móvil

La validación real en navegador integrado **no pudo ejecutarse**. Se cargó la habilidad oficial y se intentó conectar dos veces, pero el conector falló antes de abrir una sesión por metadata de sandbox incompleta. No se usó un navegador alternativo ni se inventó evidencia.

Sí quedaron verificados mediante build y tests de contrato:

- estructura Admin/sidebar móvil;
- breakpoints PC/móvil;
- filas PC y tarjetas móvil;
- ausencia de imágenes;
- ausencia de paginación en el Resumen;
- límite de cinco en el Resumen y diez en página;
- `overflow-x: hidden`;
- footer Master acotado, cuerpo desplazable y safe area.

Quedan pendientes para Kraken la inspección visual real en PC, móvil estrecho, teclado abierto, zoom razonable y el flujo conectado a una sesión/datos reales.

## 10. Archivos C1

### Creados

- `docs/tusenda84/reportes/V7E9-C1-correcciones-finales.md`.
- `frontend-powerzona/src/lib/productExpirationCore.js`.
- `frontend-powerzona/src/pages/admin/expirations.astro`.
- `frontend-powerzona/src/pages/t/[storeSlug]/admin/expirations.astro`.

### Modificados por C1 sobre el árbol V7E9

- `backend-powerzona/pb_hooks/pz_product_expiration_lib.js`.
- `backend-powerzona/tests/pz_v7e9_product_expiration.test.cjs`.
- `docs/tusenda84/reportes/V7E9-vencimiento-productos-premium.md`.
- `frontend-powerzona/src/components/admin/AdminSidebar.astro`.
- `frontend-powerzona/src/components/master/MasterStorePlanView.astro`.
- `frontend-powerzona/src/lib/adminNotifications.js`.
- `frontend-powerzona/src/lib/productExpiration.ts`.
- `frontend-powerzona/src/pages/admin/index.astro`.
- `frontend-powerzona/src/pages/admin/notifications.astro`.
- `frontend-powerzona/src/styles/master-ui.css`.
- `frontend-powerzona/tests/v7e9ProductExpiration.test.mjs`.

## 11. Limpieza final

El build generó `frontend-powerzona/dist` y `frontend-powerzona/.astro`; se verificaron como rutas absolutas dentro del workspace y se eliminaron después de validar.

- 0 fixtures temporales C1.
- 0 tiendas temporales C1.
- 0 usuarios temporales C1.
- 0 productos temporales C1.
- 0 variaciones temporales C1.
- 0 órdenes temporales C1.
- 0 notificaciones temporales C1.
- 0 ciclos temporales C1.
- 0 fechas temporales C1.
- 0 archivos temporales C1.
- 0 bases temporales C1.
- 0 procesos Node, Astro o PocketBase iniciados por C1 en ejecución.
- 0 watchers o servidores iniciados por C1.
- terminales oficiales no modificadas.

El `backend-powerzona/pb_data` real ya existía antes de C1 y no se creó, modificó ni eliminó durante esta corrección. No aparece en `git status`; no se dejó ningún `pb_data` generado por la tarea.

## 12. Git y despliegue

- `git diff --check`: exit 0, sin errores; únicamente avisos informativos LF→CRLF.
- Rama final: `dev`.
- `HEAD` sin cambios: `c947e1a38170154b14be1f1ba21e787e04f45c1e`.
- El estado final conserva el trabajo V7E9 heredado y agrega únicamente los archivos C1 documentados.
- No se ejecutó `git add`, commit, push, merge, cambio de rama ni deploy.
- No se modificó Coolify, Cloudflare, staging ni production.

V7E9-C1 queda técnicamente aplicado, pero no se marca como completado y V7E9 conserva su revisión manual pendiente.

EN REVISIÓN — pendiente de confirmación explícita de Kraken
