# TS84-PROMO-FOOTER-0001 — Reporte de implementación

## 1. Estado

- Prompt ID: `TS84-PROMO-FOOTER-0001`.
- Estado: **COMPLETADO**.
- Fecha: `2026-08-24`.
- Rama local: `dev`.
- Base autorizada verificada antes de modificar: `fc086c6`.
- Worktree inicial: limpio.
- Commit creado: **no**.
- Siguiente Prompt ID habilitado: `TS84-PROMO-QR-0001`.
- `TS84-PROMO-QR-0001` y los prompts posteriores no fueron iniciados.

## 2. Contratos consultados

Se leyó y respetó como contrato principal:

- `docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md`;
- `docs/tusenda84/reportes/TS84-PROMO-CONTACT-0001-implementacion.md`;
- los reportes y contratos previos de arquitectura, datos, permisos, publicación, configuración pública, internacionalización, tema, CMS, preview, media, renderer, Hero, secciones y reseñas referenciados por la cadena aprobada.

La implementación se limita al footer Promo y conserva el renderer negro/dorado, Hero, secciones, reseñas y contacto ya aprobados.

## 3. Resultado funcional

El footer Promo público ahora permite, dentro de un contrato cerrado:

- título, resumen y texto localizados;
- hasta 8 enlaces internos a secciones visibles de la misma revisión publicada;
- hasta 4 perfiles sociales tipados, uno por red;
- branding de plataforma reservado y no editable; y
- presentación responsive SSR coherente con el tema negro/dorado.

La configuración histórica `config: {}` continúa siendo válida. En ese estado el footer mantiene su copy localizado y el branding reservado, sin inventar enlaces ni perfiles.

## 4. Contrato de configuración

La sección `footer` admite únicamente estas claves opcionales:

```json
{
  "navigation_section_keys": ["hero-main", "services-main"],
  "social_profiles": [
    { "network": "instagram", "handle": "negocio.oficial" }
  ]
}
```

### 4.1 Enlaces internos

- `navigation_section_keys` tiene máximo 8 elementos únicos.
- Cada valor debe ser una section key existente.
- El destino no puede ser otro footer.
- En una revisión pública, el destino debe estar visible.
- El `href` público se compila como `#promo-section-<sectionKey>`.
- El label procede exclusivamente del contenido localizado de la revisión publicada.

No se aceptan rutas Admin, Master, API, Commerce, checkout ni URLs libres.

### 4.2 Redes sociales

Solo se admiten estas redes y formatos:

| Red | Configuración persistida | Destino público compilado por servidor |
|---|---|---|
| Instagram | handle validado | `https://www.instagram.com/<handle>/` |
| Facebook | handle validado | `https://www.facebook.com/<handle>` |
| LinkedIn | slug de compañía validado | `https://www.linkedin.com/company/<handle>/` |
| YouTube | handle validado | `https://www.youtube.com/@<handle>` |

El tenant no persiste protocolos, hosts, query strings, fragmentos ni URLs arbitrarias. Los perfiles son únicos por red y la lista tiene máximo 4 elementos.

### 4.3 Branding reservado

El contrato público `promo.footer.v1` incluye siempre:

```json
{
  "branding": {
    "label": "<mensaje de sistema localizado>",
    "name": "Tu Senda 84"
  }
}
```

`Tu Senda 84` es una constante de plataforma. No es contenido tenant-controlled ni se obtiene de Commerce.

## 5. Internacionalización exacta

Se añadieron al catálogo de sistema versionado `promo.system.v1`:

- `a11y.footer_links`;
- `a11y.footer_social`;
- `a11y.footer_social_link`; y
- `footer.platform_branding`.

Los labels de navegación proceden del locale efectivo de la revisión publicada. Las etiquetas accesibles de grupos y redes se materializan después de localizar la proyección. El cliente vuelve a comprobar cada template materializado y falla cerrado ante cualquier mezcla de locale o alteración del contrato.

## 6. Flujo público y aislamiento de datos

El flujo final queda:

```text
revisión publicada inmutable
  → proyección pública PUBCFG
  → locale exacto I18N
  → footer compilado
  → contacto compilado
  → reseñas adaptadas
  → validación allowlisted frontend
  → SSR Astro negro/dorado
```

