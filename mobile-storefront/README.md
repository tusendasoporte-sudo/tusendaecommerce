# Storefront Android white-label — PZ-APP-C10

Este proyecto es el template Android reproducible de Tu Senda 84. La marca, URL, `applicationId`, proyecto Firebase, distribución y versión se seleccionan mediante configuración; no se copia ni edita el código fuente por tienda.

Toda APK/AAB `Release` deriva su origen nativo de producción desde `store.url`. Por ejemplo, `https://tusenda84.com/t/powerzona` fija `https://tusenda84.com` para registro de instalaciones, App Check y analítica nativa. Un valor alternativo de `PZ_STOREFRONT_API_BASE_URL` solo cambia la variante `Staging`; no puede desviar una release confirmada ni las apps nuevas a staging.

El frontend Master no ejecuta Gradle. Crea una vista previa inmutable y, tras una primera confirmación, deja el trabajo en cola sin hacerlo reclamable. Un segundo control, **Autorizar ejecución manual**, habilita durante diez minutos una sola ejecución ligada al ID, SHA-256 de la vista previa, release Git y capacidades exactas. Cuando el usuario abre el acceso directo local, `runner/run-job-queue.ps1` registra una señal fresca, reclama únicamente el trabajo asignado, llama a `runner/store-app-runner.ps1` y termina después de esa ejecución.

## Runner manual y acceso directo

`runner/install-local-runner-shortcut.ps1` crea en el escritorio **Tu Senda 84 - Ejecutar runner**. No instala servicios ni procesos persistentes y no contiene contraseñas en sus argumentos. El checkout indicado por `EngineRoot` debe ser Git, estar limpio y contener el commit aprobado. `-RegisterNow` envía únicamente el heartbeat inicial; no reclama trabajos, no compila y no ejecuta acciones administrativas.

- registro previo y última señal del runner;
- versión y revisión exactas del motor;
- si Firebase y firma están permitidos por la política local;
- estado pendiente, autorizado, en ejecución o completado.

Ejemplo de instalación desde un checkout aislado y limpio:

```powershell
.\mobile-storefront\runner\install-local-runner-shortcut.ps1 `
  -PocketBaseUrl 'https://api.tusenda84.com' `
  -ApiBaseUrl 'https://tusenda84.com' `
  -RunnerId 'windows-storefront-01' `
  -SecretsRoot 'C:\ruta\privada\storefront-runner' `
  -GoogleCloudOrganizationId '<organizacion>' `
  -EngineRoot 'C:\ruta\checkout-limpio' `
  -AllowFirebase `
  -AllowSigning `
  -RegisterNow
