---
title: "PZ-SEC-VPN01 - Piloto VPN/proxy y bloqueo inmediato de dispositivo"
project: "PowerZona / Tu Senda 84"
date: "2026-08-07"
source_revision: "V123"
status: "EN REVISIÓN"
---

# PZ-SEC-VPN01 - Piloto VPN/proxy y bloqueo inmediato de dispositivo

## Estado

Flujo aprobado e implementado localmente. Permanece **EN REVISIÓN / PENDIENTE DE STAGING Y CONFIRMACIÓN EXPLÍCITA DE KRAKEN**.

Esta extensión no marca BLOCKS03B ni S7P3 como completados. Staging real, los 17 bloques manuales S7P3 y la confirmación final de Kraken continúan pendientes. P7D4, P7X5, Q7F6 y el proyecto separado R84 quedan fuera de alcance.

## Objetivos

1. Permitir que un bloqueo manual por IP incorpore desde el primer momento uno, varios o todos los dispositivos históricos que el administrador seleccione.
2. Añadir por tienda una política opcional para detectar o bloquear VPN, proxy y Tor sin contratar inicialmente un servicio de pago.
3. Mantener privacidad, aislamiento por tienda, permisos Premium y comportamiento seguro ante fallos del proveedor.

## Flujo de bloqueo manual

1. El administrador inicia la acción desde una sesión de visitante o escribe una IP pública exacta.
2. El backend resuelve la IP dentro de la tienda y busca sesiones históricas con el mismo HMAC de IP.
3. La interfaz muestra candidatos seguros sin exponer HMAC: etiqueta, última actividad y datos mínimos de contexto.
4. El administrador selecciona uno, varios o todos los candidatos.
5. Al confirmar, el bloqueo conserva HMAC de IP y de los dispositivos elegidos con coincidencia `any`.
6. El mismo navegador queda bloqueado aunque cambie de IP o use VPN mientras conserve la cookie `pz_client_device`.
7. Un dispositivo nuevo observado después puede registrarse como candidato privado para confirmación posterior.

Si no existe historial, se permite el bloqueo solo por IP con advertencia. La cookie identifica una instalación de navegador, no el aparato físico: un navegador distinto, modo privado o borrado de datos crea otra identidad.

## Política VPN/proxy

| Valor | Comportamiento |
|---|---|
| `off` | No consulta al proveedor ni crea caché/evento. |
| `monitor` | Clasifica la IP y registra detección, pero no bloquea. |
| `block` | Bloquea una clasificación positiva solo si Seguridad está en modo `protection`. |

El piloto usa `POST https://api.ipapi.is` desde PocketBase y evalúa exclusivamente los booleanos `is_vpn`, `is_proxy` e `is_tor`. Una señal de centro de datos o red móvil por sí sola no causa bloqueo.

La modalidad anónima gratuita publicada por el proveedor admite 100 solicitudes diarias por IP cliente. Para reducir consumo:

- resultado válido: caché privada durante 24 horas;
- indisponible, cuota o contrato inválido: caché durante 5 minutos;
- tiempo máximo de consulta: 2 segundos;
- fallo del proveedor: **fail open**, acceso permitido y evento `vpn_check_unavailable`.

