/// <reference path="../pb_data/types.d.ts" />

const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';
const STORE_ADMIN_OWN_STORE_RULE = '@request.auth.role = "store_admin" && store = @request.auth.store';
const PREVIOUS_READ_RULE = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_OWN_STORE_RULE})`;

const SENSITIVE_COLLECTIONS = [
  "store_customers",
  "store_security_events",
  "store_visitor_sessions",
  "store_visitor_pageviews",
  "store_customer_phones",
  "store_customer_devices",
  "store_customer_links",
  "store_security_blocks",
  "store_security_audit",
];

function setReadRules(app, rule) {
  SENSITIVE_COLLECTIONS.forEach((name) => {
    const collection = app.findCollectionByNameOrId(name);
    collection.listRule = rule;
    collection.viewRule = rule;
    app.save(collection);
  });
}

migrate((app) => {
  setReadRules(app, MASTER_ADMIN_RULE);
}, (app) => {
  setReadRules(app, PREVIOUS_READ_RULE);
});
