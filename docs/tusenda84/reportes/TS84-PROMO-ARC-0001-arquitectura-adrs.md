# TS84-PROMO-ARC-0001 — Arquitectura y ADRs de Tiendas Promo

## 1. Ficha de control

| Campo | Resultado |
|---|---|
| Proyecto | Tu Senda 84 / Tiendas Promo |
| Prompt ID | `TS84-PROMO-ARC-0001` |
| Estado | **PROPUESTO PARA APROBACIÓN DE PRODUCTO/KRAKEN** |
| Fecha | 2026-08-22 |
| Rama solicitada | `dev` |
| Base observada | `8464b9d533563701f0dca0af22de1d3b8ffc2b20` |
| Situación Git de la base | `HEAD` separado; coincide con `dev` y `origin/dev` |
| Contrato normativo de entrada | `docs/tusenda84/reportes/TS84-PROMO-COMPAT-0001-especificacion-compatibilidad.md` |
| Fuente de secuencia | `docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md` |
| Modalidad | Arquitectura documental, ADRs y comprobaciones estáticas de lectura |
| Implementación funcional | **NO** |
| Entregable autorizado | `docs/tusenda84/reportes/TS84-PROMO-ARC-0001-arquitectura-adrs.md` |

Este documento no está `BLOQUEADO`. COMPAT aporta evidencia suficiente para cerrar decisiones técnicas de alto nivel sin diseñar aún persistencia, migraciones, endpoints ni rutas ejecutables. El estado es `PROPUESTO PARA APROBACIÓN` porque el mapa exige aprobación de Kraken para cerrar arquitectura y porque varias elecciones de contenido, negocio y experiencia no deben inferirse (`docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md:570-586`).

## 2. Dictamen arquitectónico

Tiendas Promo se incorporará en el futuro como un bounded context público **aditivo, aislado y host-first**. Tendrá resolver de host, contexto de tenant, lectura publicada, shell, contratos y componentes Promo propios. Podrá consumir capacidades transversales únicamente mediante puertos/adaptadores mínimos y allowlisted. No tendrá una dependencia hacia la portada, layout, DTO, consultas, rutas, estado de navegador ni eventos de Commerce.

El sitio público Promo leerá una sola revisión publicada, inmutable y coherente. Un cambio de contenido, locales, tema, CTA o SEO no será visible hasta que una revisión candidata pase validación completa y un puntero de publicación cambie atómicamente. Preview leerá una candidata privada; rollback volverá el puntero a una revisión íntegra anterior. No habrá lectura pública directa de borradores.

La resolución de dominio ocurrirá únicamente desde un binding local exacto, único, activo y previamente verificado por Master. `X-Forwarded-Host` solo tendrá autoridad detrás de un peer confiable y con un único valor inequívoco; no habrá llamadas a Cloudflare/Coolify en el request. Admin, Master y APIs actuales seguirán en hosts Tu Senda 84. Un host o estado inválido fallará cerrado.

Aladdin's Carpet será la primera Promo. La entrada conceptual inicial del registry será `promo.aladdin.black-gold`, con composición negra/dorada y sin precios, carrito ni checkout. El bloque “Escanéame para contactarme” se reemplazará por un CTA localizado/configurado. Landing QR seguirá siendo una capacidad independiente e intacta. El cierre responsive seguirá bloqueado por el mockup móvil aprobado.

## 3. Alcance, exclusiones y método

### 3.1 Incluido

- Componentes lógicos, ownership y dirección de dependencias.
- Contratos conceptuales públicos, privados y server-only.
- ADRs de aislamiento Commerce/Promo, publicación, dominio/host/caché, i18n, temas, CTA, adaptadores, medios, SEO, rating, privacidad, seguridad y rendimiento.
- Ciclo `draft → preview → publish → rollback` y gates de coherencia.
- Trazabilidad completa de `INV-01..20` y `AC-01..18` de COMPAT.
- Riesgos, decisiones reservadas a producto/Kraken y plan documental de validación futura.

### 3.2 Excluido

- Código funcional, prototipos ejecutables, endpoints, rutas, componentes, estilos o contratos serializados.
- Diseño definitivo de colecciones, campos, relaciones, índices, reglas PocketBase o estrategia de migración.
- Creación o modificación de migraciones, hooks, permisos, capacidades, planes o defaults.
- Cambios en Commerce, Master, Admin, Landing QR, ratings, i18n existente, apps, APKs o comportamiento actual.
- Consultas o cambios en PocketBase desplegado, Cloudflare, Coolify, staging o producción.
- Lectura de secretos, archivos `.env`, tokens o credenciales.
- Automatización Cloudflare, DNS, TLS, ingress, purge de proveedor o despliegues.
- Inicio de `TS84-PROMO-DATA-DES-0001`, `TS84-PROMO-MOB-VIS-0001` o cualquier implementación.

### 3.3 Método y límites de evidencia

COMPAT se leyó completa desde otro worktree local del mismo repositorio porque su archivo aprobado no fue propagado a este worktree. La ruta lógica y la base observada son las mismas; no se copió ni modificó la fuente. `TS84-PROMO-AUD-0001` tampoco está propagada aquí y, conforme al encargo, no se recreó ni fue condición de bloqueo: COMPAT ya incorpora y valida sus hallazgos y citas (`docs/tusenda84/reportes/TS84-PROMO-COMPAT-0001-especificacion-compatibilidad.md:61-92`).

Solo se contrastaron líneas versionadas necesarias. La resolución actual extrae `/t/<slug>` y cae al store predeterminado cuando no hay slug (`frontend-powerzona/src/lib/stores.ts:170-221`, `frontend-powerzona/src/lib/stores.ts:420-434`); la ruta pública existente delega en `PublicStoreHome` (`frontend-powerzona/src/pages/t/[storeSlug]/index.astro:1-18`). Esa portada consulta categorías, productos, regalos, promociones y ratings (`frontend-powerzona/src/components/public-store/PublicStoreHome.astro:1-68`) y ejecuta estado de carrito, subtotal, precio y stock (`frontend-powerzona/src/components/public-store/PublicStoreHome.astro:3242-3322`). El layout actual inicializa carrito, promociones, cupones, moneda y UI Commerce (`frontend-powerzona/src/layouts/Layout.astro:7-35`, `frontend-powerzona/src/layouts/Layout.astro:57-90`, `frontend-powerzona/src/layouts/Layout.astro:172-183`, `frontend-powerzona/src/layouts/Layout.astro:568-574`). Esta evidencia hace obligatorio el shell separado.

La separación actual de Admin/Master se observa en middleware (`frontend-powerzona/src/middleware.ts:143-180`, `frontend-powerzona/src/middleware.ts:218-245`); las capacidades desconocidas fallan de forma segura (`frontend-powerzona/src/lib/storeCapabilities.ts:257-285`, `frontend-powerzona/src/lib/storeCapabilities.ts:343-352`); Landing QR ya posee contrato y gate propios (`frontend-powerzona/src/lib/landingQr.ts:4-38`, `frontend-powerzona/src/pages/t/[storeSlug]/links.astro:17-36`). No se alteran esas superficies.

## 4. Base normativa y restricciones heredadas

### 4.1 Fuentes

1. **COMPAT, contrato aprobado y no debilitado.** Congela veinte invariantes (`docs/tusenda84/reportes/TS84-PROMO-COMPAT-0001-especificacion-compatibilidad.md:112-137`), superficies inmutables (`docs/tusenda84/reportes/TS84-PROMO-COMPAT-0001-especificacion-compatibilidad.md:139-175`), frontera de dependencias (`docs/tusenda84/reportes/TS84-PROMO-COMPAT-0001-especificacion-compatibilidad.md:176-220`), contratos conceptuales (`docs/tusenda84/reportes/TS84-PROMO-COMPAT-0001-especificacion-compatibilidad.md:222-315`) y criterios `AC-01..18` (`docs/tusenda84/reportes/TS84-PROMO-COMPAT-0001-especificacion-compatibilidad.md:429-452`).
2. **Mapa maestro.** Sitúa ARC después de COMPAT y antes de DATA-DES (`docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md:274-284`), fija motores y dependencias (`docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md:295-304`), mantiene el shell público separado (`docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md:317-340`) y prohíbe migrar o implementar fuera de secuencia (`docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md:354-369`).
3. **Base versionada equivalente a dev.** Las líneas contrastadas en la sección anterior justifican separación, no una modificación.

### 4.2 Restricciones no negociables

- Aladdin's Carpet es la primera Promo y negro/dorado su modelo inicial.
- El CTA localizado/configurado sustituye “Escanéame para contactarme”.
- Landing QR permanece intacta, independiente y sin fallback implícito desde CTA.
- Promo no muestra, serializa, consulta, precarga ni ejecuta precio, moneda, stock, carrito o checkout.
- Solo se publican temas allowlisted, versionados y aprobados; no hay CSS/JS/HTML arbitrario.
- Los dominios están bajo la cuenta Cloudflare controlada por Master; ninguna credencial llega a navegador o datos públicos.
- Dominio personalizado sirve solo el sitio público Promo; Admin, Master y APIs actuales permanecen bajo Tu Senda 84.
- Toda incorporación será aditiva y aislada; los contratos y defaults existentes no cambian.
- El mockup móvil aprobado es gate obligatorio antes del cierre responsive.
- Cualquier necesidad de cambiar una superficie `IMM-*` detiene el prompt futuro y requiere autorización/ADR de compatibilidad; ARC no concede esa autorización.

## 5. Contexto y drivers

