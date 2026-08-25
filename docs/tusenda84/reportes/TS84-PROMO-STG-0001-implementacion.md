# TS84-PROMO-STG-0001 — Implementación y smoke integral de staging

## 1. Estado del Prompt

- **Prompt ID:** `TS84-PROMO-STG-0001`
- **Estado final:** `COMPLETADO`
- **Fecha de ejecución:** 2026-08-25
- **Entorno:** staging provisional HTTPS
- **Host:** `https://mob76fcvxkxyb8tq0nwys18o.91.99.99.83.sslip.io`
- **Tienda de prueba:** `Aladdin's Carpet`
- **Slug público:** `aladdins-carpet-stg`
- **Estado seguro final:** tienda activa, Promo `active`, borrador v10 `ready`, revisión #1 publicada, generación 3, salud pública `healthy`.
- **Commit final desplegado:** `ff4f15f` en `dev`/`origin/dev`.
- **Canónico:** `platform`; `primary_binding` vacío; cero custom domains/bindings/aliases.

El gate inicialmente bloqueado se corrigió con autorización posterior expresa del usuario para commit, push y despliegue de staging. Se completaron candidata inmutable, preview desktop/móvil, primera publicación, despublicación segura y publicación final, sin operar producción.

## 2. Precondiciones obligatorias

Se verificaron antes de cualquier modificación local o acción externa:

| Precondición | Esperado | Observado | Resultado |
|---|---:|---:|---|
| Rama | `dev` | `dev` | PASS |
| HEAD | `d7641c4` | `d7641c4` | PASS |
| Worktree | limpio | limpio | PASS |

No se ejecutó ninguna mutación antes de validar las tres condiciones.

Comprobaciones utilizadas:

```powershell
git branch --show-current
git rev-parse --short HEAD
git status --short
```

## 3. Contratos y dependencias respetados

Antes de operar staging se leyeron el mapa maestro, el contrato y reporte de Coolify, los reportes QA visual/automático y las dependencias indicadas de arquitectura, datos, permisos, publicación, dominio, i18n, tema, medios, Master/Admin, CMS, contacto, shell, SEO, analítica, Landing QR, seguridad, rendimiento, accesibilidad y renderer Aladdin.

Se creó primero el contrato ejecutable faltante:

- `docs/tusenda84/prompts/TS84-PROMO-STG-0001.md`

El alcance se mantuvo en STG-0001. No se inició ningún Prompt de dominio privado, release, producción u operaciones.

## 4. Entorno y datos de staging creados

### 4.1 Tienda Promo

- Nombre: `Aladdin's Carpet`
- Slug: `aladdins-carpet-stg`
- Tipo: Promo
- Tienda: activa
- Lifecycle Promo: `active`
- Publicación: revisión #1 activa
- Generación pública: 3
- `canonical_mode`: `platform`
- `primary_binding`: vacío
- Custom domains/bindings/aliases: 0

### 4.2 Entitlements de prueba

Se configuraron mediante Master con fuente `master_override` y motivo auditable `staging_validation`:

| Capacidad | Estado final |
|---|---:|
| Sitio Promo | habilitada |
| Publicación | habilitada |
| Tema personalizado | habilitada |
| Multilenguaje | habilitada |
| Video | habilitada |
| Analítica Promo | habilitada |
| Dominio personalizado | deshabilitada |
| Puente Landing QR | deshabilitada |
| Servicios máximos | 10 |
| Galería máxima | 12 |
| Locales máximos | 2 |
| Videos máximos | 1 |
| Almacenamiento | 50 MiB |

La release de staging `promo.black-gold@1.0.0` fue promovida por Master de ausente a draft y después a `approved`. No se tocó producción.

### 4.3 Borrador editorial final

- Versión final: v10, `ready`.
- Idiomas publicados: ES y EN, ambos al 100 % de completitud.
- Identidad, hero, servicios, propietario y footer: configurados con contenido sintético de Aladdin's Carpet.
- Tema: `promo.black-gold@1.0.0` con tokens allowlisted, acento/borde dorado, radio suave, sombra elevada y movimiento reducido.
- Contacto: teléfono sintético E.164 guardado después de confirmación expresa del usuario; el valor se mantiene saneado en este reporte.
- Galería/media: biblioteca vacía, 0 B usados; trabajos destacados y galería permanecen ocultos en v10 para no anunciar secciones sin contenido.
- Reseñas: adaptador público deshabilitado; 0 reseñas, 0 pendientes y 0 aprobadas.
- Landing QR Promo: deshabilitado por el doble gate; no se creó configuración Commerce para la tienda Promo.

