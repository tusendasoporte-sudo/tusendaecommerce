REPORTE FINAL — PROMPT ID: M7U2-C3

Fecha de ejecución: 20 de julio de 2026

Estado documental: **EN REVISIÓN**

Matriz asociada: `docs/tusenda84/reportes/M7U2-C3-matriz-final-permisos.md`

## 1. Preflight

- Repositorio confirmado: `E:\Trabajo\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt`.
- Rama confirmada: `dev`.
- Base inicial confirmada: `14970c8`; el árbol estaba limpio al iniciar.
- Se trabajó sobre el repositorio real, preservando M7U2, C1, C2 y C2F1. No se importó, descomprimió ni usó ningún ZIP como source.
- No se ejecutaron `reset`, `clean`, `checkout -- .`, `restore`, `stash`, cambio de rama ni otras operaciones Git destructivas.

## 2. Causa de `analytics.view`

El catálogo central modelaba `analytics.view` con dependencias operativas hacia `orders.view` y `catalog.view`. La plantilla Marketing heredaba así acceso a Pedidos y Catálogo aunque su intención era consultar métricas agregadas. Además, las vistas analíticas dependían de colecciones administrativas crudas, por lo que quitar la dependencia sin separar el contrato de datos habría roto la funcionalidad.

## 3. Solución de Analíticas

- `analytics.view` quedó sin dependencias operativas.
- Se creó `POST /api/pz/store/analytics/summary`, que deriva la tienda y el actor de la sesión, valida el período y entrega únicamente totales, tendencias y páginas/productos agregados con nombres seguros.
- El endpoint pagina el listado de páginas, evita N+1 y no expone pedidos, clientes, contacto, notas, costos, inventario privado ni IDs innecesarios.
- Las páginas `Resumen` y `Páginas vistas` consumen el agregado oficial. El acceso REST/realtime a `store_analytics_events` continúa bloqueado para usuarios Store.
- Los enlaces operativos solo aparecen cuando existe además el permiso granular correspondiente.

## 4. Plantilla Marketing

`marketing_promotions` quedó exactamente con:

```text
promotions.manage
coupons.manage
gifts.manage
raffles.manage
landing_qr.manage
analytics.view
```

No concede `orders.view`, `catalog.view`, edición, precio ni stock. La navegación muestra únicamente destinos autorizados y su barra móvil conserva cuatro accesos válidos: Analíticas, Ajustes, Regalos y Promos.

Se creó `POST /api/pz/store/marketing/selectors`, autorizado únicamente por `promotions.manage` o `coupons.manage`. Devuelve nombres, referencia técnica necesaria, taxonomía segura, visibilidad y miniatura cuando aplica; excluye costos, stock detallado, precios internos, proveedor, vencimientos y demás campos operativos. Productos usan búsqueda remota acotada e hidratación de referencias; categorías y subcategorías se paginan hasta completar, con límite máximo de 100 por página y aislamiento por tienda.

## 5. Plantilla Solo lectura

`read_only` quedó exactamente con:

```text
catalog.view
orders.view
analytics.view
```

No contiene `security.view`, `security.manage`, `team.manage`, ajustes sensibles, ajustes de precio ni gestión de vencimientos. Seguridad queda oculta, su ruta responde 403, sus endpoints responden `permission_denied` y la carga normal no emite requests de Seguridad. Solo un usuario `custom` con `security.view` explícito obtiene lectura sanitaria de ese módulo.

## 6. Migración y normalización

La migración `1784595900_m7u2_c3_permission_normalization.js` corrige usuarios existentes que conservan exactamente las plantillas antiguas:

- Marketing pierde los permisos operativos heredados indebidamente.
- Solo lectura pierde `security.view`.
- Los usuarios `custom` no se reescriben y conservan concesiones explícitas.
- Cada corrección genera una auditoría `team_permissions_normalized` y rota el contexto de autenticación para que la retirada sea inmediata, sin esperar un logout manual.
- Una segunda ejecución no cambia registros ni duplica auditorías; tampoco reactiva sesiones o usuarios.

## 7. Catálogo central

Backend y frontend usan el mismo contrato de claves asignables, etiquetas, categorías, dependencias, plantillas y permisos reservados. También se actualizaron la resolución de plantillas, middleware, capacidades del plan y navegación para fallar cerrados ante una clave o combinación desconocida.

## 8. Paridad

Las pruebas de paridad verificaron igualdad backend/frontend de claves, plantillas, dependencias, reservados y normalización. Marketing y Solo lectura se comparan como conjuntos exactos; `analytics.view`, `promotions.manage` y `coupons.manage` no incorporan Pedidos o Catálogo.

## 9. QA del Administrador principal

