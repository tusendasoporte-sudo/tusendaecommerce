# Corrección E003 — visibilidad y productos agotados

Fecha: 12 de agosto de 2026
Superficies afectadas: Web Admin, APK Admin (WebView) y tienda pública.

## Error confirmado

Se cubren tres síntomas relacionados:

1. El menú de Productos no mostraba `Ocultar producto` para algunos administradores ya existentes.
2. En esos mismos perfiles no estaba disponible el control `Visible en tienda` del editor.
3. Un producto con inventario agotado podía desaparecer del catálogo cuando utilizaba variaciones y todas quedaban sin stock.

## Causa

- Las plantillas actuales `secondary_admin` y `catalog_inventory` incluyen `catalog.products.visibility`, pero algunos registros heredados podían conservar una lista anterior sin ese permiso.
- El resumen público de variaciones confundía dos estados distintos: `sin variaciones activas con precio válido` y `variaciones válidas, pero agotadas`. Ambos estados retiraban al producto del catálogo.

## Corrección aplicada

- La migración `1786579500_e003_product_visibility_permission.js` agrega de forma idempotente el permiso faltante únicamente a las plantillas predefinidas `secondary_admin` y `catalog_inventory`.
- Los perfiles `custom`, `read_only` y las demás plantillas no reciben permisos nuevos.
- El menú usa los textos explícitos `Ocultar producto` y `Mostrar producto`.
- `addVariationPriceSummary` ahora conserva el producto cuando tiene variaciones activas con precio, aunque todas estén agotadas. Entrega `variation_public_available = false` y `variation_public_stock = 0` para que la interfaz muestre `Agotado` y mantenga bloqueada la compra.
- Un producto sin variaciones y con stock `0` continúa en el catálogo, igual que antes.
- Un producto con variaciones sin ningún precio público válido continúa fuera del catálogo; no se publica una configuración incompleta.

## Segunda validación en staging — corrección adicional

La prueba manual posterior al primer despliegue demostró que E003 todavía no estaba cerrado. Se reprodujeron tres causas adicionales:

1. El evento general `input` del formulario recalculaba la visibilidad antes del evento `change` del checkbox. Por eso `Visible en tienda` volvía inmediatamente al valor anterior y no habilitaba Guardar. El mismo conflicto podía afectar la visibilidad de variaciones.
2. El filtro público del backend `publicProductRecordAvailable` reutilizaba la disponibilidad de checkout y trataba `stock_unavailable` como si el producto estuviera oculto. El resumen del frontend no podía corregirlo porque el backend ya había retirado el registro.
3. La APK podía conservar una vista cargada con el permiso anterior. Además de la migración, Productos reconoce defensivamente al Administrador principal mediante `stores.primary_admin_user`; esto no concede el permiso a perfiles personalizados ni a colaboradores.

Correcciones aplicadas en esta segunda revisión:

- El formulario omite el recálculo prematuro durante `input` para los checkbox de visibilidad; `change` conserva el nuevo valor y habilita el guardado.
- `publicProductRecordAvailable` mantiene públicos los registros cuyo único bloqueo comercial es `stock_unavailable`.
- Checkout y Pedidos conservan `evaluateUnitAvailability`, por lo que un producto agotado sigue sin poder comprarse.
- Productos vencidos, ocultos manualmente, con taxonomía inactiva o sin precio válido continúan fuera de la lectura pública.
- El Administrador principal y el modo soporte Master conservan explícitamente la acción de visibilidad en Web y APK.

## Funciones implementadas previamente que fueron tocadas

### Resumen público de variaciones

- Antes estaba dentro de `src/lib/api.ts`.
- Ahora vive en `src/lib/publicProductAvailability.ts` como `addVariationPriceSummary`.
- Consumidores existentes: `getProducts` y `getFeaturedProducts`; indirectamente portada, búsqueda, categorías, subcategorías y tarjetas relacionadas.
- Cambio permitido: solo el caso `agotado` deja de confundirse con `inválido`.
- Comportamientos preservados: precio de oferta válido, precio mínimo disponible cuando todavía hay opciones comprables, preorder, productos sin control de stock y exclusión de configuraciones sin precio.

