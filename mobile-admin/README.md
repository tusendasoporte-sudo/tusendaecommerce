# Tu Senda 84 Admin para Android

Aplicacion Android ligera que abre el panel web de administracion de Tu Senda 84. La sesion, los pedidos, el catalogo, el inventario y el resto de los datos siguen usando la web y el backend existentes.

## Requisitos

- Android Studio o JDK 17/21.
- Android SDK 36.
- Gradle Wrapper incluido en este directorio.

## Generar un APK de prueba

En PowerShell, desde este directorio:

```powershell
./gradlew.bat assembleDebug
```

El APK se crea en `app/build/outputs/apk/debug/app-debug.apk`. Esta variante se firma automaticamente con la clave de desarrollo de Android y se puede instalar manualmente para pruebas.

### Ejecutar en el emulador contra produccion

Con un emulador Android ya iniciado, ejecuta desde este directorio:

```powershell
.\run-production-emulator.ps1
```

El script ejecuta las pruebas unitarias, compila la variante `debug` forzando
`https://tusenda84.com/admin`, instala el APK y abre la aplicacion. Si hay varios
emuladores conectados, indica uno de forma explicita:

```powershell
.\run-production-emulator.ps1 -DeviceId emulator-5554
```

Esta variante permite depurar el WebView, pero usa el backend real: despues de
iniciar sesion, cualquier alta, edicion o eliminacion afecta datos de produccion.
El script no genera, firma ni publica una variante `release`.

Para validar cambios locales de la web en el emulador antes de desplegarlos, inicia Astro escuchando en la red local y compila la variante `debug` contra el host especial del emulador:

```powershell
# Terminal 1
cd ../frontend-powerzona
npm run dev -- --host 0.0.0.0

# Terminal 2
./gradlew.bat assembleDebug `
  -PPZ_ADMIN_URL="http://10.0.2.2:4321/admin"
```

Solo la variante `debug` permite HTTP para esta validacion local. Las compilaciones `release` continúan bloqueando trafico sin HTTPS.

## Configuracion de marca o servidor

La misma base permite generar variantes para otra marca o URL administrativa:

```powershell
./gradlew.bat assembleDebug `
  -PPZ_APP_NAME="Mi Tienda Admin" `
  -PPZ_ADMIN_URL="https://tusenda84.com/t/mi-tienda/admin" `
  -PPZ_APPLICATION_ID="com.tusenda84.mitienda.admin"
```

`PZ_ADMIN_URL` debe usar HTTPS. La aplicacion mantiene dentro del WebView solamente el dominio configurado; WhatsApp, telefono, correo y otros dominios se abren con la aplicacion externa adecuada.

## Notificaciones push de Android

La app admite avisos de pedidos nuevos o pendientes, reseñas pendientes, stock bajo o agotado, vencimientos de productos y variaciones, seguridad y resultados de rifas aun cuando el panel este cerrado. El backend genera los eventos y Firebase conserva la entrega inmediata. Mobile Admin 2 añade una ruta de recuperación autenticada: cada instalación nace de un UUID local, recibe una credencial aleatoria guardada con Android Keystore y WorkManager recupera únicamente avisos no leídos de las últimas 72 horas. Por eso el registro básico, la sincronización y los recibos de entrega no dependen de que Firebase o el permiso de Android estén listos en el primer arranque.

El origen de PocketBase usado por esa recuperación queda fijado dentro del APK por el motor y se valida como HTTPS tanto al construir como al ejecutarse. El WebView no puede cambiar el destino de la credencial: la tarea en segundo plano usa `api.tusenda84.com` aunque la interfaz administrativa viva en `tusenda84.com`.

El payload de Firebase es solo de datos. La app valida sus campos, tienda, vencimiento y destino antes de mostrarlo; deduplica por ID de notificación y confirma recepción, visualización y lectura al backend. El panel Master muestra métricas agregadas de instalaciones activas, permisos, Firebase, sincronización reciente y origen de entrega sin exponer FID, UUID ni credenciales.

