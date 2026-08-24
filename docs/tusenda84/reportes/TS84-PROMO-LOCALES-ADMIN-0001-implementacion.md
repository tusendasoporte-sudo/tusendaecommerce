# TS84-PROMO-LOCALES-ADMIN-0001 — Editor privado de idiomas y traducciones

## Estado

**COMPLETADO** y verificado localmente sobre la rama `dev`, sin commit, push, merge, despliegue ni release.

Antes de modificar se confirmó:

- rama local: `dev`;
- HEAD: `84a4467` (`feat(promo): agrega editor de apariencia para tiendas promo`);
- worktree: limpio; e
- infraestructura externa: no consultada ni modificada.

## Objetivo cumplido

Se implementó exclusivamente `TS84-PROMO-LOCALES-ADMIN-0001` para sustituir el placeholder `Idiomas` del Admin Promo por un editor privado que permite:

- habilitar idiomas con catálogo general completo;
- conservar un idioma predeterminado explícito;
- preparar traducciones parciales dentro del draft;
- traducir identidad, navegación, secciones, items, contacto, alt y SEO;
- observar completitud y pendientes por locale;
- incluir un locale completo en el conjunto de una futura publicación;
- retirar un locale no predeterminado del borrador;
- consultar una referencia editorial del idioma base sin copiarla ni persistirla; y
- guardar el documento completo mediante el replace+CAS PUBCFG existente.

No se creó candidata, revisión, URL de preview, comparación con publicado, publicación, rollback, sitio público, canonical, `hreflang` ni selector público nuevo. Tampoco se inició `TS84-PROMO-PREVIEW-0001`.

## Contratos reutilizados

La implementación consume sin cambiar su semántica:

- ADMIN-SHELL/PERM para clasificación Promo previa a Commerce, `allowed_actions`, capability `multilanguage_enabled`, cuota `max_locales`, tenant de sesión y soporte Master explícito;
- I18N para `promo.system.v1`, locales exactos soportados, nombres nativos y ausencia de fallback público por campo;
- PUBCFG para `promo.site.v1`, lectura privada, reemplazo completo, permisos derivados y CAS;
- CMS para el proxy SSR privado `/api/admin/promo-cms` y el documento draft ya aprobado;
- AUDIT mediante el writer backend que PUBCFG invoca cuando cambian `/locales` o `/content_by_locale`; y
- PUBLISH como gate backend final que vuelve a validar `publicRevision`, catálogo general y completitud antes de crear una candidata.

No se añadieron endpoints PocketBase, action keys, permisos, capabilities, colecciones, migraciones, rules, índices, catálogos backend, locales del sistema o contratos.

## Catálogo, locales habilitados y fallo cerrado

El editor replica exactamente el catálogo general backend disponible en `promo.system.v1`:

| Locale | Nombre nativo | Dirección |
|---|---|---|
| `en` | English | `ltr` |
| `es` | Español | `ltr` |

Una prueba de paridad compara el catálogo frontend directamente con `SYSTEM_CATALOGS` del backend. No se ofrece francés ni un locale ficticio: un tag sin catálogo completo falla cerrado con `unsupported_promo_locale`.

El editor separa:

- **locale habilitado en draft:** existe dentro de `content_by_locale` y puede estar incompleto;
- **locale incluido para una futura publicación:** pertenece a `locales.published` y debe estar completo antes de activarlo desde la UI; y
- **locale predeterminado:** siempre está habilitado e incluido; solo puede cambiarse a otro locale completo.

Un workspace vacío se prepara en memoria con `es` como único locale base, igual que CMS. No se persiste hasta Guardar. Añadir un locale crea namespaces localizados vacíos y no copia texto del idioma base.

La cuota efectiva proviene exclusivamente de `accessContext.capabilities.max_locales`. Añadir se bloquea al alcanzar la menor de la cuota y los catálogos generales realmente disponibles. Un draft histórico que exceda una cuota reducida puede seguir leyéndose y corregirse; el guardado final vuelve a exigir la cuota efectiva y el backend la comprueba otra vez.

## Traducciones y aislamiento de facetas

El writer frontend parte de una copia validada del documento completo y modifica exclusivamente:

```text
locales.default
locales.published
content_by_locale
```

Preserva exactamente:

- theme ID, versión y tokens;
- identidad opaca del negocio;
- orden, tipo, variante, visibilidad y config de secciones;
- referencias y propósitos de media;
- destinos/configuración de contacto y prioridades;
- adapters de rating y Landing QR; y
- cualquier otra faceta del contrato.

La traducción cubre la allowlist actual de PUBCFG:

- identidad: nombre, resumen y presentación del propietario;
- navegación por section key;
- textos tipados de `hero`, `services`, `featured_work`, `gallery`, `owner`, `store_rating`, `contact` y `footer`;
- nombres/resúmenes/captions por item key configurada;
- label, `aria_label` y mensaje por action key de contacto;
- alt o `decorative=true` por media use key; y
- title/description SEO y social.

