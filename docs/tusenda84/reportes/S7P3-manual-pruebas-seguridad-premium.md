# MANUAL DE PRUEBAS MANUALES — S7P3 SEGURIDAD PREMIUM

Estado: **PENDIENTE DE EJECUCIÓN Y CONFIRMACIÓN DE KRAKEN**  
Fecha de preparación: **6 de agosto de 2026**  
Source de referencia: **V122**  
Módulo: **Admin de tienda → Seguridad**  
Ruta canónica: `/t/{storeSlug}/admin/security`

Este manual valida el gate de Plan Premium y vigencia de Seguridad, sus permisos privados, la conservación de información al bajar de plan y el aislamiento entre tiendas. Completar todos los bloques no cambia automáticamente el estado documental: S7P3 solo podrá marcarse **COMPLETADO** después de la confirmación explícita de Kraken.

## 1. Objetivo de aceptación

La prueba se considera satisfactoria cuando se confirma que:

- Premium vigente permite usar Seguridad conforme a `security.view` y `security.manage`;
- el Principal Free, Básico o Premium vencido puede descubrir el módulo, pero solo ve el gate comercial;
- el gate no consulta, serializa ni monta configuración, clientes, eventos, visitantes o bloqueos privados;
- un usuario adicional sin capacidad o permiso no obtiene el gate comercial ni datos privados;
- endpoints, REST, mutaciones y realtime fallan de forma cerrada sin capacidad;
- configuración, clientes, eventos, visitantes, bloqueos y auditoría se conservan durante downgrade, vencimiento y posterior restauración;
- Master mantiene acceso histórico sin habilitar el módulo al administrador de tienda;
- no existe acceso cruzado entre tiendas;
- S7P3 no amplía el bloqueo público fuera del alcance aprobado.

## 2. Alcance y exclusiones

Incluido:

- navegación y render SSR del Admin de tienda;
- rutas canónica y legacy de Seguridad;
- Resumen, Actividad, Clientes, Visitantes de hoy, Clientes bloqueados y Reglas;
- permisos `security.view` y `security.manage`;
- planes Premium, Básico, Free y Premium vencido;
- configuración Master de Seguridad;
- endpoints privados `/api/pz/security/*`;
- colecciones privadas vía REST y realtime;
- aislamiento por tienda y preservación de datos;
- revisión responsive y F12.

Fuera de alcance:

- ampliar reglas de bloqueo público o BLOCKS03B;
- modificar datos reales de producción;
- probar borrado permanente de una ficha, fusión de clientes o eliminación de una tienda con información real;
- cambiar reglas, migraciones o permisos desde PocketBase durante la ejecución;
- compartir cookies, tokens, HMAC, ciphertext, IDs completos sensibles o archivos HAR sin sanear.

## 3. Reglas de seguridad para ejecutar el manual

1. Usar staging o un ambiente local controlado. No ejecutar cambios de plan o bloqueos sobre producción sin autorización expresa.
2. Trabajar únicamente con tiendas, clientes, pedidos y usuarios de prueba.
3. Antes de cambiar plan, vigencia o configuración, registrar el estado original para restaurarlo al final.
4. Para acciones reversibles usar un cliente de prueba identificable. No usar clientes reales.
5. No ejecutar `Eliminar ficha` ni `Fusionar clientes` salvo que la tienda completa sea un fixture desechable y exista autorización específica.
6. No pegar tokens en capturas, chat, bitácora o reporte. Si se exporta un HAR, eliminar `Authorization`, cookies y datos personales antes de adjuntarlo.
7. Mantener abierta una sesión por perfil o usar ventanas privadas separadas para evitar mezclar cuentas.
8. Si aparece una fuga de datos entre tiendas, detener el bloque, conservar evidencia saneada y reportarlo como prioridad crítica.

## 4. Matriz mínima de cuentas y tiendas

Preparar los siguientes actores. Los nombres son referencias; pueden sustituirse por fixtures equivalentes.

| Código | Actor | Tienda | Plan/estado inicial | Permisos |
|---|---|---|---|---|
| `M` | Master Admin | Global | No aplica | Autoridad Master |
| `PA` | Administrador Principal | Tienda A | Premium vigente | Principal implícito |
| `VA` | Usuario de lectura | Tienda A | Premium vigente | `security.view`, sin `security.manage` |
| `GA` | Usuario gestor | Tienda A | Premium vigente | `security.manage` y su dependencia `security.view` |
| `NA` | Usuario sin Seguridad | Tienda A | Premium vigente | Sin `security.view` ni `security.manage` |
| `PB` | Administrador Principal | Tienda B | Básico o Free | Principal implícito |