### Acción Marcar agotado

- No se cambió su mutación.
- Continúa enviando únicamente `stock = 0`.
- No envía ni modifica `active`.

### Visibilidad del producto

- Se conserva el permiso granular `catalog.products.visibility` tanto en frontend como en backend.
- Se conservan las dos vías existentes: menú de tres puntos y checkbox `Visible en tienda` del editor.
- Se conservan los bloqueos de activación por vencimiento.
- Se corrigió el orden de eventos `input`/`change` del formulario que impedía cambiar el checkbox.
- Se añadió una comprobación defensiva del Administrador principal sin ampliar permisos de otros perfiles.

### Filtro público del backend

- Función tocada: `publicProductRecordAvailable` en `pz_store_permission_enforcement_lib.js`.
- Antes exigía una unidad comprable en ese instante; por ello stock `0` eliminaba el registro público.
- Ahora acepta `stock_unavailable` únicamente para lectura y presentación.
- No se modificó `evaluateUnitAvailability`; carrito, checkout y edición de pedidos siguen rechazando inventario insuficiente.

## Pruebas automatizadas necesarias

1. `frontend-powerzona/tests/e003ProductVisibilitySoldout.test.mjs`
   - menú y editor mantienen las dos vías de visibilidad;
   - `Marcar agotado` solo cambia stock;
   - producto simple agotado permanece público;
   - producto con todas las variaciones agotadas permanece público como agotado;
   - producto variable sin precio válido continúa excluido.
2. `backend-powerzona/tests/pz_e003_product_visibility_permission.test.cjs`
   - repara únicamente las dos plantillas previstas;
   - no amplía perfiles personalizados o de lectura;
   - no duplica el permiso al ejecutarse más de una vez.
3. `backend-powerzona/tests/pz_store_privacy_c3.test.cjs`
   - producto simple agotado permanece público;
   - padre y variación agotados permanecen públicos;
   - la lectura pública conserva sus redacciones de seguridad.
4. `backend-powerzona/tests/pz_v7e9_c3_http_runtime.test.cjs`
   - valida el flujo HTTP real de listado y detalle agotado;
   - confirma que checkout lo rechaza y que `active` permanece en `true`.
5. Regresiones existentes de permisos, visibilidad, vencimientos, catálogo, carrito y checkout.
6. Compilación de producción de Astro y `git diff --check`.

## Prueba manual necesaria antes de producción

Realizar en navegador y en el emulador Android:

1. Entrar con un `Administrador secundario` creado antes de esta corrección.
2. Abrir `Productos > ⋯` y confirmar `Ocultar producto`.
3. Ocultarlo y confirmar estado `OCULTO` en Admin y desaparición en la tienda pública.
4. Abrir el editor, volver a activar `Visible en tienda`, guardar y confirmar que reaparece.
5. Entrar con un perfil `Personalizado` sin permiso de visibilidad y confirmar que no puede ejecutar esas acciones.
6. En un producto simple visible, usar `Marcar agotado`: debe quedar con stock `0`, estado `VISIBLE` en Admin y tarjeta `Agotado` en la tienda.
7. Abrir ese producto: el botón debe decir `Agotado`, permanecer deshabilitado y no permitir agregar al carrito ni completar pedido.
8. Dejar todas las variaciones de un producto en stock `0`: el producto debe seguir visible como `Agotado`.
9. Restaurar stock en una variación: la tarjeta debe volver a `Varias opciones` y permitir seleccionar una opción disponible.
10. Confirmar que un producto vencido no puede mostrarse hasta corregir o eliminar su fecha.

La migración se ejecuta al desplegar PocketBase. Después del despliegue se debe recargar la página en Web y la vista del WebView en la APK.
