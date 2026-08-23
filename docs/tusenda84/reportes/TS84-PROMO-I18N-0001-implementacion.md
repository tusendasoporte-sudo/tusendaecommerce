# TS84-PROMO-I18N-0001 — Locales, traducciones, fallback y selector público Promo

- Fecha de cierre técnico: 2026-08-23
- Estado: **COMPLETADO**
- Base solicitada: rama local `dev` en `fadc31c` (`feat(promo): implementa auditoria de actividad saneada`)
- Estado Git durante el trabajo: worktree desacoplado exactamente en `fadc31c`; **sin commit, push, merge, despliegue ni release**
- Dependencias reutilizadas: DATA-0001, PERM-0001, PUBCFG-0001 y AUDIT-0001

## 1. Resultado

Se implementó el motor general I18N de Tiendas Promo como una capa backend aditiva sobre la proyección pública saneada de PUBCFG. El resultado aporta:

- catálogo del sistema `promo.system.v1`, versionado y completo por locale exacto;
- traducciones iniciales del sistema para `es` y `en`, sin asignar ninguna de ellas a una tienda real;
- negociación determinista mediante locale explícito, preferencia persistida, `Accept-Language` y locale predeterminado publicado;
- proyección pública localizada que entrega exactamente un bloque de contenido y un catálogo del sistema;
- selector público allowlisted con enlaces estables por locale y nombres accesibles;
- persistencia no identificante de la selección mediante cookie Promo propia;
- fallo cerrado ante locale explícito inválido/no publicado, catálogo incompleto, revisión incoherente o tenant no resoluble;
- evento `promo.localization.update` escrito por el writer único de AUDIT cuando PUBCFG cambia locales o traducciones; y
- pruebas unitarias, de contrato, aislamiento y runtime PocketBase real.

No se creó otra colección de traducciones, documento, autorización, tenant resolver, publicación, tema, media, contacto, shell o almacenamiento. El contenido localizado continúa dentro del documento/revisión `promo.site.v1` de DATA/PUBCFG; el backend continúa siendo la única fuente de verdad.

## 2. Contratos respetados

La implementación se cerró contra:

- `docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md`;
- `docs/tusenda84/reportes/TS84-PROMO-ARC-0001-arquitectura-adrs.md`;
- `docs/tusenda84/reportes/TS84-PROMO-DATA-DES-0001-diseno-datos.md`;
- `docs/tusenda84/reportes/TS84-PROMO-DATA-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-PERM-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-PUBCFG-0001-implementacion.md`; y
- `docs/tusenda84/reportes/TS84-PROMO-AUDIT-0001-implementacion.md`.

Decisiones aplicadas:

1. DATA conserva ownership de `locales`, `content_by_locale`, metadata duplicada de revisión, reglas `null`, cuotas y aislamiento.
2. PERM conserva ownership de `promo.translations.manage`, `multilanguage_enabled` y `max_locales`; I18N no añade permisos, roles, grants o capabilities.
3. PUBCFG conserva el resolver público por `public_slug`, la revisión exacta, la proyección allowlisted, el contrato privado de edición y CAS.
4. I18N consume únicamente `promo.public.projection.v1`; no lee records, drafts, “última revisión”, filtros, expands o IDs internos.
5. AUDIT continúa como writer único. La misma transacción del update de draft escribe el evento general existente y, cuando corresponde, el evento focal `promo.localization.update` con snapshots estructurales saneados.
6. No existe fallback público por campo. Una representación siempre usa contenido de un solo locale efectivo.
7. El catálogo del sistema para todos los locales anunciados debe estar completo; una ausencia vuelve la representación no servible en lugar de mezclar otro idioma.

## 3. Catálogo general del sistema

### 3.1 Contrato

`promo.system.v1` contiene 24 claves obligatorias y exactas. Cada catálogo debe implementar el conjunto completo; unknown/missing keys no producen una proyección parcial.

