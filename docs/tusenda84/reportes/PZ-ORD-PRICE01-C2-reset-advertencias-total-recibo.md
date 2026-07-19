REPORTE FINAL — PROMPT ID: PZ-ORD-PRICE01-C2

# Motivo al restablecer, advertencias por estado y total final del recibo

## Estado de revisión

La corrección C2 quedó implementada y verificada localmente, pendiente de QA final y confirmación explícita. No se marcaron como completados `PZ-ORD-PRICE01`, C1, C2 ni V7E9.

## 1. Preflight

- Repositorio confirmado: `E:\Trabajo\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt`.
- `git rev-parse --show-toplevel` confirmó la raíz real de `E:`.
- Rama confirmada: `dev`.
- Se preservaron todos los cambios preexistentes de PZ-ORD-PRICE01 y C1.
- No se importó, descomprimió ni usó V110 para reemplazar el repositorio.
- No se ejecutaron `reset`, `clean`, `checkout -- .`, `restore`, `stash`, stage, commit, push, merge ni cambio de rama.

## 2. Archivos C2 modificados o agregados

- `backend-powerzona/pb_hooks/pz_order_pricing_lib.js`
- `backend-powerzona/tests/pz_order_pricing.test.cjs`
- `backend-powerzona/tests/pz_order_pricing_http_runtime.test.cjs`
- `frontend-powerzona/src/pages/admin/orders.astro`
- `frontend-powerzona/src/pages/orden/[orderNumber]/[token].astro`
- `frontend-powerzona/tests/orderPricingBackend.test.mjs`
- `frontend-powerzona/tests/orderPricingC2.visual.mjs`
- `docs/tusenda84/reportes/evidencias/PZ-ORD-PRICE01-C2/*`

La ruta pública real del recibo es `frontend-powerzona/src/pages/orden/[orderNumber]/[token].astro`. No se inventó ni duplicó otra vista.

## 3. Motivo obligatorio del reset

El primer clic en `Restablecer precio del sistema` ya no muta datos. Cambia el modal a una confirmación explícita que muestra:

- precio final actual;
- precio automático del sistema;
- diferencia que se retirará;
- motivo obligatorio nuevo;
- observación interna;
- botones `Cancelar` y `Restablecer precio`.

El segundo paso sólo invoca el endpoint privado después de validar el motivo. El cliente envía exclusivamente `reason_code` y `reason_text`. El backend rechaza payload vacío, motivo ausente y cualquier campo adicional, incluidos actor, tienda, precio, diferencia, total o estado.

## 4. Validación de `other`

Se conservó exactamente el catálogo aprobado de seis motivos. `other` exige texto recortado de 5 a 500 caracteres; 4 caracteres, texto vacío y más de 500 se rechazan. Los motivos predefinidos permiten una observación opcional. Los errores aparecen debajo del campo correspondiente y el foco vuelve al control inválido.

## 5. Auditoría

Cada restablecimiento válido crea una entrada nueva e inmutable con la acción existente `reset`, equivalente semántico a `removed` dentro del esquema V110. La entrada registra el ajuste retirado, precio final anterior, precio automático restaurado, delta unitario anterior, delta total anterior, cantidad, actor resuelto por servidor, fecha y motivo nuevo.

Las auditorías anteriores no se eliminan ni modifican. El motivo previo de la línea no se reutiliza. El motivo y actor del reset permanecen internos y no aparecen en recibo, WhatsApp ni respuestas públicas.

## 6. Atomicidad

Autorización, aislamiento de tienda, orden, línea, estado, motivo, limpieza del ajuste, recálculo, guardado de orden y auditoría se ejecutan dentro de la misma transacción PocketBase. La prueba de contrato verifica que la auditoría se guarda después del recálculo dentro de `runInTransaction`; una excepción de auditoría propaga el fallo y revierte la transacción completa.

## 7. Advertencia Confirmada

Al abrir el ajuste o su confirmación de reset con estado `confirmed`, el modal muestra antes de confirmar:

`La orden está confirmada. Este cambio modificará el importe acordado, pero no modificará el inventario.`

## 8. Advertencia Preparando

Se corrigió la normalización de estado para conservar `preparing` como valor real. El modal muestra:

`La orden está en preparación. Este cambio modificará el importe acordado, pero no modificará el inventario.`

Si el precio aumenta, esta advertencia permanece visible junto con `Estás aumentando el total que deberá pagar el cliente.`; ninguna sustituye a la otra.

## 9. Inventario y estado sin cambios

El backend mantiene permitidos `pending`, `confirmed` y `preparing`, y rechaza `delivered` y `cancelled`. El runtime comparó el stock antes y después de ajustar/restablecer en Confirmada y Preparando y confirmó igualdad. También confirmó que el estado original permanece intacto. El reset no descuenta, revierte ni vuelve a descontar inventario y no crea notificaciones.

## 10. Total final del recibo

El recibo agrega después de `Envío` una fila destacada `Total final`. Para USD usa directamente `orders.total`, con `usd_total` como campo canónico compatible. No deriva el valor desde datos del navegador.

La evidencia principal muestra:

- productos antes del ajuste: `$18.00 USD`;
- ajuste especial: `−$4.00 USD`;
- productos finales: `$14.00 USD`;
- envío: `$4.00 USD`;
- total final: `$18.00 USD`.