1. Crea o selecciona el proyecto en Firebase y registra la aplicacion Android.
2. Descarga `google-services.json` y guardalo localmente como `app/google-services.json`.
3. Configura Firebase Admin y `PZ_PUSH_RELAY_SECRET` solamente como secretos del servidor; consulta los archivos `.env.example` del frontend y backend.
4. Compila nuevamente la APK. Toda construcción `release` exige `google-services.json` y falla cerrada si falta; Firebase no se puede desactivar desde el panel. Una variante `debug` puede omitirlo únicamente para trabajo local que no se distribuirá.

`google-services.json`, cuentas de servicio, claves de firma y contrasenas estan excluidos de Git. No deben enviarse al repositorio ni incluirse en capturas.

## APK de produccion

La variante `release` requiere una clave privada de firma del propietario. No se guarda ninguna clave ni contrasena en el repositorio. En el flujo controlado, el backend reserva el siguiente `versionCode` y el runner lo entrega a Gradle; el panel no permite escribirlo. Antes de publicar en Google Play se debe configurar la firma de produccion y validar la ficha y las politicas vigentes de la tienda.

Para generar el Android App Bundle firmado que acepta Google Play, crea localmente
`.secrets/mobile-admin-upload.properties` con `storeFile`, `storePassword`, `keyAlias`
y `keyPassword`, y ejecuta:

```powershell
./gradlew.bat bundleRelease
```

El archivo resultante se crea en `app/build/outputs/bundle/release/app-release.aab`.
La clave de carga y su archivo de propiedades deben conservarse en un gestor de
contraseñas o una copia de seguridad cifrada; ambos están excluidos de Git.

Para generar una APK firmada que pueda instalarse directamente, ejecuta:

```powershell
./gradlew.bat assembleRelease
```

El archivo se crea en `app/build/outputs/apk/release/app-release.apk`. Firebase y
las notificaciones siguen funcionando en una instalación directa siempre que el
package ID, `google-services.json` y el servidor correspondan a la misma app.

Si Google Play App Signing usa una clave distinta de la clave de carga local, una
APK local y la versión instalada desde Play no pueden actualizarse entre sí. Para
permitir esa transición sin reinstalar, descarga desde Google Play Console una APK
universal firmada por Play después de subir el AAB.

## Entrega privada C10.8

C10.8 conserva este paquete y su firma, pero separa la entrega de las apps públicas:

- el constructor se identifica como `Tu Senda 84 Admin Engine 2.0.0`, contrato 2; su nombre, versión, contrato y revisión Git exacta están en `engine.json` y quedan registrados en cada trabajo y manifiesto;
- `versionCode` es una secuencia reservada por el backend al confirmar el build: una app nueva parte de base 0 y recibe 1; una compilación confirmada consume su número aunque falle;
- existe una sola identidad Android; paquete y firma se conservan entre preparación y publicación, y la versión base solo se puede corregir antes del primer build confirmado;
- Firebase es obligatorio y administrado por el motor: no es una opción por versión, el runner reutiliza la configuración externa existente y cada manifiesto confirma su inclusión;
- nombre visible, URL administrativa y color son editables; icono y splash son opcionales y, al desactivar la personalización, se usan los recursos incluidos en la versión del motor;
- icono y splash se guardan como PNG protegidos y versionados en PocketBase, se comprueban por dimensiones, bytes y SHA-256 y nunca se incorporan al repositorio;
- el APK queda como archivo protegido en PocketBase;
- el portal no concede acceso por sí mismo;
- cada descarga exige sesión de `store_admin`, tienda, dispositivo autorizado y una versión publicada para el paquete o canal exacto;
- el archivo usa un ticket de dos minutos y un solo uso;
- **Preparar y probar** concentra configuración, construcción, descarga de prueba y aprobación; **Publicación** no permite reconstruir ni editar identidad;
- el panel publica exactamente el APK aprobado, inicialmente como actualización opcional, y después permite hacerla obligatoria, pausarla, reanudarla o retirarla;
- una publicación queda disponible automáticamente para administradores activos y dispositivos autorizados actuales o futuros, sin crear asignaciones individuales;
- la app instalada consulta al abrir, muestra el aviso de nueva versión y reutiliza el mismo portal privado y verificación nativa;
- `minimum_supported_version_code` solo puede activarse después de aprobar y publicar la versión.

