# PZ-APP-INSTALL-RESILIENCE-0001

## Resultado de la auditoría

La APK anterior trataba Firebase App Check/Play Integrity como requisito previo al alta. El flujo era:

1. obtener una atestación de App Check;
2. registrar Firebase Messaging;
3. obtener el Firebase Installation ID (FID);
4. enviar FID y metadatos al backend;
5. recibir y guardar la credencial de instalación.

Por tanto, un fallo o demora en App Check, Firebase Installations, FCM o Google Play Services impedía llegar al punto 4. La aplicación podía abrir la tienda en el `WebView`, pero no aparecía como instalación, no tenía credencial para heartbeats/analítica/actualizaciones y no podía ser objetivo de campañas.

El punto de alta anterior estaba en `StorefrontRegistrationClient.registerInternal()` y en `POST /api/storefront/v1/installations/register`. La inicialización de Firebase se encontraba en `StorefrontApplication.onCreate()`.

La diferencia observada entre Estados Unidos y Cuba es compatible con una dependencia de red o servicios Google, aunque no demuestra una sola causa. Los candidatos principales son:

- App Check/Play Integrity no disponible o demorado;
- Firebase Installations o FCM no accesible desde la red/dispositivo;
- Google Play Services ausente, desactualizado o restringido;
- DNS, TLS o una regla geográfica/WAF de Cloudflare bloqueando las rutas de la APK;
- ahorro de batería/datos o permiso de notificaciones denegado.

Firebase Analytics no interviene en el alta encontrada.

## Flujo implementado

```text
Primer inicio
   |
   +--> UUID v4 local persistente
   |
   +--> POST /v2/installations/register  (sin Firebase/App Check)
   |        |
   |        +--> instalación visible, trust=basic
   |        +--> credencial opaca cifrada en Android Keystore
   |
   +--> Firebase opcional
            |
            +--> si hay FID: /v2/installations/firebase con credencial
            |       +--> sin App Check: FCM asociado, trust=basic
            |       +--> con App Check: trust=firebase_verified
            |
            +--> si falla: la instalación sigue activa y válida
```

El identificador UUID se envía únicamente al alta y se conserva en PocketBase como HMAC por aplicación. El panel y las respuestas públicas no exponen UUID, FID, credenciales ni direcciones IP.

## Telemetría

Se registran localmente y se sincronizan por lotes los eventos:

- `APP_STARTED`
- `INTERNET_AVAILABLE`
- `BACKEND_REACHABLE`
- `INSTALLATION_UUID_CREATED`
- `FIREBASE_INITIALIZED`
- `FID_CREATED`
- `FCM_TOKEN_CREATED`
- `INSTALLATION_REGISTER_REQUEST_SENT`
- `INSTALLATION_REGISTER_RESPONSE`
- `NOTIFICATION_PERMISSION_STATUS`
- `LAST_PUSH_RECEIVED`
- `LAST_ERROR`

Cada evento incluye fecha, resultado, código de error seguro, estado HTTP y latencia. La cola local y los registros del servidor vencen a los 30 días. Los valores sensibles no forman parte de los eventos.

La pantalla `StorefrontDiagnosticsActivity` no está exportada por Android ni aparece en la navegación normal. Soporte puede abrirla manteniendo pulsada la pantalla de inicio. Muestra disponibilidad de API/DNS/HTTPS, UUID local, estado del registro, Firebase/FID, permiso, última sincronización, último push y último error; nunca muestra credenciales ni tokens completos.

## Segundo canal de notificaciones

Cada campaña materializa una entrega persistente para toda instalación elegible, tenga o no FID. Los estados se conservan por separado:

- creación: registro y fecha de la entrega;
- FCM: `not_attempted`, `pending`, `accepted`, `received`, fallos o `invalid`;
- canal nativo: `pending`, `delivered`, `read` o `expired`;
- lectura: `read_at` independiente;
- vencimiento: `delivery_expires_at`.

La aplicación consulta pendientes al abrir/reanudar, cada 60 segundos mientras está visible y mediante WorkManager con una periodicidad mínima de 15 minutos cuando Android lo permite. Publica con `NotificationManager`, guarda `notification_id` para no duplicar y confirma recepción/lectura al servidor. FCM continúa en paralelo como acelerador.

Las imágenes nunca retrasan el aviso: primero se publica texto y luego se actualiza la misma notificación si el WebP se descarga y valida correctamente.

### WebSocket

Se añadió un gateway aislado en `realtime-powerzona`. El protocolo completo es:

1. la APK registrada solicita `POST /api/storefront/v2/realtime/ticket` con su credencial propia;
2. PocketBase valida la instalación y emite un ticket HMAC de 60 segundos y un solo uso;
3. el ticket contiene únicamente un canal seudónimo derivado por HMAC; no contiene la credencial, UUID, FID ni identificadores internos de PocketBase;
4. la APK abre `wss://realtime.tusenda84.com/v1/connect` en primer plano y entrega el ticket en `Authorization`, nunca en la URL;
5. después de crear las entregas persistentes, PocketBase avisa por un webhook interno HMAC al gateway;
6. el gateway envía solo `sync_required`, sin título, cuerpo, imagen ni destino;
7. la APK consulta la cola autenticada `/v2/notifications/sync`, muestra y confirma la notificación con el flujo ya existente.

El gateway deshabilita compresión, limita mensajes, rechaza cuerpos/binarios del cliente, detecta conexiones muertas con `ping/pong`, invalida replays y mantiene una sola conexión por canal. Android reconecta con espera exponencial y variación aleatoria, obteniendo un ticket nuevo en cada intento.

El socket existe únicamente mientras la actividad está visible. Con la app en segundo plano o cerrada, FCM conserva la entrega inmediata cuando Google está disponible; WorkManager y la sincronización al reabrir siguen siendo los respaldos independientes. La cola HTTP persistente continúa como fuente de verdad, por lo que una caída completa del gateway no pierde campañas.

La primera versión usa una réplica del gateway y estado en memoria. Antes de escalar a varias réplicas se necesita un bus compartido —por ejemplo Redis/NATS— o afinidad de conexión; desplegar varias réplicas sin esa coordinación podría enviar el aviso a una réplica distinta de la que mantiene el socket.

## Actualizaciones

Las rutas ya autenticadas de heartbeat, eventos, bootstrap y actualizaciones aceptan la credencial propia aunque App Check no esté disponible. Las APK nuevas registran primero esa credencial, por lo que el sistema de actualización deja de depender de Firebase.

Limitación inevitable: una APK antigua que nunca consiguió credencial no puede recibir retroactivamente este código ni cambiar su flujo nativo. Esos teléfonos requieren una instalación manual única de la nueva APK sobre la existente, usando el mismo `applicationId`, certificado y una versión superior. No deben desinstalar la app; si Android pide desinstalarla, hay que cancelar y revisar firma/paquete.

## PocketBase y API

Campos nuevos en `storefront_installations`:

- `installation_uuid_digest`
- `identity_source`
- `trust_level`
- `firebase_status`
- `firebase_synced_at`
- `firebase_last_error`
- `last_heartbeat_at`

Campos nuevos en `push_campaign_deliveries`:

- `fcm_status`
- `native_status`
- `fcm_received_at`
- `native_delivered_at`
- `read_at`
- `delivery_expires_at`

Colección privada nueva: `storefront_installation_diagnostics`.

Rutas públicas nuevas, siempre detrás del gateway firmado:

- `POST /api/storefront/v2/installations/register`
- `POST /api/storefront/v2/installations/firebase`
- `POST /api/storefront/v2/diagnostics`
- `POST /api/storefront/v2/notifications/sync`
- `POST /api/storefront/v2/notifications/ack`
- `POST /api/storefront/v2/realtime/ticket`

Servicio nuevo:

- `GET /healthz`
- `GET wss://realtime.tusenda84.com/v1/connect` mediante Upgrade WebSocket
- `POST /internal/wakeup`, exclusivamente con firma HMAC servidor a servidor

## Estado y diagnóstico en Master Admin

La pantalla **App Android** de cada tienda incorpora una cuarta vista, **Estado y diagnóstico**. La consulta es exclusiva de Master, usa `Cache-Control: private, no-store` y solicita el bloque `app_health` solamente al abrir esa vista.

El resumen diferencia explícitamente:

- servicios críticos: API/PocketBase, registro propio, heartbeat/sincronización nativa y actualizaciones;
- acelerador: disponibilidad en vivo del gateway WebSocket;
- servicio opcional: Firebase/FCM;
- configuración del usuario: permiso Android para notificaciones;
- observabilidad: confirmaciones de push y errores activos.

También muestra hasta 100 instalaciones recientes de la tienda, cada una mediante una referencia opaca de soporte. Nunca devuelve al navegador UUID, FID, token FCM, credencial, hashes internos, IP ni el JSON libre de diagnóstico. La respuesta se construye únicamente con las colecciones privadas `storefront_installations` y `storefront_installation_diagnostics`, filtradas de nuevo por tienda.

