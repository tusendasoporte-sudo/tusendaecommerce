# PZ-APP-C10 — diseño implementado para revisión

Estado: `EN CURSO`. Este documento no autoriza aprovisionamiento, firma, despliegue ni publicación.

## Límites aplicados

- El panel vive exclusivamente bajo `/master/stores/{storeId}/app` y hereda el control `master_admin`.
- El panel no importa Gradle, no invoca shell y no contiene credenciales. Solo consulta, crea previews y confirma trabajos en PocketBase.
- Las colecciones `storefront_app_build_profiles`, `storefront_app_build_jobs`, `storefront_app_brand_assets` y `storefront_app_artifacts` son privadas; la API Master es el único acceso de usuario.
- El runner usa endpoints internos separados y `PZ_STORE_APP_RUNNER_SECRET` de al menos 32 caracteres.
- Preview y confirmación están ligados por SHA-256, actor creador, tienda y vencimiento de 30 minutos.
- Un trabajo confirmado pasa a `queued`; ninguna ruta Master puede marcarlo completado ni registrar artefactos.

## Máquina de estados

```text
preview --confirmación Master--> queued --claim runner--> claimed
claimed --> succeeded
claimed --> failed
claimed --> needs_attention
queued --cancelación Master antes del claim--> canceled
```

Una vista previa vencida, alterada, creada por otro actor o con identidad ya utilizada falla cerrada. Solo puede existir un trabajo `queued/claimed` por tienda.

## Aprovisionamiento y actualización

`provision` puede proponer:

1. crear/adoptar el proyecto Firebase exclusivo;
2. registrar el paquete Android;
3. generar la clave de firma de app;
4. generar clave de subida, solo para PowerZona;
5. generar APK y, solo PowerZona, AAB.

`update` no puede crear ninguno de esos recursos. Reutiliza la identidad del perfil y exige incrementar `versionCode`.

La marca de cada tienda se carga desde el panel Master y se conserva como recurso privado versionado en PocketBase, nunca en Git. La vista previa inmoviliza los IDs, dimensiones, política de normalización y SHA-256 del icono y el splash. Al reclamar el trabajo, el runner descarga exactamente esos recursos a un workspace externo, materializa `storefront.properties` y `brand.json`, y compara identidad, marca, Firebase, firma y artefactos contra la vista previa Master; cualquier ausencia o diferencia termina en `needs_attention` antes de ejecutar efectos.

El runner conserva fallos parciales como `needs_attention`; no elimina proyectos, apps, certificados ni artefactos para “reintentar”.

## Icono y splash administrados por el Master

- El Master acepta únicamente JPG, PNG o WebP no animados, con máximo de 12 MiB, 8000 px por lado y 40 megapíxeles.
- El frontend SSR rota según orientación, convierte a sRGB, elimina metadatos y ajusta sin recortar. El icono queda en PNG 1024 × 1024 y el splash en PNG opaco 1080 × 1920.
- La normalización es reproducible: misma entrada, tipo y versión del normalizador producen los mismos bytes y SHA-256. El nombre almacenado usa un token aleatorio para evitar colisiones sin formar parte del contenido aprobado.
- El panel no permite crear una vista previa hasta que ambos recursos estén activos. Reemplazar uno cancela las vistas previas todavía no confirmadas.
- Un trabajo `queued/claimed` bloquea cualquier reemplazo. Un trabajo `queued` no reclamado puede cancelarse explícitamente desde el Master; el perfil provisional se elimina solo si nunca produjo artefactos.
- El runner solo puede descargar los dos hashes aprobados para el trabajo que él mismo reclamó. El endpoint Master de lectura exige sesión `master_admin` y nunca publica una URL directa de PocketBase.

## Firebase multi-proyecto

`PZ_STOREFRONT_FIREBASE_PROJECTS_JSON` contiene solo metadatos y nombres de variables de credencial:

```json
[
  {
    "project_id": "tu-senda-84-storefront-staging",
    "project_number": "115337530324",
    "app_ids": ["1:115337530324:android:8d3f78f8a93cdc1ea8e441"],
    "credential_env": "PZ_STOREFRONT_FIREBASE_CREDENTIAL_POWERZONA"
  }
]
```

Cada variable `credential_env` se configura únicamente en runtime. App Check decodifica el token sin confiar en él solo para seleccionar proyecto y luego ejecuta la verificación criptográfica con la app Admin nombrada correspondiente. El relay exige que `firebase_project_id` y `firebase_app_id` pertenezcan a la misma entrada.

Si no existe el registro, las variables legacy `PZ_STOREFRONT_FIREBASE_PROJECT_ID` y `PZ_STOREFRONT_FIREBASE_SERVICE_ACCOUNT_JSON` mantienen PowerZona sin cambios. El backend también acepta el sobre legacy sin proyecto, pero las apps nuevas se resuelven por proyecto + app ID.

