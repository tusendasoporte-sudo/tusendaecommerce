# TS84-PROMO — Mapa maestro de prompts para Tiendas Promo

## 1. Control del documento

| Campo | Valor |
|---|---|
| Proyecto | Tu Senda 84 / Tiendas Promo |
| Tienda de referencia | Aladdin's Carpet |
| Documento | Mapa maestro de prompts, dependencias, gates y criterios transversales |
| Prompt de planificación | `TS84-PROMO-MAP-0001` |
| Rama prevista | `dev` |
| Fecha | 2026-08-22 |
| Estado | PROPUESTO PARA REVISIÓN Y APROBACIÓN DE KRAKEN |
| Implementación funcional en esta tarea | NO |

Este documento organiza el trabajo necesario para incorporar Tiendas Promo al sistema multi-tienda existente. No autoriza por sí solo migraciones, cambios funcionales, Cloudflare, Coolify, staging, producción, push ni despliegues.

Cada Prompt ID debe ejecutarse en una tarea independiente, respetar sus dependencias y producir un reporte en `docs/tusenda84/reportes/` cuando corresponda.

## 2. Decisiones ya confirmadas

### 2.1 Modelo visual inicial

`TS84-PROMO-VIS-0001` queda registrado como **APROBADO COMO MODELO VISUAL INICIAL** para Aladdin's Carpet.

La referencia aprobada establece:

- fondo predominantemente negro;
- acentos dorados;
- estética elegante y premium;
- navegación superior limpia;
- Hero de alto impacto;
- servicios visuales sin precios;
- trabajos destacados y galería;
- presentación del propietario;
- ratings y reseñas;
- contacto y solicitud de estimado;
- footer completo;
- selector de idioma;
- conversión por contacto, no por compra.

La imagen es una referencia de composición, jerarquía, estilo y experiencia. No debe copiarse píxel por píxel ni convertirse en una constante global para todas las Tiendas Promo.

### 2.2 Corrección visual obligatoria

El bloque equivalente a **“Escanéame para contactarme”** debe eliminarse de la composición final y reemplazarse por un botón premium de contacto.

El botón debe:

- obtener su texto del sistema i18n general;
- reaccionar al locale público activo;
- obtener su acción de la configuración principal de contacto de la tienda;
- admitir WhatsApp, teléfono, formulario interno, Live Chat aprobado u otra acción permitida;
- conservar foco visible, contraste, `aria-label` y navegación por teclado;
- evitar una lógica aislada exclusiva para este CTA;
- no contener números, correos o destinos hardcodeados.

### 2.3 Landing QR

Landing QR permanece en el roadmap y debe reutilizar/adaptar la base existente. Solo se elimina el bloque visual redundante del mockup de Aladdin's Carpet.

### 2.4 Dominios

Decisión confirmada por Kraken:

- los dominios estarán dentro de la cuenta Cloudflare controlada por el Master;
- el Master gestionará alta, verificación, activación, suspensión y retiro;
- el dominio personalizado servirá la experiencia pública;
- el panel Admin Promo y el panel Master permanecerán bajo el dominio central de Tu Senda 84;
- ninguna credencial o token Cloudflare llegará al navegador ni se guardará en datos públicos;
- la activación de un dominio real requerirá una autorización independiente.

### 2.5 Temas desde el inicio

La arquitectura debe admitir múltiples temas desde su primera versión. Solo podrán publicarse temas visualmente aprobados.

El primer tema será Aladdin's Carpet / negro y dorado. Los temas posteriores requerirán mockup y aprobación propios. No se mostrarán presets vacíos, ficticios o no aprobados en producción.

### 2.6 Regla de preservación absoluta de Tu Senda 84

Decisión confirmada por Kraken:

> Tiendas Promo no puede alterar ningún proceso ya implementado de Tu Senda 84.

Esta regla significa:

- no cambiar el comportamiento actual de tiendas Commerce, PowerZona, bazar, catálogo, productos, carrito, checkout, pedidos, precios, inventario, promociones, cupones, regalos, ratings, Landing QR, Rifas, Seguridad, analítica, notificaciones, equipos, planes, APKs, Master o Admin;
- no renombrar ni reutilizar con otra semántica rutas, colecciones, campos, permisos, capacidades o eventos existentes;
- no convertir componentes e-commerce en componentes Promo mediante condicionales invasivos;
- implementar Tiendas Promo de forma aditiva, aislada y protegida por tipo de tienda/capacidad;
- preferir nuevas rutas, componentes, contratos y colecciones Promo, además de adaptadores de solo lectura cuando se reutilicen datos existentes;
- conservar contratos, defaults y resultados actuales para todas las tiendas existentes;
- ejecutar regresiones completas de los procesos existentes antes de cerrar cada bloque que toque una superficie compartida;
- detener el prompt y pedir autorización específica si una necesidad real exige modificar la semántica o el flujo de un proceso existente.