| Driver | Implicación arquitectónica |
|---|---|
| Preservación absoluta de Commerce | Shell, DTOs, consultas, rutas y bundle Promo separados; cero fallback al flujo actual. |
| Multi-tenant | Tenant derivado una vez del binding verificado y propagado explícitamente a todas las capas. |
| Dominio personalizado | Resolver host-first server-only; bindings locales, exactos y administrados por Master. |
| Publicación segura | Revisión inmutable y promoción atómica; público sin acceso a borradores. |
| Multi-tema desde v1 | Registry empaquetado, versionado, allowlisted y compatible con secciones. |
| i18n general | Locale publicado y negociación central; ningún componente/CTA crea su propia lógica. |
| Conversión por contacto | Acciones tipadas, destino validado/encoded y telemetría sin PII. |
| Privacidad y seguridad | Proyección mínima, no código configurable, no secretos, fallo cerrado y auditoría saneada. |
| Rendimiento/SEO | SSR ligero, JavaScript mínimo, assets optimizados, canonical desde contexto verificado. |
| Operabilidad | Rollback de revisión/tema, retirada independiente de binding y caché generation-aware. |
| Accesibilidad | Contrato de tema y componentes con foco, contraste, teclado, semántica y movimiento reducido. |

## 6. Diagrama lógico y dirección de dependencias

```text
HOST TU SENDA 84                                  HOST PERSONALIZADO
        |                                                 |
        | rutas actuales (sin cambios)                    v
        v                                      [Límite de headers/proxy]
Commerce / Admin / Master / API                          |
                                                          v
                                              [PromoHostResolver]
                                                          |
                                              binding local exacto
                                                          |
                                                          v
                                               [PromoTenantContext]
                                                          |
                         +--------------------------------+------------------+
                         |                                                   |
                         v                                                   v
             [PublishedRevisionReader]                           [Seguridad/telemetría]
                         |
                         v
                  [PromoSiteProfile]
                         |
          +--------------+---------------+----------------+
          |                              |                |
          v                              v                v
 [PromoI18nResolver]          [PromoThemeRegistry] [PromoContactResolver]
          |                              |                |
          +------------------------------+----------------+
                                         |
                                         v
                                  [Promo Public Shell]
                                         |
                          puertos read-only allowlisted
                                         |
                 +----------+------------+----------+-----------+
                 v          v                       v           v
              Media       SEO                Analytics/Audit   Rating*
                                                               Landing QR*

ADMIN/MASTER EN TU SENDA 84
        |
        v
[Autorización backend] -> [Draft Workspace] -> [Candidate/Preview]
                                                |
                                       validación integral
                                                |
                                                v
                                      [Publish Coordinator]
                                                |
                                 puntero atómico + invalidación
                                                |
                                                v
                                     [Revisión pública inmutable]

* Solo mediante decisión de producto expresa; nunca como dependencia Commerce.
```

Reglas de flechas:

1. El shell depende de contratos Promo, nunca de implementaciones Commerce.
2. El resolver actual por path no llama ni conoce al resolver por host; el resolver Promo no llama `getCurrentStore`.
3. Los adaptadores transversales implementan puertos definidos por Promo. La fuente actual no depende de Promo ni cambia su semántica.
4. El cliente público no recibe `PromoTenantContext`, authoring records, bindings, permisos ni registros completos; recibe únicamente la proyección pública.
5. Preview y publicación están bajo hosts y autenticación Tu Senda 84. Un custom host no puede acceder al workspace privado.

## 7. Componentes lógicos y ownership

Los nombres son arquitectónicos, no nombres obligatorios de archivo, colección, clase, endpoint o campo.

| Componente lógico | Owner | Responsabilidad | Puede depender de | No puede depender de |
|---|---|---|---|---|
| `PromoHostBoundary` | Plataforma/Seguridad | Aplicar confianza de peer, unicidad de header y parsing inicial. | Configuración server-only de proxies/hosts de plataforma. | Cloudflare por request, datos de tenant, headers no confiables como autoridad. |
| `PromoHostResolver` | Plataforma Promo | Canonicalizar host, clasificar plataforma/custom y resolver binding exacto. | Boundary, repositorio local de bindings, estado mínimo de publicación. | `getCurrentStore`, slug fallback, Commerce, DNS remoto. |
| `PromoBindingRegistry` | Master | Mantener asociación conceptual host↔tenant, estado, verificación y canonical/alias. | Operaciones Master futuras y auditoría. | Admin Promo, navegador, credenciales públicas. |
| `PromoTenantContext` | Plataforma Promo | Contexto server-only e inmutable de request: tenant, host, revisión, locale y tema autorizados. | Resultado del resolver. | Records completos, plan, roles, owner, secretos o payload del cliente. |
| `PromoDraftWorkspace` | Admin Promo | Edición privada de contenido/configuración dentro de permisos/capacidades. | Auth backend, validadores Promo, cuotas. | Host custom, público, colecciones Commerce como CMS. |
| `PromoPreviewGateway` | Admin Promo | Render privado/no indexable de una candidata coherente. | Candidata inmutable, shell Promo, auth/review grant. | Borradores parciales públicos, caché pública, custom-host auth. |
| `PromoPublishCoordinator` | Plataforma Promo | Validar, promover atómicamente, auditar e invalidar. | Draft/candidata, validadores, permisos, registry, bindings. | Escrituras parciales visibles, Cloudflare en el render request. |
| `PublishedRevisionReader` | Plataforma Promo | Leer exactamente una revisión pública íntegra. | Puntero publicado y almacenamiento conceptual inmutable. | Workspace draft, “último registro” por tabla, mezcla de revisiones. |
| `PromoSiteProfile` | Contrato Promo | Proyección pública mínima y localizada para render. | Una revisión publicada y adaptadores explícitos. | Datos privados, campos Commerce, HTML/CSS/JS libre. |
| `PromoI18nResolver` | Plataforma Promo | Resolver locale, completitud, fallback y catálogos del sistema/contenido. | Locales publicados, URL estable, preferencia, `Accept-Language`. | Strings del Commerce actual como catálogo general, lógica particular del CTA. |
| `PromoThemeRegistry` | Master/Plataforma | Resolver ID+versión a renderer empaquetado y schema cerrado. | Artefactos aprobados y versionados. | Imports/URLs/componentes controlados por tenant. |
| `PromoContactResolver` | Plataforma Promo | Compilar acción tipada, validada, localizada y accesible. | Configuración publicada, i18n, registry de tipos. | Destinos hardcodeados, Landing QR como fallback, scripts externos arbitrarios. |
| `PromoPublicShell` | Frontend Promo | SSR/navegación pública informativa sin Commerce. | Perfil, i18n, tema, CTA y puertos transversales. | Layout/portada/carrito/productos/precios/checkout de Commerce. |
| Puertos transversales | Plataforma | Identidad, media, SEO, analítica, auditoría, rating y Landing QR bajo contratos mínimos. | Contexto explícito y fuentes actuales sin mutarlas. | Consultas abiertas, expands, filtros del cliente o semántica Commerce. |

## 8. Catálogo de ADRs

| ADR | Título | Estado |
|---|---|---|
| `ARC-ADR-001` | Bounded context Promo aditivo y shell independiente | PROPUESTO PARA APROBACIÓN |
| `ARC-ADR-002` | Contratos, ownership y dirección de dependencias | PROPUESTO PARA APROBACIÓN |
| `ARC-ADR-003` | Revisión inmutable y ciclo draft/preview/publish/rollback | PROPUESTO PARA APROBACIÓN |
| `ARC-ADR-004` | Host, proxy confiable, bindings, separación de superficies y caché | PROPUESTO PARA APROBACIÓN |
| `ARC-ADR-005` | i18n por locales publicados y URLs estables | PROPUESTO PARA APROBACIÓN |
| `ARC-ADR-006` | Registry de temas versionado, seguro y sin código arbitrario | PROPUESTO PARA APROBACIÓN |
| `ARC-ADR-007` | CTA de contacto localizado, configurado y tipado | PROPUESTO PARA APROBACIÓN |
| `ARC-ADR-008` | Puertos/adaptadores transversales y límites público/privado | PROPUESTO PARA APROBACIÓN |
| `ARC-ADR-009` | Seguridad multi-tenant, auditoría y privacidad por defecto | PROPUESTO PARA APROBACIÓN |
| `ARC-ADR-010` | Medios, SEO y presupuestos de rendimiento | PROPUESTO PARA APROBACIÓN |
| `ARC-ADR-011` | Gates de compatibilidad y gobierno de cambios | PROPUESTO PARA APROBACIÓN |

### 8.1 `ARC-ADR-001` — Bounded context Promo aditivo y shell independiente

**Contexto.** La portada y layout actuales cargan y ejecutan infraestructura Commerce. COMPAT prohíbe que ocultarla con CSS o flags se considere aislamiento (`docs/tusenda84/reportes/TS84-PROMO-COMPAT-0001-especificacion-compatibilidad.md:197-220`).

**Decisión.** Crear en una fase futura un bounded context Promo con shell, DTOs, queries, navegación, estado de cliente y componentes propios. El discriminador conceptual `promo` se comprobará antes de construir contexto público. Commerce conserva exactamente su resolver por path, portada, layout y defaults. El custom host entra exclusivamente por el límite Promo; los hosts plataforma continúan por el flujo actual.

**Alternativas consideradas.** (a) agregar `if promo` a `PublicStoreHome`/`Layout`; rechazada por acoplamiento, bundle y riesgo de regresión. (b) reutilizar productos/categorías sin mostrar precio; rechazada porque mantiene semántica y consultas Commerce. (c) microservicio desplegado independiente desde v1; no requerido: el aislamiento lógico, de contrato y bundle es obligatorio, pero el límite de proceso/despliegue se decidirá al implementar sin debilitarlo.

**Consecuencias.** Habrá alguna duplicación intencional de composición; se gana independencia y verificabilidad. Toda utilidad mixta se consume mediante adaptador mínimo. El grafo y runtime Promo podrán probar ausencia estructural de Commerce (`AC-08`, `AC-09`).

### 8.2 `ARC-ADR-002` — Contratos, ownership y dirección de dependencias

**Contexto.** COMPAT define cinco contratos conceptuales pero no su coordinación ni ownership (`docs/tusenda84/reportes/TS84-PROMO-COMPAT-0001-especificacion-compatibilidad.md:222-315`).

