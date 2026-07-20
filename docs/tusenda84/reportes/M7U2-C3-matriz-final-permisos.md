# M7U2-C3 — Matriz final de permisos

La matriz expresa el contrato de mínimo privilegio que se valida en M7U2-C3. “Según concesión” significa que una plantilla `custom` solo obtiene el módulo cuando el Administrador principal activó expresamente el permiso indicado.

| Módulo | Principal | Secundario | Marketing | Solo lectura | Custom | Permiso requerido | Endpoint protector | Resultado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Resumen operativo | Completo | Según plantilla | No | Lectura | Según concesión | `analytics.view` + `orders.view` + `catalog.view` | Colecciones operativas + middleware | Contrato final C3 |
| Analíticas | Sí | Sí | Sí | Sí | Según concesión | `analytics.view` | `POST /api/pz/store/analytics/summary` | Contrato agregado y sanitizado |
| Eventos analíticos crudos | No; usa agregado | No | No | No | No | No asignable por lectura REST | `/api/collections/store_analytics_events/records` | Bloqueado para usuarios Store |
| Pedidos | Completo | Sí | No | Lectura | Según concesión | `orders.view` | `/api/collections/orders/records` + rutas `/api/pz/admin/orders/*` | Marketing bloqueado |
| Detalle y contacto de pedido | Completo | Según concesión | No | Sin contacto privado | Según concesión | `orders.view` + `orders.contact_customer` | Redacción de pedidos + endpoints de acción | Datos privados separados |
| Ajustes de precio de pedido | Sí | Sí | No | No | Según concesión | `orders.price_adjustment` | Rutas canónicas de Pedidos | Mutación granular |
| Productos | Completo | Sí | No | Lectura | Según concesión | `catalog.view` | `/api/collections/products/records` | Marketing bloqueado |
| Categorías y subcategorías | Completo | Sí | No | Lectura | Según concesión | `catalog.view` | Colecciones de catálogo | Marketing bloqueado |
| Selector de Marketing | Sí | Sí | Sí | No | Según concesión | `promotions.manage` o `coupons.manage` | `POST /api/pz/store/marketing/selectors` | Campos mínimos sanitizados |
| Edición, precio y stock de productos | Completo | Sí | No | No | Según concesión | Permisos `catalog.products.*` | Enforcement por campo | Sin concesión implícita |
| Vencimientos V7E9 | Sí | Sí | No | No | Según concesión | `catalog.expirations.manage` + capability Premium | `POST /api/pz/admin/product-expirations` | Doble gate permiso/plan |
| Promociones | Sí | Sí | Sí | No | Según concesión | `promotions.manage` | Colección oficial + selector sanitizado | Permitido a Marketing |
| Cupones | Sí | Sí | Sí | No | Según concesión | `coupons.manage` | Colección oficial + selector sanitizado | Permitido a Marketing |
| Historial crudo de usos de cupón | Sí | Según concesión | No | No | Según concesión | `coupons.manage` + `orders.view` | `/api/collections/manual_coupon_usages/records` | PII no entregada a Marketing |
| Regalos | Sí | Sí | Sí | No | Según concesión | `gifts.manage` | Colección `gifts` | Permitido a Marketing |
| Rifas | Sí | Sí | Sí | No | Según concesión | `raffles.manage` | Colecciones `raffles` y `raffle_entries` | Permitido a Marketing |
| Landing QR | Sí | Sí | Sí | No | Según concesión | `landing_qr.manage` | Campos allowlisted de `settings` | Permitido a Marketing |
| Envíos | Sí | Sí | No | No | Según concesión | `shipping.manage` | Colecciones de envío | Sin permiso `.view` inventado |
| Reseñas | Sí | Sí | No | No | Según concesión | `reviews.manage` | Colección `reviews` + settings allowlisted | Sin permiso `.view` inventado |
| Notificaciones | Sí | Sí | No | No | Según concesión | `notifications.view` | Colección `store_notifications` | Fuera de Solo lectura por defecto |
| Ajustes sensibles de tienda | Sí | Sí | No | No | Según concesión | `store.settings.manage` | Redacción de `settings` y enforcement por campo | Registro completo reservado |
| Seguridad en lectura | Sí | Sí | No | No | Según concesión | `security.view` | `/api/pz/security/*` + middleware | Solo por concesión explícita |
| Seguridad en gestión | Sí | Sí | No | No | Según concesión | `security.manage` + `security.view` | Endpoints oficiales de Seguridad | Mutación separada |
| Mi equipo | Sí | No | No | No | No | Administrador principal | `/api/pz/store/team/*` | Reservado al principal |
| Actividad del equipo | Sí | No | No | No | No | Administrador principal | `/api/pz/store/activity/{summary,list,detail,review,user-report}` | Reservada al principal |
| Mi actividad | Sí | Sí | Sí | Sí | Sí | Identidad autenticada propia | `POST /api/pz/store/activity/self` | Actor derivado de sesión |
| Cambio de plan/principal | No desde Store | No | No | No | No | `master_admin` | Endpoints privados Master | Fuera del rol Store |

## Plantillas exactas

- `marketing_promotions`: `promotions.manage`, `coupons.manage`, `gifts.manage`, `raffles.manage`, `landing_qr.manage`, `analytics.view`.
- `read_only`: `catalog.view`, `orders.view`, `analytics.view`.
- `custom`: únicamente las concesiones explícitas guardadas por el Administrador principal; la normalización C3 no las reescribe.

Ninguna dependencia de `analytics.view`, `promotions.manage` o `coupons.manage` concede `orders.view` o `catalog.view`.