Modificar un archivo compartido solo podrá considerarse si el cambio es estrictamente aditivo, mantiene exactamente el comportamiento anterior por defecto, queda cubierto por regresiones y fue autorizado dentro del Prompt ID correspondiente. Esta excepción técnica no autoriza cambiar ningún proceso existente.

## 3. Objetivo del programa

Incorporar un tipo de presencia pública para negocios orientados a promoción y contacto, con dominio personalizado y control central Master, sin convertir la página en un e-commerce tradicional.

El sistema final debe permitir:

- crear una Tienda Promo dentro del entorno multi-tienda;
- mantener aislamiento estricto por tienda;
- publicar mediante slug de preview y dominio personalizado;
- elegir temas aprobados y personalizarlos dentro de límites seguros;
- administrar contenido, servicios, galería, propietario, reseñas, contacto y footer;
- servir contenido localizado por idioma;
- medir visitas y acciones de contacto sin recopilar PII innecesaria;
- conservar Landing QR;
- suspender o recuperar una tienda desde el Master;
- mantener rendimiento, seguridad, accesibilidad y SEO.

## 4. Límites funcionales

Una Tienda Promo no debe mostrar ni cargar, salvo una futura modalidad híbrida aprobada:

- precios;
- carrito;
- checkout;
- inventario;
- monedas;
- envíos;
- cupones de compra;
- stock;
- scripts o componentes públicos exclusivos de pedidos;
- apariencia de catálogo e-commerce tradicional.

No se deben reutilizar `products`, `orders` o `categories` como atajo para modelar servicios, trabajos o galerías si eso conserva dependencias de precio, stock, carrito o pedidos.

## 5. Inventario preliminar de reutilización

La auditoría `TS84-PROMO-AUD-0001` debe confirmar este inventario antes de implementar.

| Recurso existente | Decisión preliminar | Adaptación esperada |
|---|---|---|
| `stores`, slug, estado y plan | Reutilizar | Agregar clasificación Promo sin romper Commerce |
| Aislamiento multi-tienda | Reutilizar | Extender reglas e índices a nuevas colecciones |
| Master Admin | Reutilizar | Incorporar controles Promo, dominio, temas y publicación |
| Modo soporte Master | Reutilizar | Auditar cada escritura Promo y bloquear superficies personales |
| Equipo y permisos granulares | Reutilizar/adaptar | Crear permisos Promo sin dependencias de pedidos/catalogo |
| Planes y capacidades | Reutilizar/adaptar | Añadir capacidades Promo y cuotas controladas por Master |
| `settings` generales | Reutilizar parcialmente | Evitar convertir un registro único en un CMS ilimitado |
| `store_visual_items` | Reutilizar patrones | No usarlo como CMS universal sin revisar tipos y permisos actuales |
| Pipeline WebP y entrega de imágenes | Reutilizar | Ampliar dimensiones/presets para Hero, galería y retrato |
| Hero/carrusel existente | Reutilizar lógica | Separar del shell e-commerce y preparar video/poster |
| Ratings y reseñas de tienda | Reutilizar/adaptar | Desacoplar `reviews.manage` de `orders.view` para Promo |
| Landing QR | Reutilizar | Conservar gate, permisos, QR, preview y analítica |
| Analítica pública | Reutilizar/adaptar | Añadir eventos Promo y clicks de contacto sin PII |
| Seguridad pública | Reutilizar/adaptar | Resolver tienda por dominio validado además de slug |
| Caché SSR y compresión | Reutilizar/adaptar | Reconocer dominios custom y separar HTML dinámico de assets |
| SEO/OG | Reutilizar/adaptar | Canonical, `hreflang`, sitemap y OG por dominio/locale |
| Footer público | Reutilizar datos/patrones | Crear variante Promo sin enlaces de catálogo o compra |
| Layout público actual | No reutilizar completo | Crear shell Promo sin carrito, cupones ni promociones e-commerce |
| i18n público general | No disponible | Diseñar arquitectura compartida nueva |
| Resolución por dominio | No disponible | Diseñar registro, verificación y resolución segura por Host |

## 6. Modelo de autoridad

### 6.1 Master Admin

El Master debe controlar como mínimo:

- creación, clasificación, activación, suspensión y eliminación de tiendas;
- Administrador principal y límites de usuarios;
- plan, capacidades y cuotas;
- registro y asociación de dominios;
- integración Cloudflare y estado HTTPS;
- catálogo global de temas, versiones y disponibilidad;
- branding global reservado;
- publicación, despublicación y rollback;
- seguridad, bloqueos, retención y monitoreo;
- acceso soporte auditable;
- límites de imágenes, videos, idiomas y almacenamiento;
- visibilidad en el bazar/directorio de Tu Senda 84;
- recuperación ante configuraciones inválidas.

### 6.2 Admin Promo

