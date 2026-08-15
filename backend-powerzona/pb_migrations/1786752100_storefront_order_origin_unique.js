/// <reference path="../pb_data/types.d.ts" />

const ORDER_UNIQUE_INDEX = "idx_storefront_order_links_order_unique";

function removeIndex(collection, name) {
  try { collection.removeIndex(name); } catch (_) {}
}

function assertOneInstallationPerOrder(app) {
  const seen = {};
  for (let offset = 0; ; offset += 200) {
    const rows = app.findRecordsByFilter("storefront_order_links", "", "order,id", 200, offset, {}) || [];
    for (const row of rows) {
      const orderId = String(row.getString("order") || "").trim();
      if (!orderId) throw new Error("storefront_order_link_without_order");
      if (seen[orderId]) throw new Error("duplicate_storefront_order_origin");
      seen[orderId] = true;
    }
    if (rows.length < 200) return;
  }
}

migrate((app) => {
  assertOneInstallationPerOrder(app);
  const links = app.findCollectionByNameOrId("storefront_order_links");
  removeIndex(links, ORDER_UNIQUE_INDEX);
  links.addIndex(ORDER_UNIQUE_INDEX, true, "order", "");
  return app.save(links);
}, (app) => {
  const links = app.findCollectionByNameOrId("storefront_order_links");
  removeIndex(links, ORDER_UNIQUE_INDEX);
  links.addIndex(ORDER_UNIQUE_INDEX, true, "order", "attribution_source != 'none'");
  return app.save(links);
});