**Decisión.** Adoptar arquitectura ports-and-adapters: el dominio Promo define `PromoTenantContext`, `PromoSiteProfile`, puertos de publicación, i18n, tema, CTA y transversales; los adaptadores implementan esos puertos. Dependencias apuntan hacia los contratos Promo. Master posee bindings, catálogo global de temas, clasificación/estado, suspensión y controles globales; Admin Promo posee borradores y selección/configuración permitida; el coordinador de publicación es la única frontera que transforma una candidata privada válida en revisión pública. El backend, no el menú, aplica tenant/capacidad/permiso.

**Alternativas consideradas.** (a) exponer records PocketBase completos al shell; rechazada por fuga y acoplamiento. (b) librería “shared” con tipos Commerce+Promo; rechazada si amplía el contrato público o introduce side effects. (c) llamadas del shell directamente a fuentes actuales; rechazadas salvo adaptador aprobado y tenant-scoped.

**Consecuencias.** DATA-DES podrá elegir persistencia sin cambiar las obligaciones semánticas. Los adaptadores son reemplazables y auditables. No se autorizan nuevos endpoints ni nombres de colecciones.

### 8.3 `ARC-ADR-003` — Revisión inmutable y ciclo draft/preview/publish/rollback

**Contexto.** El público debe leer exclusivamente una revisión publicada coherente; cambios incompletos no pueden filtrarse (`docs/tusenda84/reportes/TS84-PROMO-COMPAT-0001-especificacion-compatibilidad.md:267-282`, `docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md:548-568`).

**Decisión.** Separar cuatro conceptos:

1. **Draft workspace:** mutable, privado, tenant-scoped; puede estar incompleto y nunca es fuente pública.
2. **Candidate revision:** snapshot inmutable derivado del draft, con contenido, secciones, locales, tema+versión+tokens, CTA, medios, SEO y política de adaptadores coherentes. Es la unidad de preview y validación.
3. **Published revision:** candidata aprobada a la que apunta una única referencia pública por sitio. La promoción usa compare-and-swap o garantía atómica equivalente para evitar lost updates. Una publicación fallida deja visible la revisión anterior.
4. **Rollback:** cambio auditado del puntero a una revisión inmutable anterior todavía compatible; no edita ni borra el contenido actual y conserva el draft.

**Alternativas consideradas.** (a) flags `published` por fila/sección; rechazada porque permite mezcla temporal. (b) leer “últimos” registros por timestamp; rechazada por incoherencia y carreras. (c) sobrescribir el snapshot publicado; rechazada porque impide rollback exacto. (d) copiar todo a una tabla final concreta; no decidido: pertenece a DATA-DES.

**Consecuencias.** El almacenamiento deberá soportar identidad inmutable, promoción atómica, historial/retención y concurrencia, pero este ADR no diseña su esquema. Rating o Landing QR, si producto los habilita, serán adjuntos read-only expresamente declarados por la revisión; nunca aportan authoring data ni cambian el tenant. La publicación registra conceptualmente tenant, revisión, hash/integridad, tema/versión, locales, canonical, actor, fecha, motivo, resultado y referencia de rollback.

### 8.4 `ARC-ADR-004` — Host, proxy confiable, bindings, separación de superficies y caché

**Contexto.** COMPAT fija precedencia y fallo cerrado, pero deja a ARC la política exacta IDN, rutas rechazadas y fallback (`docs/tusenda84/reportes/TS84-PROMO-COMPAT-0001-especificacion-compatibilidad.md:244-265`, `docs/tusenda84/reportes/TS84-PROMO-COMPAT-0001-especificacion-compatibilidad.md:316-353`).

**Decisión.** Aplicar el contrato detallado de la sección 12:

- el ingress confiable debe sobrescribir, no anexar, un único `X-Forwarded-Host`;
- un peer no confiable hace que XFH se ignore; un peer confiable con XFH múltiple, repetido, vacío, contradictorio o separado por coma se rechaza;
- hostname personalizado se transforma a A-label ASCII mediante UTS #46 no transicional con reglas STD3, se valida como DNS, se pasa a minúsculas y se elimina puerto/punto final solo mediante parser; IP literal, wildcard, userinfo, path, query, fragmento o valor malformado no resuelven Promo;
- la coincidencia es exacta contra un binding local único, activo, verificado y Master-owned; no hay `contains`, suffix matching o fallback;
- `Forwarded`, `Origin`, `Referer`, SNI, slug y query no determinan tenancy;
- host no resoluble responde genéricamente `421 Misdirected Request`, `no-store`, sin enumeración; en un custom host resuelto, una ruta privada/Commerce no servible responde `404` genérico, sin redirect automático;
- un único dominio primario se fija explícitamente en el estado publicado; alias verificados pueden redirigir al primario usando destino construido desde binding, nunca desde un header libre;
- Admin/Master/API/preview permanecen bajo hosts Tu Senda 84.

**Alternativas consideradas.** (a) confiar siempre XFH; rechazada por spoofing. (b) usar primer/último elemento de listas; rechazada por ambigüedad. (c) consultar DNS/Cloudflare por request; rechazada por seguridad, latencia y disponibilidad. (d) redirect de rutas privadas desde custom host; rechazado como default porque amplía superficie y puede filtrar contexto. (e) fallback a tienda predeterminada; prohibido.

**Consecuencias.** La topología debe declarar peers confiables server-side; sus rangos no pertenecen a este documento. El mapping Cloudflare/DNS/TLS/ingress se sincronizará en prompts posteriores y separados. La UX/copy genérica puede refinarse con aprobación, pero no puede revelar binding ni reemplazar el fallo cerrado. No se define automatización Cloudflare.

### 8.5 `ARC-ADR-005` — i18n por locales publicados y URLs estables

**Contexto.** El español fijo actual no es arquitectura i18n reutilizable (`docs/tusenda84/reportes/TS84-PROMO-COMPAT-0001-especificacion-compatibilidad.md:392-403`).

**Decisión.** Cada revisión fija un locale predeterminado y un conjunto finito de locales publicados, canonicalizados como tags BCP 47. Cada representación indexable tendrá identidad URL estable y explícita por locale; la sintaxis ejecutable se definirá después. En una entrada neutral, la negociación será: (1) locale explícito en URL; (2) preferencia explícita persistida; (3) mejor coincidencia exacta y luego por idioma de `Accept-Language`; (4) locale predeterminado publicado. URL explícita válida siempre gana y no se altera por cookie/header. Locale explícito inexistente devuelve estado no indexable, no una página mezclada.

La publicación requiere 100 % de strings de sistema obligatorios y campos de contenido obligatorios para cada locale anunciado. Un campo opcional ausente se omite; no se mezcla silenciosamente desde otro idioma. Preview puede mostrar fallback diagnóstico al locale predeterminado con indicador visible, pero esa candidata no se publica hasta completar o retirar el locale. `lang`, labels accesibles, alt, CTA, formatos y SEO usan el locale efectivo.

**Alternativas consideradas.** (a) cookie-only; rechazada por SEO/caché. (b) `Accept-Language` en toda request; rechazado para URLs canonical porque fragmenta caché. (c) fallback público por campo al español; rechazado por mezcla silenciosa. (d) traducir Commerce actual; fuera de alcance y prohibido.

**Consecuencias.** La entrada neutral puede variar solo para seleccionar/redirectar y no debe ser la representación canonical cacheada. Las páginas localized exponen `hreflang` recíproco y `x-default` a la entrada neutral o locale predeterminado según la decisión SEO aprobada. Los locales iniciales concretos de Aladdin y su default requieren producto/Kraken.

### 8.6 `ARC-ADR-006` — Registry de temas versionado, seguro y sin código arbitrario

**Contexto.** El primer modelo es Aladdin negro/dorado y la arquitectura debe admitir varios temas desde v1, pero solo aprobados (`docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md:397-416`).

**Decisión.** `PromoThemeRegistry` es un catálogo de build/plataforma controlado por Master. Cada versión inmutable contiene ID estable, versión semántica, estado (`draft`, `approved`, `deprecated`, `retired` o equivalente), renderer empaquetado, assets conocidos, schema cerrado de tokens/variantes, compatibilidad de secciones, migraciones declarativas de configuración si fueran necesarias y requisitos A11Y/performance. El tenant solo selecciona ID+versión aprobados y valores validados.

Se reserva la entrada conceptual `promo.aladdin.black-gold`; su primera versión publicable será `1.0.0` después de fijar el activo visual y pasar validación. La paleta usa tokens semánticos —superficie, texto, acento, borde, foco y estados—, no colores insertados libremente en componentes. Ninguna entrada acepta CSS, JS, HTML, imports dinámicos, handlers, selectores, URLs de scripts/estilos o nombres de componente controlados por usuario.

Una candidata con tema desconocido, retirado incompatible o tokens inválidos no publica. Si una referencia publicada se vuelve inconsistente en runtime, se conserva/recupera la última revisión coherente conocida; si no existe, el sitio falla cerrado. No se sustituye silenciosamente por otro tema. Los artefactos necesarios para revisiones publicadas/rollback no se eliminan al retirar un tema. Cambiar de tema crea candidata nueva y nunca borra contenido.

**Alternativas consideradas.** (a) CSS por tenant; rechazada por XSS, drift y CSP. (b) nombres dinámicos de componentes; rechazados por ejecución/configuración arbitraria. (c) fallback global silencioso; rechazado por incompatibilidad y pérdida de coherencia. (d) un solo tema hardcodeado; rechazado por requisito multi-tema.

**Consecuencias.** Tema y contenido evolucionan por separado pero se validan juntos al publicar. Un tema adicional necesita Prompt ID, mockup y aprobación. El registry conservará versiones retiradas mientras alguna revisión retenida las necesite.

### 8.7 `ARC-ADR-007` — CTA de contacto localizado, configurado y tipado

