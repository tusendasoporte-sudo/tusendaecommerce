# TS84-PROMO-THEME-0001 — Catálogo versionado y tokens seguros Promo

- Fecha de cierre técnico: 2026-08-23
- Estado: **COMPLETADO**
- Base solicitada y verificada: rama local `dev`, `HEAD fdf880a` (`feat(promo): implementa i18n publico y fallback seguro`)
- Estado inicial del worktree: limpio
- Estado de entrega: cambios locales visibles en `dev`; **sin commit, push, merge, despliegue ni release**
- Dependencias reutilizadas: DATA-0001, PERM-0001, PUBCFG-0001, AUDIT-0001 e I18N-0001

## 1. Resultado

Se implementó el motor Theme de Tiendas Promo como una capa backend aditiva y cerrada. El backend continúa siendo la única fuente de verdad para catálogo, selección, estado de release, tokens efectivos y serving público.

El cierre aporta:

1. registry compilado e inmutable por `theme_id@version`;
2. primer manifest contractual `promo.black-gold@1.0.0`;
3. hashes SHA-256 reproducibles del manifest y del schema de tokens;
4. tokens semánticos de tipo enum, defaults seguros y combinaciones allowlisted;
5. validación de contraste desde valores de plataforma, no desde colores aportados por tenant;
6. compatibilidad allowlisted de secciones/variantes;
7. catálogo privado tenant-scoped que muestra únicamente releases `approved`, compilados y coherentes;
8. selección y overrides mediante el mismo documento, CAS, permisos y capabilities de PUBCFG/PERM;
9. transiciones Master del release con contexto explícito y AUDIT global saneado;
10. fallback determinista de tokens dentro del mismo manifest;
11. retención validada de releases `deprecated/retired` para serving y rollback; y
12. fallo cerrado para release unknown, corrupto, incompatible, `draft` o `blocked` según operación.

No se implementó CSS, renderer visual, shell, preview, candidata, publicación, media, dominio, contacto ejecutable, SEO o infraestructura. `TS84-PROMO-ALADDIN-0001` sigue siendo dueño de la composición visual negra/dorada; THEME solo fija su manifest contractual y `renderer_key`.

## 2. Contratos respetados

La implementación se cerró contra:

- `docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md`;
- `docs/tusenda84/reportes/TS84-PROMO-ARC-0001-arquitectura-adrs.md`;
- `docs/tusenda84/reportes/TS84-PROMO-DATA-DES-0001-diseno-datos.md`;
- `docs/tusenda84/reportes/TS84-PROMO-DATA-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-PERM-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-PUBCFG-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-AUDIT-0001-implementacion.md`; y
- `docs/tusenda84/reportes/TS84-PROMO-I18N-0001-implementacion.md`.

Decisiones aplicadas:

- DATA conserva ownership de `promo_theme_releases`, estados, índices, rules `null` y relación pinned desde revisiones.
- PERM conserva ownership de `promo.theme.select`, `promo.appearance.manage`, `promo.master.theme_releases.manage`, sesiones, tenant y capabilities.
- PUBCFG conserva el documento `promo.site.v1`, update CAS y proyección `promo.public.projection.v1`.
- AUDIT conserva el writer único y los catálogos `promo.theme.selection.update` / `promo.theme.release.update`.
- I18N conserva el contrato localized y copia la proyección Theme ya allowlisted, sin strings o fallback propios.
- Un release persistido solo es utilizable cuando ID, versión, renderer, versión contractual y ambos hashes coinciden exactamente con el registry compilado.
- Ningún input tenant controla CSS, JavaScript, HTML, imports, component names, handlers, URLs, fonts remotas o assets ejecutables.

## 3. Catálogo versionado

### 3.1 Registry compilado

La clave canónica es `theme_id@version`. La estructura admite múltiples manifests/versiones desde el inicio, pero este prompt registra únicamente el primer tema autorizado por el mapa:

| Campo | Valor |
|---|---|
| Theme ID | `promo.black-gold` |
| Versión | `1.0.0` |
| Renderer key | `promo.black-gold` |
| Contract version | `1` |
| Documento compatible | `promo.site.v1`, schema 1 |
| Cambio de tema | Conserva contenido; solo cambia la selección visual dentro del documento |
| Scripts third-party | No permitidos |
| Variantes v1 | `default` para cada tipo de sección PUBCFG |

El identificador es deliberadamente genérico e independiente del cliente inicial: Aladdin's Carpet consume este tema, pero su nombre comercial no forma parte del contrato técnico ni del `renderer_key`.

No se añadieron un segundo tema, presets ficticios ni opciones no aprobadas. Una nueva entrada exige Prompt ID, manifest/mockup y aprobación independientes.

