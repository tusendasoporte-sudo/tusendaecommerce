---
title: "Bitácora de errores y actualizaciones - PowerZona / Tu Senda 84"
project: "PowerZona / Tu Senda 84"
document_version: "v33"
source_revision: "V121"
last_updated: "2026-07-25"
status: "ACTIVA"
next_work_item: "S7P3 - Seguridad Premium"
source_pdf: "Bitacora_Errores_PowerZona_TuSenda84_2026-07-25_v33_Source_V121.pdf"
---

# Bitácora de errores y actualizaciones

> Documento interno de trabajo. No incluir datos sensibles ni notas visibles de producción.

Este archivo Markdown es la versión editable de la bitácora histórica en PDF. Conserva la organización, terminología, estados, reglas operativas y cierres documentados hasta **Source V121**. Las capturas y composiciones visuales históricas permanecen como evidencia en el PDF fuente indicado en los metadatos.

## Uso desde Codex de escritorio

- Codex debe actualizar este archivo directamente dentro del repositorio real, sin regenerar ni reemplazar el historial completo.
- Las entradas cerradas se conservan. Una corrección documental posterior debe añadirse como actualización, sin borrar la evidencia previa.
- Cada nueva tarea debe registrar: ID, fecha, source, sección, estado, alcance, pruebas, limpieza y continuidad.
- Una tarea nueva no se marca como **COMPLETADA** hasta la confirmación explícita de Kraken.
- Cuando un punto anterior quede confirmado, el siguiente prompt debe registrar primero ese cierre documental antes de comenzar la nueva tarea.
- Los reportes técnicos se conservan en `docs/tusenda84/reportes/`.
- Codex trabaja en el repositorio real `E:\Trabajo\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt`, rama `dev`.
- Los ZIP `Proyecto Actualizado Vxx` son copias de revisión para ChatGPT; no deben importarse ni descomprimirse sobre el repositorio.
- No hacer commit, push, merge ni despliegue salvo autorización expresa.
- Mantener la regla de producción/F12: sin comentarios internos visibles, TODO, textos Codex/debug, `console.log/info/warn` de desarrollo, source maps públicos ni datos sensibles en frontend.
- Toda prueba temporal debe terminar con **0 fixtures**, **0 procesos temporales**, **0 listeners** y **0 archivos runtime residuales**.

## Estado vigente al convertir a Markdown

| ID | Sección | Estado | Pendiente principal |
|---|---|---|---|
| P7G4 | Capacidades globales | Completado local | Staging/production |
| F7P8 | Límite de fotos 2/4 | COMPLETADO | Staging en bloque |
| PZ-ORD-PRICE01 | Precios y totales de pedidos | Completado local | Staging/production |
| M7U2 | Mi equipo y permisos | COMPLETADO | Staging en bloque |
| V7E9 | Vencimiento Premium | COMPLETADO | Staging en bloque |
| L7Q1 | Landing QR Premium | COMPLETADO | Staging en bloque |
| R7P2 | Rifas Premium | COMPLETADO | Staging en bloque |
| S7P3 | Seguridad Premium | Siguiente punto | Gate de plan |

### Continuidad inmediata

- **R7P2 - Rifas Premium** quedó COMPLETADO en Source V121.
- El siguiente punto se trabajará en un chat independiente: **S7P3 - Seguridad Premium**.
- El primer prompt de S7P3 debe registrar documentalmente R7P2 como COMPLETADO antes de iniciar la nueva tarea.
- S7P3 debe aplicar gate de plan y vigencia en frontend y backend, conservar configuración, clientes, eventos, bloqueos y auditoría al bajar de plan, mostrar gate comercial al Principal Free/Básico/vencido, bloquear endpoints y acciones privadas sin capacidad, mantener aislamiento por tienda y no ampliar el enforcement público fuera del alcance aprobado.

---

## Zona activa para nuevas actualizaciones

<!-- CODEX: insertar cada nueva actualización debajo de este comentario y antes del historial convertido. No borrar entradas anteriores. -->

### S7P3 - Seguridad Premium

| Campo | Detalle |
|---|---|
| ID / Prompt | `S7P3` |
| Título | `Seguridad Premium` |
| Fecha | `2026-08-06` |
| Source | `V122` |
| Sección / rutas | `Admin de tienda -> Seguridad; endpoints privados /api/pz/security/*; REST y realtime privados` |
| Estado | `EN REVISIÓN` |
| Confirmación | `Validación técnica Codex aprobada; validación manual Kraken pendiente` |

#### Cierre documental previo

R7P2 - Rifas Premium quedó registrado como **COMPLETADO** en su reporte técnico antes de iniciar cambios funcionales de S7P3. Se conserva Source V121, la confirmación de Kraken del 25 de julio de 2026 y el cierre de los 17 bloques manuales con R7P2-C1/C2.

#### Objetivo

Aplicar capacidad `security_enabled`, vigencia, permisos granulares y aislamiento por tienda a toda la superficie privada de Seguridad, mostrar gate comercial al Principal Free/Básico/vencido y conservar configuración, clientes, eventos, visitantes, bloqueos y auditoría durante downgrade.

#### Cambios implementados

- Contrato SSR central `securityAccess.ts` con capacidad vigente, Principal y permisos de lectura/gestión.
- Gate comercial en ruta canónica, legacy, detalle de visitante, middleware y sidebar sin consultar ni montar datos privados.
- Backend explícito para endpoints privados, REST, mutaciones y realtime; Master conserva lectura histórica.
- Downgrade/upgrade cambia acceso efectivo sin borrar o reescribir datos de Seguridad.
- El enforcement público aprobado no fue ampliado; 0 migraciones y 0 dependencias.

#### Validaciones

- Backend focal S7P3: **5/5** aprobadas.
- Frontend focal S7P3: **7/7** aprobadas.
- Backend completo: **588 totales; 581 aprobadas; 7 omitidas declaradas; 0 fallidas**.
- Frontend completo: **283/283** aprobadas; 0 fallidas.
- `npm run build`: aprobado; solo tres warnings históricos de rutas dinámicas.
- Artefactos públicos: **0 source maps y 0 marcadores internos/console de diagnóstico**; limpieza posterior de `dist`, `.astro` y `.tmp` vacío.
- `git diff --check`: aprobado.
- Reporte: `docs/tusenda84/reportes/S7P3-seguridad-premium.md`.
- Manual de QA: `docs/tusenda84/reportes/S7P3-manual-pruebas-seguridad-premium.md`, con 17 bloques pendientes de ejecución por Kraken.

#### Continuidad

S7P3 queda **EN REVISIÓN / PENDIENTE DE VALIDACIÓN MANUAL DE KRAKEN**. No se marca COMPLETADO, no se realizó push y staging/production continúan reservados para el bloque conjunto aprobado.

### Plantilla de actualización

| Campo | Detalle |
|---|---|
| ID / Prompt | `[ID]` |
| Título | `[Nombre de la tarea o corrección]` |
| Fecha | `AAAA-MM-DD` |
| Source | `[Vxxx]` |
| Sección / rutas | `[Módulo y rutas afectadas]` |
| Estado | `NUEVO / EN ANÁLISIS / PROMPT LISTO / EN REVISIÓN / COMPLETADO / STAGING OK / PRODUCTION OK` |
| Confirmación | `[Kraken / Codex / ambiente]` |

#### Objetivo

[Descripción concreta.]

#### Cambios implementados o solicitados

- [Cambio 1]
- [Cambio 2]

#### Validaciones

- [Pruebas automáticas]
- [Pruebas manuales]
- `npm run build`
- `git diff --check`
- `git status --short`
- 0 fixtures y 0 procesos temporales

#### Continuidad

[Qué queda cerrado, qué continúa pendiente y cuál es el siguiente punto.]

---

# Historial convertido desde la bitácora PDF

<!-- PDF fuente: página 1 -->

### PZ BITÁCORA ACTIVA

### Registro visual de errores

Capturas, rutas, prioridades, estados y validaciones por ambiente

#### 01

#### 02

#### 03

#### 04

**Detectar**

**Documentar**

**Corregir**

**Validar**

**Registros activos: 1**

## Bitácora de errores y capturas

### PowerZona / Tu Senda 84

Documento preparado para registrar errores visuales, funcionales y de producción con fotos, pasos de reproducción, prioridad, estado y notas listas para convertir en prompts de Codex.

| Campo | Detalle |
|---|---|
| Proyecto | PowerZona / Tu Senda 84 |
| Fecha de creación | 30 de junio de 2026 |
| Última<br>actualización | 30 de junio de 2026 |
| Versión | v2 - M-001 agregado |
| Registros activos | 1 |
| Uso | Registrar errores y mejoras detectadas para trabajarlas por lotes |

**Regla de registro**

Cada error o mejora debe quedar con: ID, fecha, entorno, ruta o pantalla, descripción clara, pasos de reproducción, resultado actual, resultado esperado, captura, prioridad, estado y notas para Codex. Cuando se corrija, se agregará la validación en dev, staging y production.

<!-- PDF fuente: página 2 -->

### Control de trabajo

Esta página define cómo clasificar los errores y mejoras antes de pasarlos a Codex o revisarlos manualmente.

| Prioridad | Cuándo usarla | Acción recomendada |
|---|---|---|
| Alta | Rompe compra, checkout, pedidos, inventario, login,<br>seguridad o producción. | Corregir antes de nuevos cambios visuales. |
| Media | Afecta administración, textos, visual importante, flujo<br>no crítico o mejora funcional necesaria. | Agrupar por sección y corregir en dev. |
| Baja | Ajuste visual menor, alineación, microcopy o mejora<br>estética. | Acumular para lote de pulido visual. |

| Estado | Significado |
|---|---|
| Nuevo | Detectado, aún sin revisar source ni crear prompt. |
| En análisis | Se está revisando causa, archivos afectados o relación con otros errores. |
| Prompt listo | Ya tiene instrucciones claras para Codex, con reglas de protección producción/F12. |
| Corregido en dev | Implementado local/dev, pendiente de build o staging. |
| Probado staging | Validado en staging, listo para pasar a production. |
| Production OK | Corregido y probado en producción. |

**Regla crítica para prompts de corrección**

Todo prompt de corrección debe pedir revisar el source actualizado, tocar solo los archivos necesarios, no romper sidebar global ni barras móviles fijas, mantener aislamiento por tienda y no dejar comentarios internos, TODO, textos debug, console.log/info/warn de desarrollo, source maps públicos ni datos sensibles visibles desde F12.

<!-- PDF fuente: página 3 -->

### Resumen de errores y mejoras

Tabla activa de problemas, mejoras y capturas pendientes para trabajar por lotes.

| ID | Tipo | Sección / ruta | Descripción corta | Prioridad | Estado |
|---|---|---|---|---|---|
| M-001 | Mejora visual /<br>funcional | Subcategorías /<br>categoría padre | Vista configurable para subcategorías | Media | Nuevo |

**Formato mínimo para enviar cada error o mejora**

Error/mejora: [qué pasa o qué se necesita]. Pantalla/ruta: [dónde pasa]. Entorno: dev/staging/production. Qué esperaba: [resultado correcto]. Prioridad: alta/media/baja. Captura: [imagen].

También sirve si solo envías la foto y una frase corta. Yo completaré el registro con lo que se vea y marcaré lo pendiente como 'por confirmar'.

<!-- PDF fuente: página 4 -->

### M-001 - Vista configurable para subcategorías

#### NUEVO PRIORIDAD MEDIA

| Campo | Detalle |
|---|---|
| Tipo | Mejora visual / funcional |
| Fecha | 30 de junio de 2026 |
| Entorno | Por definir: admin / tienda pública |
| Pantalla o sección | Subcategorías / categoría padre |
| Ruta | Por confirmar: Ajustes de tienda -> Organización Visual o edición de categoría |
| Descripción | Agregar una opción para elegir cómo se muestran las subcategorías: vista 1 a 1 o vista 2 a 2 en formato<br>vertical. |
| Pasos / contexto | 1) Entrar a la sección donde se administran o muestran subcategorías. 2) Revisar que actualmente no exista<br>selector de vista. 3) Intentar configurar la presentación de subcategorías. |
| Resultado actual | Las subcategorías tienen una vista fija y no se puede elegir entre una presentación de 1 por fila o 2 por fila<br>vertical. |
| Resultado esperado | El admin debe poder seleccionar la vista de subcategorías entre 1 a 1 y 2 a 2 vertical. La tienda pública debe<br>respetar esa configuración sin romper el diseño PC/móvil. |
| Archivos<br>sospechosos | Por revisar en source actualizado. Posibles zonas: configuración visual, edición de categorías/subcategorías y<br>componentes públicos de categoría/subcategoría. |
| Pendiente | Confirmar si el selector vive en Organización Visual, edición de categoría o ajustes de tienda; agregar captura<br>del estado actual y/o referencia visual. |
| Notas para Codex | Revisar source actualizado antes de tocar código. Implementar selector de vista de subcategorías en el lugar<br>correcto según arquitectura actual. Mantener sidebar global, barra superior/inferior móvil fija, aislamiento por<br>tienda, responsive PC/móvil y regla production/F12: no dejar comentarios internos, TODO, textos debug,<br>console.log/info/warn de desarrollo, source maps públicos ni datos sensibles visibles. |

**Capturas / evidencia visual**

#### Captura principal pendiente

Captura pendiente

<!-- PDF fuente: página 5 -->

### Plantilla de registro E-002

#### NUEVO PRIORIDAD POR DEFINIR

| Campo | Detalle |
|---|---|
| Fecha | Pendiente de completar |
| Entorno | dev / staging / production |
| Pantalla o ruta | Pendiente de completar |
| Descripción | Pendiente de completar |
| Pasos para<br>reproducir | 1) ... 2) ... 3) ... |
| Resultado actual | Pendiente de completar |
| Resultado esperado | Pendiente de completar |
| Archivos<br>sospechosos | Por revisar en source actualizado |
| Notas para Codex | Tocar solo lo necesario. Mantener sidebar global, barras móviles fijas, aislamiento por tienda y limpieza<br>production/F12. |

#### Captura principal del error

Captura pendiente

#### Captura adicional / comparación esperada

Captura pendiente

<!-- PDF fuente: página 6 -->

### Página final de control

Espacio para resumen de pendientes, prompts preparados y validaciones realizadas en staging/production.

**Pendientes globales**

| Campo | Detalle |
|---|---|
| Registros activos | 1 |
| Nuevos | 1 |
| Prioridad alta | 0 |
| Prioridad media | 1 |
| Prioridad baja | 0 |
| Capturas<br>pendientes | 1 |

**Regla production/F12**

No dejar comentarios HTML internos, versiones, TODO, textos Codex/debug, console.log/info/warn de desarrollo, notas internas visibles en DOM, source maps públicos ni datos sensibles en frontend.

<!-- PDF fuente: página 7 -->

### Nuevo registro agregado E-001 - Nombre/slug demasiado largo rompe la lectura del listado de productos

| Campo | Detalle |
|---|---|
| Tipo | Error visual / usabilidad |
| Sección | Admin de tienda fi Productos fi listado de productos |
| Prioridad | Media |
| Estado | Nuevo |
| Captura | Adjunta en esta página |

#### Descripción del problema

En el listado de productos del panel admin, cuando el nombre del producto o el texto secundario (por ejemplo slug o referencia) es demasiado largo, invade visualmente el espacio de las demás columnas y afecta la lectura de categoría, precio, stock y acciones.

#### Comportamiento esperado

El listado debe limitar visualmente la longitud mostrada del nombre y/o texto secundario en esa vista. Cuando el contenido supere el ancho disponible, debe mostrarse truncado con puntos suspensivos, por ejemplo “MASAJEADOR INALÁMBRICO 3 EN 1 PARA RODILL…”, sin desplazar ni interferir con los demás datos.

#### Recomendación funcional/visual

Aplicar un máximo visual por línea en la lista de productos y usar truncado con ellipsis. Idealmente: nombre principal en 1 línea con ellipsis; texto secundario en 1 línea con ellipsis; mantener grid/columnas estables; preservar la lectura de categoría, precio, stock, estado y botones.

#### Nota para prompt de Codex

Respetar el layout actual del listado de productos. No cambiar datos ni estructura funcional, solo corregir la presentación visual para textos largos. Debe funcionar en PC y móvil. Incluir la regla global de producción/F12: no dejar comentarios, TODOs, logs de desarrollo, notas internas visibles ni datos sensibles en frontend.

#### Captura de referencia

<!-- PDF fuente: página 8 -->

### Nuevo registro agregado M-002 - Simplificar el control de estado Visible/Oculto en productos

| Campo | Detalle |
|---|---|
| Tipo | Mejora visual / usabilidad |
| Sección | Admin de tienda fi Productos fi listado de productos |
| Prioridad | Media |
| Estado | Nuevo |
| Captura | Adjunta en esta página |

#### Descripción de la mejora

En el listado de productos actualmente aparece el indicador de estado “VISIBLE” y además un botón separado “Ocultar”. La propuesta es simplificar esta parte de la interfaz para que exista un único control más claro y limpio que permita alternar entre visible y oculto.

#### Comportamiento esperado

Sustituir la combinación actual de badge de estado + botón “Ocultar” por un solo botón/toggle/selector de estado que permita cambiar entre “Visible” y “Oculto”. Debe quedar más simple visualmente y más fácil de entender de un vistazo.

#### Recomendación funcional/visual

Mantener una sola acción principal para el estado de publicación. El nuevo control puede ser tipo switch, segmented control o botón de estado reversible. Debe verse limpio, moderno y consistente con el estilo premium blanco/azul del admin. La columna Acciones debe quedar más despejada.

#### Nota para prompt de Codex

No alterar la lógica de publicación del producto, solo mejorar el patrón de interacción y la presentación visual del estado. Respetar la estructura general del listado, simplificar la vista y conservar compatibilidad en PC y móvil. Incluir la regla global de producción/F12: no dejar comentarios, TODOs, logs de desarrollo, notas internas visibles ni datos sensibles en frontend.

#### Captura de referencia

<!-- PDF fuente: página 9 -->

### Nuevo registro agregado M-003 - Simplificar interacción en la sección Regalos del panel admin

| Campo | Detalle |
|---|---|
| Tipo | Mejora funcional / visual |
| Sección | Admin de tienda fi Regalos fi Listado de regalos |
| Prioridad | Media |
| Estado | Nuevo |
| Captura | Adjunta en esta página |

#### Descripción de la mejora solicitada

En la sección de regalos del panel admin, el usuario quiere simplificar la interacción del listado. Al tocar el producto o su fila principal, debe entrar directamente a la pantalla de edición del regalo.

#### Cambios solicitados

1) Hacer clickeable el producto/listado para abrir Editar. 2) Convertir la visibilidad en un único botón o toggle claro que alterne entre Visible y Oculto. 3) Quitar los botones separados “Editar” y “Ocultar” para limpiar la interfaz.

#### Comportamiento esperado

La fila o bloque principal del regalo debe funcionar como acceso directo a edición. El estado de visibilidad debe poder cambiarse con un control único, visible y fácil de entender. La vista debe quedar más simple, limpia y rápida de usar.

#### Notas de implementación

Respetar el estilo actual del panel admin y mantener compatibilidad en PC y móvil. No romper las demás acciones necesarias del listado (por ejemplo ordenar o menú adicional si sigue siendo útil). Aplicar la regla global de producción/F12: no dejar comentarios, TODOs, logs de desarrollo, notas internas visibles ni datos sensibles en frontend.

#### Captura de referencia

<!-- PDF fuente: página 10 -->

### Nuevo registro agregado M-004 - Mejorar selector de productos relacionados y eliminar scroll horizontal

| Campo | Detalle |
|---|---|
| Tipo | Mejora visual / usabilidad |
| Seccion | Admin de tienda - Productos - Editar producto - Productos relacionados |
| Prioridad | Media |
| Estado | Nuevo |
| Captura | Adjunta en esta pagina |

#### Descripcion del problema

En el modal de productos relacionados, el control para seleccionar aparece al final de cada fila. Cuando el nombre del producto es largo, se genera desplazamiento horizontal y la seleccion queda incomoda, especialmente en movil.

#### Comportamiento esperado

El boton/checkbox de seleccion debe estar al inicio de cada producto relacionado, antes del nombre o contenido principal. La lista no debe generar scroll horizontal; debe adaptarse al ancho disponible y truncar textos largos con puntos suspensivos cuando sea necesario.

#### Cambios solicitados

Mover el selector al inicio de la fila. Mantener visible el estado seleccionado. Evitar overflow horizontal. Truncar nombres largos. Preservar el limite actual de maximo 4 productos relacionados y los botones Cancelar/Anadir.

#### Notas para Codex

Respetar el estilo actual del modal y corregir PC/movil. No tocar logica de guardado salvo que sea necesario para mantener el mismo comportamiento. Aplicar la regla global de produccion/F12: no dejar comentarios, TODOs, logs de desarrollo, notas internas visibles ni datos sensibles en frontend.

#### Captura de referencia

<!-- PDF fuente: página 11 -->

### Evidencia visual histórica - página 11

> La captura o composición visual permanece disponible en el PDF original, página 11.

<!-- PDF fuente: página 12 -->

### Nuevo registro agregado E-002 - Drag and drop de imagenes de producto no funciona

| Campo | Detalle |
|---|---|
| Tipo | Error funcional / carga de imagenes |
| Seccion | Admin de tienda - Productos - Crear/editar producto - Imagenes del<br>producto |
| Prioridad | Media |
| Estado | Nuevo |
| Captura | Adjunta en esta pagina |

#### Descripcion del problema