No se reutilizó volumen o dato de producción. PowerZona no recibió mutaciones.

## 5. Acciones funcionales ejecutadas

### 5.1 Master y Admin

1. Se creó la tienda Promo y se verificó su separación de las tres tiendas Commerce existentes.
2. Se configuraron entitlements y cuotas de staging.
3. Se aprobó la release de tema disponible en staging.
4. Se accedió al Admin Promo en modo soporte Master con contexto explícito de tienda.
5. Se verificó que el shell expone solo siete módulos Promo y no muestra catálogo, productos, inventario, pedidos, carrito o checkout.
6. Se guardaron contenido, apariencia, contacto y configuración segura de galería.
7. Se verificó el estado vacío de medios y reseñas.
8. Se completaron ES/EN, candidata, preview, publicación, despublicación segura y publicación final.

### 5.2 Preview y publicación

| Estado requerido | Resultado | Evidencia |
|---|---|---|
| No publicado inicial | PASS | Master: `unpublished`, generación 0; rutas públicas 404 saneado |
| Vista privada/noindex/no-store | PASS | candidata #1 renderizada desde borrador v10 sin tocar el slot |
| Crear candidata inmutable | PASS | revisión #1 creada desde v10 |
| Preview desktop 1280×800 | PASS | ES, tema negro/dorado y secciones visibles correctas |
| Preview móvil 390×844 | PASS | EN, reflow del renderer y contenido localizado correctos |
| Comparar con publicada | PASS/N/A inicial | informó correctamente que no existía revisión publicada previa |
| Publicar en plataforma | PASS | generación 1, `active`, `healthy` |
| Despublicar seguro | PASS | generación 2, `unpublished`, `not_serving`; ruta 404/no-store/noindex |
| Publicación final de prueba | PASS | misma revisión #1, generación 3, `active`, `healthy` |

No se forzó el backend ni se evitó ningún gate. La despublicación y los fallos intermedios conservaron cierre fail-closed.

### 5.3 Rutas públicas

| Ruta | HTTP | Resultado visible |
|---|---:|---|
| `/promo/aladdins-carpet-stg` | 308 | redirección privada/no-store a `/promo/aladdins-carpet-stg/es` |
| `/promo/aladdins-carpet-stg/es` | 200 | publicación localizada ES |
| `/promo/aladdins-carpet-stg/en` | 200 | publicación localizada EN |

Durante la despublicación intermedia, ES volvió a 404 con `private, no-store` y `X-Robots-Tag: noindex, nofollow, noarchive`; después de la publicación final volvió a 200.

## 6. Defectos encontrados y corregidos

### TS84-STG-DEF-001 — editor de idiomas rechaza el footer creado por el CMS

- **Severidad:** bloqueante para STG-0001.
- **Reproducción:** crear una Promo con el Admin desplegado, guardar el footer desde Contenido y abrir Idiomas.
- **Resultado:** Idiomas muestra “La configuración contiene datos incompletos o no permitidos”; el estado queda con versión e idiomas en `—`.
- **Efecto aguas abajo:** no se pueden completar SEO/ES/EN; la candidata queda bloqueada; preview y publicación no son ejecutables.
- **Causa demostrada:**
  - `promoCms.ts` crea el footer localizado con `heading`, `summary` y `text`.
  - `promoPreview.ts` y el validador backend aceptan esos tres campos.
  - `promoLocales.ts` y `PromoLocalesEditor.astro` desplegados solo permiten `text` para `footer`.
- **Corrección mínima local:** permitir `heading`, `summary` y `text` en el normalizador y UI de Idiomas, más una prueba de regresión que usa los tres campos.
- **Estado de la corrección:** commit `aa9af35`, desplegada y retest PASS en Idiomas v6; después se completó el borrador hasta v10.

Archivos de corrección:

- `frontend-powerzona/src/lib/promoLocales.ts`
- `frontend-powerzona/src/components/admin/promo/PromoLocalesEditor.astro`
- `frontend-powerzona/tests/promoLocales.test.mjs`

