# REPORTE FINAL — PROMPT ID: R7P2-C1

Estado: **R7P2-C1 IMPLEMENTADO — R7P2 EN REVISIÓN**

Fecha técnica: **24 de julio de 2026**.

## 1. Preflight y alcance

- Repositorio real: `E:\Trabajo\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt`.
- Rama confirmada: `dev`.
- El preflight encontró el conjunto R7P2 completo todavía sin commit: hooks, frontend, pruebas y documentación detallados en `R7P2-rifas-premium.md`.
- Todos esos cambios heredados se conservaron. No se descartó, sobrescribió ni reformateó trabajo previo.
- No se importó, descomprimió ni copió Source V121.
- No se cambió de rama ni se ejecutaron operaciones Git destructivas.

## 2. Causa raíz confirmada

`frontend-powerzona/src/pages/admin/promos/raffles.astro` ya resolvía correctamente tres estados:

1. Premium vigente y permiso efectivo: editor;
2. Administrador principal sin capacidad comercial: `StoreCapabilityGate`;
3. acceso realmente no autorizado: respuesta segura.

El fallo ocurría antes de llegar a esa página. `frontend-powerzona/src/middleware.ts` evaluaba `promos/raffles` únicamente mediante el permiso efectivo `raffles.manage`. El backend filtra ese permiso del contexto de una tienda Básica, Free o sin Premium vigente, por lo que el middleware devolvía el 403 global `renderPermissionBlock` aun cuando el actor era el Administrador principal.

## 3. Corrección aplicada

Se agregó una excepción de navegabilidad estrecha:

- solo aplica a la sección exacta `promos/raffles`;
- solo aplica cuando `is_primary_admin === true`;
- permite continuar hacia la página SSR, pero no agrega ni modifica `raffles.manage`;
- no contiene lógica de planes o capacidades;
- deja intacta la regla original `{ any: ['raffles.manage'] }`;
- mantiene la validación posterior del slug de la tienda;
- mantiene el bloqueo normal para usuarios adicionales.

La página de Rifas sigue siendo la única responsable de decidir editor, gate comercial o rechazo seguro. No fue necesario rediseñar ni modificar el gate existente.

## 4. Precedencia antes y después

| Escenario | Antes de C1 | Después de C1 |
|---|---|---|
| Principal Premium vigente | Editor | Editor |
| Principal Básico/Free/Premium vencido | 403 global prematuro | SSR 200, shell administrativo y gate Premium |
| Adicional Premium con `raffles.manage` | Editor | Editor |
| Adicional Premium sin `raffles.manage` | 403 | 403 |
| Adicional Básico/Free | Sin acceso | Sin acceso; nunca gate comercial |
| Slug de otra tienda | Rechazo | Rechazo |
| Plan o estado inválido | Fail-closed | Fail-closed |
| Ruta legacy | Evaluación previa y redirección | Misma matriz y redirección a la ruta canónica |

## 5. Archivos de C1

- `frontend-powerzona/src/middleware.ts`: excepción exacta para que el Principal alcance el gate SSR.
- `frontend-powerzona/tests/r7p2RafflesPremium.test.mjs`: matriz focal C1 y comprobaciones estructurales.
- `backend-powerzona/tests/pz_r7p2_http_runtime.test.cjs`: sesión real de Principal Básico y usuario adicional sin permiso.
- `docs/tusenda84/reportes/R7P2-rifas-premium.md`: nota de continuidad C1.
- `docs/tusenda84/reportes/R7P2-C1-gate-premium-rifas-principal.md`: este reporte.

No se modificaron la API administrativa, endpoints públicos, REST, realtime, archivos, notificaciones, sidebar, barras globales, `StoreCapabilityGate`, PocketBase, colecciones o migraciones para C1.

## 6. Cobertura focal

`node --test tests/r7p2RafflesPremium.test.mjs`:

- **14 aprobadas**;
- **0 fallidas**;
- **0 omitidas**.

La cobertura C1 verifica:

- excepción exclusiva del Principal en `promos/raffles`;
- ausencia de lógica de plan en el middleware;
- Básico, Free y Premium vencido bloqueados por capacidad;
- Premium vigente habilitado;
- gate exclusivo del Principal;
- adicional sin permiso dirigido al rechazo seguro;
- editor y script montados únicamente con autorización completa;
- ruta legacy y canónica compartiendo la misma página;
- regla original de `adminAccessRule` conservada.

## 7. Runtime HTTP autenticado

`node --test tests/pz_r7p2_http_runtime.test.cjs`:

- **1 aprobada**;
- **0 fallidas**;
- **0 omitidas**.

Se ejecutaron PocketBase y Astro reales en loopback y puertos aleatorios, con base, usuarios, tiendas, rifas e imagen efímeros. C1 comprobó:

- contexto real de Principal Básico sin `raffles.manage`;
- ruta canónica administrativa: HTTP `200`;
- shell administrativo y `data-raffles-premium-gate` presentes;
- distintivo `Plan Premium requerido` presente;
- editor, botón de actualización, endpoint administrativo, título privado y código de acceso ausentes del HTML;
- ruta legacy: `302` a la ruta canónica de la misma tienda;
- adicional Premium sin `raffles.manage`: HTTP `403`, `No tienes permiso`, sin gate ni editor;
- Principal intentando el slug de otra tienda: HTTP `403`, sin gate ni datos.

