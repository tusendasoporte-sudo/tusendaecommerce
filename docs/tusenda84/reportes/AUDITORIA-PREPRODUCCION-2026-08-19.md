# Auditoría preproducción — 19 de agosto de 2026

## Regla de cambio

Producción no se actualizará hasta disponer de una copia integrada de `pb_data` fuera del servidor y comprobar una restauración aislada. Volver solo al contenedor anterior no es suficiente porque el despliegue nuevo incorpora migraciones de PocketBase.

## Punto actual de producción preservado

- Commit activo en frontend y backend: `6b95711`.
- Frontend: `tusenda-frontend-production` (`jtrit41bvul0opvg6b29mqc8`).
- Backend: `tusenda-pocketbase-production` (`v6xlthr74wt63ri2yhqvot1t`).
- Imagen frontend activa: `sha256:776cf22146aa88b08671f6300df59938abb39ac99bd0136858b227bb28a64201`.
- Imagen backend activa: `sha256:d7450a7a3b1de29f9f4d28b84f5a8b97e9c9a4700465da46970cff5b1b8d61b4`.
- Etiqueta de rollback frontend: `rollback/tusenda-frontend:prod-20260819-6b95711`.
- Etiqueta de rollback backend: `rollback/tusenda-pocketbase:prod-20260819-6b95711`.
- Volumen persistente: `/data/coolify/pb_data_production` montado como `/app/pb_data`.
- Inventario observado: aproximadamente 151 MB; `data.db` 7,4 MB; `auxiliary.db` 94,2 MB; 1462 archivos de almacenamiento; aproximadamente 49,2 GB libres.

Las etiquetas se añadieron sin reiniciar, detener o redesplegar los contenedores productivos. En esa operación no se modificaron datos, variables, secretos, dominios ni configuración de ejecución de producción.

## Versión candidata validada

- Commit base candidato: `8b2ea4a` en `dev`; los ajustes de identidad storefront de esta auditoría siguen locales, sin commit ni push.
- Astro: `7.2.4`.
- Adaptador Node: `11.1.4`.
- PocketBase: `0.39.8`.
- Frontend local: build aprobado y 580/580 pruebas aprobadas.
- Backend local sobre PocketBase 0.39.8: 738 pruebas; 731 aprobadas, 7 omitidas por requerir entornos externos y 0 fallos.
- Frontend staging: deployment `htrrygwk8qsgo3gn7staa5mn`, éxito en 1m17s.
- Backend staging: deployment `kd1exc5d40gm8qkfq5wcfgip`, éxito en 25s.
- Smoke de tienda staging: HTTP 200.
- Salud de PocketBase staging: HTTP 200 con `API is healthy`.

## Riesgos de dependencias

La actualización eliminó las vulnerabilidades altas del frontend. `npm audit --omit=dev` conserva seis avisos moderados transitivos de `firebase-admin` por su dependencia de Google Cloud Storage (`uuid`, `gaxios`, `teeny-request` y `retry-request`). La aplicación usa App Check y Messaging, no Google Cloud Storage. `npm audit` no ofrece una corrección compatible: propone degradar `firebase-admin` a 10.3.0. No se aplicó esa degradación ni se forzaron dependencias mayores transitivas.

## Diferencias de infraestructura pendientes

- La identidad Firebase de clientes será compartida entre pruebas y producción por decisión operativa: producción construirá y publicará las APK, mientras staging se usará para probar cambios de motores sin publicar una APK competidora. Debe mantenerse esta separación de responsabilidades para no bifurcar la identidad instalada.
- Métricas deshabilitadas porque el servidor todavía no tiene Sentinel & Metrics habilitado; activarlo afectaría al servidor completo y requiere una decisión operativa separada.
- Canales de notificación sin configurar.
- Recursos sin límites explícitos.
- No hay almacenamiento S3 ni tarea programada que replique los backups fuera del host.
- Coolify se administra actualmente por HTTP directo en el puerto 8000.

## Configuración productiva preparada sin despliegue

