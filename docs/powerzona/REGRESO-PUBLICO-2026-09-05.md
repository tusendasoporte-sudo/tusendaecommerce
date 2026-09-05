# Regreso rápido en la tienda pública

Fecha: 2026-09-05. Base: c58455a, rama dev. Cambio local sin commit, push ni
despliegue. Se conserva, por separado, el trabajo previo de conteos públicos.

## Comportamiento y alcance

Los enlaces existentes `data-pz-inner-back` conservan texto, estilos y `href`.
El módulo `publicBackNavigation.ts`, instalado desde `Layout.astro` solamente
para el catálogo público, consulta la entrada inmediatamente anterior mediante
Navigation API. Usa `navigation.back()` únicamente cuando coincide con el padre
que anuncia el enlace, dentro del mismo origen y tienda.

Esto comprende producto, categoría, subcategoría, regalos y búsqueda, tanto
en rutas `/t/tienda` como en dominios propios. No cambia el router, no intercepta
los demás enlaces y no modifica administración, checkout ni código Android.

- Si la entrada anterior no corresponde al destino, se conserva la navegación
  normal: entrada directa, otra categoría, otra tienda, origen externo, nueva
  pestaña, parámetros de consulta o navegador sin la API.
- No se deduce el historial a partir de `document.referrer` o `history.length`,
  ni se salta sobre entradas intermedias.
- Se conservan clics modificados, nuevas pestañas, descargas y funcionamiento
  sin JavaScript. Las cancelaciones no fuerzan otra navegación.
- Al volver a la categoría se deja al navegador restaurar la posición previa.
  El enlace «Categorías» de la portada mantiene específicamente `#categorias`:
  una instrucción de desplazamiento en sessionStorage, válida 60 segundos y
  ligada a la clave exacta de la entrada, se consume al restaurar esa página.
  Solo reemplaza el fragmento, preservando `history.state` y sin añadir entradas.
  Si el almacenamiento está bloqueado, ese enlace sigue su funcionamiento normal.

No se cambia calidad, resolución, compresión ni URL de las imágenes; tampoco
precios, stock, promociones, permisos o reglas de compra. No se añade caché de
inventario ni se amplía ningún TTL existente.

## Verificación

- Suite completa del frontend: **928 pruebas aprobadas**, sin fallos ni saltos.
- `npm run build`: correcto; permanecen los tres avisos previos sobre
  `getStaticPaths` en páginas dinámicas. `git diff --check`: sin errores.
- Runtime con Chrome 152 y servidor HTTP efímero: regreso exacto, posiciones,
  ancla de portada, subcategorías, regalos, búsqueda, adelante/atrás repetidos,
  recarga, doble clic, nueva pestaña, descarga, origen externo intermedio,
  otra tienda/categoría, entradas directas, ausencia de API/JavaScript,
  almacenamiento bloqueado, errores y cancelaciones. Admin y checkout excluidos.
- Se retiró del lanzamiento de Playwright su opción predeterminada que
  deshabilita BFCache. Sin interceptar la red, se verificaron
  `pageshow.persisted === true`, la identidad del documento y de su entrada,
  y ninguna petición HTML adicional durante el regreso del fixture.
- El validador real del carrito, sin modificarlo, invalidó su resultado al
  recibir `pageshow` y detectó stock agotado después de restaurar la página.
  Los datos de esa prueba son ficticios y locales; no se enviaron pedidos.
- Frontend real compilado localmente con lecturas públicas del backend de
  staging: escritorio 1443×1278 y móvil emulado 390×844. Portada → categoría
  Proteínas → Whey Body Fortress → categoría → sección Categorías de portada.
  Categoría y portada se restauraron desde BFCache en ambos tamaños. También
  pasaron navegación adelante/repetida y entrada directa en nueva pestaña.
- Misma lista de URLs de imágenes y etiquetas de regreso; ocho capturas
  inspeccionadas, sin desbordamiento horizontal ni errores JavaScript. La
  categoría volvió a la zona del producto, no a la parte superior; la portada
  mostró Categorías respetando su margen de desplazamiento.

Se siguió la guía de Playwright mediante scripts aislados porque no estaba
disponible su sesión interactiva. Los primeros intentos de QA necesitaron
corregir la espera de `load` en documentos restaurados, la captura de pestañas
nuevas y la geometría/desplazamiento del fixture; no fueron fallos corregidos
mediante cambios en la interfaz de la tienda. Evidencias y scripts ignorados
por Git: `.tmp/public-back-qa/`; capturas y estados: `visual/results.json`.

## Límites y siguiente paso

BFCache depende de la elegibilidad y memoria del navegador: usar el historial
no garantiza restauración instantánea siempre. Si debe cargar de nuevo, sigue
el mecanismo nativo. Como al utilizar Atrás del navegador, la página restaurada
puede mostrar información anterior; permanecen los controles comerciales
existentes antes de continuar la compra.

La documentación oficial describe esta comprobación de la entrada anterior
para un botón de regreso contextual: [Navigation.entries en MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigation/entries).
Las limitaciones de restauración están explicadas en [BFCache en web.dev](https://web.dev/articles/bfcache).

Estas verificaciones no son una medición después del despliegue ni una nueva
comparación de velocidad contra El Yerro. Tampoco se ha probado un dispositivo
Android físico. El siguiente paso es publicar en staging, repetir navegación
y mediciones allí y comprobar el Android real antes de promover a main.
No requiere migración ni cambios de configuración. Reversión: retirar la
instalación del módulo del layout; los enlaces originales ya son funcionales.
