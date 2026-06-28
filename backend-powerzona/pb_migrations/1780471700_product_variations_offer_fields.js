/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2734288031")

  let hasIsOffer = false
  let hasOfferPriceUsd = false
  try { hasIsOffer = !!collection.fields.getByName("is_offer") } catch (_) { hasIsOffer = false }
  try { hasOfferPriceUsd = !!collection.fields.getByName("offer_price_usd") } catch (_) { hasOfferPriceUsd = false }

  if (!hasIsOffer) {
    collection.fields.add(new Field({
      "hidden": false,
      "id": "bool1780471701",
      "name": "is_offer",
      "presentable": true,
      "required": false,
      "system": false,
      "type": "bool"
    }))
  }

  if (!hasOfferPriceUsd) {
    collection.fields.add(new Field({
      "help": "Precio USD de oferta propio de la variacion. Si is_offer esta activo y es menor que price_usd, se usa como precio publico.",
      "hidden": false,
      "id": "number1780471702",
      "max": null,
      "min": null,
      "name": "offer_price_usd",
      "onlyInt": false,
      "presentable": true,
      "required": false,
      "system": false,
      "type": "number"
    }))
  }

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2734288031")

  try { collection.fields.removeById("bool1780471701") } catch (_) {}
  try { collection.fields.removeById("number1780471702") } catch (_) {}

  return app.save(collection)
})
