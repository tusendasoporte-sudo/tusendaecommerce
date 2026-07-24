# REPORTE FINAL — PROMPT ID: L7Q1

Estado: **EN REVISIÓN — pendiente de pruebas manuales y confirmación de Kraken**

Fecha técnica del reporte: **23 de julio de 2026**.

## 1. Preflight real

- Workspace usado: `E:\Trabajo\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt`.
- `git rev-parse --show-toplevel`: `E:/Trabajo/PROYECTOS/WEb E_Comerce PowerZona_ChatGpt`.
- Rama autorizada y usada: `dev`.
- Remoto verificado, sin modificar: `https://github.com/tusendasoporte-sudo/tusendaecommerce.git`.
- Se confirmaron `.git`, `Start-PowerZonaLocal.ps1`, `frontend-powerzona`, `backend-powerzona` y `docs`.
- El preflight comenzó con `git status --short`, `git diff --name-only` y `git diff --stat` vacíos: **0 cambios heredados**.
- No se abrió ni copió ningún ZIP y no se usó la ruta obsoleta de `C:`.

## 2. Cierre documental previo de V7E9

Antes de programar L7Q1 se actualizó `docs/tusenda84/reportes/V7E9-vencimiento-productos-premium.md`:

- estado principal `V7E9 — COMPLETADO`;
- confirmación expresa de Kraken del 23 de julio de 2026;
- Source de cierre V119;
- addendum final sobre producto padre, variaciones independientes y estados efectivos;
- enforcement en catálogo, carrito, checkout, Pedidos Admin y solicitudes directas;
- umbrales definitivos `90/60/30/0`, sin alerta de 7 días;
- downgrade destructivo limitado exclusivamente a fechas, ciclos y alertas V7E9;
- constancia de pruebas manuales aprobadas, `0 fixtures` y `0 procesos temporales`.

Se conservaron íntegros los estados históricos de los addendums anteriores y se indicó que quedaron sustituidos por la confirmación final. No se editó la bitácora PDF ni el Master Document histórico.

## 3. Hallazgos del source

Antes de L7Q1 ya existían el editor, `landing_qr_enabled`, `landing_qr.manage`, la matriz central de planes/capacidades y el gate compartido. Los huecos encontrados fueron:

- las rutas públicas comprobaban el valor manual, pero no la capacidad efectiva ni su vencimiento;
- los QR PNG/SVG se generaban sin gate de plan y se cacheaban públicamente;
- el endpoint de clic validaba la existencia del ID de tienda, pero aceptaba metadatos de enlace suministrados por el cliente;
- un POST público directo a `store_analytics_events` podía intentar crear eventos Landing QR sin validar capacidad y activación;
- la redacción de `settings` permitía atajos por Principal o `store.settings.manage` y asociaba campos públicos generales a Landing QR;
- faltaba enforcement específico para descargar `landing_qr_hero_image`;
- consultas `fields`, `filter`, `sort`, `expand` y realtime requerían una defensa específica para impedir inferencia de campos privados;
- la configuración existente ya permitía una solución sin migraciones ni endpoint administrativo paralelo.

El agregado administrativo existente ya separaba `analytics.view` de `landing_qr.manage`; se conservó esa regla.

## 4. Arquitectura final del gate

La autorización conserva dos fuentes independientes:

1. capacidad comercial `landing_qr_enabled`, resuelta con vencimiento obligatorio;
2. permiso efectivo `landing_qr.manage`.

En Ajustes:

- Premium autorizado monta el editor existente y conserva edición, imagen, enlaces, orden, preview y QR bajo demanda.
- Premium sin permiso no ve ni puede abrir el módulo.
- Principal Free/Básico o con plan vencido descubre `Landing QR`, pero monta únicamente `StoreCapabilityGate`.
- El gate muestra `Landing QR disponible en el Plan Premium`, la descripción aprobada y el mensaje de preservación.
- Los datos de plan técnicamente inválidos conservan el estado neutral/fail-closed del componente.
- `#landing` resuelve gate o editor según el acceso, sin mostrar Ajustes generales durante la resolución.
- El gate no monta `LandingQrSettings`, no crea preview/QR y oculta la acción contextual móvil de Guardar.
- Usuarios no principales no reciben acceso adicional por la visibilidad comercial del gate.