En la zona de imagenes del producto el panel muestra el texto "Arrastra imagenes aqui o selecciona archivos", pero actualmente la accion de arrastrar y soltar fotos no funciona. El texto promete una funcionalidad que no se cumple.

#### Comportamiento esperado

Debe funcionar el drag and drop para subir imagenes del producto desde el area principal. Al soltar una o varias fotos, deben cargarse en los espacios disponibles respetando el limite de 4 imagenes, donde la primera imagen sea la portada.

#### Detalles recomendados

Permitir soltar imagenes en el area grande y, si es posible, tambien sobre cada tarjeta Foto 1, Foto 2, Foto 3 y Foto 4 para reemplazar o llenar ese espacio. Validar tipos de archivo, limite de cantidad, estados de carga y errores visibles para el admin. Mantener el boton manual de subir nueva foto.

#### Nota para Codex

Corregir solo la funcionalidad de arrastrar/subir imagenes y mantener el diseno actual. Verificar en PC y movil. No romper la optimizacion WebP ni la regla de 4 fotos. Incluir la regla global de produccion/F12: no dejar comentarios, TODOs, logs de desarrollo, notas internas visibles ni datos sensibles en frontend.

#### Captura de referencia

<!-- PDF fuente: página 13 -->

### Nuevo registro agregado

#### M-005 - Cambiar paginacion del listado de productos a 10 por pagina

| Campo | Detalle |
|---|---|
| Tipo | Mejora funcional / UX |
| Seccion | Admin de tienda -> Productos -> listado de productos |
| Prioridad | Baja / Media |
| Estado | Nuevo |
| Captura | Adjunta en esta pagina |

#### Descripcion de la mejora solicitada

En el listado de productos del panel admin actualmente se muestran 7 productos por pagina. El usuario solicita que la paginacion muestre 10 productos por pagina.

#### Comportamiento esperado

El pie del listado debe indicar algo como "Mostrando 1 a 10 de X productos" cuando existan al menos 10 productos. La segunda pagina debe mostrar los productos restantes. Mantener los botones Anterior, numero de pagina y Siguiente.

#### Alcance

Aplicar el cambio al listado de productos. No modificar otros listados del admin a menos que usen una constante compartida y sea intencional. Confirmar que la vista se mantiene ordenada en PC y movil.

#### Notas para Codex

Buscar la constante o variable de paginacion del listado de productos (por ejemplo pageSize, itemsPerPage o productsPerPage) y cambiarla de 7 a 10. Mantener filtros, busqueda, conteo total y paginacion funcionando. Incluir regla global produccion/F12: no dejar comentarios, TODOs, logs de desarrollo, notas internas visibles ni datos sensibles en frontend.

#### Captura de referencia

<!-- PDF fuente: página 14 -->

### Evidencia visual histórica - página 14

> La captura o composición visual permanece disponible en el PDF original, página 14.

<!-- PDF fuente: página 15 -->

### Nuevo registro agregado

#### M-006 - Landing QR / Pagina de enlaces configurable por tienda

| Campo | Detalle |
|---|---|
| Tipo | Mejora nueva / funcion estrategica |
| Seccion | Admin de tienda -> Ajustes -> nueva seccion Landing QR / Pagina de<br>enlaces |
| Pagina publica | /t/[storeSlug]/links o ruta equivalente fija por tienda |
| Prioridad | Alta como mejora futura importante |
| Estado | Idea aprobada para futura implementacion |
| Imagen | Mockup conceptual adjunto en la siguiente pagina |

#### Objetivo

Crear una landing page tipo link hub para cada tienda publica. El QR pegado en productos fisicos, bolsas, etiquetas o tarjetas debe apuntar a una URL fija de la tienda. Desde esa pagina el cliente puede entrar a la tienda online, WhatsApp, grupo de WhatsApp, redes sociales, ofertas, ubicacion, horarios, app o enlaces personalizados.

#### Idea clave

El QR no debe cambiar aunque cambien los enlaces. El QR apunta a una ruta fija por tienda y el admin modifica los botones desde el panel. Asi no hay que volver a imprimir etiquetas cada vez que cambie un grupo, telefono, red social o promocion.

#### Configuracion en admin

Agregar una seccion independiente en Ajustes de tienda llamada Landing QR o Pagina de enlaces. Debe permitir activar/desactivar la landing, editar titulo, descripcion, logo/imagen, botones, redes, links personalizados, orden con flechas, estado visible/oculto, vista previa movil y descarga del QR.

#### Botones sugeridos

Ver tienda online, Escribenos por WhatsApp, Unete al grupo de WhatsApp, Instagram, Facebook, TikTok, Ofertas del dia, Ubicacion y horarios, Descargar app, catalogo PDF o enlace personalizado.

#### Reglas importantes

Debe ser por tienda y respetar aislamiento multi-tienda. No mezclarlo con footer publico ni con marketing visual actual; debe ser una seccion propia. La pagina publica debe ser rapida, mobile-first, clara y con estilo premium blanco/azul. Debe mantener el nombre, logo y branding de cada tienda.

#### Futuro opcional

Agregar analiticas del QR: visitas totales, clics por boton, clics a WhatsApp, clics al grupo, clics a tienda, fecha de escaneo y rendimiento por tienda.

#### Nota para prompt de Codex

Cuando se pida implementar, incluir la regla global de produccion/F12: no dejar comentarios HTML internos, versiones, TODO, textos Codex/debug, console.log/info/warn de desarrollo, notas internas visibles en DOM, source maps publicos ni datos sensibles en frontend.

<!-- PDF fuente: página 16 -->

### Mockup conceptual aprobado - Landing QR / Pagina de enlaces

Referencia visual de la idea: producto fisico con QR, landing movil para clientes y configuracion desde admin.

Imagen conceptual para orientar la implementacion. Los textos finales, rutas y botones deben tomarse de la configuracion real de cada tienda.

<!-- PDF fuente: página 17 -->

### Nuevo registro agregado

#### M-007 - Tooltip con valor exacto en grafico de visitas

| Campo | Detalle |
|---|---|
| Tipo | Mejora funcional / usabilidad |
| Seccion | Admin de tienda -> Analiticas -> Grafico de visitas |
| Prioridad | Media |
| Estado | Nuevo |
| Captura | Adjunta en esta pagina |

#### Descripcion de la mejora solicitada

En el grafico de analiticas de visitas del panel admin, cuando el usuario coloque el cursor sobre un punto de la linea, debe mostrarse el valor exacto de ese punto.

#### Comportamiento esperado

Al pasar el mouse o tocar un punto del grafico, debe aparecer un tooltip claro con la fecha y el valor exacto. Ejemplo: "30 jun - 28 visitas". En movil debe funcionar con tap o interaccion equivalente.

#### Recomendacion visual

El tooltip debe ser pequeno, legible y premium, sin tapar demasiado el grafico. Debe seguir el estilo blanco/azul del admin, con sombra suave y borde redondeado. El punto activo puede resaltarse ligeramente mientras el tooltip este visible.

#### Reglas funcionales

No cambiar el calculo de visitas ni los datos del grafico. Solo agregar la interaccion para consultar valores exactos. Mantener compatibilidad en PC y movil.

#### Nota para prompt de Codex

Incluir la regla global de produccion/F12: no dejar comentarios HTML internos, versiones, TODO, textos Codex/debug, console.log/info/warn de desarrollo, notas internas visibles en DOM, source maps publicos ni datos sensibles en frontend.

#### Captura de referencia

<!-- PDF fuente: página 18 -->

Referencia: grafico de visitas con puntos visibles; se solicita mostrar valor exacto al colocar el cursor o tocar el punto.

<!-- PDF fuente: página 19 -->

### Nuevo registro agregado

#### E-003 - Boton Nuevo Municipio duplicado y estado incorrecto al abrir panel

| Campo | Detalle |
|---|---|
| Tipo | Error visual / usabilidad |
| Seccion | Admin de tienda -> Envios -> Encabezado / panel de municipios |
| Prioridad | Media |
| Estado | Nuevo |
| Capturas | Adjuntas en esta pagina |

#### Descripcion del problema

En la seccion Envios del panel admin, el boton para agregar municipio aparece duplicado o mezclado. En estado cerrado se ve repetido como "Nuevo Municipio Nuevo Municipio" y, cuando se abre el panel, el boton combina "Nuevo Municipio" con "Cerrar panel".

#### Comportamiento esperado

Cuando el panel este cerrado, debe mostrarse un unico boton claro: "+ Nuevo Municipio". Cuando el panel este abierto, el boton debe cambiar y mostrar solamente "Cerrar panel", sin el texto "Nuevo Municipio" ni icono de agregar.

#### Recomendacion visual

Mantener un solo boton primario en el encabezado. Evitar textos duplicados, desbordes y combinaciones de estados. El boton debe conservar el estilo azul premium actual, con espaciado correcto junto a la campanita.

#### Reglas funcionales

No cambiar la logica de municipios ni zonas de envio. Solo corregir el estado visual/textual del boton y la apertura/cierre del panel. Verificar en PC y movil.

#### Nota para prompt de Codex

Incluir la regla global de produccion/F12: no dejar comentarios HTML internos, versiones, TODO, textos Codex/debug, console.log/info/warn de desarrollo, notas internas visibles en DOM, source maps publicos ni datos sensibles en frontend.

#### Capturas de referencia

Estado cerrado: el boton muestra texto duplicado. Estado abierto: debe decir solo "Cerrar panel".

<!-- PDF fuente: página 20 -->

### Nuevo registro agregado M-008 - Mejorar velocidad percibida al cambiar entre secciones del admin

| Campo | Detalle |
|---|---|
| Tipo | Mejora de rendimiento / experiencia visual |
| Sección | Admin de tienda fi navegación entre secciones |
| Prioridad | Media |
| Estado | Nuevo |
| Captura | No necesaria / comportamiento de navegación |

#### Descripción de la mejora

Al cambiar entre secciones del panel admin, por ejemplo de Regalos a Productos, se percibe una recarga de aproximadamente 1 segundo antes de mostrar el contenido. Esto ocurre porque cada sección se carga como una página y luego consulta sus datos.

#### Comportamiento esperado

El cambio entre secciones debe sentirse más rápido y profesional. Si la carga tarda, debe mostrarse un estado visual limpio dentro del área de contenido, sin sensación de pantalla vacía o salto brusco.

#### Recomendaciones técnicas

Agregar prefetch en enlaces principales del admin, skeleton/loading premium por sección, cache temporal en sessionStorage para mostrar datos recientes al volver a una pantalla y actualización en segundo plano. En Productos, priorizar carga inicial ligera y completar detalles después si aplica.

#### Alcance

No se pide convertir todo el admin en SPA en esta etapa. La mejora debe respetar el layout actual, sidebar global, barra superior móvil y barra inferior móvil fija. El objetivo es mejorar la velocidad percibida sin romper la navegación existente.

#### Nota para prompt de Codex

Aplicar también la regla global de protección producción/F12: no dejar comentarios HTML internos, versiones, TODO, textos Codex/debug, console.log/info/warn de desarrollo, notas internas visibles en DOM, source maps públicos ni datos sensibles en frontend.

Resultado esperado: navegación entre Regalos, Productos, Envíos, Pedidos y Ajustes más fluida, con carga visual controlada y menor sensación de recarga.

<!-- PDF fuente: página 21 -->

### Nuevo registro agregado M-009 - Optimizar Detalle de ganancias y lista de ganancia por pedido

| Campo | Detalle |
|---|---|
| Tipo | Mejora visual / usabilidad / paginacion |
| Seccion | Admin de tienda -> Resumen / Ganancias -> Detalle de ganancias |
| Prioridad | Media |
| Estado | Nuevo |
| Captura | Adjunta en esta pagina |

#### Descripcion de la mejora solicitada

En la pantalla Detalle de ganancias del panel admin, el resumen de rentabilidad esta ocupando espacio con el dato Margen promedio y la seccion Ganancia por pedido se muestra en formato vertical, lo que desperdicia mucho espacio y hace mas lenta la revision de pedidos.

#### Cambios solicitados

1) Quitar Margen promedio del resumen superior. 2) Convertir Ganancia por pedido en una lista horizontal compacta para ahorrar espacio vertical. 3) Agregar paginacion de 10 pedidos por pagina.

#### Comportamiento esperado

La lista de Ganancia por pedido debe mostrar cada orden en una fila horizontal o tarjeta compacta con datos principales: pedido, cliente/fecha/estado, venta productos, costo, ganancia, margen y accion Ver pedido. El pie debe indicar rangos de 10, por ejemplo: Mostrando 1 a 10 de X pedidos.

#### Notas de implementacion

Mantener los filtros de periodo actuales: 7 dias, 15 dias, 1 mes, 3 meses y De por vida. No cambiar la formula de calculo de ganancia; solo ajustar presentacion, quitar el margen promedio superior y paginar la lista. Verificar PC y movil. En movil puede adaptarse a tarjetas compactas, pero sin volver a una vista excesivamente vertical.

#### Regla global de produccion/F12

No dejar comentarios HTML internos, versiones, TODOs, textos Codex/debug, console.log/info/warn de desarrollo, notas internas visibles en DOM, source maps publicos ni datos sensibles en frontend.

#### Captura de referencia

<!-- PDF fuente: página 22 -->

### Nuevo registro agregado M-010 - Video opcional optimizado por producto con carga bajo demanda

| Campo | Detalle |
|---|---|
| Tipo | Mejora funcional / rendimiento / venta visual |
| Seccion | Admin de tienda -> Productos -> Editar producto / Tienda publica -><br>Detalle de producto |
| Prioridad | Media |
| Estado | Nuevo |
| Captura | No aplica por ahora - mejora conceptual aprobada |

#### Regla clave: por la conexion lenta de Cuba, el video NO debe cargarse automaticamente. Primero debe mostrarse una portada WebP ligera y el archivo real debe cargarse solo cuando el cliente toque "Ver video del producto".

#### Descripcion de la mejora

Agregar un video opcional en el cuerpo del producto publico para mostrar el producto girando, destapandose o demostrando textura/tamano real. Esta mejora debe ayudar a vender, pero sin afectar la velocidad de la tienda publica.

#### Comportamiento esperado en la tienda publica

Si el producto tiene video, mostrar una tarjeta o miniatura con portada WebP y boton "Ver video del producto". El video debe cargarse solo despues del toque/clic. Si el producto no tiene video, la pagina debe seguir igual. No mostrar videos en catalogo, categorias, destacados ni listados; solo en el detalle del producto.

#### Configuracion en admin

En Editar producto agregar bloque "Video del producto" con: subir/cambiar video, borrar video, activar/desactivar, portada del video opcional o generada desde imagen, recomendaciones de peso y duracion, y validaciones claras antes de guardar.

#### Reglas de optimizacion

Formato recomendado: MP4 comprimido como principal y WebM opcional. Peso ideal 1 MB a 3 MB; maximo permitido recomendado 5 MB. Duracion ideal 5 a 8 segundos. Sin audio. Resolucion sugerida 480x480 o 540x540; maximo 720x720. Usar lazy load/carga bajo demanda, playsinline en movil y controles solo cuando el cliente decida verlo.

#### Notas de implementacion

No romper el carrusel actual de fotos ni la estructura publica del producto. Mantener compatibilidad PC/movil. Priorizar rendimiento, ahorro de datos y carga rapida para Cuba. Aplicar la regla global de produccion/F12: no dejar comentarios, TODOs, logs de desarrollo, notas internas visibles ni datos sensibles en frontend.

<!-- PDF fuente: página 23 -->

### Nuevo registro agregado M-011 - Optimizar Landing QR admin con vista previa y QR bajo demanda

| Campo | Detalle |
|---|---|
| Tipo | Mejora de rendimiento, UX y estabilidad visual |
| Sección | Admin de tienda -> Ajustes de tienda -> Landing QR |
| Prioridad | Alta |
| Estado | Pendiente para continuar en nuevo chat |
| Captura | No obligatoria para este ajuste |

#### Contexto actual

Tras corregir el problema fuerte de layout móvil en Landing QR admin, se identificó que la sección todavía puede sentirse más pesada que otras áreas de Ajustes porque carga de entrada la vista previa tipo teléfono y el bloque visual del QR. Objetivo

Cargar más rápido y con mayor estabilidad: al abrir Landing QR deben mostrarse solo los elementos necesarios para editar. La vista previa y el QR se deben abrir únicamente cuando el admin los solicite. Comportamiento esperado

Vista previa cerrada por defecto con botón “Ver vista previa”. QR cerrado por defecto con botón “Ver QR para imprimir”. Al abrirse, cada bloque debe mostrarse como tarjeta expandible o panel compacto; al cerrarse no debe seguir actualizándose de forma pesada. Regla técnica clave

No basta ocultar con display:none. Para mejorar la velocidad percibida, estos bloques deben renderizarse o inicializarse bajo demanda: no cargar imagen del QR, teléfono preview, botones duplicados ni QR visual hasta que el admin toque el botón correspondiente.

#### Requisitos para Codex

| Campo | Detalle |
|---|---|
| # | Detalle |
| 1 | Mantener Landing QR como contenido normal dentro de Ajustes; no tocar barras globales ni crear layout<br>propio. |
| 2 | Vista previa cerrada por defecto: botón “Ver vista previa” / “Ocultar vista previa”. |
| 3 | QR cerrado por defecto: botón “Ver QR para imprimir” / “Ocultar QR”. |
| 4 | URL fija, Abrir página y Copiar URL deben seguir visibles sin abrir el QR. |
| 5 | En móvil, los bloques deben ser expandibles y no ocupar espacio vertical hasta ser solicitados. |
| 6 | No tocar página pública /t/[storeSlug]/links, endpoints QR, tracking, métricas ni guardado. |
| 7 | No usar display:none como única optimización; renderizar o cargar bajo demanda. |

#### Notas de continuidad para nuevo chat

- El problema de menús móviles se resolvió reconstruyendo/limpiando LandingQrSettings; no volver a tocar AdminSidebar ni barras globales para este punto.

- El siguiente prompt debe enfocarse solo en optimización de carga: preview y QR bajo demanda dentro del admin Landing QR.

- Mantener regla producción/F12: sin comentarios internos visibles, TODO, logs de desarrollo, textos Codex/debug, source maps públicos ni datos sensibles en frontend.

<!-- PDF fuente: página 24 -->

### Bitacora de errores y mejoras - PowerZona / Tu Senda 84 Cierre de registro M-011

Documento interno de trabajo. No incluir datos sensibles ni notas visibles de produccion.

**M-011 · COMPLETADO EN SOURCE V31 · PRIORIDAD ALTA**

| Campo | Detalle |
|---|---|
| Tipo | Mejora de rendimiento, UX y estabilidad visual |
| Seccion | Admin de tienda -> Ajustes de tienda -> Landing QR |
| Estado anterior | Pendiente para continuar en nuevo chat |
| Estado actualizado | Completado en source V31 y listo para validacion final en staging |
| Fecha de cierre | 04 de julio de 2026 |

#### Resultado implementado

- La vista previa movil queda cerrada por defecto y se monta solo al tocar Ver vista previa.

- El QR queda cerrado por defecto y no se crea ningun img del QR en el HTML inicial.

- La URL fija, Abrir pagina, Copiar URL y Ver analiticas se mantienen visibles desde el inicio.

- La imagen destacada del editor se muestra como miniatura compacta y no como imagen grande.

- Se agrego control para evitar el flash de Ajustes generales al recargar estando en Landing QR.

- No se tocaron la landing publica, endpoints QR, tracking, metricas, AdminSidebar ni barras globales.

#### Validacion tecnica realizada sobre V31

| Campo | Detalle |
|---|---|
| Revision de cambios<br>V30 -> V31 | Solo cambian archivos fuente esperados: LandingQrSettings.astro y store-settings.astro. En<br>el ZIP tambien aparecen archivos runtime/generados: pb_data y .astro/types.d.ts, que no<br>deben formar parte del commit si Git los muestra. |
| Build frontend | npm run build completado correctamente en frontend-powerzona. Se mantienen warnings<br>existentes de getStaticPaths en paginas dinamicas, no bloqueantes para este cambio. |
| QR inicial | No queda img data-qr-image ni src a qr.svg/qr.png en el HTML inicial de<br>LandingQrSettings.astro. El QR se crea dentro de mountQr(). |
| Preview inicial | No queda data-preview-screen ni markup de telefono en el HTML inicial. El telefono se crea<br>dentro de mountPreview(). |
| Recarga Landing QR | Se agrego clase pz-settings-resolving para ocultar el panel hasta resolver hash/seccion<br>activa y evitar mostrar Ajustes generales primero. |

#### Nota antes de push a staging

En la revision del ZIP puede aparecer ruido por saltos de linea CRLF y archivos generados. Antes del push, confirmar en el repositorio local limpio: npm run build, git diff --check y git status. No subir pb_data, dist, node_modules ni .astro generados.

Regla production/F12: mantener sin comentarios internos visibles, TODO, logs de desarrollo, textos debug, source maps publicos ni datos sensibles en frontend.

<!-- PDF fuente: página 25 -->

### Bitacora de errores y mejoras - PowerZona / Tu Senda 84 Nuevo registro agregado

#### M-012 - Resumen de paginas visitadas en Analiticas

Documento interno de trabajo. No incluir datos sensibles ni notas visibles de produccion.

**M-012 · NUEVO · PRIORIDAD MEDIA**

| Campo | Detalle |
|---|---|
| Tipo | Mejora funcional / analiticas / usabilidad |
| Seccion | Admin de tienda -> Analiticas -> Visitas / Paginas vistas |
| Prioridad | Media |
| Estado | Nuevo / pendiente para implementacion futura |
| Captura | No obligatoria por ahora - mejora conceptual solicitada |

