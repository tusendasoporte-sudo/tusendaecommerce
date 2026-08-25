# TS84-PROMO-ANALYTICS-0001 — Implementación de analíticas Promo

## 1. Estado

- Prompt ejecutado: `TS84-PROMO-ANALYTICS-0001`
- Rama local: `dev`
- HEAD limpio de partida: `099bd59`
- Dependencias reutilizadas: SHELL-0001, CONTACT-0001, QR-0001, DOM-CORE-0001, I18N-0001, MASTER-0001, AUDIT-0001 y SEO-0001
- Estado de entrega: implementado y validado; cambios locales sin commit
- Siguiente Prompt ID del mapa: `TS84-PROMO-SEC-0001`

## 2. Resultado

Se implementó una canalización analítica exclusivamente Promo para:

1. `page_view` — visita de una página Promo localizada y canonical;
2. `section_view` — sección publicada visible al menos al 50 %, una vez por carga;
3. `contact_activate` — activación del contacto primario publicado; y
4. `landing_qr_open` — apertura del puente Promo hacia la Landing QR central existente.

Los cuatro eventos se agregan inmediatamente por día, locale, tema y dimensión allowlisted. El panel privado presenta rangos de 7, 30 y 90 días con visitas, secciones, contactos, aperturas Landing QR, secciones principales, canales e idiomas.

No se modificaron `landing_qr_view`, `landing_qr_click`, `store_analytics_events`, el destino central `/t/{storeSlug}/links` ni ninguna colección Commerce. `landing_qr_open` mide solo el clic de salida desde Promo; la Landing QR central conserva sus métricas existentes e independientes.

## 3. Contratos respetados

Antes de implementar se revisaron el mapa maestro, SHELL, CONTACT, QR/L7Q1, DOM-CORE, I18N, MASTER, AUDIT, SEO, ARC y DATA-DES.

Las decisiones resultantes fueron:

- PERM continúa como única autoridad de lectura mediante `promo.analytics.view` y `analytics_enabled`.
- PUBCFG/SHELL continúan como única fuente de sitio, revisión, locale, secciones, tema y contacto publicados.
- DOM-CORE continúa como única autoridad del `Host`; un evento custom solo se persiste para el primary activo exacto.
- QR continúa compilando el enlace central y sus gates dobles Promo + Commerce; ANALYTICS no reconstruye ni recibe su destino.
- AUDIT no registra lecturas públicas ni cada impresión/clic analítico. Eso produciría amplificación y duplicaría una telemetría que ya tiene almacenamiento privado separado.
- MASTER solo puede leer analíticas con `X-PZ-Promo-Store` explícito y dentro de ese tenant.

La adición `landing_qr_open` fue autorizada durante este prompt para contestar el caso de dominio personalizado. Es una extensión Promo-only del vocabulario inicial de ARC; no altera los eventos Landing QR Commerce preexistentes.

## 4. Flujo por canonical y dominio

### 4.1 Ruta de plataforma

La página canonical `https://tusenda84.com/promo/{publicSlug}/{locale}` publica hacia:

`POST /api/promo/analytics/sites/{publicSlug}`

El proxy llama al collector PocketBase por slug. El backend vuelve a resolver el slot publicado y solo acepta un contexto `source=platform`, `action=serve`, con locale exacto y entitlement vigente. Si el sitio cambió a canonical custom, la ruta de plataforma no persiste el evento.

### 4.2 Dominio personalizado

La página canonical `https://dominio-propio/{locale}` publica same-origin hacia:

`POST /api/promo/analytics/host`

El middleware permite únicamente esa ruta analítica exacta antes del shell custom. El proxy server-side remite el JSON al backend conservando solo el `Host` autoritativo; no reenvía cookies, autorización, referrer, user-agent, URL ni cabeceras proxy. DOM-CORE resuelve nuevamente el binding y exige:

- coincidencia exacta de hostname;
- binding current/active;
- rol `primary`;
- primary del slot custom del mismo site;
- revisión publicada exacta; y
- capability `analytics_enabled` vigente.

