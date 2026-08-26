# TS84-PROMO-LIVE-CATALOG-0001 — Contenido vivo, galerías y apariencias Promo

## Estado contractual

- Prompt ID: `TS84-PROMO-LIVE-CATALOG-0001`.
- Tipo: cambio funcional y de arquitectura aprobado por el propietario.
- Rama de trabajo: `dev`.
- Punto de partida verificado: `bbadbe6` y worktree limpio.
- Alcance: Tiendas Promo, su Admin, su salida pública y el control Master asociado.
- Quedan fuera: Commerce, producción, DNS, Cloudflare, dominio privado, despliegue, release, push y commit.

Este contrato sustituye, para el producto Promo, la experiencia de candidata, aprobación, publicación, revisiones visibles y rollback por un modelo de contenido vivo. Los controles de seguridad, concurrencia, tenant, permisos, dominio, tema, medios y auditoría continúan siendo obligatorios.

## Decisión de producto aprobada

El administrador de una Tienda Promo no administra lanzamientos editoriales. Al pulsar **Guardar cambios**, el sistema valida y actualiza la página pública automáticamente. No existe una sección `Publicar`, ni botones para crear candidata, aprobar, publicar, despublicar o restaurar revisiones.

El Master controla exclusivamente disponibilidad y gobierno: lifecycle de tienda/sitio, plan y capacidades, acceso, origen canónico, dominios y catálogo de apariencias. No aprueba contenido ordinario de una tienda.

## Requisitos ejecutables

### 1. Guardado vivo

1. Mantener un único documento actual por sitio Promo.
2. Conservar un contador CAS técnico para impedir que dos pestañas sobrescriban cambios; no presentarlo como revisión editorial.
3. Cada guardado válido debe actualizar el documento actual y la generación técnica de caché en una sola operación lógica.
4. Un sitio activo solo acepta documentos completos y públicamente válidos. Un sitio todavía en configuración puede guardar contenido parcial, pero no debe ser resoluble públicamente.
5. El resolver público debe leer el documento actual; no debe depender de `promo_revisions`, `promo_revision_media_refs` ni de `published_revision`.
6. No crear nuevas candidatas, snapshots ni filas de historial editorial. Las rutas privadas antiguas de publicación deben quedar retiradas o responder como operación no soportada sin mutar datos.
7. Los assets referenciados por el documento actual no pueden retirarse.

### 2. Modelo de galerías y trabajos

1. Permitir varias galerías. Cada galería es una categoría con clave estable, portada, nombre, descripción, orden y visibilidad.
2. Cada galería contiene varios trabajos o productos de portafolio, sin precio, stock, carrito, checkout ni relación con productos Commerce.
3. Cada trabajo permite nombre, descripción, orden, visibilidad, varias fotos y marca `destacado`.
4. `Trabajos destacados` deriva exclusivamente de trabajos marcados en galerías; no mantiene copias separadas.
5. Cada trabajo público ofrece `Solicitar estimado` mediante el contacto primario seguro ya configurado.
6. Un servicio enlaza a una galería y usa su portada; su CTA abre esa galería. No mantiene una foto duplicada propia.

### 3. Portada, identidad y contacto

1. La portada admite una imagen o varias imágenes como carrusel accesible.
2. Añadir `slogan` opcional y localizado, máximo 120 caracteres, visible bajo el nombre comercial y ausente del DOM cuando esté vacío.
3. Conservar todos los campos actuales de contacto.
4. Añadir una imagen QR opcional con subir, previsualizar y eliminar.
5. Normalizar el QR a un lienzo cuadrado de 512 × 512, ajuste `contain`, sin recorte y con zona silenciosa preservada; rechazar animación y contenido no imagen. Si no existe, no reservar espacio público.

### 4. Apariencias

Entregar al menos seis apariencias seleccionables que reutilicen exactamente el mismo contenido y mantengan responsive, teclado, foco visible, contraste y movimiento reducido:

