# TS84-PROMO-ALADDIN-0001 — Primer tema público negro/dorado

- Fecha de cierre técnico: 2026-08-24
- Estado: **COMPLETADO**
- Base solicitada y verificada antes de modificar: rama local `dev`, `HEAD 190773b` (`feat(promo): agrega shell público SSR multi-tenant`)
- Estado inicial del worktree: limpio
- Estado de entrega: cambios locales visibles en `dev`; commit local autorizado por separado después del cierre técnico; **sin push, merge, despliegue ni release**
- Release consumida: `promo.black-gold@1.0.0`, `renderer_key=promo.black-gold`, `contract_version=1`

## 1. Resultado

Se implementó el primer renderer público first-party de Tiendas Promo sobre el shell SSR aprobado. El resultado ofrece una composición propia negra/dorada, editorial y responsive para la release exacta `promo.black-gold@1.0.0`, sin copiar píxel por píxel ninguna referencia y sin abrir superficies tenant-controlled de CSS, JavaScript o HTML.

El cierre aporta:

1. dispatcher cerrado por `renderer_key` desde el shell público;
2. fallo cerrado `503 promo_public_renderer_unavailable` para temas o versiones sin renderer empaquetado;
3. renderer Astro separado `PromoBlackGoldTheme` para conservar ownership y evolución por release;
4. aplicación segura de los tokens semánticos allowlisted de THEME-0001 mediante atributos y selectores first-party;
5. composición negra/dorada con jerarquía editorial, ornamentos geométricos propios, numeración de secciones y tarjetas coherentes;
6. navegación principal, selector de locale, orden de secciones y contenido provenientes únicamente de la proyección pública localized aprobada;
7. estructura semántica SSR accesible con skip link, landmarks, jerarquía `h1/h2`, estados y foco visible;
8. responsive validado en escritorio, móvil y ancho estrecho, sin scroll horizontal de página;
9. respeto a `prefers-reduced-motion` y al token `motion=reduced`;
10. contacto visible como estado localizado e inerte, sin destino, botón o script; y
11. separación completa de Master, Commerce y Admin, sin cambios en sus rutas, contratos o datos.

No se implementaron media Hero, composición especializada de secciones posteriores, contacto ejecutable, dominio Cloudflare, SEO final, carrito, checkout, precios, pedidos, analytics o scripts comerciales.

## 2. Contratos respetados

La implementación se cerró contra:

- `docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md`;
- `docs/tusenda84/reportes/TS84-PROMO-ARC-0001-arquitectura-adrs.md`;
- `docs/tusenda84/reportes/TS84-PROMO-DATA-DES-0001-diseno-datos.md`;
- `docs/tusenda84/reportes/TS84-PROMO-DATA-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-PERM-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-PUBCFG-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-AUDIT-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-I18N-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-THEME-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-PUBLISH-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-PREVIEW-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-DOM-CORE-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-VIS-0001-direccion-visual.md`; y
- `docs/tusenda84/reportes/TS84-PROMO-SHELL-0001-implementacion.md`.

Decisiones aplicadas:

- SHELL conserva ownership de routing, lectura interna, `Host`, locale, `no-store/noindex`, respuesta pública exacta y manejo fail-closed.
- PUBLISH conserva ownership del puntero atómico y de la revisión publicada inmutable. ALADDIN no lee draft, candidata, preview ni configuración privada.
- I18N conserva negociación, locale efectivo, selector y textos de sistema localizados. El renderer no inventa fallback ni copia paralela.
- THEME conserva registry, release, defaults y enums. ALADDIN solo empaqueta el renderer exacto y mapea tokens semánticos a valores first-party.
- VIS fija la dirección premium negra/dorada, limpia y accesible; la composición final es propia y no replica una referencia píxel por píxel.
- Los prompts HERO, SECTIONS y CONTACT conservan ownership de media, variantes especializadas y destinos ejecutables. Este prompt mantiene esas capacidades ausentes o inertes.
- Ningún input tenant controla CSS, JavaScript, HTML, imports, component names, handlers, URLs, fonts remotas o assets ejecutables.

## 3. Renderer y resolución cerrada

