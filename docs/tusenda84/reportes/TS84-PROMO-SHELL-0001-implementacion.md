# TS84-PROMO-SHELL-0001 — Reporte de implementación

Fecha: 2026-08-24
Estado: **COMPLETADO EN LOCAL**
Rama: `dev`
Baseline verificada antes de modificar: `2f1b7b8` (`feat(promo): agrega preview privado de borrador y publicado`)
Worktree inicial: limpio

## Alcance implementado

Se implementó exclusivamente `TS84-PROMO-SHELL-0001`: un shell público Promo SSR, ligero, accesible, responsive, multi-tenant y fail-closed.

La entrega materializa:

- ruta de plataforma `https://tusenda84.com/promo/<public_slug>`;
- ruta localizada de plataforma `/promo/<public_slug>/<locale>`;
- serving por `Host` custom exacto en `/` y `/<locale>`;
- redirect de alias custom al primary canónico validado;
- redirect de plataforma a custom cuando el slot publicado cambia de canónico;
- guard temprano de `/t/<storeSlug>` para sitios Promo; y
- continuidad íntegra del storefront Commerce cuando no existe sitio Promo.

No se implementaron carrito, checkout, precios, catálogo, pedidos, inventario, stock, cupones, envíos ni scripts comerciales. Promo no usa `products`, `categories`, `orders` ni otra infraestructura Commerce como modelo o fallback.

## Contratos respetados

La implementación consume los contratos aprobados por:

- `TS84-PROMO-PUBCFG-0001` para resolver la única proyección pública allowlisted;
- `TS84-PROMO-I18N-0001` para negociar y proyectar exactamente un locale publicado;
- `TS84-PROMO-THEME-0001` para exigir una selección de tema y release aprobada;
- `TS84-PROMO-DOM-CORE-0001` para normalizar y resolver autoridad, binding, primary y tenant por Host exacto;
- `TS84-PROMO-PUBLISH-0001` para consumir exclusivamente `publication_slot -> published_revision`; y
- `TS84-PROMO-PREVIEW-0001` como precedente de separación entre superficies privada y pública.

No se creó un reader paralelo. SHELL llama al reader interno de PUBCFG y a DOM-CORE; nunca consulta draft, candidata, última revisión ni revisión por orden temporal.

## Resolución pública backend

Se añadieron cinco endpoints GET públicos, acotados y sin body:

```text
/api/pz/promo/public/v1/shell/sites/{publicSlug}
/api/pz/promo/public/v1/shell/sites/{publicSlug}/locales/{locale}
/api/pz/promo/public/v1/shell/host
/api/pz/promo/public/v1/shell/host/locales/{locale}
/api/pz/promo/public/v1/shell/stores/{storeSlug}
```

Todos rechazan query parameters y usan respuestas contractuales cerradas:

- `promo.public.shell.v1` para serving o redirect público; y
- `promo.public.route.v1` para el bridge `/t/<storeSlug>`.

La respuesta pública solo contiene el perfil localized allowlisted requerido por el shell. No expone store ID, site ID interno, revision ID, generation, binding ID, destinos CTA, records PocketBase ni credenciales.

## Revisión publicada inmutable

La ruta de plataforma resuelve el `promo_site` por `public_slug` exacto y valida:

- sitio y tienda activos;
- entitlement Promo efectivo;
- slot activo;
- `canonical_mode` y primary binding coherentes;
- puntero exacto a `published_revision`;
- digest y schema de la revisión;
- release de tema pública exacta;
- media y relaciones pertenecientes al mismo tenant; y
- estabilidad de slot, generation y revisión durante la lectura.

La ruta custom delega en `resolveHostContext`, que vuelve a exigir binding, site, primary, slot y revisión publicada exactos. Unknown Host, suffix match, binding inactivo, primary cruzado o publicación inconsistente fallan cerrados.

## Host exacto y transporte SSR

PocketBase obtiene la autoridad desde `e.request.host`, que es la ubicación canónica del Host entrante en el servidor HTTP. No confía en `X-Forwarded-Host` ni en una cabecera de tenant proporcionada por el cliente.

El salto interno Astro SSR → PocketBase usa el transporte HTTP/HTTPS nativo del adaptador Node para conservar el Host público original. Se evita `fetch` para este único caso porque Node sustituye el Host por el origen interno. La URL de conexión continúa siendo la URL PocketBase server-side aprobada; Host únicamente selecciona el binding público exacto que DOM-CORE valida.