Requisitos de datos:

- Tienda A con Seguridad habilitada desde Master;
- al menos un cliente de prueba visible;
- al menos un evento y una visita de prueba, si el ambiente permite generarlos;
- preferiblemente un bloqueo temporal reversible;
- Tienda B distinta, con IDs y slug conocidos solo por el probador;
- una tienda Premium vencida preparada previamente, o autorización para usar un fixture de vencimiento. La interfaz Master ordinaria no debe forzarse ni alterarse para fabricar una fecha pasada.

## 5. Hoja de línea base

Completar antes del primer cambio de plan. Guardar los identificadores solo en evidencia privada y, en el manual compartido, anotar como máximo sus últimos seis caracteres.

| Dato de Tienda A | Valor inicial | Valor final restaurado |
|---|---|---|
| Plan |  |  |
| Vigencia temporal/permanente |  |  |
| Fecha de vencimiento |  |  |
| Seguridad habilitada |  |  |
| Modo: monitoreo/protección |  |  |
| Visibilidad de IP |  |  |
| Política VPN/proxy: off/monitor/block |  |  |
| Bloqueo manual |  |  |
| Acceso completo |  |  |
| Bloqueos permanentes |  |  |
| Notificación de intentos |  |  |
| Clientes registrados |  |  |
| Clientes archivados |  |  |
| Eventos visibles |  |  |
| Visitantes visibles |  |  |
| Bloqueos activos |  |  |
| Último registro de auditoría |  |  |

También registrar, para un único cliente de prueba:

- estado normal/observación/archivado;
- cantidad de pedidos y eventos asociados;
- teléfonos y dispositivos mostrados;
- bloqueos activos e historial de bloqueos;
- último cambio visible.

## 6. Preparación del navegador y evidencias

1. Abrir DevTools con F12.
2. En **Network**, activar `Preserve log` y `Disable cache` mientras DevTools esté abierto.
3. Limpiar Network antes de cada bloque.
4. Usar los filtros `security`, `store_security`, `customers`, `events`, `blocks` y `visitors` cuando corresponda.
5. En **Console**, limpiar antes de cada bloque y registrar cualquier error nuevo.
6. En **Application/Storage**, no copiar cookies ni tokens a la evidencia.
7. Para cada bloque guardar:
   - una captura del resultado visual;
   - una captura de Network con URL y código HTTP, ocultando datos sensibles;
   - viewport, actor, plan y hora;
   - resultado `APROBADO`, `FALLIDO` o `BLOQUEADO`.

Convención recomendada: `S7P3-M01-premium-principal-1440.png`, `S7P3-M05-basic-gate-network.png`, etc.

## 7. Criterios generales de resultado

- **APROBADO:** todos los pasos producen el resultado esperado y no existe fuga privada.
- **FALLIDO:** hay un resultado distinto, un bypass, datos privados en el gate, una acción no autorizada, pérdida de datos o cruce de tienda.
- **BLOQUEADO:** el ambiente o fixture no permite ejecutar el caso. No cuenta como aprobado.
- Los `401/403` se aceptan para falta de autenticación/capacidad/permiso según la superficie.
- El cruce de tenant debe ocultar el recurso con semántica `404` o con la redirección segura de contexto indicada en el caso.
- Una suscripción realtime rechazada puede variar en la presentación del cliente, pero nunca debe entregar mensajes privados.

## 8. Bloques de prueba

### S7P3-M01 — Preparación y línea base

Prioridad: **P0**  
Actor: `M` y `PA`

Pasos:

1. Como Master, abrir `/master/stores/{storeId}/plan` para Tienda A.
2. Confirmar Premium vigente y que la capacidad **Seguridad** aparece incluida.
3. Abrir la ficha de Tienda A y seleccionar **Configurar Seguridad**.
4. Confirmar **Seguridad habilitada** y registrar todos los valores de configuración.
5. Como `PA`, abrir `/t/{storeSlugA}/admin/security` y completar la hoja de línea base.
6. Guardar una captura de cada pestaña con datos existentes.