- Se generaron secretos aleatorios independientes de 64 caracteres directamente para producción; no se imprimieron, no se copiaron desde staging y no se guardaron en Git.
- Frontend configurado en runtime con `PZ_STOREFRONT_INTERNAL_SECRET`, `PZ_STOREFRONT_PUSH_RELAY_SECRET` y `PZ_STOREFRONT_MEDIA_PUBLIC_ORIGIN`.
- Frontend preparado en runtime con `PZ_STOREFRONT_FIREBASE_PROJECT_ID=tu-senda-84-storefront-staging`, `PZ_POWERZONA_STOREFRONT_APP_KEY=powerzona-storefront-staging` y la credencial privada validada en `PZ_STOREFRONT_FIREBASE_SERVICE_ACCOUNT_JSON`. Las tres variables son solo-runtime y Coolify oculta sus valores después del guardado.
- Backend configurado en runtime con `PZ_STOREFRONT_INTERNAL_SECRET`, `PZ_STOREFRONT_CREDENTIAL_SECRET`, `PZ_STOREFRONT_PUSH_RELAY_URL`, `PZ_STOREFRONT_PUSH_RELAY_SECRET`, `PZ_STOREFRONT_MEDIA_PUBLIC_ORIGIN`, `PZ_STOREFRONT_PUSH_RELAY_ALLOW_HTTP`, `PZ_STOREFRONT_ENGINE_VERSION`, `PZ_STOREFRONT_ENGINE_REVISION`, `PZ_STOREFRONT_ENGINE_UPDATE_SEVERITY`, `PZ_STORE_APP_RUNNER_SECRET`, `PZ_ADMIN_APP_RUNNER_SECRET`, `PZ_STOREFRONT_APP_DOWNLOAD_PUBLIC_ORIGIN` y `PZ_STOREFRONT_APP_DOWNLOAD_SECRET`.
- Los dos pares que deben coincidir (`INTERNAL_SECRET` y `PUSH_RELAY_SECRET`) comparten valor únicamente entre frontend/backend de producción; los demás secretos son distintos.
- Mientras no exista DNS para `media.tusenda84.com`, el origen media se fijó de forma segura a `https://api.tusenda84.com`.
- Healthcheck backend preparado y habilitado: HTTP `localhost:8080/api/health`, código 200, intervalo 15 s, timeout 5 s, 5 reintentos y arranque 30 s.
- Healthcheck frontend preparado y habilitado: HTTP `localhost:4321/`, código 200, intervalo 15 s, timeout 5 s, 5 reintentos y arranque 30 s.
- Coolify indica que estos cambios se aplicarán en el próximo redeploy. No se reinició ni desplegó ningún servicio durante la preparación.
- Tras guardar la configuración, ambos servicios continúan en `6b95711`; `https://api.tusenda84.com/api/health` y `https://tusenda84.com/` responden HTTP 200.

## Puerta obligatoria antes del despliegue

1. [x] Crear un backup integrado de PocketBase que incluya ambas bases SQLite y `storage`.
2. [x] Descargarlo fuera del servidor y calcular SHA-256.
3. [x] Extraerlo en un directorio local aislado.
4. [x] Arrancar la restauración con PocketBase 0.38.2, que corresponde al estado productivo actual.
5. [x] Comprobar salud, integridad de SQLite, conteo de almacenamiento y una muestra de archivos.
6. [x] Guardar el checksum y la ruta de custodia.
7. [x] Preparar variables y healthchecks sin aplicarlos.
8. [x] Custodiar y validar la configuración Firebase y congelar las identidades de firma de las dos APK existentes.
9. [ ] Ejecutar la validación completa de los cambios locales, hacer commit/push y realizar el despliegue por etapas.

## Identidades Firebase y APK congeladas

Hay dos líneas de APK independientes. Sus paquetes, proyectos Firebase, claves de firma y secuencias de versión no deben mezclarse.

| APK | Paquete | Firebase | Versión auditada | Próximo `versionCode` mínimo | SHA-256 del certificado |
| --- | --- | --- | --- | ---: | --- |
| Administración | `com.tusenda84.admin` | `tu-senda-84` | `1.0.2` (`3`) | 4 | `0A:64:32:D6:49:20:70:A0:DB:AF:9A:E3:5C:CE:B8:E8:F3:1F:12:C3:DD:2F:44:6B:EF:AD:A2:41:6A:AB:2C:0F` |
| Clientes / storefront | `com.tusenda84.powerzona` | `tu-senda-84-storefront-staging` | `0.2.8` (`10`) | 11 | `12:5B:DC:CC:B5:53:0D:94:FC:7C:0C:E3:32:21:BE:78:52:96:0C:45:3E:D2:F0:47:46:29:82:FC:C5:4F:B3:72` |