```

### Cómo ejecutarlo cada vez que haga falta

1. En Master, crear y revisar la vista previa.
2. Confirmarla para dejar el trabajo en cola.
3. Presionar **Autorizar ejecución manual**.
4. Dentro de los diez minutos siguientes, iniciar sesión en la PC de compilación y abrir **Tu Senda 84 - Ejecutar runner**.
5. No escribir ni cerrar la ventana de PowerShell. El runner valida credenciales, checkout, motor, Firebase, firma y SHA-256 antes de ejecutar efectos.
6. Esperar a que la ventana se cierre sola. El runner procesa como máximo un trabajo y termina tanto si no encuentra autorización como después de completar o reportar un fallo.
7. Volver a Master: el panel se actualiza automáticamente mientras el trabajo está activo.

La PC solo necesita estar encendida durante el build y el usuario custodio debe iniciar sesión porque las credenciales usan DPAPI CurrentUser. El panel web no abre programas en la PC: prepara una autorización de un uso para el runner registrado. Si pasan diez minutos, la autorización vence. Una señal fresca incompatible —checkout modificado, release distinta o capacidad local ausente— impide el claim aunque Master hubiera autorizado usando el registro anterior.

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
- `brands/powerzona/notification_icon.xml`: `19a2022d73ed75de4fe19eccef4e4b3251d8c42fa49b586db339ee5eea24eab7` (marcado `-text` para conservar bytes idénticos en el runner Windows).
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

El APK directo incluye el permiso Android para solicitar instalaciones privadas. El AAB se construye en modo `PZ_STOREFRONT_PLAY_BUNDLE=true`, usa un manifiesto separado sin ese permiso y delega las actualizaciones a Google Play. El runner impide usar el modo Play para fabricar el APK directo y también impide crear un AAB sin ese aislamiento.

- `{store}-{version}-{code}-direct.apk`;
- `{store}-{version}-{code}-play.aab`, solo PowerZona;
- `SHA256SUMS.txt`;
- `INSTRUCCIONES.txt`;
- `build-manifest.json`, solo Master.

## Custodia y entrega C10.7

El runner no conserva la ruta local como mecanismo de entrega. Después de compilar, sube cada salida por el endpoint interno autenticado y solo solicita completar el trabajo cuando APK, AAB, checksums, instrucciones y manifiesto quedaron almacenados como archivos protegidos de PocketBase. El backend los mantiene primero en `staged` y los promueve de forma transaccional a `available`; un archivo ausente o distinto bloquea `succeeded`.

En el contenedor actual, SQLite y los archivos administrados por PocketBase viven bajo `/app/pb_data`. Ese directorio debe ser un volumen persistente real, y el backup y la restauración deben cubrir conjuntamente base y `pb_data/storage`. Antes de desplegar C10.7 hay que verificar el montaje en el servidor privado; una carpeta efímera dentro del contenedor no sirve como custodia.

La instancia privada de File Browser en `mi-descarga.com` puede utilizarse como consola operativa, pero no es el origen canónico de descarga. La carpeta vacía `Apps-Android` no demuestra ni sustituye el volumen `/app/pb_data`, y los enlaces portadores `/share/<token>` no sustituyen el endpoint HMAC de PowerZona. No debe duplicarse ni cargarse un APK allí sin diseñar y autorizar por separado un volumen compartido.

El backend necesita estas variables, separadas del secreto del runner:

- `PZ_STOREFRONT_APP_DOWNLOAD_PUBLIC_ORIGIN`: origen HTTPS público de la API, sin ruta final;
- `PZ_STOREFRONT_APP_DOWNLOAD_SECRET`: secreto aleatorio de al menos 32 caracteres para las capacidades HMAC.

Cada APK disponible recibe un enlace permanente e inmutable ligado a su registro, nombre, tamaño y SHA-256. Una actualización genera otro artefacto y otro enlace; el enlace antiguo nunca cambia silenciosamente de bytes. Retirar la distribución o eliminar el archivo revoca la descarga. El panel Master prepara el texto de WhatsApp con enlace, checksum e instrucciones, pero no envía mensajes ni abre sesiones durante la automatización.

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

## Cola administrativa C10.6

`runner/run-job-queue.ps1` atiende antes de los builds las acciones privadas de eliminación ya confirmadas por el Master. Para artefactos C10.7 administrados por PocketBase, el runner confirma cada ID exacto y el backend elimina el archivo protegido al completar la acción. El camino heredado solo acepta `delete_artifacts` o `delete_app`, comprueba el inventario inmutable y valida nombre, tamaño, SHA-256 y pertenencia exacta a `mobile-storefront/releases` antes de borrar archivos individuales.

No usa borrado recursivo ni sigue una ruta fuera de esa custodia. `delete_artifacts` admite solo APK/AAB; `delete_app`, después de los 30 días de recuperación controlados por PocketBase, incluye cualquier artefacto restante del perfil. Un archivo ya ausente se considera convergencia idempotente, pero un archivo alterado, una ruta externa o un directorio en lugar de archivo fallan cerrado y dejan la acción en `needs_attention`.

Retirar o reactivar distribución no llega al runner y nunca elimina archivos. La suspensión de la tienda web tampoco forma parte de esta cola.

## Actualizaciones

El motor `1.3.0` permite que una marca versionada reemplace el icono pequeño de las notificaciones. PowerZona usa su monograma `PZ` monocromático y conserva el icono completo a color de la aplicación.

El motor `1.3.2` mantiene App Set ID como señal antifraude opcional. Si Google Play services no lo entrega a tiempo, la aplicación registra igualmente su FID ya aceptado por FCM y deja una traza técnica segura sin exponer identificadores ni credenciales.

`Update` exige un `versionCode` mayor y reutiliza de forma inmutable:

- `app_key` y `applicationId`;
- proyecto y app Firebase;
- certificado de firma de app;
- clave de subida Play, cuando aplica.

Si falta cualquiera de esos datos, el runner falla cerrado. Nunca rota o sobrescribe un keystore existente.

El motor `1.1.0` incorpora la actualización privada dentro de la app. El motor `1.2.0` añade la confirmación no bloqueante de APK verificada para la analítica de instalaciones. Al abrir una release de producción, la instalación se registra con App Check y consulta una política ligada a su credencial, paquete y versión. Las instalaciones procedentes de Google Play abren la ficha oficial; las instalaciones directas solicitan un ticket aleatorio de un solo uso y dos minutos. El APK descargado se acepta únicamente si coinciden tamaño, SHA-256, paquete, `versionCode` superior y certificado de firma con la app instalada. Android siempre muestra su instalador: no existe instalación silenciosa. Si el reporte analítico falla, la instalación continúa y el siguiente inicio confirma la versión activa.

El Master publica cada APK inicialmente como actualización opcional y luego puede volverla obligatoria, pausarla, reanudarla o retirarla sin reconstruir. Pausar o retirar revoca tickets y enlaces nuevos y elimina cualquier mínimo obligatorio para evitar bloquear una app sin una descarga disponible.

PowerZona puede adoptar su identidad histórica `0.2.8` (`versionCode` 10) sin recrear Firebase, paquete, certificado, icono o splash. En ese perfil los recursos actuales se heredan cuando no se cargan reemplazos; una app completamente nueva sí exige ambos archivos. La primera transición a `0.2.9` debe instalarse manualmente porque `0.2.8` todavía no contiene este motor. Desde la versión que incluya `1.2.0`, las siguientes publicaciones ya se anuncian dentro de la app y reportan verificación e instalación sin convertir la telemetría en requisito operativo.

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
