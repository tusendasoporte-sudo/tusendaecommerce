REPORTE FINAL — PROMPT ID: M7U2-C1

## 1. Preflight

- Repositorio confirmado: `E:\Trabajo\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt`.
- Rama confirmada: `dev`.
- El árbol estaba limpio antes de modificar.
- Se preservó el estado previo y no se descartó trabajo existente.
- Se trabajó sobre el repositorio abierto; V112 y cualquier ZIP quedaron fuera del flujo.
- No se ejecutaron `reset`, `clean`, `checkout`, `restore`, `stash`, cambio de rama, `add`, commit, push, merge ni deploy.

## 2. Causa real del menú

Cada usuario no principal renderizaba un `.store-team-menu` propio dentro de `.store-team-actions`. El contenedor de acciones era relativo y el menú era absoluto con `top: calc(100% + 6px)`. Por ello la última fila podía extender el área visual del documento, quedar fuera de la tarjeta y exigir scroll. La implementación tampoco calculaba el espacio disponible ni tenía una capa móvil independiente.

## 3. Solución flotante

Se sustituyeron los menús por fila por una única instancia `data-team-floating-menu`, externa a la lista y con `position: fixed`. El usuario y botón activos viven solo en memoria. La posición se calcula con `getBoundingClientRect()`, margen de viewport de 14 px y decisión `top`/`bottom` según el espacio inferior.

La capa actualiza `aria-expanded`, usa `aria-controls`, `aria-haspopup`, `role="menu"` y botones `role="menuitem"`. Admite flechas, Home, End y Escape. El foco inicial usa `preventScroll`; al cerrar por Escape, resize, backdrop o botón cerrar vuelve al disparador. El cleanup aborta listeners y temporizadores en `astro:before-swap`, `pagehide` y ante una reinicialización.

## 4. Comportamiento PC

- El menú no participa en el flujo y no cambia `scrollHeight` ni `scrollY`.
- Abre abajo cuando cabe y arriba cuando no hay espacio inferior.
- Permanece dentro del viewport y por encima de panel, header y campana.
- Cierra por acción, clic exterior, Escape, resize, desplazamiento real de página, apertura de diálogo y navegación.
- El scroll interno de una capa larga no se confunde con desplazamiento de página.
- `Editar usuario` conserva y abre el usuario objetivo correcto.

## 5. Comportamiento móvil

En 390 y 412 px la misma instancia se presenta como action sheet inferior con backdrop, cierre propio, separación sobre la barra móvil y `safe-area-inset-bottom`. Las acciones miden al menos 48 px, `Suspender` conserva tono de peligro y la barra inferior mantiene exactamente cuatro enlaces. No se detectó scroll horizontal.

## 6. Toast y temporizador

El aviso global en flujo se reemplazó por una sola instancia `data-team-toast` fija. Los éxitos usan `aria-live="polite"`, botón accesible, entrada/salida suave y autocierre a los 3800 ms; la retirada final ocurre 180 ms después de iniciar la salida. Un mensaje nuevo limpia el temporizador anterior y el cleanup también lo cancela.

El elemento usa `hidden` y `pointer-events: none` al retirarse, por lo que no intercepta clics. Los errores de edición y acciones siguen dentro de sus diálogos, sin autocierre prematuro. Se conservaron mensajes seguros para creación, actualización, suspensión, reactivación, sesiones y dispositivos.

## 7. Tarjeta por plan

La tercera tarjeta ahora usa `data-team-plan-card`, `data-plan-code` y un SVG inline decorativo. Consume exclusivamente `summary.plan`; no añade consultas ni cambia el contrato backend.

- Premium: degradado azul marino/intenso, texto blanco, borde luminoso, sombra y resplandor discretos, badge `PLAN ACTUAL`, `Plan Premium`, límite real y `Funciones Premium habilitadas`.
- Básico: variante blanca/azul limpia con `Plan Básico` y el límite normalizado.
- Free: variante blanca/slate con `Plan Free`.
- Desconocido: fallback neutral `Sin configurar` o etiqueta sanitizada disponible.

Las tres tarjetas conservan la misma altura en PC. En móvil la tarjeta ocupa el ancho disponible, el icono no tapa texto y no genera overflow.

## 8. Archivos modificados

- `frontend-powerzona/src/components/admin/StoreTeamView.astro`: markup y control de menú, toast, variantes de plan y ciclo de vida.
- `frontend-powerzona/src/styles/store-team.css`: capa fija, action sheet, toast, tarjeta por plan, responsive y reduced motion.
- `frontend-powerzona/tests/m7u2StoreTeam.test.mjs`: contratos focales M7U2-C1.
- `docs/tusenda84/reportes/M7U2-C1-pulido-visual-mi-equipo.md`: este reporte obligatorio.
- `docs/tusenda84/reportes/evidencias/M7U2-C1/*.png`: siete evidencias obligatorias.

No fue necesario tocar backend, endpoints, permisos, migraciones, reglas PocketBase ni otros módulos de producto.

## 9. Pruebas focales

