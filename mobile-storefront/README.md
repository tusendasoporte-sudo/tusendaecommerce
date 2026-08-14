# Storefront Android white-label — PZ-APP-C06

`mobile-storefront` es el shell Android público y reutilizable para tiendas Premium. Está separado de `mobile-admin`, no contiene autenticación administrativa y abre únicamente el storefront público configurado.

La implementación C06 reutiliza la identidad y el cliente nativo App Check/FCM auditados en C06A. C07 sigue pendiente: iconos, splash, branding final de PowerZona y la matriz completa de destinos no forman parte de este cierre.

## Configuración white-label

El build recibe la tienda de forma declarativa:

| Propiedad Gradle | Ejemplo | Regla |
|---|---|---|
| `PZ_STOREFRONT_STORE_URL` | `https://tusenda84.com/t/powerzona` | HTTPS exacto, sin query ni fragmento y con ruta `/t/{store_key}` |
| `PZ_STOREFRONT_STORE_KEY` | `powerzona` | Minúsculas, números y guiones; debe coincidir con la URL |
| `PZ_STOREFRONT_APP_NAME` | `PowerZona` | Nombre visible de 1 a 60 caracteres |
| `PZ_STOREFRONT_API_BASE_URL` | origen de staging | Opcional en debug; obligatorio y HTTPS puro en staging |

Los valores por defecto de debug son deliberadamente inertes (`example.invalid`, `store`, `Storefront`). Ninguna URL, FID, credencial ni token se expone al JavaScript del WebView.

## Variantes y separación

- `debug`: `com.tusenda84.powerzona.debug`, firma debug local y sufijo `-debug`. Puede coexistir con la app de staging.
- `staging`: conserva `com.tusenda84.powerzona`, la identidad privada de C06A y exige API, Firebase y firma local válidos.
- `release`: bloqueada deliberadamente durante C06. No se genera firma ni artefacto de producción.
- `mobile-admin`: continúa siendo una aplicación independiente; no comparte `applicationId` con el debug storefront.

El `applicationId` base de staging se conserva por compatibilidad con la Firebase app auditada en C06A. La variante/identidad final de PowerZona se completa en C07.

## Seguridad del shell

- WebView con JavaScript y DOM storage solo para el storefront, sin `addJavascriptInterface`, acceso a archivos o contenido, selector de archivos, geolocalización, mixed content ni ventanas múltiples.
- Tráfico cleartext deshabilitado, errores TLS cancelados y Safe Browsing activo cuando la plataforma lo permite.
- Navegación interna limitada al host configurado y a `/t/{store_key}` o recibos públicos; rutas administrativas, API, otros tenants, puertos, credenciales y paths ambiguos se bloquean.
- HTTPS externo y esquemas explícitos `tel`, `mailto`, `sms`, `smsto`, `geo` y `market` se delegan al sistema. Esquemas inseguros se bloquean.
- Descargas solo se delegan al navegador cuando proceden del storefront permitido.
- Estados offline/HTTP 5xx tienen overlay nativo con reintento y regreso seguro a portada.

## Notificaciones e instalación C03

La tarjeta de permiso aparece con contexto después de cargar la tienda. La primera acción solicita `POST_NOTIFICATIONS`; tras una denegación ofrece abrir Ajustes y desaparece al recuperar el permiso.

El cliente nativo registra la instalación con C03 al iniciar y cuando rota el token/FID, conserva la credencial cifrada con Android Keystore y nunca la entrega al WebView. Si no existen Firebase/API válidos, debug falla cerrado y el storefront sigue navegable.

`StorefrontMessagingService` valida `schema_version`, `channel`, `store_key`, `campaign_id`, `target_type`, `target_path` e `image_url`. Los mensajes data recibidos en foreground crean una notificación local; el manifiesto define icono/canal por defecto para background y proceso cerrado. El `Intent` de apertura se procesa tanto en `onCreate` como en `onNewIntent`. El destino `order` permanece con fallback a portada hasta el resolvedor autorizado de C07.

## Archivos privados fuera de Git

La raíz ignora `.secrets/` y este proyecto ignora `app/google-services.json`, keystores y builds. La firma de staging se resuelve desde `.secrets/mobile-storefront-staging.properties` o desde la ruta indicada por `PZ_STOREFRONT_SIGNING_PROPERTIES`; no debe copiarse, regenerarse ni reutilizarse para producción.

La huella pública de staging auditada en C06A se mantiene sin cambios:

```text
12:5B:DC:CC:B5:53:0D:94:FC:7C:0C:E3:32:21:BE:78:52:96:0C:45:3E:D2:F0:47:46:29:82:FC:C5:4F:B3:72
```

No se debe añadir `google-services.json` a Git, habilitar App Check debug/enforcement ni modificar Firebase para compilar C06.

## Build debug reproducible

Requisitos: JDK 17, Android SDK 36 y dependencias Gradle declaradas en el proyecto.

```powershell
./gradlew.bat testDebugUnitTest lintDebug assembleDebug --no-daemon `
  -PPZ_STOREFRONT_STORE_URL="https://tusenda84.com/t/powerzona" `
  -PPZ_STOREFRONT_STORE_KEY="powerzona" `
  -PPZ_STOREFRONT_APP_NAME="PowerZona"
```

La APK queda en `app/build/outputs/apk/debug/app-debug.apk`. El build debug no necesita secretos, firma de staging, `google-services.json` ni acceso a staging.

Las pruebas unitarias cubren configuración, payload de registro, allowlist/normalización de navegación y parsing/fallback de destinos push. La matriz manual C06 incluye apertura pública sin login, Atrás, rotación, offline/recuperación, permiso/Ajustes y apertura de payload contractual en foreground, background y proceso cerrado. El envío visual FCM real y cada destino de negocio se repiten en C07/C11 con autorización de staging y teléfono físico.
