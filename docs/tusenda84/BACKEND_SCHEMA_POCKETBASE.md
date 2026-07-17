# BACKEND_SCHEMA_POCKETBASE

> Documento generado a partir del export actual del schema de PocketBase para el proyecto **PowerZona**.

## Resumen general

- Total de colecciones detectadas: **15**.
- Colecciones propias del proyecto: **10**.
- Colecciones internas/sistema de PocketBase: **5**.

## Colecciones principales del proyecto

- `users` — tipo `auth`
- `categories` — tipo `base`
- `currencies` — tipo `base`
- `order_items` — tipo `base`
- `orders` — tipo `base`
- `product_variations` — tipo `base`
- `products` — tipo `base`
- `settings` — tipo `base`
- `shipping_zones` — tipo `base`
- `subcategories` — tipo `base`

## Relaciones principales

| Colección | Campo | Relaciona con | Requerido |
|---|---|---|---|
| `order_items` | `order` | `orders` | Sí |
| `order_items` | `product` | `products` | Sí |
| `order_items` | `variation` | `product_variations` | No |
| `orders` | `shipping_zone` | `shipping_zones` | No |
| `orders` | `currency` | `currencies` | Sí |
| `product_variations` | `product` | `products` | Sí |
| `products` | `category` | `categories` | Sí |
| `products` | `subcategory` | `subcategories` | No |
| `settings` | `default_currency` | `currencies` | Sí |
| `subcategories` | `category` | `categories` | Sí |

---

# Detalle de colecciones

## `users`

- **ID:** `_pb_users_auth_`
- **Tipo:** `auth`
- **Sistema:** No

### Reglas de acceso

- **List rule:** `id = @request.auth.id`
- **View rule:** `id = @request.auth.id`
- **Create rule:** Vacía
- **Update rule:** `id = @request.auth.id`
- **Delete rule:** `id = @request.auth.id`

### Campos

| Campo | Tipo | Requerido | Presentable | Detalles |
|---|---|---:|---:|---|
| `id` | `text` | Sí | No | min: 15; max: 15; patrón: `^[a-z0-9]+$`; sistema |
| `password` | `password` | Sí | No | oculto; sistema |
| `tokenKey` | `text` | Sí | No | min: 30; max: 60; oculto; sistema |
| `email` | `email` | Sí | No | sistema |
| `emailVisibility` | `bool` | No | No | sistema |
| `verified` | `bool` | No | No | sistema |
| `name` | `text` | No | No | max: 255 |
| `avatar` | `file` | No | No | máx. archivos: 1; mime: image/jpeg, image/png, image/svg+xml, image/gif, image/webp |
| `created` | `autodate` | No | No | - |
| `updated` | `autodate` | No | No | - |

### Índices

- `CREATE UNIQUE INDEX `idx_tokenKey__pb_users_auth_` ON `users` (`tokenKey`)`
- `CREATE UNIQUE INDEX `idx_email__pb_users_auth_` ON `users` (`email`) WHERE `email` != ''`

---

## `categories`

- **ID:** `pbc_3292755704`
- **Tipo:** `base`
- **Sistema:** No

### Reglas de acceso

- **List rule:** `active = true`
- **View rule:** `active = true`
- **Create rule:** No configurada / acceso cerrado
- **Update rule:** No configurada / acceso cerrado
- **Delete rule:** No configurada / acceso cerrado

### Campos

| Campo | Tipo | Requerido | Presentable | Detalles |
|---|---|---:|---:|---|
| `id` | `text` | Sí | No | min: 15; max: 15; patrón: `^[a-z0-9]+$`; sistema |
| `name` | `text` | Sí | Sí | - |
| `slug` | `text` | Sí | Sí | - |
| `image` | `file` | No | Sí | máx. archivos: 0 |
| `active` | `bool` | No | Sí | - |
| `order` | `number` | No | No | - |
| `created` | `autodate` | No | No | - |
| `updated` | `autodate` | No | No | - |

---

## `currencies`

- **ID:** `pbc_3379852803`
- **Tipo:** `base`
- **Sistema:** No

### Reglas de acceso

- **List rule:** `active = true`
- **View rule:** `active = true`
- **Create rule:** No configurada / acceso cerrado
- **Update rule:** No configurada / acceso cerrado
- **Delete rule:** No configurada / acceso cerrado

