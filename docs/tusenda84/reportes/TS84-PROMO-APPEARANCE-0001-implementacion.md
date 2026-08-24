# TS84-PROMO-APPEARANCE-0001 — Selector privado de temas y apariencia

## Estado

**COMPLETADO** y verificado localmente sobre la rama `dev`, sin commit, push, merge, despliegue ni release.

Antes de modificar se confirmó:

- rama local: `dev`;
- HEAD: `fa516ae` (`feat(promo): agrega editor de galería para tiendas promo`);
- worktree: limpio; e
- infraestructura externa: no consultada ni modificada.

## Objetivo cumplido

Se implementó exclusivamente `TS84-PROMO-APPEARANCE-0001` para incorporar en el Admin Promo:

- catálogo privado de releases Theme aprobados;
- selector preparado para múltiples temas/versiones;
- presentación honesta del tema actual, fallback seguro y release heredado no seleccionable;
- edición de tokens enum allowlisted;
- persistencia únicamente de overrides distintos al default;
- restauración de defaults;
- vista previa visual instantánea de los tokens del primer renderer aprobado;
- separación visual y operativa entre `promo.theme.select` y `promo.appearance.manage`; y
- guardado del documento draft completo mediante el CAS PUBCFG existente.

El placeholder `Apariencia` del Admin Shell fue reemplazado por el editor funcional. No se creó candidata, revisión, URL de preview, comparación con publicado, publicación, rollback, sitio público, renderer público ni función de `TS84-PROMO-PREVIEW-0001`.

La vista incorporada es una ilustración local, saneada y sin datos del tenant, destinada a revisar exclusivamente color, tipografía, densidad, radios, sombras y movimiento. No consume contenido, media, contacto, dominio o revisión pública.

## Contratos reutilizados

La implementación consume sin cambiar su semántica:

- ADMIN-SHELL/PERM para clasificación Promo previa a Commerce, `allowed_actions`, tenant de sesión y soporte Master explícito;
- THEME para catálogo versionado, releases `approved`, schema/defaults de tokens, renderer allowlisted, A11Y y presupuestos;
- PUBCFG para `promo.site.v1`, lectura privada, reemplazo completo, permisos derivados y CAS;
- AUDIT mediante el writer backend ya integrado en cada cambio real de selección/tokens del draft; y
- CMS únicamente como proxy SSR de draft ya aprobado; el editor Appearance no amplía sus facetas.

No se añadieron endpoints PocketBase, action keys, permisos, capabilities, colecciones, migraciones, rules, índices, releases, manifests, themes, roles, planes o contratos backend.

## Catálogo privado, tenant y fallo cerrado

Se añadió el proxy SSR same-origin de solo lectura `/api/admin/promo-appearance?store={slug}`. El navegador nunca recibe el bearer central.

El proxy:

1. exige un único query `store` y slug canonical;
2. renueva la autenticación desde la cookie central;
3. resuelve el tenant Admin y exige coincidencia exacta con el slug solicitado;
4. para soporte Master, envía `X-PZ-Promo-Store` únicamente server-side después de resolver la tienda central;
5. llama con body exacto `{ contract: "promo.theme.catalog.read.v1" }` al endpoint THEME aprobado;
6. normaliza por allowlist positiva `promo.theme.catalog.v1` antes de responder;
7. conserva `private, no-store`, anti-indexación, `no-referrer` y `nosniff`; y
8. sanea errores sin reflejar IDs, records, payloads o diagnósticos internos.

El navegador no puede aportar `store_id`, `site_id`, actor, release status, renderer, manifest, schema, hash, filter, sort, fields, expand, realtime o destino backend.

La normalización frontend vuelve a exigir:

- contract exacto;
- Theme ID y SemVer canónicos;
- `contract_version=1`;
- renderer key tipado;
- token schema exclusivamente enum, acotado y con default dentro de sus valores;
- defaults completos y coherentes;
- variantes de sección allowlisted;
- requisitos A11Y/performance tipados;
- themes únicos por `theme_id@version`; y
- coherencia entre fallback, selección actual y catálogo aprobado.

Una respuesta ampliada, corrupta o ambigua bloquea el editor. La UI no inventa una opción ni degrada a Commerce.

## Autoridad y permisos

El módulo sigue siendo visible únicamente si ADMIN-SHELL recibió `promo.site.view` y al menos una de las acciones de Theme/Appearance proyectadas por el backend.

