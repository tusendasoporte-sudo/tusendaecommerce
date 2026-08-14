# PowerZona Storefront — prerrequisito C06A

Este proyecto contiene únicamente el cliente técnico mínimo autorizado para resolver la puerta de Firebase App Check/Play Integrity de PZ-APP-C03. No es todavía la app pública final: no incluye WebView, campañas, deep links, marca final ni artefactos de producción.

## Fronteras de seguridad

- Paquete de staging: `com.tusenda84.powerzona`, igual a la app Firebase storefront ya registrada.
- El FID, token App Check y credencial de instalación permanecen en código nativo.
- La credencial se cifra mediante Android Keystore antes de guardarse localmente.
- La interfaz y los logs nunca muestran FID, token, credencial, IP o secretos.
- Solo se admite un origen HTTPS sin ruta, query, fragmento, credenciales ni puerto distinto de 443.
- La variante `release` de producción falla de forma deliberada durante C06A.
- La rotación de FID permanece deshabilitada salvo una compilación explícita de prueba.

## Archivos privados obligatoriamente fuera de Git

La raíz del repositorio ya ignora `.secrets/`. `mobile-storefront/.gitignore` excluye además `app/google-services.json`, keystores y builds.

La configuración local de firma se guarda en:

```text
.secrets/mobile-storefront-staging.properties
```

con estas claves, sin registrar sus valores en documentación o logs:

```properties
storeFile=powerzona-storefront-staging.jks
storePassword=VALOR_PRIVADO
keyAlias=powerzona-storefront-staging
keyPassword=VALOR_PRIVADO
```

La clave y las contraseñas deben conservarse en un gestor de contraseñas o backup cifrado separado. Perder la clave de staging obliga a reinstalar la app y registrar una nueva huella. Nunca se reutilizará como clave de producción.

Para compartir una única identidad segura entre un worktree de preparación y `dev`, se puede apuntar Gradle a la ubicación privada mediante `PZ_STOREFRONT_SIGNING_PROPERTIES`. La variable contiene solo la ruta; las contraseñas permanecen dentro del archivo privado.

## Verificación de la huella

La SHA-256 se obtiene del certificado público de la clave real de staging con `keytool -list -v`. Después de compilar, debe verificarse nuevamente desde el APK con `apksigner verify --print-certs`. Ambos digests deben coincidir antes de modificar Firebase.

Huella pública vigente de staging, verificada desde el keystore y la APK:

```text
12:5B:DC:CC:B5:53:0D:94:FC:7C:0C:E3:32:21:BE:78:52:96:0C:45:3E:D2:F0:47:46:29:82:FC:C5:4F:B3:72
```

Firebase App Check está registrado con Play Integrity para distribución exclusiva fuera de Play: `Device integrity` requerido, `PLAY_RECOGNIZED` y `LICENSED` no requeridos, TTL de una hora y enforcement deshabilitado durante la matriz C03.

La futura versión distribuida por Google Play se probará por separado con la huella de la **clave de firma de aplicación de Play**, no solamente con la clave de carga.

## Comandos locales

Pruebas unitarias sin credenciales:

```powershell
./gradlew.bat testDebugUnitTest
```

APK de staging, después de configurar los tres recursos privados y el origen HTTPS real:

```powershell
./gradlew.bat assembleStaging `
  -PPZ_STOREFRONT_API_BASE_URL="https://ORIGEN-STAGING" `
  -PPZ_ALLOW_STAGING_DESTRUCTIVE_TESTS=false
```

La APK se genera en `app/build/outputs/apk/staging/app-staging.apk` y permanece fuera de Git.

## Orden manual de C03

La aprobación exige un teléfono Android físico. El emulador debe fallar cerrado y no se habilita el proveedor App Check debug para sustituir la atestación real. Antes de empezar debe existir una única `storefront_app_configs` activa en PocketBase staging que vincule el Firebase app id con PowerZona.

1. Registrar instalación.
2. Repetir registro y confirmar que no crea duplicado.
3. Habilitar y ejecutar rotación solo con autorización y evidencia previa.
4. Enviar heartbeat.
5. Conceder o denegar notificaciones y actualizar el permiso.
6. Crear y consumir el bootstrap de un solo uso.
7. Desactivar la instalación al finalizar.

Firebase, staging y cualquier proceso existente requieren aviso previo con impacto y prueba manual antes de cambiarse.
