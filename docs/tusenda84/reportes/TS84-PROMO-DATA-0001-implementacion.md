# TS84-PROMO-DATA-0001 — Implementación de fundación de datos Promo

## 1. Ficha de control

| Campo | Resultado |
|---|---|
| Proyecto | Tu Senda 84 / Tiendas Promo |
| Prompt ID | `TS84-PROMO-DATA-0001` |
| Estado | **IMPLEMENTADO; VALIDACIÓN POCKETBASE RUNTIME PENDIENTE POR BINARIO AUSENTE** |
| Fecha | 2026-08-22 |
| Base | `dev` equivalente, commit `8464b9d533563701f0dca0af22de1d3b8ffc2b20` |
| Entrada | DATA-DES aprobado por Kraken al autorizar DATA-0001 |
| Migraciones ejecutadas sobre DB | **NO**; solo construcción y validación local sin estado persistente |
| Infraestructura externa | **NO CONSULTADA / NO MODIFICADA** |

## 2. Resultado

Se implementó una fundación aditiva de trece colecciones privadas `promo_*`, dividida en cuatro migraciones focales y reversibles. No existe backfill, seed, Promo activa ni reinterpretación de `stores`. Las reglas PocketBase de todas las colecciones son `null`; no se añadió ningún endpoint o ruta.

La capa base incorpora validaciones estructurales server-side reutilizables por PERM/PUBCFG/PUBLISH: aislamiento por `site`, estados monotónicos, slugs/hosts canonicales, cuotas técnicas, documentos sin semántica Commerce/código arbitrario, WebP acotado, revisiones/eventos inmutables, slot platform/custom coherente y auditoría sin claves sensibles conocidas.

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

## 6. Compatibilidad preservada

No se modificaron:

- `stores`, `settings`, `store_visual_items` o schemas actuales;
- planes, capacidades, permisos o `store_user_access`;
- rutas Commerce, Landing QR, ratings o i18n actual;
- analytics/auditoría existentes;
- Admin, Master, apps, APKs o UI;
- Cloudflare, Coolify, staging o producción.

No se creó Aladdin's Carpet, theme release, dominio, entitlement, draft, revisión, publicación ni registro real.

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

### 7.3 Limitación de runtime

No existe `backend-powerzona/pocketbase.exe`, `pocketbase` ni `pocketbase.exe` en `PATH`. Por ello no se aplicaron migraciones a una base PocketBase, ni siquiera persistente local. Antes de integrar, CI o un entorno local autorizado con el binario esperado debe ejecutar:

- migrate-up desde base vacía y representativa;
- segundo migrate-up/idempotencia del runner;
- arranque con hooks;
- API directa negativa por roles;
- down vacío y down bloqueado con rows.

La ausencia del binario no se resolvió descargando herramientas ni consultando infraestructura, para mantener el alcance autorizado.

## 8. Archivos implementados

- `backend-powerzona/pb_migrations/1787520000_promo_tenant_foundation.js`.
- `backend-powerzona/pb_migrations/1787520100_promo_authoring_media.js`.
- `backend-powerzona/pb_migrations/1787520200_promo_revision_publication.js`.
- `backend-powerzona/pb_migrations/1787520300_promo_audit_analytics.js`.
- `backend-powerzona/pb_hooks/pz_promo_data_lib.js`.
- `backend-powerzona/pb_hooks/pz_promo_data.pb.js`.
- `backend-powerzona/tests/pz_promo_data_migrations.test.cjs`.
- `backend-powerzona/tests/pz_promo_data.test.cjs`.
- `docs/tusenda84/reportes/TS84-PROMO-DATA-DES-0001-diseno-datos.md` — decisiones DP-03/DP-10 y límites aprobados sincronizados.
- `docs/tusenda84/reportes/TS84-PROMO-DATA-0001-implementacion.md` — este reporte.

## 9. Próximo prompt

Después de revisión/aprobación de DATA-0001 y de completar el gate PocketBase runtime, el siguiente Prompt ID del camino crítico es **`TS84-PROMO-PERM-0001`**. Debe implementar capacidades, permisos y gates Master/Admin Promo sin modificar permisos Commerce existentes.

`TS84-PROMO-MOB-VIS-0001` continúa como gate visual paralelo y no fue iniciado.
