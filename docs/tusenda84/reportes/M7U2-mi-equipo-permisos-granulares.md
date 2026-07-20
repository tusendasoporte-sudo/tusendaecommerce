REPORTE FINAL — PROMPT ID: M7U2

## 1. Preflight

- Repositorio confirmado: `E:\Trabajo\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt`.
- Rama confirmada antes y después del trabajo: `dev`.
- El árbol de trabajo estaba limpio al inicio; se preservó el estado previo.
- V111 se usó únicamente como referencia de continuidad. No se importó, descomprimió ni utilizó ningún ZIP como fuente.
- No se ejecutaron comandos Git destructivos, cambio de rama ni operaciones sobre servicios externos.

## 2. Arquitectura

M7U2 incorpora una capa central de autorización por tienda, compartida conceptualmente entre backend y frontend:

- `pz_store_team_permissions_lib.js`: catálogo canónico, plantillas, dependencias, capacidades y resolución efectiva.
- `pz_store_team_lib.js` y `pz_store_team.pb.js`: API privada de “Mi equipo”, autenticación y bloqueo por plan.
- `pz_store_permission_enforcement_lib.js` y `pz_store_permission_enforcement.pb.js`: enforcement de hooks REST, realtime y módulos existentes.
- `storeTeamPermissions.ts`, `storeTeam.ts` y middleware Astro: contexto sanitizado y UX defensiva.

La decisión de acceso se toma en backend y exige conjuntamente: usuario autenticado y vigente, pertenencia a la tienda, estado activo, acceso efectivo según plan, permiso asignado y capacidad del plan cuando aplica. El frontend solo oculta o deshabilita controles para mejorar la experiencia; no es la barrera de seguridad.

Se mantuvieron los roles existentes (`master_admin`, `store_admin`, `store_staff`) y se añadió autorización granular sin crear un sistema de identidad paralelo. Tampoco se alteraron fórmulas, canonización, snapshots ni semántica económica de órdenes; los cambios en esos hooks se limitan a autorización, privacidad y rutas oficiales atómicas.

## 3. Administrador principal

La fuente de verdad es la relación privada y oculta `stores.primary_admin_user`. No se infiere el principal solamente mediante `role = store_admin`.

- Con un único `store_admin` activo, la migración lo asigna automáticamente.
- Con varios administradores activos, no elige arbitrariamente: la tienda queda pendiente de definición por Master.
- Sin administrador activo, no crea uno artificialmente.
- Los administradores operativos existentes de una tienda ambigua conservan acceso legado hasta que Master defina el principal, incluso si el plan actual es Básico/Free; no reciben permisos reservados ni capacidad para administrar equipo.

El principal obtiene los 28 permisos operativos de manera implícita, sujeto a capacidades del plan. Desde “Mi equipo” no puede editarse, suspenderse, degradarse, eliminarse, cerrar sus sesiones ni revocar sus dispositivos. Los hooks también bloquean mutaciones REST directas del campo y del usuario protegido. Solo Master puede asignarlo o reemplazarlo mediante el flujo explícito.

## 4. Migración

Se agregaron dos migraciones posteriores a V111, sin editar migraciones aplicadas:

- `1784595600_store_team_permissions.js`: agrega `primary_admin_user`, su índice único parcial, la colección privada `store_user_access`, índices de aislamiento/unicidad, backfill seguro y ampliación de `store_user_audit`.
- `1784595700_store_granular_permission_rules.js`: integra reglas de autorización granular en colecciones operativas y endurece la creación pública estrecha de notificaciones legítimas de reseñas/rifas, con destinos sanitizados.

El ciclo real de migración se ejecutó sobre PocketBase desechable:

1. base fresca hasta V111;
2. fixtures con tiendas de 0, 1 y múltiples administradores;
3. upgrade: aprobado;
4. verificación de principal único, caso pendiente, colección privada, índices y usuarios preservados: aprobada;
5. rollback: aprobado, conservando las 3 tiendas y 4 usuarios;
6. reaplicación: aprobada.

