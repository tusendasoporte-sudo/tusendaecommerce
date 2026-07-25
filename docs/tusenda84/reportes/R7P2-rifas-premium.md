# REPORTE FINAL — PROMPT ID: R7P2

Estado: **R7P2 — EN REVISIÓN / PENDIENTE DE VALIDACIÓN MANUAL DE KRAKEN**

Fecha técnica del reporte: **24 de julio de 2026**.

## 1. Preflight real

- Repositorio resuelto: `E:\Trabajo\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt`.
- `git rev-parse --show-toplevel`: `E:/Trabajo/PROYECTOS/WEb E_Comerce PowerZona_ChatGpt`.
- Rama autorizada y usada: `dev`.
- `git status --short`, `git diff --name-only` y `git diff --stat` estaban vacíos antes de modificar archivos: **0 cambios heredados**.
- Al no existir cambios heredados, no hubo contenido previo que mezclar, descartar ni sobrescribir.
- No se importó, descomprimió ni copió Source V120 sobre el repositorio real.
- No se cambió de rama y no se ejecutaron operaciones Git destructivas.

## 2. Cierre documental previo de L7Q1

Antes de iniciar R7P2 se agregó la sección final de continuidad al reporte `L7Q1-landing-qr-premium.md`:

- `L7Q1 — Landing QR Premium`: **COMPLETADO**;
- Source de cierre: **V120**;
- confirmación manual de Kraken: **24 de julio de 2026**;
- todos los bloques manuales: aprobados;
- staging/production: reservado para el bloque conjunto aprobado.

Se conservó todo el historial anterior. No se editó el PDF de bitácora.

## 3. Hallazgos iniciales

La capacidad `raffles_enabled`, el permiso `raffles.manage`, la resolución central de planes y el enforcement granular ya existían. Los huecos encontrados fueron:

- la página y API administrativas podían iniciar lecturas o asegurar slots antes de un gate explícito de capacidad;
- las rutas y el home públicos consultaban colecciones directamente;
- `enter` y `status` utilizaban REST público de PocketBase;
- las reglas públicas amplias permitían inferir rifas o participaciones por REST, filtros, expansiones y realtime;
- una creación anónima de notificación podía intentar derivarse de una participación;
- los archivos de Rifas no tenían enforcement de plan, permiso y tenant en descarga;
- el sidebar podía consultar avisos de resultado durante un downgrade;
- Free, Básico o Premium vencido no recibían el fallback público `302` aprobado.

La arquitectura existente permitió cerrar las brechas con **0 migraciones**.

## 4. Arquitectura aplicada

Se mantuvieron como fuentes únicas de verdad:

1. `resolveStoreCapabilityAccess` / `hasStoreCapability` con `raffles_enabled` y `enforceExpiration: true`;
2. `raffles.manage` mediante el contexto y enforcement granular de tienda;
3. tenant obtenido de la sesión, ruta canónica o relación real del registro;
4. `StoreCapabilityGate` para el Principal sin capacidad.

`frontend-powerzona/src/lib/raffleAccess.ts` centraliza el acceso SSR/admin y el fallback público. `backend-powerzona/pb_hooks/pz_raffles_premium_lib.js` centraliza la resolución pública, snapshots saneados, participación y consulta de estado.

No se creó una segunda matriz de planes ni un permiso alternativo.

## 5. Matriz de acceso resultante

| Escenario | Resultado |
|---|---|
| Principal Premium vigente | Editor y acciones actuales de Rifas. |
| Usuario Premium con `raffles.manage` | Acceso solo a su tienda. |
| Usuario Premium sin `raffles.manage` | Navegación oculta; URL/API/REST/realtime/archivos bloqueados. |
| Principal Free o Básico | Acceso comercial visible y `StoreCapabilityGate`, sin montar editor ni cargar datos. |
| Principal Premium vencido | Mismo fail-closed comercial, sin pérdida de datos. |
| Usuario adicional sin capacidad o permiso | Módulo oculto y acceso directo bloqueado. |
| Plan inválido | Fail-closed. |
| Tenant ajeno o ID cruzado | Recurso no encontrado saneado. |