**Contexto.** El CTA sustituye el bloque eliminado, debe usar i18n general y configuración principal, y no puede confundirse con Landing QR (`docs/tusenda84/reportes/TS84-PROMO-COMPAT-0001-especificacion-compatibilidad.md:284-298`, `docs/tusenda84/reportes/TS84-PROMO-COMPAT-0001-especificacion-compatibilidad.md:405-413`).

**Decisión.** Usar un registry cerrado de tipos de acción con validador y encoder por tipo. La arquitectura admite `whatsapp`, `phone`, `email`, `internal_form` y `approved_live_chat`; que un tipo esté soportado no lo habilita para una tienda. Cualquier tipo futuro requiere entrada allowlisted, revisión de seguridad/privacidad y compatibilidad de tema.

- **WhatsApp:** aceptar número normalizado E.164 y mensaje localizado; construir URL sobre origen aprobado por el adaptador y percent-encodear parámetros. No aceptar una URL completa administrada.
- **Teléfono:** aceptar número E.164; construir `tel:` desde valor canonical. Presentación localizada separada del destino.
- **Email:** validar una dirección simple y construir `mailto:`; subject/body opcionales se codifican por componente, sin HTML.
- **Formulario interno:** usar referencia opaca a un formulario first-party aprobado; requiere CSRF/origin, rate limit, consentimiento, retención y contrato de privacidad antes de habilitarse.
- **Live Chat aprobado:** usar ID de adaptador/proveedor aprobado y configuración pública mínima; scripts/orígenes/CSP, consentimiento y presupuesto deben aprobarse. No se permite pegar snippets.

El label, descripción, mensaje y `aria-label` proceden de i18n/contenido localizado publicado. Un canal inválido se marca no disponible. Solo se usa un secundario si fue configurado expresamente como fallback y también valida; de lo contrario se renderiza estado seguro sin `href` vacío. Horario puede informar disponibilidad, pero no bloqueará contacto por inferencia. Landing QR nunca es fallback automático.

**Alternativas consideradas.** (a) destino URL genérico; rechazado por protocolos peligrosos. (b) concatenación del componente; rechazada por encoding. (c) ocultar CTA inválido sin diagnóstico; aceptable públicamente, pero Admin/preview debe mostrar gate. (d) fallback a Landing QR; prohibido.

**Consecuencias.** El destino público puede ser visible por naturaleza al activar un canal, pero nunca se registra en analítica. Formulario y Live Chat permanecen no habilitables hasta sus aprobaciones específicas. La UI siempre conserva foco, contraste, teclado y nombre accesible.

### 8.8 `ARC-ADR-008` — Puertos/adaptadores transversales y límites público/privado

**Contexto.** Hay capacidades reutilizables solo si se proyectan sin cambiar su fuente (`docs/tusenda84/reportes/TS84-PROMO-COMPAT-0001-especificacion-compatibilidad.md:355-369`).

**Decisión.** Los servicios transversales se consumen por puertos Promo tenant-scoped. Cada adaptador declara fuente, salida mínima, semántica, errores, privacidad y pruebas. Identidad, capacidades/permisos, media, SEO, analítica, auditoría, rating de tienda y enlace Landing QR no se importan como records o módulos amplios. Un fallo opcional omite solo el bloque aprobado; nunca cambia tenant o cae en Commerce. Un fallo en identidad, publicación, tema, locale o CTA obligatorio invalida la candidata o la request.

**Alternativas consideradas.** (a) reutilizar APIs públicas actuales completas; rechazada por DTOs Commerce. (b) duplicar toda capacidad transversal; rechazada cuando un adaptador read-only seguro basta. (c) modificar la fuente para Promo; prohibida sin un prompt/ADR de compatibilidad autorizado.

**Consecuencias.** Cada adaptador tiene gate propio. Rating y Landing QR requieren aprobación de producto para aparecer; su ausencia no invalida la arquitectura. Las fuentes actuales permanecen inmutables.

### 8.9 `ARC-ADR-009` — Seguridad multi-tenant, auditoría y privacidad por defecto

**Contexto.** Host, publicación y adaptadores introducen superficies de spoofing, fuga cross-tenant, XSS y PII (`docs/tusenda84/reportes/TS84-PROMO-COMPAT-0001-especificacion-compatibilidad.md:371-390`).

**Decisión.** Aplicar tenant explícito desde resolver hasta consulta, caché, SEO, analítica y auditoría; backend enforce tenant+capacidad+permiso en toda escritura. El contrato público es una allowlist, no un filtro de un record privado. Preview/Admin/API usan auth central, `private, no-store` y anti-indexación. CSP parte de `default-src 'self'`, sin `unsafe-eval`, objetos ni scripts remotos; cualquier excepción aprobada se añade por adaptador cerrado. Contenido se renderiza como texto/datos tipados, no HTML libre.

Auditar, con before/after saneado cuando aplique: creación de candidata, intento/resultado de publicación, rollback, cambio de binding/canonical, suspensión, selección/versionado de tema, locales, CTA, cuotas y soporte Master. No registrar tokens, secretos, texto de mensajes, teléfono/email del visitante, payload de formularios ni records completos. Analítica pública usa eventos allowlisted y agregables, separados de auditoría/seguridad.

**Alternativas consideradas.** (a) confiar en gates UI; rechazada. (b) filtros/expands controlados por cliente; rechazados. (c) logs completos “para depurar”; rechazados por privacidad/secreto. (d) CSP abierta para temas/chat; rechazada.

**Consecuencias.** Soporte Master requiere contexto explícito y trazabilidad. Formularios o proveedores externos necesitarán threat model/privacidad antes de habilitarse. Un rechazo público revela solo clase genérica; el detalle vive en observabilidad privada saneada.

### 8.10 `ARC-ADR-010` — Medios, SEO y presupuestos de rendimiento

**Contexto.** Promo es visual, localized e indexable, pero debe mantener SSR ligero, seguridad y performance-first (`docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md:455-473`).

**Decisión.** Medios públicos se entregan por referencia tenant-scoped y propósito allowlisted. Para upload v1 se admiten raster detectados por contenido (`JPEG`, `PNG`, `WebP`, `AVIF`) y video aprobado (`MP4`/`WebM`) con poster; SVG/HTML, embeds y archivos remotos arbitrarios se rechazan. Assets SVG empaquetados dentro de un tema aprobado son código de plataforma, no contenido tenant. El pipeline valida MIME real, dimensiones, peso, ownership, metadata y estado; elimina metadata innecesaria/EXIF; genera variantes responsivas; exige alt localizado o marca decorativa explícita. La decisión de reutilizar `store_visual_items` queda para DATA-DES y no cambia su contrato actual.

SEO deriva exclusivamente de `PromoTenantContext` y revisión publicada: canonical en dominio primario verificado, URL estable por locale, `hreflang` recíproco, `x-default`, OG/Twitter localized y sitemap solo de representaciones publicadas. Preview, host rechazado, alias antes de canonicalizar y estados suspendidos son `noindex` y no entran en sitemap. No hay metadata `Product`, precio, disponibilidad, compra o checkout. Rating estructurado solo podrá ser de tienda y tras aprobación.

Presupuestos máximos que PERF deberá verificar por representación pública inicial, medidos como transferencia comprimida y sin interacción:

| Presupuesto | Máximo/objetivo |
|---|---:|
| HTML SSR | 80 KiB |
| CSS total de shell+tema | 50 KiB |
| JavaScript inicial | 75 KiB |
| Fuentes first-party iniciales | 160 KiB |
| Hero/LCP móvil | 300 KiB |
| Hero/LCP desktop | 450 KiB |
| Transferencia inicial móvil, sin video | 650 KiB |
| Transferencia inicial desktop, sin video | 900 KiB |
| Requests antes de interacción | 20 |
| Imágenes eager | 1 (Hero/LCP) |
| Bytes de video antes de interacción/near-viewport | 0, excepto poster |
| LCP p75 objetivo | ≤ 2.5 s |
| INP p75 objetivo | ≤ 200 ms |
| CLS p75 objetivo | ≤ 0.10 |

La galería y secciones fuera de viewport cargan progresivamente; analítica es no bloqueante; video nunca autoplay con sonido y respeta ahorro de datos/movimiento reducido. No se incluyen scripts third-party en v1; Live Chat aprobado consume un presupuesto separado y no puede degradar estos gates sin aprobación.

**Alternativas consideradas.** (a) uploads SVG; rechazados en v1 por superficie activa. (b) video eager/autoplay; rechazado. (c) canonical desde header request; rechazado por poisoning. (d) caché pública de preview; rechazada.

**Consecuencias.** Quotas editoriales por plan y tamaños máximos de upload se decidirán en DATA-DES/producto, siempre por debajo de límites de seguridad/plataforma. Un tema no puede aprobarse si excede los presupuestos sin excepción explícita.

### 8.11 `ARC-ADR-011` — Gates de compatibilidad y gobierno de cambios

**Contexto.** COMPAT es un contrato de no regresión, no una sugerencia. El mapa exige detener cualquier excepción sobre procesos existentes (`docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md:79-96`).

**Decisión.** Todo prompt futuro declara superficies protegidas, grafo esperado, contrato público/privado, tenant enforcement, pruebas focales y regresiones antes/después. Si requiere tocar una `IMM-*`, se detiene y solicita aprobación específica con ADR de compatibilidad, justificación y evidencia de equivalencia. Un cambio compartido autorizado debe ser estrictamente aditivo y conservar defaults/resultados existentes. Ningún gate UI sustituye backend. No se aceptará responsive sin `MOB-VIS`; no se conectará infraestructura real antes de sus prompts/autorizaciones.

**Alternativas consideradas.** (a) revisión de regresión al final del programa; rechazada porque detecta incompatibilidad tarde. (b) aprobar por ausencia visual de regresiones; rechazada porque bundle, red, datos y permisos también son contrato. (c) marcar ARC como autorización de implementación; rechazado.

**Consecuencias.** La aprobación de ARC habilita únicamente DATA-DES documental. No habilita migraciones, código, Cloudflare, staging, producción, push, merge ni release.

## 9. Límites de datos públicos, privados y server-only

