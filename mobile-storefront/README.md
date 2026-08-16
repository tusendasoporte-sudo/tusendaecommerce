# Storefront Android white-label — variante PowerZona C07

`mobile-storefront` es el shell Android público para tiendas Premium. Sigue separado de `mobile-admin`, no contiene autenticación administrativa y sólo abre el storefront público configurado.

C07 materializa exclusivamente la variante PowerZona sobre la base C03–C06: configuración declarativa, marca v3 aprobada, navegación push tipada y resolución autenticada de pedidos. No incluye C08, firma o publicación de producción, cambios de Firebase ni despliegues.

## Configuración PowerZona

La fuente versionada es `config/powerzona.properties`; `brands/powerzona/brand.json` fija la identidad visual y comprueba los hashes de los maestros aprobados.

| Valor | PowerZona |
|---|---|
| Storefront | `https://tusenda84.com/t/powerzona` |
| Store key | `powerzona` |
| Nombre | `PowerZona` |
| `applicationId` staging confirmado | `com.tusenda84.powerzona` |
| `applicationId` debug | `com.tusenda84.powerzona.debug` |
| Versión staging actual | `10` / `0.2.8` |

Los overrides `PZ_STOREFRONT_STORE_URL`, `PZ_STOREFRONT_STORE_KEY`, `PZ_STOREFRONT_APP_KEY`, `PZ_STOREFRONT_APP_NAME` y `PZ_STOREFRONT_API_BASE_URL` siguen disponibles para builds controlados. `APP_KEY` identifica la app Firebase configurada y `STORE_KEY` conserva el slug web; Gradle falla si la URL, las claves, el paquete, la marca o los hashes no coinciden con la definición PowerZona. El build `staging` deriva su storefront del origen `PZ_STOREFRONT_API_BASE_URL` y añade `/t/powerzona`; `debug` y la definición de marca conservan la URL pública autorizada. Así la matriz física C07 no depende de producción.

La variante `release` permanece bloqueada en C07. `staging` exige API, Firebase y firma privada locales válidos; `debug` se compila sin secretos ni `google-services.json` y falla cerrado en las funciones nativas que requieran esa identidad.

## Marca v3

- Icono maestro: `brands/powerzona/icon.png`, copia byte-idéntica del v3 aprobado, SHA-256 `e284d6749069fec8843e24d237f5bf70d1c1ae90e1155c5f455d7415c8dadb`.
- Splash maestro: `brands/powerzona/splash.png`, copia byte-idéntica del v3 aprobado, SHA-256 `6934893e59033857906526a6f77bfecbd6f6eb1ba33c16be0c043f007bdf`.
- Paleta autorizada: `#071F63`, `#155EEB`, `#4A8DFF`, `#C7D0DE`, `#E9F1FF`, `#FFFFFF`, `#081735`, `#465574` y `#F8FAFF`.
- El launcher adaptativo usa una zona segura uniforme para conservar el símbolo completo bajo máscaras Android. El splash Android 12+ reutiliza ese foreground; versiones anteriores usan el maestro vertical completo.

No se usan activos v1/v2 ni se genera una marca alternativa.

## Destinos desde push

El payload acepta sólo `schema_version=1`, `channel=storefront`, la tienda esperada, un `campaign_id` exacto y un destino de lista cerrada.

| Tipo | Ruta aceptada | Comportamiento seguro |
|---|---|---|
| `home` | `/t/powerzona` | Portada |
| `product` | `/t/powerzona/producto/{slug}` | Slug único permitido o portada |
| `category` | `/t/powerzona/categoria/{slug}` | Slug único permitido o portada |
| `section` | `/buscar`, `/links`, `/regalos`, `/rifa` o `/checkout` bajo la tienda | Sección permitida o portada |
| `raffle` | `/t/powerzona/rifa[/{slug}]` | Rifa pública vigente o fallback del servidor |
| `coupon` | `/t/powerzona?coupon={valor}` | Sintaxis cerrada; el storefront valida/aplica el cupón |
| `order` | Sin recibo en FCM | Resuelve el recibo por backend autenticado; si no está disponible, abre portada |