El caso múltiple conserva a ambos administradores con acceso operativo legado y sin asignación arbitraria. El rollback elimina únicamente el esquema M7U2 y restaura las reglas previas; no elimina usuarios ni tiendas.

## 5. Catálogo de permisos

El catálogo compacto contiene 28 permisos asignables:

- Catálogo: `catalog.view`, `catalog.products.create`, `catalog.products.edit`, `catalog.products.delete`, `catalog.products.visibility`, `catalog.products.price`, `catalog.products.stock`, `catalog.products.images`, `catalog.categories.manage`, `catalog.expirations.manage`.
- Pedidos: `orders.view`, `orders.status.manage`, `orders.items.manage`, `orders.price_adjustment`, `orders.cancel_delete`, `orders.contact_customer`.
- Envíos: `shipping.manage`.
- Promoción: `promotions.manage`, `coupons.manage`, `gifts.manage`, `raffles.manage`.
- Operación: `reviews.manage`, `notifications.view`, `analytics.view`, `landing_qr.manage`.
- Configuración y seguridad: `store.settings.manage`, `security.view`, `security.manage`.

Los cinco permisos reservados nunca son asignables: `team.manage`, `plan.manage`, `primary_admin.replace`, `premium_downgrade.confirm` y `global_cleanup.execute`.

Las dependencias se normalizan tanto al guardar como al evaluar. Ejemplos: cualquier mutación de producto implica `catalog.view`; ítems de pedido implican `orders.view` y `catalog.view`; reseñas implican `orders.view`; analíticas implican `orders.view` y `catalog.view`; `security.manage` implica `security.view`.

Las capacidades adicionales se aplican a vencimientos, rifas, Landing QR y Seguridad. Por tanto, poseer una clave nunca habilita una función ausente en el plan.

## 6. Plantillas

| Código | Etiqueta | Alcance |
|---|---|---|
| `secondary_admin` | Administrador secundario | Los 28 permisos operativos; ninguno reservado ni Master. |
| `catalog_inventory` | Productos e inventario | Vista, altas/edición, visibilidad, precio, stock, imágenes, categorías y vencimientos. |
| `orders_shipping` | Pedidos y envíos | Vista, estados, ítems, contacto y envíos; ajuste de precio queda desactivado. |
| `marketing_promotions` | Marketing y promociones | Promociones, cupones, regalos, rifas, analíticas y Landing QR. |
| `read_only` | Solo lectura | Catálogo, pedidos, notificaciones, analíticas y Seguridad en lectura. |
| `custom` | Personalizado | Selección granular normalizada por el catálogo. |

Al modificar manualmente una plantilla, la UI cambia su identificación visible a “Personalizado” sin alterar el nombre del usuario. Las dependencias no permiten combinaciones imposibles y los permisos reservados no se renderizan como seleccionables.

## 7. Modelo de datos

`store_user_access` es una colección privada sin reglas públicas de list/view/create/update/delete. Sus campos relacionan tienda, usuario, plantilla, permisos JSON, creador y actualizador; los timestamps los aporta PocketBase.

- Índice único por `store + user`.
- Índices auxiliares por usuario y por `store + template_code`.
- Validación server-side de pertenencia a la misma tienda.
- Permisos desconocidos o reservados se rechazan.
- El JSON se normaliza y ordena; `custom` sin permisos es un estado válido.
- El principal no depende de un registro persistido para ejercer sus permisos implícitos.

`store_user_audit` se amplió con acciones M7U2, plantilla anterior/nueva y snapshots de permisos anterior/nuevo. No almacena contraseñas temporales, tokens ni secretos. Las respuestas públicas se sanitizan, los correos se enmascaran cuando corresponde y los identificadores internos no se exponen como datos de UI.

## 8. Límites del plan

- Premium: máximo transaccional de 4 usuarios activos totales, incluido el principal; equivale a 1 principal + 3 adicionales.
- Básico/Free: 1 usuario efectivo, el principal.
- Un usuario suspendido no ocupa cupo.
- Crear o reactivar vuelve a contar dentro de una transacción; el quinto activo recibe conflicto y no se materializa.
- Suspender libera el cupo, permitiendo crear o reactivar un reemplazo.