No son esquemas ni DTO serializados definitivos; son allowlists semánticas.

| Límite | Puede contener | Debe excluir |
|---|---|---|
| Contexto server-only de request | Tenant opaco, binding, host canonical, revisión, locale y tema efectivos, clases de autorización/estado mínimas. | Record `stores` completo, owner, plan, roles, permisos, tokens, secretos, datos Commerce. |
| Revisión privada/candidata | Contenido draft, diagnósticos de completitud, configuración validada, actor, historial, estados editoriales, referencias internas. | Secretos de proveedor en contenido, código arbitrario, datos de otro tenant. |
| Perfil público publicado | Identidad pública, navegación/secciones allowlisted, contenido localized, medios aprobados, tema/version/tokens públicos, CTA compilado, SEO, flags de adjuntos aprobados. | Drafts, versiones descartadas, roles/permisos/plan, owner privado, tokens, verificación de dominio, logs, queries/expands, Commerce. |
| Binding privado Master | Host A-label, tenant, estado, verificación, primary/alias, timestamps/actor y referencia de operación saneada. | Token Cloudflare, credenciales DNS/TLS, datos públicos innecesarios. |
| Registry de temas | Manifest y artefactos aprobados, schema, compatibilidad, estado/versiones, requisitos A11Y/perf. | Configuración executable de tenant, imports/URLs controlados por usuario. |
| Acción CTA pública | Tipo, label/aria localized, destino compilado cuando el canal lo requiere, comportamiento seguro. | Configuración cruda, secrets, snippets, protocolos no allowlisted, fallback improvisado. |
| Analítica Promo | Tenant opaco, revisión, locale, tema, evento allowlisted, tipo de acción, timestamp/cohorte no identificante. | Teléfono, email, mensaje, URL completa/query, formulario, precio/producto/pedido, PII innecesaria. |
| Auditoría privada | Actor, tenant, acción/recurso, before/after saneado, resultado, correlación y razón. | Secretos, tokens, payloads de contacto, PII no necesaria, acceso público. |

Un teléfono o email publicado como canal es dato público del negocio, no secreto; aun así se excluye de eventos y logs de interacción. Cualquier dato de persona visitante capturado por formulario pertenece a un contrato posterior de privacidad/retención y no a `PromoSiteProfile`.

## 10. Ciclo draft, preview, publish y rollback

### 10.1 Máquina conceptual

```text
DRAFT (mutable, privado)
   |
   | snapshot + validación estructural
   v
CANDIDATE (inmutable, preview privado, no-store/noindex)
   |
   | validación integral + autorización + compare-and-swap
   v
PUBLISHED REVISION (inmutable, una referencia activa)
   |
   +-----------------------+
   | nueva candidata       | rollback auditado
   v                       v
NEXT PUBLISHED        PRIOR PUBLISHED

Un fallo antes/durante publish deja visible PRIOR PUBLISHED.
```

### 10.2 Gates de candidata

Antes de promover, el coordinador debe comprobar como una unidad:

1. tenant inequívoco, activo, autorizado como Promo y capacidad/permiso backend;
2. versión base no obsoleta y ausencia de conflicto concurrente;
3. secciones y orden compatibles con el tema seleccionado;
4. tema ID+versión aprobado, retenido y tokens válidos;
5. locale predeterminado incluido y todos los locales anunciados completos;
6. CTA principal/secundarios válidos o estado explícito sin contacto, según decisión de producto;
7. medios tenant-owned, procesados, seguros, con propósito y alt/decoration válidos;
8. canonical/domain config coherente; publicar revisión puede permitirse sin dominio activo, pero el custom host seguirá cerrado;
9. SEO localized consistente y libre de semántica Commerce;
10. adaptadores opcionales explícitamente habilitados y autorizados;
11. límites A11Y, seguridad, contenido y rendimiento;
12. registro de actor, motivo y resultado saneado.

### 10.3 Preview

- Usa exactamente una candidata inmutable, no una lectura “en vivo” de muchas filas draft.
- Se sirve bajo Tu Senda 84 con auth o grant de review opaco, acotado y revocable; la audiencia exacta requiere aprobación.
- Devuelve `private, no-store`, `noindex, nofollow, noarchive`, sin sitemap, canonical público ni caché compartida.
- Puede mostrar diagnósticos de traducción, media, tema y CTA que nunca aparecen en público.
- Desktop y móvil pueden previsualizarse, pero la herramienta no sustituye el mockup móvil aprobado ni cierra RESP.

### 10.4 Publish

- La candidata validada no cambia durante la operación.
- Se registra la revisión y se conmuta una única referencia pública de manera atómica/serializable o equivalente.
- El cambio exige invalidación por generación. Publicación no se marca exitosa hasta que la capa de caché aplicable reconoce la nueva generación.
- Si una capa de caché no puede incluir revisión en la key ni confirmar invalidación, HTML público de esa capa debe permanecer sin caché; no se acepta servir una mezcla.
- La revisión anterior permanece retenida como rollback; la política numérica de retención se define en DATA-DES/OPS.

### 10.5 Rollback y recuperación

- **Contenido/tema/locales/CTA:** puntero atómico a una revisión anterior compatible, con actor/motivo y nueva generación de caché.
- **Tema retirado:** el artefacto se retiene mientras una revisión rollback lo referencie; si fue retirado por vulnerabilidad, el sitio se suspende o se promueve una candidata remediada, nunca se hace fallback visual silencioso.
- **Dominio:** Master puede pausar/retirar el binding de forma independiente; custom host falla cerrado y Admin/Master/preview central permanecen recuperables.
- **Fallo de invalidación:** no declarar éxito; conservar revisión anterior o desactivar caché según el punto atómico diseñado después.
- **Draft:** no se destruye por publish/rollback; una restauración a edición se hace como nuevo draft/candidata, no mutando historial.

## 11. Arquitectura i18n

### 11.1 Modelo publicado

- Locale canonical BCP 47; aliases de entrada se canonicalizan antes de comparar.
- Una revisión fija `default locale` y conjunto de `published locales` no vacío.
- Locales habilitados pero incompletos pueden existir en draft; no se anuncian ni sirven públicamente.
- Catálogo de sistema y contenido de tenant son namespaces separados, resueltos por el mismo motor.
- El español hardcodeado de Commerce permanece sin cambios y fuera del catálogo Promo.

### 11.2 Negociación y fallback

| Prioridad | Señal | Regla |
|---:|---|---|
| 1 | Locale explícito en identidad URL | Si está publicado, es autoritativo; cookie/header no lo cambia. Si es inválido/no publicado, estado genérico no indexable. |
| 2 | Preferencia explícita persistida | Solo en entrada neutral; debe coincidir con locale publicado. |
| 3 | `Accept-Language` | Mejor match publicado exacto y después por idioma, respetando calidad; solo en entrada neutral. |
| 4 | Default publicado | Último fallback de selección de representación. |

No hay fallback público por campo obligatorio. Campos opcionales sin traducción se omiten. Preview puede usar default como diagnóstico visible, nunca como aprobación de completitud. Un error inesperado de catálogo en una revisión ya publicada hace que la revisión sea no servible y active recuperación/última revisión coherente, no mezcla silenciosa.

### 11.3 SEO, caché y accesibilidad i18n

- Cada locale indexable tiene URL estable, canonical propio y `hreflang` recíproco.
- La entrada neutral negocia/redirecta y no compite como duplicado; `x-default` se decide de modo coherente con ella.
- Key de caché incluye locale y nunca usa `Accept-Language` para variar una URL ya localized.
- `html[lang]`, nombre accesible, navegación, errores, CTA, alt y formatos usan el mismo locale efectivo.
- El selector genera destinos desde el mapa publicado, no concatena input del cliente.
- Sin JavaScript, los enlaces localized y la negociación server-side siguen funcionando.

## 12. Host, dominio, bindings y caché

### 12.1 Precedencia y canonicalización

1. Determinar si el peer inmediato pertenece a la configuración server-only de proxies confiables.
2. Peer no confiable: ignorar XFH para tenancy y evaluar un solo `Host`.
3. Peer confiable: aceptar solo un XFH sobrescrito, único y sin lista; si falta, evaluar `Host`; si es ambiguo/duplicado/inválido, rechazar sin fallback.
4. Parsear autoridad, separar puerto por parser y rechazar control chars, whitespace, userinfo, path/query/fragment.
5. Retirar un único punto DNS final; transformar IDN a A-label con UTS #46 no transicional/STD3; lower-case y validar límites DNS.
6. IP literal y wildcard no son custom domain Promo.
7. Comparar primero con allowlist de hosts plataforma; si coincide, continuar flujo actual.
8. Para custom domain, lookup exacto de una sola clave A-label. Exigir binding único, activo y verificado; tenant activo/Promo y revisión válida.
9. Construir contexto mínimo una sola vez y propagarlo; no aceptar tenant/slug/storeId alternativo de URL o cliente.

### 12.2 Estados y respuesta

| Estado | Resultado |
|---|---|
| Host plataforma reconocido | Routing actual intacto; no entra al shell Promo por inferencia. |
| Binding exacto+activo+verificado, tenant Promo activo, revisión válida | Contexto Promo y shell público. |
| Host malformado/desconocido/duplicado | `421` genérico, `no-store`, sin fallback/enumeración. |
| Binding pendiente/pausado/revocado/no verificado | `421` genérico, `no-store`. |
| Tenant inactivo/suspendido/no Promo o sin revisión | `421` genérico, `no-store`. |
| Custom host válido + ruta Admin/Master/API/Commerce | `404` genérico, `no-store`, sin redirect por defecto. |
| Alias verificado y activo | Redirect al primary configurado, construido desde binding y path público allowlisted. |

La copia de error no revela si existe tenant, binding o suspensión. El detalle de razón solo se registra en telemetría privada saneada. Producto puede aprobar copy distinta, pero no una respuesta que caiga a Commerce u otro tenant.

### 12.3 Ownership de dominio

