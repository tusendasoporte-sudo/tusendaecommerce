# Primera fase: conteos públicos sin cambios de calidad ni reglas

Fecha: 2026-09-05. Base: c58455a. Implementación local, todavía sin commit, push ni despliegue.

## Diagnóstico y decisión

La portada obtiene `id,category,subcategory,active` de productos mediante `getProductTaxonomyIndex`. Aunque el cliente proyecta cuatro campos, el backend debe aplicar la disponibilidad comercial canónica antes de responder. Ese filtro recuperaba tienda, variaciones, categoría y subcategoría para cada producto. Un conteo SQL directo que ignorase esos controles podría mostrar cantidades distintas, por ejemplo por vencimientos o variaciones no vendibles.

Se conserva el endpoint y se optimiza únicamente esa proyección pública exacta:

- Variaciones leídas en lotes de hasta 100 IDs parametrizados, con páginas de 500 variaciones, manteniendo orden y variaciones inactivas como en la lectura anterior.
- Tienda, categoría y subcategoría reutilizadas dentro de la misma solicitud. No existe caché nueva entre solicitudes.
- Si falla un lote, se descarta su resultado parcial y se vuelve a las lecturas individuales anteriores.
- El evaluador comercial, controles de acceso, redacción de campos, filtros, orden y paginación permanecen en la misma cadena de hooks. Detalle, listado general, administración y checkout no optan a esta lectura por lotes.
- La portada calcula los conteos una sola vez y reutiliza el resultado en sus tres presentaciones. Mantiene precedencia de subcategoría y deduplicación por ID.

No se cambian imágenes, archivos originales, URLs de medios, compresión, resolución, estilos, precios, stock, promociones, permisos, reglas de compra, TTL de 15 segundos ni esquema de base de datos. No se implementa todavía un endpoint de conteos agregados ni las otras propuestas de bootstrap/HTML/imágenes.

## Referencia nueva de staging, antes de editar

36 cargas: tres pares contexto nuevo/recarga para cada página y tamaño. Chrome 152.0.7977.76 aislado, escritorio 1443×1278 y móvil 390×844, sin limitación artificial de red/CPU. Contexto nuevo no implica caché fría del servidor, CDN o sistema operativo; hubo navegación de descubrimiento previa. LCP observado hasta un segundo después de `load`. Muestras pequeñas y secuenciales, no A/B aleatorizado ni percentiles poblacionales.

Portada `/t/powerzona`, categoría `/t/powerzona/categoria/proteinas`, producto `/t/powerzona/producto/whey-body-fortress`. Captura iniciada a las 19:48:17 UTC. Todas respondieron HTTP 200, sin errores JavaScript capturados.

Medianas en milisegundos (tres muestras por fila):

| Vista | Dispositivo | Contexto | TTFB | LCP |
| --- | --- | --- | ---: | ---: |
| Portada | Escritorio | Nuevo | 484,6 | 1224 |
| Portada | Escritorio | Recarga | 903,3 | 1128 |
| Categoría | Escritorio | Nuevo | 457,7 | 1456 |
| Categoría | Escritorio | Recarga | 164,1 | 240 |
| Producto | Escritorio | Nuevo | 517,6 | 1384 |
| Producto | Escritorio | Recarga | 164,8 | 232 |
| Portada | Móvil | Nuevo | 483,3 | 1240 |
| Portada | Móvil | Recarga | 697,0 | 896 |
| Categoría | Móvil | Nuevo | 452,6 | 1472 |
| Categoría | Móvil | Recarga | 165,0 | 228 |
| Producto | Móvil | Nuevo | 463,0 | 1356 |
| Producto | Móvil | Recarga | 403,6 | 596 |

Las recargas no fueron siempre más rápidas: el estado de cachés y el trabajo del servidor varían. No se atribuyen esos picos sin otra traza. No se mezclan estas muestras de staging con producción o con El Yerro.

## Verificaciones de implementación

- Frontend: 914 pruebas aprobadas y compilación correcta. Permanecen tres avisos anteriores de `getStaticPaths` en rutas dinámicas.
- Backend: 78 pruebas focalizadas aprobadas, incluyendo privacidad, comercio, precio canónico del pedido, acceso público, taxonomía y rendimiento.
- PocketBase HTTP real en base efímera: suite V7E9-C3F3 aprobada. Nueva comparación entre proyección optimizada y lectura general para cuatro tiendas/planes y dos páginas, conservando IDs, relaciones, totales, orden, `no-store` y ausencia de campos privados. La suite también comprueba compras y rechazos exclusivamente con datos ficticios locales; no se envían pedidos a tiendas reales.
- Contrato de conteos: paridad con el algoritmo anterior en un catálogo de 10.000 filas, relaciones repetidas, categorías vacías y subcategorías ausentes.
- Pruebas de lotes: más de 500 productos/variaciones, fallo inicial y parcial con fallback, agotados visibles, ocultos, vencidos, precio no válido, relaciones cruzadas, otra tienda y datos cambiados entre solicitudes.
- En el fixture controlado de 100 productos con relaciones compartidas, las llamadas al repositorio de datos dentro del filtro pasan de 401 a 5. Es una medida de trabajo eliminado, no un porcentaje de aceleración de una página ni de todas las consultas del servidor.
- Revisión funcional y visual con la guía de Playwright (scripts aislados porque no está disponible su sesión interactiva): portada → selector abrir/cerrar → categoría → producto → inicio, en ambos tamaños. Escape comprobado después del inicio de la transición. Ocho capturas inspeccionadas, sin desbordamiento horizontal, superposiciones nuevas ni errores JavaScript. Etiquetas y enlaces de categorías iguales a staging; mismas URLs de imágenes ya cargadas en la referencia, normalizando solo el dominio de los iconos servidos por el frontend. Las imágenes diferidas sin `currentSrc` en la referencia no se usan para afirmar igualdad de descarga.
- La primera ejecución visual necesitó ajustar la sincronización de Escape con el inicio de la animación, el selector del enlace de inicio y la comparación de dominios/imágenes diferidas. Solo se corrigió el script de prueba, no la interfaz. No se presentan esas ejecuciones incompletas como pruebas aprobadas.

## Evidencia y siguiente paso

El inventario de QA, scripts, muestras individuales y capturas se guardan en `.tmp/category-counts-qa/`, ignorado por Git. La referencia está en `before/results.json`; la revisión del frontend local usa las lecturas públicas del backend de staging, todavía sin la optimización del backend. Esta revisión local no es una medición después del despliegue.

Para comprobar el efecto completo hay que publicar backend y frontend en staging y repetir el mismo protocolo. Ambos cambios son compatibles con las versiones anteriores y no requieren migración. No actualizar main ni producción hasta verificar staging. Reversión: revertir estos cambios de código; no hay datos ni archivos de imagen que restaurar.
