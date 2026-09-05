# Respuesta inicial de la portada: medición por bloques

Fecha: 2026-09-05. Base: b87c1de.

## Primera fase: diagnóstico en staging

Se incorporan métricas de nombres fijos a Server-Timing únicamente en GET exitosos de /t/:storeSlug. La decisión de acceso sigue ejecutándose antes de preparar la página. No se registran URLs internas, identificadores de tienda, cookies ni datos de clientes en las métricas.

Se miden resolución de modalidad, tienda, configuración, categorías, subcategorías, productos, taxonomía, elementos visuales, regalos, rifas, promociones, resumen/listado de reseñas, valoraciones de productos y espera total de datos. Las tareas concurrentes no deben sumarse como si fueran secuenciales.

Astro puede crear Response antes de que finalice el frontmatter de un componente anidado. Para observar esa diferencia, el middleware lee el primer fragmento de HTML, añade los tiempos disponibles y devuelve ese fragmento y el resto del flujo intactos. No espera el HTML completo, no usa response.text(), conserva cancelación, errores y cabeceras y mantiene la compresión existente. pz-home-first-chunk mide desde entrada al middleware hasta el primer fragmento sin comprimir; no incluye toda la red, el proxy/CDN ni el renderizado del navegador.

Los tiempos históricos pz-public-render siguen representando la creación de Response. pz-public-total ahora también incluye la espera del primer fragmento en esta ruta; no debe compararse sin esa aclaración con el antiguo total.

Esta fase no cambia consultas, caché, stock, precios, promociones, permisos ni reglas de compra. No toca administración, checkout o base de datos. Se espera usar las mediciones de staging para elegir una optimización concreta, sin promover a producción.

## Verificaciones

- Pruebas unitarias de aislamiento, valores y errores de las operaciones, nombres de métricas permitidos, contenido byte a byte, gzip, cuerpo vacío, cabeceras/cookies, HEAD, redirecciones, errores, cancelación y fallos del stream.
- Pruebas de catálogo y rifas: mismos controles y consultas; adaptado el reconocimiento estático de la llamada a rifas para su envoltorio de medición.
- Compilación de producción correcta; permanecen los tres avisos previos de getStaticPaths en rutas dinámicas.
- El inventario de navegador, escenarios alternativos y artefactos locales está en .tmp/home-server-qa.

Los resultados de staging y la optimización seleccionada se añadirán después de capturar la primera tanda instrumentada.
