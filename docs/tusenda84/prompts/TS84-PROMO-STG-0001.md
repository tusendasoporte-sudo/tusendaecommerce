# TS84-PROMO-STG-0001 — Smoke funcional integral de Tiendas Promo en staging

Estado del prompt: **AUTORIZADO PARA ESTA EJECUCIÓN / NO EJECUTADO AL CREARSE**

## 1. Objetivo exclusivo

Crear y configurar en staging una Tienda Promo de prueba basada en Aladdin's Carpet y ejecutar el smoke integral de Master, Admin Promo, preview, publicación, despublicación/recuperación, rutas públicas de plataforma, idiomas, tema, medios, contacto, seguridad, privacidad, accesibilidad y regresión proporcional de Commerce/Landing QR.

La ejecución usa exclusivamente el host de plataforma provisional ya desplegado:

```text
https://mob76fcvxkxyb8tq0nwys18o.91.99.99.83.sslip.io
```

El resultado debe conservar en todo momento:

- `canonical_mode=platform`;
- `primary_binding` vacío;
- cero custom domains, bindings o aliases;
- staging globalmente `noindex, nofollow, noarchive`;
- `security.checkOrigin: true` y las fronteras Host/Origin/proxy fail-closed;
- separación completa entre Promo y Commerce; y
- cero cambios en producción, Cloudflare, DNS, zonas, certificados o dominio privado.

## 2. Dependencias y gates de entrada

Solo puede ejecutarse si están cerrados:

- `TS84-PROMO-STG-COOLIFY-0001`, con frontend y PocketBase staging desplegados y saludables;
- `TS84-PROMO-QA-AUTO-0001`, sin regresiones críticas;
- `TS84-PROMO-QA-VIS-0001`, técnicamente cerrado y con aprobación visual humana expresa; y
- las dependencias vigentes de ARC, DATA, PERM, PUBCFG, AUDIT, I18N, THEME, MEDIA, DOM-CORE, PUBLISH, MASTER, ADMIN-SHELL, CMS, GALLERY, APPEARANCE, LOCALES-ADMIN, PREVIEW, SHELL, ALADDIN, CONTACT, QR/Landing QR Commerce, SEO, ANALYTICS, SEC, PERF y A11Y.

El deployment de staging autorizado permanece en `1a95371`; el commit local `d7641c4` añade únicamente documentación y no requiere deploy.

## 3. Precondiciones Git obligatorias

Antes de modificar archivos, datos o servicios externos:

1. verificar rama exacta `dev`;
2. verificar `HEAD d7641c4`;
3. verificar worktree limpio; y
4. detenerse sin modificar archivos, staging ni staging data si alguna condición no coincide.

No usar stash, reset destructivo, rebase, merge, force push ni checkout destructivo.

## 4. Contratos que deben leerse antes de actuar

Leer y respetar completos:

- `docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md`;
- `docs/tusenda84/prompts/TS84-PROMO-STG-COOLIFY-0001.md`;
- `docs/tusenda84/reportes/TS84-PROMO-STG-COOLIFY-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-QA-VIS-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-QA-AUTO-0001-implementacion.md`;
- los ADRs y cierres aplicables que esos documentos señalan para arquitectura, datos, permisos, proyección pública/privada, publicación, dominio, i18n, tema, medios, Master/Admin, CMS/preview, shell público, seguridad, rendimiento, accesibilidad, Analytics, Commerce y Landing QR.

Si un contrato requerido falta o contradice el estado desplegado, marcar `BLOQUEADO` con evidencia antes de ampliar o reinterpretar el alcance.

## 5. Autorizaciones contenidas en esta ejecución

La delegación vigente autoriza:

- usar la sesión autenticada existente en el navegador de Codex;
- operar Admin y Master únicamente en staging;
- crear datos de prueba únicamente en staging para una Tienda Promo Aladdin's Carpet;
- guardar borradores, configurar capacidades/permisos/datos Promo dentro de los contratos existentes;
- crear candidata, preview privado, publicar, despublicar o pausar/reanudar cuando el smoke lo requiera y terminar con una publicación de prueba activa;
- capturar evidencia saneada de staging; y
- corregir únicamente defectos demostrados dentro del alcance STG-0001, con pruebas proporcionales.

No autoriza push, commit, merge, deploy, release, producción, Cloudflare, DNS, dominio custom, certificados, migraciones nuevas, contratos compartidos o lectura/escritura de secretos.

## 6. Datos de prueba y estado final

Crear una Tienda Promo identificable como dato de staging, con nombre Aladdin's Carpet y un `publicSlug` canonical disponible. Registrar el nombre y slug exactos en el reporte sin publicar IDs internos.

Configurar únicamente capacidades, cuotas y permisos necesarios para el smoke. El backend debe seguir siendo la autoridad; no insertar rows directos ni abrir CRUD/realtime de colecciones `promo_*`.