Se aplican límites de respuesta, timeout, origen PocketBase normalizado y fallo cerrado ante errores de red o contrato.

## Locale y tema

Las entradas neutrales respetan el orden aprobado:

1. preferencia `pz_promo_locale` válida;
2. `Accept-Language`; y
3. locale default publicado.

Las entradas `/<locale>` exigen un locale canonical y publicado. No hay fallback por campo ni mezcla entre idiomas. El selector enlaza exclusivamente rutas localized del mismo sitio y mismo modo canónico.

El frontend valida de nuevo de forma allowlisted:

- catálogo de mensajes completo;
- locale, dirección, canonical path y opciones exactas;
- `theme_id`, versión semántica y tokens aprobados;
- secciones, orden y referencias únicas;
- acciones tipadas sin destinos;
- media, purpose, dimensiones, duración y accesibilidad; y
- contenido localized sin HTML, componentes o campos adicionales.

SHELL conserva la identidad del tema aprobada, pero no implementa aún la composición visual Aladdin. El CSS de este prompt es deliberadamente neutral y estructural.

## Layout SSR y accesibilidad

El shell se renderiza íntegramente en servidor, sin componentes hidratados ni `<script>` público. Incluye:

- documento `lang`/`dir` correcto;
- skip link visible al foco;
- landmark `header`, navegación principal, navegación de locales, `main` y footer;
- un heading principal incluso si no existen secciones informativas visibles;
- navegación por section keys allowlisted;
- `aria-current` para el locale activo;
- foco visible;
- targets táctiles de al menos 44 px;
- layout fluido sin ancho rígido;
- adaptación específica a 900 px y 640 px; y
- respeto de `prefers-reduced-motion`.

Las acciones de contacto permanecen inertes y muestran el mensaje localizado de indisponibilidad. Activarlas corresponde a `TS84-PROMO-CONTACT-0001`.

## Fail-closed y cabeceras

Las respuestas SHELL declaran:

```text
Cache-Control: private, no-store, max-age=0
X-Robots-Tag: noindex, nofollow, noarchive
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Content-Language: <locale efectivo>
```

Se mantiene `no-store` hasta que PERF defina una clave de caché generation-aware, y `noindex` hasta que SEO materialice canonical, hreflang, sitemap y reglas de indexación.

En hosts custom:

- solo `/` y `/<locale>` son rutas públicas admitidas;
- query parameters fallan 404;
- Admin, Master, API, `/t`, checkout y cualquier otra ruta fallan 404 para un Host Promo válido;
- un Host desconocido o no gobernado falla 421; y
- un alias activo redirige al primary exacto con HTTPS.

## Compatibilidad Commerce, Admin y Master

El middleware custom se ejecuta antes de los resolvers Admin/Commerce, pero solo fuera de los hosts reservados de plataforma. Las rutas existentes de `tusenda84.com`, staging local y loopback siguen su flujo anterior.

En `/t/<storeSlug>`:

- la comprobación Promo ocurre antes de importar `PublicStoreHome` o el resolver Commerce;
- el slug se comprueba con case exacto;
- una tienda sin `promo_site` devuelve 404 al bridge y continúa por el storefront Commerce existente;
- desde que existe `promo_site`, cualquier estado pausado, no publicado, inconsistente o indisponible devuelve 503 y nunca cae a Commerce; y
- un sitio Promo publicado redirige a su plataforma o primary custom canónico.

No se modificaron permisos, pantallas, contratos o flujos existentes de Admin y Master.

## Archivos añadidos

Backend:

- `backend-powerzona/pb_hooks/pz_promo_shell.pb.js`
- `backend-powerzona/pb_hooks/pz_promo_shell_api_lib.js`
- `backend-powerzona/pb_hooks/pz_promo_shell_lib.js`
- `backend-powerzona/tests/pz_promo_shell.test.cjs`

Frontend:

- `frontend-powerzona/src/lib/promoPublicShell.ts`
- `frontend-powerzona/src/layouts/PromoPublicLayout.astro`
- `frontend-powerzona/src/components/promo-public/PromoPublicShell.astro`
- `frontend-powerzona/src/styles/promo-public-shell.css`
- `frontend-powerzona/src/pages/promo/[publicSlug]/index.astro`
- `frontend-powerzona/src/pages/promo/[publicSlug]/[locale].astro`
- `frontend-powerzona/src/pages/__pz/promo-shell.astro`
- `frontend-powerzona/tests/promoPublicShell.test.mjs`

