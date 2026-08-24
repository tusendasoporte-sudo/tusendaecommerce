# TS84-PROMO-ADMIN-SHELL-0001 — Implementación

## Estado

**COMPLETADO** y verificado localmente sobre la rama `dev`, sin commit, push, merge, despliegue ni release.

Antes de modificar se confirmó:

- rama local: `dev`;
- HEAD: `acc1f7e` (`feat(promo): integra control master de tiendas promo`);
- worktree: limpio;
- infraestructura externa: no consultada ni modificada.

## Objetivo cumplido

Se incorporó un shell Admin exclusivo para Tiendas Promo que clasifica el tenant antes de ejecutar cualquier guard o vista Commerce, oculta las superficies e-commerce y construye la navegación únicamente desde `allowed_actions` proyectadas por PERM.

El shell cubre:

- resumen Promo;
- contenido;
- galería y medios;
- apariencia;
- idiomas;
- contacto;
- reseñas;
- analíticas;
- publicación; y
- puente Landing QR.

Cada módulo aparece solo si el backend devolvió al menos su action key exacto. Las rutas directas vuelven a comprobar el mismo action key en middleware y en el wrapper de página. No se infieren accesos por rol, nombre de plan, permiso Commerce, capability local o presencia visual del enlace.

## Alcance implementado

### Clasificación y fallo cerrado

El middleware reutiliza `POST /api/pz/promo/access/context` antes de consultar `getStoreAccessContext` o aplicar las reglas Commerce.

La resolución queda cerrada en tres estados:

1. `promo`: conserva la proyección saneada en `Astro.locals.promoAccessContext` y habilita exclusivamente rutas Promo autorizadas;
2. `commerce`: solo se acepta cuando el backend devuelve exactamente `404 store_not_promo`;
3. `blocked`: cualquier capability ausente, sitio no operativo, respuesta ambigua, error de red, error 404 distinto o contrato inválido bloquea el panel sin degradar a Commerce.

Además, el `store.slug` proyectado por PERM debe coincidir exactamente con el tenant resuelto por el contexto Admin. Un valor vacío o divergente devuelve un estado seguro y no renderiza navegación.

### Rutas

Se mantienen las rutas administrativas centrales por slug:

- `/t/{storeSlug}/admin` — resumen Promo;
- `/t/{storeSlug}/admin/promo/{section}` — módulo Promo autorizado.

También existen wrappers legacy bajo `/admin/promo/`; el middleware autenticado los redirige a la ruta canónica de la tienda, igual que el resto del Admin existente.

Una Tienda Promo que intenta entrar a una sección Admin Commerce vuelve a su resumen Promo. Un actor sin action key para un módulo Promo recibe `403` privado, `no-store` y sin navegación alternativa. Una clasificación no verificable recibe un bloqueo genérico y nunca abre Commerce.

### Navegación y estados

El catálogo del shell mapea cada área a los action keys aprobados:

| Módulo | Action keys aceptados |
|---|---|
| Contenido | `promo.content.manage` |
| Galería y medios | `promo.media.manage` |
| Apariencia | `promo.theme.select` o `promo.appearance.manage` |
| Idiomas | `promo.translations.manage` |
| Contacto | `promo.contact.manage` |
| Reseñas | `promo.reviews.manage` |
| Analíticas | `promo.analytics.view` |
| Publicación | `promo.publication.publish` |
| Landing QR | `promo.landing_qr.bridge.manage` |

`promo.site.view` es obligatorio para el resumen y para cualquier otro módulo. Los actions desconocidos son descartados por `promoAccess.ts`; el shell nunca los interpreta.

Los estados `draft`, `active` y `paused` se presentan de forma explícita. Capability raíz ausente, bloqueo por plan, sitio no operativo, error, acceso granular sin módulos y modo soporte Master tienen estados separados y honestos.

### Límite funcional del prompt

Las páginas de módulo solo confirman que la ruta y el acceso están listos. No contienen formularios, CRUD, upload, preview, selección de tema, traducciones, analítica, publicación ni mutaciones.

Este límite evita iniciar anticipadamente CMS, Gallery, Appearance, Locales, Preview, sitio público o cualquier prompt posterior. El shell no llama a endpoints de edición ni lee colecciones `promo_*` directamente.

## Contratos reutilizados

- PERM: `promo.site.view`, actions granulares, capability gates, sesión viva, tenant derivado y `X-PZ-Promo-Store` para soporte Master.
- Master: ruta central por tienda, contexto explícito de soporte y retorno a `/master/stores/{storeId}`.
- Admin existente: autenticación request-scoped, ruta canónica por slug y cambio obligatorio de contraseña antes de entrar al shell.

No se añadieron ni modificaron endpoints backend, action keys, permisos, capabilities, colecciones, rules, índices o payloads.

## Aislamiento y privacidad

- El frontend no consulta PocketBase CRUD para clasificar o construir la navegación.
- El tenant Admin continúa derivándose de la sesión; el body no recibe `store_id`, `site_id`, actor, filters, fields, sort o expand.
- Soporte Master envía el tenant únicamente por `X-PZ-Promo-Store` al contrato PERM existente.
- El shell solo consume nombre/slug/estado saneados, display name/rol, flags de actor y `allowed_actions`.
- No muestra record IDs, token, cookie, `tokenKey`, email, teléfono, destinos de contacto, drafts, snapshots, entitlements crudos, secretos ni datos de otra tienda.
- Un cruce entre el slug proyectado y la ruta se bloquea antes de renderizar.

## Accesibilidad y responsive