### TS84-STG-DEF-002 — el shell frontend rechazaba el envelope localizado contractual

- **Severidad:** crítica para publicación pública.
- **Reproducción:** publicar una revisión válida; PocketBase devolvía 200 con `promo.public.localized.v1`, pero la ruta Astro respondía 503.
- **Causa demostrada:** PocketBase incluye por contrato `ok` y `contract` dentro de `profile`; el normalizador frontend exigía un objeto exacto que omitía ambos campos.
- **Corrección:** aceptar exclusivamente `ok: true` y `contract: promo.public.localized.v1`, manteniendo rechazo de campos extra y contratos desconocidos.
- **Estado:** commit `4db79f8`, desplegado; la respuesta real de PocketBase pasó el normalizador (`route=serve`, locale ES).

### TS84-STG-DEF-003 — ruta interna ignorada por el manifiesto Astro

- **Severidad:** crítica para publicación pública.
- **Reproducción:** después de normalizar correctamente el perfil, el middleware reescribía a `/__pz/promo-shell` y Astro devolvía 404.
- **Causa demostrada:** `src/pages/__pz/promo-shell.astro` no se registraba en el manifiesto del build.
- **Corrección:** representación interna registrada en `/promo-shell-internal`, conservada como ruta sensible y consumida solo mediante rewrite con `Astro.locals` validados.
- **Estado:** commit `ff4f15f`, desplegado; manifiesto local contiene la ruta y ES/EN responden 200 en staging.

### Observación no crítica

El validador público rechazó la candidata mientras los encabezados de secciones ocultas serializadas estaban vacíos, aunque el diagnóstico editorial mostraba 100 %. Se completaron encabezados ES/EN sin hacer visible esas secciones. La publicación final no queda afectada; permanece como ajuste futuro de coherencia entre diagnóstico y validación, sin cambio de contrato compartido en STG-0001.

## 7. Matriz funcional

| Área | Comprobación | Resultado |
|---|---|---|
| Master | creación y control de tienda Promo | PASS |
| Master | lifecycle/entitlements/CAS visible | PASS |
| Master | canonical plataforma | PASS |
| Master | cero bindings y capability custom cerrada | PASS |
| Admin | contexto tenant y soporte Master explícitos | PASS |
| Admin | solo módulos Promo | PASS |
| CMS | identidad, hero, servicios, propietario y footer | PASS |
| Tema | release aprobada y tokens allowlisted | PASS |
| Contacto | teléfono tipado, primary único, label y aria | PASS |
| Medios | biblioteca tenant-scoped vacía y cuotas | PASS |
| Galería | estados visible/oculto; final oculto sin medios | PASS |
| Reseñas | adaptador off y empty state | PASS |
| Idiomas | ES/EN cargados, guardados e incluidos al 100 % | PASS |
| Preview | candidata #1 privada desktop/móvil | PASS |
| Publicación | publicar/despublicar/publicación final | PASS |
| Ruta plataforma | 308 a locale por defecto | PASS |
| Ruta localizada | ES/EN 200; `html lang`, canonical y hreflang | PASS |
| Analítica Promo | capability presente; collector first-party allowlisted | PASS |
| Landing QR Promo | doble gate cerrado | PASS |

## 8. Matriz de seguridad, privacidad y aislamiento

| Control | Resultado exacto | Estado |
|---|---|---|
| Host mismatch | `503` con `Host: attacker.invalid` | PASS fail-closed |
| Origin cross-site | `403` en PUT no autenticado con Origin externo | PASS fail-closed |
| CSP | `default-src 'self'`, `base-uri 'none'`, `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'none'`, scripts first-party | PASS |
| Staging noindex | `X-Robots-Tag: noindex, nofollow, noarchive` | PASS |
| Caché no público | `Cache-Control: private, no-store, max-age=0` | PASS |
| Clickjacking | `X-Frame-Options: DENY` y `frame-ancestors 'none'` | PASS |
| Permisos del navegador | cámara, micrófono, geolocalización, payment y USB deshabilitados | PASS |
| Tenant Commerce → Promo | `/t/powerzona/admin/promo/content` devuelve “No tienes permiso” | PASS |
| Tenant Promo → Commerce | ruta Commerce inexistente vuelve al dashboard Promo sin módulos Commerce | PASS |
| Dominio custom | capability ausente y “No hay bindings registrados” | PASS |
| Evidencia | sin tokens, cookies, IDs internos, secretos ni payloads privados | PASS |

