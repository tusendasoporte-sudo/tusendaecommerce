---
title: "PZ-SEC-ADDR01 - Alertas por dirección de cliente bloqueado"
project: "PowerZona / Tu Senda 84"
date: "2026-08-07"
source_revision: "V124"
status: "EN REVISIÓN"
---

# PZ-SEC-ADDR01 - Alertas por dirección de cliente bloqueado

## Estado

Flujo aprobado e implementado localmente. Permanece **EN REVISIÓN / PENDIENTE DE STAGING Y CONFIRMACIÓN EXPLÍCITA DE KRAKEN**.

Esta extensión no marca PZ-SEC-BLOCKS03B ni S7P3 como completados. Staging real, los 17 bloques manuales S7P3 y la confirmación final de Kraken continúan pendientes. P7D4, P7X5, Q7F6 y el proyecto separado R84 permanecen fuera de alcance.

## Objetivo aprobado

Cuando un administrador crea un bloqueo para un cliente, puede asociar desde ese primer guardado una, varias o todas las direcciones de entrega válidas de su historial. Si un pedido posterior de la misma tienda usa una dirección coincidente, el pedido se crea normalmente y el administrador recibe una alerta para revisarlo.

La dirección es una señal de **alerta**, no de identidad concluyente ni de bloqueo automático. Varias personas pueden compartir domicilio; por eso la coincidencia no cancela pedidos, no fusiona clientes y no agrega automáticamente otro dispositivo al bloqueo.

## Flujo implementado

1. El administrador abre la ficha privada del cliente y pulsa **Crear bloqueo**.
2. El backend deriva las direcciones de pedidos de entrega vinculados al cliente canónico y sus alias, siempre dentro de la misma tienda.
3. Las direcciones equivalentes se agrupan mediante normalización exacta de municipio, acentos, espacios, puntuación y variantes comunes de “número”.
4. La interfaz muestra cada dirección única, municipio, último uso y cantidad de usos. La más reciente aparece seleccionada inicialmente.
5. El administrador puede seleccionar una, varias o todas. Si existen direcciones válidas, debe conservar al menos una seleccionada; si no existe ninguna, el bloqueo sigue permitido.
6. El backend vuelve a validar que cada ID de pedido seleccionado pertenece a la ficha y a la tienda antes de crear el bloqueo.
7. Se guarda únicamente un HMAC por tienda de la dirección normalizada, junto con referencias privadas al bloqueo y al pedido origen. La nueva colección no tiene reglas REST públicas.
8. Después de registrar un pedido nuevo, el backend calcula la misma huella y busca bloqueos activos de esa tienda.
9. Una coincidencia crea de forma idempotente el evento privado `blocked_address_match` y la notificación `security_address_match`.
10. La campana abre el pedido concreto para revisión. El pedido conserva su estado comercial normal.

## Privacidad y aislamiento

- El HMAC usa el dominio `delivery_address`, el ID de tienda y el secreto de Seguridad; una misma dirección en dos tiendas produce huellas distintas.
- La colección `store_security_block_addresses` almacena la huella, no una copia legible de la dirección o municipio.
- Eventos y notificaciones no contienen dirección, municipio, HMAC, teléfono, IP, cookie, ciphertext ni motivo interno.
- La dirección legible solo se entrega dentro del endpoint privado de detalle al actor autorizado para ver Seguridad.
- Un ID de pedido ajeno, de otro cliente o de otra tienda es rechazado.
- Bloqueos revocados o vencidos no generan coincidencias nuevas.
- `security.checkOrigin` permanece activo y no existe bypass local.

## Migración aditiva

`1786237200_security_block_address_alerts.js`:

- crea la colección privada `store_security_block_addresses`;
- agrega `blocked_address_match` a los eventos de Seguridad;
- agrega `security_address_match` a las notificaciones de tienda;
- incorpora índices de búsqueda por `(store, address_hmac)` y unicidad por `(store, block, address_hmac)`;
- es idempotente en el fixture de contrato y su rollback elimina primero los registros dependientes de los nuevos tipos.

La migración todavía no se ha aplicado ni validado en staging.

## Validación local ejecutada

| Control | Resultado |
|---|---|
| Backend focal ADDR01 | **6/6 aprobadas** |
| Frontend focal ADDR01 | **6/6 aprobadas** |
| Backend completo | **491 totales: 484 aprobadas, 7 omitidas declaradas, 0 fallidas** |
| Frontend completo | **312/312 aprobadas, 0 omitidas, 0 fallidas** |
| Sintaxis Node de hooks y migración | **Aprobada** |
| Build Astro SSR | **Aprobado**, con tres warnings legacy ya conocidos |
| `git diff --check` | **Aprobado** |

Las pruebas cubren normalización, deduplicación, preselección, selección obligatoria cuando existen direcciones, rechazo de IDs ajenos, HMAC aislado, ausencia de dirección legible en escrituras de Seguridad, coincidencia idempotente, pedido no bloqueado, revocación y migración privada/reversible.

## Validación obligatoria en staging

1. Confirmar de forma segura la presencia y formato de `PZ_SECURITY_HMAC_SECRET`; no imprimir su valor.
2. Aplicar la migración y confirmar `address_alerts_ready` en la salud privada.
3. Crear un cliente y al menos dos pedidos desechables con una dirección controlada.
4. Crear el bloqueo seleccionando primero una dirección y luego repetir con varias/todas en otro fixture.
5. Confirmar que las direcciones mostradas pertenecen solo a la tienda y ficha abiertas.
6. Crear un pedido desde otro navegador/dispositivo con la misma dirección escrita con diferencias de mayúsculas, acentos o “No./#”.
7. Confirmar que el pedido entra, se crea un único evento, aparece una sola notificación y esta abre el pedido correcto.
8. Probar otra dirección, otra tienda, recogida, bloqueo revocado y bloqueo vencido; ninguno debe generar la alerta.
9. Revisar HTML, Network, REST y logs para confirmar que la nueva colección, eventos y notificaciones no exponen HMAC ni copias de la dirección.
10. Restaurar la tienda y eliminar solamente los fixtures autorizados.

## Operaciones no realizadas

No se modificaron Cloudflare, Coolify, DNS, TLS, proxy, infraestructura ni configuración remota. No se creó commit, no se hizo push y no se desplegó esta extensión.

## Continuidad

- PZ-SEC-ADDR01: **EN REVISIÓN**, pendiente de staging y Kraken.
- PZ-SEC-BLOCKS03B: **EN REVISIÓN**, pendiente de staging real y Kraken.
- S7P3: **EN REVISIÓN**, con 17 bloques manuales pendientes y sin confirmación final de Kraken.