Se validó apertura de Mi equipo, cupos Premium 4/4, creación/edición y plantillas, personalización, suspensión/reactivación, correo completo y copia, menú PC/action sheet móvil, cierre exterior/Escape, toast, ocho motivos, `Otro`, eliminación permanente, Actividad del equipo, detalle y revisión, requiere corrección, reporte individual, Mi actividad, última modificación y V7E9. Los intentos de autoeliminación, degradación, reemplazo u operación entre tiendas permanecen bloqueados.

## 10. QA del Administrador secundario

Se validó su acceso operativo amplio y se confirmó que no ve Mi equipo ni puede usar endpoints de equipo, gestionar usuarios, cambiar principal/plan, conceder permisos, eliminar miembros, consultar el correo completo del equipo ni cargar Actividad del equipo. Las acciones reservadas respondieron 403.

## 11. QA de Marketing

Se validaron Promociones, Cupones, Regalos, Rifas, Landing QR y Analíticas sin Catálogo general. El selector sanitario permitió crear/editar una promoción. Pedidos, Productos, Categorías, Seguridad, Mi equipo y Vencimientos no aparecen sin permiso y los intentos directos fueron rechazados. No se recibieron contacto de clientes, pedidos, inventario privado ni usos crudos de cupones.

## 12. QA de Solo lectura

Se confirmó el conjunto exacto, navegación de lectura, ausencia de botones mutadores, bloqueo de cambios de estado/precio/stock/vencimientos/equipo, ausencia de Seguridad y 403 en ruta y endpoint. La barra móvil quedó con Resumen, Pedidos, Categorías y Productos. La carga no solicitó Seguridad ni filtró sus contadores o nombres de clientes.

## 13. QA de permisos personalizados

- `analytics.view`: Analíticas permitida; Pedidos y Productos bloqueados.
- `security.view`: Seguridad permitida en lectura sanitaria.
- `catalog.expirations.manage` en Premium: V7E9 permitido; edición e historial siguen dependiendo de sus permisos propios.
- Sin `catalog.expirations.manage`: V7E9 responde 403.
- `promotions.manage` sin Catálogo: selector sanitario y configuración de promociones permitidos; Productos bloqueado.
- Las concesiones custom explícitas sobrevivieron normalización y downgrade/upgrade.

## 14. Regresión M7U2-C1

Pasaron menú flotante PC, posicionamiento, altura estable, action sheet móvil, cierre exterior/Escape, toast temporal y limpieza, tarjeta Premium/Básico, estados de cupo y barra inferior de cuatro botones autorizados. Se añadió espacio móvil compatible con topbar y bottom-nav sin scroll horizontal.

## 15. Regresión M7U2-C2

Pasaron eliminación permanente con historial inmutable, Actividad del equipo, filtros, paginación, detalle antes/después, revisión, requiere corrección, reporte individual, Mi actividad, actor/recurso eliminado, última modificación, consulta batch sin N+1 y aislamiento de tienda/actor.

## 16. Regresión M7U2-C2F1

Pasaron correo completo exclusivo del principal, copia sin rellenar la confirmación, confirmación manual, ocho motivos exactos, detalle obligatorio para `Otro`, allowlist backend, persistencia sanitaria de código/etiqueta/detalle, rechazo de código manipulado, responsive y no regresión de eliminación Master.

## 17. Downgrade y upgrade

En Premium → Básico el principal permaneció activo, los extras quedaron inactivos por plan, sus sesiones dejaron de autorizar, y usuarios, permisos, plantillas, actividad y auditoría se conservaron. No fue posible reactivar sobre el cupo y los módulos Premium quedaron bloqueados.

Al volver a Premium se restauraron únicamente los usuarios elegibles; los suspendidos no se reactivaron. Quedaron 3 de 4 activos, Marketing siguió sin Pedidos/Productos, Solo lectura siguió sin Seguridad y existió una sola auditoría de normalización por usuario afectado.

## 18. Seguridad y F12

El enforcement cubre URL, query, filtros, orden, campos, expansión, respuesta, relaciones y topics realtime. Fueron rechazados: cambio de plantilla desde cliente, permiso reservado, autoasignación de `team.manage`, Pedidos/Productos de Marketing, Seguridad de Solo lectura, V7E9 sin permiso, correo/actividad de otra tienda, reactivación sobre el plan y motivo de eliminación manipulado. La redacción de Pedidos separa `orders.view` de `orders.contact_customer`, incluso en relación, expansión y realtime.

## 19. Pruebas backend

