# TS84-PROMO-CONTACT-0001 — Reporte de implementación

**Fecha:** 2026-08-24

**Estado:** COMPLETADO

**Rama de trabajo:** `dev`

**Base autorizada verificada:** `ddb9334`

**Commit creado:** no; pendiente de autorización separada

## 1. Resultado

Se implementó exclusivamente el CTA público localizado y la resolución segura del método principal de contacto para Tiendas Promo. El backend compila la acción desde el documento de la revisión publicada inmutable ya resuelto por PUBCFG/PUBLISH/SHELL y entrega al renderer un contrato mínimo `promo.contact.action.v1`.

La implementación:

- admite únicamente `whatsapp`, `phone` y `email` como acciones ejecutables v1;
- construye `https://wa.me`, `tel:` o `mailto:` mediante encoders tipados y valores canonicales ya validados;
- toma label, nombre accesible y mensaje exclusivamente del locale efectivo;
- activa solo la acción principal y solo cuando una superficie Hero/Contacto publicada la referencia de forma aprobada;
- entrega un fallback localizado sin `href` cuando el bloque, canal, referencia, locale, copy o destino no es válido;
- reutiliza un único componente SSR en Hero y en la sección Contacto;
- no incorpora JavaScript de contacto, hidratación, formularios, redirects libres, analytics ni scripts tenant-controlled; y
- no expone config cruda (`phone_e164`, `email_address`), acciones secundarias, records o IDs internos.

No se activaron `internal_form` ni `approved_live_chat`: ambos continúan deshabilitados hasta disponer de sus contratos propios de privacidad, CSRF/origin, rate limit, retención, adapter y CSP.

## 2. Precondiciones verificadas

Antes de modificar se confirmó:

- rama local exacta: `dev`;
- `HEAD` exacto: `ddb9334`;
- worktree limpio; y
- presencia de la implementación aprobada de `TS84-PROMO-REVIEWS-0001` como base.

## 3. Contratos respetados

Se revisaron y conservaron:

- `docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md`;
- `TS84-PROMO-ARC-0001`, especialmente el registry cerrado, compilación tipada y fallo seguro del CTA;
- `TS84-PROMO-PUBCFG-0001`, que conserva validación de E.164/email y no proyecta configuración cruda;
- `TS84-PROMO-I18N-0001`, que conserva negociación, catálogo general y un único locale efectivo;
- `TS84-PROMO-CMS-0001`, que conserva edición privada, primary/secondary y canales no habilitables;
- `TS84-PROMO-PUBLISH-0001`, que conserva el puntero atómico a la revisión publicada inmutable;
- `TS84-PROMO-SHELL-0001`, que conserva routing por slug/Host, tenant y cabeceras no-store/noindex;
- `TS84-PROMO-HERO-0001`, `TS84-PROMO-SECTIONS-0001` y `TS84-PROMO-REVIEWS-0001`, que conservan renderer negro/dorado, media y adaptadores existentes.

CONTACT no crea reader, resolver de tenant, colección, writer, permiso, capability, locale, publicación o fuente de verdad paralelos. El orden efectivo es:

```text
Host/slug aprobado
→ slot publicado exacto
→ revisión publicada inmutable validada
→ locale efectivo I18N
→ compilador CONTACT allowlisted
→ validador frontend cerrado
→ enlace SSR o estado localizado sin enlace
```

## 4. Contrato público compilado

SHELL añade al perfil público localizado un único bloque exacto:

```text
contact_action {
  contract = promo.contact.action.v1
  available
  action = null | { key, type, label, aria_label, href }
}
```

Reglas aplicadas:

- `key` debe coincidir con `contact.primary_action_key`;
- `type` debe coincidir con la acción pública allowlisted de esa key;
- `label` y `aria_label` deben coincidir exactamente con `content.contact[key]` del locale efectivo;
- Hero solo ejecuta el primary cuando su `action_key` está vacío o referencia ese mismo primary;
- la sección Contacto solo ejecuta el primary cuando `config.action_keys` lo referencia;
- WhatsApp elimina el `+` únicamente para el path numérico aprobado de `wa.me` y codifica el mensaje con `encodeURIComponent`;
- teléfono emite solo `tel:` + E.164;
- email percent-encodea el destinatario y el body localizado, sin subject/header libre;
- el frontend recompueba esquema, protocolo, origen WhatsApp, E.164, encoding canonical, ausencia de CRLF, extra fields y consistencia con el perfil; y
- cualquier inconsistencia produce `{ available:false, action:null }` o invalida el perfil manipulado, nunca una URL improvisada.

