# Storefront Android white-label — PZ-APP-C10

Este proyecto es el template Android reproducible de Tu Senda 84. La marca, URL, `applicationId`, proyecto Firebase, distribución y versión se seleccionan mediante configuración; no se copia ni edita el código fuente por tienda.

El frontend Master no ejecuta Gradle. Solo crea una vista previa inmutable y, tras una confirmación explícita, pone el trabajo en cola. El proceso privado `runner/run-job-queue.ps1` reclama trabajos mediante un secreto aislado y llama al motor `runner/store-app-runner.ps1` en un workspace Android dedicado.

## Versionado y alertas del motor

`config/engine.properties` identifica la release aprobada del código Android común. Cada build exitoso registra `engine_version` y el commit Git exacto; el perfil de la tienda conserva ambos valores. El resumen Master compara cada app con `PZ_STOREFRONT_ENGINE_VERSION` y, cuando se configura, `PZ_STOREFRONT_ENGINE_REVISION`.

Para publicar una evolución nativa común —por ejemplo, un futuro panel inferior—:

1. implementar y probar el cambio en el motor compartido;
2. incrementar `engine.version` siguiendo SemVer;
3. crear un commit limpio y desplegar ese mismo commit al runner aislado;
4. configurar backend con versión, revisión de 40 caracteres y severidad aprobadas;
5. revisar las alertas Master y crear una vista previa por tienda.

El cambio no compila ni distribuye automáticamente. Apps nuevas usarán la release aprobada; apps ya construidas mostrarán `Actualización disponible` hasta generar y entregar una nueva APK/AAB. Cambios exclusivos de marca/configuración o contenido web no deben incrementar el motor común.

## Configuraciones incluidas

| Configuración | Paquete | Firebase | Distribución | Publicable |
| --- | --- | --- | --- | --- |
| `powerzona` | `com.tusenda84.powerzona` | `tu-senda-84-storefront-staging` | APK directo + AAB Play | Sí |
| `demo` | `com.tusenda84.democ10` | ficticio, no creado | APK directo de prueba | No |

`config/schema.json` documenta el contrato. Cada archivo `config/{clave}.properties` debe tener un `application.id`, `app.key`, proyecto Firebase y clave de marca exclusivos. `scripts/validate-store-config.ps1` rechaza campos incompletos, hashes de recursos alterados, identidades duplicadas y archivos sensibles rastreados por Git.

Los recursos se validan contra `brands/{brand}/brand.json` y se copian a `app/build/generated/storefrontBrand/res`. El template nunca sobrescribe `app/src/main` para cambiar de marca.

Los hashes PowerZona vigentes son:

- `brands/powerzona/icon.png`: `e284d6746df6e11f22c344eac4a117855c61cf8e737a51db3cec1d7415c8dadb`.
- `brands/powerzona/splash.png`: `6934893ef19c110e30facc2ef87eb1a91a26d4b0346cd190f90ea02f3f007bdf`.

## Vista previa sin efectos externos

Desde la raíz del repositorio:

```powershell
.\scripts\build-store-app.ps1 powerzona -Operation Preview -PreviewFor Update -VersionCode 11 -VersionName 0.2.9
.\scripts\build-store-app.ps1 demo -Operation Preview -PreviewFor Provision -BuildType Debug
```

La salida se guarda bajo `mobile-storefront/build/previews/`, ignorada por Git. Incluye un SHA-256 ligado a identidad, Firebase, firma, versión y artefactos. `Preview` rechaza los switches de aprovisionamiento, firma y build.

## Compilación controlada

Una ejecución necesita la ruta y hash exactos de la vista previa confirmada, además de `-ExecuteBuild`. Release también exige `google-services.json` local y una configuración de firma externa:

```powershell
.\scripts\build-store-app.ps1 powerzona `
  -Operation Update `
  -VersionCode 11 `
  -VersionName 0.2.9 `
  -ConfirmedPreviewPath '<ruta-privada-preview>' `
  -ConfirmedPreviewHash '<sha256>' `
  -SigningPropertiesPath '<secreto-app-signing.properties>' `
  -UploadSigningPropertiesPath '<secreto-upload-signing.properties>' `
  -ExecuteBuild
```

PowerZona genera APK firmado con su clave de firma de app y AAB firmado con una clave de subida distinta. Las demás tiendas rechazan AAB y solo generan APK directo. La salida no se sobrescribe y contiene:

- `{store}-{version}-{code}-direct.apk`;
- `{store}-{version}-{code}-play.aab`, solo PowerZona;
- `SHA256SUMS.txt`;
- `INSTRUCCIONES.txt`;
- `build-manifest.json`, solo Master.

## Primer aprovisionamiento

`Provision` y `Update` son contratos distintos. Solo `Provision` puede crear un proyecto Firebase, registrar el paquete o generar claves. Esas acciones necesitan, además de la vista previa confirmada:

Antes de poner el trabajo en cola, Tu Senda 84 debe preparar en el workspace aislado la configuración versionable `config/{brand}.properties`, `brands/{brand}/brand.json` y sus recursos con hash. No contienen secretos. El runner compara esa identidad local con la vista previa del panel y marca `needs_attention` sin ejecutar efectos si falta o difiere cualquier dato.

- `-AllowFirebaseProvisioning` y `PZ_STORE_APP_RUNNER_ALLOW_FIREBASE=true`;
- `-AllowSigningGeneration` y `PZ_STORE_APP_RUNNER_ALLOW_SIGNING=true`;
- un `SecretsRoot` fuera del repositorio;
- identidad de Google Cloud ya autenticada en el runner;
- `PZ_GOOGLE_CLOUD_ORGANIZATION_ID` y, si corresponde, `PZ_GOOGLE_CLOUD_BILLING_ACCOUNT`.

El proveedor Firebase usa las API oficiales para crear/adoptar el proyecto, añadir Firebase, registrar Android y recuperar `google-services.json`. No crea claves de cuentas de servicio. El runner debe usar identidad de workload o credenciales custodiadas por Tu Senda 84.

Antes de reclamar el primer trabajo real, el checkout aislado debe ejecutar `runner/test-runner-readiness.ps1` con la versión, revisión, operación y marca exactas de la vista previa. La comprobación no crea recursos ni firmas: valida el commit limpio, Android SDK, Java/keytool, identidad activa de Google Cloud, autorizaciones, URL de API y custodia externa. `run-job-queue.ps1` repite obligatoriamente ese preflight después del claim y antes de cualquier efecto.

No se borra automáticamente un proyecto, app o firma ante un fallo parcial. El trabajo pasa a `needs_attention` y debe reanudarse tras auditoría.

## Actualizaciones

`Update` exige un `versionCode` mayor y reutiliza de forma inmutable:

- `app_key` y `applicationId`;
- proyecto y app Firebase;
- certificado de firma de app;
- clave de subida Play, cuando aplica.

Si falta cualquiera de esos datos, el runner falla cerrado. Nunca rota o sobrescribe un keystore existente.

## Secretos prohibidos en Git

`.gitignore` excluye `.secrets/`, `google-services.json`, cuentas de servicio, propiedades privadas de firma, keystores (`.jks`, `.keystore`, `.p12`, `.pfx`), claves, builds y releases. También se validan los archivos ya rastreados antes de cada build. No coloque contraseñas en propiedades `config/` o `brand.json`.

Variables sensibles del runner:

- `PZ_STORE_APP_RUNNER_SECRET`;
- `PZ_STORE_APP_KEYSTORE_PASSWORD` y `PZ_STORE_APP_KEY_PASSWORD`;
- credenciales Google gestionadas fuera de Git;
- `PZ_STOREFRONT_SIGNING_PROPERTIES` apuntando a un archivo privado.

En un runner Windows temporal, `runner/initialize-runner-custody.ps1` genera el secreto del runner y las contraseñas con aleatoriedad criptográfica, los cifra mediante DPAPI para el usuario actual y restringe la carpeta externa con ACL. `runner/invoke-local-runner.ps1` los descifra solo en memoria durante el proceso y restaura todas las variables al finalizar. La clave de firma y `google-services.json` siguen fuera del repositorio.

## Verificación local segura

```powershell
.\mobile-storefront\scripts\test-store-config.ps1
cd mobile-storefront
.\gradlew.bat testDebugUnitTest lintDebug assembleDebug -PPZ_STOREFRONT_CONFIG=powerzona --no-daemon
.\gradlew.bat testDebugUnitTest lintDebug assembleDebug -PPZ_STOREFRONT_CONFIG=demo --no-daemon
```

El wrapper fija el SHA-256 de Gradle 9.1.0. Las dependencias están bloqueadas en `app/gradle.lockfile` y verificadas en `gradle/verification-metadata.xml`.

Los builds Release también exigen un workspace Git limpio. La revisión guardada en `build-manifest.json` debe coincidir con la release aprobada por el backend; un desajuste termina en `needs_attention` antes de ejecutar efectos externos.