- Master solicita, verifica, activa, pausa y retira bindings; Admin Promo solo observa estado necesario.
- Un sitio tiene un primary explícito y cero o más aliases verificados. No se infiere apex frente a `www`.
- El resolver consume estado local; Cloudflare, DNS, TLS e ingress se sincronizan fuera del request.
- Tokens/proveedor son server/infra-only y nunca pertenecen a binding público o PocketBase legible.
- Esta arquitectura no define automatización, scopes de token, DNS ni comandos Cloudflare/Coolify.

### 12.4 Caché

Key lógica mínima de HTML/datos: `canonical-host + tenant + published-revision + locale + theme-version + public-path + representation/encoding`. No se comparte respuesta entre aliases, hosts, tenants o revisiones aunque el contenido coincida. Canonical/OG se derivan del contexto, no del key aportado por el cliente.

- Draft, preview, Admin, Master, API privada, errores de host y estados suspendidos: `private/no-store` según superficie; nunca caché pública.
- HTML público: cacheable solo donde la key incluya la generación/revisión efectiva y haya invalidación verificable; de lo contrario `no-store` o TTL conservador aprobado que no se use para cerrar publish.
- Assets de tema/revisión: content-addressed, inmutables y con TTL largo; nunca se sobrescribe un URL inmutable.
- Publish/rollback: nueva generación y purge/retirada de entradas del host+tenant anterior.
- Cambio/retirada de binding: invalidación por host y fallo cerrado inmediato en origen.
- No hay llamadas Cloudflare desde resolver/render. `TS84-PROMO-DOM-CF-0001` definirá la integración server-only sin alterar este contrato.

## 13. Registry de temas y entrada Aladdin

### 13.1 Manifest conceptual obligatorio

| Categoría | Obligación |
|---|---|
| Identidad | ID estable y versión semántica inmutable. |
| Estado | Draft/approved/deprecated/retired y disponibilidad controlada por Master. |
| Renderer | Código empaquetado de plataforma; ninguna ruta/import de tenant. |
| Tokens | Schema cerrado, tipos/rangos/enums, defaults seguros y combinaciones permitidas. |
| Secciones | Tipos/variantes compatibles, requisitos de contenido y comportamiento al faltar opcionales. |
| Assets | First-party, versionados/content-addressed, licencias/procedencia y presupuestos. |
| A11Y | Contraste, foco, landmarks, target táctil, zoom y reduced motion verificables. |
| Performance | CSS/JS/assets dentro de ADR-010. |
| Compatibilidad | Versiones de contrato soportadas y estrategia explícita de upgrade/rollback. |

### 13.2 Entrada conceptual inicial

| Campo conceptual | Valor |
|---|---|
| ID reservado | `promo.aladdin.black-gold` |
| Primera versión publicable prevista | `1.0.0`, sujeta a activo visual y aprobación |
| Tienda de referencia | Aladdin's Carpet |
| Apariencia | Fondo predominantemente negro; acentos dorados; estética elegante/premium |
| Conversión | Contacto/estimado, no compra |
| Secciones base | Hero, servicios sin precios, trabajos/galería, propietario, rating opcional, contacto y footer |
| Corrección obligatoria | Sin bloque “Escanéame para contactarme”; CTA tipado/localized |
| Gate móvil | `TS84-PROMO-MOB-VIS-0001` aprobado antes de RESP |

La entrada es conceptual: no crea manifest, CSS, componente ni asset. El activo desktop exacto, criterios visuales medibles y mockup móvil requieren aprobación. Los tokens tenant podrán elegir solo valores/rangos aprobados; “dorado” no habilita un color libre que rompa contraste.

## 14. CTA de contacto

### 14.1 Contrato conceptual

| Campo semántico | Regla |
|---|---|
| Estado | Enabled/disabled explícito; no se infiere por presencia parcial. |
| Tipo | ID allowlisted con validador/encoder registrado. |
| Label/aria | Clave del catálogo o contenido localized validado; nunca texto fijo del componente. |
| Destino | Valor canonical tipado, no URL genérica; compilado server-side o por utilidad pura aprobada. |
| Mensaje | Localized, longitud limitada y percent-encoded para el canal. |
| Disponibilidad | Estado informativo configurado; un fallback secundario debe ser explícito. |
| Analítica | Evento de activación+tipo; sin destino, mensaje o PII. |
| Error | Sin enlace activo, sin protocolo improvisado y sin fallback a otra tienda/Landing QR. |

### 14.2 Matriz de acciones

| Tipo | Entrada conceptual | Salida permitida | Fallo seguro |
|---|---|---|---|
| WhatsApp | E.164 + mensaje localized opcional | URL construida sobre origen aprobado y parámetros encoded | Número/mensaje inválido: canal no disponible. |
| Teléfono | E.164 | `tel:` canonical | No se emite `href` con texto crudo. |
| Email | Dirección validada + subject/body localized opcionales | `mailto:` con componentes encoded | Dirección inválida: canal no disponible. |
| Formulario interno | ID opaco first-party aprobado | Navegación/acción same-origin definida por contrato futuro | Deshabilitado hasta privacidad, CSRF/origin, rate limit y retención. |
| Live Chat aprobado | ID de adaptador aprobado | Inicialización controlada por plataforma | Sin adapter/CSP/consentimiento aprobado: deshabilitado. |

Se bloquean `javascript:`, `data:`, HTML libre, snippets, generic URL, concatenación sin encoding, redirect controlado por usuario e imports externos. Otros tipos se añaden al registry mediante ADR/prompt; no existe `other` ejecutable.

## 15. Matriz de adaptadores transversales

| Puerto Promo | Owner/fuente | Salida allowlisted | Fallo y límites |
|---|---|---|---|
| Identidad pública | `stores` vía adaptador por ID ya autorizado | Nombre/marca, slug solo cuando proceda, logo/identidad pública mínima. | Nunca resolver tenant por slug ni exponer record/owner/plan. |
| Capacidades/permisos | Modelo actual + namespace Promo futuro | Decisión backend para editar/publicar/usar cuota. | Key desconocida falla cerrada; no reutilizar key Commerce ni cambiar planes. |
| Media | Pipeline/almacenamiento adaptado | URL/referencia procesada, propósito, variantes, dimensiones, alt localized. | Tenant mismatch, MIME/peso/estado inválido bloquea candidata; fuente final en DATA-DES. |
| SEO | Utilidades puras/proyección nueva | Canonical/OG/Twitter/hreflang/sitemap desde contexto publicado. | Sin host libre, producto/precio/stock o preview indexable. |
| Analítica | Pipeline actual adaptado con vocabulario Promo | Page/section/contact activation y dimensiones no PII. | Sin destino/mensaje/contacto, Commerce o cross-tenant; raw privado. |
| Auditoría | Actividad actual adaptada | Acción/recurso Promo, actor, tenant, before/after saneado, resultado. | No público, no secrets/PII; no cambiar eventos existentes. |
| Seguridad | Contexto/telemetría existentes | Enforcement/observabilidad con tenant explícito y clase saneada. | No usa `publicSecurity` como resolver de dominio ni confía XFH fuera boundary. |
| Rating de tienda | Resumen/lista moderada de tienda | Aggregate y reseñas de tienda aprobadas. | Solo si producto aprueba; sin producto/orden/“compra verificada” inferida. |
| Landing QR | Capacidad/rutas actuales | Enlace explícito bajo Tu Senda 84, si producto aprueba. | No modificar contrato/gate/analítica, no CTA fallback, no bloque redundante. |

El shell no conoce la fuente concreta. Todo puerto recibe tenant desde `PromoTenantContext`; ningún argumento del cliente puede sustituirlo. Un adaptador opcional no disponible omite su bloque según configuración publicada, sin degradar a Commerce.

## 16. Seguridad, aislamiento, auditoría y privacidad

### 16.1 Invariantes de enforcement

1. Resolver tenant una vez, de host verificado, y fijarlo inmutable durante request.
2. Toda query/evento/caché recibe ese tenant; no acepta `storeId` alternativo sin cotejo server-side.
3. Público obtiene allowlist publicada; filtros, sorts, expands y realtime arbitrarios no forman parte del contrato.
4. Escrituras Admin/Master validan sesión, tenant, capacidad y permiso en backend.
5. Admin/Master/API actuales no se sirven en custom host; custom host no autentica sesiones administrativas.
6. Preview/candidata no entra en cache, sitemap, canonical ni respuesta pública.
7. Tema, CTA y contenido no ejecutan código tenant; sanitización y CSP son defensa adicional, no sustituto del modelo tipado.
8. Suspensión de tenant o binding invalida serving público; no cambia acceso central autorizado para recuperación.
9. Ningún error prueba otro tenant, slug o default store.
10. Cloudflare/Coolify/DNS no participan en la resolución de cada request.

### 16.2 Eventos conceptuales

Analítica pública inicial queda limitada a familias `promo_page_view`, `promo_section_view` y `promo_contact_activate` o equivalentes versionados. Campos permitidos: tenant opaco, revisión, locale, tema, sección/tipo allowlisted, timestamp y dimensiones técnicas no identificantes. Se excluyen teléfono, email, mensaje, URL/query completa, formulario, producto, precio, carrito, orden e IP cruda como dimensión analítica.

Auditoría privada cubre acciones de edición/publicación/rollback/binding/tema/locale/CTA y soporte; seguridad/operaciones cubre rechazos de host y anomalías. Los tres flujos no se mezclan y mantienen retención/acceso propios. Cualquier captura de lead futura requiere contrato separado de consentimiento, minimización, retención, acceso y borrado.

### 16.3 Medios y contenido activo

- Texto se renderiza escapado; rich text solo podría incorporarse con schema/sanitizador allowlisted en un ADR posterior.
- Upload SVG/HTML y embeds arbitrarios quedan fuera de v1.
- URLs de media se generan desde referencias aprobadas; no se aceptan schemes/hosts aportados libremente.
- Video usa poster, controles, muted si existiera reproducción automática visual aprobada, nunca autoplay con sonido.
- EXIF/metadata innecesaria se elimina; alt se localiza; contenido decorativo se marca explícitamente.

