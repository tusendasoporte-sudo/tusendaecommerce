# TS84-PROMO-SEO-0001 — Identidad SEO pública por dominio y locale

- Fecha de cierre técnico: 2026-08-24
- Rama local: `dev`
- HEAD de partida: `4ae4a8a`
- Estado: **COMPLETADO Y VALIDADO LOCALMENTE**
- Modalidad autorizada: implementación local sin conexión de infraestructura externa

## 1. Integridad de partida

Antes de modificar el proyecto se comprobó:

- rama exacta `dev`;
- HEAD exacto `4ae4a8a`;
- worktree limpio;
- el commit de partida cierra `TS84-PROMO-DOM-CF-0001`.

Se trabajó directamente sobre el proyecto guardado para que los cambios sean visibles en Visual Studio. No se creó commit y el HEAD continúa en `4ae4a8a`.

## 2. Contratos leídos y respetados

Se leyó primero el mapa maestro y después el cierre inmediatamente anterior y los contratos aplicables:

- `docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md`;
- `docs/tusenda84/reportes/TS84-PROMO-DOM-CF-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-SHELL-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-DOM-CORE-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-I18N-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-MASTER-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-AUDIT-0001-implementacion.md`.

También se contrastaron las decisiones SEO, tenancy, publicación y canonical de `ARC-0001`, `DATA-DES-0001`, `PUBCFG-0001` y `PUBLISH-0001` citadas por esas dependencias.

Las reglas conservadas son:

- solo una revisión inmutable publicada puede generar una representación indexable;
- canonical se deriva de `canonical_mode`, el slug publicado o el primary binding exacto validado, nunca de un Host libre;
- cada locale publicado tiene una URL explícita y estable;
- la entrada neutral solo negocia para redirigir y no compite como duplicado;
- aliases y casing no canonical redirigen antes de servir HTML indexable;
- `hreflang` es recíproco y `x-default` apunta al locale predeterminado publicado;
- sitemap contiene únicamente representaciones publicadas;
- errores, estados incoherentes, sitios suspendidos y hosts desconocidos fallan cerrados y no son indexables;
- no se emite semántica `Product`, `Offer`, precio, stock, carrito, compra o checkout;
- las rutas predeterminadas de plataforma siguen funcionando sin depender de Cloudflare o de un dominio propio.

## 3. Resultado

Se implementó una capa SEO Promo server-side formada por:

1. un proyector backend puro para canonical, Open Graph, Twitter, alternates, `x-default` e identidad de sitemap;
2. cuatro endpoints públicos de recursos SEO, separados entre slug de plataforma y Host custom;
3. redirecciones permanentes `308` para entradas neutrales, aliases de locale, aliases de dominio y plataforma cuando el canonical activo es custom;
4. metadata SSR validada nuevamente en frontend antes de materializar HTML;
5. sitemap XML por sitio con alternates recíprocos y `x-default`;
6. robots por sitio en plataforma y robots raíz en cada dominio custom;
7. middleware custom que preserva el Host autoritativo para resolver tenant y recursos; y
8. pruebas unitarias, de contrato, frontend y runtime PocketBase real efímero.

No se añadió JavaScript cliente, tracking, evento analítico, caché pública, structured data o dependencia externa.

## 4. Matriz canonical y redirecciones

| Entrada | Estado publicado | Resultado |
|---|---|---|
| `/promo/{publicSlug}` | canonical plataforma | `308` al locale efectivo bajo `/promo/{publicSlug}/{locale}` |
| `/promo/{publicSlug}/{locale}` exacto | canonical plataforma | sirve SSR; canonical plataforma localized |
| `/promo/{publicSlug}/{locale}` con casing/alias | canonical plataforma | `308` al tag canonical |
| `/promo/{publicSlug}` o locale | canonical custom | `308` al primary custom localized |
| `https://primary.example/` | canonical custom | `308` a `https://primary.example/{locale}` |
| `https://primary.example/{locale}` exacto | canonical custom | sirve SSR; canonical custom localized |
| alias custom activo | canonical custom | `308` al primary custom y mismo locale canonical |
| host desconocido, binding incoherente o sitio no publicable | cualquiera | fallo cerrado `421` en Host custom; sin HTML indexable |
| slug/plataforma inexistente o no publicable | cualquiera | `404`; sin HTML indexable |