### 3.2 Integridad del release

Para cada operación se verifica conjuntamente:

- `theme_id` y SemVer exactos;
- `renderer_key` compilado;
- `contract_version=1`;
- `manifest_sha256` exacto;
- `token_schema_sha256` exacto;
- estado permitido para la operación; y
- compatibilidad de tokens y variantes.

Un row creado fuera del servicio con hashes de relleno, renderer distinto o versión desconocida no aparece en catálogo y no puede seleccionarse ni servirse.

## 4. Tokens, contraste y variantes

### 4.1 Tokens semánticos

| Token | Valores permitidos | Default |
|---|---|---|
| `surface` | `obsidian` | `obsidian` |
| `text` | `ivory` | `ivory` |
| `accent` | `heritage_gold`, `champagne_gold` | `heritage_gold` |
| `border` | `heritage_gold`, `champagne_gold` | `heritage_gold` |
| `focus` | `ivory_ring` | `ivory_ring` |
| `heading_font` | `editorial_serif` | `editorial_serif` |
| `body_font` | `humanist_sans` | `humanist_sans` |
| `radius` | `subtle`, `soft` | `subtle` |
| `shadow` | `ambient`, `lifted` | `ambient` |
| `density` | `comfortable`, `compact` | `comfortable` |
| `motion` | `subtle`, `reduced` | `subtle` |

Los overrides son un subconjunto de estas claves. Missing keys usan defaults del mismo manifest. Unknown keys, valores hex/RGB libres, CSS, URLs y valores fuera de enum se rechazan.

`accent` y `border` deben formar una combinación aprobada. La implementación valida además relaciones de contraste WCAG desde la paleta first-party central: texto normal mínimo 4.5:1 y acento/foco mínimo 3:1 sobre la superficie.

### 4.2 Secciones y variantes

El manifest declara compatibilidad explícita con `hero`, `services`, `featured_work`, `gallery`, `owner`, `store_rating`, `contact` y `footer`. En esta versión solo acepta `variant=default`; nombres de componentes o variantes tenant-controlled fallan cerrados.

## 5. Selección, fallback y rollback

### 5.1 Selección y edición

No se creó un writer paralelo. El Admin selecciona tema y tokens mediante `/api/pz/promo/private/v1/draft/update`:

- cambiar `theme_id/version` exige `promo.theme.select` y un release `approved` exacto;
- cambiar `theme.tokens` exige `promo.appearance.manage` y `theme_customization_enabled`;
- una selección existente `deprecated` puede mantenerse/editarse, pero no aparece como nueva opción;
- un draft vacío puede permanecer sin selección mientras no sea publicable; y
- cambiar tema no elimina ni reescribe secciones, contenido, locales, contacto o media refs.

### 5.2 Fallback seguro

El fallback no sustituye silenciosamente un tema publicado por otro:

- si el draft aún no seleccionó tema, el catálogo privado proyecta el manifest seguro como diagnóstico/fallback y declara si el release está realmente selectable;
- si una selección válida omite overrides, se completan exclusivamente los defaults de esa misma versión;
- un tema público unknown, corrupto, incompatible o `blocked` falla cerrado; no cae a otro tema, Commerce, otra tienda ni otra versión.

### 5.3 Rollback

THEME conserva la capacidad de resolver una selección histórica exacta cuando su release está `approved`, `deprecated` o `retired`. `retired` se oculta del catálogo de nuevas selecciones, pero el artefacto pinned permanece servible para una revisión retenida y para un rollback futuro.

`blocked` representa emergencia de seguridad: invalida serving/rollback de ese release y exige una revisión remediada o una transición de publicación posterior. El cambio atómico del puntero público continúa perteneciendo a `TS84-PROMO-PUBLISH-0001`; este prompt no inició ni simuló publicación.

## 6. Rutas y contratos privados

| Método | Ruta | Contrato | Autoridad |
|---|---|---|---|
| `POST` | `/api/pz/promo/private/v1/themes/catalog` | request `promo.theme.catalog.read.v1`; response `promo.theme.catalog.v1` | `promo.site.view` o soporte Master explícito |
| `POST` | `/api/pz/promo/private/v1/themes/releases/update` | request `promo.theme.release.update.v1`; response `promo.theme.release.v1` | `promo.master.theme_releases.manage` |

Ambas rutas exigen auth central, body exacto, query vacía, `private/no-store`, anti-indexación y contexto tenant derivado por backend. No aceptan `store_id`, `site_id`, actor, IDs de records, filters, sort, fields, expand, hashes, renderer o manifest aportados por cliente.

