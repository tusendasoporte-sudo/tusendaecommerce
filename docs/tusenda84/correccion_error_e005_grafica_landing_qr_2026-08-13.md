# Corrección E005 — gráfica de Landing QR

Fecha: 13 de agosto de 2026
Superficies afectadas: Web Admin y APK Admin (WebView), sección `Resumen > Landing QR`.

## Error confirmado

Los totales `Clics Landing QR` y `Botón más tocado` seguían disponibles, pero la gráfica mostraba siempre:

> El resumen diario de Landing QR no está disponible para este periodo.

La tarjeta quedaba además con un espacio vacío demasiado grande en la vista móvil.

## Causa raíz

La función visual `createLandingQrChartMarkup()` continuaba implementada y lista para dibujar visitas y clics. Sin embargo, `computeLandingQrAnalytics()` reemplazaba incondicionalmente la serie diaria por `series: []`.

El endpoint privado `/api/pz/store/analytics/summary` entregaba solo los totales y botones agregados de Landing QR. No existía en su contrato seguro una serie diaria que la interfaz pudiera utilizar.

## Corrección aplicada

- Se añadió `queryLandingQrDaily()` para agrupar visitas y clics por día dentro del periodo solicitado.
- La definición de visita se mantiene idéntica a la métrica total existente: una visita por sesión y día; si no hay sesión, se usa visitante y día; como último recurso, el evento individual.
- Todos los días del periodo se devuelven en orden, incluidos los que tienen cero visitas y cero clics. Esto evita cortes engañosos en la línea.
- `sanitizeLandingQr()` permite únicamente `day`, `label`, `views` y `clicks` en cada punto diario, con máximo de 30 días.
- `computeLandingQrAnalytics()` vuelve a convertir esa serie privada en los puntos que ya consumía `createLandingQrChartMarkup()`.
- Si el periodo no tiene actividad, se usa el estado vacío compacto ya existente: `Sin actividad visible todavía`.

No se modificaron la captura de eventos, la página Landing QR pública, la generación del QR ni sus botones.

## Funciones ya implementadas que fueron tocadas

### `sanitizeLandingQr()`

- Conserva `views`, `clicks` y `top_buttons` sin cambios.
- Añade la allowlist de la serie `daily`.
- Continúa eliminando `session_id`, `visitor_id`, `link_id`, URL, ruta, agente de usuario y datos crudos.

### `buildSummary()`

- Conserva el endpoint privado y su aislamiento por tienda.
- Conserva la condición `landing_qr.manage`; sin ese permiso no se consulta ni se devuelve Landing QR.
- Combina el resumen agregado existente con la nueva serie diaria saneada.

### `computeLandingQrAnalytics()`

- Conserva el cálculo de totales y botón más tocado.
- Sustituye el arreglo vacío fijo por el mapeo de `landing_qr.daily`.

No fue necesario modificar `renderLandingQrAnalytics()` ni `createLandingQrChartMarkup()`: ambas funciones ya distinguían correctamente entre datos, cero actividad y tooltips.

## Función nueva

### `queryLandingQrDaily()`

Consulta exclusivamente eventos de Landing QR de la tienda y del periodo autenticados. Devuelve agregados diarios; no devuelve ni serializa eventos individuales.

La función `queryLandingQr()` existente no se cambió. Así se conserva sin alteraciones el contrato que consume el panel Master para totales y botones más tocados.

## Pruebas automatizadas necesarias

1. `backend-powerzona/tests/pz_store_marketing_analytics_c3.test.cjs`
   - serie diaria con días activos y días en cero;
   - parámetros de tienda y periodo enlazados, no interpolados;
   - contrato exacto `day`, `label`, `views`, `clicks`;
   - redacción de sesión y visitante;
   - ausencia completa de Landing QR sin `landing_qr.manage`.
2. `backend-powerzona/tests/pz_m7u2_c3_http_runtime.test.cjs`
   - consulta HTTP real contra PocketBase;
   - contrato seguro de cada punto diario;
   - aislamiento entre tiendas y ausencia de marcadores privados.
3. `frontend-powerzona/tests/e005LandingQrChart.test.mjs`
   - `computeLandingQrAnalytics()` consume `landing_qr.daily`;
   - ya no existe la asignación fija `series: []`;
   - la gráfica conserva líneas de visitas, clics y estado sin actividad.
4. Regresiones M7U2-C3 de permisos y L7Q1 de Landing QR Premium.
5. Build completo de Astro y `git diff --check`.

## Prueba manual necesaria antes de producción

Realizar en navegador y en el emulador Android después de desplegar en staging:

1. Entrar con una tienda Premium y un usuario con `analytics.view` y `landing_qr.manage`.
2. Abrir `Resumen > Landing QR` y probar `Hoy`, `7 días`, `15 días` y `30 días`.
3. En un periodo sin actividad, confirmar el estado `Sin actividad visible todavía`, sin un panel vacío excesivo.
4. Abrir la Landing QR pública y realizar una visita y un clic real.
5. Volver al resumen, actualizar y confirmar que suben los totales y aparece el punto del día correcto.
6. Confirmar que la línea verde representa visitas y la azul punteada representa clics.
7. Tocar o enfocar un punto y verificar su etiqueta y valor.
8. Repetir en Web Admin y APK Admin.
9. Entrar con un usuario que solo tenga `analytics.view`: la sección Landing QR no debe mostrarse ni incluirse en la respuesta privada.
10. Verificar otra tienda para confirmar que no recibe actividad de la tienda usada en la prueba.

Estado actual: corrección implementada localmente; falta validación visual en staging antes de producción.

## Resultado de validación local

- Pruebas focales E005, permisos M7U2-C3 y capacidad L7Q1: `22/22` aprobadas.
- Regresión backend de actividad y analíticas privadas: `28/28` aprobadas.
- Build completo de Astro: aprobado. Conserva únicamente las tres advertencias preexistentes de rutas dinámicas.
- `git diff --check`: aprobado.
- La prueba HTTP real alcanzó y aprobó el resumen Landing QR, su serie completa para el periodo, la suma diaria de clics y el contrato sin datos privados. Más adelante falla en una aserción ajena de `settings` (`2 !== 1`, línea 1405 después de añadir las aserciones E005); el resultado se repitió dos veces antes de ampliar la verificación diaria y no se modificó ese proceso dentro de E005.
- La suite frontend global ejecuta y aprueba E005, pero reporta cuatro fallos ajenos al diff E005 en expectativas de Ajustes, token SSR, metadato de actividad y editor V7E9. No se alteraron esas funciones para evitar ampliar el alcance de esta corrección.