- La APK administrativa conserva su proyecto Firebase `tu-senda-84`, su keystore `.secrets/mobile-admin-upload.jks` y sus propiedades `.secrets/mobile-admin-upload.properties`. Las APK locales `1.0.1` y `1.0.2` validaron firma v2 y certificado coincidente con ese keystore.
- La APK de clientes promueve sin cambios la identidad ya probada: proyecto `tu-senda-84-storefront-staging`, app ID `1:115337530324:android:8d3f78f8a93cdc1ea8e441`, `app_key=powerzona-storefront-staging`, keystore `.secrets/powerzona-storefront-staging.jks` y propiedades `.secrets/mobile-storefront-staging.properties`.
- `mobile-storefront/app/google-services.json` coincide con el proyecto y paquete de clientes. Su SHA-256 es `50F61765F028A25A3B75689DC43518E795819E4638CCB340C49A1CEAEE81F2BF`.
- La credencial `.secrets/firebase-storefront-staging.json` coincide con ese proyecto y quedó cargada en Coolify como secreto solo-runtime. Su SHA-256 es `8F23519A34981BAAEECE006682AEF10BAA9CCB7489FB75B754EFDD3CE4BC1CD0`.
- No hay una APK release final de clientes en el workspace para repetir la verificación binaria, pero el historial de pruebas documentado y el certificado del keystore coinciden. El siguiente build de producción deberá verificarse con `apksigner` antes de publicarlo.
- Los builds y publicaciones de ambas APK se harán desde producción. Staging conservará la estructura de pruebas y las actualizaciones de motores, pero no generará una segunda identidad ni publicará actualizaciones paralelas.
- El proyecto separado `tu-senda-84-storefront-prod` (número `244470635180`) y su app `1:244470635180:android:84cdeff9ce84d1c9679d09` quedan reservados y sin uso. Su `google-services.json` permanece custodiado en `.secrets/firebase-storefront-production-google-services.json`, SHA-256 `40489F475C961939F49D5E195575DA993F484EDE1E736CAB9B7FF705C1E92D9C`; no se eliminarán sin una decisión explícita.
- No se necesita debilitar la política de organización de Google Cloud ni crear una nueva clave Admin SDK productiva para esta estrategia.
- El panel Master ahora toma proyecto Firebase y `app_key` desde runtime, conserva como fallback la identidad histórica ya instalada y falla cerrado ante valores inválidos. La prueba focal quedó 6/6 y el build Astro terminó correctamente.

## Backup externo y restauración ensayada

- Backup nativo: `pre_staging_20260819_6b95711.zip`.
- Custodia fuera del servidor: `E:\Trabajo\PROYECTOS\backup_tusenda84\pre_staging_20260819_6b95711.zip`.
- Tamaño: 56.805.463 bytes (54,17 MB mostrado por PocketBase).
- SHA-256: `116366BD08B21BE0477A9BB76AC3CC902E13FE97EB9BA963CC3FF01AFA4F2D9A`.
- Contenido: 1.469 entradas, `data.db`, `auxiliary.db`, WAL/SHM, tipos y 1.462 archivos de `storage`.
- Tamaño descomprimido: 148.366.450 bytes.
- Restauración aislada arrancada con PocketBase `0.38.2`, hooks y migraciones del commit `6b95711`, y `--automigrate=false`.
- Salud restaurada: HTTP 200 con `API is healthy`.
- Integridad antes y después del arranque: `PRAGMA integrity_check = ok` en `data.db` y `auxiliary.db`.
- Almacenamiento restaurado: 1.462 archivos, 40.993.193 bytes, ningún archivo vacío y cinco hashes de muestra calculados correctamente.
- La instancia aislada fue detenida después de la validación. El backup externo se conserva sin modificaciones.

## Orden de promoción y rollback

Promoción: backup verificado → variables runtime → backend → salud/migraciones → frontend → smokes funcionales.

Rollback ante fallo: detener promoción → restaurar `pb_data` completo desde la copia verificada → iniciar la imagen backend etiquetada de `6b95711` → comprobar `/api/health` → iniciar la imagen frontend etiquetada de `6b95711` → comprobar tienda, login, catálogo y pedido de lectura.

## Estado

`PUERTA DE ROLLBACK APROBADA; DESPLIEGUE AÚN BLOQUEADO`. El backup externo y la restauración aislada quedaron verificados; las identidades de las dos APK y la configuración Firebase compartida de clientes quedaron congeladas; las variables runtime y los healthchecks están preparados sin aplicar. Falta validar por completo los cambios locales, hacer commit/push y ejecutar la promoción controlada de backend y frontend. También permanecen como mejoras operativas Sentinel/Metrics, notificaciones, límites y backup remoto. Producción continúa sirviendo `6b95711`.