Las pruebas cubren la secuencia 4/4, rechazo del quinto, suspensión, reemplazo y rechazo de reactivación mientras el cupo vuelve a estar lleno.

## 9. Downgrade y upgrade

Premium → Básico/Free no elimina cuentas, permisos, plantillas, auditoría, dispositivos ni historial. El principal conserva acceso; los adicionales activos permanecen con `status = active`, pero su acceso efectivo pasa a `blocked_by_plan`. Se cierran sesiones, login y refresh son rechazados y la UI los muestra como “Inactivo por plan” en lectura.

Al volver a Premium, se restauran automáticamente los adicionales cuyo estado interno sigue activo, hasta el máximo del plan; los suspendidos no se restauran. No se regeneran permisos ni contraseñas y se registra una sola transición de restauración. La cuota se vuelve a validar dentro de la misma operación de plan.

## 10. Autenticación

Los hooks oficiales de login y refresh distinguen de forma interna `active`, `suspended`, `blocked_by_plan` y contraseña temporal requerida/vencida, manteniendo respuestas públicas neutrales. Se reutiliza el flujo existente de acceso temporal de 72 horas, cambio obligatorio y nuevo login; no existe un segundo sistema de contraseñas.

La contraseña temporal se emite una sola vez, nunca se persiste en claro ni se audita, y se elimina del DOM al cerrar el diálogo. Cambios de permisos, suspensión, downgrade y revocaciones invalidan sesiones para que la retirada sea inmediata.

Realtime vuelve a cargar al usuario y compara el `tokenKey()` conectado con el vigente. Una sesión previamente autenticada cuyo usuario ya no existe o cuya clave cambió falla cerrada; el flujo público realmente anónimo se conserva.

## 11. API privada

Se implementaron estas rutas oficiales autenticadas:

- `POST /api/pz/store/access/context`.
- `POST /api/pz/store/team/summary`.
- `POST /api/pz/store/team/list`.
- `POST /api/pz/store/team/detail`.
- `POST /api/pz/store/team/create`.
- `POST /api/pz/store/team/update`.
- `POST /api/pz/store/team/suspend`.
- `POST /api/pz/store/team/reactivate`.
- `POST /api/pz/store/team/issue-temporary-access`.
- `POST /api/pz/store/team/revoke-sessions`.
- `POST /api/pz/store/team/revoke-devices`.
- `POST /api/pz/store/team/audit`.

Todas exigen sesión, principal vigente, payload exacto, `bodyLimit`, tienda y actor resueltos en servidor, respuestas privadas sanitizadas y auditoría. Crear/reactivar y su auditoría/cuota son transaccionales. No se acepta `actor_id`, cambio de tienda, autoedición, eliminación física ni permisos reservados.

Para órdenes se añadieron rutas oficiales atómicas de transición, token y cancelación/eliminación con permisos específicos. Los bypass REST directos equivalentes devuelven rechazo. La privacidad de pedidos oculta teléfono, email, dirección, token de recibo y relación `customer` sin `orders.contact_customer`; el token de reseña exige además `reviews.manage`. Esto también se aplica a list/view, expansiones y realtime, sin cambiar lecturas públicas legítimas por token.

## 12. Interfaz “Mi equipo”

La ruta canónica es `/t/[storeSlug]/admin/team`, con alias `/admin/team` para la arquitectura administrativa existente. Solo el principal ve “Mi equipo” cerca de Ajustes en sidebar/drawer; la barra móvil conserva exactamente cuatro accesos.

La pantalla muestra resumen de plan, activos/cupo, principal protegido y usuarios adicionales con email enmascarado, plantilla, estado, actividad y dispositivos. En escritorio usa tabla compacta y en móvil tarjetas. Incluye alta, edición, permisos, suspensión/reactivación, acceso temporal, cierre de sesiones, revocación de dispositivos y auditoría; no muestra eliminación física.

En Básico/Free el principal puede consultar el equipo preservado, ve el aviso “Tu plan permite un solo usuario activo”, el botón de planes, permisos en lectura y los adicionales “Inactivo por plan”. Crear y reactivar quedan deshabilitados.

