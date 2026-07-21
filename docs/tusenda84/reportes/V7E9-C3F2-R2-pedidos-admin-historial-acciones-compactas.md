REPORTE FINAL — PROMPT ID: V7E9-C3F2-R2

## 1. Preflight

- Repositorio confirmado: `E:\Trabajo\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt`.
- Rama confirmada y conservada: `dev`.
- HEAD conservado: `693222e3b5640852f3e649d3015e9008360427c4`.
- El árbol ya contenía cambios modificados y archivos nuevos de la continuidad V116/V7E9-C3F1. Se preservaron; no se descartó, revirtió ni sobrescribió trabajo previo.
- Se trabajó directamente sobre el repositorio abierto. No se importó, descomprimió ni usó V116 u otro ZIP como source.

## 2. Causa de Pedidos Admin

`orders.astro` todavía asociaba el modo comercial con la existencia de registros de variación. Un producto con variaciones conservadas y `has_variations=false` mostraba selector, exigía una variación y terminaba enviando un request que el backend canónico rechazaba correctamente.

Se separaron definitivamente el modo del producto y la existencia histórica de sus variaciones. También se detectó y corrigió durante QA un bloque de “Producto no disponible” que había quedado fuera del selector y podía afectar el resumen de una orden vacía.

## 3. Fuente de verdad `has_variations`

La decisión central es `Boolean(product.has_variations)`. `frontend-powerzona/src/lib/adminStoreProducts.ts` concentra el modo, el estado efectivo, la fecha efectiva, el precio de la unidad y el filtrado de variaciones vendibles.

Pedidos Admin ya no activa el modo por `variations.length`, stock, fotos, fechas ni registros conservados. Al abrir el panel vuelve a consultar el catálogo y limpia la selección previa.

## 4. Estados efectivos

Se derivan sin sobrescribir `active`:

- `active`: intención manual activa, modo por variaciones y fecha vacía/futura.
- `hidden_expired`: intención manual activa, pero fecha efectiva vencida.
- `hidden_manual`: `active=false`; si además venció, incluye indicador secundario `Vencida`.
- `disabled_by_parent_mode`: variación conservada mientras `has_variations=false`.

El texto neutral final es `Conservada — variaciones desactivadas`. La derivación existe tanto en el helper frontend como en `pz_product_commerce_lib.js`.

## 5. Activación bloqueada

El hook oficial evalúa el registro final combinado. Rechaza una creación o activación cuyo resultado sea `active=true` con fecha vencida mediante el contrato seguro `variation_expired_cannot_activate` —PocketBase puede materializarlo como 400 equivalente al 409 sugerido—.

La validación no depende del orden de los campos. Se aplica también a PATCH directo/F12 y conserva aislamiento de tienda, producto, plan y permisos.

## 6. Restauración segura

- Una variación manualmente activa que vence vuelve a `Activa` al borrar o corregir su fecha; `active` nunca fue cambiado automáticamente.
- Una variación manualmente oculta permanece oculta al corregir la fecha.
- Corregir a fecha futura o vacía y activar en la misma operación está permitido.
- Corregir una variación activa genera la transición `product_unit_reactivated`.
- Corregir una variación manualmente oculta registra la corrección, pero no la activa.

## 7. UI Admin

Productos muestra badges derivados, `Oculta por vencimiento`, `Oculta manualmente`, `Vencida` y el estado neutral del modo padre. La variación vencida ofrece `Corregir fecha`; no ofrece `Activar`. El toggle, el cambio por teclado/Enter y el guardado del formulario interceptan el intento, muestran el mensaje aprobado y enfocan el campo de fecha.

El backend permanece como defensa final aunque el cliente sea omitido o manipulado.

## 8. Payload de Pedidos

Con `has_variations=false`, el selector se oculta, la selección anterior se vacía y el payload es `{ product_id, quantity }`; `variation_id` se omite, no se envía vacío. Precio, stock, preventa y vencimiento se estiman desde el padre.

Con `has_variations=true`, solo se muestran variaciones activas, vigentes, con relación correcta, precio válido y stock/preventa admisible. Sin una unidad vendible se muestra `Producto no disponible`. El payload incluye la variación válida y nunca usa el padre como unidad.

## 9. Backend

Se mantuvo el motor económico PZ-ORD-PRICE01. La disponibilidad sigue resolviéndose con precio, oferta, stock, preventa, tenant, modo y fecha canónicos del servidor. La prueba real confirmó rechazo de padre sin variación en modo contenedor, variación retenida en modo general, unidad vencida, unidad oculta y cruce de tenant.

La escritura REST directa de `order_items` continúa cerrada y no persistió precio/nombre manipulado.

## 10. Alertas

Se conservaron los umbrales `90/60/30/0`, sin alerta de siete días. El padre queda fuera cuando usa variaciones. Una variación activa vencida permanece en Vencidos y deja de venderse sin cambiar `active`; una variación manualmente oculta conserva fecha e historial, pero no crea ciclos/alertas operativas ni aparece como unidad activa.