El envío se incluye exactamente una vez.

## 11. Envío y recogida

El runtime validó una orden con envío `$4.00 USD`, cuyo total canónico es subtotal más envío una sola vez, y una orden de recogida/envío cero, cuyo total coincide con los productos finales. El recibo conserva `Sin costo` para envío gratuito o recogida.

## 12. Monedas

- USD presenta `orders.total`.
- CUP y monedas 1:1 usan `local_currency_total + shipping_cup`, ambos campos persistidos por servidor y en la misma moneda.
- En carrito mixto se presentan por separado el total local y el componente `usd_only_total`, unidos visualmente con `+` pero sin convertirlos en una cifra monetaria inventada.
- El envío local se incorpora una sola vez al bloque local.

## 13. WhatsApp

El mensaje no fue rediseñado. Las pruebas de regresión confirman que sigue usando los totales canónicos, mantiene el envío según la lógica actual, presenta sólo `Ajuste especial` y no expone código de motivo, texto interno ni actor.

## 14. Runtime PocketBase

Se ejecutó PocketBase real en localhost con una base temporal aislada y prefijo `PZORDC2QA_<timestamp>`.

Resultado: 1 escenario integral aprobado, 0 fallos y 0 omisiones.

Cobertura incluida:

- reset vacío/ausente rechazado;
- catálogo y límites de `other`;
- payload F12 con actor/precio/diferencia/total/estado rechazado;
- reset válido y precio automático restaurado;
- auditoría nueva, actor servidor, delta retirado e historial conservado;
- pending, confirmed y preparing permitidos;
- delivered y cancelled rechazados;
- Staff, suspendido y cruce de tienda rechazados;
- stock y estado sin cambios;
- auditoría inmutable;
- recibos públicos con y sin envío, cupón, ajuste negativo y aumento;
- total público igual al total canónico de la orden.

La limpieza del propio runtime confirmó cero fixtures con prefijo C2.

## 15. Playwright estándar

Se usó Playwright estándar, sin `playwright-interactive` ni `js_repl`, contra Astro y PocketBase locales temporales. Se validaron 1440×900, 390×844 y 412×915, foco, Escape, atrapado de foco, errores por campo, ausencia de scroll horizontal y posición del modal.

Evidencias:

- `01-reset-motivo-obligatorio-pc.png`
- `02-reset-otro-explicacion.png`
- `03-advertencia-confirmada.png`
- `04-advertencia-preparando.png`
- `05-total-final-recibo.png`
- `06-reset-movil.png`

Directorio: `docs/tusenda84/reportes/evidencias/PZ-ORD-PRICE01-C2/`.

La inspección visual final confirmó jerarquía premium, controles completos, ambas advertencias en Preparando, envío antes del total y modal móvil sin solapamientos. Playwright cerró Chromium y verificó cero fixtures visuales C2.

## 16. Suites

- Focal backend: 17 aprobadas, 0 fallos, 0 omisiones.
- Focal frontend: 9 aprobadas, 0 fallos, 0 omisiones.
- Runtime C2 real: 1 aprobado, 0 fallos, 0 omisiones.
- Suite backend completa: 397 total, 391 aprobadas, 0 fallos, 6 omitidas.
- Suite frontend completa: 166 total, 166 aprobadas, 0 fallos, 0 omisiones.

Las seis omisiones backend son runtimes HTTP opt-in sin variables en la ejecución agregada. El runtime C2 omitido allí sí fue ejecutado separadamente con las variables locales y pasó.

## 17. Build

`npm run build` de Astro SSR finalizó correctamente. Sólo aparecieron las tres advertencias no bloqueantes ya existentes sobre `getStaticPaths()` en rutas dinámicas de categoría, subcategoría y producto.

## 18. Limpieza

- Cero fixtures `PZORDC2QA_`.
- PocketBase temporal y Astro C2 cerrados.
- Chromium Playwright cerrado.
- Base temporal `pzordc2qa-runtime` eliminada.
- `dist`, `.astro` y el directorio `.tmp` temporal eliminados.
- No se generaron traces, videos, storage state, `playwright-report` ni `test-results`.
- El Astro preexistente en 4321 se conservó sin cerrarlo, tal como exige el prompt.
- `backend-powerzona/pb_data` real no se usó ni modificó.

## 19. Git final

Se ejecutaron `git diff --check`, `git status --short`, `git diff --name-only` y `git diff --stat`. Los cambios preexistentes y C2 permanecen sin stage. No hay `pb_data`, `node_modules`, `dist`, `.astro`, `.tmp`, perfiles de navegador ni credenciales en el conjunto final.

## 20. Operaciones externas y alcance legacy

No se ejecutaron commit, push, merge, cambio de rama, deploy, Coolify ni Cloudflare. No se creó migración: el esquema V110 ya soporta el reset auditado con la acción `reset` y todos los snapshots necesarios.

La compatibilidad de órdenes legacy quedó expresamente fuera de alcance. No se modificaron `legacyCalculatedLine()`, backfills, precio cero legacy ni el diseño económico base, y tampoco se eliminaron sus pruebas o defensas.

EN REVISIÓN — PZ-ORD-PRICE01-C2 PENDIENTE DE QA FINAL
