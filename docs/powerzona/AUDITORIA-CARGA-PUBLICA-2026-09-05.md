# Auditoría de carga pública y precarga selectiva

Fecha: 2026-09-05. Base auditada: `837b324` en `dev`.

## Alcance

Revisión de la ruta de carga de la tienda pública: layout, portada, catálogo,
imágenes, configuración de Astro, caché HTTP/datos, seguridad de acceso y
analítica. No es una auditoría integral de seguridad ni una prueba de carga de
infraestructura. Se implementan exclusivamente los dos ajustes autorizados:
conexión anticipada a imágenes y precarga selectiva de navegación.

No se modifican administración, backend, base de datos, carrito, checkout,
inventario, promociones, reglas de acceso ni despliegues.

## Hallazgos previos a los cambios

1. `Layout.astro` preparaba la conexión a `PUBLIC_POCKETBASE_URL`, pero no al
   `PUBLIC_MEDIA_CDN_URL` que utiliza `getPocketBaseFileUrl`. En producción son
   `api.tusenda84.com` y `media.tusenda84.com`, respectivamente.
2. Astro ya tenía `prefetchAll: false` y estrategia `hover`. La administración
   utiliza sus atributos de precarga, pero la portada pública inspeccionada no
   tenía destinos activados. No hace falta un router nuevo ni convertir la
   tienda en una SPA.
3. Ya existen precarga y prioridad alta para la primera imagen de portada,
   WebP y carga diferida de imágenes. Se conservan sin duplicarlas.
4. La portada consulta primero ajustes, después agrupa lecturas independientes
   mediante `Promise.all`, y obtiene posteriormente resúmenes de reseñas de
   productos. Las páginas de categorías y productos usan lecturas específicas.
5. Ya hay caché de datos de 15 segundos para configuración y taxonomía,
   separación por tienda y deduplicación de promesas. No se amplía la caché de
   inventario.
6. El catálogo exitoso ya recibe `private, max-age=15,
   stale-while-revalidate=30` y compresión gzip cuando se negocia. Se respeta
   cualquier `no-store` preexistente. No se introducen nuevas políticas HTTP.
7. Las solicitudes públicas siguen pasando por `publicAccessDecision` y las
   protecciones de PocketBase. La precarga HTML no ejecuta scripts del destino:
   no debe generar por sí sola los eventos de visita de `StoreAnalyticsTracker`.
   Sí puede originar hasta tres lecturas adicionales y sus verificaciones de
   acceso; por eso se limita y se exige intención del usuario.

## Comprobación HTTP de producción, antes de publicar

Dos GET de solo lectura a `https://tusenda84.com/t/powerzona`, sin sesión
administrativa enviada por el cliente de prueba:

| Dato | Muestra 1 | Muestra 2 |
| --- | ---: | ---: |
| Estado | 200 | 200 |
| Tiempo total observado por el cliente HTTP | 1706 ms | 887 ms |
| `pz-public-security` | 10,1 ms | 7,4 ms |
| `pz-public-render` | 23,2 ms | 5,0 ms |
| `pz-public-total` | 34,3 ms | 12,9 ms |
| `cfOrigin` reportado | 1126 ms | 702 ms |

Ambas respuestas declaran caché privada de 15 segundos y Cloudflare DYNAMIC.
`Server-Timing` describe los tramos instrumentados, no necesariamente todos los
costes de streaming, intermediarios, red o recursos del navegador. Estos GET no
son comparables directamente con las recargas del navegador integrado. No
identifican ni reproducen la causa del pico anterior de unos 26 segundos.

## Cambios aplicados

### 1. Conexión anticipada al origen público de imágenes

- Se reutiliza la resolución validada de `PUBLIC_MEDIA_CDN_URL`.
- Solo se añade el origen, nunca rutas, credenciales o parámetros.
- Se evitan duplicados cuando las imágenes usan la API o el mismo origen web.
- No se codifica un dominio fijo: sirve para staging y otras instalaciones.
- Solo se activa en páginas habilitadas del catálogo público; no en checkout,
  administración, bazar o vistas con interfaz pública deshabilitada.

### 2. Precarga por intención usando Astro

- Solo documentos de categoría, subcategoría y producto de la misma tienda y
  origen. Funciona también con las rutas públicas heredadas.
- Ratón y foco de teclado requieren 200 ms de intención. Al salir se cancela
  la espera. Un toque primario puede adelantar la solicitud en una conexión apta.
- Máximo tres URL por documento, sin repetir destinos ya intentados.
- No hay precarga masiva por carga, visibilidad o desplazamiento del catálogo.
- Se exige documento cargado y visible, navegador conectado y ausencia de
  ahorro de datos o conexión identificada como slow-2g, 2g o 3g. Sin API de
  información de red se conserva la comprobación de conexión y el límite.
- Quedan excluidos parámetros, fragmentos, tokens, otras tiendas, enlaces
  externos, descargas, nuevas pestañas, elementos deshabilitados y carrito.
- Usa `astro:prefetch`, sin prerenderizado, ejecución del destino, interceptar
  clics ni almacenar respuestas manualmente. El navegador aplica la caché HTTP
  ya existente. Si no puede precargar, el enlace normal sigue funcionando.

## Verificación

- Pruebas unitarias de rutas permitidas/excluidas, aislamiento por tienda,
  ahorro de datos, configuración del CDN e integración.
- Prueba aislada en Chromium con el código de precarga de Astro instalado:
  ausencia de solicitudes iniciales, cancelación del hover breve, foco,
  exclusiones, tope de tres, deduplicación, bloqueo en ahorro de datos y 3G,
  toque permitido, checkout excluido y navegación normal.
- En esa prueba, el HTML precargado no ejecuta scripts y se reutiliza al
  navegar sin una segunda solicitud del documento.
- Suite completa del frontend: **890 pruebas aprobadas**, ninguna fallida ni
  omitida. Incluye las pruebas de carrito, checkout, seguridad y administración.
- `npm run build`: correcto. Permanecen los avisos preexistentes sobre
  `getStaticPaths()` en las tres rutas dinámicas de catálogo.
- `git diff --check`: correcto.

## Pendientes fuera de estos dos cambios

- Reproducir las esperas largas con una traza de red/servidor correlacionada;
  no atribuirlas todavía a imágenes, base de datos o CDN.
- Revisar miniaturas y la entrega de WebP optimizado: las imágenes compartidas
  entre accesos pequeños y tarjetas grandes requieren medir ahorro real.
- Auditar por separado los scripts clásicos del carrito y promociones si se
  detecta bloqueo de carga; no cambiar su orden sin comprobar dependencias.
- Medir primera visita y navegación con red móvil representativa después de
  desplegar. No se promete una reducción porcentual sin esa validación.

Los cambios quedan locales; este trabajo no incluye commit, push ni despliegue.
