# 🛒 Master Document - Project WEB Power Zona E-commerce

**Fecha de actualización:** 2026-06-07  
**Estado del proyecto:** Base funcional de tienda individual + checkout WhatsApp + panel admin + catálogo/variaciones + ajustes públicos + monedas + regalos + comprobante público + optimización de imágenes + prefijo de órdenes + fotos limpias. Nueva etapa de infraestructura profesional iniciada: GitHub privado conectado, ramas `main/dev`, `.gitignore` seguro, frontend Astro preparado para Coolify SSR, staging en Coolify funcionando, PocketBase staging desde repo GitHub con migraciones aplicadas y frontend conectado por `PUBLIC_POCKETBASE_URL`. **Próximo bloque recomendado: copiar `pb_data` local a staging para probar datos reales desde dominio temporal y luego continuar prueba visual móvil/PC antes de Producto individual visual y funcional.** Bloque futuro documentado: plataforma multitienda + bazar principal.

---

## 0. Control de avance del proyecto PowerZona

Esta sección sirve como mapa rápido para saber qué partes ya quedaron cerradas, cuáles están en revisión y cuáles siguen pendientes.

### Leyenda de estado

```txt
✅ CERRADO
🟡 IMPLEMENTADO / PENDIENTE DE PRUEBA FINAL
🔜 PRÓXIMO BLOQUE RECOMENDADO
⏳ PENDIENTE
💡 FUTURO
⚠️ REVISAR MÁS ADELANTE
```

---

### 0.1 Bloques cerrados

```txt
✅ Documentación base del proyecto.
✅ Backend inicial en PocketBase.
✅ Colecciones principales de PocketBase.
✅ Conexión Astro + PocketBase.
✅ Catálogo inicial con categorías y productos reales.
✅ Página de producto por slug.
✅ Carrito en localStorage.
✅ Botón flotante del carrito.
✅ Panel lateral del carrito.
✅ Control de cantidades en carrito.
✅ Bloqueo de cantidad máxima según stock en carrito.
✅ Checkout inicial.
✅ Botón del carrito: Hacer el pedido.
✅ Botón del checkout: Realizar Pedido.
✅ Ocultar carrito flotante en /checkout.
✅ Mensaje ¿Deseas agregar algo más? con botón Volver al catálogo.
✅ Redirección al catálogo si el carrito queda vacío en checkout.
✅ Formulario real del cliente.
✅ Método de entrega en checkout.
✅ Guardado de orden en orders.
✅ Guardado de productos en order_items.
✅ Número de orden personalizado PowerZona.
✅ Zonas de envío desde PocketBase.
✅ Municipio + Zona de entrega como desplegables separados.
✅ Envío calculado en USD.
✅ WhatsApp abierto con resumen del pedido.
✅ Panel admin básico de órdenes.
✅ Edición administrativa de órdenes.
✅ Agregar productos a una orden con buscador.
✅ Variaciones como desplegable.
✅ Validación de stock al editar/agregar productos en órdenes.
✅ Evitar productos duplicados dentro de la misma orden.
✅ Contactar cliente por WhatsApp desde el panel admin.
✅ Notificación manual de confirmación por WhatsApp.
✅ Inventario seguro al confirmar / cancelar / volver a pendiente.
✅ Flujo seguro de estados de órdenes en panel admin.
✅ Bloqueo de edición según estado de la orden.
✅ Notificación por WhatsApp según estado de la orden.
✅ Borrado administrativo de órdenes sin modificar inventario.
✅ Modo selección con checkbox para borrar órdenes desde el listado.
✅ Tarjetas premium del resumen de órdenes.
✅ Paginación de órdenes a 15 por página.
✅ Limpieza visual del panel admin y navegación lateral base.
✅ Gestión de catálogo con categorías y subcategorías.
✅ Ver contenido de categoría en vista limpia.
✅ Jerarquía interna de categoría → subcategorías → productos directos.
✅ Subcategorías integradas dentro de la tarjeta de categoría.
✅ Botones preparados para Nuevo producto desde categoría y subcategoría.
✅ Gestión de Catálogo → Crear y editar productos en página separada.
✅ Creación rápida de categoría/subcategoría desde productos.
✅ Estado Agotado y Preorder básico en productos.
✅ Gestión de Catálogo → Variaciones de productos cerrada de momento.
✅ `track_stock=false` aplicado en tienda pública, carrito, checkout y órdenes.
✅ Variaciones visibles en tienda pública con vistas por botones, desplegable y checkbox fijo.
✅ Carrito, checkout y panel admin conservan y muestran la variación seleccionada.
✅ Creación de productos con stock descontable corregida.
✅ Prevención visual de productos repetidos y búsqueda por referencia interna.
✅ Ajustes de la tienda → Crear Producto/Promo cerrado como base funcional.
✅ Productos destacados funcionando con resumen admin y sección pública.
✅ Promo visual funcionando sin etiqueta técnica visible al cliente.
✅ Acceso rápido funcionando como elemento visual/enlace de portada.
✅ Organización Visual básica funcionando para ordenar destacados, promos y accesos rápidos.
✅ Mostrar/Ocultar promos visuales y accesos rápidos desde Organización Visual.
✅ Regla pública aplicada: productos con categoría solo se muestran en su categoría, excepto si están destacados.
✅ Mobile público reforzado con viewport seguro, protección contra scroll horizontal y CSS base responsive.
✅ Ajustes generales públicos funcionando como base: nombre público, WhatsApp, portada/banner, logo/icono, dirección, horarios, bienvenida, servicios y reseña.
✅ Menú público de 3 puntos implementado y colocado junto a la lupa/buscador en la zona superior de la tienda.
✅ Buscador público separado en `/buscar`, con búsqueda automática mientras el cliente escribe y búsquedas recientes por dispositivo.
✅ Limpieza pública/admin de textos no deseados como “Tienda pública”, “Menú de la tienda” y textos técnicos del menú anterior.
✅ Experiencia pública de categorías/subcategorías en páginas propias implementada como base funcional.
✅ Página `/categoria/[slug]` creada.
✅ Página `/subcategoria/[slug]` creada.
✅ Portada pública limpia con categorías visuales, botón WhatsApp y botón Ver categorías debajo de la portada.
✅ Nombres de categorías colocados arriba de la tarjeta, fuera de la imagen/tarjeta.
✅ Productos destacados compactos tipo carrusel en portada.
✅ Productos dentro de categoría/subcategoría en 2 por fila y con botón moderno Comprar.
✅ Texto “Accesos visuales y ofertas del negocio.” eliminado debajo de Promociones.
✅ Monedas tienda pública implementada como base funcional.
✅ Selector público de moneda visual funcionando.
✅ Precios públicos muestran solo la moneda elegida cuando el producto es convertible.
✅ Productos marcados como Solo USD se mantienen en USD aunque el cliente elija CUP.
✅ Carrito y checkout mantienen datos internos en USD pero muestran al cliente la lógica visual aprobada.
✅ Checkout corregido para no quedar vacío al pasar desde el carrito.
✅ WhatsApp del cliente muestra lo mismo que vio el cliente en checkout.
✅ Envío mostrado separado como USD / equivalente CUP.
✅ Total visual de productos en CUP no incluye el envío.
✅ Panel admin de órdenes muestra Resumen cliente y Uso interno, separando productos CUP, productos USD y envío.
```

---

### 0.2 Bloques implementados que necesitan prueba final antes de considerarse 100% cerrados

```txt
✅ Inventario seguro al confirmar / cancelar / volver a pendiente.
✅ Edición del resumen de órdenes.
✅ Borrado administrativo de órdenes.
```

Estado actual:

```txt
Los bloques anteriores quedaron implementados y cerrados como base funcional.
Se recomienda mantener pruebas manuales después de cada cambio nuevo, pero ya no quedan como bloque abierto.
```

Actualización cerrada de momento dentro del bloque de variaciones:

```txt
✅ Historial seguro de order_items para conservar datos aunque se borre el producto real.
✅ Borrado seguro de productos con variaciones.
✅ Migraciones corregidas para evitar duplicar campos existentes en PocketBase.
✅ track_stock seguro aplicado a productos simples y productos con variaciones.
✅ Variaciones visibles y seleccionables en tienda pública.
```

---

### 0.3 Bloque actual recomendado

```txt
🔜 Próximo bloque recomendado: Producto individual visual y funcional.
```

Estado del bloque anterior:

```txt
✅ Crear Producto/Promo cerrado como base funcional.
✅ Organización Visual básica cerrada y probada.
✅ Mobile público ajustado.
✅ Ajustes generales públicos implementados.
✅ Menú público de 3 puntos implementado.
✅ Búsqueda pública separada implementada como base.
✅ Categorías y subcategorías públicas en páginas propias implementadas como base.
✅ Portada pública ajustada con categorías más visuales y destacados compactos.
✅ Monedas tienda pública cerrada como base funcional.
✅ Carrito, checkout, WhatsApp y panel admin actualizados para moneda visual y cobro mixto.
```

Objetivo inmediato recomendado:

```txt
Mejorar la página individual del producto sin romper moneda, variaciones, carrito ni checkout.
```

Checklist de moneda cerrado en pruebas:

```txt
- Cliente puede elegir CUP como moneda visual.
- Producto convertible se muestra en CUP.
- Producto Solo USD se muestra en USD.
- Ambos productos pueden convivir en el carrito.
- El checkout ya no queda vacío al tocar Hacer el pedido.
- El mensaje de WhatsApp muestra lo mismo que vio el cliente.
- El envío se muestra aparte como USD / equivalente CUP.
- El total CUP de productos no incluye el envío.
- La orden en admin muestra Resumen cliente y Uso interno.
- El admin puede ver productos CUP, productos USD y envío separado.
```

Orden recomendado actualizado:

```txt
1. Producto individual visual y funcional.
2. Carrito / checkout visual.
3. Página de gracias después de enviar pedido.
4. Copia visual pública de orden para el cliente.
5. Panel admin relacionado con tienda pública y ajustes generales.
6. Regalos profesionales por reglas.
7. Plataforma multitienda + bazar principal como bloque futuro grande.
```

División importante:

```txt
Monedas queda cerrado como base funcional.
Cualquier ajuste futuro de moneda debe hacerse como refinamiento, no como bloque abierto principal.
```

---

### 0.4 Bloques pendientes recomendados después del paso 1

```txt
⏳ Buscador público refinado.
⏳ Producto individual visual y funcional.
⏳ Carrito / checkout visual.
⏳ Panel admin relacionado con tienda pública y ajustes generales.
⏳ Página de gracias después de enviar pedido.
⏳ Copia visual pública de orden para el cliente.
⏳ Gestión de inventario avanzada.
⏳ Métodos de domicilio y recogida desde panel admin.
⏳ Cobro mixto avanzado / pagos reales separados más adelante si hace falta.
⏳ Promociones, cintillos y banners avanzados.
⏳ Cupones.
⏳ Regalos profesionales por reglas (`gift_rules`) después de moneda y checkout visual.
⏳ Reseñas.
⏳ Métricas avanzadas.
⏳ Ganancia por orden.
⏳ Alertas de vencimiento.
```

---

### 0.5 Bloques futuros

```txt
💡 PWA instalable.
💡 Notificaciones push promocionales.
💡 Campañas push desde panel admin.
💡 Historial de notificaciones.
💡 Producción con Hetzner, Coolify y Cloudflare.
💡 Plataforma multitienda + bazar principal.
```

---

### 0.6 Recomendación de trabajo

Antes de iniciar cada bloque nuevo:

```txt
1. Cerrar el bloque anterior.
2. Actualizar source.
3. Actualizar Master Document.
4. Abrir conversación nueva.
5. Indicar el bloque exacto a trabajar.
```

Mensaje recomendado para el siguiente chat si el paso 1 queda probado:

```txt
Buscador público tienda PowerZona - Source actualizado
```

Mensaje recomendado si todavía se quiere seguir corrigiendo visual antes de cerrar:

```txt
Ajustes visuales tienda pública continuación - Source actualizado
```



## Registro de actualización — Guardado de orden en PocketBase y WhatsApp

Se cerró el bloque posterior al formulario real del checkout.

Avance confirmado:

- El checkout ya guarda la orden real en PocketBase.
- Se crea el registro principal en la colección `orders`.
- Se crean los productos relacionados en la colección `order_items`.
- El botón final del checkout mantiene el texto `Realizar Pedido`.
- El sistema valida los datos del cliente antes de crear la orden.
- El número de orden visible fue ajustado para que use el formato personalizado definido para PowerZona y no un número diferente al esperado.
- Después de crear la orden, el flujo queda preparado para abrir WhatsApp con el resumen del pedido.
- Queda pendiente mejorar el envío con dos desplegables separados: `Municipio` y `Zona de entrega`, donde la zona define el precio.
- Se definió que el administrador debe poder editar y borrar órdenes de prueba desde PocketBase, sin habilitar esas acciones al público.

---

## Registro de actualización — Checkout formulario real

Actualización agregada después del bloque de formulario real del cliente y método de entrega.

Resumen del último avance:

- Checkout con formulario de datos del cliente.
- Método de entrega visible y seleccionable.
- Validaciones iniciales funcionando.
- Botón `Realizar Pedido` activado solo cuando corresponde.
- Mensaje temporal de validación correcta.
- Próximo bloque: guardar pedido en PocketBase y abrir WhatsApp.

---

## 1. Visión General del Proyecto

Crear una plataforma de e-commerce rápida, moderna y optimizada para móviles, donde los clientes puedan navegar por un catálogo estructurado por categorías y subcategorías, agregar productos al carrito, revisar cantidades, elegir método de entrega y finalizar sus pedidos directamente por WhatsApp.

El objetivo principal es que PowerZona tenga una tienda simple para el cliente, fácil de administrar desde PocketBase y preparada para funcionar bien en conexiones lentas, especialmente pensando en usuarios en Cuba.

## 1.2 Regla de trabajo por puntos separados

El proyecto PowerZona se trabajará por puntos o bloques importantes, no necesariamente por fases completas.

Cada vez que se vaya a iniciar un punto nuevo importante, se recomienda abrir una conversación nueva para mantener el contexto limpio.

Al terminar cada punto trabajado:

- Se actualiza el Master Document si hubo cambios importantes.
- Se actualizan los sources/documentos técnicos necesarios.
- Se deja claro qué se completó.
- Se deja claro cuál es el próximo punto recomendado.

Antes de comenzar un nuevo punto, ChatGPT debe avisar al usuario:

"Este punto ya quedó cerrado. Para comenzar el próximo punto, conviene abrir una nueva conversación y usar los sources actualizados."

Esto aplica aunque el nuevo punto pertenezca a la misma fase del roadmap.

---

## 2. Infraestructura y Herramientas del Proyecto

### 2.1. Stack Tecnológico

- **Gestión de código:** GitHub.
- **Entorno de desarrollo:** Visual Studio Code.
- **Frontend:** Astro.
- **Estilos:** Tailwind CSS.
- **Backend y base de datos:** PocketBase.
- **Servidor futuro:** Hetzner VPS / Cloud.
- **Despliegue futuro:** Coolify.
- **DNS, SSL y CDN futuro:** Cloudflare.

### 2.2. Motivo de la arquitectura

El proyecto se basa en herramientas autoalojadas para evitar dependencias de plataformas que puedan tener bloqueos o restricciones hacia Cuba. Astro se utiliza por su velocidad, bajo consumo de recursos y buen rendimiento en conexiones limitadas. PocketBase se utiliza porque permite crear colecciones, administrar datos e imágenes y exponer una API de forma sencilla desde un panel visual.

### 2.3. Consideraciones especiales para Cuba

- Evitar servicios externos que puedan bloquear IPs cubanas.
- Optimizar imágenes con carga diferida (`lazy loading`).
- Mantener el frontend ligero y mobile-first.
- Usar Cloudflare en producción para caché, SSL y aceleración global.
- Guardar el carrito en `localStorage` para reducir peticiones al servidor y proteger al cliente ante desconexiones.

---

## 3. Reglas Generales del Proyecto

- Todo lo visible para el cliente debe mostrarse en español.
- El backend, colecciones, campos, variables y servicios se mantienen en inglés.
- USD es la moneda base interna del negocio.
- CUP, EUR y CASHAPP funcionan como monedas de visualización o pago.
- Costos, precio base, margen de ganancia y rentabilidad se calculan primero en USD.
- El checkout será sin cuenta de cliente, modo invitado.
- El carrito se manejará inicialmente en `localStorage`.
- Los pedidos deben guardarse en PocketBase antes de generar o abrir el mensaje de WhatsApp.
- El número de WhatsApp de la tienda debe venir desde `settings.whatsapp_number`.
- La dirección fija de recogida no se muestra directamente; la recogida se coordina por WhatsApp.
- El stock no se descuenta al crear una orden en estado `pending`; se descuenta cuando el pedido pase a `confirmed`.

---

## 4. Modelo de Negocio y Catálogo

### 4.1. Categorías

Las categorías organizan el catálogo principal de la tienda.

Ejemplos:

- Proteínas.
- Vitaminas.
- Electrónica.
- Ropa.
- Hogar.

Cada categoría debe tener:

- Nombre.
- Slug SEO.
- Imagen de portada.
- Estado activo/inactivo.
- Orden de visualización.

### 4.2. Subcategorías

Las subcategorías pertenecen a una categoría principal.

Cada subcategoría debe tener:

- Nombre.
- Slug SEO.
- Relación con categoría.
- Imagen de portada.
- Estado activo/inactivo.
- Orden de visualización.

### 4.3. Productos

Cada producto debe tener:

- Nombre.
- Slug SEO.
- Descripción.
- Galería de imágenes.
- Categoría.
- Subcategoría opcional.
- Precio base en USD.
- Stock.
- Producto destacado o no.
- Estado activo/inactivo.
- Restricción `only_usd`.
- Modalidad de entrega.
- Fecha de vencimiento opcional.
- Margen o ganancia.

### 4.4. Variaciones de Producto

Las variaciones permiten manejar atributos como:

- Color.
- Tamaño.
- Sabor.
- Peso.
- Servicios adicionales.

Cada variación debe tener:

- Producto relacionado.
- Tipo de variación.
- Valor.
- Precio extra en USD.
- Stock propio.
- Estado activo/inactivo.

---

## 5. Sistema de Monedas

### 5.1. Moneda base

La moneda base interna siempre será USD. Esto aplica para precios, costos, ganancias, totales internos y rentabilidad.

### 5.2. Monedas de visualización o pago

El cliente podrá elegir monedas activas como:

- USD.
- CUP.
- EUR.
- CASHAPP.

Cada moneda debe tener:

- Código.
- Nombre.
- Símbolo.
- Tasa de cambio.
- Estado activo/inactivo.
- Indicador de moneda por defecto.

### 5.3. Conversión dinámica

Cuando el cliente elige una moneda distinta de USD, el sistema debe convertir los precios usando la tasa activa en `currencies.exchange_rate`.

### 5.4. Productos solo USD

Si un producto está marcado como `only_usd`, nunca debe convertirse a otra moneda.

### 5.5. Cobro mixto

Si el cliente selecciona CUP, EUR o CASHAPP, pero el carrito contiene productos `only_usd`, el sistema debe separar los totales:

```txt
Total en CUP: 4000 CUP
Total en USD: 250 USD
```

El backend ya está preparado para esta lógica mediante campos como:

- `products.only_usd`
- `orders.mixed_payment`
- `orders.local_currency_total`
- `orders.usd_only_total`
- `orders.shipping_cup`
- `orders.exchange_rate_used`
- `order_items.only_usd`

---

## 6. Sistema de Envíos y Recogida

### 6.1. Envío a domicilio

El envío inicial se manejará solo para La Habana mediante zonas o municipios.

Cada zona de envío debe tener:

- Municipio.
- Zona opcional.
- Precio en USD.
- Estado activo/inactivo.
- Nota opcional.

El envío se calcula originalmente en USD. Si el cliente elige CUP, debe mostrarse aparte como precio USD / equivalente CUP, sin mezclarlo dentro del total visual de productos.

### 6.2. Recogida

La recogida no mostrará una dirección fija. El cliente selecciona recogida y la coordinación se hace por WhatsApp usando el texto configurado en `settings.pickup_coordination_message`.

### 6.3. Modalidad de entrega por producto

Cada producto tendrá una modalidad:

- `delivery`: solo envío.
- `pickup`: solo recogida.
- `both`: envío o recogida.

### 6.4. Carrito mixto de logística

Si el carrito contiene al mismo tiempo productos que solo permiten envío y productos que solo permiten recogida, el sistema debe ofrecer una opción obligatoria:

**Coordinar su pedido con un admin.**

Esto evita bloquear la venta y permite resolver la entrega manualmente por WhatsApp.

---

## 7. Carrito de Compras

### 7.1. Estado actual del carrito

El carrito ya tiene una primera implementación funcional en el frontend Astro.

Actualmente permite:

- Guardar productos en `localStorage` bajo la clave `powerzona_cart`.
- Mostrar botón flotante cuando hay productos agregados.
- Abrir panel lateral del carrito.
- Mostrar imagen, nombre, precio, cantidad y subtotal por producto.
- Aumentar cantidad con botón `+`.
- Disminuir cantidad con botón `−`.
- Eliminar producto.
- Calcular total estimado en USD.
- Evitar que la cantidad supere el stock disponible.
- Desactivar visualmente el botón `+` cuando el cliente llega al máximo de stock.
- Reactivar el botón `+` si el cliente baja la cantidad con el botón `−`.
- Mostrar el botón principal del carrito con el texto `Hacer el pedido`.
- Cerrar automáticamente el carrito lateral cuando queda vacío.
- Evitar que el carrito lateral quede abierto sin productos.

### 7.2. Regla crítica de stock en carrito

El cliente no debe poder agregar más unidades que las disponibles en stock.

Reglas:

- Si `quantity >= stock`, el botón `+` se desactiva.
- Si el cliente presiona `−` y la cantidad queda por debajo del stock, el botón `+` vuelve a activarse.
- Si intenta agregar desde la página de producto y ya alcanzó el stock máximo, debe mostrarse un aviso como: `Stock máximo alcanzado`.

### 7.3. Persistencia del carrito

El carrito se guarda en el navegador del cliente con `localStorage`, para que no se pierda si:

- El cliente cierra la página.
- La conexión falla.
- Recarga el navegador.

### 7.4. Comportamiento del carrito en checkout

Cuando el cliente entra a la página `/checkout`, no debe mostrarse el carrito flotante ni el panel lateral del carrito.

Reglas:

- El carrito flotante solo debe mostrarse en páginas de catálogo o producto donde ayude a navegar hacia el pedido.
- En `/checkout`, el cliente ya está revisando el pedido, por lo que el carrito lateral puede crear confusión visual.
- Si el cliente elimina todos los productos desde el checkout, el sistema debe mostrar un mensaje de carrito vacío y luego redireccionar automáticamente al catálogo.
- Si el carrito lateral queda vacío en cualquier otra vista, debe cerrarse automáticamente.

---

## 8. Checkout por WhatsApp

### 8.1. Flujo previsto

El flujo final debe ser:

1. El cliente agrega productos al carrito.
2. El cliente revisa cantidades.
3. El cliente selecciona moneda.
4. El sistema valida si hay productos `only_usd`.
5. El sistema calcula total normal, total USD-only y envío.
6. El cliente llena sus datos.
7. Se crea un registro en `orders` con estado `pending`.
8. Se crean registros en `order_items`.
9. Se genera el mensaje de WhatsApp usando `settings.whatsapp_number`.
10. El cliente confirma el pedido por WhatsApp.
11. El administrador confirma manualmente el pedido en PocketBase.
12. Al pasar a `confirmed`, se descuenta el stock.

### 8.2. Mensaje de WhatsApp

El mensaje debe incluir:

- Número de orden.
- Nombre del cliente.
- Teléfono.
- Dirección si aplica.
- Nota del cliente.
- Método de entrega.
- Lista de productos.
- Variaciones seleccionadas.
- Cantidades.
- Subtotales.
- Total en moneda seleccionada.
- Total separado en USD si hay productos `only_usd`.
- Envío mostrado aparte como USD / equivalente en moneda visual cuando aplique.

### 8.3. Avance cerrado de experiencia checkout y carrito

Se cerró un bloque de ajustes de experiencia entre carrito y checkout.

Cambios definidos e implementados:

- El botón del carrito dice `Hacer el pedido`.
- El botón principal del checkout dice `Realizar Pedido`.
- En la página `/checkout` no debe mostrarse el carrito flotante.
- El carrito lateral se cierra automáticamente cuando queda vacío.
- En checkout se muestra debajo de los productos una ayuda para seguir comprando:
  - Texto: `¿Deseas agregar algo más?`
  - Botón: `Volver al catálogo`.
- Si el cliente elimina todos los productos desde checkout:
  - Se muestra un mensaje claro de carrito vacío.
  - Luego se redirecciona automáticamente al catálogo.

### 8.4. Avance cerrado de formulario real y método de entrega

Se inició y se dejó funcional el bloque de formulario real del checkout.

Estado actual confirmado:

- La página `/checkout` ya muestra una sección de **Datos del cliente**.
- El formulario incluye los campos principales necesarios para iniciar un pedido:
  - Nombre completo.
  - Teléfono.
  - Dirección o referencia.
  - Nota adicional opcional.
- La página `/checkout` ya muestra una sección de **Método de entrega**.
- El cliente puede seleccionar un método de entrega:
  - `Envío`.
  - `Recogida`.
  - `Coordinar`.
- El botón `Realizar Pedido` permanece desactivado hasta que los datos requeridos estén completos.
- Al llenar los datos correctamente, el botón `Realizar Pedido` se activa.
- Al tocar `Realizar Pedido`, actualmente se muestra una validación temporal indicando que los datos fueron validados correctamente.
- El mensaje temporal actual confirma que en el próximo bloque el pedido se guardará en PocketBase y luego se abrirá WhatsApp.

Texto de prueba actual:

```txt
Datos validados correctamente. En el próximo bloque este pedido se guardará en PocketBase y luego se abrirá WhatsApp.
```

### 8.5. Avance cerrado de guardado de orden en PocketBase

Se cerró el bloque de conexión inicial entre el checkout y el backend real.

Estado actual confirmado:

- Al tocar `Realizar Pedido`, el sistema ya no se queda solamente en la validación temporal.
- El checkout crea una orden real en la colección `orders` de PocketBase.
- El checkout crea los productos del pedido en la colección `order_items`.
- La orden queda con estado inicial `pending`, pendiente de revisión y confirmación por el administrador.
- El número de orden fue ajustado para que use el formato personalizado definido para PowerZona.
- El número mostrado al cliente y el número guardado deben coincidir.
- El flujo queda preparado para abrir WhatsApp después de guardar correctamente la orden.
- El descuento de stock todavía no debe ejecutarse al crear el pedido; se mantiene reservado para cuando el administrador confirme la orden.

Regla importante:

- El cliente crea pedidos como invitado.
- La administración, edición y eliminación de pedidos queda para el administrador desde PocketBase.
- Las reglas de PocketBase deben permitir al admin editar o borrar órdenes de prueba, pero no deben permitir que un cliente público modifique o borre pedidos.

### 8.6. Próximo bloque pendiente del checkout

El siguiente bloque importante será mejorar el método de envío y cerrar la integración final con WhatsApp.

Pendiente para el próximo bloque:

- Confirmar que el mensaje de WhatsApp se genera con los datos reales de la orden guardada.
- Leer `settings.whatsapp_number` desde PocketBase si todavía no está conectado en el flujo final.
- Abrir WhatsApp después de guardar correctamente la orden.
- Conectar zonas de envío desde `shipping_zones`.
- Cambiar el campo manual de municipio por dos desplegables separados:
  - `Municipio`.
  - `Zona de entrega`.
- La zona de entrega debe mostrar el precio, por ejemplo: `Miramar - $5 USD`.
- El precio del envío debe depender de la zona seleccionada, no solamente del municipio.
- Recalcular el total del pedido incluyendo el envío cuando aplique.
- Mantener `Recogida` y `Coordinar` sin obligar a seleccionar zona de entrega.

---

## 9. Backend PocketBase

### 9.1. Estado actual del backend

El backend inicial ya fue creado y revisado en PocketBase.

Colecciones principales creadas:

- `categories`
- `subcategories`
- `products`
- `product_variations`
- `currencies`
- `shipping_zones`
- `settings`
- `orders`
- `order_items`

PocketBase también incluye la colección auth `users`, pero por ahora no se usará para clientes porque el checkout será invitado.

Estado operativo reciente:

- `orders` ya recibe pedidos reales desde el checkout.
- `order_items` ya recibe las líneas/productos relacionados de cada pedido.
- El campo de número de orden debe conservar el formato visible definido para PowerZona.
- Para pruebas internas, el administrador debe poder actualizar y borrar registros en `orders` y `order_items`.
- Estas acciones administrativas no deben habilitarse para usuarios públicos.

### 9.2. Reglas confirmadas

- Las colecciones públicas de catálogo usan reglas de lectura con `active = true`.
- Las colecciones de pedidos permiten creación pública para checkout invitado.
- Los pedidos no tienen lectura pública.
- List, View, Update y Delete de pedidos quedan protegidos para evitar exposición de datos.
- Las imágenes de categorías y subcategorías son públicas.
- Las imágenes de productos están en galería con hasta 10 imágenes.
- `products.delivery_mode` es obligatorio.
- `orders.status` debe iniciar como `pending`.
- `orders.order_number` será generado inicialmente desde el frontend.

### 9.3. Ajustes generales

La colección `settings` será la fuente central para:

- Nombre público de la tienda.
- Número de WhatsApp.
- Modo mantenimiento.
- Moneda por defecto.
- Notas internas o públicas del negocio.
- Mensaje para coordinar recogida.
- Configuración activa.

---

## 10. Frontend Astro

### 10.1. Estado actual del frontend

El frontend Astro ya tiene una estructura inicial creada.

Archivos principales actuales:

- `src/lib/pocketbase.ts`
- `src/lib/api.ts`
- `src/layouts/Layout.astro`
- `src/components/ProductCard.astro`
- `src/components/Cart.astro`
- `src/pages/index.astro`
- `src/pages/producto/[slug].astro`
- `src/styles/global.css`

### 10.2. Conexión con PocketBase

Ya existe una capa inicial de API en `src/lib/api.ts` para leer:

- Settings activos.
- Categorías activas.
- Monedas activas.
- Productos activos.
- Producto por slug.

### 10.3. Página principal

La página principal ya muestra:

- Título de catálogo.
- Categorías activas desde PocketBase.
- Productos activos desde PocketBase.
- Tarjetas de producto.
- Enlace a la página de detalle por slug.

### 10.4. Página de producto

La página de producto ya muestra:

- Imagen principal.
- Galería de imágenes.
- Categoría.
- Nombre.
- Precio en USD.
- Etiqueta `Solo USD` si aplica.
- Stock disponible.
- Modalidad de entrega.
- Descripción.
- Botón para agregar al pedido.

### 10.5. Pendiente visual del frontend

- Mejorar diseño final mobile-first.
- Añadir selector de moneda visible.
- Añadir filtros por categoría/subcategoría.
- Añadir búsqueda.
- Añadir vista de checkout antes de WhatsApp.
- Añadir formularios de datos del cliente.
- Añadir validaciones de entrega.
- Añadir cálculo de envío por municipio.

---

## 11. Diseño Visual y Experiencia de Usuario

### 11.1. Estilo general

El diseño debe sentirse como una app móvil:

- Limpio.
- Moderno.
- Rápido.
- Fácil de usar.
- Con botones grandes.
- Con tarjetas visuales.
- Optimizado para teléfonos.

### 11.2. Header

La cabecera debe incluir:

- Cintillo promocional si está activo.
- Menú lateral.
- Búsqueda.
- Nombre de la marca PowerZona.
- Acceso al carrito o pedido.

### 11.3. Home

La página principal debe incluir:

- Banner promocional.
- Información de servicios.
- Categorías.
- Subcategorías o productos.
- Productos destacados.

### 11.4. Menú lateral

Debe incluir:

- Categorías.
- Pedido/carrito.
- Selector de moneda.
- Deja una reseña.
- Descarga nuestra app.
- Más sobre PowerZona.

### 11.5. Elementos flotantes

- Botón flotante del carrito si hay productos activos.
- Widget opcional de promoción o cupón vigente.

---

## 12. Marketing, Promociones y Cupones

### 12.1. Cintillo promocional

El administrador podrá activar o desactivar una barra superior para mensajes como:

- Nuevas ofertas.
- Cupones.
- Avisos de envío.
- Promociones temporales.

### 12.2. Promociones automáticas

El sistema debe permitir reglas como:

- Compra X y paga Y.
- Lleva 2 y obtén descuento.
- Descuento por volumen.

Estas promociones deben aplicarse automáticamente si el carrito cumple las condiciones.

### 12.3. Cupones manuales

Los cupones manuales permitirán que el administrador cree códigos de descuento aplicables desde el checkout. El cliente podrá escribir el código manualmente o llegar mediante un enlace directo con el cupón precargado.

Cada cupón debe permitir:

- Código único.
- Nombre interno del cupón.
- Descripción visible para el cliente.
- Estado activo/inactivo.
- Visibilidad pública u oculta.
- Cantidad máxima de usos totales.
- Cantidad máxima de usos por cliente o teléfono, si se decide controlar más adelante.
- Vigencia por fecha de inicio y fecha de finalización.
- Opción sin fecha de vencimiento.
- Descuento porcentual.
- Descuento fijo.
- Envío gratis.
- Mínimo de compra en USD.
- Cantidad mínima de productos.

### 12.4. Alcance de los cupones

Cada cupón debe tener un campo de alcance para definir sobre qué parte de la compra se aplica.

Tipos de alcance permitidos inicialmente:

- `cart_total`: cupón aplicado al valor total de la compra.
- `specific_product`: cupón aplicado a un producto específico.
- `specific_category`: cupón aplicado a una categoría específica.
- `specific_subcategory`: cupón aplicado a una subcategoría específica, si se decide habilitar este nivel.
- `shipping`: cupón aplicado solo al envío, por ejemplo envío gratis.

#### 12.4.1. Cupón sobre el valor total de la compra

Este cupón aplica sobre el subtotal general del carrito, siempre que se cumplan las reglas configuradas.

Ejemplos:

- 10% de descuento en compras mayores de 100 USD.
- 5 USD de descuento en compras mayores de 50 USD.
- Envío gratis en compras mayores de 75 USD.

Reglas importantes:

- El mínimo de compra se calcula en USD, aunque el cliente vea la tienda en CUP, EUR o CASHAPP.
- Si hay productos `only_usd`, el sistema debe respetar el cobro mixto.
- El descuento debe mostrarse claramente antes de enviar el pedido por WhatsApp.

#### 12.4.2. Cupón sobre un producto específico

Este cupón aplica solamente si el carrito contiene el producto seleccionado por el administrador.

Ejemplos:

- 15% de descuento solo para una proteína específica.
- 3 USD de descuento solo para un producto seleccionado.
- Compra mínima de 2 unidades de un producto para activar el descuento.

Reglas importantes:

- Si el producto no está en el carrito, el cupón no aplica.
- Si el cliente tiene varios productos, el descuento solo afecta al producto seleccionado.
- Si el producto tiene variaciones, el administrador podrá decidir si el cupón aplica al producto completo o a una variación específica en una fase futura.

#### 12.4.3. Cupón sobre una categoría específica

Este cupón aplica únicamente a productos dentro de una categoría seleccionada.

Ejemplos:

- 10% de descuento en toda la categoría Proteínas.
- 5 USD de descuento en la categoría Vitaminas.
- Oferta especial solo para productos de Electrónica.

Reglas importantes:

- Si el carrito tiene productos de varias categorías, el descuento solo afecta a los productos de la categoría configurada.
- El sistema debe calcular el subtotal elegible de esa categoría y aplicar el descuento sobre ese subtotal, no sobre toda la compra.
- Si no hay productos de esa categoría en el carrito, el cupón no aplica.

#### 12.4.4. Cupón sobre una subcategoría específica

Este alcance será opcional. Sirve para promociones más precisas dentro de una categoría.

Ejemplos:

- Descuento solo en Proteína Whey dentro de la categoría Proteínas.
- Descuento solo en Creatina dentro de Suplementos.

Reglas importantes:

- Solo aplica si el producto pertenece a la subcategoría configurada.
- Si un producto no tiene subcategoría, no debe calificar para este tipo de cupón.

