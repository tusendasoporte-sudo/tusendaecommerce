---
title: "PZ-SEC-BLOCKS03B - Enforcement público de Seguridad"
project: "PowerZona / Tu Senda 84"
date: "2026-08-06"
source_revision: "V122"
status: "EN REVISIÓN"
---

# PZ-SEC-BLOCKS03B - Enforcement público de Seguridad

## Estado

La implementación y la validación local proporcional al riesgo están terminadas. El punto permanece **EN REVISIÓN / PENDIENTE DE CONFIRMACIÓN EXPLÍCITA DE KRAKEN**.

Este resultado no cierra S7P3. Sus 17 bloques manuales y la confirmación final de Kraken siguen pendientes. Tampoco absorbe P7D4, P7X5 ni Q7F6.

## Resultado implementado

- Un evaluador backend único aplica bloques activos por tienda para `orders`, `reviews`, `raffles`, `all_interactions` y `full_access`.
- La decisión exige Premium vigente, `security_enabled`, Seguridad habilitada, modo `protection`, bloqueo manual habilitado y, para `full_access`, su opción específica habilitada.
- Se respetan `starts_at`, `expires_at`, `status`, `revoked_at`, los modos de coincidencia `any`/`all` y las señales seleccionadas en el bloqueo.
- La tienda se carga en PocketBase desde slug, ID de negocio o credencial canónica almacenada. El teléfono usado por recibos, reseñas asociadas y registro de identidad se recupera desde la orden almacenada.
- Checkout y Rifas usan el teléfono normalizado del payload de negocio solo para decidir esa misma operación. No se aceptan cabeceras libres de tenant, teléfono, IP, HMAC o dispositivo como identidad.
- La señal de dispositivo se obtiene exclusivamente de la cookie aleatoria `pz_client_device`, se valida, se resume con SHA-256 en servidor y después se deriva por HMAC por tienda. La señal IP procede de `realIP()`; no se usa el digest de dispositivo enviado por el tracker como señal de bloqueo.
- `full_access` se consulta en middleware antes de continuar con el render SSR de home, búsqueda, categorías, subcategorías, productos, regalos, carrito/checkout, Landing QR, Rifas, recibos, reseñas y rutas equivalentes por slug.
- `/admin`, `/master` y `/t/[storeSlug]/admin/*` quedan fuera del preflight público. En REST, los visitantes y usuarios con rol `customer` siguen sujetos al bloqueo; los actores administrativos no.
- La respuesta de `full_access` es un 404 genérico, privado, `no-store`, `noindex`, sin datos de tienda ni referencias a bloqueo o Seguridad.
- Las mutaciones públicas usan proxies de mismo origen y destino fijo para checkout, reseñas, Rifas, analítica, navegación de Seguridad, Landing QR y registro posterior del pedido. Solo se reenvían JSON, la cookie propia, un ID de solicitud y la dirección entregada por el runtime SSR.
- Las lecturas/listados REST anónimos o de clientes y las descargas públicas de archivos quedan filtradas por `full_access` antes de serializar contenido.
- Cada denegación intenta registrar `blocked_attempt`, una entrada central `store_activity_audit` y, si está configurada, una notificación administrativa. Las claves derivadas hacen idempotente el mismo intento; una falla de escritura no convierte la denegación en acceso.
- La notificación añade el tipo `security_blocked_attempt` mediante migración. Los HMAC, ciphertext, IP privada, metadata de decisión y motivo interno permanecen en colecciones privadas y no se copian a auditoría o notificación pública.
- La expiración se ejecuta por tienda y la evaluación vuelve a comprobar tiempo y revocación, incluso si la escritura de expiración no pudiera completarse.

No se añadió fingerprint del navegador, bloqueo automático por rating/reseña ni otra regla fuera de BLOCKS03B. `security.checkOrigin` continúa habilitado.

## Matriz de alcance

