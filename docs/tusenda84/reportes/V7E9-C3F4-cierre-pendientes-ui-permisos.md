REPORTE FINAL — PROMPT ID: V7E9-C3F4

## 1. Preflight

- Repositorio confirmado: `E:\Trabajo\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt`.
- Rama confirmada: `dev`.
- HEAD conservado durante la tarea: `6092137c8c62f4cb78fbfbd94a0b1c098984f4f0`.
- El árbol comenzó limpio. La continuidad V118 se preservó y no se descartó trabajo existente.
- Se trabajó directamente sobre el repositorio real. No se importó, descomprimió ni usó ningún ZIP como source.
- Se ejecutaron `Get-Location`, `git rev-parse --show-toplevel`, `git branch --show-current`, `git status --short`, `git diff --name-only` y `git diff --stat`.

## 2. Causa del checkbox de producto

- El editor sincronizaba el `checked` desde la visibilidad efectiva. Eso mezclaba la intención persistida `active` con el bloqueo derivado por vencimiento y podía volver a marcar el control después de una interacción.
- Se centralizó el estado del editor en `getProductEditorVisibilityState`: `manual_active`, visibilidad efectiva, `checked`, `disabled` y bloqueo por vencimiento son conceptos separados.
- Un producto vigente y autorizado permite desmarcar el checkbox y el guardado envía realmente `active=false`.
- Un padre general vencido continúa desmarcado y bloqueado sin convertir automáticamente `active=true` en `false`.
- Un producto manualmente oculto permanece oculto aunque también venza o se corrija su fecha.

## 3. Causa del checkbox de variación

- La variación sufría la misma mezcla entre `active` manual y el estado efectivo derivado por vencimiento o modo del padre.
- `getVariationEditorVisibilityState` separa ahora intención manual, estado efectivo, modo conservado, bloqueo de vencimiento, `checked` y `disabled`.
- Una variación vigente puede desmarcarse y persistir `active=false`; al reabrir conserva el estado `Oculta`.
- Una variación vencida o conservada sigue desmarcada/bloqueada sin sobrescribir su intención manual.
- Corregir la fecha restaura `Activa` únicamente si `active` seguía en `true`; una variación manualmente oculta permanece `Oculta`.

## 4. Persistencia manual frente a estado efectivo

- `active` continúa siendo la intención manual persistida en producto y variación.
- Los estados `VISIBLE`, `VENCIDO`, `OCULTO`, `Activa`, `Vencida`, `Oculta` y `Conservada` siguen siendo derivados.
- El editor normaliza también valores serializados como `'false'` y envía el cambio manual explícito, sin derivarlo del badge efectivo.
- Guardar precio, stock, imágenes u otros campos en una unidad vencida no inventa una ocultación manual.
- Las defensas backend existentes siguen rechazando `active=true` en una unidad vencida y aceptan/persisten `active=false`; no fue necesario cambiar backend.

## 5. Última modificación

- El listado de Productos muestra únicamente `Última modificación: [fecha y hora]`, sin actor, resumen ni lista de campos.
- El encabezado de Editar producto usa el mismo componente y la misma fuente.
- Se prioriza el timestamp del último evento de auditoría y se usa `product.updated` como fallback seguro.
- El formato usa fecha civil y zona `America/Havana`.
- Para usuarios sin acceso al detalle de auditoría, el endpoint existente conserva su redacción y la superficie sólo consume la fecha necesaria.

## 6. Actividad del equipo sin Abrir

- Se eliminó `Abrir` de cada fila y también `Abrir elemento` del diálogo de detalle.
- Para eventos de producto quedan `Ver historial` y `Ver detalle`.
- Los eventos sin historial conservan su acción específica de cambio/revisión; no quedó columna, hueco ni acción duplicada.
- Se mantuvieron el wrap móvil y la alineación de acciones existente.

## 7. Textos simplificados

- Se agregó un resumen compacto para corrección/cambio de vencimiento, visibilidad manual, precio, stock y actualización de variación.
- Cuando el encabezado ya identifica el producto o variación, el título deja de repetir `de [nombre completo]`.
- Se preservan actor, sección, severidad, revisión, fechas y valores antes/después.
- Los estados de recurso faltante o eliminado siguen informándose como contenido, no como una acción `Abrir`.

## 8. Regreso contextual