### 3.1 Release exacta

| Campo | Valor admitido |
|---|---|
| Theme ID | `promo.black-gold` |
| Version | `1.0.0` |
| Renderer key derivado | `promo.black-gold` |
| Fuente | Proyección pública localized del backend |
| Render | Astro SSR first-party |
| Fallback visual a otro tema | No permitido |

`normalizePromoPublicShellResponse` valida primero el contrato público exacto, los enums de tokens y la combinación `theme_id/version`. Solo la release empaquetada deriva `renderer_key=promo.black-gold`. Una versión desconocida, por ejemplo `2.0.0`, falla antes del render con `503 promo_public_renderer_unavailable` y nunca cae a otro tema, Commerce, otra versión o una plantilla genérica.

`PromoPublicShell.astro` actúa como dispatcher cerrado. No existe resolución dinámica de archivos, componentes o imports mediante datos del tenant.

### 3.2 Revisión publicada inmutable

El flujo de lectura permanece sin cambios:

```text
ruta pública Astro
  -> lectura interna same-origin de SHELL
  -> backend público resuelve tenant + locale
  -> slot published y revisión inmutable exacta
  -> proyección localized allowlisted
  -> normalización frontend exacta
  -> dispatcher release/renderer
  -> HTML SSR negro/dorado
```

No se añadieron lecturas de draft, candidata, preview, revisiones históricas arbitrarias, PocketBase directo desde navegador, REST CRUD público ni infraestructura Commerce.

## 4. Composición visual propia

El renderer entrega una identidad premium mediante:

- superficie obsidiana y texto marfil;
- acentos y bordes oro heredado o champagne según el enum aprobado;
- tipografía editorial serif para jerarquías y stack sans-serif local del sistema para cuerpo;
- cabecera limpia con marca geométrica, navegación y selector de idioma;
- hero tipográfico sin media, con ornamento concéntrico puramente decorativo;
- numeración editorial de secciones y líneas doradas como ritmo visual;
- tarjetas negras elevadas con borde dorado para listas allowlisted;
- footer oscuro centrado; y
- estado de contacto con apariencia coherente, pero semántica y comportamiento inertes.

La paleta base del renderer es `#0b0b0b` para superficie, `#f6f1e7` para texto y `#c8a45a` para acento/borde. Las alternativas aprobadas de token solo seleccionan valores compilados; no aceptan colores o CSS libres.

Los tokens `accent`, `border`, `radius`, `shadow`, `density` y `motion` modifican variables propias mediante selectores cerrados. `surface`, `text`, `focus`, `heading_font` y `body_font` permanecen vinculados a los valores únicos aprobados del manifest. No hay `url()`, `@import`, fuentes remotas ni dependencias visuales externas.

## 5. Accesibilidad y responsive

Se conservaron o reforzaron:

- `lang` y `dir` exactos en el documento;
- un skip link visible al foco hacia `main`;
- `header`, dos `nav`, `main`, `section` y `footer` semánticos;
- nombres accesibles localizados para navegación, contenido principal, selector y marca;
- `aria-current=page` en el locale efectivo;
- una única jerarquía principal `h1` y encabezados posteriores `h2`;
- ornamentos con `aria-hidden=true`;
- estado de contacto con `role=status`, sin simular una acción disponible;
- targets interactivos mínimos cercanos o superiores a 44 px;
- foco visible marfil de 3 px con offset;
- layout con propiedades lógicas compatible con dirección del locale;
- breakpoints first-party en 1000, 720 y 420 px;
- navegación compacta con overflow horizontal propio en anchos pequeños, sin desbordar la página; y
- reducción de transiciones por preferencia del sistema y por token Theme.

## 6. Límites de prompts posteriores

### No iniciado: TS84-PROMO-HERO-0001

- No se renderizan imágenes, videos, posters, carruseles o controles multimedia.
- El bloque inicial usa exclusivamente contenido textual ya aprobado por SHELL.
- No se anticipan variantes ni selección de media.

### No iniciado: TS84-PROMO-SECTIONS-0001

- No se crean layouts especializados de servicios, galería, propietario o ratings.
- Se conserva el modelo genérico seguro ya expuesto por la proyección pública.
- No se agregan carruseles, lightboxes, tabs, filtros o hidratación cliente.