| Acción pública | Bloqueos que aplican |
|---|---|
| Pedido, checkout y registro posterior | `orders`, `all_interactions`, `full_access` |
| Crear reseña | `reviews`, `all_interactions`, `full_access` |
| Consultar/entrar/comprobar Rifa | `raffles`, `all_interactions`, `full_access` |
| Analítica, click Landing QR y navegación | `all_interactions`, `full_access` |
| Carga de página, lectura/listado REST y archivo público | `full_access` |

## Validación local ejecutada

| Control | Resultado |
|---|---|
| Backend focal BLOCKS03B | **10/10 aprobadas**: 9 unitarias/contrato + 1 runtime HTTP real con PocketBase efímero |
| Runtime focal | Checkout por teléfono, cookie de dispositivo, 404 genérico, idempotencia, lectura y listado REST directos, reseña, analítica, navegación, dos tiendas y revocación |
| Frontend focal BLOCKS03B | **7/7 aprobadas** |
| Frontend completo | **290/290 aprobadas; 0 fallidas; 0 omitidas** |
| Backend completo | **598 totales; 591 aprobadas; 7 omitidas declaradas; 0 fallidas** |
| Build SSR | **Aprobado**; solo los tres warnings históricos de `getStaticPaths()` en rutas dinámicas legacy |
| F12 / artefactos cliente | **0 source maps; 0 `console.log/info/warn`; 0 marcadores sensibles en bundles no administrativos** |
| `git diff --check` | **Aprobado** |

La prueba runtime empleó secretos artificiales, base efímera, loopback y coincidencias por cookie/teléfono. No se hizo ninguna prueba de bloqueo solo por IP en localhost. Todos sus fixtures se eliminaron al finalizar.

La primera ejecución desde el worktree Codex en `HEAD` separado (`5ac8fa0`) detectó correctamente la precondición de rama de los casos 5 y 17 de `r84_staging_environment.test.cjs`. Tras alinear el resultado con el checkout principal, que ya estaba en `dev` y en el mismo commit base, se repitió la suite completa: ambos casos pasaron y el resultado final quedó en **0 fallos**. No se ejecutó ningún cambio de rama.

## Validación que requiere staging real

No se afirma cobertura real por IP ni validación de infraestructura. Antes de aprobar BLOCKS03B deben comprobarse en staging:

1. Presencia y validez real de `PZ_SECURITY_HMAC_SECRET` y `PZ_SECURITY_AES_KEY`, sin imprimir sus valores.
2. `realIP()` con una IP pública conocida y la cadena real de proxies confiables.
3. Cloudflare, Coolify, HTTPS, `Host`, `Origin`, `X-Forwarded-Host` y `X-Forwarded-For` con `security.checkOrigin` activo.
4. Dominio, alcance, `Secure` y `SameSite` de `pz_client_device` detrás del proxy real.
5. Flujos PC/móvil, sesiones separadas, enlaces directos, archivos y respuestas privadas/no-store desde el dominio desplegado.
6. Expiración y revocación observadas con reloj y persistencia de staging; eventos/notificaciones únicos en reintentos reales.
7. Aislamiento con dos tiendas reales y confirmación de que admin/master nunca reciben el bloqueo público.

Cloudflare, Coolify, el proxy, la IP pública, los secretos y el despliegue no fueron inspeccionados ni modificados localmente.

## Limpieza y control de cambios

- Sin fixtures, procesos PocketBase/Node, listeners ni archivos runtime temporales al cierre.
- `dist`, `.astro`, la copia temporal de `pocketbase.exe` y el junction temporal de `node_modules` fueron retirados tras validar.
- Después de esta validación se autorizó crear un commit local en `dev`. No se autorizó push, merge, cambio de rama ni despliegue.

## Continuidad

- PZ-SEC-BLOCKS03B: **EN REVISIÓN**, pendiente de staging y confirmación explícita de Kraken.
- S7P3: **EN REVISIÓN**, con 17 bloques manuales pendientes y sin cierre de Kraken.
- P7D4, P7X5 y Q7F6: pendientes, sin cambios funcionales en este alcance.