#### Descripcion de la mejora solicitada

En la seccion de Analiticas, dentro de visitas / paginas vistas, agregar un resumen que permita saber que paginas fueron visitadas y cuantas veces se visito cada pagina. El objetivo es que el admin pueda identificar rapidamente las paginas con mas movimiento, productos mas consultados, categorias mas vistas, landing QR, home u otras rutas importantes.

#### Comportamiento esperado

- Agregar un bloque llamado "Paginas mas visitadas" o equivalente funcional dentro de Analiticas.

- Mostrar un ranking de las 10 paginas mas visitadas, ordenadas de mayor a menor por cantidad de vistas.

- Cada fila debe mostrar: posicion, nombre o tipo de pagina si se puede resolver, ruta/URL, y numero total de visitas o paginas vistas.

- El numero visible debe representar claramente la cantidad de veces que esa pagina fue visitada dentro del periodo seleccionado.

- Mantener los filtros de periodo actuales de Analiticas si ya existen, para que el resumen respete el mismo rango de fechas.

- Agregar un boton "Ver resumen general" o "Ver todas las paginas visitadas" para abrir un resumen completo.

#### Resumen general de paginas visitadas

- El boton debe abrir una vista, modal o panel compacto con todas las paginas visitadas, no solo el top 10.

- El resumen general debe permitir revisar mas paginas con paginacion, idealmente 10 por pagina o el patron ya usado en Analiticas.

- Debe mantener orden por visitas de mayor a menor y, si es posible, incluir busqueda por ruta o nombre de pagina.

- No debe cargar datos pesados si el admin no abre el resumen general; preferir carga bajo demanda si la data puede crecer.

#### Reglas funcionales y alcance

- No cambiar la formula principal de visitas ni romper los graficos actuales.

- No tocar Landing QR admin ni landing publica para esta mejora, salvo que las paginas visitadas ya incluyan esas rutas como parte natural de Analiticas.

- Respetar aislamiento multi-tienda: cada admin solo debe ver paginas visitadas de su tienda.

- Usar la fuente de tracking / metricas existente. Si ya se guardan page_path, route, url o tipo de evento, agrupar por esa clave.

- Si no existe page_title, resolver un nombre amigable solo cuando sea seguro; si no, mostrar la ruta limpia.

- Mantener estilo premium blanco/azul, responsive PC/movil y sin afectar sidebar global ni barras moviles fijas.

#### Notas para Codex

Cuando se implemente, revisar primero el source actualizado y ubicar donde se calculan visitas y paginas vistas. Agregar el resumen por paginas visitadas sin duplicar tracking, sin cambiar endpoints existentes si no es necesario y sin afectar metricas actuales. Priorizar carga ligera: top 10 visible y resumen general bajo demanda.

Regla production/F12: no dejar comentarios HTML internos, versiones, TODO, textos Codex/debug, console.log/info/warn de desarrollo, notas internas visibles en DOM, source maps publicos ni datos sensibles en frontend.

<!-- PDF fuente: página 26 -->

### Bitacora de errores y mejoras - PowerZona / Tu Senda 84 Registro completado en local

#### M-013 - Reubicar detalle de ganancias y simplificar Control

Documento interno de trabajo. No incluir datos sensibles ni notas visibles de produccion.

**M-013 · COMPLETADO LOCAL · PRIORIDAD MEDIA**

| Campo | Detalle |
|---|---|
| Tipo | Mejora visual / UX / resumen de ganancias |
| Seccion | Admin de tienda -> Resumen del negocio / Detalle de ganancias |
| Prioridad | Media |
| Estado | Completado en local. Pendiente solo de validacion en staging/production cuando se haga push. |
| Evidencia | Usuario valido en local que el ajuste quedo perfecto. |

#### Cambios implementados

- El boton "Ver detalle de ganancias" fue reubicado dentro de la pestana/tarjeta "Ganancia estimada" del Resumen del negocio.

- La seccion "Ganancia y control" fue renombrada a "Control".

- La descripcion de Control quedo enfocada en operacion: productos, envios, vencimientos y stock, sin mezclar rentabilidad.

- En Detalle de ganancias se quito el KPI superior "Margen promedio".

- Se mantiene el margen individual por pedido dentro de "Ganancia por pedido" cuando existan pedidos.

#### Validacion local registrada

- Resumen del negocio muestra la accion de detalle donde corresponde: Ganancia estimada.

- Control queda como bloque operativo separado de ganancias.

- Detalle de ganancias ya no muestra Margen promedio en el resumen superior.

- No se reportaron roturas visuales en local despues del ajuste.

#### Alcance respetado

No se tocaron formulas de ganancia, calculos de ventas/costos, tracking, analiticas de visitas, Landing QR, AdminSidebar, barras globales, PocketBase ni migraciones. Mantener regla production/F12: sin comentarios internos visibles, TODO, logs de desarrollo, source maps publicos ni datos sensibles en frontend.

#### Nota de cierre

Este registro se marca como completado en local por confirmacion del usuario. No se adjuntan capturas posteriores en esta version; cuando se valide staging/production puede agregarse evidencia final si se desea.

<!-- PDF fuente: página 27 -->

## Registro cerrado M-012 - Resumen de paginas visitadas en Analiticas

#### COMPLETADO LOCAL PRIORIDAD MEDIA

| Campo | Detalle |
|---|---|
| Tipo |  |
| Seccion | Admin de tienda -> Resumen -> Analiticas de visitas -> Paginas vistas |
| Estado | Completado local |
| Validacion |  |

#### Cierre de la mejora

Se implemento el resumen general de paginas visitadas como una pagina independiente. La vista principal del admin queda simple y la pagina de detalle muestra el resumen por periodo con listado paginado.

#### Cambios completados

Boton Ver resumen general en Paginas vistas, sin mostrar Top 10 dentro del Resumen principal.

Nueva pagina Resumen de paginas visitadas con filtros por periodo, metricas superiores y listado completo.

Listado con columnas Pagina, Detalle, Visitas, Ultima visita y Accion.

Ruta oculta por defecto; se muestra bajo demanda con Ver ruta, Copiar ruta y Abrir pagina.

Detalle muestra informacion util: categoria real, producto real, tienda principal o finalizacion del pedido.

Layout PC tipo listado horizontal y layout movil como tarjetas compactas, sin scroll horizontal.

#### Alcance protegido

No se tocaron formulas, tracking publico ni eventos base de store_analytics_events.

No se tocaron Landing QR, metricas Landing QR, endpoints QR, AdminSidebar, barras globales ni PocketBase.

Se mantiene la regla production/F12: sin comentarios internos visibles, TODO, logs de desarrollo, source maps publicos ni datos sensibles en frontend.

#### Validaciones pendientes antes de production

npm run build, git diff --check y git status limpio antes del push. Validar en staging PC y movil: filtros, paginacion, Ver ruta, Copiar ruta y Abrir pagina. Si staging queda correcto, marcar como Production OK en el siguiente cierre.

<!-- PDF fuente: página 28 -->

## Registro cerrado

#### E-004 - Producto oculto/no disponible no deja pagina en blanco

Documento interno de trabajo. No incluir datos sensibles ni notas visibles de produccion.

**E-004 · COMPLETADO EN SOURCE V35 · PRIORIDAD MEDIA**

| Campo | Detalle |
|---|---|
| Tipo | Error funcional / experiencia publica / seguridad visual |
| Seccion | Tienda publica -> Detalle de producto |
| Ruta | /t/[storeSlug]/producto/[slug] y ruta legacy /producto/[slug] |
| Estado | Completado en source V35. Validado por el usuario; pendiente de staging / production si<br>aplica. |
| Fecha de cierre | 04 de julio de 2026 |

#### Cierre de la mejora

Se implemento una pantalla publica controlada para cuando un producto no puede mostrarse al cliente. El enlace directo ya no queda en blanco: muestra la tarjeta "Producto no disponible", permite volver a la tienda y redirige automaticamente al catalogo de la tienda.

#### Cambios completados

- Fallback publico para producto oculto/no visible, eliminado, inexistente, de otra tienda o con slug invalido.

- Tarjeta con titulo "Producto no disponible", texto claro, boton "Volver a la tienda" y redireccion automatica en pocos segundos.

- No se muestran datos del producto oculto: foto, precio, descripcion, stock, categoria, variaciones, resenas, relacionados ni IDs internos.

- SEO seguro para fallback: titulo generico, tipo website, canonical hacia la tienda y sin product price del producto oculto.

- Productos visibles conservan su detalle normal, preview/SEO, compra, variaciones, resenas, relacionados y tracking normal.

- La solucion se centro en frontend-powerzona/src/pages/producto/[slug].astro; la ruta /t/[storeSlug]/producto/[slug] reutiliza esa base.

#### Alcance protegido

- No se tocaron checkout, carrito, inventario, pedidos, descuentos de stock ni admin.

- No se tocaron PocketBase, migraciones, reglas de colecciones ni Landing QR.

- Se mantuvo aislamiento por tienda: un producto de otra tienda cae en fallback y no revela informacion.

- Se mantiene la regla production/F12: sin comentarios internos visibles, TODO, logs de desarrollo, source maps publicos ni datos sensibles en frontend.

<!-- PDF fuente: página 29 -->

#### Validaciones pendientes antes de production

- Ejecutar npm run build, git diff --check y git status limpio antes del push.

- Validar en staging: producto visible, producto oculto, slug inventado, producto eliminado y producto de otra tienda.

- Confirmar que el boton vuelve a /t/[storeSlug] y que la redireccion automatica no muestra pantalla blanca.

- Si staging queda correcto, marcar este registro como Production OK en el siguiente cierre.

#### Nota de cierre

El registro queda cerrado como completado en source V35 por confirmacion del usuario. No se adjuntan capturas en esta version; puede agregarse evidencia final al validar staging o production.

<!-- PDF fuente: página 30 -->

## Bitacora de Errores y Mejoras - PowerZona / Tu Senda 84 Pagina 30 Registro cerrado

### E-005 - Reseñas por producto, branding de tienda y mensaje WhatsApp

Documento interno de trabajo. No incluir datos sensibles ni notas visibles de produccion.

**E-005 · COMPLETADO LOCAL · PRIORIDAD MEDIA**

| Campo | Detalle |
|---|---|
| Tipo | Error funcional / experiencia publica / branding / WhatsApp |
| Seccion | Tienda publica -> Review de orden; Admin pedidos -> solicitud de<br>reseña |
| Ruta | /t/[storeSlug]/review/order/[token] |
| Estado | Completado en source actualizado. Validado visualmente por el usuario;<br>pendiente de staging / production si aplica. |
| Fecha de cierre | 05 de julio de 2026 |

#### Cierre de la mejora

Se corrigio el flujo publico de reseñas por orden: la reseña general se mantiene funcional y los productos recibidos ahora pueden calificarse individualmente con comentario opcional. Tambien se corrigio el branding por tienda en la cabecera, el mensaje de WhatsApp y el preview del enlace.

#### Cambios completados

Productos recibidos en tarjetas limpias con imagen, nombre, estrellas clickeables y comentario opcional por producto.

Cabecera de la pagina de reseña con logo real de tienda; fallback solo con iniciales dinamicas si no existe logo.

Mensaje de WhatsApp corregido para evitar caracteres corruptos y firmar con la tienda correspondiente.

Preview/meta del link de reseña preparado para usar nombre e imagen de la tienda, no branding fijo de Tu Senda 84.

Se retiro el boton/accion de prueba interna antes de staging y se mantiene la regla real de minimo 1 dia para clientes.

<!-- PDF fuente: página 31 -->

## Alcance protegido y validaciones

#### Alcance protegido

No se tocaron checkout, carrito, inventario, descuentos de stock ni creacion de pedidos.

No se tocaron PocketBase, migraciones, reglas de colecciones ni Landing QR.

Se mantuvo aislamiento por tienda: nombre, logo, link, mensaje y preview se resuelven segun la tienda dueña de la orden.

Se mantiene la regla production/F12: sin comentarios internos visibles, TODO, logs de desarrollo, source maps publicos ni datos sensibles en frontend.

#### Validacion local registrada

La pagina publica de reseña muestra el logo de PowerZona en la cabecera y conserva la reseña general de tienda.

La seccion Productos recibidos muestra tarjeta limpia por producto con imagen, estrellas y comentario opcional.

El boton de prueba interna fue retirado antes del push a staging.

El mensaje de WhatsApp queda con tienda dinamica y sin caracteres corruptos.

El preview del enlace queda preparado para mostrar branding por tienda. Para validarlo en WhatsApp se recomienda usar orden o link nuevo por cache.

#### Pendiente antes de production

Ejecutar npm run build, git diff --check y git status limpio antes del push.

Validar en staging: reseña general, reseña por producto, mensaje WhatsApp, preview por tienda y ausencia de boton de prueba.

Si staging queda correcto, pasar a main/production y marcar Production OK en el siguiente cierre si se desea.

<!-- PDF fuente: página 32 -->

## Evidencia visual

#### Referencia validada por el usuario

Captura aprobada: pagina publica de reseña con logo de PowerZona, reseña general y producto recibido dentro de una tarjeta con estrellas y comentario opcional.

<!-- PDF fuente: página 33 -->

## Bitacora de Errores y Mejoras - PowerZona / Tu Senda 84 Pagina 33 Registro cerrado

### E-006 - Telefono WhatsApp: selector de pais, normalizacion y mensajes visibles

Documento interno de trabajo. No incluir datos sensibles ni notas visibles de produccion.

**E-006 · COMPLETADO LOCAL · PRIORIDAD MEDIA/ALTA**

| Campo | Detalle |
|---|---|
| Tipo | Error funcional / UX / WhatsApp / checkout |
| Seccion | Tienda publica -> Checkout; Admin pedidos -> Contactar cliente y solicitud de resena |
| Ruta | /checkout, /t/[storeSlug]/checkout y Admin pedidos |
| Estado | Completado en source actualizado. Validado por el usuario; pendiente de staging /<br>production si aplica. |
| Fecha de cierre | 05 de julio de 2026 |

### Cierre de la mejora

Se cerro el ajuste E-006 para evitar que WhatsApp falle por telefonos incompletos o mal formateados. El checkout ahora guia al cliente con un selector de pais y valida el numero antes de crear la orden. Ademas, los botones del admin quedan protegidos para ordenes nuevas y viejas.

#### Cambios completados

Selector delante del telefono en checkout: CUB +53 por defecto, EE.UU +1 y Otro / Internacional.

Validacion y normalizacion antes de crear la orden: Cuba acepta 8 digitos o 53 + 8; EE.UU acepta 10 digitos o 1 + 10; Otro acepta 8 a 15 digitos con codigo de pais.

customer_phone se guarda solo con numeros, sin signo +, espacios ni simbolos; los enlaces wa.me usan solo numeros.

Los botones de admin Contactar cliente y Pedir/Reenviar resena normalizan el telefono antes de abrir WhatsApp.

Si el telefono es invalido en admin, no se abre WhatsApp y no se actualiza review_requested_at ni conteos de solicitud de resena.

UX corregida: cuando el numero bloquea Realizar Pedido, el cliente ve un error dinamico debajo del campo segun el selector elegido.

### Mensajes visibles agregados

El checkout muestra ayuda normal cuando el campo esta vacio o correcto, y muestra error claro cuando el numero escrito no coincide con CUB +53, EE.UU +1 u Otro. Al corregir el numero, el error desaparece sin recargar la pagina.

<!-- PDF fuente: página 34 -->

## Bitacora de Errores y Mejoras - PowerZona / Tu Senda 84 Pagina 34 Alcance protegido y validaciones

#### E-006 - Telefono WhatsApp: selector de pais, normalizacion y mensajes visibles

Documento interno de trabajo. No incluir datos sensibles ni notas visibles de produccion.

#### Alcance protegido

No se tocaron inventario, stock, descuentos de stock, order_items, promociones, cupones, regalos ni creacion base de pedidos.

No se tocaron PocketBase, migraciones, reglas de colecciones, Landing QR, analiticas, metricas, AdminSidebar ni barras globales.

Se mantuvo el flujo aprobado del checkout: primer clic crea orden pendiente; segundo clic abre WhatsApp y limpia/cierra checkout.

Se mantuvo la regla real de resenas de minimo 1 dia y no se reintrodujo boton interno de prueba.

Se mantiene la regla production/F12: sin comentarios internos visibles, TODO, logs de desarrollo, source maps publicos ni datos sensibles en frontend.

#### Validacion local registrada

CUB +53: numeros de 8 digitos se guardan como 53 + numero; numeros demasiado cortos o largos muestran error y bloquean Realizar Pedido.

Cambio de selector: si un numero valido para Cuba deja de ser valido al cambiar a EE.UU, el error aparece inmediatamente debajo del campo.

EE.UU +1: numeros de 10 digitos se guardan como 1 + numero; formatos con +1 tambien quedan normalizados.

Otro / Internacional: numeros completos con codigo de pais se guardan limpios; valores demasiado cortos muestran error.

Admin pedidos: una orden vieja con telefono local cubano se convierte correctamente para wa.me antes de Contactar cliente o Pedir resena.

El error visible desaparece al corregir el telefono sin recargar la pagina.

#### Pendiente antes de production

Ejecutar npm run build, git diff --check y git status limpio antes del push.

Validar en staging PC y movil: selector CUB, EE.UU, Otro, mensajes de error, creacion de orden y segundo paso de WhatsApp.

Validar en staging los botones Contactar cliente y Pedir/Reenviar resena con telefonos cubanos, de EE.UU, internacionales e invalidos.

Si staging queda correcto, pasar a main/production y marcar Production OK en el siguiente cierre si se desea.

### Nota de cierre

El registro queda cerrado como completado local por confirmacion del usuario. Puede agregarse evidencia final de staging/production en una proxima version de la bitacora.

<!-- PDF fuente: página 35 -->

## Registro actualizado

### E-007 - Notificacion interna cuando entra una resena pendiente

Documento interno de trabajo. No incluir datos sensibles ni notas visibles de produccion.

**E-007 · PROMPT LISTO · PRIORIDAD MEDIA/ALTA**

| Campo | Detalle |
|---|---|
| Tipo | Error funcional / UX / notificaciones / resenas |
| Seccion | Tienda publica -> Resenas; Admin -> Campana de notificaciones |
| Ruta | /t/[storeSlug]/review/order/[token], home publica, detalle de producto y Admin ajustes de rating |
| Estado | Etapa de analisis y prompt completada. Pendiente de implementacion por Codex y validacion en<br>source. |
| Fecha de registro | 06 de julio de 2026 |

### Cierre de la etapa de definicion

Queda definido el alcance para que cada resena pendiente genere una notificacion interna segura en store_notifications. No se marca como completado en source hasta recibir reporte de Codex, build correcto y validacion local/staging.

### Alcance definido

- Crear notificacion tipo review_pending cuando se guarden resenas con status="pending".

- Agrupar en una sola notificacion las resenas enviadas desde el link de orden, aunque incluya tienda y varios productos.

- Crear notificacion individual para resenas publicas de tienda y de producto.

- Respetar notifications_enabled y notify_review_pending antes de crear avisos.

- Agregar switch visible "Nueva resena pendiente" dentro de Ajustes -> Notificaciones del admin.

- Al tocar Abrir, llevar a store-settings#rating-pending para revisar pendientes.

<!-- PDF fuente: página 36 -->

### Alcance protegido

- No tocar checkout, carrito, inventario, descuentos de stock, order_items, promociones, cupones ni regalos.

- No tocar Landing QR, analiticas/tracking publico, reglas PocketBase ni migraciones si no son estrictamente necesarias.

- Si falla la notificacion, la resena del cliente debe terminar igual y nunca bloquear el mensaje de gracias.

- Mantener aislamiento por tienda y no mostrar datos sensibles en campana, toast ni notificaciones visibles.

Pendiente para cerrar como completado real: aplicar prompt en Codex, revisar archivos tocados, ejecutar npm run build, git diff

- -check, git status y validar reseñas de orden, tienda y producto.

<!-- PDF fuente: página 37 -->

## Registro actualizado

### M-014 - Notificaciones en vivo del admin con la web abierta

Documento interno de trabajo. No incluir datos sensibles ni notas visibles de produccion.

**M-014 · FASE 1 DEFINIDA · PRIORIDAD MEDIA/ALTA**

| Campo | Detalle |
|---|---|
| Tipo | Mejora funcional / UX / notificaciones en vivo |
| Seccion | Admin -> Campana de notificaciones / AdminSidebar |
| Alcance | Fase 1 solamente: avisos mientras el panel admin esta abierto. |
| Estado | Etapa de analisis y prompt completada. Pendiente de implementacion por Codex y validacion en<br>source. |
| Fecha de registro | 06 de julio de 2026 |

### Cierre de la etapa de definicion

Queda definido implementar notificaciones en vivo usando realtime sobre store_notifications mientras el admin tenga abierto el panel. La fase 2 de push real con web cerrada queda fuera de este alcance y se hablara aparte antes de implementarla.

### Alcance definido para fase 1

- Suscripcion realtime a store_notifications filtrada por la tienda activa.

- Actualizar contador de campana y listado sin recargar cuando llegue una notificacion nueva.

- Mostrar toast interno con texto corto y seguro.

- Actualizar titulo de pestana con contador de unread y restaurarlo cuando no existan pendientes.

- Permitir activar avisos del navegador con Notification API solo mientras la web esta abierta.

