# PZ-APP-C04 — Operación de medios WebP persistentes

## Alcance

Este documento cubre exclusivamente C04: carga, recodificación, persistencia, publicación, cuota, limpieza y respaldo de `push_media`. No configura campañas C05, panel C08, firma Android, `google-services.json`, Cloudflare ni producción.

## Flujo implementado

1. El endpoint SSR `/api/admin/push-media` restaura y refresca la sesión administrativa.
2. El servidor exige una tienda activa, capability `push_campaigns_enabled` y permiso `marketing.push.manage`.
3. La mutación exige origen same-origin, incluso detrás del proxy coherente de staging, y un formulario exacto con un solo campo `file`.
4. `sharp` decodifica el archivo real con límite de píxeles, rechaza datos corruptos o formatos falsificados, corrige orientación, redimensiona y recodifica sin conservar EXIF, ICC ni otros metadatos. La estrategia adapta calidad y resolución hasta obtener una WebP de 100 KiB o menos.
5. El SSR genera un nombre de 128 bits aleatorios y envía exclusivamente el WebP final y sus metadatos a la ruta privada de PocketBase.
6. PocketBase vuelve a exigir usuario, tienda, Premium y permiso; valida tamaño real, firma RIFF/WEBP, nombre aleatorio, dimensiones declaradas, cuota por tienda y presupuesto físico global antes de guardar.
7. `push_media.file` persiste mediante la abstracción de archivos de PocketBase. En la configuración V1 local de Hetzner, el archivo físico queda bajo `pb_data/storage`.
8. La URL publicada usa `/api/pz/storefront/v1/media/file/{record}/{filename}`. La ruta resuelve internamente el registro privado, exige coincidencia exacta de nombre y sirve solamente estados `active` o `archived`.

El CRUD REST de `push_media` continúa completamente cerrado. La URL de archivo es pública por necesidad de FCM/Android, pero el registro y sus metadatos administrativos no lo son.

## Límites y contrato

| Control | Valor |
|---|---:|
| Formatos de entrada reales | JPEG, PNG o WebP estático |
| Entrada máxima | 8 MiB |
| Lado máximo de entrada | 6000 px |
| Píxeles máximos | 36 000 000 |
| Salida | WebP estático |
| Caja máxima | 1200 × 630 px, `fit: inside` |
| Calidad | 82; baja de forma acotada hasta 28 si hace falta |
| Perfiles de salida | 1200×630, 1000×525, 800×420, 640×336 y 480×252 |
| Salida máxima | 100 KiB (`102400` bytes) |
| Nombre lógico | 16 bytes aleatorios en hexadecimal + `.webp` |
| Cuota física por tienda | 250 MiB |
| Registros físicos por tienda | 100 |
| Presupuesto físico global de tiendas | 40 GiB; una carga que lo supere se rechaza |
| Alerta global crítica | 35 GiB; notificación deduplicada al Master |
| Vigencia de la imagen push | 24 horas desde la carga, sin prórroga por referencias |
| Caché publicada | `public, max-age=300, must-revalidate` |