#### 12.4.5. Cupón de envío

Este cupón aplica al costo de envío, no al precio de los productos.

Ejemplos:

- Envío gratis.
- 50% de descuento en envío.
- Descuento fijo sobre el envío en CUP.

Reglas importantes:

- El envío siempre se calcula en CUP.
- Si el pedido es recogida o coordinación con admin, el cupón de envío no aplica.
- El descuento de envío no debe afectar la ganancia de los productos.

### 12.5. Tipos de descuento

Cada cupón debe permitir seleccionar un tipo de descuento:

- `percentage`: descuento porcentual.
- `fixed_amount`: monto fijo descontado.
- `free_shipping`: envío gratis.

Reglas:

- Los descuentos sobre productos, categorías, subcategorías o carrito se calculan internamente en USD.
- Los descuentos de envío se calculan en CUP.
- Si el cliente usa otra moneda visual, el sistema convierte el descuento según la tasa activa.
- El descuento nunca debe hacer que el subtotal quede por debajo de 0.

### 12.6. Validaciones necesarias para cupones

Antes de aplicar un cupón, el sistema debe validar:

- Que el cupón exista.
- Que esté activo.
- Que esté dentro de la fecha válida.
- Que no haya superado el máximo de usos.
- Que el carrito cumpla el mínimo de compra en USD.
- Que el carrito cumpla la cantidad mínima de productos, si aplica.
- Que el carrito contenga el producto, categoría o subcategoría necesaria, si el cupón tiene alcance específico.
- Que el método de entrega sea compatible, si el cupón es de envío.

### 12.7. Visualización del cupón en el checkout

En la vista previa del checkout debe mostrarse:

- Código aplicado.
- Descripción del beneficio.
- Subtotal antes del descuento.
- Descuento aplicado.
- Envío, si corresponde.
- Total final.
- Mensaje claro si el cupón no aplica.

Ejemplo visual:

```txt
Subtotal: 120 USD
Cupón PROTEINA10: -10 USD
Envío: 500 CUP
Total final: 110 USD + 500 CUP
```

### 12.8. Cupones por enlace

El administrador podrá compartir un enlace directo con cupón. Al abrirlo, el cliente verá la promoción y el cupón quedará listo para aplicarse en el checkout.

Ejemplo de URL prevista:

```txt
/cupon/PROTEINA10
```

También se podrá aceptar el cupón como parámetro en la URL:

```txt
/?coupon=PROTEINA10
```

Reglas importantes:

- El cupón puede guardarse temporalmente en `localStorage`.
- El cupón debe validarse nuevamente en el checkout antes de guardar la orden.
- Si el cupón vence o deja de estar activo, el sistema debe mostrar un mensaje y no aplicarlo.

### 12.9. App futura, PWA y notificaciones promocionales

A futuro, PowerZona podrá evolucionar hacia una aplicación instalable para el cliente, inicialmente mediante una **PWA (Progressive Web App)** y más adelante, si fuera necesario, mediante una app nativa.

El objetivo principal de esta app será mejorar la comunicación directa con los clientes y permitir el envío de promociones mediante notificaciones.

#### Funciones futuras de la app

- Permitir que el cliente instale PowerZona en su teléfono como si fuera una app.
- Acceso rápido al catálogo, carrito y promociones.
- Notificaciones promocionales enviadas por la tienda.
- Avisos de nuevos productos.
- Avisos de cupones activos.
- Avisos de descuentos por categoría, producto o temporada.
- Recordatorios de promociones limitadas.
- Posibilidad futura de enviar mensajes personalizados según intereses o compras anteriores.

#### Notificaciones push

El sistema podrá incluir notificaciones push para enviar promociones directamente al dispositivo del cliente, siempre que el cliente haya aceptado recibirlas.

Ejemplos de notificaciones:

```txt
🔥 Nueva promo en PowerZona
Proteínas seleccionadas con descuento por tiempo limitado.
```

```txt
🎁 Cupón activo
Usa el cupón POWER10 y recibe descuento en tu compra.
```

```txt
🚚 Promo de envío
Envío especial disponible hoy para zonas seleccionadas de La Habana.
```

#### Gestión desde el panel de administración

En una fase futura, el panel admin podrá incluir una sección llamada **Notificaciones** o **Campañas Push**, donde el administrador pueda:

- Crear una notificación promocional.
- Escribir título y mensaje.
- Seleccionar imagen opcional.
- Elegir si la promoción aplica a toda la tienda, una categoría, un producto específico o un cupón.
- Programar fecha y hora de envío.
- Activar o desactivar campañas.
- Ver historial de notificaciones enviadas.

#### Consideraciones importantes

- Las notificaciones solo se enviarán a clientes que hayan aceptado recibirlas.
- Esta función no será parte de la primera versión del proyecto.
- Primero se desarrollará la tienda web, carrito, checkout por WhatsApp y panel de administración.
- La app/PWA y las notificaciones push quedarán como mejora futura del sistema.

### 12.10. Colecciones futuras recomendadas para cupones

Para implementar esta lógica en PocketBase, se recomienda crear más adelante una colección `coupons`.

Campos sugeridos para `coupons`:

- `code` — text — requerido — código único.
- `name` — text — requerido — nombre interno.
- `description` — text/editor — descripción visible.
- `active` — bool.
- `public` — bool.
- `discount_type` — select: `percentage`, `fixed_amount`, `free_shipping`.
- `discount_value` — number.
- `scope` — select: `cart_total`, `specific_product`, `specific_category`, `specific_subcategory`, `shipping`.
- `product` — relation opcional → `products`.
- `category` — relation opcional → `categories`.
- `subcategory` — relation opcional → `subcategories`.
- `min_order_usd` — number.
- `min_items` — number.
- `max_uses` — number.
- `used_count` — number.
- `start_date` — date.
- `end_date` — date.
- `created` — autodate.
- `updated` — autodate.

También se puede crear una colección futura `coupon_redemptions` para guardar el historial de uso de cupones por orden.

Campos sugeridos para `coupon_redemptions`:

- `coupon` — relation → `coupons`.
- `order` — relation → `orders`.
- `code_used` — text.
- `discount_amount_usd` — number.
- `discount_amount_cup` — number, si aplica a envío.
- `customer_phone` — text, si se desea controlar uso por cliente.
- `created` — autodate.

---

## 13. Reseñas y Calificaciones

El sistema futuro debe permitir:

- Calificación general de la tienda.
- Calificación individual por producto.
- Comentarios o testimonios moderados por el administrador.

---
## 14. Panel de Administración PowerZona

El panel de administración de PowerZona debe evolucionar hacia un panel completo con menú lateral, organizado por secciones principales. La idea es que el administrador pueda gestionar el negocio desde una zona interna sin depender directamente de entrar a PocketBase para tareas comunes.

El panel admin no debe limitarse solamente a revisar pedidos. Debe convertirse en una herramienta central para manejar órdenes, catálogo, inventario, métodos de entrega, promociones, cupones, reseñas, métricas y ajustes generales del negocio.

La estructura visual debe incluir un menú lateral similar a un dashboard moderno, con secciones desplegables para organizar mejor las funciones.

---

### 14.1 Estructura general del panel admin

El panel admin debe tener un menú lateral con las siguientes secciones principales:

* Resumen
* Ajustes de negocio
* Gestión del catálogo
* Ventas
* Promociones
* Reseñas

Ejemplo de estructura del menú lateral:

```txt
Resumen

Ajustes de negocio

Gestión del catálogo
  - Categorías
  - Productos
  - Inventario

Ventas
  - Pedidos
  - Domicilio
  - Recogida
  - Vendedores

Promociones
  - Cintillos promocionales
  - Banners
  - Cupones
  - Promociones por producto

Reseñas
```

El menú lateral debe permitir navegar entre las diferentes áreas del panel sin mezclar todas las funciones en una sola pantalla.

---

### 14.2 Resumen / Dashboard principal

La sección de resumen debe mostrar una vista general rápida del negocio.

Debe incluir:

* Total de pedidos.
* Pedidos pendientes.
* Pedidos confirmados.
* Pedidos entregados.
* Pedidos cancelados.
* Total vendido en USD.
* Ventas del mes.
* Productos más vendidos.
* Productos con bajo inventario.
* Cupones más usados.
* Descuentos aplicados.
* Alertas importantes del negocio.

Esta sección debe servir como pantalla inicial del panel admin.

Ejemplo de datos visibles:

```txt
Pedidos pendientes: 8
Pedidos entregados este mes: 32
Ventas del mes: $1,250 USD
Producto más vendido: Whey Protein
Productos con bajo inventario: 4
```

---

### 14.3 Ajustes de negocio

La sección de ajustes de negocio debe permitir configurar información general de PowerZona.

Debe incluir:

* Nombre del negocio.
* Teléfono principal.
* WhatsApp principal.
* Dirección o zona principal de operación.
* Moneda principal del sistema.
* Mensajes generales para clientes.
* Estado general de la tienda:

  * activa;
  * pausada;
  * mantenimiento.
* Configuración de textos visibles en checkout o catálogo.

También puede incluir en el futuro:

* Horarios de atención.
* Mensaje automático de confirmación.
* Configuración de pagos.
* Configuración de monedas visibles.
* Mensaje mostrado cuando la tienda esté cerrada o pausada.

Ejemplo:

```txt
Nombre del negocio: PowerZona
WhatsApp principal: +1 305 XXX XXXX
Moneda base: USD
Estado de la tienda: Activa
Mensaje general: Envíos disponibles en La Habana.
```

---

### 14.4 Gestión del catálogo

La sección de gestión del catálogo debe permitir administrar todo lo relacionado con productos.

Debe dividirse en:

```txt
Gestión del catálogo
  - Categorías
  - Productos
  - Inventario
```

---

#### 14.4.1 Categorías

Debe permitir:

* Crear categorías.
* Editar categorías.
* Activar o desactivar categorías.
* Ordenar categorías.
* Asignar productos a categorías.
* Ocultar categorías sin eliminarlas.

Ejemplos de categorías:

```txt
Proteínas
Creatinas
Vitaminas
Pre-entrenos
Accesorios
Quemadores
Aminoácidos
```

Ejemplo de campos para una categoría:

```txt
Nombre: Proteínas
Slug: proteinas
Estado: Activa
Orden: 1
```

---

#### 14.4.2 Productos

Debe permitir:

* Crear productos.
* Editar productos.
* Activar o desactivar productos.
* Subir o cambiar imágenes.
* Editar nombre.
* Editar descripción.
* Editar precio.
* Editar moneda.
* Editar categoría.
* Editar variantes si aplica.
* Marcar producto como destacado.
* Marcar producto como oferta.
* Mostrar u ocultar productos en la web pública.

Ejemplo de datos de producto:

```txt
Nombre: Whey Protein
Categoría: Proteínas
Precio: $45 USD
Estado: Activo
Stock: 10
Producto destacado: Sí
Producto en oferta: No
```

---

#### 14.4.3 Inventario

Debe permitir:

* Ver stock disponible.
* Modificar cantidad disponible.
* Controlar stock por producto o variante.
* Ver productos agotados.
* Ver productos con bajo inventario.
* Evitar vender más cantidad que el stock disponible.
* Mostrar alertas internas cuando un producto esté bajo de inventario.

En el futuro puede incluir:

* Historial de cambios de inventario.
* Entrada de mercancía.
* Salida manual de mercancía.
* Ajustes por pérdida o corrección.
* Registro de quién hizo el cambio.
* Fecha del último ajuste.

Ejemplo:

```txt
Producto: Creatina Monohidratada
Stock actual: 2
Alerta mínima: 5
Estado: Bajo inventario
```

---

### 14.5 Ventas

La sección de ventas debe centralizar todo lo relacionado con pedidos, métodos de entrega y operación diaria.

Debe dividirse en:

```txt
Ventas
  - Pedidos
  - Domicilio
  - Recogida
  - Vendedores
```

---

#### 14.5.1 Pedidos

Esta es una de las secciones más importantes del panel admin.

Debe permitir:

* Ver historial de pedidos.
* Ver detalle completo de cada pedido.
* Buscar pedidos por:

  * número de orden;
  * cliente;
  * teléfono;
  * estado;
  * fecha.
* Cambiar estado del pedido.
* Editar datos básicos de la orden.
* Agregar notas internas.
* Eliminar pedidos falsos, de prueba o incorrectos.
* Exportar pedidos a CSV.
* Contactar al cliente por WhatsApp.
* Copiar resumen de orden.

Estados recomendados:

```txt
pending      → Pendiente
confirmed    → Confirmada
preparing    → Preparando
delivered    → Entregada
cancelled    → Cancelada
```

Ejemplo de información visible en un pedido:

```txt
Orden: PZ-6B7DO
Cliente: Juan Pérez
Teléfono: 3057612327
Entrega: Envío
Municipio: Playa
Zona: Miramar - $5 USD
Dirección: Calle ejemplo #123
Estado: Pendiente
Total: $65 USD
Notas internas: Cliente pidió confirmar horario antes de enviar.
```

La eliminación de pedidos debe manejarse de forma segura. Cuando se borre una orden en `orders`, deben borrarse también sus registros relacionados en `order_items`.

Para esto se debe usar:

```txt
order_items → campo relation order → Cascade delete activado
```

De esta forma:

```txt
Si se borra una orden
↓
se borran automáticamente sus order_items
↓
no quedan datos huérfanos
```

El botón de eliminar pedido dentro del panel debe tener confirmación antes de borrar.

Ejemplo de confirmación:

```txt
¿Seguro que deseas eliminar esta orden?
Esta acción también eliminará los productos relacionados con el pedido.
```

---

#### 14.5.2 Domicilio

La sección de domicilio debe permitir administrar los métodos y zonas de envío.

Debe incluir:

* Activar o desactivar envío a domicilio.
* Crear municipios.
* Crear zonas de entrega por municipio.
* Editar precio de envío por zona.
* Activar o desactivar zonas.
* Ordenar zonas.
* Mostrar precio de envío en USD.
* Usar dos desplegables en checkout:

  * Municipio.
  * Zona de entrega.

Ejemplo de checkout:

```txt
Municipio:
[ Playa ▼ ]

Zona de entrega:
[ Miramar - $5 USD ▼ ]
```

El precio de envío debe calcularse originalmente en USD. En caso necesario, PowerZona podrá informar por WhatsApp el equivalente real en CUP al cliente.

Ejemplo de zonas:

```txt
Municipio: Playa
Zona: Miramar
Precio: $5 USD
Estado: Activa

Municipio: Cerro
Zona: Cerro / Santo Suárez
Precio: $4 USD
Estado: Activa
```

---

#### 14.5.3 Recogida

La sección de recogida debe permitir configurar las opciones para clientes que no quieren domicilio.

Debe incluir:

* Activar o desactivar recogida.
* Definir punto de recogida.
* Agregar instrucciones para recogida.
* Mostrar mensaje específico en checkout.
* Permitir que el cliente seleccione recogida como método de entrega.

Ejemplo de información configurable:

```txt
Puedes recoger tu pedido en el punto acordado después de confirmar por WhatsApp.
```

Ejemplo de datos:

```txt
Recogida: Activa
Punto de recogida: A coordinar por WhatsApp
Mensaje: Después de realizar el pedido, confirma el horario disponible por WhatsApp.
```

---

#### 14.5.4 Vendedores

La sección de vendedores puede usarse en el futuro si PowerZona trabaja con más de una persona gestionando pedidos o ventas.

Debe permitir:

* Crear vendedores.
* Editar vendedores.
* Activar o desactivar vendedores.
* Asignar pedidos a vendedores.
* Ver pedidos por vendedor.
* Ver ventas por vendedor.
* Medir rendimiento por vendedor.

Esta sección puede dejarse para una fase futura si inicialmente solo un administrador gestiona los pedidos.

Ejemplo:

```txt
Vendedor: Carlos
Pedidos asignados: 12
Ventas del mes: $340 USD
Estado: Activo
```

---

### 14.6 Promociones

La sección de promociones debe centralizar todo lo relacionado con ofertas, cintillos, banners y cupones.

Debe dividirse en:

```txt
Promociones
  - Cintillos promocionales
  - Banners
  - Cupones
  - Promociones por producto
```

---

#### 14.6.1 Cintillos promocionales

Debe permitir crear y editar cintillos visibles en la web pública.

Debe incluir:

* Crear cintillo.
* Editar texto del cintillo.
* Activar o desactivar cintillo.
* Definir fecha de inicio.
* Definir fecha de finalización.
* Mostrar el cintillo en la parte superior de la web.

Ejemplo:

```txt
🔥 Envíos disponibles en La Habana | Promos activas esta semana
```

Ejemplo de configuración:

```txt
Texto: 🔥 Envíos disponibles en La Habana | Promos activas esta semana
Estado: Activo
Fecha inicio: 2026-06-01
Fecha fin: 2026-06-15
Ubicación: Parte superior del sitio
```

---

#### 14.6.2 Banners promocionales

Debe permitir crear mensajes o bloques visuales promocionales.

Debe incluir:

* Crear banner.
* Editar texto del banner.
* Activar o desactivar banner.
* Definir fecha de inicio.
* Definir fecha de finalización.
* Mostrar banner en catálogo o página principal.
* Opcionalmente enlazar el banner a una categoría o producto.

Ejemplo:

```txt
Oferta especial en proteínas seleccionadas
```

Ejemplo de configuración:

```txt
Título: Oferta especial
Texto: Descuentos en proteínas seleccionadas por tiempo limitado.
Estado: Activo
Fecha inicio: 2026-06-01
Fecha fin: 2026-06-10
Enlace: Categoría Proteínas
```

---

#### 14.6.3 Cupones

La sección de cupones debe permitir crear descuentos aplicables en checkout.

Debe incluir:

* Crear cupón.
* Editar cupón.
* Activar o desactivar cupón.
* Código del cupón.
* Tipo de descuento:

  * porcentaje;
  * monto fijo.
* Valor del descuento.
* Fecha de inicio.
* Fecha de vencimiento.
* Uso máximo del cupón.
* Monto mínimo de compra.
* Validar cupón en checkout.
* Mostrar descuento en resumen del pedido.
* Guardar cupón aplicado dentro de la orden.
* Incluir descuento aplicado en el mensaje de WhatsApp.
* Incluir descuento aplicado en el panel admin.

Los cupones deben implementarse con cuidado porque afectan:

* subtotal;
* total;
* mensaje de WhatsApp;
* orden guardada en PocketBase;
* métricas futuras;
* exportaciones.

Ejemplo de cupón por porcentaje:

```txt
Código: POWER10
Tipo: Porcentaje
Valor: 10%
Compra mínima: $50 USD
Uso máximo: 100 veces
Estado: Activo
Fecha inicio: 2026-06-01
Fecha fin: 2026-06-30
```

Ejemplo de cupón por monto fijo:

```txt
Código: ENVIO5
Tipo: Monto fijo
Valor: $5 USD
Compra mínima: $60 USD
Estado: Activo
```

Ejemplo en checkout:

```txt
Subtotal: $70 USD
Cupón POWER10: -$7 USD
Envío: $5 USD
Total: $68 USD
```

---

#### 14.6.4 Promociones por producto

Debe permitir marcar productos individuales como oferta.

Debe incluir:

* Marcar producto como destacado.
* Marcar producto como producto en oferta.
* Precio normal.
* Precio promocional.
* Fecha de inicio de oferta.
* Fecha de finalización de oferta.
* Mostrar etiqueta “Oferta” en el catálogo.
* Mostrar precio promocional en la tarjeta del producto.
* Guardar correctamente el precio usado al crear la orden.

Ejemplo:

```txt
Producto: Whey Protein
Precio normal: $55 USD
Precio promocional: $49 USD
Oferta activa: Sí
Fecha inicio: 2026-06-01
Fecha fin: 2026-06-10
```

Visualmente en el catálogo:

```txt
Whey Protein
Antes: $55 USD
Ahora: $49 USD
Etiqueta: Oferta
```

---

### 14.7 Reseñas

La sección de reseñas debe permitir gestionar opiniones o comentarios de clientes.

Debe incluir:

* Ver reseñas recibidas.
* Aprobar reseñas antes de mostrarlas.
* Ocultar reseñas.
* Eliminar reseñas falsas o incorrectas.
* Asociar reseñas a productos si aplica.
* Mostrar reseñas aprobadas en la web pública.
* Ver calificación promedio si se usan estrellas.

En una fase inicial esta sección puede quedar preparada visualmente, pero sin implementación completa.

Ejemplo:

```txt
Cliente: Juan Pérez
Producto: Creatina Monohidratada
Calificación: 5 estrellas
Comentario: Muy buen producto.
Estado: Pendiente de aprobación
```

---

### 14.8 Métricas y analíticas

Una vez completadas las secciones de órdenes, catálogo y promociones, el panel debe incluir métricas más avanzadas.

Debe mostrar:

* Vistas totales.
* Usuarios nuevos vs recurrentes.
* Total de pedidos.
* Productos más vendidos.
* Ventas mensuales calculadas en USD.
* Ganancia neta general.
* Ganancia por orden individual.
* Total de descuentos aplicados.
* Cupones más usados.
* Ventas por método de entrega.
* Ventas por municipio o zona.

Las ventas deben calcularse en USD como moneda base.

Ejemplo de métricas:

```txt
Ventas del mes: $1,250 USD
Pedidos totales: 48
Producto más vendido: Whey Protein
Cupón más usado: POWER10
Descuentos aplicados: $95 USD
Zona con más ventas: Miramar
```

---

### 14.9 Ganancia por orden y ganancia general

Para calcular ganancias correctamente, los productos deben tener costo definido.

Debe permitir:

* Guardar costo del producto.
* Comparar costo vs precio de venta.
* Calcular ganancia por producto.
* Calcular ganancia por orden.
* Calcular ganancia total.
* Calcular ganancia mensual.

Fórmula general:

```txt
Ganancia = Precio de venta - Costo
```

En órdenes con varios productos:

```txt
Ganancia de la orden = suma de ganancias de cada producto vendido
```

Ejemplo:

```txt
Producto: Whey Protein
Costo: $35 USD
Precio venta: $50 USD
Ganancia: $15 USD
```

Ejemplo de orden:

```txt
Orden: PZ-12345
Total vendido: $120 USD
Costo total: $80 USD
Ganancia estimada: $40 USD
```

---

### 14.10 Alertas de vencimiento

El panel debe incluir alertas para productos perecederos o con fecha de vencimiento.

Debe permitir:

* Marcar producto como perecedero.
* Guardar fecha de vencimiento.
* Ver productos próximos a vencer.
* Alertas a 30 días.
* Alertas a 15 días.
* Alertas a 5 días.
* Ver productos vencidos.
* Filtrar productos por vencimiento.

Esta sección debe conectarse con inventario y catálogo.

Ejemplo:

```txt
Producto: Multivitamínico
Fecha de vencimiento: 2026-07-01
Estado: Próximo a vencer
Alerta: 30 días
Stock: 6 unidades
```

---

### 14.11 Estructura recomendada de rutas admin

El panel puede organizarse con rutas separadas:

```txt
/admin
/admin/orders
/admin/catalog
/admin/products
/admin/categories
/admin/inventory
/admin/delivery
/admin/pickup
/admin/promos
/admin/coupons
/admin/reviews
/admin/dashboard
/admin/settings
```

O con una sola página admin usando secciones internas o pestañas.

Recomendación inicial:

```txt
/admin/orders
```

Luego avanzar hacia:

```txt
/admin/dashboard
/admin/catalog
/admin/promos
/admin/settings
```

---

### 14.12 Orden recomendado de implementación

El orden lógico para construir el panel admin será:

```txt
1. Gestión segura de órdenes.
2. Activar Cascade delete en order_items.
3. Probar borrado seguro de órdenes.
4. Agregar botón eliminar orden.
5. Mejorar historial de órdenes.
6. Agregar estados visuales.
7. Permitir edición básica de órdenes.
8. Agregar acciones rápidas:
   - contactar por WhatsApp;
   - copiar resumen.
9. Agregar filtros avanzados.
10. Exportar órdenes a CSV.
11. Crear estructura del menú lateral admin.
12. Crear sección Ajustes de negocio.
13. Crear sección Ventas:
   - pedidos;
   - domicilio;
   - recogida;
   - vendedores.
14. Crear sección Gestión del catálogo:
   - categorías;
   - productos;
   - inventario.
15. Crear sección Promociones:
   - cintillos;
   - banners;
   - cupones;
   - promociones por producto.
16. Crear sección Reseñas.
17. Crear dashboard de métricas principales.
18. Crear cálculo de ganancias.
19. Crear alertas de vencimiento.
20. Pulir diseño completo del panel admin.
```

---

### 14.13 Prioridad actual

Aunque el panel final tendrá varias secciones, la prioridad inmediata sigue siendo terminar correctamente la gestión de órdenes.

Primera fase real:

```txt
1. Activar Cascade delete.
2. Probar borrado seguro.
3. Agregar botón eliminar orden en panel admin.
4. Mejorar tabla de pedidos.
5. Agregar edición básica.
6. Agregar acciones rápidas:
   - WhatsApp al cliente;
   - copiar resumen.
7. Agregar filtros.
8. Exportar CSV básico.
```

Después de cerrar esta fase, se puede avanzar al menú lateral completo y a las demás secciones del panel.

---

### 14.14 Nota de seguridad

El panel admin debe funcionar con autenticación de administrador. No se deben abrir reglas públicas innecesarias en PocketBase para permitir listar, editar o borrar datos sensibles.

Las operaciones como editar órdenes, borrar pedidos, modificar productos, crear cupones o cambiar ajustes del negocio deben estar protegidas.

Regla general:

```txt
El cliente público puede crear pedidos.
El administrador puede ver, modificar y borrar pedidos.
```

No se debe exponer públicamente:

* historial completo de órdenes;
* datos personales de clientes;
* teléfonos;
* direcciones;
* notas internas;
* métricas de ventas;
* configuración del negocio;
* inventario interno.

```
```



---

## 15. SEO y Rutas

### 15.1. Slugs obligatorios

El `slug` es obligatorio porque Astro usará rutas dinámicas SEO.

Ejemplos:

```txt
/categoria/electronica
/categoria/electronica/laptops
/producto/proteina-whey-powerzona
```

### 15.2. Rutas previstas

- `/`
- `/categoria/[slug]`
- `/categoria/[categorySlug]/[subcategorySlug]`
- `/producto/[slug]`
- `/checkout`

---

## 16. Flujo de Despliegue Futuro

1. Desarrollo local en Visual Studio Code.
2. Cambios guardados en GitHub.
3. Coolify detecta cambios del repositorio.
4. Coolify reconstruye la aplicación en Hetzner.
5. Cloudflare gestiona DNS, SSL, CDN y seguridad.
6. Los clientes acceden a la tienda pública optimizada.

---

## 17. Roadmap Actualizado

### Fase 0 — Documentación y base del proyecto

- [x] Crear `Master_document.md`.
- [x] Crear documento de backend `BACKEND_SCHEMA_POCKETBASE_FINAL.md`.
- [x] Definir stack Astro + PocketBase.
- [x] Definir reglas generales del negocio.

### Fase 1 — Backend PocketBase

- [x] Crear colección `categories`.
- [x] Crear colección `subcategories`.
- [x] Crear colección `products`.
- [x] Crear colección `product_variations`.
- [x] Crear colección `currencies`.
- [x] Crear colección `shipping_zones`.
- [x] Crear colección `settings`.
- [x] Crear colección `orders`.
- [x] Crear colección `order_items`.
- [x] Revisar reglas API básicas.
- [x] Confirmar relaciones principales.

### Fase 2 — Conexión Astro + PocketBase

- [x] Crear proyecto Astro.
- [x] Instalar dependencias principales.
- [x] Crear conexión inicial con PocketBase.
- [x] Crear servicios de lectura en `src/lib/api.ts`.
- [x] Mostrar categorías reales desde PocketBase.
- [x] Mostrar productos reales desde PocketBase.
- [x] Crear página de producto por slug.

### Fase 3 — Carrito

- [x] Crear carrito en `localStorage`.
- [x] Crear botón flotante de carrito.
- [x] Crear panel lateral de carrito.
- [x] Agregar productos desde página de producto.
- [x] Permitir aumentar cantidad.
- [x] Permitir disminuir cantidad.
- [x] Permitir eliminar productos.
- [x] Calcular total estimado en USD.
- [x] Bloquear aumento por encima del stock.
- [x] Desactivar botón `+` al llegar al stock máximo.
- [x] Reactivar botón `+` cuando la cantidad baja del máximo.

### Fase 4 — Checkout WhatsApp

- [x] Crear página inicial de checkout.
- [x] Conectar botón del carrito hacia checkout.
- [x] Cambiar texto del botón del carrito a `Hacer el pedido`.
- [x] Definir texto del botón final del checkout como `Realizar Pedido`.
- [x] Ocultar carrito flotante en `/checkout`.
- [x] Agregar opción `¿Deseas agregar algo más?` con botón `Volver al catálogo`.
- [x] Redireccionar al catálogo si el cliente elimina todos los productos desde checkout.
- [x] Crear formulario real de cliente.
- [x] Capturar nombre del cliente.
- [x] Capturar teléfono del cliente.
- [x] Capturar dirección o referencia inicial.
- [x] Permitir nota adicional opcional.
- [x] Crear selector de método de entrega.
- [x] Crear validaciones iniciales del checkout.
- [x] Activar botón `Realizar Pedido` cuando los datos requeridos estén completos.
- [x] Mostrar mensaje temporal de datos validados correctamente.
- [x] Guardar orden en `orders`.
- [x] Guardar productos en `order_items`.
- [x] Corregir número de orden personalizado para que coincida entre checkout y PocketBase.
- [x] Leer número de WhatsApp desde `settings`.
- [x] Preparar generación de mensaje de WhatsApp con los datos del pedido.
- [x] Abrir WhatsApp con el pedido formateado después de guardar la orden.
- [x] Crear selector separado de municipio y zona de entrega.
- [x] Conectar `shipping_zones` desde PocketBase para cargar zonas reales.
- [x] Calcular envío según zona seleccionada.
- [x] Calcular cobro mixto base con moneda visual + productos Solo USD + envío separado.

### Fase 5 — Mejoras del catálogo

- [x] Agregar selector de moneda visual.
- [ ] Agregar búsqueda.
- [ ] Agregar filtros por categoría.
- [x] Agregar subcategorías.
- [ ] Mejorar diseño mobile-first.
- [ ] Mejorar galería de producto.
- [ ] Agregar productos destacados.
- [x] Crear/editar productos desde panel admin.
- [x] Estado Agotado con stock 0.
- [x] Preorder para productos agotados.
- [ ] Crear sistema de cupones con alcance por carrito, producto, categoría, subcategoría o envío.
- [ ] Crear sistema profesional de regalos por orden con colección `gift_rules`.

### Fase 6 — Producción

- [x] Subir proyecto a GitHub privado.
- [x] Servidor VPS instalado.
- [x] Coolify instalado y conectado con GitHub App.
- [ ] Configurar Cloudflare.
- [x] Probar dominio temporal de staging con sslip.io.
- [ ] Probar flujo completo de compra.
- [ ] Revisar seguridad final de reglas PocketBase.

### Fase 7 futura — App, PWA y notificaciones

- [ ] Convertir PowerZona en una PWA instalable.
- [ ] Permitir instalación desde el navegador como app.
- [ ] Crear sistema de notificaciones push para promociones.
- [ ] Crear campañas push desde el panel de administración.
- [ ] Enviar avisos de nuevos productos, cupones activos y descuentos.
- [ ] Guardar historial de notificaciones enviadas.

---

## 18. Próximo Paso Recomendado

> Nota actual: esta sección queda como referencia histórica. Para decidir el próximo bloque real, usar primero la sección **0. Control de avance del proyecto PowerZona**.

El bloque de **guardado real del pedido en PocketBase** quedó avanzado y cerrado como base funcional.

El próximo paso recomendado es iniciar el bloque de **zonas de envío desde PocketBase y WhatsApp final**.

Orden sugerido para la próxima sesión:

1. Confirmar que el pedido se crea correctamente en `orders`.
2. Confirmar que los productos se crean correctamente en `order_items`.
3. Confirmar que el número de orden visible coincide con el número guardado en PocketBase.
4. Leer `settings.whatsapp_number` desde PocketBase si todavía no está integrado en el flujo final.
5. Construir o revisar el mensaje de WhatsApp con número de orden, datos del cliente, método de entrega, productos, cantidades y total.
6. Abrir WhatsApp automáticamente después de guardar correctamente la orden.
7. Crear el selector de `Municipio`.
8. Crear el selector de `Zona de entrega`.
9. Cargar las zonas desde la colección `shipping_zones`.
10. Mostrar cada zona con su precio, por ejemplo: `Miramar - $5 USD`.
11. Recalcular el total del pedido sumando el envío seleccionado.
12. Mantener el descuento de stock para una fase posterior, cuando el admin confirme el pedido.

Antes de empezar este bloque conviene abrir una conversación nueva y subir/actualizar nuevamente los sources del proyecto.

---

## 19. Pendientes Técnicos Importantes

- Mantener estable la lógica de `order_number` personalizado para que el número mostrado coincida con el guardado.
- Confirmar que la orden real en `orders` queda siempre con estado inicial `pending`.
- Confirmar que cada producto del pedido se guarda correctamente en `order_items`.
- Leer `settings.whatsapp_number` antes de abrir WhatsApp si todavía no está conectado en el flujo final.
- Generar o revisar mensaje de WhatsApp con formato claro para el administrador.
- Abrir WhatsApp automáticamente después de guardar la orden.
- Evitar que el cliente pueda manipular precios desde `localStorage`; antes de crear la orden, el sistema debe recalcular precios desde PocketBase.
- Validar stock contra PocketBase antes de confirmar checkout.
- Validar restricciones de productos `only_usd` antes de crear la orden.
- Validar restricciones de entrega por producto antes de crear la orden.
- Conectar `shipping_zones` para calcular municipio, zona y precio de envío en CUP.
- Definir si el método `Coordinar` permite saltar temporalmente la selección de zona.
- Automatizar descuento de stock con hook en PocketBase más adelante.
- Crear datos iniciales reales de monedas, zonas, settings, categorías y productos.
- Revisar si `products.images` debe quedar público o protegido según la forma de servir imágenes en producción.
- Crear manejo de errores si PocketBase está apagado o no responde.
- Revisar reglas API antes de producción.
- Revisar reglas admin para permitir editar/borrar órdenes de prueba sin abrir permisos públicos.
- Crear colección futura `coupons` en PocketBase.
- Crear colección futura `coupon_redemptions` si se desea guardar historial de uso por orden.
- Definir arquitectura futura para PWA y notificaciones push promocionales.

---

## 20. Nota de Seguridad para Checkout

Aunque el carrito guarde precio y stock en `localStorage` para mostrar una experiencia rápida, el checkout final no debe confiar ciegamente en esos datos. Antes de guardar la orden, el frontend debe volver a consultar los productos reales en PocketBase y recalcular:

- Precio actual.
- Stock actual.
- `only_usd`.
- Modalidad de entrega.
- Total en USD.
- Total en moneda seleccionada.
- Envío en CUP.
- Ganancia estimada.

Esto evita pedidos manipulados desde el navegador.

---

## 21. Anexo agregado sin modificar el documento existente

Esta sección se agrega al final del Master Document actualizado para conservar intactos todos los puntos anteriores y registrar el estado real más reciente del proyecto.

No reemplaza ninguna sección previa. Si alguna sección anterior todavía menciona que algo está pendiente, este anexo sirve como actualización acumulativa más reciente.

---

### 21.1. Estado actual confirmado del flujo de compra

PowerZona ya tiene funcionando el flujo base de compra:

```txt
Cliente agrega productos al carrito
→ Va al checkout
→ Completa sus datos
→ Selecciona envío o recogida
→ Si es envío, selecciona municipio y zona desde PocketBase
→ El sistema calcula envío en USD
→ Se crea la orden en PocketBase
→ Se crean los order_items
→ Se abre WhatsApp con el resumen del pedido
```

---

### 21.2. Último bloque cerrado

Se cerró correctamente el bloque:

```txt
Zonas de envío desde PocketBase en checkout
```

Este bloque incluye:

- Municipio desde PocketBase.
- Zona de entrega desde PocketBase.
- Precio de envío en USD.
- Cálculo correcto del envío.
- Cálculo correcto del total.
- Guardado correcto de la orden en `orders`.
- Guardado correcto de productos en `order_items`.
- WhatsApp funcionando con formato actualizado.