El Admin Promo podrá, dentro de capacidades y permisos aprobados:

- seleccionar un tema habilitado;
- elegir tokens visuales allowlisted;
- configurar portada, servicios, galería, propietario, reseñas, contacto y footer;
- ordenar, mostrar u ocultar secciones permitidas;
- gestionar traducciones e idiomas habilitados;
- configurar el método principal de contacto;
- gestionar Landing QR cuando el plan lo permita;
- guardar borrador, previsualizar y solicitar/publicar según el flujo aprobado.

### 6.3 Acciones prohibidas al Admin Promo

- registrar o tomar control de dominios;
- introducir CSS, JavaScript o HTML arbitrario;
- instalar scripts externos no aprobados;
- modificar temas globales o sus versiones;
- eliminar branding reservado al Master;
- acceder a datos de otra tienda;
- habilitar capacidades fuera del plan;
- desactivar seguridad, auditoría o protecciones de origen;
- publicar un tema o idioma inválido.

## 7. Principios arquitectónicos obligatorios

1. **Store-first:** toda entidad Promo mutable debe pertenecer a una tienda.
2. **Fail closed:** dominio, locale, tema, acción o configuración desconocida no puede resolver datos de otra tienda.
3. **Master-owned domains:** Cloudflare y dominios permanecen bajo autoridad Master.
4. **Central admin:** autenticación administrativa en Tu Senda 84, no en dominios públicos.
5. **Draft/publish:** los cambios incompletos no deben afectar el sitio publicado.
6. **Versioned themes:** una actualización visual debe poder probarse, publicarse y revertirse.
7. **No arbitrary code:** personalización mediante tokens y variantes allowlisted.
8. **General i18n:** ningún CTA o bloque crea su propio sistema de idioma.
9. **Contact configuration:** componentes públicos nunca hardcodean destinos reales.
10. **Performance-first:** SSR y JavaScript público mínimo; imágenes y video con políticas explícitas.
11. **Accessible by default:** teclado, foco, contraste, landmarks, texto alternativo y movimiento reducido.
12. **Privacy by default:** analítica agregada y sin PII en eventos de interacción.
13. **Commerce isolation:** Promo no carga ni ejecuta infraestructura de carrito/checkout.
14. **Auditable control:** acciones críticas de Master y Admin generan actividad saneada.
15. **Rollback:** datos, dominio, tema y publicación deben tener recuperación definida.
16. **Legacy preservation:** ninguna incorporación Promo modifica el comportamiento de procesos existentes; toda integración compartida es aditiva, compatible y probada.

## 8. Modelo conceptual que debe decidir la auditoría

Los nombres finales pertenecen a `TS84-PROMO-ARC-0001`; este mapa solo identifica responsabilidades.

| Responsabilidad | Modelo conceptual esperado |
|---|---|
| Tipo de tienda | `commerce`, `promo`; evaluar `hybrid` solo como extensión futura |
| Perfil Promo | identidad, descripción, propietario, estado draft/published |
| Secciones | tipo, variante, orden, visible, configuración validada |
| Servicios | nombre, resumen, icono/imagen, orden, visible, traducciones |
| Medios | imagen/video/poster, propósito, alt, orden, estado y metadatos |
| Galería/trabajos | grupo, medios, texto, destacado y orden |
| Contacto | método, destino protegido/configurado, prioridad y disponibilidad |
| Temas | manifest, versión, tokens, variantes, estado y compatibilidad |
| Asignación visual | tema/version publicada, overrides seguros y borrador |
| Locales | locale principal, locales habilitados y fallback |
| Traducciones | entidad/campo/locale o contrato JSON validado |
| Dominios | hostname, tienda, canonical, estado, verificación y timestamps |
| Publicación | revisión o snapshot publicado, autor, fecha y rollback |
| Analítica | eventos allowlisted de página/sección/contacto |

## 9. Capacidades y permisos a evaluar

### 9.1 Capacidades de plan candidatas

- `promo_site_enabled`
- `custom_domain_enabled`
- `promo_theme_customization_enabled`
- `promo_multilanguage_enabled`
- `promo_video_enabled`
- `promo_analytics_enabled`
- `promo_landing_qr_enabled` o reutilización explícita de `landing_qr_enabled`
- límites de servicios, galería, imágenes, videos, idiomas y almacenamiento

### 9.2 Permisos candidatos

- `promo.site.view`
- `promo.content.manage`
- `promo.media.manage`
- `promo.theme.select`
- `promo.appearance.manage`
- `promo.translations.manage`
- `promo.contact.manage`
- `promo.reviews.manage`
- `promo.analytics.view`
- `promo.publish`

Los permisos de dominio, catálogo global de temas, suspensión, plan y rollback global deben permanecer reservados al Master.

## 10. Mapa de prompts y dependencias

### Ola 0 — Aprobaciones y arquitectura