## 11. Actividad

Las mutaciones exitosas usan `variation_manual_hidden`, `variation_manual_activated`, `variation_expiration_corrected`, `product_unit_expired` y `product_unit_reactivated`. Los eventos de variación guardan snapshots del producto padre y de la propia variación.

Una activación rechazada no crea actividad de éxito. No se añadió `variation_activation_blocked_expired` como falso éxito ni como evento fallido ruidoso, coherente con el patrón vigente; el error se devuelve de forma segura al actor.

## 12. Pruebas backend

Comando focal final:

```powershell
node --test backend-powerzona/tests/pz_store_activity.test.cjs backend-powerzona/tests/pz_v7e9_product_expiration.test.cjs backend-powerzona/tests/pz_v7e9_c3f2_r2.test.cjs
```

Resultado: `54/54` aprobadas, `0` fallas. Cubren estados efectivos, operación final, fechas futuras/vacías, intención manual, F12, alertas, actividad especializada, snapshots, rutas allowlist y redacción del historial.

## 13. Frontend

Comando focal final:

```powershell
node --experimental-strip-types --test frontend-powerzona/tests/m7u2C3FrontendPermissions.test.mjs frontend-powerzona/tests/m7u2c2StoreActivity.test.mjs frontend-powerzona/tests/v7e9C3F2R2Frontend.test.mjs
```

Resultado: `20/20` aprobadas. Incluye fuente `has_variations`, limpieza de selección, payload sin `variation_id`, selector sin unidades, badges, bloqueo, rutas de historial, ausencia de fallback a Mi equipo, sesión sin almacenamiento local y acciones compactas.

## 14. Runtime HTTP real

Comando focal:

```powershell
node --test backend-powerzona/tests/pz_v7e9_c3_http_runtime.test.cjs
```

Resultado: `1/1` aprobado; también pasó dentro de la suite backend final. PocketBase temporal usó el prefijo `V7E9C3F2R2QA_<timestamp>`, migró `up/down/up` y validó:

- Pedidos Admin agrega el padre sin `variation_id` aunque existan variaciones conservadas;
- el mismo flujo rechaza el ID retenido cuando el modo está apagado;
- el modo por variaciones exige selección, rechaza oculta/vencida y acepta la vigente;
- precio padre y precio de variación son canónicos;
- activar vencida falla; corregir y activar funciona; corregir sin activar conserva `active=false`;
- no quedan `order_items` con unidades no vendibles ni valores manipulados;
- historial paginado de 20, filtros, variación contextual, actor/producto/variación eliminados, permisos parciales y segunda tienda;
- consultar historial no genera actividad de éxito;
- cleanup del servidor y base temporal dentro de `finally`.

## 15. Migraciones

La migración `1784678400_product_activity_parent_snapshots.js` era necesaria para asociar eventos de variaciones al producto sin inferencias ni consultas N+1. Agrega campos privados `parent_product_id_snapshot` y `variation_id_snapshot`, además del índice por tienda/padre/fecha.

El backfill es conservador: asocia productos y variaciones todavía resolubles, no inventa relaciones para eventos antiguos de variaciones ya eliminadas. `up`, rollback y nuevo `up` pasaron contra la base temporal; el down retira únicamente campos e índice de esta entrega.

## 16. Suites

Backend completo:

```powershell
$tests = (Get-ChildItem backend-powerzona/tests -Filter *.test.cjs -File).FullName
node --test $tests
```

Resultado: `556` pruebas, `549` aprobadas, `0` fallas y `7` omitidas por requerir runtimes externos no configurados.

Frontend completo:

```powershell
$tests = (Get-ChildItem frontend-powerzona/tests -Filter *.test.mjs -File).FullName
node --experimental-strip-types --test $tests
```

Resultado: `240/240` aprobadas, `0` fallas y `0` omitidas.

## 17. Build

Comando real en Windows:

```powershell
cd frontend-powerzona
npm.cmd run build
```

Astro SSR finalizó correctamente en `13.71 s`. Se conservaron tres avisos no bloqueantes ya conocidos sobre `getStaticPaths()` ignorado en páginas dinámicas de categoría, subcategoría y producto. La inspección produjo `0` source maps públicos.

## 18. Limpieza

- `0` fixtures `V7E9C3F2R2QA_`.
- `0` procesos con el prefijo o runtime focal.
- PocketBase temporal fue cerrado por el `finally`.
- Eliminados `frontend-powerzona/dist`, `frontend-powerzona/.astro` y `backend-powerzona/.tmp`.
- `test-results` y `playwright-report` están ausentes en raíz, frontend y backend.
- No se tocó `pb_data`, `node_modules`, procesos oficiales ni datos persistentes.

## 19. Git

