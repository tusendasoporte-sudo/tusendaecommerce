# TS84-PROMO-CMS-0001 — Editor seguro de contenido Promo

## Estado

**COMPLETADO** y verificado localmente sobre la rama `dev`, sin commit, push, merge, despliegue ni release.

Antes de modificar se confirmó:

- rama local: `dev`;
- HEAD: `70c846e` (`feat(promo): agrega shell admin para tiendas promo`);
- worktree: limpio;
- infraestructura externa: no consultada ni modificada.

## Objetivo cumplido

Se implementó el CMS privado de Tiendas Promo para editar exclusivamente:

- identidad pública del negocio;
- orden y visibilidad de secciones;
- textos de portada;
- servicios informativos, sin precio, stock, SKU o compra;
- presentación del propietario;
- métodos de contacto tipados;
- texto del footer; y
- contenido del locale predeterminado.

Los módulos `Contenido` y `Contacto` del shell Admin Promo dejaron de ser placeholders y montan el editor funcional. Galería/medios, apariencia, idiomas administrativos, preview, publicación, sitio público y demás módulos posteriores conservan su estado anterior y no fueron iniciados.

## Contratos respetados

La implementación reutiliza sin modificar:

- PERM/ADMIN-SHELL para clasificación Promo previa a Commerce, `allowed_actions`, tenant de sesión y soporte Master explícito;
- PUBCFG para `promo.site.v1`, lectura privada, reemplazo completo, permisos derivados y CAS;
- I18N para `promo.system.v1`, locale predeterminado y contenido localizado dentro del documento; y
- AUDIT, invocado por el writer backend existente durante cada actualización real del draft.

No se añadieron endpoints, action keys, permisos, capabilities, colecciones, rules, índices, contratos backend o semántica Commerce.

## Flujo privado y CAS

Se añadió un proxy SSR same-origin bajo `/api/admin/promo-cms`:

| Método | Operación | Backend aprobado |
|---|---|---|
| `GET` | Leer el único draft del tenant autenticado | `POST /api/pz/promo/private/v1/draft/read` |
| `PUT` | Reemplazar el documento con `expected_version` | `POST /api/pz/promo/private/v1/draft/update` |

El proxy:

- renueva la sesión central desde la cookie y nunca entrega el bearer al navegador;
- exige un único query `store`, slug canonical y coincidencia exacta con la tienda resuelta;
- deriva el tenant normal desde la sesión;
- para soporte Master, resuelve el slug central y envía únicamente `X-PZ-Promo-Store` con el store ID server-side;
- exige `Origin` same-origin para `PUT`, incluyendo coherencia de proxy sin listas ambiguas;
- acepta un envelope exacto `{ expected_version, document }` y rechaza fields, filters, sort, expand, realtime o tenant alternativo;
- limita el body antes y después de leerlo;
- conserva `private, no-store`, `noindex`, `no-referrer` y `nosniff`;
- allowlistea códigos de error y no refleja diagnósticos internos; y
- delega tenant, capability, permisos granulares, cuotas, validación integral, digest, transacción, auditoría y CAS al backend aprobado.

Un conflicto devuelve `promo_draft_conflict`; la UI pide recargar y nunca aplica last-write-wins.

## Aislamiento de facetas

Las transformaciones del editor son puras y parten de una copia validada del documento completo. Cada operación preserva las facetas fuera de su alcance:

### Contenido

Puede cambiar identidad, orden/visibilidad, navegación base, portada, servicios, propietario y footer. Preserva exactamente:

- theme ID, versión y tokens;
- media refs, alt y assets;
- contenido de galería/trabajo destacado;
- root y textos de contacto;
- adapters de rating y Landing QR;
- SEO existente; y
- locales distintos al predeterminado.

Una sección Gallery/Featured/Rating/Contact existente puede ordenarse, mostrarse u ocultarse como parte de la composición general, pero su contenido especializado no se edita desde Contenido.