| Orden | Prompt ID | Objetivo | Dependencias | Gate de cierre |
|---:|---|---|---|---|
| 0 | `TS84-PROMO-VIS-0001` | Registrar el modelo visual inicial de Aladdin's Carpet y la corrección del CTA | Imagen aprobada | APROBADO y registrado en este mapa |
| 1 | `TS84-PROMO-MAP-0001` | Crear y aprobar este mapa maestro | Conversación de definición | Aprobación de Kraken |
| 2 | `TS84-PROMO-AUD-0001` | Auditar código, datos, permisos, rutas, seguridad, media, SEO, analítica, Cloudflare/Coolify y reutilización | MAP-0001 aprobado | Reporte sin código funcional |
| 2A | `TS84-PROMO-COMPAT-0001` | Congelar contratos y línea base de todos los procesos existentes que no pueden cambiar | AUD-0001 | Matriz de invariantes y regresiones aprobada; sin código funcional |
| 3 | `TS84-PROMO-ARC-0001` | Cerrar ADRs, límites Commerce/Promo, draft/publish, dominio, temas, i18n y contacto | COMPAT-0001 | Arquitectura aditiva aprobada por Kraken |
| 4 | `TS84-PROMO-DATA-DES-0001` | Diseñar esquema final, reglas, índices, rollback y estrategia de migración | ARC-0001 | Diseño de datos aprobado; sin migrar todavía |
| 5 | `TS84-PROMO-MOB-VIS-0001` | Aprobar mockup móvil de Aladdin's Carpet | VIS-0001 | Obligatorio antes de cerrar responsive, no bloquea backend base |

### Ola 1 — Fundación multi-tienda Promo

| Orden | Prompt ID | Objetivo | Dependencias | Resultado esperado |
|---:|---|---|---|---|
| 6 | `TS84-PROMO-DATA-0001` | Implementar tipo de tienda, modelos Promo, aislamiento, índices y rollback | DATA-DES-0001 aprobado | Migraciones focales y pruebas backend |
| 7 | `TS84-PROMO-PERM-0001` | Implementar capacidades, permisos y gates Master/Admin Promo | DATA-0001 | Defensa frontend y backend sin dependencia de pedidos |
| 8 | `TS84-PROMO-PUBCFG-0001` | Crear contrato público saneado y contrato privado de edición | DATA-0001, PERM-0001 | Proyecciones allowlisted sin campos internos |
| 9 | `TS84-PROMO-AUDIT-0001` | Extender auditoría de actividad a entidades y acciones Promo | DATA-0001, PERM-0001 | Before/after saneado y acciones críticas registradas |

### Ola 2 — Motores compartidos

| Orden | Prompt ID | Objetivo | Dependencias | Resultado esperado |
|---:|---|---|---|---|
| 10 | `TS84-PROMO-I18N-0001` | Implementar locale, traducciones, fallback y selector público | PUBCFG-0001 | Sistema general sin textos hardcodeados |
| 11 | `TS84-PROMO-THEME-0001` | Implementar catálogo versionado de temas y tokens seguros | PUBCFG-0001 | Motor multi-tema con fallback y rollback |
| 12 | `TS84-PROMO-MEDIA-0001` | Implementar pipeline de Hero, servicios, galería, propietario, posters y video | PUBCFG-0001 | Archivos optimizados, límites y metadatos accesibles |
| 13 | `TS84-PROMO-DOM-CORE-0001` | Implementar registro privado de dominios y resolución local segura por Host | DATA-0001, PERM-0001 | Host exacto a tienda; desconocidos fallan cerrados |
| 14 | `TS84-PROMO-PUBLISH-0001` | Implementar borrador, preview, publicación y rollback | PUBCFG-0001, AUDIT-0001 | Sitio público lee exclusivamente revisión publicada |

### Ola 3 — Panel Master y Admin Promo

| Orden | Prompt ID | Objetivo | Dependencias | Resultado esperado |
|---:|---|---|---|---|
| 15 | `TS84-PROMO-MASTER-0001` | Añadir tipo Promo, estado, plan, dominio, tema y publicación al panel Master | PERM-0001, DOM-CORE-0001, THEME-0001, PUBLISH-0001 | Control central y soporte auditable |
| 16 | `TS84-PROMO-ADMIN-SHELL-0001` | Adaptar navegación del Admin para ocultar e-commerce y mostrar módulos Promo | PERM-0001 | Panel coherente según tipo/capacidades/permisos |
| 17 | `TS84-PROMO-CMS-0001` | Editor de identidad, secciones, servicios, propietario, contacto y footer | ADMIN-SHELL-0001, PUBCFG-0001, I18N-0001 | Edición segura, orden y visibilidad |
| 18 | `TS84-PROMO-GALLERY-0001` | Editor de trabajos destacados, galería, imágenes y videos | ADMIN-SHELL-0001, MEDIA-0001 | Medios ordenables, preview y límites |
| 19 | `TS84-PROMO-APPEARANCE-0001` | Selector de temas, tokens permitidos y vista previa | ADMIN-SHELL-0001, THEME-0001 | Múltiples temas soportados; solo aprobados visibles |
| 20 | `TS84-PROMO-LOCALES-ADMIN-0001` | Editor de idiomas, traducciones, completitud y fallback | CMS-0001, I18N-0001 | Estado por locale y bloqueo de publicación inválida |
| 21 | `TS84-PROMO-PREVIEW-0001` | Preview desktop/móvil de borrador y comparación con publicado | CMS-0001, GALLERY-0001, APPEARANCE-0001, PUBLISH-0001 | Preview privado sin indexación ni fuga de borradores |