- Rama final: `dev`.
- HEAD sin alterar: `693222e3b5640852f3e649d3015e9008360427c4`.
- El árbol continúa sucio de forma esperada por la continuidad V116/V7E9 y esta corrección; los cambios previos permanecen preservados.
- `git diff --check`: aprobado; únicamente se mostraron avisos informativos LF/CRLF de Windows.
- Índice/staging vacío y sin artefactos generados, bases, credenciales o perfiles de navegador.

## 20. No commit, push ni deploy

No se ejecutó `git add`, commit, push, merge, cambio de rama, stash, deploy, staging, Coolify ni Cloudflare. Tampoco se usaron comandos Git destructivos.

## 21. Historial individual del producto

Se añadió `/t/[storeSlug]/admin/products/[productId]/history`, con encabezado seguro, imagen, nombre, categoría, estado, modalidad, enlace de edición y retorno allowlisted a Productos o Vencimientos.

Los endpoints privados `summary`, `list` y `detail` resuelven la tienda desde el actor, filtran en backend, paginan, sanean snapshots y usan consultas agrupadas sin búsqueda por actor por cada evento. La vista presenta actor, fecha, acción, elemento, resumen, antes/después y variación, sin JSON crudo, PII de clientes ni IDs como texto visible.

## 22. Botones y apertura contextual

`Historial` está visible en el listado de Productos, en Editar producto y en Vencimientos. Las filas de variación abren `?variation=[variationId]`; backend valida pertenencia y la página permite volver a `Todo el producto` o elegir otra variación propia.

Se eliminaron los destinos residuales `Mi equipo → Actividad del equipo` de Productos y Vencimientos. El retorno usa únicamente `from=products|expirations`.

## 23. Permisos y redacción del historial

El administrador principal recibe el historial completo. Los adicionales requieren `catalog.view`; precio, stock, vencimientos, imágenes y categoría se redactan según sus permisos. Un perfil con solo vencimientos queda forzado al scope de vencimientos y no puede abrir por `detail` un evento económico. Un lector sin vencimientos no puede abrir el detalle de vencimiento.

Otra tienda responde de forma segura; tampoco se puede combinar el ID de un evento con otro producto. Los snapshots conservan actor, producto y variación después de su eliminación.

## 24. Acciones compactas en Actividad del equipo

Para recursos de producto, la primera acción visible dice exactamente `Abrir`; el nombre completo queda en la tarjeta y en un `aria-label` saneado. `Ver historial` abre la página individual y `Ver detalle` conserva el detalle contextual. La apertura de una variación resuelve el editor de su producto padre mediante snapshot allowlisted.

## 25. Responsive de las tres acciones

En PC las acciones usan flex sin wrap, etiquetas cortas, altura consistente y `min-width: 0`. El nombre admite máximo visual de dos líneas y conserva `title`. En móvil las acciones envuelven de forma ordenada, sin ancho rígido, solapamiento ni scroll horizontal propio.

## 26. Limitaciones

- No se ejecutaron pruebas visuales manuales ni una matriz Playwright, por instrucción expresa del prompt.
- Siete pruebas generales permanecen omitidas porque necesitan URLs o credenciales de runtimes externos; el PocketBase temporal obligatorio sí pasó.
- Eventos de variaciones eliminadas antes de esta migración que nunca guardaron padre y cuyo registro ya no existe no se asocian artificialmente; desde esta entrega los snapshots nuevos sí soportan eliminación histórica.
- Los tres avisos de rutas dinámicas del build son preexistentes y no bloquean SSR.

## 27. PRUEBAS MANUALES PENDIENTES DE KRAKEN

Queda pendiente la confirmación visual/operativa de Kraken sobre:

1. Producto con `has_variations=false` y variaciones conservadas: selector oculto, precio/stock padre y agregado correcto.
2. Producto con `has_variations=true`: selector con solo unidades vendibles y mensaje cuando queda vacío.
3. Badges `Oculta por vencimiento`, `Oculta manualmente`, `Vencida` y `Conservada — variaciones desactivadas`.
4. Acción `Corregir fecha`, foco en el campo y bloqueo por mouse, teclado y Enter.
5. Corrección con y sin activación, verificando que la intención manual se conserva.
6. Botones Historial en Productos, editor y cada contexto de Vencimientos.
7. Prefiltro por variación, cambio a Todo, filtros, paginación y retornos contextuales.
8. Perfiles adicionales con y sin precio, stock, vencimientos, imágenes y categoría.
9. Actividad del equipo con nombre largo: `Abrir`, `Ver historial`, `Ver detalle` alineados en PC y envueltos en móvil.
10. Inspección F12 final: sin `variation_id` vacío, IDs ajenos, fechas privadas públicas, precios manipulables, JSON crudo, tokens ni redirects a Mi equipo.

EN REVISIÓN — V7E9 PENDIENTE DE PRUEBAS MANUALES Y CONFIRMACIÓN DE KRAKEN