El gate se resuelve en SSR antes de cargar slots, formularios, datos, archivos o scripts del editor. Las acciones contextuales y móviles del editor no se montan cuando el gate está activo.

## 6. Administración y API

- La página administrativa resuelve capacidad, permiso y tenant antes del editor.
- La API administrativa ejecuta `requireRafflesAdminAccess` antes de GET, creación de slots, lectura de formularios o mutaciones.
- Todas las acciones existentes siguen pasando por el mismo endpoint protegido: configuración, fechas, premios, imágenes, visibilidad, selección, resultados, finalización, reapertura, cancelación, reingreso y reset.
- Principal sin capacidad recibe el gate; usuario adicional sin permiso recibe un bloqueo seguro.
- Los errores se saneaban antes de responder; no se devuelven consultas, stack traces, rutas internas ni mensajes crudos de PocketBase.
- El acceso no se concede por `analytics.view`, `store.settings.manage`, promociones o catálogo.

## 7. REST, F12, realtime y archivos

- REST anónimo de `raffles` y `raffle_entries`, incluido list/view, responde `404` sin contenido.
- Las mutaciones anónimas directas se bloquean.
- `fields`, `filter`, `sort` y `expand` no reabren las colecciones.
- Las lecturas y mutaciones administrativas conservan tenant, capacidad y `raffles.manage`.
- El cruce de tenant en Rifas y participaciones se oculta como recurso inexistente.
- El público no puede suscribirse a realtime de Rifas/participaciones; los mensajes salientes no autorizados se descartan.
- Los archivos de `raffles.images` pasan por `onFileDownloadRequest`.
- Un middleware temprano fija `Cache-Control: private, no-store`, `Pragma: no-cache` y `X-Robots-Tag: noindex` para URLs de archivos de Rifas.
- La descarga pública exige tienda activa, Premium vigente, rifa configurada y enlace habilitado.
- La descarga administrativa exige capacidad, tenant propio y `raffles.manage`.
- Un downgrade bloquea la URL antigua, pero no borra ni reordena archivos.
- La protección aprobada de Landing QR permanece registrada en el mismo hook.

## 8. Comportamiento público

- `/t/[storeSlug]/rifa` y `/t/[storeSlug]/rifa/[raffleSlug]` comprueban la capacidad antes de ajustes o datos.
- Sin capacidad responden `302` al home canónico de la tienda con headers privados/no-store/noindex.
- El home resuelve capacidad antes de consultar Rifas y no renderiza ni serializa la sección bloqueada.
- Premium consume `POST /api/pz/raffles/public`, una ruta PocketBase canónica y saneada.
- El snapshot público no entrega código, hash, teléfono, comprobante, cancelaciones, metadatos internos ni relaciones de participantes.
- Los tres slugs fijos, números ocupados agregados, premios, resultado público y experiencia responsive existente se conservan.
- Nombre de tienda y WhatsApp se resuelven desde registros reales; los nuevos fallbacks de Rifas usan `Tu tienda`.

## 9. Participación y estado

Las rutas Astro `/api/raffles/enter` y `/api/raffles/status` son proxies privados/no-store hacia:

- `/api/pz/raffles/enter`;
- `/api/pz/raffles/status`.

El backend:

- acepta únicamente slugs canónicos y un payload cerrado;
- resuelve tienda activa Premium y rifa fija de esa tienda;
- valida enlace, configuración, estado/fechas, código, número `00–99`, teléfono, duplicados y reingreso;
- no confía en `storeId`, `raffleId`, nombres, estados ni metadatos enviados;
- bloquea antes de leer participaciones o generar notificaciones cuando no existe capacidad;
- crea la entrada y su aviso únicamente después de validar el flujo canónico;
- conserva recibo y enlaces, canonicalizados al origen HTTP del frontend;
- falla cerrado ante conflictos y no refleja errores internos.

## 10. Notificaciones