Referencias de contrato: [ipapi.is Developers](https://ipapi.is/developers.html) y [PocketBase: Sending HTTP requests](https://pocketbase.io/docs/js-sending-http-requests/).

## Privacidad y seguridad

- La IP pública se envía al proveedor externo porque es el dato que debe clasificar.
- La base local no conserva esa IP plana en la caché: guarda un HMAC derivado por tienda.
- Caché y eventos son colecciones privadas sin reglas REST públicas.
- La respuesta de rechazo no revela proveedor, HMAC, señales ni reglas internas.
- La configuración exige capacidad Premium y permisos de gestión; Master conserva su autoridad histórica.
- `security.checkOrigin` permanece activo y no existe bypass local.
- No se confía en `X-Forwarded-For` enviado directamente por el navegador; la IP parte del runtime/proxy confiable existente.

## Migración aditiva

`1786233600_security_vpn_policy.js`:

- agrega `vpn_policy` a `store_security_settings`, con default efectivo `off`;
- amplía eventos con `vpn_detected`, `vpn_blocked` y `vpn_check_unavailable`;
- amplía auditoría con `vpn_policy_updated`;
- crea `store_security_ip_reputation_cache`, aislada por relación de tienda e índice único `(store, ip_hmac)`.

No se elimina ni transforma información histórica. La migración aún no ha sido aplicada ni verificada en staging.

## Validación local ejecutada

| Control | Resultado |
|---|---|
| Bloqueo manual inmediato + política VPN | **13/13 aprobadas** |
| Regresión enforcement/runtime/frontend/S7P3/tenant/IP | **47/47 aprobadas** |
| Auditoría central | **21/21 aprobadas** |
| Backend completo | **485 totales: 478 aprobadas, 7 omitidas declaradas, 0 fallidas** |
| Frontend completo | **306/306 aprobadas, 0 omitidas, 0 fallidas** |
| Sintaxis Node de hooks y migración | **Aprobada** |
| Build Astro SSR | **Aprobado**, con tres warnings legacy ya conocidos |
| Artefactos del build | **0 source maps y 0 marcadores del proveedor/nombres de secretos** |
| `git diff --check` | **Aprobado** |

Las pruebas nuevas cubren:

- política desactivada sin llamadas externas;
- detección y bloqueo por modo;
- caché 24 h / 5 min;
- aislamiento de caché por tienda;
- indisponibilidad y cuota con fail open;
- ausencia de IP plana en caché/eventos;
- selección inmediata de uno, varios o todos los dispositivos;
- requisito de modo protección para activar bloqueo.
- migración aditiva, privada, idempotente y reversible en fixture de contrato.

No se realizó prueba de bloqueo solo por IP en localhost.

## Validación obligatoria en staging

1. Confirmar de forma segura presencia/formato de `PZ_SECURITY_HMAC_SECRET` y `PZ_SECURITY_AES_KEY`, sin exponer valores.
2. Confirmar `Origin`, `Host`, `X-Forwarded-Host`, `X-Forwarded-For`, proxies confiables, HTTPS y `realIP()`.
3. Confirmar cookie `pz_client_device` con dominio, `Secure` y `SameSite` correctos.
4. Aplicar la migración y comprobar que el default `off` no cambia el acceso existente.
5. Validar salida HTTPS desde PocketBase a `api.ipapi.is`, timeout, cuota y fail open.
6. Probar modo `monitor` antes de `block` con IP móvil, una VPN conocida, Tor/proxy, IP limpia y dos tiendas.
7. Revisar falsos positivos y eventos sin exponer IP plana.
8. Probar cambio de red, VPN en el mismo navegador, navegador alterno, modo privado y borrado de cookie.

## Operaciones no realizadas

No se cambió Cloudflare, Coolify, DNS, TLS, proxy, infraestructura ni configuración remota. No se hizo commit, push ni despliegue para esta extensión.

## Continuidad

- PZ-SEC-VPN01: **EN REVISIÓN**, pendiente de staging y Kraken.
- PZ-SEC-BLOCKS03B: **EN REVISIÓN**, pendiente de staging real y Kraken.
- S7P3: **EN REVISIÓN**, con 17 bloques manuales pendientes y sin confirmación final de Kraken.

## Anexo posterior PZ-SEC-ADDR01

Después de VPN01 se aprobó una extensión separada para seleccionar direcciones históricas al crear un bloqueo de cliente y avisar si un pedido posterior coincide. La dirección no se usa para denegar acceso: genera una alerta privada y el pedido continúa.

La nueva persistencia conserva HMAC por tienda y no copia la dirección legible a eventos o notificaciones. Su reporte es `docs/tusenda84/reportes/PZ-SEC-ADDR01-alertas-direccion-cliente-bloqueado.md`.

VPN01, BLOCKS03B y S7P3 permanecen **EN REVISIÓN** y pendientes de staging/confirmación; este anexo no cambia sus estados.