---

### 21.3. Decisión actual sobre el envío

El costo de envío será originalmente en:

```txt
USD
```

Aunque el cliente luego necesite pagar en CUP, el sistema debe mostrar y calcular el envío en USD.

Si hace falta dar el precio real en CUP, se actualizará manualmente al cliente por WhatsApp.

El campo correcto en PocketBase para el precio de envío es:

```txt
price_usd
```

Ya no se debe usar:

```txt
price_cup
```

---

### 21.4. Zonas de envío desde PocketBase

El checkout ya carga las zonas de envío desde PocketBase.

El cliente primero selecciona:

```txt
Municipio
```

Después selecciona:

```txt
Zona de entrega
```

Ejemplo visual deseado:

```txt
Municipio
[ Playa ▼ ]

Zona de entrega
[ Miramar - $5 USD ▼ ]
```

La colección usada es:

```txt
shipping_zones
```

Estructura actual recomendada:

```txt
municipality
zone
price_usd
active
note
```

Ejemplo:

```txt
municipality: Playa
zone: Miramar
price_usd: 5
active: true
```

Al seleccionar una zona:

- Se muestra el precio de envío en USD.
- Se suma el envío al total.
- Se guarda la zona seleccionada en la orden.
- Se incluye municipio y zona en el mensaje de WhatsApp.

Ejemplo de cálculo:

```txt
Subtotal USD: $40.00 USD
Entrega: $3.00 USD
Total estimado: $43.00 USD
```

---

### 21.5. WhatsApp funcionando

El checkout ya abre WhatsApp después de crear la orden.

El mensaje de WhatsApp debe incluir:

- Número de orden.
- Datos del cliente.
- Tipo de servicio.
- Municipio.
- Zona.
- Dirección.
- Productos.
- Cantidades.
- Precio.
- Envío.
- Total.

Formato deseado del mensaje:

```txt
Hola PowerZona, quiero realizar este pedido:

*Orden: PZ-939IP*

*Cliente*: prueba de envio
*Teléfono*: 3057612327
*Tipo servicio*: Envío
*Municipio*: Playa
*Zona*: Playa / Miramar
*Dirección*: una prueba mas

*Productos:*
1. *Whey Body Fortress*  Cantidad: 1   Precio: $40.00 USD

    *Envío*: $3.00 USD
-------------------------------------------------------------------------------------------
   *Total*: $43.00 USD

Gracias.
```

En el mensaje de WhatsApp, si el valor incluye producto + envío, debe decir:

```txt
Total
```

No debe decir:

```txt
Subtotal
```

---

### 21.6. Después de abrir WhatsApp

Después de abrir WhatsApp, la página de checkout no se cierra automáticamente.

Esto es normal porque los navegadores no permiten que una página se cierre sola si no fue abierta por código.

Comportamiento recomendado:

```txt
1. Vaciar el carrito.
2. Mostrar mensaje de pedido enviado correctamente.
3. Redirigir al catálogo o a una página de gracias.
```

Por ahora, la opción más simple recomendada es redirigir al catálogo:

```txt
/
```

Más adelante, se podrá redirigir a:

```txt
/gracias
```

O:

```txt
/gracias?order=PZ-939IP
```

---

### 21.7. Confirmaciones realizadas hasta ahora

Se comprobó correctamente que:

- El municipio carga desde PocketBase.
- Las zonas cambian según el municipio seleccionado.
- El precio de envío se muestra en USD.
- El envío se suma correctamente al total.
- La orden se guarda correctamente en PocketBase.
- Los productos se guardan correctamente en `order_items`.
- WhatsApp abre con el mensaje correcto.
- El botón de pedido funciona correctamente después de completar los datos necesarios.
- El formato del mensaje de WhatsApp fue ajustado para ser más claro.
- El campo de envío correcto es `price_usd`.

---

### 21.8. Futuro bloque: 
---

### 21.9. Futuro bloque: página pública de copia visual de orden para el cliente

Más adelante se implementará una página pública donde el cliente pueda ver su pedido completo mediante un link.

Esta página funcionaría como copia visual del pedido.

Ejemplo de link futuro:

```txt
https://powerzona.com/order/PZ-939IP
```

Por seguridad, se evaluará usar un token privado:

```txt
https://powerzona.com/order/PZ-939IP?token=abc123
```

La página pública de orden debe mostrar:

- Número de orden.
- Datos del cliente.
- Tipo de servicio.
- Municipio y zona de entrega si aplica.
- Dirección si aplica.
- Productos con foto miniatura.
- Cantidad por producto.
- Precio unitario.
- Envío en USD.
- Total en USD.
- Estado de la orden.

Cuando esta página exista, el mensaje de WhatsApp podrá incluir:

```txt
Puedes ver tu pedido aquí:
https://powerzona.com/order/PZ-939IP?token=abc123
```

---

### 21.10. Futuro bloque: página de gracias

Después de realizar un pedido, se puede crear una página de confirmación:

```txt
/gracias
```

O con número de orden:

```txt
/gracias?order=PZ-939IP
```

La página de gracias podría mostrar:

- Mensaje de pedido recibido.
- Número de orden.
- Botón para volver al catálogo.
- Link para ver la copia del pedido.
- Información de contacto por WhatsApp.
- Aviso de que PowerZona confirmará disponibilidad y pago por WhatsApp.

---

### 21.11. Orden recomendado de próximos bloques

Orden recomendado actualizado:

```txt
1. Crear panel/admin de órdenes.
2. Crear página de gracias.
3. Crear copia visual pública de orden.
4. Mejorar inventario.
5. Mejorar pagos.
6. App/notificaciones futuras.
```

---

### 21.12. Próximo bloque recomendado

El siguiente bloque recomendado es:

```txt
Panel/admin básico para revisar y actualizar órdenes
```

Antes de iniciar ese bloque, conviene abrir una conversación nueva y actualizar los sources/documentos.

Mensaje sugerido para iniciar la próxima conversación:

```txt
Vamos a continuar PowerZona desde el bloque: Panel/admin básico para revisar y actualizar órdenes. Ya actualicé los sources.
```

---

### 21.13. Comandos útiles actuales

#### Entrar al frontend

```bash
cd frontend-powerzona
```

#### Abrir frontend

```bash
npm run dev
```

#### URL local

```txt
http://localhost:4321
```

#### Checkout local

```txt
http://localhost:4321/checkout
```

---

### 21.14. Actualización cerrada: Panel Admin - Órdenes administrativas

Este bloque se agrega como actualización acumulativa del trabajo realizado en el panel administrativo de órdenes.

Archivo principal trabajado:

```txt
frontend-powerzona/src/pages/admin/orders.astro
```

Objetivo del bloque:

```txt
Mejorar la gestión de órdenes desde el panel admin para que el administrador pueda revisar, editar, contactar al cliente, ajustar productos y preparar la orden antes de la confirmación final.
```

---

#### 21.14.1. Resumen editable de la orden

Se trabajó para que el resumen de la orden sea el centro principal de gestión.

Desde el resumen, el administrador puede trabajar con:

```txt
- Estado de la orden.
- Método de entrega.
- Datos del cliente.
- Teléfono.
- Dirección o referencia.
- Zona de entrega.
- Productos de la orden.
- Cantidades.
- Precios.
- Total de la orden.
```

La intención es que el administrador pueda resolver la mayor parte de la operación diaria sin entrar directamente a PocketBase.

---

#### 21.14.2. Cambio de método de entrega desde el resumen

Se definió y trabajó la lógica para cambiar el método de entrega desde la orden.

Métodos contemplados:

```txt
delivery   → Envío
pickup     → Recogida
coordinate → Coordinar
```

Reglas esperadas:

##### Si cambia a Recogida

```txt
- Ocultar zona de entrega.
- Ocultar dirección o referencia.
- Limpiar la zona seleccionada.
- Poner envío en 0.00 USD.
- Recalcular el total solo con productos.
```

##### Si cambia a Envío

```txt
- Mostrar zona de entrega.
- Mostrar dirección o referencia.
- Permitir seleccionar zona.
- Cargar el precio de envío de la zona.
- Recalcular total = productos + envío.
```

##### Si cambia a Coordinar

```txt
- Ocultar zona de entrega.
- Ocultar dirección.
- Poner envío en 0.00 USD.
```

Regla importante:

```txt
Cambiar a Recogida no debe borrar datos importantes del cliente como nombre, teléfono o productos.
```

---

#### 21.14.3. Autoguardado en órdenes

Se implementó la idea de autoguardado para reducir pasos manuales del administrador.

Cambios que pueden guardarse automáticamente:

```txt
- Nombre del cliente.
- Teléfono.
- Dirección.
- Estado.
- Método de entrega.
- Zona de entrega.
- Nombre visible del producto en la orden.
- Cantidad.
- Precio unitario.
```

El botón de guardar queda como respaldo o confirmación manual cuando sea necesario.

---

#### 21.14.4. Edición de productos dentro de una orden

Se agregó la capacidad de editar productos dentro del resumen de la orden.

Campos editables por producto:

```txt
- Nombre mostrado del producto.
- Cantidad.
- Precio unitario USD.
```

El total actual del producto debe actualizarse al cambiar cantidad o precio.

Ejemplo:

```txt
Cantidad: 2
Precio unitario: 80.00 USD
Total actual: 160.00 USD
```

---

#### 21.14.5. Eliminar productos de una orden

Se agregó la capacidad de eliminar productos desde la orden.

Regla:

```txt
Al eliminar un producto, el total de productos y el total de la orden deben recalcularse.
```

---

#### 21.14.6. Agregar productos a una orden con buscador

Se mejoró el flujo de agregar productos.

Antes, un selector simple podía funcionar con pocos productos, pero no será práctico cuando existan muchos productos.

Flujo correcto definido:

```txt
1. Admin escribe el nombre del producto.
2. El sistema muestra coincidencias.
3. Admin selecciona el producto correcto.
4. Si el producto tiene variaciones, se activa un desplegable.
5. Si no tiene variaciones, se usa el producto principal.
6. Admin escribe cantidad.
7. Sistema valida stock.
8. Producto se agrega a la orden.
9. Total de la orden se recalcula.
```

Ejemplo visual:

```txt
Buscar producto:
[ whey ]

Resultados:
- Whey Body Fortress
- Whey Gold Standard
- Whey ISO
```

---

#### 21.14.7. Variaciones como desplegable

Se definió que las variaciones no deben escribirse manualmente.

Si un producto tiene variaciones, deben cargarse en un desplegable según el producto seleccionado.

Ejemplo:

```txt
Producto: Whey Body Fortress

Variación:
[ Chocolate 2 lb ▼ ]
[ Vainilla 2 lb ▼ ]
[ Fresa 5 lb ▼ ]
```

Regla:

```txt
Solo deben mostrarse las variaciones del producto seleccionado.
```

---

#### 21.14.8. Productos sin variación

Si un producto no tiene variaciones, el sistema debe usar los datos del producto principal.

Regla:

```txt
Si no existe variation_id:
- Usar stock del producto principal.
- Usar precio del producto principal.
```

---

#### 21.14.9. Validación de stock al editar productos

Se detectó que el administrador podía cambiar manualmente la cantidad de un producto en una orden y superar el stock disponible.

Se definió esta regla:

```txt
La cantidad dentro de una orden no debe superar el stock disponible.
```

Validación:

```txt
Si el item tiene variation_id:
- Validar contra el stock de la variación.

Si el item no tiene variation_id:
- Validar contra el stock del producto principal.
```

---

#### 21.14.10. Validación de stock al agregar productos

Al agregar un producto a una orden, el sistema debe considerar lo que ya está usado dentro de esa misma orden.

Ejemplo:

```txt
Stock del producto: 4

Orden actual:
Creatina x 2

Disponible real para agregar:
2
```

Fórmula:

```txt
Disponible para agregar = stock actual - cantidad ya usada en esta orden
```

Esto evita que el administrador agregue más unidades de las disponibles por error.

---

#### 21.14.11. Evitar productos duplicados dentro de una orden

Se eligió la opción segura:

```txt
Si el administrador agrega un producto que ya existe en la orden, no se debe crear una línea duplicada.
```

En su lugar, debe sumarse la cantidad a la línea existente.

Ejemplo correcto:

```txt
Orden actual:
Creatina x 1

Admin agrega:
Creatina x 2

Resultado:
Creatina x 3
```

Ejemplo incorrecto:

```txt
Creatina x 1
Creatina x 2
```

---

#### 21.14.12. Regla para productos con variación

Si el producto tiene variación, la comparación debe hacerse por variación.

Ejemplo:

```txt
Whey Body Fortress / Chocolate x 1
Whey Body Fortress / Vainilla x 1
```

Estos no son duplicados porque son variaciones distintas.

Regla:

```txt
Si existe variation_id:
- Comparar por variation_id.

Si no existe variation_id:
- Comparar por product_id.
```

---

#### 21.14.13. Contactar cliente por WhatsApp

Se cambió el uso del botón general de WhatsApp para que sirva como acción de contacto directo con el cliente.

Botón definido:

```txt
Contactar cliente
```

Uso:

```txt
Abrir WhatsApp con un mensaje corto para conversar con el cliente sobre su pedido.
```

Mensaje base:

```txt
Hola [cliente], te escribo de PowerZona sobre tu pedido [número de orden].

Necesitamos confirmar algunos detalles antes de continuar con tu orden.

Total actual: [total]
Estado actual: [estado]
```

Este botón sirve para:

```txt
- Confirmar dirección.
- Confirmar zona de entrega.
- Avisar de un cambio.
- Confirmar disponibilidad.
- Resolver un problema de stock.
- Confirmar método de pago.
- Hablar con el cliente antes de continuar.
```

---

#### 21.14.14. Notificación de confirmación por WhatsApp

Se definió una segunda acción diferente:

```txt
Notificar confirmación
```

Esta acción debe usarse cuando la orden ya esté confirmada.

Debe abrir WhatsApp con un mensaje que incluya:

```txt
- Número de orden.
- Productos.
- Cantidades.
- Total por producto.
- Método de entrega.
- Zona y dirección si aplica.
- Total final.
```

La notificación debe ser manual para que el administrador revise antes de enviar.

---

#### 21.14.15. Opción segura elegida para inventario

Se acordó trabajar siempre con la opción segura.

Regla principal:

```txt
El stock no debe descontarse mientras el administrador edita la orden.
```

El descuento real de inventario debe ocurrir solo cuando la orden sea confirmada oficialmente.

---

#### 21.14.16. Próximo bloque: Inventario seguro al confirmar / cancelar orden

El siguiente bloque importante será implementar inventario seguro.

Objetivo:

```txt
Descontar stock solo cuando una orden pase a Confirmada y devolver stock si una orden confirmada pasa a Cancelada.
```

Campo recomendado en `orders`:

```txt
stock_deducted
```

Tipo recomendado:

```txt
bool
```

Valores:

```txt
false = todavía no se descontó stock
true = ya se descontó stock
```

---

#### 21.14.17. Flujo de confirmación de inventario

Cuando una orden pase a Confirmada, el sistema debe:

```txt
1. Revisar todos los productos de la orden.
2. Validar que todavía exista stock suficiente.
3. Si el item tiene variation_id, descontar stock de product_variations.
4. Si el item no tiene variation_id, descontar stock de products.
5. Marcar stock_deducted = true.
```

Regla de seguridad:

```txt
Si stock_deducted = true, no se debe descontar inventario otra vez.
```

---

#### 21.14.18. Flujo de cancelación y reversión

Si una orden ya descontó stock y luego pasa a Cancelada, el sistema debe:

```txt
1. Devolver el stock de cada producto o variación.
2. Marcar stock_deducted = false.
```

Regla de seguridad:

```txt
Si stock_deducted = false, no se debe devolver inventario otra vez.
```

---

#### 21.14.19. Bloqueo de edición cuando el inventario ya fue descontado

Con la opción segura, si una orden ya tiene:

```txt
stock_deducted = true
```

no se deben permitir cambios directos en productos.

Debe bloquearse:

```txt
- Cambiar cantidades.
- Agregar productos.
- Eliminar productos.
- Cambiar producto o variación.
```

Para modificar una orden confirmada, el flujo seguro será:

```txt
1. Cambiar la orden a Cancelada o a un estado que revierta inventario.
2. Guardar / confirmar el cambio.
3. El sistema devuelve stock.
4. Editar productos.
5. Confirmar nuevamente.
6. El sistema descuenta stock otra vez.
```

---

#### 21.14.20. Última versión funcional del bloque

Última versión funcional probada por el usuario:

```txt
orders_opcion_segura.astro
```

Estado confirmado:

```txt
- Buscador de productos funcionando.
- Variaciones como desplegable.
- Validación de stock al editar/agregar productos.
- Evita duplicados.
- Suma cantidad a la línea existente.
- Contactar cliente por WhatsApp.
- Gestión administrativa de productos dentro de una orden.
```

---

#### 21.14.21. Pendiente para nuevo chat

Antes de continuar, actualizar el source del proyecto con la última versión funcional y abrir una conversación nueva.

Tema recomendado:

```txt
PowerZona - Bloque Inventario seguro al confirmar / cancelar orden
```

Mensaje sugerido para iniciar:

```txt
Vamos a continuar PowerZona desde el bloque: Inventario seguro al confirmar / cancelar orden. Ya actualicé los sources.
```



---

### 21.15. Bloque cerrado: Inventario seguro al confirmar / cancelar orden

Este bloque implementa la lógica segura para que el inventario **no se descuente al crear la orden**, sino únicamente cuando un administrador marca la orden como **Confirmada** y toca el botón **Guardar cambios**.

Objetivo principal:

```txt
La orden puede ser editada mientras está pendiente.
El stock solo se descuenta cuando la orden queda confirmada.
Si la orden confirmada se cancela, el stock se devuelve automáticamente.
El sistema evita dobles descuentos y dobles devoluciones.
```

---

#### 21.15.1. Nuevo campo agregado a orders

Se agregó una migración nueva de PocketBase:

```txt
backend-powerzona/pb_migrations/1780060000_updated_orders_stock_deducted.js
```

Esta migración agrega el campo:

```txt
stock_deducted: bool
```

Uso del campo:

```txt
false = la orden todavía no ha descontado inventario.
true  = la orden ya descontó inventario.
```

Este campo es obligatorio para la lógica segura porque evita que una misma orden descuente stock más de una vez.

---

#### 21.15.2. Flujo seguro al confirmar una orden

Cuando el administrador cambia el estado de una orden a:

```txt
confirmed
```

y toca:

```txt
Guardar cambios
```

el sistema hace este proceso:

```txt
1. Revisa los productos actuales de la orden.
2. Agrupa cantidades por producto o variación.
3. Consulta el stock real actual en products o product_variations.
4. Valida que haya stock suficiente.
5. Si hay stock suficiente, descuenta las cantidades.
6. Actualiza la orden con status = confirmed.
7. Marca stock_deducted = true.
8. Bloquea la edición de productos de esa orden.
```

Si no hay stock suficiente, la orden no se confirma y el sistema muestra un mensaje indicando el producto afectado.

---

#### 21.15.3. Flujo seguro al cancelar una orden confirmada

Cuando una orden tiene:

```txt
stock_deducted = true
```

y el administrador cambia el estado a:

```txt
cancelled
```

y toca:

```txt
Guardar cambios
```

el sistema hace este proceso:

```txt
1. Lee los productos actuales de la orden.
2. Agrupa cantidades por producto o variación.
3. Devuelve esas cantidades al inventario correspondiente.
4. Actualiza la orden con status = cancelled.
5. Marca stock_deducted = false.
6. Libera la orden para que pueda editarse si fuera necesario.
```

Regla importante:

```txt
Si stock_deducted ya es false, el sistema no devuelve inventario otra vez.
```

---

#### 21.15.4. Productos con variaciones

La lógica respeta la estructura actual del catálogo:

```txt
- Si el item tiene variation, el stock se descuenta/restaura en product_variations.
- Si el item no tiene variation, el stock se descuenta/restaura en products.
```

Esto evita mezclar el inventario general del producto con el inventario específico de una variación.

---

#### 21.15.5. Protección contra errores parciales

Durante el descuento de inventario, el sistema guarda una captura temporal del stock original.

Si algún descuento falla a mitad del proceso:

```txt
1. Se intenta restaurar cualquier stock que ya se hubiera modificado.
2. La orden no se actualiza como confirmada.
3. Se muestra un mensaje de error.
```

Esta protección reduce el riesgo de dejar inventario inconsistente.

---

#### 21.15.6. Bloqueo de edición después de descontar inventario

Cuando una orden queda:

```txt
status = confirmed
stock_deducted = true
```

el panel bloquea:

```txt
- Agregar productos.
- Editar cantidades.
- Editar precios de productos.
- Editar nombre de producto dentro de la orden.
- Borrar productos.
```

Mensaje esperado en el panel:

```txt
Esta orden ya descontó inventario. Para cambiar productos, primero revierte el estado siguiendo la opción segura.
```

---

#### 21.15.7. Eliminar pedidos con inventario descontado

Si se elimina un pedido de prueba que ya tenía inventario descontado, el sistema primero intenta:

```txt
1. Restaurar inventario.
2. Marcar stock_deducted = false.
3. Borrar los order_items.
4. Borrar la orden.
```

Esto evita que al borrar una orden confirmada se pierda stock de forma silenciosa.

---

#### 21.15.8. Archivos modificados en este bloque

```txt
frontend-powerzona/src/pages/admin/orders.astro
backend-powerzona/pb_migrations/1780060000_updated_orders_stock_deducted.js
```

---

#### 21.15.9. Validación técnica realizada

Se validó la sintaxis JavaScript interna del script de `orders.astro` con:

```txt
node --check
```

Resultado:

```txt
Sin errores de sintaxis JavaScript detectados.
```

No se pudo completar `npm run build` dentro del entorno de revisión porque el ZIP trae dependencias `node_modules` de Windows y falta la dependencia opcional nativa de Rollup para Linux:

```txt
@rollup/rollup-linux-x64-gnu
```

Esto no necesariamente indica un error del código. En la computadora del proyecto, si aparece algo similar, la solución recomendada sería ejecutar:

```bash
npm install
npm run build
```

---

#### 21.15.10. Pruebas recomendadas para cerrar el bloque

Prueba 1: confirmar orden pendiente

```txt
1. Crear o seleccionar una orden pendiente.
2. Verificar stock actual del producto.
3. Cambiar estado a Confirmada.
4. Tocar Guardar cambios.
5. Verificar que el stock bajó exactamente por la cantidad vendida.
6. Verificar que la orden quedó con stock_deducted = true.
7. Verificar que ya no se pueden editar productos.
```

Prueba 2: cancelar orden confirmada

```txt
1. Seleccionar una orden confirmada con stock_deducted = true.
2. Cambiar estado a Cancelada.
3. Tocar Guardar cambios.
4. Verificar que el stock volvió a sumarse.
5. Verificar que stock_deducted quedó en false.
```

Prueba 3: evitar doble descuento

```txt
1. Confirmar una orden.
2. Guardar cambios otra vez sin cancelarla.
3. Verificar que el stock no baja por segunda vez.
```

Prueba 4: stock insuficiente

```txt
1. Intentar confirmar una orden con cantidad mayor al stock real.
2. Verificar que no se confirma.
3. Verificar que el stock no cambia.
4. Verificar que aparece un mensaje indicando el problema.
```

---

#### 21.15.11. Estado del bloque

Estado:

```txt
✅ CERRADO
```

Detalle:

```txt
Bloque validado como base funcional y continuado con el bloque posterior de edición del resumen de órdenes.
Se mantiene la recomendación de hacer pruebas manuales después de cada actualización del archivo orders.astro.
```

Siguiente bloque recomendado:

```txt
Limpieza visual del panel admin y formulario plegable de Agregar producto
```

Antes de empezar ese bloque, conviene cerrar esta conversación, actualizar el source y abrir una conversación nueva.

---

### 21.16. Bloque cerrado: Edición del resumen de órdenes y limpieza administrativa

Este bloque se cerró después del trabajo sobre el archivo principal del panel de órdenes:

```txt
frontend-powerzona/src/pages/admin/orders.astro
```

Objetivo del bloque:

```txt
Ajustar el resumen de órdenes para que el flujo de estados sea más seguro, que el inventario se comporte correctamente, que la edición se bloquee cuando corresponde y que el administrador pueda limpiar órdenes manualmente sin afectar stock.
```

---

#### 21.16.1. Flujo final de estados de órdenes

Se simplificó el flujo de estados principales del panel admin.

Estados activos usados:

```txt
pending    → Pendiente
confirmed  → Confirmada
delivered  → Entregada
cancelled  → Cancelada
```

Se decidió que el estado:

```txt
preparing → Preparando
```

no tiene objetivo claro en esta etapa del proyecto y no debe formar parte del flujo principal actual.

---

#### 21.16.2. Reglas finales por estado

##### Pendiente

```txt
- No descuenta inventario.
- Permite editar datos del cliente.
- Permite editar productos.
- Permite agregar productos.
- Permite cambiar cantidades.
- Permite borrar productos de la orden.
```

##### Confirmada

```txt
- Descuenta inventario al guardar si stock_deducted = false.
- Bloquea la edición de productos.
- Bloquea la edición de datos del cliente.
- Permite notificar confirmación por WhatsApp.
- Puede pasar a Entregada.
- Puede pasar a Cancelada.
- Puede volver a Pendiente, devolviendo stock y desbloqueando edición.
```

##### Entregada

```txt
- Solo puede aplicarse si la orden estaba previamente Confirmada.
- No puede aplicarse directamente desde Pendiente.
- Mantiene el stock descontado.
- Bloquea edición de productos.
- Bloquea edición de datos del cliente.
- No borra la orden automáticamente.
```

##### Cancelada

```txt
- Si venía de Confirmada con stock descontado, devuelve inventario.
- Bloquea edición de productos.
- Bloquea edición de datos del cliente.
- Permite mostrar el botón Eliminar pedido dentro del resumen.
```

---

#### 21.16.3. Regla Confirmada → Pendiente

Se corrigió el caso donde una orden confirmada volvía a pendiente pero la edición quedaba bloqueada.

Regla final:

```txt
Si una orden está Confirmada y vuelve a Pendiente:
1. Se devuelve el stock.
2. stock_deducted vuelve a false.
3. La edición de productos vuelve a estar disponible.
4. La edición de datos del cliente vuelve a estar disponible.
```

Esto permite corregir una orden antes de confirmarla nuevamente.

---

#### 21.16.4. Regla para marcar Entregada

Se agregó protección para evitar que una orden pendiente se marque como entregada directamente.

Regla final:

```txt
Una orden solo puede pasar a Entregada si antes estaba Confirmada.
```

Si el administrador intenta marcar como entregada una orden que no fue confirmada, el sistema debe mostrar un aviso y no guardar ese cambio.

---

#### 21.16.5. Bloqueo de edición de datos del cliente

Se reforzó la regla de bloqueo para que no solo se bloqueen productos.

Cuando la orden está en estado:

```txt
confirmed
delivered
cancelled
```

debe bloquearse:

```txt
- Nombre del cliente.
- Teléfono.
- Dirección o referencia.
- Método de entrega.
- Zona de entrega.
- Productos.
- Cantidades.
- Precios.
```

La edición completa solo debe estar disponible en:

```txt
pending
```

---

#### 21.16.6. WhatsApp según estado

Se ajustó el botón de WhatsApp para que cambie según el estado de la orden.

Comportamiento deseado:

```txt
Pendiente   → Contactar cliente
Confirmada  → Notificar confirmación
Entregada   → Notificar entrega
Cancelada   → Notificar cancelación
```

Esto permite usar WhatsApp no solo para contacto inicial, sino también para avisar al cliente cuando su orden fue confirmada o entregada.

---

#### 21.16.7. Borrado de orden cancelada desde el resumen

Se decidió que el botón:

```txt
Eliminar pedido
```

sí puede aparecer dentro del resumen, pero únicamente cuando la orden está:

```txt
cancelled
```

Regla:

```txt
Si la orden está Pendiente, Confirmada o Entregada, no debe aparecer el botón Eliminar pedido dentro del resumen.
```

El borrado desde una orden cancelada elimina la orden y sus productos relacionados, pero no debe modificar inventario.

---

#### 21.16.8. Borrar órdenes como herramienta administrativa separada

Se agregó y cerró el concepto de botón externo:

```txt
Borrar órdenes
```

Este botón no debe abrir un panel aparte. En su lugar activa un modo de selección dentro del listado normal de órdenes.

Flujo final:

```txt
1. El administrador toca Borrar órdenes.
2. El listado entra en modo selección.
3. Aparece un checkbox delante de cada tarjeta de orden.
4. El administrador selecciona una o varias órdenes.
5. Puede usar Seleccionar todas.
6. Toca Borrar seleccionadas.
7. El sistema elimina las órdenes seleccionadas y sus order_items.
8. El inventario no se modifica.
```

---

#### 21.16.9. Mensaje de advertencia para borrar órdenes

Mensaje final aprobado para el modo de borrado administrativo:

```txt
Esta acción elimina la orden y no modifica el inventario.
Úsalo solo para limpieza administrativa o después de exportar tus órdenes.
```

Este mensaje debe mostrarse claramente antes de borrar órdenes.

---

#### 21.16.10. Seleccionar todas

El modo de selección mantiene la acción:

```txt
Seleccionar todas
```

Regla definida:

```txt
Seleccionar todas debe marcar todas las órdenes existentes dentro del listado filtrado/cargado, no solamente una tarjeta individual.
```

Esto permite limpiar varias órdenes de forma rápida después de exportarlas o revisarlas.

---

#### 21.16.11. Cancelar modo borrar

Se corrigió el comportamiento visual del botón de borrar.

Problema detectado:

```txt
Al tocar Borrar órdenes y luego Cancelar, el botón perdía su estilo premium y había que recargar la página para recuperarlo.
```

Regla corregida:

```txt
Al cancelar el modo borrar, el botón Borrar órdenes debe recuperar exactamente su estilo, texto, ícono y clases originales.
```

---

#### 21.16.12. Borrado administrativo y stock

Regla importante del bloque:

```txt
Borrar una orden manualmente desde Borrar órdenes no modifica inventario.
```

Esto aplica sin importar el estado de la orden:

```txt
Pendiente
Confirmada
Entregada
Cancelada
```

Uso esperado:

```txt
- Limpieza administrativa.
- Borrar pruebas.
- Borrar órdenes después de exportarlas.
- Mantener el panel más limpio.
```

Nota:

```txt
El inventario solo debe cambiar por transición de estado, no por borrado administrativo.
```

---

#### 21.16.13. Entregada no borra automáticamente

Se decidió que marcar una orden como:

```txt
Entregada
```

no debe borrar la orden.

Regla:

```txt
La orden entregada queda guardada como historial hasta que el administrador decida borrarla manualmente.
```

Si el administrador exporta las órdenes y ya no necesita conservarlas en PocketBase, puede usar el botón:

```txt
Borrar órdenes
```

---

#### 21.16.14. Tarjetas premium del resumen de órdenes

Se trabajó el estilo visual de las tarjetas del listado de órdenes.

Objetivo visual:

```txt
Que cada tarjeta de orden se vea más premium, moderna y clara.
```

Estructura visual deseada:

```txt
Fecha del grupo:
28 de mayo de 2026
1 pedido · Total $40.00 USD

Tarjeta:
PZ-VB0JW · prueba 6
3057612327 • Recogida • 28 may 2026, 12:48 p.m.
Cancelada
$40.00 USD
```

Se eliminaron elementos visuales no deseados como la inicial/avatar del cliente.

---

#### 21.16.15. Paginación de órdenes

Se definió que el resumen de órdenes debe trabajar con:

```txt
15 órdenes por página
```

Objetivo:

```txt
Evitar que el panel se vuelva demasiado largo cuando existan muchas órdenes.
```

La paginación debe permitir moverse entre páginas sin afectar la lógica de selección, filtros o estados.

---

#### 21.16.16. Último archivo funcional de referencia

Último archivo funcional reportado por el usuario durante este bloque:

```txt
orders.astro
```

Ubicación esperada:

```txt
frontend-powerzona/src/pages/admin/orders.astro
```

Regla de trabajo aprendida:

```txt
Cuando el usuario indique que el archivo está funcionando OK, solo se debe modificar exactamente el problema solicitado y no cambiar tarjetas, estilos, lógica de inventario, estados ni paginación.
```

---

#### 21.16.17. Estado del bloque

Estado:

```txt
✅ CERRADO
```

Resumen:

```txt
- Flujo de estados ajustado.
- Preparando removido del flujo principal.
- Confirmada puede volver a Pendiente devolviendo stock.
- Entregada solo puede aplicarse después de Confirmada.
- Confirmada, Entregada y Cancelada bloquean edición.
- WhatsApp cambia según estado.
- Eliminar pedido aparece dentro del resumen solo si la orden está Cancelada.
- Borrar órdenes funciona como modo selección con checkbox.
- Seleccionar todas se mantiene.
- Borrado administrativo no modifica inventario.
- Tarjetas premium y paginación quedan como base visual del resumen.
```

---

#### 21.16.18. Próximo bloque recomendado

El siguiente bloque recomendado es:

```txt
Limpieza visual del panel admin y formulario plegable de Agregar producto
```

Objetivo del próximo bloque:

```txt
Hacer que el resumen de cada orden sea más limpio, mostrando inicialmente solo el botón Agregar producto y abriendo/cerrando el formulario de búsqueda de productos cuando el administrador lo necesite.
```

Mensaje sugerido para iniciar la próxima conversación:

```txt
Vamos a continuar PowerZona desde el bloque: Limpieza visual del panel admin y formulario plegable de Agregar producto. Ya actualicé los sources y el Master Document.
```

---

### 21.17. Bloque cerrado: Gestión de catálogo — categorías, subcategorías y ver contenido

Este bloque se agrega como actualización acumulativa sin reemplazar secciones anteriores.

Archivo principal trabajado:

```txt
frontend-powerzona/src/pages/admin/catalog.astro
```

Última versión funcional entregada para prueba:

```txt
catalog_jerarquia_categoria_con_productos_directos_v16_2026_05_31.astro
```

Marca interna de referencia usada dentro del archivo:

```txt
PZ-CATALOG-JERARQUIA-CATEGORIA-CONTENIDO-V16-20260531
```

Objetivo del bloque:

```txt
Organizar la Gestión de catálogo para que el administrador pueda manejar categorías, subcategorías y contenido relacionado con una jerarquía clara, visualmente limpia y preparada para la futura creación/edición de productos.
```

---

#### 21.17.1. Gestión de categorías

La pantalla de catálogo mantiene la categoría como elemento principal de organización.

Se trabajó para que cada categoría pueda manejarse desde una tarjeta premium con acciones administrativas.

Funciones contempladas en la tarjeta de categoría:

```txt
- Ver contenido.
- Editar datos de la categoría.
- Ocultar o mostrar categoría.
- Ordenar categoría con flechas.
- Menú de 3 puntos para acciones.
```

Regla visual:

```txt
La tarjeta de categoría es el contenedor principal.
Las subcategorías ya no deben verse como un bloque general separado.
```

---

#### 21.17.2. Edición de categoría con subcategorías internas

Se decidió que las subcategorías deben aparecer dentro de la tarjeta de su categoría padre cuando se abre la edición.

Estructura esperada:

```txt
Categoría: Proteínas
  - Datos de edición de categoría
  - Subcategorías
  - Productos directos
```

Esto evita tener categorías por un lado y subcategorías por otro, haciendo la administración más natural.

---

#### 21.17.3. Subcategorías dentro de categoría

Las subcategorías quedan integradas dentro de su categoría padre.

Cada subcategoría interna mantiene acciones propias:

```txt
- Ver contenido.
- Editar.
- Ocultar o mostrar.
- Ordenar con flechas.
- Menú de 3 puntos.
- Botón Nuevo producto.
```

También se agregó dentro de cada categoría el botón:

```txt
+ Nueva subcategoría
```

Este botón crea la subcategoría directamente dentro de la categoría correspondiente, sin que el administrador tenga que escoger manualmente una categoría padre.

---

#### 21.17.4. Eliminación de la lista general de subcategorías

Se eliminó visualmente la tarjeta/lista general de subcategorías.

Regla final:

```txt
Las subcategorías solo se muestran dentro de su categoría padre.
```