El footer:

- no ejecuta readers paralelos;
- no crea endpoints públicos o privados nuevos;
- no consulta colecciones Commerce;
- no recibe IDs internos, tenant IDs ni contenido de otros locales;
- no usa borradores en la ruta pública; y
- no contiene hidratación, scripts comerciales ni scripts controlados por el tenant.

El frontend exige la correspondencia exacta entre configuración publicada, enlaces compilados, contenido localizado y branding reservado. Una respuesta manipulada falla cerrada.

## 7. CMS y preview

El editor de contenido Promo existente se extendió sin crear un módulo, permiso o proxy paralelo.

El usuario autorizado por `promo.content.manage` puede:

- editar título, resumen y texto del footer;
- seleccionar secciones internas visibles;
- informar handles de las cuatro redes allowlisted; y
- conservar el flujo de borrador, CAS y publicación ya aprobado.

El preview privado representa los enlaces internos y las redes como elementos inertes. No abre destinos externos ni ejecuta acciones reales. También muestra el branding reservado de plataforma.

No se modificaron permisos Master, ownership, roles ni endpoints Admin.

## 8. Renderer, responsive y accesibilidad

Se añadió un componente Astro SSR dedicado y CSS dentro del budget combinado ya existente.

El resultado incluye:

- semántica `<footer>` y `<nav>`;
- labels accesibles localizados para navegación y redes;
- `aria-label` individual en cada destino social;
- targets de al menos 44 px;
- foco visible heredado del renderer aprobado;
- enlaces internos por fragmento;
- copy con wrapping seguro para nombres y textos largos;
- layout de tres columnas en desktop, reflujo tablet y una columna móvil;
- reducción de movimiento respetada; y
- cero scroll horizontal en los viewports verificados.

Los enlaces sociales no usan `target="_blank"` ni añaden comportamiento JavaScript.

## 9. Compatibilidad conservada

### Master

- El branding `Tu Senda 84` permanece reservado.
- No se añadieron enlaces Master ni configuración tenant-controlled de plataforma.
- No se modificaron planes, permisos, ownership o auditoría.

### Admin

- Se reutilizan el CMS, proxy, CAS y permisos existentes.
- No se crean rutas Admin nuevas.
- El preview sigue siendo privado e inerte.

### Commerce

- No se reutilizan productos, categorías, precios, carrito, checkout, pedidos ni infraestructura Commerce para modelar Promo.
- No se modificaron routes, resolvers ni guards Commerce.
- No se activó capacidad transaccional.

### Multi-tenant y SSR

- Toda la información pública sigue derivando de una sola revisión publicada del sitio resuelto.
- No se añadió estado global mutable ni lookup cruzado entre tenants.
- El footer se renderiza completamente en SSR y no requiere hidratación cliente.

## 10. Archivos

### Backend

- `backend-powerzona/pb_hooks/pz_promo_footer_lib.js` — contrato, validación y compilación pública.
- `backend-powerzona/pb_hooks/pz_promo_pubcfg_lib.js` — configuración footer y referencias internas.
- `backend-powerzona/pb_hooks/pz_promo_i18n_lib.js` — catálogo exacto ES/EN.
- `backend-powerzona/pb_hooks/pz_promo_shell_api_lib.js` — incorporación del footer después de localizar la proyección.
- `backend-powerzona/tests/pz_promo_footer.test.cjs` — pruebas focales.

### Frontend público

- `frontend-powerzona/src/lib/promoPublicShell.ts` — normalización fail-closed de `promo.footer.v1`.
- `frontend-powerzona/src/components/promo-public/PromoFooter.astro` — renderer SSR.
- `frontend-powerzona/src/components/promo-public/PromoBlackGoldTheme.astro` — integración en orden publicado.
- `frontend-powerzona/src/styles/promo-footer.css` — layout negro/dorado responsive.
- `frontend-powerzona/tests/promoPublicShell.test.mjs` — regresiones de contrato y estructura.

### CMS y preview

