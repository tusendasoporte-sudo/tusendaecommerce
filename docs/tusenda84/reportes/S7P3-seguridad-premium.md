# REPORTE TÉCNICO — PROMPT ID: S7P3

Estado: **S7P3 — EN REVISIÓN / PENDIENTE DE VALIDACIÓN MANUAL DE KRAKEN**

Fecha: **6 de agosto de 2026**  
Source de trabajo: **V122**  
Rama: **dev**  
Ruta oficial: `E:\Trabajo\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt`

## 1. Objetivo

Aplicar el gate real de Plan Premium y vigencia al módulo privado Seguridad sin borrar su información, manteniendo permisos granulares, aislamiento por tienda, lectura histórica Master y el alcance público previamente aprobado.

## 2. Cierre documental previo

Antes de programar S7P3 se agregó el cierre confirmado al reporte `R7P2-rifas-premium.md`:

- R7P2: **COMPLETADO** en Source V121;
- confirmación manual de Kraken: 25 de julio de 2026;
- 17 bloques manuales y correcciones R7P2-C1/C2 aprobados;
- sin push, staging ni production.

## 3. Matriz efectiva S7P3

| Escenario | Resultado |
|---|---|
| Principal Premium vigente + Seguridad habilitada | Panel completo y acciones según configuración Master. |
| Usuario Premium con `security.view` | Lectura privada dentro de su tienda. |
| Usuario Premium con `security.manage` | Lectura y acciones privadas autorizadas. |
| Usuario sin permiso | Ruta, endpoints, REST y realtime bloqueados. |
| Principal Free/Básico | Navegación hacia gate comercial; no se consulta configuración ni se montan datos privados. |
| Principal Premium vencido | Mismo gate comercial fail-closed; sin pérdida de datos. |
| Master Admin | Conserva configuración y lectura histórica aunque el plan no incluya Seguridad. |
| Otra tienda | Recurso oculto con semántica 404 existente. |

La autorización privada exige simultáneamente:

1. capacidad `security_enabled` incluida en el plan;
2. vigencia efectiva mediante `enforceExpiration: true`;
3. permiso `security.view` o `security.manage` según la acción;
4. pertenencia al tenant real del recurso.

## 4. Frontend

Se creó `src/lib/securityAccess.ts` como contrato SSR único para resolver capacidad, contexto de acceso, Principal, lectura, gestión y autorización final.

La ruta canónica `/t/[storeSlug]/admin/security` ahora:

- permite que el Principal sin capacidad llegue al gate comercial;
- devuelve 404 privado si un actor no autorizado alcanza directamente la página;
- no lee `store_security_settings` cuando muestra el gate;
- no procesa formularios POST ni llama endpoints de resumen, clientes, actividad, visitantes o bloqueos sin acceso efectivo;
- no monta `SecurityMonitoringView` ni `LastModificationMeta` durante el gate;
- explica que configuración, clientes, eventos, bloqueos y auditoría permanecen guardados;
- trata Premium vencido como gate de plan mediante `planExpiredUsesPlanGate`.

El middleware mantiene el permiso `security.view` para usuarios adicionales y agrega una excepción comercial exclusiva del Principal en `security` y `security/*`. Las rutas legacy y el detalle de visitante redirigen al gate antes de consultar ajustes o datos privados.

El sidebar evalúa `security_enabled` y vigencia antes de leer configuración. Free, Básico y vencido muestran Seguridad únicamente al Principal para descubrimiento comercial; Premium continúa mostrando el módulo solo si existe permiso efectivo y la configuración Master está habilitada.

## 5. Backend

`pz_security_monitoring_lib.js` y `pz_security_identity_lib.js` ahora comprueban explícitamente `security_enabled` con vigencia antes de aceptar permisos de tienda. Master conserva su bypass histórico y el cruce de tenant conserva 404.

`pz_store_permission_enforcement_lib.js` define las colecciones privadas cubiertas:

- `store_security_settings`;
- `store_security_events`;
- `store_security_blocks`;
- `store_visitor_sessions`;
- `store_customers`.

El gate explícito se aplica a lectura REST, mutaciones y suscripción/mensajes realtime. La comprobación granular previa de `security.view`/`security.manage` se mantiene como segunda barrera.

No se agregaron migraciones, colecciones, campos, dependencias, rutas públicas ni reglas de bloqueo público. `track-navigation`, `register-order` y el enforcement público previamente existente no recibieron un gate o comportamiento nuevo dentro de S7P3.

## 6. Conservación durante downgrade

Cambiar Premium a Básico/Free o vencer el plan modifica únicamente el acceso efectivo. S7P3 no elimina ni reescribe:

- `store_security_settings`;
- clientes canónicos y señales relacionadas;
- eventos de Seguridad;
- sesiones/visitas existentes;
- bloqueos activos o históricos;
- auditoría especializada o central.

Al recuperar Premium vigente, la capacidad y los permisos vuelven a resolver sobre los mismos registros. La configuración almacenada, incluido su estado habilitado/deshabilitado, no se reactiva ni se modifica artificialmente.

## 7. Pruebas agregadas

### Backend focal

`backend-powerzona/tests/pz_s7p3_security_premium.test.cjs` cubre:

- Premium vigente frente a Free, Básico, vencido e inválido;
- 403 para Principal sin capacidad en endpoints privados;
- autoridad histórica Master;
- REST y realtime fail-closed;
- preservación exacta durante downgrade/upgrade;
- ausencia de ampliación del enforcement público.