Los redirects no incluyen `profile` ni objeto SEO. Las respuestas servidas solo se consideran indexables si el envelope SHELL contiene simultáneamente perfil publicado y contrato SEO válido.

## 5. Canonical, Open Graph y Twitter

Cada página SSR servida emite:

- `<link rel="canonical">`;
- un `<link rel="alternate" hreflang="…">` por cada locale publicado;
- un alternate `x-default` al locale predeterminado publicado;
- `<link rel="sitemap">`;
- `og:type=website`, URL canonical, título, descripción, nombre del sitio y locale;
- locales OG alternos; y
- Twitter card, título y descripción localized.

La imagen social se toma solamente de media publicada ya compilada, con purpose `social` o respaldo `hero`, entrega WebP central allowlisted, dimensiones acotadas, alt no vacío y `decorative=false`. La URL de media continúa en el origen central `https://tusenda84.com`; no se inventa una ruta asset bajo el dominio custom. Si no existe media aprobada, se omite la imagen y se usa `summary`.

La normalización frontend exige igualdad entre canonical, OG URL, locale efectivo, alternates, `x-default` y sitemap del source resuelto. Un origen, slug, locale, imagen o campo extra inconsistente hace fallar cerrado el SSR.

No se añadió JSON-LD porque la aprobación específica de structured data de negocio/rating no forma parte de este Prompt ID. No existe metadata `Product` ni `Offer`.

## 6. Sitemap y robots

### Plataforma

- Sitemap: `/promo/{publicSlug}/sitemap.xml`
- Robots Promo: `/promo/{publicSlug}/robots.txt`

El sitemap enumera solo locales publicados bajo el canonical de plataforma. Cada `<url>` contiene su propio canonical localized, alternates recíprocos XHTML y `x-default`.

El robots Promo permite el prefijo público del sitio, cierra `/admin`, `/master` y `/api/`, y anuncia únicamente el sitemap de ese tenant.

No se añadió ni modificó `/robots.txt` en la raíz de `tusenda84.com`: esa ruta es una superficie global compartida con Commerce y todos los demás sitios. Alterarla dentro de este prompt habría cambiado el comportamiento de tiendas no Promo, expresamente prohibido. Las páginas Promo de plataforma siguen gobernadas por meta robots y `X-Robots-Tag`, y publican su sitemap propio. La eventual agregación en un robots/sitemap raíz de plataforma requiere una decisión compartida y autorización separada.

### Dominio custom

- Sitemap canonical: `https://{primary}/sitemap.xml`
- Robots canonical: `https://{primary}/robots.txt`

Ambos recursos se resuelven mediante DOM-CORE con Host exacto. Un alias redirige `308` al mismo recurso del primary. El primary sirve solo si canonical mode, binding, tenant, revisión y generación siguen siendo coherentes. No existe fallback por suffix, último tenant, slug o Commerce.

Los recursos devuelven `no-store`, `noindex`, `nosniff` y no-referrer para evitar que el documento recurso compita como página; las URLs que contiene siguen siendo las representaciones publicadas indexables.

## 7. Cabeceras e indexabilidad

SHELL conserva `private, no-store, max-age=0` hasta que `TS84-PROMO-PERF-0001` defina una clave generation-aware. Además:

- página servida con perfil + SEO válido: `X-Robots-Tag: index, follow`;
- redirect, error o envelope incompleto: `X-Robots-Tag: noindex, nofollow, noarchive`;
- páginas servidas: `Link: <sitemap>; rel="sitemap"`;
- todas: `X-Content-Type-Options: nosniff` y referrer policy segura;
- locale servido: `Content-Language` y `Vary`/cookie heredados de I18N.

Los redirects usan `308` para preservar una identidad permanente sin introducir una segunda representación indexable.

## 8. Tenancy, Host y fallo cerrado

- Plataforma resuelve exclusivamente `publicSlug` canonical mediante PUBCFG/PUBLISH.
- Custom consume `domain.resolveHostContext` con la autoridad real del request y `trustedProxy=false`.
- El hostname canonical usado en SEO proviene del primary binding validado por DOM-CORE, nunca del header que el navegador puede manipular.
- Alias y primary deben pertenecer al mismo site y al mismo publication slot activo.
- Sitemap, robots, canonical y alternates se construyen desde una única proyección publicada tenant-scoped.
- Un locale ausente, duplicado o no canonical invalida toda la identidad; no se mezcla contenido entre idiomas.
- Un origin/path inesperado, query no vacía, body, campo extra o respuesta sobredimensionada falla cerrado.
- Los endpoints públicos no aceptan auth, store/site ID, filtros PocketBase, `fields`, `sort`, `expand`, canonical u hostname en el body/query.

