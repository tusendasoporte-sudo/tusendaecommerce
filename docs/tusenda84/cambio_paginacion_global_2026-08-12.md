# Cambio de paginacion global - 12 de agosto de 2026

## Objetivo

- Mostrar 10 productos por pagina en el administrador.
- Unificar el estilo visible de paginacion en Admin, Master y tienda publica.
- Usar las etiquetas en espanol `Anterior` y `Proximo`.
- Mantener una ventana maxima de cinco numeros de pagina para evitar barras extensas.

## Funciones existentes afectadas

### Productos

- `renderProducts()` conserva filtros, orden y acciones; cambia el corte visual de 7 a 10 productos.
- `renderProductPagination()` conserva la navegacion anterior, numerica y proxima; limita la ventana a cinco paginas y muestra `10 por pagina`.
- El manejador de `#products-pagination` conserva el cambio de pagina y los limites existentes.

### Otras vistas paginadas

Solo cambia la etiqueta visible `Siguiente` por `Proximo` en los renderizadores o controles existentes de Pedidos, Vencimientos, Regalos, Notificaciones, Paginas visitadas, Resenas, Historial de productos, Actividad, Seguridad y vistas Master. No cambian sus consultas, filtros, permisos, rutas ni tamanos de pagina propios.

## Estilo compartido

- `frontend-powerzona/src/styles/pagination.css` define el patron visual comun.
- `global.css` lo distribuye a Admin y tienda publica.
- `master-ui.css` lo distribuye al panel Master.

## Fuera de alcance deliberadamente

- Las cargas internas de 100, 200 o 500 registros usadas por catalogos, selectores, calculos y relaciones no son paginas visibles y no se modifican.
- No se cambian limites funcionales propios de historiales, resenas, notificaciones o seguridad.
- No se modifican APIs ni el backend.

## Pruebas automaticas

- `tests/globalPagination.test.mjs`: limite de 10 productos, ventana de cinco paginas, importacion global del estilo y etiquetas en espanol.
- Regresiones enfocadas de Productos, Pedidos, Vencimientos, Seguridad, usuarios Master, tienda publica y APK admin.
- Compilacion completa de Astro.
- `git diff --check`.

## Pruebas manuales antes de produccion

1. Crear o usar un catalogo con al menos 21 productos.
2. Confirmar que las paginas muestran 10, 10 y 1 producto.
3. Aplicar busqueda y filtros desde una pagina distinta de la primera; confirmar que el resultado vuelve a una pagina valida.
4. Probar `Anterior`, numeros y `Proximo` en PC y en la APK.
5. Revisar el estado deshabilitado en la primera y ultima pagina.
6. Comprobar visualmente paginaciones de Pedidos, Vencimientos, Seguridad, Master y resenas publicas.
7. Confirmar que no aparece desplazamiento horizontal en 375, 390 y 430 px.

## Estado de regresion general al implementar

- 422 de 427 pruebas generales aprobadas.
- Cinco fallos preexistentes permanecen en Ajustes, seguridad de token, metadatos, resumen bloqueado y editor de vencimientos/productos. No fueron introducidos por este cambio y deben auditarse antes de produccion.