| Familia | Cobertura |
|---|---|
| Navegación | Inicio, servicios, galería, propietario y contacto |
| CTA/contacto | Contactar, solicitar estimado, llamar, WhatsApp, correo, mensaje, chat y no disponible |
| Estados | Disponible, cargando y no disponible |
| Accesibilidad | Saltar al contenido, navegación principal, contenido principal, acción de contacto y selector de idioma |
| Errores públicos | Sitio no disponible e idioma no disponible |
| Locale | Idioma actual y plantilla accesible de cambio de idioma |

Los textos de negocio —identidad, navegación editorial, secciones, CTA configurado, alt y SEO— siguen viniendo exclusivamente de `content_by_locale`. Los componentes públicos futuros podrán consumir las claves del sistema sin crear lógica o strings particulares para Contacto u otra sección.

### 3.2 Locales incluidos

| Locale exacto | Nombre nativo | Dirección | Catálogo de sistema |
|---|---|---|---|
| `es` | Español | `ltr` | Completo |
| `en` | English | `ltr` | Completo |

Esto no decide los locales/default de Aladdin's Carpet y no crea una revisión o tienda. Una revisión solo puede servirse por I18N si cada locale publicado posee un catálogo exacto completo. Para añadir francés u otro locale no se cambia schema ni componentes: se añade un catálogo completo y metadata de locale en una versión soportada.

## 4. Contratos y rutas públicas

Se añadieron exclusivamente dos rutas GET públicas:

| Ruta | Señales permitidas | Resultado |
|---|---|---|
| `/api/pz/promo/public/v1/sites/{publicSlug}/locales` | Cookie Promo y `Accept-Language`; query vacía | Entrada neutral negociada |
| `/api/pz/promo/public/v1/sites/{publicSlug}/locales/{locale}` | Locale explícito en URL; cookie/header no lo sustituyen; query vacía | Representación estable por locale |

Respuesta: `promo.public.localized.v1`.

La respuesta allowlisted contiene:

```text
ok, contract,
site { public_slug },
system { catalog_version, messages },
locale { effective, default, source, lang, direction, canonical_path },
selector { label, options[] { locale, label, aria_label, href, active } },
theme, section_order, sections, media, contact,
content, adapters
```

`content` corresponde únicamente al locale efectivo. No se entrega `content_by_locale`, contenido de otro idioma, config/destino de contacto, records, IDs internos, digest, generación, permisos, capabilities, secretos o semántica Commerce.

La ruta PUBCFG original `/api/pz/promo/public/v1/sites/{publicSlug}` y su contrato no cambiaron; I18N la reutiliza como fuente pública saneada. Las nuevas rutas permanecen `no-store/noindex` hasta PERF/SEO y añaden `Content-Language`; la entrada neutral añade `Vary: Accept-Language, Cookie`.

## 5. Matriz de negociación y fallback

| Prioridad/caso | Regla | Resultado |
|---:|---|---|
| 1. URL explícita publicada | Canonicaliza casing BCP 47 antes de comparar | Gana siempre; cookie/header se ignoran |
| URL explícita inválida/no publicada | No se sustituye por default ni por otro idioma | `404 promo_public_unavailable`, noindex/no-store |
| 2. Cookie `pz_promo_locale` | Debe ser única, decodificable, canonical y coincidir exactamente con un locale publicado | Selecciona `source=preference` |
| Cookie ausente, ambigua, corrupta o no publicada | Se ignora sin reflejar su valor | Continúa a `Accept-Language` |
| 3. `Accept-Language` exacto | Respeta `q` y orden | Selecciona locale publicado exacto |
| `Accept-Language` por idioma | Si no hay exacto, elige determinísticamente una representación publicada del mismo idioma | Selecciona `source=accept-language` |
| Header inválido, wildcard o `q=0` | No concede locale | Continúa al default |
| 4. Default publicado | Debe pertenecer al set publicado | Selecciona `source=default` |
| Campo tenant opcional ausente | Se omite conforme a PUBCFG | No se copia desde otro locale |
| Campo obligatorio/content locale ausente | La revisión/proyección falla cerrada | No hay respuesta parcial |
| Catálogo del sistema ausente para cualquier locale publicado | El selector completo falla cerrado | No se mezclan mensajes del sistema |