Documentación:

- `docs/tusenda84/reportes/TS84-PROMO-SHELL-0001-implementacion.md`

## Archivos modificados

- `backend-powerzona/tests/pz_promo_pubcfg_http_runtime.test.cjs`
- `frontend-powerzona/src/env.d.ts`
- `frontend-powerzona/src/middleware.ts`
- `frontend-powerzona/src/pages/t/[storeSlug]/index.astro`

## Migraciones y dependencias

- Migraciones nuevas: ninguna.
- Colecciones o fields nuevos: ninguno.
- Dependencias npm/backend nuevas: ninguna.
- Configuración externa nueva: ninguna.

## Pruebas ejecutadas

### Focal frontend SHELL

```text
node --test tests/promoPublicShell.test.mjs
Resultado: 5/5 PASS
```

Cubre proyección allowlisted, paths plataforma/custom, transporte Host SSR real sobre loopback, layout semántico, responsive, no-store/noindex y ausencia de Commerce o prompts posteriores.

### Focal backend y dependencias directas

```text
node --test tests/pz_promo_shell.test.cjs
  tests/pz_promo_domain.test.cjs tests/pz_promo_i18n.test.cjs
  tests/pz_promo_pubcfg.test.cjs tests/pz_promo_publish.test.cjs
Resultado: 47/47 PASS
```

Cubre Host exacto, primary/alias, I18N sin fallback, revisión publicada, payloads, headers, rutas registradas y fallthrough Commerce exclusivo para tiendas no Promo.

### Runtime PocketBase local y descartable

```text
node --test tests/pz_promo_pubcfg_http_runtime.test.cjs
Resultado: 1/1 PASS
```

El runtime valida plataforma, locale explícito, Host unknown 421, primary custom, redirect canónico, tenant A/B, contenido publicado exacto, guard Commerce y 503 para Promo reconocida pero no publicada.

### Regresión frontend completa

```text
node --test
Resultado: 707/707 PASS
```

### Regresión backend completa

```text
node --test
Resultado: 865 tests; 858 PASS; 0 FAIL; 7 SKIP
```

Los siete skips son gates opt-in preexistentes que requieren URLs, credenciales o runners externos. No se activaron. Los runtimes locales y descartables sí se ejecutaron.

### Build e higiene

```text
npm.cmd run build
PASS

git diff --check
PASS
```

El build conserva únicamente los tres warnings preexistentes de Astro sobre `getStaticPaths()` ignorado en categoría, subcategoría y producto.

## Riesgos y límites residuales

- No se renderiza delivery media, video, carrusel ni hero especializado; corresponden a ALADDIN/HERO/SECTIONS y MEDIA posteriores.
- No se activan destinos WhatsApp, teléfono, email, formulario o chat; corresponden a CONTACT.
- No se implementan canonical tags, hreflang metadata, sitemap, analytics, CSP específica, caché pública ni edge; corresponden a SEO, ANALYTICS, SEC, PERF y DOM-CF.
- Un Host custom debe llegar al frontend por ingress válido y HTTPS. Registrar o provisionar ese ingress queda fuera de este prompt.
- El shell usa el adaptador Node ya aprobado por el proyecto para poder preservar Host en la llamada interna.
- No se realizó QA visual contra datos o dominios desplegados por prohibición expresa; los contratos, runtime local, build y pruebas estructurales cubren la entrega local.

## Confirmaciones de cierre

- No se consultó ni modificó PocketBase desplegado.
- No se consultaron ni modificaron Cloudflare, Coolify, staging o producción.
- No se leyeron secretos.
- No se inició `TS84-PROMO-DOM-CF-0001` ni ningún prompt posterior.
- No se hizo push, merge, despliegue o release.
- El commit local fue autorizado por separado por el usuario después de completar y verificar la implementación.

## Siguiente Prompt ID habilitado

Según el orden y las dependencias del mapa maestro, queda habilitado **`TS84-PROMO-ALADDIN-0001`**: implementar el primer tema negro/dorado según VIS-0001 sobre el SHELL público aprobado.

No fue iniciado.
