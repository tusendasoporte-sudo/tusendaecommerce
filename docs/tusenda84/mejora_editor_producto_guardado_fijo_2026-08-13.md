# Mejora del editor de productos: vista previa y guardado persistentes

Fecha: 13 de agosto de 2026
Alcance: panel administrativo web y adaptación móvil del mismo editor.

## Objetivo

Mantener el formulario actual de producto, sin convertirlo en un asistente por pasos, y facilitar el trabajo en formularios largos:

- En escritorio, la columna **Vista previa / Estado del producto / Acciones** permanece visible mientras se desplaza la configuración.
- El botón **Guardar producto** permanece localizable durante toda la edición.
- Un mensaje junto al botón informa si faltan datos, hay cambios pendientes, se está guardando o todo está guardado.
- En móvil, el guardado se presenta en una barra compacta sobre la navegación inferior y la vista previa se ofrece como un bloque desplegable cerrado inicialmente.

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

En escritorio, la página de productos ahora usa `overflow-x: clip` y `overflow-y: visible` en `html`, `body` y `.app-shell`. La medición posterior al primer ajuste confirmó que eliminar el falso contenedor solo en `.app-shell` no era suficiente porque los dos niveles raíz conservaban el mismo cálculo `hidden/auto`. Se mantiene el recorte horizontal, pero ninguno de los tres niveles crea ya un contenedor vertical intermedio que invalide el anclaje de Vista previa. Esta corrección es exclusivamente de layout; no modifica datos ni procesos de producto.

## Adaptación de guardado para Admin móvil

- Un producto existente sin modificaciones no muestra la barra Guardar.
- La barra aparece después de un cambio real detectado por el snapshot existente y permanece visible mientras se guarda.
- El formulario de creación registra un snapshot inicial vacío para distinguir entre abrir el editor y comenzar a completarlo. Esto no cambia las reglas que habilitan el guardado.
- Al entrar en pantalla **Estado del producto**, la barra deja de ser flotante y vuelve al flujo, inmediatamente debajo del estado, para no cubrir sus indicadores.
- En esa posición final desaparece el panel de estado de guardado y queda únicamente **Guardar producto** como botón normal de ancho completo.
- Al guardar correctamente se actualiza el snapshot y la barra vuelve a ocultarse.
- La visibilidad móvil se refleja también mediante `data-mobile-save-visible`; esto impide que el estilo general de la tarjeta vuelva a mostrar un botón deshabilitado cuando el estado autoritativo dice que no existen cambios.

Funciones existentes relacionadas: `resetProductForm()`, `updateProductFormState()` y `closeProductEditor()`. No se modificaron el payload, la petición, los permisos ni las validaciones comerciales de `saveProduct()`.

## Vista previa desplegable en Admin móvil

- **Vista previa** inicia cerrada al abrir la creación o edición de un producto en pantallas de hasta 768 px.
- El botón accesible **Mostrar/Ocultar** controla exclusivamente imagen, nombre y precio de la previsualización.
- En escritorio permanece siempre abierta y fija; el encabezado no ofrece interacción para conservar el comportamiento ya validado.
- Cerrar el editor restablece el estado plegado para la siguiente apertura.
- La función nueva `updateEditorPreviewDisclosure()` solo cambia clases y atributos visuales. No modifica el snapshot, el payload, la validación ni los datos del producto.

## Opciones del producto desplegables en Admin móvil

- La sección **Opciones del producto** inicia cerrada en pantallas de hasta 768 px y conserva todos sus controles existentes.
- El encabezado resume en tiempo real los tres estados principales: **Visible/Oculto**, **Controla/No controla stock** y **Con/Sin variaciones**.
- Al abrir se mantienen Visible en tienda, Destacado, Solo USD, Preorden, Descontar stock y Usar variaciones con sus permisos y eventos originales.
- En escritorio la sección permanece siempre abierta y no ofrece interacción de plegado.
- La función visual `updateProductOptionsDisclosure()` no altera `updateProductFormState()`, el snapshot ni el payload; solo lee los controles después de su actualización para construir el resumen.

## Información adicional y Productos relacionados desplegables en Admin móvil

- Ambas secciones inician cerradas en pantallas de hasta 768 px y se abren de forma independiente.
- **Información adicional** resume `Sin información adicional`, `1 dato configurado` o la cantidad real configurada.
- **Productos relacionados** resume `Sin productos relacionados`, `1 producto seleccionado` o la cantidad real seleccionada.
- Al abrir se conservan los controles existentes para añadir, editar y borrar información, además de añadir o quitar relacionados.
- En escritorio ambas secciones permanecen abiertas y conservan sus etiquetas y distribución actuales.
- `updateProductExtraDisclosure()` y `updateRelatedProductsDisclosure()` son funciones nuevas exclusivamente visuales.

Funciones existentes tocadas y motivo:

- `renderProductExtraInfo()`: llama a la actualización visual del resumen después de renderizar la lista.
- `renderSelectedRelatedProducts()`: llama a la actualización visual del resumen después de renderizar o vaciar la selección.
- `openNewProductEditor()`, `openEditProductEditor()` y `closeProductEditor()`: restablecen ambos desplegables al estado móvil cerrado.
- El listener existente de `resize`: mantiene las secciones abiertas en escritorio y recupera el estado móvil correspondiente.