- Se retiró la creación anónima/directa de `raffle_entry_created`.
- El aviso de nueva participación solo se crea desde la ruta canónica después de guardar una entrada válida.
- El aviso contiene rifa/número y destino interno, pero no teléfono, código de acceso ni comprobante.
- El sidebar no consulta ni genera estado `resultado pendiente` sin Principal, capacidad vigente y permiso.
- No se modificaron notificaciones de pedidos, reseñas, Landing QR, vencimientos u otros módulos.
- Downgrade/upgrade no reescribe ni reproduce notificaciones históricas.

## 11. Downgrade, vencimiento y restauración

El gate no modifica registros por cambios de plan:

- no borra slots, configuración, códigos, fechas, estados, premios, imágenes, participantes, resultados o historial;
- no desactiva `link_enabled`, `show_in_store` ni visibilidad almacenada;
- durante el bloqueo impide edición, participación, publicación, descarga y nuevas notificaciones operativas;
- al restaurar Premium reaparecen los mismos datos y archivos;
- una rifa apagada manualmente continúa apagada;
- vencimiento usa la capacidad central con enforcement real y recupera datos al renovar;
- no se añadieron resets automáticos ni procesos de migración.

## 12. Aislamiento y privacidad

- La tienda se deriva del registro o slug resuelto por servidor.
- Una Premium no presta capacidad a otra Básica.
- IDs o relaciones de otra tienda no permiten abrir rifa, participación o archivo.
- Las respuestas públicas no incluyen datos de participantes ni secretos.
- No se encontraron source maps públicos en el build (`0` archivos `.map`).
- No quedaron TODO/FIXME, textos Codex/debug ni `console.log/info/warn` nuevos.
- Se corrigió y probó UTF-8 de los mensajes públicos y de premios JSON entregados por PocketBase.
- `access_code_hash` solo permanece en tipos/sanitización administrativa y pruebas; se elimina de respuestas y no aparece en HTML público.

## 13. Archivos modificados

### Backend

- `pb_hooks/pz_raffles_premium.pb.js`: registra las tres rutas canónicas.
- `pb_hooks/pz_raffles_premium_lib.js`: gate público, snapshot saneado, enter/status y notificación válida.
- `pb_hooks/pz_store_permission_enforcement_lib.js`: REST, tenant, notificaciones, archivos, realtime y cache policy.
- `pb_hooks/pz_store_permission_enforcement.pb.js`: registra middleware y descarga de archivos de Rifas.
- `tests/pz_r7p2_raffles_premium.test.cjs`: cobertura focal backend.
- `tests/pz_r7p2_http_runtime.test.cjs`: PocketBase y Astro reales, aislados y efímeros.

### Frontend

- `src/lib/raffleAccess.ts`: helper único SSR/admin/público.
- `src/lib/raffles.ts`: lectura pública mediante snapshot canónico.
- `src/pages/admin/promos/raffles.astro`: gate antes del editor.
- `src/pages/admin/promos.astro`: descubrimiento comercial solo para Principal bloqueado.
- `src/pages/api/admin/raffles.ts`: autorización previa a cualquier trabajo.
- `src/pages/api/raffles/enter.ts` y `status.ts`: proxies canónicos privados.
- `src/pages/t/[storeSlug]/rifa.astro` y `rifa/[raffleSlug].astro`: fallback `302`.
- `src/components/public-store/PublicStoreHome.astro`: no consulta Rifas bloqueadas.
- `src/components/admin/AdminSidebar.astro`: navegación y avisos conscientes de capacidad/permiso.
- `tests/r7p2RafflesPremium.test.mjs`: cobertura focal frontend.

### Documentación

- `docs/tusenda84/reportes/L7Q1-landing-qr-premium.md`: cierre documental previo.
- `docs/tusenda84/reportes/R7P2-rifas-premium.md`: este reporte.

## 14. Migraciones

**0 migraciones creadas o modificadas.** La solución usa hooks, rutas y capacidades vigentes.

## 15. Pruebas automatizadas

| Validación | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|
| Focal backend R7P2 | 12 | 0 | 0 |
| Focal frontend R7P2 | 11 | 0 | 0 |
| Runtime HTTP R7P2 | 1 | 0 | 0 |
| Suite completa backend | 576 | 0 | 7 |
| Suite completa frontend | 271 | 0 | 0 |