Aliases, hosts desconocidos, suffix tricks, plataforma en modo custom, locales no publicados y tenants sin analytics reciben una aceptación pública uniforme `202` pero no crean filas. Los payloads estructuralmente inválidos reciben `400`.

El enlace Landing QR sigue apuntando directamente a `https://tusenda84.com/t/{storeSlug}/links`, sin query, hash, UTM, hostname custom o identificador de origen. El evento `landing_qr_open` se envía en paralelo con `keepalive` y nunca bloquea la navegación.

## 5. Privacidad y minimización

Payload público exacto:

```json
{
  "contract": "promo.analytics.collect.v1",
  "event_id": "uuid-v4-de-un-solo-evento",
  "event_type": "page_view | section_view | contact_activate | landing_qr_open",
  "locale": "es",
  "section_key": "solo-en-section_view"
}
```

El servidor deriva site, revision, UTC day/time, theme, sección válida y tipo de contacto. Rechaza cualquier clave adicional, incluidas URL, path, query, referrer, store/site/revision, action type, mensaje, teléfono, correo, visitor/session/customer ID, user-agent o IP.

`event_id` es un UUID v4 efímero por evento usado solo para idempotencia de reintento. No se reutiliza, no se guarda en cookies/storage y no representa visitante o sesión. `unique_count` permanece siempre en cero y el contrato privado declara `unique_visitors_measured=false`.

El script respeta `Do Not Track` y Global Privacy Control. Usa `credentials: omit`, `Referrer-Policy: no-referrer`, no crea cookies y no toca `localStorage`/`sessionStorage`.

Retención aplicada:

- evento crudo privado: 7 días;
- agregado diario sin identidad: 400 días;
- limpieza server-side diaria, acotada por lotes.

## 6. Persistencia y migración

Se reutilizaron exclusivamente `promo_analytics_events` y `promo_analytics_daily`, ambas con CRUD REST cerrado.

La migración aditiva `1787520600_promo_analytics_landing_qr.js`:

1. agrega `landing_qr_open` a los dos selects `event_type` de Promo;
2. deja `unique_count.required=false` porque PocketBase 0.39 trata el cero numérico como blank;
3. conserva DATA como autoridad que exige entero no negativo; y
4. revierte solo si no existen filas `landing_qr_open`.

Cada collector corre en una transacción: crea el raw append-only y suma exactamente una unidad al bucket diario. La unique `(site, dedupe_key)` y la transacción impiden duplicar un retry del mismo evento. No se añadió relación ni índice hacia Commerce.

## 7. Lectura privada

La ruta backend `POST /api/pz/promo/private/v1/analytics/summary` exige auth, payload exacto, `promo.analytics.view` y tenant resuelto por PERM.

El frontend expone `GET /api/admin/promo-analytics?store={slug}&range={7|30|90}`. Valida sesión, tienda actual y soporte Master antes de enviar el contrato privado. La respuesta se vuelve a validar de forma estricta antes de renderizar.

El módulo Admin presenta conteos de eventos, nunca “personas” o “visitantes únicos”. La URL visible sigue siendo `/t/{storeSlug}/admin/promo/analytics`; el middleware renderiza internamente la página focal una vez completada la misma autorización del Admin Shell.

## 8. Archivos

### Backend

- `backend-powerzona/pb_hooks/pz_promo_analytics_lib.js` — contratos, validación, dimensiones y rangos.
- `backend-powerzona/pb_hooks/pz_promo_analytics_api_lib.js` — collectors platform/custom, transacción, agregado, resumen y retención.
- `backend-powerzona/pb_hooks/pz_promo_analytics.pb.js` — tres rutas acotadas y cron de limpieza.
- `backend-powerzona/pb_hooks/pz_promo_data_lib.js` — invariantes DATA para `landing_qr_open` y dimensiones diarias.
- `backend-powerzona/pb_migrations/1787520600_promo_analytics_landing_qr.js` — migración aditiva y rollback seguro.
- `backend-powerzona/tests/pz_promo_analytics.test.cjs` — contrato focal, QR, tenant, migración y retención.
- `backend-powerzona/tests/pz_promo_pubcfg_http_runtime.test.cjs` — gate PocketBase real platform/custom, A/B, permisos, idempotencia y REST cerrado.

