# Carga y navegación del panel de tienda

## Alcance implementado

- Indicador compartido en los enlaces internos del panel: sustituye el icono por un anillo animado y conserva el nombre. Incluye menú lateral, submenús, enlaces internos y navegación móvil.
- Precarga antes del cambio de documento en Productos, Pedidos, Categorías, categoría individual, subcategoría individual, Resumen, Ganancias, Regalos y Envíos. El destino consume los datos una sola vez. No se introduce un router SPA ni se vuelven a ejecutar los scripts de un editor en otro documento.
- Las demás rutas conservan sus cargadores nativos y reciben el indicador compartido; no se afirma que sus consultas propias se hayan convertido a bootstrap. Ajustes y Organización cargan sus colecciones independientes en paralelo conservando sus condiciones de permiso. Los endpoints especializados de analíticas, seguridad y equipo se mantienen.
- Nuevas lecturas: `catalog-bootstrap`, `catalog-detail-bootstrap`, `dashboard-bootstrap`, `profits-bootstrap`, `gifts-bootstrap` y `shipping-bootstrap` en `/api/pz/admin/read/`. Productos y Pedidos reutilizan sus endpoints existentes.
- Categorías descarga campos de listado. Sus detalles conservan los campos utilizados por la búsqueda y edición. Las lecturas nuevas recorren todas las páginas sin límites silenciosos de registros.
- Resumen y Ganancias evitan expansiones completas repetidas. Se conservan el historial, estados, importes y las reglas actuales de beneficio guardado y coste de producto/variación. Resumen dibuja las métricas principales antes de las analíticas independientes y protege los cambios rápidos de período frente a respuestas antiguas.
- Notificaciones muestra primero los avisos. Sus comprobaciones de generación se ejecutan después de la carga principal, con intervalos mínimos de 30 segundos para pedidos y 60 segundos para mantenimiento, dentro de la misma pestaña, tienda y usuario. Se conservan los mecanismos de realtime y push.
- Última modificación consulta las filas próximas al área visible, después de la carga principal.
- El acceso tenant al Resumen reutiliza tienda y autenticación de middleware, evitando consultas destinadas exclusivamente al formulario de acceso.
- Productos no muestra ni solicita la cuota del plan. La validación transaccional al crear productos sigue activa.

## Seguridad y comportamiento

El backend valida usuario, tienda y permisos en cada petición. Resumen/Ganancias requieren lectura de pedidos y catálogo; las reseñas se consultan únicamente con permiso. Los endpoints nuevos responden `private, no-store` y no escriben datos. No se añaden migraciones.

La transferencia de precarga usa `sessionStorage`, está ligada a tienda, actor y ruta, caduca en 15 segundos y se elimina al consumirla. No guarda tokens. La navegación nativa vuelve a validar acceso en middleware. Cuando el almacenamiento no está disponible, se conserva la navegación normal. Los errores permiten reintentar; Escape cancela la preparación y los dobles clics no duplican peticiones. Los guardas existentes de formularios se respetan.

La precarga espera los datos principales del bootstrap; no significa que todas las imágenes o analíticas secundarias de cada página hayan terminado. Las rutas que mantienen cargadores nativos aún pueden mostrar su estado de carga después del cambio de documento.

## Verificación

- Suite frontend: 881 pruebas aprobadas.
- Lecturas administrativas y cuotas backend: 17 pruebas aprobadas, incluida paginación de 1005 productos y conservación de los costes usados en ganancias.
- `node scripts/test-admin-navigation.mjs`: navegador aislado; indicador sin texto, precarga única, Atrás, errores/reintento, doble clic, Escape, confirmación de formulario, anclas, navegación nativa, aislamiento de usuario y móvil.
- `node scripts/test-admin-read-runtime.mjs`: PocketBase real con base temporal y frontend local; aislamiento tenant, acceso anónimo denegado, endpoints, Productos, Categorías, detalles, Resumen y menú móvil. Sin errores JavaScript en esas vistas.
- En la muestra local con un producto de descripción extensa: respuesta REST de productos 11 341 bytes; bootstrap del catálogo completo 959 bytes. Esto mide reducción de datos de una muestra, no el tiempo de producción.
- Capturas de la interfaz real en `.codex-artifacts/admin-navigation/actual-desktop-loading.png`, `actual-mobile-loading.png` y `actual-dashboard.png`.

## Validación y despliegue posteriores

Los tiempos iniciales observados fueron Categorías 5,42 s / Productos 1,43 s en staging y 3,53 s / 1,02 s en producción. Son muestras de recarga hasta la primera fila, no promedios ni percentiles. Aún no se han medido tiempos remotos con este cambio.

Desplegar primero los hooks backend y después el frontend en staging. Verificar los nuevos endpoints autenticados, formularios, notificaciones, Atrás y vistas móviles; tomar varias mediciones frías y calientes por sección. El frontend nuevo necesita los endpoints nuevos: no publicarlo primero. La reversión debe restablecer primero el frontend anterior; los endpoints añadidos pueden permanecer temporalmente porque son de lectura. Producción queda pendiente de esa validación.