### Campos

| Campo | Tipo | Requerido | Presentable | Detalles |
|---|---|---:|---:|---|
| `id` | `text` | Sí | No | min: 15; max: 15; patrón: `^[a-z0-9]+$`; sistema |
| `code` | `text` | Sí | Sí | - |
| `name` | `text` | Sí | Sí | nota: USD CUP Euro CashApp |
| `symbol` | `text` | No | Sí | nota: $ CUP € CashApp |
| `exchange_rate` | `number` | Sí | Sí | - |
| `active` | `bool` | No | Sí | - |
| `is_default` | `bool` | No | Sí | - |
| `created` | `autodate` | No | No | - |
| `updated` | `autodate` | No | No | - |

---

## `order_items`

- **ID:** `pbc_2456927940`
- **Tipo:** `base`
- **Sistema:** No

### Reglas de acceso

- **List rule:** No configurada / acceso cerrado
- **View rule:** No configurada / acceso cerrado
- **Create rule:** `@request.auth.id = "" || @request.auth.id != ""`
- **Update rule:** No configurada / acceso cerrado
- **Delete rule:** No configurada / acceso cerrado

### Campos

| Campo | Tipo | Requerido | Presentable | Detalles |
|---|---|---:|---:|---|
| `id` | `text` | Sí | No | min: 15; max: 15; patrón: `^[a-z0-9]+$`; sistema |
| `order` | `relation` | Sí | Sí | relación con `pbc_3527180448` |
| `product` | `relation` | Sí | Sí | relación con `pbc_4092854851` |
| `variation` | `relation` | No | Sí | relación con `pbc_2734288031` |
| `product_name` | `text` | Sí | Sí | - |
| `variation_name` | `text` | No | Sí | - |
| `quantity` | `number` | Sí | Sí | - |
| `unit_price_selected_currency` | `number` | No | Sí | - |
| `line_total_usd` | `number` | Sí | Sí | - |
| `line_total_selected_currency` | `number` | No | Sí | - |
| `only_usd` | `bool` | No | Sí | - |
| `unit_price_usd` | `number` | Sí | Sí | - |
| `unit_profit_usd` | `number` | No | Sí | - |
| `line_profit_usd` | `number` | No | Sí | - |
| `created` | `autodate` | No | No | - |
| `updated` | `autodate` | No | No | - |

---

## `orders`

- **ID:** `pbc_3527180448`
- **Tipo:** `base`
- **Sistema:** No

### Reglas de acceso

- **List rule:** No configurada / acceso cerrado
- **View rule:** No configurada / acceso cerrado
- **Create rule:** `@request.auth.id = "" || @request.auth.id != ""`
- **Update rule:** No configurada / acceso cerrado
- **Delete rule:** No configurada / acceso cerrado

### Campos

| Campo | Tipo | Requerido | Presentable | Detalles |
|---|---|---:|---:|---|
| `id` | `text` | Sí | No | min: 15; max: 15; patrón: `^[a-z0-9]+$`; sistema |
| `order_number` | `text` | Sí | Sí | - |
| `customer_name` | `text` | Sí | Sí | - |
| `customer_phone` | `text` | Sí | Sí | - |
| `customer_address` | `text` | No | Sí | - |
| `shipping_zone` | `relation` | No | Sí | relación con `pbc_1287526725` |
| `currency` | `relation` | Sí | Sí | relación con `pbc_3379852803` |
| `subtotal` | `number` | Sí | Sí | - |
| `shipping` | `number` | No | Sí | - |
| `total` | `number` | Sí | Sí | - |
| `usd_total` | `number` | Sí | Sí | - |
| `mixed_payment` | `bool` | No | Sí | - |
| `delivery_method` | `select` | Sí | Sí | valores: `delivery`, `pickup`, `coordinate` |
| `status` | `select` | Sí | Sí | valores: `pending`, `confirmed`, `preparing`, `delivered`, `cancelled` |
| `whatsapp_sent` | `bool` | No | Sí | - |
| `notes` | `text` | No | Sí | - |
| `local_currency_total` | `number` | No | Sí | - |
| `usd_only_total` | `number` | No | Sí | - |
| `shipping_cup` | `number` | No | Sí | - |
| `exchange_rate_used` | `number` | No | Sí | - |
| `created` | `autodate` | No | No | - |
| `updated` | `autodate` | No | No | - |

