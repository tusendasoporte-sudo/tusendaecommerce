# TS84-PROMO-STG-COOLIFY-0001 — preparación y despliegue de staging en Coolify

| Campo | Valor |
|---|---|
| Fecha | 2026-08-25 |
| Estado | **COMPLETADO CON DESVIACIÓN DOCUMENTADA DE SECUENCIA DE BACKUP** |
| Rama | `dev` |
| Commit desplegado | `1a953718f1bc21aa5542ec766e5d111f49b96ee8` (`1a95371`) |
| Entorno | proyecto Coolify `tusenda-staging`, recursos `powerzona-frontend-staging` y `powerzona-pocketbase-repo-staging` |
| Dominio provisional | `https://mob76fcvxkxyb8tq0nwys18o.91.99.99.83.sslip.io` |
| Commit local del reporte | no creado; el documento queda sin commit |

## 1. Resultado ejecutivo

El commit autorizado `1a95371` está publicado en `origin/dev` y desplegado en los dos servicios de Coolify staging. Frontend y PocketBase están `Running`; el frontend quedó protegido por HTTPS, `Host` exacto, canonical público de plataforma y antiindexación global. PocketBase responde salud `200` y conserva su volumen persistente.

La preparación técnica quedó lista para `TS84-PROMO-STG-0001`. No se creó Aladdin's Carpet ni se ejecutó su smoke funcional, conforme al límite del prompt.

Se registró una desviación de proceso: el `git push` disparó webhooks automáticos de ambos recursos y PocketBase aplicó las migraciones antes de que pudiera ejecutarse el backup manual previsto. No existía un repositorio de backup específico previo. Se creó inmediatamente después un snapshot consistente, recuperable y verificado del volumen ya migrado. Por tanto, existe recuperación del estado desplegado, pero no una copia manual exacta del estado inmediatamente anterior a las migraciones de este run.

## 2. Precondiciones Git y autorizaciones

### 2.1 Precondiciones

| Control | Resultado |
|---|---|
| Rama inicial | `dev` |
| HEAD inicial | `1a95371` |
| Worktree inicial | limpio |
| Relación inicial con remoto | `dev` estaba 37 commits por delante de `origin/dev` |
| Remote | repositorio GitHub del proyecto, sin credenciales impresas |
| Estado después del push | `dev...origin/dev`, sincronizados en `1a95371` |

Se leyeron y respetaron como contratos el mapa maestro, el prompt `TS84-PROMO-STG-COOLIFY-0001`, los cierres `QA-AUTO-0001` y `QA-VIS-0001`, y sus dependencias de arquitectura, seguridad, dominio, shell, SEO, rendimiento y accesibilidad.

### 2.2 Autorización recibida

El usuario aprobó en esta conversación:

- el gate humano de `TS84-PROMO-QA-VIS-0001`;
- ejecutar exclusivamente `TS84-PROMO-STG-COOLIFY-0001`;
- usar la sesión de Coolify staging ya abierta;
- publicar `dev@1a95371`, desplegar/reiniciar staging, preparar backup, aplicar migraciones y realizar pruebas HTTP/navegador.

No se obtuvo ni se necesitó autorización para producción, Cloudflare, DNS, dominios custom, secretos, releases o prompts posteriores.

## 3. Inventario externo saneado

| Elemento | Resultado |
|---|---|
| Coolify | `v4.0.0` |
| Proyecto | `tusenda-staging` |
| Etiqueta interna de environment | `production` dentro del proyecto de staging; no es el proyecto `tusenda-production` |
| Frontend | `powerzona-frontend-staging`, Nixpacks, Node 22 en build, puerto 4321 |
| PocketBase | `powerzona-pocketbase-repo-staging`, Dockerfile, PocketBase 0.39.8, puerto 8080 |
| Frontend público | `https://mob76fcvxkxyb8tq0nwys18o.91.99.99.83.sslip.io` |
| PocketBase público | `https://imdbiodgr30k0dbhx3wtlysj.91.99.99.83.sslip.io` |
| Red interna backend | alias `powerzona-pocketbase-staging` |
| Volumen | persistente en `/app/pb_data`; nombre saneado registrado en la sección de backup |
| Proxy | Traefik, routers HTTP/HTTPS con regla `Host` exacta y LetsEncrypt |
| Rollback de imágenes | retención configurada en 2; imágenes actuales y anteriores disponibles |

No se consultaron cookies, tokens, contraseñas, claves, valores de variables ni contenido privado. Los nombres de configuración requeridos se validaron desde contratos locales y por comportamiento desplegado; sus valores preexistentes no se leyeron. El reconocimiento de la ruta `/promo/...` en el host provisional confirma que el host de plataforma está configurado de forma exacta. Las páginas Commerce `200` y PocketBase `200` confirman la conectividad frontend/backend prevista.

