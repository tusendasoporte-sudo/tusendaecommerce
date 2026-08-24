# TS84-PROMO-QR-0001 — Reporte de implementación

## 1. Estado

- Prompt ID: `TS84-PROMO-QR-0001`.
- Estado: **COMPLETADO**.
- Fecha: `2026-08-24`.
- Rama local: `dev`.
- Base autorizada verificada antes de modificar: `5d66c62`.
- Worktree inicial: limpio.
- Commit creado: **no**.
- Siguiente Prompt ID habilitado: `TS84-PROMO-RESP-0001`.
- `TS84-PROMO-RESP-0001`, `TS84-PROMO-DOM-CF-0001` y los prompts posteriores no fueron iniciados.

## 2. Contratos consultados

Se leyeron y respetaron como contratos:

- `docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md`;
- `docs/tusenda84/reportes/TS84-PROMO-FOOTER-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-SHELL-0001-implementacion.md`;
- `docs/tusenda84/reportes/L7Q1-landing-qr-premium.md`; y
- los contratos previos de arquitectura, datos, permisos, publicación, configuración pública, internacionalización, CMS, Admin Shell y Preview exigidos por esa cadena.

La implementación se limita al puente opcional hacia la Landing QR existente y conserva sin sustituciones el renderer Promo negro/dorado aprobado.

## 3. Resultado funcional

El sitio Promo publicado puede mostrar un único acceso secundario y discreto hacia la Landing QR vigente de la misma tienda.

El acceso:

- se renderiza en SSR dentro de las utilidades del encabezado;
- usa copy de sistema exacto para el locale efectivo;
- apunta únicamente a `https://tusenda84.com/t/<storeSlug>/links`;
- no sustituye ni actúa como fallback del CTA principal;
- no genera, muestra ni persiste un código QR;
- no copia botones, destinos o registros de Landing QR; y
- desaparece de forma segura cuando cualquiera de sus gates deja de cumplirse.

El contrato público cerrado es `promo.landing-qr-link.v1`:

```json
{
  "contract": "promo.landing-qr-link.v1",
  "enabled": true,
  "link": {
    "label": "Más enlaces",
    "aria_label": "Abrir la página de enlaces de <negocio>",
    "href": "https://tusenda84.com/t/<storeSlug>/links"
  }
}
```

Si el acceso no está disponible, el mismo contrato devuelve `enabled: false` y `link: null`.

## 4. Gates y fuente de verdad

La revisión publicada inmutable conserva únicamente la intención editorial:

```json
{
  "adapters": {
    "landing_qr_link": {
      "enabled": true
    }
  }
}
```

El serving vuelve a comprobar en servidor, para la tienda relacionada con el sitio resuelto:

1. flag habilitado tanto en el documento publicado como en su proyección localizada;
2. tienda activa;
3. entitlement Promo vigente con `landing_qr_bridge_enabled`;
4. capacidad Commerce existente `landing_qr_enabled`, con vencimiento aplicado; y
5. configuración activa existente con `landing_qr_enabled`.

La ausencia, ambigüedad o error en cualquiera de esas lecturas desactiva solo el acceso opcional. Nunca cambia el sitio, cae en otro tenant ni inventa un destino.

No se añadió una fuente de verdad paralela. El adapter consulta la capacidad Landing QR ya aprobada exclusivamente para decidir si puede exponer el enlace; no usa infraestructura Commerce para modelar Promo.

## 5. URL y contrato frontend

El backend compila el destino desde dos elementos allowlisted:

- origen reservado de plataforma: `https://tusenda84.com`;
- slug exacto y saneado de la tienda resuelta.

El tenant no puede proporcionar protocolo, host, puerto, path, query, fragmento, credenciales, variante o URL libre.

El normalizador frontend vuelve a exigir:

- contrato y claves exactos;
- coherencia entre el flag publicado y la proyección efectiva;
- label y `aria-label` materializados desde el catálogo del locale efectivo;
- origen central exacto;
- path exacto `/t/<slug>/links`; y
- ausencia de query, hash, credenciales y puerto.

Una respuesta manipulada falla cerrada antes de renderizar.

## 6. Internacionalización exacta

Se añadieron al catálogo first-party versionado `promo.system.v1`:

- `a11y.landing_qr_link`; y
- `landing_qr.open`.

Valores aprobados:

| Locale | Label | Nombre accesible |
|---|---|---|
| `es` | `Más enlaces` | `Abrir la página de enlaces de {business}` |
| `en` | `More links` | `Open {business}'s link page` |

El nombre del negocio procede del contenido localizado de la misma revisión publicada. No hay fallback cruzado entre locales.

## 7. Admin y Preview

El módulo `Landing QR` del Admin Shell dejó de ser un placeholder y ahora permite activar o desactivar solo `document.adapters.landing_qr_link.enabled`.

El editor:

- exige la acción existente `promo.landing_qr.bridge.manage`;
- reutiliza `/api/admin/promo-cms`, el borrador normalizado y CAS con `expected_version`;
- no crea endpoint, permiso ni persistencia paralelos;
- enlaza a la Landing QR actual mediante la ruta central ya existente; y
- informa que se requiere publicar una revisión nueva para cambiar el sitio público.

No edita los ajustes base de Landing QR, sus botones, destinos o analítica.

El Preview privado representa el acceso como un `span` inerte. No compila una URL, no navega y no ejecuta una acción real.

## 8. Flujo público y aislamiento

```text
revisión publicada inmutable
  → proyección pública PUBCFG
  → locale exacto I18N
  → footer/contacto/reseñas aprobados
  → gate Landing QR server-side para la misma tienda
  → enlace central compilado
  → validación allowlisted frontend
  → SSR Astro negro/dorado
```

El puente:

- no lee borradores en la ruta pública;
- no publica IDs, settings, entitlement, capacidad o registros internos;
- no crea un bloque QR ni un reader paralelo de contenido;
- no añade hidratación o scripts propios;
- no cambia analytics, tracking o atribución de Landing QR; y
- no incorpora carrito, checkout, precios, pedidos ni acciones comerciales.

## 9. Responsive y accesibilidad focal

La integración conserva:

- enlace semántico con nombre accesible localizado;
- icono decorativo oculto a tecnologías de asistencia;
- target táctil mínimo de 44 px;
- foco visible de 3 px;
- ausencia de `target="_blank"`;
- encabezado de tres zonas sin solapamientos en desktop y tablet;
- reflujo ordenado de marca, utilidades y navegación en móvil; y
- variante solo-icono por debajo de 340 px, manteniendo el `aria-label` completo.

Los cambios responsive son exclusivamente los necesarios para integrar este acceso. No constituyen el inicio de `TS84-PROMO-RESP-0001` ni una matriz cross-browser ampliada.

## 10. Compatibilidad conservada

### Master

- No se modificaron planes, permisos, ownership, auditoría o branding reservado.
- El soporte Master sigue dependiendo de los permisos efectivos producidos por el backend existente.

### Admin

- Se reutilizan Admin Shell, CMS, proxy same-origin, CAS y publicación existentes.
- El acceso queda oculto o bloqueado según la acción efectiva ya definida.

### Commerce y Landing QR

- Landing QR conserva su función, ruta, configuración, datos y tracking base.
- El adapter solo enlaza a la capacidad existente cuando está vigente.
- No se reutilizan productos, categorías, precios, carrito, checkout o pedidos para modelar Promo.

### Multi-tenant, locale y SSR

- Sitio, tienda y entitlement se correlacionan server-side antes de habilitar el enlace.
- La URL usa el slug de esa misma tienda, nunca un valor del cliente.
- Copy y nombre accesible proceden del locale efectivo de la revisión publicada.
- El renderer público continúa completamente SSR.

## 11. Archivos

### Backend

- `backend-powerzona/pb_hooks/pz_promo_landing_qr_lib.js` — gate y compilación pública fail-closed.
- `backend-powerzona/pb_hooks/pz_promo_i18n_lib.js` — catálogo ES/EN exacto.
- `backend-powerzona/pb_hooks/pz_promo_shell_api_lib.js` — incorporación del adapter al pipeline publicado.
- `backend-powerzona/tests/pz_promo_landing_qr.test.cjs` — pruebas focales de contrato, tenant y gates.

### Frontend público

- `frontend-powerzona/src/lib/promoPublicShell.ts` — normalización exacta del contrato y URL central.
- `frontend-powerzona/src/components/promo-public/PromoLandingQrLink.astro` — enlace SSR focal.
- `frontend-powerzona/src/components/promo-public/PromoBlackGoldTheme.astro` — integración en las utilidades del header.
- `frontend-powerzona/src/styles/promo-landing-qr.css` — presentación y reflujo responsive focal.
- `frontend-powerzona/tests/promoPublicShell.test.mjs` — regresiones del shell y respuestas manipuladas.

