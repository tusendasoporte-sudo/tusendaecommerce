# TS84-PROMO-SEC-0001 — Implementación

Fecha: 2026-08-24  
Estado: **COMPLETADO**  
Rama: `dev`  
Base verificada antes de modificar: `6b66449`  
Siguiente Prompt ID: `TS84-PROMO-PERF-0001` (**no iniciado**)

## Alcance ejecutado

Se implementó exclusivamente `TS84-PROMO-SEC-0001`. La entrega endurece las fronteras HTTP de Promo en Astro y PocketBase sin conectar proveedores, cambiar DNS, usar secretos, modificar migraciones ni alterar Commerce.

Se respetaron como contratos el mapa maestro y los reportes aplicables de ARC, DATA-DES, DATA, PERM, PUBCFG, AUDIT, I18N, DOM-CORE, PUBLISH, MASTER, SHELL, CONTACT, QR, DOM-CF, SEO y ANALYTICS. También se leyó como estado de partida `TS84-PROMO-ANALYTICS-0001-implementacion.md`, incluida la familia `landing_qr_open`.

## Archivos

| Archivo | Decisión material |
|---|---|
| `backend-powerzona/pb_hooks/pz_promo_security_lib.js` | Frontera global para todas las rutas `/api/pz/promo/`: Host/Origin, contenido JSON de collectors, headers, rate limiting y respuestas saneadas. |
| `backend-powerzona/pb_hooks/pz_promo_security.pb.js` | Registra el middleware global con prioridad `-950`, antes del enforcement Promo de permisos. |
| `backend-powerzona/pb_hooks/pz_promo_domain_lib.js` | Sustituye el booleano insuficiente de proxy por el contrato explícito `promo.trusted-proxy.v1`, peer remoto exacto y allowlist exacta de peers. |
| `backend-powerzona/tests/pz_promo_domain.test.cjs` | Cubre peer válido, peer ajeno, ausencia de contrato, CIDR no permitido y listas Host ambiguas. |
| `backend-powerzona/tests/pz_promo_security.test.cjs` | Matriz focal backend de Host, Origin, XFH, CSP, rate limit, collectors y clasificación de todas las rutas Promo registradas. |
| `frontend-powerzona/src/lib/promoSecurity.ts` | Autoridad Host común, separación plataforma/custom, guard de Origin para métodos mutables, CSP y errores genéricos. |
| `frontend-powerzona/src/middleware.ts` | Ejecuta la frontera Promo antes de resolver dominio, SEO, shell o collector; excluye explícitamente las rutas Commerce normales. |
| `frontend-powerzona/src/lib/promoPublicShell.ts` | Reutiliza la autoridad Host estricta y aplica los headers Promo a páginas y errores públicos. |
| `frontend-powerzona/src/lib/promoPublicSeo.ts` | Reutiliza Host estricto y aplica headers Promo a sitemap, robots y redirects. |
| `frontend-powerzona/src/lib/promoPublicAnalytics.ts` | Reutiliza Host estricto, propaga el Origin ya validado al backend y aplica headers a collectors, incluido `landing_qr_open`. |
| `frontend-powerzona/tests/promoSecurity.test.mjs` | Matriz focal frontend de spoofing, aliases, locales, cruces de rutas, Origin JSON, CSP, errores y no regresión Commerce. |
| `docs/tusenda84/reportes/TS84-PROMO-SEC-0001-implementacion.md` | Este reporte verificable. |

No se modificó `astro.config.mjs`: `security.checkOrigin: true` permanece activo.

## Decisiones de seguridad

### Host, dominio y proxy

- PocketBase usa `e.request.host`, la autoridad nativa conservada por Go. Un `Host` adicional, si está disponible, debe coincidir exactamente.
- Host rechaza controles, espacios, comas, credenciales, paths, query, fragmentos, wildcard, puertos fuera de rango, DNS mal formado e IPv4/IPv6 inválidos.
- `X-Forwarded-Host` nunca se convierte en autoridad en el runtime actual. Una lista o valor ambiguo falla cerrado.
- El soporte futuro de XFH en DOM-CORE exige simultáneamente `trustedProxy: true`, contrato `promo.trusted-proxy.v1`, peer remoto exacto y presencia exacta en `trustedProxyPeers`. No se admiten wildcard ni CIDR.
- Plataforma usa hosts exactos. Un dominio no-plataforma solo puede alcanzar `/`, un locale allowlisted, `sitemap.xml`, `robots.txt` y el collector custom. Admin, Master, configuración y collectors de plataforma fallan cerrados desde un dominio custom.
- Aliases no seleccionan tenant en Astro: el Host exacto se entrega a DOM-CORE, que conserva el redirect al primary activo del mismo site o responde de forma genérica.