La vista se vuelve a comprobar cada 60 segundos mientras permanece visible. La sonda WebSocket transforma exclusivamente la URL configurada `wss://.../v1/connect` en `https://.../healthz`; una caída del acelerador aparece como aviso y no convierte Firebase en dependencia crítica. Este panel es una mejora web/backend y no obliga a reconstruir la APK.

## Cloudflare

Antes del piloto en Cuba se debe revisar Security Events filtrando `country=CU` y las rutas `/api/storefront/`. Una regla geográfica, Managed Challenge o Bot rule puede impedir el alta aun con Firebase desacoplado.

Si existe bloqueo, la excepción debe limitarse a las rutas nativas exactas y omitir únicamente el control geográfico/challenge que causa el falso positivo. No se deben desactivar HTTPS, las firmas internas, validación de contratos, credenciales, aislamiento de tienda ni rate limiting de la aplicación.

## Compatibilidad y riesgos

- Android 13 o superior requiere `POST_NOTIFICATIONS`; sin permiso se registra el equipo pero no se muestra el aviso.
- WorkManager es oportunista: Doze, ahorro de batería y “forzar detención” pueden retrasarlo. Al volver a abrir se sincroniza de inmediato.
- WebSocket no mantiene viva una aplicación cerrada ni sustituye a FCM/WorkManager; solo acelera la recepción mientras la app está visible.
- FCM puede entregar antes que la cola nativa; la deduplicación local impide mostrar dos veces el mismo `notification_id`.
- El FID puede rotar sin crear otro UUID. Un FID ya ligado a otro UUID se rechaza.
- La migración no reencola campañas históricas, evitando volver a mostrar mensajes antiguos.
- El rollback falla cerrado si ya existen datos que dependen de los campos nuevos.

## Despliegue recomendado

1. crear backup verificado de PocketBase;
2. desplegar migración y backend;
3. crear una aplicación Coolify desde `realtime-powerzona`, una sola réplica, puerto `8081` y dominio `realtime.tusenda84.com`;
4. configurar dos secretos diferentes y aleatorios de al menos 32 caracteres: `PZ_STOREFRONT_REALTIME_TICKET_SECRET` y `PZ_STOREFRONT_REALTIME_WAKE_SECRET`, compartidos solo entre PocketBase y el gateway;
5. configurar PocketBase con `PZ_STOREFRONT_REALTIME_PUBLIC_URL=wss://realtime.tusenda84.com/v1/connect`, `PZ_STOREFRONT_REALTIME_WAKE_URL=http://<servicio-interno>:8081/internal/wakeup` y `PZ_STOREFRONT_REALTIME_ALLOW_HTTP=1` únicamente para esa red interna;
6. comprobar `GET /healthz` y un Upgrade WebSocket a través de Cloudflare;
7. desplegar backend y frontend; si el gateway no está listo, el nuevo aviso falla de forma no bloqueante;
8. limitar cualquier excepción Cloudflare para Cuba al hostname/ruta `/v1/connect` y a las rutas API nativas necesarias, sin retirar HTTPS, firmas, credenciales ni rate limiting;
9. confirmar las rutas v2 desde Estados Unidos y Cuba;
10. compilar una APK de staging con versión superior y la misma firma;
11. instalar sobre una APK existente, sin desinstalar;
12. verificar en diagnóstico: API, registro backend, estado WebSocket, FID opcional y permiso;
13. enviar una campaña de prueba y comprobar `fcm_status`, `native_status` y lectura;
14. hacer el piloto con uno o dos teléfonos en Cuba, probando app visible, segundo plano y cerrada;
15. publicar la APK de producción y entregar una vez por enlace/WhatsApp a equipos antiguos no registrados.

## Validación local

- contratos y lógica de instalaciones backend: aprobados;
- contratos y gateway frontend: aprobados;
- suite frontend completa: aprobada;
- build Astro de producción: aprobado;
- Android `lintDebug`, pruebas unitarias y empaquetado `assembleDebug`: aprobados;
- gateway WebSocket: contratos, autenticación, anti-replay y entrega dirigida aprobados;
- suite backend: todos los tests ejecutables aprobados; las dos pruebas HTTP runtime que requieren el binario real no arrancaron porque este checkout no contiene `backend-powerzona/pocketbase.exe`.