`node --test tests/m7u2StoreTeam.test.mjs`, desde `frontend-powerzona`: 15 totales, 15 aprobadas, 0 fallidas y 0 omitidas.

Las tres pruebas C1 nuevas cubren instancia única y ausencia de menú absoluto por fila, usuario objetivo, `aria-expanded`, clic exterior, Escape, resize, scroll, decisión arriba/abajo, action sheet, peligro, timer único, cierre manual, persistencia de errores, `hidden` sin captura de clics y variantes Premium/Básico/Free/fallback sin consulta adicional.

## 10. Playwright estándar

Se utilizó Playwright estándar con Chromium headless, sin `playwright-interactive` ni `js_repl`, en 1440×900, 390×844 y 412×915. Astro y un backend HTTP en memoria se levantaron solo para la prueba y se cerraron en `finally`.

Resultado: 30 verificaciones aprobadas. Se comprobó apertura superior e inferior, invariancia de `scrollHeight`/`scrollY`, límites del viewport, usuario correcto, edición correcta, clic exterior implícito/backdrop, Escape, scroll, resize, cuatro botones móviles, targets de 48 px, ausencia de overflow horizontal, toast visible/autocerrado/manual, error persistente, alturas de resumen e icono móvil sin recorte.

## 11. Capturas

1. `01-menu-abre-arriba-pc.png`.
2. `02-menu-flotante-pc.png`.
3. `03-action-sheet-movil.png`.
4. `04-toast-verde-visible.png`.
5. `05-toast-verde-oculto.png`.
6. `06-plan-premium-pc.png`.
7. `07-plan-premium-movil.png`.

Las siete capturas finales son las únicas presentes en `docs/tusenda84/reportes/evidencias/M7U2-C1/`. No quedaron screenshots descartadas, traces, videos, storage states ni reportes HTML.

## 12. Build

`npm.cmd run build`, desde `frontend-powerzona`: aprobado. Astro SSR generó el servidor sin errores. Persistieron únicamente tres advertencias no bloqueantes ya conocidas: `getStaticPaths()` ignorado en las rutas dinámicas de subcategoría, categoría y producto. Tras validar, se eliminaron `frontend-powerzona/dist` y `frontend-powerzona/.astro`.

## 13. Suites

| Suite | Total | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|---:|
| Frontend focal M7U2 | 15 | 15 | 0 | 0 |
| Frontend completa | 203 | 203 | 0 | 0 |
| Backend focal M7U2 | 33 | 32 | 0 | 1 |
| Playwright visual | 30 verificaciones | 30 | 0 | 0 |

La única omisión backend corresponde al caso HTTP que exige `PZ_M7U2_BASE_URL`, `PZ_M7U2_SUPER_EMAIL` y `PZ_M7U2_SUPER_PASSWORD`. No se modificó backend; las 32 pruebas puras focales aprobaron y no se justificaba ejecutar la suite backend completa.

## 14. No regresiones

No se alteraron creación, edición, permisos, plantillas, suspensión/reactivación, temporales, sesiones, dispositivos, auditoría, protección del principal, límites por plan, downgrade/upgrade, aislamiento, V7E9, sidebar, campana, rutas, diálogos ni barra inferior. La suite frontend completa aprobó 203/203.

No se añadieron consultas, IDs internos nuevos en HTML, secretos, tokens, permisos completos, logs, TODO, comentarios de debug ni imágenes externas.

## 15. Limpieza

- Fixtures persistentes `M7U2C1QA_`: 0. Los datos visuales existieron solo en memoria y el servidor se cerró.
- Procesos temporales Node, Astro, PocketBase y Chromium iniciados por la tarea: 0.
- Script Playwright temporal: eliminado.
- `frontend-powerzona/dist`, `frontend-powerzona/.astro`, `.tmp`, `playwright-report` y `test-results`: ausentes.
- Evidencias finales: exactamente 7 PNG.
- Los procesos Chrome preexistentes del 18/07/2026 se preservaron.

## 16. Git final

- Rama final: `dev`.
- `git diff --check`: aprobado; solo mostró avisos informativos de futura conversión LF/CRLF, sin errores de whitespace.
- El estado final contiene únicamente los tres archivos frontend focales, este reporte y la carpeta de siete evidencias.
- No aparecen `pb_data`, `node_modules`, `dist`, `.astro` de salida del proyecto, `.tmp`, credenciales, perfiles Chromium ni archivos temporales.
- Todo queda deliberadamente sin stage para revisión.

## 17. Confirmación de acciones no realizadas

No hubo commit, push, merge, deploy, cambio de rama, cambios en Coolify, cambios en Cloudflare ni actualización de la bitácora PDF.

## 18. Pendientes reales

M7U2-C1 y M7U2 permanecen en revisión. La eliminación permanente, actividad general del equipo, última modificación por usuario y reporte individual de actividad siguen fuera de alcance y no se implementaron. Falta la validación visual y confirmación expresa de Kraken.

EN REVISIÓN — M7U2-C1 PENDIENTE DE VALIDACIÓN VISUAL Y CONFIRMACIÓN DE KRAKEN
