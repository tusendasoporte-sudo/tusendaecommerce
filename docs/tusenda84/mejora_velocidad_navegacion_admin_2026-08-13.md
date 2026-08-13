# Mejora de velocidad y navegación del administrador

Fecha: 2026-08-13

Alcance inicial: Resumen, Pedidos y Envíos en web y APK administrativa.

Entorno de validación: staging.

## Objetivo

Reducir la sensación de que cada sección abre una página nueva sin convertir todavía los formularios administrativos en una SPA. La primera fase conserva la navegación y las protecciones existentes, elimina trabajo repetido del servidor y precarga solamente los destinos seguros del piloto.

## Diagnóstico confirmado

- Cada sección administrativa usa navegación SSR completa.
- El middleware ya refrescaba la sesión, resolvía la tienda y consultaba permisos.
- Resumen, Pedidos, Envíos y `AdminSidebar` repetían parte de esas operaciones durante la misma petición.
- La WebView Android ya mantiene una instancia y usa `LOAD_DEFAULT`; no se cambió su caché para evitar datos administrativos desactualizados.

## Funciones y procesos existentes modificados

### `src/middleware.ts`

- `onRequest` conserva las mismas redirecciones y reglas de permisos.
- Ahora comparte en `Astro.locals` el cliente autenticado, el contexto de tienda y el contexto de permisos obtenidos durante la petición.
- Añade `Server-Timing` para medir autenticación, tienda, permisos y tiempo total administrativo.

Riesgo controlado: sesión, permisos, acceso Master y resolución del tenant. No se cambió ninguna regla de autorización.

### `src/lib/storeContext.ts`

- Se añadió `getStoreFilterForStoreId` para construir el filtro desde el `storeId` ya validado.
- `getStoreFilterForAdmin` conserva su contrato y reutiliza el helper nuevo.

Riesgo controlado: aislamiento de datos por tienda. El valor continúa escapándose con la función existente.

### Resumen, Pedidos y Envíos

- Reutilizan el contexto validado por el middleware.
- Conservan un fallback compatible cuando se renderizan fuera del flujo normal.
- Entregan el contexto de permisos a `AdminSidebar` para evitar otra consulta idéntica.

Riesgo controlado: visibilidad de módulos y acciones según permisos.

### `AdminSidebar.astro` y `astro.config.mjs`

- La precarga queda desactivada globalmente para enlaces no seleccionados.
- Solo Resumen, Pedidos y Envíos participan en el piloto.
- Escritorio precarga al pasar el puntero; móvil inicia la precarga al tocar.
- No se añadió `ClientRouter` y los editores siguen usando recarga tradicional.

Riesgo controlado: no se alteran formularios, guardas de cambios, historial ni botón Atrás de Android.

## Medición anterior al cambio

Muestra manual en staging, sesión Master soporte y `DOMContentLoaded`:

- Pedidos: 723 ms en la primera entrada; muestras posteriores de 269 ms y 334 ms.
- Envíos: 269 ms en la primera entrada; muestras posteriores de 265 ms y 275 ms.
- Resumen: muestras de 463 ms y 370 ms.

Estas cifras se usarán solo como referencia relativa; red, caché y carga del servidor pueden variar.

## Pruebas automáticas ejecutadas

- Compilado Astro SSR: aprobado.
- Piloto de contexto compartido y precarga selectiva: 2/2 aprobado.
- Navegación Atrás Android y formularios protegidos: 6/6 aprobado.
- Shell móvil administrativo: 5/5 aprobado.
- Suite completa posterior: 458 pruebas, 453 aprobadas y 5 fallos ya presentes en el commit base.
- Suite del commit base `ecc6a42`: 456 pruebas, 451 aprobadas y los mismos 5 fallos.

Por tanto, esta mejora no añade fallos nuevos a la suite existente.

## Pruebas manuales necesarias en staging

1. Administrador principal: navegar varias veces entre Resumen, Pedidos y Envíos.
2. Colaborador limitado: confirmar que solo aparecen destinos permitidos y que una URL prohibida sigue devolviendo bloqueo o redirección.
3. Master soporte: entrar en PowerZona, navegar por el piloto y volver al panel Master.
4. Sesión vencida: confirmar redirección al login sin contenido administrativo anterior.
5. Android: comprobar Resumen → Pedidos → detalle → Atrás → Pedidos.
6. Android: comprobar Resumen → Envíos → formulario → Atrás, incluyendo la advertencia de cambios sin guardar.
7. Pedidos: abrir un pedido y verificar cambio de estado, acciones permitidas y datos privados según permisos.
8. Envíos: crear/editar una zona únicamente como prueba controlada y cancelar sin guardar.
9. Notificaciones: abrir/cerrar panel y abrir un destino de pedido.
10. Navegar repetidamente y confirmar que menús, diálogos y botones responden una sola vez.
11. Comparar tiempos posteriores mediante `Server-Timing` y percepción en PC y emulador.

## Fuera de esta fase

- Productos, Categorías y Ajustes mantienen navegación tradicional.
- No se cambió la caché de la WebView.
- No se cachea HTML administrativo ni respuestas de API mediante service worker.
- La navegación parcial del contenido se evaluará después de validar esta fase y adaptar los scripts para evitar eventos duplicados.