## 4. Topología, plataforma y canonical

```text
cliente HTTPS
  -> Traefik, Host exacto sslip.io
    -> powerzona-frontend-staging:4321
      -> PocketBase por red interna
        -> volumen persistente /app/pb_data
```

El host `sslip.io` se usa exclusivamente como host de plataforma de staging:

- no se creó `promo_domain_binding`;
- no se cambió `canonical_mode` a `custom`;
- no se añadió alias, wildcard o suffix matching;
- `PUBLIC_SITE_URL` se fijó en el frontend staging a `https://tusenda84.com`, valor público no secreto, para impedir que el host provisional se materialice como identidad canónica;
- el navegador confirmó canonical raíz `https://tusenda84.com/` después del redeploy.

## 5. Verificación local previa

Entorno local: Windows, Node `v24.16.0`, npm `11.13.0`.

| Comando | Resultado exacto |
|---|---|
| `$promoTests = Get-ChildItem tests -Filter 'promo*.test.mjs'; node --test $promoTests` | frontend Promo: 109/109 PASS |
| `$promoTests = Get-ChildItem tests -Filter 'pz_promo_*.test.cjs'; node --test --test-concurrency=4 $promoTests` | backend Promo: 156/156 PASS |
| `node --test` en frontend | 755/755 PASS |
| `node --test --test-concurrency=4` en backend | primer run: 898 PASS, 5 `EPERM` de sandbox, 7 SKIP, 0 fallos funcionales |
| repetición serial fuera del sandbox de los cinco runtime `EPERM` | 5/5 PASS; total efectivo backend: 903 PASS, 7 SKIP, 0 FAIL |
| `npm.cmd run build` | Astro SSR PASS |
| `node scripts/verify-promo-accessibility.mjs` | contrato `promo.accessibility.local.v1` completo PASS |
| `node scripts/verify-promo-performance.mjs` | contrato `promo.performance.local.v1` PASS; transferencia inicial máxima 419,973 B, 8 requests, 0 video antes de interacción |
| `git diff --check` | PASS |
| `git status -sb` antes del reporte | limpio y sincronizado con `origin/dev` |

Las suites cubren `security.checkOrigin`, Host/Origin fail-closed, CSP Promo, tenant A/B, rutas platform/custom, caché, medios, ARC-ADR-010, i18n, accesibilidad, Commerce y Landing QR.

## 6. Push y deployments exactos

### 6.1 Publicación Git

```text
git push origin dev
8464b9d..1a95371  dev -> dev

git ls-remote origin refs/heads/dev
1a953718f1bc21aa5542ec766e5d111f49b96ee8 refs/heads/dev
```

### 6.2 Webhook automático

| Servicio | Deployment | Inicio UTC | Fin UTC | Resultado |
|---|---|---:|---:|---|
| PocketBase | `m13u95utcyzsbg39eh3vbt16` | 17:55:46 | 17:56:08 | Success, `1a95371` |
| Frontend | `zsifw0wm7t6fx3rawvrq7zu3` | 17:55:45 | 17:58:36 | Success, `1a95371` |

El frontend se redeployó manualmente sobre el mismo commit para aplicar canonical y headers de staging. El deployment final fue:

| Deployment | Inicio UTC | Fin UTC | Resultado |
|---|---:|---:|---|
| `iog3z6hhtvx4qbo0a5yvshtg` | 18:18:56 | 18:20:13 | Success, `1a95371` |

No se desplegó otro commit ni se modificó código de aplicación durante esta ejecución.

## 7. Migraciones exactas

PocketBase ejecuta el mecanismo oficial al iniciar:

```dockerfile
COPY pb_migrations /app/pb_migrations
CMD ["./pocketbase", "serve", "--http=0.0.0.0:8080"]
```

El runtime aplicó/reconoció estas migraciones Promo, verificadas en el historial embebido de `data.db` sin consultar registros de negocio:

1. `1787520000_promo_tenant_foundation`
2. `1787520100_promo_authoring_media`
3. `1787520200_promo_revision_publication`
4. `1787520300_promo_audit_analytics`
5. `1787520400_promo_permissions`
6. `1787520500_promo_publication_zero_generation`
7. `1787520600_promo_analytics_landing_qr`

Los logs saneados muestran arranque correcto a las `17:56:09 UTC` y reinicio posterior al backup a las `18:01:52 UTC`, ambos en `0.0.0.0:8080`. La salud pública posterior respondió `200`.