### No iniciado: TS84-PROMO-CONTACT-0001

- No hay `tel:`, `mailto:`, `wa.me`, QR, formulario, mapa, botón o destino externo.
- Se muestra únicamente `system.messages['contact.unavailable']` localizado.
- El bloque “Escanéame para contactar...” permanece ausente.

### No iniciado: TS84-PROMO-DOM-CF-0001 y posteriores

- No se toca DNS, certificados, proxy, Cloudflare, Coolify, canonical final o redirects de infraestructura.
- No se habilitan scripts comerciales, analytics, carrito, checkout, precios, pedidos, inventario, stock, cupones o shipping.

## 7. Archivos modificados

### Nuevos

- `frontend-powerzona/src/components/promo-public/PromoBlackGoldTheme.astro` — renderer SSR first-party y composición semántica negra/dorada.
- `frontend-powerzona/src/styles/promo-black-gold.css` — tokens visuales compilados, composición, foco, responsive y reduced motion.
- `docs/tusenda84/reportes/TS84-PROMO-ALADDIN-0001-implementacion.md` — este reporte.

### Actualizados

- `frontend-powerzona/src/components/promo-public/PromoPublicShell.astro` — dispatcher cerrado hacia el renderer aprobado.
- `frontend-powerzona/src/layouts/PromoPublicLayout.astro` — metadata dark y atributos seguros de release/renderer/tokens.
- `frontend-powerzona/src/lib/promoPublicShell.ts` — identidad exacta de la release empaquetada, derivación de renderer y fallo cerrado.
- `frontend-powerzona/src/styles/promo-public-shell.css` — base estructural compartida, skip link, visually hidden y reduced motion.
- `frontend-powerzona/tests/promoPublicShell.test.mjs` — pruebas focales de release, dispatcher, tokens, límites y prompts posteriores.

No se modificó backend, mobile, PocketBase, migraciones, schemas, seeds, Master, Commerce, Admin, roles, permisos, capabilities, planes, rutas públicas existentes o configuración de infraestructura.

## 8. Migraciones, datos y dependencias

- Migraciones nuevas o modificadas: **ninguna**.
- Backfill: **ninguno**.
- Seeds: **ninguno**.
- Dependencias de paquete: **ninguna**.
- Escrituras en base de datos: **ninguna**.
- Records reales o configuración tenant modificados: **ninguno**.
- Runner visual temporal: eliminado al cerrar la validación; no forma parte de la entrega.

## 9. Pruebas ejecutadas

### 9.1 Focales ALADDIN/SHELL

```text
node --test tests/promoPublicShell.test.mjs
Resultado: 6/6 PASS
```

Cubren:

- proyección localized exacta;
- `renderer_key` derivado solo para `promo.black-gold@1.0.0`;
- fallo cerrado `503` para versión sin paquete;
- aislamiento de plataforma/custom domain y locale;
- transporte SSR y conservación segura del `Host`;
- ausencia de scripts, HTML inseguro y términos/infraestructura Commerce;
- atributos de tokens y mapeos first-party;
- CSS del renderer menor de 50 KiB;
- foco, reduced motion y breakpoints;
- ausencia de `img`, `video`, botones o destinos de contacto; y
- ausencia de `url()`, `@import` o orígenes remotos en CSS.

### 9.2 Build SSR

```text
npm.cmd run build
Resultado: PASS

PZ_VISUAL_TEST=1 npm.cmd run build
Resultado: PASS
```

Ambos builds conservan tres warnings preexistentes de Astro sobre `getStaticPaths()` ignorado en las rutas dinámicas de categoría, subcategoría y producto. No se relacionan con ALADDIN-0001.

### 9.3 QA visual e interacción local

Se ejecutó Playwright exclusivamente contra un servidor Astro local y un backend HTTP sintético loopback que devolvía el contrato público exacto, sin red externa ni datos persistentes.

