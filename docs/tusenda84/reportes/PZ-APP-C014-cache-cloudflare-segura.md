# PZ-APP-C014 — Caché Cloudflare segura

## Estado

`EN CURSO` por autorización expresa del propietario el 2026-08-19. C10 queda pendiente de validación física y C11, C12 y C013 permanecen `PENDIENTE`. La fase actual autoriza auditoría, documentación, código local, pruebas automáticas y preparación de staging; no autoriza desplegar staging ni modificar Cloudflare, Coolify, producción, DNS o caché externa sin aprobación separada.

## Línea base de producción — 2026-08-19

- URL canónica: `https://tusenda84.com/t/powerzona`
- Momento de la medición de navegador: `2026-08-19T11:11:15.831Z`
- Operación: solicitudes públicas de solo lectura y navegación normal.
- Resultado funcional: la portada respondió `200`, cargó con título `PowerZona` y no presentó fallos de recursos visibles.

### HTTP directo

Siete solicitudes consecutivas e independientes desde la misma conexión:

| Métrica | Mediana | Rango |
|---|---:|---:|
| TTFB | 0,930 s | 0,861–1,454 s |
| Tiempo HTTP total | 1,049 s | 0,980–1,570 s |
| HTML transferido sin compresión solicitada | 143.757 bytes | constante |

Cabeceras observadas en el HTML principal:

- `Server: cloudflare`
- `CF-Cache-Status: DYNAMIC`
- `Vary: Accept-Encoding`
- No se observó `Age` ni una directiva pública de caché en la respuesta medida.

### Navegador real aislado

Tres cargas de escritorio y tres cargas móviles mediante Microsoft Edge, con perfil temporal, caché local desactivada y sin limitación artificial de red. La variante móvil cambia viewport y agente de usuario, pero utiliza la misma conexión; por tanto, no representa una simulación 4G.

| Métrica mediana | Escritorio 1440 × 900 | Móvil 390 × 844 |
|---|---:|---:|
| TTFB | 904 ms | 871 ms |
| DOMContentLoaded | 1.200 ms | 1.128 ms |
| Carga completa | 2.189 ms | 1.560 ms |
| First Contentful Paint | 1.108 ms | 1.060 ms |
| Largest Contentful Paint | 1.236 ms | 1.472 ms |
| Cumulative Layout Shift | 0 | 0 |
| Trabajo largo observado | 0 ms | 0 ms |
| Transferencia total | 1.048.593 bytes | 1.049.220 bytes |
| Solicitudes iniciadas | 30 | 30 |

El HTML principal fue `DYNAMIC` en las seis cargas. Una muestra de escritorio presentó LCP de 2.240 ms; las otras dos fueron 1.236 ms y 1.108 ms, por lo que debe conservarse la variación y no solo la mediana al comparar.

En cada navegación Edge notificó como canceladas dos llamadas `Fetch`: `/api/analytics/events` y `/api/security/track-navigation`, ambas con `net::ERR_ABORTED`. La página y sus 29 recursos registrados completaron la carga. C14 deberá determinar si esas cancelaciones son parte intencional del ciclo de navegación o una deuda previa; no se reinterpretan como un efecto de Cloudflare porque todavía no se hizo ningún cambio.

Google PageSpeed Insights no produjo una auditoría porque su API pública respondió con cuota agotada. No se registra ni inventa una puntuación Lighthouse.

### Desglose móvil por recurso

Una carga móvil adicional, también con caché local desactivada, permitió separar los 1.013.768 bytes medidos:

| Tipo | Solicitudes | Bytes | Proporción aproximada |
|---|---:|---:|---:|
| Imágenes | 12 | 946.586 | 93,4 % |
| HTML comprimido | 1 | 32.326 | 3,2 % |
| CSS | 3 | 32.083 | 3,2 % |
| Fetch y otros | 14 | 2.773 contabilizados | 0,3 % |

Los cinco recursos CSS públicos medidos por Cloudflare estaban en `HIT` o revalidación y los CSS principales declaraban `public, max-age=31536000, immutable`. El HTML principal siguió `DYNAMIC`.

Las imágenes proceden de `api.tusenda84.com`. Sus respuestas declaran `max-age=2592000, stale-while-revalidate=86400`, pero no incluyeron `CF-Cache-Status`, `CF-Ray` ni `Age`; por tanto, la evidencia actual indica caché del navegador/origen, no entrega desde el borde de Cloudflare. La imagen de portada midió unos 159 KB y cinco imágenes de categoría individuales midieron entre 94 y 124 KB.