- Mantener polling actual cada 30 segundos como respaldo si realtime falla.

<!-- PDF fuente: página 38 -->

### Fuera de alcance - fase 2 no implementada

- No crear Service Worker, PWA, VAPID, Push API con web cerrada ni colecciones de suscripciones push.

- No tocar manifest, workers ni endpoints push.

- No mostrar telefonos, direcciones, importes ni datos sensibles en notificaciones del navegador.

- No romper sidebar global, barra superior movil ni barra inferior movil fija.

Pendiente para cerrar como completado real: aplicar prompt en Codex, confirmar que no se implemento fase 2, ejecutar npm run build, git diff --check, git status y validar realtime, toast, titulo de pestana, permisos del navegador y ausencia de duplicados.

<!-- PDF fuente: página 39 -->

## Control de continuidad

### E-007 y M-014 - prompts listos para Codex

Documento interno de trabajo. No incluir datos sensibles ni notas visibles de produccion.

**V23 · DEFINICION COMPLETADA · SOURCE PENDIENTE**

### Estado actualizado de estos puntos

| Campo | Detalle |
|---|---|
| E-007 | Prompt listo para crear notificacion interna cuando entra una resena pendiente. Pendiente de<br>implementar y validar. |
| M-014 | Prompt listo para notificaciones en vivo fase 1 con la web admin abierta. Pendiente de<br>implementar y validar. |
| No cerrar aun como | Completado local, completado en source, staging OK o Production OK hasta tener evidencia<br>real. |
| Proxima accion | Pasar los prompts a Codex, revisar reporte, validar source actualizado y luego cerrar cada<br>registro con evidencia. |

### Validaciones que se deben agregar al cierre real

- npm run build completado correctamente en frontend-powerzona.

- git diff --check sin errores.

- git status revisado para no subir pb_data, dist, node_modules ni archivos generados.

- Validacion local PC y movil de resenas pendientes, campana, realtime, toast y notificacion del navegador.

- Validacion staging antes de pasar a main/production.

### Regla production/F12

- No dejar comentarios HTML internos, versiones, TODO, textos Codex/debug, console.log/info/warn de desarrollo, notas internas visibles en DOM, source maps publicos ni datos sensibles en frontend.

- Mantener solo textos funcionales reales para cliente/admin y cualquier observacion tecnica solo en bitacora o documentacion privada.

Nota: se completa la preparacion de los registros, no la implementacion en source. Esto evita cerrar falsamente un punto sin build ni validacion.

<!-- PDF fuente: página 40 -->

## Registro cerrado

### E-011 - Validacion viva del carrito

Documento interno de trabajo. No incluir datos sensibles ni notas visibles de produccion.

**E-011 · COMPLETADO LOCAL · PRIORIDAD ALTA**

| Campo | Detalle |
|---|---|
| Tipo | Error funcional / UX / carrito / checkout / precios y disponibilidad |
| Seccion | Tienda publica -> Carrito / Checkout |
| Ruta | /t/[storeSlug], carrito lateral, /checkout y /t/[storeSlug]/checkout |
| Estado | Completado en local por confirmacion del usuario. Pendiente de<br>validacion en staging / production cuando se haga push. |
| Fecha de cierre local | 06 de julio de 2026 |

### Cierre local de la mejora

Se implemento la validacion viva del carrito para que productos, variaciones, precios, stock y disponibilidad se actualicen contra la tienda real antes de continuar al checkout. El carrito ya no debe confiar solo en la copia guardada en el navegador cuando el admin cambia productos o inventario.

### Cambios completados

- El carrito valida productos contra la tienda antes de continuar al checkout.

- Productos agotados, ocultos, eliminados o con variacion invalida se informan al cliente y no

pasan al pedido.

- Los cambios de precio se actualizan con aviso visible y el total se recalcula con el precio actual.

- Las cantidades mayores al stock actual se ajustan al maximo disponible.

- El checkout ejecuta una defensa final antes de crear la orden y pide revisar si detecta cambios.

- Se mantiene la regla de inventario: orden pendiente no descuenta stock.

### Resultado esperado

El cliente ve cambios importantes antes de comprar: producto agotado, no disponible, variacion agotada, cantidad ajustada o precio actualizado. El checkout no crea orden con productos invalidos, cantidades superiores al stock ni precios viejos.

<!-- PDF fuente: página 41 -->

## Alcance protegido y validaciones

### E-011 - Validacion viva del carrito

Documento interno de trabajo. No incluir datos sensibles ni notas visibles de produccion.

### Alcance protegido

- No tocar reglas PocketBase ni migraciones para este cierre local.

- No alterar descuentos de stock ni la creacion base de pedidos fuera del control de

carrito/checkout.

- No romper promociones, cupones, regalos, ratings, notificaciones, Landing QR, analiticas,

AdminSidebar ni barras moviles.

- Mantener E-008: localStorage manda, sessionStorage no revive productos y carrito vacio

intencional se respeta.

- Mantener E-009: Solo USD se une con USD o moneda 1x1; solo se separa cuando la moneda no

esta 1x1.

### Validacion local registrada

- El usuario confirmo: "Validacion viva del carrito: completado local".

- No marcar staging OK ni Production OK hasta tener evidencia de ambiente.

### Pendiente antes de staging / production

- Ejecutar npm run build dentro de frontend-powerzona.

- Ejecutar git diff --check y revisar git status para no subir pb_data, dist, node_modules ni

generados.

- Validar en staging PC y movil: agotado, oculto/eliminado, variacion agotada, cambio de precio,

cantidad ajustada y defensa final del checkout.

- Validar carrito multi-pestana y monedas USD, EUR/Zelle/Cashapp 1x1 y CUP mixto.

- Si staging queda correcto, pasar a main/production y cerrar como Production OK con evidencia.

### Regla production/F12

- No dejar comentarios HTML internos, versiones, TODO, textos Codex/debug, console.log/info/warn

de desarrollo, notas internas visibles en DOM, source maps publicos ni datos sensibles en frontend.

- Mantener solo textos funcionales reales para cliente/admin y observaciones tecnicas solo en

bitacora o documentacion privada.

Nota: este cierre actualiza la bitacora como completado local por confirmacion del usuario. Staging y production quedan pendientes.

<!-- PDF fuente: página 42 -->

## Registro futuro

### M-015 - APK individual por tienda usando web actual

Documento interno de trabajo. No incluir datos sensibles ni notas visibles de produccion.

**M-015 · IDEA FUTURA · PRIORIDAD MEDIA/ALTA**

| Campo | Detalle |
|---|---|
| Tipo | Mejora futura / app Android / white-label por tienda |
| Seccion | Proyecto Tu Senda 84 -> Apps individuales por tienda |
| Alcance | Fase inicial: APK contenedora usando la web actual |
| Estado | Registrado para futuro; no implementar ahora |
| Fecha de registro | 06 de julio de 2026 |
| Via inicial aprobada | Una APK por tienda que abre su URL fija, por ejemplo /t/[storeSlug]. |

### Objetivo

Registrar como mejora futura la posibilidad de crear una APK individual para cada tienda de Tu Senda 84 usando la web actual como base. La meta inicial no es reconstruir una app nativa desde cero, sino empaquetar la tienda existente en Android con marca propia.

### Idea clave

Un mismo codigo base puede generar apps diferentes por tienda: nombre, icono, color, pantalla inicial, identificador Android y URL de inicio. Ejemplo: PowerZona APK abre directo la tienda /t/powerzona, mientras otra tienda abriria su propio /t/[storeSlug].

### Configuracion futura por tienda

APP_NAME: nombre publico de la app, por ejemplo PowerZona.

STORE_SLUG: slug de la tienda que debe abrir la APK.

APP_LOGO / APP_COLOR: logo, icono, splash y color principal propios de la tienda.

START_URL: URL fija de la tienda en tusenda84.com/t/[storeSlug].

PACKAGE_ID: identificador Android unico por tienda, por ejemplo com.tusenda84.powerzona.

<!-- PDF fuente: página 43 -->

### Alcance recomendado para fase inicial

- APK contenedora basada en la web actual, usando WebView/Capacitor/TWA o tecnologia equivalente a decidir en la fase tecnica.

- Mantener checkout, carrito, pedidos, monedas, reseñas y admin conectados al mismo backend actual.

- Abrir enlaces de WhatsApp de forma correcta hacia la app o navegador externo.

- Mantener una sola base de mantenimiento: las correcciones del sitio benefician tambien a las APK generadas.

### Fuera de alcance por ahora

- No crear app nativa completa desde cero en esta etapa.

- No duplicar catalogo, carrito, checkout ni logica de pedidos dentro de Android.

- No implementar push con la web cerrada hasta hablar una fase separada.

- Si se publica en tiendas oficiales, revisar requisitos vigentes, fichas, politicas y materiales de cada app antes de avanzar.

### Notas para futuro prompt de Codex

- Crear plan tecnico separado antes de implementar: PWA, TWA, Capacitor o WebView segun convenga.

- No tocar flujos actuales de carrito, checkout, inventario, pedidos ni admin hasta aprobar la arquitectura.

- Mantener regla production/F12: sin comentarios internos visibles, TODO, logs de desarrollo, textos debug, source maps publicos ni datos sensibles en frontend.

<!-- PDF fuente: página 44 -->

## Registro actualizado

### M-016 / RIFAS V50 - mejoras completadas, continuidad visual y prompts pendientes de validacion

Documento interno de trabajo. No incluir datos sensibles ni notas visibles de produccion.

**V26 · RIFAS V50 · COMPLETADO LOCAL /<br>PROMPTS LISTOS**

| Campo | Detalle |
|---|---|
| Tipo | Mejora funcional / visual / UX / flujo de rifas |
| Seccion | Admin de tienda -> Promociones -> Rifas; tienda publica -> pagina publica de rifa |
| Estado | Actualizacion de bitacora con avances locales y prompts listos. No marcar Production<br>OK hasta staging/production. |
| Fecha de<br>actualizacion | 08 de julio de 2026 |
| Fuente | Conversacion de trabajo, source V50 reportado por el usuario y capturas locales. |

### Cierre de etapa y continuidad

Se consolida el trabajo reciente del modulo Rifas. La parte funcional avanzo en admin y pagina publica; quedan dos pulidos importantes pendientes de aplicar/validar: el pulido visual exacto del resultado publicado y la fecha destacada con notificacion critica de resultado pendiente.

#### Regla de registro para esta actualizacion

Solo se marca como completado local lo validado por captura, confirmacion del usuario o evidencia visual local.

Los prompts PZ-RIFA-RESULT06 y PZ-RIFA-CHECK02 quedan registrados como prompt listo / pendiente de aplicar y validar.

No se marca nada como staging OK ni Production OK sin npm run build, git diff --check, git status y validacion en ambiente.

<!-- PDF fuente: página 45 -->

## Rifas - Estado de trabajo V50

Resumen de mejoras, prompts e implementaciones relacionadas con rifas.

| ID / Prompt | Mejora | Estado | Nota |
|---|---|---|---|
| PZ-RIFA-ACCESS | Estado visual de acceso en tarjetas:<br>desactivado gris / activado verde. | Definido /<br>pendiente<br>validar | Debe mostrar "Desactivado"<br>sin la palabra Acceso<br>cuando esta apagado. |
| PZ-ADMICON | Sistema global premium de iconos y<br>menu de tres puntos para admin. | Prompt listo | Crear base global y aplicar<br>por fases sin redisenar todo<br>el admin. |
| PZ-RIFA-UNAVAIL<br>ABLE | Quitar botones repetidos dentro de<br>"Rifa no disponible" en pagina<br>publica. | Prompt listo /<br>validar | Mantener botones solo<br>arriba en el hero. |
| PZ-RIFA-WINNERM<br>SG | Mensaje para ganador como bloque<br>desplegable en Configurar rifa. | Prompt listo /<br>validar | Cerrar por defecto para<br>limpiar la tarjeta. |
| PZ-RIFA-PRIZES | Si hay mas de 3 premios, solo<br>Carrusel disponible. | Prompt listo /<br>validar | Admin bloquea Fijo y pagina<br>publica fuerza Carrusel. |
| PZ-RIFA-RESERVE<br>D | Cliente con numero reservado ve<br>vista de espera y no<br>seleccion/formulario. | Prompt listo /<br>validar | Oculta cuadricula y Participa<br>ahora cuando ya existe<br>reserva. |
| PZ-RIFA-RESULT0<br>3/04 | Modo Resultado publicado en pagina<br>publica: ganador/no<br>ganador/visitante. | Completado<br>local inicial | Source V50 muestra logica<br>aplicada, pero visual todavia<br>requiere pulido. |
| PZ-RIFA-RESULT0<br>6 | Pulido visual exacto del resultado<br>publicado + acciones correctas<br>ganador/no ganador. | Prompt listo | Pendiente aplicar/validar:<br>ganador reclama premio, no<br>ganador sin boton<br>WhatsApp. |
| PZ-RIFA-CHECK01 | Admin: flujo seguro "Chequear<br>resultado" antes de publicar. | Completado<br>local inicial | Validado por captura: ya no<br>muestra publicar directo al<br>inicio. |
| PZ-RIFA-CHECK02 | Fecha destacada, bloqueo por fecha<br>y notificacion critica de resultado<br>pendiente. | Prompt listo | Pendiente aplicar/validar:<br>permite cerrar sin ganador<br>aunque no haya<br>participantes. |

#### Alcance protegido en todos los prompts de rifas

No tocar checkout, carrito, pedidos, inventario, resenas, analiticas, reglas PocketBase ni migraciones salvo defensa backend expresamente indicada.

Mantener aislamiento por tienda y textos dinamicos por storeName; no hardcodear PowerZona ni dejar variables literales como {storeName}.

No subir pb_data, dist, node_modules ni .astro generados.

<!-- PDF fuente: página 46 -->

## Evidencia visual - Pagina publica de resultado

Captura V50 del modo resultado publicado. La logica existe, pero la vista queda registrada como mejora visual en curso.

#### Lectura de la evidencia

La pagina ya muestra Resultado publicado, numero ganador, numero del cliente, resumen del comprobante y premios.

Pendiente: hacer que el numero ganador sea el protagonista visual, integrar mejor la tarjeta principal, agregar confeti/fuegos artificiales premium y ajustar acciones por resultado.

Regla final definida: si el cliente es ganador, el boton debe decir "Reclamar mi premio por WhatsApp". Si no es ganador, no debe aparecer boton de WhatsApp abajo ni accion principal de WhatsApp.

<!-- PDF fuente: página 47 -->

## Evidencia visual - Admin Chequear resultado

Captura local del nuevo flujo inicial en Participantes y resultado.

#### Cierre local PZ-RIFA-CHECK01

Se reemplazo la publicacion directa por una tarjeta inicial "Chequear resultado".

Los botones de publicar ya no aparecen desde el inicio; deben mostrarse solo despues de chequear el numero sorteado.

Pendiente PZ-RIFA-CHECK02: destacar la fecha del sorteo, activar el chequeo solo cuando llegue la fecha y crear notificacion critica si el resultado queda pendiente.

#### Regla corregida durante el analisis

El boton Chequear resultado no debe depender de que existan participantes.

Si ya llego la fecha del sorteo y hay 0 participantes, el admin debe poder introducir el numero sorteado y publicar resultado sin ganador para cerrar la rifa.

El backend debe bloquear publicar antes de la fecha aunque alguien intente forzar la accion desde F12.

<!-- PDF fuente: página 48 -->

## Validaciones pendientes antes de staging / production

No cerrar como Production OK hasta completar estas validaciones.

#### Checklist tecnico

- Aplicar y validar PZ-RIFA-RESULT06: resultado publicado premium, numero ganador protagonista, acciones correctas para ganador/no ganador.

- Aplicar y validar PZ-RIFA-CHECK02: fecha destacada, bloqueo por fecha, cierre sin ganador con 0 participantes y notificacion critica sin duplicados.

- Ejecutar npm run build dentro de frontend-powerzona.

- Ejecutar git diff --check.

- Revisar git status para no subir pb_data, dist, node_modules ni .astro generados.

- Validar PC y movil: admin rifas, configuracion, premios, pagina publica no disponible, pagina con reserva, resultado ganador/no ganador y flujo chequear resultado.

- Validar que la notificacion critica no muestre telefonos, comprobantes ni datos sensibles; solo nombre de rifa y accion segura.

#### Regla production/F12

No dejar comentarios HTML internos, versiones, TODO, textos Codex/debug, console.log/info/warn de desarrollo, notas internas visibles en DOM, source maps publicos ni datos sensibles en frontend.

Mantener solo textos funcionales reales para cliente/admin y observaciones tecnicas solo dentro de documentacion privada o bitacora.

#### Nota de cierre v26

Esta version actualiza la bitacora con el estado real de trabajo de Rifas V50. La implementacion final de PZ-RIFA-RESULT06 y PZ-RIFA-CHECK02 queda pendiente de aplicar/validar antes de staging y production.

<!-- PDF fuente: página 49 -->

## REGISTRO IMPORTANTE Actualizacion de bitacora M-017 - Seguridad y control de clientes por tienda

Documento interno de trabajo. No incluir datos sensibles ni notas visibles de produccion.

**V27 · M-017 SEGURIDAD · DEFINICION APROBADA**

| Campo | Detalle |
|---|---|
| Tipo | Mejora estrategica / seguridad / moderacion / control multi-tienda |
| Seccion | Master Admin -> control por tienda; Admin de tienda -> nueva seccion Seguridad |
| Ruta propuesta | /t/[storeSlug]/admin/security |
| Prioridad | Alta |
| Estado | Definicion funcional aprobada. Pendiente de prompt, implementacion y validacion en<br>source. |
| Fecha de registro | 11 de julio de 2026 |
| Source de continuidad | Proyecto actualizado V58 reportado por el usuario como base actual. |

### Objetivo aprobado

Crear un modulo de seguridad configurable por tienda para identificar actividad abusiva, pedidos falsos, spam, reseñas malintencionadas y participaciones irregulares. El sistema debe permitir investigar patrones y bloquear clientes sin romper el aislamiento multi-tienda.

#### Arquitectura general aprobada

- Control Master: el Master Admin activa o desactiva Seguridad por tienda y define las capacidades permitidas.

- Modos por tienda: Desactivado, Solo monitoreo y Proteccion activa.

- Panel de tienda: Resumen, Actividad, Clientes bloqueados y Reglas de proteccion.

- Primera fase: monitoreo y bloqueos manuales; sin decisiones automaticas agresivas.

- Aislamiento: cada store_admin solo puede consultar y bloquear dentro de su propia tienda.

La direccion IP se tratara como una señal de seguridad, no como identidad definitiva del cliente. Varias personas pueden compartir una IP y una misma persona puede cambiarla.

<!-- PDF fuente: página 50 -->

## M-017 - SEGURIDAD Modelo de monitoreo e identificacion

Registrar actividad suficiente para detectar patrones, sin crear un fingerprint invasivo ni exponer informacion sensible.

**Eventos de seguridad<br>• Pedido creado o intento de pedido rechazado.<br>• Reseña enviada, duplicada o marcada como<br>spam.<br>• Reserva o participacion en una rifa.<br>• Limite de acciones superado.<br>• Intento realizado por un cliente bloqueado.<br>• Bloqueo, desbloqueo o cambio de reglas por un<br>admin. · Datos visibles por evento<br>• Tipo de accion, fecha y hora.<br>• Pedido, reseña o rifa relacionada.<br>• IP parcial por defecto.<br>• Telefono parcialmente oculto.<br>• Identificador privado del navegador.<br>• Nivel: normal, sospechoso o bloqueado.**

### Señales combinadas recomendadas

| Campo | Detalle |
|---|---|
| IP de conexion | Sirve para correlacionar actividad, pero nunca debe usarse como unica prueba de<br>identidad. |
| Telefono normalizado | Permite reconocer pedidos repetidos incluso cuando cambia la conexion. |
| Token del navegador | Cookie propia aleatoria y privada; no usar huella invasiva de hardware, fuentes o pantalla. |
| Comportamiento | Frecuencia, repeticion, pedidos identicos, nombres cambiantes y acciones en periodos<br>cortos. |

#### Regla de moderacion

Una reseña negativa legitima no debe considerarse abuso automaticamente. El sistema debe diferenciar entre opinion negativa, spam repetido, insultos o amenazas, suplantacion y fraude operativo.

- La decision de bloquear queda inicialmente en manos del administrador.

- Los bloqueos automaticos por contenido quedan fuera de la primera fase.

Ejemplo interno: Pedido PZ-12345, IP 181.225.***.42, telefono 53******56 y 5 pedidos en 18 minutos. El admin puede revisar historial, observar o bloquear.

<!-- PDF fuente: página 51 -->

## M-017 - SEGURIDAD Niveles de bloqueo aprobados

La accion critica Bloquear acceso completo debe formar parte de la primera fase, pero solo como decision manual y auditable.

| Campo | Detalle |
|---|---|
| 1. Acciones especificas | Bloquear pedidos, reseñas o rifas de forma independiente. El cliente puede seguir<br>navegando. |
| 2. Todas las<br>interacciones | Puede ver la tienda, pero no puede comprar, comentar, reservar numeros ni enviar<br>formularios. |
| 3. Acceso completo | No puede abrir ninguna pagina publica ni endpoint asociado a esa tienda. |

#### Bloquear acceso completo - accion critica

- Aplicar a home, categorias, productos, carrito, checkout, Landing QR, rifas, reseñas, recibos y enlaces directos de la tienda.

- Interceptar la solicitud en el servidor antes de cargar contenido.