### Frontend

- `frontend-powerzona/src/lib/promoPublicAnalytics.ts` — allowlist y proxies públicos sin credenciales.
- `frontend-powerzona/src/layouts/PromoPublicLayout.astro` — collector first-party de visitas, secciones, contacto y QR.
- `frontend-powerzona/src/middleware.ts` — paso exacto custom-host y render privado autorizado.
- `frontend-powerzona/src/pages/api/promo/analytics/host.ts` — proxy same-origin custom.
- `frontend-powerzona/src/pages/api/promo/analytics/sites/[publicSlug].ts` — proxy plataforma.
- `frontend-powerzona/src/lib/promoAnalytics.ts` — contrato estricto del resumen privado.
- `frontend-powerzona/src/pages/api/admin/promo-analytics.ts` — lectura admin tenant-scoped.
- `frontend-powerzona/src/layouts/PromoAnalyticsAdminPage.astro` — panel accesible de rangos y métricas.
- `frontend-powerzona/src/pages/promo-analytics-admin-internal.astro` — destino interno guardado por middleware.
- `frontend-powerzona/src/styles/promo-analytics.css` — presentación responsive del panel.
- `frontend-powerzona/tests/promoAnalytics.test.mjs` — payload, canonical custom, privacidad y UI.
- `frontend-powerzona/tests/promoPublicShell.test.mjs` — contrato SHELL actualizado para la única hidratación ANALYTICS aprobada.

## 9. Pruebas y resultados

### Focales y regresiones backend

```text
node --test backend-powerzona/tests/pz_promo_analytics.test.cjs ...
74/74 pass
```

Incluye DATA, migraciones fundacionales, PERM, CONTACT, Landing QR, SHELL, SEO, DOM-CORE y AUDIT.

### PocketBase real efímero

```text
node --test backend-powerzona/tests/pz_promo_pubcfg_http_runtime.test.cjs
1/1 pass
```

El gate cubre plataforma y custom primary, entitlement on/off, tenant A/B, retry idempotente, QR deshabilitado sin evento, Host desconocido no-oracular, principal, secundario sin permiso, Master con/sin contexto, raw/daily privados y rollback de migración.

### Frontend

```text
node --test tests/promoAnalytics.test.mjs tests/promoPublicShell.test.mjs tests/promoPublicSeo.test.mjs tests/promoAdminShell.test.mjs
29/29 pass

npm run build
PASS
```

El build conserva tres warnings preexistentes de Astro sobre `getStaticPaths()` ignorado en categoría, subcategoría y producto. No están relacionados con Promo Analytics.

`git diff --check` finaliza sin errores; solo informa la normalización CRLF esperada del workspace Windows.

## 10. Límites deliberados

- No hay cookies, sesión analítica, fingerprint, IP/UA almacenados ni cálculo de personas únicas.
- No existe atribución cross-domain entre el clic Promo y la visita/clic central de Landing QR.
- No se alteran `landing_qr_view`/`landing_qr_click`; correlacionarlos requeriría identidad compartida o parámetros, expresamente descartados.
- No se implementó rate limit distribuido, CSP general, política de proxy confiable ampliada ni matriz completa de abuso. Es alcance de `TS84-PROMO-SEC-0001`.
- La recolección es best-effort y no bloquea la UX; un fallo público no expone si existe tenant, entitlement o binding.
- No se conectó Cloudflare, DNS, zonas, certificados, staging, producción ni cuenta externa.
- No se solicitaron, leyeron o escribieron secretos.
- No se hizo push, merge, deploy, release ni commit.

## 11. Siguiente Prompt ID

Según el mapa maestro, el siguiente Prompt ID es **`TS84-PROMO-SEC-0001`**.

`TS84-PROMO-SEC-0001` y todos los prompts posteriores no fueron iniciados.