### Ola 4 — Sitio público Promo

| Orden | Prompt ID | Objetivo | Dependencias | Resultado esperado |
|---:|---|---|---|---|
| 22 | `TS84-PROMO-SHELL-0001` | Crear layout público Promo sin carrito, checkout ni scripts comerciales | PUBCFG-0001, I18N-0001, THEME-0001, DOM-CORE-0001, PUBLISH-0001 | SSR ligero y navegación accesible |
| 23 | `TS84-PROMO-ALADDIN-0001` | Implementar el primer tema negro/dorado según VIS-0001 | SHELL-0001, THEME-0001 | Composición aprobada, no copia píxel por píxel |
| 24 | `TS84-PROMO-HERO-0001` | Hero, solicitud de estimado, contacto, carrusel y soporte video/poster | ALADDIN-0001, MEDIA-0001, I18N-0001 | LCP prioritario y controles accesibles |
| 25 | `TS84-PROMO-SECTIONS-0001` | Servicios, trabajo destacado, galería y propietario | ALADDIN-0001, CMS-0001, GALLERY-0001 | Secciones informativas sin precios |
| 26 | `TS84-PROMO-REVIEWS-0001` | Reutilizar ratings/reseñas de tienda sin depender de pedidos | PERM-0001, SHELL-0001 | Moderación, carrusel/lista accesible y datos aprobados |
| 27 | `TS84-PROMO-CONTACT-0001` | CTA localizado y resolución segura del método principal de contacto | I18N-0001, CMS-0001, SHELL-0001 | Sin destino hardcodeado; acciones allowlisted |
| 28 | `TS84-PROMO-FOOTER-0001` | Footer Promo personalizable dentro de límites Master | CMS-0001, SHELL-0001 | Datos, enlaces, redes y branding reservado |
| 29 | `TS84-PROMO-QR-0001` | Integrar acceso no redundante a Landing QR sin modificar su función base | SHELL-0001, L7Q1 existente | Landing QR conservada y sin bloque eliminado |
| 30 | `TS84-PROMO-RESP-0001` | Cerrar responsive móvil y táctil | MOB-VIS-0001 aprobado, prompts 23-29 | Paridad visual/funcional y sin desborde |

### Ola 5 — Dominio, SEO, analítica y endurecimiento

| Orden | Prompt ID | Objetivo | Dependencias | Resultado esperado |
|---:|---|---|---|---|
| 31 | `TS84-PROMO-DOM-CF-0001` | Integración de servidor con la cuenta Cloudflare Master, sin activar dominio real | MASTER-0001, DOM-CORE-0001, AUDIT-0001 | Cliente server-only, permisos mínimos y simulación segura |
| 32 | `TS84-PROMO-SEO-0001` | Canonical, OG, sitemap, robots, `hreflang` y redirecciones por dominio/locale | SHELL-0001, DOM-CORE-0001, I18N-0001 | Identidad SEO correcta sin duplicados |
| 33 | `TS84-PROMO-ANALYTICS-0001` | Visitas, secciones y conversiones por contacto | SHELL-0001, CONTACT-0001 | Eventos allowlisted, agregados y sin PII |
| 34 | `TS84-PROMO-SEC-0001` | Host/Origin, proxy confiable, tenant isolation, rate limit, CSP y sanitización | DOM-CF-0001, SHELL-0001, PUBCFG-0001 | Matriz de abuso y cruces de tienda aprobada |
| 35 | `TS84-PROMO-PERF-0001` | Carga, caché Cloudflare segura, compresión, imágenes y video diferido | MEDIA-0001, SHELL-0001, ANALYTICS-0001 | Presupuesto de rendimiento aprobado |
| 36 | `TS84-PROMO-A11Y-0001` | Auditoría y corrección WCAG de navegación, temas, locales y medios | RESP-0001, prompts públicos completos | Teclado, foco, contraste, labels y movimiento reducidos |

### Ola 6 — QA, staging y salida controlada