### Contacto

Requiere conjuntamente `promo.content.manage` y `promo.contact.manage` para habilitar Guardar, igual que PUBCFG. Permite:

- `whatsapp` y `phone` únicamente con E.164;
- `email` únicamente con dirección validada;
- habilitar/deshabilitar el bloque;
- seleccionar método principal y secundarios explícitos;
- editar label, nombre accesible y mensaje localized; y
- ordenar la presentación mediante la configuración tipada existente.

No acepta URL genérica, esquema, HTML, script, snippet o Landing QR como action. `internal_form` y `approved_live_chat` preexistentes se muestran bloqueados y se preservan sin cambios; CMS no los habilita. Los métodos se desactivan en vez de borrarse para no romper referencias ni traducciones de otros locales.

## Workspace inicial

Cuando el draft está completamente vacío, CMS crea en memoria un workspace estructuralmente válido:

- locale único inicial `es`, ya soportado por `promo.system.v1`;
- en Contenido: `hero`, `services`, `owner` y `footer`;
- en Contacto: solo `contact`; y
- theme, media, adapters, SEO y publicación permanecen sin asignar/cambiar.

El workspace no se persiste hasta que el actor pulsa Guardar. CMS nunca cambia un locale predeterminado ya existente ni edita locales adicionales; esa administración corresponde a `TS84-PROMO-LOCALES-ADMIN-0001`.

## Servicios y footer

- Los servicios usan keys estables, orden explícito y textos plain text allowlisted.
- La UI aplica la cuota efectiva `max_services`; el backend vuelve a comprobar la métrica sobre el documento completo.
- Añadir, quitar y reordenar son acciones de borrador; no publican.
- El contrato backend v1 solo admite texto en `footer.config`/contenido localized. CMS no inventó un schema de redes, URL o branding para adelantar `TS84-PROMO-FOOTER-0001`.

## Accesibilidad y responsive

- Formularios con labels asociados, ayudas y límites visibles.
- Estado de carga/guardado con `role=status` y `aria-live=polite`.
- Resumen de error enfocable con `role=alert`.
- Validación nativa antes de transformar o enviar.
- Reordenamiento mediante botones Subir/Bajar, operable por teclado; no depende de drag and drop.
- Targets táctiles de 40–46 px y foco visible de alto contraste.
- Controles nativos checkbox/radio/select para visibilidad y prioridad.
- Estado `aria-busy` y controles bloqueados durante la escritura para evitar carreras visuales.
- Aviso de cambios sin guardar al abandonar.
- Layout 2/1 columnas, acciones adaptativas y breakpoints 760/420 px sin anchos rígidos.
- `prefers-reduced-motion` reduce transiciones y ralentiza el único spinner.

## Compatibilidad preservada

- El shell Promo continúa separado de `AdminSidebar.astro` y del layout Commerce.
- Clasificación, middleware, rutas canónicas/legacy y gates de los demás módulos permanecen sin cambios.
- No se importan ni consultan products, categories, orders, price, currency, stock, inventory, cart, checkout, shipping, coupons, gifts o promociones Commerce.
- No se modificaron Master, tienda pública, Landing QR, ratings, analytics, APKs, Seguridad ni navegación Commerce.
- Guardar siempre afecta el draft; nunca crea candidata, preview, publicación, rollback o cambio de slot.
- El documento generado por frontend se verificó directamente con `validatePromoDocument(..., { publicRevision: false })` del backend real.

## Archivos modificados

### Frontend

- `frontend-powerzona/src/components/admin/promo/PromoAdminShell.astro`
- `frontend-powerzona/src/components/admin/promo/PromoCmsEditor.astro`
- `frontend-powerzona/src/lib/promoCms.ts`
- `frontend-powerzona/src/pages/api/admin/promo-cms.ts`
- `frontend-powerzona/src/styles/promo-cms.css`
- `frontend-powerzona/tests/promoCms.test.mjs`

