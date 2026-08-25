# TS84-PROMO-STG-COOLIFY-0001 — Preparación de staging platform-first

Estado del prompt: **LISTO PARA DELEGACIÓN / NO EJECUTADO**

## 1. Decisión vinculante

Tu Senda 84 publicará las Tiendas Promo inicialmente mediante la ruta estable de plataforma:

```text
https://tusenda84.com/promo/{publicSlug}/{locale}
```

Staging debe reproducir ese modo usando exclusivamente el dominio provisional HTTPS asignado por Coolify:

```text
https://{host-provisional-coolify}/promo/{publicSlug}/{locale}
```

El host provisional de Coolify es un host de plataforma de staging. No es un dominio custom de Aladdin's Carpet, no crea un `promo_domain_binding` y no cambia el canonical publicado a modo custom.

Un dominio propio es opcional y pertenece a `TS84-PROMO-PROD-DOM-0001`, que solo se ejecutará con decisión y autorización separadas.

## 2. Objetivo exclusivo

Preparar y verificar el entorno desplegado de staging para Tiendas Promo sobre la infraestructura existente de Coolify, conservando:

- `canonical_mode=platform`;
- `primary_binding` vacío;
- rutas públicas `/promo/{publicSlug}` y `/promo/{publicSlug}/{locale}`;
- Admin y Master en el host central de staging;
- HTTPS, Host y Origin exactos;
- `security.checkOrigin: true`;
- proxy/ingress fail-closed;
- staging completo en `noindex`;
- migraciones controladas con respaldo y rollback verificables;
- aislamiento tenant y regresiones Commerce.

Este prompt prepara el entorno. No ejecuta todavía el smoke funcional integral de Aladdin's Carpet reservado a `TS84-PROMO-STG-0001`.

## 3. Autorizaciones que debe contener la delegación de ejecución

Antes de iniciar, la delegación debe autorizar expresamente, una por una:

1. acceso de solo lectura inicial al proyecto de staging en Coolify;
2. uso del dominio provisional y servicios de staging ya existentes;
3. push del commit exacto que deba desplegarse, si todavía no está disponible en el remoto;
4. creación del deployment de staging;
5. respaldo verificable del PocketBase de staging;
6. aplicación de migraciones pendientes en staging;
7. reinicio o redeploy de los servicios de staging;
8. ejecución de pruebas HTTP y navegador contra el dominio provisional.

La ausencia de cualquiera de las autorizaciones necesarias obliga a detenerse antes de esa acción. Este documento no concede esas autorizaciones por sí mismo.

## 4. Precondiciones Git obligatorias

La delegación debe declarar el commit exacto esperado.

Al comenzar:

- verificar rama `dev`;
- verificar que `HEAD` coincide exactamente con el commit autorizado;
- verificar worktree limpio;
- comprobar que ese commit contiene el cierre de `TS84-PROMO-QA-VIS-0001` y esta decisión platform-first;
- detenerse sin modificar nada si rama, HEAD o limpieza no coinciden;
- no usar stash, reset, checkout destructivo, rebase, merge o force push.

## 5. Contratos que deben leerse antes de actuar

Leer completos y respetar como contratos:

- `docs/tusenda84/TS84_PROMO_MAPA_MAESTRO_PROMPTS.md`;
- `docs/tusenda84/reportes/TS84-PROMO-QA-AUTO-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-QA-VIS-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-DOM-CORE-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-DOM-CF-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-SHELL-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-SEO-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-SEC-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-PERF-0001-implementacion.md`;
- `docs/tusenda84/reportes/TS84-PROMO-A11Y-0001-implementacion.md`;
- ADRs vigentes, incluido el presupuesto `ARC-ADR-010`;
- contratos existentes de despliegue, backup y migración del repositorio.

Si un contrato requerido no existe o contradice este mapa, detenerse y documentar la discrepancia antes del despliegue.

## 6. Fase A — Auditoría externa de solo lectura

Después de recibir autorización de acceso:

- identificar el proyecto, aplicaciones y servicios exactos de staging;
- confirmar el dominio provisional HTTPS actual de Coolify;
- confirmar qué commit está desplegado sin modificarlo;
- comprobar estado de frontend, PocketBase, volúmenes, healthchecks y red interna;
- comprobar nombres de variables requeridas y si están configuradas, sin revelar valores;
- determinar cómo se ejecutan migraciones y cómo se restaura el volumen/base;
- identificar proxy/Traefik, headers y autoridad Host efectiva;
- confirmar que no se está observando producción;
- capturar un inventario saneado y proporcional.

No imprimir, copiar, exportar ni registrar cookies, tokens, contraseñas, claves, valores de variables o contenido sensible.

## 7. Fase B — Verificación local previa

Antes de cualquier deployment:

- ejecutar suites focales Promo de seguridad, dominio, shell, SEO y rendimiento;
- ejecutar QA automatizado proporcional a los archivos que realmente se despliegan;
- ejecutar build SSR de producción;
- verificar `security.checkOrigin`;
- comprobar que no existen source maps o marcadores sensibles no autorizados;
- ejecutar `git diff --check`;
- confirmar que el árbol permanece limpio.

Si una prueba focal o regresión crítica falla, no desplegar.

## 8. Fase C — Preparación segura del origen provisional

Configurar únicamente el host provisional exacto de Coolify como host de plataforma de staging.

Debe comprobarse:

- HTTPS válido y redirección HTTP a HTTPS;
- autoridad `Host` exacta;
- `Origin` exacto para mutaciones same-origin;
- tratamiento seguro de `X-Forwarded-Host`, `X-Forwarded-Proto` y peers confiables;
- ausencia de wildcard o suffix matching;
- separación frontend → PocketBase mediante la URL interna prevista;
- CSP, HSTS cuando corresponda, nosniff, referrer policy y permissions policy;
- límites de body, timeout y rate limiting existentes;
- caché privada/no-store donde el contrato lo exige;
- ningún acceso a Admin, Master o API privada mediante una superficie custom.

Si el host provisional real no coincide con la allowlist actual, solo se permite un ajuste exacto, server-side y cubierto por pruebas. Quedan prohibidos `*`, sufijos amplios, confianza global de proxy y desactivar validaciones.

## 9. Fase D — Protección antiindexación de staging

Todo el origen provisional de staging debe quedar fuera de índices públicos.

Verificar en HTML y headers:

- `X-Robots-Tag: noindex, nofollow, noarchive`;
- meta robots equivalente cuando aplique;
- ausencia de sitemap de staging indexable;
- ausencia de enlaces canonical que conviertan el host provisional en identidad pública;
- canonical de negocio conservado en modo plataforma;
- preview, Admin, Master y APIs siempre privados/noindex.

Si no existe un mecanismo de entorno para imponer `noindex`, se permite añadir uno estrictamente aditivo, activado solo en staging, con default de producción idéntico y pruebas proporcionales.

## 10. Fase E — Backup, migraciones y deploy

Antes de migrar:

- crear un respaldo recuperable de PocketBase staging;
- registrar timestamp, alcance y mecanismo de restauración sin exponer datos;
- verificar espacio y salud del volumen;
- enumerar migraciones pendientes por nombre, sin ejecutar down destructivo;
- preparar rollback de aplicación y datos.

Después, únicamente con autorización explícita:

- desplegar el commit exacto;
- aplicar las migraciones pendientes mediante el mecanismo oficial del proyecto;
- comprobar que cada migración termina correctamente;
- reiniciar solo los servicios necesarios;
- confirmar healthchecks y logs saneados;
- conservar evidencia del rollback disponible.

No modificar datos de producción ni reutilizar su volumen, URL interna o credenciales.

## 11. Fase F — Verificación técnica desplegada

Comprobar al menos:

- frontend y PocketBase saludables;
- HTTPS y cadena de redirección;
- headers de seguridad y `noindex`;
- Host válido de plataforma aceptado;
- Host desconocido y spoofing rechazados;
- Origin same-origin permitido y cross-origin rechazado;
- rutas Admin/Master disponibles únicamente por la superficie central;
- rutas Promo platform reconocidas sin crear binding custom;
- `canonical_mode=platform` y `primary_binding` vacío;
- sitio no publicado responde de forma genérica y fail-closed;
- media y caché respetan los contratos existentes;
- dos tenants no se cruzan;
- una tienda Commerce de control conserva home, catálogo, carrito, checkout y Landing QR;
- consola, logs y respuestas no exponen secretos, IDs internos o PII.