El catálogo proyecta solo ID, versión, renderer key allowlisted, contract version, schema/defaults de tokens, variantes y requisitos A11Y/performance. Excluye IDs PocketBase, hashes internos, actor de aprobación, timestamps, entitlements raw, permisos, records, secretos y PII.

## 7. Actores y operaciones

| Actor/estado | Catálogo | Selección/overrides por PUBCFG | Releases globales | Resultado |
|---|---|---|---|---|
| Público | No | No | No | Solo recibe la selección publicada saneada y tokens efectivos |
| Admin principal Promo activo | Sí, su tenant | Sí según capabilities | No | Backend valida release/tokens/CAS |
| Admin secundario/Staff | Sí si posee `promo.site.view` | Solo con permisos granulares efectivos | No | Ausencia de permiso/capability falla cerrada |
| Master activo sin contexto | No | No | No | `promo_store_context_required` |
| Master activo con `X-PZ-Promo-Store` válido | Sí, tenant explícito | Soporte según gates existentes | Sí | Transición Master auditada |
| Usuario Commerce | No | No | No | `store_not_promo`, sin fallback |
| Usuario suspendido/bloqueado/sesión revocada | No | No | No | Denegado por PERM |
| Tenant A intentando declarar B en body/query | No | No | No | Payload rechazado; tenant nunca cambia |

## 8. Auditoría

Se reutiliza el writer único de AUDIT:

- cambios de selección/overrides crean `promo.theme.selection.update` dentro de la misma transacción del draft CAS;
- altas/transiciones de release crean `promo.theme.release.update` global dentro de la misma transacción Master;
- los eventos contienen estado, ID/versión, renderer y versión contractual allowlisted;
- no contienen manifest, hashes, token values, contenido, destino, teléfono, email, IDs tenant, secrets o records completos.

La creación/transición de releases usa `expected_status`; un conflicto no cambia el row ni crea un evento exitoso.

## 9. Archivos modificados

### Nuevos

- `backend-powerzona/pb_hooks/pz_promo_theme_lib.js` — registry, manifests, tokens, contraste, selección, fallback y rollback-safe resolution.
- `backend-powerzona/pb_hooks/pz_promo_theme_api_lib.js` — catálogo privado, transición Master, contratos, aislamiento y AUDIT.
- `backend-powerzona/pb_hooks/pz_promo_theme.pb.js` — dos rutas POST privadas.
- `backend-powerzona/tests/pz_promo_theme.test.cjs` — pruebas focales de registry/tokens/releases/contratos.
- `docs/tusenda84/reportes/TS84-PROMO-THEME-0001-implementacion.md` — este reporte.

### Actualizados

- `backend-powerzona/pb_hooks/pz_promo_pubcfg_lib.js` — delega tokens/variantes al registry y proyecta defaults efectivos seguros.
- `backend-powerzona/pb_hooks/pz_promo_pubcfg_api_lib.js` — valida release compilado por operación y escribe el evento de selección Theme.
- `backend-powerzona/tests/pz_promo_pubcfg_http_runtime.test.cjs` — gate runtime Theme integrado a PUBCFG/I18N/AUDIT.

No se modificó frontend, mobile, migraciones, schemas, roles, permisos, capabilities, planes, templates, defaults, rutas Commerce, Landing QR, ratings o infraestructura.

## 10. Migraciones, seeds y dependencias

- Migraciones nuevas o modificadas: **ninguna**.
- Backfill: **ninguno**.
- Seed de tienda, release, dominio, draft o revisión: **ninguno**.
- Dependencias de paquete: **ninguna**.
- Records persistentes reales: **ninguno**; los releases/tenants de pruebas vivieron solo en bases temporales descartables.

La implementación reutiliza `promo_theme_releases` de DATA. No se escribió en `backend-powerzona/pb_data`.

## 11. Pruebas ejecutadas

### 11.1 Focales Promo

```text
node --test tests/pz_promo_data_migrations.test.cjs tests/pz_promo_data.test.cjs
  tests/pz_promo_data_http_runtime.test.cjs
  tests/pz_promo_permissions.test.cjs tests/pz_promo_permissions_api.test.cjs
  tests/pz_promo_permissions_http_runtime.test.cjs
  tests/pz_promo_pubcfg.test.cjs tests/pz_promo_audit.test.cjs
  tests/pz_promo_i18n.test.cjs tests/pz_promo_theme.test.cjs
  tests/pz_promo_pubcfg_http_runtime.test.cjs
Resultado: 68/68 PASS
```