| Orden | Prompt ID | Objetivo | Dependencias | Gate de cierre |
|---:|---|---|---|---|
| 37 | `TS84-PROMO-QA-AUTO-0001` | Suites frontend/backend, migraciones, aislamiento, dominio, i18n y regresión e-commerce | SEC-0001, PERF-0001, A11Y-0001 | Cero fallos focales y regresiones críticas |
| 38 | `TS84-PROMO-QA-VIS-0001` | QA visual desktop/móvil de Aladdin's Carpet y estados de contenido | QA-AUTO-0001 | Aprobación visual de Kraken |
| 39 | `TS84-PROMO-STG-DOM-0001` | Configurar un dominio/subdominio de staging en Cloudflare y Coolify | QA-AUTO-0001, autorización externa | DNS/HTTPS/Host/caché/rollback verificados |
| 40 | `TS84-PROMO-STG-0001` | Smoke integral con Admin, Master, preview, publicación, idiomas y contacto | STG-DOM-0001, QA-VIS-0001 | Aprobación manual de Kraken |
| 41 | `TS84-PROMO-PROD-DOM-0001` | Asociar y verificar el dominio real de Aladdin's Carpet | STG-0001, autorización separada | Dominio verificado, aún no publicado |
| 42 | `TS84-PROMO-REL-0001` | Publicación controlada y redirección canónica | PROD-DOM-0001, aprobación final | Producción aprobada con rollback |
| 43 | `TS84-PROMO-OPS-0001` | Monitoreo, alertas, backup, renovación y runbook de dominio | REL-0001 | Operación y recuperación documentadas |

## 11. Camino crítico

La secuencia mínima que no debe romperse es:

`MAP → AUD → COMPAT → ARC → DATA-DES → DATA → PERM/PUBCFG → I18N/THEME/MEDIA/DOM-CORE/PUBLISH → ADMIN/MASTER → SHELL → ALADDIN/SECCIONES/CONTACTO → RESPONSIVE → SEGURIDAD/PERFORMANCE/QA → STAGING → DOMINIO REAL → RELEASE`

Reglas del camino crítico:

- no crear migraciones antes de aprobar `DATA-DES-0001`;
- no implementar ninguna fase antes de congelar en `COMPAT-0001` los contratos y resultados existentes que deben preservarse;
- no construir el shell Promo sobre el Layout e-commerce existente;
- no implementar Aladdin's Carpet antes del motor de temas y el contrato público;
- no cerrar responsive antes de aprobar `MOB-VIS-0001`;
- no conectar Cloudflare real antes de aprobar la simulación server-only;
- no asociar el dominio real antes de pasar staging;
- no desplegar producción sin autorización separada.

## 12. Requisitos específicos de Cloudflare y dominio

`TS84-PROMO-AUD-0001` y `TS84-PROMO-DOM-CF-0001` deben revisar y resolver:

- dominio apex y alias `www`;
- normalización exacta de hostname, puertos e IDN/punycode;
- unicidad de hostname entre tiendas;
- verificación de propiedad antes de activación;
- proxy Cloudflare y conexión HTTPS al origen;
- alta del hostname en el ingress de Coolify/Traefik o mecanismo equivalente aprobado;
- compatibilidad con `security.checkOrigin` sin desactivarlo globalmente;
- lista dinámica y segura de orígenes públicos autorizados;
- validación de `Host`, `Origin`, `X-Forwarded-Host` y proxy confiable;
- defensa contra Host header poisoning y domain takeover;
- comportamiento de hostname desconocido, pendiente, suspendido y eliminado;
- canonical y redirección entre apex, `www` y slug de preview;
- exclusión de `/admin`, `/master`, APIs privadas y preview de la caché pública;
- invalidación de caché después de publicar;
- ocultación y rotación del token Cloudflare;
- permisos mínimos del token y restricción a las zonas necesarias;
- idempotencia al crear, consultar o eliminar registros DNS;
- auditoría Master sin registrar token, secretos o payloads sensibles;
- rollback cuando falle DNS, HTTPS, ingress o publicación.

La credencial Cloudflare debe vivir como secreto de servidor/infraestructura. No se debe guardar en PocketBase como un campo legible, incluir en HTML, exponer mediante API pública ni solicitar por chat.

## 13. Requisitos del sistema de temas

El motor de temas debe:

- soportar múltiples manifests/versiones desde el inicio;
- separar contenido, composición y apariencia;
- usar tokens semánticos, no colores dispersos en componentes;
- validar contraste y combinaciones permitidas;
- limitar tipografías, bordes, radios, sombras, densidad y variantes;
- impedir CSS/JS arbitrario;
- permitir preview antes de publicar;
- fijar la versión publicada por tienda;
- migrar o declarar incompatibilidad entre versiones;
- conservar fallback global seguro;
- permitir rollback;
- reservar branding global al Master;
- ocultar temas no aprobados, retirados o incompatibles;
- no borrar contenido al cambiar de tema.

