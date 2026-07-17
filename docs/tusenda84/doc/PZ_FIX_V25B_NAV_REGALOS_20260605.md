# PowerZona V25B estable - navegación, resumen, productos y regalos

Base: V24 con correcciones tomadas de V21 estable.

Correcciones aplicadas:

1. Se restauró `frontend-powerzona/src/pages/admin/index.astro` desde V21.
2. Se eliminó el comentario HTML dentro del frontmatter de Astro que causaba:
   `Legacy HTML single-line comments are not allowed in ECMAScript modules`.
3. Se corrigió `/admin` para que el botón **Resumen** vuelva a abrir las analíticas.
4. Se mantuvo la sección **Regalos** de V24.
5. Se integró en `/admin/gifts` el menú lateral premium alineado con `/admin/catalog`.
6. Se mantuvieron accesos directos superiores: Resumen, Productos, Catálogo y Salir.
7. Se dejó `/admin/products` enlazado desde el topbar y desde el menú lateral.

Pruebas recomendadas:

- Abrir `/admin` y confirmar que carga el resumen.
- Desde `/admin/gifts`, tocar Resumen y confirmar que abre analíticas.
- Desde `/admin/gifts`, tocar Productos y confirmar que abre `/admin/products`.
- Abrir el menú lateral en Regalos y confirmar que aparece en la misma posición visual que Categorías.
