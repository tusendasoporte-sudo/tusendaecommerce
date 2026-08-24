# TS84-PROMO-HERO-0001 — Hero público, carrusel y media prioritaria

- Fecha de cierre técnico: 2026-08-24
- Estado: **COMPLETADO**
- Base solicitada y verificada antes de modificar: rama local `dev`, `HEAD 190773b`
- Worktree inicial: únicamente la implementación terminada y sin commit de `TS84-PROMO-ALADDIN-0001` (cinco archivos modificados y tres nuevos)
- Estado de entrega: cambios locales visibles en `dev`; commit local autorizado por separado después del cierre técnico; **sin push, merge, despliegue ni release**
- Renderer: `promo.black-gold@1.0.0`, `renderer_key=promo.black-gold`

## 1. Resultado

Se implementó exclusivamente el Hero público de Tiendas Promo sobre el renderer negro/dorado autorizado y el contrato MEDIA ya publicado. La entrega aporta:

1. normalización frontend cerrada de `promo.media.delivery.v1` para imágenes, videos y posters;
2. validación exacta de rutas públicas content-addressed, variantes responsivas, dimensiones, purpose, MIME y metadata de carga;
3. una única imagen o poster LCP `eager/high`, derivada del primer medio del primer Hero visible;
4. render SSR de imágenes WebP con `srcset`, `sizes`, ancho, alto, `decoding=async` y alt localizado exacto;
5. render SSR de video MP4/WebM con poster, controles nativos, `preload=none`, `playsinline` y sin autoplay;
6. carrusel horizontal con scroll snap y navegación por enlaces de fragmento, usable con teclado, touch y sin JavaScript;
7. estado sin media que conserva la composición tipográfica/ornamental ALADDIN;
8. copy de solicitud de estimado/contacto tomado exclusivamente del locale efectivo y mostrado como estado inerte;
9. layout negro/dorado responsive para escritorio, móvil y ancho estrecho;
10. fallo cerrado ante URL externa, descriptor alterado, prioridad falsa, purpose cruzado, poster inválido o campos adicionales; y
11. preservación de Master, Admin y Commerce sin cambios en rutas, datos, permisos o procesos.

No se activaron destinos de contacto, formulario, teléfono, email, WhatsApp, Live Chat, analytics, carrito, checkout, precios, pedidos o scripts comerciales.

## 2. Contratos respetados

La implementación se cerró contra:

- `docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md`;
- `docs/tusenda84/reportes/TS84-PROMO-ALADDIN-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-MEDIA-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-THEME-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-SHELL-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-PUBLISH-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-I18N-0001-implementacion.md`; y
- `docs/tusenda84/reportes/TS84-PROMO-PUBCFG-0001-implementacion.md`.

Decisiones aplicadas:

- VIS-0001 permanece registrado en el mapa maestro como dirección negra/dorada, premium, limpia y no copiada píxel por píxel.
- ALADDIN conserva ownership del renderer, tokens y composición general.
- MEDIA conserva ownership de formatos, rutas, variantes, prioridad, poster, accesibilidad y políticas de video. HERO solo valida y materializa esos descriptores.
- SHELL conserva routing, `Host`, locale, no-store/noindex y lectura pública fail-closed.
- PUBLISH conserva el puntero atómico a la revisión publicada inmutable. HERO no conoce draft, candidata, preview, sequence, generation o revisión arbitraria.
- I18N conserva el locale efectivo, catálogo del sistema, contenido de negocio, alt y nombres accesibles. HERO no crea un catálogo paralelo.
- PUBCFG conserva `section.config.media_use_key`, `section.media_use_keys`, `action_key`, purposes y la proyección allowlisted.
- CONTACT-0001 conserva ownership de compilar destinos ejecutables. HERO no genera `href`, protocolo, formulario, handler o redirect de contacto.

## 3. Consumo exclusivo del pipeline MEDIA

### 3.1 Imágenes

El cliente exige exactamente:

- `contract=promo.media.delivery.v1`;
- `mime=image/webp`;
- `src` y cada entrada de `srcset` bajo la ruta pública MEDIA del mismo `public_slug` y `use_key`;
- digest SHA-256 de 64 hexadecimales en el path;
- variantes allowlisted por purpose, ordenadas por ancho y finalizadas en `original`;
- dimensiones responsivas coherentes con el aspect ratio;
- `sizes` exacto de la política MEDIA;
- `loading=eager/fetch_priority=high` solo para el primer medio del primer Hero visible; y
- `decoding=async`.

No se acepta origen absoluto, hostname tenant-controlled, query, fragment, record ID, asset ID, filename original, URL libre o variante no definida por MEDIA.

### 3.2 Videos y posters

El cliente exige para video:

- MIME exacto `video/mp4` o `video/webm` y extensión coherente;
- propósito `hero` o `gallery`, aunque HERO solo consume `hero`;
- duración positiva y acotada al contrato;
- `preload=none`;
- `controls_required=true`;
- `autoplay=false`;
- `plays_inline=true`;
- `reduced_motion=poster`;
- `save_data=poster`; y
- poster WebP con el mismo contrato cerrado de imagen y rutas `poster-*`.

El renderer no incluye `autoplay`, no precarga bytes del video y utiliza controles nativos. En movimiento reducido o ahorro de datos, la experiencia inicial permanece en el poster; la descarga del video requiere interacción explícita del visitante.

### 3.3 Orden del carrusel

El orden se deriva únicamente de:

1. `section.config.media_use_key` como medio principal; y
2. `section.media_use_keys` en el orden publicado.

Solo se materializan descriptores presentes en `profile.media` con `purpose=hero`. Las referencias faltantes, cruzadas o de purpose incorrecto ya fallan cerradas durante la normalización del contrato.

## 4. LCP y rendimiento

- El backend continúa decidiendo el único `priorityMediaKey` desde el primer Hero visible.
- El frontend vuelve a calcular la misma clave desde la proyección publicada y exige que el descriptor coincida exactamente.
- Imagen primaria: `loading=eager`, `fetchpriority=high`, `srcset`, `sizes`, ancho y alto explícitos.
- Video primario: poster con prioridad alta; video `preload=none` y sin autoplay.
- Medios secundarios: `loading=lazy`, `fetch_priority=auto` o poster lazy.
- Carrusel: cero hidratación y cero JavaScript público.
- CSS combinado ALADDIN + HERO permanece dentro del budget Theme de 50 KiB.
- No se añadieron dependencias, fuentes remotas, `url()`, `@import`, embeds o scripts third-party.

## 5. Accesibilidad

Se implementaron o conservaron:

- un único heading principal cuando Hero es la primera sección;
- `aria-labelledby` por sección y navegación localizada;
- alt/decorative exacto del locale efectivo;
- nombre accesible del video desde el alt o la navegación localizada;
- controles nativos de video;
- carrusel enfocable cuando contiene más de un medio;
- controles de carrusel como enlaces reales a fragmentos, compatibles sin JavaScript;
- foco visible con anillo marfil;
- scroll snap horizontal usable por teclado y touch;
- CTA presentado como grupo informativo, no como botón/enlace falso;
- estado localizado `contact.unavailable` con `role=status`;
- targets de navegación del carrusel de 40 px en escritorio y 36 px en ancho estrecho;
- `prefers-reduced-motion` y token Theme `motion=reduced`; y
- propiedades lógicas compatibles con la dirección del locale.

## 6. Solicitud de estimado y contacto inertes

HERO muestra el label localized de `section.config.action_key` cuando existe en la proyección publicada. Si no existe copy de acción, utiliza la clave general I18N `contact.request_estimate`. El nombre accesible utiliza `a11y.contact_action` y el estado visible utiliza `contact.unavailable`.

El bloque es deliberadamente informativo:

- no es `<a>` ni `<button>`;
- no contiene `href`, `action`, `onclick` o listener;
- no genera `tel:`, `mailto:`, `wa.me`, URL o adapter;
- no revela config/destino de contacto; y
- no registra conversión o analytics.

Activar un destino seguro permanece reservado a `TS84-PROMO-CONTACT-0001`.

## 7. Responsive y composición visual

El Hero mantiene la identidad negra/dorada aprobada mediante:

- composición editorial de dos columnas en escritorio;
- media enmarcada con borde y ornamento dorado;
- copy y CTA con jerarquía premium;
- carrusel de una diapositiva visible, sin descargar el conjunto de forma eager;
- layout de una columna en móvil;
- aspect ratio 16:11 en escritorio y 4:3 en móvil;
- fallback ornamental cuando no hay media; y
- breakpoints first-party en 1000, 720 y 420 px.

No se modificó la especialización visual de servicios, trabajo destacado, galería, propietario, ratings, contacto o footer.

## 8. Archivos de HERO-0001

### Nuevos

- `frontend-powerzona/src/components/promo-public/PromoHero.astro` — renderer SSR del Hero, media, video, carrusel y estado CTA inerte.
- `frontend-powerzona/src/styles/promo-hero.css` — composición negra/dorada, scroll snap, responsive, foco y movimiento reducido.
- `docs/tusenda84/reportes/TS84-PROMO-HERO-0001-implementacion.md` — este reporte.

### Actualizados sobre la base ALADDIN autorizada

- `frontend-powerzona/src/components/promo-public/PromoBlackGoldTheme.astro` — delega exclusivamente las secciones `hero` al renderer focal.
- `frontend-powerzona/src/lib/promoPublicShell.ts` — conserva y valida el descriptor MEDIA público completo en vez de descartar `delivery`.
- `frontend-powerzona/tests/promoPublicShell.test.mjs` — pruebas focales de media, LCP, poster, video, carrusel y límites de prompts posteriores.

No se modificó backend, mobile, PocketBase, migraciones, schemas, seeds, Master, Admin, Commerce, rutas, permisos, capabilities, planes o infraestructura.

## 9. Migraciones, datos y dependencias

- Migraciones nuevas o modificadas: **ninguna**.
- Backfill: **ninguno**.
- Seeds: **ninguno**.
- Dependencias de paquete: **ninguna**.
- Escrituras en base de datos: **ninguna**.
- Datos reales o configuración tenant modificados: **ninguno**.

## 10. Pruebas ejecutadas

### 10.1 Focal SHELL/ALADDIN/HERO

```text
node --test tests/promoPublicShell.test.mjs
Resultado: 8/8 PASS
```

Cobertura:

- delivery MEDIA exacto y content-addressed;
- imagen LCP eager/high y secundarios lazy/auto;
- video MP4, poster responsivo, controles, preload none y autoplay false;
- video primario con poster high;
- URL externa, prioridad alterada, purpose cruzado y field filtrado rechazados;
- CTA localized e inerte;
- carrusel SSR sin scripts;
- budget CSS, foco, reduced motion y responsive; y
- ausencia de Commerce, destinos de contacto y prompts posteriores.

### 10.2 Build SSR

```text
npm.cmd run build
Resultado: PASS
```

Persisten únicamente los tres warnings preexistentes de Astro sobre `getStaticPaths()` ignorado en categoría, producto y subcategoría.

### 10.3 QA visual local

Se ejecutó Playwright con Chrome local contra el build Astro local y un backend HTTP sintético loopback. La media de prueba fue interceptada localmente; no se consultó red externa, PocketBase desplegado ni dato persistente.

| Vista/estado | Verificación | Resultado |
|---|---|---|
| Desktop `1440x900`, imagen + video | imagen LCP, CTA, carrusel por teclado a slide 2, controles de video visibles, framing y jerarquía | PASS |
| Móvil `390x844`, imagen + video | copy, CTA, media, controles, touch layout y ausencia de overflow | PASS |
| Estrecho `320x700`, sin media | fallback ornamental, heading/summary/CTA y ausencia de overflow | PASS |
| Desktop `1280x800`, video primario | poster prioritario, controles, layout y cero autoplay | PASS |

En las cuatro vistas `documentElement.scrollWidth === clientWidth`. Se verificó además:

- `0` enlaces/botones/formularios de contacto dentro del Hero;
- `0` solicitudes MP4 antes de interacción de reproducción;
- `loading=eager` y `fetchPriority=high` en la imagen LCP;
- `preload=none`, `autoplay=false` y `controls=true` en video;
- navegación del carrusel por foco + Enter; y
- ausencia visual de clipping, solapamientos o controles ilegibles.