| Operación | Defensa visual | Autoridad backend efectiva |
|---|---|---|
| Leer catálogo y borrador | módulo autorizado | `promo.site.view`, tenant y sesión vigentes |
| Seleccionar ID/versión | `promo.theme.select` + `promo.content.manage` | PUBCFG exige nuevamente release `approved`, acción Theme y CAS |
| Modificar/restaurar overrides | `promo.appearance.manage` + `promo.content.manage` | PUBCFG exige capability `theme_customization_enabled`, acción Appearance y CAS |
| Cambiar tema y tokens juntos | las tres acciones aplicables | PUBCFG deriva nuevamente cada action key por diferencia real |
| Consultar sin autoridad de escritura | controles bloqueados y diagnóstico explícito | ninguna mutación se envía |

`promo.content.manage` no concede selección o apariencia. `promo.theme.select` no concede personalización. `promo.appearance.manage` no permite cambiar el release. La decisión del frontend solo evita controles inviables; una request manipulada vuelve a pasar por PERM/THEME/PUBCFG.

Cuando un actor puede seleccionar temas pero no modificar apariencia, el editor intenta preservar los overrides actuales únicamente si son válidos para el target. Si la transición exige alterar overrides, Guardar queda bloqueado y declara la acción faltante.

## Documento, tokens y CAS

El writer frontend parte de una copia validada del documento completo y modifica exclusivamente:

```text
theme.theme_id
theme.version
theme.tokens
```

Preserva exactamente:

- locales y todo `content_by_locale`;
- identidad;
- orden, visibilidad, config y variantes de secciones;
- media refs y metadata accesible;
- contacto;
- adapters de rating y Landing QR; y
- cualquier otra faceta del contrato.

Los controles se generan desde el schema retornado por THEME. El formulario exige todas las keys conocidas, rechaza unknown keys/values y guarda solo valores distintos del default. No transforma valores inválidos en defaults aceptables.

Para `promo.black-gold@1.0.0`, la defensa visual mantiene `accent` y `border` en la combinación emparejada aprobada. El backend continúa siendo la autoridad final de combinación y contraste.

Guardar reutiliza `/api/admin/promo-cms` con envelope exacto `{ expected_version, document }`. El backend deriva las acciones por diff real, valida el release compilado y los tokens, audita el cambio y aplica CAS. Un `promo_draft_conflict` exige recargar; no existe last-write-wins.

Un draft sin tema muestra el fallback seguro solo como muestra. No lo persiste hasta que el actor selecciona explícitamente un release aprobado.

## Vista previa visual

La muestra visual:

- usa únicamente el `renderer_key` allowlisted;
- convierte enums a valores first-party compilados en el frontend;
- nunca aplica hex, CSS, font URL, HTML, JavaScript, import, handler o URL procedente del tenant;
- representa superficie, texto, acento/borde, foco, fuentes, radio, sombra, densidad y motion;
- informa requisitos de contraste, movimiento reducido y scripts externos proyectados por el manifest; y
- muestra un diagnóstico seguro si no existe renderer de muestra empaquetado para una versión futura.

No llama a media, contacto, publicación, candidata, dominio o sitio público. El CTA de la muestra no es interactivo y no contiene destino real.

## Accesibilidad y responsive

- fieldset/radios nativos para selección de tema;
- labels asociados a cada select de token;
- estados con `role=status` y `aria-live=polite`;
- resumen de error enfocable con `role=alert`;
- `reportValidity()` antes de guardar;
- foco visible de alto contraste;
- targets táctiles de 40–44 px;
- controles disabled honestos según acciones efectivas;
- preview expuesto como muestra visual no interactiva, sin CTA muerto en el orden de foco;
- aviso de cambios sin guardar al abandonar;
- workspace 2/1 columnas sin ancho rígido;
- breakpoints 1120/700/420 px; y
- reducción explícita de transiciones bajo `prefers-reduced-motion`.

## Compatibilidad preservada

- No se importan, consultan ni modelan products, categories, orders, precios, monedas, stock, inventario, carrito, checkout, shipping, cupones, regalos o promociones Commerce.
- `AdminSidebar.astro`, layout y rutas Commerce permanecen sin cambios.
- El shell Promo continúa separado y se clasifica antes de Commerce.
- No se modificaron Master, Landing QR, ratings, analytics, Seguridad, APKs, sitio público o publicación.
- No se abrió CRUD/realtime de colecciones `promo_*` ni acceso directo a PocketBase.
- No se añadió un segundo tema, preset ficticio, CSS tenant, renderer público o manifest.
- Guardar afecta solo el draft; no crea candidata, revisión, preview integral, publicación, rollback o cambio de slot.

## Archivos modificados

### Frontend