## 13. Master Admin

Se mantuvieron las rutas Master y se añadió `MasterPrimaryAdminControl` junto con:

- `POST /api/pz/master/primary-admin/status`.
- `POST /api/pz/master/primary-admin/assign`.
- `POST /api/pz/master/primary-admin/replace`.

Master ve si falta, está pendiente o ya existe principal; puede asignarlo o reemplazarlo con advertencia, motivo y selección explícita del destino del anterior. La operación valida autoridad, tienda, usuario y cupo dentro de transacción, cierra sesiones del anterior y audita asignación/reemplazo.

El anterior continúa como adicional con plantilla/permisos seleccionados o queda suspendido. No se transfieren secretos ni sesiones. Las pantallas Master de detalle también bloquean degradar, suspender o eliminar al principal hasta realizar el reemplazo protegido, manteniendo la regla previa del último administrador activo.

## 14. Enforcement por módulo

| Ruta/página | Datos consultados | Vista | Acciones y permiso | Protector backend | Cobertura |
|---|---|---|---|---|---|
| Resumen | Órdenes, ítems, productos, ajustes, analíticas | permisos disponibles del contexto; datos parciales por `orders.view`, `catalog.view`, `analytics.view` | Sin mutaciones implícitas; reseñas requieren `reviews.manage` | `pz_store_permission_enforcement_lib.js` + endpoints privados | Cubierto |
| Productos | Productos, variaciones, categorías | `catalog.view` | Crear, editar, borrar, visibilidad, precio, stock, imágenes y vencimiento con cada clave `catalog.products.*`/`catalog.expirations.manage` | hooks de colecciones + enforcement | Cubierto |
| Categorías | Categorías/subcategorías y productos | `catalog.view` | Gestión con `catalog.categories.manage`; altas/edición de producto con sus claves | hooks de colecciones + middleware | Cubierto |
| Pedidos | Órdenes, ítems, reseñas y contacto sanitizado | `orders.view` | Estado, ítems, ajuste, cancelar/borrar, contacto y reseñas con sus claves específicas | rutas atómicas `pz_order_pricing*` + redacción | Cubierto |
| Envíos | Zonas y configuración de entrega | `shipping.manage` | Toda mutación: `shipping.manage` | enforcement de colecciones/ruta | Cubierto |
| Promociones | Promociones | `promotions.manage` | Crear/editar/eliminar: `promotions.manage` | enforcement de colecciones/ruta | Cubierto |
| Cupones | Cupones | `coupons.manage` | Crear/editar/eliminar: `coupons.manage` | enforcement de colecciones/ruta | Cubierto |
| Regalos | Regalos promocionales | `gifts.manage` | Crear/editar/eliminar: `gifts.manage` | enforcement de colecciones/ruta | Cubierto |
| Rifas | Rifas y entradas | `raffles.manage` + capacidad | Gestión: `raffles.manage`; creación pública solo para referencia legítima | enforcement + regla migrada | Cubierto |
| Reseñas | Reseñas asociadas a pedidos | `reviews.manage` (implica `orders.view`) | Moderar/contactar por reseña: `reviews.manage`; WhatsApp además exige contacto disponible | enforcement + redacción | Cubierto |
| Analíticas | Métricas de pedidos y catálogo | `analytics.view` | Solo lectura; no se habilitan `PATCH`/`DELETE` crudos | middleware + enforcement | Cubierto |
| Landing QR | Ajustes de Landing QR | `landing_qr.manage` + capacidad | Guardar configuración: `landing_qr.manage` | endpoint/hook de ajustes | Cubierto |
| Seguridad | Eventos, identidad, sesiones visitantes | `security.view` + capacidad | Bloqueos/gestión: `security.manage` | `pz_security_identity_lib.js`, `pz_security_monitoring_lib.js` | Cubierto |
| Ajustes | Ajustes privados de tienda | `store.settings.manage` | Cada campo sensible conserva además su permiso/capacidad específico | enforcement de `store_settings` | Cubierto |
| Vencimientos | Productos/variaciones y fechas | `catalog.expirations.manage` + capacidad | Fechas general/variaciones: `catalog.expirations.manage` | `pz_product_expiration_lib.js` + enforcement | Cubierto en autorización |
| Notificaciones | Avisos sanitizados de la tienda | `notifications.view` | Lectura y destinos seguros; avisos V7E9 filtrados por `catalog.expirations.manage` | enforcement realtime/REST + helper de destino | Cubierto |