Esta distribución fija la prioridad de C14: primero reducir y servir mejor imágenes; después aislar la parte del TTFB atribuible a seguridad, render y consultas. El CSS y la compresión del HTML ya funcionan suficientemente bien para no encabezar el trabajo.

### Separación entre mejoras existentes en staging y trabajo nuevo

Staging se midió sobre `https://mob76fcvxkxyb8tq0nwys18o.91.99.99.83.sslip.io/t/powerzona` sin modificar datos ni configuración:

| Señal | Producción | Staging | Lectura correcta |
|---|---:|---:|---|
| HTML sin compresión solicitada | 143.757 bytes | 125.953 bytes | Staging entrega 12,4 % menos HTML. |
| TTFB mediano, 7 muestras | 930 ms | 792 ms | Staging fue aproximadamente 15 % menor en esta muestra. |
| Tiempo HTTP total mediano | 1.049 ms | 1.208 ms | No es comparación directa: staging tuvo TLS mediano cercano a 434 ms y producción cercano a 41 ms por el borde de Cloudflare. |
| Cabecera del HTML público | Sin `Cache-Control` observado | `private, max-age=15, stale-while-revalidate=30` | Es una mejora de staging todavía ausente en producción; no habilita caché compartida de Cloudflare. |
| URLs de miniatura en el HTML | 0 de 18 imágenes únicas | 9 de 12 imágenes únicas | Es implementación existente, pero los datos/imágenes de ambas bases son diferentes y su peso total no se puede comparar directamente. |

La transformación de miniaturas ya usada por staging se probó en solo lectura contra tres WebP públicos actuales de producción:

| Caso | Original | Miniatura con tamaño actual de staging | Resultado |
|---|---:|---:|---|
| Categoría `480x270` | 123.496 bytes | 123.496 bytes | Sin ahorro. |
| Producto `300x300` | 23.568 bytes | 78.827 bytes | Aumenta 55.259 bytes. |
| Acceso visual `700x420` | 47.922 bytes | 180.608 bytes | Aumenta 132.686 bytes. |

Por tanto, la reducción del HTML y la cabecera privada corta se consideran mejoras existentes pendientes de promoción. Las miniaturas son una base técnica existente que debe corregirse y volver a medirse antes de producción: PocketBase puede recomprimir un WebP ya optimizado y producir un archivo mayor. C14 debe seleccionar variantes por dimensiones y peso real, conservando el original cuando sea menor.

## Paso 1 — Medición interna local

Implementado en código local el 2026-08-19, sin despliegue. Las rutas públicas que pasan por `publicSecurityResolverForPath` agregan una cabecera `Server-Timing` sanitizada después de ejecutar la misma decisión de seguridad vigente:

- `pz-public-security`: tiempo de `/api/pz/security/public-access`.
- `pz-public-render`: tiempo de `next()`, que en esta primera instrumentación agrupa obtención de datos, caché interna y render SSR.
- `pz-public-total`: tiempo total observado por el middleware.

Las respuestas bloqueadas también incluyen la medición de seguridad y total, con render en `0`, sin exponer IP, slug, dispositivo, razón interna, token ni dato de tienda. No se mide PocketBase como entrada separada todavía: primero se usará `pz-public-render` para justificar si hace falta una instrumentación más profunda, evitando alterar el cliente PocketBase compartido con el navegador.

Archivos:

- `frontend-powerzona/src/lib/publicRequestTiming.ts`
- `frontend-powerzona/src/middleware.ts`
- `frontend-powerzona/tests/publicCatalogPerformance.test.mjs`

Validación local:

- `34/34` pruebas focales aprobadas para rendimiento público, navegación administrativa y seguridad pública.
- `npm run build` aprobado con Astro SSR/Node.
- `git diff --check` sin errores.
- No se crearon datos QA ni se modificaron imágenes, caché, consultas, Cloudflare, Coolify, staging o producción.

### Validación del despliegue en staging — 2026-08-19

El propietario confirmó el despliegue de `38e6a20` en ambos servicios de staging. El frontend devolvió `200` con las tres métricas nuevas y el backend respondió `200` en `/api/health`.

La primera solicitud observada después del despliegue registró `pz-public-security=75,6 ms`, `pz-public-render=767,8 ms` y `pz-public-total=849,8 ms`. Es compatible con un arranque o estado frío, pero una única muestra no permite atribuir la causa.

Siete solicitudes posteriores y espaciadas a la portada produjeron:

| Métrica | Mediana | Rango |
|---|---:|---:|
| `pz-public-security` | 8,9 ms | 4,8–11,4 ms |
| `pz-public-render` | 5,1 ms | 2,1–10,1 ms |
| `pz-public-total` | 15,0 ms | 7,2–22,5 ms |
| TTFB externo de curl | 735 ms | 633–907 ms |
| Tiempo HTTP externo total | 1.142 ms | 1.031–1.322 ms |

La búsqueda pública también devolvió `200`: seguridad `7,7 ms`, render `1,2 ms`, total interno `9,6 ms` y TTFB externo `648 ms`.

La diferencia entre el tiempo interno y el TTFB externo no debe atribuirse automáticamente a PocketBase. Puede incluir resolución, conexión/TLS del dominio `sslip.io`, proxy inverso, preparación/compresión posterior al middleware y transporte. La evidencia sí muestra que, en el estado estable observado, seguridad y SSR/datos no encabezan por sí solos el TTFB de staging; el caso frío debe repetirse antes de proponer cambios de consultas o TTL.

No se crearon datos QA ni se modificaron configuración, caché, imágenes o servicios durante estas solicitudes de solo lectura.

## Paso 2 — Descubrimiento temprano de la imagen LCP

Implementado en código local el 2026-08-19, sin despliegue:

- El layout público emite `preconnect` y `dns-prefetch` hacia el origen público configurado de PocketBase; las vistas Master quedan excluidas.
- La portada pasa al `<head>` la URL exacta de su primera imagen y la declara con `rel=preload`, `as=image` y prioridad alta.
- La misma primera imagen conserva `loading=eager` y añade `fetchpriority=high`; las demás imágenes del carrusel conservan `loading=lazy` y no reciben prioridad alta.
- Todas las imágenes del banner conservan la URL original aprobada, `object-fit: cover`, el carrusel y el recorte vigente. Solo se añaden dimensiones intrínsecas `1600x900` y decodificación asíncrona; no se recomprime ni sustituye ningún WebP.
- Una tienda temporalmente cerrada no precarga el banner oculto.

Validación local:

- `48/48` pruebas focales aprobadas, incluidas seguridad pública, SSR, fallbacks visuales, WebP original y prioridad exclusiva de la primera imagen.
- `npm run build` aprobado con Astro SSR/Node.
- La salida compilada conserva la precarga y `fetchpriority`.
- `git diff --check` sin errores.
- No se crearon datos QA ni se modificaron imágenes, caché, consultas, Cloudflare, Coolify, staging o producción.

### Validación del paso 2 desplegado — 2026-08-19

Después de que el propietario confirmara el despliegue de `e4fcf94` en ambos servicios de staging, se ejecutaron tres cargas de escritorio y tres móviles por entorno, alternando staging y producción en Microsoft Edge aislado, con caché y service workers desactivados y sin limitación artificial de red.

| Mediana | Staging escritorio | Producción escritorio | Staging móvil | Producción móvil |
|---|---:|---:|---:|---:|
| TTFB | 638 ms | 1.344 ms | 499 ms | 1.030 ms |
| DOMContentLoaded | 998 ms | 1.658 ms | 963 ms | 1.291 ms |
| Carga completa | 1.363 ms | 2.651 ms | 1.232 ms | 2.298 ms |
| FCP | 1.008 ms | 1.656 ms | 1.020 ms | 1.276 ms |
| LCP | 1.408 ms | 2.708 ms | 1.256 ms | 2.168 ms |
| CLS | 0 | 0 | 0 | 0 |

La mejora mecánica sí quedó demostrada en las seis cargas de staging:

- la portada fue la solicitud de recurso número `2`, siempre con prioridad de red `High`;
- producción, que aún no incluye el paso 2, descubrió la portada como solicitud número `7`;
- `preconnect`, `dns-prefetch` y el `preload` exacto aparecieron en el `<head>`;
- la imagen LCP conservó `loading=eager`, `fetchpriority=high`, `decoding=async` y dimensiones `1600x900`;
- la captura móvil mostró banner, recorte, carrusel y composición visual correctos, sin movimiento acumulado.

Los porcentajes de diferencia no se atribuyen íntegramente al paso 2 porque ambos entornos tienen datos e imágenes distintos. En particular, la portada de staging transfirió aproximadamente 54 KB frente a 159 KB en producción, mientras la página completa de staging transfirió cerca de 1,49 MB frente a 1,05 MB en producción. Esto confirma simultáneamente que el LCP quedó mejor priorizado y que el peso del resto de imágenes de staging sigue siendo la próxima deuda; no autoriza promover las miniaturas actuales.