Esto evita duplicación visual y mantiene la jerarquía limpia.

---

#### 21.17.5. Productos directos dentro de categoría

Se agregó el bloque:

```txt
Productos directos
```

dentro de cada categoría.

Este bloque muestra productos que pertenecen a una categoría pero no están asignados a ninguna subcategoría.

Ejemplo:

```txt
Categoría: Proteínas
  Subcategorías:
    - Whey Protein
    - Creatina

  Productos directos:
    - Shaker PowerZona
    - Combo Proteínas
```

Los productos directos se muestran con información básica:

```txt
- Foto.
- Nombre.
- Stock.
- Estado visible/oculto.
- Precio USD.
- Botón Editar.
```

La edición real de productos queda para el siguiente bloque.

---

#### 21.17.6. Vista Ver contenido de categoría

Se creó la experiencia de:

```txt
Ver contenido
```

para una categoría.

Al tocar este botón, la pantalla cambia a una vista limpia donde no se muestran:

```txt
- Formularios generales.
- Lista general de categorías.
- Lista general de subcategorías.
```

Solo se muestra el contenido de la categoría actual.

Texto visual acordado:

```txt
Contenido de Proteínas
Subcategorías y productos.
```

La vista permite ver:

```txt
- Subcategorías de la categoría.
- Productos directos de la categoría.
```

---

#### 21.17.7. Vista Ver contenido de subcategoría

También se preparó la vista limpia para ver el contenido de una subcategoría.

Estructura:

```txt
Subcategoría: Whey Protein
  - Productos dentro de esta subcategoría
```

La vista de subcategoría permite mantener navegación por jerarquía.

---

#### 21.17.8. Navegación jerárquica interna

Se acordó que el botón de volver no debe romper la jerarquía.

Regla final:

```txt
Si el usuario entra desde una categoría a una subcategoría, debe poder volver primero a la categoría padre y luego a la lista general.
```

Ejemplo:

```txt
Lista general
→ Categoría Proteínas
→ Subcategoría Whey Protein
→ Volver a Proteínas
→ Volver a lista general
```

Botones esperados:

```txt
← Volver a Proteínas
Volver a lista general
```

Esto permite que el administrador no pierda el contexto.

---

#### 21.17.9. Botones Nuevo producto preparados

Se agregaron botones:

```txt
+ Nuevo producto
```

en los siguientes lugares:

```txt
- Productos directos dentro de categoría.
- Cada subcategoría dentro de la categoría.
- Vista limpia de productos directos de categoría.
- Vista limpia de productos dentro de subcategoría.
```

Comportamiento temporal aprobado:

```txt
La creación de productos se trabajará en el próximo bloque.
```

El botón todavía no crea productos reales. Queda como preparación para el siguiente bloque.

---

#### 21.17.10. Página separada para productos

Se decidió que la creación y edición de productos no debe quedar dentro de `catalog.astro`.

Regla del próximo bloque:

```txt
Crear y editar productos debe abrirse en una página completamente separada.
```

Rutas recomendadas:

```txt
/admin/products
/admin/products/new
/admin/products/edit/[id]
```

O una página inteligente inicial:

```txt
/admin/products?mode=new
/admin/products?mode=new&category=ID
/admin/products?mode=new&category=ID&subcategory=ID
/admin/products?mode=edit&id=ID_PRODUCTO
```

---

#### 21.17.11. Acceso desde menú lateral

Se decidió que la página de productos también debe poder abrirse desde el menú lateral.

Estructura recomendada:

```txt
Gestión del catálogo
  - Categorías y subcategorías
  - Productos
  - Inventario
```

Reglas:

```txt
- Categorías y subcategorías abre la gestión de jerarquía.
- Productos abre la página separada de creación/edición/listado de productos.
- Inventario queda como bloque posterior.
```

---

#### 21.17.12. Flujo futuro para Nuevo producto

Cuando se implemente el próximo bloque, los botones deben funcionar así:

##### Desde una categoría

```txt
+ Nuevo producto
→ abre página de productos
→ categoría preseleccionada
→ subcategoría vacía
```

##### Desde una subcategoría

```txt
+ Nuevo producto
→ abre página de productos
→ categoría preseleccionada
→ subcategoría preseleccionada
```

##### Desde menú lateral

```txt
Productos
→ abre página general de productos
→ permite crear producto escogiendo categoría/subcategoría manualmente
```

##### Desde producto existente

```txt
Editar
→ abre página de productos en modo edición
→ carga datos del producto seleccionado
```

---

#### 21.17.13. Ajustes visuales finales realizados

Se hicieron ajustes pequeños para cerrar el bloque:

```txt
- Se quitó el texto de reglas internas de ocultar categoría/subcategoría.
- Se quitó el texto “Mantienen el mismo estilo de botones y acciones.”
- Se corrigió la alineación del menú de 3 puntos de subcategoría para que quede al lado y no debajo.
- Se mantuvo el estilo premium interno del panel.
```

---

#### 21.17.14. Regla de versiones para archivos entregados

Se confirmó como regla de trabajo para PowerZona:

```txt
Cada archivo entregado debe tener nombre único.
Cada archivo entregado debe tener una marca de versión dentro del propio archivo.
```

Ejemplo:

```txt
catalog_jerarquia_categoria_con_productos_directos_v16_2026_05_31.astro
PZ-CATALOG-JERARQUIA-CATEGORIA-CONTENIDO-V16-20260531
```

Objetivo:

```txt
Evitar confusiones, enlaces incorrectos y mezclas entre versiones.
```

---

#### 21.17.15. Estado del bloque

Estado:

```txt
✅ CERRADO
```

Resumen:

```txt
- Categorías quedan como contenedor principal.
- Subcategorías viven dentro de cada categoría.
- Se elimina la lista general de subcategorías.
- Se agregan productos directos dentro de categoría.
- Se crea vista limpia Ver contenido para categoría.
- Se crea navegación jerárquica con volver al padre y volver a lista general.
- Se preparan botones Nuevo producto en categoría y subcategoría.
- Se deja definido que productos se trabajará en página separada.
- Se deja definido acceso a Productos desde el menú lateral.
```

---

#### 21.17.16. Próximo bloque recomendado

El siguiente bloque recomendado es:

```txt
Gestión de Catálogo → Crear y editar productos en página separada
```

Objetivo del próximo bloque:

```txt
Crear una página independiente para productos, conectada con los botones Nuevo producto y Editar producto de catalog.astro, y accesible también desde el menú lateral.
```

Mensaje sugerido para iniciar la próxima conversación:

```txt
Gestión de Catálogo continuación - Página de productos separada. Source actualizado.
```

Antes de iniciar ese bloque, conviene actualizar el source del proyecto con la última versión funcional de `catalog.astro` y abrir una conversación nueva.



---

### 21.18. Bloque cerrado: Gestión de Catálogo — crear y editar productos

Este bloque se agrega como actualización acumulativa sin reemplazar secciones anteriores.

Archivo principal trabajado:

```txt
frontend-powerzona/src/pages/admin/products.astro
```

Archivos públicos también tocados durante el bloque de stock agotado/preorder:

```txt
frontend-powerzona/src/components/ProductCard.astro
frontend-powerzona/src/pages/producto/[slug].astro
frontend-powerzona/src/pages/index.astro
frontend-powerzona/src/components/Cart.astro
frontend-powerzona/src/pages/checkout.astro
```

Última versión funcional de referencia para `products.astro`:

```txt
products_crear_editar_v14_menu_acciones_sin_corte_base_v13_corregido_2026_05_31.astro
```

Marca interna de referencia usada dentro del archivo:

```txt
PZ-PRODUCTOS-CREAR-EDITAR-V14-MENU-ACCIONES-SIN-CORTE-BASE-V13-CORREGIDO-20260531
```

Objetivo del bloque:

```txt
Crear una página separada para administrar productos desde el panel admin, conectada con Gestión de catálogo, categorías, subcategorías y menú lateral.
```

---

#### 21.18.1. Página separada de productos

Se cerró la página:

```txt
/admin/products
```

Uso principal:

```txt
- Crear productos nuevos.
- Editar productos existentes.
- Ver listado administrativo de productos.
- Filtrar y buscar productos.
- Conectar productos con categorías y subcategorías.
```

Regla final:

```txt
La creación y edición de productos no debe hacerse dentro de catalog.astro.
Debe mantenerse en /admin/products para conservar una gestión más limpia.
```

---

#### 21.18.2. Conexión desde Gestión de catálogo

Los botones preparados en `catalog.astro` quedaron conectados con la página de productos.

Flujos definidos:

##### Nuevo producto desde categoría

```txt
Desde categoría
→ + Nuevo producto
→ abre /admin/products
→ categoría preseleccionada
→ subcategoría vacía
```

##### Nuevo producto desde subcategoría

```txt
Desde subcategoría
→ + Nuevo producto
→ abre /admin/products
→ categoría preseleccionada
→ subcategoría preseleccionada
```

##### Editar producto existente

```txt
Producto existente
→ Editar
→ abre /admin/products en modo edición
→ carga los datos del producto seleccionado
```

---

#### 21.18.3. Limpieza visual al crear o editar producto

Se corrigió la vista para que cuando el administrador esté creando o editando un producto, no aparezcan elementos innecesarios del listado.

Cuando el formulario está abierto, se ocultan:

```txt
- Buscador de productos.
- Filtros.
- Tarjetas de resumen.
- Productos totales.
- Visibles.
- Ocultos.
- Stock total.
- Lista de productos existentes.
```

Regla final:

```txt
Al crear o editar, la pantalla debe enfocarse en el formulario.
Al cancelar/cerrar/guardar, vuelve el listado normal.
```

---

#### 21.18.4. Campo slug oculto

Se quitó el campo visible de slug del formulario de producto.

Regla final:

```txt
El slug se genera automáticamente desde el nombre del producto.
El administrador no necesita escribirlo manualmente.
```

Esto evita errores y mantiene el formulario más limpio.

---

#### 21.18.5. Campos del formulario de producto

El formulario permite crear y editar:

```txt
- Nombre.
- Categoría.
- Subcategoría opcional.
- Precio USD.
- Stock.
- Método disponible: envío, recogida o ambos.
- Fecha de vencimiento.
- Descripción.
- Imágenes.
- Visible en tienda.
- Destacado.
- Solo USD.
- Preorder si está agotado.
```

Placeholder final del nombre:

```txt
Ej: Nombre del producto
```

---

#### 21.18.6. Creación rápida de categoría desde productos

En el desplegable de categoría se agregó la opción:

```txt
+ Crear nueva categoría
```

Comportamiento:

```txt
1. El administrador selecciona + Crear nueva categoría.
2. Se abre un modal flotante premium.
3. Escribe el nombre de la categoría.
4. Puede subir una foto opcional.
5. Guarda.
6. La categoría se crea en PocketBase.
7. Se agrega al desplegable.
8. Queda seleccionada automáticamente en el producto.
```

Regla:

```txt
La foto es opcional.
Si no se agrega al crearla, puede completarse después desde Gestión de catálogo.
```

---

#### 21.18.7. Creación rápida de subcategoría desde productos

En el desplegable de subcategoría se agregó la opción:

```txt
+ Crear nueva subcategoría
```

Comportamiento:

```txt
1. El administrador debe tener una categoría seleccionada.
2. Selecciona + Crear nueva subcategoría.
3. Se abre un modal flotante premium.
4. Escribe el nombre de la subcategoría.
5. Puede subir una foto opcional.
6. Guarda.
7. La subcategoría se crea vinculada a la categoría seleccionada.
8. Se agrega al desplegable.
9. Queda seleccionada automáticamente en el producto.
```

Regla:

```txt
No se debe permitir crear subcategoría sin categoría padre seleccionada.
```

---

#### 21.18.8. Modal flotante premium para categoría y subcategoría

La creación rápida no queda dentro del formulario de producto. Se decidió usar un modal flotante.

Comportamiento del modal:

```txt
- Se abre sobre la página actual.
- No saca al administrador de /admin/products.
- El fondo queda oscurecido.
- Se ve como tarjeta premium.
- Tiene botón X para cerrar.
- Cierra con Cancelar.
- Cierra con tecla Esc.
- Cierra al tocar fuera de la tarjeta.
```

Regla visual:

```txt
El formulario de producto debe quedar limpio detrás del modal.
```

---

#### 21.18.9. Acceso rápido a edición desde listado

Se agregó comportamiento para que el listado sea más cómodo.

Acciones que abren edición:

```txt
- Tocar la miniatura del producto.
- Tocar el nombre del producto.
- Tocar el botón Editar desde acciones.
```

También se agregó soporte de teclado:

```txt
Enter o espacio sobre nombre/miniatura abre edición.
```

---

#### 21.18.10. Acciones del listado de productos

Se definió que el botón principal directo en la tarjeta debe ser:

```txt
Visible / Oculto
```

Las demás acciones se movieron a un menú flotante de tres puntos para no cargar visualmente la tarjeta.

Acciones dentro del menú:

```txt
- Editar.
- Marcar agotado.
- Borrar.
```

Regla visual:

```txt
Dejar Visible/Oculto directo y mover las demás acciones al menú de tres puntos.
```

---

#### 21.18.11. Botón Visible / Oculto

El botón `Visible / Oculto` solo debe cambiar el estado de visibilidad del producto.

Corrección cerrada:

```txt
Al tocar Ocultar / Activar no debe abrir el panel de edición.
Solo debe cambiar el botón verde visible a ocultado, o viceversa.
```

---

#### 21.18.12. Guardar producto cierra el formulario

Corrección cerrada:

```txt
Cuando el administrador toca Guardar producto y el guardado termina correctamente, el panel de edición/creación debe cerrarse automáticamente.
```

El panel también puede cerrarse manualmente con:

```txt
Cerrar
Cancelar
```

---

#### 21.18.13. Botón Borrar producto

Se agregó acción de borrar producto.

Regla:

```txt
El botón Borrar debe pedir confirmación antes de eliminar.
```

Uso recomendado:

```txt
- Borrar productos creados por error.
- Borrar productos de prueba.
```

Advertencia:

```txt
Para productos reales con historial de ventas, es más seguro usar Ocultar.
```

---

#### 21.18.14. Marcar agotado

Se agregó acción rápida:

```txt
Marcar agotado
```

Comportamiento:

```txt
Al tocar Marcar agotado, el sistema pone el stock del producto en 0.
```

Caso de uso:

```txt
Si el producto se vendió fuera de la web, el administrador puede agotarlo rápido sin entrar a editar stock manualmente.
```

---

#### 21.18.15. Regla Visible vs Agotado

Se definió una regla importante:

```txt
Visible no significa disponible.
Un producto puede estar visible y agotado a la vez.
```

Comportamiento:

```txt
Si visible = true y stock = 0:
- El producto sigue apareciendo en la tienda.
- Se muestra como Agotado.
- No permite hacer pedido si preorder está apagado.
```

Esto permite conservar el producto público como referencia aunque no tenga inventario.

---

#### 21.18.16. Preorder si está agotado

Se agregó lógica de preorder para productos agotados.

Campo nuevo en PocketBase:

```txt
products.allow_preorder
```

Tipo:

```txt
Bool
```

Configuración recomendada:

```txt
Required: desmarcado
Presentable: puede estar marcado
Hidden: desmarcado
```

Nota:

```txt
PocketBase puede no permitir definir valor por defecto desde el panel.
Si el campo está vacío/no marcado, el frontend lo trata como false.
```

Regla:

```txt
Si stock = 0 y allow_preorder = false:
- Producto agotado.
- No se puede agregar al carrito.
- No se puede realizar pedido.

Si stock = 0 y allow_preorder = true:
- Producto en preorden.
- Se puede agregar al carrito.
- Se puede realizar pedido.
- Debe quedar marcado como PREORDEN en carrito, checkout, orden y WhatsApp.
```

---

#### 21.18.17. Producto agotado en tienda pública

Se actualizó la lógica pública para manejar agotados.

Reglas:

```txt
- Producto con stock 0 y sin preorder: mostrar Agotado.
- Botón de compra bloqueado.
- No permitir agregar al carrito.
- Si ya está en carrito y luego queda agotado, bloquear avance a checkout o pedido.
```

Archivos tocados para esta lógica:

```txt
ProductCard.astro
producto/[slug].astro
Cart.astro
checkout.astro
index.astro
```

---

#### 21.18.18. Producto en preorder en tienda pública

Reglas:

```txt
- Producto con stock 0 y allow_preorder = true: mostrar Preorden disponible.
- Botón: Preordenar.
- Permitir agregar al carrito.
- Mostrar aviso de preorden en carrito y checkout.
- En WhatsApp debe indicarse PREORDEN.
- En notas internas de la orden debe quedar claro qué producto fue preorder.
```

---

#### 21.18.19. Menú de tres puntos corregido

Se corrigió el menú flotante de acciones del listado de productos.

Problema:

```txt
El menú de los tres puntos podía quedar escondido en el último producto del listado.
Un intento con position fixed lo mandaba a una esquina de la página.
```

Corrección final:

```txt
El menú queda anclado al botón de tres puntos.
Si no hay espacio abajo, abre hacia arriba.
No debe irse a una esquina.
No debe quedar cortado al final del listado.
```

Última referencia funcional:

```txt
products_crear_editar_v14_menu_acciones_sin_corte_base_v13_corregido_2026_05_31.astro
```

---

#### 21.18.20. Lógica acordada para variaciones antes del próximo bloque

Antes de implementar variaciones se dejó definida esta regla:

```txt
Producto simple:
- Usa stock base del producto.

Producto con variaciones:
- El stock real vive en las variaciones.
- El stock total del producto se calcula automáticamente sumando el stock de sus variaciones.
- El stock del producto padre no debe editarse manualmente cuando existan variaciones.
```

Ejemplo:

```txt
Producto: Whey Body Fortress

Variaciones:
Chocolate: 2
Vainilla: 3
Fresa: 1

Stock total mostrado: 6
```

Regla para venta:

```txt
Si el producto tiene variaciones, el cliente debe seleccionar una variación antes de agregar al carrito.
```

Regla para inventario:

```txt
Al confirmar/cancelar orden:
- Si el item tiene variación, descuenta/devuelve stock de la variación.
- Si no tiene variación, descuenta/devuelve stock del producto base.
```

---

#### 21.18.21. Archivos modificados en este bloque

```txt
frontend-powerzona/src/pages/admin/products.astro
frontend-powerzona/src/pages/admin/catalog.astro
frontend-powerzona/src/components/ProductCard.astro
frontend-powerzona/src/pages/producto/[slug].astro
frontend-powerzona/src/pages/index.astro
frontend-powerzona/src/components/Cart.astro
frontend-powerzona/src/pages/checkout.astro
```

Nota:

```txt
catalog.astro se tocó para conectar botones Nuevo producto y Editar producto con /admin/products.
products.astro quedó como archivo principal del bloque.
Los demás archivos se tocaron para soportar stock 0, agotado y preorder en tienda pública, carrito y checkout.
```

---

#### 21.18.22. Validación técnica realizada

Se validó la sintaxis JavaScript interna de los scripts modificados con:

```txt
node --check
```

Resultado reportado:

```txt
Sin errores de sintaxis JavaScript detectados.
```

Nota:

```txt
No siempre se pudo completar npm run build dentro del entorno de revisión porque los ZIP incluían node_modules de Windows o dependencias opcionales de Rollup no disponibles en Linux.
Esto no necesariamente indica error del código.
En la computadora del proyecto, si aparece un error similar, ejecutar:
```

```bash
npm install
npm run build
```

---

#### 21.18.23. Estado del bloque

Estado:

```txt
✅ CERRADO
```

Resumen:

```txt
- /admin/products queda como página separada.
- Crear producto funciona.
- Editar producto funciona.
- Slug se genera automáticamente.
- Categoría y subcategoría se pueden crear desde modal flotante.
- Foto opcional para categoría/subcategoría rápida.
- Listado de productos con acciones limpias.
- Visible/Oculto queda como acción directa.
- Editar, Marcar agotado y Borrar quedan en menú de tres puntos.
- Marcar agotado pone stock en 0.
- Producto visible con stock 0 aparece como Agotado.
- Agotado sin preorder no permite pedido.
- Preorder permite pedir producto agotado con aviso.
- Menú de tres puntos corregido para no cortarse al final.
- Queda definida la regla base para variaciones.
```

---

#### 21.18.24. Próximo bloque recomendado

El siguiente bloque recomendado es:

```txt
Gestión de Catálogo → Variaciones de productos
```

Objetivo:

```txt
Agregar variaciones dentro de productos, con stock propio, precio opcional, imagen opcional y estado activo/oculto.
```

Regla principal del próximo bloque:

```txt
Si un producto tiene variaciones, el stock del producto padre será calculado, no editable.
El stock real se administra desde las variaciones.
```

Mensaje sugerido para iniciar la próxima conversación:

```txt
Gestión de Catálogo continuación - Variaciones de productos. Source actualizado.
```

Antes de iniciar ese bloque:

```txt
1. Copiar la última versión funcional del source.
2. Probar /admin/products con el archivo V14 corregido.
3. Confirmar que allow_preorder existe en products.
4. Actualizar el source completo.
5. Abrir conversación nueva.
```

---

### 21.19. Bloque futuro definido: Regalos profesionales por orden

Este bloque se agrega como actualización acumulativa del Master Document antes de continuar con Variaciones de productos.

Estado:

```txt
💡 FUTURO / DEFINIDO PARA TRABAJAR DESPUÉS DE VARIACIONES
```

Decisión tomada:

```txt
Primero se trabajará y cerrará Gestión de Catálogo → Variaciones de productos.
Después, en un nuevo bloque y con source actualizado, se trabajará el sistema profesional de regalos.
```

---

#### 21.19.1. Objetivo del sistema de regalos

PowerZona debe permitir manejar productos de regalo de forma profesional, sin mezclarlos directamente con la lógica básica de variaciones.

El objetivo es que el administrador pueda configurar regalos que el cliente pueda reclamar cuando su orden cumpla ciertas condiciones.

Ejemplos:

```txt
- Compra desde 100 USD y califica para un regalo.
- Compra una proteína específica y califica para un regalo.
- Compra productos específicos juntos y califica para un regalo.
```

---

#### 21.19.2. Regla principal del regalo

Un regalo será un producto real del catálogo, pero tratado con reglas especiales.

Reglas definidas:

```txt
- El producto regalo tendrá precio 0 USD.
- El producto regalo no debe tener variaciones en esta primera versión.
- El producto regalo tendrá stock propio.
- El producto regalo puede tener imagen propia.
- El producto regalo puede estar en una categoría llamada Regalos.
- Solo se permite 1 regalo por orden.
```

---

#### 21.19.3. Categoría Regalos

Se recomienda crear una categoría especial:

```txt
Regalos
```

Uso:

```txt
Mostrar productos de regalo disponibles cuando el cliente califique.
```

Esta categoría no debe comportarse como una categoría común para compra directa si los productos son solo regalos.

El cliente podrá llegar a esta categoría mediante un botón visible en checkout cuando su compra califique.

---

#### 21.19.4. Comportamiento en checkout

El regalo no debe agregarse automáticamente al carrito.

Comportamiento aprobado:

```txt
1. El cliente agrega productos normales al carrito.
2. En checkout, el sistema revisa si la compra califica para regalo.
3. Si califica y todavía no agregó regalo, aparece un aviso:
   "Tu compra califica para regalos".
4. Debajo aparece un botón:
   "Ver regalos disponibles".
5. Ese botón lleva al cliente a la categoría Regalos.
6. El cliente elige manualmente el regalo que quiere.
7. El regalo se agrega al carrito con precio 0 USD.
8. Solo se permite 1 regalo por orden.
```

Regla importante:

```txt
Si el cliente ya agregó un regalo al carrito, el botón de regalos no debe seguir apareciendo en checkout.
```

---

#### 21.19.5. Validación del regalo en checkout

Antes de guardar la orden, el sistema debe validar nuevamente que el regalo agregado sea válido.

Validaciones:

```txt
- La orden realmente califica para regalo.
- El producto agregado está marcado como regalo.
- El precio del regalo es 0 USD.
- El regalo tiene stock disponible.
- Solo existe 1 regalo en la orden.
- La regla de regalo está activa.
```

Si el cliente deja de cumplir la condición porque quitó productos o bajó el total, el regalo debe eliminarse o bloquearse antes de crear la orden.

---

#### 21.19.6. Admin puede agregar regalo manualmente

El administrador sí podrá agregar un producto de regalo a una orden desde el panel admin aunque la orden no cumpla las condiciones automáticas.

Uso esperado:

```txt
- Atención especial a un cliente.
- Corrección manual.
- Regalo por decisión del negocio.
- Promoción fuera de regla.
```

Regla:

```txt
El regalo agregado manualmente por admin debe quedar marcado como regalo dentro de order_items.
```

---

#### 21.19.7. Colección profesional recomendada: gift_rules

Se eligió una opción profesional basada en una colección separada:

```txt
gift_rules
```

Campos sugeridos:

```txt
name                 → text
active               → bool
gift_product          → relation → products
condition_type        → select
min_total_usd         → number
required_products     → relation múltiple → products
match_mode            → select: any / all
max_gift_quantity     → number
priority              → number
start_date            → date opcional
end_date              → date opcional
created               → autodate
updated               → autodate
```

Tipos de condición recomendados:

```txt
cart_total        → califica por total mínimo de compra
specific_product  → califica si incluye un producto específico
specific_products → califica si incluye varios productos específicos
manual_only       → solo disponible para admin
```

---

#### 21.19.8. Campos recomendados en products para regalos

En la colección `products` se recomienda agregar:

```txt
is_gift → bool
```

Reglas:

```txt
Si is_gift = true:
- El precio debe ser 0 USD.
- No debe tener variaciones.
- Puede tener stock.
- Puede tener imagen.
- Puede aparecer dentro de la categoría Regalos.
- No debe comprarse como producto normal si no hay regla válida.
```

---

#### 21.19.9. Campos recomendados en order_items para regalos

En la colección `order_items` se recomienda agregar:

```txt
is_gift     → bool
gift_rule   → relation opcional → gift_rules
manual_gift → bool
```

Uso:

```txt
is_gift = true indica que la línea es un regalo.
gift_rule guarda qué regla permitió el regalo, si aplica.
manual_gift = true indica que lo agregó el admin manualmente.
```

---

#### 21.19.10. Inventario de regalos

Aunque el regalo tenga precio 0 USD, sí afecta inventario.

Regla:

```txt
Cuando una orden se confirma:
- El producto regalo descuenta stock igual que un producto normal.

Cuando una orden confirmada se cancela:
- El producto regalo devuelve stock igual que un producto normal.
```

Esto debe conectarse con el sistema ya cerrado de inventario seguro al confirmar/cancelar orden.

---

#### 21.19.11. Regla de 1 regalo por orden

PowerZona trabajará inicialmente con esta regla:

```txt
1 regalo máximo por orden.
```

Esto simplifica:

```txt
- Checkout.
- Validaciones.
- Carrito.
- WhatsApp.
- Administración.
- Inventario.
```

En el futuro se podrá ampliar a varios regalos por orden si el negocio lo necesita.

---

#### 21.19.12. WhatsApp y resumen de orden

Cuando una orden incluya un regalo, debe mostrarse claramente.

Ejemplo:

```txt
Productos:
1. Whey Body Fortress
   Cantidad: 1
   Precio: $40.00 USD

Regalo:
1. Shaker PowerZona
   Precio: $0.00 USD
```

El regalo no debe aumentar el total.

---

#### 21.19.13. Orden recomendado para trabajar regalos

Este bloque debe trabajarse después de variaciones.

Orden sugerido:

```txt
1. Cerrar Variaciones de productos.
2. Actualizar source.
3. Actualizar Master Document.
4. Abrir conversación nueva.
5. Crear estructura de PocketBase para regalos:
   - products.is_gift
   - gift_rules
   - order_items.is_gift
   - order_items.gift_rule
   - order_items.manual_gift
6. Crear categoría Regalos.
7. Agregar lógica de calificación en checkout.
8. Agregar botón "Ver regalos disponibles".
9. Permitir agregar 1 regalo al carrito.
10. Validar regalo antes de crear orden.
11. Permitir agregar regalo manual desde admin.
12. Conectar con inventario seguro.
```

---

#### 21.19.14. Estado de la decisión

Estado:

```txt
✅ DECISIÓN DOCUMENTADA
```

Resumen:

```txt
- No se trabajará regalos dentro del bloque actual de variaciones.
- El sistema de regalos será profesional mediante `gift_rules`.
- El regalo no se agregará automáticamente.
- El cliente verá un aviso en checkout si califica.
- El botón llevará a la categoría Regalos.
- El cliente podrá escoger 1 regalo por orden.
- El admin podrá agregar regalo manualmente sin condición.
- El regalo tendrá precio 0 USD y sí descontará inventario.
```

Próximo bloque inmediato:

```txt
Gestión de Catálogo → Variaciones de productos
```

Mensaje sugerido para el próximo chat:

```txt
Gestión de Catálogo continuación - Variaciones de productos. Source actualizado.
```

---

### 21.20. Actualización en curso: Variaciones, historial seguro de `order_items` y borrado seguro de productos

Este bloque se agrega como actualización acumulativa sin reemplazar secciones anteriores.

Archivo base de trabajo actualizado por el usuario:

```txt
Source actualizado hasta el punto donde las variaciones funcionaban correctamente y podían crearse desde /admin/products.
```

Objetivo de esta actualización:

```txt
Mantener funcional la creación de variaciones y, al mismo tiempo, permitir borrar productos reales aunque tengan variaciones o historial de ventas, sin perder el texto histórico de las órdenes.
```

Estado:

```txt
🟡 IMPLEMENTADO / PENDIENTE DE PRUEBA FINAL
```

---

#### 21.20.1. Problema detectado

Al intentar borrar un producto que tenía variaciones o estaba referenciado en una orden, PocketBase podía bloquear la acción con mensajes similares a:

```txt
Failed to delete record. Make sure that the record is not part of a required relation reference.
```

Causa principal:

```txt
order_items.product estaba como relación requerida hacia products.
product_variations.product también estaba relacionado con products.
```

Esto hacía que PocketBase protegiera el producto real porque otros registros todavía dependían de él.

---

#### 21.20.2. Decisión tomada

Se decidió mejorar `order_items` para que cada línea de orden guarde una copia fija de los datos importantes de la venta.

Regla:

```txt
La orden debe conservar historial aunque el producto real se borre del catálogo.
```

Campos históricos importantes en `order_items`:

```txt
product_name
variation_name
variation_label
unit_price_usd
quantity
line_total_usd
product_ref
variation_ref
```

Uso:

```txt
product_name      → nombre histórico visible del producto vendido.
variation_label   → texto histórico de la variación vendida.
unit_price_usd    → precio unitario usado en esa venta.
quantity          → cantidad vendida.
line_total_usd    → total de la línea.
product_ref       → copia fija del ID original del producto.
variation_ref     → copia fija del ID original de la variación.
```

---

#### 21.20.3. Regla final para `order_items.product`

Para permitir borrar productos reales sin romper órdenes viejas, la relación real:

```txt
order_items.product → products
```

debe quedar:

```txt
required: false
```

Regla:

```txt
La relación puede quedar vacía si el producto real fue borrado.
La orden debe seguir mostrando los datos desde los campos históricos.
```

Esto permite conservar el historial de ventas sin obligar a mantener para siempre productos que ya no se venderán.

---

#### 21.20.4. Regla final para `order_items.variation`

La relación:

```txt
order_items.variation → product_variations
```

debe quedar opcional.

Regla:

```txt
Si la variación real se borra, la orden conserva variation_label y variation_ref como historial.
```

---

#### 21.20.5. Regla final para `product_variations.product`

Para crear variaciones nuevas, cada variación debe seguir necesitando un producto padre.

Regla:

```txt
Crear variación → necesita producto padre.
Borrar producto → puede borrar también sus variaciones reales.
Orden histórica → conserva texto fijo en order_items.
```

Por eso, la relación:

```txt
product_variations.product → products
```

puede seguir siendo requerida para creación normal de variaciones, pero debe permitir borrado seguro mediante cascada o mediante borrado previo desde el panel admin.

Configuración recomendada:

```txt
required: true
cascadeDelete: true
```

---

#### 21.20.6. Borrado seguro de productos con variaciones

Se definió esta lógica en el panel admin de productos:

```txt
Al borrar un producto:
1. Buscar variaciones relacionadas con ese producto.
2. Borrar primero las variaciones reales.
3. Borrar después el producto real.
4. Mantener intactas las órdenes históricas.
```

Resultado esperado:

```txt
Producto real eliminado.
Variaciones reales eliminadas.
Orden histórica conservada.
order_items mantiene el texto fijo de lo vendido.
```

---

#### 21.20.7. Corrección importante de migración duplicada

Durante la prueba de PocketBase apareció este error:

```txt
failed to apply migration 1780341400_updated_order_items_history_safe_delete.js:
fields: (17: (name: Duplicated or invalid field name product_ref.).)
```

Interpretación:

```txt
El campo product_ref ya existía en order_items.
La migración no debía intentar crearlo otra vez.
```

Corrección aplicada:

```txt
La migración debe revisar/actualizar la estructura necesaria sin duplicar product_ref.
```

Regla futura:

```txt
Antes de agregar un campo por migración, revisar si el source actual ya lo trae creado.
```

---

#### 21.20.8. Regla de trabajo aprendida para `products.astro`

Se detectó que una versión anterior del archivo rompió el menú de variaciones después de crear un producto.

Regla final para este bloque:

```txt
Usar como base el source actualizado por el usuario donde las variaciones sí funcionaban.
No reemplazar products.astro por una versión anterior.
Aplicar solo los cambios necesarios de borrado seguro.
Conservar intacto el bloque de creación/edición de variaciones.
```

Funciones que deben conservarse:

```txt
- Crear variación después de guardar producto.
- Mostrar sección Variaciones del producto.
- Botón Nueva variación.
- Guardar variación.
- Editar variación.
- Activar/Ocultar variación.
- Borrar variación.
- Foto por variación.
- Precio / costo / stock por variación.
```

---

#### 21.20.9. Migraciones usadas en esta actualización

Migraciones trabajadas durante esta mejora:

```txt
backend-powerzona/pb_migrations/1780341400_updated_order_items_history_safe_delete.js
backend-powerzona/pb_migrations/1780341460_updated_product_variations_product_cascade_delete.js
```

Nota:

```txt
La migración 1780341400 debe estar corregida para no duplicar product_ref si ya existe.
```

---

#### 21.20.10. Archivos principales relacionados

Archivos tocados o relacionados con esta actualización:

```txt
frontend-powerzona/src/pages/admin/products.astro
frontend-powerzona/src/pages/admin/orders.astro
frontend-powerzona/src/pages/checkout.astro
backend-powerzona/pb_migrations/1780341400_updated_order_items_history_safe_delete.js
backend-powerzona/pb_migrations/1780341460_updated_product_variations_product_cascade_delete.js
```

Regla de prioridad:

```txt
products.astro debe venir del source actualizado donde las variaciones funcionaban.
```

---

#### 21.20.11. Pruebas recomendadas antes de cerrar esta mejora

Prueba 1: PocketBase arranca sin error

```txt
1. Reiniciar PocketBase.
2. Confirmar que no aparece error de migración.
3. Confirmar que product_ref no se duplica.
```

Prueba 2: Crear producto y variación

```txt
1. Ir a /admin/products.
2. Crear un producto nuevo.
3. Guardar producto.
4. Confirmar que aparece Variaciones del producto.
5. Crear una variación.
6. Confirmar que se guarda correctamente.
```

Prueba 3: Borrar producto con variaciones

```txt
1. Crear o seleccionar un producto con variaciones.
2. Tocar Borrar producto.
3. Confirmar acción.
4. Verificar que se borran sus variaciones.
5. Verificar que se borra el producto.
6. Verificar que PocketBase no bloquea la acción.
```

Prueba 4: Orden histórica

```txt
1. Crear una orden con un producto o variación.
2. Confirmar que order_items guarda product_name, variation_label, unit_price_usd, quantity y line_total_usd.
3. Borrar el producto real.
4. Abrir la orden.
5. Confirmar que la orden sigue mostrando el texto histórico de lo vendido.
```

---

#### 21.20.12. Estado actual del bloque de variaciones

Estado actual:

```txt
🟡 Variaciones funcionando como base en el source actualizado por el usuario.
🟡 Historial seguro de order_items implementado, pendiente de prueba final después del fix de migración.
🟡 Borrado de productos con variaciones implementado, pendiente de prueba final.
```

No se considera cerrado todavía porque falta validar en la computadora del proyecto:

```txt
- Que PocketBase arranque sin error.
- Que se pueda crear variación después de crear producto.
- Que se pueda borrar producto con variaciones.
- Que las órdenes conserven historial después de borrar producto real.
```

---

#### 21.20.13. Próximo paso recomendado

Continuar el bloque:

```txt
Gestión de Catálogo → Variaciones de productos
```

Orden recomendado inmediato:

```txt
1. Aplicar la migración corregida.
2. Reiniciar PocketBase.
3. Probar creación de variaciones.
4. Probar borrado de producto con variaciones.
5. Si todo funciona, cerrar la mejora de historial seguro.
6. Continuar con la parte pública de variaciones en producto/carrito/checkout si falta algo.
```

Mensaje sugerido para continuar en nuevo chat:

```txt
Gestión de Catálogo continuación - Variaciones de productos. Source actualizado con historial seguro y borrado de productos con variaciones en prueba.
```



---

### 21.21. Actualización de cierre parcial antes de continuar Variaciones en nuevo chat

Esta sección se agrega como actualización acumulativa antes de abrir una conversación nueva para continuar el bloque:

```txt
Gestión de Catálogo → Variaciones de productos
```

Estado:

```txt
🟡 BLOQUE EN CURSO / REQUIERE CONTINUAR EN NUEVO CHAT
```

Objetivo de esta actualización:

```txt
Dejar documentadas las decisiones y problemas detectados durante las pruebas recientes de productos con variaciones, stock descontable, productos sin categoría y comportamiento público de la tienda.
```

Marca de versión documental:

```txt
PZ-MASTER-VARIACIONES-CONTINUACION-V5-20260601
```

---

#### 21.21.1. Orden correcto acordado para no romper nada

Antes de avanzar a Producto/Promo u Organización visual, se acordó corregir primero lo que ya está abierto dentro del bloque de variaciones y stock descontable.

Orden inmediato:

```txt
1. Producto sin stock descontable no debe aparecer como Agotado.
2. Producto sin stock descontable debe poder agregarse al carrito sin revisar stock.
3. Las órdenes no deben descontar stock si products.track_stock = false.
```

Después de cerrar eso, se podrá trabajar:

```txt
Crear Producto/Promo
```

Y más adelante:

```txt
Organización visual de la tienda pública
```

---

#### 21.21.2. Decisión sobre productos sin stock descontable

Se agregó la lógica conceptual para productos que no deben controlar inventario.

Campo usado:

```txt
products.track_stock
```

Regla:

```txt
track_stock = true
→ El producto controla inventario.
→ Si no tiene variaciones, usa products.stock.
→ Si tiene variaciones, usa product_variations.stock.

track_stock = false
→ El producto no controla inventario.
→ No debe aparecer como Agotado por tener stock 0.
→ Debe poder agregarse al carrito sin revisar stock.
→ Las órdenes no deben descontar inventario para ese producto.
```

Caso de uso definido por el usuario:

```txt
Producto que PowerZona siempre tiene disponible o que no quiere controlar por stock.
El cliente puede agregar cantidades al pedido sin que el sistema bloquee por inventario.
```

Ejemplo:

```txt
Nombre: Producto siempre disponible
track_stock: false
stock: 0
active: true

Resultado esperado:
- Se muestra en la tienda pública.
- No aparece como Agotado.
- Permite agregar al carrito.
- No descuenta stock al confirmar la orden.
```

---

#### 21.21.3. Problema detectado en tienda pública

Se detectó que un producto visible sin stock descontable aparece como:

```txt
Agotado
```

y no permite agregarse al carrito.

Causa conceptual:

```txt
La tienda pública todavía usa la regla vieja:
stock <= 0 → agotado
```

Regla correcta:

```txt
Si track_stock = true:
- revisar stock.
- si stock <= 0 y allow_preorder = false, mostrar Agotado y bloquear compra.
- si stock <= 0 y allow_preorder = true, permitir preorder.

Si track_stock = false:
- no revisar stock.
- no mostrar Agotado.
- permitir agregar al carrito.
```

Archivos que deben revisarse en el siguiente chat:

```txt
frontend-powerzona/src/components/ProductCard.astro
frontend-powerzona/src/pages/producto/[slug].astro
frontend-powerzona/src/components/Cart.astro
frontend-powerzona/src/pages/checkout.astro
frontend-powerzona/src/pages/admin/orders.astro
```

---

#### 21.21.4. Regla para órdenes con productos sin stock descontable

Cuando una orden se confirme, el inventario seguro debe respetar `track_stock`.

Regla:

```txt
Si order_item.product tiene track_stock = false:
- no validar stock.
- no descontar stock.
- no devolver stock al cancelar.
```

Para productos con variaciones:

```txt
Si producto padre track_stock = false:
- sus variaciones tampoco deben descontar stock.
- no se debe exigir stock en variación.
```

Para productos descontables:

```txt
Si producto padre track_stock = true y item tiene variation:
- descontar/restaurar stock en product_variations.

Si producto padre track_stock = true y item no tiene variation:
- descontar/restaurar stock en products.
```

---

#### 21.21.5. Problema detectado al crear productos sin stock

Durante pruebas, al intentar crear un producto sin stock descontable apareció el error:

```txt
Failed to create record. stock: Cannot be blank.
```

Interpretación:

```txt
El campo products.stock todavía estaba siendo tratado como requerido por PocketBase o el código no estaba enviando 0 de forma segura.
```

Regla final:

```txt
products.stock no debe ser requerido en PocketBase.
```

Configuración recomendada:

```txt
products.stock
Tipo: Number
Required: OFF
Min: vacío o 0
```

Motivo:

```txt
El panel admin decide cuándo exigir stock.
PocketBase no debe bloquear productos válidos sin control de inventario.
```

Casos válidos con stock 0:

```txt
Producto sin stock descontable.
Producto con variaciones recién creado antes de agregar variaciones.
Producto agotado visible.
Producto en preorder.
```

---

#### 21.21.6. Regla final de creación de producto y variaciones

Se corrigió conceptualmente el flujo deseado para crear productos con variaciones.

Regla importante del usuario:

```txt
La opción Usar variación NO debe aparecer mientras se está creando el producto.
```

Flujo correcto:

```txt
1. Admin toca Nuevo producto.
2. Se abre solo el formulario básico del producto.
3. No aparece Usar variación.
4. No aparece panel de variaciones.
5. Admin completa nombre y datos básicos.
6. Admin toca Guardar.
7. Se crea primero el producto padre.
8. Antes de cerrar el panel, el sistema pregunta:
   ¿Deseas agregar variaciones a este producto?
```

Si responde:

```txt
Sí
```

entonces:

```txt
- El sistema marca has_variations = true.
- El sistema pone stock padre en 0.
- Se abre el panel de variaciones dentro del producto ya creado.
- Se permite crear la primera variación.
```

Si responde:

```txt
No
```

entonces:

```txt
- El producto queda creado como producto simple.
- has_variations = false.
- Se cierra el panel de crear producto.
- No se crea ninguna variación.
```

---

#### 21.21.7. Panel flotante dentro de tarjeta

Se decidió que las confirmaciones visuales deben mantenerse dentro de la misma tarjeta, no como alertas externas del navegador.

Aplica para:

```txt
- Pregunta después de crear producto:
  ¿Deseas agregar variaciones?

- Confirmación de borrar producto.
```

Regla visual:

```txt
Las acciones importantes deben aparecer como panel flotante integrado en la tarjeta premium.
```

Ejemplo deseado:

```txt
Producto creado correctamente.
¿Deseas agregar variaciones a este producto ahora?

[No, después] [Sí, agregar variación]
```

Para borrar producto:

```txt
Borrar producto
¿Seguro que quieres borrar este producto?

[Cancelar] [Sí, borrar]
```

---

#### 21.21.8. Orden visual de variaciones

Se decidió limpiar la tarjeta de variaciones.

Reglas:

```txt
- No mostrar campo manual de sort_order como input principal.
- El orden visual debe manejarse con flechas ↑ ↓.
- La tarjeta de variación debe mostrar una acción principal: Editar.
- El botón Borrar variación debe estar dentro del modo edición de la variación.
```

Estructura visual deseada:

```txt
Variaciones existentes

1. Chocolate
   Precio: 40 USD
   Stock: 3
   [↑] [↓] [Editar]

2. Vainilla
   Precio: 40 USD
   Stock: 2
   [↑] [↓] [Editar]
```

---

#### 21.21.9. Producto visible sin categoría en página pública

Se definió que un producto visible sin categoría debe mostrarse en la página principal pública:

```txt
http://localhost:4321/
```

Regla:

```txt
Producto active = true
Categoría vacía
→ Mostrar en página principal.
```

No debe interpretarse como oculto.

Regla completa:

```txt
Producto visible + sin categoría:
- aparece en página principal.

Producto visible + categoría visible:
- aparece donde corresponda.

Producto visible + categoría oculta:
- no aparece.

Producto oculto:
- no aparece.
```

Archivo relacionado:

```txt
frontend-powerzona/src/lib/api.ts
```

---

#### 21.21.10. Producto/Promo — idea definida para después

Se definió una idea futura para crear un tipo de producto simple orientado a contacto por WhatsApp.

Nombre visual sugerido del botón:

```txt
Crear Producto/Promo
```

Ubicación:

```txt
Al lado de Nuevo producto dentro de /admin/products.
```

Objetivo:

```txt
Crear una tarjeta pública que no sea producto normal de inventario.
```

Campos iniciales:

```txt
Nombre
Descripción
Imagen opcional
Visible/Oculto
Botón Contactar por WhatsApp
```

No debe tener inicialmente:

```txt
Stock
Variaciones
Costo
Agregar al carrito
Checkout normal
```

Comportamiento público:

```txt
La tarjeta se muestra en la tienda pública con un botón:
Contactar por WhatsApp
```

Ejemplo:

```txt
Promo especial para combos personalizados.
Escríbenos para armar tu combo ideal.

[Contactar por WhatsApp]
```

Recomendación técnica futura:

```txt
products.product_type
Tipo: select
Opciones:
- normal
- promo
```

Regla:

```txt
product_type = normal
→ producto normal con carrito/stock/variaciones.

product_type = promo
→ tarjeta promocional con contacto WhatsApp, sin carrito.
```

Estado:

```txt
💡 FUTURO / DESPUÉS DE CERRAR VARIACIONES Y TRACK_STOCK
```

---

#### 21.21.11. Organización visual — idea definida para después

Se propuso crear una nueva sección en el panel admin:

```txt
Organización visual
```

Objetivo:

```txt
Separar la gestión del contenido de la organización visual de la tienda pública.
```

No reemplaza Gestión de catálogo.

Diferencia:

```txt
Gestión de catálogo:
- Crear/editar productos.
- Stock.
- Variaciones.
- Categorías.
- Subcategorías.

Organización visual:
- Ordenar cómo aparece todo en la página principal.
- Organizar categorías en home.
- Organizar productos sin categoría.
- Organizar Producto/Promo.
- Agregar botones especiales.
```

Funciones futuras posibles:

```txt
- Orden de bloques en la página principal.
- Orden de categorías.
- Orden de productos destacados o sin categoría.
- Bloque Producto/Promo.
- Botón para grupo de WhatsApp.
- Botón para descargar archivo/PDF.
- Botones con enlaces personalizados.
```

Ejemplo de bloques:

```txt
1. Categorías
2. Productos destacados
3. Productos sin categoría
4. Producto/Promo
5. Botón grupo WhatsApp
6. Descargar catálogo PDF
```

Estado:

```txt
💡 FUTURO / BLOQUE NUEVO DESPUÉS DE VARIACIONES
```

---

#### 21.21.12. Pendientes exactos para el próximo chat

El próximo chat debe continuar el bloque de variaciones, pero el foco inmediato debe ser corregir `track_stock` en la tienda pública, carrito y órdenes.

Orden recomendado:

```txt
1. Revisar source actualizado completo.
2. Confirmar que products.stock ya no está requerido en PocketBase.
3. Confirmar que products.track_stock existe y se llama exactamente track_stock.
4. Corregir ProductCard.astro:
   - si track_stock = false, no mostrar Agotado por stock 0.
   - permitir botón de compra.
5. Corregir producto/[slug].astro:
   - si track_stock = false, permitir agregar al carrito.
   - no limitar cantidad por stock.
6. Corregir Cart.astro:
   - si track_stock = false, no bloquear botón + por stock.
7. Corregir checkout.astro:
   - si track_stock = false, no validar stock.
   - guardar order_items con historial seguro.
8. Corregir orders.astro:
   - al confirmar/cancelar, no descontar/restaurar stock si track_stock = false.
9. Después continuar la parte pública de variaciones:
   - selector de variación.
   - precio de variación.
   - foto de variación.
   - carrito con variation_id.
   - checkout con variation_label.
```

---

#### 21.21.13. Mensaje recomendado para abrir el próximo chat

Mensaje sugerido:

```txt
Gestión de Catálogo continuación - Variaciones de productos. Source actualizado. Antes de seguir con selector público de variaciones, primero corregimos track_stock: producto sin stock descontable no debe aparecer agotado, debe poder agregarse al carrito y no debe descontar inventario en órdenes.
```

---

#### 21.21.14. Estado final antes de cambiar de chat

Estado actual del bloque:

```txt
🟡 Variaciones en curso.
🟡 Admin de variaciones parcialmente avanzado.
🟡 Flujo de creación con pregunta post-guardado definido.
🟡 track_stock definido, pero falta aplicar correctamente en tienda pública, carrito, checkout y órdenes.
🟡 Producto/Promo definido como bloque futuro.
🟡 Organización visual definida como bloque futuro.
```

Regla de prioridad para el próximo chat:

```txt
No empezar Producto/Promo ni Organización visual todavía.
Primero cerrar comportamiento de track_stock y continuar variaciones.
```



---

### 21.22. Bloque cerrado de momento: Variaciones de productos + `track_stock` seguro

Esta sección se agrega como actualización acumulativa sin reemplazar las secciones anteriores.

Estado:

```txt
✅ CERRADO DE MOMENTO
```

Bloque cerrado:

```txt
Gestión de Catálogo → Variaciones de productos + stock seguro
```

Fecha de cierre documental:

```txt
2026-06-02
```

Marca de versión documental:

```txt
PZ-MASTER-AJUSTES-TIENDA-PREVIO-V6-20260602
```

---

#### 21.22.1. Resumen de lo cerrado en variaciones

Durante este bloque se dejó funcional la base de variaciones de producto en el admin y en la tienda pública.

Quedó cerrado de momento:

```txt
- Crear variaciones desde /admin/products.
- Editar variaciones.
- Guardar foto por variación.
- Guardar precio/costo/stock por variación.
- Mostrar variaciones en la tienda pública.
- Seleccionar variación antes de agregar al carrito.
- Cambiar precio, imagen y disponibilidad según la variación seleccionada.
- Guardar la variación seleccionada en carrito, checkout y order_items.
- Mostrar la variación en la tarjeta de orden del panel admin.
- Mostrar la variación dentro de Productos de la orden.
- Evitar que el producto padre oculte la variación vendida.
```

---

#### 21.22.2. Vistas públicas de variaciones

Se agregó el campo:

```txt
products.variation_view
```

Tipo recomendado:

```txt
Select
```

Opciones:

```txt
buttons
Tipo visual: Botones

```

```txt
dropdown
Tipo visual: Desplegable
```

```txt
checkbox
Tipo visual: Checkbox fijo / lista fija seleccionable
```

Regla:

```txt
El campo pertenece al producto padre.
Cada producto decide cómo se ven sus variaciones en la tienda pública.
```

Uso recomendado:

```txt
buttons  → pocas variaciones, por ejemplo Chocolate / Vainilla / Fresa.
dropdown → muchas variaciones o lista larga.
checkbox → lista fija visible, pero seleccionando una sola opción.
```

---

#### 21.22.3. `track_stock` seguro

Se cerró la lógica de productos con y sin inventario descontable.

Campo usado:

```txt
products.track_stock
```

Reglas finales:

```txt
track_stock = true
→ El producto controla inventario.
→ Si no tiene variaciones, usa products.stock.
→ Si tiene variaciones, usa product_variations.stock.
→ Al confirmar orden, descuenta inventario.
→ Al cancelar o volver a pendiente, restaura inventario.
```

```txt
track_stock = false
→ El producto no controla inventario.
→ No aparece agotado por tener stock 0.
→ Se puede agregar al carrito.
→ Se puede aumentar cantidad sin límite de stock.
→ Checkout no bloquea por stock.
→ Al confirmar orden, NO descuenta inventario.
→ Al cancelar o volver a pendiente, NO restaura inventario.
```

Regla para variaciones:

```txt
Si el producto padre tiene track_stock = false, sus variaciones tampoco deben exigir stock real ni descontar inventario.
```

---

#### 21.22.4. Ajustes de carrito y checkout

Se corrigió la tienda pública para que productos y variaciones respeten `track_stock`.

Quedó definido:

```txt
- Producto sin stock descontable no muestra aviso interno en carrito.
- No aparece el texto: Disponible. Este producto no descuenta inventario.
- El cliente no ve información técnica de inventario.
- El carrito guarda variation_id y variation_label cuando aplica.
- El checkout crea order_items con la variación correcta.
- WhatsApp debe mostrar la variación seleccionada cuando exista.
```

---

#### 21.22.5. Panel admin de órdenes con variaciones

Se corrigió el panel admin para que no muestre solo el producto padre cuando la orden incluye una variación.

Regla final:

```txt
Si una línea de orden tiene variación, debe mostrarse como:
Producto padre — Variación
```

Ejemplo:

```txt
Whey Body Fortress — Chocolate
```

Debe verse en:

```txt
- Tarjeta/resumen de orden.
- Productos de la orden.
- Copia o resumen de WhatsApp generado desde admin.
```

---

#### 21.22.6. Creación de productos corregida

Se corrigió el caso donde no se podía crear un producto nuevo con:

```txt
Descontar stock en órdenes = activado
```

Problema detectado:

```txt
Crear producto nuevo con track_stock = true fallaba.
Crear sin stock descontable sí funcionaba.
Después de creado, activar track_stock y guardar stock también funcionaba.
```

Solución aplicada:

```txt
El formulario de productos ya permite crear directamente productos con stock descontable.
```

Regla final:

```txt
Crear producto nuevo con nombre + precio + stock + track_stock=true debe funcionar sin pasos manuales adicionales.
```

---

#### 21.22.7. Prevención de productos repetidos

Se agregó prevención visual para productos repetidos.

Regla:

```txt
No debe permitirse crear un producto con el mismo nombre de otro producto existente.
No debe permitirse repetir la misma referencia interna si ya existe.
```

Al detectar duplicado, el panel debe mostrar una alerta flotante:

```txt
Producto repetido
```

La alerta debe ser visual, tipo botón/píldora flotante, no `alert()` del navegador.

---

#### 21.22.8. Buscador por referencia interna

Se amplió el buscador del panel de productos.

Ahora debe buscar por:

```txt
- Nombre del producto.
- Referencia interna.
- Slug.
- Categoría.
- Subcategoría.
```

Regla:

```txt
La referencia interna sirve para encontrar rápido productos administrativos aunque el cliente no la vea.
```

---

#### 21.22.9. Ajustes visuales finales del admin de productos

Se ajustaron detalles visuales del admin de productos.

Cambios cerrados:

```txt
- Botón Marcar agotado con estilo similar a Borrar.
- Confirmación visual integrada en tarjeta, evitando popup del navegador.
- Botón Usar variaciones oculto al crear producto nuevo.
- Usar variaciones visible solo al editar un producto existente.
```

Regla final para creación de producto:

```txt
Al crear producto nuevo, no debe aparecer Usar variaciones desde el inicio.
Después de guardar, el sistema puede preguntar si desea agregar variaciones.
```

---

#### 21.22.10. Archivos principales relacionados con este cierre

Archivos trabajados o relacionados durante el bloque:

```txt
frontend-powerzona/src/pages/admin/products.astro
frontend-powerzona/src/pages/admin/orders.astro
frontend-powerzona/src/pages/producto/[slug].astro
frontend-powerzona/src/components/ProductCard.astro
frontend-powerzona/src/components/Cart.astro
frontend-powerzona/src/pages/checkout.astro
frontend-powerzona/src/pages/index.astro
frontend-powerzona/src/lib/api.ts
backend-powerzona/pb_migrations/*variation_view*.js
backend-powerzona/pb_migrations/*order_items_history*.js
```

Nota:

```txt
El source debe actualizarse antes de iniciar el próximo bloque para conservar todos los fixes probados.
```

---

### 21.23. Próximo bloque definido: Ajustes de la tienda

Este bloque se agrega como actualización acumulativa para continuar el proyecto en una conversación nueva.

Estado:

```txt
🔜 PRÓXIMO BLOQUE RECOMENDADO
```

Nombre del bloque:

```txt
Ajustes de la tienda
```

Objetivo general:

```txt
Crear una nueva área del panel admin para configurar contenido y apariencia de la tienda pública sin mezclarlo con Gestión de catálogo.
```

Motivo:

```txt
Gestión de catálogo administra productos, categorías, subcategorías, stock y variaciones.
Ajustes de la tienda organiza lo que el cliente ve en la portada, accesos rápidos, datos generales, imagen pública del negocio y monedas.
```

---

#### 21.23.1. Estructura propuesta del panel lateral

El panel lateral puede incluir una nueva sección:

```txt
Ajustes generales
```

Dentro de esa sección se trabajará:

```txt
1. Crear Producto/Promo
2. Organización Visual
3. Otros detalles
4. Monedas
```

Regla:

```txt
Este bloque no reemplaza Gestión del catálogo.
Debe vivir como una zona separada del panel admin.
```

---

#### 21.23.2. Punto 1: Crear Producto/Promo

Objetivo:

```txt
Crear una herramienta rápida para publicar elementos especiales en la tienda pública.
```

Debe permitir definir si será:

```txt
- Producto normal destacado.
- Promo visual.
- Acceso rápido.
```

Diferencia importante:

```txt
Producto destacado
→ Producto real del catálogo.
→ Puede agregarse al carrito.
→ Debe aparecer en una sección pública llamada Productos destacados.
→ Pueden aparecer varios productos destacados.

Promo visual / anuncio
→ Bloque visual de portada.
→ No necesariamente usa carrito.
→ Puede tener botón Contactar por WhatsApp.
→ Sirve para promociones, combos personalizados o mensajes rápidos.

Acceso rápido
→ Botón o tarjeta que lleva a WhatsApp, grupo, enlace externo, descarga o sección interna.
```

---

#### 21.23.3. Sección pública: Productos destacados

Se definió crear una sección visual en la página principal:

```txt
Productos destacados
```

Regla:

```txt
Todo producto marcado como destacado puede aparecer en esta sección.
Debe permitir mostrar varios productos, no solo uno.
```

Objetivo visual:

```txt
Diferenciar productos destacados de anuncios o promos visuales.
```

Ejemplo:

```txt
Productos destacados
- Whey Body Fortress
- Creatina Monohidratada
- Multivitamínico
```

---

#### 21.23.4. Producto/Promo con WhatsApp

Los anuncios o promos visuales pueden usar botón de contacto.

Botón recomendado:

```txt
Contactar por WhatsApp
```

Uso:

```txt
- Promo personalizada.
- Combo a coordinar.
- Producto que requiere consulta.
- Servicio rápido.
- Acceso directo a conversación con PowerZona.
```

Regla:

```txt
Estos bloques no deben confundirse con productos normales del carrito.
```

---

#### 21.23.5. Punto 2: Organización Visual

Objetivo:

```txt
Permitir ordenar la portada de la tienda pública y los elementos visuales principales.
```

Funciones previstas:

```txt
- Ordenar categorías en portada.
- Ordenar productos destacados.
- Organizar productos sin categoría si aplica.
- Ordenar promos visuales.
- Crear botones de WhatsApp/grupo.
- Crear botones de descarga o enlaces.
- Activar/desactivar bloques visibles en home.
```

Ejemplo de organización:

```txt
1. Foto de portada
2. Productos destacados
3. Categorías
4. Promo visual
5. Botón grupo WhatsApp
6. Descarga de archivo o catálogo
```

---

#### 21.23.6. Botones especiales

Dentro de Organización Visual se podrán preparar botones especiales.

Tipos previstos:

```txt
- Botón de WhatsApp para contactar.
- Botón para grupo de WhatsApp.
- Botón para descargar archivo.
- Botón para enlace externo.
- Botón para ir a una categoría o producto.
```

Regla:

```txt
Los botones especiales son parte de la organización visual, no del catálogo de productos.
```

---

#### 21.23.7. Foto de portada e icono del negocio

Se definió incluir en Ajustes de la tienda:

```txt
- Foto de portada de la tienda pública.
- Icono del negocio.
```

Uso:

```txt
Foto de portada
→ Imagen principal o banner visual de la tienda pública.

Icono del negocio
→ Logo/icono usado en header, tarjetas, PWA futura o identidad visual.
```

Regla:

```txt
Estos datos deben configurarse desde el panel admin, no desde código fijo.
```

---

#### 21.23.8. Otros detalles de la tienda

Se definió agregar una sección para datos generales visibles o útiles para el cliente.

Campos previstos:

```txt
- Dirección de la tienda.
- Horarios de atención.
- Texto público de horarios.
- Estado de la tienda si está abierta/cerrada/pausada.
- Mensaje general visible en la tienda pública.
```

Ejemplo:

```txt
Dirección: A coordinar por WhatsApp
Horario: Lunes a sábado, 9:00 a.m. - 6:00 p.m.
Mensaje: Envíos disponibles en La Habana.
```

---

#### 21.23.9. Punto 4: Monedas como división propia

Se definió que Monedas formará parte de Ajustes de la tienda, pero debe tratarse como una división propia dentro del bloque.

Motivo:

```txt
Monedas afecta:
- precios públicos;
- carrito;
- checkout;
- WhatsApp;
- órdenes;
- totales;
- cobro mixto;
- métricas futuras.
```

Objetivo futuro:

```txt
Permitir diferentes monedas visibles y/o formas de pago.
```

Ejemplos:

```txt
USD
CUP
EUR
MLC
Zelle
CashApp
Otra
```

Regla base:

```txt
USD seguirá siendo la moneda base interna.
Las demás monedas deben depender de tasa/configuración y no romper el cálculo principal en USD.
```

---

#### 21.23.10. Orden recomendado para trabajar Ajustes de la tienda

Orden sugerido:

```txt
1. Actualizar source con el cierre de variaciones.
2. Abrir conversación nueva.
3. Crear entrada del menú lateral: Ajustes generales / Ajustes de la tienda.
4. Crear página base del bloque.
5. Trabajar primero Crear Producto/Promo.
6. Crear sección pública Productos destacados.
7. Separar Producto destacado de Promo visual.
8. Después trabajar Organización Visual.
9. Después otros detalles: dirección, horarios, foto de portada e icono.
10. Trabajar Monedas como división propia del bloque.
```

---

#### 21.23.11. Mensaje recomendado para abrir el próximo chat

Mensaje sugerido:

```txt
Ajustes de la tienda - Crear Producto/Promo y Organización Visual. Source actualizado.
```

Primer objetivo del nuevo chat:

```txt
Crear la base de Ajustes de la tienda en el panel lateral y comenzar por Crear Producto/Promo, separando productos destacados de promos visuales con botón de WhatsApp.
```

---

#### 21.23.12. Estado final antes del nuevo chat

Estado:

```txt
✅ Variaciones de productos y stock seguro cerrados de momento.
🔜 Próximo bloque: Ajustes de la tienda.
```

Regla de trabajo:

```txt
Antes de iniciar Ajustes de la tienda, actualizar el source y abrir una conversación nueva para mantener el contexto limpio.
```


---

### 21.24. Bloque cerrado: Ajustes de la tienda — Crear Producto/Promo, Organización Visual y mobile público

Esta sección se agrega como actualización acumulativa sin reemplazar secciones anteriores.

Estado:

```txt
✅ CERRADO
```

Bloque trabajado:

```txt
Ajustes de la tienda - Crear Producto/Promo y Organización Visual
```

Fecha de cierre documental:

```txt
2026-06-03
```

Marca de versión documental:

```txt
PZ-MASTER-AJUSTES-TIENDA-CREAR-PROMO-ORGANIZACION-VISUAL-V7-20260603
```

---

#### 21.24.1. Objetivo del bloque cerrado

El objetivo fue crear una nueva área dentro del panel admin para manejar elementos visuales de la tienda pública sin mezclarlos con la Gestión de catálogo tradicional.

Regla principal:

```txt
Gestión de catálogo administra productos, categorías, subcategorías, stock y variaciones.
Ajustes de la tienda organiza elementos visuales y de portada para el cliente.
```

---

#### 21.24.2. Nueva página de Ajustes de tienda

Se creó la página administrativa:

```txt
/admin/store-settings
```

Archivo principal relacionado:

```txt
frontend-powerzona/src/pages/admin/store-settings.astro
```

Uso:

```txt
- Marcar productos existentes como destacados.
- Ver resumen de productos destacados.
- Crear promos visuales.
- Crear accesos rápidos.
- Ordenar elementos visuales desde Organización Visual.
```

---

#### 21.24.3. Tipos finales de Crear Producto/Promo

Se decidió que la nueva herramienta no usará `normal` como tipo, porque el producto normal ya existe dentro de la gestión de productos.

Tipos aprobados:

```txt
destacado
promo_visual
acceso_rapido
```

Regla:

```txt
Producto normal → se crea y edita desde /admin/products.
Producto destacado → se marca desde Ajustes de tienda usando productos ya existentes.
Promo visual → se crea como tarjeta/anuncio visual.
Acceso rápido → se crea como botón/tarjeta de navegación o enlace.
```

---

#### 21.24.4. Producto destacado

La opción:

```txt
destacado
```

no crea un producto nuevo.

Regla final:

```txt
El administrador selecciona un producto real existente y lo marca como destacado.
```

Comportamiento:

```txt
- Aparece en el panel admin dentro del resumen de productos destacados.
- Aparece en la tienda pública dentro de la sección Productos destacados.
- Puede ordenarse desde Organización Visual.
- Puede quitarse de destacados sin borrar el producto real.
```

---

#### 21.24.5. Promo visual

La opción:

```txt
promo_visual
```

sirve para crear tarjetas o anuncios visuales en la tienda pública.

Uso esperado:

```txt
- Combo especial.
- Oferta limitada.
- Nuevo producto o sabor disponible.
- Promo personalizada para contactar por WhatsApp.
```

Comportamiento:

```txt
- Puede tener imagen.
- Puede tener título.
- Puede tener descripción corta.
- Puede tener botón de WhatsApp o enlace.
- No necesariamente se agrega al carrito.
```

Ajuste visual cerrado:

```txt
En la tienda pública no debe mostrarse la etiqueta técnica "Promo visual".
```

Objetivo:

```txt
El cliente ve una tarjeta limpia, no nombres técnicos internos.
```

---

#### 21.24.6. Acceso rápido

La opción:

```txt
acceso_rapido
```

sirve para crear botones o tarjetas de navegación rápida.

Usos previstos:

```txt
- Grupo de WhatsApp.
- Enlace externo.
- Categoría específica.
- Archivo o descarga.
- Contacto rápido.
```

Comportamiento:

```txt
- Puede tener título.
- Puede tener imagen o icono.
- Puede tener enlace.
- Puede mostrarse en la portada pública.
- Puede ordenarse desde Organización Visual.
```

---

#### 21.24.7. Nueva colección visual recomendada/creada

Para manejar promos visuales y accesos rápidos se creó una colección visual separada del catálogo de productos.

Colección:

```txt
store_visual_items
```

Uso:

```txt
Guardar elementos visuales que no son productos normales de inventario.
```

Tipos usados:

```txt
promo_visual
acceso_rapido
```

Regla:

```txt
Los productos destacados siguen viviendo en products.
Las promos visuales y accesos rápidos viven en store_visual_items.
```

---

#### 21.24.8. Regla pública para productos con categoría

Se corrigió la portada pública para evitar que productos categorizados aparezcan duplicados o fuera de lugar.

Regla final aplicada:

```txt
- Productos con categoría: no salen en la portada principal.
- Productos con categoría + marcado como destacado: salen en Productos destacados.
- Productos sin categoría: siguen saliendo en la portada principal.
- Productos sin categoría + destacado: salen solo en destacados para evitar duplicados.
```

Objetivo:

```txt
Los productos con categoría deben verse dentro de su categoría correspondiente.
Solo los productos destacados pueden saltar a la sección Productos destacados.
```

---

#### 21.24.9. Organización Visual básica

Se implementó Organización Visual dentro de Ajustes de tienda.

Funciones cerradas:

```txt
- Ordenar productos destacados con flechas arriba/abajo.
- Ordenar promos visuales con flechas arriba/abajo.
- Ordenar accesos rápidos con flechas arriba/abajo.
- Mostrar u ocultar promos visuales.
- Mostrar u ocultar accesos rápidos.
- Editar promo/acceso desde Organización Visual.
- Quitar producto de destacados desde Organización Visual.
```

Campo agregado para orden de destacados:

```txt
products.featured_order
```

Regla:

```txt
La tienda pública debe respetar el orden definido en Organización Visual.
```

---

#### 21.24.10. Mobile público ajustado

Se aplicó un ajuste seguro al layout público para mejorar la experiencia en mobile.

Archivo relacionado:

```txt
frontend-powerzona/src/layouts/Layout.astro
```

Regla aplicada:

```txt
No depender solamente de bloquear zoom, porque algunos navegadores modernos pueden ignorar user-scalable=no.
```

Ajustes cerrados:

```txt
- Viewport compatible: width=device-width, initial-scale=1.0, viewport-fit=cover.
- Protección contra scroll horizontal.
- Imágenes, videos y SVG sin salirse del ancho.
- Inputs/select/textarea con tamaño seguro para evitar zoom automático en iPhone.
- Mejor comportamiento táctil en botones y enlaces.
- Aplicado al layout público de la tienda.
```

Regla:

```txt
La tienda pública debe comportarse como una app móvil estable.
El panel admin no necesita bloquear zoom.
```

---

#### 21.24.11. Archivos principales relacionados con este bloque

Archivos trabajados o relacionados:

```txt
frontend-powerzona/src/pages/admin/store-settings.astro
frontend-powerzona/src/pages/index.astro
frontend-powerzona/src/layouts/Layout.astro
frontend-powerzona/src/lib/api.ts
frontend-powerzona/src/pages/admin/index.astro
frontend-powerzona/src/pages/admin/orders.astro
frontend-powerzona/src/pages/admin/catalog.astro
frontend-powerzona/src/pages/admin/products.astro
backend-powerzona/pb_migrations/1780450000_created_store_visual_items.js
backend-powerzona/pb_migrations/1780456000_updated_products_featured_order.js
```

Patches de referencia generados durante el bloque:

```txt
PowerZona_Ajustes_Tienda_Patch_V1_2026_06_02.zip
PowerZona_Ajustes_Tienda_Patch_V1_1_2026_06_02.zip
PowerZona_Ajustes_Tienda_Patch_V1_2_2026_06_02.zip
PowerZona_Mobile_Publico_Patch_V1_2026_06_03.zip
PowerZona_Organizacion_Visual_Patch_V2_2026_06_03.zip
```

---

#### 21.24.12. Pruebas confirmadas por el usuario

El usuario confirmó que funciona correctamente:

```txt
- Crear Producto/Promo.
- Productos destacados.
- Promo visual sin etiqueta técnica pública.
- Acceso rápido.
- Organización Visual básica.
- Ordenar destacados / promos / accesos.
- Mostrar / ocultar promos y accesos.
- Regla pública de productos con categoría.
- Ajuste mobile público.
```

Estado final del bloque:

```txt
✅ CERRADO COMO BASE FUNCIONAL
```

---

### 21.25. Próximo bloque definido: Ajustes generales públicos + menú lateral público

Esta sección se agrega para dejar preparado el próximo chat después de actualizar el source.

Estado:

```txt
🔜 PRÓXIMO BLOQUE RECOMENDADO
```

Nombre recomendado del próximo bloque:

```txt
Ajustes de la tienda - Ajustes generales públicos y menú lateral público
```

---

#### 21.25.1. Ajustes generales públicos

