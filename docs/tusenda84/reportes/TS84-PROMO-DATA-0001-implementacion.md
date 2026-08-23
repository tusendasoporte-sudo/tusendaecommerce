# TS84-PROMO-DATA-0001 — Implementación de fundación de datos Promo

## 1. Ficha de control

| Campo | Resultado |
|---|---|
| Proyecto | Tu Senda 84 / Tiendas Promo |
| Prompt ID | `TS84-PROMO-DATA-0001` |
| Estado | **COMPLETADO — IMPLEMENTACIÓN Y GATE POCKETBASE RUNTIME APROBADOS** |
| Fecha | 2026-08-23 |
| Base | Rama local `dev`, HEAD observado `02399ccc9f21a6b5ebda1cea29c025a334d4ad0b` |
| Entrada | DATA-DES aprobado por Kraken al autorizar DATA-0001 |
| Migraciones ejecutadas sobre DB | **SÍ, únicamente sobre bases temporales descartables**; ningún `pb_data` del repositorio o desplegado fue usado |
| Infraestructura externa | **NO CONSULTADA / NO MODIFICADA** |

## 2. Resultado

Se implementó una fundación aditiva de trece colecciones privadas `promo_*`, dividida en cuatro migraciones focales y reversibles. No existe backfill, seed, Promo activa ni reinterpretación de `stores`. Las reglas PocketBase de todas las colecciones son `null`; no se añadió ningún endpoint o ruta.

La capa base incorpora validaciones estructurales server-side reutilizables por PERM/PUBCFG/PUBLISH: aislamiento por `site`, estados monotónicos, slugs/hosts canonicales, cuotas técnicas, documentos sin semántica Commerce/código arbitrario, WebP acotado, revisiones/eventos inmutables, slot platform/custom coherente y auditoría sin claves sensibles conocidas.

El gate pendiente se cerró con el binario local `backend-powerzona/pocketbase.exe` versión `0.39.8`, SHA-256 `7503E40F3B36F772F26C9DD9DD971A3A176D601701B3C10D70F2FA8FA70E90D4`. La prueba usa directorios generados bajo el temporal del sistema, verifica sus rutas antes de eliminarlos y los descarta en `finally` aun ante fallo.

## 3. Decisiones cerradas

- `DP-02`: Promo-only v1; `public_slug` de plataforma y custom domain opcional mediante `canonical_mode`.
- `DP-03`: toda alta comienza `source=unassigned`, gates false y cuotas cero; DATA no modifica planes Commerce ni asigna beneficios.
- `DP-10`: hard ceilings de 50 servicios, 24 imágenes visibles en galería, 10 locales, 3 videos, 64 secciones, 32 CTA, 512 refs media, 30 imágenes por revisión, 200 imágenes almacenadas, WebP 100 KiB, video 25 MiB y 250 MiB por sitio.

Los originales de imagen no forman parte del modelo persistente. MEDIA deberá reutilizar el flujo existente de conversión/validación WebP y guardar únicamente la salida normalizada en `promo_media_assets`, sin reutilizar ni modificar `push_media`.

## 4. Migraciones

| Orden | Archivo | Colecciones |
|---:|---|---|
| 1 | `1787520000_promo_tenant_foundation.js` | `promo_sites`, `promo_site_entitlements`, `promo_theme_releases`, `promo_domain_bindings` |
| 2 | `1787520100_promo_authoring_media.js` | `promo_draft_documents`, `promo_media_assets` |
| 3 | `1787520200_promo_revision_publication.js` | `promo_revisions`, `promo_revision_media_refs`, `promo_publication_slots`, `promo_publication_events` |
| 4 | `1787520300_promo_audit_analytics.js` | `promo_audit_events`, `promo_analytics_events`, `promo_analytics_daily` |

El binding se crea antes del slot porque `promo_publication_slots.primary_binding` requiere una colección ya existente. Este ajuste es únicamente de orden técnico y no cambia el catálogo D-01..D-13.

PocketBase `0.39.8` también exige que la autorrelación `promo_media_assets.poster_asset` apunte a una colección ya persistida. Por ello la migración de authoring/media crea primero `promo_media_assets`, luego agrega `poster_asset` y su índice en una segunda escritura dentro de la misma migración transaccional. El schema final permanece idéntico al diseño aprobado.

Cada `down`:

1. comprueba que todas las colecciones de su bloque estén vacías;
2. aborta con `unsafe_rollback_promo_data` si detecta una fila;
3. elimina únicamente las colecciones nuevas del bloque y en orden dependiente→raíz.

