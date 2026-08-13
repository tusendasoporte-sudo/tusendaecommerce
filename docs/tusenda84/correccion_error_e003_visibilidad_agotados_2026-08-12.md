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

## Tercera validación manual — 13 de agosto de 2026

La prueba posterior confirmó que `Marcar agotado` ya conserva correctamente el producto en la tienda pública, con estado `Agotado` y compra bloqueada. Permanecían tres defectos de interfaz:

1. Algunos recorridos táctiles cambiaban visualmente `Visible en tienda`, pero el editor dependía del evento `change` para actualizar `productManualActive`; por eso Guardar podía no activarse.
2. Si la APK cambiaba la visibilidad mientras la web seguía abierta, `openEditProductEditor` utilizaba el registro conservado en memoria y podía comparar contra un estado inicial antiguo.
3. Una regla responsive ocultaba explícitamente `.js-product-toggle`; era la causa directa de que la APK no mostrara `Ocultar producto` o `Mostrar producto`, aunque el mismo usuario tuviera permiso y pudiera usar el checkbox.

### Funciones existentes tocadas en esta revisión

- `openEditProductEditor`: ahora obtiene el producto actual desde PocketBase con `cache: no-store` antes de crear el snapshot inicial. Si la consulta falla, mantiene el registro ya cargado para no inutilizar el editor.
- `closeProductActionMenus` y `positionProductActionsMenu`: ahora limpian y calculan coordenadas fijas dentro del área útil, respetando la barra superior y la navegación inferior de la APK.
- Manejador de `productActiveInput`: sincroniza `productManualActive` tanto con `input` como con `change`, de forma idempotente.
- CSS responsive de Productos: se eliminó la regla que escondía `.js-product-toggle`.

Se añadió `calculateProductActionsMenuPosition` como función pura para poder probar los límites del menú sin depender del navegador.

### Pruebas adicionales necesarias

1. Automatizada: ambos eventos de visibilidad están enlazados al mismo sincronizador.
2. Automatizada: el editor refresca el registro antes de fijar el snapshot inicial.
3. Automatizada: el CSS móvil no vuelve a ocultar la acción de visibilidad.
4. Automatizada: el menú abre hacia arriba cerca de la barra inferior y limita su altura dentro del viewport.
5. Manual web: probar visible→oculto y oculto→visible sin tocar ningún otro campo; Guardar debe activarse en ambos sentidos.
6. Manual cruzada: cambiar visibilidad en APK, abrir después el producto en web y confirmar que el checkbox refleja el estado nuevo.
7. Manual APK: comprobar `Ocultar producto`/`Mostrar producto` en el menú de un producto con stock y de uno agotado; todas las opciones deben permanecer accesibles sin quedar debajo de la navegación inferior.

## Cuarta corrección web — 13 de agosto de 2026

### Regresión observada

- En modo soporte Master, guardar solamente `Visible en tienda` fallaba porque el formulario reenviaba también `expiration_date`, aunque la fecha no hubiera cambiado. El backend rechaza correctamente que un Master modifique vencimientos.
- En escritorio, el botón de tres puntos abría el menú en el DOM, pero este quedaba fuera del viewport. El `backdrop-filter` heredado de la tarjeta opaca creaba un bloque contenedor para el elemento `position: fixed`.

### Funciones y estilos existentes tocados

- `buildProductFormData`: conserva el guardado existente, pero ahora agrega `expiration_date` durante una edición solo cuando la fecha normalizada difiere de la almacenada. Esto evita mezclar permisos o procesos ajenos al cambio actual.
- `.products-table-card, .list-card`: se desactiva `backdrop-filter` en estas tarjetas opacas para que `positionProductActionsMenu` vuelva a calcular contra el viewport real. No se altera el fondo blanco ni la sombra visual.
- Prueba E003 existente del menú: amplía la cobertura para impedir que vuelva a introducirse un bloque contenedor visual.
- Prueba E003 existente de visibilidad: amplía la cobertura para impedir que un cambio de visibilidad reenvíe un vencimiento sin cambios.

### Pruebas necesarias

1. Desde la APK, ocultar un producto; en la web abrirlo, activar `Visible en tienda`, guardar y confirmar que no aparece un error de `expiration_date`.
2. Repetir el flujo visible → oculto desde el editor web y confirmar que el botón Guardar se activa y persiste el cambio.
3. En la lista web, abrir los tres puntos de la primera, una intermedia y la última fila; el menú debe verse completo dentro de la pantalla.
4. Confirmar que un visible ofrece `Ocultar producto` y un oculto ofrece `Mostrar producto`.
5. Confirmar que `Marcar agotado` conserva el producto visible en la tienda pública como `Agotado` y sin compra.
6. Con un usuario autorizado para vencimientos, modificar realmente una fecha y comprobar que ese cambio sí se envía y persiste.