---

## `product_variations`

- **ID:** `pbc_2734288031`
- **Tipo:** `base`
- **Sistema:** No

### Reglas de acceso

- **List rule:** `active = true`
- **View rule:** `active = true`
- **Create rule:** No configurada / acceso cerrado
- **Update rule:** No configurada / acceso cerrado
- **Delete rule:** No configurada / acceso cerrado

### Campos

| Campo | Tipo | Requerido | Presentable | Detalles |
|---|---|---:|---:|---|
| `id` | `text` | Sí | No | min: 15; max: 15; patrón: `^[a-z0-9]+$`; sistema |
| `product` | `relation` | Sí | Sí | relación con `pbc_4092854851` |
| `variation_type` | `text` | Sí | Sí | - |
| `value` | `text` | Sí | Sí | - |
| `extra_price` | `number` | No | Sí | - |
| `stock` | `number` | Sí | Sí | - |
| `active` | `bool` | No | Sí | - |
| `created` | `autodate` | No | No | - |
| `updated` | `autodate` | No | No | - |

---

## `products`

- **ID:** `pbc_4092854851`
- **Tipo:** `base`
- **Sistema:** No

### Reglas de acceso

- **List rule:** `active = true`
- **View rule:** `active = true`
- **Create rule:** No configurada / acceso cerrado
- **Update rule:** No configurada / acceso cerrado
- **Delete rule:** No configurada / acceso cerrado

### Campos

| Campo | Tipo | Requerido | Presentable | Detalles |
|---|---|---:|---:|---|
| `id` | `text` | Sí | No | min: 15; max: 15; patrón: `^[a-z0-9]+$`; sistema |
| `name` | `text` | Sí | Sí | - |
| `slug` | `text` | Sí | Sí | - |
| `description` | `editor` | No | Sí | - |
| `images` | `file` | No | Sí | máx. archivos: 10 |
| `category` | `relation` | Sí | Sí | relación con `pbc_3292755704` |
| `subcategory` | `relation` | No | Sí | relación con `pbc_2354486458` |
| `base_price_usd` | `number` | Sí | Sí | - |
| `stock` | `number` | Sí | Sí | - |
| `featured` | `bool` | No | Sí | - |
| `active` | `bool` | No | Sí | - |
| `only_usd` | `bool` | No | Sí | - |
| `delivery_mode` | `select` | Sí | Sí | valores: `delivery`, `pickup`, `both` |
| `expiration_date` | `date` | No | No | - |
| `profit_margin` | `number` | No | Sí | - |
| `created` | `autodate` | No | No | - |
| `updated` | `autodate` | No | No | - |

---

## `settings`

- **ID:** `pbc_2769025244`
- **Tipo:** `base`
- **Sistema:** No

### Reglas de acceso

- **List rule:** `active = true`
- **View rule:** `active = true`
- **Create rule:** No configurada / acceso cerrado
- **Update rule:** No configurada / acceso cerrado
- **Delete rule:** No configurada / acceso cerrado

### Campos

| Campo | Tipo | Requerido | Presentable | Detalles |
|---|---|---:|---:|---|
| `id` | `text` | Sí | No | min: 15; max: 15; patrón: `^[a-z0-9]+$`; sistema |
| `store_name` | `text` | Sí | Sí | - |
| `whatsapp_number` | `text` | Sí | Sí | - |
| `maintenance_mode` | `bool` | No | Sí | - |
| `default_currency` | `relation` | Sí | Sí | relación con `pbc_3379852803` |
| `business_notes` | `text` | No | No | - |
| `pickup_coordination_message` | `text` | No | Sí | - |
| `active` | `bool` | No | Sí | - |
| `created` | `autodate` | No | No | - |
| `updated` | `autodate` | No | No | - |

---

## `shipping_zones`

- **ID:** `pbc_1287526725`
- **Tipo:** `base`
- **Sistema:** No

### Reglas de acceso

- **List rule:** `active = true`
- **View rule:** `active = true`
- **Create rule:** No configurada / acceso cerrado
- **Update rule:** No configurada / acceso cerrado
- **Delete rule:** No configurada / acceso cerrado

