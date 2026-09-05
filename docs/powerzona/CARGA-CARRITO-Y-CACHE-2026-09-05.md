# Carga no bloqueante y caché de los motores del carrito

Fecha: 2026-09-05. Base: `23860fb` en `dev`.

## Objetivo y alcance

Reducir el bloqueo de presentación del catálogo público y reutilizar sus
scripts entre páginas. No se modifica el panel administrativo, el backend,
la base de datos, la seguridad, las reglas de compra ni la creación de pedidos.
No se realiza commit, push ni despliegue en esta fase.

La traza anterior encontró dos scripts clásicos sin `defer` y con
revalidaciones de caché en primera visita. Sus descargas se solapan: no se
deben sumar sus duraciones como ahorro esperado. El pico de 21 segundos no se
reprodujo con instrumentación por recurso; esta mejora no prueba su causa ni
promete eliminarlo. El tiempo de respuesta inicial del HTML sigue siendo un
objetivo de medición separado.

## Implementación

1. `Layout.astro` importa `cart-live-validator.js` y `cart-promotions.js` como
   recursos con hash de contenido. Vite genera URLs bajo `/_astro/`; no se
   reescriben ni empaquetan las reglas internas de los motores.
2. Ambos scripts usan `defer` exclusivamente en las rutas permitidas del
   catálogo público, incluidas las rutas por tienda y las heredadas. El HTML
   puede continuar procesándose mientras se descargan.
3. El checkout y las páginas fuera del catálogo conservan el orden de carga
   síncrono. La revisión encontró que el checkout necesita el validador durante
   su inicialización; por eso no se difiere allí.
4. Un coordinador pequeño espera a `DOMContentLoaded`, posterior a los scripts
   diferidos, y comprueba la presencia de ambos motores. No consulta servicios
   ni altera almacenamiento. Promociones y cupones arrancan después de esa
   espera, con los mismos filtros y eventos existentes.
5. Un clic temprano en el carrito espera a sus dependencias antes de validar
   stock. Si falla cualquiera de los motores, no se permite saltar al checkout.
   Un fallo de carga tampoco elimina un cupón guardado ni limpia su enlace
   como si el cupón estuviera vencido.

Los archivos originales de `public/` permanecen disponibles en sus URLs
anteriores, para los documentos ya almacenados antes de este cambio.

## Verificación

- Suite completa: **901 pruebas aprobadas**, cero fallidas u omitidas.
- Build de producción correcto. Se mantienen los tres avisos preexistentes
  sobre `getStaticPaths()` en rutas dinámicas del catálogo.
- `git diff --check` correcto.
- Comparación binaria: cada recurso con hash es idéntico a su fuente original.
- Servidor Node compilado local: HTTP 200 y
  `Cache-Control: public, max-age=31536000, immutable` para ambos recursos:
  `cart-live-validator.CyneNufB.js` (24 659 bytes) y
  `cart-promotions.BAFRBa0c.js` (27 716 bytes). Las dos URLs antiguas también
  responden HTTP 200. La caché larga no se aplica a precios, stock ni HTML.
- Renderizado de componentes compilados: el catálogo emite dos atributos
  `defer`; el checkout no emite ninguno en esos dos scripts.
- Chromium con recursos retenidos: el catálogo nuevo presenta contenido antes
  de liberar los scripts; el control con carga síncrona sigue bloqueado.
- Clic temprano en compra: espera, consulta stock y después permite continuar.
- Descarga fallida de cada motor: compra bloqueada y cupón conservado.
- Promociones y cupones: una consulta de cada tipo, con filtro de tienda.
- Navegación normal entre páginas de la prueba: reutiliza los dos scripts
  inmutables sin otras descargas de esos recursos.
- Cantidades, eliminación y stock agotado: conservan los comportamientos
  existentes. La prueba de otra tienda no comparte su almacenamiento.

La revisión visual con Playwright utilizó los componentes compilados reales
de Layout, carrito y checkout, sus estilos compilados y datos locales de
prueba. Se revisaron escritorio (1365 × 900) y móvil (390 × 844), apertura y
cierre, transición del carrito, cantidades, retorno desde checkout, opciones
de entrega y carrito vacío. No se observaron errores de JavaScript ni
desbordamiento horizontal en los estados finales revisados. No se envió ningún
pedido ni se escribieron datos de producción.

## Límites y siguiente comprobación

La tienda real no estaba disponible en el servidor local, por lo que esta
revisión no sustituye la prueba completa de staging. El beneficio demostrado
es evitar el bloqueo del HTML por estos scripts y su reutilización en caché;
no es una medición de ahorro en segundos de la tienda real.

Después de autorizar la publicación en staging: comprobar carga inicial y
navegación, carrito y checkout, con caché fría y caliente. Comparar TTFB,
primera presentación y LCP con El Yerro bajo las mismas condiciones. Revisar
también que el proxy/CDN conserve la política de los recursos con hash antes
de afirmar una mejora cuantificada o igualdad de velocidad.