Incluyen hashes reproducibles, tokens válidos/hostiles, contraste, variants, status por operación, release corrupto, fallback, rollback retained, contratos exactos y ausencia de código/URL arbitrarios.

### 11.2 Gate PocketBase real

```text
node --test tests/pz_promo_pubcfg_http_runtime.test.cjs
Resultado: 1/1 PASS
```

El gate usó PocketBase local `0.39.8` y bases temporales. Cubrió:

- dos tenants Promo aislados y una tienda Commerce;
- principal, secundario, staff, Master, suspendido y sesión revocada;
- catálogo vacío/seleccionado y contexto Master A/B;
- token seguro/default y token hostil;
- CAS, permiso `theme.select`, permiso/capability de apariencia;
- hashes/renderer/manifest pinned;
- transiciones `approved → deprecated → retired → blocked`;
- serving de `deprecated/retired` y fallo cerrado de `blocked`;
- auditoría tenant-scoped de selección y auditoría global de releases;
- REST directo cerrado, payloads inyectados y ausencia de secretos/PII.

### 11.3 Regresión backend completa

```text
node --test
Resultado: 822 tests; 815 PASS; 0 FAIL; 7 SKIP
```

Los siete skips son gates opt-in que requieren URLs, credenciales o runners externos y no se activaron por las prohibiciones del prompt. Los runtimes locales DATA, PERM, PUBCFG/I18N/AUDIT/THEME y las regresiones Commerce pertinentes sí se ejecutaron.

### 11.4 Frontend y build

```text
node --test
Resultado: 655/655 PASS

npm.cmd run build
Resultado: PASS
```

El build conserva tres warnings preexistentes de Astro: `getStaticPaths()` ignorado en las rutas dinámicas de categoría, subcategoría y producto. No están relacionados con THEME-0001.

## 12. Compatibilidad preservada

- No se cambió ningún flujo, contrato, permiso, role, plan, default, ruta o traducción Commerce.
- No se modificaron `stores`, `settings`, `store_visual_items`, planes, `store_user_access`, Landing QR, ratings, analytics o `store_activity_audit`.
- Ninguna tienda Commerce obtiene catálogo, selección, token, fallback o permiso Promo.
- PUBCFG conserva IDs y forma de sus contratos; `theme.tokens` mantiene el mismo objeto y ahora completa defaults allowlisted en la proyección pública.
- I18N conserva sus dos rutas, negociación, cookie y contenido de un solo locale.
- Tema, locale y tenant se resuelven desde backend; no se aceptan filtros o IDs alternativos del cliente.
- No se cargó carrito, checkout, producto, precio, stock, inventario, promoción, cupón, regalo, orden o shipping.

## 13. Riesgos y límites residuales

| Riesgo/límite | Tratamiento/estado |
|---|---|
| Renderer visual Aladdin aún no existe | `renderer_key` queda pinned; la composición pertenece a ALADDIN-0001 después de SHELL |
| Solo existe un manifest compilado | Es intencional; no se muestran temas ficticios. Nuevos temas requieren prompt/mockup/aprobación |
| Rollback público atómico aún no cambia slot | THEME valida y retiene el target; PUBLISH-0001 será dueño del puntero y evento de publicación |
| Release `blocked` corta sitios que lo referencien | Fallo cerrado deliberado; requiere rollback/remediación, nunca fallback silencioso |
| Catálogo global Master usa contexto de tienda explícito | Reutiliza exactamente el gate PERM aprobado y aporta actor/tenant operativo auditable |
| Valores visuales concretos viven en código first-party | No se exponen como input tenant; ALADDIN/SHELL deberán mapear los tokens semánticos sin abrir CSS |
| Retención definitiva de artefactos sigue pendiente de OPS | `retired` no se elimina y rollback conserva referencias mientras no exista política aprobada |

## 14. Siguiente Prompt ID habilitado

Según el orden del mapa maestro, el siguiente Prompt ID es **`TS84-PROMO-MEDIA-0001`**: pipeline de Hero, servicios, galería, propietario, posters y video con límites/metadatos accesibles.

`TS84-PROMO-MEDIA-0001`, `TS84-PROMO-DOM-CORE-0001`, `TS84-PROMO-PUBLISH-0001` y cualquier prompt posterior **no fueron iniciados**.

## 15. Confirmaciones de cierre

- No se consultó ni modificó PocketBase desplegado.
- No se consultaron ni modificaron Cloudflare, Coolify, staging o producción.
- No se leyeron secretos; los runtimes eliminaron variables sensibles heredadas y usaron valores sintéticos.
- No se creó tema visual, media, dominio, publicación, shell, CMS o contacto ejecutable.
- No se hizo push, merge, deploy, release ni commit.