### Admin y Preview

- `frontend-powerzona/src/lib/promoLandingQr.ts`.
- `frontend-powerzona/src/components/admin/promo/PromoLandingQrEditor.astro`.
- `frontend-powerzona/src/styles/promo-landing-qr-admin.css`.
- `frontend-powerzona/src/lib/promoAdminShell.ts`.
- `frontend-powerzona/src/components/admin/promo/PromoAdminShell.astro`.
- `frontend-powerzona/src/lib/promoPreview.ts`.
- `frontend-powerzona/src/components/admin/promo/PromoPreviewEditor.astro`.
- `frontend-powerzona/src/styles/promo-preview.css`.
- `frontend-powerzona/tests/promoLandingQr.test.mjs`.

### Infraestructura

- Migraciones nuevas: **0**.
- Colecciones nuevas: **0**.
- Endpoints nuevos: **0**.
- Permisos nuevos: **0**.
- Dependencias nuevas: **0**.
- Variables de entorno nuevas: **0**.
- Seeds o registros persistentes: **0**.

## 12. Pruebas

### Backend focal

```text
node --test tests/pz_promo_landing_qr.test.cjs tests/pz_promo_i18n.test.cjs
  tests/pz_promo_shell.test.cjs tests/pz_promo_pubcfg.test.cjs
  tests/pz_l7q1_landing_qr_premium.test.cjs

Resultado: 39/39 PASS
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

Resultado: 883 total; 876 PASS; 0 FAIL; 7 SKIP esperados
```

Los siete skips corresponden a gates opt-in preexistentes que requieren URL o credenciales externas y no se activaron.

### Frontend focal

```text
node --test tests/promoLandingQr.test.mjs tests/promoPublicShell.test.mjs
  tests/promoPreview.test.mjs tests/promoAdminShell.test.mjs
  tests/promoCms.test.mjs tests/l7q1LandingQrPremium.test.mjs

Resultado: 41/41 PASS
```

### Frontend completo

```text
node --test tests/*.test.mjs

Resultado: 725/725 PASS
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

## 13. QA visual y funcional local

Se usó el navegador integrado contra el build Astro SSR y un backend HTTP sintético de loopback. No se descargaron navegadores o dependencias y no se consultó red externa.

| Estado/vista | Verificación | Resultado |
|---|---|---|
| Desktop `1440×900`, ES | composición del header, enlace único, label y target de 44 px | PASS |
| Tablet `768×1024`, ES | separación marca/utilidades, navegación y cero overflow | PASS |
| Móvil `390×844`, ES | reflujo en tres filas, label visible, target de 44 px y cero overflow | PASS |
| Estrecho `320×700`, ES | control icon-only de `44×44`, `aria-label` completo y cero overflow | PASS |
| Móvil `390×844`, EN | `html[lang]`, label y nombre accesible exactos | PASS |
| Teclado | foco visible de 3 px sobre el acceso | PASS |

Comprobaciones adicionales:

- un solo `[data-promo-landing-qr-link]` por página;
- destino exacto `https://tusenda84.com/t/demo-store/links` en los datos sintéticos;
- `documentElement.scrollWidth === clientWidth` en todos los cortes;
- cero errores o warnings de consola;
- ausencia de texto de carrito, checkout, precios, pedidos o analytics; y
- el enlace externo no se abrió durante el QA.

El script, servidores, procesos y puertos de loopback temporales fueron eliminados al finalizar.

## 14. Límites conservados

- No se implementó `TS84-PROMO-RESP-0001`, `TS84-PROMO-DOM-CF-0001` ni ningún prompt posterior.
- No se generó un QR, una variante, un bloque nuevo o una URL tenant-controlled.
- No se activaron carrito, checkout, precios, pedidos, analytics, tags, píxeles, scripts comerciales o código tenant-controlled.
- No se modificó el tracking existente de Landing QR.
- No se hicieron consultas ni cambios en PocketBase desplegado, Cloudflare, Coolify, staging o producción.
- No se leyeron secretos.
- No se hizo push, merge, deploy, release ni commit.

## 15. Siguiente prompt habilitado

Con `TS84-PROMO-QR-0001` completado, el siguiente Prompt ID habilitado por el mapa maestro es:

`TS84-PROMO-RESP-0001`

No fue iniciado en esta implementación.