Cabeceras públicas saneadas observadas en la ruta Promo no publicada:

```text
HTTP/1.1 404 Not Found
Cache-Control: private, no-store, max-age=0
Content-Security-Policy: default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; ...
Cross-Origin-Opener-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
X-Robots-Tag: noindex, nofollow, noarchive
```

## 9. Evidencia visual

Todas las capturas se guardaron saneadas; no contienen tokens, cookies, IDs técnicos ni secretos.

| Archivo | Dimensiones | Qué demuestra |
|---|---:|---|
| `01-publicacion-gate-bloqueado.jpg` | 1587×1266 | borrador v5, privado/noindex/no-store, candidata bloqueada, sin revisión pública |
| `02-idiomas-rechaza-footer-cms.jpg` | 1602×1278 | error reproducible al cargar Idiomas |
| `03-master-plataforma-sin-bindings.jpg` | 1587×1266 | estado intermedio v6 bloqueado, plataforma, generación 0, cero bindings |
| `04-ruta-publica-no-publicada.jpg` | 1265×712 | respuesta pública saneada “Sitio no disponible” |
| `05-commerce-busqueda-ok.jpg` | 1280×720 | búsqueda Commerce con resultado esperado |
| `06-idiomas-postdeploy-ok.jpg` | 1587×1266 | Idiomas v6 carga el footer completo tras el primer deploy |
| `07-preview-candidata-desktop-es.jpg` | 1587×1266 | candidata #1 en ES con viewport contractual desktop |
| `08-preview-candidata-movil-en.jpg` | 1587×1266 | candidata #1 en EN con marco contractual 390×844 |
| `09-publicacion-final-desktop-es.jpg` | 1587×1266 | primera publicación pública ES antes de despublicar |
| `10-despublicacion-segura.jpg` | 1587×1266 | cierre público seguro durante la despublicación |
| `12-publicacion-final-es.jpg` | 1587×1266 | publicación final ES operativa |

Directorio:

- `docs/tusenda84/evidencias/TS84-PROMO-STG-0001/`

### Cobertura desktop/móvil

- Desktop real de staging: Admin/Master y regresión Commerce capturados entre 1265×712 y 1602×1278.
- Preview desktop contractual 1280×800: PASS en ES.
- Preview móvil contractual 390×844: PASS en EN, con reflow visible dentro del marco.
- La publicación final desktop fue capturada en ES; el shell expone skip link y foco visible, y la regresión local confirma teclado, targets de 44×44, reflow, zoom, strings largos y `prefers-reduced-motion`.

## 10. Regresiones Commerce y Landing QR

No se modificó PowerZona.

| Flujo | Acción no mutante | Resultado |
|---|---|---|
| Directorio Tu Senda 84 | abrir `/` | HTTP 200; PowerZona visible y accesible |
| Home PowerZona | abrir `/t/powerzona` | catálogo, categorías y productos renderizan |
| Búsqueda | buscar `audifonos` | 1 resultado esperado |
| Checkout | abrir `/t/powerzona/checkout` con carrito vacío | empty state correcto; no se creó pedido |
| Landing QR | abrir `/t/powerzona/links` | landing renderizada |
| QR canónico | abrir `/t/powerzona/qr` | redirección a `/t/powerzona/links` |
| Separación Promo | módulos/DOM Commerce en tienda Promo | no expuestos |

No se añadieron productos, carrito, cliente, pedido, cupón, reseña o dato Commerce.

## 11. Pruebas y build locales

Prueba focal de la corrección:

```powershell
cd frontend-powerzona
node --test tests/promoLocales.test.mjs
```

Resultado: 7/7 PASS.

Regresión proporcional ejecutada:

```powershell
node --test tests/promoCms.test.mjs tests/promoLocales.test.mjs tests/promoPreview.test.mjs tests/promoPublicShell.test.mjs tests/promoPublicSeo.test.mjs tests/promoAppearance.test.mjs tests/promoMedia.test.mjs tests/promoGallery.test.mjs tests/promoAccessibility.test.mjs tests/promoResponsive.test.mjs tests/promoPerformance.test.mjs tests/promoSecurity.test.mjs tests/promoLandingQr.test.mjs tests/checkoutShippingFallback.test.mjs tests/l7q1LandingQrPremium.test.mjs
```