### Campos

| Campo | Tipo | Requerido | Presentable | Detalles |
|---|---|---:|---:|---|
| `id` | `text` | Sí | No | min: 15; max: 15; patrón: `^[a-z0-9]+$`; sistema |
| `municipality` | `text` | Sí | Sí | - |
| `zone` | `text` | No | Sí | - |
| `price_cup` | `number` | Sí | Sí | - |
| `active` | `bool` | No | Sí | - |
| `note` | `text` | No | Sí | - |
| `created` | `autodate` | No | No | - |
| `updated` | `autodate` | No | No | - |

---

## `subcategories`

- **ID:** `pbc_2354486458`
- **Tipo:** `base`
- **Sistema:** No

### Reglas de acceso

- **List rule:** `active = true`
- **View rule:** `active = true`
- **Create rule:** No configurada / acceso cerrado
- **Update rule:** No configurada / acceso cerrado
- **Delete rule:** No configurada / acceso cerrado

### Campos

| Campo | Tipo | Requerido | Presentable | Detalles |
|---|---|---:|---:|---|
| `id` | `text` | Sí | No | min: 15; max: 15; patrón: `^[a-z0-9]+$`; sistema |
| `name` | `text` | Sí | Sí | - |
| `slug` | `text` | Sí | Sí | - |
| `category` | `relation` | Sí | Sí | relación con `pbc_3292755704` |
| `active` | `bool` | No | Sí | - |
| `order` | `number` | No | No | - |
| `image` | `file` | No | Sí | máx. archivos: 0 |
| `created` | `autodate` | No | No | - |
| `updated` | `autodate` | No | No | - |

---

# Apéndice: colecciones internas de PocketBase

> Estas colecciones pertenecen al funcionamiento interno/autenticación de PocketBase. Normalmente no se editan como parte directa de la lógica del catálogo o checkout.

## `_superusers`

- **ID:** `pbc_3142635823`
- **Tipo:** `auth`

### Reglas de acceso

- **List rule:** No configurada / acceso cerrado
- **View rule:** No configurada / acceso cerrado
- **Create rule:** No configurada / acceso cerrado
- **Update rule:** No configurada / acceso cerrado
- **Delete rule:** No configurada / acceso cerrado

### Campos

| Campo | Tipo | Requerido | Detalles |
|---|---|---:|---|
| `id` | `text` | Sí | sistema |
| `password` | `password` | Sí | oculto; sistema |
| `tokenKey` | `text` | Sí | oculto; sistema |
| `email` | `email` | Sí | sistema |
| `emailVisibility` | `bool` | No | sistema |
| `verified` | `bool` | No | sistema |
| `created` | `autodate` | No | sistema |
| `updated` | `autodate` | No | sistema |

### Índices

- `CREATE UNIQUE INDEX `idx_tokenKey_pbc_3142635823` ON `_superusers` (`tokenKey`)`
- `CREATE UNIQUE INDEX `idx_email_pbc_3142635823` ON `_superusers` (`email`) WHERE `email` != ''`

---

## `_authOrigins`

- **ID:** `pbc_4275539003`
- **Tipo:** `base`

### Reglas de acceso

- **List rule:** `@request.auth.id != '' && recordRef = @request.auth.id && collectionRef = @request.auth.collectionId`
- **View rule:** `@request.auth.id != '' && recordRef = @request.auth.id && collectionRef = @request.auth.collectionId`
- **Create rule:** No configurada / acceso cerrado
- **Update rule:** No configurada / acceso cerrado
- **Delete rule:** `@request.auth.id != '' && recordRef = @request.auth.id && collectionRef = @request.auth.collectionId`

### Campos

| Campo | Tipo | Requerido | Detalles |
|---|---|---:|---|
| `id` | `text` | Sí | sistema |
| `collectionRef` | `text` | Sí | sistema |
| `recordRef` | `text` | Sí | sistema |
| `fingerprint` | `text` | Sí | sistema |
| `created` | `autodate` | No | sistema |
| `updated` | `autodate` | No | sistema |

### Índices