| Vista | Verificación | Resultado |
|---|---|---|
| Escritorio `1440x900` | tema/release/renderer, skip link por teclado, navegación a Servicios, cambio a locale `en`, jerarquía y contraste visual | PASS |
| Móvil `390x844` | composición, título dentro del viewport, navegación, contacto localizado e inerte | PASS |
| Estrecho `320x700` | título y cabecera dentro del viewport, navegación compacta y ausencia de overflow de página | PASS |

En las tres vistas `documentElement.scrollWidth === clientWidth`. Se confirmó además que el DOM del tema no incluye `img`, `video` o `button`, que el contacto no es enlace y que los tokens efectivos cambian exclusivamente mediante las alternativas aprobadas.

### 9.4 Regresión frontend completa

```text
node --test
Resultado: 708/708 PASS
```

### 9.5 Regresión backend completa

```text
node --test
Resultado: 865 tests; 858 PASS; 0 FAIL; 7 SKIP
```

Los siete skips son gates opt-in que requieren URLs, credenciales o runners externos. Permanecieron desactivados conforme a la prohibición de consultar infraestructura desplegada. Los runtimes locales y las regresiones Promo/Commerce pertinentes sí se ejecutaron.

### 9.6 Higiene del diff

```text
git diff --check
Resultado: PASS
```

Git únicamente informó su aviso normal de conversión futura LF/CRLF en archivos de trabajo; no detectó whitespace errors.

## 10. Compatibilidad preservada

- Master no recibe nuevas rutas, writers, permisos, UI o datos.
- Admin conserva su shell, preview y contratos privados sin cambios.
- Commerce conserva rutas, layouts, catálogo, carrito, checkout, pedidos, precios y datos sin importar código Promo nuevo.
- El routing público continúa separando `/promo/{slug}/{locale}` y dominios custom mediante SHELL/DOM-CORE.
- El renderer recibe únicamente la proyección localized allowlisted; no acepta `store_id`, `site_id`, revisión, filter, sort, fields, expand o record IDs aportados por navegador.
- La lectura pública conserva `private, no-store`, anti-indexación y la revisión publicada inmutable resuelta por backend.
- El locale efectivo, canonical path, selector y copy se renderizan exactamente como vienen del contrato I18N.
- No se usa infraestructura Commerce para modelar tema, secciones, contacto o publicación Promo.

## 11. Riesgos y límites residuales

| Riesgo/límite | Tratamiento/estado |
|---|---|
| Solo existe un renderer empaquetado | Intencional; cualquier otra release falla cerrada y requiere Prompt ID/aprobación propios |
| El hero aún no posee media | Ownership reservado a `TS84-PROMO-HERO-0001`; ALADDIN entrega composición tipográfica segura |
| Las secciones usan presentación genérica | Ownership especializado reservado a `TS84-PROMO-SECTIONS-0001` |
| Contacto no ejecuta acciones | Estado deliberadamente inerte hasta `TS84-PROMO-CONTACT-0001` |
| Navegación extensa en móvil | Usa overflow horizontal limitado al `nav`; la página no desborda |
| Fuentes editoriales dependen del sistema | No se autorizó cargar fuente remota; el stack first-party conserva seguridad y rendimiento |
| SEO final continúa noindex | SHELL mantiene el contrato aprobado hasta el prompt dueño de SEO/PERF |

## 12. Siguiente Prompt ID habilitado

Según el orden del mapa maestro, el siguiente Prompt ID es **`TS84-PROMO-HERO-0001`**: composición del hero público sobre el tema ALADDIN y el pipeline MEDIA ya aprobados.

`TS84-PROMO-HERO-0001`, `TS84-PROMO-SECTIONS-0001`, `TS84-PROMO-CONTACT-0001`, `TS84-PROMO-DOM-CF-0001` y cualquier prompt posterior **no fueron iniciados**.

## 13. Confirmaciones de cierre

- No se consultó ni modificó PocketBase desplegado.
- No se consultaron ni modificaron Cloudflare, Coolify, staging o producción.
- No se leyeron secretos.
- No se crearon o modificaron datos reales, dominios, certificados o releases.
- No se activaron contacto, carrito, checkout, precios, pedidos o scripts comerciales.
- El commit local fue autorizado por separado después del cierre técnico; no se hizo push, merge, deploy o release.