La tienda debe usar:

- Theme único aprobado `promo.black-gold@1.0.0`;
- locales publicados `es` y `en`, con uno de ellos como default y ambos completos;
- tokens allowlisted del manifest, incluidos estados de movimiento normal y reducido;
- secciones informativas aprobadas y sin semántica Commerce;
- contacto principal ejecutable allowlisted (`phone`, `whatsapp` o `email`) con copy localizado y un único destino consistente entre Hero y Contacto;
- medios propios de staging, sin PII y dentro de los límites MEDIA, o estados de ausencia/error expresamente validados sin abrir URLs arbitrarias;
- Landing QR como adaptador opcional separado, nunca como fallback del CTA; y
- contenido de prueba no sensible claramente identificable.

Estado final esperado:

- tienda Promo activa;
- slot publicado activo;
- canonical de plataforma;
- `primary_binding` vacío;
- cero bindings/aliases/custom domains;
- ES y EN servibles;
- última revisión de prueba publicada;
- draft y revisiones históricas conservados conforme a PUBLISH;
- cualquier dato temporal adicional descrito y dejado en un estado seguro.

## 7. Fase A — Inventario inicial y seguridad del entorno

Antes de crear datos:

- confirmar que la URL es staging y no producción;
- comprobar HTTPS, redirección HTTP→HTTPS, health observable y host exacto;
- comprobar `X-Robots-Tag: noindex, nofollow, noarchive` en raíz, Admin/Master, Commerce, errores y rutas Promo;
- verificar canonical de negocio sin adoptar el host provisional;
- comprobar que `/sitemap.xml` no vuelve indexable staging;
- confirmar que una ruta Promo inexistente/no publicada devuelve respuesta genérica, no-store y noindex;
- comprobar rechazo fail-closed de Host desconocido/suffix y Origin cross-site sin incluir secretos en requests o evidencia; y
- registrar únicamente headers, status y URLs públicas no sensibles.

## 8. Fase B — Alta y gobierno Master

Desde el Master central de staging:

1. crear la tienda con `store_type=promo`;
2. confirmar foundation Promo coherente: site, entitlement cerrado, draft inicial y slot generación cero sin publicación;
3. habilitar solo las capabilities necesarias, incluidas publicación, tema/apariencia, multilenguaje, medios/analítica y Landing QR únicamente cuando su doble gate pueda verificarse;
4. fijar cuotas proporcionales dentro de hard ceilings;
5. verificar lifecycle, overview, readiness, catálogo Theme y operaciones proyectadas;
6. confirmar cero bindings, aliases y primary binding;
7. comprobar que no aparecen módulos o acciones Commerce para la tienda Promo;
8. verificar conflictos/CAS y estados vacíos o capability ausente de forma proporcional y reversible; y
9. conservar evidencia saneada sin IDs internos, tokens, cookies, actores personales o payloads privados.

Si la creación requiere una identidad administrativa de prueba, usar únicamente la sesión/flujo ya disponible y datos no sensibles de staging; no solicitar ni exponer credenciales.

## 9. Fase C — Admin Promo y autoría

En la ruta central `/t/{storeSlug}/admin`:

- confirmar navegación Promo construida desde `allowed_actions`;
- confirmar ocultación/fallo cerrado de productos, catálogo, pedidos, carrito, checkout, plan Commerce y otras superficies e-commerce;
- editar contenido, secciones, visibilidad y orden;
- configurar servicios sin precio, trabajo/galería, propietario, reseñas/estado seguro, contacto, footer y adapter Landing QR cuando proceda;
- seleccionar `promo.black-gold@1.0.0` y tokens allowlisted;
- completar ES y EN sin fallback público por campo;
- verificar estados de completitud y bloqueo editorial;
- asociar medios propios de staging mediante el pipeline autorizado, sin acceso directo a files/records; y
- comprobar guardado CAS, recarga y preservación de facetas ajenas.

No habilitar `internal_form`, `approved_live_chat`, CSS/JS/HTML libre, scripts externos, protocolos no allowlisted o un tema adicional.

## 10. Fase D — Preview privado y no publicado

- crear una candidata exacta del draft válido;
- abrir preview privado desktop y móvil;
- comprobar `private, no-store`, noindex y ausencia del borrador en rutas públicas;
- verificar comparación draft/publicado cuando exista una revisión publicada;
- antes de la primera publicación, comprobar `/promo/{publicSlug}` y `/promo/{publicSlug}/{locale}` como no publicados y genéricos;
- comprobar tema, ES/EN, contenido, media, CTA y Landing QR en preview sin exponer destinos/config privada; y
- demostrar que un locale incompleto, tema inválido, media no ready o configuración no publicable bloquean la candidata/publicación de forma segura cuando pueda hacerse sin corromper datos.