La misma decisión se reutiliza en el sidebar sin duplicar rutas ni alterar el layout global.

## 5. Enforcement, privacidad y aislamiento

Toda mutación de un campo con prefijo `landing_qr_`, incluidos append/delete de imagen, pasa por el enforcement central y exige:

- actor Store Admin/Staff activo;
- pertenencia a la tienda real del registro;
- permiso efectivo `landing_qr.manage`;
- capacidad Premium efectiva y no vencida.

Además:

- un cruce de tienda sobre `settings` responde como recurso inexistente;
- `settings` redacta específicamente `landing_qr_*` sin ocultar logo, nombre, WhatsApp u otros campos públicos generales;
- `fields`, filtros, sort, expand y realtime no pueden inferir campos Landing QR sin permiso/capacidad;
- `default_currency` conserva su expand autorizado para Ajustes generales;
- la descarga de `landing_qr_hero_image` aplica capacidad, tenant y permiso cuando corresponde;
- no se concede Landing QR por `analytics.view`, `store.settings.manage` ni otra dependencia;
- se mantienen sin cambios las reglas de Rating, promociones, monedas y demás módulos compartidos.

## 6. Preservación downgrade, expiración y upgrade

No se añadió ninguna operación destructiva:

- no se modifica el valor almacenado de `landing_qr_enabled`;
- no se borran imagen, enlaces, IDs, iconos, etiquetas, URLs, colores, orden ni visibilidad;
- no se borra el historial analítico;
- no se generan auditorías falsas;
- una expiración bloquea el acceso efectivo sin mutar el registro.

La regla efectiva es:

```text
Landing pública efectiva = capacidad Premium permitida
                            && landing_qr_enabled almacenado === true
```

Al recuperar Premium reaparecen los mismos valores. Una landing antes activa vuelve a quedar activa; una desactivada manualmente continúa desactivada.

## 7. Rutas públicas, QR y tracking

Para `/t/[storeSlug]/links` y `/links`:

- la capacidad se comprueba antes de leer `settings`;
- la activación almacenada se comprueba antes de renderizar `LandingQrPublicPage`;
- sin capacidad o con landing desactivada se responde `302` hacia `/t/[slug-real]`;
- la redirección usa `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache`, `Expires: 0`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` y `X-Robots-Tag: noindex, nofollow, noarchive`;
- no se muestra gate, motivo de plan ni contenido previo de la landing.

Para QR:

- PNG/SVG conserva la generación fija cuando la capacidad está permitida, incluso si el admin desactivó manualmente la landing;
- sin capacidad o tienda inexistente responde `404` saneado y privado/no-store;
- el slug de la ruta es la única identidad aceptada y no se usa un tenant alternativo desde query/body.

Para tracking:

- el endpoint de clic obtiene la tienda y configuración reales antes de insertar;
- exige Premium vigente, landing almacenada activa, ruta canónica y un enlace existente;
- guarda tipo, icono, etiqueta y ruta canónicos, ignorando sus equivalentes adulterados por el cliente;
- el hook backend bloquea `landing_qr_view`, `landing_qr_click` o `page_type=landing_qr` directos si la capacidad/activación no corresponde;
- los pageviews normales y demás eventos públicos válidos continúan funcionando.

## 8. Archivos creados y modificados

Modificados:

- `backend-powerzona/pb_hooks/pz_store_permission_enforcement.pb.js`
- `backend-powerzona/pb_hooks/pz_store_permission_enforcement_lib.js`
- `backend-powerzona/tests/pz_store_privacy_c3.test.cjs`
- `docs/tusenda84/reportes/V7E9-vencimiento-productos-premium.md`
- `frontend-powerzona/src/components/admin/AdminSidebar.astro`
- `frontend-powerzona/src/components/shared/StoreCapabilityGate.astro`
- `frontend-powerzona/src/lib/landingQr.ts`
- `frontend-powerzona/src/pages/admin/store-settings.astro`
- `frontend-powerzona/src/pages/api/landing-qr/click.ts`
- `frontend-powerzona/src/pages/links.astro`
- `frontend-powerzona/src/pages/t/[storeSlug]/links.astro`
- `frontend-powerzona/src/pages/t/[storeSlug]/links/qr.png.ts`
- `frontend-powerzona/src/pages/t/[storeSlug]/links/qr.svg.ts`
- `frontend-powerzona/tests/m7u2GranularAdminActions.test.mjs`

Creados:

- `backend-powerzona/tests/pz_l7q1_landing_qr_premium.test.cjs`
- `frontend-powerzona/tests/l7q1LandingQrPremium.test.mjs`
- `docs/tusenda84/reportes/L7Q1-landing-qr-premium.md`

## 9. Migraciones

**0 migraciones.** Los campos, la capacidad y el permiso ya existían. La defensa quedó en los hooks y servicios actuales; no se modificó ninguna migración histórica.

## 10. Pruebas automatizadas y runtime

### Aprobadas

- Focal backend L7Q1: **9/9**, 0 fallidas, 0 omitidas.
- Suite frontend completa: **260/260**, 0 fallidas, 0 omitidas. Incluye **6/6** pruebas L7Q1.
- Suite backend completa: **570 totales; 563 aprobadas; 0 fallidas; 7 omitidas**.
- Los runtime autocontenidos M7U2-C2 y M7U2-C3 se ejecutaron y aprobaron dentro de la suite backend.
- `npm.cmd run build`: aprobado con Astro SSR.
- `git diff --check`: aprobado, sin errores.
- Escaneo del build: **0 source maps** y **0 marcadores L7Q1/PROMPT/Codex/TODO/FIXME o `console.log/info/warn` en assets públicos cliente**. Los avisos internos de dependencias aparecen solo en chunks privados del servidor.

El build emitió únicamente tres warnings históricos de Astro porque `getStaticPaths()` se ignora en las rutas dinámicas `categoria/[slug]`, `producto/[slug]` y `subcategoria/[slug]`; no son introducidos por L7Q1.

### Runtime HTTP real de L7Q1

Se levantaron PocketBase y Astro temporales, exclusivamente en `127.0.0.1:8092` y `127.0.0.1:4322`, con una tienda Premium y otra Básico:

- Premium activa: `/t/[slug]/links` respondió `200`.
- Básico: `/t/[slug]/links` respondió `302` al home canónico, no-store y sin contenido de la landing.
- QR SVG Premium respondió `200`; QR SVG Básico respondió `404` no-store.
- Clic Premium válido respondió `204` y persistió tienda, ruta, entidad y botón canónicos pese a un label/tipo/icono adulterados.
- El mismo clic contra Básico respondió `404` y no creó evento.
- Un evento Landing QR directo contra Básico respondió `404`.
- Un pageview normal de la tienda Básico respondió `200`, confirmando que la defensa no bloquea analítica general.

No se usaron datos reales de producción.

### Omisiones declaradas

Las siete omisiones de la suite backend corresponden a runtimes históricos que exigen variables/servicios externos no configurados para esta ejecución:

1. `F7P8 HTTP runtime protege multipart y bypass directos`.
2. `M7U2 HTTP runtime valida equipo, permisos, cuota, aislamiento, plan y V7E9`.
3. `PZ-ORD-PRICE01-C2 HTTP runtime valida reset, estados y total canónico`.
4. `PZPW01 HTTP PocketBase valida cada cambio, objetivo, variaciones, pausa y borrado`.
5. `U7I7F1D8 HTTP elimina físicamente usuarios y preserva historial comercial`.
6. `U7I7 HTTP PocketBase 0.38.2 valida temporales, sesiones, dispositivos y aislamiento`.
7. `PocketBase 0.38.2 aplica límites, concurrencia, aislamiento y revocación real`.

No se contabilizan como aprobadas. El runtime L7Q1 se ejecutó manualmente por HTTP según la evidencia anterior. No se añadió una imagen binaria al fixture runtime ni se ejecutó inspección visual en navegador integrado porque esa integración no estuvo disponible; la preservación de imagen/datos, PNG/SVG y la UI se cubrieron con pruebas automatizadas, y la validación visual queda incluida en la guía para Kraken.

## 11. Guía manual exacta para Kraken

1. **Premium activa:** entrar como Principal Premium en Ajustes → Landing QR; cambiar título/color/enlaces, guardar, abrir preview, mostrar/descargar PNG y SVG, abrir la página pública, pulsar un botón y confirmar vistas/clics en Analíticas.
2. **Premium desactivada:** desactivar y guardar; abrir la URL o escanear el QR físico anterior y comprobar redirección al home `/t/[slug]`, sin pantalla intermedia.
3. **Premium sin permiso:** usar un Staff Premium con `analytics.view` pero sin `landing_qr.manage`; confirmar módulo oculto y respuestas privadas `403` por hash, SDK/REST, realtime y archivo.
4. **Premium → Básico:** degradar; como Principal abrir Ajustes → Landing QR y confirmar gate, editor ausente y sin Guardar contextual. Confirmar QR PNG/SVG `404` y `/links` `302` al home.
5. **Persistencia:** desde PocketBase o endpoint privado autorizado comprobar que `landing_qr_enabled`, título, subtítulo, color, links, orden e imagen siguen almacenados sin cambios.
6. **Básico → Premium:** restaurar Premium; confirmar contenido, imagen, orden, links y estado activo previo exactos, sin nueva carga.
7. **Plan vencido:** fijar un vencimiento controlado; confirmar el mismo gate Premium, bloqueo público/QR/REST y persistencia intacta. Luego restaurar el plan.
8. **PC y móvil:** probar sidebar, grupo Ajustes, tabs y `#landing` en anchos PC/1024/768/430/390/375; confirmar que no aparece Ajustes generales durante la resolución ni existe scroll horizontal.
9. **F12:** intentar PATCH de cada `landing_qr_*`, append/delete de `landing_qr_hero_image`, lectura con `fields/filter/sort/expand`, suscripción realtime, POST de view/click y IDs/slugs cruzados entre dos tiendas; esperar `403` o `404` saneados según la superficie.
10. **QR impreso anterior:** durante downgrade escanearlo nuevamente y confirmar que lleva al home de esa misma tienda, nunca a otra tienda ni a una ruta hardcodeada.

