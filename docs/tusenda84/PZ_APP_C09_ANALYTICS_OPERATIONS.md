# PZ-APP-C09 — Analítica de instalaciones y campañas

## Estado y alcance

Este documento describe el contrato operativo y prepara la prueba manual aislada de C09. No autoriza despliegues, FCM real, cambios en staging o producción, Firebase, App Check, firmas, secretos ni `google-services.json`.

La unidad estadística es una **instalación de la app**. No representa una persona ni un dispositivo físico único. Borrar datos, reinstalar o rotar la identidad puede crear otra instalación.

## Métricas y denominadores

| Métrica | Definición | Denominador de tasa |
|---|---|---|
| Seleccionadas | Snapshot de instalaciones únicas elegido al cerrar la audiencia. | No aplica |
| Aceptadas | Respuestas aceptadas por Firebase. No demuestra entrega, visualización ni lectura en Android. | Seleccionadas |
| Fallo confirmado | `failed_permanent + invalid_fid`. | Seleccionadas |
| Desconocido, cancelado, reintentando, pendiente y reclamado | Estados técnicos separados; nunca se suman al fallo confirmado. | Seleccionadas, cuando se presenta una tasa |
| Abrieron | Instalaciones con toque explícito deduplicado sobre la notificación. | Aceptadas |
| Vieron destino | Instalaciones cuyo destino esperado quedó visible en el marco principal, después de abrir. | Abrieron |
| Cupón aplicado | Instalaciones cuyo carrito y cupón fueron revalidados por el motor oficial, después de ver el destino. Cuenta aunque se abandone el checkout. | Vieron destino; `No aplica` si la campaña no tiene cupón |
| Órdenes atribuidas | Órdenes con evidencia de cupón elegible o, en su ausencia, el último destino visto elegible. | Vieron destino |
| Conversión de instalaciones | Instalaciones compradoras únicas. No debe etiquetarse como cantidad de órdenes. | Vieron destino |

Todo denominador cero se presenta como `No aplica`, nunca como `0 %`.

## Confianza, ventanas e idempotencia

- `opened` y `destination_viewed` exigen App Check, credencial activa de instalación, entrega de la misma tienda en estado `accepted` y clave determinista `tipo:delivery_id`.
- La apertura solo nace del `PendingIntent` creado para esa entrega. Abrir la app desde el icono no cuenta.
- El destino solo cuenta al quedar visible la URL interna exacta del marco principal, sin error HTTP/SSL ni navegación externa.
- Android conserva como máximo 64 eventos durante siete días y diez intentos. Las repeticiones no inflan métricas.
- La sesión WebView se obtiene mediante bootstrap de un solo uso. La app acepta únicamente una cookie `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` y `Max-Age` no mayor de 24 horas.
- Los eventos nativos se aceptan desde `accepted_at` y antes de siete días. La hora del cliente se conserva solo como diagnóstico; el servidor fija la hora atribuible.
- Un toque empieza en `destination_viewed` recibido por el servidor. Cupón y orden deben ocurrir antes de siete días desde ese toque.
- El cupón tiene prioridad sobre el último destino visto. Una apertura sola nunca atribuye una orden. Solo puede existir una atribución por orden.

## Privacidad, retención y crecimiento

- El contenido visible de una campaña se redacta siete días después del cierre.
- Entregas, eventos técnicos mínimos y agregados diarios vencen a los 90 días conforme a su `delete_after`.
- La evidencia mínima fijada en una orden se conserva con la propia orden y no depende del contenido de la campaña.
- Los agregados no contienen FID, token, credencial, IP, URL ni payload.
- País y región agrupan conjuntos menores de tres bajo `Otros (privacidad)`.
- La API pagina sin un límite global artificial y la prueba local cubre 40.000 instalaciones. Un error de lectura produce error visible; no se transforma en ceros.
- Las consultas administrativas se aíslan por tienda. Una lectura Master agregada genera auditoría y tampoco expone identificadores de instalación.

## Preparación de la prueba manual aislada