No se modificaron `saveProductExtraInfoDirectly()`, el modal de relacionados, el snapshot, el payload del producto, las solicitudes API, los permisos ni las validaciones.

## Variaciones del producto desplegables en Admin móvil

- El bloque aparece únicamente cuando **Usa variaciones** está activo, igual que antes.
- En móvil inicia cerrado cuando existe al menos una variación activa con precio y stock válidos.
- Resume cantidad total, cantidad activa y stock total; cuando el producto no controla stock indica `Sin control de stock`.
- Permanece abierto y muestra `Requiere atención` cuando no existe ninguna variación válida o alguna variación activa carece del precio/stock exigido.
- `Nueva variación` y `Actualizar` permanecen dentro del contenido y conservan sus eventos actuales.
- En escritorio la sección permanece siempre abierta y el control móvil no es interactivo.
- Abrir o cerrar el bloque no modifica el snapshot ni activa Guardar.

Funciones existentes tocadas y motivo:

- `updateProductFormState()`: actualiza solamente el estado visual del desplegable después de aplicar las reglas existentes.
- `renderVariations()`: actualiza el resumen después de renderizar una lista vacía, cargada o modificada.
- `resetVariationState()`: restablece el estado plegado al cambiar o cerrar producto.
- `openNewVariationEditor()` y `openVariationEditor()`: mantienen el bloque abierto mientras se trabaja con una variación.
- `openNewProductEditor()`, `openEditProductEditor()`, `closeProductEditor()` y el listener de `resize`: sincronizan el estado móvil/escritorio.

La función nueva `updateVariationManagerDisclosure()` solo lee `productVariations`, `variationIsModeEligible()` y el control de stock existente. No se modificaron `loadProductVariations()`, `saveVariation()`, las solicitudes API, el orden, la duplicación, la visibilidad, las fechas, el payload ni las validaciones comerciales.

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
4. Abrir un producto sin editar: Guardar no debe aparecer. Modificar un campo: debe aparecer. Revertir exactamente el cambio: debe ocultarse nuevamente.
5. Desplazarse hasta Estado del producto: la barra debe colocarse debajo de sus indicadores y no cubrirlos.
6. Guardar correctamente: la barra debe ocultarse cuando el snapshot se actualice.
7. Confirmar que el mensaje **Todos los cambios están guardados** nunca aparece dentro de una barra móvil visible.
8. Abrir creación y edición: Vista previa debe iniciar cerrada; tocar **Mostrar** debe revelar imagen, nombre y precio, y **Ocultar** debe plegarlos nuevamente.
9. Cambiar temporalmente a ancho de escritorio: Vista previa debe permanecer abierta y fija sin alterar el formulario.
10. Abrir creación y edición: Opciones del producto debe iniciar cerrado y mostrar `Visible · Controla stock · Sin variaciones` o los valores reales del producto.
11. Abrir Opciones, cambiar visibilidad, control de stock y variaciones: el resumen debe actualizarse al cerrar sin perder ni guardar automáticamente la selección.
12. Confirmar en escritorio que Opciones permanece abierta y que todos los controles conservan sus permisos.
13. Abrir creación y edición: Información adicional y Productos relacionados deben iniciar cerrados y mostrar sus cantidades reales.
14. Abrir Información adicional: añadir, editar y borrar un dato; confirmar que el resumen cambia sin perder el proceso actual.
15. Abrir Productos relacionados: añadir y quitar productos; confirmar que el resumen cambia y que el máximo continúa siendo cuatro.
16. Cambiar temporalmente a ancho de escritorio: ambas secciones deben permanecer abiertas, sin botones de plegado interactivos.
17. Producto con variaciones válidas: el bloque debe iniciar cerrado y resumir total, activas y stock.
18. Activar Usa variaciones sin registros: el bloque debe abrirse y mostrar `Sin variaciones · Debes crear una`.
19. Dejar una variación activa sin precio o stock requerido: el bloque debe permanecer abierto con `Requiere atención`.
20. Crear, editar, ordenar, ocultar, duplicar y borrar variaciones; confirmar que cada proceso conserva su guardado independiente.
21. Producto sin control de stock: confirmar que el resumen indica `Sin control de stock` y no exige stock por variación.
22. En escritorio: confirmar que Variaciones permanece abierta y que Nueva variación/Actualizar funcionan igual.

### Regresiones de producto

1. Activar y desactivar **Visible en tienda** y confirmar el resultado en el catálogo público.
2. Marcar agotado: debe cambiar el stock a cero sin ocultar el producto.
3. Cargar, reemplazar y borrar imágenes respetando el límite del plan.
4. Comprobar permisos parciales de visibilidad, precio, stock e imágenes.
5. Guardar fecha de vencimiento cuando la función esté habilitada.

## Despliegue

Este documento no implica despliegue. El cambio debe validarse primero y desplegarse a staging solamente cuando se autorice.