- No revelar que la IP, telefono o navegador fueron bloqueados.

- No mostrar productos, precios, telefono, WhatsApp ni datos de la tienda.

- Usar Cache-Control: private, no-store para evitar cache compartida.

- El bloqueo debe ser reversible, tener duracion y motivo interno obligatorio.

- Advertir que una IP compartida puede afectar a terceros; recomendar IP + token de navegador.

**Pantalla publica sutil<br>Pagina no disponible<br>No pudimos completar la solicitud en este momento.<br>Intentalo nuevamente mas tarde.<br>Boton visible: Reintentar. Diseño neutro y sin explicar<br>la causa real. · Confirmacion del admin<br>Bloquear acceso completo<br>Este cliente dejara de poder abrir cualquier pagina<br>publica de esta tienda.<br>Opciones: 24 horas, 7 dias, 30 dias o permanente;<br>IP, dispositivo, telefono o combinacion.**

### Flujo obligatorio en servidor

#### Solicitud publica -> resolver tienda -> obtener señales seguras -> consultar bloqueo activo -> devolver pagina generica o continuar

La proteccion no puede depender de JavaScript ni de ocultar elementos despues de cargar. Tambien debe proteger llamadas directas a endpoints publicos.

<!-- PDF fuente: página 52 -->

## M-017 - SEGURIDAD Gobierno, auditoria y proteccion de datos

El modulo debe ser controlable desde Master Admin y dejar evidencia de todas las acciones sensibles.

**Control por tienda desde Master<br>• Seguridad habilitada o deshabilitada.<br>• Modo: Desactivado, Monitoreo o Proteccion.<br>• Permitir bloqueo manual y bloqueo completo.<br>• Permitir o prohibir bloqueos permanentes.<br>• Retencion: 30, 60 o 90 dias.<br>• Visibilidad de IP: oculta, parcial o completa.<br>• Notificar intentos bloqueados. · Permisos y auditoria<br>• Store Admin: solo su tienda.<br>• Master Admin: revisar, desbloquear y suspender<br>la facultad de bloquear.<br>• Bloqueo global: exclusivo del Master Admin.<br>• Registrar quien bloqueo, desbloqueo o revelo<br>una IP.<br>• Guardar motivo, duracion, vencimiento y cambios<br>de configuracion.**

### Colecciones propuestas

| Campo | Detalle |
|---|---|
| store_security_settings | Configuracion de Seguridad por tienda y capacidades habilitadas por el Master. |
| store_security_events | Actividad de pedidos, reseñas, rifas, intentos bloqueados y nivel de riesgo. |
| store_security_blocks | Bloqueos activos, alcance, señales, motivo, duracion, estado y creador. |
| store_security_audit | Historial administrativo de bloqueos, desbloqueos, revelacion de IP y cambios. |

#### Tratamiento tecnico de la IP y el dispositivo

- Obtener la IP solo en el servidor; nunca confiar en un valor enviado por JavaScript.

- Produccion: confiar en Cloudflare solo con origen protegido y proxies confiables; staging directo usa la conexion real.

- Guardar ip_hmac para coincidencias y, si se aprueba, ip_encrypted para revelacion controlada.

- La clave HMAC vive en secretos del servidor; no usar hash simple de IP.

- Cookie aleatoria propia para navegador; no fingerprint invasivo.

- IP, telefono, hashes, tokens y motivos internos nunca aparecen en HTML, data-*, logs ni consultas publicas.

<!-- PDF fuente: página 53 -->

## M-017 - SEGURIDAD Fases y continuidad de implementacion

No cerrar como completado local, staging OK o Production OK hasta tener evidencia real en source y ambiente.

| Campo | Detalle |
|---|---|
| Fase 1 - aprobada | Monitoreo, historial, bloqueos manuales por acciones, todas las interacciones y acceso<br>completo; auditoria obligatoria. |
| Fase 2 - futura | Limites por tiempo, alertas de comportamiento, lista de observacion y Turnstile bajo<br>demanda. |
| Fase 3 - futura | Puntuacion de riesgo, reglas globales Master y deteccion de patrones entre tiendas. |

#### Alcance protegido para el futuro prompt de Codex

- Revisar primero el source V58 actualizado y ubicar middleware, rutas publicas, pedidos, reseñas y rifas.

- No romper checkout, inventario, promociones, cupones, regalos, ratings, Landing QR ni analiticas.

- No hardcodear PowerZona; resolver store y storeName dinamicamente.

- Mantener aislamiento multi-tienda en cada coleccion, endpoint y consulta.

- Si el registro de seguridad falla, no debe corromper pedidos o reseñas ya validos; el bloqueo si debe aplicarse de forma fail-safe cuando exista una regla activa.

- No implementar fingerprint invasivo ni bloqueo automatico por una reseña negativa.

### Validaciones obligatorias antes de staging / production

#### Checklist tecnico

- Probar modos Desactivado, Monitoreo y Proteccion por tienda.

- Validar pedidos, reseñas, rifas y acceso completo en PC y movil.

- Entrar por home, producto, checkout, landing, rifa, review y recibo.

- Confirmar que la pagina generica no revela el bloqueo ni datos de la tienda.

- Verificar expiracion, desbloqueo, auditoria y aislamiento entre tiendas.

- Validar IP real y proxies en staging/produccion.

- Ejecutar npm run build, git diff --check y git status; no subir generados.

Estado de cierre v27: M-017 queda registrado con definicion funcional aprobada. Siguiente etapa: revisar source V58 y preparar prompt Codex con identificador unico. No existe implementacion en source en este cierre.

<!-- PDF fuente: página 54 -->

## REGISTRO IMPORTANTE Actualizacion de bitacora M-017 - Seguridad: avance real hasta Source V75

Documento interno de trabajo. No incluir datos sensibles ni notas visibles de produccion.

**V28 · M-017 SEGURIDAD · SOURCE V75**

| Campo | Detalle |
|---|---|
| Tipo | Mejora estrategica / seguridad / moderacion / control multi-tienda |
| Seccion | Master Admin -> control por tienda; Admin de tienda -> Seguridad |
| Prioridad | Alta |
| Estado | Implementacion local avanzada. Monitoreo, clientes, visitantes, auditoria y gestion<br>privada de bloqueos disponibles. Enforcement publico aun pendiente. |
| Fecha de<br>actualizacion | 13 de julio de 2026 |
| Source de continuidad | Proyecto actualizado V75 y reportes B3F1 / B3F2 revisados. |

### Resumen del avance

La definicion inicial de M-017 ya paso a una implementacion local amplia. El modulo registra actividad, consolida clientes, muestra visitantes, permite administrar bloqueos privados y protege las lecturas sensibles mediante endpoints sanitizados. Aun no se aplican los bloqueos a pedidos, reseñas, rifas ni acceso publico.

#### Estado actual de M-017

Completado local: configuracion Master, identidad de clientes, IP controlada, visitantes, clientes canonicos, archivo/eliminacion de ficha, observacion, bloqueos privados, expiracion y auditoria.

Pendiente: validacion visual final, staging real, proxies/IP real y PZ-SEC-BLOCKS03B para aplicar bloqueos a flujos publicos.

<!-- PDF fuente: página 55 -->

## M-017 - SEGURIDAD Estado tecnico alcanzado

Resumen de fases y entregas incorporadas en el source actual.

| Entrega | Resultado | Estado |
|---|---|---|
| PZ-SEC-BASE01 | Configuracion por tienda controlada desde Master y acceso<br>condicionado para Store Admin. | Completado<br>local |
| IDENTITY02A /<br>FIX01-03 | Clientes por pedido, telefono normalizado, HMAC/AES, IP segura y<br>backfill. | Completado<br>local |
| IDENTITY02B +<br>ADDENDUM02 | Panel privado de clientes, actividad, visitantes de hoy, paginas<br>navegadas e IP directa autorizada. | Completado<br>local |
| IDENTITY02C | Cliente canonico por dispositivo/telefono, varios telefonos, dispositivos<br>y union manual. | Completado<br>local |
| C7D4 / D9K2 | Archivar, restaurar, eliminar ficha sin borrar pedidos; dialogos flotantes<br>centrados. | Completado<br>local |
| B3A7 | Observacion, creacion/revocacion de bloqueos, vencimiento, auditoria<br>y pestaña Clientes bloqueados. | Completado<br>local |
| B3F1 | Idempotencia, expiracion transaccional, archivo seguro y lectura<br>historica del Master desactivado. | Completado<br>local |
| B3F2 | Cierre de colecciones sensibles para Store Admin y endpoints privados<br>de Actividad/Visitantes. | Completado<br>local |
| BLOCKS03B | Aplicacion efectiva a pedidos, reseñas, rifas, formularios y acceso<br>publico. | Pendiente |

#### Proteccion de datos vigente

Las colecciones sensibles de clientes, eventos, visitantes, dispositivos, telefonos, bloqueos y auditoria ya no son legibles directamente por Store Admin. El panel usa endpoints privados sanitizados. HMAC, tokens, ciphertext, metadata y motivos internos no se devuelven al frontend.

<!-- PDF fuente: página 56 -->

## M-017 - DECISIONES FUNCIONALES Master desactivado y pruebas locales

Decisiones registradas antes de pasar a staging.

### Comportamiento aprobado cuando Seguridad esta desactivada

- Store Admin: pierde acceso a la seccion Seguridad y no puede consultar endpoints privados.

- Master Admin: conserva lectura historica de Resumen, Clientes, Actividad, Visitantes y Bloqueos.

- Acciones nuevas: observacion, creacion de bloqueos, union, archivo y eliminacion quedan deshabilitadas.

- Datos: desactivar Seguridad no borra clientes, actividad, visitantes, bloqueos ni auditoria.

- Pendiente de decision final: permitir al Master revocar un bloqueo existente aunque Seguridad este desactivada.

#### Detalle visual pendiente en Panel Master

El boton actual Seguridad abre solamente la configuracion. Deben separarse dos acciones:

Ver seguridad -> abre /master/security/[storeId] y permanece visible si existe configuracion, incluso desactivada. Configurar -> abre activar/desactivar, modo, retencion, IP y capacidades.

Si la tienda nunca fue configurada, mostrar solo Configurar seguridad.

### Limitacion de localhost

- Todas las sesiones locales comparten 127.0.0.1 o ::1; la IP no permite separar Admin y cliente.

- No se debe probar bloqueo por IP solamente en localhost, porque podria afectar todas las sesiones locales.

- Al intentar crear un bloqueo local aparecio Cross-site POST form submissions are forbidden.

- Se decidio no desactivar checkOrigin ni crear un bypass local antes de conocer el comportamiento real en staging.

- Las rutas administrativas /master, /admin y /t/[storeSlug]/admin siempre deben quedar fuera del futuro bloqueo publico completo.

#### Decision aprobada

La prueba real de creacion, revocacion y efecto de bloqueos se traslada a staging. Localhost se mantiene para build, UI, lectura historica y validaciones no dependientes de IP/proxy.

<!-- PDF fuente: página 57 -->

## M-017 - CONTINUIDAD Secuencia recomendada antes de BLOCKS03B

Orden de trabajo aprobado para evitar perder evidencia y no debilitar seguridad.

| Campo | Detalle |
|---|---|
| 1 | Corregir el Panel Master<br>Agregar Ver seguridad separado de Configurar. El historial debe abrir aunque la opcion este desactivada. |
| 2 | Crear commit local limpio<br>Consolidar B3F1 + B3F2 + el pequeño ajuste del Panel Master. No usar git add . y no incluir generados. |
| 3 | Push a dev / staging<br>Subir primero a la rama dev y desplegar en el ambiente de staging. |
| 4 | Configurar secretos en Coolify<br>Definir PZ_SECURITY_HMAC_SECRET y PZ_SECURITY_AES_KEY con valores validos, sin guardarlos en Git. |
| 5 | Verificar runtime<br>Reiniciar PocketBase, revisar health privado desde Master y confirmar que hooks, colecciones y<br>AES/HMAC estan listos. |
| 6 | Verificar Cloudflare / proxy / IP<br>Confirmar origen protegido, headers confiables y que realIP() refleja la conexion real del cliente. |
| 7 | Validar gestion de bloqueos<br>Crear, listar, revocar y expirar bloqueos en staging. Confirmar auditoria, roles y aislamiento entre<br>tiendas. |
| 8 | Investigar Origin solo si falla<br>Si staging muestra el error cross-site, revisar Origin, Host, X-Forwarded-Host, HTTPS, Coolify y Cloudflare.<br>No desactivar CSRF globalmente. |
| 9 | Iniciar PZ-SEC-BLOCKS03B<br>Solo despues de cerrar las validaciones anteriores, conectar bloqueos a pedidos, reseñas, rifas y acceso<br>publico. |

#### Regla de seguridad

No desactivar globalmente security.checkOrigin. Una correccion de proxy/origen debe conservar la proteccion CSRF en staging y production.

<!-- PDF fuente: página 58 -->

## M-017 - VALIDACION STAGING Prueba de bloqueos y continuidad

Checklist para ejecutar cuando el source llegue a staging.

### Preparacion de la prueba

- Sesion 1: PC o navegador normal para Master Admin y Store Admin.

- Sesion 2: telefono con datos moviles o navegador completamente separado para el cliente publico.

- Crear una orden desde la sesion cliente para registrar telefono, dispositivo e IP real.

- Abrir la ficha desde Seguridad y crear bloqueo usando primero dispositivo + telefono.

- Probar IP despues, con advertencia de red compartida y preferencia por combinacion con dispositivo.

### Validaciones de BLOCKS03A en staging

- Poner y quitar observacion sin auditorias duplicadas.

- Crear bloqueos de 24 horas, 7 dias, 30 dias y permanente segun capacidades Master.

- Revocar el bloqueo y confirmar restauracion del estado normal/watch.

- Forzar un vencimiento temporal y confirmar auditoria unica.

- Master puede revisar una tienda desactivada; Store Admin no puede entrar.

- Colecciones sensibles no entregan datos directos a Store Admin desde F12.

- IP hidden, partial, full y full_unavailable funcionan con datos reales.

- Ninguna respuesta visible contiene HMAC, token, ciphertext, motivo interno o metadata privada.

#### Alcance actual

En este punto los bloqueos se registran y administran, pero todavia no impiden comprar, reseñar, reservar rifas ni abrir paginas. Ese enforcement corresponde a PZ-SEC-BLOCKS03B.

### Siguiente etapa despues de staging

| Campo | Detalle |
|---|---|
| Si staging pasa | Preparar PZ-SEC-BLOCKS03B con enforcement server-side y eventos<br>blocked_attempt. |
| Si falla el POST | Corregir configuracion Origin/Host/proxy. Mantener checkOrigin habilitado. |
| Si falla IP real | Revisar Cloudflare, Coolify, origen protegido y realIP() antes de continuar. |
| Si hay fuga de datos | Detener avance y corregir endpoint/regla antes de BLOCKS03B. |
| Estado de M-017 | Incompleto hasta validar enforcement publico, acceso completo, auditoria,<br>expiracion y ambientes reales. |

<!-- PDF fuente: página 59 -->

## REGISTRO IMPORTANTE Actualizacion de bitacora

## Documento interno de trabajo. No incluir datos sensibles ni notas visibles de produccion. V29 - Planes, usuarios y seguimiento de precios hasta Source V96

**V29 · MODULOS ADMIN · SOURCE V96**

| Campo | Detalle |
|---|---|
| Tipo | Actualizacion funcional / seguridad administrativa / planes / usuarios / seguimiento<br>de precios |
| Secciones | Master Admin, Admin de tienda, login administrativo y Seguimiento de precios |
| Estado | Implementacion local completada en Source V96. Pendiente de mejoras menores,<br>staging y production. |
| Fecha | 16 de julio de 2026 |
| Fuente | Source V96 revisado, reportes de Codex y validaciones locales registradas en la<br>conversacion de trabajo. |

### Resumen de la actualizacion

Desde la ultima bitacora v28 se completo la base de planes, la gestion de usuarios por tienda, contrasenas temporales, dispositivos administrativos, eliminacion permanente de usuarios y una nueva experiencia de Seguimiento de precios. Esta version consolida el estado real y evita mantener como pendientes registros que ya existen en Source V96.

#### Regla de estado para v29

Las secciones de este apendice se marcan como Completado local / pendiente de mejoras. No se consideran Production OK hasta validar staging, production, responsive y runtime real.

Las paginas 59 en adelante actualizan o sustituyen los estados anteriores de los IDs indicados, sin borrar el historial documental previo.

<!-- PDF fuente: página 60 -->

## CONTROL DE CONTINUIDAD Registros anteriores actualizados

Cambios de estado que sustituyen registros antiguos de la bitacora.

| ID | Seccion | Estado<br>actualizado | Nota de continuidad |
|---|---|---|---|
| E-007 | Notificacion interna de<br>resena pendiente | Completado local | Existe review_pending para resenas de<br>orden, tienda y producto, con switch y<br>destino seguro. |
| M-014 Fase<br>1 | Notificaciones en vivo con<br>web abierta | Completado local | Realtime, contador, toast, titulo de pestana,<br>Notification API con web abierta y polling de<br>respaldo. |
| M-016 /<br>Rifas | Resultado, fecha y<br>chequeo seguro | Completado local | Resultado publico, CTA del ganador, fecha<br>del sorteo, Chequear resultado y aviso de<br>resultado pendiente. |
| M-017 | Seguridad por tienda | Avance local /<br>incompleto | Gestion privada y auditoria disponibles;<br>BLOCKS03B y enforcement publico siguen<br>pendientes. |

#### Actualizacion de E-007 y M-014

- La campana administrativa reconoce el tipo review_pending y abre la revision correspondiente.

- AdminSidebar mantiene suscripcion realtime a store_notifications y respaldo por polling.

- La fase 2 de push con la web cerrada continua fuera de alcance y no se marca como completada.

#### Actualizacion del modulo Rifas

- La pagina publica muestra fecha del sorteo, estados de resultado y accion Reclamar mi premio por WhatsApp solo para el ganador.

- El admin usa Chequear resultado y mantiene defensa de fecha antes de publicar.

- La validacion definitiva en staging/production sigue pendiente.

#### M-017 permanece abierto

La bitacora v28 sigue vigente para Seguridad. Source V96 conserva la gestion privada de bloqueos, pero aun no se documenta como completado el enforcement publico de BLOCKS03B.

<!-- PDF fuente: página 61 -->

## PLANES DE TIENDA Base, vigencia y gestion Master

P7B1, P7M2 y P7M2F1 - completados localmente.

**P7B1 · P7M2 / F1 · COMPLETADO LOCAL**

| Campo | Detalle |
|---|---|
| Fundacion | Campos de plan, inicio, vencimiento, duracion, trial usado, auditoria e historial por<br>tienda. |
| Gestion Master | Pantalla Plan y limites, cambio, renovacion, vigencia temporal o permanente e<br>historial. |
| Correccion F1 | Normalizacion de DateTime de PocketBase y respuesta estable del endpoint<br>privado. |
| PowerZona | Premium permanente, sin vencimiento y sin renovacion obligatoria. |

### Matriz vigente

| Plan | Vigencia | Usuario<br>s<br>activos | Disp./us<br>uario | Disp./tie<br>nda | Fotos | Alcance |
|---|---|---|---|---|---|---|
| Free | 30 dias | 1 | 5 | 5 | 2 | Sin modulos Premium |
| Basico | 1-12 meses | 1 | 5 | 5 | 2 | Sin Rifas, Seguridad, Landing<br>QR y alertas avanzadas |
| Premiu<br>m | 1-12 meses o<br>permanente | 4 | 5 | 20 | 4 | Incluye funciones Premium |

#### Estado actual

- Completado local en Source V96 y disponible para las fases posteriores.

- La vigencia real conserva fecha y hora exactas; la presentacion de dias restantes se corrige en U7I7F2.

- Pendiente de validar en staging/production y completar el enforcement global de expiracion cuando corresponda.

<!-- PDF fuente: página 62 -->

## PLANES DE TIENDA Plan visible y proteccion por capacidades

P7S3 y P7G4 - base global completada localmente.

**P7S3 · P7G4 · BASE GLOBAL LISTA**

### Cambios completados

- Indicador del plan y dias restantes en el sidebar real del Admin de tienda.

- Badges de plan temporal o permanente en el contexto Master.

- Matriz central de capacidades compartida por backend y frontend.

- Capacidades: max_active_users, max_devices_per_user, max_store_devices, max_product_images, raffles_enabled, security_enabled, landing_qr_enabled y product_expiration_tools_enabled.

- Helpers backend y frontend con validacion fail-closed y pruebas de paridad.

- Componente visual reutilizable para funciones bloqueadas por plan.

#### Pendientes de mejora conectados a esta base

- F7P8 - aplicar definitivamente el limite de 2/4 fotos en frontend, backend, edicion, drag and drop y pagina publica.

- V7E9 - herramientas Premium de productos vencidos, proximos a vencer, filtros y alertas.

- Aplicar el gate global a todos los modulos Premium sin borrar configuraciones al bajar de plan.

- Validar expiracion y downgrades en staging antes de production.

#### Regla de downgrade

Los datos Premium deben conservarse inactivos al bajar de plan y restaurarse al volver a Premium. No borrar configuraciones, fotos adicionales, dispositivos o historial solo por un cambio de plan.

<!-- PDF fuente: página 63 -->

## M7U1 - USUARIOS Backend privado y cambio de contrasena propia

U7B5 y U7B5A1 - completados localmente.

**U7B5 · U7B5A1 · COMPLETADO LOCAL**

### Backend privado de usuarios