### Origin

- Astro exige Origin exacto —esquema, hostname y puerto normalizados— en toda operación mutable Promo, incluido JSON. Esto cierra el hueco donde `security.checkOrigin` global protege forms pero no necesariamente `application/json`.
- Custom exige HTTPS y mismo Host; HTTP solo se admite para loopback local. `null`, sufijos, credenciales, ports distintos y `Sec-Fetch-Site: cross-site` se rechazan.
- PocketBase valida estrictamente cualquier Origin presente contra plataforma o Host custom. La ausencia se conserva para clientes internos servidor-a-servidor ya contratados; la superficie web Astro nunca omite Origin en mutaciones Promo.
- El collector Astro reenvía solo el Origin que ya atravesó la validación, no una cabecera proxy reconstruida.

### Aislamiento y sanitización

- No se añadió ningún selector de tenant al payload público. Los collectors siguen derivando tenant de `publicSlug` de ruta o del Host exacto; un campo `store`, URL, referrer, visitor ID o PII continúa rechazado por contrato.
- Errores públicos no reflejan Host, Origin, tenant, payload ni códigos internos: devuelven únicamente `promo_host_unavailable`, `promo_origin_forbidden` o el contrato público preexistente.
- La proyección pública continúa leyendo solo revisión/slot publicados. Draft, candidata, slot inválido, sitio/entitlement/binding inactivo o cruce entre tiendas fallan cerrados.
- `Content-Type` de collectors PocketBase debe ser `application/json`; el cuerpo y las cuatro familias ANALYTICS siguen sometidos al contrato exacto existente: `page_view`, `section_view`, `contact_activate` y `landing_qr_open`.
- No se escriben secretos, IP, Host ni payload en AUDIT. El rate limiter es efímero y no genera un evento AUDIT por visita pública.

### Rate limiting

Ventana fija de 60 segundos, por proceso, IP nativa segura (`remoteIP`, nunca `realIP`/XFF), Host y ruta concreta:

| Clase | Límite/minuto | Superficie |
|---|---:|---|
| `public_collect` | 360 | Collectors plataforma/custom, incluido `landing_qr_open`. |
| `public_media` | 2.400 | Media pública content-addressed. |
| `public_read` | 1.200 | Shell, SEO, locales y configuración pública. |
| `private_read` | 600 | Contexto, listados, resumen, preview y catálogos privados. |
| `private_write` | 180 | Escrituras privadas ordinarias. |
| `critical_write` | 60 | Publicación, dominios, lifecycle y simulación DOM-CF. |

La tabla cubre las 49 rutas Promo registradas actuales. Al exceder devuelve `429` y `Retry-After`. El mapa se poda y queda acotado a 8.192 buckets.

### CSP y headers

