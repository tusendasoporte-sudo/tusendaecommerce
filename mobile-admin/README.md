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

La app admite avisos de pedidos nuevos o pendientes, reseñas pendientes, stock bajo o agotado, vencimientos de productos y variaciones, seguridad y resultados de rifas aun cuando el panel este cerrado. El backend genera los eventos y Firebase los entrega al teléfono; los recordatorios temporizados de pedidos y rifas se revisan cada cinco minutos. Firebase debe registrar exactamente el mismo package ID usado al compilar (por defecto `com.tusenda84.admin`).

1. Crea o selecciona el proyecto en Firebase y registra la aplicacion Android.
2. Descarga `google-services.json` y guardalo localmente como `app/google-services.json`.
3. Configura Firebase Admin y `PZ_PUSH_RELAY_SECRET` solamente como secretos del servidor; consulta los archivos `.env.example` del frontend y backend.
4. Compila nuevamente la APK. Si `google-services.json` no existe, la app sigue funcionando, pero el boton del panel informa que los avisos Android aun no estan disponibles.

`google-services.json`, cuentas de servicio, claves de firma y contrasenas estan excluidos de Git. No deben enviarse al repositorio ni incluirse en capturas.

## APK de produccion

La variante `release` requiere una clave privada de firma del propietario. No se guarda ninguna clave ni contrasena en el repositorio. Antes de publicar en Google Play se debe configurar la firma de produccion, incrementar `versionCode` y validar la ficha y las politicas vigentes de la tienda.

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