- `frontend-powerzona/src/components/admin/promo/PromoAdminShell.astro`
- `frontend-powerzona/src/components/admin/promo/PromoAppearanceEditor.astro`
- `frontend-powerzona/src/lib/promoAppearance.ts`
- `frontend-powerzona/src/pages/api/admin/promo-appearance.ts`
- `frontend-powerzona/src/styles/promo-appearance.css`
- `frontend-powerzona/tests/promoAppearance.test.mjs`

### Documentación

- `docs/tusenda84/reportes/TS84-PROMO-APPEARANCE-0001-implementacion.md`

## Migraciones y dependencias

- Migraciones: ninguna.
- Dependencias de paquete nuevas: ninguna.
- Seeds o backfill: ninguno.
- Backend PocketBase modificado: no.
- Datos persistentes reales modificados: ninguno.

## Pruebas ejecutadas

### Línea base focal previa

```text
Frontend CMS/GALLERY/Admin Shell/PERM: 23/23 PASS
Backend THEME/PUBCFG/PERM: 33/33 PASS
Total línea base focal: 56/56 PASS
```

### Focal APPEARANCE y regresión inmediata

```text
node --test tests/promoAppearance.test.mjs tests/promoCms.test.mjs
  tests/promoGallery.test.mjs tests/promoAdminShell.test.mjs
Resultado: 24/24 PASS
```

La suite APPEARANCE aporta seis pruebas y cubre:

- catálogo exacto, enums/defaults y rechazo de payloads ampliados o valores libres;
- preservación total de facetas ajenas;
- overrides mínimos y validación directa con el backend real;
- separación de acciones `content + theme.select` y `content + appearance.manage`;
- tema inexistente, token unknown y combinación incompatible fail-closed;
- mapeo de preview exclusivamente first-party;
- auth central, tenant slug, contexto Master, CAS y rutas privadas exactas; y
- accesibilidad, responsive y ausencia estructural de Commerce/infraestructura/prompts posteriores.

### Regresión frontend completa

```text
node --test
Resultado: 691/691 PASS
```

### Regresión backend completa

```text
node --test
Resultado: 858 tests; 851 PASS; 0 FAIL; 7 SKIP
```

Los siete skips son gates opt-in preexistentes que requieren URLs, credenciales o runners externos. No se activaron por las prohibiciones del prompt. Los runtimes PocketBase locales y descartables, incluidas DATA, PERM, PUBCFG, I18N, AUDIT, THEME, MEDIA, DOMAIN, PUBLISH, Master y las regresiones Commerce pertinentes, sí se ejecutaron.

### Build e higiene

```text
npm.cmd run build
PASS

git diff --check
PASS
```

El build conserva únicamente los tres warnings preexistentes de Astro sobre `getStaticPaths()` ignorado en categoría, subcategoría y producto. No están relacionados con APPEARANCE-0001.

## Riesgos y límites residuales

- Solo existe un manifest compilado y aprobado. El selector ya consume un array versionado, pero no muestra presets ficticios; un segundo tema exige Prompt ID, mockup y aprobación independientes.
- Un release actual `deprecated` puede resolverse y preservarse en backend, pero no aparece como nueva opción. Si su schema ya no está en el catálogo seleccionable, la UI lo presenta de forma honesta y exige cambiar a un release aprobado en lugar de duplicar autoridad.
- La muestra visual cubre únicamente tokens y no el contenido real. La candidata privada, desktop/móvil integral y comparación con publicado pertenecen a `TS84-PROMO-PREVIEW-0001`.
- El renderer público negro/dorado continúa perteneciendo a `TS84-PROMO-ALADDIN-0001` después de SHELL. APPEARANCE no lo inició.
- La validación local de combinaciones mejora UX; THEME/PUBCFG siguen siendo la única autoridad y pueden rechazar cualquier drift del frontend.
- Un cambio de tema que también necesite limpiar overrides exige ambos permisos; no se degrada silenciosamente ni conserva tokens incompatibles.

## Confirmaciones de cierre

- No se consultó ni modificó PocketBase desplegado.
- No se consultaron ni modificaron Cloudflare, Coolify, staging o producción.
- No se leyeron secretos.
- No se inició `TS84-PROMO-LOCALES-ADMIN-0001`, `TS84-PROMO-PREVIEW-0001`, `TS84-PROMO-DOM-CF-0001` ni ningún prompt posterior.
- No se hizo push, merge, despliegue, release ni commit.

## Siguiente Prompt ID habilitado

Según el orden del mapa maestro, queda habilitado **`TS84-PROMO-LOCALES-ADMIN-0001`**: editor de idiomas, traducciones, completitud y fallback sobre CMS e I18N.

No fue iniciado.