## 5. Privacidad, aislamiento e invariantes

- Todas las rules directas están cerradas: `list/view/create/update/delete = null`.
- `promo_sites.store` es 1:1 y no usa cascade; las tiendas actuales no reciben registros por migración.
- Los hijos pertenecen a un solo `promo_sites`; relaciones a revisión, media, binding o evento deben coincidir con ese site.
- No existen relaciones a productos, categorías, órdenes, settings o entidades Commerce.
- `public_slug` y hostname usan lookup exacto; namespaces centrales reservados se rechazan.
- Hostnames actuales y primary bindings usan índices únicos parciales.
- Draft usa versión CAS; slot usa `generation`; binding usa `state_version`.
- Revisiones, refs, eventos de publicación, auditoría y analytics raw son append-only.
- Todo delete por API directa se rechaza y exige un orquestador futuro.
- `canonical_mode=platform` prohíbe binding; `custom` exige primary activo/current del mismo site.
- Media image solo admite salida `image/webp` de hasta 100 KiB; files son protected.
- Auditoría rechaza claves sensibles conocidas y limita profundidad/tamaño de payload.
- Analytics no dispone de fields para URL, IP, user-agent, mensaje, teléfono, email, producto, precio, carrito u orden.
- Los callbacks de PocketBase delegan directamente en `pz_promo_data_lib.js` y derivan el nombre de colección desde el evento; no dependen de cierres JavaScript que el runtime no preserve.
- Los JSON de request/record se normalizan a objetos o arrays JavaScript antes de validar profundidad, claves y límites, incluyendo la representación binaria que puede entregar PocketBase.

## 6. Compatibilidad preservada

No se modificaron:

- `stores`, `settings`, `store_visual_items` o schemas actuales;
- planes, capacidades, permisos o `store_user_access`;
- rutas Commerce, Landing QR, ratings o i18n actual;
- analytics/auditoría existentes;
- Admin, Master, apps, APKs o UI;
- Cloudflare, Coolify, staging o producción.

No se creó Aladdin's Carpet, theme release, dominio, entitlement, draft, revisión, publicación ni registro persistente o externo. El gate creó únicamente fixtures sintéticas A/B dentro de una base temporal y las descartó al terminar.

## 7. Pruebas realizadas

### 7.1 Baseline previo

Se ejecutaron cuatro suites existentes de stores/planes/media/borrado: **49/49 tests pasaron** antes de implementar.

### 7.2 DATA nuevo

Se añadieron:

- `pz_promo_data_migrations.test.cjs` — construcción reproducible, 13 colecciones exactas, reglas cerradas, IDs/fields/índices únicos, límites, ausencia de relaciones Commerce y down seguro.
- `pz_promo_data.test.cjs` — hard ceilings, slug/host, entitlements, documentos, locales, 200 imágenes, videos, aislamiento, canonical slot, inmutabilidad y auditoría saneada.

Resultado conjunto inicial: **18/18 tests pasaron**.

Las pruebas compilaron todos los índices contra SQLite real en memoria y comprobaron la unicidad parcial de host actual, primary actual y hash media.

La corrida final combinada de DATA más las cuatro suites baseline concluyó con **67/67 tests pasados**, sin fallos ni omisiones.

### 7.3 Gate PocketBase runtime completado

Se añadió `pz_promo_data_http_runtime.test.cjs` y se ejecutó contra PocketBase local `0.39.8`. Resultado: **1/1 gate runtime aprobado**.

| Verificación | Evidencia runtime | Resultado |
|---|---|---|
| Primer migrate-up | Árbol completo aplicado desde base temporal vacía; las cuatro migraciones Promo quedaron al final | APROBADO |
| Segundo migrate-up | El historial permaneció en 206 entradas, sin duplicados ni nuevas aplicaciones | APROBADO |
| Arranque con hooks | `/api/health` respondió y validaciones positivas/negativas devolvieron códigos Promo específicos | APROBADO |
| Colecciones privadas | Exactamente 13 `promo_*`; cinco rules `null` por colección y cero backfill antes de fixtures | APROBADO |
| Índices | 42 índices Promo presentes; unicidad parcial de hostname current y primary current comprobada con writes conflictivos | APROBADO |
| Aislamiento A/B | Ref de media, binding de slot y evento analytics cross-site rechazados | APROBADO |
| Límites media | File protected, MIME allowlist, 25 MiB de campo; imagen >100 KiB rechazada; 200 imágenes admitidas y 201 rechazada; 3 videos admitidos y 4 rechazado | APROBADO |
| API directa cerrada | List/create con `fields/filter/sort/expand` rechazados para anónimo, `master_admin` y `store_admin`; view/update/delete directo rechazados; file protected no servido anónimamente | APROBADO |
| Rollback vacío | `migrate down 4` con confirmación explícita revirtió las cuatro migraciones y dejó cero colecciones Promo | APROBADO |
| Rollback con datos | `migrate down 1` produjo `unsafe_rollback_promo_data`; conservó las 13 colecciones y el row de prueba | APROBADO |
| Descartabilidad | Ambas bases temporales y sus archivos se eliminaron tras la corrida | APROBADO |