Las llamadas analíticas y de seguridad no dejaron registros persistentes durante la ventana de prueba: se verificó un total de `0` elementos nuevos desde `2026-08-19 12:05:00Z` en `store_analytics_events`, `store_visitor_sessions` y `store_visitor_pageviews`, tanto en staging como en producción. El perfil, script y captura temporales fueron eliminados.

### Paso 3A — auditoría de imágenes y corrección local de Regalos — 2026-08-19

La portada pública de staging contiene 22 etiquetas `img` y 10 archivos únicos de PocketBase. La lectura HTTP directa, que no ejecuta JavaScript ni crea analítica, midió `1.451.810` bytes en esas imágenes. El inventario confirmó que la portada principal debe permanecer intacta y que las miniaturas de logo y elementos visuales sí reducen el peso.

El caso inseguro quedó aislado en `gifts_public_image`: el archivo almacenado ya era un WebP optimizado de `1200x675` y `78.222` bytes, pero `?thumb=700x420` hacía que PocketBase entregara un PNG de `323.948` bytes. La segunda conversión agregaba `245.726` bytes y cambiaba la proporción de `16:9` a `5:3`, aunque el contenedor público aprobado es `16:9` con `object-fit: contain`.

Se implementó localmente el cambio mínimo: `giftsPublicImageUrl` entrega directamente el archivo WebP almacenado. No se modificaron archivos subidos, datos, esquema, portada, categorías, productos, promociones ni infraestructura. El flujo de carga existente continúa preparando la imagen de Regalos como WebP `1200x675` con calidad `0.82` antes de enviarla a PocketBase.

La decisión sobre el resto del inventario fue conservadora:

- las cuatro categorías conservan sus archivos actuales; `480x270` no está configurado como miniatura y hoy devuelve el original, mientras `300x200` altera la proporción visual aprobada;
- las dos miniaturas de `store_visual_items` se mantienen porque reducen de aproximadamente `1,48 MB` originales a `410 KB` combinados;
- la miniatura del producto se evaluará en un paso separado después de medir esta corrección desplegada;
- logo y portada permanecen sin cambios.

Validación local de la corrección:

- `11/11` pruebas en `storefrontReadPerformance.test.mjs`;
- build Astro SSR correcto;
- `git diff --check` sin errores;
- ahorro previsto en la portada de staging: `245.726` bytes, cerca del `17 %` del peso de sus imágenes.

### Paso 3B — auditoría de Regalos y productos; entrega WebP por formato — 2026-08-19

Después de desplegar `644c780`, la página pública de Regalos respondió `200` y confirmó que su banner ya se entrega como el WebP almacenado de `78.222` bytes, sin `thumb`. La revisión separó ese banner de las fotos individuales de cada regalo.

Las dos fotos individuales actuales son JPEG heredados y sus miniaturas `700x700` sí aportan ahorro:

- Vitamina E: `69.757` bytes de miniatura frente a `83.932` bytes del original;
- Vitamina C: `63.054` bytes de miniatura frente a `94.620` bytes del original;
- ahorro combinado: `45.741` bytes.

Por tanto, esas imágenes existentes no deben cambiar. La página se revisó en Edge aislado a `1440x1000` y `390x844`: CLS `0`, cero imágenes rotas, sin desbordamiento horizontal y con `object-fit: contain` correcto. Todas las solicitudes que no fueran `GET` o `HEAD` se bloquearon y las capturas temporales se eliminaron.

La auditoría de productos recorrió la portada, cinco páginas de categoría y dos de subcategoría, todas con estado `200`. Los tres productos públicos con imagen utilizan WebP almacenado, pero sus tarjetas solicitan `300x300` y PocketBase los entrega como PNG:

- miniaturas actuales combinadas: `209.699` bytes;
- WebP almacenados combinados: `150.008` bytes;
- ahorro previsto: `59.691` bytes, aproximadamente `28,5 %`;
- resolución almacenada: `800x800` o `1000x1000`, frente a `300x300` de las miniaturas.

Una simulación de solo lectura sustituyó temporalmente las URLs en el DOM de Edge por los WebP almacenados. Las seis combinaciones —tres productos en escritorio y móvil— conservaron exactamente las dimensiones renderizadas, `object-fit: contain`, cero imágenes rotas y ausencia de desbordamiento horizontal.

Con autorización se implementó localmente una regla por formato exclusivamente para los listados públicos de productos:

- WebP se entrega directamente;
- JPEG, PNG y otros formatos heredados conservan la miniatura solicitada;
- el detalle del producto, las variaciones, Regalos, las imágenes almacenadas y el proceso de subida no cambian.

Validación local:

- `15/15` pruebas focales;
- build Astro SSR correcto;
- `git diff --check` sin errores;
- no se crearon ni modificaron datos o archivos de PocketBase.

### Paso 3C — auditoría de taxonomía y optimización segura al subir — 2026-08-19

La auditoría separó las tarjetas públicas de categorías y subcategorías de sus archivos almacenados. La variante solicitada `480x270` no reduce actualmente los tres archivos heredados JPEG/PNG detectados, mientras que `300x200` sí reduce bytes pero recorta las imágenes cuadradas y cambia la composición aprobada. Por ese motivo no se sustituyó la URL pública por una miniatura recortada.

Una simulación aislada convirtió esos tres archivos a WebP con calidad `0.82`, conservando exactamente las dimensiones y la proporción originales:

- categoría Aminos: `171.303` → `40.246` bytes, ahorro de `131.057` bytes (`76,5 %`);
- subcategoría Mass Gainer: `620.600` → `41.292` bytes, ahorro de `579.308` bytes (`93,3 %`);
- subcategoría Aminos especiales: `164.973` → `73.968` bytes, ahorro de `91.005` bytes (`55,2 %`);
- total: `956.876` → `155.506` bytes, ahorro potencial de `801.370` bytes (`83,7 %`).

Las sustituciones simuladas en escritorio y móvil conservaron tamaño renderizado, proporción y composición. Los archivos simulados y las capturas temporales se eliminaron; no se cargó ni modificó ningún registro de PocketBase.

Con autorización se implementó localmente una única regla compartida para los tres flujos administrativos de categorías y subcategorías:

- JPEG/PNG se codifican en WebP con calidad `0.82` y las mismas dimensiones del archivo original, sin recorte ni ampliación;
- el WebP se utiliza únicamente si pesa menos; ante empate, aumento de bytes o error se conserva el archivo original;
- un WebP que ya llega preparado no se vuelve a convertir;
- la carga de imágenes de productos, variaciones y Regalos permanece fuera de esta regla.

El cambio no altera automáticamente las fotos actuales. Solo actúa al crear una categoría/subcategoría o reemplazar su imagen después de desplegarlo. La prueba real y revisión visual en staging queda pendiente de un despliegue autorizado y utilizará registros aislados que se eliminarán por completo al terminar.

Validación local:

- `22/22` pruebas focales de optimización y entrega de imágenes;
- `21/21` pruebas de regresión de navegación, permisos y shell administrativo;
- build Astro SSR correcto;
- no se crearon ni modificaron datos, imágenes o archivos de PocketBase y no hubo despliegue.

## Plan de trabajo propuesto

### Puerta de regresión previa a C12

C12 no debe promover ciegamente todo el comportamiento visual de staging. Antes de su despliegue se compararán las URLs y bytes de las imágenes con los archivos reales de producción. La selección actual de miniaturas debe corregirse o quedar desactivada mediante configuración segura si aumenta el peso. Esta puerta no adelanta C14 ni autoriza cambios de producción; impide introducir una regresión conocida antes de que C14 pueda medirla.

### Fase 0 — Inventario y medición interna

1. Identificar el commit y configuración exactos de frontend/backend en producción y staging.
2. Separar cambios ya aprobados en staging de cambios nuevos de C14.
3. `IMPLEMENTADO LOCAL`: añadir `Server-Timing` sanitizado para medir seguridad pública, SSR/datos agrupados y total sin exponer IP, tienda privada ni decisiones sensibles.
4. Repetir la línea base con caché interna fría y caliente.

### Fase 1 — Promover únicamente ganancias existentes demostradas

1. Conservar el HTML menor de staging y su compresión actual.
2. Mantener la caché privada corta de navegador si las pruebas negativas de seguridad siguen pasando.
3. No promover todavía las reglas actuales de miniaturas como optimización de peso; corregirlas primero.
4. Confirmar que CSS/JS con hash continúan `public, max-age=31536000, immutable` y `HIT`; no dedicar trabajo principal a recursos que ya funcionan.

### Fase 2 — Imágenes adaptativas por peso real