Resultado: 91/91 PASS, 0 fallos.

Build local:

```powershell
npm run build
```

Resultado: PASS. Astro completó el build server; solo emitió los avisos preexistentes de `getStaticPaths()` ignorado en rutas dinámicas de categoría, subcategoría y producto.

### 11.1 Commit, push y despliegue autorizado

| Commit | Alcance | Resultado staging |
|---|---|---|
| `aa9af35` | footer CMS aceptado por Idiomas | deploy PASS; editor v6 operativo |
| `4db79f8` | envelope `promo.public.localized.v1` | deploy PASS; normalización real PASS |
| `ff4f15f` | ruta interna incluida por Astro | deploy PASS; rutas ES/EN 200 |

Los tres commits se enviaron por fast-forward a `origin/dev`. Coolify ejecutó los webhooks automáticos del proyecto `tusenda-staging`; no se abrió ni modificó `tusenda-production`. El frontend quedó desplegado desde `ff4f15f`. Los disparos automáticos de PocketBase terminaron sin migraciones ni cambios de datos/volumen.

## 12. Rollback y estado final de staging

- Se creó la revisión inmutable #1 desde el borrador v10.
- Primera publicación: generación 1, `active`, `healthy`.
- Despublicación segura: generación 2, `unpublished`, `not_serving`, HTTP 404/no-store/noindex.
- Publicación final: generación 3, revisión #1, `active`, `healthy`, canonical plataforma.
- No había una revisión anterior distinta para ejecutar rollback; la despublicación comprobó el cierre seguro exigido sin eliminar la candidata.

## 13. Archivos modificados o creados

- `docs/tusenda84/prompts/TS84-PROMO-STG-0001.md` — contrato ejecutable creado.
- `docs/tusenda84/reportes/TS84-PROMO-STG-0001-implementacion.md` — este reporte.
- `docs/tusenda84/evidencias/TS84-PROMO-STG-0001/*.jpg` — once capturas saneadas; la captura Master final con identificadores técnicos se retiró del paquete.
- `frontend-powerzona/src/lib/promoLocales.ts` — corrección mínima del allowlist de footer.
- `frontend-powerzona/src/components/admin/promo/PromoLocalesEditor.astro` — exposición de los mismos campos en UI.
- `frontend-powerzona/tests/promoLocales.test.mjs` — regresión de footer CMS → Idiomas.
- `frontend-powerzona/src/lib/promoPublicShell.ts` — aceptación exacta del perfil localizado y ruta interna válida.
- `frontend-powerzona/src/lib/promoSecurity.ts` — ruta interna registrada como superficie sensible.
- `frontend-powerzona/src/pages/promo-shell-internal.astro` — representación SSR interna registrada por Astro.
- `frontend-powerzona/tests/promoPublicShell.test.mjs` — regresiones de contrato localized y ruta interna.

Los cambios funcionales están en `origin/dev`. El contrato, este reporte y las evidencias permanecen locales sin commit para evitar un despliegue adicional puramente documental.

## 14. Límites respetados

- No Cloudflare.
- No DNS, zonas, dominios, certificados ni dominio privado.
- No producción ni datos/volúmenes de producción.
- No secretos, tokens o cookies solicitados, leídos, impresos o escritos.
- No plugins ni dependencias instalados.
- No migraciones ni cambios de contratos compartidos.
- Commit, push y deploy se limitaron a los tres commits frontend expresamente autorizados y a staging.
- No Prompt de producción, dominio, release u operaciones iniciado.
- Staging conservado globalmente noindex y fail-closed.
- PowerZona verificada de forma no mutante.

## 15. Pendientes y siguiente Prompt

STG-0001 queda técnicamente completado con cero defectos críticos abiertos. Permanece pendiente únicamente el gate humano de esta ejecución y la observación no crítica de coherencia sobre encabezados de secciones ocultas.

**Siguiente Prompt ID habilitable tras aprobación humana:** `TS84-PROMO-REL-0001`.

No se inició `TS84-PROMO-REL-0001` ni ningún Prompt posterior.
