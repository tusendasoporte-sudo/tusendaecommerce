/// <reference path="../pb_data/types.d.ts" />

// PZ-MIGRATION-FIX-V26-20260601
// Esta migración queda neutralizada porque el campo products.variation_view
// ya existe en PocketBase. Evita el error:
// Duplicated or invalid field name variation_view.

migrate((app) => {
  // No hacer nada: el campo variation_view ya existe.
}, (app) => {
  // No hacer nada en rollback para no borrar el campo existente.
})