Cuando se usa una URL explícita válida, el backend guarda `pz_promo_locale=<locale>` con `Path=/`, `Max-Age=31536000`, `SameSite=Lax` y `Secure`. La cookie contiene solo el tag de locale; no almacena tenant, usuario, identificador, destino, mensaje o PII.

## 6. Selector público y accesibilidad

El selector se proyecta desde el set `locales.published` de la revisión, nunca desde input del cliente. Cada opción incluye:

- tag canonical;
- nombre nativo catalogado;
- `aria_label` localizado mediante una plantilla del sistema;
- `href` relativo construido por backend desde `public_slug` ya resuelto y el locale publicado;
- estado `active`.

Los `href` funcionan como enlaces normales sin JavaScript. La respuesta incluye `lang` y `direction` para que `TS84-PROMO-SHELL-0001` aplique después `html[lang]` y dirección sin inventar otra decisión. SEO/canonical de dominio y `hreflang` finales permanecen en `TS84-PROMO-SEO-0001`; I18N solo fija la identidad de path localizada y no inicia SEO.

## 7. Matriz de actores y operaciones

| Actor/estado | Operación | Resultado |
|---|---|---|
| Público | Entrada neutral de Promo A activa/publicada | Locale negociado sobre la revisión exacta A |
| Público | URL explícita publicada de Promo A | Un locale A, autoritativo y persistido |
| Público | Locale inválido/no publicado | Fallo genérico cerrado; nunca default implícito |
| Público | Query con `store_id`, `site_id`, filter/sort/fields/expand u otro campo | `400 invalid_payload` |
| Público | Commerce, slug desconocido, slot custom antes de DOM-CORE o publicación incoherente | `404 promo_public_unavailable` |
| Público A intentando inferir B | No existe parámetro de tenant alternativo | No se proyecta ni mezcla B |
| Admin principal Promo | Editar locales/traducciones por PUBCFG CAS | Permitido según PERM/capabilities; auditado |
| Admin secundario/Staff | Editar localizaciones | Solo si los action keys efectivos de PUBCFG/PERM lo permiten |
| Master | Editar en soporte | Requiere `X-PZ-Promo-Store` explícito y gate reservado existente |
| Usuario Commerce/suspendido/bloqueado/sesión revocada | Editar Promo | Denegado por PERM, sin fallback |

I18N no escribe preferencia en PocketBase y no audita lecturas/selecciones públicas. Las únicas escrituras persistentes de localización continúan siendo updates de draft PUBCFG autorizados.

## 8. Auditoría saneada

Cuando un update de draft cambia `/system_catalog_version`, `/locales` o `/content_by_locale`, PUBCFG invoca el writer central AUDIT dentro de su transacción y crea:

- el evento general idempotente `promo.draft.update`; y
- el evento focal idempotente `promo.localization.update`.

El evento focal usa source key `promo.localization.<draftId>.v<version>` y conserva únicamente digest, versión, tema, metadata de locales, tipos/flags de contacto, conteos de media/secciones y adapters. No copia texto localizado, identidad, alt, SEO, teléfono, email, mensaje, config, destino, asset ID, cookie, header o documento completo.

## 9. Archivos modificados

### Nuevos

| Archivo | Propósito |
|---|---|
| `backend-powerzona/pb_hooks/pz_promo_i18n_lib.js` | Catálogos, validación, negociación, fallback de selección y proyección de un solo locale |
| `backend-powerzona/pb_hooks/pz_promo_i18n_api_lib.js` | Señales HTTP, cookie, headers, resolver sobre PUBCFG y errores públicos saneados |
| `backend-powerzona/pb_hooks/pz_promo_i18n.pb.js` | Entrada neutral y ruta explícita del selector público |
| `backend-powerzona/tests/pz_promo_i18n.test.cjs` | Pruebas focales unitarias y de contrato |
| `docs/tusenda84/reportes/TS84-PROMO-I18N-0001-implementacion.md` | Este cierre |

### Actualizados

| Archivo | Cambio focal |
|---|---|
| `backend-powerzona/pb_hooks/pz_promo_pubcfg_api_lib.js` | Reutiliza el writer AUDIT para evento focal de localización, sin cambiar auth/CAS/contrato editable |
| `backend-powerzona/tests/pz_promo_pubcfg_http_runtime.test.cjs` | Fixtures bilingües, negociación/selector/tenant A-B y auditoría de localización runtime |

