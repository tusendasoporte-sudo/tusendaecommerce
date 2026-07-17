# Corrección V26 - Migration duplicada variation_view

Se eliminó la migración:

```txt
backend-powerzona/pb_migrations/1780365000_updated_products_variation_view.js
```

Motivo:

PocketBase ya tenía el campo `variation_view` en la colección `products` y además ya estaba aplicada la migración posterior:

```txt
1780367509_updated_products.js
```

Por eso PocketBase fallaba al iniciar con:

```txt
Duplicated or invalid field name variation_view
```

La solución segura fue dejar una sola fuente para ese campo y eliminar la migración duplicada no aplicada.