## Firma y entrega

- Cada tienda tiene una clave de firma de app exclusiva.
- PowerZona tiene además una clave de subida exclusiva para el AAB.
- La generación usa PKCS12/RSA-4096 y rechaza sobrescribir archivos existentes.
- Contraseñas, keystores, propiedades de firma y `google-services.json` permanecen fuera del repositorio.
- Artefactos `apk`, checksums e instrucciones usan visibilidad `store_delivery`.
- AAB y manifiesto técnico usan `master_only`.
- PocketBase guarda metadatos y localizadores privados, no secretos criptográficos.

## Releases y alertas del motor común

- `mobile-storefront/config/engine.properties` declara la versión SemVer del motor Android compartido.
- Cada build exitoso entrega `engine_version` y el commit Git exacto; PocketBase los conserva en el perfil privado de la app.
- La release aprobada se declara en runtime mediante `PZ_STOREFRONT_ENGINE_VERSION`, `PZ_STOREFRONT_ENGINE_REVISION` y `PZ_STOREFRONT_ENGINE_UPDATE_SEVERITY`.
- El resumen Master muestra todas las apps desactualizadas y la vista de cada tienda presenta una alerta normal, recomendada o crítica.
- La alerta nunca compila ni publica. El Master debe crear y confirmar una actualización individual, conservando paquete, Firebase y firma.
- Una función nativa común futura exige incrementar la versión del motor. Un cambio exclusivo de PowerZona, de otra marca o de la web remota no debe alertar a todas las apps.
- El runner compara release, identidad y revisión. Release exige un checkout Git limpio y falla `needs_attention` antes de cualquier efecto si hay divergencia.

El panel inferior nativo conversado no forma parte de C10: se implementará como evolución posterior del motor, antes de C11, usando este mecanismo.

## Entrega manual por WhatsApp

- No se integra WhatsApp Cloud API ni otro proveedor. El panel genera un enlace `wa.me` con el destinatario y el mensaje prellenado; el Master conserva el acto final de enviar.
- El número remitente pertenece al usuario Master autenticado y reutiliza su campo privado `phone`. El panel permite configurarlo con código de país, pero no puede seleccionar la sesión de WhatsApp: exige confirmar visualmente que la cuenta abierta coincide.
- El destinatario se obtiene exclusivamente de `stores.primary_admin_user`. Debe ser un `store_admin` activo, pertenecer a la misma tienda y tener un número internacional válido; el Master no puede escribir manualmente otro destinatario desde este flujo.
- Solo un trabajo `succeeded` con un artefacto `apk` de visibilidad `store_delivery` permite crear la vista previa. El mensaje fija tienda, app, versión, nombre del archivo y SHA-256.
- El APK no se adjunta automáticamente: Tu Senda 84 lo recupera de su custodia privada y lo adjunta manualmente en el chat. No se exponen `storage_locator`, AAB, manifiestos técnicos, firmas ni credenciales.
- Abrir WhatsApp no se registra como entrega. Después del envío, el Master debe confirmar por separado `MARCAR ENVIADO`; PocketBase conserva actor, destinatario, números normalizados, hash exacto del mensaje y fecha como constancia manual.
- El estado `marked_sent` no significa que WhatsApp haya entregado o que el administrador haya leído el mensaje. Sin API externa no existe confirmación técnica de envío, entrega o lectura.
- El resumen Master separa apps cuyo motor necesita build de APK ya generadas pendientes de entrega por WhatsApp.

## Pendientes de aprobación y prueba manual

- Revisar esta arquitectura y la UX final del panel.
- Cargar imágenes reales de una tienda, revisar visualmente las dos salidas normalizadas y comprobar que persisten después de recargar.
- Cancelar el trabajo legacy en cola antes de cargar la nueva marca y generar una vista previa de esquema 2 con los hashes revisados.
- Revisar la alerta global y por tienda, y aprobar el procedimiento para declarar una nueva release del motor.
- Revisar el número remitente, administrador principal, mensaje, apertura manual de WhatsApp y constancia posterior sin realizar todavía un envío real.
- Autorizar por separado una vista previa real antes de crear Firebase, registrar paquetes o generar firmas.
- Probar APK firmado PowerZona y APK firmado tenant en dispositivos distintos.
- Validar el AAB PowerZona en Play Internal Testing sin publicar.
- Confirmar almacenamiento privado/backup/recuperación de keystores y artefactos.

C10 no debe marcarse `COMPLETADO` hasta cerrar esas pruebas y obtener aprobación expresa.