La suite backend ejecutó **583** pruebas totales: **576 aprobadas**, **0 fallidas**, **7 omitidas**. Las siete omisiones pertenecen a runtimes históricos opcionales que requieren URLs/credenciales externas `PZ_*` no configuradas: F7P8 multipart, M7U2 general, precio de pedidos, eliminación de usuarios, dispositivos de usuarios de tienda, U7I7 general y Price Watch. No se contaron como aprobadas y ninguna prueba R7P2 fue omitida.

La suite frontend ejecutó **271/271**.

## 16. Runtime HTTP real

El test creó una base PocketBase temporal con migraciones copiadas, superusuario efímero, actor Master, dos tiendas aisladas, rifas, una imagen y datos de prueba no reales. Usó puertos loopback aleatorios y eliminó todo al terminar.

Resultados comprobados:

- página Astro Premium: `200`, contenido público actual y sin código/hash;
- rutas Astro Básico `/rifa` y `/rifa/rifa-1`: `302` al home canónico, no-store/noindex;
- home Básico: `200` sin título, código ni sección serializada de la rifa;
- status frontend Básico: `404` genérico/no-store;
- snapshot PocketBase Premium: `200` saneado;
- snapshot/enter/status Básico: `404`, sin entrada ni notificación;
- REST anónimo de rifas y participaciones: `404`;
- enter/status Premium: flujo válido, una entrada y una notificación;
- archivo Premium: `200`;
- archivo tras downgrade: `404` y no-store;
- página Premium tras downgrade: `302`;
- restauración Premium: página/snapshot/archivo `200`, misma configuración, entrada y notificación sin duplicar.

Free y Premium vencido se cubrieron con el resolver central y pruebas focales; la ejecución HTTP usó Básico para el caso bloqueado. La sesión SSE realtime y el panel administrativo autenticado no se automatizaron en el runtime efímero: quedaron cubiertos por enforcement/pruebas focales y forman parte de la validación manual pendiente.

## 17. Build y calidad

- `npm.cmd run build`: **OK**.
- Astro SSR completó la salida server.
- Se mantuvieron tres warnings históricos de `getStaticPaths()` ignorado en rutas dinámicas de categoría, subcategoría y producto; no están relacionados con R7P2.
- Source maps públicos: **0**.
- `git diff --check`: **OK**.

## 18. Guía manual para Kraken — no ejecutada

1. Entrar como Principal Premium vigente y recorrer el editor completo.
2. Entrar como usuario Premium con `raffles.manage`.
3. Entrar como usuario Premium sin permiso y comprobar navegación/URL/API bloqueadas.
4. Validar Principal Básico y Free: gate comercial, sin editor ni carga privada.
5. Hacer downgrade Premium → Básico/Free y verificar conservación.
6. Restaurar Básico/Free → Premium y comparar toda la configuración.
7. Validar vencimiento y renovación del plan.
8. Mantener una rifa manualmente apagada durante downgrade/upgrade.
9. Revisar home público sin tarjetas, huecos ni datos de Rifas.
10. Abrir enlaces antiguos `/rifa` y `/rifa/[slug]`.
11. Intentar participación y consulta de estado con plan bloqueado.
12. Abrir imágenes antiguas bloqueadas y comprobar restauración posterior.
13. Desde F12 probar REST, PATCH/POST/DELETE, `fields/filter/sort/expand`, realtime y archivos.
14. Repetir cruces con dos tiendas de planes diferentes.
15. Verificar que las notificaciones no se duplican ni muestran datos sensibles.
16. Revisar PC, 1024, 768, 430, 390 y 375 px.
17. Completar flujo Premium: código, selección, espera, premios, cierre, ganador/no ganador y CTA del ganador.

## 19. Limpieza final

- fixtures temporales R7P2: **0**;
- directorios/base/imágenes runtime R7P2: **0**;
- procesos PocketBase/Node abiertos por R7P2: **0**;
- listeners temporales R7P2: **0**;
- endpoints temporales: comprobados como inaccesibles después del teardown;
- `frontend-powerzona/dist`: eliminado tras validar el build;
- `frontend-powerzona/.astro`: eliminado tras validar el build;
- terminales o procesos preexistentes: no se cerraron.