Para un recurso de otra tienda se devuelve `404` para ocultarlo. Si el recurso pertenece a la tienda del actor pero falta el permiso, se devuelve `403 permission_denied`. La semántica está probada para Seguridad y V7E9.

## 15. Integración V7E9

`catalog.expirations.manage` se integró en catálogo, plantillas, middleware, sidebar, Resumen, Productos, página independiente, endpoint privado, notificaciones y realtime. Requiere simultáneamente la capacidad Premium `product_expiration_tools_enabled`.

- Principal: acceso implícito sujeto al plan.
- Adicional Premium con permiso: endpoint 200, página y controles visibles.
- Adicional sin permiso: página 403 amigable, sin llamada al endpoint protegido y backend 403 dentro de su tienda.
- Básico/Free: el permiso persistido no supera el gate del plan.
- Otra tienda: 404; suspendido/bloqueado: rechazo.

M7U2 no corrige ni declara terminados los pendientes funcionales propios de V7E9 (fecha vacía/eliminación de fecha y responsive previo). V7E9 permanece **EN REVISIÓN**.

## 16. Pruebas backend

Se añadieron pruebas focales para catálogo/plantillas/dependencias, migración, principal Master, API de equipo, cuotas y concurrencia, downgrade/upgrade, autenticación, sesiones/dispositivos, aislamiento, semántica 403/404, V7E9, redacción de pedidos, rutas atómicas y realtime.

Resultados focales destacados:

- permisos y equipo: 32/32;
- Seguridad multi-tenant: 11/11;
- principal Master: 13/13;
- equipo y privacidad de órdenes tras el endurecimiento final: 23/23.

La suite backend completa registra 468 pruebas: 461 aprobadas, 0 fallidas y 7 omitidas. Las omisiones corresponden exclusivamente a pruebas HTTP que requieren URL/credenciales de un PocketBase externo; la prueba runtime específica M7U2 sí se ejecutó por separado con entorno real y quedó aprobada.

## 17. Frontend

Se añadieron pruebas para ruta/alias, visibilidad exclusiva del principal, contador y cupo, responsive, cuatro botones inferiores, plantillas, personalizado, dependencias, ausencia de reservados, secreto de una sola visualización, Básico preservado, acciones granulares, V7E9 con/sin permiso, ausencia de llamadas protegidas, mensaje 403, privacidad de pedidos, notificaciones seguras y ausencia de token serializado.

La regresión U7I7 se actualizó para la nueva regla acumulativa: proteger tanto al principal como al último administrador activo. Su prueba focal quedó 21/21. La suite frontend completa quedó 200/200, sin fallos ni omisiones.

## 18. Runtime PocketBase

Se levantó PocketBase real en `127.0.0.1` con base local temporal y hooks/migraciones del repositorio. Los fixtures `M7U2QA_<timestamp>` cubrieron Premium, Básico/Free, segunda tienda, principal, adicionales, suspendido y actor ajeno.

El caso HTTP real validó crear, listar, editar, permisos, temporal, login/refresh, sesiones/dispositivos, cuota 4/4, suspensión y reemplazo, downgrade/upgrade, aislamiento, escritura directa, V7E9 con/sin permiso y códigos 403/404. Resultado final: 1/1 aprobada, 0 fallos, duración 1.89 s.

El cleanup se ejecutó en `finally`. Antes de apagar PocketBase se comprobó que no existían usuarios, productos, accesos, sesiones ni auditorías de QA; la única tienda restante era la semilla histórica `PowerZona`, no un fixture M7U2.

## 19. Playwright estándar