- Bloques focales de Analíticas/selector/privacidad: 20/20 aprobados.
- Pruebas no-runtime revisadas: 485/485 aprobadas.
- Runtime real del selector: aprobado con 106 categorías y 106 subcategorías, páginas 100+6, sin duplicados, hidratación de referencia de la segunda página, aislamiento tenant, límite inválido 400 y limpieza total.
- Runtime real de contacto de pedidos: 5 oráculos de pedido y 2 recorridos relacionales aprobados; datos privados redactados sin `orders.contact_customer`.
- Migración, idempotencia, permisos inmediatos, 403, aislamiento y realtime también quedaron cubiertos por la suite C3 autocontenida.

## 20. Pruebas frontend

La suite focal cubre sidebar por perfil, rutas, botones, llamadas prohibidas, principal, secundario, Marketing, Solo lectura, custom, C1/C2/C2F1, V7E9, responsive, mensajes 403 y privacidad. Resultado final de la suite completa: **226 totales, 226 aprobadas, 0 fallidas, 0 omitidas**.

## 21. Runtime PocketBase

Se usaron bases efímeras y fixtures con prefijo `M7U2C3QA_`. Se probaron login, refresh, rutas, hooks HTTP, selectores paginados, agregado analítico, actividad, eliminación, downgrade, upgrade, rotación de sesión, normalización, aislamiento y ataques F12. El último recorrido terminó con 0 fixtures, 0 procesos y 0 datos temporales propios.

## 22. Playwright estándar

Se usó exclusivamente Playwright estándar con Chromium headless; no se usaron `playwright-interactive` ni `js_repl`. Pasaron los viewports 1440×900, 390×844 y 412×915, foco/cierres básicos, objetivos táctiles, barra inferior de cuatro botones, ausencia de overflow horizontal y los flujos funcionales. Resultado: **17/17 capturas aprobadas** en `docs/tusenda84/reportes/evidencias/M7U2-C3/`. El render C3 se estabilizó esperando fuentes/layout y desactivando composición GPU headless.

## 23. Auditoría de red

La sesión Marketing no realizó requests a listados crudos de Pedidos, Productos, Categorías, eventos analíticos o Seguridad; solo utilizó los endpoints agregados/selectores autorizados. Solo lectura no solicitó Seguridad. El runner también falló ante cualquier 5xx, request prohibido, respuesta privada o error de página; el resultado fue limpio.

## 24. Suites

- Backend completo: **530 totales, 523 aprobadas, 0 fallidas, 7 omitidas**.
- Las 3 omisiones runtime requieren URLs/credenciales externas configuradas expresamente; las otras 4 son integraciones opcionales ya marcadas `SKIP` (eliminación, dispositivo real, U7I7 y PZPW). Los runtimes autocontenidos C2/C3 sí se ejecutaron y aprobaron.
- Frontend completo: **226 totales, 226 aprobadas, 0 fallidas, 0 omitidas**.
- Playwright C3: **17/17**.

## 25. Build

`npm.cmd run build` completó Astro SSR correctamente en 15.94 s. Solo aparecieron los tres avisos preexistentes de `getStaticPaths()` ignorado en rutas dinámicas de producto, categoría y subcategoría; no hubo error de compilación. El alias PowerShell `npm.ps1` estaba bloqueado por la política local, por lo que se usó el ejecutable oficial de Windows sin modificar la configuración. Se comprobaron **0 source maps públicos**.

## 26. Limpieza

Los runners eliminaron en `finally` fixtures, usuarios, tiendas, sesiones, dispositivos, auditorías, analíticas, Seguridad, productos, taxonomía, pedidos, promociones y bases temporales. El cierre final verificó 0 fixtures `M7U2C3QA_`, 0 procesos Chromium/Node/Astro/PocketBase propios, 0 storage states/traces/videos y eliminó `dist`, `.astro`, `.tmp`, `playwright-report`, `test-results` y `debug.log`. Los procesos preexistentes no fueron alterados.

## 27. Git final

`git diff --check`, `git status --short`, `git diff --name-only` y `git diff --stat` se ejecutaron al cierre. No existen cambios staged y Git no reporta cambios ni artefactos temporales nuevos en `pb_data`, `node_modules`, `dist`, `.astro`, `.tmp`, perfiles Chromium o credenciales. Los avisos de Git se limitan a la conversión LF/CRLF configurada en Windows.

## 28. No commit, push o deploy

No se ejecutó `git add`, commit, push, merge, deploy ni modificación de Coolify, Cloudflare o la bitácora PDF. Todo permanece sin stage en la rama `dev` para revisión.

## 29. Pendientes reales

No queda un bloqueo técnico reproducible dentro del alcance M7U2-C3. El único pendiente es la validación manual final y la confirmación explícita de Kraken; por esa razón M7U2, C1, C2, C2F1 y C3 no se marcan como completados.

EN REVISIÓN — M7U2 PENDIENTE DE VALIDACIÓN MANUAL FINAL Y CONFIRMACIÓN DE KRAKEN