- Endpoints Master para resumen, listado, detalle, creacion, actualizacion, restablecimiento de acceso, cierre de sesiones y auditoria.

- Aislamiento estricto: cada usuario objetivo debe pertenecer a la tienda solicitada.

- Limite max_active_users tomado de la matriz central: Free/Basico 1 y Premium 4.

- Proteccion del ultimo store_admin activo.

- Cambios de email, rol, suspension y contrasena rotan sesiones cuando corresponde.

- Reglas directas de users cerradas para create/update/delete desde SDK o F12.

- Auditoria privada sin contrasenas, hashes, tokens ni tokenKey.

### Cambio propio de Store Admin

- Endpoint privado para cambiar su propia contrasena usando la contrasena actual.

- Solo store_admin activo; Store Staff no recibe cambio voluntario.

- Cambio permanente, auditoria y cierre de todas las sesiones.

- La interfaz Mi cuenta consume este flujo despues de completar el acceso temporal.

#### Evolucion de la regla de contrasena

U7B5 permitio establecer una contrasena desde Master. U7I7 evoluciono el flujo: el Master ahora emite una contrasena temporal de 72 horas y el usuario crea su contrasena personal antes de entrar al panel.

<!-- PDF fuente: página 64 -->

## ACCESO ADMINISTRATIVO Dispositivos y contrasenas temporales

D7A6 y ampliacion U7I7 - completados localmente.

**D7A6 · TEMPORAL 72 H · SOURCE V96**

### Dispositivos administrativos

| Plan | Maximo por usuario | Maximo por tienda |
|---|---|---|
| Free | 5 | 5 |
| Basico | 5 | 5 |
| Premium | 5 | 20 |

- Cookie privada pz_admin_device y header X-PZ-Admin-Device.

- Token aleatorio; solo se almacena digest SHA-256, nunca el token crudo.

- Login autoriza dispositivos nuevos si hay cupo; refresh solo acepta dispositivos autorizados.

- Downgrade no revoca dispositivos existentes: solo bloquea nuevas autorizaciones.

- Master puede listar y revocar dispositivos; una revocacion invalida todas las sesiones del usuario.

### Contrasena temporal obligatoria

- Toda cuenta creada o restablecida por Master recibe contrasena temporal con vencimiento de 72 horas.

- Store Admin y Store Staff deben crear una contrasena personal antes de entrar al panel.

- El restablecimiento cierra inmediatamente todas las sesiones existentes.

- Despues del cambio obligatorio se cierra incluso la sesion temporal y se exige nuevo login.

- La contrasena temporal nunca se guarda ni audita en texto plano.

<!-- PDF fuente: página 65 -->

## M7U1 - INTERFAZ Usuarios, dispositivos, auditoria y eliminacion

U7I7 y U7I7F1D8 - completados localmente, pendientes de mejoras visuales menores.

**U7I7 · U7I7F1D8 · COMPLETADO LOCAL**

| Campo | Detalle |
|---|---|
| Listado | /master/stores/[storeId]/users |
| Detalle | /master/stores/[storeId]/users/[userId] |
| Mi cuenta | /t/[storeSlug]/admin/account |
| Cambio temporal | /t/[storeSlug]/admin/change-temporary-password |

### Alcance completado

- Listado y detalle responsive con roles, estados, ultima actividad, dispositivos y auditoria.

- Creacion con secreto temporal visible una sola vez y flujo unico oficial.

- Restablecer acceso, cerrar sesiones, suspender/activar y proteger al ultimo administrador.

- Mi cuenta para Store Admin con cambio voluntario y cierre de sesiones propias.

- Zona de peligro con confirmacion por email y motivo obligatorio.

- Eliminacion fisica del registro auth users en PocketBase, con auditoria user_deleted.

- Se eliminan dispositivos administrativos, pero se conservan pedidos, productos, clientes, resenas, rifas y analiticas.

- Auditoria combinada de usuarios/dispositivos con deduplicacion y descripciones seguras.

#### Correcciones incluidas en F1D8

- issuedSecret inmutable para no copiar una contrasena distinta de la emitida.

- Un solo flujo de creacion de usuarios.

- Actualizacion de metricas y auditoria despues de revocar dispositivos.

- Build limpio validado en Windows y posteriormente confirmado en Linux/Node 22 durante la revision del source.

<!-- PDF fuente: página 66 -->

## M7U1 - PULIDO Navegacion, avisos y dias restantes

U7I7F2 - completado localmente en el source vigente.

**U7I7F2 · CORRECCIONES · SOURCE V96**

- Actividad reciente: Ver usuarios abre /master/stores/[storeId]/users.

- Aviso de eliminacion: se muestra temporalmente, limpia deleted=1 y se retira del DOM.

- Listado compacto: con 10 usuarios totales o menos oculta busqueda, filtro de rol y paginacion innecesaria.

- Modo completo: con mas de 10 usuarios mantiene busqueda, filtros y paginacion de 10 por pagina.

- Pluralizacion: 1 usuario / 2 usuarios.

- Dias restantes: se calculan por fecha civil de America/Havana para la presentacion.

- Vence hoy: el dia de vencimiento muestra 0 dias/Vence hoy antes de la hora exacta.

- Enforcement: el vencimiento real conserva fecha y hora exactas; no depende del contador visual.

| Ejemplo aprobado<br>Plan del 15 de julio al 15 de agosto: 31 dias el dia 15, 30 dias el dia 16, 1 dia el 14 de agosto,<br>Vence hoy el 15 antes de la hora exacta y Vencido despues de esa hora. |
|---|
| Estado<br>Completado local en Source V96. Pendiente de comprobar nuevamente en staging y<br>production con zona horaria real del servidor y del navegador. |

<!-- PDF fuente: página 67 -->

## SEGUIMIENTO DE PRECIOS Detalle exclusivo y precio objetivo

PZPW01 - completado localmente con migracion 1783387000.

**PZPW01 · ALERTA OBJETIVO · COMPLETADO LOCAL**

| Campo | Detalle |
|---|---|
| Ruta | /master/price-watch/[watchId] |
| Migracion | 1783387000_master_price_watch_targets.js |
| Objetivo | Precio objetivo configurable por seguimiento. |
| Notificaciones | Todo cambio real genera una notificacion; no existe margen minimo de 5 USD. |

### Regla final de alertas

- Cualquier cambio real de precio genera exactamente una notificacion por Master activo.

- Si el nuevo precio es igual o menor al objetivo activo, la notificacion usa tono critical y se muestra en rojo.

- Mientras permanezca igual o por debajo, cada nuevo cambio real sigue notificando en rojo.

- Si vuelve a quedar por encima, tambien notifica, pero con tono normal.

- Si el precio no cambia, no se crea evento ni notificacion.

- Los cambios de precio no se agrupan; cada evento deduplicado conserva su propia notificacion.

### Vista exclusiva

- El detalle ya no muestra descripcion, inventario, datos adicionales ni relacionados.

- Muestra precio actual, precio inicial, diferencia, ultimo cambio, objetivo e historial.

- Volver a seguimiento conserva el contexto del listado.

- En productos con variaciones, el objetivo se compara contra el precio efectivo minimo entre variaciones activas y validas.

<!-- PDF fuente: página 68 -->

## SEGUIMIENTO DE PRECIOS Historial ordenado y retorno contextual

PZPW01F1 - completado localmente sin migracion adicional.

**PZPW01F1 · HISTORIAL · SOURCE V96**

### Columnas finales del historial

| Campo | Detalle |
|---|---|
| Columna | Contenido |
| Fecha | Fecha y hora del evento. |
| Movimiento | $38.00 -> $35.00 y tipo de cambio debajo. |
| Diferencia | Valor absoluto en USD, sin porcentaje. |
| Objetivo | Sin objetivo, Por encima u Objetivo alcanzado. |
| Actor | Nombre amigable y rol, sin IDs internos. |

#### Regla visual aprobada

- Cuando el precio baja: flecha hacia abajo en color rojo.

- Cuando el precio sube: flecha hacia arriba en color verde.

- No mostrar porcentaje; solo diferencia absoluta en USD.

- El estado Objetivo alcanzado es una senal separada y se mantiene como alerta critica roja.

- En movil, cada evento se presenta como tarjeta compacta sin scroll horizontal.

#### Retorno contextual

Al abrir Ver ficha del producto desde un seguimiento, la ficha valida from=price-watch y watchId. Si corresponde al mismo producto y tienda, muestra Volver a seguimiento; si el contexto es invalido, usa Volver a Productos. No se aceptan URLs de retorno arbitrarias.

<!-- PDF fuente: página 69 -->

## CONTROL GENERAL Estado consolidado hasta Source V96

Resumen de entregas nuevas y registros anteriores actualizados.

| ID | Seccion | Estado | Pendiente principal |
|---|---|---|---|
| E-007 | Resenas pendientes | Completado local | Staging/production |
| M-014 F1 | Notificaciones con web abierta | Completado local | Push con web cerrada fuera de<br>alcance |
| M-016 | Rifas resultado/chequeo/fecha | Completado local | Staging/production |
| M-017 | Seguridad | Parcial / incompleto | BLOCKS03B y ambientes reales |
| P7B1 | Fundacion de planes | Completado local | Staging/production |
| P7M2/F1 | Gestion de planes | Completado local | Staging/production |
| P7S3 | Plan visible | Completado local | Pulido/validacion |
| P7G4 | Capacidades globales | Completado local | Conectar enforcement pendiente |
| U7B5/A1 | Backend usuarios y cuenta propia | Completado local | Staging/production |
| D7A6 | Dispositivos administrativos | Completado local | Staging/production |
| U7I7/F1D8/F<br>2 | Interfaz usuarios y correcciones | Completado local | Mejoras menores/validacion |
| PZPW01/F1 | Seguimiento y alertas | Completado local | Mejoras menores/validacion |

#### Criterio de cierre

Completado local significa que la funcionalidad existe en Source V96 y ha sido revisada mediante source, reportes o validacion local. No sustituye las pruebas de staging ni autoriza por si sola un push a production.

<!-- PDF fuente: página 70 -->

## CONTINUIDAD Pendientes de mejora y validacion

Trabajo que permanece abierto despues de esta actualizacion.

### Prioridad alta / funcional

- M-017 / PZ-SEC-BLOCKS03B: aplicar bloqueos a pedidos, resenas, rifas, formularios y acceso publico.

- F7P8: enforcement real del limite de fotos 2/4 en todos los caminos frontend/backend.

- V7E9: productos vencidos y alertas Premium con filtros, tarjetas y notificaciones.

- Enforcement de expiracion del plan y downgrade en todos los modulos Premium.

- Validar usuarios, dispositivos, contrasenas temporales y eliminacion de usuarios en staging.

### Pulido y experiencia

- Validacion responsive final de usuarios, Mi cuenta, dispositivos, auditoria y Zona de peligro.

- Validacion visual del detalle de seguimiento, historial, campana, pagina de notificaciones y alertas critical.

- Comprobar dias restantes en America/Havana con hora real del entorno.

- Revisar singular/plural, mensajes temporales y retornos contextuales en PC y movil.

### Checklist antes de staging / production

- npm run build en frontend-powerzona.

- Pruebas backend/frontend y runtime PocketBase temporal.

- git diff --check y git status --short.

- No subir pb_data, dist, node_modules, .astro generados ni archivos temporales.

- Confirmar 0 fixtures temporales y 0 procesos temporales abiertos.

#### Regla production/F12

No dejar comentarios HTML internos, versiones, TODO, textos Codex/debug, console.log/info/warn de desarrollo, notas internas visibles en DOM, source maps publicos ni datos sensibles en frontend.

<!-- PDF fuente: página 71 -->

## REGLA DE TRABAJO Repositorio real de Codex y copias historicas

Actualizacion operativa aprobada para todos los prompts futuros.

| Campo | Detalle |
|---|---|
| Repositorio | C:\Users\workd\Desktop\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt |
| Rama | dev |
| Copias Vxx | Archivos de revision para ChatGPT y comparacion historica; no son el source que<br>Codex debe reemplazar. |
| Historico | C:\Users\workd\Desktop\PROYECTOS |

### Reglas obligatorias

- Codex trabaja directamente sobre el repositorio actual ya abierto en dev.

- Antes de modificar debe confirmar git branch --show-current y git status --short.

- No importar, descomprimir ni copiar un Proyecto Actualizado Vxx encima del repositorio.

- No cambiar de rama sin autorizacion.

- No ejecutar git reset, git clean, git restore, git checkout -- o git stash para descartar trabajo existente.

- Las copias historicas solo se consultan para comparar; nunca se convierten en el nuevo repositorio.

- No hacer commit, push, merge o despliegue salvo solicitud expresa del usuario.

#### Cierre de v29

La bitacora queda actualizada hasta Source V96 con las secciones implementadas marcadas como Completado local / pendiente de mejoras. M-017 continua incompleto y los puntos de staging/production permanecen abiertos hasta evidencia real.

<!-- PDF fuente: página 72 -->

## REGISTRO IMPORTANTE Actualizacion de bitacora

Documento interno de trabajo. No incluir datos sensibles ni notas visibles de produccion.

## V30 - F7P8 limite de fotos completado hasta Source V104

**F7P8 · LIMITE DE FOTOS · COMPLETADO**

| Campo | Detalle |
|---|---|
| Tipo | Actualizacion funcional de planes y galeria de productos. |
| Seccion | F7P8 - Limite de fotos por producto segun capacidad del plan. |
| Estado | COMPLETADO. Validacion local funcional, backend/frontend y pruebas manuales<br>confirmadas por Kraken. |
| Fecha | 17 de julio de 2026. |
| Fuente | Source V104, reportes F7P8 y F7P8-C1, pruebas automatizadas y validacion<br>manual PC/movil. |

F7P8 queda cerrado con un limite real de 2 fotos para Free/Basico y 4 para Premium. La proteccion cubre creacion, edicion, reemplazo, drag and drop, solicitudes directas, validacion de archivos y galeria publica. Las fotos 3 y 4 se conservan inactivas al bajar de Premium y se restauran automaticamente al regresar.

#### Regla de estado para v30

Las paginas 72 en adelante sustituyen el estado pendiente de F7P8 registrado en las paginas 62, 69 y 70. F7P8 se marca como COMPLETADO. Este cierre no implica push, staging ni production; esas validaciones se ejecutaran en el bloque de despliegue previsto por Kraken.

<!-- PDF fuente: página 73 -->

#### F7P8 - LIMITE DE FOTOS

### Alcance funcional completado

Capacidad central max_product_images aplicada de forma uniforme en admin, backend y tienda publica.

| Plan | Fotos activas | Max. fisico | Publico | Fotos 3 y 4 |
|---|---|---|---|---|
| Free | 2 | 4 | 2 | Bloqueadas/inactivas |
| Basico | 2 | 4 | 2 | Bloqueadas/inactivas |
| Premium | 4 | 4 | 4 | Activas |

#### Protecciones implementadas

- Creacion y edicion de productos: Free/Basico no pueden terminar con mas de 2 fotos activas; Premium no puede superar 4.

- Drag and drop general distribuye archivos entre slots activos; el drop sobre un slot reemplaza solo esa posicion.

- Solicitudes directas quedan protegidas mediante hooks de PocketBase para images, images+, images- e image_order.

- Reemplazo y reordenamiento respetan la cola Premium conservada y no permiten promover o modificar slots bloqueados.

- Validacion cerrada de JPEG, PNG y WebP, con maximo final de 2 MiB y comprobacion backend de firmas reales.

- La pagina publica resuelve la capacidad de la tienda real y serializa unicamente 2 o 4 fotos activas.

#### Aislamiento multitienda

Cada producto usa la tienda relacionada con su propio registro. Una tienda Premium no puede prestar su capacidad a un producto de una tienda Basica y un Store Admin no puede modificar productos de otro tenant.

<!-- PDF fuente: página 74 -->

#### F7P8 - DOWNGRADE SEGURO

### Conservacion y restauracion aprobadas

La reduccion de plan no borra archivos ni modifica masivamente los productos.

- Premium con 4 fotos -> Basico/Free: las fotos 1 y 2 permanecen activas y publicas.

- Las fotos 3 y 4 permanecen almacenadas, mantienen su orden y se muestran en admin como Conservada - Premium.

- Los slots conservados no permiten reemplazo, borrado, drop ni promocion mediante image_order.

- Editar nombre, precio o stock no elimina ni altera las fotos conservadas.

- Reemplazar una foto activa conserva intacta la cola Premium 3 y 4.

- Al volver a Premium reaparecen automaticamente las 4 fotos, sin re-subir ni restaurar archivos manualmente.

#### Validacion manual confirmada por Kraken

- Plan Basico en PC: 2 slots activos y 2 slots Premium bloqueados.

- Plan Premium en PC: 4 slots activos y utilizables.

- Reduccion Premium -> Basico: fotos 3 y 4 conservadas con miniatura y distintivo Premium.

- Pagina publica en Basico: solo fotos 1 y 2.

- Edicion de nombre, stock y precio: fotos conservadas intactas.

- Upgrade a Premium: las 4 fotos reaparecen en admin y pagina publica.

- Carga multiple, drag and drop, archivos invalidos, ordenamiento y comportamiento movil: aprobados.

#### Resultado

El flujo completo Premium -> Basico/Free -> Premium fue comprobado sin perdida de datos. La regla de downgrade definida en la bitacora v29 queda implementada para las fotos del producto.

<!-- PDF fuente: página 75 -->

#### F7P8 - VALIDACION TECNICA

### Pruebas, build y correccion final

Evidencia consolidada de F7P8 y F7P8-C1 en Source V104.

- Prueba frontend focal portable en Node v22.16.0: 22 aprobadas, 0 fallidas, 0 omitidas.

- Prueba backend focal: 21 aprobadas, 0 fallidas, 0 omitidas.

- Suite frontend reportada por Codex: 138 aprobadas, 0 fallidas.

- Suite backend reportada por Codex: 353 aprobadas, 0 fallidas y 5 runtimes omitidos por falta de variables seguras.

- Astro SSR build aprobado; git diff --check aprobado; 0 migraciones creadas o modificadas.

- 0 dependencias nuevas, 0 source maps publicos, 0 fixtures y 0 procesos temporales creados por la correccion.

#### F7P8-C1 - mensaje de drop corregido

Al soltar varias fotos sobre un unico slot, los archivos adicionales ya no se reportan falsamente como limite del plan. La interfaz diferencia invalidos, limite activo y excedentes de un espacio individual.

#### Texto aprobado

Se acepto 1 foto. Este espacio solo permite una foto a la vez; se descarto 1 archivo adicional.

#### Reportes archivados

- docs/tusenda84/reportes/F7P8-limite-fotos-producto.md

- docs/tusenda84/reportes/F7P8-C1-correcciones-finales.md

<!-- PDF fuente: página 76 -->

#### CONTROL GENERAL

### Estado consolidado hasta Source V104

F7P8 deja de formar parte de los pendientes funcionales y se cierra con confirmacion expresa de Kraken.

| ID | Seccion | Estado | Pendiente principal |
|---|---|---|---|
| P7G4 | Capacidades globales | Completado local | Staging/production |
| F7P8 | Limite de fotos 2/4 | COMPLETADO | Staging en bloque 8-12 |
| V7E9 | Vencimiento de productos Premium | Siguiente punto | Implementacion |
| L7Q1 | Landing QR Premium | Pendiente | Implementacion |
| R7P2 | Rifas Premium | Pendiente | Implementacion |
| S7P3 | Seguridad Premium | Pendiente | Gate de plan |

#### Continuidad aprobada

- El siguiente punto se trabajara en un chat independiente: V7E9 - Vencimiento de productos Premium.

- El proximo prompt debe registrar primero F7P8 como COMPLETADO en la continuidad documental antes de iniciar V7E9.

- No se realiza push a dev ni staging despues de este cierre. El push se mantiene para el bloque conjunto de los puntos 8 al 12.

- Los prompts futuros se entregan como archivos Markdown; cada PROMPT ID usa su propio chat; los reportes se guardan en docs/tusenda84/reportes/.

#### Cierre de F7P8

F7P8 - Limite de fotos por producto queda COMPLETADO el 17 de julio de 2026, confirmado por Kraken y registrado en Source V104. La funcionalidad conserva los datos Premium y mantiene defensa backend frente a solicitudes directas/F12.

#### Siguiente seccion

V7E9 - Vencimiento de productos Premium: listado de vencidos, proximos a vencer, filtros 1/2/3 meses, tarjetas, notificaciones y alertas 90/60/30/7 dias, manteniendo para todos el bloqueo de venta/checkout de productos vencidos.

<!-- PDF fuente: página 77 -->

## REGISTRO IMPORTANTE Actualizacion de bitacora

V31 consolida el trabajo realizado despues de Source V104 y registra el estado real hasta Source V119.

**V31 · SOURCE V119 · CIERRE DE ETAPA**

| Campo | Detalle |
|---|---|
| Tipo | Actualizacion funcional / seguridad administrativa / pedidos / usuarios / vencimientos |
| Secciones | Pedidos, Mi equipo, permisos, productos, variaciones, tienda publica y Vencimientos |
| Estado | PZ-ORD-PRICE01 completado local; M7U2 y V7E9 COMPLETADOS por Kraken |
| Fecha | 23 de julio de 2026 |
| Fuente | Source V119, reportes privados de Codex y validaciones manuales de Kraken |

### Resumen de la actualizacion

Desde el cierre F7P8 en Source V104 se incorporaron tres bloques principales: canonizacion de precios y totales de pedidos en servidor, gestion completa de equipos y permisos por tienda, y vencimiento Premium de productos y variaciones con bloqueo comercial real. Esta version sustituye los estados pendientes anteriores sin borrar el historial documental.