La URL compilada es el destino público necesario para ejecutar la acción; la configuración fuente no se serializa. El origen fijo `wa.me` pertenece al registry de transporte aprobado y no es un destino configurable del tenant.

## 5. Renderer, accesibilidad y responsive

Se añadió una única acción SSR reutilizable:

- `<a>` real solo cuando el contrato compilado está disponible;
- nombre accesible exacto mediante `aria-label` localizado;
- foco visible de 3 px y navegación por teclado;
- target táctil de al menos 54 px;
- estado `role=status` sin enlace cuando el canal no está disponible;
- sin `onclick`, listener, formulario, hidratación o script propio;
- Hero y sección Contacto con el mismo destino/label principal;
- composición negra/dorada consistente con ALADDIN; y
- ajuste del Hero sin media para que copy largo y CTA permanezcan completos en alturas desktop acotadas.

El build continúa incluyendo únicamente el módulo first-party de prefetch de Astro ya generado por la configuración existente. CONTACT no añadió scripts, analytics, código tenant-controlled ni imports externos.

## 6. Aislamiento, privacidad y compatibilidad

- **Multi-tenant:** el documento se obtiene del contexto de site/slot/revisión ya resuelto por servidor. El cliente no aporta tenant, site, revisión, action key o destino.
- **Locale exacto:** el compilador usa solo `localized.locale.effective` y `content_by_locale[effective]`; no mezcla fallback por campo.
- **Publicación:** draft, candidata, última revisión y preview no participan en el pipeline público CONTACT.
- **Privacidad:** no se registran destino, teléfono, email, mensaje o URL en analytics o auditoría de interacción; ANALYTICS-0001 no se inició.
- **Admin/Master:** no se modifican editor, permisos, soporte, planes, publicación o navegación.
- **Commerce:** no se importan ni consultan products, categories, prices, stock, cart, checkout, orders, coupons, gifts, shipping o scripts comerciales.
- **Reseñas/media:** el adaptador REVIEWS y delivery MEDIA permanecen separados y conservan sus contratos.

## 7. Archivos

### Nuevos

- `backend-powerzona/pb_hooks/pz_promo_contact_lib.js`
- `backend-powerzona/tests/pz_promo_contact.test.cjs`
- `frontend-powerzona/src/components/promo-public/PromoContactAction.astro`
- `frontend-powerzona/src/components/promo-public/PromoContact.astro`
- `frontend-powerzona/src/styles/promo-contact.css`
- `docs/tusenda84/reportes/TS84-PROMO-CONTACT-0001-implementacion.md`

### Modificados

- `backend-powerzona/pb_hooks/pz_promo_shell_api_lib.js`
- `backend-powerzona/tests/pz_promo_pubcfg_http_runtime.test.cjs`
- `frontend-powerzona/src/lib/promoPublicShell.ts`
- `frontend-powerzona/src/components/promo-public/PromoHero.astro`
- `frontend-powerzona/src/components/promo-public/PromoBlackGoldTheme.astro`
- `frontend-powerzona/src/styles/promo-hero.css`
- `frontend-powerzona/src/styles/promo-black-gold.css`
- `frontend-powerzona/tests/promoPublicShell.test.mjs`

## 8. Migraciones y dependencias

- Migraciones: ninguna.
- Colecciones/fields/índices: ninguno.
- Dependencias de paquete: ninguna.
- Variables de entorno: ninguna.
- Seeds/backfill: ninguno.
- Datos reales modificados: ninguno.

## 9. Pruebas y verificación

### Focal backend