- landmarks y navegación con nombres accesibles;
- `aria-current="page"` en el módulo activo;
- botón móvil con `aria-controls` y `aria-expanded`;
- cierre por botón, backdrop y tecla Escape;
- focus trap por Tab/Shift+Tab mientras el drawer móvil está abierto;
- restauración de foco al cerrar;
- `inert` y `aria-hidden` para la navegación móvil cerrada;
- targets táctiles de al menos 42–44 px;
- foco visible de alto contraste;
- estados accesibles con `role="status"`;
- grillas 3/2/1 columnas y drawer para desktop, tablet y móvil;
- soporte explícito de `prefers-reduced-motion`;
- sin anchos rígidos que obliguen scroll horizontal.

El shell usa `Layout isMaster={true}` para mantener el documento central sin montar UI flotante, scripts de carrito, promociones o moneda.

## Compatibilidad preservada

- `AdminSidebar.astro` y todas las páginas Commerce existentes permanecen sin cambios.
- Las reglas Commerce del middleware conservan sus permisos, orden de fallback, gates Premium, Mobile Admin, cuenta, equipo y soporte Master.
- La rama Commerce solo se ejecuta después de `404 store_not_promo` exacto.
- No se reutilizan labels, rutas, módulos, permisos o capabilities Commerce como fallback Promo.
- Master conserva su panel y sus controles Promo; el shell solo añade una entrada operativa por la URL central cuando existe contexto autorizado.
- No se cambiaron sitio público, catálogo, productos, precios, stock, carrito, checkout, pedidos, promociones, cupones, regalos, envíos, Seguridad, Landing QR, APKs ni analítica Commerce.

## Archivos modificados

### Frontend

- `frontend-powerzona/src/env.d.ts`
- `frontend-powerzona/src/middleware.ts`
- `frontend-powerzona/src/lib/promoAdminShell.ts`
- `frontend-powerzona/src/components/admin/promo/PromoAdminShell.astro`
- `frontend-powerzona/src/styles/promo-admin-shell.css`
- `frontend-powerzona/src/pages/t/[storeSlug]/admin.astro`
- `frontend-powerzona/src/pages/t/[storeSlug]/admin/promo/index.astro`
- `frontend-powerzona/src/pages/t/[storeSlug]/admin/promo/[section].astro`
- `frontend-powerzona/src/pages/admin/promo/index.astro`
- `frontend-powerzona/src/pages/admin/promo/[section].astro`
- `frontend-powerzona/tests/promoAdminShell.test.mjs`

### Documentación

- `docs/tusenda84/reportes/TS84-PROMO-ADMIN-SHELL-0001-implementacion.md`

## Migraciones y dependencias

- Migraciones: ninguna.
- Dependencias de paquete nuevas: ninguna.
- Seeds o backfill: ninguno.
- Datos persistentes modificados: ninguno.

## Pruebas ejecutadas

### Línea base focal previa

Antes de implementar se ejecutaron las suites de acceso Promo, Master, permisos granulares, soporte y navegación:

```text
31 pruebas; 31 PASS; 0 FAIL
```

### Focal Admin Shell y regresiones inmediatas

```text
node --test tests/promoAdminShell.test.mjs tests/promoAccess.test.mjs
  tests/promoMaster.test.mjs tests/m7u2C3FrontendPermissions.test.mjs
  tests/m7u2GranularAdminActions.test.mjs tests/masterSupportMode.test.mjs
  tests/adminNavigationPerformance.test.mjs

37 pruebas; 37 PASS; 0 FAIL
```

La suite nueva cubre catálogo de módulos, rutas, acción exacta, ausencia de ampliación local, clasificación Commerce exacta, capability ausente, 404 ambiguo, indisponibilidad, contexto Master, saneamiento de actions, orden del middleware, slug tenant, aislamiento estructural y accesibilidad responsive.

### Regresión frontend completa

```text
node --test
673 pruebas; 673 PASS; 0 FAIL
```

### Regresión backend focal de contratos reutilizados

```text
node --test tests/pz_promo_permissions.test.cjs
  tests/pz_promo_permissions_api.test.cjs
  tests/pz_promo_master.test.cjs
  tests/pz_master_store_creation.test.cjs

32 pruebas; 32 PASS; 0 FAIL
```

### Build SSR

```text
npm.cmd run build
PASS
```

Persisten únicamente los tres warnings preexistentes de `getStaticPaths()` ignorado en categoría, subcategoría y producto; no están relacionados con este prompt.

## Riesgos y límites residuales

- Los módulos muestran estado de preparación, no editores funcionales; es intencional para no iniciar prompts posteriores.
- La disponibilidad visual depende de una lectura PERM por request Admin. Un fallo bloquea el panel completo para evitar una clasificación o autorización obsoleta.
- El shell no enlaza una experiencia pública Promo porque `TS84-PROMO-SHELL-0001` todavía no está implementado.
- Los controles de publicación Admin permanecen sin UI; el control Master existente no fue modificado.

## Confirmaciones de cierre

- No se consultó ni modificó PocketBase desplegado.
- No se consultaron ni modificaron Cloudflare, Coolify, staging o producción.
- No se leyeron secretos.
- No se inició `TS84-PROMO-DOM-CF-0001` ni ningún prompt posterior.
- No se hizo push, merge, despliegue, release ni commit.

## Siguiente Prompt ID habilitado

Según el orden del mapa maestro, queda habilitado **`TS84-PROMO-CMS-0001`**: editor seguro de identidad, secciones, servicios, propietario, contacto y footer.

No fue iniciado.
