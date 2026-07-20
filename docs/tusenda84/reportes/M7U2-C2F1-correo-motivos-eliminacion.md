REPORTE FINAL — PROMPT ID: M7U2-C2F1

## 1. Preflight

- Fecha de ejecución: 20 de julio de 2026, zona `America/New_York`.
- Repositorio confirmado: `E:\Trabajo\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt`.
- Rama confirmada antes de modificar: `dev`.
- HEAD inicial: `72762a8ea98e46fcac6ee1f1864bf71f1d0bc4f2`.
- Estado inicial preservado: 36 archivos tracked modificados y 18 entradas untracked (54 entradas); diff tracked acumulado de 36 archivos, 1,769 inserciones y 254 eliminaciones.
- Los cambios sin commit de M7U2-C1/M7U2-C2 se conservaron. No se usó, importó ni descomprimió ningún ZIP Vxx.

## 2. Causa del problema

La respuesta privada de `Mi equipo` ya transportaba el correo del usuario autorizado, pero la vista lo convertía deliberadamente a una representación enmascarada. Eso hacía imposible conocer desde la propia pantalla el valor exacto que el backend exigía para confirmar la eliminación. Además, el contrato Store heredaba un motivo libre, sin catálogo cerrado ni paridad verificable entre cliente y servidor.

## 3. Correo autorizado

- El endpoint de equipo conserva el gate backend del Administrador principal y limita la consulta a la tienda resuelta desde su sesión.
- La fila PC y la tarjeta móvil renderizan el correo íntegro, seleccionable y escapado. Los correos largos usan ellipsis sin provocar scroll; `title` se agrega únicamente cuando existe truncamiento visual real.
- El diálogo muestra el correo íntegro en un bloque separado y ofrece `Copiar correo`, con Clipboard API y fallback de selección/copia.
- Copiar sólo produce feedback temporal. El campo de confirmación comienza vacío, no se completa internamente y se limpia junto con el estado de copia al cerrar, reabrir o cambiar de objetivo.
- No se agregaron correos a `data-*`, logs, notificaciones, actividad general ni HTML público.

## 4. Contrato backend

El endpoint Store acepta exclusivamente:

```json
{
  "user_id": "...",
  "confirmation_email": "correo@completo.com",
  "reason_code": "access_no_longer_needed",
  "reason_detail": ""
}
```

El payload es exacto: campos adicionales, incluido el antiguo `reason`, se rechazan. El correo se normaliza con `trim` y lowercase en el límite de entrada y vuelve a compararse dentro de la transacción contra el snapshot del usuario objetivo. No se aceptan correo ajeno, valor enmascarado, alias parcial ni ID. El backend vuelve a validar código y detalle en el servicio compartido, sin confiar en la validación del parser ni del cliente.

La eliminación Master existente conserva su motivo libre de 8 a 500 caracteres. Store usa el catálogo cerrado. Ambos flujos convergen en el mismo servicio transaccional de borrado y mantienen las protecciones del principal, self delete, último administrador, sesiones, dispositivos, relaciones, rollback e historial.

## 5. Catálogo de motivos

| Código | Etiqueta resuelta por servidor |
| --- | --- |
| `employment_ended` | Fin de relación laboral o colaboración |
| `access_no_longer_needed` | Acceso ya no necesario |
| `created_by_mistake` | Cuenta creada por error |
| `duplicate_account` | Usuario duplicado |
| `role_or_responsibility_changed` | Cambio de responsable o puesto |
| `internal_policy_violation` | Incumplimiento de políticas internas |
| `security_incident` | Riesgo o incidente de seguridad |
| `other` | Otro |

El catálogo está centralizado en un módulo backend y otro frontend, ambos inmutables y cubiertos por una prueba de paridad exacta. El cliente sólo envía el código; la etiqueta nunca forma parte del payload confiable.

## 6. Selector

El diálogo ofrece un placeholder inválido y las ocho opciones exactas del catálogo. El botón de eliminación permanece deshabilitado hasta que coincidan el correo normalizado, un código válido y, cuando corresponda, el detalle. El selector y el footer no producen overflow en 1440×900, 390×844 ni 412×915. El estado ocupado deshabilita controles y evita cierre por botón, cancelación o Escape mientras la petición está en curso; los errores backend se muestran dentro del diálogo.

## 7. Validación `Otro`

`Otro` revela un textarea obligatorio de 8 a 300 caracteres. Se aplica trim, se rechazan vacío/espacios, siete caracteres, más de 300 y ángulos de HTML. Cambiar de `Otro` a un motivo cerrado oculta y vacía el detalle; el backend también normaliza a vacío cualquier detalle recibido para un motivo cerrado, evitando texto libre innecesario. Reabrir el diálogo reinicia correo, motivo, detalle, feedback y target visual.

## 8. Auditoría