Unknown locale, section, item, action, media key, field o contenido activo se rechaza antes de enviar. El backend sigue siendo la autoridad de documento, relaciones, tenant, cuotas y permisos.

## Completitud y bloqueo de publicación inválida

Cada locale muestra porcentaje, conteo y lista de pendientes. El diagnóstico exige:

- catálogo de sistema compatible;
- nombre público;
- navegación y contenido obligatorio de cada sección visible;
- items configurados y nombres obligatorios cuando corresponda;
- label y nombre accesible de las acciones de contacto publicables;
- alt localizado o marca decorativa por cada medio;
- título y descripción SEO.

Los locales draft no incluidos no bloquean al conjunto publicable. Un locale incompleto no puede incluirse ni convertirse en default desde la UI. Si un documento histórico ya anuncia un locale incompleto, el gate lo muestra como `Publicación bloqueada` y permite retirarlo del conjunto o completar su contenido.

Este diagnóstico mejora la guía editorial, pero no sustituye enforcement. Al crear una candidata, PUBLISH vuelve a ejecutar en backend:

- `validatePromoDocument(..., { publicRevision: true })`;
- resolución completa de `promo.system.v1` para cada locale anunciado;
- tenant/capability/permisos; y
- validaciones de tema, contacto, media y snapshot.

Por tanto, manipular la UI no permite publicar un locale inválido.

## Fallback editorial

Para un locale distinto del default puede activarse **Mostrar referencia del idioma base**. La referencia:

- aparece únicamente como placeholder/ayuda local;
- nunca rellena el valor del campo;
- nunca se copia a `content_by_locale`;
- nunca cuenta para el porcentaje;
- nunca habilita el toggle de futura publicación; y
- no altera el contrato público, donde sigue prohibido mezclar campos de idiomas.

El fallback público continúa siendo únicamente selección determinista de representación por URL/preferencia/header/default, según I18N. No se implementó fallback público por campo.

## Autoridad, tenant y CAS

La ruta `Idiomas` continúa visible solo cuando ADMIN-SHELL recibe `promo.site.view` y `promo.translations.manage` efectivos. Guardar exige visualmente la combinación:

```text
promo.content.manage + promo.translations.manage
```

Esto refleja el writer PUBCFG: todo reemplazo requiere Contenido y los cambios de locales/contenido no predeterminado derivan además Traducciones. La UI no infiere autoridad por rol, plan o nombre de capability.

El navegador reutiliza `/api/admin/promo-cms?store={slug}`:

1. el proxy renueva la cookie central y no expone el bearer;
2. exige slug canonical único y coincidencia exacta con el tenant Admin;
3. soporte Master resuelve el store central y añade `X-PZ-Promo-Store` solo server-side;
4. `PUT` exige Origin same-origin y envelope exacto;
5. envía `{ expected_version, document }`; y
6. el backend relee, deriva actions, valida capability/cuota/tenant, audita y aplica CAS.

Un `promo_draft_conflict` exige recargar. No hay last-write-wins ni almacenamiento paralelo.

## Accesibilidad y responsive

- landmarks y headings jerárquicos para toolbar, lista, editor y gate;
- lista de locales operable con botones nativos y `aria-current`;
- progreso por locale con nombre accesible;
- labels asociados por composición nativa;
- estados con `role=status` y `aria-live=polite`;
- resumen de error enfocable con `role=alert`;
- detalles/summary nativos para pendientes;
- switches y controles nativos para default, inclusión, fallback y decorative;
- foco visible de alto contraste;
- targets táctiles de 42–44 px;
- aviso de cambios sin guardar al abandonar;
- acciones sticky sin ocultar contenido;
- workspace 2/1 columnas y lista horizontal en móvil;
- breakpoints 1120/760/420 px; y
- reducción explícita de transiciones bajo `prefers-reduced-motion`.

Los campos incompletos pueden guardarse como draft. La completitud se comunica mediante el gate y bloquea su inclusión, sin abusar de `required` para impedir trabajo incremental.

## Compatibilidad preservada

- No se importan, consultan ni modelan products, categories, orders, precios, monedas, stock, inventario, carrito, checkout, shipping, cupones, regalos o promociones Commerce.
- `AdminSidebar.astro`, layout y rutas Commerce permanecen sin cambios.
- El shell Promo continúa separado y se clasifica antes de Commerce.
- No se modificaron Master, Landing QR, ratings, analytics, Seguridad, APKs, sitio público o publicación.
- No se abrió CRUD/realtime de colecciones `promo_*` ni acceso directo a PocketBase.
- No se añadió cookie, catálogo público alternativo, sistema i18n paralelo o endpoint de traducciones.
- Guardar afecta solo el draft; no crea candidata, revisión, preview, publicación, rollback o cambio de slot.