Mobile Admin pertenece a Tu Senda 84 y no a PowerZona. La misma app sirve para administrar tiendas, páginas promocionales o futuros tipos de proyecto siempre que todos entren por la URL administrativa central y el backend autorice las funciones disponibles para cada proyecto.

### Runner Admin independiente

El runner está en `runner/run-admin-app-job-queue.ps1`. Requiere el secreto exclusivo
`PZ_ADMIN_APP_RUNNER_SECRET`, una ruta externa a la firma ya existente y la configuración
Firebase existente. No comparte secreto, cola ni autorización con el constructor de apps
de clientes. Nunca crea una firma, un proyecto Firebase o una publicación.

En la PC de compilación se inicializa una sola vez la custodia cifrada fuera del
repositorio. `-CopyRunnerSecretToClipboard` es opcional y se usa solo para copiar el mismo
valor a la variable protegida `PZ_ADMIN_APP_RUNNER_SECRET` del backend:

```powershell
./runner/initialize-admin-runner-custody.ps1 `
  -SecretsRoot 'C:\TuSenda84\AdminRunner' `
  -SigningPropertiesPath 'C:\TuSenda84\Signing\mobile-admin-upload.properties' `
  -CopyRunnerSecretToClipboard
```

Después de desplegar un commit limpio y configurar en el backend
`PZ_ADMIN_ENGINE_VERSION=2.0.0`, `PZ_ADMIN_ENGINE_REVISION=<commit de 40 caracteres>`
y `PZ_ADMIN_API_BASE_URL=https://api.tusenda84.com`,
se registra el runner y se crea el acceso directo manual:

```powershell
./runner/install-admin-runner-shortcut.ps1 `
  -ApiBaseUrl 'https://api.tusenda84.com' `
  -RunnerId 'tu-senda-84-admin-pc' `
  -SecretsRoot 'C:\TuSenda84\AdminRunner' `
  -RegisterNow
```

El flujo normal es: confirmar el trabajo en Master, pulsar **Autorizar Runner Admin** y
abrir **Tu Senda 84 - Construir App Admin** antes de que venza la autorización de diez
minutos. El acceso directo procesa como máximo un trabajo y no contiene el secreto. No
es necesario mantener un segundo proceso permanente; `-ServiceMode` queda disponible si
en el futuro se decide operar el runner como servicio.

Staging se usa únicamente para desarrollar y validar cambios del sistema. No existe una
APK Admin de staging: el panel Master de producción construye una sola APK candidata, y
la descarga de prueba, la aprobación y la publicación reutilizan ese mismo archivo y su
SHA-256 sin recompilarlo.

La vista previa reproducible puede generarse sin compilar ni acceder a secretos. El
siguiente comando es una verificación técnica local; en operación normal el backend
decide el código y el runner lo recibe:

```powershell
../scripts/build-admin-app.ps1 -Operation Preview `
  -ReleaseOperation update -VersionCode 4 -VersionName 1.0.3 `
  -Channel production
```

La app añade su versión real al User-Agent y al bridge `PZAndroidUpdate`. El portal
puede pedir una descarga verificada: antes de abrir el instalador, Android compara
SHA-256, paquete, `versionCode` y certificado con la app instalada. Si Android pide
desinstalar la versión anterior, la operación debe cancelarse.