Resultado esperado:

- el plan y la configuración coinciden con la matriz;
- la línea base queda completa antes de cualquier mutación;
- no se cambia todavía ningún dato.

### S7P3-M02 — Principal Premium vigente

Prioridad: **P0**  
Actor: `PA`

Pasos:

1. Iniciar sesión como Administrador Principal de Tienda A.
2. Confirmar que **Seguridad** aparece en el sidebar.
3. Abrir la ruta canónica.
4. Recorrer **Resumen**, **Actividad**, **Clientes**, **Visitantes de hoy**, **Clientes bloqueados** y **Reglas**.
5. Abrir un cliente y, si existe, una sesión de visitante.
6. Revisar paginación, filtros y retorno hacia la lista.
7. Abrir `/admin/security` y confirmar redirección a la ruta canónica de Tienda A.

Resultado esperado:

- el panel se muestra sin gate comercial;
- cada pestaña carga solo datos de Tienda A;
- la ruta legacy termina en `/t/{storeSlugA}/admin/security`;
- no hay errores nuevos de consola ni respuestas privadas fallidas inesperadas.

### S7P3-M03 — Usuario con `security.view`

Prioridad: **P0**  
Actor: `VA`

Pasos:

1. En **Mi equipo**, confirmar que `VA` tiene `security.view` y no `security.manage`.
2. Iniciar sesión como `VA` y abrir Seguridad desde el sidebar.
3. Recorrer las seis secciones y abrir un detalle permitido.
4. Verificar menús, botones y formularios de observación, archivo, bloqueo, desbloqueo y fusión.
5. Intentar una mutación directa controlada con la sesión de `VA`, sin usar un dato real.

Resultado esperado:

- `VA` puede leer datos privados de Tienda A;
- las acciones de gestión no se muestran o permanecen deshabilitadas;
- una mutación directa es rechazada con `403` y no cambia registros;
- no se filtran datos de otra tienda.

### S7P3-M04 — Usuario con `security.manage`

Prioridad: **P0**  
Actor: `GA`

Pasos:

1. Confirmar en **Mi equipo** que `GA` tiene `security.manage` y `security.view` efectivo.
2. Abrir un cliente de prueba.
3. Activar observación con un motivo de prueba.
4. Crear un bloqueo temporal permitido, con alcance y señales disponibles documentadas.
5. Confirmar que el cliente aparece en **Clientes bloqueados**.
6. Revocar el bloqueo con un motivo de prueba.
7. Desactivar observación y devolver el cliente a su estado inicial.
8. Revisar historial/auditoría y mensajes de éxito.

Resultado esperado:

- todas las acciones autorizadas funcionan y quedan auditadas;
- los cambios se limitan a Tienda A y al cliente de prueba;
- el bloqueo aparece y desaparece de las vistas correspondientes;
- al finalizar, el cliente queda restaurado a su línea base.

No ejecutar eliminación de ficha ni fusión salvo fixture desechable autorizado.

### S7P3-M05 — Usuario Premium sin permiso

Prioridad: **P0**  
Actor: `NA`

Pasos:

1. Confirmar que `NA` no tiene `security.view` ni `security.manage`.
2. Iniciar sesión como `NA`.
3. Revisar el sidebar.
4. Abrir directamente `/t/{storeSlugA}/admin/security`.
5. Abrir directamente una URL conocida de visitante bajo `security/visitors/{visitorSessionId}`.
6. Intentar lectura y mutación privadas con la sesión de `NA`.

Resultado esperado:

- Seguridad no aparece en el sidebar;
- la URL canónica y el detalle privado no muestran el gate ni datos; responden con ocultación privada `404` o salida segura equivalente;
- endpoints privados responden `403` y REST/realtime no entregan información;
- el usuario adicional no recibe el gate comercial reservado al Principal.

### S7P3-M06 — Principal con Plan Básico

Prioridad: **P0**  
Actor: `PB` o `PA` después de un downgrade controlado

Pasos:

1. Confirmar desde Master que la tienda está en Plan Básico vigente.
2. Iniciar sesión como su Administrador Principal.
3. Confirmar que **Seguridad** aparece como opción de descubrimiento comercial.
4. Limpiar Network y abrir Seguridad.
5. Observar desde el primer render hasta que la página termine de cargar.
6. Buscar en Network solicitudes a endpoints `/api/pz/security/*` y colecciones `store_security_*`, `store_customers` y `store_visitor_sessions`.
7. Revisar el DOM/HTML visible buscando nombres, teléfonos, IP, IDs, motivos, contadores o eventos privados.
8. Intentar abrir una URL legacy y un detalle de visitante conocido.