El mismo runtime volvió a validar las defensas R7P2 de snapshot público, participación, estado, REST, archivos, downgrade y restauración.

## 8. Suites completas

| Validación | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|
| Focal frontend R7P2/R7P2-C1 | 14 | 0 | 0 |
| Runtime HTTP R7P2/R7P2-C1 | 1 | 0 | 0 |
| Suite completa frontend | 274 | 0 | 0 |
| Suite completa backend | 576 | 0 | 7 |

La suite backend ejecutó **583** pruebas totales. Las siete omisiones son runtimes históricos opcionales que requieren servicios o credenciales externas `PZ_*`; no se contaron como aprobadas. Ninguna prueba R7P2 o C1 fue omitida.

El `package.json` frontend no define un script `npm run test`. La suite completa se ejecutó directamente con Node sobre los 26 archivos `*.test.mjs`, por lo que no quedó cobertura frontend pendiente por esa ausencia.

## 9. Build y calidad

- `npm.cmd run build`: **OK**.
- Salida Astro SSR server construida correctamente.
- Tres warnings históricos de `getStaticPaths()` en categoría, subcategoría y producto; no están relacionados con R7P2-C1.
- Source maps públicos en el build: **0**.
- `git diff --check`: **OK**.
- No se agregaron marcadores de trabajo pendiente, logs de desarrollo, mensajes crudos ni dependencias.

## 10. Privacidad y F12

El HTML runtime del gate no incluyó:

- `data-raffles-editor`;
- título o código de la rifa Básica conservada;
- botón de actualización del editor;
- URL de la API administrativa de Rifas.

La rama SSR del gate tampoco monta formularios, modales ni el script del editor. La corrección no relajó las defensas backend de API, REST, realtime, archivos, participaciones, notificaciones o tenant.

## 11. Migraciones y dependencias

- Migraciones creadas o modificadas por C1: **0**.
- Dependencias agregadas o actualizadas: **0**.
- Colecciones o esquemas modificados: **0**.

## 12. Limpieza

- Directorios runtime `R7P2QA_*`: **0**.
- Fixtures, bases, tiendas, usuarios, rifas e imágenes temporales persistentes: **0**.
- Procesos PocketBase o Node recientes abiertos por la tarea: **0**.
- `frontend-powerzona/dist`: eliminado.
- `frontend-powerzona/.astro`: eliminado.
- Source maps generados: **0**.
- No se cerraron procesos o terminales preexistentes.

## 13. Estado Git final

El estado continúa compuesto por R7P2, el cierre documental previo de L7Q1 y esta corrección C1:

```text
 M backend-powerzona/pb_hooks/pz_store_permission_enforcement.pb.js
 M backend-powerzona/pb_hooks/pz_store_permission_enforcement_lib.js
 M docs/tusenda84/reportes/L7Q1-landing-qr-premium.md
 M frontend-powerzona/src/components/admin/AdminSidebar.astro
 M frontend-powerzona/src/components/public-store/PublicStoreHome.astro
 M frontend-powerzona/src/lib/raffles.ts
 M frontend-powerzona/src/middleware.ts
 M frontend-powerzona/src/pages/admin/promos.astro
 M frontend-powerzona/src/pages/admin/promos/raffles.astro
 M frontend-powerzona/src/pages/api/admin/raffles.ts
 M frontend-powerzona/src/pages/api/raffles/enter.ts
 M frontend-powerzona/src/pages/api/raffles/status.ts
 M frontend-powerzona/src/pages/t/[storeSlug]/rifa.astro
 M frontend-powerzona/src/pages/t/[storeSlug]/rifa/[raffleSlug].astro
?? backend-powerzona/pb_hooks/pz_raffles_premium.pb.js
?? backend-powerzona/pb_hooks/pz_raffles_premium_lib.js
?? backend-powerzona/tests/pz_r7p2_http_runtime.test.cjs
?? backend-powerzona/tests/pz_r7p2_raffles_premium.test.cjs
?? docs/tusenda84/reportes/R7P2-C1-gate-premium-rifas-principal.md
?? docs/tusenda84/reportes/R7P2-rifas-premium.md
?? frontend-powerzona/src/lib/raffleAccess.ts
?? frontend-powerzona/tests/r7p2RafflesPremium.test.mjs
```

No hubo `git add`, commit, push, merge, rebase, cambio de rama, staging, despliegue ni producción.

## 14. Validación manual pendiente

Kraken debe repetir el flujo con el Principal de la tienda Básica, revisar el HTML/F12, comprobar un usuario Premium sin permiso y revisar 430, 390 y 375 px. La validación técnica automatizada está aprobada, pero R7P2 no se marca completado hasta esa confirmación manual.

**R7P2-C1 IMPLEMENTADO — R7P2 EN REVISIÓN**