`StorefrontActivity` procesa el mismo contrato en `onCreate` y `onNewIntent`, por lo que cubre proceso cerrado, background y foreground. Hosts ajenos, otros tenants, rutas administrativas, controles, paths ambiguos, puertos y credenciales se bloquean.

### Pedidos

El cliente llama `campaigns/resolve-target` con App Check y la credencial cifrada de instalación. El backend exige tienda, instalación, campaña, entrega y vínculo de pedido coincidentes y activos. Sólo devuelve una ruta `/orden/{numero}/{receiptToken}` después de validar el recibo; el token nunca viaja en FCM ni en logs. Cualquier ausencia, vencimiento o relación cruzada produce el mismo fallback seguro sin revelar existencia.

## Notificaciones

Foreground crea una notificación local con el texto contractual. Una `image_url` opcional sólo se descarga si es HTTPS, sin redirecciones, usuario o puerto, termina en `.webp`, responde `image/webp` y no supera 100 KiB; el bitmap se muestra con `BigPictureStyle`. Si falla, se conserva texto con `BigTextStyle`. Background y proceso cerrado continúan usando el payload del relay storefront v2 de C05.

El icono monocromo y el color de notificación son recursos PowerZona. Permiso contextual, rotación FID y almacenamiento de credencial reutilizan C03/C06 sin exponer identificadores al WebView.

## Archivos privados fuera de Git

La raíz ignora `.secrets/`; este proyecto ignora `app/google-services.json`, keystores y builds. La firma staging se resuelve desde `.secrets/mobile-storefront-staging.properties` o `PZ_STOREFRONT_SIGNING_PROPERTIES`. No debe copiarse, regenerarse ni reutilizarse para producción.

No se debe añadir `google-services.json` a Git, habilitar App Check debug/enforcement, modificar Firebase ni generar firma Android de producción para compilar C07.

## Build debug reproducible

Requisitos auditados: JDK de Android Studio con target Java 17, Android SDK 36 y Gradle del proyecto.

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = 'E:\Android\Sdk'
./gradlew.bat clean testDebugUnitTest lintDebug assembleDebug --no-daemon
```

Artefacto local C07:

```text
app/build/outputs/apk/debug/app-debug.apk
package: com.tusenda84.powerzona.debug
version: 0.2.0-debug (2)
size: 5,271,541 bytes
SHA-256: 62e57c34e02e81e1f4f1ceb8d98e37a15c50dfb22405c89e78f0590a0e156f08
debug certificate SHA-256: 3ef106bebf2393438c55c48453797c0229097668e5290511ea0771bf6090935c
```

Dos builds limpios consecutivos produjeron el mismo SHA-256. El cierre local aprobó 5 suites/22 pruebas, 0 fallos/errores/omitidas y lint 0. La inspección del APK encontró 0 entradas o strings de `google-services.json`, keystore, service account, `.secrets` o clave privada.

## Validación y límite manual C07

El APK final se instaló primero en `Pixel_4a` API 36 con `adb install -r`. `com.tusenda84.powerzona` staging permaneció instalado e intacto. Los siete tipos se ejercitaron con intents contractuales en foreground, background y proceso cerrado; la URL real del WebView se inspeccionó por un port-forward ADB local temporal. El pedido sin credencial cayó a portada y todos los procesos cerrados tuvieron PID vacío antes de recrearse.

Esto valida el lifecycle y el enrutamiento local, pero no sustituye FCM real. Antes de cerrar C07 siguen siendo obligatorios, con autorización separada: campaña controlada de staging/Firebase, teléfono físico, cada destino en los tres estados, pedido real, cupón válido/inválido, imagen WebP, texto, permiso y observación final del splash. Hasta entonces C07 permanece `EN CURSO`.