Se utilizó Playwright estándar con Chromium, sin `playwright-interactive`, en 1440×900, 390×844 y 412×915. El recorrido final aprobó las 10 evidencias y verificó ausencia de scroll horizontal, áreas táctiles de al menos 40 px, diálogo dentro del viewport, tabla/tarjetas, cuatro enlaces inferiores, sidebar por permisos, ausencia de IDs/tokens visibles y secreto retirado del DOM al cerrar.

Evidencias finales en `docs/tusenda84/reportes/evidencias/M7U2/`:

1. `01-mi-equipo-pc.png`
2. `02-mi-equipo-movil.png`
3. `03-nuevo-usuario.png`
4. `04-plantillas-permisos.png`
5. `05-permisos-personalizados.png`
6. `06-temporal-una-vez.png`
7. `07-inactivo-por-plan.png`
8. `08-v7e9-con-permiso.png`
9. `09-v7e9-sin-permiso.png`
10. `10-master-principal.png`

La evidencia V7E9 autorizada muestra el producto de QA a 21 días; la denegada muestra el 403 y se confirmó que no hizo llamadas al endpoint protegido.

## 20. Suites

| Suite | Total | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|---:|
| Backend completa | 468 | 461 | 0 | 7 |
| Frontend completa | 200 | 200 | 0 | 0 |
| Total suites estándar | 668 | 661 | 0 | 7 |
| Runtime HTTP M7U2 habilitado | 1 | 1 | 0 | 0 |
| Playwright visual | 10 evidencias | 10 | 0 | 0 |

Las siete omisiones backend son gates deliberados de runtime externo sin variables de entorno en la suite estándar, no fallos. El runtime M7U2 equivalente se habilitó y aprobó contra la instancia desechable.

## 21. Build

`npm.cmd run build` en `frontend-powerzona` terminó correctamente y generó la salida SSR. Solo aparecieron advertencias Astro ya no bloqueantes porque `getStaticPaths()` se ignora en tres rutas dinámicas SSR: subcategoría, producto y categoría. No hubo errores de compilación.

Después de verificarlo, se eliminó `frontend-powerzona/dist` y `frontend-powerzona/.astro` según el requisito de limpieza.

## 22. Limpieza

- Fixtures `M7U2QA_`: 0.
- Evidencias finales: exactamente 10 PNG; no quedaron capturas descartadas.
- Bases y scripts temporales: eliminados junto con `.tmp`.
- `dist`, `.astro`, `playwright-report` y `test-results`: ausentes.
- Astro y PocketBase iniciados para la tarea: detenidos.
- Procesos Node/PocketBase de la tarea: 0.
- El navegador Playwright se cerró en `finally`; no quedaron procesos de navegador iniciados el 19/07/2026. Los navegadores preexistentes del 18/07 se conservaron.
- No se tocó `pb_data`, `node_modules`, credenciales globales ni perfiles de navegador.

## 23. Git final

- Rama final: `dev`.
- `git diff --check`: aprobado; únicamente se muestran avisos informativos de conversión LF/CRLF de Git, sin errores de whitespace.
- `git status --short`, `git diff --name-only` y `git diff --stat` contienen solo implementación, pruebas, reporte y las 10 evidencias M7U2.
- No aparecen `.tmp`, `dist`, `.astro`, `pb_data`, `node_modules`, traces, videos, estados de storage, credenciales ni perfiles Chromium.
- El árbol se deja deliberadamente sin stage para revisión de Kraken.

## 24. Sin commit, push, merge ni deploy

No se ejecutó `git add`, commit, push, merge, checkout/cambio de rama, deploy, ni cambios en Coolify o Cloudflare. Tampoco se generó o actualizó la bitácora PDF.

## 25. Pendientes reales

- Revisión visual/funcional humana final y confirmación explícita de Kraken.
- M7U2 no se marca como completado hasta esa confirmación.
- V7E9 continúa en revisión; sus pendientes funcionales previos de fecha vacía/eliminación y responsive no se reabrieron en esta tarea.
- Las advertencias SSR de `getStaticPaths()` no bloquean el build, pero pueden limpiarse en una tarea de mantenimiento independiente.

EN REVISIÓN — M7U2 PENDIENTE DE QA FINAL Y CONFIRMACIÓN DE KRAKEN