## 20. `git status --short` final

Cambios de R7P2 y del cierre documental requerido:

```text
 M backend-powerzona/pb_hooks/pz_store_permission_enforcement.pb.js
 M backend-powerzona/pb_hooks/pz_store_permission_enforcement_lib.js
 M docs/tusenda84/reportes/L7Q1-landing-qr-premium.md
 M frontend-powerzona/src/components/admin/AdminSidebar.astro
 M frontend-powerzona/src/components/public-store/PublicStoreHome.astro
 M frontend-powerzona/src/lib/raffles.ts
 M frontend-powerzona/src/pages/admin/promos.astro
 M frontend-powerzona/src/pages/admin/promos/raffles.astro
 M frontend-powerzona/src/pages/api/admin/raffles.ts
 M frontend-powerzona/src/pages/api/raffles/enter.ts
 M frontend-powerzona/src/pages/api/raffles/status.ts
 M frontend-powerzona/src/pages/t/[storeSlug]/rifa.astro
 M frontend-powerzona/src/pages/t/[storeSlug]/rifa/[raffleSlug].astro
?? backend-powerzona/pb_hooks/pz_raffles_premium.pb.js
?? backend-powerzona/pb_hooks/pz_raffles_premium_lib.js
?? backend-powerzona/tests/pz_r7p2_http_runtime.test.cjs
?? backend-powerzona/tests/pz_r7p2_raffles_premium.test.cjs
?? docs/tusenda84/reportes/R7P2-rifas-premium.md
?? frontend-powerzona/src/lib/raffleAccess.ts
?? frontend-powerzona/tests/r7p2RafflesPremium.test.mjs
```

No quedaron `dist`, `.astro`, `pb_data`, `pb_logs`, bases, capturas, logs ni fixtures generados.

## 21. Continuidad R7P2-C1 — gate del Principal

Kraken detectó manualmente que el middleware devolvía la pantalla global `No tienes permiso` al Administrador principal Básico antes de que la página SSR de Rifas pudiera mostrar su gate comercial. `R7P2-C1` corrigió esa precedencia exclusivamente para `promos/raffles`: el Principal alcanza el gate existente, mientras los usuarios adicionales siguen necesitando `raffles.manage`.

La validación C1 aprobó **14/14** pruebas focales frontend, **1/1** runtime HTTP autenticado, **274/274** pruebas frontend, **576** pruebas backend con **7 omisiones históricas externas**, y el build Astro SSR. No se relajaron API, REST, realtime, archivos, participaciones, notificaciones ni aislamiento; no hubo migraciones o dependencias nuevas.

**R7P2-C1 está implementado y R7P2 continúa EN REVISIÓN hasta la nueva confirmación manual de Kraken.**

## 22. R7P2-C2 — Restauración del layout de tarjetas

Kraken reportó que las tres tarjetas administrativas de Rifas mostraban una acción directa adicional `Ver historial`. La causa confirmada estaba en `renderList()`: `.raffle-row-actions` conservaba su cuadrícula aprobada de tres columnas, pero recibía cuatro hijos —tres botones y el menú kebab—, lo que forzaba desbordamiento y desalineación.

La corrección retiró únicamente el enlace directo `Ver historial` del template de las tarjetas. Cada tarjeta vuelve a contener exactamente:

1. `Ver rifa pública`;
2. `Configurar` o `Editar`;
3. menú de tres puntos.

No se ocultó contenido con CSS, no quedó una columna vacía y no se trasladó historial al menú contextual. El enlace `#raffle-history-link` del modal administrativo, `activityHistoryPath()` y la Actividad del equipo permanecen intactos. No fue necesario modificar CSS, tamaños, tipografías, estados, selección, participantes, resultados ni acciones contextuales.

Archivos finales modificados por C2:

- `frontend-powerzona/src/pages/admin/promos/raffles.astro`;
- `frontend-powerzona/tests/r7p2RafflesPremium.test.mjs`;
- `docs/tusenda84/reportes/R7P2-rifas-premium.md`.