1. Generar variantes WebP/AVIF en escritura o publicación, no recomprimir ciegamente en cada lectura.
2. Guardar dimensiones y bytes de cada variante; usarla solo cuando sea menor que el original.
3. Servir `srcset`/`sizes` adecuados para portada, categorías, productos y bloques visuales.
4. Dar prioridad alta únicamente a la imagen LCP; mantener el resto diferido y con dimensiones explícitas.
5. Probar con copias aisladas de las imágenes reales y eliminar todos los datos QA al terminar.

### Fase 3 — Reducir el TTFB en origen

1. Usar `Server-Timing` para decidir cuánto corresponde al control de seguridad, PocketBase y SSR.
2. Añadir invalidación explícita de caché al modificar tienda, catálogo, promociones, regalos o ajustes antes de aumentar el TTL interno de 15 a 30–60 segundos.
3. Evitar el vencimiento bloqueante mediante stale-while-revalidate interno y deduplicación de solicitudes.
4. Evaluar un snapshot público mínimo por tienda para reducir consultas y campos transferidos al render.
5. No cachear decisiones de seguridad por IP/dispositivo salvo diseño separado, corto, invalidable y probado negativamente.

### Fase 4 — CDN exclusivo para medios públicos

1. Diseñar un host/ruta de medios que admita solo `GET`/`HEAD` y colecciones públicas expresamente permitidas.
2. Mantener fuera de caché API JSON, archivos privados, tokens, cookies y rutas administrativas.
3. Cachear variantes inmutables en Cloudflare y purgar por cambio/publicación.
4. Verificar `MISS` → `HIT`, aislamiento entre tiendas y ausencia de acceso a archivos privados.

### Fase 5 — HTML de borde opcional

Solo se considera si la seguridad por IP/VPN/dispositivo puede ejecutarse antes del lookup de caché. Si las fases anteriores alcanzan el objetivo, el HTML seguirá `DYNAMIC`. Nunca se activa `Cache Everything` de forma general.

### Fase 6 — Comparación y promoción controlada

1. Ejecutar toda la matriz en staging con datos aislados.
2. Exigir mejora medible en TTFB, LCP y bytes sin regresión visual o funcional.
3. Solicitar autorización separada para backup, reglas Cloudflare y despliegue gradual de producción.
4. Repetir exactamente la línea base, documentar resultados y revertir/purgar ante cualquier fuga, cruce de tienda o empeoramiento.

## Método para la comparación posterior

La medición posterior debe repetir, desde una conexión comparable:

1. Siete solicitudes HTTP consecutivas a la misma URL canónica.
2. Tres cargas Edge de escritorio y tres móviles con caché local desactivada.
3. Estado HTTP, `CF-Cache-Status`, `Age`, TTFB, carga completa, FCP, LCP, CLS, bytes y solicitudes.
4. Revisión separada de caché fría, `MISS`, `HIT` y `BYPASS` cuando existan reglas nuevas.
5. Pruebas negativas de rutas privadas, sesiones, seguridad pública y aislamiento entre tiendas antes de aceptar cualquier mejora.

## Verificación real de miniaturas de taxonomía — 2026-08-19

Después de desplegar `dd2a4b9`, PocketBase confirmó `300x200, 700x420, 480x270` en los campos de imagen de `categories` y `subcategories`. Las solicitudes HTTP reales verificaron que `480x270` ya genera una variante física en ambas colecciones.

La medición detectó dos comportamientos según el formato almacenado:

- JPEG heredado: `164.973` bytes original y `43.043` bytes la miniatura `480x270`; ahorro de `121.930` bytes, aproximadamente `73,9 %`.
- WebP optimizado: `118.412` bytes original y `211.634` bytes la miniatura, que PocketBase recodificó como PNG; aumento de `93.222` bytes, aproximadamente `78,7 %`.

Se aplicó el mismo selector seguro ya probado en productos: las tarjetas entregan directamente un WebP optimizado y solicitan `480x270` únicamente para JPEG/PNG heredados. El banner de categoría o subcategoría continúa usando el archivo original para preservar resolución y aspecto. No se modificaron archivos ni registros existentes.

## Limpieza y efectos

- El perfil temporal de Edge y el script diagnóstico fueron eliminados.
- No se crearon registros QA deliberados, campañas, usuarios, tiendas, APK, AAB ni artefactos permanentes.
- No se modificaron Cloudflare, Coolify, producción, Firebase ni Google Play.
- Las modificaciones locales actuales se limitan al optimizador compartido de cargas de categorías/subcategorías, sus pruebas y este registro. Los pasos anteriores de instrumentación, prioridad LCP, banner de Regalos y entrega directa de productos WebP ya fueron confirmados en staging.