No se ejecutó `down`, backfill manual, seed, acceso a registros ni creación de Aladdin. Las pruebas runtime previas verificaron migración idempotente, colecciones privadas, aislamiento A/B y rollback fail-closed con datos.

## 8. Backup y rollback

### 8.1 Desviación de secuencia

El push activó el webhook antes del backup manual. No se encontró `/var/backups/powerzona-pocketbase-staging` antes de este run. No es posible reconstruir retroactivamente una copia manual pre-migración; esta limitación queda abierta como evidencia histórica, no como defecto funcional del estado actual.

### 8.2 Snapshot recuperable creado

Se detuvo brevemente solo PocketBase, se archivó la raíz exacta del volumen y se reinició el mismo contenedor.

| Campo | Resultado |
|---|---|
| Timestamp base | `2026-08-25T17:59:30Z` |
| Archivo | `/var/backups/powerzona-pocketbase-staging/pb_data-postdeploy-1a95371-20260825T175930Z.tar.gz` |
| Alcance | contenido completo del volumen `imdbiodgr30k0dbhx3wtlysj-powerzona-pocketbase-repo-staging` |
| Tamaño | 98,626,799 bytes |
| Entradas verificadas | 195 |
| SHA-256 | `aa10662550e9b57b691e5a6656b040ea6532e790c7986dc362e608facc17dafb` |
| Permisos | directorio `700`, archivo `600`, `root:root` |
| Integridad | `tar -tzf ... | wc -l` terminó correctamente |
| Reinicio | contenedor `running`; `/api/health` 200 |

Restauración documentada y no ejecutada sobre datos vivos: detener PocketBase, apartar de forma recuperable el contenido actual del volumen, extraer el tar en la raíz exacta, verificar ownership/permisos, iniciar PocketBase y repetir health/smoke. No se ensayó una restauración destructiva porque el prompt prohíbe borrar o sobrescribir datos; la legibilidad, huella y alcance del archivo sí fueron verificados.

### 8.3 Rollback de aplicación

Coolify conserva imágenes de `1a95371`, `8464b9d` y `3be9e63` para ambos servicios, con control `Rollback` disponible. Se validó su disponibilidad sin ejecutarlo. Para rollback de aplicación, el candidato inmediato es `8464b9d`; el volumen no se elimina ni se reemplaza. Las migraciones Promo son aditivas y los `down` con datos permanecen fail-closed.

## 9. Antiindexación y headers de staging

### 9.1 Defecto detectado

Antes de la corrección, `GET /` respondía `200` sin `X-Robots-Tag` y el HTML declaraba canonical al host provisional. La ruta Promo no publicada sí tenía CSP/noindex/no-store por aplicación, pero no todo el origen cumplía el gate.

### 9.2 Corrección acotada

Solo en `powerzona-frontend-staging` se configuró:

- `PUBLIC_SITE_URL=https://tusenda84.com`;
- middleware Traefik `ts84-staging-security` con `X-Robots-Tag`, HSTS, `nosniff`, frame deny, referrer policy y permissions policy;
- routers `ts84-staging-http` y `ts84-staging-https` con `Host` exacto, `PathPrefix('/')` y prioridad 100, reutilizando los mismos servicios generados por Coolify.

Se necesitó un router separado porque Coolify fuerza el router generado HTTPS a `middlewares=gzip`. Los labels personalizados quedan deliberadamente en modo editable; marcar `Readonly labels` los regenera y elimina.

No se añadió CSP global a Commerce para no romper sus scripts y conexiones existentes. La superficie Promo conserva su CSP contractual propia, verificada en la respuesta `404` no publicada. La antiindexación global se impone mediante `X-Robots-Tag`, que es efectiva para HTML y recursos aunque las plantillas Commerce no dupliquen una meta robots de staging.

### 9.3 Headers representativos finales

`GET /`:

```text
HTTP/1.1 200 OK
Strict-Transport-Security: max-age=31536000
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-Robots-Tag: noindex, nofollow, noarchive
```

`GET /promo/ts84-staging-no-publicado`:

```text
HTTP/1.1 404 Not Found
Cache-Control: private, no-store, max-age=0
Content-Security-Policy: default-src 'self'; ...
X-Robots-Tag: noindex, nofollow, noarchive
```

`/sitemap.xml` responde `404` y `noindex`. El canonical raíz observado en navegador es `https://tusenda84.com/`, nunca el host provisional.

## 10. Matriz técnica desplegada