El panel puede soportar varios temas desde su arquitectura inicial, pero la implementación de un segundo tema visual requiere un Prompt ID y mockup aprobado independiente.

## 14. Requisitos i18n

La arquitectura i18n debe definir:

- locale predeterminado por tienda;
- locales habilitados por plan/tienda;
- estrategia URL, cookie o preferencia persistida;
- fallback determinista por campo;
- traducciones del sistema y traducciones de contenido;
- traducciones de navegación, CTAs, estados, accesibilidad y errores;
- etiquetas SEO, canonical y `hreflang`;
- validación de completitud antes de publicar;
- cambio de idioma ligero y sin lógica exclusiva del botón Contactar;
- actualización del atributo `lang` y nombres accesibles;
- formato local de fechas/teléfonos cuando aplique;
- carga acotada de traducciones necesarias para la página;
- comportamiento sin JavaScript;
- fallback seguro para una traducción ausente.

Idiomas iniciales sugeridos: español e inglés. Francés y otros deben poder agregarse sin alterar componentes ni esquema.

## 15. Requisitos de contacto y conversión

El modelo de contacto debe:

- definir un método principal y métodos secundarios;
- validar protocolos y destinos por tipo;
- admitir WhatsApp, teléfono, correo, formulario interno y opciones futuras aprobadas;
- evitar números/correos hardcodeados en componentes;
- ofrecer mensajes localizados configurables cuando proceda;
- respetar horario comercial sin impedir contacto salvo decisión aprobada;
- registrar eventos agregados sin guardar el mensaje, teléfono o correo del visitante;
- sanear URLs y bloquear esquemas peligrosos;
- permitir desactivar un canal sin romper el CTA;
- mostrar fallback controlado cuando el método principal no esté disponible;
- preservar accesibilidad y navegación por teclado.

## 16. Requisitos de medios y rendimiento

- Hero prioritario con una sola imagen LCP inicial.
- `srcset`/sizes o equivalente aprobado para imágenes responsivas.
- WebP/formatos modernos mediante pipeline reutilizado y ampliado.
- Dimensiones, peso y cantidad limitados por propósito/plan.
- Galería paginada o progresiva; no descargar todo de golpe.
- Lazy loading fuera del Hero.
- Video con poster, metadata y carga diferida.
- No autoplay con sonido.
- Pausa y controles accesibles.
- Respeto por `prefers-reduced-motion` y ahorro de datos cuando aplique.
- JavaScript público acotado por presupuesto.
- Analítica no bloqueante.
- CSS de tema sin duplicación masiva por tienda.
- Caché pública separada de borradores, admin y APIs privadas.
- Invalidación segura al publicar o cambiar dominio/tema.

Los presupuestos numéricos finales deben fijarse en `TS84-PROMO-ARC-0001` y validarse en `TS84-PROMO-PERF-0001`.

## 17. Matriz mínima de seguridad y pruebas

### 17.1 Multi-tenant y permisos

- Admin Promo A no lee ni modifica Promo B.
- Master soporte requiere contexto explícito de tienda.
- Usuario sin permiso no obtiene datos mediante fields/filter/sort/expand/realtime.
- Capacidad ausente bloquea UI y backend.
- Tienda suspendida no publica contenido ni acciones.
- Borrador nunca aparece en respuesta pública.

### 17.2 Dominios

- Host registrado resuelve únicamente su tienda.
- Host desconocido falla cerrado.
- Host duplicado no puede asociarse.
- `X-Forwarded-Host` falsificado se rechaza o ignora según proxy validado.
- Dominio pendiente o suspendido no publica.
- Slug y dominio no generan canonical contradictorio.
- Admin no se sirve desde el dominio personalizado.
- La desconexión del dominio conserva acceso Master y recuperación.

### 17.3 Temas e i18n

- Tema inexistente/retirado usa fallback seguro.
- Tokens inválidos no se publican.
- Cambiar tema no elimina contenido.
- Locale inválido usa fallback y no revela datos internos.
- CTA cambia texto y conserva destino configurado.
- Cada locale actualiza `lang`, canonical y nombres accesibles.

### 17.4 Contenido y contacto

- URLs y protocolos peligrosos se rechazan.
- Video/imagen inválidos no se guardan.
- Texto y alt tienen límites.
- Contacto desactivado no produce enlaces vacíos peligrosos.
- Analytics de contacto no recibe teléfono, email, mensaje ni URL secreta.

### 17.5 Regresión Commerce

- PowerZona conserva home, catálogo, producto, carrito y checkout.
- Rutas `/t/[storeSlug]` e-commerce existentes siguen funcionando.
- Landing QR, ratings, seguridad, analítica, permisos y planes no retroceden.
- El nuevo tipo Promo no concede permisos o capacidades a Commerce por accidente.
- Bazar, Admin, Master, APK Admin y app pública conservan sus contratos y navegación vigentes.
- No cambia ningún default, resultado, permiso efectivo ni respuesta pública de tiendas existentes.
- Si una prueba de regresión existente falla, el Prompt ID no puede marcarse completado aunque las pruebas Promo aprueben.