No se añadió lectura global de tiendas, dominios o revisiones para construir recursos compartidos.

## 9. Auditoría

No se añadió un evento AUDIT por lectura pública. Canonical, OG, sitemap, robots y redirects son proyecciones read-only y una escritura por crawler generaría ruido, amplificación y datos innecesarios.

Los cambios persistentes que pueden alterar esta identidad —publish, rollback, canonical switch, pausa, reanudación y lifecycle del binding— continúan auditados por PUBLISH, MASTER, DOM-CORE y AUDIT dentro de sus transacciones. SEO no crea almacenamiento paralelo ni mutaciones silenciosas.

Los endpoints SEO no escriben registros, cookies nuevas, eventos, archivos persistentes o estado de proveedor.

## 10. Archivos modificados

### Nuevos

- `backend-powerzona/pb_hooks/pz_promo_seo_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_seo_api_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_seo.pb.js`
- `backend-powerzona/tests/pz_promo_seo.test.cjs`
- `frontend-powerzona/src/lib/promoPublicSeo.ts`
- `frontend-powerzona/src/pages/promo/[publicSlug]/sitemap.xml.ts`
- `frontend-powerzona/src/pages/promo/[publicSlug]/robots.txt.ts`
- `frontend-powerzona/tests/promoPublicSeo.test.mjs`
- `docs/tusenda84/reportes/TS84-PROMO-SEO-0001-implementacion.md`

### Actualizados

- `backend-powerzona/pb_hooks/pz_promo_shell_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_shell_api_lib.js`
- `backend-powerzona/tests/pz_promo_shell.test.cjs`
- `backend-powerzona/tests/pz_promo_pubcfg_http_runtime.test.cjs`
- `frontend-powerzona/src/lib/promoPublicShell.ts`
- `frontend-powerzona/src/middleware.ts`
- `frontend-powerzona/src/env.d.ts`
- `frontend-powerzona/src/layouts/PromoPublicLayout.astro`
- `frontend-powerzona/src/components/promo-public/PromoPublicShell.astro`
- `frontend-powerzona/src/components/promo-public/PromoBlackGoldTheme.astro`
- `frontend-powerzona/src/pages/__pz/promo-shell.astro`
- `frontend-powerzona/src/pages/promo/[publicSlug]/index.astro`
- `frontend-powerzona/src/pages/promo/[publicSlug]/[locale].astro`
- `frontend-powerzona/tests/promoPublicShell.test.mjs`

No se modificó ninguna ruta, componente o librería Commerce.

## 11. Migraciones y dependencias

- Migraciones nuevas o modificadas: **ninguna**.
- Schema/colecciones: **sin cambios**.
- Backfill: **ninguno**.
- Seeds: **ninguno**.
- Paquetes/dependencias: **ninguno**.
- Variables de entorno nuevas: **ninguna**.
- Datos persistentes reales: **ninguno**.

## 12. Pruebas y resultados

### 12.1 Sintaxis backend

```text
node --check pb_hooks/pz_promo_seo_lib.js
node --check pb_hooks/pz_promo_seo_api_lib.js
node --check pb_hooks/pz_promo_seo.pb.js
node --check pb_hooks/pz_promo_shell_lib.js
node --check pb_hooks/pz_promo_shell_api_lib.js

Resultado: PASS
```

### 12.2 Focales backend SEO/SHELL/DOM/I18N

```text
node --test tests/pz_promo_seo.test.cjs
  tests/pz_promo_shell.test.cjs
  tests/pz_promo_domain.test.cjs
  tests/pz_promo_i18n.test.cjs

Resultado: 34/34 PASS
```

Cubren canonical por plataforma/custom, Host inválido, hreflang, `x-default`, OG/Twitter localized, media social aprobada, omisión decorativa, locales publicados, redirects neutrales/aliases, fallo cerrado y ausencia de servicios externos.

### 12.3 Runtime HTTP PocketBase real efímero