Requiere autorización expresa posterior para desplegar en staging y enviar FCM. Antes de comenzar se debe registrar:

1. Commit exacto de C09 y respaldo previo `f1fd3c9`.
2. Backup consistente de staging y confirmación de que producción está fuera de alcance.
3. Dos tiendas desechables: A Premium y B para comprobar aislamiento.
4. Un conjunto conocido de instalaciones de prueba de A y, como control, al menos una de B.
5. Un cupón desechable de A y productos sin información sensible.
6. Matriz esperada con `selected`, `accepted`, `opened`, `destination_viewed`, `coupon_applied`, órdenes creadas, vigentes y canceladas.

No se deben registrar FID, tokens, credenciales, cookies, IP completas ni payloads en capturas o informes.

## Secuencia manual propuesta

1. Abrir `Analíticas > App instalaciones` con `Hoy`, `7`, `15`, `30` y `90 días`; confirmar las mismas fechas y zona `America/Havana` que la analítica general.
2. Comparar `Instalaciones vigentes ahora`, nuevas y bajas detectadas con el conjunto conocido. Confirmar que la interfaz explica que no son personas ni desinstalaciones exactas.
3. Crear una campaña de A con cupón y audiencia conocida, sin incluir instalaciones de B. Registrar el snapshot esperado antes de enviar.
4. Enviar solo tras la autorización de FCM. Comparar seleccionadas, aceptadas, fallos confirmados y estados inciertos sin asumir entrega Android.
5. Abrir explícitamente la notificación en un subconjunto conocido. Abrir la app por el icono en otra instalación y comprobar que esa acción no suma una apertura.
6. Dejar cargar el destino correcto solo en parte de las aperturas. Forzar una navegación distinta o un error en una instalación de prueba y comprobar que no suma destino visto.
7. Aplicar el cupón con un carrito elegible y abandonar un checkout; debe sumar cupón aplicado pero no orden. Intentar un carrito no elegible; no debe sumar.
8. Crear una orden con cupón elegible y otra sin cupón después de un destino visto. Confirmar prioridad del cupón, último toque elegible y una sola atribución por orden.
9. Cancelar una orden atribuida. Deben separarse órdenes vigentes y canceladas sin borrar la evidencia histórica.
10. Repetir solicitudes y recuperar una cola offline. Cada instalación debe contar una sola vez por etapa.
11. Abrir checkout desde la WebView y confirmar que la sesión llega al backend sin enviar identidad de instalación en el cuerpo del pedido.
12. Consultar la tienda B y confirmar cero actividad de A. Consultar A en soporte Master y verificar la entrada de auditoría sin datos sensibles.
13. Comprobar `delete_after`, redacción y relaciones en registros desechables. No alterar relojes ni fechas de datos reales para simular 90 días.
14. Borrar todos los datos desechables mediante los flujos oficiales y verificar los conteos finales de ambas tiendas.

## Evidencia mínima a conservar

- Commit, fecha, entorno y autorización empleada.
- Cantidades esperadas y observadas por etapa, con sus denominadores.
- Estados inciertos separados de fallos confirmados.
- Resultado de idempotencia, cola offline, sesión WebView, cupón y orden.
- Resultado de aislamiento de B y referencia sanitizada de la auditoría Master.
- Confirmación expresa de que producción, secretos y servicios fuera de alcance no se tocaron.

## Fallo y rollback

- Ante una discrepancia de conteos, detener la prueba y conservar la matriz sanitizada; no compensar editando métricas manualmente.
- El código anterior a C09 está identificado por `f1fd3c9`.
- El `down` de la migración falla cerrado si ya existe evidencia C09. No se debe forzar: con datos reales, la restauración debe planificarse desde un backup consistente y con autorización específica.
- Ningún rollback debe eliminar órdenes, atribuciones o datos de otra tienda.

## Cierre

C09 no se considera completado únicamente por pasar pruebas locales. Requiere que el propietario autorice y apruebe la prueba manual aislada o acuerde explícitamente diferirla a una fase posterior.