### Documentación

- `docs/tusenda84/reportes/TS84-PROMO-CMS-0001-implementacion.md`

## Migraciones y dependencias

- Migraciones: ninguna.
- Dependencias de paquete nuevas: ninguna.
- Seeds o backfill: ninguno.
- Datos persistentes reales modificados: ninguno.
- Backend modificado: no.

## Pruebas ejecutadas

### Línea base focal previa

```text
Frontend shell/acceso/Master: 16/16 PASS
Backend PUBCFG/I18N/PERM: 29/29 PASS
Total línea base focal: 45/45 PASS
```

### Focal CMS y regresión inmediata

```text
node --test tests/promoCms.test.mjs tests/promoAdminShell.test.mjs tests/promoAccess.test.mjs
17/17 PASS
```

La suite CMS aislada aporta 6 pruebas y cubre:

- workspace vacío separado por scope;
- preservación de tema, media, galería, contacto, adapters y locales ajenos;
- cuota efectiva de servicios y rechazo de contenido activo;
- contacto tipado, primary/secondary y rechazo de destinos libres;
- envelope exacto, slug tenant, Origin y señales ambiguas;
- auth central, header Master, CAS y aislamiento de prompts posteriores; y
- validación de los documentos producidos mediante el validador backend real.

### Regresión frontend completa

```text
node --test
679 tests; 679 PASS; 0 FAIL
```

### Regresión backend completa

```text
node --test
858 tests; 851 PASS; 0 FAIL; 7 SKIP
```

Los siete skips son gates opt-in preexistentes que requieren URLs/credenciales externas o configuración no autorizada. Los runtimes locales PocketBase efímeros, incluyendo DATA, permisos, PUBCFG, I18N, AUDIT, DOMAIN, THEME, MEDIA, PUBLISH, Master y las regresiones Commerce, sí se ejecutaron.

### Build e higiene

```text
npm.cmd run build
PASS

git diff --check
PASS
```

Persisten únicamente los tres warnings preexistentes de `getStaticPaths()` ignorado en categoría, subcategoría y producto. No están relacionados con CMS.

## Riesgos y límites residuales

- CMS edita solo el locale predeterminado. La selección/gestión y completitud de idiomas adicionales permanece en `TS84-PROMO-LOCALES-ADMIN-0001`.
- El editor conserva el documento completo para cumplir el replace+CAS aprobado. El backend sigue derivando permisos extra de cada faceta modificada y rechaza cambios fuera de autoridad.
- Internal Form y Live Chat permanecen no habilitables hasta sus contratos de privacidad/adaptador.
- El footer v1 solo admite texto; redes/enlaces tipados requieren un contrato backend futuro aprobado y no se simularon con URLs libres.
- Los cambios no pueden verse en un sitio público ni preview porque esos prompts siguen pendientes.
- Si una cuota quedó por debajo de un draft histórico ya existente, el backend puede bloquear incluso una edición no relacionada; es fallo cerrado deliberado y requiere ajuste Master, no bypass CMS.

## Confirmaciones de cierre

- No se consultó ni modificó PocketBase desplegado.
- No se consultaron ni modificaron Cloudflare, Coolify, staging o producción.
- No se leyeron secretos.
- No se inició `TS84-PROMO-GALLERY-0001`, `TS84-PROMO-APPEARANCE-0001`, `TS84-PROMO-LOCALES-ADMIN-0001`, `TS84-PROMO-PREVIEW-0001`, `TS84-PROMO-DOM-CF-0001` ni ningún prompt posterior.
- No se hizo push, merge, despliegue, release ni commit.

## Siguiente Prompt ID habilitado

Según el orden del mapa maestro, queda habilitado **`TS84-PROMO-GALLERY-0001`**: editor de trabajos destacados, galería, imágenes y videos sobre ADMIN-SHELL y MEDIA.

No fue iniciado.