Si Aladdin's Carpet todavía no existe en staging, no crearla dentro de este prompt. La preparación puede cerrar con la ruta platform lista y un estado no publicado seguro; el alta, preview y publicación forman parte del smoke `TS84-PROMO-STG-0001`.

## 12. Evidencia mínima proporcional

Conservar en el reporte:

- rama y commit desplegado;
- servicios de staging identificados por nombre no sensible;
- dominio provisional y rutas verificadas;
- versiones de runtime relevantes;
- migraciones pendientes/aplicadas y resultado exacto;
- existencia y restaurabilidad del backup;
- comandos locales y verificaciones remotas saneadas;
- status, redirects y headers HTTP relevantes;
- viewports o capturas estrictamente necesarias;
- resultados exactos de suites y build;
- defectos detectados, correcciones y retest;
- rollback ensayado o validado sin destruir datos.

Redactar cookies, Authorization, Set-Cookie, tokens, variables y datos personales.

## 13. Gate de cierre

Solo marcar `COMPLETADO` si:

- el commit autorizado está desplegado en staging;
- HTTPS, Host, Origin y proxy están verificados;
- staging completo está en `noindex`;
- migraciones terminaron sin error y existe backup recuperable;
- rollback de aplicación y datos está documentado;
- el modo continúa siendo platform;
- no existe binding custom ni cambio DNS/Cloudflare;
- no hay defectos críticos abiertos;
- Commerce y aislamiento tenant no presentan regresiones;
- `TS84-PROMO-STG-0001` puede comenzar sin trabajo de infraestructura pendiente.

Marcar `BLOQUEADO` con evidencia precisa si falla un gate o falta autorización. No ocultar una validación manual pendiente.

## 14. Reporte obligatorio

Crear:

`docs/tusenda84/reportes/TS84-PROMO-STG-COOLIFY-0001-implementacion.md`

Debe incluir:

- precondiciones Git;
- autorizaciones recibidas;
- inventario externo saneado;
- topología y dominio provisional;
- backup y rollback;
- migraciones exactas;
- deploy exacto;
- matriz Host/Origin/proxy/HTTPS/noindex;
- pruebas y resultados;
- defectos y pendientes;
- confirmación de que no se tocó Cloudflare, DNS, custom domains o producción;
- siguiente Prompt ID habilitado o causa de bloqueo.

## 15. NO HACER

- No conectar, consultar o modificar Cloudflare.
- No modificar DNS, zonas, certificados externos o dominios propios.
- No crear `promo_domain_bindings` para el host de Coolify.
- No cambiar a `canonical_mode=custom`.
- No desplegar producción.
- No ejecutar `TS84-PROMO-STG-0001`, PROD-DOM, REL, OPS ni prompts posteriores.
- No solicitar, leer, imprimir, escribir o versionar secretos.
- No instalar plugins o dependencias.
- No introducir migraciones nuevas ni cambios de contratos compartidos no autorizados.
- No desactivar CSP, `security.checkOrigin`, Origin, Host, proxy trust o aislamiento tenant.
- No usar wildcard para hosts/orígenes.
- No borrar volúmenes, bases, backups o datos.
- No hacer merge, release o commit sin autorización separada.

## 16. Entrega

Dejar cualquier cambio de código o documentación sin commit salvo autorización separada.

La respuesta final debe indicar:

- `COMPLETADO` o `BLOQUEADO`;
- commit desplegado;
- entorno y dominio provisional;
- migraciones y backup;
- pruebas y resultados;
- evidencia;
- defectos y pendientes;
- confirmación explícita de cero Cloudflare/DNS/custom/producción;
- que el siguiente prompt es `TS84-PROMO-STG-0001` únicamente si también se ha aprobado el gate humano de QA-VIS.