El próximo punto debe permitir configurar desde el panel admin la identidad pública de PowerZona.

Campos a trabajar:

```txt
- Nombre público de la tienda.
- WhatsApp principal.
- Foto de portada / banner.
- Icono o logo del negocio.
- Dirección.
- Horarios.
- Texto corto de bienvenida.
```

Regla:

```txt
Estos datos deben venir desde configuración/admin, no quedar fijos en código.
```

Uso en tienda pública:

```txt
- Header o portada.
- Sección de bienvenida.
- Información visible para el cliente.
- WhatsApp usado para contacto.
- Identidad visual de la tienda.
```

---

#### 21.25.2. Mejorar menú lateral de la tienda pública

Se definió mejorar el menú público de la tienda para mobile.

Objetivo:

```txt
Convertir el menú público en un menú de 3 puntos, limpio y fácil de usar desde el teléfono.
```

Botones iniciales aprobados por el usuario:

```txt
- Categoría.
- Productos destacados.
- Servicios.
- Moneda.
- Horarios.
- Reseña.
```

Nota:

```txt
Por el momento estos serán los botones iniciales del menú público.
Más adelante se podrán agregar otros accesos como grupo de WhatsApp, descargas, cupones o app/PWA.
```

---

#### 21.25.3. Recomendación técnica para el próximo bloque

Orden recomendado:

```txt
1. Revisar el source actualizado.
2. Revisar la colección settings actual.
3. Confirmar qué campos ya existen.
4. Crear migración segura solo para campos faltantes.
5. Agregar sección Ajustes generales dentro de /admin/store-settings.
6. Guardar nombre público, WhatsApp, banner, logo, dirección, horarios y bienvenida.
7. Mostrar esos datos en la tienda pública.
8. Crear el menú público de 3 puntos.
9. Agregar los botones iniciales: Categoría, Productos destacados, Servicios, Moneda, Horarios y Reseña.
```

Regla importante:

```txt
No tocar todavía Monedas como lógica completa de conversión.
En este próximo bloque, el botón Moneda puede quedar preparado visualmente o conectado de forma básica si ya existe información suficiente.
```

---

#### 21.25.4. Mensaje recomendado para abrir el próximo chat

Mensaje sugerido:

```txt
Continuamos PowerZona desde el bloque Ajustes de la tienda - Ajustes generales públicos y menú lateral público. Source actualizado. Ya funciona Crear Producto/Promo, Organización Visual y mobile público.
```

Objetivo del nuevo chat:

```txt
Configurar nombre público, WhatsApp, banner, logo, dirección, horarios, texto corto de bienvenida y mejorar el menú público mobile con 3 puntos.
```


---

### 21.26. Bloque cerrado: Ajustes generales públicos, menú público de 3 puntos y búsqueda pública automática

Esta sección se agrega como actualización acumulativa sin reemplazar secciones anteriores.

Estado:

```txt
✅ CERRADO COMO BASE FUNCIONAL
```

Bloque trabajado:

```txt
Ajustes de la tienda - Ajustes generales públicos y menú lateral público
```

Fecha de cierre documental:

```txt
2026-06-03
```

Marca de versión documental:

```txt
PZ-MASTER-AJUSTES-GENERALES-PUBLICOS-MENU-BUSQUEDA-V8-20260603
```

---

#### 21.26.1. Objetivo del bloque cerrado

El objetivo fue completar la identidad pública básica de PowerZona y mejorar la navegación mobile/pública sin mezclar estos ajustes con Gestión de catálogo.

Regla principal:

```txt
Ajustes de tienda configura identidad, portada, textos públicos, accesos y navegación.
Gestión de catálogo administra productos, categorías, subcategorías, stock y variaciones.
```

---

#### 21.26.2. Ajustes generales públicos agregados

Se agregó dentro de `/admin/store-settings` una sección/pestaña de Ajustes generales.

Campos trabajados:

```txt
- Nombre público de la tienda.
- WhatsApp principal.
- Foto de portada / banner.
- Icono o logo del negocio.
- Dirección.
- Horarios.
- Texto corto de bienvenida.
- Texto de servicios.
- Texto de reseña.
```

Regla:

```txt
Estos datos deben venir desde `settings` y no quedar fijos en código.
```

Uso público:

```txt
- Header o zona superior de la portada.
- Identidad visual de la tienda.
- Botón de contacto por WhatsApp.
- Secciones informativas de servicios, horarios y reseña.
```

---

#### 21.26.3. Migración de settings para datos públicos

Se preparó una migración segura para ampliar la colección:

```txt
settings
```

Campos públicos previstos/agregados:

```txt
store_name
whatsapp_number
cover_image
logo_image
address
business_hours
welcome_text
public_services_text
reviews_text
active
```

Regla futura:

```txt
Antes de crear campos nuevos por migración, revisar si el source actual ya los trae para evitar duplicados.
```

---

#### 21.26.4. Menú público de 3 puntos

Se implementó el menú público de 3 puntos para la tienda.

Regla visual final:

```txt
El botón de 3 puntos debe estar arriba de la portada, junto a la lupa/buscador y al lado del icono/logo de la tienda.
```

Botones iniciales del menú público:

```txt
- Categorías.
- Productos destacados.
- Servicios.
- Moneda.
- Horarios.
- Reseña.
- WhatsApp.
```

Comportamiento:

```txt
- El botón abre un panel lateral público.
- El panel usa los datos públicos de la tienda.
- Los botones pueden hacer scroll a secciones internas o preparar navegación futura.
- Moneda queda preparado visualmente, sin implementar todavía conversión completa.
```

---

#### 21.26.5. Limpieza de textos públicos no deseados

Durante el bloque se limpiaron textos que no debían quedar visibles al cliente.

Textos eliminados o corregidos:

```txt
- “Llévate 2 y obtén envío gratis...”
- Menú público viejo con “PowerZona / Menú Principal”.
- “Tienda pública” en la web pública.
- “Menú de la tienda”.
- “Buscar en la tienda”.
```

Regla final:

```txt
La web pública no debe mostrar textos técnicos o de estructura interna.
```

---

#### 21.26.6. Limpieza general de “Tienda pública” en admin

También se corrigió el texto:

```txt
Tienda pública
```

en zonas generales del panel admin donde no se quería seguir mostrando.

Archivos relacionados:

```txt
frontend-powerzona/src/pages/admin/catalog.astro
frontend-powerzona/src/pages/admin/products.astro
frontend-powerzona/src/pages/admin/store-settings.astro
```

Regla de trabajo:

```txt
Cuando se pida quitar un texto “general”, revisar tanto la web pública como el panel admin si el texto aparece en ambos lados.
```

---

#### 21.26.7. Lupa de búsqueda en lugar de buscador largo

Se quitó el buscador largo del header público.

Regla final:

```txt
La zona superior de la tienda debe quedar limpia:
logo/icono + nombre de tienda + lupa + 3 puntos.
```

Comportamiento de la lupa:

```txt
Al tocar la lupa, abre una página separada de búsqueda:
```

```txt
/buscar
```

---

#### 21.26.8. Página pública de búsqueda `/buscar`

Se creó la página:

```txt
/buscar
```

Objetivo:

```txt
Permitir al cliente buscar productos, categorías, subcategorías y contenido relacionado sin cargar el catálogo completo al abrir.
```

Reglas finales:

```txt
- Al abrir `/buscar`, no debe aparecer el catálogo completo.
- Debe mostrar búsquedas recientes si existen en el dispositivo del cliente.
- Si no hay búsquedas recientes, mostrar un mensaje simple.
- Debe buscar automáticamente mientras el cliente escribe.
- Debe guardar búsquedas recientes en el navegador del cliente.
```

La búsqueda debe encontrar:

```txt
- Productos.
- Categorías.
- Subcategorías.
- Descripción o texto relacionado de productos.
```

---

#### 21.26.9. Categorías/subcategorías públicas en estado transitorio

Se corrigió inicialmente que las categorías y subcategorías de la página pública fueran interactivas.

Estado actual:

```txt
🟡 Funciona como base, pero se decidió mejorar en el próximo bloque.
```

Cambio de decisión posterior:

```txt
Las categorías y subcategorías ya no deben abrir contenido dentro de la misma página principal.
Deben abrir páginas propias.
```

Por eso este comportamiento queda como transición y será reemplazado/mejorado en el siguiente bloque.

---

#### 21.26.10. Archivos principales relacionados con este bloque

Archivos trabajados o relacionados:

```txt
frontend-powerzona/src/pages/admin/store-settings.astro
frontend-powerzona/src/pages/admin/catalog.astro
frontend-powerzona/src/pages/admin/products.astro
frontend-powerzona/src/pages/index.astro
frontend-powerzona/src/pages/buscar.astro
frontend-powerzona/src/layouts/Layout.astro
frontend-powerzona/src/lib/api.ts
backend-powerzona/pb_migrations/1780459000_updated_settings_public_general_fields.js
```

Patches/versiones de referencia generados durante el bloque:

```txt
PowerZona_Ajustes_Generales_Publicos_Menu_Publico_V1_2026_06_03.zip
PowerZona_Ajustes_Generales_Publicos_Menu_Publico_V2_2026_06_03.zip
PowerZona_Ajustes_Generales_Publicos_Menu_Publico_V3_2026_06_03.zip
PowerZona_Ajustes_Generales_Publicos_Menu_Publico_V4_2026_06_03.zip
PowerZona_Ajustes_Generales_Publicos_Menu_Publico_V5_2026_06_03.zip
PowerZona_Ajustes_Generales_Publicos_Menu_Publico_V6_2026_06_03.zip
PowerZona_Busqueda_Automatica_Categorias_Publicas_V7_2026_06_03.zip
```

---

#### 21.26.11. Regla confirmada para ZIPs entregados

Se confirmó una regla de trabajo importante para próximas entregas.

Regla:

```txt
Cuando se entregue un ZIP para PowerZona:
- El ZIP debe contener únicamente los archivos que el usuario debe cambiar.
- No debe incluir el source completo si no es necesario.
- Debajo del enlace de descarga se deben escribir claramente las rutas exactas donde reemplazar cada archivo.
```

Objetivo:

```txt
Evitar confusión, reemplazos innecesarios y enlaces incorrectos.
```

---

#### 21.26.12. Estado final del bloque

Estado:

```txt
✅ CERRADO COMO BASE FUNCIONAL
```

Resumen:

```txt
- Ajustes generales públicos agregados.
- Settings ampliado para identidad pública.
- Portada pública usa datos configurables.
- Menú público de 3 puntos implementado.
- Lupa reemplaza buscador largo.
- Página `/buscar` creada.
- Búsqueda automática mientras el cliente escribe.
- Búsquedas recientes por navegador.
- Limpieza de textos no deseados.
- “Tienda pública” eliminado de web pública y zonas admin indicadas.
- Categorías/subcategorías quedaron interactivas como base, pero el flujo se mejorará en el siguiente bloque.
```

---

### 21.27. Próximo bloque definido: Experiencia pública de categorías/subcategorías en páginas propias

Esta sección se agrega como preparación del siguiente bloque.

Estado:

```txt
🔜 PRÓXIMO BLOQUE RECOMENDADO
```

Nombre recomendado del próximo bloque:

```txt
Tienda pública - Categorías y subcategorías en páginas propias
```

---

#### 21.27.1. Motivo del próximo bloque

Después de probar la interacción pública inicial, se decidió que la experiencia debe ser más profesional.

Problema actual o mejora deseada:

```txt
Cuando el cliente toca una categoría/subcategoría, no debe abrirse dentro de la misma página principal.
Debe abrir una página propia para navegar y comprar mejor.
```

Objetivo:

```txt
Separar la portada pública de la navegación interna por categoría/subcategoría.
La portada queda limpia y las páginas internas quedan enfocadas en compra.
```

---

#### 21.27.2. Categorías en páginas propias

Cuando el cliente toque una categoría desde la portada o búsqueda, debe abrirse una página propia.

Ruta recomendada:

```txt
/categoria/[slug]
```

Ejemplo:

```txt
/categoria/proteinas
```

Contenido de la página:

```txt
- Portada o encabezado visual de la categoría.
- Imagen grande de la categoría.
- Nombre de la categoría.
- Subcategorías relacionadas si existen.
- Productos directos de esa categoría.
```

---

#### 21.27.3. Subcategorías en páginas propias

Cuando el cliente toque una subcategoría, debe abrir una página propia.

Ruta recomendada:

```txt
/subcategoria/[slug]
```

O, si se prefiere estructura jerárquica:

```txt
/categoria/[categorySlug]/[subcategorySlug]
```

Ejemplo:

```txt
/subcategoria/whey-protein
```

Contenido:

```txt
- Encabezado visual de la subcategoría.
- Imagen de subcategoría si existe.
- Nombre de subcategoría.
- Productos de esa subcategoría.
- Botón para volver a la categoría padre.
```

---

#### 21.27.4. Portada pública: categorías con más presencia

Se decidió que las categorías deben tener más presencia visual que los productos destacados.

Regla visual final para portada:

```txt
Categorías en portada > más visuales e importantes.
Productos destacados en portada > compactos.
Productos dentro de categoría/subcategoría > orientados a compra.
```

Categorías en portada:

```txt
- Tarjetas más grandes que productos destacados.
- Imagen más visible.
- Nombre grande.
- Diseño tipo bloque principal.
- En PC: 2 por fila.
- En mobile: preferiblemente 2 por fila si se ve bien; si no, evaluar 1 por fila.
```

---

#### 21.27.5. Productos destacados más compactos

Los productos destacados no deben competir visualmente con las categorías.

Regla:

```txt
En la portada, los productos destacados deben ser más pequeños que las categorías.
```

Opciones de vista a evaluar:

##### Opción A: Carrusel

```txt
Mobile: carrusel horizontal.
PC: carrusel o grid compacto.
```

Ventajas:

```txt
- Moderno.
- Ocupa poco espacio.
- Ideal para destacar productos sin llenar la portada.
```

##### Opción B: Grid compacto

```txt
Mobile: 1 por fila o 2 por fila.
PC: 2 o 3 por fila.
```

Recomendación inicial:

```txt
Mobile: carrusel horizontal para destacados.
PC: grid compacto de 2 o 3 por fila.
```

---

#### 21.27.6. Productos dentro de categoría y subcategoría

Los productos dentro de páginas de categoría/subcategoría deben estar optimizados para compra.

Regla visual:

```txt
- 2 productos por fila en PC.
- 2 productos por fila en mobile.
- Tarjetas más grandes que los destacados de portada.
- Botón moderno Comprar.
```

Botón:

```txt
Comprar
```

Comportamiento:

```txt
El botón Comprar abre la página del producto.
```

Regla:

```txt
No agregar directamente al carrito desde este botón hasta decidir si se quiere conservar flujo por página de producto.
```

---

#### 21.27.7. Búsqueda conectada con nuevas rutas

La página `/buscar` debe adaptarse al nuevo flujo.

Regla:

```txt
- Resultado de producto → abre /producto/[slug].
- Resultado de categoría → abre /categoria/[slug].
- Resultado de subcategoría → abre /subcategoria/[slug] o ruta jerárquica definida.
```

Esto evita volver al comportamiento de abrir contenido dentro de la portada principal.

---

#### 21.27.8. Archivos esperados para el próximo bloque

Archivos probablemente necesarios:

```txt
frontend-powerzona/src/pages/index.astro
frontend-powerzona/src/pages/buscar.astro
frontend-powerzona/src/pages/categoria/[slug].astro
frontend-powerzona/src/pages/subcategoria/[slug].astro
frontend-powerzona/src/lib/api.ts
```

Posibles componentes futuros:

```txt
frontend-powerzona/src/components/PublicCategoryCard.astro
frontend-powerzona/src/components/PublicProductCompactCard.astro
frontend-powerzona/src/components/PublicProductBuyCard.astro
```

Regla de entrega:

```txt
El ZIP del próximo bloque debe incluir solo los archivos modificados o nuevos que el usuario debe reemplazar.
```

---

#### 21.27.9. Orden recomendado para trabajar el próximo bloque

Orden sugerido:

```txt
1. Revisar source actualizado después de V7.
2. Crear página /categoria/[slug].
3. Crear página /subcategoria/[slug] o decidir ruta jerárquica.
4. Ajustar portada: categorías más grandes y productos destacados compactos.
5. Ajustar productos dentro de categoría/subcategoría a 2 por fila.
6. Agregar botón Comprar.
7. Ajustar /buscar para apuntar a las nuevas rutas.
8. Probar en mobile y PC.
```

---

#### 21.27.10. Mensaje recomendado para abrir el próximo chat

Mensaje sugerido:

```txt
Continuamos PowerZona desde el bloque Tienda pública - Categorías y subcategorías en páginas propias. Source actualizado con Ajustes generales públicos, menú público de 3 puntos y búsqueda automática funcionando.
```

Objetivo del nuevo chat:

```txt
Hacer que las categorías y subcategorías abran páginas propias, mejorar la presencia visual de categorías en portada, compactar productos destacados y preparar productos por categoría/subcategoría con botón Comprar.
```

---

#### 21.27.11. Estado final antes del nuevo chat

Estado:

```txt
✅ Ajustes generales públicos + menú público + búsqueda pública cerrados como base funcional.
🔜 Próximo bloque: categorías/subcategorías públicas en páginas propias.
```

Regla de trabajo:

```txt
Antes de iniciar el próximo bloque, actualizar el source con la última versión funcional y abrir una conversación nueva para mantener el contexto limpio.
```

---

### 21.28. Bloque cerrado de momento: Experiencia pública de categorías/subcategorías en páginas propias y ajustes visuales de portada

Esta sección se agrega como actualización acumulativa sin reemplazar las secciones anteriores.

Estado:

```txt
✅ IMPLEMENTADO / PENDIENTE SOLO DE PRUEBA FINAL DEL USUARIO
```

Bloque trabajado:

```txt
Tienda pública - Categorías y subcategorías en páginas propias + ajustes visuales de portada
```

Fecha de cierre documental:

```txt
2026-06-03
```

Marca de versión documental:

```txt
PZ-MASTER-AJUSTES-VISUALES-PUBLICOS-V9-20260603
```

---

#### 21.28.1. Objetivo del bloque

El objetivo fue mejorar la experiencia pública del cliente separando la portada principal de la navegación interna por categorías y subcategorías.

Regla principal:

```txt
La portada debe funcionar como entrada visual de la tienda.
Las categorías y subcategorías deben abrir páginas propias enfocadas en compra.
```

---

#### 21.28.2. Páginas nuevas creadas

Se agregaron páginas públicas nuevas:

```txt
frontend-powerzona/src/pages/categoria/[slug].astro
frontend-powerzona/src/pages/subcategoria/[slug].astro
```

Rutas públicas:

```txt
/categoria/[slug]
/subcategoria/[slug]
```

Ejemplos:

```txt
/categoria/proteinas
/subcategoria/whey-protein
```

Regla:

```txt
El archivo debe llamarse exactamente [slug].astro con corchetes incluidos.
```

---

#### 21.28.3. Portada pública ajustada

La portada pública quedó enfocada en identidad visual y navegación rápida.

Cambios cerrados:

```txt
- Categorías con más presencia visual que productos destacados.
- Productos destacados más compactos.
- Botón WhatsApp colocado justo debajo de la portada.
- Botón Ver categorías colocado junto al botón WhatsApp.
- Promociones sin texto técnico debajo.
- Portada sin descripciones innecesarias.
```

Textos eliminados:

```txt
Toca una categoría para verla en su propia página.
También abren en una página separada.
Vista amplia de categoría: 2 por fila en PC y 2 por fila en móvil.
Vista compacta tipo carrusel para no competir con categorías.
Accesos visuales y ofertas del negocio.
```

---

#### 21.28.4. Categorías visuales en portada

Se ajustó la vista de categorías para que tengan más fuerza visual.

Regla final:

```txt
El nombre de la categoría debe estar justo arriba de la tarjeta, fuera de la imagen/tarjeta.
```

Comportamiento visual:

```txt
Nombre de la categoría
[ Tarjeta visual con imagen de categoría ]
```

La tarjeta queda reservada para:

```txt
- Imagen de categoría.
- Indicador visual.
- Acceso a la página propia de la categoría.
```

---

#### 21.28.5. Productos destacados compactos

Los productos destacados de la portada no deben competir con las categorías.

Regla:

```txt
Productos destacados en portada = vista compacta.
Categorías en portada = vista principal y más visual.
```

Vista aplicada:

```txt
- Tipo carrusel / fila horizontal compacta.
- Tarjetas más pequeñas que las tarjetas de categoría.
- Enfocadas en mostrar productos importantes sin cargar la portada.
```

---

#### 21.28.6. Productos dentro de categoría/subcategoría

En las páginas internas, los productos quedan orientados a compra.

Reglas:

```txt
- 2 productos por fila en PC.
- 2 productos por fila en mobile.
- Tarjetas más grandes que los destacados de portada.
- Botón moderno Comprar.
```

Comportamiento del botón:

```txt
Comprar → abre la página del producto.
```

Regla actual:

```txt
No agregar directamente al carrito desde la tarjeta de categoría/subcategoría.
El cliente entra primero al producto para revisar detalles o variaciones.
```

---

#### 21.28.7. Búsqueda conectada con páginas propias

La búsqueda pública debe mantenerse conectada al nuevo flujo.

Reglas:

```txt
Resultado de producto → /producto/[slug]
Resultado de categoría → /categoria/[slug]
Resultado de subcategoría → /subcategoria/[slug]
```

Objetivo:

```txt
Evitar que la búsqueda vuelva a abrir contenido dentro de la portada principal.
```

---

#### 21.28.8. Archivos relacionados con este bloque

Archivos modificados o agregados durante las versiones visuales:

```txt
frontend-powerzona/src/pages/index.astro
frontend-powerzona/src/pages/buscar.astro
frontend-powerzona/src/components/ProductCard.astro
frontend-powerzona/src/pages/categoria/[slug].astro
frontend-powerzona/src/pages/subcategoria/[slug].astro
```

Versiones de referencia entregadas:

```txt
powerzona_ajustes_visuales_v21_2026_06_03.zip
powerzona_ajustes_visuales_v22_2026_06_03.zip
powerzona_ajustes_visuales_v23_2026_06_03.zip
powerzona_ajustes_visuales_v24_2026_06_03.zip
```

Regla confirmada para ZIPs:

```txt
El ZIP debe contener únicamente los archivos que se deben cambiar.
Debajo del enlace de descarga se deben escribir las rutas exactas donde reemplazar o crear cada archivo.
```

---

#### 21.28.9. Estado del bloque visual

Estado:

```txt
✅ IMPLEMENTADO COMO BASE FUNCIONAL
🟡 PENDIENTE DE PRUEBA FINAL EN PC DEL USUARIO
```

Checklist de prueba:

```txt
- Portada abre correctamente.
- WhatsApp aparece debajo de portada junto a Ver categorías.
- Categorías se ven grandes y con nombre arriba fuera de la tarjeta.
- Promociones no muestran texto debajo.
- Productos destacados se ven compactos.
- /categoria/[slug] abre correctamente.
- /subcategoria/[slug] abre correctamente.
- Productos internos se ven 2 por fila.
- Botón Comprar abre producto.
- Buscar abre resultados hacia rutas correctas.
```

---

#### 21.28.10. Orden recomendado actualizado para continuar desde paso 1

Orden aprobado para seguir el proyecto:

```txt
1. Cerrar Ajustes visuales de tienda pública.
2. Buscador público.
3. Monedas.
4. Producto individual.
5. Carrito / checkout visual.
6. Panel admin relacionado con tienda pública y ajustes generales.
7. Regalos.
```

---

#### 21.28.11. Paso 1: Cerrar Ajustes visuales de tienda pública

Antes de comenzar otro bloque, probar y confirmar:

```txt
- Portada.
- Categorías.
- Subcategorías.
- Productos destacados.
- Promociones.
- Botones debajo de portada.
- Rutas nuevas.
- Vista mobile y PC.
```

Si todo funciona correctamente, el paso 1 queda cerrado.

Mensaje sugerido si se necesita corregir algo visual:

```txt
Ajustes visuales tienda pública continuación - Source actualizado
```

---

#### 21.28.12. Paso 2: Buscador público

Después de cerrar el paso 1, el siguiente bloque recomendado es:

```txt
Buscador público tienda PowerZona
```

Objetivo:

```txt
- Al abrir /buscar, no mostrar catálogo completo.
- Mostrar búsquedas recientes del cliente.
- Si no hay recientes, mostrar mensaje simple.
- Al escribir, mostrar resultados automáticamente.
- Mejorar visual mobile del buscador.
- Mantener rutas nuevas para productos, categorías y subcategorías.
```

Mensaje sugerido para nuevo chat:

```txt
Buscador público tienda PowerZona - Source actualizado
```

---

#### 21.28.13. Paso 3: Monedas

Después del Buscador público, comenzar Monedas como bloque propio.

Motivo:

```txt
Monedas afecta muchas partes del sistema y no conviene dejarlo para después de modificar carrito/checkout profundo.
```

Afecta:

```txt
- Productos destacados.
- Categorías.
- Subcategorías.
- Producto individual.
- Carrito.
- Checkout.
- WhatsApp.
- Admin productos.
- Admin órdenes.
- Reportes futuros.
```

Fase inicial recomendada:

```txt
- USD como moneda base interna.
- Admin configura monedas activas.
- Admin configura tasa de cambio.
- Cliente elige moneda visual.
- Precios se muestran convertidos visualmente.
- Carrito y checkout mantienen cálculo real en USD.
```

Fase posterior:

```txt
- WhatsApp muestra total USD y moneda elegida.
- Orden guarda moneda seleccionada.
- Orden guarda tasa usada.
- Admin ve reportes en USD como base.
```

Mensaje sugerido para nuevo chat:

```txt
Monedas tienda pública - Source actualizado
```

---

#### 21.28.14. Paso 4: Producto individual

Después de Monedas, ajustar la página individual del producto.

Objetivo:

```txt
- Mejor vista de fotos.
- Mejor selector de variaciones.
- Precio según moneda visual.
- Botón Comprar / Agregar al carrito.
- Mejor experiencia mobile.
```

---

#### 21.28.15. Paso 5: Carrito / checkout visual

Después de Producto individual, ajustar carrito y checkout visual.

Objetivo:

```txt
- Visual del carrito.
- Cantidades + y -.
- Total en USD y moneda visual.
- Envío en USD.
- Checkout más limpio.
- WhatsApp final más profesional.
```

---

#### 21.28.16. Paso 6: Panel admin relacionado con tienda pública

Después de tienda pública, continuar con ajustes admin relacionados.

Objetivo:

```txt
- Ajustes generales del negocio.
- Nombre público.
- WhatsApp principal.
- Logo.
- Banner.
- Dirección.
- Horarios.
- Texto de bienvenida.
- Monedas desde admin.
```

---

#### 21.28.17. Paso 7: Regalos

Regalos queda después de moneda y checkout.

Objetivo:

```txt
- Producto de regalo con precio 0.
- Condición por total de compra.
- Condición por productos específicos.
- Botón “Tu compra califica para regalos”.
- Categoría Regalos.
- Un regalo por orden.
- Admin puede agregar regalo manualmente.
```

Regla:

```txt
No iniciar Regalos antes de cerrar Monedas y Checkout visual, porque regalos afecta totales, carrito, WhatsApp e inventario.
```

---

#### 21.28.18. Estado final actualizado

Estado actual del proyecto después de esta actualización documental:

```txt
✅ Ajustes generales públicos cerrados.
✅ Menú público de 3 puntos cerrado.
✅ Búsqueda pública automática cerrada como base.
✅ Categorías/subcategorías en páginas propias implementadas.
✅ Ajustes visuales de portada implementados.
🔜 Paso 1 inmediato: probar y cerrar ajustes visuales de tienda pública.
🔜 Después: Buscador público.
🔜 Después: Monedas.
```

---

### 21.29. Bloque definido para continuar: Monedas tienda pública

Esta sección queda como planificación histórica previa al cierre del bloque de moneda. La actualización final cerrada está en la sección 21.31.

Estado:

```txt
✅ PLANIFICADO Y LUEGO CERRADO COMO BASE FUNCIONAL
```

Nombre del bloque:

```txt
Monedas tienda pública
```

Fecha de actualización documental:

```txt
2026-06-04
```

Marca de versión documental:

```txt
PZ-MASTER-MONEDAS-BLOQUE-A-TRABAJAR-V10-20260604
```

---

#### 21.29.1. Objetivo del bloque de moneda

El objetivo es permitir que el cliente vea la tienda en una moneda visual elegida, sin cambiar la lógica real del negocio.

Regla principal:

```txt
USD sigue siendo la moneda base real.
```

Esto significa:

```txt
- Los precios reales se guardan en USD.
- El carrito mantiene el total real en USD.
- El checkout mantiene el total real en USD.
- Los reportes administrativos se calculan en USD.
- Las conversiones son visuales o informativas para el cliente.
```

---

#### 21.29.2. Primera parte del bloque

Primera parte aprobada para trabajar:

```txt
- USD sigue siendo moneda base real.
- El admin configura monedas activas.
- El admin configura tasa de cambio.
- El cliente puede elegir moneda visual.
- Los precios se muestran convertidos.
- El carrito y checkout mantienen total real en USD.
```

Regla:

```txt
La moneda elegida por el cliente no debe modificar el precio real guardado en USD.
Solo cambia cómo se muestra el precio en la tienda.
```

---

#### 21.29.3. Segunda parte del bloque

Después de cerrar la primera parte, trabajar:

```txt
- WhatsApp muestra total USD y moneda elegida.
- La orden guarda moneda seleccionada.
- La orden guarda tasa usada.
- Admin ve reportes en USD como base.
```

Regla:

```txt
La tasa usada debe guardarse dentro de la orden para conservar historial.
Si mañana cambia la tasa, la orden vieja debe seguir mostrando la tasa usada cuando se creó.
```

---

#### 21.29.4. Colección recomendada: currencies

La colección actual/recomendada para manejar monedas es:

```txt
currencies
```

Campos recomendados:

```txt
code             → text/select. Ej: USD, CUP, EUR, MLC
name             → text. Ej: Dólar estadounidense, Peso cubano
symbol           → text. Ej: $, CUP, €
exchange_rate    → number. Tasa contra USD
active           → bool
is_default       → bool
sort_order       → number
```

Regla de tasa:

```txt
USD debe tener exchange_rate = 1.
CUP, EUR u otras monedas usan tasa configurada por el admin.
```

Ejemplo:

```txt
USD: exchange_rate = 1
CUP: exchange_rate = 350
EUR: exchange_rate = 0.92
```

Interpretación:

```txt
Precio visual = precio_usd * exchange_rate de la moneda seleccionada
```

---

#### 21.29.5. Admin configura monedas activas

El panel admin debe permitir:

```txt
- Ver monedas existentes.
- Activar/desactivar monedas.
- Editar tasa de cambio.
- Elegir moneda visual por defecto.
- Ordenar monedas visibles.
```

Ubicación recomendada:

```txt
/admin/store-settings
```

Dentro de:

```txt
Ajustes de la tienda → Monedas
```

Regla:

```txt
El admin no debe editar precios de productos en monedas locales.
El admin edita precio real del producto en USD y edita la tasa de cada moneda.
```

---

#### 21.29.6. Selector de moneda para el cliente

El cliente debe poder elegir moneda visual desde la tienda pública.

Ubicaciones recomendadas:

```txt
- Menú público de 3 puntos, botón Moneda.
- Posible selector visible cerca del header si más adelante se desea.
```

Regla:

```txt
La moneda seleccionada se guarda en localStorage del navegador del cliente.
```

Clave sugerida:

```txt
powerzona_currency
```

Comportamiento:

```txt
1. Cliente abre tienda.
2. Sistema usa moneda por defecto si no hay selección guardada.
3. Cliente toca Moneda.
4. Selecciona CUP, USD, EUR u otra activa.
5. Se actualizan precios visuales.
6. La selección queda guardada para próximas visitas.
```

---

#### 21.29.7. Visualización de precios convertidos

Los precios públicos deben mostrar la moneda seleccionada.

Ejemplo si el producto cuesta:

```txt
40.00 USD
```

y el cliente elige CUP con tasa:

```txt
350
```

Visual esperado:

```txt
14,000 CUP
```

Regla recomendada:

```txt
Mientras se prueba el bloque, se puede mostrar también una referencia pequeña:
Base: 40.00 USD
```

Pero la versión pública final debe evitar ruido visual innecesario.

---

#### 21.29.8. Carrito y checkout mantienen USD real

Aunque el cliente vea CUP, EUR u otra moneda, el carrito debe conservar el cálculo real en USD.

Regla:

```txt
Cada item debe mantener:
- unit_price_usd
- line_total_usd
- visual_price_converted
- selected_currency
```

El cálculo real del total debe ser:

```txt
total_usd = suma de line_total_usd + shipping_usd
```

El total visual se calcula aparte:

```txt
visual_total = total_usd * exchange_rate
```

---

#### 21.29.9. Envío dentro del bloque de moneda

Decisión vigente:

```txt
El envío se calcula originalmente en USD.
```

Por tanto:

```txt
shipping_zones.price_usd sigue siendo el valor base real.
```

Si el cliente elige CUP:

```txt
El checkout puede mostrar envío convertido visualmente.
Pero el total real se mantiene en USD.
```

Ejemplo:

```txt
Subtotal: 40.00 USD
Envío: 5.00 USD
Total real: 45.00 USD

Visual CUP:
Subtotal: 14,000 CUP
Envío: 1,750 CUP
Total visual: 15,750 CUP
```

---

#### 21.29.10. WhatsApp con moneda visual del cliente

Actualización posterior: el mensaje de WhatsApp que ve/envía el cliente debe mostrar lo mismo que vio el cliente en checkout. Los datos internos USD y tasa usada quedan guardados para el admin, no como texto principal al cliente.

Ejemplo:

```txt
Total real: $45.00 USD
Total en CUP: 15,750 CUP
Tasa usada: 1 USD = 350 CUP
```

Si el cliente elige USD:

```txt
Total: $45.00 USD
```

Regla actualizada:

```txt
WhatsApp del cliente no debe mostrar datos internos como total real USD o tasa usada como texto principal.
Debe mostrar moneda elegida, productos en moneda visual, productos Solo USD si existen y envío separado como USD / equivalente CUP.
```

---

#### 21.29.11. Orden guarda moneda seleccionada y tasa usada

Campos recomendados en `orders`:

```txt
selected_currency_code
selected_currency_name
selected_currency_symbol
exchange_rate_used
subtotal_usd
shipping_usd
total_usd
subtotal_selected_currency
shipping_selected_currency
total_selected_currency
```

Regla:

```txt
Los campos en USD son la base real.
Los campos de moneda seleccionada son historial visual/informativo.
```

Esto permite:

```txt
- Ver cómo el cliente vio la orden.
- Mantener historial aunque cambie la tasa después.
- Reportar ventas reales en USD.
```

---

#### 21.29.12. Admin ve reportes en USD

Regla administrativa:

```txt
Todos los reportes principales se calculan en USD.
```

Ejemplos:

```txt
Ventas del día: 320.00 USD
Ventas del mes: 2,450.00 USD
Ticket promedio: 48.00 USD
```

La moneda elegida por el cliente puede mostrarse como detalle de la orden, pero no debe reemplazar el cálculo base.

---

#### 21.29.13. Archivos esperados para trabajar moneda

Archivos que probablemente se tocarán:

```txt
frontend-powerzona/src/pages/admin/store-settings.astro
frontend-powerzona/src/pages/index.astro
frontend-powerzona/src/pages/categoria/[slug].astro
frontend-powerzona/src/pages/subcategoria/[slug].astro
frontend-powerzona/src/pages/producto/[slug].astro
frontend-powerzona/src/components/ProductCard.astro
frontend-powerzona/src/components/Cart.astro
frontend-powerzona/src/pages/checkout.astro
frontend-powerzona/src/lib/api.ts
frontend-powerzona/src/layouts/Layout.astro
```

Migraciones posibles:

```txt
backend-powerzona/pb_migrations/*currencies*.js
backend-powerzona/pb_migrations/*orders_currency_fields*.js
```

Regla:

```txt
Primero revisar el source actualizado antes de crear migraciones.
No duplicar campos si ya existen en PocketBase.
```

---

#### 21.29.14. Orden recomendado para implementar Monedas

Orden sugerido:

```txt
1. Revisar la colección currencies existente.
2. Revisar si /admin/store-settings ya tiene sección Monedas o botón preparado.
3. Crear/ajustar panel admin de monedas activas y tasa.
4. Crear helper de conversión en frontend.
5. Guardar moneda visual del cliente en localStorage.
6. Conectar selector de moneda desde menú público de 3 puntos.
7. Mostrar precios convertidos en portada.
8. Mostrar precios convertidos en categoría y subcategoría.
9. Mostrar precio convertido en producto individual.
10. Ajustar carrito para mostrar moneda visual sin perder USD real.
11. Ajustar checkout para mostrar moneda visual sin perder USD real.
12. Segunda parte: WhatsApp + guardar moneda y tasa en orders.
13. Verificar que admin/reportes sigan en USD.
```

---

#### 21.29.15. Pruebas necesarias para cerrar Monedas

Checklist:

```txt
- USD aparece como moneda base.
- Admin puede activar/desactivar monedas.
- Admin puede cambiar tasa.
- Cliente puede elegir moneda visual.
- La elección se conserva al recargar.
- Portada muestra precios convertidos.
- Categoría muestra precios convertidos.
- Subcategoría muestra precios convertidos.
- Producto individual muestra precio convertido.
- Carrito muestra total visual y mantiene total USD.
- Checkout muestra total visual y mantiene total USD.
- Envío se convierte visualmente desde price_usd.
- WhatsApp muestra total USD y moneda elegida.
- Orden guarda moneda seleccionada.
- Orden guarda tasa usada.
- Reportes admin siguen usando USD.
```

---

#### 21.29.16. Mensaje recomendado para abrir el nuevo chat

Mensaje sugerido:

```txt
Moneda Bloque a trabajar - Source actualizado.
USD sigue siendo moneda base real. El admin configura monedas activas y tasa de cambio. El cliente elige moneda visual. Los precios se muestran convertidos, pero carrito y checkout mantienen total real en USD.
```

---

### 21.30. Bloque futuro documentado: Plataforma multitienda + bazar principal

Esta sección documenta la idea hablada sobre convertir PowerZona en una plataforma multitienda administrada por un Master Admin.

Estado:

```txt
💡 FUTURO / NO IMPLEMENTAR TODAVÍA
```

Motivo:

```txt
Es una evolución grande del proyecto.
Conviene terminar primero la tienda individual PowerZona antes de mover toda la arquitectura a multitienda.
```

---

#### 21.30.1. Idea general

El sistema futuro dejaría de ser solo una tienda y pasaría a ser una plataforma tipo bazar.

Estructura conceptual:

```txt
Página principal del bazar
→ muestra tiendas registradas, promociones, anuncios y tendencias.

Tienda individual
→ cada tienda tiene su portada, productos, categorías, checkout y órdenes.

Master Admin
→ crea y administra tiendas.

Admin de tienda
→ administra únicamente su propia tienda.
```

Ejemplo de rutas futuras:

```txt
/
 /tienda/powerzona
 /tienda/otra-tienda
 /admin-master
 /admin-tienda
```

---

#### 21.30.2. Master Admin

El usuario dueño de la plataforma será el Master Admin.

Funciones futuras:

```txt
- Crear tiendas.
- Editar tiendas.
- Activar/desactivar tiendas.
- Asignar dueño/admin de tienda.
- Ver todas las tiendas.
- Destacar tiendas manualmente.
- Marcar tiendas como tendencia manual.
- Crear anuncios generales del bazar.
- Crear promociones generales del bazar.
- Revisar métricas generales.
```

---

#### 21.30.3. Admin de tienda

Cada usuario dueño de una tienda debe ver solo sus datos.

Puede administrar:

```txt
- Productos de su tienda.
- Categorías de su tienda.
- Subcategorías de su tienda.
- Órdenes de su tienda.
- Ajustes públicos de su tienda.
- Promos internas de su tienda.
```

Regla crítica:

```txt
Un admin de tienda no debe ver ni editar datos de otra tienda.
```

Esto requiere reglas fuertes en PocketBase y filtros por tienda.

---

#### 21.30.4. Colección futura `stores`

Colección recomendada:

```txt
stores
```

Campos sugeridos:

```txt
name
slug
owner_user
logo
banner
whatsapp
address
hours
description
is_active
is_featured
is_trending_manual
views_count
created
updated
```

Después, las colecciones principales deben relacionarse con una tienda:

```txt
products.store
categories.store
subcategories.store
orders.store
order_items.store
shipping_zones.store
settings.store
store_visual_items.store
currencies.store
```

---

#### 21.30.5. Página principal tipo bazar

La página principal del bazar podría incluir:

```txt
- Banner principal del bazar.
- Anuncios generales.
- Promociones generales.
- Tiendas destacadas por Master Admin.
- Tiendas en tendencia.
- Tiendas más vistas.
- Todas las tiendas registradas.
- Buscador de tiendas.
- Buscador global de productos.
```

---

#### 21.30.6. Tiendas destacadas y en tendencia

Sistema recomendado:

```txt
Tendencia automática + control manual del Master Admin.
```

Criterios automáticos futuros:

```txt
- Vistas de tienda.
- Pedidos recientes.
- Productos vistos.
- Actividad reciente.
```

Control manual:

```txt
- is_featured
- is_trending_manual
- priority_order
```

Regla:

```txt
El Master Admin siempre debe poder decidir qué tiendas aparecen destacadas.
```

---

#### 21.30.7. Orden recomendado para implementar multitienda en el futuro

No iniciar hasta cerrar tienda individual.

Orden futuro:

```txt
1. Crear colección stores.
2. Crear tienda base PowerZona.
3. Agregar store_id a productos, categorías, subcategorías, órdenes, settings, monedas y visual items.
4. Migrar datos actuales a la tienda PowerZona.
5. Crear roles Master Admin y Admin de tienda.
6. Crear reglas PocketBase por tienda.
7. Crear rutas públicas /tienda/[slug].
8. Crear panel Master Admin.
9. Crear página principal tipo bazar.
10. Crear anuncios y promociones globales.
11. Crear métricas de vistas y tendencia.
```

---

#### 21.30.8. Decisión actual

Decisión tomada:

```txt
No implementar multitienda ahora.
```

Motivo:

```txt
Todavía se está cerrando la tienda individual.
Meter multitienda ahora tocaría productos, categorías, órdenes, checkout, settings, reglas, rutas y panel admin.
```

Regla práctica:

```txt
Desde ahora, evitar programar nuevas funciones demasiado rígidas a una sola tienda cuando sea fácil dejarlas preparadas para una futura relación store.
Pero no hacer la migración multitienda todavía.
```




---

### 21.31. Bloque cerrado: Monedas tienda pública, cobro mixto, envío separado y resumen admin

Esta sección se agrega como actualización acumulativa sin reemplazar secciones anteriores. Si alguna sección anterior menciona una regla distinta de moneda, esta sección 21.31 es la regla más reciente y debe tomarse como referencia actual.

Estado:

```txt
✅ CERRADO COMO BASE FUNCIONAL
```

Bloque trabajado:

```txt
Moneda Bloque a trabajar - Source actualizado
```

Fecha de cierre documental:

```txt
2026-06-04
```

Marca de versión documental:

```txt
PZ-MASTER-MONEDAS-CERRADO-V11-20260604
```

---

#### 21.31.1. Objetivo del bloque cerrado

El objetivo fue implementar moneda visual para la tienda pública sin cambiar la base real del negocio.

Regla principal cerrada:

```txt
USD sigue siendo la moneda base real interna.
```

Esto aplica para:

```txt
- Precio real de productos.
- Cálculo interno del carrito.
- Cálculo interno del checkout.
- Guardado de órdenes.
- Reportes administrativos actuales y futuros.
- Historial real de ventas.
```

La moneda visual elegida por el cliente solo cambia cómo se muestran los precios al cliente.

---

#### 21.31.2. Decisión visual final aprobada: Opción A

El usuario eligió la opción A para la visual pública de precios.

Regla final:

```txt
No mostrar doble precio en tarjetas ni tienda pública.
Mostrar solo la moneda visual elegida.
```

Ejemplo si el cliente eligió CUP:

```txt
Whey Protein
3,500 CUP
```

No debe mostrarse debajo:

```txt
Equivale a 10 USD
```

---

#### 21.31.3. Productos convertibles

Los productos convertibles se muestran en la moneda visual elegida por el cliente.

Ejemplo:

```txt
Cliente elige CUP.
Producto cuesta 12 USD.
Tasa usada: 570.
Visual público: 6,840 CUP.
```

Regla:

```txt
El cliente ve CUP.
El sistema mantiene internamente USD.
```

---

#### 21.31.4. Productos Solo USD

Los productos marcados como:

```txt
only_usd = true
```

no se convierten a CUP aunque el cliente haya elegido CUP.

Ejemplo:

```txt
Cliente elige CUP.
Producto Solo USD cuesta 38 USD.
Visual público: $38.00 USD.
```

Regla:

```txt
Producto Solo USD siempre se muestra y se cobra visualmente como USD.
```

---

#### 21.31.5. Carrito con monedas mezcladas

Se confirmó el caso de uso importante:

```txt
El cliente puede agregar un producto convertible en CUP y otro producto Solo USD en la misma orden.
```

Ejemplo visual:

```txt
Producto convertible:
Vitamina de niños — 6,840 CUP

Producto Solo USD:
Creatina Platinum Monohidratada — $38.00 USD
```

Regla:

```txt
El carrito debe permitir esta mezcla.
No debe bloquear la compra por tener CUP + USD.
```

---

#### 21.31.6. Checkout corregido

Durante las pruebas se detectó que el carrito sí agregaba productos, pero al tocar:

```txt
Hacer el pedido
```

el checkout aparecía vacío.

Corrección cerrada:

```txt
El checkout ya lee correctamente los productos del carrito.
Se agregó respaldo seguro para evitar que el checkout llegue vacío al navegar desde el carrito.
```

Estado confirmado por el usuario:

```txt
✅ Checkout ya no queda vacío.
✅ Productos aparecen correctamente en checkout.
```

---

#### 21.31.7. Selector público de moneda

Se agregó el selector público de moneda visual.

Reglas actuales:

```txt
- El selector permite cambiar la moneda visual.
- La elección se conserva en el navegador del cliente.
- El selector se movió hacia la derecha.
- Se separó visualmente del botón flotante del carrito para que no choquen.
```

Archivos relacionados:

```txt
frontend-powerzona/src/components/CurrencySwitcher.astro
frontend-powerzona/src/layouts/Layout.astro
```

---

#### 21.31.8. Envío como excepción visual

El envío es la excepción a la regla de mostrar una sola moneda.

Decisión final:

```txt
El envío se calcula originalmente en USD.
El cliente debe ver el envío como USD / equivalente CUP.
```

Ejemplo:

```txt
Total de envío: 3 USD / 1,710 CUP
```

Motivo:

```txt
El cliente puede tener opciones para pagar el envío en USD o en CUP.
```

Regla importante:

```txt
El envío no debe sumarse al total visual de productos en CUP.
Debe mostrarse aparte.
```

---

#### 21.31.9. Totales visuales para cliente

En carrito, checkout y WhatsApp del cliente se debe mostrar solo lo que el cliente necesita ver.

Caso con moneda elegida CUP y producto Solo USD:

```txt
Moneda elegida: CUP

Productos:
- Vitamina de niños — 6,840 CUP
- Creatina Platinum Monohidratada — $38.00 USD

Total productos CUP: 6,840 CUP
Total productos USD: $38.00 USD
Total de envío: 3 USD / 1,710 CUP
```

No debe mostrarse al cliente como texto principal:

```txt
- Total real USD interno.
- Tasa usada.
- Subtotal interno USD.
- Datos técnicos de conversión.
```

Estos datos quedan guardados para el admin y reportes.

---

#### 21.31.10. WhatsApp del cliente

El mensaje de WhatsApp debe mostrar lo mismo que el cliente vio en checkout.

Regla final:

```txt
WhatsApp del cliente = visual del cliente.
```

Ejemplo aprobado:

```txt
Hola PowerZona, quiero realizar este pedido:

*Orden: PZ-XXXXX*

*Cliente*: Nombre
*Teléfono*: Teléfono
*Tipo servicio*: Envío
*Moneda elegida*: CUP
*Municipio*: Cerro
*Zona*: Cerro / Santo Suárez
*Dirección*: Dirección

*Productos:*
1. *Vitamina de niños*
   Cantidad: 1
   Importe: 6,840 CUP

2. *Creatina Platinum Monohidratada*
   Cantidad: 1
   Importe: $38.00 USD

-------------------------------------------------------------------------------------------
*Total de envío:* 3 USD / 1,710 CUP
*Total productos CUP:* 6,840 CUP
*Total productos USD:* $38.00 USD

Gracias.
```

Regla:

```txt
El envío queda aparte.
El total CUP no incluye el envío.
El producto Solo USD queda separado.
```

---

#### 21.31.11. Orden guardada e información interna

Aunque el cliente no vea datos internos, la orden debe conservarlos para administración.

Datos internos importantes:

```txt
- Moneda elegida.
- Tasa usada.
- Productos convertibles en moneda visual.
- Productos Solo USD.
- Subtotal real USD.
- Envío real USD.
- Equivalente del envío en CUP si aplica.
- Total real USD interno.
- Indicador de moneda mixta si aplica.
```

Regla:

```txt
Los datos internos sirven para historial, administración, reportes y futuras métricas.
No deben confundirse con el resumen visual del cliente.
```

---

#### 21.31.12. Panel admin de órdenes

Este fue el punto más importante de la corrección final.

Regla final para admin:

```txt
El admin debe ver claramente qué vio el cliente y qué datos son internos.
```

Estructura recomendada/implementada:

```txt
Resumen cliente
- Moneda elegida.
- Productos CUP.
- Productos USD.
- Envío separado como USD / equivalente CUP.

Uso interno
- Subtotal real USD.
- Envío real USD.
- Total real USD.
- Tasa usada.
```

Ejemplo visual para admin:

```txt
Resumen cliente
Moneda elegida: CUP
Productos CUP: 6,840 CUP
Productos USD: $38.00 USD
Envío: 3 USD / 1,710 CUP

Uso interno
Productos base USD + envío = total real interno.
```

Regla:

```txt
El admin no debe ver un total mezclado que confunda productos con envío.
El envío siempre debe quedar separado del total visual de productos.
```

---

#### 21.31.13. Total CUP no incluye envío

Decisión cerrada:

```txt
El total CUP mostrado al cliente y en el resumen cliente del admin representa productos convertibles.
No incluye envío.
```

El envío se refleja en su propia línea:

```txt
Total de envío: 3 USD / 1,710 CUP
```

Motivo:

```txt
El envío puede pagarse como USD o equivalente CUP.
No debe alterar el total visual de productos.
```

---

#### 21.31.14. Archivos modificados durante el bloque

Archivos principales trabajados en las versiones de moneda:

```txt
frontend-powerzona/src/components/CurrencySwitcher.astro
frontend-powerzona/src/components/Cart.astro
frontend-powerzona/src/components/ProductCard.astro
frontend-powerzona/src/layouts/Layout.astro
frontend-powerzona/src/pages/index.astro
frontend-powerzona/src/pages/buscar.astro
frontend-powerzona/src/pages/checkout.astro
frontend-powerzona/src/pages/producto/[slug].astro
frontend-powerzona/src/pages/categoria/[slug].astro
frontend-powerzona/src/pages/subcategoria/[slug].astro
frontend-powerzona/src/pages/admin/store-settings.astro
frontend-powerzona/src/pages/admin/orders.astro
```

Patches/versiones de referencia generados durante el bloque:

```txt
powerzona_moneda_bloque_v1_2026_06_04.zip
powerzona_moneda_checkout_fix_v2_2026_06_04.zip
powerzona_moneda_checkout_fix_v3_2026_06_04.zip
powerzona_moneda_admin_envio_separado_v4_2026_06_04.zip
```

Última versión funcional confirmada por el usuario:

```txt
powerzona_moneda_admin_envio_separado_v4_2026_06_04.zip
```

---

#### 21.31.15. Pruebas confirmadas por el usuario

El usuario probó y confirmó:

```txt
1. Elegir CUP como moneda visual.
2. Agregar un producto convertible.
3. Agregar un producto Solo USD.
4. Ir al checkout.
5. Elegir envío.
6. Realizar pedido.
7. Revisar WhatsApp.
8. Revisar la orden en admin.
```

Resultado confirmado:

```txt
✅ Producto convertible en CUP funciona.
✅ Producto Solo USD funciona.
✅ Carrito mantiene ambos productos.
✅ Checkout ya no queda vacío.
✅ WhatsApp muestra lo mismo que ve el cliente.
✅ Envío queda separado.
✅ Total CUP no incluye envío.
✅ Admin ve Resumen cliente + Uso interno sin confusión.
```

---

#### 21.31.16. Validación técnica realizada

Durante el bloque se validaron scripts modificados con:

```txt
node --check
```

Resultado reportado:

```txt
Sin errores de sintaxis JavaScript detectados en las partes verificadas.
```

Nota:

```txt
No se pudo completar npm run build dentro del entorno de revisión porque el ZIP traía node_modules/dependencias opcionales de Rollup no compatibles con Linux.
Esto no indica necesariamente un error del código.
En la computadora del proyecto, si aparece algo similar, ejecutar:
```

```bash
npm install
npm run build
```

---

#### 21.31.17. Estado final del bloque

Estado:

```txt
✅ CERRADO COMO BASE FUNCIONAL
```

Resumen:

```txt
- USD sigue siendo base real.
- Cliente puede elegir moneda visual.
- Visual público usa Opción A: solo moneda elegida.
- Producto Solo USD queda siempre en USD.
- Carrito permite mezcla CUP + USD.
- Checkout recupera correctamente productos del carrito.
- Envío se muestra aparte como USD / equivalente CUP.
- Total CUP de productos no incluye envío.
- WhatsApp del cliente muestra lo mismo que vio el cliente.
- Panel admin separa Resumen cliente y Uso interno.
- Reportes y lógica interna siguen preparados para USD real.
```

---

#### 21.31.18. Próximo bloque recomendado

El siguiente bloque recomendado es:

```txt
Producto individual visual y funcional
```

Objetivo sugerido:

```txt
Mejorar la página individual del producto manteniendo intacta la lógica cerrada de moneda, variaciones, carrito, checkout y productos Solo USD.
```

Puntos posibles del próximo bloque:

```txt
- Mejor vista de fotos.
- Mejor selector de variaciones.
- Precio según moneda visual.
- Producto Solo USD bien marcado.
- Botón Comprar / Agregar al carrito más limpio.
- Mejor experiencia mobile.
- Mantener navegación inteligente desde categoría/subcategoría.
```

Mensaje sugerido para iniciar el próximo chat:

```txt
Producto individual PowerZona - Source actualizado. Monedas ya quedó cerrado con moneda visual, productos Solo USD, envío separado y resumen admin funcionando.
```

Regla de trabajo:

```txt
Antes de iniciar este bloque, actualizar el source con la última versión funcional y abrir una conversación nueva.
```

---

### 21.32. Actualización cerrada: imágenes de categorías/subcategorías, banner de regalos, comprobante de orden y checkout en dos pasos

Esta sección se agrega como actualización acumulativa después del cierre del bloque de monedas. No reemplaza las secciones anteriores; documenta los ajustes recientes realizados antes de pasar al próximo bloque grande.

Estado:

```txt
✅ IMPLEMENTADO / EN PRUEBA FINAL DEL USUARIO
```

Fecha de actualización documental:

```txt
2026-06-06
```

Marca de versión documental:

```txt
PZ-MASTER-V12-CHECKOUT-REGALOS-CATEGORIAS-20260606
```

---

#### 21.32.1. Optimización de imágenes de categorías y subcategorías

Se ajustó el manejo visual de imágenes para categorías y subcategorías.

Objetivo:

```txt
Las fotos horizontales de categorías deben verse bien dentro de las tarjetas públicas y no quedar cortadas de forma incorrecta.
```

Regla aplicada:

```txt
Las tarjetas públicas de categoría y subcategoría trabajan con formato visual 16:9.
```

Proceso recomendado al guardar fotos desde el panel admin:

```txt
- Reducir la imagen.
- Recortar/adaptar al formato correcto de tarjeta.
- Convertir a WebP.
- Usar tamaño recomendado 1200 x 675.
- Optimizar peso para carga rápida en móvil.
```

Regla general del proyecto:

```txt
Siempre que se guarden imágenes nuevas en el proyecto, deben optimizarse para la mejor visualización posible según la tarjeta o sección donde se usen.
```

Aplica para:

```txt
- Categorías.
- Subcategorías.
- Regalos.
- Productos.
- Promos visuales.
- Banners.
- Imágenes públicas futuras.
```

Nota importante:

```txt
Las imágenes viejas no se optimizan solas.
Para aplicar el nuevo formato, el administrador debe volver a subir o guardar la foto desde el panel admin.
```

Archivos relacionados:

```txt
frontend-powerzona/src/pages/index.astro
frontend-powerzona/src/pages/categoria/[slug].astro
frontend-powerzona/src/pages/admin/catalog.astro
frontend-powerzona/src/pages/admin/catalog/category/[id].astro
```

---

#### 21.32.2. Vista móvil de categorías

Se decidió mantener las categorías en móvil como:

```txt
2 por fila
```

Motivo:

```txt
Permite ver más categorías sin hacer demasiado scroll y mantiene sensación de catálogo moderno.
```

Regla visual recomendada:

```txt
Portada móvil:
- Categorías principales: 2 por fila.
- Categoría especial o destacada: puede mostrarse como banner grande.
```

---

#### 21.32.3. Regalos como banner grande especial

Se decidió que la sección de Regalos no debe verse como una categoría común en la portada pública.

Regla visual final:

```txt
Regalos debe aparecer como banner grande especial.
```

Ubicación recomendada:

```txt
1. Productos destacados
2. Banner grande de Regalos
3. Categorías principales
```

Comportamiento:

```txt
- En móvil aparece como una tarjeta grande de una sola fila.
- En PC puede ocupar casi todo el ancho del contenedor.
- Al tocar el banner, abre la página /regalos.
- Mantiene la administración de regalos desde su módulo.
```

Objetivo:

```txt
Dar más presencia visual a Regalos y presentarlo como beneficio especial, no como categoría normal.
```

Archivo relacionado:

```txt
frontend-powerzona/src/pages/index.astro
```

---

#### 21.32.4. Comprobante público de orden con token

Se implementó la idea de que cada orden tenga un link de resumen/comprobante.

Ruta definida:

```txt
/orden/[orderNumber]/[token]
```

Ejemplo:

```txt
/orden/PZ-XXXXX/k8f92ms7qla
```

Regla de seguridad:

```txt
No usar solo el número de orden para ver el comprobante.
Debe usarse también un token para evitar que alguien pruebe números de orden y vea pedidos ajenos.
```

Campo agregado en `orders`:

```txt
receipt_token
```

Uso:

```txt
- Se genera al crear la orden.
- Permite abrir el resumen público/privado de la orden.
- El admin puede usarlo desde el botón Imprimir pedido.
- El cliente puede recibirlo al final del mensaje de WhatsApp.
```

Regla técnica recomendada:

```txt
Guardar el token, no el link completo.
El link se arma dinámicamente con el dominio actual.
```

Migración relacionada:

```txt
backend-powerzona/pb_migrations/1780467000_orders_receipt_token_public_link.js
```

---

#### 21.32.5. Botón Imprimir pedido

Se cambió la función del botón:

```txt
Imprimir pedido
```

Regla final:

```txt
El botón Imprimir pedido no debe imprimir directamente desde el listado.
Debe abrir el link del resumen/comprobante de la orden.
```

Después, dentro de la página de comprobante:

```txt
El administrador puede tocar Imprimir comprobante.
```

Comportamiento para órdenes viejas:

```txt
Si una orden vieja no tiene receipt_token, el admin puede generarlo automáticamente al tocar Imprimir pedido.
```

Archivos relacionados:

```txt
frontend-powerzona/src/pages/admin/orders.astro
frontend-powerzona/src/pages/orden/[orderNumber]/[token].astro
```

---

#### 21.32.6. Comprobante con logo/icono de la tienda

La página del resumen de orden debe cargar el logo o icono configurado en Ajustes de la tienda.

Regla:

```txt
Si existe logo/icono en settings, mostrarlo arriba del comprobante.
Si no existe, mostrar un fallback visual con PZ.
```

También debe mostrar:

```txt
- Nombre público de la tienda.
- Número de orden.
- Datos del cliente.
- Método de entrega.
- Productos.
- Totales.
- Estado.
- Botón Imprimir comprobante.
```

Objetivo:

```txt
Que el comprobante se vea profesional y sirva como constancia para cliente y admin.
```

---

#### 21.32.7. Link del resumen al final del WhatsApp

Se decidió que el link del comprobante debe ir al final del mensaje de WhatsApp.

Formato recomendado:

```txt
Gracias.

Resumen de su orden:
https://dominio/orden/PZ-XXXXX/TOKEN
```

Regla:

```txt
El pedido completo debe aparecer primero.
El link de resumen debe quedar al final como comprobante.
```

Archivo relacionado:

```txt
frontend-powerzona/src/pages/checkout.astro
```

---

#### 21.32.8. Checkout en dos pasos para evitar duplicados

Se corrigió el flujo del checkout para evitar órdenes duplicadas y problemas al abrir WhatsApp.

Problema detectado:

```txt
El cliente tocaba Realizar Pedido.
La orden se creaba en PocketBase.
WhatsApp no abría correctamente.
El checkout quedaba activo.
Cada nuevo toque creaba otra orden duplicada.
```

Decisión final:

```txt
Separar el proceso en dos pasos.
```

Flujo final aprobado:

```txt
1. El cliente llena el checkout.
2. Botón inicial: Realizar Pedido.
3. Al tocarlo, se crea la orden en PocketBase.
4. Si la orden se crea correctamente:
   - se bloquea la edición del checkout;
   - ya no se puede crear otra orden desde esa misma pantalla;
   - aparece el botón Abrir WhatsApp del pedido.
5. Al tocar Abrir WhatsApp del pedido:
   - se abre WhatsApp con el mensaje completo;
   - se limpia el carrito;
   - se limpia el estado del checkout;
   - se redirige al cliente a la página principal.
```

Regla importante:

```txt
El botón Abrir WhatsApp del pedido no debe salir desde el inicio.
Solo debe aparecer después de que la orden exista correctamente en PocketBase.
```

Archivo relacionado:

```txt
frontend-powerzona/src/pages/checkout.astro
```

---

#### 21.32.9. Mensaje de WhatsApp para Recogida y Coordinar

Se ajustó el texto de entrega en WhatsApp para evitar que Recogida aparezca como envío 0.

Reglas:

##### Si es Envío

```txt
*Tipo servicio*: Envío
*Total de envío*: 3 USD / 1710 CUP
```

##### Si es Recogida

```txt
*Tipo servicio*: Para recoger
*Entrega*: Para recoger
```

##### Si es Coordinar

```txt
*Tipo servicio*: Coordinar entrega
*Entrega*: A coordinar con la tienda
```

Regla:

```txt
No mostrar "Total de envío: 0" cuando el cliente elige Recogida o Coordinar.
```

Archivo relacionado:

```txt
frontend-powerzona/src/pages/checkout.astro
```

---

#### 21.32.10. Total estimado con productos Solo USD

Se refinó el resumen visual cuando el carrito tiene productos Solo USD.

Regla final:

```txt
Si el carrito contiene solo productos Solo USD, el total estimado debe mostrarse en USD aunque el cliente tenga seleccionada CUP.
```

Ejemplo:

```txt
Moneda elegida: USD
Productos: $38.00 USD
Total estimado: $38.00 USD
```

Regla para productos mixtos:

```txt
Si hay productos en CUP y productos Solo USD, mantener totales separados:
- Total CUP
- Total USD
```

Regla para productos convertibles:

```txt
Si todos los productos son convertibles, mostrar el total en la moneda visual elegida.
```

Archivos relacionados:

```txt
frontend-powerzona/src/components/Cart.astro
frontend-powerzona/src/pages/checkout.astro
```

---

#### 21.32.11. Costo de entrega debajo del total estimado

Se agregó una línea visible debajo del Total estimado cuando el cliente elige Envío.

Regla:

```txt
El envío sigue sin sumarse al total estimado de productos, pero debe quedar claramente visible.
```

Ejemplo:

```txt
Total estimado
$38.00 USD

Costo de entrega:
$3.00 USD / equivalente 1,710 CUP
```

Motivo:

```txt
Evitar que el cliente piense que el envío está incluido en el total de productos.
```

Archivo relacionado:

```txt
frontend-powerzona/src/pages/checkout.astro
```

---

#### 21.32.12. Reglas reforzadas para métodos de entrega por producto

Se reforzó la lógica del checkout según `products.delivery_mode`.

Valores:

```txt
both      → Envío o recogida
delivery  → Solo envío
pickup    → Solo recogida
```

Regla final aprobada:

```txt
Envío o recogida + Solo envío
→ Envío activo
→ Recogida desactivado
→ Coordinar activo
```

```txt
Envío o recogida + Solo recogida
→ Solo Coordinar
```

```txt
Solo envío + Solo recogida
→ Solo Coordinar
```

```txt
Solo envío + Solo envío
→ Envío activo
→ Recogida desactivado
→ Coordinar activo
```

```txt
Solo recogida + Solo recogida
→ Recogida activo
→ Envío desactivado
→ Coordinar activo
```

```txt
Envío o recogida + Envío o recogida
→ Envío activo
→ Recogida activo
→ Coordinar activo
```

Regla general:

```txt
Coordinar siempre debe estar disponible.
Si una orden mezcla Solo recogida con un producto que no sea también Solo recogida, se fuerza Coordinar.
```

Archivo relacionado:

```txt
frontend-powerzona/src/pages/checkout.astro
```

---

#### 21.32.13. Archivos principales modificados en este bloque complementario

Archivos relacionados con los cambios recientes:

```txt
frontend-powerzona/src/pages/index.astro
frontend-powerzona/src/pages/categoria/[slug].astro
frontend-powerzona/src/pages/admin/catalog.astro
frontend-powerzona/src/pages/admin/catalog/category/[id].astro
frontend-powerzona/src/pages/checkout.astro
frontend-powerzona/src/components/Cart.astro
frontend-powerzona/src/pages/admin/orders.astro
frontend-powerzona/src/pages/orden/[orderNumber]/[token].astro
backend-powerzona/pb_migrations/1780467000_orders_receipt_token_public_link.js
```

---

#### 21.32.14. Migraciones recientes

Migración nueva relacionada con el comprobante público de orden:

```txt
1780467000_orders_receipt_token_public_link.js
```

Campo agregado:

```txt
orders.receipt_token
```

Regla de trabajo:

```txt
Avisar siempre si se agrega una migración nueva.
No crear migraciones duplicadas si el campo ya existe.
```

---

#### 21.32.15. Pruebas recomendadas antes de cerrar completamente

Prueba 1: imágenes de categorías

```txt
1. Subir una imagen horizontal a una categoría.
2. Confirmar que se guarda optimizada.
3. Confirmar que se ve bien en portada.
4. Confirmar que se ve bien dentro de /categoria/[slug].
```

Prueba 2: subcategorías

```txt
1. Subir una imagen a una subcategoría.
2. Confirmar que se ve bien dentro de la categoría.
3. Confirmar que se conserva la proporción correcta.
```

Prueba 3: banner de regalos

```txt
1. Abrir portada pública.
2. Confirmar que Regalos sale como banner grande debajo de destacados.
3. Tocar el banner.
4. Confirmar que abre /regalos.
```

Prueba 4: checkout dos pasos

```txt
1. Agregar producto al carrito.
2. Entrar al checkout.
3. Confirmar que el botón inicial dice Realizar Pedido.
4. Tocar Realizar Pedido.
5. Confirmar que se crea una sola orden en PocketBase.
6. Confirmar que el checkout se bloquea.
7. Confirmar que aparece Abrir WhatsApp del pedido.
8. Tocar Abrir WhatsApp del pedido.
9. Confirmar que se abre WhatsApp.
10. Confirmar que el carrito se limpia y el cliente vuelve a la portada.
```

Prueba 5: comprobante público

```txt
1. Crear una orden nueva.
2. Confirmar que tiene receipt_token.
3. Abrir el link /orden/[orderNumber]/[token].
4. Confirmar que muestra logo, nombre de tienda, datos, productos y totales.
5. Desde admin, tocar Imprimir pedido y confirmar que abre ese mismo link.
```

Prueba 6: entrega mixta

```txt
1. Agregar producto Envío o recogida + Solo envío.
2. Confirmar que queda Envío activo, Recogida desactivado y Coordinar activo.
3. Agregar producto Envío o recogida + Solo recogida.
4. Confirmar que solo queda Coordinar.
5. Agregar Solo envío + Solo recogida.
6. Confirmar que solo queda Coordinar.
```

---

#### 21.32.16. Estado final de esta actualización

Estado:

```txt
✅ IMPLEMENTADO / EN PRUEBA FINAL
```

Resumen:

```txt
- Imágenes de categorías/subcategorías optimizadas a formato 16:9.
- Regalos se muestra como banner grande especial.
- Cada orden puede tener link de comprobante con token.
- El botón Imprimir pedido abre el comprobante.
- El comprobante usa logo/icono y nombre público de la tienda.
- El link del comprobante va al final del WhatsApp.
- Checkout pasa a flujo de dos pasos para evitar duplicados.
- Recogida y Coordinar ya no muestran envío 0.
- Productos Solo USD muestran total estimado en USD cuando corresponde.
- Costo de entrega aparece debajo del total estimado.
- Reglas de entrega por producto reforzadas.
```

---

#### 21.32.17. Próximo bloque recomendado

Antes de iniciar un bloque nuevo, se recomienda probar el checklist anterior.

Después de confirmar que todo funciona, el próximo bloque recomendado puede ser:

```txt
Producto individual visual y funcional
```

Objetivo:

```txt
Mejorar la página individual del producto manteniendo intacta la lógica cerrada de monedas, Solo USD, variaciones, carrito, checkout en dos pasos y reglas de entrega.
```

Mensaje sugerido para el próximo chat:

```txt
Producto individual PowerZona - Source actualizado. Checkout en dos pasos, comprobante de orden, reglas de entrega, regalos banner e imágenes de categorías ya quedaron implementados.
```

---

### 21.33. Actualización cerrada: WhatsApp, prefijo de órdenes, optimización de imágenes y fotos limpias por sección

Esta sección se agrega como actualización acumulativa después del bloque de checkout, regalos, categorías y ajustes visuales de imágenes.

Estado:

```txt
✅ IMPLEMENTADO / EN PRUEBA FINAL
```

Fecha de actualización documental:

```txt
2026-06-06
```

Marca de versión documental:

```txt
PZ-MASTER-IMAGENES-WHATSAPP-PREFIJO-V13-20260606
```

Objetivo de esta actualización:

```txt
Documentar los últimos ajustes realizados en:
- Mensaje de WhatsApp del cliente.
- Prefijo configurable de órdenes.
- Optimización automática de imágenes.
- Medidas y calidad de fotos por sección.
- Limpieza visual de fotos en portada, regalos, categorías y páginas internas.
```

---

#### 21.33.1. Mensaje de WhatsApp del cliente

Se ajustó el inicio del mensaje de WhatsApp.

Regla anterior no deseada:

```txt
Hola PowerZona, quiero realizar este pedido:
```

Regla final aprobada:

```txt
Solo debe aparecer el nombre público del negocio arriba.
Debajo debe comenzar directamente el número de orden.
```

Ejemplo correcto:

```txt
PowerZona

*Orden: PP-A7K9M*

*Cliente*: Juan
*Teléfono*: 12345678
...
```

Si el nombre público del negocio cambia desde Ajustes, el mensaje debe usar ese nombre dinámico.

Ejemplo:

```txt
Mi Tienda Habana

*Orden: MTH-8K2LA*

*Cliente*: Juan
...
```

Regla:

```txt
No dejar textos fijos como “Hola PowerZona” ni “quiero realizar este pedido”.
El nombre del negocio debe salir desde settings.store_name.
```

---

#### 21.33.2. Prefijo configurable de órdenes

Se agregó en Ajustes de tienda un campo nuevo:

```txt
Prefijo de órdenes
```

Ubicación:

```txt
/admin/store-settings
```

