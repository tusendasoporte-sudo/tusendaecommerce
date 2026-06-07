/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const orders = app.findCollectionByNameOrId("orders")
  let hasReceiptToken = false

  try { hasReceiptToken = !!orders.fields.getByName("receipt_token") } catch (_) { hasReceiptToken = false }

  if (!hasReceiptToken) {
    orders.fields.add(new Field({
      "autogeneratePattern": "",
      "help": "Token privado para abrir el resumen publico de la orden desde el link compartido.",
      "hidden": false,
      "id": "text1780467001",
      "max": 80,
      "min": 0,
      "name": "receipt_token",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }))
  }

  orders.listRule = '@request.auth.id != "" || (order_number = @request.query.order_number && receipt_token = @request.query.token && receipt_token != "")'
  orders.viewRule = '@request.auth.id != "" || (order_number = @request.query.order_number && receipt_token = @request.query.token && receipt_token != "")'

  app.save(orders)

  const orderItems = app.findCollectionByNameOrId("order_items")
  orderItems.listRule = '@request.auth.id != "" || (order.order_number = @request.query.order_number && order.receipt_token = @request.query.token && order.receipt_token != "")'
  orderItems.viewRule = '@request.auth.id != "" || (order.order_number = @request.query.order_number && order.receipt_token = @request.query.token && order.receipt_token != "")'
  app.save(orderItems)
}, (app) => {
  const orders = app.findCollectionByNameOrId("orders")
  try {
    const receiptToken = orders.fields.getByName("receipt_token")
    if (receiptToken) orders.fields.remove(receiptToken.id)
  } catch (_) {}
  orders.listRule = null
  orders.viewRule = null
  app.save(orders)

  const orderItems = app.findCollectionByNameOrId("order_items")
  orderItems.listRule = null
  orderItems.viewRule = null
  app.save(orderItems)
})