Resultado esperado:

- se muestra **Plan Premium requerido** y el mensaje de conservación;
- no hay flash del panel real ni montaje de `SecurityMonitoringView`;
- no se solicitan ajustes, resumen, clientes, actividad, visitantes o bloqueos privados;
- el HTML no contiene información privada;
- legacy y detalle terminan en el gate canónico antes de leer datos.

### S7P3-M07 — Principal con Plan Free

Prioridad: **P0**  
Actor: Principal de una tienda Free

Repetir íntegramente S7P3-M06 con Plan Free.

Resultado esperado:

- mismo gate comercial fail-closed que en Básico;
- cero carga o serialización privada;
- ninguna diferencia de autorización causada por el nombre o antigüedad de la tienda.

### S7P3-M08 — Downgrade Premium a Básico

Prioridad: **P0**  
Actores: `M`, después `PA`

Pasos:

1. Confirmar que S7P3-M01 está completo y conservar sus evidencias.
2. Como Master, abrir `/master/stores/{storeIdA}/plan`.
3. Seleccionar **Asignar Básico**, definir una vigencia de prueba y registrar el motivo `QA S7P3 downgrade`.
4. Confirmar el cambio.
5. Cerrar o renovar la sesión de `PA` según lo requiera el flujo normal.
6. Abrir Seguridad como `PA` y repetir los controles Network/DOM de S7P3-M06.
7. Como Master, abrir `/master/security/{storeIdA}` y comparar conteos, configuración e historial con la línea base.

Resultado esperado:

- el Principal ve inmediatamente el gate de Premium;
- endpoints privados y acciones del Admin de tienda quedan bloqueados;
- Master sigue viendo la información histórica;
- ningún registro de Seguridad se borra o se reescribe por el downgrade;
- el cambio de plan queda auditado.

### S7P3-M09 — Restauración Básico a Premium

Prioridad: **P0**  
Actores: `M`, después `PA`, `VA` y `GA`

Pasos:

1. Como Master, volver a `/master/stores/{storeIdA}/plan`.
2. Seleccionar **Cambiar a Premium**, usar la vigencia original o la definida para QA y registrar `QA S7P3 restauración`.
3. Confirmar el cambio.
4. Iniciar una sesión actualizada como `PA` y abrir Seguridad.
5. Comparar cada valor de la hoja de línea base.
6. Confirmar nuevamente lectura con `VA`, gestión con `GA` y bloqueo para `NA`.

Resultado esperado:

- el panel reaparece sin recrear manualmente su configuración;
- clientes, eventos, visitantes, bloqueos e historial coinciden con la línea base, salvo eventos legítimos generados por la propia prueba;
- `enabled`, modo y capacidades Master conservan sus valores previos;
- permisos de usuarios adicionales vuelven a aplicarse sin reasignarlos.

### S7P3-M10 — Premium vencido y renovación

Prioridad: **P0**  
Actores: `M` y Principal de la tienda vencida

Pasos:

1. Usar una tienda de prueba cuyo Premium ya esté vencido mediante el flujo autorizado del ambiente.
2. Confirmar desde Master que el indicador muestra **Vencido**.
3. Como Principal, abrir Seguridad y repetir Network/DOM del gate.
4. Intentar endpoints privados, REST y realtime.
5. Como Master, verificar lectura histórica.
6. Renovar el plan desde **Plan y límites** con **Confirmar renovación**.
7. Reingresar como Principal y comparar los datos con la línea base.

Resultado esperado:

- Premium vencido se comporta como falta de capacidad: gate, sin datos y privado fail-closed;
- Master conserva acceso histórico;
- la renovación restaura panel y permisos sobre los mismos registros;
- no hay pérdida ni reinicialización artificial de configuración.

### S7P3-M11 — Seguridad deshabilitada por Master

Prioridad: **P1**  
Actores: `M` y `PA`, con Premium vigente

Pasos:

1. Registrar el valor original de **Seguridad habilitada**.
2. Como Master, abrir la ficha de la tienda y **Configurar Seguridad**.
3. Desactivar **Seguridad habilitada** y guardar.
4. Como `PA`, revisar sidebar y abrir la ruta canónica directamente.
5. Como Master, abrir `/master/security/{storeIdA}`.
6. Restaurar **Seguridad habilitada** al valor original.

Resultado esperado:

- el comportamiento no se confunde con el gate comercial de plan;
- el Admin de tienda no accede al panel deshabilitado y regresa de forma segura al inicio administrativo;
- Master puede revisar el historial con el aviso de Seguridad desactivada;
- reactivar la configuración devuelve el comportamiento Premium sin pérdida de datos.

### S7P3-M12 — Autoridad histórica Master con plan bloqueado

Prioridad: **P0**  
Actor: `M`

Pasos:

1. Con Tienda A en Básico, Free o Premium vencido, abrir `/master/security/{storeIdA}`.
2. Recorrer todas las secciones históricas disponibles.
3. Abrir un cliente y una sesión de visitante existentes.
4. Comparar los datos con la línea base.
5. En otra ventana, confirmar que el Principal de la misma tienda continúa en el gate.

Resultado esperado:

- Master conserva lectura/configuración histórica aunque `security_enabled` no esté incluida o la vigencia haya terminado;
- el acceso Master no activa la capacidad para el Principal;
- no se mezclan datos de otras tiendas.

### S7P3-M13 — Aislamiento entre tiendas

Prioridad: **P0 CRÍTICA**  
Actores: usuarios de Tienda A y Tienda B

Pasos:

1. Como usuario de Tienda A, sustituir el slug de la ruta por `storeSlugB`.
2. Intentar abrir un `visitorSessionId`, `customerId` y `blockId` pertenecientes a Tienda B.
3. En endpoints privados, enviar el `store_id` de Tienda B con autenticación de Tienda A.
4. Consultar por REST un recurso concreto de Tienda B desde Tienda A.
5. Intentar una suscripción realtime a una colección/recurso de Tienda B.
6. Repetir en sentido inverso.

Resultado esperado:

- el cambio de slug vuelve al contexto administrativo propio sin mostrar datos ajenos;
- recursos e IDs cruzados se ocultan con `404`;
- no se distinguen existencia, estado, conteo ni propietario del recurso ajeno;
- realtime no entrega mensajes cruzados;
- Console, DOM y Network no contienen payloads de la otra tienda.

Si aparece un dato ajeno, marcar **FALLIDO P0**, detener las pruebas y no compartir la evidencia sin sanear.

### S7P3-M14 — Endpoints privados y acciones directas

Prioridad: **P0**  
Actores: `PA`, `VA`, `GA`, `NA` y Principal sin capacidad

Usar únicamente datos de prueba. Validar, como mínimo:

| Endpoint privado | Lectura/acción | Premium autorizado | Sin capacidad/permiso |
|---|---|---|---|
| `POST /api/pz/security/monitoring-summary` | Lectura | Éxito | `403` |
| `POST /api/pz/security/customers-page` | Lectura | Éxito | `403` |
| `POST /api/pz/security/activity-page` | Lectura | Éxito | `403` |
| `POST /api/pz/security/visitors-page` | Lectura | Éxito | `403` |
| `POST /api/pz/security/visitor-detail` | Lectura | Éxito o no encontrado del fixture | `403`; cruce `404` |
| `POST /api/pz/security/customer-detail` | Lectura | Éxito o no encontrado del fixture | `403`; cruce `404` |
| `POST /api/pz/security/blocks-page` | Lectura | Éxito | `403` |
| `POST /api/pz/security/customer-observation` | Gestión | `GA`/Principal autorizado | `VA`/`NA`: `403` |
| `POST /api/pz/security/block-action` | Gestión | `GA`/Principal autorizado | `VA`/`NA`: `403` |
| `POST /api/pz/security/customer-lifecycle` | Gestión | Solo acción reversible autorizada | `VA`/`NA`: `403` |
| `POST /api/pz/security/merge-customers` | Gestión | No ejecutar salvo fixture desechable | `VA`/`NA`: `403` |

Pasos:

1. Capturar una solicitud válida desde Network con una cuenta autorizada.
2. Repetirla con cada contexto de autorización usando la herramienta segura aprobada para QA.
3. No reutilizar ni publicar tokens entre cuentas; sanear las evidencias.
4. Confirmar que la respuesta fallida no contiene nombres, teléfonos, emails, IP, IDs relacionados, motivos o conteos.
5. Confirmar que ninguna acción rechazada cambia la base.