Reglas aprobadas:

```txt
- Máximo 3 letras.
- Convertir automáticamente a mayúsculas.
- Si está vacío, usar PP.
- El sistema agrega 5 caracteres automáticos entre letras y números.
```

Formato final de orden:

```txt
PREFIJO-XXXXX
```

Ejemplos:

```txt
PP-A7K9M
PZ-92LQX
ABC-4X8JA
```

Regla importante:

```txt
El valor por defecto final aprobado es PP, no PZ.
```

Migración relacionada:

```txt
backend-powerzona/pb_migrations/1780467100_updated_settings_order_prefix.js
```

Archivos relacionados:

```txt
frontend-powerzona/src/pages/checkout.astro
frontend-powerzona/src/pages/admin/store-settings.astro
```

---

#### 21.33.3. Regla general definitiva para toda imagen nueva

Se estableció una regla permanente para PowerZona:

```txt
Cada vez que se agregue una función nueva que suba o guarde fotos, la imagen debe optimizarse automáticamente al guardar.
```

Esta regla aplica a:

```txt
- Productos.
- Variaciones.
- Categorías.
- Subcategorías.
- Regalos.
- Foto categoría Regalos.
- Portada/banner.
- Logo/icono.
- Promos visuales.
- Accesos rápidos.
- Botones con imagen.
- Banners futuros.
- Cualquier módulo nuevo con foto.
```

Objetivo:

```txt
Mejorar velocidad de carga, especialmente en conexiones lentas y móviles.
```

Proceso recomendado:

```txt
1. Validar que el archivo sea imagen.
2. Convertir preferiblemente a WebP.
3. Redimensionar según el uso real.
4. Usar calidad equilibrada.
5. Mantener buen brillo y nitidez.
6. Evitar guardar imágenes pesadas originales si no hace falta.
```

Regla importante:

```txt
Optimizar no debe significar apagar la foto.
Si una imagen pierde brillo, revisar:
- calidad WebP,
- método canvas,
- uso de thumbnail de PocketBase,
- opacity,
- overlays oscuros,
- gradients encima de la foto.
```

---

### 21.34. Registro detallado de fotos, medidas, calidad y uso visual

Esta sección documenta las medidas actuales aprobadas o usadas como base para cada tipo de imagen en PowerZona.

---

#### 21.34.1. Foto de portada / banner principal

Uso:

```txt
Imagen principal de la tienda pública en la portada.
Se configura desde Ajustes de tienda.
```

Configuración final aprobada para guardado:

```txt
Formato: WebP
Tamaño recomendado: 1600 x 760 px
Calidad: 0.92
Recorte: cover centrado
Uso: banner principal de la portada pública
```

Motivo:

```txt
Se subió la altura respecto a 1600 x 620 para que fotos 16:9 no se corten tanto.
En móvil debe mantenerse una altura controlada para no ocupar demasiado la pantalla.
```

Regla visual:

```txt
La foto debe verse con buen brillo.
No debe llevar una capa oscura fuerte encima.
```

Corrección aplicada:

```txt
- Se revisó que la foto no se viera opaca por opacity baja.
- Se suavizó la capa oscura encima de la portada.
- La vista previa en Ajustes no debe depender de thumbnails pequeños de PocketBase.
```

Valores visuales aprobados como referencia:

```txt
Imagen pública: opacity cercana a .94 o superior.
Overlay: suave, solo si hace falta legibilidad.
```

Archivos relacionados:

```txt
frontend-powerzona/src/pages/index.astro
frontend-powerzona/src/pages/admin/store-settings.astro
```

---

#### 21.34.2. Logo / icono del negocio

Uso:

```txt
Logo o icono que aparece en header público, menú público, comprobante de orden y posibles vistas futuras.
```

Configuración recomendada:

```txt
Formato: WebP
Tamaño recomendado: 512 x 512 px
Proporción: 1:1
Calidad recomendada: 0.88 - 0.92
Recorte: cover centrado
```

Regla:

```txt
El logo debe verse claro en tamaños pequeños.
No debe comprimirse demasiado porque pierde identidad visual.
```

Ubicaciones donde se usa:

```txt
- Header público.
- Menú público de 3 puntos.
- Comprobante público de orden.
- Panel admin como identidad visual.
- Futura PWA.
```

---

#### 21.34.3. Categorías principales

Uso:

```txt
Tarjetas de categorías en portada pública y páginas internas de categoría.
```

Configuración actual:

```txt
Formato: WebP
Tamaño: 1200 x 675 px
Proporción: 16:9
Calidad WebP: 0.82
Recorte: cover centrado
Nombre final sugerido: *_categoria_1200x675.webp
```

Regla visual actual:

```txt
El texto ya no debe ir dentro de la foto.
El nombre de la categoría y los datos deben ir arriba de la imagen.
La foto queda limpia.
```

Portada pública:

```txt
Nombre de categoría
Datos: cantidad de productos / subcategorías
[ Foto limpia de la categoría ]
```

Página interna de categoría:

```txt
Categoría
Nombre de categoría
Datos de productos/subcategorías
[ Foto limpia de la categoría ]
```

Corrección aplicada:

```txt
Se quitaron overlays y textos dentro de la foto para mantener brillo y limpieza visual.
```

Archivos relacionados:

```txt
frontend-powerzona/src/pages/admin/catalog.astro
frontend-powerzona/src/pages/admin/catalog/category/[id].astro
frontend-powerzona/src/pages/index.astro
frontend-powerzona/src/pages/categoria/[slug].astro
```

---

#### 21.34.4. Subcategorías

Uso:

```txt
Subcategorías dentro de categorías y páginas públicas de subcategoría.
```

Configuración actual de imagen:

```txt
Formato: WebP
Tamaño: 1200 x 675 px
Proporción: 16:9
Calidad WebP: 0.82
Recorte: cover centrado
```

Regla visual:

```txt
El encabezado de subcategoría debe estar limpio y fuera de bloques oscuros innecesarios.
Si se usa imagen de subcategoría en el futuro público, no debe llevar texto montado encima.
```

Página pública de subcategoría:

```txt
Subcategoría · Categoría padre
Nombre de subcategoría
Cantidad de productos
```

Regla:

```txt
No mostrar textos técnicos como “Vista 2 por fila en PC y móvil” si se considera mensaje interno.
```

Archivos relacionados:

```txt
frontend-powerzona/src/pages/admin/catalog.astro
frontend-powerzona/src/pages/admin/catalog/category/[id].astro
frontend-powerzona/src/pages/subcategoria/[slug].astro
```

---

#### 21.34.5. Productos

Uso:

```txt
Galería de productos, portada de producto, tarjetas públicas y panel admin.
```

Configuración actual:

```txt
Formato: WebP
Tamaño máximo: 1000 px por lado
Calidad WebP: 0.78
Proporción: mantiene la proporción original
Límite visual actual: hasta 4 fotos por producto
```

Reglas:

```txt
- La primera foto es la portada del producto.
- Subir una foto nueva no debe sustituir posiciones no seleccionadas.
- Se puede borrar una foto individual.
- La galería pública debe mostrar imagen completa cuando corresponda.
- Si se nota pérdida de brillo, revisar si conviene subir calidad a 0.82 u 0.86.
```

Motivo del tamaño:

```txt
1000 px por lado mantiene buena calidad para tarjetas y detalle de producto sin subir demasiado el peso.
```

Archivos relacionados:

```txt
frontend-powerzona/src/pages/admin/products.astro
frontend-powerzona/src/components/ProductCard.astro
frontend-powerzona/src/pages/producto/[slug].astro
```

---

#### 21.34.6. Variaciones de productos

Uso:

```txt
Foto opcional por variación de producto.
```

Configuración recomendada:

```txt
Formato: WebP
Tamaño máximo recomendado: 1000 px por lado
Calidad recomendada: 0.78 - 0.82
Proporción: mantener proporción original
```

Regla:

```txt
La foto de la variación debe cambiar la imagen pública del producto cuando el cliente selecciona esa variación.
```

Ejemplo:

```txt
Producto: Creatina
Variación: Sabor uva
Foto de variación: muestra el envase de uva
```

Regla visual:

```txt
No comprimir demasiado si la variación depende de color/sabor y el cliente necesita distinguir el producto.
```

Archivo relacionado:

```txt
frontend-powerzona/src/pages/admin/products.astro
```

---

#### 21.34.7. Regalos individuales

Uso:

```txt
Fotos de cada regalo disponible dentro del módulo Regalos.
```

Configuración final aprobada:

```txt
Formato: WebP
Tamaño: 1200 x 675 px
Proporción: 16:9
Calidad WebP: 0.82
Recorte: cover centrado
```

Cambio realizado:

```txt
Antes:
WebP 900 x 900 calidad 0.86

Ahora:
WebP 1200 x 675 calidad 0.82
```

Motivo:

```txt
Unificar regalos con la misma proporción visual de categorías.
Evitar mezcla de fotos cuadradas con banners 16:9.
```

Regla visual:

```txt
La foto del regalo debe verse limpia y con brillo.
Evitar usar thumbnails pequeños de PocketBase para la vista pública.
```

Archivos relacionados:

```txt
frontend-powerzona/src/pages/admin/gifts.astro
frontend-powerzona/src/pages/regalos/index.astro
frontend-powerzona/src/lib/api.ts
```

---

#### 21.34.8. Foto categoría Regalos

Uso:

```txt
Banner o imagen visual que representa la categoría Regalos en la portada principal y en la página interna /regalos.
```

Configuración final aprobada:

```txt
Formato: WebP
Tamaño: 1200 x 675 px
Proporción: 16:9
Calidad WebP: 0.82
Recorte: cover centrado
```

Cambio realizado:

```txt
Antes:
WebP 900 x 540 calidad 0.86

Ahora:
WebP 1200 x 675 calidad 0.82
```

Regla visual final:

```txt
El texto no debe ir dentro de la foto.
El título, descripción, datos y botón deben ir arriba de la imagen.
La foto debe quedar limpia.
```

Portada principal:

```txt
Especial para tu compra
Regalos
Descripción
Botón Ver regalos
Datos: cantidad de regalos / 1 por orden

[ Foto limpia de Regalos ]
```

Página interna /regalos:

```txt
Especial para tu compra
Regalos
Descripción del módulo

[ Foto limpia de Regalos ]
```

Corrección aplicada:

```txt
En móvil la foto de Regalos en portada perdía brillo porque tenía overlay oscuro específico.
Se quitó el texto de la foto y se eliminó/suavizó la capa para dejar la imagen limpia.
```

Archivos relacionados:

```txt
frontend-powerzona/src/pages/index.astro
frontend-powerzona/src/pages/regalos/index.astro
frontend-powerzona/src/pages/admin/gifts.astro
```

---

#### 21.34.9. Promos visuales

Uso:

```txt
Tarjetas/anuncios visuales de portada creados desde Ajustes de tienda.
```

Configuración recomendada:

```txt
Formato: WebP
Tamaño recomendado: 1200 x 675 px
Proporción: 16:9
Calidad recomendada: 0.82 - 0.86
Recorte: cover centrado
```

Regla:

```txt
Las promos visuales deben optimizarse automáticamente.
No deben mostrar etiquetas técnicas como “promo_visual” o “Promo visual” al cliente.
```

Uso recomendado:

```txt
- Combos.
- Ofertas.
- Anuncios.
- Acciones con botón de WhatsApp.
```

Archivos relacionados:

```txt
frontend-powerzona/src/pages/admin/store-settings.astro
frontend-powerzona/src/pages/index.astro
frontend-powerzona/src/lib/api.ts
```

---

#### 21.34.10. Accesos rápidos y botones con imagen

Uso:

```txt
Botones/tarjetas visuales para WhatsApp, grupo, enlaces, descargas, categorías o accesos externos.
```

Configuración recomendada:

```txt
Formato: WebP
Tamaño recomendado: 900 x 540 px o 1200 x 675 px
Proporción recomendada: 16:9
Calidad recomendada: 0.82 - 0.86
Recorte: cover centrado
```

Regla:

```txt
Si el acceso rápido se muestra como tarjeta ancha, usar 1200 x 675.
Si se muestra como botón pequeño o icono, usar una versión menor para no cargar peso innecesario.
```

Archivos relacionados:

```txt
frontend-powerzona/src/pages/admin/store-settings.astro
frontend-powerzona/src/pages/index.astro
```

---

#### 21.34.11. Comprobante público de orden

Uso:

```txt
Página pública segura de comprobante de orden con token.
```

Imagen usada:

```txt
Logo/icono del negocio desde settings.logo_image.
```

Configuración recomendada para logo en comprobante:

```txt
Formato: WebP
Tamaño recomendado: 512 x 512 px
Calidad: 0.88 - 0.92
Proporción: 1:1
```

Regla:

```txt
El comprobante debe usar el nombre público y logo/icono configurados.
No debe depender de textos fijos de PowerZona si el negocio cambia.
```

---

### 21.35. Reglas visuales finales para fotos limpias

Después de los últimos ajustes, se definió una regla visual general:

```txt
Las fotos principales deben quedar limpias.
Los textos deben ir fuera de la foto cuando sea posible.
```

Aplica especialmente a:

```txt
- Regalos en portada principal.
- Regalos en página interna.
- Categorías en portada principal.
- Página interna de categoría.
- Subcategorías si se agrega imagen pública.
```

Motivo:

```txt
- La foto conserva mejor brillo.
- Se evita depender de overlays oscuros.
- La tienda se ve más limpia y premium.
- En móvil mejora la lectura y la imagen no se ve opaca.
```

Regla para overlays:

```txt
Solo usar overlay si el texto tiene que ir encima de la imagen.
Si el texto está fuera de la imagen, no usar overlay oscuro.
```

---

### 21.36. Archivos y ZIPs recientes relacionados

ZIPs generados durante este bloque de ajustes:

```txt
PZ_ajuste_whatsapp_prefijo_ordenes_20260606.zip
PZ_ajuste_whatsapp_prefijo_ordenes_PP_20260606.zip
PZ_optimizar_foto_portada_20260606.zip
PZ_portada_optimizacion_suave_20260606.zip
PZ_regalos_misma_optimizacion_categorias_20260606.zip
PZ_fix_guardar_categoria_regalos_20260606.zip
PZ_fix_brillo_regalos_20260606.zip
PZ_fix_brillo_portada_20260606.zip
PZ_portada_mas_alta_equilibrada_20260606.zip
PZ_regalos_texto_fuera_foto_20260606.zip
PZ_categorias_subcategorias_texto_fuera_foto_20260606.zip
PZ_fix_regalos_y_categorias_texto_fuera_20260606.zip
```

Archivos más tocados en este bloque:

```txt
frontend-powerzona/src/pages/index.astro
frontend-powerzona/src/pages/regalos/index.astro
frontend-powerzona/src/pages/categoria/[slug].astro
frontend-powerzona/src/pages/subcategoria/[slug].astro
frontend-powerzona/src/pages/admin/store-settings.astro
frontend-powerzona/src/pages/admin/gifts.astro
frontend-powerzona/src/pages/checkout.astro
frontend-powerzona/src/lib/api.ts
backend-powerzona/pb_migrations/1780467100_updated_settings_order_prefix.js
```

---

### 21.37. Checklist de prueba después de actualizar source

Prueba 1: WhatsApp

```txt
1. Crear una orden desde checkout.
2. Confirmar que el mensaje de WhatsApp inicia solo con el nombre del negocio.
3. Confirmar que debajo aparece *Orden: PP-XXXXX* o el prefijo configurado.
4. Confirmar que no aparece “Hola PowerZona” ni “quiero realizar este pedido”.
```

Prueba 2: prefijo de orden

```txt
1. Ir a Ajustes de tienda.
2. Dejar Prefijo de órdenes vacío.
3. Crear una orden.
4. Confirmar que usa PP-XXXXX.
5. Escribir un prefijo de 2 o 3 letras, por ejemplo PZ.
6. Crear otra orden.
7. Confirmar que usa PZ-XXXXX.
```

Prueba 3: portada

```txt
1. Subir foto de portada.
2. Confirmar que se guarda optimizada.
3. Confirmar que no se ve opaca.
4. Confirmar que en móvil no ocupa demasiado alto.
5. Confirmar que se corta menos que antes con fotos 16:9.
```

Prueba 4: Regalos en portada

```txt
1. Abrir la portada principal.
2. Confirmar que el texto de Regalos está arriba de la foto.
3. Confirmar que la foto de Regalos queda limpia.
4. Confirmar que en móvil no pierde brillo.
```

Prueba 5: página interna de Regalos

```txt
1. Entrar a /regalos.
2. Confirmar que el título y descripción están arriba.
3. Confirmar que la foto queda limpia.
4. Confirmar que la calidad/brillo se mantienen.
```

Prueba 6: categorías en portada

```txt
1. Abrir la portada principal.
2. Confirmar que las categorías tienen nombre y datos arriba.
3. Confirmar que la foto queda limpia.
4. Confirmar que no volvió el texto dentro de la imagen.
```

Prueba 7: página interna de categoría

```txt
1. Entrar a una categoría.
2. Confirmar que el título y datos están arriba.
3. Confirmar que la foto de categoría queda limpia.
4. Confirmar que los productos se mantienen visibles y el botón Comprar funciona.
```

Prueba 8: subcategoría

```txt
1. Entrar a una subcategoría.
2. Confirmar que el encabezado se ve limpio.
3. Confirmar que mantiene productos 2 por fila.
4. Confirmar que no hay texto técnico visible para el cliente.
```

---

### 21.38. Estado final actualizado

Estado:

```txt
✅ Mensaje WhatsApp ajustado.
✅ Prefijo de órdenes configurable agregado.
✅ Prefijo vacío usa PP.
✅ Regla permanente de optimizar toda foto nueva guardada.
✅ Portada optimizada y con mejor brillo.
✅ Foto de portada documentada como 1600 x 760 calidad 0.92.
✅ Categorías documentadas como 1200 x 675 calidad 0.82.
✅ Subcategorías documentadas como 1200 x 675 calidad 0.82.
✅ Regalos individuales documentados como 1200 x 675 calidad 0.82.
✅ Foto categoría Regalos documentada como 1200 x 675 calidad 0.82.
✅ Productos documentados como máximo 1000 px por lado calidad 0.78.
✅ Textos de Regalos movidos fuera de la foto.
✅ Textos de categorías movidos fuera de la foto.
✅ Fotos principales quedan limpias y sin overlay oscuro fuerte.
```

Próximo bloque recomendado:

```txt
Probar visualmente en móvil y PC todos los cambios recientes.
Después continuar con Producto individual visual y funcional.
```

Mensaje sugerido para el próximo chat:

```txt
Producto individual PowerZona - Source actualizado. Ya quedaron documentados WhatsApp, prefijo de órdenes, optimización de imágenes y fotos limpias en regalos/categorías.
```

---

### 21.39. Bloque cerrado parcial: GitHub privado, flujo profesional y staging con Coolify

Esta sección se agrega como actualización acumulativa después de iniciar la nueva etapa de infraestructura profesional para PowerZona/Tusenda.

Estado:

```txt
✅ IMPLEMENTADO COMO BASE DE STAGING
🟡 PENDIENTE: copiar datos reales locales pb_data hacia staging
```

Fecha de actualización documental:

```txt
2026-06-07
```

Marca de versión documental:

```txt
PZ-MASTER-GITHUB-COOLIFY-STAGING-V14-20260607
```

---

#### 21.39.1. Objetivo de la nueva etapa

Objetivo general:

```txt
Configurar un flujo profesional para trabajar con GitHub, servidor temporal/staging y luego producción, sin romper la tienda individual PowerZona.
```

Decisión principal:

```txt
No iniciar multiusuarios todavía.
Primero terminar PowerZona como tienda individual estable.
```

Flujo deseado:

```txt
PC / VS Code
→ GitHub privado
→ Coolify en VPS
→ Staging con dominio temporal
→ Producción futura estable
→ Multiusuarios / bazar Tusenda más adelante
```

---

#### 21.39.2. Repositorio GitHub privado creado

Se creó el repositorio privado:

```txt
https://github.com/tusendasoporte-sudo/tusendaecommerce.git
```

Decisión de nombre:

```txt
tusendaecommerce
```

Motivo:

```txt
Tusenda será el concepto de bazar/plataforma principal.
PowerZona queda como tienda individual dentro de ese futuro bazar.
El nombre del repositorio no tiene que coincidir con el nombre público de la tienda.
```

---

#### 21.39.3. Git local conectado a GitHub

Estado confirmado en VS Code / PowerShell:

```txt
origin  https://github.com/tusendasoporte-sudo/tusendaecommerce.git (fetch)
origin  https://github.com/tusendasoporte-sudo/tusendaecommerce.git (push)
```

Commit inicial seguro existente:

```txt
c0873b0 Estado actual antes de usar Codex
```

Ramas creadas:

```txt
main
dev
```

Estado de trabajo confirmado:

```txt
On branch dev
Your branch is up to date with 'origin/dev'.
nothing to commit, working tree clean
```

---

#### 21.39.4. Estrategia de ramas

Regla final:

```txt
main = versión estable
dev  = versión de trabajo / staging / Codex
```

Reglas de trabajo:

```txt
- No trabajar directamente sobre main.
- Antes de pedir cambios a Codex, confirmar que la rama activa sea dev.
- Los cambios probados en dev se podrán subir a main cuando estén estables.
```

Comandos útiles:

```bash
git branch
git checkout dev
git status
git pull
git push
```

---

#### 21.39.5. `.gitignore` verificado y ampliado

Se confirmó que Git no está siguiendo archivos sensibles o pesados.

Comando usado:

```bash
git ls-files | findstr /i "node_modules pb_data pb_logs pb_public pocketbase.exe"
```

Resultado esperado/confirmado:

```txt
No salió nada.
```

Reglas confirmadas:

```txt
No subir:
- node_modules
- backend-powerzona/pb_data
- backend-powerzona/pb_logs
- backend-powerzona/pb_public
- backend-powerzona/pocketbase.exe
- dist
- .env
- .env.local
- .env.production
```

Sí subir:

```txt
backend-powerzona/pb_migrations
```

Comando de confirmación:

```bash
git ls-files | findstr /i "pb_migrations"
```

Resultado confirmado:

```txt
Las migraciones aparecen versionadas en Git.
```

Se agregó recomendación para ignorar archivos temporales:

```txt
*.zip
*.rar
*.7z
*.bak
*.backup
tmp/
temp/
```

---

#### 21.39.6. Regla de seguridad para migraciones PocketBase

Regla permanente:

```txt
Si Codex agrega migraciones nuevas, debe avisar cuáles agrega.
Si reemplaza migraciones, debe decir cuáles conservar y cuáles eliminar.
No borrar migraciones sin revisión previa.
```

Motivo:

```txt
El proyecto ya tuvo problemas previos de migraciones duplicadas o campos repetidos.
```

---

#### 21.39.7. Reglas permanentes para Codex

Antes de modificar archivos, Codex debe indicar:

```txt
- Qué archivos tocará.
- Por qué los tocará.
- Si tocará backend.
- Si tocará frontend.
- Si agregará migraciones.
- Si modificará diseño público o admin.
```

Regla:

```txt
Codex no debe modificar archivos sin listar primero los archivos que tocará.
```

Si falla un comando o build:

```txt
Codex debe mostrar el error completo antes de proponer nuevos cambios.
```

---

### 21.40. Frontend Astro preparado para Coolify SSR

Estado:

```txt
✅ CERRADO
```

Problema inicial detectado al ejecutar:

```bash
cd frontend-powerzona
npm run build
```

Error:

```txt
[NoAdapterInstalled] Cannot use server-rendered pages without an adapter.
```

Causa:

```txt
El proyecto usa páginas renderizadas en servidor y Astro necesitaba un adapter para compilar en entorno de servidor.
```

Solución aplicada:

```txt
Instalar y configurar @astrojs/node.
Configurar Astro con output: "server".
Usar adapter Node en modo standalone.
```

Archivos modificados:

```txt
frontend-powerzona/package.json
frontend-powerzona/package-lock.json
frontend-powerzona/astro.config.mjs
```

Cambio aplicado:

```js
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone'
  })
});
```

Versiones resultantes confirmadas:

```txt
astro@6.4.3
@astrojs/node@10.1.3
```

Build confirmado:

```txt
[build] Complete!
```

Notas:

```txt
Aparecen advertencias getStaticPaths() ignored en rutas dinámicas.
No bloquean el build.
No se tocaron en esta etapa para no mezclar cambios.
```

Commit realizado:

```txt
Preparar frontend SSR para Coolify
```

---

### 21.41. Coolify conectado con GitHub y frontend staging publicado

Estado:

```txt
✅ CERRADO COMO BASE FUNCIONAL
```

Servidor:

```txt
VPS ya instalado.
Coolify ya instalado.
```

Proyecto creado en Coolify:

```txt
Project: tusenda-staging
Environment: production
```

Nota:

```txt
Aunque el environment interno se llame production, el proyecto completo se usa como staging.
```

Fuente GitHub configurada:

```txt
GitHub App: coolify-tusenda
Cuenta GitHub: tusendasoporte-sudo
Repositorio autorizado: tusendaecommerce
```

Regla:

```txt
La GitHub App debe tener acceso solo al repositorio necesario, no a todos los repos.
```

---

#### 21.41.1. Recurso frontend staging

Recurso creado:

```txt
powerzona-frontend-staging
```

Configuración:

```txt
Repository: tusendasoporte-sudo/tusendaecommerce
Branch: dev
Build Pack: Nixpacks
Base Directory: /frontend-powerzona
Is static site: desmarcado
Install Command: npm ci
Build Command: npm run build
Start Command: HOST=0.0.0.0 PORT=4321 node ./dist/server/entry.mjs
Ports Exposes: 4321
Port Mappings: vacío
```

Dominio temporal generado:

```txt
http://mob76fcvxkxyb8tq0nwys18o.91.99.99.83.sslip.io
```

Log confirmado:

```txt
Server listening on
local: http://localhost:4321
network: http://10.0.1.8:4321
```

Resultado:

```txt
El frontend levantó correctamente en Coolify.
```

---

#### 21.41.2. Error HTTP 500 resuelto

Al abrir el frontend por primera vez, apareció:

```txt
HTTP ERROR 500
```

Logs mostraron:

```txt
Error: Falta PUBLIC_POCKETBASE_URL en el archivo .env
```

Conclusión:

```txt
El frontend estaba funcionando, pero faltaba configurar la URL pública del PocketBase staging.
```

Solución posterior:

```txt
Crear PocketBase staging.
Configurar PUBLIC_POCKETBASE_URL en el frontend.
Redeploy del frontend.
```

---

### 21.42. PocketBase staging desde repo GitHub con Dockerfile y migraciones

Estado:

```txt
✅ CERRADO COMO BASE FUNCIONAL
```

Se creó primero un PocketBase de prueba desde Docker Image para validar puerto, dominio y superuser, pero luego se decidió crear el PocketBase profesional desde el repo GitHub.

Motivo:

```txt
El recurso PocketBase desde Docker Image no traía automáticamente backend-powerzona/pb_migrations.
Para flujo profesional, PocketBase debe construirse desde el repo y copiar las migraciones al contenedor.
```

---

#### 21.42.1. Dockerfile agregado al backend

Archivo nuevo creado:

```txt
backend-powerzona/Dockerfile
```

Objetivo:

```txt
Construir PocketBase Linux desde el repo y copiar pb_migrations al contenedor.
```

Contenido base:

```Dockerfile
FROM alpine:3.20

ARG POCKETBASE_VERSION=0.38.2

WORKDIR /app

RUN apk add --no-cache ca-certificates unzip wget \
  && wget -O /tmp/pocketbase.zip "https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}/pocketbase_${POCKETBASE_VERSION}_linux_amd64.zip" \
  && unzip /tmp/pocketbase.zip -d /app \
  && rm /tmp/pocketbase.zip \
  && chmod +x /app/pocketbase \
  && mkdir -p /app/pb_data

COPY pb_migrations /app/pb_migrations

EXPOSE 8080

CMD ["./pocketbase", "serve", "--http=0.0.0.0:8080"]
```

Versión usada:

```txt
PocketBase 0.38.2
```

Motivo:

```txt
Coincide con la versión reportada por el backend local.
```

Commit realizado:

```txt
Preparar PocketBase para Coolify
```

---

#### 21.42.2. Recurso PocketBase profesional en Coolify

Recurso creado:

```txt
powerzona-pocketbase-repo-staging
```

Configuración:

```txt
Repository: tusendasoporte-sudo/tusendaecommerce
Branch: dev
Build Pack: Dockerfile
Base Directory: /backend-powerzona
Dockerfile Location: Dockerfile
Ports Exposes: 8080
Port Mappings: vacío
Persistent Storage: /app/pb_data
```

Dominio temporal:

```txt
http://imdbiodgr30k0dbhx3wtlysj.91.99.99.83.sslip.io
```

Labels confirmados:

```txt
loadbalancer.server.port=8080
```

Log confirmado:

```txt
Server started at http://0.0.0.0:8080
REST API:  http://0.0.0.0:8080/api/
Dashboard: http://0.0.0.0:8080/_/
```

---

#### 21.42.3. Puerto correcto de PocketBase en Coolify

Durante la prueba se detectó que la imagen/recurso usaba:

```txt
0.0.0.0:8080
```

Regla final para Coolify:

```txt
PocketBase staging usa puerto interno 8080.
```

No usar para este recurso:

```txt
80
8090
3000
```

Configuración final:

```txt
Ports Exposes: 8080
Port Mappings: vacío
```

---

#### 21.42.4. Volumen persistente correcto

Se verificó por terminal que PocketBase guarda datos reales en:

```txt
/app/pb_data
```

Prueba realizada:

```bash
ls -la /app/pb_data
```

Archivos esperados:

```txt
data.db
auxiliary.db
types.d.ts
```

Se detectó inicialmente un volumen mal apuntado a:

```txt
/pb/pb_data
```

Problema:

```txt
/pb/pb_data estaba vacío.
```

Corrección final:

```txt
Persistent Storage → Volume Mount → Destination Path: /app/pb_data
```

Regla crítica:

```txt
Todo PocketBase en Coolify debe persistir /app/pb_data.
```

Ahí viven:

```txt
- superusers
- colecciones
- productos
- categorías
- settings
- imágenes
- órdenes
- archivos subidos
```

---

#### 21.42.5. Superuser de staging

Como cada recurso PocketBase tiene su propio `pb_data`, el superuser local no existe automáticamente en staging.

Regla:

```txt
Cada PocketBase nuevo requiere crear su propio superuser.
```

Método usado desde terminal:

```bash
cd /app
./pocketbase superuser upsert admin@tusenda.com "NUEVA_CLAVE_SEGURA"
```

Nota de seguridad:

```txt
No reutilizar contraseñas compartidas en chats o usadas en otros servicios.
```

---

#### 21.42.6. Migraciones aplicadas

Después de crear el PocketBase desde repo GitHub, se confirmó que las colecciones aparecen en el panel.

Conclusión:

```txt
backend-powerzona/pb_migrations se copió correctamente al contenedor.
PocketBase aplicó las migraciones.
Las colecciones del proyecto aparecen en staging.
```

Colecciones esperadas:

```txt
categories
subcategories
products
product_variations
currencies
shipping_zones
orders
order_items
settings
store_visual_items
gifts / reglas relacionadas si existen en migraciones
```

---

### 21.43. Frontend conectado con PocketBase staging

Estado:

```txt
✅ CERRADO COMO BASE FUNCIONAL
```

Recurso frontend:

```txt
powerzona-frontend-staging
```

Variable agregada en Coolify:

```txt
PUBLIC_POCKETBASE_URL=http://imdbiodgr30k0dbhx3wtlysj.91.99.99.83.sslip.io
```

Opciones marcadas:

```txt
Available at Buildtime: ✅
Available at Runtime: ✅
Is Literal: no marcado
Is Multiline: no marcado
```

Después se hizo:

```txt
Redeploy del frontend.
```

Resultado:

```txt
El frontend abrió correctamente desde dominio temporal.
```

Dominio frontend:

```txt
http://mob76fcvxkxyb8tq0nwys18o.91.99.99.83.sslip.io
```

Estado visual:

```txt
La tienda abre, pero se ve vacía/simple porque el PocketBase staging tiene colecciones pero aún no tiene datos reales cargados.
```

Esto es normal porque:

```txt
- Tiene estructura de colecciones.
- No tiene productos reales.
- No tiene categorías reales.
- No tiene imágenes.
- No tiene settings locales copiados.
```

---

### 21.44. Próximo paso: copiar `pb_data` local a staging

Estado:

```txt
🔜 PRÓXIMO BLOQUE RECOMENDADO
```

Decisión tomada:

```txt
Usar opción B: copiar datos reales locales de PocketBase hacia staging.
```

Motivo:

```txt
El objetivo es probar en el dominio temporal lo mismo que se va configurando, corrigiendo y actualizando en la PC.
```

Flujo correcto:

```txt
Código:
PC → GitHub dev → Coolify

Datos PocketBase:
PC backend-powerzona/pb_data → copia manual/backup → Coolify /app/pb_data
```

Regla:

```txt
pb_data NO va por GitHub.
```

---

#### 21.44.1. Ubicación local esperada de `pb_data`

Ruta local esperada:

```txt
C:\Users\workd\Desktop\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt\backend-powerzona\pb_data
```

Debe contener:

```txt
data.db
auxiliary.db
storage
types.d.ts
```

Comando de revisión en Windows:

```bash
cd "C:\Users\workd\Desktop\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt\backend-powerzona"
dir pb_data
```

---

#### 21.44.2. Orden seguro para copiar datos a staging

Orden recomendado:

```txt
1. Detener PocketBase staging correcto:
   powerzona-pocketbase-repo-staging

2. Hacer backup del /app/pb_data actual del servidor.

3. Comprimir o preparar el pb_data local de la PC.

4. Subir/copyar pb_data local hacia el servidor/Coolify.

5. Reemplazar el contenido de:
   /app/pb_data

6. Arrancar PocketBase staging.

7. Entrar al panel PocketBase staging.

8. Confirmar que aparecen:
   - settings reales
   - categorías reales
   - productos reales
   - imágenes reales
   - zonas
   - monedas
   - regalos
   - órdenes si se copiaron

9. Abrir frontend staging y probar desde dominio temporal.
```

---

#### 21.44.3. Precauciones importantes

Reglas:

```txt
No copiar pb_data con PocketBase corriendo.
No subir pb_data a GitHub.
No borrar el backup del servidor hasta confirmar que staging funciona.
No mezclar el PocketBase viejo de Docker Image con el nuevo desde repo.
```

PocketBase correcto para staging:

```txt
powerzona-pocketbase-repo-staging
```

PocketBase anterior de prueba:

```txt
El recurso anterior creado desde Docker Image ya no es el flujo profesional.
Puede detenerse/eliminarse más adelante cuando se confirme que el recurso repo funciona con datos reales.
```

---

### 21.45. Estado final de infraestructura al 2026-06-07

Estado confirmado:

```txt
✅ GitHub privado creado y conectado.
✅ Rama main estable creada.
✅ Rama dev de trabajo/staging creada.
✅ .gitignore seguro confirmado.
✅ pb_migrations versionadas.
✅ Frontend Astro preparado para SSR en Coolify.
✅ Build local del frontend funciona.
✅ Coolify conectado con GitHub App.
✅ Proyecto Coolify tusenda-staging creado.
✅ Frontend staging desplegado desde dev.
✅ PocketBase staging profesional desplegado desde repo GitHub.
✅ Dockerfile backend creado.
✅ Migraciones aplicadas en PocketBase staging.
✅ Volumen persistente correcto: /app/pb_data.
✅ PUBLIC_POCKETBASE_URL configurado en frontend.
✅ Dominio temporal frontend abre.
✅ Dominio temporal PocketBase abre.
```

Pendiente inmediato:

```txt
⏳ Copiar pb_data local a staging para probar datos reales.
⏳ Confirmar que imágenes y settings se ven igual que local.
⏳ Probar tienda pública y admin desde celular.
⏳ Después continuar prueba visual móvil/PC y Producto individual visual y funcional.
```

Mensaje recomendado para continuar en un nuevo chat:

```txt
Continuación PowerZona/Tusenda staging. Ya están GitHub, Coolify, frontend y PocketBase staging funcionando. Próximo paso: copiar pb_data local a /app/pb_data del PocketBase staging para probar datos reales desde el dominio temporal.
```


