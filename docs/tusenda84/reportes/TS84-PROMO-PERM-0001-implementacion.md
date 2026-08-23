# TS84-PROMO-PERM-0001 — Capacidades, permisos y gates Promo

## 1. Ficha de control

| Campo | Resultado |
|---|---|
| Proyecto | Tu Senda 84 / Tiendas Promo |
| Prompt ID | `TS84-PROMO-PERM-0001` |
| Estado | **COMPLETADO** |
| Fecha | 2026-08-23 |
| Base | Rama local `dev`, commit `a61c4250693e338ce5a66035433ada4de4d1e18d` |
| Migración ejecutada | Sí, únicamente sobre bases PocketBase temporales y descartables |
| Base persistente | No se usó ni modificó `backend-powerzona/pb_data` |
| Infraestructura externa | No consultada ni modificada |
| Commit de este cierre | No creado; pendiente de autorización separada |

## 2. Resultado

Se implementó una capa aditiva y separada de autorización Promo que reutiliza `users`, `stores`, el administrador principal, `store_user_access`, el estado de equipo, el bloqueo por plan, las capacidades Commerce necesarias para el puente Landing QR y la rotación vigente de `tokenKey`. No se creó una identidad, membresía, rol, plantilla o sistema de sesiones paralelo.

El backend es la fuente de verdad. Cada acción Promo parte de un action key canónico y valida, en conjunto:

1. actor autenticado y sesión vigente mediante coincidencia no vacía de `tokenKey`;
2. usuario actual y `status=active`;
3. rol conocido;
4. pertenencia exacta a la tienda para Admin/Staff, o contexto de tienda explícito para soporte Master;
5. existencia 1:1 de `promo_sites`, que es la clasificación Promo aprobada en DATA-0001;
6. estado permitido de tienda y sitio para la acción;
7. entitlement vigente, fuente asignada, gate raíz y capacidades/cuotas requeridas;
8. permiso Promo efectivo; y
9. para el único puente permitido, permiso y capacidad Commerce simultáneos.

Una acción, capacidad o permiso desconocido, un grant corrupto, una tienda cruzada, un recurso de otro sitio, Commerce, una sesión revocada, un usuario suspendido, un bloqueo por plan o una capacidad ausente fallan cerrados. El frontend consume exclusivamente `allowed_actions` proyectadas por el backend y solo las usa para defensa visual.

## 3. Catálogo canónico final

### 3.1 Capacidades Promo

Las capacidades viven en `promo_site_entitlements`; no se añadieron a los planes o capabilities Commerce.

| Tipo | Capability | Regla |
|---|---|---|
| Boolean | `promo_site_enabled` | Gate raíz; sin él ninguna capacidad funcional Promo es efectiva |
| Boolean | `publish_enabled` | Permite publicar o rollback de publicación según actor/estado |
| Boolean | `custom_domain_enabled` | Permite gestión reservada de dominio |
| Boolean | `theme_customization_enabled` | Permite personalización de apariencia |
| Boolean | `multilanguage_enabled` | Permite traducciones/locales |
| Boolean | `video_enabled` | Permite medios de video |
| Boolean | `analytics_enabled` | Permite analítica Promo |
| Boolean | `landing_qr_bridge_enabled` | Habilita solo el puente explícito Landing QR |
| Límite | `max_services` | `0..50` |
| Límite | `max_gallery_assets` | `0..24` visibles |
| Límite | `max_locales` | `0..10` |
| Límite | `max_videos` | `0..3` |
| Límite | `max_storage_bytes` | `0..262144000` bytes (250 MiB) |

Los límites se resuelven con `requiredAmount` y rechazan valores no enteros, negativos, superiores al hard ceiling o mayores que la cuota asignada. Una fuente `unassigned`, una ventana no iniciada/vencida, una fecha inválida o un entitlement faltante no concede capacidad.

### 3.2 Permisos Promo asignables

| Permiso | Dependencia automática | Capacidades efectivas mínimas |
|---|---|---|
| `promo.site.view` | — | `promo_site_enabled` |
| `promo.content.manage` | `promo.site.view` | `promo_site_enabled` |
| `promo.media.manage` | `promo.site.view` | `promo_site_enabled` |
| `promo.theme.select` | `promo.site.view` | `promo_site_enabled` |
| `promo.appearance.manage` | `promo.site.view` | raíz + `theme_customization_enabled` |
| `promo.translations.manage` | `promo.site.view` | raíz + `multilanguage_enabled` |
| `promo.contact.manage` | `promo.site.view` | `promo_site_enabled` |
| `promo.reviews.manage` | `promo.site.view` | `promo_site_enabled` |
| `promo.analytics.view` | `promo.site.view` | raíz + `analytics_enabled` |
| `promo.publish` | `promo.site.view` | raíz + `publish_enabled` |