```text
node --check pb_hooks/pz_promo_contact_lib.js
node --check pb_hooks/pz_promo_shell_api_lib.js
node --test tests/pz_promo_contact.test.cjs
  tests/pz_promo_shell.test.cjs tests/pz_promo_i18n.test.cjs
Resultado: 20/20 PASS
```

Cobertura: WhatsApp/teléfono/email, encoding localized, primary exclusivo, superficie publicada, canales no aprobados, destino/locale/copy inválidos, ausencia de config/PII secundaria y unión server-side al SHELL.

### Runtime PocketBase local y descartable

```text
node --test tests/pz_promo_pubcfg_http_runtime.test.cjs
Resultado: 1/1 PASS
```

El runtime real cubrió dos tenants, plataforma y Host custom, revisión/slot publicados exactos, locale español/inglés, compilación WhatsApp localized, aislamiento A/B, draft/candidata no públicos, CAS, capabilities, digest, REST cerrado y proyección allowlisted.

### Focal frontend

```text
node --test tests/promoPublicShell.test.mjs tests/promoReviews.test.mjs
Resultado: 16/16 PASS
```

Cobertura: contrato exacto, consistencia primary/type/copy, protocolos allowlisted, bloqueo de URL genérica, CRLF y fields filtrados, renderer SSR compartido, foco, fallback, budgets CSS y ausencia de Commerce/analytics.

### Regresiones completas

```text
Frontend: 718 PASS, 0 FAIL
Backend: 875 total; 868 PASS, 0 FAIL, 7 SKIP esperados
```

Los siete skips son gates opt-in preexistentes que requieren URLs/credenciales externas o runners no autorizados. Los runtimes PocketBase locales y descartables sí se ejecutaron.

### Build SSR

```text
npm.cmd run build
Resultado: PASS
```

Persisten únicamente tres advertencias preexistentes de Astro sobre `getStaticPaths()` ignorado en rutas dinámicas con `output: server`.

### QA visual y funcional local

Se utilizó un backend sintético loopback y el build SSR local; no se consultó PocketBase desplegado ni red externa. La activación WhatsApp fue interceptada antes de salir del host local.

| Estado/vista | Resultado |
|---|---|
| Desktop `1440×900`, Hero + CTA con foco | CTA completo dentro del pliegue, anillo 3 px, sin clipping/overflow |
| Desktop `1440×900`, sección Contacto | jerarquía negra/dorada, CTA coherente y ornamentación estable |
| Desktop `1280×800`, canal no disponible | dos estados localizados, cero enlaces de contacto, CTA Hero completo |
| Móvil `390×844`, Hero y Contacto | targets completos, copy legible y cero overflow horizontal |
| Estrecho `320×700`, Contacto | CTA de ancho fluido, copy/ornamento sin corte ni desborde |
| Cambio `es → en` por teclado | `html[lang]`, label, aria y mensaje WhatsApp cambian al locale exacto |
| Activación por mouse | una única solicitud al `wa.me` compilado y encoded; interceptada localmente |

Las capturas y runners sintéticos temporales se eliminaron al cerrar el QA.

## 10. Límites conservados

- No se inició `TS84-PROMO-FOOTER-0001`.
- No se inició `TS84-PROMO-QR-0001`, `TS84-PROMO-RESP-0001`, `TS84-PROMO-DOM-CF-0001` ni ningún prompt posterior.
- No se implementó analytics de contacto.
- No se implementaron formularios internos o Live Chat.
- No se activaron carrito, checkout, precios, pedidos ni scripts comerciales.
- No se creó commit, push, merge, deploy o release.

## 11. Confirmaciones de cierre

- No se consultó ni modificó PocketBase desplegado.
- No se consultaron ni modificaron Cloudflare, Coolify, staging o producción.
- No se leyeron secretos.
- No se crearon datos, dominios, certificados o releases reales.
- El trabajo permanece local y visible en Visual Studio sobre `dev`, sin commit.

## 12. Siguiente Prompt ID habilitado

Con `TS84-PROMO-CONTACT-0001` completado, el siguiente Prompt ID de la secuencia maestra es:

**`TS84-PROMO-FOOTER-0001`**

No fue iniciado.
