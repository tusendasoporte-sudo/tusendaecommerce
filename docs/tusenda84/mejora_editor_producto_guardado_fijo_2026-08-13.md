# Mejora del editor de productos: vista previa y guardado persistentes

Fecha: 13 de agosto de 2026
Alcance: panel administrativo web y adaptación móvil del mismo editor.

## Objetivo

Mantener el formulario actual de producto, sin convertirlo en un asistente por pasos, y facilitar el trabajo en formularios largos:

- En escritorio, la columna **Vista previa / Estado del producto / Acciones** permanece visible mientras se desplaza la configuración.
- El botón **Guardar producto** permanece localizable durante toda la edición.
- Un mensaje junto al botón informa si faltan datos, hay cambios pendientes, se está guardando o todo está guardado.
- En móvil, el guardado se presenta en una barra compacta sobre la navegación inferior; la vista previa conserva el flujo vertical para no reducir el espacio útil.

## Función implementada que se tocó

Se amplió `updateProductFormState()` únicamente para exponer el estado visual del guardado. Se conservaron sin cambios:

- la expresión que habilita o deshabilita el botón;
- las validaciones de nombre, moneda, stock, oferta, variaciones y configuración comercial;
- el uso de `hasProductChanges()` para detectar cambios;
- la aplicación de permisos mediante `canMutateExistingProduct()` y `applyProductPermissionState()`;
- el proceso existente que envía y guarda el producto.

También se añadió `setEditorSaveState()` como función exclusivamente visual. No realiza solicitudes al servidor ni modifica datos del producto.

## Corrección posterior detectada en staging

La primera validación visual mostró que la columna tenía `position: sticky`, pero continuaba desplazándose fuera de la ventana. La causa comprobada mediante estilos calculados fue el `overflow-x: hidden` global de `.app-shell`: el navegador calculaba `overflow-y: auto` y convertía ese elemento, aunque no tuviera desplazamiento propio, en el contenedor de referencia del sticky.

En escritorio, la página de productos ahora usa `overflow-x: clip` y `overflow-y: visible` en `.app-shell`. Se mantiene el recorte horizontal, pero se evita crear un contenedor vertical que invalide el anclaje de Vista previa. Esta corrección es exclusivamente de layout; no modifica datos ni procesos de producto.

## Pruebas automáticas necesarias

1. `node --test tests/productEditorStickySave.test.mjs`
2. `node --test tests/e003ProductVisibilitySoldout.test.mjs`
3. `node --test tests/f7p8ProductImageLimits.test.mjs`
4. `node --test tests/m7u2C3FrontendPermissions.test.mjs`
5. `node --test tests/v7e9ProductExpiration.test.mjs`
6. `node --test tests/productPriceCurrency.test.mjs`
7. `node --test tests/productVariationMobileLayout.test.mjs`
8. `npm run build`

## Pruebas manuales necesarias en staging

### Escritorio

1. Crear un producto sin variaciones y desplazarse hasta el final: la vista previa, el estado y Guardar deben seguir visibles.
2. Editar nombre, precio, stock, oferta, descripción y visibilidad: el mensaje debe indicar cambios pendientes y Guardar debe habilitarse.
3. Guardar: durante la petición debe mostrar “Guardando los cambios...” y al finalizar “Todos los cambios están guardados”.
4. Producto con variaciones: verificar que Guardar respete la exigencia de una variación activa y válida.
5. Usuario sin permisos de edición: los campos y Guardar deben permanecer bloqueados y el mensaje debe informar la falta de permiso.
6. Verificar que la columna fija no tape el encabezado y que su contenido pueda desplazarse en una pantalla de poca altura.
7. Con el formulario en una posición intermedia y al final, medir visualmente que el borde superior de la columna permanezca a 92 px de la ventana y que Vista previa no salga de pantalla.

### Móvil

1. Abrir creación y edición de producto: la barra de guardado debe quedar sobre la navegación inferior.
2. Desplazarse por todo el formulario y abrir el teclado: comprobar que se puede continuar editando y guardar.
3. Probar producto simple y producto con variaciones sin desbordamiento horizontal.

### Regresiones de producto

1. Activar y desactivar **Visible en tienda** y confirmar el resultado en el catálogo público.
2. Marcar agotado: debe cambiar el stock a cero sin ocultar el producto.
3. Cargar, reemplazar y borrar imágenes respetando el límite del plan.
4. Comprobar permisos parciales de visibilidad, precio, stock e imágenes.
5. Guardar fecha de vencimiento cuando la función esté habilitada.

## Despliegue

Este documento no implica despliegue. El cambio debe validarse primero y desplegarse a staging solamente cuando se autorice.