- Se agregó un helper central con allowlist cerrada para `from=products`, `from=expirations` y `from=team-activity`.
- Historial resuelve un regreso interno al origen real y usa Productos como fallback seguro.
- No se acepta `returnUrl`, origen externo ni ruta libre enviada por el cliente.
- Actividad conserva filtros permitidos, búsqueda, revisión, severidad, fechas y página; Vencimientos conserva vista, rango, búsqueda, página y variación seleccionada.
- El filtro individual de variación se mantiene al abrir y al regresar.

## 9. Planes sólo para Principal

- `Mi cuenta` obtiene el contexto autoritativo vigente mediante `getStoreAccessContext`.
- La tarjeta y `resolveStorePlanPresentation` sólo se resuelven/renderizan cuando `access.is_primary_admin === true`.
- Un usuario adicional no recibe en el HTML SSR el detalle de plan de esa tarjeta; no se usa ocultación por CSS, rol genérico ni nombre de plantilla.
- El Principal conserva plan actual, estado/vigencia y opciones/capacidades ya existentes.

## 10. Accordions de permisos

- Los grupos reales de permisos de Editar usuario se renderizan como botones de accordion cerrados por defecto.
- Cada encabezado presenta `X de Y activos` y actualiza su contador al aplicar plantilla, marcar manualmente o resolver dependencias.
- Abrir/cerrar no altera selecciones; los flujos de plantilla y `Personalizado` se conservan.
- Un error de validación abre el grupo correspondiente, o el primer grupo de permisos como fallback.
- Se implementaron `aria-expanded`, `aria-controls`, botones nativos con teclado, foco visible, indicador textual/visual y estilos móviles sin ancho rígido.

## 11. Filtros 1/2/3 meses

- En PC, los tres controles de Vencimientos permanecen en una línea, con altura/espaciado coherentes y texto sin corte.
- En móvil se conserva el orden mediante una grilla controlada de tres controles completos, sin scroll horizontal.
- No se modificó la lógica del rango ni el estado activo.

## 12. Pruebas frontend focales

- Comando:
  `node --experimental-strip-types --test tests/v7e9C3F4Frontend.test.mjs tests/v7e9C3F3Frontend.test.mjs tests/m7u2StoreTeam.test.mjs tests/m7u2c2StoreActivity.test.mjs tests/storePlanPresentation.test.mjs`
- Resultado: 58 aprobadas, 0 fallidas.
- Cobertura C3F4: estados manual/efectivo de ambos checkboxes, `active=false`, vencidos/conservados, auditoría y fallback, Habana, ausencia de actor/resumen, eliminación de Abrir, textos compactos, allowlist de retorno, Planes sólo Principal, accordions y filtros responsive.
- Se actualizaron expectativas heredadas C3F2-R2/C3F3 únicamente donde el comportamiento aprobado por C3F4 reemplazó la acción `Abrir` o el `checked` derivado.

## 13. Backend y SSR

- Comando focal combinado:
  `node --test tests/pz_v7e9_product_expiration.test.cjs tests/pz_store_team_permissions.test.cjs tests/pz_store_activity.test.cjs tests/pz_store_plans.test.cjs`
- Resultado: 96 aprobadas, 0 fallidas.
- Comando adicional:
  `node --test tests/pz_v7e9_c3f3.test.cjs`
- Resultado: 5 aprobadas, 0 fallidas.
- Se cubrieron persistencia/defensa de estados, vencidos, permisos, planes, auditoría, endpoints privados y aislamiento.
- SSR fue modificado sólo en `Mi cuenta`; el gating usa identidad principal autoritativa antes de calcular o renderizar el plan.
- No se tocó source backend, por lo que no correspondió repetir la suite backend completa; sí se ejecutaron sus pruebas focales y el runtime relevante.

## 14. Runtime focal

- Comando: `node --test tests/pz_v7e9_c3_http_runtime.test.cjs`.
- Resultado: 1 aprobada, 0 fallidas.
- El runtime temporal existente validó estados manuales/efectivos de producto y variación, persistencia, protección de vencidos, F12, permisos, segunda tienda, aislamiento y cleanup en `finally`.
- El runtime reutilizado conserva su prefijo de continuidad `V7E9C3F3QA_<timestamp>`; C3F4 no creó fixtures propios.
- La autorización de Principal/adicional se cubrió con el contrato backend focal y el gating SSR; la comprobación visual/F12 de la tarjeta queda expresamente pendiente de Kraken.

## 15. Suites

- Suite frontend completa: `node --experimental-strip-types --test`.
- Resultado final: 254 aprobadas, 0 fallidas, 0 omitidas.
- Node detectado: `v24.16.0`.
- La primera repetición completa señaló una expectativa heredada que aún exigía `Abrir`; se actualizó al nuevo contrato y la repetición final pasó íntegra.