Resultado esperado:

- Premium + tenant + permiso correcto es la única combinación de tienda autorizada;
- lectura no habilita gestión;
- falta de capacidad o permiso responde `403` sin payload privado;
- cruce de tenant responde `404` sin revelar existencia.

### S7P3-M15 — REST, modificadores y realtime

Prioridad: **P0**  
Actores: usuario autorizado y usuarios bloqueados

Colecciones cubiertas:

- `store_security_settings`;
- `store_security_events`;
- `store_security_blocks`;
- `store_visitor_sessions`;
- `store_customers`.

Pasos:

1. Con Premium y `security.view`, listar y abrir un registro de la propia tienda.
2. Repetir usando `fields`, `filter`, `sort` y `expand`, individualmente y combinados.
3. Con `security.view` sin gestión, intentar `POST`, `PATCH` y `DELETE` sobre un fixture no destructivo o una solicitud deliberadamente inválida.
4. Repetir lecturas/mutaciones con `NA`, Básico, Free y vencido.
5. Intentar suscribirse por realtime a cada colección con usuario autorizado, sin permiso, sin capacidad y de otra tienda.
6. Generar un evento de prueba autorizado y observar quién recibe mensajes.

Resultado esperado:

- los modificadores no amplían campos ni evitan el gate;
- lectura válida se limita a la tienda autenticada;
- mutaciones sin `security.manage` fallan;
- Free/Básico/vencido fallan aunque exista un permiso histórico almacenado;
- realtime solo entrega mensajes al actor Premium autorizado y nunca cruza tenant.

### S7P3-M16 — Superficie pública sin ampliación

Prioridad: **P1**  
Actores: visitante público y comprador de prueba

Pasos:

1. Con una tienda Premium, navegar por home pública, categorías y un producto.
2. Repetir con la misma tienda en el estado de plan bloqueado usado para QA.
3. Confirmar que el tracking público mantiene su comportamiento anterior y que S7P3 no agrega un `403` por plan a `track-navigation`.
4. En un checkout completamente desechable, verificar que `register-order` mantiene su comportamiento histórico.
5. Confirmar que no aparecen paneles, motivos internos, IP, bloqueos privados o datos de Seguridad en la UI pública.
6. No interpretar este bloque como aprobación de nuevas reglas públicas de bloqueo; solo valida ausencia de ampliación en S7P3.

Resultado esperado:

- navegación y registro público no reciben un gate nuevo por S7P3;
- no se exponen datos privados;
- el aspecto público no incorpora tarjetas, huecos ni mensajes de Seguridad Premium.

### S7P3-M17 — Responsive, accesibilidad básica y ausencia de flash

Prioridad: **P1**  
Actores: `PA`, `VA` y Principal sin capacidad

Viewports obligatorios:

- `1440 × 900`;
- `1024 × 768`;
- `768 × 1024`;
- `430 × 932`;
- `390 × 844`;
- `375 × 812`.

Pasos:

1. En Premium, recorrer tabs, tablas, filtros, paginación, menús y modales.
2. En Básico/Free/vencido, abrir el gate con Network y grabación de pantalla si es posible.
3. Navegar con teclado por sidebar, tabs, botones, menús y cierre de modales.
4. Comprobar foco visible, lectura de títulos, contraste básico y que los diálogos no dejan el fondo operativo.
5. Revisar zoom del navegador a `200 %` en al menos un viewport de escritorio.
6. Confirmar que no existe scroll horizontal global ni controles cortados.

Resultado esperado:

- el panel y el gate son utilizables en todos los anchos;
- no hay flash de datos privados antes del gate;
- tabs y controles no se superponen ni salen de pantalla;
- teclado y foco permiten completar las acciones principales;
- no aparecen errores nuevos en Console.

## 9. Restauración obligatoria del ambiente

Al finalizar, incluso si algún bloque falla:

1. Restaurar Tienda A al plan, vigencia y fecha originales.
2. Restaurar **Seguridad habilitada**, modo y todas las capacidades Master.
3. Revocar cualquier bloqueo temporal creado por QA.
4. Devolver el cliente de prueba a su estado original de observación/archivo.
5. Eliminar solo los fixtures que se hayan creado específicamente para QA y cuya eliminación esté autorizada.
6. Cerrar sesiones temporales y borrar copias locales de tokens o HAR sin sanear.
7. Comparar la columna **Valor final restaurado** con la línea base.
8. Confirmar que no quedaron usuarios, pedidos, visitantes o eventos artificiales no documentados.

La restauración es un requisito de aceptación, no una tarea opcional.

## 10. Resumen de ejecución

| Bloque | Resultado | Evidencia | Incidencia |
|---|---|---|---|
| S7P3-M01 | Pendiente |  |  |
| S7P3-M02 | Pendiente |  |  |
| S7P3-M03 | Pendiente |  |  |
| S7P3-M04 | Pendiente |  |  |
| S7P3-M05 | Pendiente |  |  |
| S7P3-M06 | Pendiente |  |  |
| S7P3-M07 | Pendiente |  |  |
| S7P3-M08 | Pendiente |  |  |
| S7P3-M09 | Pendiente |  |  |
| S7P3-M10 | Pendiente |  |  |
| S7P3-M11 | Pendiente |  |  |
| S7P3-M12 | Pendiente |  |  |
| S7P3-M13 | Pendiente |  |  |
| S7P3-M14 | Pendiente |  |  |
| S7P3-M15 | Pendiente |  |  |
| S7P3-M16 | Pendiente |  |  |
| S7P3-M17 | Pendiente |  |  |

Totales:

- Aprobados: `__/17`
- Fallidos: `__/17`
- Bloqueados/no ejecutados: `__/17`
- Ambiente restaurado: `SÍ / NO`
- Incidencias abiertas: `__________`

## 11. Plantilla para reportar una incidencia

```text
ID: S7P3-QA-__
Bloque: S7P3-M__
Prioridad: P0 / P1 / P2
Fecha y hora:
Ambiente:
Actor y permisos:
Tienda y plan:
Vigencia:
Viewport/navegador:
Ruta o endpoint:

Pasos mínimos para reproducir:
1.
2.
3.

Resultado actual:
Resultado esperado:
Código HTTP:
¿Cambió datos?: SÍ / NO / DESCONOCIDO
¿Existe posible fuga entre tiendas?: SÍ / NO
Evidencia saneada:
Estado del rollback:
```

## 12. Confirmación final de Kraken

Completar únicamente después de ejecutar los 17 bloques y restaurar el ambiente:

```text
Confirmo que ejecuté el manual S7P3 — Seguridad Premium.

Resultado: APROBADO / APROBADO CON INCIDENCIAS / RECHAZADO
Bloques aprobados: __/17
Incidencias pendientes:
Ambiente restaurado: SÍ / NO
Fecha:
Nombre/confirmación de Kraken:
```

S7P3 permanece **EN REVISIÓN** mientras esta confirmación no exista de forma explícita.

## 13. Anexo posterior PZ-SEC-VPN01 — no cuenta dentro de los 17 bloques S7P3

Este anexo valida una extensión aprobada después de preparar el manual original. No sustituye ni reduce S7P3-M01…M17 y no permite marcar S7P3 o BLOCKS03B como completados.

### VPN01-A — Activación gradual

1. Confirmar que la migración se aplicó y que la política inicial es `off`.
2. Confirmar Premium vigente, Seguridad habilitada y modo `monitoring` o `protection` según la prueba.
3. Activar `monitor` desde **Seguridad → Reglas**.
4. Acceder con una conexión limpia y con una VPN/proxy de prueba conocida.
5. Confirmar que ambos accesos continúan, pero la detección positiva aparece como evento privado.
6. Verificar que el HTML, Network y la respuesta pública no exponen proveedor, HMAC o IP almacenada.

Resultado esperado: detección observable sin denegación ni filtración.

### VPN01-B — Bloqueo explícito

1. Cambiar Seguridad a modo `protection`.
2. Activar `block` y confirmar auditoría del cambio.
3. Con VPN/proxy de prueba, abrir una ruta pública de la tienda.
4. Confirmar `403`, `no-store` y el mensaje para desactivar VPN/proxy.
5. Desactivar la VPN y repetir desde una IP que el proveedor clasifique como limpia.
6. Confirmar que admin de tienda y Master nunca reciben el rechazo público.