## 12. Limpieza

- Fixtures temporales L7Q1 restantes: **0**.
- Usuarios/tiendas/settings/eventos/sesiones/archivos temporales restantes: **0**; estaban dentro de la base temporal eliminada.
- Bases y carpetas runtime temporales restantes: **0**.
- Procesos PocketBase/Astro/Playwright/watchers/scripts abiertos por L7Q1: **0**.
- Listeners L7Q1 en puertos `4322` y `8092`: **0**.
- `frontend-powerzona/dist`: ausente.
- `frontend-powerzona/.astro`: ausente.
- Capturas, videos, traces y logs temporales: **0**.
- Las terminales oficiales previas no fueron cerradas ni modificadas.

## 13. `git status --short` final

```text
 M backend-powerzona/pb_hooks/pz_store_permission_enforcement.pb.js
 M backend-powerzona/pb_hooks/pz_store_permission_enforcement_lib.js
 M backend-powerzona/tests/pz_store_privacy_c3.test.cjs
 M docs/tusenda84/reportes/V7E9-vencimiento-productos-premium.md
 M frontend-powerzona/src/components/admin/AdminSidebar.astro
 M frontend-powerzona/src/components/shared/StoreCapabilityGate.astro
 M frontend-powerzona/src/lib/landingQr.ts
 M frontend-powerzona/src/pages/admin/store-settings.astro
 M frontend-powerzona/src/pages/api/landing-qr/click.ts
 M frontend-powerzona/src/pages/links.astro
 M frontend-powerzona/src/pages/t/[storeSlug]/links.astro
 M frontend-powerzona/src/pages/t/[storeSlug]/links/qr.png.ts
 M frontend-powerzona/src/pages/t/[storeSlug]/links/qr.svg.ts
 M frontend-powerzona/tests/m7u2GranularAdminActions.test.mjs
?? backend-powerzona/tests/pz_l7q1_landing_qr_premium.test.cjs
?? docs/tusenda84/reportes/L7Q1-landing-qr-premium.md
?? frontend-powerzona/tests/l7q1LandingQrPremium.test.mjs
```

No se ejecutó `git add`, commit, push, merge, cherry-pick, deploy ni cambios en Coolify/Cloudflare.

L7Q1 queda técnicamente listo para revisión, pero **no se marca como COMPLETADO** hasta recibir las pruebas manuales y la confirmación expresa de Kraken.