Resultado: **5/5 aprobadas, 0 fallidas, 0 omitidas**.

### Frontend focal

`frontend-powerzona/tests/s7p3SecurityPremium.test.mjs` cubre:

- matriz de capacidad y vencimiento;
- gate sin lectura ni montaje de datos privados;
- POST y acciones detrás de autorización;
- excepción middleware exclusiva del Principal;
- descubrimiento seguro en sidebar;
- rutas legacy y visitante;
- superficie pública sin cambios.

Resultado: **7/7 aprobadas, 0 fallidas, 0 omitidas**.

## 8. Regresión completa

| Validación | Resultado |
|---|---|
| Backend completo | **588 totales: 581 aprobadas, 0 fallidas, 7 omitidas declaradas** |
| Frontend completo | **283/283 aprobadas, 0 fallidas, 0 omitidas** |
| Astro SSR build | **Aprobado** |
| Artefactos públicos del build | **0 source maps y 0 marcadores internos/console de diagnóstico** |
| `git diff --check` | **Aprobado** |

Las siete omisiones backend son runtimes históricos opcionales condicionados por variables/credenciales externas. Ninguna prueba S7P3 fue omitida. El build conservó únicamente los tres warnings históricos de `getStaticPaths()` en categoría, subcategoría y producto.

## 9. Producción, privacidad y alcance

- Cabeceras privadas/no-store se mantienen en páginas y endpoints de Seguridad.
- El gate no serializa clientes, eventos, bloqueos, ajustes ni contadores privados.
- No se añadieron datos sensibles, IDs, HMAC, ciphertext, token o motivos internos al HTML.
- No se modificó `checkOrigin` ni se creó bypass local.
- No se implementó ni amplió BLOCKS03B o enforcement público.
- Los artefactos temporales `frontend-powerzona/dist`, `frontend-powerzona/.astro` y el `.tmp` backend vacío se eliminaron después de la verificación.
- Migraciones: **0**.
- Dependencias: **0**.

## 10. Archivos funcionales

Backend:

- `backend-powerzona/pb_hooks/pz_security_monitoring_lib.js`
- `backend-powerzona/pb_hooks/pz_security_identity_lib.js`
- `backend-powerzona/pb_hooks/pz_store_permission_enforcement_lib.js`
- `backend-powerzona/tests/pz_s7p3_security_premium.test.cjs`

Frontend:

- `frontend-powerzona/src/lib/securityAccess.ts`
- `frontend-powerzona/src/middleware.ts`
- `frontend-powerzona/src/components/admin/AdminSidebar.astro`
- `frontend-powerzona/src/pages/admin/security.astro`
- `frontend-powerzona/src/pages/admin/security/visitors/[visitorSessionId].astro`
- `frontend-powerzona/src/pages/t/[storeSlug]/admin/security.astro`
- `frontend-powerzona/src/pages/t/[storeSlug]/admin/security/visitors/[visitorSessionId].astro`
- `frontend-powerzona/tests/s7p3SecurityPremium.test.mjs`
- `frontend-powerzona/tests/m7u2C3FrontendPermissions.test.mjs`

Documentación:

- `docs/tusenda84/reportes/R7P2-rifas-premium.md`
- `docs/tusenda84/Bitacora de Errores y Actualziaciones.md`
- `docs/tusenda84/reportes/S7P3-seguridad-premium.md`
- `docs/tusenda84/reportes/S7P3-manual-pruebas-seguridad-premium.md`

## 11. Guía de validación manual para Kraken

El procedimiento detallado, la matriz de cuentas, los 17 bloques ejecutables, los controles F12 y la plantilla de confirmación están en `docs/tusenda84/reportes/S7P3-manual-pruebas-seguridad-premium.md`.

1. Principal Premium vigente: abrir Seguridad y recorrer Resumen, Actividad, Clientes, Visitantes, Bloqueados y Reglas.
2. Usuario Premium con `security.view`: confirmar lectura sin acciones; con `security.manage`, confirmar acciones autorizadas.
3. Usuario Premium sin permiso: confirmar ausencia del módulo y bloqueo de URL/endpoints.
4. Principal Básico y Free: confirmar enlace Seguridad, gate Premium, ausencia de flash del panel y cero respuestas privadas en F12.
5. Downgrade Premium → Básico y posterior upgrade: comprobar restauración exacta de configuración, clientes, eventos, visitantes, bloqueos y auditoría.
6. Premium vencido y renovado: confirmar gate, bloqueo privado y restauración sin pérdida.
7. Seguridad deshabilitada por Master: confirmar comportamiento histórico aprobado sin confundirlo con el gate de plan.
8. Master: confirmar configuración y lectura histórica de una tienda Básica/vencida sin habilitar acceso al Principal.
9. Dos tiendas: intentar IDs, rutas y sesiones cruzadas; confirmar aislamiento 404 y ausencia de filtraciones.
10. Probar 1440, 1024, 768, 430, 390 y 375 px; revisar REST, fields/filter/sort/expand, realtime y DOM/F12.

## 12. Operaciones no realizadas

No hubo `git add`, commit, push, merge, rebase, cambio de rama, despliegue, staging ni production.

S7P3 queda **EN REVISIÓN**. No debe marcarse COMPLETADO hasta la confirmación manual explícita de Kraken.