Resultado esperado: solo la detección positiva se bloquea; una clasificación limpia y las rutas administrativas continúan.

### VPN01-C — Selección inmediata de dispositivo

1. Generar una visita pública con un navegador de prueba y confirmar que existe `pz_client_device` sin copiar su valor.
2. Desde **Visitantes de hoy** o **Clientes bloqueados**, iniciar un bloqueo por esa sesión/IP.
3. Confirmar que la previsualización muestra los dispositivos históricos asociados solo a esa tienda.
4. Seleccionar uno, varios o todos y crear el bloqueo.
5. Mantener el mismo navegador, cambiar de red o activar VPN y repetir el acceso.
6. Probar desde otro navegador o modo privado y documentar que su cookie es distinta; no asumir identidad física del aparato.

Resultado esperado: los dispositivos seleccionados quedan en el bloqueo desde el primer guardado y el navegador seleccionado sigue bloqueado aunque cambie su IP.

### VPN01-D — Fallo seguro y restauración

1. Si el proveedor devuelve indisponibilidad o cuota durante una prueba natural, confirmar que el acceso se permite y aparece `vpn_check_unavailable`.
2. No provocar una caída modificando DNS, TLS, proxy, firewall o variables remotas sin autorización separada.
3. Restaurar `vpn_policy` a su valor inicial.
4. Revocar los bloqueos de prueba y comprobar el estado final de la tienda.

Resultado esperado: ninguna caída externa bloquea a todos los usuarios y el ambiente queda restaurado.

Registrar estos cuatro casos por separado como `APROBADO`, `FALLIDO` o `BLOQUEADO`; no sumarlos al contador `__/17` de S7P3.

## 14. Anexo posterior PZ-SEC-ADDR01 — no cuenta dentro de los 17 bloques S7P3

Este anexo no sustituye ni reduce S7P3-M01…M17 y no permite marcar S7P3 o BLOCKS03B como completados.

### ADDR01-A — Selección desde el primer bloqueo

1. Preparar un cliente desechable con al menos dos pedidos de entrega y dos direcciones distintas.
2. Abrir su ficha en Seguridad y pulsar **Crear bloqueo**.
3. Confirmar dirección, municipio, último uso y conteo, sin inspeccionar ni copiar HMAC.
4. Comprobar que la dirección más reciente está preseleccionada.
5. Intentar desmarcar todas y confirmar que la interfaz exige al menos una cuando existen candidatas.
6. Crear bloqueos separados seleccionando una, varias y todas las direcciones.

Resultado esperado: las direcciones elegidas quedan asociadas desde el primer guardado; un cliente sin dirección válida puede bloquearse sin esa señal adicional.

### ADDR01-B — Coincidencia desde otro dispositivo

1. Mantener activo un bloqueo de prueba con una dirección seleccionada.
2. Desde otro navegador o dispositivo, crear un pedido con otra identidad y la misma dirección.
3. Repetir usando diferencias de mayúsculas, acentos, espacios y `No./#` dentro del contrato normalizado.
4. Confirmar que el pedido se crea y conserva su estado comercial.
5. Confirmar un único evento `blocked_address_match` y una única notificación que abra ese pedido.

Resultado esperado: alerta idempotente para revisión, sin bloqueo, cancelación ni fusión automática.

### ADDR01-C — Negativos y aislamiento

1. Crear un pedido con dirección distinta.
2. Repetir con recogida o coordinación sin dirección de entrega.
3. Probar la misma dirección en otra tienda.
4. Revocar el bloqueo y repetir el pedido.
5. Repetir con un bloqueo vencido.

Resultado esperado: ninguno de estos casos crea una alerta de coincidencia para la tienda original.

### ADDR01-D — Privacidad y restauración

1. Revisar HTML, Network y respuestas privadas autorizadas.
2. Confirmar que la colección nueva no admite REST público.
3. Confirmar que eventos/notificaciones no muestran dirección, municipio, HMAC, IP, cookie, teléfono ni motivo interno.
4. Restaurar la tienda, revocar bloqueos de prueba y eliminar solo fixtures autorizados.

Resultado esperado: aislamiento por tienda, ausencia de datos sensibles y ambiente restaurado.

Registrar ADDR01-A…D como `APROBADO`, `FALLIDO` o `BLOQUEADO`; no sumarlos al contador `__/17` de S7P3.