- `CREATE UNIQUE INDEX `idx_authOrigins_unique_pairs` ON `_authOrigins` (collectionRef, recordRef, fingerprint)`

---

## `_externalAuths`

- **ID:** `pbc_2281828961`
- **Tipo:** `base`

### Reglas de acceso

- **List rule:** `@request.auth.id != '' && recordRef = @request.auth.id && collectionRef = @request.auth.collectionId`
- **View rule:** `@request.auth.id != '' && recordRef = @request.auth.id && collectionRef = @request.auth.collectionId`
- **Create rule:** No configurada / acceso cerrado
- **Update rule:** No configurada / acceso cerrado
- **Delete rule:** `@request.auth.id != '' && recordRef = @request.auth.id && collectionRef = @request.auth.collectionId`

### Campos

| Campo | Tipo | Requerido | Detalles |
|---|---|---:|---|
| `id` | `text` | Sí | sistema |
| `collectionRef` | `text` | Sí | sistema |
| `recordRef` | `text` | Sí | sistema |
| `provider` | `text` | Sí | sistema |
| `providerId` | `text` | Sí | sistema |
| `created` | `autodate` | No | sistema |
| `updated` | `autodate` | No | sistema |

### Índices

- `CREATE UNIQUE INDEX `idx_externalAuths_record_provider` ON `_externalAuths` (collectionRef, recordRef, provider)`
- `CREATE UNIQUE INDEX `idx_externalAuths_collection_provider` ON `_externalAuths` (collectionRef, provider, providerId)`

---

## `_mfas`

- **ID:** `pbc_2279338944`
- **Tipo:** `base`

### Reglas de acceso

- **List rule:** `@request.auth.id != '' && recordRef = @request.auth.id && collectionRef = @request.auth.collectionId`
- **View rule:** `@request.auth.id != '' && recordRef = @request.auth.id && collectionRef = @request.auth.collectionId`
- **Create rule:** No configurada / acceso cerrado
- **Update rule:** No configurada / acceso cerrado
- **Delete rule:** No configurada / acceso cerrado

### Campos

| Campo | Tipo | Requerido | Detalles |
|---|---|---:|---|
| `id` | `text` | Sí | sistema |
| `collectionRef` | `text` | Sí | sistema |
| `recordRef` | `text` | Sí | sistema |
| `method` | `text` | Sí | sistema |
| `created` | `autodate` | No | sistema |
| `updated` | `autodate` | No | sistema |

### Índices

- `CREATE INDEX `idx_mfas_collectionRef_recordRef` ON `_mfas` (collectionRef,recordRef)`

---

## `_otps`

- **ID:** `pbc_1638494021`
- **Tipo:** `base`

### Reglas de acceso

- **List rule:** `@request.auth.id != '' && recordRef = @request.auth.id && collectionRef = @request.auth.collectionId`
- **View rule:** `@request.auth.id != '' && recordRef = @request.auth.id && collectionRef = @request.auth.collectionId`
- **Create rule:** No configurada / acceso cerrado
- **Update rule:** No configurada / acceso cerrado
- **Delete rule:** No configurada / acceso cerrado

### Campos

| Campo | Tipo | Requerido | Detalles |
|---|---|---:|---|
| `id` | `text` | Sí | sistema |
| `collectionRef` | `text` | Sí | sistema |
| `recordRef` | `text` | Sí | sistema |
| `password` | `password` | Sí | oculto; sistema |
| `sentTo` | `text` | No | oculto; sistema |
| `created` | `autodate` | No | sistema |
| `updated` | `autodate` | No | sistema |

### Índices

- `CREATE INDEX `idx_otps_collectionRef_recordRef` ON `_otps` (collectionRef, recordRef)`

---

# Notas de uso para el proyecto

- Este archivo sirve como referencia del backend actual en PocketBase.
- Debe guardarse junto al Master Document del proyecto para que el schema usado por el frontend quede documentado.
- Cuando se agreguen nuevas colecciones o campos en PocketBase, conviene exportar nuevamente el schema y actualizar este documento.
- Los cálculos monetarios importantes del pedido se apoyan en `orders`, `order_items`, `currencies`, `products`, `product_variations` y `shipping_zones`.
- El total base del negocio debe seguir calculándose en USD, aunque el cliente visualice o pague en CUP u otra moneda.