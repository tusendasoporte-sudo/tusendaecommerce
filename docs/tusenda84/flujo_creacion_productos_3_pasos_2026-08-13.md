# Flujo de creación de productos en tres pasos

Fecha: 2026-08-13

## Objetivo

Reducir la longitud percibida del alta de productos en la web y en la APK admin, sin eliminar campos ni cambiar la lógica comercial existente. El editor de productos guardados continúa mostrando el formulario completo.

## Flujo implementado

1. **Información básica:** nombre, descripción, categoría, subcategoría e imagen principal.
2. **Precio e inventario:** moneda, precio/oferta, stock y selección de producto simple o con variaciones.
3. **Revisar y publicar:** entrega, visibilidad y opciones avanzadas.

En móvil las acciones permanecen fijas sobre el área segura. Las variaciones se muestran como tarjetas, evitando tablas horizontales.

## Variaciones durante la creación

Las variaciones se preparan en memoria durante el paso 2. El administrador puede:

- Usar un atributo, por ejemplo `Sabor: Vainilla, Chocolate`.
- Combinar dos atributos, por ejemplo `Sabor` y `Tamaño`; el sistema genera el producto cartesiano de sus valores.
- Generar hasta 30 combinaciones en una operación, sin duplicar combinaciones ya preparadas.
- Definir precio y stock iniciales, y aplicar luego un nuevo precio o stock a todas las variaciones pendientes.
- Abrir cada variación para completar oferta, costo, referencia, vencimiento o imagen individual.

Al crear el producto:

1. El producto padre se crea oculto y con el modo de variaciones desactivado.
2. Se crean las variaciones pendientes con sus precios, stock, oferta, referencia, vencimiento e imagen opcional.
3. Solo después de completar todas las variaciones se activa `has_variations` y se restaura la visibilidad seleccionada por el administrador.

Si una variación falla, el flujo elimina los registros nuevos de esa operación para permitir un reintento limpio. Si la compensación no pudiera completarse, el producto base permanece oculto para impedir que se publique incompleto.

## Funciones existentes afectadas

- `updateProductFormState`: ahora permite el modo de variaciones durante una creación; en edición conserva las validaciones anteriores.
- `buildProductFormData`: admite borradores ocultos incompletos y usa la primera variación válida como referencia comercial temporal del padre.
- `saveProduct`: mantiene intacta la rama de edición y añade la creación segura del padre, variaciones y activación final.
- `variationHasMinimumData`, `updateVariationFormState`, `saveVariation`, `renderVariations` y eliminación de variaciones: admiten registros pendientes locales durante el alta.
- `buildProductVariationCombinations` y `parseProductVariationValues`: normalizan valores, eliminan duplicados, generan uno o dos atributos y aplican el límite de seguridad de 30 combinaciones.
- `openNewProductEditor`, `openEditProductEditor` y `closeProductEditor`: activan o retiran la presentación por pasos sin modificar el editor normal.
- `resetProductForm` y el reinicio de variaciones: eliminan combinaciones, previsualizaciones y mensajes pendientes antes de comenzar otra alta.

## Pruebas automáticas necesarias

- Compilación completa de Astro.
- `productCreateWizard.test.mjs`.
- Regresión E003 de visibilidad, menú y productos agotados.
- Regresión de límites de imágenes F7P8.
- Regresión de permisos granulares M7U2.
- Regresión de vencimientos V7E9.
- Regresión de paginación global.

## Pruebas manuales necesarias antes de producción

1. Crear un producto simple en PC con precio, stock, portada y visibilidad activa.
2. Repetir el alta simple desde la APK admin y confirmar que el teclado no cubre las acciones.
3. Generar un producto con `Sabor: Vainilla, Chocolate` y confirmar dos variaciones sin duplicados.
4. Generar `Sabor: Vainilla, Chocolate` por `Tamaño: 1 lb, 2 lb` y confirmar cuatro combinaciones.
5. Aplicar precio y stock en bloque; editar una combinación con oferta y confirmar precio y stock públicos.
6. Crear variaciones con imágenes y validar los límites de 2/4 imágenes según el plan.
7. Guardar desde el paso 1 como borrador; confirmar que aparece oculto y puede editarse después.
8. Provocar un error al guardar una variación y confirmar que la operación se revierte; si la reversión falla, el padre debe permanecer oculto.
9. Crear con `Visible en tienda` desmarcado y comprobar que no aparece públicamente.
10. Editar un producto existente y confirmar que continúa usando el formulario completo y el guardado anterior.
11. Marcar un producto agotado: debe conservar su visibilidad, mostrar `Agotado` y bloquear la compra.
12. Probar administradores con permisos completos, solo creación y sin permisos de precio, stock, imágenes o visibilidad.
13. Probar una tienda Premium con vencimiento general y por variación.
14. Verificar navegación `Anterior`, `Siguiente`, cancelación y conservación de datos entre pasos en PC y móvil.