## 11. Fase E — Publicación, rollback seguro y publicación final

Ejecutar mediante los controles PUBLISH/Master existentes:

1. primera publicación en `canonical_mode=platform` y generación esperada;
2. comprobación pública de ES/EN;
3. cambio de draft visible solo en preview, no en publicado;
4. segunda publicación válida y comprobación de incremento de generación sin datos privados;
5. rollback explícito a una revisión histórica compatible, o ciclo proporcional `pause/unpublish → fallo público seguro → resume/publish` cuando sea la recuperación aprobada disponible en UI;
6. comprobar invalidación generation-aware/ETag sin servir bytes de una revisión anterior; y
7. terminar publicando la última revisión de prueba aprobada, activa y en modo plataforma.

No cambiar canonical a custom, no crear binding y no usar DOM-CF.

## 12. Fase F — Smoke público funcional y visual

Validar como mínimo:

| Superficie | Casos obligatorios |
|---|---|
| Rutas | `/promo/{publicSlug}` y `/promo/{publicSlug}/{locale}`; redirect neutral; ES y EN exactos; locale inválido fail-closed |
| Tema | `promo.black-gold@1.0.0`, tokens efectivos, sin segundo preset; release inválida/retirada proporcionalmente fail-closed |
| Contenido | identidad, Hero, servicios sin precios, destacado/galería, propietario, reseñas/estado seguro, contacto, footer |
| Medios | Hero eager/high único, resto lazy, video poster/controls/preload-none sin autoplay, alt/decorative, ausencia/error seguro |
| Contacto | CTA principal localizado, mismo destino en Hero/Contacto, teclado/foco, protocolo allowlisted, cero enlace vacío |
| Landing QR | enlace separado al origen central exacto, doble gate, sin QR redundante ni fallback del CTA |
| SEO/staging | canonical/hreflang coherentes con plataforma, staging noindex global, sin Product/Offer/precio/stock |
| Privacidad | DNT/GPC respetados, eventos allowlisted sin PII; no cookies/storage de visitante salvo preferencia de locale no identificante |
| Commerce isolation | DOM, navegación, red y scripts Promo sin producto/precio/carrito/checkout/pedido/stock/moneda |

Viewports mínimos con evidencia:

- desktop `1440×900`;
- laptop `1280×800`;
- tablet `768×1024`;
- móvil `390×844`;
- móvil `412×915`; y
- ancho estrecho `320×700`.

Estados mínimos proporcionales:

- contenido completo;
- sin video o sin media;
- pocas/muchas imágenes dentro de límites;
- reseñas vacías/no disponibles;
- contacto no disponible;
- locale incompleto bloqueado antes de publicar;
- tema inválido/retirado fail-closed;
- sitio no publicado/pausado;
- carga lenta o error de media;
- teclado, skip link, foco, reflow, movimiento reducido y targets táctiles.

## 13. Fase G — Seguridad, Admin/Master e aislamiento

Comprobar proporcionalmente:

- Admin A no puede leer o modificar un tenant B;
- soporte Master exige contexto explícito de tienda;
- actor sin permiso/capability no obtiene UI ni datos y backend rechaza la acción;
- endpoints privados rechazan query/fields/filter/sort/expand/realtime y payloads con tenant alternativo;
- Host desconocido/suffix y XFH falso fallan cerrados;
- Origin same-origin se acepta solo cuando corresponde y cross-origin se rechaza;
- CSP no admite scripts remotos ni `unsafe-eval`;
- rutas Admin/Master/API privadas permanecen centrales y no se exponen como superficie Promo pública;
- errores y evidencia no reflejan Host, Origin, IDs, payloads, tokens o PII;
- rate limiting y headers conservan el contrato SEC; y
- draft, candidata, site pausado/suspendido o slot unpublished nunca se sirven como público.

No intentar enumeración agresiva, abuso volumétrico o pruebas que degraden staging.

## 14. Fase H — Regresión Commerce y Landing QR Commerce

Preferir comprobaciones no mutantes sobre la tienda Commerce PowerZona:

- home y ruta `/t/powerzona`;
- búsqueda y navegación de catálogo/producto;
- carrito y checkout sin completar compras ni crear pedidos reales;
- rutas y shell Admin/Master Commerce cuando la sesión lo permita;
- Landing QR `/t/powerzona/links`, configuración y tracking existentes sin cambios;
- ausencia de permisos/capabilities Promo accidentales en Commerce; y
- respuestas, defaults, precios, inventario y navegación sin cambio observable.

Solo crear datos Commerce de prueba si una comprobación no mutante no puede demostrar ausencia de regresión; cualquier dato creado debe documentarse y quedar en estado seguro.

## 15. Evidencia y saneamiento

Conservar evidencia reproducible y mínima bajo:

```text
docs/tusenda84/reportes/evidencias/TS84-PROMO-STG-0001/
```

La evidencia puede incluir capturas desktop/móvil, exportes visuales no sensibles y una matriz textual de status/headers/resultados. Debe redactar u omitir:

- cookies y `Set-Cookie`;
- `Authorization`, tokens, contraseñas y valores de variables;
- IDs internos de stores/sites/revisiones/bindings/media/users/events;
- emails, teléfonos o datos personales no creados expresamente como fixture pública;
- payloads privados completos, logs crudos y evidencia de dominio.

No inspeccionar cookies, storage, perfil, contraseñas o secretos del navegador. Usar la sesión únicamente mediante la UI ya autenticada.

## 16. Defectos y correcciones

Corregir solo defectos demostrados dentro de STG-0001 y únicamente cuando:

- la causa esté dentro del código/configuración ya autorizados de Promo;
- el cambio sea aditivo y no modifique contratos compartidos, infraestructura o producción;
- exista reproducción, prueba proporcional y retest en staging; y
- no requiera deploy, migración, push o cambio externo no autorizado.

Si el defecto requiere deploy, infraestructura, contrato compartido, migración, dependencia, secreto, Cloudflare/DNS o producción, no corregir: marcar `BLOQUEADO` y documentar evidencia y autoridad faltante.

No cerrar con un defecto crítico abierto.

## 17. Gate de cierre

Marcar `COMPLETADO` solo si:

- tienda, Admin, Master, preview y publicación funcionan en staging;
- no publicado, publicación, recuperación/rollback seguro y publicación final fueron comprobados;
- rutas platform neutral/ES/EN, tema, contenido, media, contacto y responsive pasan;
- canonical permanece platform, primary binding vacío y bindings/aliases/custom domains en cero;
- Host/Origin/CSP/noindex/privacidad/tenant isolation pasan;
- Commerce, checkout/búsqueda y Landing QR Commerce no presentan regresión crítica;
- evidencia saneada y reporte final están completos;
- datos de prueba y estado final están documentados; y
- no queda defecto crítico abierto.

La aprobación humana final de Kraken exigida por el mapa no puede auto-otorgarse. Si toda la ejecución técnica pasa, el reporte puede cerrar como `COMPLETADO TÉCNICAMENTE / PENDIENTE DE APROBACIÓN HUMANA`; `TS84-PROMO-REL-0001` solo queda habilitado tras esa aprobación. Si falla un gate técnico, marcar `BLOQUEADO` con evidencia precisa.

## 18. Reporte obligatorio

Crear:

`docs/tusenda84/reportes/TS84-PROMO-STG-0001-implementacion.md`

Debe incluir:

- precondiciones Git;
- contratos leídos y autorizaciones;
- entorno, host, navegador y viewports;
- tienda y slug, sin IDs internos;
- datos creados y estado final;
- acciones Master/Admin/preview/publicación/rollback;
- matriz funcional, visual, seguridad, privacidad y aislamiento;
- rutas públicas y headers/status relevantes;
- regresiones Commerce/Landing QR;
- evidencia exacta y saneada;
- defectos, correcciones, retests, límites y pendientes;
- archivos locales modificados;
- confirmación de cero Cloudflare/DNS/custom/producción/deploy/push/commit; y
- siguiente Prompt ID realmente habilitado, sin iniciarlo.

## 19. NO HACER

- No conectar ni consultar Cloudflare.
- No modificar DNS, zonas, dominios, certificados, ingress o dominio privado.
- No crear custom domains, `promo_domain_bindings`, aliases o primary binding.
- No cambiar `canonical_mode` a `custom`.
- No desplegar ni modificar producción.
- No solicitar, leer, imprimir, escribir o versionar secretos.
- No inspeccionar cookies, storage, contraseñas o perfiles del navegador.
- No instalar plugins, dependencias o navegadores.
- No crear migraciones, backfills o cambios de contratos compartidos.
- No hacer push, merge, deploy, release o commit.
- No iniciar PROD-DOM, REL, OPS ni prompts posteriores.
- No reutilizar datos, volúmenes, URL interna o credenciales de producción.
- No desactivar `security.checkOrigin`, CSP, Host/Origin/proxy trust, rate limits, noindex o aislamiento tenant.
- No usar wildcard/suffix matching ni fallback a Commerce/otro tenant.
- No completar compras, crear pedidos reales o alterar PowerZona salvo fixture mínima estrictamente necesaria.

## 20. Siguiente Prompt ID

Si el smoke técnico y la aprobación humana final quedan cerrados en modo platform-first, el siguiente Prompt ID obligatorio es:

`TS84-PROMO-REL-0001`

`TS84-PROMO-PROD-DOM-0001` permanece opcional y no habilitado sin una decisión custom y autorización independiente. Ninguno se inicia en STG-0001.
