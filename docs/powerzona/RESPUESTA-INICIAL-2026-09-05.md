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

## Primera captura de staging (29b51e3)

Seis cargas instrumentadas, con recargas cercanas e intervalos de 16,5 segundos. HTTP 200 en todas, sin errores JavaScript. El mayor tiempo de un bloque fue rifas: 445,6 ms, frente a 54,3 ms o menos del resto de las lecturas concurrentes de esa muestra. En otra carga se observó una espera aislada de 255,8 ms en valoraciones de productos; no se atribuyen todos los picos a una sola causa.

La revisión confirmó que requestPublicRaffles seguía usando PUBLIC_POCKETBASE_URL, mientras que el cliente SSR común, la seguridad y la resolución de modalidad usan serverPocketBaseUrl(). En Coolify se verificó que staging tiene PZ_POCKETBASE_INTERNAL_URL habilitada en build/runtime hacia el servicio interno de PocketBase. No se editaron variables ni se revelaron otras credenciales.

## Optimización seleccionada

La lectura pública SSR de rifas pasa a usar serverPocketBaseUrl(), el selector interno ya utilizado por las demás consultas del servidor. Mantiene POST /api/pz/raffles/public, los mismos tres campos del body, la ausencia de caché, los filtros y las respuestas de error. El backend conserva la verificación de tienda, acceso y disponibilidad. No se cambia el alta de participantes, su selección de números ni las reglas de rifas.

El cambio tiene fallback a la URL pública solo cuando no existe configuración interna; una URL interna inválida falla cerrada como el resto de proxies. No se añade caché ni se modifica ninguna consulta de inventario, precios o compras.

La prueba de ejecución compila el módulo real con el cliente de base de datos no utilizado aislado. Comprueba acciones home/first/detail, payload y respuestas, URL interna, fallback público, URL inválida, HTTP 403, JSON incorrecto y errores de conexión. La compilación pasó. Se repetirá la misma captura de staging después del despliegue antes de informar un ahorro.
