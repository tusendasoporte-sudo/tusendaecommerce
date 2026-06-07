/// <reference path="../pb_data/types.d.ts" />
// PZ-MIGRATION-V44-OFERTA-FINAL-ESTABLE-20260605
// Logica final estable:
// - base_price_usd = precio activo actual visible en PocketBase.
// - regular_price_usd = precio original/normal para restaurar cuando se desactiva la oferta.
// - offer_price_usd = precio de oferta cuando is_offer esta activo.
// - is_offer = activa/desactiva la oferta.
// Esta migracion evita cambios agresivos: agrega campos faltantes y normaliza solo casos claros.

migrate((app) => {
  const collection = app.findCollectionByNameOrId("products")

  let changed = false

  let hasIsOffer = false
  let hasOfferPriceUsd = false
  let hasRegularPriceUsd = false

  try { hasIsOffer = !!collection.fields.getByName("is_offer") } catch (_) { hasIsOffer = false }
  try { hasOfferPriceUsd = !!collection.fields.getByName("offer_price_usd") } catch (_) { hasOfferPriceUsd = false }
  try { hasRegularPriceUsd = !!collection.fields.getByName("regular_price_usd") } catch (_) { hasRegularPriceUsd = false }

  if (!hasIsOffer) {
    collection.fields.add(new Field({
      "hidden": false,
      "id": "bool1780466501",
      "name": "is_offer",
      "presentable": true,
      "required": false,
      "system": false,
      "type": "bool"
    }))
    changed = true
  }

  if (!hasOfferPriceUsd) {
    collection.fields.add(new Field({
      "help": "Precio USD de oferta. Cuando is_offer esta activo, este valor pasa a base_price_usd como precio activo.",
      "hidden": false,
      "id": "number1780466502",
      "max": null,
      "min": 0,
      "name": "offer_price_usd",
      "onlyInt": false,
      "presentable": true,
      "required": false,
      "system": false,
      "type": "number"
    }))
    changed = true
  }

  if (!hasRegularPriceUsd) {
    collection.fields.add(new Field({
      "help": "Precio USD original/normal. Se usa para restaurar base_price_usd cuando se desactiva una oferta.",
      "hidden": false,
      "id": "number1780466503",
      "max": null,
      "min": 0,
      "name": "regular_price_usd",
      "onlyInt": false,
      "presentable": true,
      "required": false,
      "system": false,
      "type": "number"
    }))
    changed = true
  }

  if (changed) app.save(collection)

  // Normalizacion segura de datos existentes.
  // Caso oferta activa clara: si hay offer_price_usd y regular_price_usd mayor,
  // base_price_usd debe quedar como precio activo/oferta.
  let records = []
  try {
    records = app.findRecordsByFilter("products", "", "", 1000, 0)
  } catch (_) {
    records = []
  }

  records.forEach((record) => {
    const isOffer = record.get("is_offer") === true
    const base = Number(record.get("base_price_usd") || 0)
    const offer = Number(record.get("offer_price_usd") || 0)
    const regular = Number(record.get("regular_price_usd") || 0)

    if (isOffer && offer > 0) {
      const original = regular > offer ? regular : (base > offer ? base : regular)
      if (original > 0 && Number(record.get("regular_price_usd") || 0) !== original) {
        record.set("regular_price_usd", original)
      }
      if (base !== offer) record.set("base_price_usd", offer)
      app.save(record)
      return
    }

    if (!isOffer && regular > 0 && base !== regular) {
      record.set("base_price_usd", regular)
      record.set("offer_price_usd", 0)
      app.save(record)
    }
  })
}, (app) => {
  // No se revierten campos ni datos de precio para evitar perdida de informacion.
})
