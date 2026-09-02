# Gateway realtime de Tu Senda 84

Este servicio acelera la sincronización de notificaciones de la APK mientras está visible. No guarda mensajes ni sustituye PocketBase, FCM, WorkManager o la sincronización HTTP.

## Variables

- `PORT=8081`
- `PZ_STOREFRONT_REALTIME_TICKET_SECRET`: secreto aleatorio de 32 a 512 caracteres compartido con PocketBase.
- `PZ_STOREFRONT_REALTIME_WAKE_SECRET`: segundo secreto aleatorio, distinto del anterior, compartido con PocketBase.
- `PZ_STOREFRONT_REALTIME_MAX_CONNECTIONS=25000`: límite opcional por réplica.

No se deben reutilizar secretos de credenciales, Firebase, el relay push, HMAC administrativo o cifrado.

## Coolify

1. crear una aplicación Dockerfile con este directorio como base;
2. exponer el puerto `8081` y usar una sola réplica;
3. asignar `realtime.tusenda84.com` con HTTPS y proxy WebSocket;
4. agregar los dos secretos;
5. verificar `GET /healthz` antes de desplegar la APK.

El endpoint `/internal/wakeup` debe preferir la red privada de Coolify. Aunque está protegido por firma HMAC, no debe publicarse como una ruta de uso general.

## Contrato

- La APK solicita un ticket al frontend usando su credencial opaca.
- PocketBase emite un ticket de 60 segundos con un canal seudónimo.
- La APK conecta a `/v1/connect` enviando `Authorization: Bearer <ticket>`.
- PocketBase firma un aviso interno con timestamp, nonce y cuerpo exacto.
- El gateway emite un evento mínimo `sync_required`; la APK obtiene el contenido desde la cola HTTP persistente.

Tickets y avisos son de un solo uso. El gateway no registra credenciales, tickets, canales ni contenido de campañas.

## Desarrollo

```text
npm ci
npm test
npm start
```

Para desarrollo local, use secretos distintos de al menos 32 caracteres y conecte por un proxy TLS. El cliente Android rechaza `ws://`.
