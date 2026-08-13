# Corrección global de Atrás en la APK Admin

Fecha: 13 de agosto de 2026
Estado: implementado localmente, pendiente de despliegue y prueba manual en staging.

## Problema

El botón físico **Atrás** de Android utilizaba únicamente el historial del `WebView`. Varias vistas administrativas se muestran dentro de la misma URL, por lo que el navegador no tenía una entrada que representara el nivel abierto. El resultado era volver a Resumen o a otra página anterior en vez de regresar a la vista padre inmediata.

Ejemplo reportado: `Productos > Editar producto > Atrás` abría Resumen en lugar de volver al listado de Productos.

## Comportamiento implementado

La APK consulta primero a la vista web y aplica esta jerarquía:

1. Cerrar una confirmación o diálogo visible.
2. Cerrar notificaciones o el menú lateral si están abiertos.
3. Cerrar el nivel interno activo de la página: editor, formulario, panel o detalle.
4. En una ruta de detalle, seguir el regreso explícito a su sección padre.
5. Solo si nada anterior consume la acción, usar el historial del `WebView`.
6. Si tampoco existe historial, cerrar la actividad.

Se evita procesar dos pulsaciones simultáneas mientras Android espera la respuesta de JavaScript.

## Vistas cubiertas

- Productos: panel rápido de categoría/subcategoría, información adicional y editor de producto.
- Catálogo: edición en fila, creación, contenido de subcategoría/categoría y detalle de categoría.
- Pedidos: añadir producto, edición, limpieza y detalle de pedido.
- Envíos: formulario principal de zona.
- Promociones: cupones, promociones automáticas, visuales y Rifas.
- Organización: formulario de elemento visual.
- Regalos: formulario de regalo y configuración de la categoría pública.
- Ajustes de tienda: formulario visual.
- Rutas de detalle: pedido, historial de producto, actividad de usuario, visitante de seguridad, notificaciones, visitas, ganancias, vencimientos, Rifas y detalle de categoría.

## Protección de cambios sin guardar

Se reutilizaron las comparaciones de estado ya implementadas. Antes de cerrar por Atrás o por los botones visuales equivalentes, se pide confirmación en:

- producto;
- categoría;
- zona de envío;
- elemento visual de Organización;
- regalo y categoría pública de Regalos;
- cupón y promoción automática.

Si un guardado está en curso, la vista no se cierra y muestra un aviso.

## Funciones existentes tocadas y alcance

- `MainActivity.handleBackNavigation`: ahora consulta el contrato web antes de usar `WebView.goBack()`; el historial y el cierre de la actividad siguen siendo el respaldo.
- `products.astro`: los botones existentes de cerrar/cancelar usan `requestCloseProductEditor`; el cierre interno y el guardado no cambiaron.
- `shipping.astro`: `toggleMainForm` y los botones de cierre usan `requestCloseMainForm`; no se cambió `saveZone` ni el contenido enviado.
- `promos.astro`: los botones existentes de cupón/promoción usan sus solicitudes de cierre protegidas; no se cambiaron los métodos de creación, edición o borrado.
- `gifts.astro`: Cancelar, cerrar, fondo y Escape usan `requestCloseGiftModal`; los guardados exitosos continúan cerrando directamente.
- `catalog/category/[id].astro`: el interruptor y la X del panel de edición usan `requestCloseCategoryEditPanel`; no se cambió el guardado de categoría.
- `AdminSidebar.astro`: se agregó el coordinador común de Atrás y listeners para notificaciones/sidebar; no se cambiaron permisos, enlaces de navegación inferior ni autenticación.
- `orders.astro`, `catalog.astro`, `organization.astro` y `store-settings.astro`: se añadieron listeners de navegación; no se cambiaron las mutaciones de datos.
- Las rutas de detalle recibieron `mobileBackHref`/`mobileBackLabel`; esto no cambia su carga de datos ni permisos.

## Funciones que deben permanecer sin regresión

- Guardar, editar, ocultar/mostrar y marcar agotado en Productos.
- Auto-guardado y transiciones de estado en Pedidos.
- Crear/editar categorías y subcategorías.
- Crear/editar zonas de envío.
- Guardar cupones, promociones, regalos y elementos visuales.
- Navegación inferior: Resumen, Pedidos, Envíos y Ajustes.
- Acceso como administrador de tienda y como Master en soporte.

## Pruebas automáticas necesarias

1. `node --test tests/adminAndroidBackNavigation.test.mjs tests/mobileAdminShell.test.mjs tests/productEditorStickySave.test.mjs`
2. `npm run build` dentro de `frontend-powerzona`.
3. Pruebas Android del módulo `mobile-admin`.
4. Compilación de APK debug para comprobar que el puente Java/JavaScript compila.
5. `git diff --check`.

### Resultado local

- Contrato global y regresiones focales: **29/29 aprobadas**.
- Build de Astro: **aprobado**.
- `testDebugUnitTest` y `assembleDebug` de Android: **aprobados**.
- APK generada en `mobile-admin/app/build/outputs/apk/debug/app-debug.apk`.
- `git diff --check`: **aprobado**.
- Suite frontend completa: la nueva navegación y E005 pasan; permanecen **5 fallos ya existentes y ajenos a esta corrección** en contratos M7U2/Ajustes, token serializado de Ajustes, metadato C2, lista compacta BLOCKED-UI y costo padre V7E9-C3F1. No se modificaron esas funciones dentro de este proceso.

## Pruebas manuales necesarias en staging

Ejecutar cada caso con el botón físico/gesto Atrás de Android, no con el botón visual de la página:

1. `Productos > Editar producto > Atrás` vuelve a Productos.
2. Con un campo de producto modificado, Atrás pregunta antes de salir; **Seguir editando** conserva el formulario.
3. Con un modal abierto dentro del producto, la primera pulsación cierra el modal y la segunda vuelve al listado.
4. `Pedidos > Abrir pedido > Atrás` vuelve a Pedidos, incluso entrando desde una notificación o enlace directo.
5. `Catálogo > Categoría > Editar > Atrás` cierra primero la edición; otra pulsación vuelve a Categorías.
6. Repetir apertura/cierre en Envíos, Promociones, Regalos y Organización, con y sin cambios.
7. Abrir menú lateral y notificaciones: Atrás debe cerrarlos sin cambiar de página.
8. Verificar Historial de producto, Actividad de usuario, Visitante, Rifas, Visitas, Ganancias y Notificaciones: Atrás debe ir a su padre declarado.
9. Desde una sección sin panel ni detalle abierto, comprobar el historial normal y el cierre de la app cuando ya no hay historial.
10. Repetir los flujos de guardado indicados en la sección de no regresión.

## Fuera de alcance

- No se cambió PocketBase ni el esquema de datos.
- No se modificaron permisos administrativos.
- No se cambió la navegación de la tienda pública.
- No se realizó despliegue ni publicación en producción como parte de esta corrección local.