```text
node --test tests/pz_promo_pubcfg_http_runtime.test.cjs

Resultado: 1/1 PASS
```

El runtime cubre publicación real efímera, dos tenants, canonical platform/custom, primary/alias, shell localized, sitemap y robots sin tocar una cuenta externa.

### 12.4 Frontend focal SEO/SHELL

```text
node --test tests/promoPublicSeo.test.mjs tests/promoPublicShell.test.mjs

Resultado: 19/19 PASS
```

Cubren normalización estricta, XML recíproco, robots, `308`, middleware custom, Host preservado, metadata SSR, aislamiento de Commerce y ausencia de ANALYTICS.

### 12.5 Backend completo

```text
node --test --test-reporter=dot

Resultado final fuera del sandbox: PASS, código de salida 0
```

La ejecución dentro del sandbox encontró el patrón heredado de cinco runtimes que no pueden crear `backend-powerzona/.tmp` y terminan con `EPERM` antes de ejecutar su lógica. Se repitió fuera del sandbox sobre el mismo worktree; toda la suite terminó con código 0 y sin consultar servicios externos.

### 12.6 Frontend completo y build SSR

```text
node --test
Resultado: 735/735 PASS

npm run build
Resultado: PASS
```

El build conserva tres warnings preexistentes de Astro sobre `getStaticPaths()` ignorado en las rutas dinámicas Commerce de producto, categoría y subcategoría. No pertenecen a SEO Promo.

### 12.7 Higiene Git

```text
git diff --check
Resultado: PASS
```

## 13. Compatibilidad preservada

- Una Promo sin dominio propio sirve y canonicaliza por `https://tusenda84.com/promo/{publicSlug}/{locale}`.
- Un dominio pendiente o binding no primary no altera el canonical de plataforma.
- Las rutas plataforma no importan Cloudflare ni requieren resolver un Host custom.
- Una Promo canonical custom redirige desde plataforma; no queda HTML duplicado en ambos orígenes.
- Tiendas sin Promo activo continúan en Commerce sin cambios.
- Tiendas Promo sin custom domain no reciben dependencia de dominio.
- No se modificaron home, catálogo, producto, carrito, checkout, pedidos, precios, stock, ratings, Landing QR, Seguridad, planes o analítica Commerce.
- Preview/Admin/Master/API siguen noindex y separados del shell público.
- No se cambió `security.checkOrigin`, trusted proxy global, DNS, ingress o CDN.

## 14. Límites y pendientes explícitos

- El `robots.txt` raíz de la plataforma no se tocó por ser una superficie compartida con Commerce; una agregación global de sitemaps Promo necesita autorización separada.
- No se añadió structured data de negocio/rating; requiere aprobación expresa y pruebas contra el modelo final.
- Se conserva `no-store`; caché pública, claves por generación, CDN y edge pertenecen a `TS84-PROMO-PERF-0001`.
- No se validaron DNS, TLS, apex/`www`, Cloudflare, Coolify/Traefik, ingress, staging o producción reales.
- No se ejecutaron pruebas contra un dominio público real; el runtime usa hosts locales deterministas.
- CSP/Origin/rate limit/proxy trust final pertenecen a `TS84-PROMO-SEC-0001`.
- No se añadieron visitas, secciones, conversiones, cookies analíticas o PII; `TS84-PROMO-ANALYTICS-0001` no fue iniciado.

## 15. Confirmaciones externas

- Cuenta Cloudflare real: **no conectada ni consultada**.
- Plugin Cloudflare: **no instalado ni conectado**.
- DNS/zonas/dominios/certificados: **no creados, activados, modificados o eliminados**.
- Coolify/Traefik/ingress: **no consultados ni modificados**.
- PocketBase desplegado: **no consultado ni modificado**.
- Staging/producción: **no consultados ni modificados**.
- Secretos/credenciales/tokens: **no solicitados, leídos, escritos o registrados**.
- Push/merge/deploy/release/commit: **no realizados**.

## 16. Siguiente Prompt ID

Según el mapa maestro, el siguiente Prompt ID es **`TS84-PROMO-ANALYTICS-0001`**.

`TS84-PROMO-ANALYTICS-0001` y todos los prompts posteriores **no fueron iniciados**. Su mención no concede autorización para ejecutarlos.