El runner y las capturas sintéticas temporales se eliminaron al cerrar QA.

### 10.4 Regresión frontend completa

```text
node --test
Resultado: 710/710 PASS
```

### 10.5 Regresión backend completa

```text
node --test
Resultado: 865 tests; 858 PASS; 0 FAIL; 7 SKIP
```

Los siete skips son gates opt-in que requieren URLs, credenciales o servicios externos. Permanecieron desactivados conforme a la prohibición de consultar infraestructura desplegada. Los runtimes locales y las regresiones Promo/Commerce pertinentes sí se ejecutaron.

### 10.6 Higiene

```text
git diff --check
Resultado: PASS
```

Git solo informó el aviso normal de conversión futura LF/CRLF; no detectó whitespace errors.

## 11. Compatibilidad preservada

- Master y Admin no reciben nuevas rutas, writers, permisos, UI o datos.
- Commerce no importa `PromoHero`, no cambia layout, catálogo, carrito, checkout, precio, pedido, stock o navegación.
- El routing público continúa separado entre plataforma/custom y el guard `/t/<storeSlug>` aprobado por SHELL.
- El navegador no aporta tenant, revisión, media URL, variant, purpose, MIME, prioridad o destino.
- HERO consume únicamente la proyección localized de la revisión publicada inmutable.
- El locale efectivo, selector, alt, CTA y copy se renderizan exactamente desde I18N/PUBCFG.
- Tema y tokens permanecen allowlisted y first-party.
- No se usa infraestructura Commerce para modelar Promo.

## 12. Riesgos y límites residuales

| Riesgo/límite | Tratamiento/estado |
|---|---|
| El video exige interacción para descargar/reproducir | Deliberado por MEDIA: poster inicial, preload none y controles nativos |
| El poster nativo de `<video>` usa el `src` original | El pipeline mantiene variantes para superficies que admiten `srcset`; el elemento video usa el poster contractual seguro |
| El carrusel no cambia `aria-current` dinámicamente | Deliberado: navegación SSR sin JavaScript; cada control tiene nombre accesible y fragmento estable |
| CTA todavía no ejecuta contacto | Ownership reservado a CONTACT-0001; HERO muestra estado localizado inequívocamente inerte |
| Secciones posteriores conservan presentación ALADDIN genérica | Ownership reservado a SECTIONS-0001 |
| SEO/PERF final continúa noindex/no-store | SHELL mantiene el contrato hasta los prompts dueños |

## 13. Límites de prompts posteriores

- `TS84-PROMO-SECTIONS-0001`: **no iniciado**. No se especializaron servicios, trabajo destacado, galería o propietario.
- `TS84-PROMO-CONTACT-0001`: **no iniciado**. No se compiló ni activó destino alguno.
- `TS84-PROMO-DOM-CF-0001`: **no iniciado**. No se consultó o modificó dominio/infraestructura.
- Analytics, SEO, PERF, A11Y final, QA de staging y cualquier prompt posterior: **no iniciados**.

## 14. Siguiente Prompt ID habilitado

Según el orden del mapa maestro, el siguiente Prompt ID es **`TS84-PROMO-SECTIONS-0001`**: composición pública de servicios, trabajo destacado, galería y propietario sobre el renderer ALADDIN y los contratos CMS/GALLERY ya aprobados.

`TS84-PROMO-SECTIONS-0001`, `TS84-PROMO-CONTACT-0001`, `TS84-PROMO-DOM-CF-0001` y cualquier prompt posterior **no fueron iniciados**.

## 15. Confirmaciones de cierre

- No se consultó ni modificó PocketBase desplegado.
- No se consultaron ni modificaron Cloudflare, Coolify, staging o producción.
- No se leyeron secretos.
- No se crearon o modificaron datos reales, dominios, certificados o releases.
- No se activaron contacto, carrito, checkout, precios, pedidos, analytics o scripts comerciales.
- No se borró, revirtió o sobrescribió la base local ALADDIN autorizada.
- El commit local fue autorizado por separado después del cierre técnico; no se hizo push, merge, deploy o release.