- `frontend-powerzona/src/lib/promoCms.ts`.
- `frontend-powerzona/src/components/admin/promo/PromoCmsEditor.astro`.
- `frontend-powerzona/src/styles/promo-cms.css`.
- `frontend-powerzona/tests/promoCms.test.mjs`.
- `frontend-powerzona/src/lib/promoPreview.ts`.
- `frontend-powerzona/src/components/admin/promo/PromoPreviewEditor.astro`.
- `frontend-powerzona/src/styles/promo-preview.css`.

### Infraestructura

- Migraciones nuevas: **0**.
- Colecciones nuevas: **0**.
- Endpoints nuevos: **0**.
- Permisos nuevos: **0**.
- Dependencias nuevas: **0**.
- Variables de entorno nuevas: **0**.
- Seeds o registros persistentes: **0**.

## 11. Pruebas

### Backend focal

```text
node --test tests/pz_promo_footer.test.cjs tests/pz_promo_pubcfg.test.cjs
  tests/pz_promo_i18n.test.cjs tests/pz_promo_shell.test.cjs
  tests/pz_promo_contact.test.cjs

Resultado: 34/34 PASS
```

### Runtime local PocketBase desechable

```text
node --test tests/pz_promo_pubcfg_http_runtime.test.cjs

Resultado: 1/1 PASS
```

El runtime utilizó exclusivamente binario, base y puertos locales temporales; no consultó PocketBase desplegado.

### Backend completo

```text
node --test

Resultado: 879 total; 872 PASS; 0 FAIL; 7 SKIP esperados
```

Los siete skips corresponden a gates opt-in preexistentes que requieren URL o credenciales externas y no se activaron.

### Frontend completo

```text
node --test

Resultado: 720/720 PASS
```

### Build SSR

```text
npm run build

Resultado: PASS
```

Persisten únicamente tres warnings preexistentes de Astro sobre `getStaticPaths()` ignorado en las rutas dinámicas de categoría, producto y subcategoría con output server.

### Higiene del diff

```text
git diff --check

Resultado: PASS
```

## 12. QA visual y funcional local

Se siguió el inventario funcional/visual y el cleanup de `playwright-interactive`. Como `js_repl` no estaba expuesto en esta tarea, la ejecución se realizó con Playwright estándar, el Chrome local, el build Astro SSR y un backend HTTP sintético de loopback. No se descargaron navegadores ni dependencias y no se consultó red externa.

| Estado/vista | Verificación | Resultado |
|---|---|---|
| Desktop `1440×900`, ES, footer completo | copy, 4 enlaces internos, 4 redes, branding y composición negro/dorado | PASS |
| Móvil `390×844`, ES, footer completo | reflujo, targets de 44 px, legibilidad y cero overflow | PASS |
| Estrecho `320×700`, nombre largo y config vacía | wrapping, branding reservado, cero enlaces inventados y cero overflow | PASS |
| Locale `en` | `html[lang]`, labels de grupo, copy y branding localizado | PASS |
| Navegación por teclado | foco visible dentro del footer | PASS |
| Enlace interno | fragmento exacto y destino existente en la misma página | PASS |

En todas las vistas:

- `documentElement.scrollWidth === clientWidth`;
- el footer no tuvo overflow interno;
- los enlaces visibles midieron al menos 44 px de alto;
- hubo 0 errores de página;
- hubo 0 requests fallidas; y
- no apareció contenido de carrito, checkout, precios o pedidos.

Las capturas, runners, servidores y procesos temporales propios fueron eliminados al cerrar el QA.

## 13. Límites conservados

- No se implementó QR, responsive cross-browser ampliado, dominios Cloudflare ni ningún prompt posterior.
- No se añadieron media de footer ni variantes nuevas; el contrato existente de MEDIA permanece disponible sin inventar una fuente o uso no pedido.
- No se activaron carrito, checkout, precios, pedidos, analytics, tags, píxeles, scripts comerciales ni código tenant-controlled.
- No se creó integración con redes sociales: solo enlaces canónicos tipados.
- No se hicieron consultas ni cambios en PocketBase desplegado, Cloudflare, Coolify, staging o producción.
- No se leyeron secretos.
- No se hizo push, merge, deploy, release ni commit.

## 14. Siguiente prompt habilitado

Con `TS84-PROMO-FOOTER-0001` completado, el siguiente Prompt ID habilitado por el mapa maestro es:

`TS84-PROMO-QR-0001`

No fue iniciado en esta implementación.
