# TS84-PROMO-PROD-DOM-0001 — dominio privado de Aladdin's Carpet

## Objetivo

Asociar y verificar `www.enriquecarpet.com` exclusivamente con la Tienda Promo de producción `Aladdin's Carpet` (`/aladdin-s-carpet`), conservando la publicación canónica en la ruta de plataforma hasta una autorización de release separada.

## Alcance autorizado

- Rehabilitar la administración privada de bindings mediante los contratos DOM-CORE existentes.
- Mantener `custom_domain_enabled=false` como valor predeterminado para todas las tiendas.
- Habilitar la capacidad únicamente en la tienda objetivo mediante contexto Master explícito.
- Registrar `www.enriquecarpet.com` como binding `primary` de la tienda objetivo.
- Añadir el hostname exacto al ingress del frontend de producción en Coolify.
- Crear el registro DNS `www` en la zona `enriquecarpet.com` de Cloudflare.
- Verificar DNS, HTTPS, Host/Origin y aislamiento antes de activar el binding local.
- Mantener `canonical_mode=platform` y `primary_binding` vacío durante este Prompt.

## Fuera de alcance

- No modificar el apex `enriquecarpet.com` ni crear un alias adicional.
- No cambiar el canonical al dominio propio.
- No retirar la ruta de plataforma.
- No cambiar contenido, tema, contacto, plan o usuarios de la tienda.
- No modificar PowerZona, otras tiendas Promo/Commerce, staging o sus datos.
- No crear tokens, secretos, Workers, reglas de redirección o integraciones Cloudflare server-side.

## Controles obligatorios

1. La capacidad de dominio debe permanecer deshabilitada por defecto y activarse por tenant.
2. Las rutas privadas exigen sesión Master, `X-PZ-Promo-Store`, payload exacto y CAS.
3. El hostname debe normalizarse a A-label lowercase, ser único globalmente y no pertenecer al namespace de plataforma.
4. La evidencia de verificación se persiste únicamente como SHA-256; nunca se guarda el material crudo.
5. Los eventos de creación, verificación y activación deben quedar auditados sin hostname, secreto o payload sensible.
6. Un hostname desconocido, no verificado o no canónico debe fallar cerrado.
7. El cambio de canonical requiere otro Prompt y autorización separada.

## Secuencia de despliegue

1. Probar contratos, permisos, aislamiento y build local.
2. Publicar primero en `dev` y validar staging.
3. Promover el mismo commit probado a `main` y desplegar frontend/PocketBase en producción.
4. Habilitar la capacidad y crear el binding desde el control Master de la tienda objetivo.
5. Añadir el hostname al frontend de Coolify.
6. Crear DNS inicialmente sin proxy, esperar certificado del origen y validar HTTPS.
7. Activar proxy Cloudflare y usar `Full (strict)` cuando el certificado del origen sea válido.
8. Registrar el digest de evidencia, marcar `verified` y después `active`.
9. Confirmar que la tienda continúa con canonical de plataforma.

## Rollback

- Antes del canonical custom, retirar el registro DNS y el hostname de Coolify devuelve el tráfico al estado previo sin afectar la ruta de plataforma.
- Si existe un binding aún no canónico, revocarlo y liberarlo mediante sus transiciones CAS.
- Revertir el commit de aplicación solo si fallan los contratos; no borrar datos ni volúmenes.

## Criterio de cierre

- `www.enriquecarpet.com` resuelve y negocia HTTPS válido hacia el frontend.
- El binding pertenece únicamente a `Aladdin's Carpet`, está `active` y auditado.
- `canonical_mode=platform` sigue vigente.
- La ruta `/promo/aladdin-s-carpet` continúa operativa.
- Otras tiendas y Commerce no cambian.