## 17. SEO y rating de tienda

### 17.1 SEO

- Canonical nace del primary binding verificado guardado en la revisión/configuración publicada, no del `Host` sin validar.
- Cada locale publicado genera canonical localized y `hreflang` recíproco; aliases redirigen antes de indexar.
- Preview/errores/suspensión/Admin/Master/API son noindex y quedan fuera de sitemap.
- OG/Twitter usan identidad, texto localizado y media aprobada de la revisión.
- No se emite `Product`, `Offer`, precio, moneda, stock, disponibilidad, checkout ni señal de Commerce.
- Structured data de negocio local puede diseñarse en SEO solo con campos públicos allowlisted y decisión de producto; no se especifica payload aquí.

### 17.2 Rating

Rating es un adjunto opcional, no un núcleo de publicación. Si Kraken aprueba incluirlo, la revisión habilita el puerto y el adaptador obtiene únicamente resumen/reseñas moderadas de tienda para el tenant ya resuelto. No se reutiliza rating de producto ni verificación por orden, no se cambia creación/moderación actual y no se afirma “compra verificada”. Un fallo del adaptador oculta el bloque sin afectar tenant, CTA o revisión; no publica datos crudos.

## 18. Gates de arquitectura

| Gate | Condición de paso | Bloquea |
|---|---|---|
| `G-ARC-APPROVAL` | Kraken aprueba estos ADRs y decisiones técnicas. | DATA-DES. |
| `G-COMPAT` | Ningún `INV-*`/`IMM-*` se debilita; cualquier excepción autorizada tiene ADR y regresión. | Todo prompt que toque superficie compartida. |
| `G-DATA-DES` | Diseño posterior demuestra atomicidad, aislamiento, retención y rollback sin migrar. | DATA. |
| `G-PUBLICATION` | Pública lee una sola revisión; preview/draft ausentes de respuestas/cache. | PUBLISH/SHELL. |
| `G-HOST` | Matriz Host/XFH/IDN/binding/fallo cerrado y separación de hosts pasa. | DOM-CORE/SHELL. |
| `G-I18N` | Locales publicados completos, negociación determinista, `lang`/SEO/CTA consistentes. | Publicación de cada locale. |
| `G-THEME` | ID+versión approved, tokens/secciones/A11Y/perf válidos; sin código arbitrario. | Publicación/cambio de tema. |
| `G-CTA` | Tipo/destino/encoding/i18n/A11Y válidos; analítica sin PII; fallback explícito. | CTA activo. |
| `G-ADAPTER` | Tenant explícito, proyección mínima, fuente inmutable, pruebas negativas. | Uso de cada adaptador. |
| `G-PRIVACY` | Minimización, acceso/retención/consentimiento aprobados donde exista captura. | Formulario/Live Chat/captura de leads. |
| `G-MEDIA-PERF` | MIME/ownership/alt/variantes seguros y presupuestos ADR-010. | Publicación visual/perf. |
| `G-SEO` | Canonical/locale/host verificados; preview noindex; sin señales Commerce. | Indexación. |
| `G-MOB-VIS` | Mockup móvil de Aladdin aprobado. | Cierre de `TS84-PROMO-RESP-0001`. |
| `G-REGRESSION` | Suites existentes y pruebas Promo estáticas/runtime pasan sin cambio observable Commerce. | Cierre de cada implementación. |
| `G-EXTERNAL` | Prompt y autorización humana específicos. | Cloudflare/Coolify/staging/dominio real/producción. |

## 19. Trazabilidad COMPAT → ADR/gate

### 19.1 Invariantes

| COMPAT | Decisión que lo satisface | Gate |
|---|---|---|
| `INV-01` | ADR-006 reserva Aladdin negro/dorado como primera entrada conceptual. | `G-THEME`, `G-ARC-APPROVAL` |
| `INV-02` | ADR-007 reemplaza el bloque por CTA localized/configurado. | `G-CTA` |
| `INV-03` | ADR-008 y matriz de adaptadores mantienen Landing QR independiente/intacta. | `G-ADAPTER`, `G-REGRESSION` |
| `INV-04` | ADR-001 excluye precio/moneda/stock/carrito/checkout de DTO, query, bundle y runtime. | `G-COMPAT`, `G-REGRESSION` |
| `INV-05` | ADR-001 prohíbe producto/catálogo/regalos/cupones/shipping/pedidos/rating por orden. | `G-COMPAT`, `G-REGRESSION` |
| `INV-06` | ADR-006 usa registry versionado y schema cerrado sin código arbitrario. | `G-THEME` |
| `INV-07` | ADR-004/ownership reserva dominios a Master y excluye automatización. | `G-HOST`, `G-EXTERNAL` |
| `INV-08` | ADR-004 separa custom public de Admin/Master/API central. | `G-HOST` |
| `INV-09` | ADR-001/011 exige arquitectura aditiva y superficies actuales inmutables. | `G-COMPAT`, `G-REGRESSION` |
| `INV-10` | ADR-006/011 conserva gate móvil. | `G-MOB-VIS` |
| `INV-11` | ADR-001/004 no reemplaza `getCurrentStore` ni fallback por path. | `G-COMPAT`, `G-HOST` |
| `INV-12` | ADR-004 define binding exacto y `421` cerrado para estados inválidos. | `G-HOST` |
| `INV-13` | ADR-004 acepta XFH solo desde peer confiable y valor único. | `G-HOST` |
| `INV-14` | ADR-004 canonicaliza A-label y compara igualdad exacta; sin wildcard/suffix. | `G-HOST` |
| `INV-15` | ADR-004 fija key host+tenant+revision+locale+theme+path/representación. | `G-HOST`, `G-PUBLICATION` |
| `INV-16` | ADR-004 prohíbe Cloudflare/DNS en request. | `G-HOST`, `G-EXTERNAL` |
| `INV-17` | ADR-002/008 y límites de datos exponen proyección mínima. | `G-ADAPTER`, `G-PRIVACY` |
| `INV-18` | ADR-005 crea i18n Promo aislado y deja español Commerce intacto. | `G-I18N`, `G-COMPAT` |
| `INV-19` | ADR-002/009 exige backend tenant+capacidad+permiso y auditoría saneada. | `G-PRIVACY`, `G-REGRESSION` |
| `INV-20` | Sección 20 registra decisiones de producto sin defaults implícitos. | `G-ARC-APPROVAL` y gate específico |

### 19.2 Criterios de aceptación

| COMPAT | Evidencia arquitectónica exigida | ADR/gate |
|---|---|---|
| `AC-01` | Baseline Commerce antes/después sin cambios observables. | ADR-011 / `G-REGRESSION` |
| `AC-02` | Diff/AST no modifica `IMM-*`; excepción tiene aprobación y equivalencia. | ADR-011 / `G-COMPAT` |
| `AC-03` | Tabla de mayúsculas, puerto, punto final, IDN A-label y malformados. | ADR-004 / `G-HOST` |
| `AC-04` | Casos peer trusted/untrusted y XFH ausente/único/múltiple/spoofed. | ADR-004 / `G-HOST` |
| `AC-05` | Desconocido/duplicado/no verificado/suspendido no sirve otro tenant/Commerce. | ADR-004 / `G-HOST` |
| `AC-06` | Dos tenants×hosts×locales×temas×revisiones sin cruces de cache/datos. | ADR-003/004/009 / `G-PUBLICATION`, `G-HOST` |
| `AC-07` | Custom host rechaza Admin/Master/API; plataforma conserva positivos. | ADR-004 / `G-HOST`, `G-REGRESSION` |
| `AC-08` | AST/bundle sin imports Commerce prohibidos. | ADR-001 / `G-COMPAT` |
| `AC-09` | DOM/SSR/JS/storage/HAR sin precio/stock/carrito/checkout/etc. | ADR-001 / `G-REGRESSION` |
| `AC-10` | Matriz CTA por locale/tipo/invalid/encoding/A11Y y telemetría sin PII. | ADR-007 / `G-CTA` |
| `AC-11` | Tema válido/unknown/retired/tokens inválidos; bundle sin código tenant. | ADR-006 / `G-THEME` |
| `AC-12` | Canonical/OG/hreflang desde contexto; host spoof no controla; sin Product/Offer. | ADR-004/005/010 / `G-SEO` |
| `AC-13` | Eventos allowlisted tenant-scoped, raw privado y auditoría saneada. | ADR-008/009 / `G-PRIVACY`, `G-ADAPTER` |
| `AC-14` | Suites y contratos Landing QR pasan idénticos; CTA separado. | ADR-008/011 / `G-REGRESSION` |
| `AC-15` | Solo rating de tienda autorizado; negativos product/order/verified purchase. | ADR-008 / `G-ADAPTER` |
| `AC-16` | Locale/fallback/completitud/`lang`/formatos/SEO/alt/CTA sin mezcla. | ADR-005 / `G-I18N` |
| `AC-17` | Mockup aprobado + QA desktop/móvil A11Y y sin desborde. | ADR-006/011 / `G-MOB-VIS` |
| `AC-18` | Proveedor externo caído y resolver conserva binding local, cero llamadas. | ADR-004 / `G-HOST` |

## 20. Decisiones que requieren aprobación de producto/Kraken

Estas decisiones no bloquean la especificación arquitectónica. La capacidad afectada permanece no publicable, deshabilitada o en fallo seguro hasta su aprobación.