#### Regla de estado para v31

- PZ-ORD-PRICE01: implementado y validado tecnicamente en local; pendiente de staging/production.

- M7U2: COMPLETADO el 20 de julio de 2026, Source V114, confirmado expresamente por Kraken.

- V7E9: COMPLETADO el 23 de julio de 2026, Source V119, confirmado expresamente por Kraken.

- No se realiza push, staging ni production con este cierre documental; esas validaciones siguen en el bloque de despliegue previsto.

<!-- PDF fuente: página 78 -->

## CONTROL DE CONTINUIDAD Registros actualizados hasta Source V119

Resumen de entregas nuevas y estados que sustituyen la continuidad registrada en Source V104.

| ID | Seccion | Estado actualizado | Pendiente<br>principal |
|---|---|---|---|
| PZ-ORD-PRICE0<br>1 | Precio y totales canonicos | Completado local | Staging/production |
| PZ-ORD-PRICE0<br>1-C1/C2 | Ajustes manuales y recibo | Completado local | QA de ambiente |
| M7U2 | Mi equipo y permisos | COMPLETADO | Staging en bloque |
| M7U2-C1/C2/C2<br>F1/C3 | Pulido, actividad, eliminacion y permisos | COMPLETADO | Staging en bloque |
| V7E9 | Vencimiento Premium | COMPLETADO | Staging en bloque |
| V7E9-C1...C3F4 | Correcciones, enforcement e historial | COMPLETADO | Staging en bloque |
| L7Q1 | Landing QR Premium | Siguiente punto | Implementacion |
| R7P2 | Rifas Premium | Pendiente | Implementacion |
| S7P3 | Seguridad Premium | Pendiente | Gate de plan |

#### Continuidad aprobada

- M7U2 y V7E9 dejan de formar parte de los pendientes funcionales.

- La proxima seccion se trabajara en un chat independiente: L7Q1 - Landing QR Premium.

- El primer prompt de L7Q1 debe registrar documentalmente V7E9 como COMPLETADO antes de iniciar la nueva tarea.

- Los prompts siguen entregandose como archivos Markdown y los reportes se conservan en docs/tusenda84/reportes/.

#### Correccion documental importante

La referencia antigua de V7E9 a alertas 90/60/30/7 queda sustituida. La regla final aprobada e implementada es 90/60/30/0, donde 0 corresponde al vencimiento.

<!-- PDF fuente: página 79 -->

## PEDIDOS Y SEGURIDAD ECONOMICA PZ-ORD-PRICE01 - Precio canonico en backend

La creacion de pedidos deja de confiar en nombres, precios, descuentos, envio y totales enviados por el navegador.

**PZ-ORD-PRICE01 · SOURCE V109 · COMPLETADO LOCAL**

### PZ-ORD-PRICE01 SOURCE V109 COMPLETADO LOCAL Fuente de verdad oficial

El checkout usa ahora el endpoint privado POST /api/pz/checkout/orders. El cliente envia referencias y cantidades; el servidor vuelve a resolver tienda, producto, variacion, stock, vencimiento, promociones, cupon, regalo, moneda, zona, envio y totales.

#### Protecciones implementadas

- Precios, subtotales, descuentos, equivalencias y total se generan unicamente en servidor.

- Producto, variacion, oferta, promociones, cupones, regalos y carritos mixtos reutilizan las formulas vigentes.

- Creacion anonima directa de orders, order_items y usos de cupon queda cerrada.

- Precio falso, nombre falso, total manipulado, variacion ajena, otra tienda y cantidades invalidas se rechazan o canonizan.

- Orden, lineas, uso de cupon y notificacion se crean dentro de una sola transaccion atomica.

- La clave idempotente evita duplicar una orden ante reenvios iguales.

### Resultado operativo

- El checkout conserva su flujo aprobado: crear orden pendiente y luego abrir WhatsApp.

- Inventario sigue descontandose solamente al confirmar la orden desde el Admin.

- Productos o variaciones vencidos son rechazados por el mismo backend canonico.

- Los errores publicos no exponen consultas, costos, IDs internos ni stack traces.

| Validacion | Resultado |
|---|---|
| Backend focal | 12/12 |
| Frontend focal | 4/4 |
| Runtime PocketBase | 1/1 |
| Suite backend | 386 aprobadas, 6 omitidas, 0 fallidas |
| Suite frontend | 161/161 |
| Astro SSR build | Aprobado |

<!-- PDF fuente: página 80 -->

## PEDIDOS ADMIN Ajustes manuales, auditoria y total final

Las correcciones C1 y C2 preservan promociones y cupones, permiten ajustes explicitos y mantienen recibos transparentes.

**C1 / C2 · SOURCE V111 · COMPLETADO LOCAL**

#### Ajuste manual de linea

#### Restablecer precio del sistema

- Accion separada del precio automatico del sistema.

- Confirmacion en dos pasos y motivo nuevo obligatorio.

- Motivo obligatorio mediante catalogo controlado y opcion Otro con explicacion.

- No reutiliza el motivo anterior de la linea.

- Auditoria inmutable registra antes/despues, diferencia retirada, actor y fecha.

- Administrador principal y usuarios autorizados pueden ajustar; Staff no autorizado queda bloqueado.

- Confirmed y Preparing muestran advertencias sin alterar inventario.

- La orden conserva promociones, cupones, envio y calculos canónicos.

- Delivered y Cancelled permanecen bloqueados.

- El recibo muestra Ajuste especial sin revelar motivos internos.

#### Total final del recibo

El recibo agrega una fila destacada Total final despues de Envio. El valor proviene de la orden canonica; el envio se incorpora exactamente una vez. USD, CUP, monedas 1:1, recogida y carrito mixto conservan su presentacion aprobada.

| Campo | Detalle |
|---|---|
| Validacion C2 | Resultado |
| Backend focal | 17/17 |
| Frontend focal | 9/9 |
| Runtime real | 1/1 |
| Suite backend | 391 aprobadas, 6 omitidas, 0 fallidas |
| Suite frontend | 166/166 |
| Playwright estandar | 6 evidencias aprobadas |
| Astro SSR build | Aprobado |

<!-- PDF fuente: página 81 -->

## M7U2 - MI EQUIPO Usuarios y permisos granulares por tienda

La tienda Premium puede operar con un Administrador principal y hasta tres usuarios adicionales activos.

**M7U2 · SOURCE V114 · COMPLETADO**

| Plan | Usuarios activos | Regla |
|---|---|---|
| Free | 1 | Solo Administrador principal |
| Basico | 1 | Solo Administrador principal |
| Premium | 4 | 1 Principal + 3 adicionales |

#### Administrador principal protegido

- Es el unico responsable de crear, editar, suspender, reactivar y eliminar usuarios adicionales.

- No puede autoeliminarse, degradarse ni ser reemplazado desde la tienda; la intervencion queda reservada al Master Admin.

- Ve correo completo, sesiones, dispositivos, permisos, actividad y reportes de su equipo.

- La tarjeta Planes de la tienda se muestra solo al Principal y no se renderiza para usuarios adicionales.

### Acceso y contrasenas

- Toda cuenta creada o restablecida recibe contrasena temporal con vigencia de 72 horas.

- El usuario debe crear su contrasena personal antes de entrar al panel y luego iniciar sesion nuevamente.

- Cada usuario admite hasta 5 dispositivos; Premium permite hasta 20 dispositivos por tienda.

- Suspender, eliminar, restablecer acceso o revocar dispositivos invalida las sesiones correspondientes.

<!-- PDF fuente: página 82 -->

## M7U2 - GOBIERNO Eliminacion, actividad y auditoria

La operacion del equipo queda trazable sin borrar el historial funcional de la tienda.

**C1 · C2 / C2F1 · C3**

#### Eliminacion permanente

#### Actividad del equipo

- Solo usuarios adicionales; el Principal queda protegido.

- Filtros, paginacion, detalle antes/despues y estado de revision.

- Confirmacion escribiendo el correo completo.

- Requiere correccion, reporte individual y Mi actividad.

- Ocho motivos controlados; Otro exige detalle.

- Actor o recurso eliminado se representa mediante snapshot seguro.

- Elimina acceso, sesiones, dispositivos y permisos.

- Conserva pedidos, productos, reseñas, rifas, analiticas e historial.

- Historial individual de producto separado de Actividad del equipo.

- Acciones compactas y responsive PC/movil.

#### Auditoria y privacidad

- No se guardan contrasenas, tokens, hashes, motivos sensibles visibles ni JSON crudo en frontend.

- Las colecciones privadas se consumen mediante endpoints sanitizados y filtrados por tienda.

- Las acciones de equipo, permisos, dispositivos, eliminacion y normalizacion dejan auditoria inmutable.

- Las consultas batch evitan N+1 y los accesos entre tiendas responden 403.

<!-- PDF fuente: página 83 -->

## M7U2 - PERMISOS Plantillas, permisos personalizados y downgrade

El acceso se resuelve por capacidades granulares, no por interfaces ocultas solamente.

| Plantilla | Permisos principales | Proteccion |
|---|---|---|
| Marketing | Promos, cupones, regalos, rifas, Landing QR y analiticas | Sin pedidos ni catalogo general |
| Solo lectura | Catalogo, pedidos y analiticas en lectura | Sin Seguridad ni mutaciones |
| Personalizado | Conjunto explicito autorizado | No concede dependencias ocultas |

#### Correcciones finales de permisos

- analytics.view ya no concede Pedidos ni Catalogo.

- Marketing usa selectores sanitizados sin costos, stock privado, pedidos ni datos de clientes.

- Solo lectura no obtiene Seguridad; la ruta y endpoints responden 403.

- catalog.expirations.manage controla V7E9 independientemente de editar precios, stock o productos.

- Permisos custom explicitos sobreviven la normalizacion y el downgrade/upgrade.

#### Downgrade Premium -> Basico/Free

- El Principal permanece activo y los usuarios adicionales quedan inactivos por plan.

- Se cierran sesiones de extras y no pueden reactivarse por encima del cupo.

- Usuarios, permisos, plantillas, actividad y auditoria se conservan.

- Al volver a Premium se restauran solo los usuarios elegibles; suspendidos permanecen suspendidos.

| Campo | Detalle |
|---|---|
| Validacion final M7U2 | Resultado |
| Backend completo | 523 aprobadas, 7 omitidas, 0 fallidas |
| Frontend completo | 226/226 |
| Playwright estandar | 17/17 capturas |
| Astro SSR build | Aprobado |
| Limpieza | 0 fixtures y 0 procesos temporales |

<!-- PDF fuente: página 84 -->

## V7E9 - VENCIMIENTO PREMIUM Modelo comercial por producto y variacion

La fecha de vencimiento controla visibilidad, venta, carrito, checkout, Pedidos Admin y alertas sin exponer la fecha al cliente.

**V7E9 · SOURCE V119 · COMPLETADO**

#### Dos modos comerciales

- has_variations=false: el producto padre es la unidad vendible y usa su precio, stock, visibilidad y fecha general.

- has_variations=true: el padre es contenedor; cada variacion activa es una unidad independiente con precio, stock, fecha y disponibilidad propia.

- Las variaciones almacenadas se conservan cuando se desactiva el modo, pero quedan comercialmente ignoradas.

- Al reactivar el modo, reaparecen con sus datos anteriores sin duplicar alertas ni ciclos.

| Unidad | Estado manual | Fecha | Estado efectivo |
|---|---|---|---|
| Producto padre | Visible | Vigente o vacia | VISIBLE |
| Producto padre | Visible | Vencida | VENCIDO |
| Producto padre | Oculto | Cualquiera | OCULTO |
| Variacion | Activa | Vigente o vacia | Activa |
| Variacion | Activa | Vencida | Vencida |
| Variacion | Oculta | Cualquiera | Oculta |
| Variacion | Conservada | Padre sin variaciones | Conservada |

#### Intencion manual preservada

La fecha vencida oculta comercialmente la unidad, pero no convierte automaticamente active=true en false. Al corregir o borrar la fecha, vuelve a visible solo si antes estaba manualmente activa. Una unidad ocultada manualmente permanece oculta.

<!-- PDF fuente: página 85 -->

## V7E9 - ENFORCEMENT Bloqueo publico y transaccional real

### Un producto o variacion vencidos dejan de ser unidades vendibles en todos los caminos, no solo en la interfaz. Protecciones publicas

- Se excluyen de home, catalogo, busqueda, categorias, subcategorias, destacados y relacionados.

- El enlace directo muestra Producto no disponible sin revelar fecha, motivo, precio, stock o IDs.

- Carrito y checkout retiran o rechazan unidades vencidas con mensaje seguro.

- Pedidos Admin no ofrece productos o variaciones vencidos ni ocultos.

- El endpoint canonico de ordenes y las solicitudes directas/F12 rechazan el intento aunque el frontend sea manipulado.

#### Variaciones independientes

- Una variacion vencida puede aparecer en Vencidos mientras otra del mismo padre aparece en Proximos a vencer.

- El padre sigue visible mientras exista al menos una variacion vendible.

- Si todas las variaciones quedan vencidas, ocultas o invalidas, el producto completo pasa a Producto no disponible.

- Variaciones ocultas manualmente no participan en disponibilidad ni generan nuevas alertas operativas.

#### Privacidad y aislamiento

- La fecha se evalua en backend antes de sanitizar la respuesta y nunca se entrega a la tienda publica.

- Cada producto y variacion se valida contra su tienda real; otra tienda responde con rechazo seguro.

- Los permisos granulares separan consultar vencimientos de editar producto, precio, stock o historial.

- Cache, carrito multipestana y selectores se refrescan para evitar vender con datos antiguos.

<!-- PDF fuente: página 86 -->

## V7E9 - ADMIN Y AUDITORIA Vencimientos, historial y experiencia de gestion

La herramienta Premium combina resumen, filtros, listado por unidad, historial individual y actividad del equipo.

#### Pagina Vencimientos

#### Historial individual

- Pestanas Vencidos y Proximos a vencer.

- Pagina exclusiva por producto y sus variaciones.

- Filtros de 1, 2 y 3 meses en linea.

- Filtros por producto general, variacion, vencimiento, precio, stock y visibilidad.

- Busqueda por producto o variacion.

- Actor, fecha, antes/despues y estado resultante sanitizados.

- Contadores y paginacion por unidad vendible.

- Borde rojo para 30 dias o menos e icono compartido.

- Regreso contextual a Productos, Vencimientos o Actividad del equipo.

- Responsive PC y movil sin scroll horizontal.

- Permisos parciales ocultan precio, stock o eventos no autorizados.

#### Actividad y productos

- El listado de Productos muestra solo Ultima modificacion: fecha y hora; el detalle completo vive en Historial.

- Las acciones Editar, Historial y Ocultar/Mostrar se agrupan en el menu de tres puntos.

- Actividad del equipo elimina la accion Abrir, evita repetir nombres largos y conserva Ver historial / Ver detalle.

- Los checkboxes de producto y variacion separan visibilidad manual del estado efectivo por vencimiento.

#### Acceso por plan y permiso

Free y Basico reciben gate Premium. En Premium, el usuario necesita catalog.expirations.manage. Un usuario sin permiso obtiene 403 y no recibe datos; el Principal y usuarios autorizados trabajan dentro de su propia tienda.

<!-- PDF fuente: página 87 -->

## V7E9 - ALERTAS Y CIERRE Notificaciones, downgrade y validacion final

El modulo queda cerrado despues de correcciones tecnicas sucesivas y pruebas manuales completas en Source V119.

**90 · 60 · 30 · 0 / VENCIDO**

#### Ciclos y notificaciones

- Umbrales finales: 90, 60, 30 y 0 dias; no existe alerta especial de 7 dias.

- Cada fecha activa genera una unica alerta vigente; guardar sin cambios no duplica.

- Cambiar o borrar fecha cierra el ciclo anterior y limpia notificaciones activas relacionadas.

- Desactivar Usar variaciones limpia alertas de variaciones sin borrar sus fechas almacenadas.

- Las notificaciones de variacion identifican el producto y la variante de forma segura.

#### Downgrade irreversible de la herramienta

- Premium -> Basico/Free exige confirmacion explicita.

- Se eliminan fechas, ciclos y alertas de vencimiento; no se borran productos ni variaciones.

- Los productos vuelven a su estado comercial manual normal.

- Volver a Premium no restaura fechas eliminadas por el downgrade.

| Campo | Detalle |
|---|---|
| Validacion final V7E9-C3F4 | Resultado |
| Frontend focal | 58/58 |
| Frontend completo | 254/254 |
| Backend focal combinado | 101/101 |
| Runtime HTTP | 1/1 |
| Astro SSR build | Aprobado en Windows |
| Pruebas manuales | Aprobadas por Kraken |
| Limpieza | 0 fixtures y 0 procesos temporales |

#### Cierre de V7E9

V7E9 - Vencimiento de productos Premium queda COMPLETADO el 23 de julio de 2026, confirmado por Kraken y registrado en Source V119. La funcionalidad protege catalogo, carrito, checkout, Pedidos Admin y solicitudes directas, y mantiene auditoria, permisos y aislamiento por tienda.

<!-- PDF fuente: página 88 -->

## CONTROL GENERAL Estado consolidado hasta Source V119

M7U2 y V7E9 dejan de formar parte de los pendientes funcionales y la continuidad pasa a Landing QR Premium.

| ID | Seccion | Estado | Pendiente<br>principal |
|---|---|---|---|
| P7G4 | Capacidades globales | Completado local | Staging/production |
| F7P8 | Limite de fotos 2/4 | COMPLETADO | Staging en bloque |
| PZ-ORD-PRICE01 | Precios y totales de pedidos | Completado local | Staging/production |
| M7U2 | Mi equipo y permisos | COMPLETADO | Staging en bloque |
| V7E9 | Vencimiento Premium | COMPLETADO | Staging en bloque |
| L7Q1 | Landing QR Premium | Siguiente punto | Implementacion |
| R7P2 | Rifas Premium | Pendiente | Implementacion |
| S7P3 | Seguridad Premium | Pendiente | Gate de plan |

### S7P3 Seguridad Premium Pendiente Gate de plan Continuidad aprobada

- El siguiente punto se trabajara en un chat independiente: L7Q1 - Landing QR Premium.

- El proximo prompt debe actualizar primero la continuidad documental para marcar V7E9 como COMPLETADO.

- No se realiza push a dev ni staging despues de este cierre. El despliegue permanece para el bloque conjunto aprobado.

- PZ-ORD-PRICE01 permanece como completado local hasta su validacion en ambiente.

- M7U2 y V7E9 conservan sus reportes y evidencias en docs/tusenda84/reportes/.

#### Cierre documental v31

La bitacora queda actualizada hasta Source V119. Este apendice sustituye los estados pendientes de M7U2 y V7E9 registrados en paginas anteriores, mantiene el historial original y prepara la continuidad hacia L7Q1.

#### Siguiente seccion

L7Q1 - Landing QR Premium: aplicar gate de plan en frontend y backend, conservar la configuracion al bajar de plan, bloquear edicion/activacion para Free/Basico, proteger solicitudes directas y definir el comportamiento publico cuando la capacidad no este disponible.

<!-- PDF fuente: página 89 -->

## REGISTRO IMPORTANTE Actualizacion de bitacora V32 - L7Q1 Landing QR Premium completado hasta Source V120

**V32 · L7Q1 LANDING QR PREMIUM · COMPLETADO**

| Campo | Detalle |
|---|---|
| Tipo | Actualizacion funcional / planes / permisos / privacidad / experiencia publica. |
| Seccion | Admin de tienda -> Ajustes -> Landing QR; tienda publica -> /t/[storeSlug]/links. |
| Estado | COMPLETADO. Pruebas automaticas, runtime HTTP y validacion manual total aprobadas. |
| Fecha de cierre | 24 de julio de 2026. |
| Fuente | Source V120, reporte L7Q1 y confirmacion expresa de Kraken. |

L7Q1 cierra el gate Premium real de Landing QR. La capacidad comercial, el permiso granular y la vigencia del plan se aplican en frontend y backend. Free, Basico y Premium vencido no pueden editar, activar, leer datos privados, generar nuevos QR ni registrar analiticas Landing QR. La configuracion existente se conserva y reaparece al volver a Premium.

#### Regla de estado para v32

Las paginas 89 en adelante sustituyen el estado pendiente de L7Q1 registrado en las paginas 78 y 88. L7Q1 se marca como COMPLETADO en Source V120. Este cierre no implica push, staging ni production; esas validaciones permanecen dentro del bloque conjunto aprobado.

#### Validacion manual de Kraken

Kraken aprobo todos los bloques: Premium principal, analiticas, landing desactivada, usuario sin permiso, downgrade, restauracion, plan vencido, responsive PC/movil, aislamiento entre tiendas y solicitudes directas/F12.

<!-- PDF fuente: página 90 -->

### L7Q1 - GATE PREMIUM Acceso, permisos y proteccion administrativa

#### Matriz efectiva de acceso

| Campo | Detalle |
|---|---|
| Escenario Resultado |  |
| Principal Premium vigente | Editor completo, guardado, imagen, enlaces, orden, preview y QR bajo demanda. |
| Usuario Premium autorizado | Acceso solo con permiso efectivo landing_qr.manage. |
| Premium sin permiso | Modulo oculto; URL directa, REST, realtime y archivo privado bloqueados. |
| Free / Basico | Principal descubre el gate Premium; no se monta el editor ni se exponen datos. |
| Premium vencido | Mismo comportamiento fail-closed que Basico, sin borrar configuracion. |