No se modificó ningún archivo frontend, mobile, Commerce, migración, schema, colección, permiso, role, capability, plan, template, ruta Commerce o infraestructura.

## 10. Migraciones y dependencias

**Migraciones: ninguna.** I18N reutiliza el documento y la revisión DATA/PUBCFG y la colección append-only `promo_audit_events` de DATA/AUDIT.

- Backfill: ninguno.
- Seed de tiendas/locales/Aladdin/tema: ninguno.
- Dependencias de paquete: ninguna.
- Records persistentes creados: ninguno fuera de fixtures en DB temporales descartables.

## 11. Pruebas ejecutadas

### 11.1 Sintaxis y focales

```text
node --check pz_promo_i18n_lib.js / pz_promo_i18n_api_lib.js /
  pz_promo_i18n.pb.js / pz_promo_pubcfg_api_lib.js
Resultado: PASS

node --test pz_promo_i18n.test.cjs pz_promo_pubcfg.test.cjs pz_promo_audit.test.cjs
Resultado: 24/24 PASS
```

Cobertura:

- catálogo exacto/completo `es` y `en`;
- locale URL, cookie, `Accept-Language`, `q`, exact/language match y default;
- URL explícita inválida sin fallback;
- selector, paths, labels accesibles, `lang` y dirección;
- carga de un solo contenido localizado;
- ausencia de texto del otro locale, PII, secretos, IDs internos y Commerce;
- catálogo/version/locale desconocido fail-closed;
- cookie corrupta, duplicada o sobredimensionada;
- rutas sin auth/CRUD/query abierta; y
- writer AUDIT central, sin almacenamiento paralelo.

### 11.2 Runtime PocketBase real

Se usó temporalmente la misma copia local PocketBase `0.39.8` documentada por DATA/PUBCFG/AUDIT, SHA-256 `7503E40F3B36F772F26C9DD9DD971A3A176D601701B3C10D70F2FA8FA70E90D4`.

```text
node --test tests/pz_promo_pubcfg_http_runtime.test.cjs
Resultado: 1/1 PASS
```

El gate cubrió dos Promo A/B, dos idiomas, entrada neutral, URL explícita, alias de casing, cookie, `Accept-Language`, default, locale no publicado, query inyectada, contenido único, `Content-Language`, selector y eventos `promo.localization.update`. También volvió a cubrir PUBCFG/AUDIT: revisión exacta, digest, CAS, actores, capabilities, permisos, REST cerrado, slot custom bloqueado y ausencia de draft/candidata pública.

El binario se copió solo al path esperado durante cada gate y se retiró en `finally`. Las bases se crearon bajo el temporal del sistema y se eliminaron. No se usó `backend-powerzona/pb_data`.

### 11.3 Regresión backend

```text
node --test
Resultado inicial: 815 total; 807 PASS; 1 fallo de preparación; 7 SKIP

node --test tests/pz_r7p2_http_runtime.test.cjs
Resultado al montar node_modules compatible: 1/1 PASS
```

La única falla inicial fue que R7P2 no encontró `frontend-powerzona/node_modules/astro/bin/astro.mjs`; no ejecutó su lógica. Se verificó que el `package-lock.json` del worktree y del checkout fuente comparten SHA-256 `5FFC6653FFF76B5DBA036ADAC6B98E485B3DC6BCF646729D059116748B37F5AE`, se montó un junction temporal y R7P2 pasó. Resultado consolidado: **808/808 pruebas backend ejecutables aprobadas**; siete skips corresponden a gates opt-in que requieren URLs/credenciales externas o configuración no autorizada.

### 11.4 Frontend y build

El mismo `node_modules` compatible se montó solo mediante junction temporal y se retiró en `finally`.

```text
node --test tests/promoAccess.test.mjs
Resultado: 5/5 PASS

node --test
Resultado: 655 total; 654 PASS; 1 FAIL; 0 SKIP

npm.cmd run build
Resultado: PASS
```