## Archivos modificados

### Frontend

- `frontend-powerzona/src/components/admin/promo/PromoAdminShell.astro`
- `frontend-powerzona/src/components/admin/promo/PromoLocalesEditor.astro`
- `frontend-powerzona/src/lib/promoLocales.ts`
- `frontend-powerzona/src/styles/promo-locales.css`
- `frontend-powerzona/tests/promoLocales.test.mjs`

### Documentación

- `docs/tusenda84/reportes/TS84-PROMO-LOCALES-ADMIN-0001-implementacion.md`

## Migraciones y dependencias

- Migraciones: ninguna.
- Dependencias de paquete nuevas: ninguna.
- Seeds o backfill: ninguno.
- Backend PocketBase modificado: no.
- Datos persistentes reales modificados: ninguno.

## Pruebas ejecutadas

### Línea base focal previa

```text
Frontend CMS/GALLERY/APPEARANCE/Admin Shell/PERM: 29/29 PASS
Backend I18N/PUBCFG/PERM: 35/35 PASS
Total línea base focal: 64/64 PASS
```

### Focal LOCALES-ADMIN y regresión inmediata

```text
node --test tests/promoLocales.test.mjs tests/promoCms.test.mjs
  tests/promoGallery.test.mjs tests/promoAppearance.test.mjs
  tests/promoAdminShell.test.mjs tests/promoAccess.test.mjs
Resultado: 35/35 PASS

node --test tests/pz_promo_i18n.test.cjs tests/pz_promo_pubcfg.test.cjs
  tests/pz_promo_permissions.test.cjs tests/pz_promo_permissions_api.test.cjs
  tests/pz_promo_publish.test.cjs
Resultado: 44/44 PASS
```

La suite LOCALES-ADMIN aporta seis pruebas y cubre:

- paridad exacta con los catálogos de sistema backend;
- workspace base y locale draft vacío sin copiar fallback;
- preservación total de facetas ajenas;
- acciones derivadas `content + translations`;
- completitud, inclusión futura y validación directa `publicRevision` con backend real;
- default, retiro, cuota, unknown locale y contenido activo fail-closed;
- shell, CAS, permisos separados, accesibilidad, responsive y ausencia de Commerce/infraestructura/prompts posteriores.

### Regresión frontend completa

```text
node --test
Resultado: 697/697 PASS
```

### Regresión backend completa

```text
node --test
Resultado: 858 tests; 851 PASS; 0 FAIL; 7 SKIP
```

Los siete skips son gates opt-in preexistentes que requieren URLs, credenciales o runners externos. No se activaron por las prohibiciones del prompt. Los runtimes PocketBase locales y descartables, incluidas las regresiones Promo y Commerce pertinentes, sí se ejecutaron.

### Build e higiene

```text
npm.cmd run build
PASS

git diff --check
PASS
```

El build conserva únicamente los tres warnings preexistentes de Astro sobre `getStaticPaths()` ignorado en categoría, subcategoría y producto. No están relacionados con LOCALES-ADMIN-0001.

## Riesgos y límites residuales

- Solo existen catálogos generales completos `es` y `en`. Añadir otro locale exige ampliar I18N en un Prompt ID autorizado y actualizar la prueba de paridad; el editor no inventa opciones.
- La completitud administrativa es una guía explícita y conservadora. PUBLISH/PUBCFG/I18N continúan siendo la autoridad final y pueden rechazar cualquier drift o incoherencia adicional.
- El editor no crea candidata ni render visual. La comparación desktop/móvil y con publicado pertenece a `TS84-PROMO-PREVIEW-0001`.
- Canonical, `hreflang`, sitemap y metadata finales pertenecen a SEO/SHELL posteriores; este editor solo mantiene contenido SEO localized dentro del draft.
- Un downgrade de cuota puede exigir retirar locales antes de guardar; no existe bypass visual o backend.
- No se ejecutó QA visual autenticado contra una tienda real porque implicaría datos/sesiones o entornos fuera del alcance. La UI quedó cubierta por pruebas estructurales, contrato, responsive y build local.

## Confirmaciones de cierre

- No se consultó ni modificó PocketBase desplegado.
- No se consultaron ni modificaron Cloudflare, Coolify, staging o producción.
- No se leyeron secretos.
- No se inició `TS84-PROMO-PREVIEW-0001`, `TS84-PROMO-DOM-CF-0001` ni ningún prompt posterior.
- No se hizo push, merge, despliegue, release ni commit.

## Siguiente Prompt ID habilitado

Según el orden y las dependencias del mapa maestro, queda habilitado **`TS84-PROMO-PREVIEW-0001`**: preview privado desktop/móvil del borrador y comparación con publicado sobre CMS, Gallery, Appearance y PUBLISH.

No fue iniciado.