| ID | Decisión reservada | Recomendación arquitectónica sin inferir aprobación | Gate afectado |
|---|---|---|---|
| `P-01` | Aprobar este catálogo de ADRs. | Aprobar como límite normativo antes de DATA-DES. | `G-ARC-APPROVAL` |
| `P-02` | Activo desktop exacto y criterios visuales de Aladdin. | Fijarlos antes de convertir `promo.aladdin.black-gold@1.0.0` en publicable. | `G-THEME` |
| `P-03` | Mockup móvil de Aladdin. | Ejecutar `MOB-VIS` en su tarea; imprescindible antes de RESP, no de DATA-DES. | `G-MOB-VIS` |
| `P-04` | Locales iniciales y default de Aladdin. | Candidato sugerido: español default + inglés, pero no se publica hasta aprobación/completitud. | `G-I18N` |
| `P-05` | Canales CTA habilitados y modelo editorial de labels/mensajes. | Habilitar solo tipos necesarios; claves del sistema para labels y contenido localized validado para mensajes. | `G-CTA` |
| `P-06` | Formulario interno/Live Chat, consentimiento y retención. | Mantener deshabilitados hasta contratos de privacidad, proveedor, CSP y operación. | `G-PRIVACY` |
| `P-07` | Secciones v1, rating de tienda y enlace Landing QR. | Rating/Landing QR son opcionales y separados; no mostrar por default implícito. | `G-ADAPTER` |
| `P-08` | Modelo comercial, plan/capacidades/cuotas Promo. | No cambiar `free/basic/premium`; DATA-DES/PERM espera decisión explícita. | `G-DATA-DES`, `G-COMPAT` |
| `P-09` | Relación Commerce/Promo en una misma tienda y futuro `hybrid`. | V1 no asume hybrid; cada request resuelve un único modo/shell. | `G-COMPAT`, `G-HOST` |
| `P-10` | Primary apex vs `www`, aliases, copy de error y política de retirada/re-verificación. | Un primary explícito + aliases verificados; mantener `421/404` genéricos hasta decisión de copy. | `G-HOST` |
| `P-11` | Audiencia y mecanismo de preview compartible. | Auth central o grant opaco/revocable; nunca público indexable. | `G-PUBLICATION`, `G-PRIVACY` |
| `P-12` | Quotas editoriales de servicios/galería/video/locales/storage. | Master-owned y plan-gated; defaults deben fallar cerrados hasta decisión. | `G-DATA-DES`, `G-MEDIA-PERF` |
| `P-13` | Retención de revisiones, auditoría, analítica y posibles leads. | Retener lo mínimo operativo/legal; valores exactos en DATA-DES/OPS/privacidad. | `G-PRIVACY`, `G-DATA-DES` |
| `P-14` | Uso de `store_visual_items` o fuente nueva. | DATA-DES debe comparar sin reinterpretar ni modificar el contrato actual. | `G-DATA-DES`, `G-COMPAT` |
| `P-15` | Structured data local y rating en SEO. | Solo negocio/tienda y campos públicos; nunca Product/Offer/order verification. | `G-SEO`, `G-ADAPTER` |

## 21. Riesgos y controles

| Prioridad | Riesgo | Control/ADR | Evidencia futura |
|---|---|---|---|
| Crítica | Host spoofed resuelve tenant incorrecto | ADR-004, XFH trusted-single, A-label exacto, `421`. | Matrices `AC-03..05`. |
| Crítica | Cross-tenant por query/cache/adaptador | Contexto inmutable y key completa; ADR-002/004/009. | `AC-06`, dos+ tenants. |
| Crítica | Publicación mezcla draft/locales/tema/CTA | Snapshot inmutable y puntero atómico; ADR-003. | Pruebas de carreras/fallos/rollback. |
| Alta | Commerce oculto pero presente | Shell/grafo/runtime separados; ADR-001. | AST, bundle, DOM, storage, HAR `AC-08/09`. |
| Alta | Regresión de rutas/defaults/permisos actuales | ADR-011 y `IMM-*`. | Baseline antes/después `AC-01/02`. |
| Alta | Admin/Master/API expuestos en custom host | ADR-004, `404` sin redirect. | Negativos custom + positivos plataforma `AC-07`. |
| Alta | Tema/CTA introduce XSS o navegación peligrosa | Registries cerrados, validators, CSP; ADR-006/007/009. | Inputs hostiles, bundle/payload `AC-10/11`. |
| Alta | Canonical controlado por header/alias no verificado | Contexto+primary binding; ADR-004/010. | SEO spoof matrix `AC-12`. |
| Alta | Caché sirve revisión anterior tras publish | Generation-aware key/invalidation; no-cache si no garantizable. | Fallos de purge y rollback. |
| Media | Mezcla silenciosa de idiomas | Completeness 100 % y sin field fallback público; ADR-005. | `AC-16`. |
| Media | Rating hereda producto/orden | Puerto store-only opcional; ADR-008. | `AC-15`. |
| Media | Landing QR se duplica o convierte en CTA | Adaptador/link opcional separado; ADR-007/008. | `AC-14`. |
| Media | Analytics/contacto captura PII | Vocabulario mínimo y campos prohibidos; ADR-009. | Payload/log inspection `AC-10/13`. |
| Media | Media degrada LCP o ejecuta contenido | Tipos allowlisted, pipeline y presupuestos; ADR-010. | MIME spoof, variantes y PERF. |
| Media | Runtime depende de Cloudflare | Binding local; ADR-004. | Proveedor indisponible `AC-18`. |
| Media | Tema retirado rompe rollback | Retener artefactos referenciados y fail closed. | Matriz de retiro/rollback. |
| Media | Se cierra responsive sin referencia móvil | Gate humano explícito. | `G-MOB-VIS`/`AC-17`. |

## 22. Plan de validación documental y futura

### 22.1 Verificación permitida en ARC

- Confirmar base Git equivalente a `dev` y preservar estado preexistente.
- Leer COMPAT completa como contrato normativo y el mapa maestro completo.
- Contrastar por lectura únicamente rangos versionados necesarios.
- Validar que todas las secciones exigidas están presentes.
- Validar trazabilidad uno-a-uno de `INV-01..20` y `AC-01..18`.
- Comprobar citas locales/rangos, whitespace (`git diff --check`) y archivos modificados.
- No ejecutar builds, suites, aplicaciones, llamadas HTTP ni comprobaciones que alteren estado.

### 22.2 Matriz futura, no ejecutada

| Área | Validación futura mínima |
|---|---|
| Arquitectura | Dependency/AST rule impide imports Commerce en namespace/bundle Promo. |
| Publicación | Concurrencia, candidata incompleta, fallo de validación, promoción atómica, invalidación y rollback exacto. |
| Host | Tabla Host/XFH/trust/IDN/port/dot/malformed/duplicate/status y no enumeración. |
| Tenancy | Dos o más tenants con intentos de storeId/slug/filter/expand/realtime alternativos. |
| Caché | Host×tenant×revision×locale×theme; publish/rollback/binding withdrawal y proveedor caído. |
| i18n | Locale explícito/preference/header/default, completitud, no mix, `lang`, alt, CTA y SEO. |
| Theme | Valid/unknown/retired/incompatible/tokens hostiles, CSP, A11Y y budgets. |
| CTA | Cada tipo permitido, encoding, destinos inválidos/ausentes, secondary explícito, teclado y cero PII. |
| Público/privado | Contract tests/snapshots prueban ausencia de drafts, roles, plan, owner, secrets y campos Commerce. |
| Media | MIME spoof, ownership, dimensiones/peso, EXIF, alt, lazy/eager, poster/video y budgets. |
| SEO | Canonical/alias/locale/hreflang/sitemap/robots/OG y ausencia de Product/Offer. |
| Adaptadores | Identidad, analítica, auditoría, rating y Landing QR con fuente inmutable y tenant explícito. |
| Regresión | Suites baseline listadas por COMPAT más pruebas focales según diff (`docs/tusenda84/reportes/TS84-PROMO-COMPAT-0001-especificacion-compatibilidad.md:454-466`). |
| Responsive | Solo después de mockup móvil: 1440×900, 1280×800, 768×1024, 390×844, 412×915 y estrecho adicional (`docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md:524-546`). |

## 23. Próximo prompt recomendado

Siguiente Prompt ID: **`TS84-PROMO-DATA-DES-0001` — diseño de datos, reglas, índices, rollback y estrategia de migración, exclusivamente documental y sin migrar**.

Condición de inicio: aprobación expresa de `TS84-PROMO-ARC-0001` por Kraken. DATA-DES deberá convertir estos contratos en un diseño persistente propuesto, demostrar aislamiento/atomicidad/rollback y mantener abiertos los asuntos de producto no aprobados. No debe inferir nombres ni defaults desde este documento y no debe crear migraciones.

`TS84-PROMO-MOB-VIS-0001` continúa como trabajo documental/visual independiente y gate obligatorio antes de `TS84-PROMO-RESP-0001`; no sustituye a DATA-DES como siguiente paso del camino crítico (`docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md:281-284`, `docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md:321-330`). **No se inició DATA-DES, MOB-VIS ni implementación.**

## 24. Archivos modificados

- `docs/tusenda84/reportes/TS84-PROMO-ARC-0001-arquitectura-adrs.md` — creado como único entregable de `TS84-PROMO-ARC-0001`.

Estado preexistente preservado: `docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md` ya figuraba no rastreado antes de esta tarea y no fue modificado. COMPAT y AUD no se copiaron al worktree.

## 25. Confirmaciones de no implementación y no infraestructura

- No se implementó código funcional ni se creó prototipo ejecutable.
- No se creó ni modificó ninguna migración.
- No se diseñó esquema PocketBase definitivo, endpoint, ruta ejecutable ni DTO serializado final.
- No se cambiaron rutas, componentes, estilos, contratos ejecutables, colecciones, hooks, permisos, capacidades, planes, Landing QR, ratings, i18n existente, Commerce, Master, Admin, apps ni APKs.
- No se consultó ni modificó PocketBase desplegado, Cloudflare, Coolify, staging o producción.
- No se definió ni ejecutó automatización Cloudflare/DNS/TLS/ingress.
- No se leyeron ni expusieron secretos.
- No se hizo push, merge, despliegue, release ni cambio externo.
- No se inició `TS84-PROMO-DATA-DES-0001`, `TS84-PROMO-MOB-VIS-0001` ni ningún prompt de implementación.