## 16. Build

- Comando final: `npm.cmd run build` desde `frontend-powerzona`.
- Resultado: Astro SSR compiló correctamente.
- Persisten tres avisos no bloqueantes ya conocidos de `getStaticPaths()` ignorado en rutas dinámicas de categoría, subcategoría y producto.
- El intento literal `npm run build` no pudo iniciar `npm.ps1` por la política local de PowerShell; `npm.cmd` ejecutó el mismo script correctamente sin modificar esa política.

## 17. Migraciones

- No se creó ninguna migración.
- Los cambios usan helpers frontend/SSR, endpoints existentes y autorización vigente.
- No se alteraron colecciones, esquemas ni fórmulas económicas.

## 18. Protección production/F12

- La revisión estática de los sources modificados no encontró `TODO`, `FIXME`, `console.log/info/warn/debug`, `returnUrl`, `Abrir elemento` ni hooks de depuración.
- No se agregaron credenciales, tokens, IDs internos visibles, endpoints públicos, bypass de `active` ni rutas de otro tenant.
- El retorno de Historial acepta sólo claves y parámetros allowlisted.
- La suite conserva la prueba que impide serializar el bearer SSR en `define:vars`.
- El build generado fue validado y luego eliminado; no quedó `dist` ni source map público en el árbol.

## 19. Limpieza

- `0 fixtures V7E9C3F4QA_`.
- `0 procesos temporales` Node/PocketBase pertenecientes a esta tarea.
- El PocketBase temporal cerró mediante `finally`; no se cerraron navegadores ni procesos preexistentes.
- Se eliminaron los targets generados `frontend-powerzona/dist`, `frontend-powerzona/.astro` y el `.tmp` vacío de backend.
- Quedaron en cero los targets `dist`, `.astro`, `.tmp`, `test-results` y `playwright-report` fuera de dependencias.

## 20. Git

- `git diff --check`: correcto, sin errores de whitespace.
- El diff contiene únicamente source, estilos, pruebas y este reporte.
- No contiene `pb_data`, `node_modules`, build, bases, perfiles, credenciales ni archivos temporales.
- Los avisos LF/CRLF de Git son informativos de la configuración local y no representan errores del diff.
- Se ejecutaron al cierre `git status --short`, `git diff --name-only` y `git diff --stat`.

## 21. No commit/push/deploy

- No se ejecutó `git add`, commit, push, merge, cambio de rama, deploy ni staging.
- No se modificó Coolify, Cloudflare ni producción.
- No se actualizó la bitácora PDF.

## 22. Limitaciones y transparencia de QA

- No se realizó validación visual manual ni matriz extensa de Playwright.
- Al aislar una expectativa heredada se ejecutó por error una única prueba visual automatizada existente, `tests/m7u2C2F1.visual.mjs`. Pasó, cerró sus procesos y limpió sus fixtures; sus siete evidencias generadas fueron devueltas exactamente al estado limpio del preflight. No se usaron como criterio de aprobación de C3F4.
- La aceptación visual en navegadores/dispositivos reales y la confirmación funcional final siguen a cargo de Kraken.

## 23. PRUEBAS MANUALES PENDIENTES DE KRAKEN

- Ocultar y volver a mostrar un producto vigente desde Editar producto; reabrirlo y confirmar listado, menú kebab y desaparición/restauración en tienda pública.
- Ocultar y volver a mostrar una variación vigente desde Editar variación; reabrirla y confirmar tienda pública y Pedidos Admin.
- Confirmar que producto/variación vencidos siguen bloqueados y que corregir fecha respeta la intención manual previa.
- Comparar visualmente `Última modificación` entre listado y editor.
- Revisar Actividad del equipo sin ninguna acción Abrir, textos compactos y valores antes/después en PC/móvil.
- Abrir Historial desde Productos, Vencimientos y Actividad; confirmar regreso, filtros, página y variación.
- Inspeccionar `Mi cuenta` y F12 como Principal y usuario adicional, confirmando que el adicional no recibe Planes.
- Probar accordions, contadores, plantilla, dependencias, error, teclado y foco en PC/móvil.
- Confirmar la alineación y estado activo de `1 mes / 2 meses / 3 meses` en anchos reales.
- Dar confirmación expresa de cierre de V7E9-C3F4.

EN REVISIÓN — V7E9 PENDIENTE DE PRUEBAS MANUALES Y CONFIRMACIÓN DE KRAKEN