## 18. QA visual y responsive

Resoluciones mínimas sugeridas:

- desktop: 1440 × 900;
- laptop: 1280 × 800;
- tablet: 768 × 1024;
- móvil: 390 × 844 y 412 × 915;
- ancho estrecho adicional para detectar desborde.

Estados a probar:

- contenido completo;
- sin logo;
- sin video;
- pocas/muchas imágenes dentro del límite;
- sin reseñas;
- contacto principal no disponible;
- traducción incompleta;
- tema retirado/fallback;
- dominio pendiente/suspendido;
- carga lenta y error de medio;
- teclado, foco, zoom y movimiento reducido.

## 19. Estrategia de publicación y rollback

Cada publicación debe registrar:

- tienda;
- revisión publicada;
- tema y versión;
- locales;
- dominio canónico;
- actor y fecha;
- resultado;
- referencia de rollback.

Rollback mínimo:

- volver a la revisión pública anterior;
- volver a la versión de tema anterior;
- retirar el dominio sin perder el slug de preview/admin;
- conservar contenido y traducciones;
- invalidar caché correspondiente;
- auditar el motivo y el actor.

## 20. Gates de autorización humana

Requieren aprobación expresa de Kraken:

1. aprobación de este mapa;
2. cierre de auditoría y arquitectura;
3. diseño final de datos antes de migraciones;
4. cualquier modificación técnicamente necesaria en un archivo o contrato compartido, aunque se proponga como aditiva;
5. cualquier excepción que pueda afectar un proceso ya implementado;
6. mockup móvil;
7. cada tema visual adicional;
8. creación o modificación de secretos Cloudflare;
9. cambios reales de DNS/Cloudflare/Coolify;
10. despliegue a staging;
11. asociación del dominio real;
12. despliegue y publicación en producción;
13. push, merge o release si no fue autorizado por el prompt vigente.

## 21. Contrato estándar para cada prompt de implementación

Cada Prompt ID futuro debe declarar:

1. objetivo concreto;
2. dependencias y estado esperado;
3. alcance exacto;
4. archivos/colecciones/rutas previstas;
5. datos públicos y privados;
6. permisos y capacidades;
7. aislamiento multi-tienda;
8. migración y rollback, si aplica;
9. accesibilidad;
10. rendimiento;
11. seguridad y abuso;
12. pruebas focales y regresiones;
13. documentación/reporte final;
14. lista explícita de NO HACER;
15. acciones externas que requieren autorización separada.
16. procesos existentes protegidos y regresiones que demuestran que permanecen idénticos.

La respuesta final de cada prompt debe incluir:

- estado `COMPLETADO` o `BLOQUEADO`;
- resumen del resultado;
- decisiones tomadas;
- archivos exactos modificados;
- migraciones exactas;
- pruebas ejecutadas y resultados;
- dependencias añadidas;
- riesgos o pendientes;
- confirmación de que no se tocaron staging/producción/Cloudflare si no estaban autorizados;
- siguiente Prompt ID habilitado.

## 22. Próximo prompt recomendado

Después de que Kraken apruebe este mapa, el siguiente trabajo debe ser:

`TS84-PROMO-AUD-0001 — Auditoría técnica y matriz definitiva de reutilización de Tiendas Promo`.

Esa auditoría debe ser de solo lectura y documentación. Debe confirmar o corregir este inventario, enumerar archivos/colecciones/rutas reales, identificar dependencias e-commerce, revisar la topología Cloudflare/Coolify vigente y entregar decisiones abiertas para `TS84-PROMO-ARC-0001`.

No debe implementar página pública, componentes, migraciones, temas, i18n, dominios, DNS ni despliegues.

## 23. Estado consolidado

| ID | Estado | Observación |
|---|---|---|
| `TS84-PROMO-VIS-0001` | APROBADO / registrado | Modelo inicial Aladdin's Carpet y corrección CTA |
| `TS84-PROMO-MAP-0001` | PROPUESTO | Esperando aprobación de Kraken |
| `TS84-PROMO-AUD-0001` | PENDIENTE | Próximo prompt recomendado |
| `TS84-PROMO-COMPAT-0001` | PENDIENTE | Obligatorio antes de cerrar arquitectura o implementar |
| `TS84-PROMO-MOB-VIS-0001` | PENDIENTE | Obligatorio antes del cierre responsive |
| Implementación funcional Promo | NO INICIADA | Bloqueada hasta auditoría, arquitectura y autorización |
| Cloudflare real | NO MODIFICADO | Dominio confirmado bajo cuenta Master; integración pendiente |
| Staging/producción | NO MODIFICADOS | Requieren autorización separada |