1. `promo.black-gold` — Elegante.
2. `promo.minimal` — Minimalista.
3. `promo.artisan` — Artesanal/cálida.
4. `promo.vibrant` — Moderna/vibrante.
5. `promo.professional` — Profesional/corporativa.
6. `promo.portfolio` — Portafolio centrado en imágenes.

Las diferencias deben ser reales en composición, tipografía, color, tarjetas y jerarquía; no simples cambios de color.

### 5. Navegación Admin y Master

1. Eliminar `Publicar` de rutas, navegación, permisos visibles y paneles Promo.
2. Añadir en el lateral fijo del Admin Promo:
   - `Ver mi página`, hacia `/promo/{publicSlug}/{defaultLocale}` o el redirect canónico equivalente, en pestaña nueva;
   - `Contactar a soporte`, reutilizando la configuración global del Master, con nombre legible de la tienda en el mensaje y sin IDs sensibles.
3. El Master no muestra candidata, revisión publicada, historial de revisiones ni operaciones editoriales. Debe mostrar salud del sitio vivo, lifecycle, capacidades, canónico, dominio y apariencia actual.

### 6. Seguridad y privacidad invariantes

- Tenant derivado de sesión y soporte Master con contexto explícito.
- Escrituras protegidas por permisos y capability; auditoría saneada.
- Host/Origin fail-closed, dominio canónico y bindings sin relajación.
- CSP, `noindex` de staging y cabeceras existentes sin regresión.
- Ningún token, cookie, credencial, ID privado o dato personal en HTML, logs, documentación o evidencia.
- Ninguna reutilización de datos/volúmenes de producción.
- Ningún cambio en contratos Commerce compartidos.

## Compatibilidad y migración

1. Migrar documentos Promo existentes de forma determinista al modelo vivo conservando contenido y medios utilizables.
2. Las referencias antiguas de trabajos destacados deben convertirse en trabajos de una galería, sin duplicación pública.
3. La ranura de publicación puede conservarse como registro técnico de canónico y generación de caché, pero `published_revision` deja de ser autoridad y debe permanecer vacío en el nuevo flujo.
4. Analítica debe atribuirse a la generación técnica actual y no exigir una revisión editorial nueva.
5. Los registros históricos legados podrán conservarse como datos inertes durante la transición si eliminarlos afectara auditoría o analítica; el flujo nuevo no debe aumentarlos.

## Criterios de aceptación

- Guardar identidad, contenido, contacto, idiomas, apariencia, portada o galería actualiza la salida pública sin paso adicional.
- Dos escrituras con la misma versión técnica producen un conflicto seguro, no pérdida silenciosa.
- No existe superficie operativa `Publicar` en Admin ni Master.
- Se crean, editan, reordenan y eliminan varias galerías y trabajos con varias fotos.
- Servicios enlazados y destacados se renderizan desde una única fuente.
- Hero simple/carrusel, slogan y QR se renderizan y se ocultan correctamente cuando corresponda.
- Las seis apariencias pasan validación de catálogo y render público.
- `Ver mi página` y soporte aparecen en desktop y móvil sin exponer identificadores.
- Sitio suspendido/inactivo, tenant ajeno, Host/Origin inválido, medio no autorizado y tema no aprobado fallan cerrados.
- Regresiones proporcionales de Commerce, checkout/búsqueda y Landing QR permanecen verdes.

## Evidencia y cierre

Crear `docs/tusenda84/reportes/TS84-PROMO-LIVE-CATALOG-0001-implementacion.md` con:

- archivos y migraciones;
- decisiones de compatibilidad;
- comandos y resultados exactos;
- matriz funcional, seguridad, responsive y accesibilidad;
- datos de prueba y estado final, si se usan;
- defectos encontrados/corregidos/pendientes;
- límites respetados.

No hacer commit, push ni despliegue como parte de este Prompt salvo autorización posterior y explícita.