- El evento especializado guarda JSON estructurado y saneado dentro del campo de texto `store_user_audit.reason`: `reason_code`, `reason_label_snapshot` y `reason_detail`.
- La etiqueta se resuelve en servidor. No se acepta `reason_label_snapshot` desde el cliente.
- La actividad central conserva el código, el snapshot de etiqueta y el detalle sólo si existe, junto con actor, usuario eliminado, fecha y snapshots no sensibles.
- La clave fuente `team:user_deleted:<audit_id>` conserva idempotencia y la transacción comprueba que existe un solo evento central asociado.
- `Actividad del equipo` muestra primero `Motivo` y luego `Detalle`; para la prueba predefinida mostró `Usuario eliminado` y `Motivo: Acceso ya no necesario`.
- No se creó una migración: el campo de texto existente admite de forma segura el JSON acotado, y el parser mantiene compatibilidad de lectura con motivos Master históricos.

## 9. Seguridad

- El acceso Store sigue exigiendo sesión válida, dispositivo permitido, plan habilitado, pertenencia a la tienda y condición de Administrador principal en backend.
- Runtime confirmó que Store Staff, un secundario y otra tienda no pueden listar ni eliminar el objetivo; tampoco reciben el correo de la tienda ajena.
- La allowlist rechaza código vacío, desconocido, etiqueta enviada como código, variantes manipuladas, antiguo `reason` y detalles `Otro` inválidos.
- La salida se escapa y acota. No se guardan contraseñas, tokens, cookies, dispositivos, correo de confirmación separado, JSON crudo ni datos técnicos automáticos para `security_incident`.
- Se conservaron las defensas existentes de origen/CSRF, permisos, principal, aislamiento multi-tienda y transacción con rollback.

## 10. Archivos modificados

Archivos tocados específicamente por M7U2-C2F1, además de conservar el árbol sucio previo de C1/C2:

- `backend-powerzona/pb_hooks/pz_store_team_delete_reasons_lib.js` — catálogo, validación y serialización.
- `backend-powerzona/pb_hooks/pz_store_team_lib.js` — contrato Store, doble validación y respuesta de auditoría.
- `backend-powerzona/pb_hooks/pz_master_store_users_lib.js` — servicio transaccional compartido y compatibilidad Master.
- `backend-powerzona/tests/pz_m7u2_c2f1_delete_reasons.test.cjs` — pruebas focales backend.
- `backend-powerzona/tests/pz_m7u2_c2_http_runtime.test.cjs` — runtime HTTP C2F1 sobre PocketBase efímero.
- `frontend-powerzona/src/lib/storeTeamDeleteReasons.ts` — catálogo y validación frontend.
- `frontend-powerzona/src/lib/storeTeam.ts` — cliente del contrato nuevo y mensajes seguros.
- `frontend-powerzona/src/components/admin/StoreTeamView.astro` — correo, copia, selector, `Otro` y estados del diálogo.
- `frontend-powerzona/src/styles/store-team.css` — correo seleccionable, tarjeta y responsive.
- `frontend-powerzona/src/lib/storeActivity.ts` y `src/components/admin/StoreActivityView.astro` — motivo/detalle en actividad privada.
- `frontend-powerzona/astro.config.mjs` — desactiva la barra de desarrollo sólo cuando `PZ_VISUAL_TEST=1`.
- `frontend-powerzona/tests/m7u2C2F1.test.mjs`, `m7u2C2F1.visual.mjs`, `m7u2C2.visual.mjs` y `m7u2c2StoreActivity.test.mjs` — contrato, regresión y Playwright estándar.
- `docs/tusenda84/reportes/evidencias/M7U2-C2F1/` — siete PNG exigidos.
- Este reporte.

No se modificó la bitácora PDF ni se añadió una migración.

## 11. Pruebas backend

Comando focal:

```text
node --test tests/pz_m7u2_c2f1_delete_reasons.test.cjs tests/pz_store_user_deletion.test.cjs tests/pz_store_team.test.cjs
```

Resultado: 32 totales, 32 aprobadas, 0 fallidas, 0 omitidas. Se cubrieron los ocho códigos, etiqueta resuelta en servidor, límites 7/8/300/301, espacios, HTML, detalle cerrado normalizado, contrato exacto, rechazo del payload antiguo, confirmación normalizada, correo enmascarado/ajeno, auditoría estructurada, idempotencia, rollback, principal, self delete, otra tienda, borrado de relaciones y compatibilidad Master.

## 12. Frontend

El paquete focal combinado de M7U2-C2F1 y regresiones de equipo/actividad obtuvo 31 totales, 31 aprobadas, 0 fallidas y 0 omitidas. La prueba específica C2F1 obtuvo 8/8 después del ajuste aislado del entorno visual. Se verificaron paridad de catálogo, payload sin etiqueta/actor/store, correo PC/móvil, truncamiento accesible, copia y fallback, confirmación vacía, nueve `<option>` contando placeholder, reglas de `Otro`, estado del submit, reapertura, error interno, menú flotante, toast y actividad.

## 13. Runtime

```text
node --test tests/pz_m7u2_c2_http_runtime.test.cjs
```

