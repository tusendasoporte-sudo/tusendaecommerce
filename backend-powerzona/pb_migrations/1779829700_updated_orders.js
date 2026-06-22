/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3527180448")

  unmarshal({
    "createRule": "@request.auth.id = \"\" || @request.auth.id != \"\""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3527180448")

  unmarshal({
    "createRule": ""
  }, collection)

  return app.save(collection)
})