La única falla frontend sigue siendo la baseline documentada y aprobada en AUDIT-0001: `storefrontPushAdminForm.test.mjs — el detalle enviado usa un panel de resultados...`. El frontend permanece idéntico a `fadc31c` y no figura en el diff I18N; corregir Push C09 está fuera de alcance. El build conserva tres warnings preexistentes de `getStaticPaths()` ignorado en rutas dinámicas de categoría, subcategoría y producto.

### 11.5 Higiene

- `git diff --check`: PASS.
- PocketBase temporal restante: no.
- Junction `node_modules` restante: no.
- Dependencias nuevas: ninguna.
- Commit/push/merge/deploy/release: no realizados.

## 12. Compatibilidad preservada

- No se modificó el catálogo español fijo ni ninguna traducción Commerce existente.
- No se cambiaron `stores`, plans, permisos, roles, defaults, settings, Landing QR, ratings, analytics, `store_activity_audit`, rutas `/t/[storeSlug]`, Admin, Master, apps o APKs.
- Ninguna tienda Commerce adquiere locale, cookie efectiva, proyección o acceso Promo por fallback.
- El nombre de cookie es exclusivo Promo y ningún flujo Commerce lo consulta.
- I18N no importa ni consulta productos, categorías, órdenes, promociones, cupones, regalos, precios, moneda, stock, inventario, carrito, checkout o shipping.
- Las rutas nuevas viven exclusivamente bajo el namespace público Promo y solo aceptan un slug ya gobernado por PUBCFG.
- Un selector de A solo contiene locales y contenido de la revisión publicada de A; no admite tenant/revisión alternativos.
- No se cambió el contrato PUBCFG existente; la nueva respuesta tiene un contract ID propio.

## 13. Riesgos y límites residuales

| Riesgo/límite | Tratamiento/estado |
|---|---|
| Solo existen catálogos de sistema exactos `es` y `en` | Fallo cerrado para otros locales; se amplían por catálogo completo, sin schema/component change |
| Locales/default reales de Aladdin siguen sin asignarse | No hubo seed ni revisión; corresponde a CMS/LOCALES-ADMIN/publicación con aprobación de contenido |
| La ruta es API pública, no UI visual | Entrega enlaces sin JS y contrato accesible; SHELL materializará el control visual en su prompt, no iniciado |
| Canonical de dominio, redirect neutral y `hreflang` finales no existen | DOM/SHELL/SEO los implementarán sobre `canonical_path`; I18N no adelantó esos prompts |
| Fechas/teléfonos no se formatean en esta fase | La proyección no contiene fechas ni destino telefónico; CONTACT/SEO/SHELL deberán consumir el locale efectivo cuando esos datos existan |
| Cookie persiste un año | Solo contiene locale y no PII; una política global de preferencias puede ajustar duración en prompt autorizado sin tocar contenido |
| Revisión publicada futura podría referenciar catálogo no disponible | El resolver falla cerrado; PUBLISH deberá invocar este gate antes de promover |
| Baseline Push C09 continúa fallando | Preexistente, fuera del diff y ya documentada en AUDIT-0001; requiere su propio alcance |

## 14. Siguiente Prompt ID habilitado

Según el orden del mapa maestro, el siguiente Prompt ID habilitado es **`TS84-PROMO-THEME-0001`**.

I18N-0001 no inició `TS84-PROMO-THEME-0001`, `TS84-PROMO-MEDIA-0001`, `TS84-PROMO-PUBLISH-0001`, SHELL, CMS, CONTACT, SEO ni ningún prompt posterior.

## 15. Confirmaciones de cierre

- No se consultó ni modificó PocketBase desplegado.
- No se consultaron ni modificaron Cloudflare, Coolify, staging o producción.
- No se leyó ningún secreto. Los runtimes eliminaron variables sensibles heredadas y usaron valores sintéticos.
- No se creó otra identidad, autorización, almacenamiento, publicación, tema, media, contacto o auditoría.
- No se hizo push, merge, deploy, release ni commit.
- El worktree conserva cambios locales únicamente para revisión y autorización separada.