La normalización es estricta, deduplica, ordena por catálogo e incorpora dependencias. No acepta reserved keys ni elimina silenciosamente unknown keys en mutaciones.

### 3.3 Permisos reservados Master

- `promo.site.lifecycle.manage`
- `promo.entitlements.manage`
- `promo.domains.manage`
- `promo.theme_releases.manage`
- `promo.publication.rollback`
- `promo.support.access`

Estos permisos nunca se guardan en `store_user_access` ni son asignables al administrador principal, administrador secundario o staff. El Master debe ser activo, conservar una sesión vigente y declarar la tienda mediante `X-PZ-Promo-Store`. Las acciones operativas Master continúan respetando capacidad y estado; las acciones de recuperación/entitlements usan su gate reservado específico.

### 3.4 Action keys backend

| Action key | Permiso | Gate adicional relevante |
|---|---|---|
| `promo.site.view` | `promo.site.view` | sitio `draft/active/paused` |
| `promo.content.manage` | `promo.content.manage` | raíz Promo |
| `promo.media.manage` | `promo.media.manage` | almacenamiento mayor o igual a 1 byte |
| `promo.media.video.manage` | `promo.media.manage` | `video_enabled`, al menos 1 video |
| `promo.theme.select` | `promo.theme.select` | raíz Promo |
| `promo.appearance.manage` | `promo.appearance.manage` | personalización de tema |
| `promo.translations.manage` | `promo.translations.manage` | multilanguage y al menos 2 locales |
| `promo.contact.manage` | `promo.contact.manage` | raíz Promo |
| `promo.reviews.manage` | `promo.reviews.manage` | raíz Promo |
| `promo.analytics.view` | `promo.analytics.view` | sitio activo y analytics |
| `promo.publication.publish` | `promo.publish` | sitio `draft/active` y publish |
| `promo.landing_qr.bridge.manage` | `promo.content.manage` | gate Promo + `landing_qr.manage` + `landing_qr_enabled` Commerce |
| `promo.master.site.lifecycle` | reservado lifecycle | Master y contexto explícito |
| `promo.master.entitlements.manage` | reservado entitlements | Master y contexto explícito |
| `promo.master.domains.manage` | reservado domains | custom domain habilitado |
| `promo.master.theme_releases.manage` | reservado theme releases | Master y contexto explícito |
| `promo.master.publication.rollback` | reservado rollback | publish habilitado |
| `promo.master.support` | reservado support | Master y contexto explícito |

Los futuros módulos deben invocar uno de estos action keys y, para cantidades proyectadas como servicios, galería o bytes totales, validar además la capability numérica con el `requiredAmount` real. Un action key no catalogado se rechaza.

## 4. Matriz actor × tienda × capacidad × permiso

| Actor/estado | Tipo y tenant | Capacidad | Permiso | Resultado backend |
|---|---|---|---|---|
| Master activo, sesión viva | Promo explícita A | Presente | Reservado correspondiente | Permitido según estado/action key |
| Master activo, sesión viva | Sin header o Commerce | Cualquiera | Cualquiera | Denegado: contexto requerido o `store_not_promo` |
| Master activo, sesión viva | Promo A | Ausente | Acción operativa asignable | Denegado por capability; no existe override implícito |
| Administrador principal activo | Su Promo A | Presente | Asignable | Permitido implícitamente; filtrado por capability |
| Administrador principal activo | Su Promo A | Ausente | Asignable concedido implícitamente | Denegado por capability |
| Administrador principal activo | Promo B | Presente | Asignable | 404 saneado por cruce de tienda |
| Administrador secundario activo | Su Promo A | Presente | Grant explícito | Permitido |
| Administrador secundario activo | Su Promo A | Presente | Sin grant | Denegado por permiso efectivo |
| Staff activo | Su Promo A | Presente | Grant explícito | Permitido |
| Staff activo | Su Promo A | Presente | Sin grant | Denegado |
| Admin secundario o Staff | Su Promo A | Presente | Reservado Master | Denegado y no persistible |
| Cualquier usuario de tienda | Commerce | Incluso con grant Promo inyectado | Cualquiera | 404 `store_not_promo`; cero acciones Promo |
| Cualquier usuario | Promo | Unknown/ausente/vencida/excede límite | Cualquiera | Denegado, fail-closed |
| Cualquier usuario | Promo | Presente | Permiso o action key unknown | 400 en mutación o 403 en gate, sin reflexión del key |
| Usuario suspendido | Su Promo | Presente | Concedido | Denegado |
| Usuario bloqueado por plan | Su Promo | Presente | Persistido | Denegado; grant no se borra |
| Usuario con sesión revocada o sin tokenKey comprobable | Su Promo | Presente | Concedido | Denegado |
| Usuario activo | Promo A, recurso/site/store B | Presente | Concedido | 404 saneado |
| Usuario activo | Promo pausada/suspendida/retirada | Presente | Concedido | Solo acciones cuyos estados catalogados lo permitan; el resto 403 |