La autorizacion exige capacidad landing_qr_enabled vigente y permiso landing_qr.manage. El hash #landing resuelve gate o editor sin mostrar primero Ajustes generales. El gate no monta LandingQrSettings, no crea preview/QR y no muestra Guardar movil. analytics.view y store.settings.manage no conceden acceso a Landing QR. Toda mutacion landing_qr_*, incluido append/delete de imagen, valida actor, tenant, permiso y plan. Consultas fields, filter, sort, expand y realtime no permiten inferir campos privados. Cruces de tienda responden de forma saneada sin revelar IDs, enlaces ni configuracion.

#### Privacidad y aislamiento

Los campos landing_qr_* se redactan de forma especifica sin ocultar datos publicos generales de la tienda. Cada operacion se resuelve contra la tienda real del registro; otra tienda no puede prestar capacidad ni permisos.

<!-- PDF fuente: página 91 -->

### L7Q1 - DOWNGRADE Y RUTA PUBLICA Conservacion, redireccion y QR fijo

#### Downgrade seguro

Premium -> Basico/Free no modifica landing_qr_enabled almacenado. No se borran titulo, subtitulo, color, imagen, enlaces, IDs, iconos, URLs, orden ni visibilidad. No se borra historial analitico ni se generan auditorias falsas. Al recuperar Premium reaparecen exactamente los valores y el estado activo anterior. Una landing desactivada manualmente continua desactivada despues del ciclo de downgrade/upgrade.

#### Regla efectiva

Landing publica efectiva = capacidad Premium permitida + landing_qr_enabled almacenado en true.

#### Comportamiento publico y QR

| Campo | Detalle |
|---|---|
| Estado Resultado |  |
| Premium + activa | /links responde 200 y muestra la landing; QR PNG/SVG disponible. |
| Premium + desactivada | /links redirige 302 al home; QR fijo continua disponible para imprimir. |
| Basico / Free / vencido | /links redirige 302 al home; QR PNG/SVG responde 404 privado/no-store. |
| QR impreso anterior | Durante downgrade lleva al home canonico de la misma tienda. |

Los clics se aceptan solo con Premium vigente, landing activa, ruta canonica y enlace existente. El servidor usa tipo, icono, etiqueta y ruta canonicos; ignora metadatos adulterados por el cliente. POST directos de landing_qr_view, landing_qr_click o page_type=landing_qr se bloquean cuando no corresponde. La analitica general de la tienda continua funcionando y no queda afectada por el gate.

#### Resultado para el cliente

El QR fisico nunca queda inutil: si Landing QR no esta disponible, el cliente llega al home de esa misma tienda sin pantalla blanca, gate Premium ni explicacion interna.

<!-- PDF fuente: página 92 -->

### L7Q1 - VALIDACION TECNICA Pruebas automaticas, runtime y limpieza

| Campo | Detalle |
|---|---|
| Validacion Resultado |  |
| Backend focal L7Q1 | 9/9 aprobadas; 0 fallidas; 0 omitidas. |
| Frontend L7Q1 | 6/6 aprobadas dentro de la suite. |
| Frontend completo | 260/260 aprobadas; 0 fallidas. |
| Backend completo | 563 aprobadas; 7 omitidas declaradas; 0 fallidas. |
| Astro SSR build | Aprobado; solo warnings historicos de rutas dinamicas. |
| git diff --check | Aprobado, sin errores. |
| Runtime HTTP | Premium 200, Basico 302, QR Premium 200, QR Basico 404, tracking canonico y POST directo bloqueado. |
| Migraciones | 0 creadas o modificadas. |
| Produccion/F12 | 0 source maps publicos y 0 marcadores internos en assets cliente. |
| Limpieza | 0 fixtures, 0 bases temporales, 0 procesos, 0 listeners y 0 archivos runtime restantes. |

#### Reporte archivado

docs/tusenda84/reportes/L7Q1-landing-qr-premium.md conserva hallazgos, archivos, pruebas, runtime, omisiones declaradas y git status final.

#### Estado tecnico

Codex dejo L7Q1 en revision hasta la confirmacion manual. Kraken completo posteriormente todos los bloques, por lo que el estado final de esta bitacora es COMPLETADO.

<!-- PDF fuente: página 93 -->

### L7Q1 - VALIDACION MANUAL Pruebas manuales aprobadas por Kraken

| Campo | Detalle |
|---|---|
| Prueba Resultado confirmado |  |
| 1. Premium principal | Editor completo, guardado, preview, PNG/SVG y pagina publica. |
| 2. Analiticas | Visita y clic correctos, boton y tienda correctos, sin duplicados anomalos. |
| 3. Landing desactivada | URL y QR anterior redirigen al home; admin Premium conserva QR. |
| 4. Usuario sin permiso | Modulo oculto y bloqueado por URL, REST, realtime y archivos. |
| 5. Premium -> Basico | Gate visible, editor ausente, datos privados ocultos, QR 404 y configuracion preservada. |
| 6. Basico -> Premium | Restauracion exacta; una landing apagada no se reactiva sola. |
| 7. Plan vencido | Gate, redireccion, QR bloqueado, tracking bloqueado y recuperacion sin perdida. |
| 8. Responsive | PC, 1024, 768, 430, 390 y 375 px sin scroll ni roturas globales. |
| 9. Aislamiento | Dos tiendas separadas; downgrade de una no afecta ni revela la otra. |
| 10. F12/directas | PATCH, imagen, fields/filter/sort/expand, realtime, tracking e IDs cruzados rechazados. |

#### Cierre manual

Kraken confirmo el 24 de julio de 2026 que todos los bloques quedaron completados en Source V120. No quedan pruebas manuales locales pendientes para L7Q1.

<!-- PDF fuente: página 94 -->

### CONTROL GENERAL Estado consolidado hasta Source V120

| ID | Seccion | Estado | Pendiente principal |
|---|---|---|---|
| P7G4 | Capacidades globales | Completado local | Staging/production |
| F7P8 | Limite de fotos 2/4 | COMPLETADO | Staging en bloque |
| PZ-ORD-PRICE01 | Precios y totales de pedidos | Completado local | Staging/production |
| M7U2 | Mi equipo y permisos | COMPLETADO | Staging en bloque |
| V7E9 | Vencimiento Premium | COMPLETADO | Staging en bloque |
| L7Q1 | Landing QR Premium | COMPLETADO | Staging en bloque |
| R7P2 | Rifas Premium | Siguiente punto | Implementacion |
| S7P3 | Seguridad Premium | Pendiente | Gate de plan |

#### Ruta oficial del repositorio

E:\Trabajo\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt. La ruta antigua en C:\Users\workd\Desktop\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt queda obsoleta. Este apendice sustituye la referencia operativa de la pagina 71. La rama autorizada continua siendo dev.

#### Continuidad aprobada

L7Q1 deja de formar parte de los pendientes funcionales. No se realiza push a dev ni staging con este cierre; el despliegue permanece para el bloque conjunto aprobado. El siguiente punto se trabajara en un chat independiente: R7P2 - Rifas Premium. El primer prompt de R7P2 debe registrar documentalmente L7Q1 como COMPLETADO antes de iniciar la nueva tarea. Los reportes se conservan en docs/tusenda84/reportes/ y los prompts continuan como archivos Markdown.

#### Siguiente seccion

R7P2 - Rifas Premium: aplicar gate de plan en frontend y backend, conservar configuraciones al bajar de plan, bloquear edicion/activacion y solicitudes directas para Free/Basico, y definir el comportamiento publico de rifas cuando la capacidad no este disponible.

<!-- PDF fuente: página 95 -->

## REGISTRO IMPORTANTE Actualizacion de bitacora

### V33 - R7P2 Rifas Premium completado hasta Source V121

**V33 · R7P2 RIFAS PREMIUM · COMPLETADO**

| Campo | Detalle |
|---|---|
| Tipo | Actualizacion funcional / planes / permisos / privacidad / experiencia publica. |
| Seccion | Admin de tienda -> Promociones -> Rifas; tienda publica -> /t/[storeSlug]/rifa. |
| Estado | COMPLETADO. Pruebas automaticas, runtime HTTP y validacion manual total aprobadas. |
| Fecha de cierre | 25 de julio de 2026. |
| Fuente | Source V121, reporte R7P2, correcciones R7P2-C1/C2 y confirmacion expresa de Kraken. |

### Resumen de la actualizacion

R7P2 cierra el gate Premium real de Rifas. La capacidad comercial, la vigencia del plan, el permiso granular y el aislamiento por tienda se aplican antes de cargar o mutar datos. Free, Basico y Premium vencido no pueden editar, participar, publicar resultados, consultar estados, descargar imagenes ni acceder por REST, realtime o solicitudes directas. Toda la configuracion queda conservada y reaparece al volver a Premium.

#### Regla de estado para v33

Las paginas 95 en adelante sustituyen el estado pendiente de R7P2 registrado en las paginas 78, 88 y 94. R7P2 se marca como COMPLETADO en Source V121. Este cierre no implica push, staging ni production; esas validaciones permanecen dentro del bloque conjunto aprobado.

#### Validacion manual de Kraken

Kraken aprobo los 17 bloques manuales: Principal Premium, usuarios con y sin permiso, gate Free/Basico, downgrade, restauracion, vencimiento, rifa apagada, home publico, enlaces antiguos, participacion/estado, imagenes, F12, aislamiento, notificaciones, responsive y flujo Premium completo.

<!-- PDF fuente: página 96 -->

## R7P2 - GATE PREMIUM Acceso, permisos y proteccion administrativa

### Matriz efectiva de acceso

| Escenario | Resultado |
|---|---|
| Principal Premium vigente | Editor completo, slots, configuracion, premios, imagenes, participantes y<br>resultados. |
| Usuario Premium autorizado | Acceso solo con permiso efectivo raffles.manage y dentro de su tienda. |
| Premium sin permiso | Modulo oculto; URL directa, API, REST, realtime y archivos bloqueados. |
| Principal Free / Basico | Gate Premium dentro del panel; no se monta editor ni se cargan datos<br>privados. |
| Premium vencido | Mismo comportamiento fail-closed que Basico, sin borrar configuracion. |
| Usuario adicional bloqueado | Sin descubrimiento comercial; acceso directo saneado y sin datos. |

### Protecciones implementadas

- La autorizacion exige capacidad raffles_enabled vigente y permiso raffles.manage cuando corresponde.

- El gate se resuelve en SSR antes de leer slots, formularios, participantes, imagenes o scripts del editor.

- La API administrativa valida actor, tenant, plan y permiso antes de GET, creacion de slots o mutaciones.

- analytics.view, store.settings.manage, promociones o catalogo no conceden acceso accidental a Rifas.

- Las respuestas de error no exponen consultas, rutas internas, stack traces ni mensajes crudos de PocketBase.

### Correcciones finales R7P2-C1 y R7P2-C2

#### R7P2-C1 - precedencia correcta del gate

El Administrador principal Free, Basico o con Premium vencido ve el gate comercial de Rifas dentro del panel, igual que Landing QR. La pantalla generica No tienes permiso queda reservada para usuarios Premium sin raffles.manage.

#### R7P2-C2 - layout de tarjetas restaurado

Se elimino Ver historial de las tarjetas y se restauro el patron aprobado: Ver rifa publica, Configurar y menu de tres puntos, sin desbordes en PC ni movil.

<!-- PDF fuente: página 97 -->

## R7P2 - DOWNGRADE Y RUTA PUBLICA Conservacion, redireccion e imagenes

### Downgrade seguro

- Premium -> Basico/Free no modifica slots, titulos, codigos, fechas, premios, imagenes, participantes, resultados ni historial.

- No se desactiva link_enabled, show_in_store ni la visibilidad almacenada por el simple cambio de plan.

- Durante el bloqueo se impiden edicion, activacion, publicacion, participacion, estado, descargas y nuevas notificaciones operativas.

- Al recuperar Premium reaparecen exactamente los mismos datos y archivos, sin duplicados.

- Una rifa apagada manualmente continua apagada despues del ciclo downgrade/upgrade.

#### Regla efectiva

Rifa publica efectiva = capacidad Premium vigente + rifa configurada + enlace habilitado + estado/fecha permitidos.

### Comportamiento publico

| Estado | Resultado |
|---|---|
| Premium + rifa disponible | /rifa y /rifa/[slug] muestran la experiencia publica; imagenes disponibles. |
| Free / Basico / vencido | Las rutas antiguas redirigen 302 al home canonico de la misma tienda. |
| Home sin capacidad | No consulta, renderiza ni serializa tarjetas, premios o datos de Rifas. |
| Imagen antigua bloqueada | Responde 404 seguro con cache privada/no-store; el archivo no se borra. |
| Restauracion Premium | La misma URL de imagen y las rutas publicas vuelven a funcionar. |

### Participacion y consulta de estado

- Las rutas canonicas bloquean el flujo antes de leer participaciones o generar notificaciones cuando no existe capacidad.

- Una pagina Premium que queda abierta no puede enviar una participacion despues del downgrade.

- La consulta de una reserva anterior responde de forma generica y no confirma la existencia del dato.

- El cliente nunca ve gate Premium, pantalla blanca ni explicaciones internas del plan.

#### Resultado para el cliente

Los enlaces antiguos siguen siendo utiles: cuando Rifas no esta disponible, el visitante llega al home de la misma tienda de forma limpia y privada.

<!-- PDF fuente: página 98 -->

## R7P2 - BACKEND Y PRIVACIDAD REST, realtime, archivos y notificaciones

### Fuente de verdad en servidor

- Los endpoints publicos resuelven la tienda real, la capacidad vigente y el slug canonico antes de entregar datos.

- El payload de participacion es cerrado: no confia en storeId, raffleId, nombres, estados ni metadatos enviados por el cliente.

- Se validan configuracion, enlace, fechas, estado, codigo, numero 00-99, telefono, duplicados y reglas de reingreso.

- La entrada y su notificacion se crean solo despues de completar el flujo canonico valido.

### Proteccion F12 y aislamiento

- REST anonimo de raffles y raffle_entries, incluidos list/view y mutaciones, responde 404 sin contenido privado.

- fields, filter, sort y expand no reabren las colecciones.

- El publico no recibe realtime de rifas o participaciones; los mensajes no autorizados se descartan.

- Las descargas de imagenes validan plan, tenant, rifa configurada y enlace habilitado.

- Cruces por ID, slug, relacion o archivo de otra tienda se ocultan como recurso inexistente.

### Datos que nunca se entregan al publico

| Dato | Proteccion |
|---|---|
| Codigo / hash | No se serializa ni aparece en HTML, REST o snapshot publico. |
| Telefono | No se muestra en pagina, notificacion, realtime ni respuesta publica. |
| Comprobante | No se entrega fuera del flujo administrativo autorizado. |
| Cancelaciones / metadatos | Permanecen privadas y filtradas por tenant. |
| Errores internos | Sin stack trace, rutas internas, consultas ni mensajes crudos. |

### Notificaciones

- Cada participacion valida crea una sola notificacion interna segura.

- Durante Free, Basico o plan vencido no se crea entrada ni notificacion.

- Downgrade/upgrade no reproduce notificaciones historicas ni duplica Resultado pendiente.

- Los avisos no muestran telefono, codigo de acceso ni comprobante.

#### Arquitectura y migraciones

La solucion reutiliza capacidades, permisos, hooks y rutas existentes. Se crearon o modificaron 0 migraciones.

<!-- PDF fuente: página 99 -->

## R7P2 - VALIDACION TECNICA Pruebas automaticas, runtime y limpieza

| Validacion | Resultado |
|---|---|
| Backend focal R7P2 | 12/12 aprobadas; 0 fallidas; 0 omitidas. |
| Frontend focal R7P2 | 11/11 aprobadas; 0 fallidas; 0 omitidas. |
| Runtime HTTP R7P2 | 1/1 aprobado con PocketBase y Astro reales, aislados y efimeros. |
| Backend completo | 576 aprobadas; 7 omitidas declaradas; 0 fallidas. |
| Frontend completo | 271/271 aprobadas; 0 fallidas. |
| Astro SSR build | Aprobado; solo warnings historicos de rutas dinamicas. |
| git diff --check | Aprobado, sin errores. |
| Runtime bloqueado | Basico 302 en rutas publicas, 404 en snapshot/enter/status/archivo y sin<br>notificacion. |
| Runtime Premium | Pagina, snapshot, participacion, estado e imagenes aprobados; restauracion<br>sin duplicados. |
| Migraciones | 0 creadas o modificadas. |
| Produccion/F12 | 0 source maps publicos y 0 marcadores internos nuevos. |
| Limpieza | 0 fixtures, 0 bases temporales, 0 procesos, 0 listeners y 0 archivos runtime<br>restantes. |

#### Reporte archivado

docs/tusenda84/reportes/R7P2-rifas-premium.md conserva hallazgos, arquitectura, archivos, pruebas, runtime, omisiones declaradas y estado final del repositorio.

#### Estado tecnico

Codex dejo R7P2 EN REVISION hasta la validacion manual. Kraken completo posteriormente todos los bloques y aprobo las correcciones R7P2-C1 y R7P2-C2; por tanto, el estado final de esta bitacora es COMPLETADO.

<!-- PDF fuente: página 100 -->

## R7P2 - VALIDACION MANUAL Pruebas manuales aprobadas por Kraken

| # | Prueba | Resultado confirmado |
|---|---|---|
| 1 | Principal Premium vigente | Modulo completo, guardado, premios, imagenes, participantes y<br>resultados. |
| 2 | Usuario Premium con<br>permiso | Navegacion, acceso y administracion dentro de su propia tienda. |
| 3 | Usuario Premium sin<br>permiso | Modulo oculto; URL, API, REST, realtime y archivos bloqueados. |
| 4 | Principal Basico / Free | Gate Premium dentro del panel, sin editor, flash ni datos privados. |
| 5 | Downgrade | Edicion, participacion, publicacion, imagenes y avisos bloqueados; datos<br>conservados. |
| 6 | Restauracion Premium | Configuracion, premios, participantes, resultados e imagenes reaparecen<br>sin duplicados. |
| 7 | Plan vencido / renovado | Mismo fail-closed que Basico y recuperacion completa al renovar. |
| 8 | Rifa apagada | Permanece apagada despues del downgrade/upgrade. |
| 9 | Home sin capacidad | Sin tarjetas, huecos ni datos serializados de Rifas. |
| 10 | Enlaces antiguos | /rifa y /rifa/[slug] redirigen al home de la misma tienda. |
| 11 | Participacion / estado | Intentos bloqueados sin entrada, notificacion ni revelacion de reserva. |
| 12 | Imagenes | URL antigua bloqueada durante downgrade y restaurada al volver a<br>Premium. |
| 13 | F12 / directas | REST, mutaciones, fields/filter/sort/expand, realtime y archivos<br>rechazados. |
| 14 | Aislamiento | Dos tiendas separadas; IDs, slugs e imagenes cruzadas no filtran datos. |
| 15 | Notificaciones | Sin duplicados ni datos sensibles; ninguna nueva durante plan<br>bloqueado. |
| 16 | Responsive | PC, 1024, 768, 430, 390 y 375 px sin desbordes ni roturas globales. |
| 17 | Flujo Premium completo | Codigo, seleccion, espera, cierre, ganador/no ganador y CTA del ganador<br>aprobados. |

#### Cierre manual

Kraken confirmo el 25 de julio de 2026 que todos los bloques de R7P2 quedaron completados en Source V121. No quedan pruebas manuales locales pendientes para Rifas Premium.

<!-- PDF fuente: página 101 -->

## CONTROL GENERAL Estado consolidado hasta Source V121

| ID | Seccion | Estado | Pendiente<br>principal |
|---|---|---|---|
| P7G4 | Capacidades globales | Completado local | Staging/production |
| F7P8 | Limite de fotos 2/4 | COMPLETADO | Staging en bloque |
| PZ-ORD-PRICE01 | Precios y totales de pedidos | Completado local | Staging/production |
| M7U2 | Mi equipo y permisos | COMPLETADO | Staging en bloque |
| V7E9 | Vencimiento Premium | COMPLETADO | Staging en bloque |
| L7Q1 | Landing QR Premium | COMPLETADO | Staging en bloque |
| R7P2 | Rifas Premium | COMPLETADO | Staging en bloque |
| S7P3 | Seguridad Premium | Siguiente punto | Gate de plan |

### Correccion operativa vigente

#### Ruta oficial del repositorio

E:\Trabajo\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt. La ruta anterior en C:\Users\workd\Desktop\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt queda obsoleta. La rama autorizada continua siendo dev.

### Continuidad aprobada

- R7P2 deja de formar parte de los pendientes funcionales.

- No se realiza push a dev ni staging con este cierre; el despliegue permanece para el bloque conjunto aprobado.

- El siguiente punto se trabajara en un chat independiente: S7P3 - Seguridad Premium.

- El primer prompt de S7P3 debe registrar documentalmente R7P2 como COMPLETADO antes de iniciar la nueva tarea.

- Los reportes se conservan en docs/tusenda84/reportes/ y los prompts continuan como archivos Markdown.

#### Siguiente seccion

S7P3 - Seguridad Premium: aplicar gate de plan y vigencia en frontend y backend, conservar configuracion, clientes, eventos, bloqueos y auditoria al bajar de plan, mostrar gate comercial al Principal Free/Basico/vencido, bloquear endpoints y acciones privadas sin capacidad, mantener el aislamiento por tienda y no ampliar el enforcement publico fuera del alcance aprobado.