Resultado: 1 escenario integral aprobado, 0 fallidos y 0 omitidos, sobre PocketBase y base temporales. Usó fixtures `M7U2C2F1QA_*` y comprobó por HTTP real: listado propio con correo íntegro, aislamiento, rechazo de Staff/secundario, correo incorrecto y enmascarado, payload antiguo y códigos manipulados; eliminación con motivo predefinido; segunda eliminación con `Otro`; auditorías especializada y central; cupo; sesiones, dispositivos, permisos e historial. El `finally` eliminó la base, fixtures y procesos propios.

## 14. Playwright

Se usó Playwright estándar, no `playwright-interactive` ni `js_repl`. Resultado final: APROBADO, 7/7 capturas, 0 errores de página, 0 respuestas 5xx y cleanup propio completo.

Evidencias revisadas visualmente a resolución original:

1. `01-correo-visible-pc.png` — 1440×900.
2. `02-correo-visible-movil.png` — 390×844, cuatro accesos en barra inferior.
3. `03-dialogo-correo-copiar.png` — 1440×900, copia confirmada y campo manual vacío.
4. `04-selector-motivos.png` — 1440×900, motivo cerrado y submit habilitado.
5. `05-motivo-otro.png` — 412×915, detalle válido, diálogo y botones dentro del viewport.
6. `06-eliminacion-exitosa.png` — 1440×900, cupo actualizado y toast de éxito.
7. `07-actividad-motivo.png` — 1440×900, toast ya oculto y motivo visible en actividad.

Dos intentos preliminares alcanzaron el final funcional pero reportaron un `pageerror` al cargar chunks dinámicos de la barra de desarrollo de Astro (`astro`/`audit`). No se relajó la aserción. Se aisló el runner con `PZ_VISUAL_TEST=1`, que desactiva exclusivamente esa barra durante Playwright; la repetición final aprobó íntegramente y el build normal siguió verde.

## 15. Suites

- Backend completo: 505 totales, 498 aprobadas, 0 fallidas, 7 omitidas. Las siete omisiones son runners históricos que requieren URL/credenciales externas opt-in (`PZPW01`, F7P8, M7U2 genérico, pricing, eliminación histórica, dispositivos y U7I7); el runtime autosuficiente de C2F1 sí se ejecutó y aprobó.
- Frontend completo final: 219 totales, 219 aprobadas, 0 fallidas, 0 omitidas.
- Sintaxis `node --check` de hooks y runners tocados: aprobada.

## 16. Build

`npm.cmd run build` completó correctamente el SSR con `@astrojs/node`. Vite construyó server y assets, y la inspección de `dist` encontró 0 source maps. Se mantuvieron tres advertencias conocidas: `getStaticPaths()` ignorado en las páginas dinámicas de categoría, subcategoría y producto; no guardan relación con C2F1 y no bloquearon el build.

## 17. Limpieza

- 0 rutas de fixtures `M7U2C2F1QA_*`.
- 0 procesos Node/PocketBase propios de la tarea; Chromium, Astro y PocketBase abiertos por el runner se cerraron en `finally`.
- 0 `dist`, `.astro`, `.tmp`, `playwright-report` y `test-results`.
- Se eliminó también la caché reproducible `frontend-powerzona/node_modules/.vite` usada por el servidor visual.
- 0 traces, videos o storage states. Sólo permanecen las siete capturas finales autorizadas.
- `pb_data` preexistente no se modificó ni se incluyó en Git.

Los directorios eliminados eran artefactos reproducibles y pueden regenerarse mediante build/pruebas; no se eliminó información fuente ni evidencia final.

## 18. Git final

- Repositorio y rama permanecen en `E:\Trabajo\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt`, `dev`.
- HEAD permanece en `72762a8ea98e46fcac6ee1f1864bf71f1d0bc4f2`.
- `git diff --check`: aprobado, sin errores.
- Estado acumulado final esperado tras incorporar este reporte: 38 tracked modificados, 25 entradas untracked en la vista corta, 0 staged; incluye íntegramente el trabajo previo M7U2-C1/C2.
- Diff tracked acumulado: 38 archivos, 2,024 inserciones y 264 eliminaciones. Los archivos untracked y PNG no forman parte de ese stat.
- No aparecen `pb_data`, `node_modules`, `dist`, `.astro`, `.tmp`, perfiles Chromium ni credenciales en el estado Git.

## 19. No commit, push ni deploy

No se ejecutó `git add`, commit, push, merge, cambio de rama, deploy, Coolify ni Cloudflare. Tampoco se usó `git reset`, `git clean`, `git checkout`, `git restore` o `git stash`. El HEAD no cambió y todo queda sin stage para revisión humana.

## 20. Pendientes reales

- Validación manual y confirmación explícita de Kraken.
- Si el revisor desea certificar además los siete runners históricos omitidos, deberá aportar sus URLs y credenciales opt-in; no son dependencias del runtime efímero C2F1 ya aprobado.
- La bitácora PDF permanece sin actualizar, según instrucción.
- M7U2, M7U2-C2 y M7U2-C2F1 continúan **EN REVISIÓN**; no se marcan como completados.

EN REVISIÓN — M7U2-C2F1 PENDIENTE DE VALIDACIÓN MANUAL Y CONFIRMACIÓN DE KRAKEN