No se usó `backend-powerzona/pb_data`. No se descargó ningún binario y no hubo llamadas de red fuera de `127.0.0.1`.

### 7.4 Regresión final ampliada

Comando ejecutado desde `backend-powerzona`:

```text
node --test tests\pz_promo_data_migrations.test.cjs tests\pz_promo_data.test.cjs tests\pz_promo_data_http_runtime.test.cjs tests\pz_master_store_creation.test.cjs tests\pz_store_plans.test.cjs tests\pz_store_plan_management.test.cjs tests\pz_storefront_media.test.cjs tests\pz_store_storage_budget.test.cjs tests\pz_master_store_deletion_storefront.test.cjs tests\pz_master_store_deletion_personal_master.test.cjs
```

Resultado: **89/89 tests aprobados**, cero fallos, cero cancelados, cero omitidos. El total incluye 19 pruebas DATA y 70 regresiones pertinentes de creación de tiendas, planes, administración de planes, medios, presupuesto de almacenamiento y borrado Master.

### 7.5 Defectos descubiertos y corregidos por el gate

1. `promo_media_assets.poster_asset` se declaraba antes de existir su colección target; PocketBase rechazaba migrate-up. Se cambió a creación en dos pasos dentro de la misma migración.
2. Los hooks capturaban la variable de un `for` local; PocketBase serializaba el callback sin ese cierre y producía `ReferenceError`. Los handlers ahora requieren directamente la librería y derivan colección desde el evento.
3. Los JSON de PocketBase no siempre llegan como objetos JavaScript nativos. Se añadió normalización determinista antes de aplicar el contrato Promo.
4. `migrate down` requiere confirmación interactiva; la prueba envía una confirmación explícita y comprueba el estado real del schema, no solo el exit code.

## 8. Archivos implementados

- `backend-powerzona/pb_migrations/1787520000_promo_tenant_foundation.js`.
- `backend-powerzona/pb_migrations/1787520100_promo_authoring_media.js`.
- `backend-powerzona/pb_migrations/1787520200_promo_revision_publication.js`.
- `backend-powerzona/pb_migrations/1787520300_promo_audit_analytics.js`.
- `backend-powerzona/pb_hooks/pz_promo_data_lib.js`.
- `backend-powerzona/pb_hooks/pz_promo_data.pb.js`.
- `backend-powerzona/tests/pz_promo_data_migrations.test.cjs`.
- `backend-powerzona/tests/pz_promo_data.test.cjs`.
- `backend-powerzona/tests/pz_promo_data_http_runtime.test.cjs` — gate PocketBase efímero reproducible.
- `docs/tusenda84/reportes/TS84-PROMO-DATA-DES-0001-diseno-datos.md` — decisiones DP-03/DP-10 y límites aprobados sincronizados.
- `docs/tusenda84/reportes/TS84-PROMO-DATA-0001-implementacion.md` — este reporte.

## 9. Próximo prompt

Después de revisión/aprobación de este cierre de DATA-0001, el siguiente Prompt ID elegible del camino crítico es **`TS84-PROMO-PERM-0001`**. Debe implementar capacidades, permisos y gates Master/Admin Promo sin modificar permisos Commerce existentes. **No fue iniciado en esta tarea.**

`TS84-PROMO-MOB-VIS-0001` continúa como gate visual paralelo y no fue iniciado.

## 10. Dependencias, acciones externas y cierre

- Dependencias añadidas: **ninguna**.
- Binarios descargados: **ninguno**; se usó exclusivamente el PocketBase local ya presente.
- Bases persistentes o desplegadas consultadas/modificadas: **ninguna**.
- Cloudflare, Coolify, staging y producción: **no consultados / no modificados**.
- Push, merge, despliegue y release: **no realizados**.
- `TS84-PROMO-PERM-0001`: **no iniciado**.