| Caso | Resultado |
|---|---|
| HTTP raíz | `302` al mismo host por HTTPS, también `noindex` |
| HTTPS raíz | `200`, TLS válido, HSTS y headers de seguridad |
| Host de plataforma exacto | aceptado |
| Host por sufijo `attacker.<host>` | `503`, sin ruta |
| Host arbitrario | rechazado por Traefik, sin llegar a la aplicación |
| Origin cross-site en mutación Promo | `403` fail-closed |
| Origin same-origin sin auth | supera el rechazo de Origin y termina neutralmente en `404` |
| `X-Forwarded-Host` | no se usa como autoridad; cubierto además por suites focales Host/XFH |
| Promo no publicado | `404`, genérico, CSP, `no-store`, `noindex` |
| Sitemap de staging | `404`, `noindex` |
| Admin | `302` a autenticación central, `noindex` |
| Master | `302` a autenticación central, `noindex` |
| PocketBase health | `200`, `nosniff` |
| Commerce `/t/powerzona` | `200`, inspección visual desktop correcta |
| Commerce búsqueda | `200` |
| Commerce checkout | `200` |
| Landing QR `/t/powerzona/links` | `200` |
| Tenant A/B | PASS en runtime backend y suites completas |

No se creó sitio Promo ni se consultó contenido privado para probar `canonical_mode=platform`. El estado seguro verificable es la ausencia de Aladdin en este prompt, la ruta platform reconocida y el `404` genérico no publicado. La creación/publicación y la inspección funcional de ese estado pertenecen a `TS84-PROMO-STG-0001`.

## 11. Defectos, correcciones y pendientes

### `STG-CF-01` — staging global indexable

- Severidad inicial: alta.
- Evidencia: raíz `200` sin `X-Robots-Tag` y canonical al host provisional.
- Corrección: canonical público más router Traefik exacto y prioritario.
- Retest: PASS en raíz, Commerce, Admin, Master, sitemap, errores y ruta Promo.
- Estado: cerrado.

### `STG-CF-02` — labels personalizados regenerados/ignorados por router de Coolify

- Severidad: media operacional.
- Evidencia: al reactivar `Readonly labels`, Coolify eliminó el middleware; después el contenedor conservó el middleware, pero el router generado siguió fijado a `gzip`.
- Corrección: conservar labels personalizados y añadir routers exactos de prioridad 100.
- Retest: headers globales presentes.
- Estado: cerrado; no volver a marcar `Readonly labels` sin portar antes los routers custom.

### `STG-CF-LIM-01` — ausencia de backup manual pre-migración

- Causa: webhooks automáticos al publicar `origin/dev`.
- Impacto: no existe snapshot manual exacto inmediatamente anterior a las migraciones de este run.
- Mitigación: snapshot consistente postdeploy verificado, imágenes anteriores disponibles, migraciones aditivas y rollback destructivo fail-closed.
- Estado: limitación histórica documentada; no se puede corregir retroactivamente.
- Acción para próximos despliegues con migraciones: pausar/autodeploy o capturar el snapshot antes del push.

No quedan defectos críticos funcionales o de seguridad abiertos en el estado desplegado.

## 12. Límites respetados

- Cloudflare: no conectado, consultado ni modificado.
- DNS, zonas y dominios: no modificados.
- Certificados externos: no modificados; solo se usó el TLS administrado ya existente de Coolify.
- Custom domains/bindings/aliases: ninguno creado o modificado.
- Producción: no abierta ni desplegada.
- Secretos: no solicitados, leídos, impresos, escritos ni versionados.
- Dependencias/plugins: ninguno instalado.
- Migraciones/contratos compartidos: no se añadió ni modificó ninguno.
- Datos: no se creó Aladdin, seed, publicación, binding ni registro de negocio.
- Git: no hubo merge, release ni commit adicional.
- Prompts posteriores: `TS84-PROMO-STG-0001` no se ejecutó.

## 13. Gate de cierre y siguiente prompt

| Gate | Estado |
|---|---|
| `1a95371` desplegado en ambos servicios | PASS |
| HTTPS, Host, Origin y proxy | PASS |
| staging completo en `X-Robots-Tag: noindex, nofollow, noarchive` | PASS |
| canonical provisional eliminado | PASS |
| migraciones exactas aplicadas sin error | PASS |
| backup recuperable actual | PASS, con desviación pre-migración documentada |
| rollback de aplicación y datos documentado | PASS |
| plataforma sin binding custom | PASS |
| Commerce y Landing QR sin regresión técnica | PASS |
| Cloudflare/DNS/custom/producción intactos | PASS |
| defectos críticos abiertos | 0 |

Como el usuario aprobó también el gate humano de `TS84-PROMO-QA-VIS-0001`, el siguiente prompt habilitado es **`TS84-PROMO-STG-0001`**. Este reporte no lo inicia.