El administrador principal es la autoridad de equipo reutilizada para consultar y modificar grants Promo de secundarios/staff. Un Master usa el modo de soporte existente con contexto explícito. Secundarios y staff no pueden modificar grants. Toda modificación usa CAS por `promo_permissions_version`, transacción, auditoría mínima y rotación de `tokenKey` del usuario afectado.

## 5. Contratos privados implementados

Se añadieron cuatro rutas `POST`, todas con `requireAuth`, body limit, headers `private, no-store`, payload exacto y sin CRUD genérico:

- `/api/pz/promo/access/context`
- `/api/pz/promo/team/detail`
- `/api/pz/promo/team/update-permissions`
- `/api/pz/promo/master/entitlements/update`

`store_id`, `site_id`, actor, role, `filter`, `sort`, `fields`, `expand` y cualquier campo adicional se rechazan en los bodies. El tenant Admin se deriva del usuario recargado; el contexto Master viaja únicamente en `X-PZ-Promo-Store`.

Las respuestas no exponen IDs de actor/tienda/sitio, `tokenKey`, email, teléfono ni contenido interno. El contexto devuelve capacidades efectivas, permisos efectivos y `allowed_actions`. La edición Master devuelve el snapshot raw del entitlement solo dentro de su endpoint privado para soportar CAS.

Las mutaciones estrechas escriben eventos de seguridad en `promo_audit_events`, pero no implementan el alcance general, lectores, retención o integración de actividad correspondiente a `TS84-PROMO-AUDIT-0001`; ese prompt no fue iniciado.

## 6. Migración

| Archivo | Cambio focal |
|---|---|
| `backend-powerzona/pb_migrations/1787520400_promo_permissions.js` | Añade a `store_user_access` los fields ocultos opcionales `promo_permissions_json` y `promo_permissions_version` |

No hay backfill. Los registros existentes se interpretan como grant Promo vacío y versión cero. No se modifican `permissions_json`, `template_code`, roles, reglas, índices, defaults o plantillas Commerce.

El `down` pagina todos los accesos y solo elimina sus dos fields si cada grant está vacío y cada versión es cero. Ante grants, corrupción o versión distinta de cero aborta con `unsafe_rollback_promo_permissions` y conserva el schema. Se comprobó tanto el rollback vacío como el bloqueo con datos usando PocketBase temporal.

## 7. Compatibilidad Commerce preservada

En `a61c425` el catálogo ejecutable contiene 29 permisos asignables Commerce: los 28 históricos documentados más `marketing.push.manage`, ya incorporado antes de este prompt. También contiene cinco permisos reservados, seis plantillas y nueve capacidades. PERM-0001 preservó esos valores y su comportamiento exactos; no añadió ninguna clave `promo.*` a sus catálogos, plantillas, defaults o matrices.

No se modificaron rutas o hooks productivos Commerce. El único campo compartido ampliado fue `store_user_access`, de forma opcional y semánticamente independiente. Landing QR permanece como puente doble explícito: el permiso Promo nunca concede `landing_qr.manage` ni `landing_qr_enabled`.

No existe dependencia Promo de pedidos, catálogo, productos, precios, inventario, carrito, checkout o promociones e-commerce. No fue necesario desacoplar ninguna dependencia Commerce.

## 8. Archivos modificados o añadidos

### Backend

- `backend-powerzona/pb_hooks/pz_promo_permissions_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_permissions_api_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_permissions.pb.js`
- `backend-powerzona/pb_migrations/1787520400_promo_permissions.js`
- `backend-powerzona/tests/pz_promo_permissions.test.cjs`
- `backend-powerzona/tests/pz_promo_permissions_api.test.cjs`
- `backend-powerzona/tests/pz_promo_permissions_http_runtime.test.cjs`
- `backend-powerzona/tests/pz_promo_data_http_runtime.test.cjs` — adaptación del gate DATA para reconocer la migración aditiva posterior sin cambiar sus invariantes

### Frontend

- `frontend-powerzona/src/lib/promoAccess.ts`
- `frontend-powerzona/tests/promoAccess.test.mjs`

### Documentación

- `docs/tusenda84/reportes/TS84-PROMO-PERM-0001-implementacion.md`

## 9. Pruebas ejecutadas y resultados

### 9.1 Baseline focal previo