El presupuesto de 40 GiB se calcula sobre los objetos físicos administrados por el filesystem de PocketBase, incluidas fotos de productos, medios push y derivados que residan allí. La API de PocketBase permite enumerar los objetos por prefijo y devuelve su tamaño mediante `ListObject`: [filesystem JS](https://pocketbase.io/docs/js-filesystem/) y [contrato `ListObject`](https://pocketbase.io/jsvm/interfaces/blob.ListObject.html). No incluye `data.db`, imágenes Docker, caché de build ni backups fuera de `storage`. Las cargas de push y de productos fallan cerradas si no puede medirse el uso; la conversión futura de fotos de producto a 200 KiB queda expresamente fuera de C04.

Un archivo archivado sigue ocupando cuota hasta su eliminación física. Esta regla impide evadir la cuota mediante ciclos de archivar y volver a cargar. La conversión SSR admite una sola tarea simultánea y una cola máxima de cuatro para proteger los 2 vCPU y 4 GB de RAM del servidor; el exceso recibe HTTP `429`.

No se aceptan nombres con rutas, controles, dobles extensiones, ejecutables disfrazados o extensiones distintas del tipo real. WebP animado se rechaza en V1 para mantener una salida determinista y compatible con la previsualización push.

## Vencimiento, referencias y limpieza

- `push_campaigns.media` ya relaciona una campaña con `push_media`; la validación multi-tienda de C02 impide relaciones cruzadas.
- Todo medio nuevo recibe `delete_after` exactamente a 24 horas de su creación. No es un archivo permanente: si el cliente necesita conservarlo, debe guardar su propia copia antes del vencimiento.
- La tarea `pz_storefront_push_media_expiry` se ejecuta cada cinco minutos y procesa hasta diez lotes de 200 medios por ejecución.
- Al vencer, la tarea abre una transacción, retira primero todas las referencias `push_campaigns.media`, cambia el estado a `pending_delete` y elimina el registro. PocketBase elimina junto con él el archivo físico. Una campaña histórica se conserva, pero queda sin imagen.
- La eliminación administrativa usa el mismo control y responde `media_in_use` si una campaña lo referencia.
- Un reemplazo siempre es una carga nueva y produce otra URL aleatoria. Nunca se sobrescribe contenido bajo una URL existente.
- La caché pública dura como máximo cinco minutos y debe revalidarse; por ello una copia intermedia puede sobrevivir brevemente después del borrado del origen, pero no durante meses.

La tarea `pz_store_storage_budget_monitor` fuerza una medición física cada hora. Desde 35 GiB crea o actualiza una notificación crítica deduplicada para cada Master activo. El control duro de cargas se mantiene en 40 GiB.

## Servidor Hetzner verificado y mejoras sin cambiar producción

Datos facilitados por el propietario para el PocketBase de staging:

- 2 vCPU, 4 GB RAM y disco local de 80 GB nominales; `/dev/sda1` ofrece 74,8 GiB útiles.
- 15,5 GiB usados y 56,2 GiB disponibles durante la inspección.
- Volumen persistente Docker montado en `/app/pb_data`; `pb_data` usaba 121,6 MiB y `pb_data/storage` 5,1 MiB con 82 archivos.
- Docker usaba 10,93 GB en imágenes y 3,269 GB en caché de build; 3,21 GB de esa caché figuraban como recuperables.
- Memoria disponible aproximada: 1,9 GiB. No había swap.

Medidas recomendadas, separadas del despliegue C04 y no ejecutadas automáticamente:

1. Crear 2 GiB de swap con permisos `0600` y `vm.swappiness` bajo, después de revisar el espacio. Ayuda ante picos, pero no sustituye RAM y puede ser más lento.
2. Configurar rotación y tamaño máximo de logs Docker para impedir crecimiento ilimitado. Medir primero los logs actuales y reiniciar servicios solo en una ventana de staging.
3. Limpiar únicamente caché de build confirmada como recuperable. No ejecutar una poda indiscriminada de imágenes o volúmenes: puede eliminar capas de rollback o datos.
4. Mantener la conversión serializada ya aplicada y vigilar CPU, RAM, latencia de cola y respuestas `429` antes de aumentar concurrencia.
5. Alertar también sobre el disco raíz al 80 %, 90 % y 95 %. El límite lógico de 40 GiB protege archivos de tiendas, pero Docker, `data.db`, logs y backups consumen el mismo disco físico.
6. Mantener backups consistentes fuera de este disco. Una copia en el mismo servidor no protege frente a pérdida del servidor. Puede mantenerse costo adicional cero usando un equipo externo ya disponible, a cambio de operación manual; un servicio gestionado externo no garantiza costo cero.

## Persistencia de staging

El `backend-powerzona/Dockerfile` crea `/app/pb_data`, pero una ruta dentro de una imagen no demuestra que Coolify tenga un volumen persistente. La inspección SSH aportada por el propietario ya confirmó este mount de staging:

`/var/lib/docker/volumes/imdbiodgr30k0dbhx3wtlysj-powerzona-pocketbase-repo-staging/_data -> /app/pb_data`

También confirmó `121,6 MiB` en `pb_data`, `5,1 MiB` en `storage` y 82 archivos. La prueba manual C04 reconfirmó después del despliegue:

1. El servicio PocketBase de staging tiene un volumen persistente montado exactamente en `/app/pb_data`.
2. `pb_data/data.db` y `pb_data/storage` pertenecen al mismo mount persistente.
3. Un redeploy no crea un volumen nuevo ni cambia el mount.
4. El servicio frontend no tiene, ni necesita, una carpeta de uploads persistente.

No se debe ejecutar esta inspección en producción durante C04.

## Respaldo y restauración

PocketBase documenta dos rutas válidas: una copia completa de `pb_data` con el proceso detenido, o el backup integrado, que crea un snapshot ZIP completo de `pb_data` e incluye archivos locales. El backup integrado pone temporalmente la aplicación en solo lectura durante la generación. Referencias oficiales: [Going to production — Backup and Restore](https://pocketbase.io/docs/going-to-production/) y [Backups API](https://pocketbase.io/docs/api-backups/).

Estrategia para staging y, solo tras autorización futura, producción:

1. Usar el backup integrado de PocketBase para obtener un snapshot consistente de base y `storage`.
2. Guardar una copia fuera del mismo servidor/volumen; un backup local en el volumen que se pierde no es recuperación.
3. Conservar como política inicial siete diarios, cuatro semanales y tres mensuales, sujeta a capacidad y política operativa del propietario.
4. Registrar fecha, tamaño, SHA-256 del ZIP y versión exacta de PocketBase.
5. Probar la restauración en una instancia aislada con el mismo commit, nunca encima de producción durante una validación.
6. Verificar después de restaurar: salud, colecciones, conteo de `push_media`, descarga pública, `Content-Type`, caché y SHA-256 de una muestra.

La prueba automática C04 realiza además la ruta manual segura con PocketBase detenido: copia el directorio completo de datos a otro temporal, inicia la copia restaurada y comprueba byte a byte el mismo WebP.

## Evidencia local automatizada

- PocketBase: `0.38.2` para Windows amd64.
- SHA-256 del ZIP oficial: `9114bb978c694f49064bbf6f7ae28cf2bf01042a4ae9be26df1b98a4729a597e`.
- La prueba crea una base solo en el directorio temporal del sistema.
- Carga un WebP real por la ruta autenticada, confirma REST anónimo `403`, `delete_after` cercano a 24 horas, descarga pública `200`, `Content-Type: image/webp`, caché de cinco minutos y bytes exactos.
- Detiene y vuelve a iniciar PocketBase sobre el mismo directorio: el archivo continúa disponible.
- Con PocketBase detenido, copia base y storage como una unidad, inicia la copia restaurada y vuelve a verificar el mismo archivo.
- Los dos directorios de datos se eliminan al terminar; no se crea ni modifica `.tmp/` del repositorio.

## PRUEBA MANUAL COMPLETADA — staging

La puerta manual de C04 se completó el 2026-08-12. Este procedimiento queda como runbook reproducible; requiere una cuenta de tienda Premium con `marketing.push.manage` y no requiere teléfono.

1. Desplegar únicamente backend y frontend de staging desde el commit exacto de C04. Confirmar que producción no está incluida.
2. Confirmar el mount persistente `/app/pb_data` y crear un backup integrado antes de cargar datos de prueba.
3. Iniciar sesión en el panel de staging con la cuenta autorizada.
4. Abrir la consola del navegador en esa misma pestaña y ejecutar este ayudante. El selector de archivos permitirá elegir un JPG o PNG no sensible:

```js
const input = document.createElement('input');
input.type = 'file';
input.accept = 'image/jpeg,image/png,image/webp';
input.onchange = async () => {
  const data = new FormData();
  data.append('file', input.files[0]);
  const response = await fetch('/api/admin/push-media', {
    method: 'POST',
    body: data,
    credentials: 'same-origin',
  });
  console.log(response.status, await response.json());
};
input.click();
```

5. Resultado esperado: HTTP `201`, `media.file` termina en `.webp`, `media.url` es HTTPS, las dimensiones no superan 1200×630, `bytes` no supera `102400` y `delete_after` queda aproximadamente 24 horas después de la carga.
6. Abrir `media.url` en otra pestaña y agregarla como `<img>` temporal a la previsualización. Confirmar aspecto, orientación y ausencia de descarga forzada.
7. En Network confirmar `Content-Type: image/webp`, `Cache-Control: public, max-age=300, must-revalidate` y `X-Content-Type-Options: nosniff`.
8. Reiniciar o redesplegar solo PocketBase staging. Volver a abrir exactamente la misma URL: debe responder `200` con la misma imagen.
9. Restaurar el backup en una instancia aislada de staging y comprobar allí el registro y archivo. No restaurar encima de producción.
10. Conservar localmente una copia de prueba si hace falta. Dejar vencer un medio desechable y confirmar, después del siguiente ciclo de cinco minutos, que el registro y el archivo ya no existen y que una campaña de prueba quedó sin referencia de imagen.

Evidencia a registrar en el plan maestro: commit, despliegues de staging, mount exacto, id sanitizado del medio, dimensiones/bytes, encabezados, resultado antes y después del redeploy, identificador del backup, resultado de restauración y confirmación explícita de que producción no se tocó.

### Resultado ejecutado

- Commit exacto: `6d514726670f498d8e048cb37eaa0dd25ff77a0f` en ambos servicios de `tusenda-staging`.
- Despliegue PocketBase: `px26fllr244caqktaxya381q`; despliegue frontend: `k7dq34p33fkke2xs9e1i5gbd`; reinicio controlado posterior de PocketBase: `n9v0gu0nlctzg9n0ym4vy4yl`.
- Mount reconfirmado: volumen `imdbiodgr30k0dbhx3wtlysj-powerzona-pocketbase-repo-staging` hacia `/app/pb_data`.
- Backup previo: `c04_predeploy_20260812_1900.zip`, 18,79 MiB. Backup con la muestra: `c04_with_media_20260812_2254.zip`, 18,8 MiB.
- JPG de entrada: 1600×1000. WebP de salida: 1008×630, 1232 bytes, id sanitizado `czsb9…`, SHA-256 `d6bf75632971ebfb1cffa93d490f185b82185f418c3d19d5f2c7297095da5a59` y vencimiento cercano a 24 horas.
- URL anónima antes y después del reinicio: HTTP `200`, `Content-Type: image/webp`, `Cache-Control: public, max-age=300, must-revalidate`, `X-Content-Type-Options: nosniff`, mismos bytes y SHA-256.
- Restauración: el backup posterior se extrajo en un directorio local aislado y se abrió con PocketBase oficial 0.38.2; salud HTTP `200` y archivo restaurado de 1232 bytes con el mismo SHA-256. La descarga, base aislada, proceso y credenciales temporales locales se eliminaron.
- Limpieza: un segundo medio sanitizado `3gtds…` se venció de forma controlada solo en staging; el cron lo eliminó y su URL pasó a HTTP `404`. No se creó campaña C05; la limpieza de referencias quedó verificada por la prueba backend C04.
- Estado final: `push_media` volvió a cero registros, se eliminó la cuenta desechable y los dos recursos staging continúan `Running` en la SHA indicada. Producción no se abrió ni modificó y `.tmp/` se preservó.