Validaciones reales:

| Validación | Resultado |
|---|---:|
| Focal R7P2/R7P2-C1/R7P2-C2 | 15/15 |
| Suite frontend completa | 275/275 |
| Runtime HTTP R7P2 usado por el harness visual | 1/1 |
| Build Astro SSR | Aprobado |
| `git diff --check` | Aprobado |

`npm.cmd test` se ejecutó y confirmó que el proyecto no define el script `test`; por eso la suite completa se ejecutó directamente con Node sobre los 26 archivos `*.test.mjs`. No se ejecutó la suite backend completa porque C2 no deja cambios backend ni altera autorización; sí se ejecutó el runtime HTTP real necesario para levantar datos aislados de la validación visual.

La validación se realizó con Chromium real y Playwright del proyecto en **1440, 1024, 768, 430, 390 y 375 px**. En todos los anchos se comprobaron tres tarjetas uniformes, tres hijos funcionales por fila, dos acciones principales legibles, menú alineado y visible, ausencia de `Ver historial` directo o dentro del menú y **0 scroll horizontal**. La tarjeta seleccionada y las no seleccionadas conservaron la misma cuadrícula. Además, a 390 px el Principal Básico mantuvo shell administrativo + gate Premium, sin editor.

El build conservó únicamente los tres warnings históricos de `getStaticPaths()` en categoría, subcategoría y producto. Source maps públicos: **0**. Backend productivo, middleware C1, permisos, API, REST, realtime, archivos, rutas públicas y aislamiento no fueron modificados.

- Migraciones: **0**.
- Dependencias: **0**.
- Fixtures y directorios runtime temporales: **0**.
- Procesos temporales finales: **0**; se cerraron por PID exacto los tres procesos del primer harness que Windows dejó vivos.
- `dist` y `.astro`: eliminados.
- Capturas o harness visual persistentes: **0**.

`git status --short` final:

```text
 M backend-powerzona/pb_hooks/pz_store_permission_enforcement.pb.js
 M backend-powerzona/pb_hooks/pz_store_permission_enforcement_lib.js
 M docs/tusenda84/reportes/L7Q1-landing-qr-premium.md
 M frontend-powerzona/src/components/admin/AdminSidebar.astro
 M frontend-powerzona/src/components/public-store/PublicStoreHome.astro
 M frontend-powerzona/src/lib/raffles.ts
 M frontend-powerzona/src/middleware.ts
 M frontend-powerzona/src/pages/admin/promos.astro
 M frontend-powerzona/src/pages/admin/promos/raffles.astro
 M frontend-powerzona/src/pages/api/admin/raffles.ts
 M frontend-powerzona/src/pages/api/raffles/enter.ts
 M frontend-powerzona/src/pages/api/raffles/status.ts
 M frontend-powerzona/src/pages/t/[storeSlug]/rifa.astro
 M frontend-powerzona/src/pages/t/[storeSlug]/rifa/[raffleSlug].astro
?? backend-powerzona/pb_hooks/pz_raffles_premium.pb.js
?? backend-powerzona/pb_hooks/pz_raffles_premium_lib.js
?? backend-powerzona/tests/pz_r7p2_http_runtime.test.cjs
?? backend-powerzona/tests/pz_r7p2_raffles_premium.test.cjs
?? docs/tusenda84/reportes/R7P2-C1-gate-premium-rifas-principal.md
?? docs/tusenda84/reportes/R7P2-rifas-premium.md
?? frontend-powerzona/src/lib/raffleAccess.ts
?? frontend-powerzona/tests/r7p2RafflesPremium.test.mjs
```

**R7P2-C2 — EN REVISIÓN / PENDIENTE DE VALIDACIÓN MANUAL DE KRAKEN.**

**R7P2 — EN REVISIÓN.**

## 23. Operaciones no realizadas

No hubo `git add`, commit, push, merge, rebase, cambio de rama, despliegue, staging ni producción.

**R7P2 permanece EN REVISIÓN / PENDIENTE DE VALIDACIÓN MANUAL DE KRAKEN.**