Se ejecutaron las suites existentes de equipo, permisos granulares, capacidades, planes y DATA antes de implementar: **123/123 aprobadas**.

### 9.2 Pruebas nuevas Promo

Comando final backend:

```text
node --test tests/pz_promo_permissions.test.cjs tests/pz_promo_permissions_api.test.cjs tests/pz_promo_permissions_http_runtime.test.cjs
```

Resultado: **17/17 aprobadas**, cero fallos y cero omisiones.

El gate runtime usa PocketBase local `0.39.8`, genera secretos sintéticos y bases bajo el directorio temporal del sistema y las elimina en `finally`. El conjunto de pruebas unitarias y runtime cubrió:

- Master, principal, secundario, staff, suspendido y bloqueado por plan;
- dos tiendas Promo aisladas y una Commerce;
- capabilities presentes, ausentes, deshabilitadas, desconocidas y cuotas;
- permisos concedidos, denegados, reservados, desconocidos y grants corruptos;
- sesión revocada, relogin y rotación de token;
- manipulación de store/site, target, body, filtros, fields, sort y expand;
- REST directo como secundario y Master;
- suscripciones realtime directas a datos Promo y grants privados;
- CAS de permisos/entitlements;
- Admin incapaz de modificar entitlements;
- Commerce incapaz de obtener acciones Promo aun con grant inyectado;
- rollback PERM vacío y rollback bloqueado con grants.

El gate DATA adaptado volvió a aprobar **1/1**, incluidas sus 13 colecciones, 42 índices, aislamiento, límites, REST cerrado y rollback seguro. La migración PERM se retira primero en su escenario vacío sin alterar las cuatro migraciones DATA.

### 9.3 Regresión backend completa

Comando final desde `backend-powerzona`:

```text
node --test
```

Resultado: **790 tests; 783 aprobados, 0 fallos, 7 omitidos**. Las omisiones corresponden a pruebas que exigen URLs/credenciales de entornos externos o configuración runtime no disponible y no se habilitaron por las prohibiciones del prompt. Los runtimes locales descartables sí se ejecutaron.

Una primera corrida paralela al build frontend tuvo un timeout de readiness Astro en R7P2; la prueba pasó **1/1** aislada y la corrida backend completa posterior, sin competencia del build, terminó con cero fallos.

La regresión incluye planes, Mi equipo, permisos granulares, Master/Admin, Landing QR, módulos protegidos, pedidos, catálogo, inventario, promociones e-commerce, seguridad y realtime existentes.

### 9.4 Frontend y build

```text
node --test
npm.cmd run build
```

Resultado final: **655/655 pruebas frontend aprobadas** y build Astro completado. Persisten tres warnings preexistentes de `getStaticPaths()` ignorado en páginas dinámicas de categoría, subcategoría y producto; no están relacionados con PERM-0001.

### 9.5 Calidad del diff

- `git diff --check`: sin errores de whitespace.
- Dependencias nuevas: ninguna.
- Push, merge, deploy, release y commit: no realizados.

## 10. Riesgos residuales

| Riesgo | Tratamiento |
|---|---|
| Un módulo futuro podría comprobar solo el permiso y omitir una cuota proyectada | Debe usar el action key canónico y `resolvePromoCapabilityAccess(..., { requiredAmount })`; documentado como contrato de integración |
| El CLI de PocketBase puede devolver exit code 0 aunque un callback `down` aborte | La prueba exige el marcador `unsafe_rollback_promo_permissions` y verifica que los fields permanezcan |
| Los catálogos se replican en TypeScript para defensa visual | Una prueba exige paridad exacta con backend; la decisión de acceso sigue viniendo de `allowed_actions` |
| No existe todavía UI Promo integrada al shell Admin/Master | Es intencional: `ADMIN-SHELL-0001` y `MASTER-0001` no se iniciaron; la API y el helper visual quedan listos |
| Auditoría Promo general todavía no está implementada | Solo se registran las dos mutaciones críticas de PERM; `AUDIT-0001` sigue pendiente |

## 11. Siguiente Prompt ID habilitado

Con DATA-0001 y PERM-0001 completados, el siguiente Prompt ID del camino crítico habilitado es **`TS84-PROMO-PUBCFG-0001`**: contrato público saneado y contrato privado de edición. **No fue iniciado.**

`TS84-PROMO-AUDIT-0001`, `TS84-PROMO-DOM-CORE-0001` y `TS84-PROMO-ADMIN-SHELL-0001` también satisfacen sus dependencias directas de PERM según el mapa, pero no se inició ninguno de ellos.

No se consultaron ni modificaron PocketBase desplegado, Cloudflare, Coolify, staging o producción. No se leyeron secretos y no se creó commit.