- Páginas Promo: `default-src 'self'`, scripts solo `'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'none'`, conexión same-origin y media central allowlisted.
- No se admite `unsafe-eval` ni scripts remotos. `style-src 'unsafe-inline'` se conserva únicamente porque Astro y los errores SSR actuales materializan estilos inline.
- API PocketBase usa una CSP todavía más cerrada: `default-src 'none'`.
- Se aplican además `Permissions-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y, en Astro, `Cross-Origin-Opener-Policy`.

## Matriz de amenazas y pruebas

| Amenaza/caso | Resultado esperado y obtenido | Evidencia |
|---|---|---|
| Host con coma, controles, URL, credenciales, wildcard, suffix trick o puerto inválido | `421`/respuesta pública genérica; sin resolver tenant. | `pz_promo_security.test.cjs`, `promoSecurity.test.mjs`. |
| XFH falsificado o lista proxy ambigua | Ignorado como autoridad o rechazado; booleano `trustedProxy` solo ya no habilita confianza. | Tests SEC y DOM-CORE. |
| Peer proxy distinto, CIDR o contrato ausente | Fail-closed `421`. | `pz_promo_domain.test.cjs`. |
| JSON POST sin Origin en Astro, Origin `null`, cross-site, suffix o puerto distinto | `403`; Commerce normal queda fuera de esta frontera. | `promoSecurity.test.mjs`. |
| Alias activo | Solo shell/SEO/locale público; DOM-CORE decide redirect exacto al primary del mismo site. | Suites DOM-CORE, SHELL y SEO. |
| Locale válido/ausente/casing no canónico | Solo path allowlisted; I18N/SHELL conserva redirect o fail-closed preexistente. | Suites I18N/SHELL y test SEC frontend. |
| Dominio custom intenta admin, PUBCFG privada o collector de otro slug | `404` genérico antes de invocar la superficie. | `promoSecurity.test.mjs`. |
| Payload público intenta elegir `store`, URL, referrer o identidad | Rechazado por contrato exacto; tenant se deriva de ruta/Host. | Suites ANALYTICS frontend/backend. |
| Usuario secundario/staff/Master intenta cruzar tienda o permiso | Mantiene gates PERM/Master y contexto explícito `X-PZ-Promo-Store`. | Suite focal PERM/MASTER y runtime PUBCFG. |
| Sitio sin publicación, binding inactivo, unknown Host o cruce de primary | No se sirve draft ni se usa fallback Commerce. | Runtime PUBCFG y suites DOM-CORE/PUBCFG. |
| Abuso sostenido de collector/media/read/write/critical | Bucket proporcional, `429` y `Retry-After`; todas las rutas clasificadas. | `pz_promo_security.test.cjs`. |
| Inyección activa en respuesta o error | Payloads exactos, errores fijos, CSP sin scripts remotos/`unsafe-eval`. | Suites PUBCFG/CMS/SHELL y tests SEC. |
| Tienda Commerce o ruta Commerce normal | Decisión `relevant: false`; no pasa por resolución custom ni cambia permisos. | `promoSecurity.test.mjs` y suite frontend completa. |

## Resultados

| Comando/control | Resultado |
|---|---|
| Focal backend SEC + DOM-CORE final | 16/16 aprobadas. |
| Focal backend Promo ampliado | 67/67 aprobadas. |
| Runtime PocketBase PUBCFG real | 1/1 aprobado; actores, dos tenants, publicación, custom Host, Analytics y REST cerrado. |
| Focal frontend final | 22/22 aprobadas. |
| Suite frontend completa `node --test` | 743/743 aprobadas. |
| `npm run build` | Aprobado; SSR Astro construido, `checkOrigin` activo y script Promo emitido como asset propio. |
| Suite backend completa `node --test` fuera del sandbox | 898 aprobadas, 2 fallidas, 7 omitidas, 907 totales. |
| `git diff --check` | Aprobado; solo advertencias informativas LF/CRLF. |

Las dos fallas de la suite backend completa son expectativas de rollback anteriores a la base `6b66449`, no regresiones SEC:

1. `pz_promo_data_http_runtime.test.cjs` enumera seis migraciones y ejecuta `migrate down 6`; la base ya contiene la séptima `1787520600_promo_analytics_landing_qr.js`, por lo que el foundation queda aplicado.
2. `pz_promo_permissions_http_runtime.test.cjs` ejecuta `migrate down 2` esperando retirar PERM; con las dos migraciones posteriores de publicación cero y Analytics, PERM permanece correctamente aplicado.

No se modificaron esos tests ni migraciones porque corregir su contabilidad pertenece al cierre anterior de ANALYTICS/DATA y queda fuera del alcance exclusivo de SEC. El runtime PUBCFG que carga el middleware nuevo sí quedó verde después de validar el Host nativo de PocketBase.

## Límites y trabajo no realizado

- El rate limiter es local por proceso; no coordina réplicas. Una solución distribuida requeriría una superficie compartida y autorización separada.
- PocketBase conserva compatibilidad sin Origin para llamadas servidor-a-servidor; toda Origin presente es estricta y Astro exige Origin en la frontera web mutable.
- XFH permanece desactivado en runtime. El contrato explícito queda preparado, pero no se configuró ningún proxy/ingress ni peer real.
- No se conectó Cloudflare, no se instaló plugin, no se usaron credenciales, no se activó DNS/TLS, no se accedió a staging/producción y no hubo tráfico externo.
- No se creó migración, deploy, release, push, merge ni commit.
- `TS84-PROMO-PERF-0001` se identifica como siguiente Prompt ID, pero no se inició.
